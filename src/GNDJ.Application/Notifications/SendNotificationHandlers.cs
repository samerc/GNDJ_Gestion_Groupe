using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Notifications;

// CG tool: send a TARGETED notification (in-app + Web Push) to chosen recipients. Recipients are the UNION of:
// explicit MemberIds, all active members of UnitId, and the roster of MemberGroupId (any combination). Goes
// through INotificationService.NotifyMembers, so it writes the in-app rows AND enqueues a push per member.
// Group-manager only (super-admin / Chef de Groupe / ACG).
public record SendPushNotificationCommand(
    List<Guid>? MemberIds, Guid? UnitId, Guid? MemberGroupId,
    string Title, string? Body, string? Url) : IRequest<Result<int>>;

public class SendPushNotificationValidator : AbstractValidator<SendPushNotificationCommand>
{
    public SendPushNotificationValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithMessage("Le titre est requis.").MaximumLength(300).NoHtml();
        RuleFor(x => x.Body).MaximumLength(2000).NoHtml();
        RuleFor(x => x.Url).MaximumLength(500).NoHtml();
    }
}

public class SendPushNotificationHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, INotificationService notifications)
    : IRequestHandler<SendPushNotificationCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(SendPushNotificationCommand request, CancellationToken ct)
    {
        // CG tool — group managers only.
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<int>.Failure("Accès non autorisé.");

        var ids = new HashSet<Guid>(request.MemberIds ?? []);

        if (request.UnitId is Guid unitId)
        {
            var unitMembers = await context.MemberAssignments
                .Where(a => a.UnitId == unitId && a.EndDate == null && !a.IsDeleted && !a.Member.IsDeleted)
                .Select(a => a.MemberId).Distinct().ToListAsync(ct);
            foreach (var id in unitMembers) ids.Add(id);
        }

        if (request.MemberGroupId is Guid groupId)
        {
            var group = await context.MemberGroups.Include(g => g.Rules)
                .FirstOrDefaultAsync(g => g.Id == groupId && !g.IsDeleted, ct);
            if (group is not null)
            {
                var groupMembers = await MemberGroupResolver.RosterQuery(context, group)
                    .Select(a => a.MemberId).Distinct().ToListAsync(ct);
                foreach (var id in groupMembers) ids.Add(id);
            }
        }

        ids.Remove(Guid.Empty);
        if (ids.Count == 0) return Result<int>.Failure("Aucun destinataire.");

        // Writes the in-app notifications AND enqueues a Web Push per member (durable outbox).
        await notifications.NotifyMembersAsync(ids, "message", request.Title.Trim(),
            string.IsNullOrWhiteSpace(request.Body) ? null : request.Body.Trim(),
            string.IsNullOrWhiteSpace(request.Url) ? null : request.Url.Trim(), ct);

        return Result<int>.Success(ids.Count);
    }
}
