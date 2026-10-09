using System.Security.Cryptography;
using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Calendar;

// The group calendar (« Calendrier »): read the viewer's items, create / edit / delete events, cancel one date of a
// repeating event, and the personal phone-calendar link. Rules (who sees / edits what) live in CalendarViewer.

internal static class CalendarAccess
{
    public static Task<CalendarViewer> ViewerAsync(IApplicationDbContext context, ICurrentUserService user, CancellationToken ct) =>
        CalendarViewer.LoadAsync(context, user.MemberId, user.IsSuperAdmin, user.Permissions.ToList(), ct);
}

// ===== Read =====
public record GetCalendarQuery(DateOnly From, DateOnly To, Guid? UnitId) : IRequest<Result<List<CalendarItemDto>>>;

public class GetCalendarQueryHandler(IApplicationDbContext context, ICurrentUserService user)
    : IRequestHandler<GetCalendarQuery, Result<List<CalendarItemDto>>>
{
    public async ValueTask<Result<List<CalendarItemDto>>> Handle(GetCalendarQuery request, CancellationToken ct)
    {
        if (request.To < request.From || request.To.DayNumber - request.From.DayNumber > 400)
            return Result<List<CalendarItemDto>>.Failure("Période invalide (400 jours au maximum).");
        var viewer = await CalendarAccess.ViewerAsync(context, user, ct);
        return Result<List<CalendarItemDto>>.Success(await CalendarFeed.LoadAsync(context, viewer, request.From, request.To, request.UnitId, ct));
    }
}

// What the viewer may create, for the event form: audiences + the units / branches they can target.
public record CalendarOptionDto(Guid Id, string Name, string? Code);
public record CalendarOptionsDto(List<string> Audiences, List<CalendarOptionDto> Units, List<CalendarOptionDto> UnitTypes, bool CanSeeAllUnits);

public record GetCalendarOptionsQuery : IRequest<CalendarOptionsDto>;

public class GetCalendarOptionsQueryHandler(IApplicationDbContext context, ICurrentUserService user)
    : IRequestHandler<GetCalendarOptionsQuery, CalendarOptionsDto>
{
    public async ValueTask<CalendarOptionsDto> Handle(GetCalendarOptionsQuery request, CancellationToken ct)
    {
        var viewer = await CalendarAccess.ViewerAsync(context, user, ct);
        var audiences = viewer.IsManager ? CalendarAudiences.All.ToList()
            : viewer.LeadUnitIds.Count > 0 ? [CalendarAudiences.Unit] : [];
        var units = await context.Units.Where(u => u.IsActive && (viewer.IsManager || viewer.LeadUnitIds.Contains(u.Id)))
            .Select(u => new CalendarOptionDto(u.Id, u.Name, u.Code)).ToListAsync(ct);
        var types = viewer.IsManager
            ? await context.UnitTypes.Where(t => context.Units.Any(u => u.UnitTypeId == t.Id && u.IsActive))
                .Select(t => new CalendarOptionDto(t.Id, t.Name, t.Code)).ToListAsync(ct)
            : [];
        return new CalendarOptionsDto(audiences,
            units.OrderBy(u => ActionPreviewText.NaturalKey(u.Code ?? u.Name)).ToList(),
            types.OrderBy(t => t.Name).ToList(), viewer.IsManager);
    }
}

// Full event, for the edit form.
public record CalendarEventDto(Guid Id, string Title, string? Description, string? Location,
    DateOnly StartDate, DateOnly? EndDate, TimeOnly? StartTime, TimeOnly? EndTime,
    string Audience, Guid? UnitTypeId, Guid? UnitId,
    string Recurrence, int RecurrenceInterval, DateOnly? RecurrenceUntil, List<DateOnly> ExceptionDates,
    int? ReminderMinutes, bool PublishOnSite, bool CanEdit);

public record GetCalendarEventQuery(Guid Id) : IRequest<Result<CalendarEventDto>>;

public class GetCalendarEventQueryHandler(IApplicationDbContext context, ICurrentUserService user)
    : IRequestHandler<GetCalendarEventQuery, Result<CalendarEventDto>>
{
    public async ValueTask<Result<CalendarEventDto>> Handle(GetCalendarEventQuery request, CancellationToken ct)
    {
        var e = await context.CalendarEvents.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        var viewer = await CalendarAccess.ViewerAsync(context, user, ct);
        if (e is null || !viewer.CanSee(e)) return Result<CalendarEventDto>.Failure("Événement introuvable.");
        return Result<CalendarEventDto>.Success(new CalendarEventDto(e.Id, e.Title, e.Description, e.Location,
            e.StartDate, e.EndDate, e.StartTime, e.EndTime, e.Audience, e.UnitTypeId, e.UnitId,
            e.Recurrence, e.RecurrenceInterval, e.RecurrenceUntil, CalendarRecurrence.Exceptions(e.ExceptionDatesJson).Order().ToList(),
            e.ReminderMinutes, e.PublishOnSite, viewer.CanEdit(e.Audience, e.UnitId)));
    }
}

// ===== Create / update =====
public record CalendarEventInput(string Title, string? Description, string? Location,
    DateOnly StartDate, DateOnly? EndDate, TimeOnly? StartTime, TimeOnly? EndTime,
    string Audience, Guid? UnitTypeId, Guid? UnitId,
    string Recurrence, int RecurrenceInterval, DateOnly? RecurrenceUntil,
    int? ReminderMinutes, bool PublishOnSite);

public class CalendarEventInputValidator : AbstractValidator<CalendarEventInput>
{
    public CalendarEventInputValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithMessage("Le titre est requis.").MaximumLength(200).NoHtml();
        RuleFor(x => x.Description).MaximumLength(4000).NoHtml();
        RuleFor(x => x.Location).MaximumLength(200).NoHtml();
        RuleFor(x => x.Audience).Must(a => CalendarAudiences.All.Contains(a)).WithMessage("Public invalide.");
        RuleFor(x => x.UnitTypeId).NotNull().When(x => x.Audience == CalendarAudiences.Branch).WithMessage("Choisissez la branche.");
        RuleFor(x => x.UnitId).NotNull().When(x => x.Audience == CalendarAudiences.Unit).WithMessage("Choisissez l'unité.");
        RuleFor(x => x.EndDate).Must((x, end) => end is null || end >= x.StartDate).WithMessage("La date de fin doit être après la date de début.");
        RuleFor(x => x.EndTime).Must((x, end) => end is null || x.StartTime is not null).WithMessage("Indiquez l'heure de début.")
            .Must((x, end) => end is null || x.StartTime is null || x.EndDate > x.StartDate || end > x.StartTime)
            .WithMessage("L'heure de fin doit être après l'heure de début.");
        RuleFor(x => x.Recurrence).Must(r => CalendarRecurrences.All.Contains(r)).WithMessage("Répétition invalide.");
        RuleFor(x => x.RecurrenceInterval).InclusiveBetween(1, 12);
        RuleFor(x => x.RecurrenceUntil).Must((x, until) => until is null || until >= x.StartDate).WithMessage("La fin de la répétition doit être après le début.");
        RuleFor(x => x.ReminderMinutes).InclusiveBetween(0, 20160).When(x => x.ReminderMinutes is not null).WithMessage("Rappel : 14 jours au maximum.");
        RuleFor(x => x.PublishOnSite)
            .Must((x, p) => !p || x.Audience is CalendarAudiences.Group or CalendarAudiences.Branch or CalendarAudiences.Unit)
            .WithMessage("Seuls les événements du groupe, d'une branche ou d'une unité peuvent être publiés sur le site.")
            .Must((x, p) => !p || x.Recurrence == CalendarRecurrences.None)
            .WithMessage("Un événement qui se répète ne peut pas être publié sur le site.");
    }
}

public record CreateCalendarEventCommand(CalendarEventInput Data) : IRequest<Result<Guid>>;

public class CreateCalendarEventCommandValidator : AbstractValidator<CreateCalendarEventCommand>
{
    public CreateCalendarEventCommandValidator() => RuleFor(x => x.Data).NotNull().SetValidator(new CalendarEventInputValidator());
}

public class CreateCalendarEventCommandHandler(IApplicationDbContext context, ICurrentUserService user, IAuditService audit)
    : IRequestHandler<CreateCalendarEventCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateCalendarEventCommand request, CancellationToken ct)
    {
        var viewer = await CalendarAccess.ViewerAsync(context, user, ct);
        var d = request.Data;
        if (!viewer.CanEdit(d.Audience, d.UnitId))
            return Result<Guid>.Failure(d.Audience == CalendarAudiences.Unit
                ? "Vous ne pouvez créer des événements que pour votre unité."
                : "Seule l'équipe du Chef de Groupe peut créer cet événement.");
        var e = new CalendarEvent { CreatedByMemberId = user.MemberId };
        CalendarEventMapping.Apply(e, d);
        context.CalendarEvents.Add(e);
        await context.SaveChangesAsync(ct);
        await CalendarPublish.SyncAsync(context, e, ct);
        await audit.LogAsync("Create", "CalendarEvent", e.Id, newValues: new { e.Title, e.StartDate, e.Audience }, cancellationToken: ct);
        return Result<Guid>.Success(e.Id);
    }
}

public record UpdateCalendarEventCommand(Guid Id, CalendarEventInput Data) : IRequest<Result<bool>>;

public class UpdateCalendarEventCommandValidator : AbstractValidator<UpdateCalendarEventCommand>
{
    public UpdateCalendarEventCommandValidator() => RuleFor(x => x.Data).NotNull().SetValidator(new CalendarEventInputValidator());
}

public class UpdateCalendarEventCommandHandler(IApplicationDbContext context, ICurrentUserService user, IAuditService audit)
    : IRequestHandler<UpdateCalendarEventCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateCalendarEventCommand request, CancellationToken ct)
    {
        var e = await context.CalendarEvents.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (e is null) return Result<bool>.Failure("Événement introuvable.");
        var viewer = await CalendarAccess.ViewerAsync(context, user, ct);
        // Both the current audience AND the new one must be editable (a chef d'unité can't move an event elsewhere).
        if (!viewer.CanEdit(e.Audience, e.UnitId) || !viewer.CanEdit(request.Data.Audience, request.Data.UnitId))
            return Result<bool>.Failure("Vous ne pouvez pas modifier cet événement.");
        var old = new { e.Title, e.StartDate, e.Audience };
        // A changed start date or repetition makes the cancelled dates meaningless — drop them.
        // The one-date copies (« Modifier cette date seulement ») replaced dates that no longer exist either.
        if (e.StartDate != request.Data.StartDate || e.Recurrence != request.Data.Recurrence || e.RecurrenceInterval != request.Data.RecurrenceInterval)
        {
            e.ExceptionDatesJson = null;
            await CalendarSeries.RemoveCopiesAsync(context, e.Id, null, ct);
        }
        CalendarEventMapping.Apply(e, request.Data);
        await context.SaveChangesAsync(ct);
        await CalendarPublish.SyncAsync(context, e, ct);
        await audit.LogAsync("Update", "CalendarEvent", e.Id, oldValues: old, newValues: new { e.Title, e.StartDate, e.Audience }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

internal static class CalendarEventMapping
{
    public static void Apply(CalendarEvent e, CalendarEventInput d)
    {
        static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        e.Title = d.Title.Trim();
        e.Description = Clean(d.Description);
        e.Location = Clean(d.Location);
        e.StartDate = d.StartDate;
        e.EndDate = d.EndDate is DateOnly end && end > d.StartDate ? end : null;
        e.StartTime = d.StartTime;
        e.EndTime = d.StartTime is null ? null : d.EndTime;
        e.Audience = d.Audience;
        e.UnitTypeId = d.Audience == CalendarAudiences.Branch ? d.UnitTypeId : null;
        e.UnitId = d.Audience == CalendarAudiences.Unit ? d.UnitId : null;
        e.Recurrence = d.Recurrence;
        e.RecurrenceInterval = d.Recurrence == CalendarRecurrences.None ? 1 : d.RecurrenceInterval;
        e.RecurrenceUntil = d.Recurrence == CalendarRecurrences.None ? null : d.RecurrenceUntil;
        e.ReminderMinutes = d.ReminderMinutes;
        e.PublishOnSite = d.PublishOnSite;
    }
}

// ===== Delete / cancel one date =====
public record DeleteCalendarEventCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteCalendarEventCommandHandler(IApplicationDbContext context, ICurrentUserService user, IAuditService audit)
    : IRequestHandler<DeleteCalendarEventCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteCalendarEventCommand request, CancellationToken ct)
    {
        var e = await context.CalendarEvents.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (e is null) return Result<bool>.Failure("Événement introuvable.");
        var viewer = await CalendarAccess.ViewerAsync(context, user, ct);
        if (!viewer.CanEdit(e.Audience, e.UnitId)) return Result<bool>.Failure("Vous ne pouvez pas supprimer cet événement.");
        e.PublishOnSite = false;
        await CalendarPublish.SyncAsync(context, e, ct); // removes the public copy
        await CalendarSeries.RemoveCopiesAsync(context, e.Id, null, ct); // a series takes its one-date copies with it
        context.CalendarEvents.Remove(e);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Delete", "CalendarEvent", e.Id, oldValues: new { e.Title, e.StartDate, e.Audience }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// Cancels a single date of a repeating event (the others stay); Restore = put it back.
public record CancelCalendarOccurrenceCommand(Guid Id, DateOnly Date, bool Restore = false) : IRequest<Result<bool>>;

public class CancelCalendarOccurrenceCommandHandler(IApplicationDbContext context, ICurrentUserService user)
    : IRequestHandler<CancelCalendarOccurrenceCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(CancelCalendarOccurrenceCommand request, CancellationToken ct)
    {
        var e = await context.CalendarEvents.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (e is null) return Result<bool>.Failure("Événement introuvable.");
        var viewer = await CalendarAccess.ViewerAsync(context, user, ct);
        if (!viewer.CanEdit(e.Audience, e.UnitId)) return Result<bool>.Failure("Vous ne pouvez pas modifier cet événement.");
        if (e.Recurrence == CalendarRecurrences.None) return Result<bool>.Failure("Cet événement ne se répète pas : supprimez-le.");
        var dates = CalendarRecurrence.Exceptions(e.ExceptionDatesJson);
        if (request.Restore)
        {
            dates.Remove(request.Date);
            await CalendarSeries.RemoveCopiesAsync(context, e.Id, request.Date, ct); // the series date comes back instead
        }
        else dates.Add(request.Date);
        e.ExceptionDatesJson = CalendarRecurrence.SerializeExceptions(dates);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// « Modifier cette date seulement »: one occurrence of a repeating event gets its own details (time, place, title…).
// The series skips that date (exception) and a one-off event replaces it, linked back by SeriesEventId/SeriesDate.
// The copy never repeats; later it is edited / deleted like any single event.
public record EditCalendarOccurrenceCommand(Guid Id, DateOnly Date, CalendarEventInput Data) : IRequest<Result<Guid>>;

public class EditCalendarOccurrenceCommandValidator : AbstractValidator<EditCalendarOccurrenceCommand>
{
    public EditCalendarOccurrenceCommandValidator()
    {
        RuleFor(x => x.Data).NotNull().SetValidator(new CalendarEventInputValidator());
        RuleFor(x => x.Data.Recurrence).Equal(CalendarRecurrences.None).When(x => x.Data is not null)
            .WithMessage("Une date modifiée ne se répète pas.");
    }
}

public class EditCalendarOccurrenceCommandHandler(IApplicationDbContext context, ICurrentUserService user, IAuditService audit)
    : IRequestHandler<EditCalendarOccurrenceCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(EditCalendarOccurrenceCommand request, CancellationToken ct)
    {
        var series = await context.CalendarEvents.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (series is null) return Result<Guid>.Failure("Événement introuvable.");
        var viewer = await CalendarAccess.ViewerAsync(context, user, ct);
        if (!viewer.CanEdit(series.Audience, series.UnitId) || !viewer.CanEdit(request.Data.Audience, request.Data.UnitId))
            return Result<Guid>.Failure("Vous ne pouvez pas modifier cet événement.");
        if (series.Recurrence == CalendarRecurrences.None)
            return Result<Guid>.Failure("Cet événement ne se répète pas : modifiez-le directement.");
        // The date must be a real (not cancelled) occurrence of the series.
        if (!CalendarRecurrence.Occurrences(series, request.Date, request.Date).Contains(request.Date))
            return Result<Guid>.Failure("Cette date ne fait pas partie de l'événement.");

        var copy = new CalendarEvent { CreatedByMemberId = user.MemberId, SeriesEventId = series.Id, SeriesDate = request.Date };
        CalendarEventMapping.Apply(copy, request.Data);
        context.CalendarEvents.Add(copy);
        var dates = CalendarRecurrence.Exceptions(series.ExceptionDatesJson);
        dates.Add(request.Date);
        series.ExceptionDatesJson = CalendarRecurrence.SerializeExceptions(dates);
        await context.SaveChangesAsync(ct);
        await CalendarPublish.SyncAsync(context, copy, ct);
        await audit.LogAsync("Update", "CalendarEvent", series.Id,
            newValues: new { series.Title, Date = request.Date, ChangedTo = new { copy.Title, copy.StartDate, copy.StartTime, copy.Location } },
            cancellationToken: ct);
        return Result<Guid>.Success(copy.Id);
    }
}

internal static class CalendarSeries
{
    // Removes the one-date copies of a series (all of them, or only the one for `date`), with their public copies.
    // The caller saves.
    public static async Task RemoveCopiesAsync(IApplicationDbContext context, Guid seriesId, DateOnly? date, CancellationToken ct)
    {
        var copies = await context.CalendarEvents
            .Where(c => c.SeriesEventId == seriesId && (date == null || c.SeriesDate == date)).ToListAsync(ct);
        foreach (var c in copies)
        {
            c.PublishOnSite = false;
            await CalendarPublish.SyncAsync(context, c, ct);
            context.CalendarEvents.Remove(c);
        }
    }
}

// ===== Personal phone-calendar link =====
public record CalendarFeedLinkDto(string Token);

// Returns the member's token, creating it the first time; Reset = a new token (the old link stops working).
public record GetCalendarFeedLinkCommand(bool Reset = false) : IRequest<Result<CalendarFeedLinkDto>>;

public class GetCalendarFeedLinkCommandHandler(IApplicationDbContext context, ICurrentUserService user)
    : IRequestHandler<GetCalendarFeedLinkCommand, Result<CalendarFeedLinkDto>>
{
    public async ValueTask<Result<CalendarFeedLinkDto>> Handle(GetCalendarFeedLinkCommand request, CancellationToken ct)
    {
        if (user.MemberId is not Guid memberId) return Result<CalendarFeedLinkDto>.Failure("Aucune fiche membre liée à ce compte.");
        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == memberId, ct);
        if (member is null) return Result<CalendarFeedLinkDto>.Failure("Membre introuvable.");
        if (request.Reset || string.IsNullOrEmpty(member.CalendarFeedToken))
        {
            member.CalendarFeedToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
            await context.SaveChangesAsync(ct);
        }
        return Result<CalendarFeedLinkDto>.Success(new CalendarFeedLinkDto(member.CalendarFeedToken!));
    }
}

// The .ics file a phone calendar subscribes to (anonymous: the token is the authorization). Two months back, a
// year ahead. Null when the token is unknown.
public record GetCalendarIcsQuery(string Token) : IRequest<string?>;

public class GetCalendarIcsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetCalendarIcsQuery, string?>
{
    public async ValueTask<string?> Handle(GetCalendarIcsQuery request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Token) || request.Token.Length > 64) return null;
        var member = await context.Members.Where(m => m.CalendarFeedToken == request.Token)
            .Select(m => new { m.Id, SuperAdmin = m.User != null && m.User.IsActive && m.User.IsSuperAdmin, Active = m.User == null || m.User.IsActive })
            .FirstOrDefaultAsync(ct);
        if (member is null || !member.Active) return null;
        var viewer = await CalendarViewer.LoadAsync(context, member.Id, member.SuperAdmin, null, ct);
        var today = LebanonClock.Today;
        var items = await CalendarFeed.LoadAsync(context, viewer, today.AddMonths(-2), today.AddYears(1), null, ct);
        return CalendarIcs.Build(items);
    }
}

// ===== Time of an important date =====
// The CG team gives an important date (Passage, Première réunion, deadlines…) a start / end time, from the calendar.
// The date itself stays in Paramètres. Empty start = all day (the end time is dropped).
public record SetImportantDateTimeCommand(string Key, TimeOnly? StartTime, TimeOnly? EndTime) : IRequest<Result<bool>>;

public class SetImportantDateTimeCommandValidator : AbstractValidator<SetImportantDateTimeCommand>
{
    public SetImportantDateTimeCommandValidator()
    {
        RuleFor(x => x.Key).NotEmpty().MaximumLength(100).Must(CalendarFeed.IsImportantDate).WithMessage("Date inconnue.");
        RuleFor(x => x).Must(x => x.StartTime is null || x.EndTime is null || x.EndTime > x.StartTime)
            .WithMessage("L'heure de fin doit être après l'heure de début.");
    }
}

public class SetImportantDateTimeCommandHandler(IApplicationDbContext context, ICurrentUserService user, IAuditService audit)
    : IRequestHandler<SetImportantDateTimeCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetImportantDateTimeCommand request, CancellationToken ct)
    {
        var viewer = await CalendarAccess.ViewerAsync(context, user, ct);
        if (!viewer.IsManager) return Result<bool>.Failure("Seule l'équipe du Chef de Groupe peut modifier l'heure de cette date.");

        var setting = await context.Settings.FirstOrDefaultAsync(s => s.Key == CalendarFeed.TimesKey, ct);
        if (setting is null)
        {
            setting = new Setting
            {
                Key = CalendarFeed.TimesKey, Value = "{}", Category = "passage", ValueType = "json",
                Label = "Heures des dates importantes", Description = "Heures des dates importantes affichées dans le calendrier (modifiées depuis le calendrier).",
            };
            context.Settings.Add(setting);
        }
        var times = CalendarFeed.ParseTimes(setting.Value);
        if (request.StartTime is TimeOnly start)
            times[request.Key] = new CalendarFeed.DateTimes(start.ToString("HH:mm"), request.EndTime?.ToString("HH:mm"));
        else
            times.Remove(request.Key);
        setting.Value = System.Text.Json.JsonSerializer.Serialize(times, CalendarFeed.JsonOpts);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Update", "Setting", null, newValues: new { Date = request.Key, request.StartTime, request.EndTime }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
