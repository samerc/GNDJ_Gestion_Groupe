using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class CustomField : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string FieldType { get; set; } = "text"; // text, number, select, boolean
    public string? Options { get; set; } // JSON array for select type: ["S","M","L","XL"]
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool ShowOnCard { get; set; }

    public ICollection<MemberCustomFieldValue> Values { get; set; } = [];
}
