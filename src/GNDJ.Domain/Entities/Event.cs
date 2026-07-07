using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A public calendar event (camp, réunion, sortie, rentrée…). Mirrors NewsPost's shape (slug + rich body +
// cover + branch/unit tag) but adds scheduling: a required StartDate, an optional EndDate (multi-day camps)
// and an optional free-text TimeLabel ("14h00", "9h–17h", "toute la journée") + Location. Dates are stored
// as DateOnly to sidestep timezone handling — a scout agenda cares about the day, not the instant.
public class Event : BaseEntity
{
    public string Title { get; set; } = "";
    public string Slug { get; set; } = "";
    public string? Summary { get; set; }          // auto-derived excerpt of the body
    public string BodyHtml { get; set; } = "";     // TipTap HTML
    public string? CoverImagePath { get; set; }    // URL from the content-images upload endpoint

    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public string? TimeLabel { get; set; }         // free-text time ("14h00", "toute la journée")
    public string? Location { get; set; }

    public bool IsPublished { get; set; }
    public DateTime? PublishedAt { get; set; }

    // Branch/unit tag — same model as NewsPost (Group | UnitType | Unit).
    public string TagType { get; set; } = EventTagTypes.Group;
    public Guid? TagUnitTypeId { get; set; }
    public Guid? TagUnitId { get; set; }
}

public static class EventTagTypes
{
    public const string Group = "Group";
    public const string UnitType = "UnitType";
    public const string Unit = "Unit";
    public static readonly string[] All = [Group, UnitType, Unit];
}
