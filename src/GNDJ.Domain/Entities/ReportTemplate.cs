using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class ReportTemplate : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string ReportType { get; set; } = "roster"; // roster, export
    public string Format { get; set; } = "pdf"; // pdf, xlsx, csv
    public string ColumnsJson { get; set; } = "[]"; // JSON array of column keys
    public bool IsActive { get; set; } = true;
    public int DisplayOrder { get; set; }
}
