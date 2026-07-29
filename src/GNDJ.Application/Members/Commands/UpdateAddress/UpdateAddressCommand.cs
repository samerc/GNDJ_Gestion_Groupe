using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.UpdateAddress;

// Edits a member address. Access (IDOR guard, on the owning member): own profile / super-admin / active unit leader.
public record UpdateAddressCommand(Guid Id, string Type, string Country, string City, string? Details, bool IsPrimary) : IRequest<Result<bool>>;

public class UpdateAddressCommandValidator : AbstractValidator<UpdateAddressCommand>
{
    public UpdateAddressCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Type).NotEmpty().MaximumLength(50).NoHtml();
        RuleFor(x => x.Country).NotEmpty().MaximumLength(100).NoHtml();
        RuleFor(x => x.City).NotEmpty().MaximumLength(100).NoHtml();
        RuleFor(x => x.Details).MaximumLength(500).NoHtml();
    }
}

public class UpdateAddressCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<UpdateAddressCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateAddressCommand request, CancellationToken ct)
    {
        var entity = await context.MemberAddresses.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Adresse introuvable.");

        if (!await MemberAccess.CanAccessMemberAsync(context, currentUser, entity.MemberId, ct))
            return Result<bool>.Failure("Accès non autorisé.");

        entity.Type = request.Type;
        entity.Country = request.Country;
        entity.City = request.City;
        entity.Details = request.Details;
        entity.IsPrimary = request.IsPrimary;

        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
