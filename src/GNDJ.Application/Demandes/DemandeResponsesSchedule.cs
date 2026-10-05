using System.Globalization;
using System.Text.Json;
using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// « Envoyer les réponses » at a chosen date and time (Lebanon time) instead of by hand. The CG sets the moment on the
// demandes review page; a background job (DemandeResponsesSchedulerBackgroundService, every minute) runs EXACTLY the
// same SendDemandeResponsesCommand as the button once that moment has passed, then tells the group managers how it
// went (bell + push). The schedule lives in two hidden settings:
//   demande.responses_scheduled_at      "yyyy-MM-ddTHH:mm" (Lebanon local) — empty = nothing scheduled
//   demande.responses_schedule_status   JSON of the last automatic run (when / ok / message)
// The schedule is CLEARED before the send runs, so it can never fire twice; the send itself is advisory-locked and
// idempotent anyway (a second run converts nothing).
public static class DemandeResponsesSchedule
{
    public const string ScheduledAtKey = "demande.responses_scheduled_at";
    public const string StatusKey = "demande.responses_schedule_status";
    public const string Format = "yyyy-MM-ddTHH:mm";

    public static DateTime? Parse(string? v) =>
        DateTime.TryParseExact(v, Format, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;

    public static async Task SetAsync(IApplicationDbContext context, string key, string value, string label, CancellationToken ct)
    {
        var s = await context.Settings.FirstOrDefaultAsync(x => x.Key == key, ct);
        if (s is null)
            context.Settings.Add(new Setting { Key = key, Value = value, Category = "demande", Label = label, ValueType = "string" });
        else
            s.Value = value;
    }

    // Called by the background job. Returns null when nothing was due.
    public static async Task<string?> RunDueAsync(IApplicationDbContext context, IMediator mediator, INotificationService notifications, CancellationToken ct)
    {
        var raw = await context.Settings.Where(s => s.Key == ScheduledAtKey).Select(s => s.Value).FirstOrDefaultAsync(ct);
        var at = Parse(raw);
        if (at is null || LebanonClock.Now < at.Value) return null;

        // Claim it first: clear the schedule and commit, so a crash or a second process can't send twice.
        await SetAsync(context, ScheduledAtKey, "", "Envoi programmé des réponses", ct);
        await context.SaveChangesAsync(ct);

        var year = await context.Settings.Where(s => s.Key == "demande.scout_year").Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "";
        bool ok; string message;
        try
        {
            var result = await mediator.Send(new SendDemandeResponsesCommand(year), ct);
            ok = result.IsSuccess;
            message = ok
                ? $"{result.Value!.Approved} acceptation(s) et {result.Value.Declined} refus envoyés."
                : result.Error ?? "Échec de l'envoi.";
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            ok = false;
            message = ex is ValidationException ve ? string.Join(" ", ve.Errors.Select(e => e.ErrorMessage)) : "Erreur inattendue pendant l'envoi.";
        }

        var status = JsonSerializer.Serialize(new { at = LebanonClock.Now.ToString(Format, CultureInfo.InvariantCulture), scheduledFor = raw, ok, message });
        await SetAsync(context, StatusKey, status, "Dernier envoi programmé des réponses", ct);
        await context.SaveChangesAsync(ct);

        await notifications.NotifyGroupManagersAsync("demande",
            ok ? "Réponses aux demandes envoyées" : "Envoi programmé des réponses : échec",
            ok ? message : $"{message} Rien n'a été envoyé : corrigez puis envoyez à la main ou reprogrammez.",
            "/admin/demandes", ct: ct);
        return message;
    }
}

public record DemandeResponsesScheduleStatusDto(string At, string? ScheduledFor, bool Ok, string Message);
public record DemandeResponsesScheduleDto(string? ScheduledAt, DemandeResponsesScheduleStatusDto? LastRun);

public record GetDemandeResponsesScheduleQuery() : IRequest<Result<DemandeResponsesScheduleDto>>;

public class GetDemandeResponsesScheduleQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetDemandeResponsesScheduleQuery, Result<DemandeResponsesScheduleDto>>
{
    public async ValueTask<Result<DemandeResponsesScheduleDto>> Handle(GetDemandeResponsesScheduleQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) return Result<DemandeResponsesScheduleDto>.Failure("Accès non autorisé.");
        var keys = new[] { DemandeResponsesSchedule.ScheduledAtKey, DemandeResponsesSchedule.StatusKey };
        var s = await context.Settings.Where(x => keys.Contains(x.Key)).ToDictionaryAsync(x => x.Key, x => x.Value, ct);
        var at = s.GetValueOrDefault(DemandeResponsesSchedule.ScheduledAtKey);
        DemandeResponsesScheduleStatusDto? last = null;
        if (s.GetValueOrDefault(DemandeResponsesSchedule.StatusKey) is { Length: > 0 } json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var r = doc.RootElement;
                last = new DemandeResponsesScheduleStatusDto(r.GetProperty("at").GetString() ?? "",
                    r.TryGetProperty("scheduledFor", out var sf) ? sf.GetString() : null,
                    r.GetProperty("ok").GetBoolean(), r.GetProperty("message").GetString() ?? "");
            }
            catch (JsonException) { }
        }
        return Result<DemandeResponsesScheduleDto>.Success(new DemandeResponsesScheduleDto(
            DemandeResponsesSchedule.Parse(at) is null ? null : at, last));
    }
}

// Sets (or, with an empty value, cancels) the scheduled send. The moment must be in the future (Lebanon time).
public record ScheduleDemandeResponsesCommand(string? ScheduledAt) : IRequest<Result<bool>>;

public class ScheduleDemandeResponsesCommandValidator : AbstractValidator<ScheduleDemandeResponsesCommand>
{
    public ScheduleDemandeResponsesCommandValidator()
    {
        RuleFor(x => x.ScheduledAt)
            .Must(v => DemandeResponsesSchedule.Parse(v) is not null).When(x => !string.IsNullOrWhiteSpace(x.ScheduledAt))
            .WithMessage("Date et heure invalides.")
            .Must(v => DemandeResponsesSchedule.Parse(v) is { } d && d > LebanonClock.Now).When(x => !string.IsNullOrWhiteSpace(x.ScheduledAt))
            .WithMessage("Choisissez une date et une heure à venir.");
    }
}

public class ScheduleDemandeResponsesCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<ScheduleDemandeResponsesCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ScheduleDemandeResponsesCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) return Result<bool>.Failure("Accès non autorisé.");
        var value = string.IsNullOrWhiteSpace(request.ScheduledAt) ? "" : request.ScheduledAt.Trim();
        await DemandeResponsesSchedule.SetAsync(context, DemandeResponsesSchedule.ScheduledAtKey, value, "Envoi programmé des réponses", ct);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync(value.Length == 0 ? "UnscheduleResponses" : "ScheduleResponses", "Demande", null,
            newValues: new { ScheduledAt = value.Length == 0 ? null : value }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
