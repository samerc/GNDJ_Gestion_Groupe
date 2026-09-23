using System.Text.Json;
using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
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
        var explicitIds = ids.ToList();       // the hand-picked members (for the label + resend targeting)
        var explicitCount = explicitIds.Count;
        var labelParts = new List<string>();

        if (request.UnitId is Guid unitId)
        {
            var unit = await context.Units.Where(u => u.Id == unitId).Select(u => u.Name).FirstOrDefaultAsync(ct);
            var unitMembers = await context.MemberAssignments
                .Where(a => a.UnitId == unitId && a.EndDate == null && !a.IsDeleted && !a.Member.IsDeleted)
                .Select(a => a.MemberId).Distinct().ToListAsync(ct);
            foreach (var id in unitMembers) ids.Add(id);
            if (unit is not null) labelParts.Add($"Unité : {unit}");
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
                labelParts.Add($"Groupe : {group.Name}");
            }
        }

        if (explicitCount > 0) labelParts.Add($"{explicitCount} membre(s) sélectionné(s)");

        ids.Remove(Guid.Empty);
        if (ids.Count == 0) return Result<int>.Failure("Aucun destinataire.");

        var title = request.Title.Trim();
        var body = string.IsNullOrWhiteSpace(request.Body) ? null : request.Body.Trim();
        var url = string.IsNullOrWhiteSpace(request.Url) ? null : request.Url.Trim();

        // Writes the in-app notifications AND enqueues a Web Push per member (durable outbox).
        await notifications.NotifyMembersAsync(ids, "message", title, body, url, ct);

        // Record the send in the broadcast history so a manager can review what was sent (who / to whom / when)
        // AND resend it later. The hand-picked members are stored as {id,name}[] so the resend form can re-render
        // the chips without a re-lookup.
        var senderName = currentUser.MemberId is Guid me
            ? await context.Members.Where(m => m.Id == me).Select(m => m.FirstName + " " + m.LastName).FirstOrDefaultAsync(ct)
            : null;
        string? membersJson = null;
        if (explicitIds.Count > 0)
        {
            var picked = await context.Members
                .Where(m => explicitIds.Contains(m.Id))
                .Select(m => new PickedMember(m.Id, m.FirstName + " " + m.LastName))
                .ToListAsync(ct);
            membersJson = JsonSerializer.Serialize(picked);
        }
        context.NotificationBroadcasts.Add(new NotificationBroadcast
        {
            SentByMemberId = currentUser.MemberId,
            SentByName = senderName ?? "—",
            SentAt = DateTime.UtcNow,
            Type = "message",
            Title = title,
            Body = body,
            Url = url,
            AudienceLabel = labelParts.Count > 0 ? string.Join(" · ", labelParts) : "—",
            RecipientCount = ids.Count,
            UnitId = request.UnitId,
            MemberGroupId = request.MemberGroupId,
            MemberIdsJson = membersJson,
        });
        await context.SaveChangesAsync(ct);

        return Result<int>.Success(ids.Count);
    }
}

// ── History of manual broadcasts (the "Envoyer une notification" sends) ──
// Group-manager only — a manager reviews what was sent, to whom, by whom and when, and can RESEND (the raw
// targeting is returned so the compose form can be re-populated). Newest first, paged with the same "+1 to
// detect has-more" trick as the personal notification list (no separate count query).
public record PickedMember(Guid Id, string Name); // a hand-picked recipient (stored denormalized for resend)

public record NotificationBroadcastDto(
    Guid Id, string SentByName, DateTime SentAt, string Title, string? Body, string? Url,
    string AudienceLabel, int RecipientCount,
    Guid? UnitId, Guid? MemberGroupId, IReadOnlyList<PickedMember> Members);

public record BroadcastListDto(IReadOnlyList<NotificationBroadcastDto> Items, bool HasMore);

public record GetNotificationBroadcastsQuery(int Page = 1, int PageSize = 20) : IRequest<Result<BroadcastListDto>>;

public class GetNotificationBroadcastsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetNotificationBroadcastsQuery, Result<BroadcastListDto>>
{
    public async ValueTask<Result<BroadcastListDto>> Handle(GetNotificationBroadcastsQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<BroadcastListDto>.Failure("Accès non autorisé.");

        var page = Math.Max(1, request.Page);
        var size = Math.Clamp(request.PageSize, 1, 100);

        // Fetch raw rows, then deserialize the hand-picked members in memory (EF can't run JsonSerializer).
        var rows = await context.NotificationBroadcasts
            .OrderByDescending(b => b.SentAt)
            .Skip((page - 1) * size).Take(size + 1)
            .Select(b => new
            {
                b.Id, b.SentByName, b.SentAt, b.Title, b.Body, b.Url, b.AudienceLabel, b.RecipientCount,
                b.UnitId, b.MemberGroupId, b.MemberIdsJson
            })
            .ToListAsync(ct);

        var items = rows.Select(b => new NotificationBroadcastDto(
            b.Id, b.SentByName, b.SentAt, b.Title, b.Body, b.Url, b.AudienceLabel, b.RecipientCount,
            b.UnitId, b.MemberGroupId,
            string.IsNullOrWhiteSpace(b.MemberIdsJson)
                ? []
                : JsonSerializer.Deserialize<List<PickedMember>>(b.MemberIdsJson) ?? [])).ToList();

        var hasMore = items.Count > size;
        if (hasMore) items = items.Take(size).ToList();
        return Result<BroadcastListDto>.Success(new BroadcastListDto(items, hasMore));
    }
}
