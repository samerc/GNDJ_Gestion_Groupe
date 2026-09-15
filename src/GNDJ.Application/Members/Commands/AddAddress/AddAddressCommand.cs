using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.AddAddress;

// Adds an address to a member. Access (IDOR guard): own profile / super-admin / active unit leader.
public record AddAddressCommand(Guid MemberId, string Type, string Country, string City, string? Details, bool IsPrimary) : IRequest<Result<Guid>>;

public class AddAddressCommandValidator : AbstractValidator<AddAddressCommand>
{
    public AddAddressCommandValidator()
    {
        RuleFor(x => x.Type).NotEmpty().WithMessage("Le type est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Country).NotEmpty().WithMessage("Le pays est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.City).NotEmpty().WithMessage("La ville est requise.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Details).MaximumLength(500).NoHtml();
    }
}

public class AddAddressCommandHandler : IRequestHandler<AddAddressCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;

    public AddAddressCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    {
        _context = context;
        _currentUser = currentUser;
        _audit = audit;
    }

    // Readable one-line address for the audit snapshot: "City · Details (Country)".
    internal static string Format(string city, string? details, string country)
    {
        var main = string.Join(" · ", new[] { city, details }.Where(s => !string.IsNullOrWhiteSpace(s)));
        return string.IsNullOrWhiteSpace(country) ? main : $"{main} ({country})";
    }

    public async ValueTask<Result<Guid>> Handle(AddAddressCommand request, CancellationToken cancellationToken)
    {
        if (!await MemberAccess.CanAccessMemberAsync(_context, _currentUser, request.MemberId, cancellationToken))
            return Result<Guid>.Failure("Accès non autorisé.");

        var entity = new MemberAddress
        {
            MemberId = request.MemberId,
            Type = request.Type,
            Country = request.Country,
            City = request.City,
            Details = request.Details,
            IsPrimary = request.IsPrimary
        };
        _context.MemberAddresses.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        // Household: a confirmed fratrie shares one address — mirror this member's address set onto the siblings.
        await HouseholdSync.PropagateAddressesAsync(_context, request.MemberId, cancellationToken);
        await _audit.LogAsync("Update", "Member", request.MemberId, newValues: new
        {
            Member = await AuditNames.MemberAsync(_context, request.MemberId, cancellationToken),
            Address = Format(request.City, request.Details, request.Country), request.Type
        }, cancellationToken: cancellationToken);
        return Result<Guid>.Success(entity.Id);
    }
}
