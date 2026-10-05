using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// An event on the group calendar (« Calendrier »). Who sees it is its Audience:
//   Group    — every member;              Branch — members of every unit of UnitTypeId;
//   Unit     — members of UnitId;          Maitrise — every member holding an active maîtrise role;
//   CgTeam   — the Chef de Groupe team (active group-level roles).
// The Chef de Groupe team creates Group / Branch / Maitrise / CgTeam events; a chef d'unité creates Unit events for
// their own unit only. Réunions/sorties/camps (Meeting) and the year's important dates (settings) are NOT stored here:
// the calendar reads them live and shows them next to these events.
//
// Dates are DateOnly (Lebanon calendar, no time zone); times are optional (both null = all day). A repeating event
// keeps ONE row: Recurrence + RecurrenceInterval + optional RecurrenceUntil, expanded into occurrences when read;
// ExceptionDatesJson lists cancelled occurrence dates ("yyyy-MM-dd").
public class CalendarEvent : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }      // plain text
    public string? Location { get; set; }

    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }         // multi-day event (inclusive); null = one day
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }

    public string Audience { get; set; } = CalendarAudiences.Group;
    public Guid? UnitTypeId { get; set; }          // Branch audience
    public Guid? UnitId { get; set; }              // Unit audience

    public string Recurrence { get; set; } = CalendarRecurrences.None;
    public int RecurrenceInterval { get; set; } = 1;   // every N weeks / months
    public DateOnly? RecurrenceUntil { get; set; }      // last possible occurrence date; null = no end
    public string? ExceptionDatesJson { get; set; }     // ["2026-11-14", …] cancelled occurrences

    // Reminder: minutes before the start (start time, or 08:00 for an all-day event) at which the audience gets a
    // notification (bell + push). Null = no reminder.
    public int? ReminderMinutes { get; set; }

    // « Publier aussi sur le site »: a linked public agenda Event kept in sync (Group / Branch / Unit, not repeating).
    public bool PublishOnSite { get; set; }
    public Guid? PublicEventId { get; set; }

    public Guid? CreatedByMemberId { get; set; }

    public UnitType? UnitType { get; set; }
    public Unit? Unit { get; set; }
}

// One reminder already sent for one occurrence (so the reminder job never sends it twice).
public class CalendarReminderSent
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid CalendarEventId { get; set; }
    public DateOnly OccurrenceDate { get; set; }
    public DateTime SentAt { get; set; }
}

public static class CalendarAudiences
{
    public const string Group = "Group";
    public const string Branch = "Branch";
    public const string Unit = "Unit";
    public const string Maitrise = "Maitrise";
    public const string CgTeam = "CgTeam";
    public static readonly string[] All = [Group, Branch, Unit, Maitrise, CgTeam];
}

public static class CalendarRecurrences
{
    public const string None = "None";
    public const string Weekly = "Weekly";
    public const string Monthly = "Monthly";
    public static readonly string[] All = [None, Weekly, Monthly];
}
