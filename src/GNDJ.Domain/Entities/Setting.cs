namespace GNDJ.Domain.Entities;

// Key-value configuration row (PK = Key). Value is stored as text and parsed per ValueType; some keys hold
// JSON (e.g. member.cities, site.content). Grouped by Category for the admin settings UI.
public class Setting
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string ValueType { get; set; } = "string"; // string, json_array, number, boolean
}
