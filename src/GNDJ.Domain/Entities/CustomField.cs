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

    public ICollection<MemberCustomFieldValue> Values { get; set; } = [];
}
