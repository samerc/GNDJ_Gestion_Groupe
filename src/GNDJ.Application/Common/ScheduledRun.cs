using System.Globalization;
using System.Text.Json;
using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// A one-off action the CG schedules for a date and time (Lebanon time) instead of pressing the button —
// « Envoyer les réponses » (demandes) and « Publier le passage ». Each schedule lives in two hidden settings:
//   <AtKey>      "yyyy-MM-ddTHH:mm" (Lebanon local) — empty = nothing scheduled
//   <StatusKey>  JSON of the last automatic run (when / ok / message)
// A background job (ScheduledRunsBackgroundService, every minute) calls RunDueAsync. The schedule is CLEARED and
// committed BEFORE the action runs, so it can never fire twice (the actions are idempotent anyway).
public record ScheduledRunKeys(string AtKey, string StatusKey, string Category, string Label);

public record ScheduledRunStatusDto(string At, string? ScheduledFor, bool Ok, string Message);
public record ScheduledRunDto(string? ScheduledAt, ScheduledRunStatusDto? LastRun);

public static class ScheduledRun
{
    public const string Format = "yyyy-MM-ddTHH:mm";

    public static DateTime? Parse(string? v) =>
        DateTime.TryParseExact(v, Format, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;

    public static async Task SetAsync(IApplicationDbContext context, string key, string value, string label, string category, CancellationToken ct)
    {
        var s = await context.Settings.FirstOrDefaultAsync(x => x.Key == key, ct);
        if (s is null)
            context.Settings.Add(new Setting { Key = key, Value = value, Category = category, Label = label, ValueType = "string" });
        else
            s.Value = value;
    }

    // Sets the moment (or cancels it with an empty value). The validator has already checked it is in the future.
    public static Task SaveAsync(IApplicationDbContext context, ScheduledRunKeys keys, string? scheduledAt, CancellationToken ct)
    {
        var value = string.IsNullOrWhiteSpace(scheduledAt) ? "" : scheduledAt.Trim();
        return SetAsync(context, keys.AtKey, value, keys.Label, keys.Category, ct);
    }

    public static async Task<ScheduledRunDto> ReadAsync(IApplicationDbContext context, ScheduledRunKeys keys, CancellationToken ct)
    {
        var wanted = new[] { keys.AtKey, keys.StatusKey };
        var s = await context.Settings.Where(x => wanted.Contains(x.Key)).ToDictionaryAsync(x => x.Key, x => x.Value, ct);
        var at = s.GetValueOrDefault(keys.AtKey);
        ScheduledRunStatusDto? last = null;
        if (s.GetValueOrDefault(keys.StatusKey) is { Length: > 0 } json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var r = doc.RootElement;
                last = new ScheduledRunStatusDto(r.GetProperty("at").GetString() ?? "",
                    r.TryGetProperty("scheduledFor", out var sf) ? sf.GetString() : null,
                    r.GetProperty("ok").GetBoolean(), r.GetProperty("message").GetString() ?? "");
            }
            catch (JsonException) { }
        }
        return new ScheduledRunDto(Parse(at) is null ? null : at, last);
    }

    // Runs the action when its moment has passed. Returns null when nothing was due, else the result message.
    // `run` returns (ok, message); an exception counts as a failure. `notify` is called with the outcome.
    public static async Task<string?> RunDueAsync(IApplicationDbContext context, ScheduledRunKeys keys,
        Func<CancellationToken, Task<(bool Ok, string Message)>> run, Func<bool, string, Task> notify, CancellationToken ct)
    {
        var raw = await context.Settings.Where(s => s.Key == keys.AtKey).Select(s => s.Value).FirstOrDefaultAsync(ct);
        var at = Parse(raw);
        if (at is null || LebanonClock.Now < at.Value) return null;

        // Claim it first: clear the schedule and commit, so a crash or a second process can't run it twice.
        await SetAsync(context, keys.AtKey, "", keys.Label, keys.Category, ct);
        await context.SaveChangesAsync(ct);

        bool ok; string message;
        try
        {
            (ok, message) = await run(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            ok = false;
            message = ex is ValidationException ve ? string.Join(" ", ve.Errors.Select(e => e.ErrorMessage)) : "Erreur inattendue pendant l'exécution.";
        }

        var status = JsonSerializer.Serialize(new { at = LebanonClock.Now.ToString(Format, CultureInfo.InvariantCulture), scheduledFor = raw, ok, message });
        await SetAsync(context, keys.StatusKey, status, "Dernière exécution programmée", keys.Category, ct);
        await context.SaveChangesAsync(ct);

        await notify(ok, message);
        return message;
    }
}

// Shared rule for « schedule » commands: empty = cancel, otherwise a valid moment in the future (Lebanon time).
public static class ScheduledRunValidation
{
    public static void Apply<T>(IRuleBuilderInitial<T, string?> rule) =>
        rule.Must(v => string.IsNullOrWhiteSpace(v) || ScheduledRun.Parse(v) is not null)
            .WithMessage("Date et heure invalides.")
            .Must(v => string.IsNullOrWhiteSpace(v) || ScheduledRun.Parse(v) is not { } d || d > LebanonClock.Now)
            .WithMessage("Choisissez une date et une heure à venir.");
}
