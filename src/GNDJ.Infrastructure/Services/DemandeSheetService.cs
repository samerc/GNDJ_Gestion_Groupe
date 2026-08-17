using ClosedXML.Excel;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Infrastructure.Services;

// ClosedXML implementation of the demande decision sheet (see IDemandeSheetService). The export writes a
// "Demandes" sheet (one row per demande with a SINGLE "Décision" column) plus a "Codes" reference sheet listing
// every valid code (unit codes to accept, reason codes / "--" to decline) which also drives an in-cell dropdown
// on the Décision column. Parse reads columns by HEADER NAME so a CG inserting/reordering columns doesn't break
// the import.
public class DemandeSheetService : IDemandeSheetService
{
    // Header labels — the same strings drive the export layout and the import column lookup.
    private const string H_Ref = "Réf. (ne pas modifier)";
    private const string H_First = "Prénom";
    private const string H_Last = "Nom";
    private const string H_Dob = "Naissance";
    private const string H_Gender = "Genre";
    private const string H_Classe = "Classe";
    private const string H_School = "École";
    private const string H_Parents = "Parents";
    private const string H_Siblings = "Fratrie";
    private const string H_Relations = "Proches scouts";
    private const string H_Status = "Statut actuel";
    private const string H_Decision = "Décision (code unité ou motif)";

    private static readonly string[] Headers =
    {
        H_Ref, H_First, H_Last, H_Dob, H_Gender, H_Classe, H_School, H_Parents, H_Siblings, H_Relations,
        H_Status, H_Decision,
    };
    private const int DecisionCol = 12; // 1-based index of H_Decision in Headers

    public byte[] Export(string title, IReadOnlyList<DemandeExportRow> rows,
        IReadOnlyList<(string Code, string Name)> units,
        IReadOnlyList<(string Code, string Label)> reasons,
        string? defaultReasonLabel)
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Demandes");

        // Header
        for (var c = 0; c < Headers.Length; c++)
            ws.Cell(1, c + 1).Value = Headers[c];
        var headerRange = ws.Range(1, 1, 1, Headers.Length);
        headerRange.Style.Font.Bold = true;
        headerRange.Style.Fill.BackgroundColor = XLColor.LightGray;
        ws.SheetView.FreezeRows(1);

        // Data
        var r = 2;
        foreach (var row in rows)
        {
            ws.Cell(r, 1).Value = row.Id.ToString();
            ws.Cell(r, 2).Value = row.FirstName;
            ws.Cell(r, 3).Value = row.LastName;
            ws.Cell(r, 4).Value = row.DateOfBirth ?? "";
            ws.Cell(r, 5).Value = row.Gender ?? "";
            ws.Cell(r, 6).Value = row.Classe ?? "";
            ws.Cell(r, 7).Value = row.School ?? "";
            ws.Cell(r, 8).Value = row.Parents;
            ws.Cell(r, 9).Value = row.Siblings;
            ws.Cell(r, 10).Value = row.ScoutRelations;
            ws.Cell(r, 11).Value = row.CurrentStatus;
            ws.Cell(r, DecisionCol).Value = row.PrefillDecision; // unit code (accepté) / reason code or "--" (refusé)
            r++;
        }
        var lastRow = Math.Max(2, r - 1);

        // Reference sheet: every valid code + its meaning. Also serves as the dropdown source for the Décision
        // column so the CG picks a code instead of typing it.
        var refWs = wb.Worksheets.Add("Codes");
        refWs.Cell(1, 1).Value = "Code";
        refWs.Cell(1, 2).Value = "Signification";
        refWs.Range(1, 1, 1, 2).Style.Font.Bold = true;
        var cr = 2;
        // Units first (accept into this unit)
        foreach (var (code, name) in units)
        {
            refWs.Cell(cr, 1).Value = code;
            refWs.Cell(cr, 2).Value = $"Accepter → {name}";
            cr++;
        }
        // Default reason shorthand
        if (!string.IsNullOrWhiteSpace(defaultReasonLabel))
        {
            refWs.Cell(cr, 1).Value = "--";
            refWs.Cell(cr, 2).Value = $"Refuser → {defaultReasonLabel} (par défaut)";
            cr++;
        }
        // Named rejection reasons
        foreach (var (code, label) in reasons)
        {
            refWs.Cell(cr, 1).Value = code;
            refWs.Cell(cr, 2).Value = $"Refuser → {label}";
            cr++;
        }
        var lastCodeRow = Math.Max(2, cr - 1);
        refWs.Columns().AdjustToContents();

        // In-cell dropdown on the Décision column, sourced from the Codes sheet code column.
        if (r > 2 && lastCodeRow >= 2)
        {
            var codesRange = refWs.Range(2, 1, lastCodeRow, 1);
            var dv = ws.Range(2, DecisionCol, lastRow, DecisionCol).CreateDataValidation();
            dv.List(codesRange, true);
            dv.IgnoreBlanks = true;
        }

        // Grey the Réf. key column so the CG treats it as read-only.
        ws.Range(2, 1, lastRow, 1).Style.Font.FontColor = XLColor.Gray;
        ws.Columns().AdjustToContents();
        ws.Column(1).Width = 20;
        ws.Column(DecisionCol).Width = 18;

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    public IReadOnlyList<DemandeDecisionRow> Parse(byte[] file)
    {
        using var ms = new MemoryStream(file);
        using var wb = new XLWorkbook(ms);
        var ws = wb.Worksheets.FirstOrDefault(w => w.Name == "Demandes") ?? wb.Worksheet(1);

        var lastRowUsed = ws.LastRowUsed();
        if (lastRowUsed is null) return [];
        var lastRow = lastRowUsed.RowNumber();

        // Map header text → column index (from row 1), so the import isn't tied to fixed positions.
        var cols = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var lastCol = ws.Row(1).LastCellUsed()?.Address.ColumnNumber ?? Headers.Length;
        for (var c = 1; c <= lastCol; c++)
        {
            var h = ws.Cell(1, c).GetString().Trim();
            if (!string.IsNullOrEmpty(h) && !cols.ContainsKey(h)) cols[h] = c;
        }
        int Col(string header) => cols.TryGetValue(header, out var c) ? c : 0;
        int refC = Col(H_Ref), decC = Col(H_Decision);

        var list = new List<DemandeDecisionRow>();
        for (var rr = 2; rr <= lastRow; rr++)
        {
            var idStr = refC > 0 ? ws.Cell(rr, refC).GetString().Trim() : "";
            var dec = decC > 0 ? ws.Cell(rr, decC).GetString().Trim() : "";

            // Skip completely empty rows.
            if (string.IsNullOrEmpty(idStr) && string.IsNullOrEmpty(dec)) continue;

            Guid? id = Guid.TryParse(idStr, out var g) ? g : null;
            list.Add(new DemandeDecisionRow(rr, id, string.IsNullOrWhiteSpace(dec) ? null : dec));
        }
        return list;
    }
}
