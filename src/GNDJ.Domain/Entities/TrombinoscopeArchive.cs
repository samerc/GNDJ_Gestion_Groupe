using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A frozen trombinoscope (photo grid) PDF saved for one (unit, scout year). The CU generates it once —
// typically after the annual photo session — and saves it here; from then on the CU re-download and every
// member's view serve THIS stored file. That freezes the photos + roster of that year: replacing a member's
// current photo never rewrites a past trombinoscope, and the PDF isn't regenerated on every view.
// One live row per (UnitId, ScoutYear); re-saving overwrites the bytes in place.
public class TrombinoscopeArchive : BaseEntity
{
    public Guid UnitId { get; set; }
    public Unit Unit { get; set; } = null!;

    public string ScoutYear { get; set; } = string.Empty; // e.g. "2025-2026"
    public string FileName { get; set; } = string.Empty;  // friendly download name captured at save time
    public byte[] PdfData { get; set; } = [];             // the frozen PDF bytes (bytea)
    public int MemberCount { get; set; }                  // roster size at save time (shown in the CU status)
}
