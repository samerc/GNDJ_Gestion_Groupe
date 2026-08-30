using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A "réunion" — a unit meeting, outing or camp — against which member attendance is recorded. Scope is either
// the whole unit (TeamId null) or one team within it. A camp spans a date range (EndDate). Created by a CU
// (Approved immediately) or by a chef d'équipe for their own team (Pending until the CU approves it).
public class Meeting : BaseEntity
{
    public Guid UnitId { get; set; }
    public Guid? TeamId { get; set; }               // null = the whole unit; else a specific team
    // Reusable rule-based member group (roster computed live, not a real team) — e.g. Grande Maîtrise, Chefs
    // d'unité, "Haute Patrouille". Null = a normal unit/team réunion. When set, UnitId anchors the réunion
    // (the group's own unit for a Unit-scoped group, else the Groupe unit). See MemberGroup / MemberGroupResolver.
    public Guid? MemberGroupId { get; set; }
    public MemberGroup? MemberGroup { get; set; }

    public string Type { get; set; } = MeetingTypes.Reunion; // Reunion | Sortie | Camp
    public string? Title { get; set; }
    public DateOnly Date { get; set; }              // start date (single-day for Reunion/Sortie)
    public DateOnly? EndDate { get; set; }          // camps span dates; null otherwise

    public string Status { get; set; } = MeetingStatuses.Approved; // Approved | Pending (chef-équipe-created awaits CU)
    public Guid CreatedByMemberId { get; set; }
    public string? Notes { get; set; }

    public Unit Unit { get; set; } = null!;
    public Team? Team { get; set; }
    public ICollection<MeetingAbsence> Absences { get; set; } = [];
}

// One ABSENT member for a réunion (present is the default → no row). Optional reason.
public class MeetingAbsence : BaseEntity
{
    public Guid MeetingId { get; set; }
    public Guid MemberId { get; set; }
    public string? Reason { get; set; }

    public Meeting Meeting { get; set; } = null!;
    public Member Member { get; set; } = null!;
}

// String-enum allowed sets (the app stores enums as strings).
public static class MeetingTypes
{
    public const string Reunion = "Reunion";
    public const string Sortie = "Sortie";
    public const string Camp = "Camp";
    public static readonly string[] All = { Reunion, Sortie, Camp };
}

public static class MeetingStatuses
{
    public const string Approved = "Approved"; // CU-created, or a chef-équipe réunion the CU approved
    public const string Pending = "Pending";   // chef-équipe-created, awaiting CU approval
    public static readonly string[] All = { Approved, Pending };
}
