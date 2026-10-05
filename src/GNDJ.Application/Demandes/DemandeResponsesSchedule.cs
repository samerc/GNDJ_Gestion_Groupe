using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// « Envoyer les réponses » at a chosen date and time (Lebanon time) instead of by hand. The CG sets the moment on the
// demandes review page; the scheduled-runs job (every minute) runs EXACTLY the same SendDemandeResponsesCommand as
// the button once that moment has passed, then tells the group managers how it went (bell + push). Storage and the
// run-once logic are in Common/ScheduledRun.
public static class DemandeResponsesSchedule
{
    public const string ScheduledAtKey = "demande.responses_scheduled_at";
    public const string StatusKey = "demande.responses_schedule_status";
    public static readonly ScheduledRunKeys Keys = new(ScheduledAtKey, StatusKey, "demande", "Envoi programmé des réponses");

    public static DateTime? Parse(string? v) => ScheduledRun.Parse(v);

    // Called by the background job. Returns null when nothing was due.
    public static Task<string?> RunDueAsync(IApplicationDbContext context, IMediator mediator, INotificationService notifications, CancellationToken ct) =>
        ScheduledRun.RunDueAsync(context, Keys,
            async c =>
            {
                var year = await context.Settings.Where(s => s.Key == "demande.scout_year").Select(s => s.Value).FirstOrDefaultAsync(c) ?? "";
                var result = await mediator.Send(new SendDemandeResponsesCommand(year), c);
                return result.IsSuccess
                    ? (true, $"{result.Value!.Approved} acceptation(s) et {result.Value.Declined} refus envoyés.")
                    : (false, result.Error ?? "Échec de l'envoi.");
            },
            (ok, message) => notifications.NotifyGroupManagersAsync("demande",
                ok ? "Réponses aux demandes envoyées" : "Envoi programmé des réponses : échec",
                ok ? message : $"{message} Rien n'a été envoyé : corrigez puis envoyez à la main ou reprogrammez.",
                "/admin/demandes", ct: ct),
            ct);
}

public record GetDemandeResponsesScheduleQuery() : IRequest<Result<ScheduledRunDto>>;

public class GetDemandeResponsesScheduleQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetDemandeResponsesScheduleQuery, Result<ScheduledRunDto>>
{
    public async ValueTask<Result<ScheduledRunDto>> Handle(GetDemandeResponsesScheduleQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) return Result<ScheduledRunDto>.Failure("Accès non autorisé.");
        return Result<ScheduledRunDto>.Success(await ScheduledRun.ReadAsync(context, DemandeResponsesSchedule.Keys, ct));
    }
}

// Sets (or, with an empty value, cancels) the scheduled send. The moment must be in the future (Lebanon time).
public record ScheduleDemandeResponsesCommand(string? ScheduledAt) : IRequest<Result<bool>>;

public class ScheduleDemandeResponsesCommandValidator : AbstractValidator<ScheduleDemandeResponsesCommand>
{
    public ScheduleDemandeResponsesCommandValidator() => ScheduledRunValidation.Apply(RuleFor(x => x.ScheduledAt));
}

public class ScheduleDemandeResponsesCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<ScheduleDemandeResponsesCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ScheduleDemandeResponsesCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) return Result<bool>.Failure("Accès non autorisé.");
        await ScheduledRun.SaveAsync(context, DemandeResponsesSchedule.Keys, request.ScheduledAt, ct);
        await context.SaveChangesAsync(ct);
        var empty = string.IsNullOrWhiteSpace(request.ScheduledAt);
        await audit.LogAsync(empty ? "UnscheduleResponses" : "ScheduleResponses", "Demande", null,
            newValues: new { ScheduledAt = empty ? null : request.ScheduledAt!.Trim() }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
