using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A heritage / knowledge-base entry for the public "Ressources" library (chant, technique, nœud, badge,
// biographie, document…). Mirrors NewsPost's shape (slug + rich body + cover + attachments JSON) but is
// organised by Category instead of a unit tag, and carries free-text Tags for search/filtering. Content
// is hand-curated by the chefs via the admin CMS (no automated import).
public class Resource : BaseEntity
{
    public string Title { get; set; } = "";
    public string Slug { get; set; } = "";
    public string? Summary { get; set; }          // auto-derived excerpt of the body
    public string BodyHtml { get; set; } = "";     // TipTap HTML (lyrics, steps, biography…)
    public string? CoverImagePath { get; set; }    // URL from the content-images upload endpoint

    public string Category { get; set; } = ResourceCategories.Document;
    public string? Tags { get; set; }              // comma-separated free-text tags (searchable, shown as chips)
    public string? AttachmentsJson { get; set; }   // JSON array [{name,url}] — mp3 / PDF / images (no child table)

    public bool IsPublished { get; set; }
    public DateTime? PublishedAt { get; set; }
}

public static class ResourceCategories
{
    public const string Chant = "Chant";
    public const string Technique = "Technique";
    public const string Noeud = "Noeud";
    public const string Badge = "Badge";
    public const string Biographie = "Biographie";
    public const string Document = "Document";
    public static readonly string[] All = [Chant, Technique, Noeud, Badge, Biographie, Document];
}
