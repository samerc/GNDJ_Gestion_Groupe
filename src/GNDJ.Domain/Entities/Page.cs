using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A static editable content page (Le Groupe / À propos / méthode…), managed via the admin CMS.
public class Page : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string BodyHtml { get; set; } = string.Empty;
    public bool IsPublished { get; set; }
    public bool ShowInMenu { get; set; } = true; // top-level: appears in the public nav. Sub-pages always show under their parent.
    public int DisplayOrder { get; set; }
    public Guid? ParentId { get; set; } // null = top-level page; otherwise a sub-page

    public Page? Parent { get; set; }
    public ICollection<Page> Children { get; set; } = [];
}
