using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Members.DTOs;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Queries;

// Paginated member list, unit-scoped per caller. Two modes: active members (default) or the
// Alumni view (former members, identity-only). See the handler for the scoping rules.
public record GetMembersQuery(
    string? Search, Guid? UnitId, Guid? TeamId, bool? NoUnit, bool? Alumni,
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
        var authorizedUnitIds = _currentUser.AuthorizedUnitIds;
        var isAlumni = request.Alumni == true;
        // Group-level managers (super-admin or a Chef de Groupe — holds maitrise.manage) see the whole
        // group, so they get the unscoped alumni view (all former members), not just their units.
        var isGroupLevel = _currentUser.IsSuperAdmin
            || _currentUser.Permissions.Contains(Domain.Enums.Permissions.MaitriseManage);

        // Only member managers (super-admin / Chef de Groupe / Chef d'unité — i.e. members.edit) may list
        // members. A read-only youth holds members.view + their own unit in AuthorizedUnitIds, so without
        // this gate they could enumerate co-members' identities and contacts. Non-managers → empty list.
        if (!_currentUser.IsSuperAdmin && !_currentUser.Permissions.Contains(Domain.Enums.Permissions.MembersEdit))
            query = query.Where(_ => false);

        if (isAlumni)
        {
            // Alumni view: members who HAD an assignment in the unit that has ended and who
            // are NOT currently active in that unit (i.e. they moved away or left).
            // Personal data (contact) is withheld below — only identity is shown.
            if (request.UnitId.HasValue)
            {
                var uid = request.UnitId.Value;
                if (!_currentUser.IsSuperAdmin && !authorizedUnitIds.Contains(uid))
                    query = query.Where(_ => false); // not authorized for this unit
                else
                    query = query.Where(m =>
                        m.Assignments.Any(a => a.UnitId == uid && a.EndDate != null) &&
                        !m.Assignments.Any(a => a.UnitId == uid && a.EndDate == null));
            }
            else if (isGroupLevel)
            {
                // Super-admin / Chef de Groupe, no unit filter: ALL former members — had an assignment
                // that ended and have no active assignment anywhere (left the group / not currently placed).
                query = query.Where(m =>
                    m.Assignments.Any(a => a.EndDate != null) &&
                    !m.Assignments.Any(a => a.EndDate == null));
            }
            else
            {
                query = query.Where(m =>
                    m.Assignments.Any(a => a.EndDate != null && authorizedUnitIds.Contains(a.UnitId)) &&
                    !m.Assignments.Any(a => a.EndDate == null && authorizedUnitIds.Contains(a.UnitId)));
            }
        }
        else
        {
            // Active-member scope — only members with an ACTIVE assignment in an authorized unit.
            // (Without the EndDate == null filter, a CU would also see members who merely passed
            // through their unit historically but have since moved elsewhere.)
            if (!_currentUser.IsSuperAdmin)
                query = query.Where(m => m.Assignments.Any(a => a.EndDate == null && authorizedUnitIds.Contains(a.UnitId)));

            if (request.NoUnit == true)
                query = query.Where(m => !m.Assignments.Any(a => a.EndDate == null));
            else if (request.UnitId.HasValue)
                query = query.Where(m => m.Assignments.Any(a => a.UnitId == request.UnitId.Value && a.EndDate == null));
            else
                // No unit filter: still restrict to members with ANY active assignment so the default
                // (super-admin) list shows current members only — alumni are reached via the Alumni view.
                query = query.Where(m => m.Assignments.Any(a => a.EndDate == null));
        }

        if (request.TeamId.HasValue)
            query = query.Where(m => m.Assignments.Any(a => a.TeamId == request.TeamId.Value && a.EndDate == null));

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            // Accent-insensitive: unaccent() strips diacritics so "rhea" matches "Rhéa". Both sides are
            // unaccent()'d inside the expression tree so EF translates them to SQL (never run in-process).
            var search = request.Search.ToLower();
            query = query.Where(m =>
                Common.DbFns.Unaccent(m.FirstName.ToLower()).Contains(Common.DbFns.Unaccent(search)) ||
                Common.DbFns.Unaccent(m.LastName.ToLower()).Contains(Common.DbFns.Unaccent(search)) ||
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

        var scopeUnitId = request.UnitId;

        // Alumni results expose identity only — contact details are withheld.
        var projected = ordered.ThenBy(m => m.FirstName)
            .Select(m => new MemberListDto(
                m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.Gender, m.CardNumber, m.ExternalCardNumber,
                isAlumni ? null : m.Emails.Where(e => e.IsPrimary && !e.IsDeleted).Select(e => e.Address).FirstOrDefault(),
                isAlumni ? null : m.Phones.Where(p => p.IsPrimary && !p.IsDeleted).Select(p => p.CountryCode + " " + p.Number).FirstOrDefault(),
                m.PhotoPath,
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Code).FirstOrDefault(),
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Team != null ? a.Team.Name : null).FirstOrDefault(),
                // Functional role of the active assignment (scoped to the queried unit when set).
                m.Assignments.Where(a => a.EndDate == null && (scopeUnitId == null || a.UnitId == scopeUnitId))
                    .Select(a => a.FunctionalRole.Name).FirstOrDefault(),
                m.Assignments.Where(a => a.EndDate == null && (scopeUnitId == null || a.UnitId == scopeUnitId))
                    .Select(a => (int?)a.FunctionalRole.Rank).FirstOrDefault(),
                // Father's name (relationship stored as "Pere" or "Père").
                m.GuardianLinks.Where(l => !l.IsDeleted && (l.RelationshipType == "Pere" || l.RelationshipType == "Père"))
                    .Select(l => l.Guardian.FirstName + " " + l.Guardian.LastName).FirstOrDefault()
            ));

        var result = await PaginatedList<MemberListDto>.CreateAsync(projected, request.Page, request.PageSize, cancellationToken);

        // Dossier-compliance flags for active members (skipped for the alumni view). Computed in batch for
        // just this page — active doc types + approved-doc counts + current-year cotisation status — so it's
        // 3 extra set-based queries, never N+1. "Complete docs" = an Approved document for EVERY active
        // document type; "cotisation OK" = a current-year cotisation that's paid (has a payment) or exempt.
        if (!isAlumni && result.Items.Count > 0)
        {
            var ids = result.Items.Select(i => i.Id).ToList();

            var activeDocTypeIds = await _context.DocumentTypes
                .Where(d => d.IsActive && !d.IsDeleted).Select(d => d.Id).ToListAsync(cancellationToken);
            var requiredCount = activeDocTypeIds.Count;

            var approvedTypeCount = requiredCount == 0
                ? new Dictionary<Guid, int>()
                : await _context.MemberDocuments
                    .Where(d => ids.Contains(d.MemberId) && !d.IsDeleted
                        && d.Status == Domain.Enums.DocumentStatus.Approved && activeDocTypeIds.Contains(d.DocumentTypeId))
                    .GroupBy(d => d.MemberId)
                    .Select(g => new { Id = g.Key, N = g.Select(x => x.DocumentTypeId).Distinct().Count() })
                    .ToDictionaryAsync(x => x.Id, x => x.N, cancellationToken);

            var scoutYear = await _context.Settings.Where(s => s.Key == "cotisation.current_scout_year")
                .Select(s => s.Value).FirstOrDefaultAsync(cancellationToken);
            var cotisTracked = !string.IsNullOrWhiteSpace(scoutYear);
            var cotisOk = cotisTracked
                ? (await _context.MemberCotisations
                    .Where(c => ids.Contains(c.MemberId) && !c.IsDeleted && c.ScoutYear == scoutYear
                        && (c.WillNotPay || c.Payments.Any(p => !p.IsDeleted)))
                    .Select(c => c.MemberId).Distinct().ToListAsync(cancellationToken)).ToHashSet()
                : new HashSet<Guid>();

            var withCompliance = result.Items.Select(i => i with
            {
                DocsComplete = requiredCount == 0 || approvedTypeCount.GetValueOrDefault(i.Id) >= requiredCount,
                CotisationOk = cotisTracked ? cotisOk.Contains(i.Id) : (bool?)null,
            }).ToList();

            return new PaginatedList<MemberListDto>(withCompliance, result.TotalCount, result.Page, result.PageSize);
        }

        return result;
    }
}

// Full member detail. Access (IDOR guard): super-admin, the member themselves, or a leader with an
// ACTIVE assignment of the member in an authorized unit; otherwise returns null (treated as 404).
public record GetMemberByIdQuery(Guid Id) : IRequest<MemberDetailDto?>;

public class GetMemberByIdQueryHandler : IRequestHandler<GetMemberByIdQuery, MemberDetailDto?>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetMemberByIdQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<MemberDetailDto?> Handle(GetMemberByIdQuery request, CancellationToken cancellationToken)
    {
        if (!_currentUser.IsSuperAdmin)
        {
            if (_currentUser.MemberId != request.Id)
            {
                // Viewing ANOTHER member's full profile (medical, allergies, contacts) is a leader action:
                // require members.edit, not bare co-unit membership. A read-only youth carries their own
                // unit in AuthorizedUnitIds, so a unit-only check would leak every co-member's dossier.
                if (!_currentUser.Permissions.Contains(Domain.Enums.Permissions.MembersEdit)) return null;
                var canAccess = await _context.MemberAssignments.AnyAsync(a =>
                    a.MemberId == request.Id && a.EndDate == null && _currentUser.AuthorizedUnitIds.Contains(a.UnitId), cancellationToken);
                if (!canAccess) return null;
            }
        }

        return await _context.Members
            .Where(m => m.Id == request.Id)
            .Select(m => new MemberDetailDto(
                m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.Gender,
                m.CardNumber, m.ExternalCardNumber, m.BloodType, m.Nationality, m.School,
                m.Classe, m.Section,
                m.MedicalNotes, m.Allergies, m.Notes, m.PhotoPath,
                m.Phones.Where(p => !p.IsDeleted).OrderByDescending(p => p.IsPrimary)
                    .Select(p => new MemberPhoneDto(p.Id, p.CountryCode, p.Number, p.Type, p.IsPrimary, p.IsEmergency)).ToList(),
                m.Emails.Where(e => !e.IsDeleted).OrderByDescending(e => e.IsPrimary)
                    .Select(e => new MemberEmailDto(e.Id, e.Address, e.Type, e.IsPrimary, e.IsEmergency)).ToList(),
                m.Addresses.Where(a => !a.IsDeleted).OrderByDescending(a => a.IsPrimary)
                    .Select(a => new MemberAddressDto(a.Id, a.Type, a.Country, a.City, a.Details, a.IsPrimary)).ToList(),
                m.CreatedAt, m.UpdatedAt,
                // Login of the linked user account (correlated subquery); null if the member has no account.
                _context.Users.Where(u => u.MemberId == m.Id && !u.IsDeleted).Select(u => u.Email).FirstOrDefault(),
                m.PrimaryContactEmail,
                // Distinct guardian emails linked to this member (contact-email options for the picker).
                m.GuardianLinks.Where(gl => !gl.IsDeleted)
                    .SelectMany(gl => gl.Guardian.Emails.Where(e => !e.IsDeleted).Select(e => e.Address))
                    .Distinct().ToList()
            ))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
