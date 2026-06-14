using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A public news article (Actualités), authored by chefs via the admin CMS.
public class NewsPost : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Summary { get; set; }
    public string BodyHtml { get; set; } = string.Empty;
    public string? CoverImagePath { get; set; }
    public bool IsPublished { get; set; }
    public DateTime? PublishedAt { get; set; }

    // Tag: who the article is about. Visible to everyone regardless — just a label/filter.
    public string TagType { get; set; } = NewsTagTypes.Group; // Group | UnitType | Unit
    public Guid? TagUnitTypeId { get; set; }
    public Guid? TagUnitId { get; set; }
}

public static class NewsTagTypes
{
    public const string Group = "Group";
    public const string UnitType = "UnitType";
    public const string Unit = "Unit";
    public static readonly string[] All = { Group, UnitType, Unit };
}
