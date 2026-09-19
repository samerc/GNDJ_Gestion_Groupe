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
    // Header labels — the same strings drive the export layout and the import column lookup. Only H_Ref (the
    // matching key) and H_Decision (what the CG fills) are READ back on import; every other column is purely
    // informational (the full file, for reviewing in Excel) and is ignored by the parser.
    private const string H_Ref = "Réf. (ne pas modifier)";
    private const string H_Serial = "N°";
    private const string H_Decision = "Décision (code unité ou motif)";
    private const string H_Status = "Statut actuel";
    private const string H_First = "Prénom";
    private const string H_Last = "Nom";
    private const string H_Dob = "Naissance";
    private const string H_Age = "Âge";
    private const string H_Gender = "Genre";
    private const string H_Nationality = "Nationalité";
    private const string H_Classe = "Classe";
    private const string H_Section = "Section";
    private const string H_School = "École";
    private const string H_Blood = "Groupe sanguin";
    private const string H_Allergies = "Allergies";
    private const string H_Medical = "Notes médicales";
    private const string H_Phone = "Téléphone";
    private const string H_Email = "Email";
    private const string H_AddrCountry = "Adresse — pays";
    private const string H_AddrCity = "Adresse — ville";
    private const string H_AddrDetails = "Adresse — détails";
    private const string H_Situation = "Situation des parents";
    private const string H_Parents = "Parents / tuteurs";
    private const string H_Relations = "Proches scouts";
    private const string H_Siblings = "Fratrie (mêmes parents)";
    private const string H_Previous = "Demande précédente";
    private const string H_Notes = "Notes des parents";
    private const string H_Submitted = "Soumise le";

    private static readonly string[] Headers =
    {
        H_Ref, H_Serial, H_Decision, H_Status, H_First, H_Last, H_Dob, H_Age, H_Gender, H_Nationality,
        H_Classe, H_Section, H_School, H_Blood, H_Allergies, H_Medical, H_Phone, H_Email,
        H_AddrCountry, H_AddrCity, H_AddrDetails, H_Situation, H_Parents, H_Relations, H_Siblings,
        H_Previous, H_Notes, H_Submitted,
    };
    private const int DecisionCol = 3;   // 1-based index of H_Decision in Headers (kept near the left so it's easy to fill)
    private const int RefCol = 1;        // 1-based index of H_Ref
    // Columns holding pre-formatted multi-line text — rendered with wrap so the CG sees every line.
    private static readonly int[] WrapCols = { 15, 16, 23, 24, 25, 27 }; // Allergies, Notes médicales, Parents, Proches, Fratrie, Notes

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

        // Highlight the Décision header so the CG immediately sees the one column to fill.
        ws.Cell(1, DecisionCol).Style.Fill.BackgroundColor = XLColor.LightYellow;

        // Data — one row per demande with the FULL file; the CG only fills the Décision cell.
        var r = 2;
        foreach (var row in rows)
        {
            var c = 1;
            ws.Cell(r, c++).Value = row.Id.ToString();          // Réf.
            ws.Cell(r, c++).Value = row.SerialNumber;           // N°
            ws.Cell(r, c++).Value = row.PrefillDecision;        // Décision — unit code (accepté) / reason code or "--" (refusé)
            ws.Cell(r, c++).Value = row.CurrentStatus;          // Statut actuel
            ws.Cell(r, c++).Value = row.FirstName;
            ws.Cell(r, c++).Value = row.LastName;
            ws.Cell(r, c++).Value = row.DateOfBirth ?? "";
            if (row.Age.HasValue) ws.Cell(r, c).Value = row.Age.Value; c++;
            ws.Cell(r, c++).Value = row.Gender ?? "";
            ws.Cell(r, c++).Value = row.Nationality ?? "";
            ws.Cell(r, c++).Value = row.Classe ?? "";
            ws.Cell(r, c++).Value = row.Section ?? "";
            ws.Cell(r, c++).Value = row.School ?? "";
            ws.Cell(r, c++).Value = row.BloodType ?? "";
            ws.Cell(r, c++).Value = row.Allergies ?? "";
            ws.Cell(r, c++).Value = row.MedicalNotes ?? "";
            ws.Cell(r, c++).Value = row.Phone ?? "";
            ws.Cell(r, c++).Value = row.Email ?? "";
            ws.Cell(r, c++).Value = row.AddressCountry ?? "";
            ws.Cell(r, c++).Value = row.AddressCity ?? "";
            ws.Cell(r, c++).Value = row.AddressDetails ?? "";
            ws.Cell(r, c++).Value = row.ParentsSituation ?? "";
            ws.Cell(r, c++).Value = row.Parents;                // multi-line
            ws.Cell(r, c++).Value = row.ScoutRelations;         // multi-line
            ws.Cell(r, c++).Value = row.Siblings;               // multi-line
            ws.Cell(r, c++).Value = row.PreviousDemande ?? "";
            ws.Cell(r, c++).Value = row.ParentNotes ?? "";
            ws.Cell(r, c++).Value = row.SubmittedAt ?? "";
            r++;
        }
        var lastRow = Math.Max(2, r - 1);

        // Multi-line text columns: top-aligned + wrapped so every line shows.
        if (r > 2)
            foreach (var wc in WrapCols)
            {
                var cells = ws.Range(2, wc, lastRow, wc).Style;
                cells.Alignment.WrapText = true;
                cells.Alignment.Vertical = XLAlignmentVerticalValues.Top;
            }

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
        ws.Range(2, RefCol, lastRow, RefCol).Style.Font.FontColor = XLColor.Gray;
        ws.Columns().AdjustToContents();
        ws.Column(RefCol).Width = 20;
        ws.Column(DecisionCol).Width = 18;
        // Fixed widths for the wide multi-line columns (AdjustToContents would blow them out); wrap does the rest.
        foreach (var wc in WrapCols) ws.Column(wc).Width = 34;

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

        // The import matches rows by the Réf. (id) column and reads the Décision column — nothing else. Inserting,
        // reordering, editing or deleting ANY other column is harmless (they're ignored). But if one of these two
        // required columns is gone (header renamed/deleted), fail loudly rather than silently importing nothing.
        if (refC == 0)
            throw new DemandeSheetFormatException("Colonne « Réf. (ne pas modifier) » introuvable. Réimportez le fichier exporté sans renommer ni supprimer cette colonne.");
        if (decC == 0)
            throw new DemandeSheetFormatException("Colonne « Décision (code unité ou motif) » introuvable. Réimportez le fichier exporté sans renommer ni supprimer cette colonne.");

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
