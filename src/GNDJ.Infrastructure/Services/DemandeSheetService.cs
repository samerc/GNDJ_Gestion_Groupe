using ClosedXML.Excel;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Infrastructure.Services;

// ClosedXML implementation of the demande decision sheet (see IDemandeSheetService). The export writes a
// "Demandes" sheet (one row per demande, a Décision dropdown, a locked-by-convention Réf. key column) plus a
// "Unités" reference sheet listing the valid unit names to copy into the Unité column. Parse reads columns by
// HEADER NAME so a CG inserting/reordering columns doesn't break the import.
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
    private const string H_Decision = "Décision";
    private const string H_Unit = "Unité";
    private const string H_Reason = "Motif (si refusé)";

    private static readonly string[] Headers =
    {
        H_Ref, H_First, H_Last, H_Dob, H_Gender, H_Classe, H_School, H_Parents, H_Siblings, H_Relations,
        H_Status, H_Decision, H_Unit, H_Reason,
    };

    public byte[] Export(string title, IReadOnlyList<DemandeExportRow> rows, IReadOnlyList<string> unitNames)
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
            ws.Cell(r, 13).Value = row.CurrentUnit ?? ""; // pre-fill the unit for an already-staged approval
            r++;
        }
        var lastRow = Math.Max(2, r - 1);

        // Décision dropdown (Accepté / Refusé) on the data range.
        if (r > 2)
        {
            var dv = ws.Range(2, 12, lastRow, 12).CreateDataValidation();
            dv.List("\"Accepté,Refusé\"", true);
            dv.IgnoreBlanks = true;
        }

        // Grey the Réf. key column so the CG treats it as read-only.
        ws.Range(2, 1, lastRow, 1).Style.Font.FontColor = XLColor.Gray;
        ws.Columns().AdjustToContents();
        ws.Column(1).Width = 20;

        // Reference sheet: the exact unit names to copy into the Unité column.
        var refWs = wb.Worksheets.Add("Unités");
        refWs.Cell(1, 1).Value = "Unités (copier le nom exact dans la colonne Unité)";
        refWs.Cell(1, 1).Style.Font.Bold = true;
        var rr = 2;
        foreach (var u in unitNames) refWs.Cell(rr++, 1).Value = u;
        refWs.Columns().AdjustToContents();

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
        int refC = Col(H_Ref), decC = Col(H_Decision), unitC = Col(H_Unit), reasonC = Col(H_Reason);

        var list = new List<DemandeDecisionRow>();
        for (var rr = 2; rr <= lastRow; rr++)
        {
            var idStr = refC > 0 ? ws.Cell(rr, refC).GetString().Trim() : "";
            var dec = decC > 0 ? ws.Cell(rr, decC).GetString().Trim() : "";
            var unit = unitC > 0 ? ws.Cell(rr, unitC).GetString().Trim() : "";
            var reason = reasonC > 0 ? ws.Cell(rr, reasonC).GetString().Trim() : "";

            // Skip completely empty rows.
            if (string.IsNullOrEmpty(idStr) && string.IsNullOrEmpty(dec) && string.IsNullOrEmpty(unit) && string.IsNullOrEmpty(reason))
                continue;

            Guid? id = Guid.TryParse(idStr, out var g) ? g : null;
            list.Add(new DemandeDecisionRow(rr, id,
                string.IsNullOrWhiteSpace(dec) ? null : dec,
                string.IsNullOrWhiteSpace(unit) ? null : unit,
                string.IsNullOrWhiteSpace(reason) ? null : reason));
        }
        return list;
    }
}
