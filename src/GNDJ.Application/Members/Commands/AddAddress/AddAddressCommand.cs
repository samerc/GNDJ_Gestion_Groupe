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

    public AddAddressCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<Guid>> Handle(AddAddressCommand request, CancellationToken cancellationToken)
    {
        if (!_currentUser.IsSuperAdmin && _currentUser.MemberId != request.MemberId)
        {
            var canAccess = await _context.MemberAssignments.AnyAsync(a =>
                a.MemberId == request.MemberId && a.EndDate == null && _currentUser.AuthorizedUnitIds.Contains(a.UnitId), cancellationToken);
            if (!canAccess) return Result<Guid>.Failure("Accès non autorisé.");
        }

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
        return Result<Guid>.Success(entity.Id);
    }
}
