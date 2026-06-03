using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Members.DTOs;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Queries;

public record GetMembersQuery(
    string? Search, Guid? UnitId, Guid? TeamId, bool? NoUnit,
    string? SortBy, string? SortDir,
    int Page = 1, int PageSize = 50
) : IRequest<PaginatedList<MemberListDto>>;

public class GetMembersQueryHandler : IRequestHandler<GetMembersQuery, PaginatedList<MemberListDto>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetMembersQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<PaginatedList<MemberListDto>> Handle(GetMembersQuery request, CancellationToken cancellationToken)
    {
        var query = _context.Members.AsQueryable();

        // Unit-scoped access
        if (!_currentUser.IsSuperAdmin)
        {
            var authorizedUnitIds = _currentUser.AuthorizedUnitIds;
            query = query.Where(m => m.Assignments.Any(a => authorizedUnitIds.Contains(a.UnitId)));
        }

        // Filter: no active assignment (alumni)
        if (request.NoUnit == true)
            query = query.Where(m => !m.Assignments.Any(a => a.EndDate == null));
        else if (request.UnitId.HasValue)
            query = query.Where(m => m.Assignments.Any(a => a.UnitId == request.UnitId.Value && a.EndDate == null));

        if (request.TeamId.HasValue)
            query = query.Where(m => m.Assignments.Any(a => a.TeamId == request.TeamId.Value && a.EndDate == null));

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.ToLower();
            query = query.Where(m =>
                m.FirstName.ToLower().Contains(search) ||
                m.LastName.ToLower().Contains(search) ||
                (m.CardNumber != null && m.CardNumber.ToLower().Contains(search)));
        }

        // Sort
        var desc = string.Equals(request.SortDir, "desc", StringComparison.OrdinalIgnoreCase);
        IOrderedQueryable<Domain.Entities.Member> ordered = request.SortBy?.ToLower() switch
        {
            "firstname" => desc ? query.OrderByDescending(m => m.FirstName) : query.OrderBy(m => m.FirstName),
            "dateofbirth" => desc ? query.OrderByDescending(m => m.DateOfBirth) : query.OrderBy(m => m.DateOfBirth),
            "cardnumber" => desc ? query.OrderByDescending(m => m.CardNumber) : query.OrderBy(m => m.CardNumber),
            _ => desc ? query.OrderByDescending(m => m.LastName) : query.OrderBy(m => m.LastName),
        };

        var projected = ordered.ThenBy(m => m.FirstName)
            .Select(m => new MemberListDto(
                m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.Gender, m.CardNumber,
                m.Emails.Where(e => e.IsPrimary && !e.IsDeleted).Select(e => e.Address).FirstOrDefault(),
                m.Phones.Where(p => p.IsPrimary && !p.IsDeleted).Select(p => p.CountryCode + " " + p.Number).FirstOrDefault(),
                m.PhotoPath,
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Code).FirstOrDefault(),
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Team != null ? a.Team.Name : null).FirstOrDefault()
            ));

        return await PaginatedList<MemberListDto>.CreateAsync(projected, request.Page, request.PageSize, cancellationToken);
    }
}

public record GetMemberByIdQuery(Guid Id) : IRequest<MemberDetailDto?>;

public class GetMemberByIdQueryHandler : IRequestHandler<GetMemberByIdQuery, MemberDetailDto?>
{
    private readonly IApplicationDbContext _context;

    public GetMemberByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<MemberDetailDto?> Handle(GetMemberByIdQuery request, CancellationToken cancellationToken)
    {
        return await _context.Members
            .Where(m => m.Id == request.Id)
            .Select(m => new MemberDetailDto(
                m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.Gender,
                m.CardNumber, m.BloodType, m.Nationality, m.School,
                m.MedicalNotes, m.Allergies, m.Notes, m.PhotoPath,
                m.Phones.Where(p => !p.IsDeleted).OrderByDescending(p => p.IsPrimary)
                    .Select(p => new MemberPhoneDto(p.Id, p.CountryCode, p.Number, p.Type, p.IsPrimary, p.IsEmergency)).ToList(),
                m.Emails.Where(e => !e.IsDeleted).OrderByDescending(e => e.IsPrimary)
                    .Select(e => new MemberEmailDto(e.Id, e.Address, e.Type, e.IsPrimary, e.IsEmergency)).ToList(),
                m.Addresses.Where(a => !a.IsDeleted).OrderByDescending(a => a.IsPrimary)
                    .Select(a => new MemberAddressDto(a.Id, a.Type, a.Country, a.City, a.Details, a.IsPrimary)).ToList(),
                m.CreatedAt, m.UpdatedAt
            ))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
