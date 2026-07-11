using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A concrete scout-year-startup task instance (generated from a template for a given scout year).
// Per-unit role templates fan out into one task per unit. Assignees are resolved to concrete members
// at generation so "Mes tâches" is a simple membership check.
public class RentreeTask : BaseEntity
{
    public string ScoutYear { get; set; } = string.Empty;
    public Guid? TemplateId { get; set; }

    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Phase { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }

    public string AssigneeType { get; set; } = "role";   // "role" | "members"
    public string? AssigneeRole { get; set; }            // profile code (for display/regeneration)
    public Guid? UnitId { get; set; }                    // set when fanned out per unit
    public Guid[] AssigneeMemberIds { get; set; } = [];  // resolved assignees

    public string? DeadlineLabel { get; set; }           // fuzzy deadline text
    public DateOnly? DueDate { get; set; }               // fixed deadline (drives the overdue login popup)

    public string? ActionKey { get; set; }               // built-in action from the catalog (copied from the template)

    public string Status { get; set; } = "pending";      // "pending" | "done"
    public Guid? CompletedByUserId { get; set; }
    public string? CompletedByName { get; set; }
    public DateTime? CompletedAt { get; set; }

    public Guid[] DependsOnTaskIds { get; set; } = [];   // prerequisite tasks (must be done first)

    public Unit? Unit { get; set; }
}
