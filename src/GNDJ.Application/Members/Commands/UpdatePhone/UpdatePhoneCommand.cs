using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.UpdatePhone;

public record UpdatePhoneCommand(Guid Id, string CountryCode, string Number, string Type, bool IsPrimary, bool IsEmergency) : IRequest<Result<bool>>;

public class UpdatePhoneCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<UpdatePhoneCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdatePhoneCommand request, CancellationToken ct)
    {
        var entity = await context.MemberPhones.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Téléphone introuvable.");

        if (!currentUser.IsSuperAdmin && currentUser.MemberId != entity.MemberId)
        {
            var canAccess = await context.MemberAssignments.AnyAsync(a =>
                a.MemberId == entity.MemberId && a.EndDate == null && currentUser.AuthorizedUnitIds.Contains(a.UnitId), ct);
            if (!canAccess) return Result<bool>.Failure("Accès non autorisé.");
        }

        entity.CountryCode = request.CountryCode;
        entity.Number = request.Number;
        entity.Type = request.Type;
        entity.IsPrimary = request.IsPrimary;
        entity.IsEmergency = request.IsEmergency;

        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
