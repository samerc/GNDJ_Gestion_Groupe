using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// An admin-defined extra member field (Infos complémentaires). Values are stored per member in
// MemberCustomFieldValue; ShowOnCard surfaces it on the printed member card.
public class CustomField : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string FieldType { get; set; } = "text"; // text, number, select, boolean
    public string? Options { get; set; } // JSON array for select type: ["S","M","L","XL"]
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool ShowOnCard { get; set; } // include this field on the printed member card
    // Who may FILL/edit this field's value: "Member" (the youth themselves, + leaders), "UnitLeader"
    // (chef d'unité + chef de groupe), or "GroupLeader" (chef de groupe only). Reading is unaffected.
    // Default UnitLeader preserves the previous behaviour (only members.edit leaders could set values).
    public string EditableBy { get; set; } = "UnitLeader";

    // ── Targeting: which members the field APPEARS for (applicability), and who may VIEW its value ──
    // Applies only to members matching BOTH the role filter AND the scope filter (both default "all" =
    // every member, the previous behaviour). See CustomFieldTargeting for the allowed values.
    public string AppliesToRole { get; set; } = "all";      // all | maitrise | youth
    public string AppliesToScope { get; set; } = "all";     // all | unitType | unit
    public Guid? AppliesToUnitTypeId { get; set; }          // set when AppliesToScope == "unitType" (branche)
    public Guid? AppliesToUnitId { get; set; }              // set when AppliesToScope == "unit"
    // Who may SEE the value: "all" (everyone incl. the member), "leaders" (unit leaders + group leaders,
    // hidden from the member), "groupLeaders" (chef de groupe only). Default "all" = the previous behaviour.
    public string VisibleTo { get; set; } = "all";

    public ICollection<MemberCustomFieldValue> Values { get; set; } = [];
}
