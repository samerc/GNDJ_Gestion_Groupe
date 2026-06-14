using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.UpdateEmail;

public record UpdateEmailCommand(Guid Id, string Address, string Type, bool IsPrimary, bool IsEmergency) : IRequest<Result<bool>>;

public class UpdateEmailCommandValidator : AbstractValidator<UpdateEmailCommand>
{
    public UpdateEmailCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Address).NotEmpty().EmailAddress().WithMessage("Adresse email invalide.").MaximumLength(254);
        RuleFor(x => x.Type).NotEmpty().MaximumLength(50).NoHtml();
    }
}

public class UpdateEmailCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<UpdateEmailCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateEmailCommand request, CancellationToken ct)
    {
        var entity = await context.MemberEmails.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Email introuvable.");

        if (!currentUser.IsSuperAdmin && currentUser.MemberId != entity.MemberId)
        {
            var canAccess = await context.MemberAssignments.AnyAsync(a =>
                a.MemberId == entity.MemberId && a.EndDate == null && currentUser.AuthorizedUnitIds.Contains(a.UnitId), ct);
            if (!canAccess) return Result<bool>.Failure("Accès non autorisé.");
        }

        entity.Address = request.Address;
        entity.Type = request.Type;
        entity.IsPrimary = request.IsPrimary;
        entity.IsEmergency = request.IsEmergency;

        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
