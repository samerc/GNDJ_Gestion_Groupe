using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// Master definition of a scout-year-startup ("rentrée") task. The template is edited by super-admin
// and Chef de Groupe; a per-year checklist (RentreeTask) is generated from it.
public class RentreeTaskTemplate : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Phase { get; set; } = string.Empty;     // grouping, e.g. "Configuration", "Passage"
    public int DisplayOrder { get; set; }

    // Assignee: a role (security-profile code) or explicit members.
    public string AssigneeType { get; set; } = "role";    // "role" | "members"
    public string? AssigneeRole { get; set; }             // profile code, e.g. "chef-unite", "chef-de-groupe"
    public bool FanOutPerUnit { get; set; }               // role tasks: one instance per active unit
    public Guid[] AssigneeMemberIds { get; set; } = [];   // when AssigneeType == "members"

    public string? DefaultDeadlineLabel { get; set; }     // fuzzy deadline, e.g. "1ère sem. octobre"

    // Optional built-in action attached to the task (from a fixed catalog): "do" actions run an
    // operation from the checklist (e.g. "open-demandes" opens the inscriptions), "goto-*" actions are
    // a one-click shortcut to the relevant page. Chosen in the template editor; copied to each RentreeTask.
    public string? ActionKey { get; set; }

    public Guid[] DependsOnTemplateIds { get; set; } = []; // prerequisite templates
}
