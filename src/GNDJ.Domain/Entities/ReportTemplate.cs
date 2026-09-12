using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A reusable saved report definition (which columns/format/scope) the CG creates and generates — e.g. a
// roster or export preset. ColumnsJson is the ORDERED list of column keys to include (report column order).
public class ReportTemplate : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string ReportType { get; set; } = "roster"; // roster, export
    public string Format { get; set; } = "pdf"; // pdf (roster), excel | csv (export)
    public string ColumnsJson { get; set; } = "[]"; // ordered JSON array of column keys
    public bool IsActive { get; set; } = true;
    public int DisplayOrder { get; set; }

    // TARGETING — who the report covers. ScopeType drives which units are included at generation time:
    //   unit   → the generator picks ONE unit (CU-facing; also the only scope a non-manager may run)
    //   units  → a fixed set of units chosen on the template (ScopeUnitIdsJson)
    //   branch → every active unit of one unit type (ScopeUnitTypeId)
    //   group  → every active unit in the whole group
    // group/branch/units are group-manager tools; a multi-unit report is grouped by unit then team.
    public string ScopeType { get; set; } = "unit"; // unit | units | branch | group
    public Guid? ScopeUnitTypeId { get; set; }      // branch scope: the targeted unit type
    public string ScopeUnitIdsJson { get; set; } = "[]"; // units scope: JSON array of unit ids

    // Extra customization.
    public string? TitleOverride { get; set; }       // custom report title (else the unit/template name)
    public string MemberFilter { get; set; } = "all"; // all | youth (non-maîtrise) | maitrise
}
