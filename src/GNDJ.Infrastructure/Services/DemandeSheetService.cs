using ClosedXML.Excel;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Infrastructure.Services;

// ClosedXML implementation of the demande decision workbook (see IDemandeSheetService). Everything "live" is plain
// Excel formulas (INDEX/MATCH/COUNTIFS — no macros, no dynamic arrays) so it works in any Excel, LibreOffice or
// Google Sheets:
//  • "Demandes" — every demande, boys then girls (a title row per block), the key columns first, a "Réponse"
//    dropdown (unit codes, then refusal codes). Two helper columns at the end: "État" (Accepté/Refusé/À décider)
//    and a hidden "Clé" ("M2#3" = the 3rd child given M2) that the unit sheets look up.
//  • one sheet per unit — the children whose Réponse is that unit, filled in as soon as it's picked (the main sheet
//    keeps everyone), with a count / quota line on top.
//  • "Refusés" — every declined child with the reason code.
//  • "Statistiques" — by gender, unit (quota, places left), classe, école, and a unit × classe grid.
//  • "Codes" — every valid code + meaning (also the dropdown source).
// Parse reads the main sheet by HEADER NAME, so inserting/reordering columns doesn't break the import.
public class DemandeSheetService : IDemandeSheetService
{
    private const string MainSheet = "Demandes";
    private const string H_Ref = "Réf. (ne pas modifier)";
    private const string H_Decision = "Réponse (unité ou motif)";
    private const string H_DecisionLegacy = "Décision (code unité ou motif)"; // files exported before 2026-09-29

    // Main-sheet columns (1-based) — key columns first so the unit sheets can copy them.
    private const int C_Ref = 1, C_Serial = 2, C_Decision = 3, C_Status = 4, C_First = 5, C_Last = 6, C_Gender = 7,
        C_Dob = 8, C_Age = 9, C_Classe = 10, C_School = 11, C_Parents = 12, C_Relations = 13, C_Siblings = 14;
    private static readonly string[] Headers =
    {
        H_Ref, "N°", H_Decision, "Statut actuel", "Prénom", "Nom", "Genre", "Naissance", "Âge", "Classe", "École",
        "Parents / tuteurs", "Proches scouts", "Fratrie (mêmes parents)",
        "Nationalité", "Section", "Groupe sanguin", "Allergies", "Notes médicales", "Téléphone", "Email",
        "Adresse — pays", "Adresse — ville", "Adresse — détails", "Situation des parents", "Demande précédente",
        "Notes des parents", "Soumise le",
        "État", "Clé",
    };
    private static readonly int C_State = Headers.Length - 1, C_Key = Headers.Length;
    private static readonly int[] WrapCols = { 12, 13, 14, 18, 19, 27 };

    // Columns copied onto the unit sheets / the Refusés sheet (source column, header).
    private static readonly (int Col, string Header)[] UnitCols =
    {
        (C_Serial, "N°"), (C_First, "Prénom"), (C_Last, "Nom"), (C_Gender, "Genre"), (C_Dob, "Naissance"),
        (C_Age, "Âge"), (C_Classe, "Classe"), (C_School, "École"), (C_Parents, "Parents / tuteurs"),
        (C_Relations, "Proches scouts"), (C_Siblings, "Fratrie"),
    };

    private const string Boy = "Masculin", Girl = "Féminin";
    private static readonly XLColor HeaderFill = XLColor.FromHtml("#E5E7EB");
    private static readonly XLColor DecisionFill = XLColor.FromHtml("#FEF3C7");
    private static readonly XLColor BoyFill = XLColor.FromHtml("#DBEAFE");
    private static readonly XLColor GirlFill = XLColor.FromHtml("#FCE7F3");

    public byte[] Export(string title, IReadOnlyList<DemandeExportRow> rows,
        IReadOnlyList<DemandeExportUnit> units,
        IReadOnlyList<(string Code, string Label)> reasons,
        string? defaultReasonLabel,
        IReadOnlyList<string> classOrder)
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add(MainSheet);
        // Codes first in memory (the main sheet's formulas reference it) — moved to the end of the tabs below.
        var codes = wb.Worksheets.Add("Codes");
        var (unitCodeLast, codeLast) = WriteCodes(codes, units, reasons, defaultReasonLabel);

        // ── Main sheet ────────────────────────────────────────────────────────────────────────────────────
        for (var c = 0; c < Headers.Length; c++) ws.Cell(1, c + 1).Value = Headers[c];
        var head = ws.Range(1, 1, 1, Headers.Length);
        head.Style.Font.Bold = true;
        head.Style.Fill.BackgroundColor = HeaderFill;
        ws.Cell(1, C_Decision).Style.Fill.BackgroundColor = DecisionFill;
        ws.SheetView.Freeze(1, C_Last);

        // Boys, then girls, then anyone without a gender — each block under a title row.
        var blocks = new (string Label, XLColor Fill, List<DemandeExportRow> Rows)[]
        {
            ("GARÇONS", BoyFill, rows.Where(x => x.Gender == Boy).ToList()),
            ("FILLES", GirlFill, rows.Where(x => x.Gender == Girl).ToList()),
            ("GENRE NON PRÉCISÉ", HeaderFill, rows.Where(x => x.Gender != Boy && x.Gender != Girl).ToList()),
        };
        var r = 2;
        var dataRows = new List<int>();
        foreach (var (label, fill, list) in blocks)
        {
            if (list.Count == 0) continue;
            // Title row: the text sits in the Prénom column (Réf. and Réponse stay empty → ignored by the import).
            ws.Cell(r, C_First).Value = $"{label} — {list.Count} demande(s)";
            var band = ws.Range(r, 1, r, C_Siblings);
            band.Style.Fill.BackgroundColor = fill;
            band.Style.Font.Bold = true;
            r++;
            foreach (var row in list)
            {
                WriteRow(ws, r, row);
                dataRows.Add(r);
                r++;
            }
        }
        var last = Math.Max(2, r - 1);

        // Helper formulas on every data row (title rows stay blank).
        var unitCodes = $"Codes!$A$2:$A${unitCodeLast}";
        var dec = Col(C_Decision);
        var st = Col(C_State);
        foreach (var dr in dataRows)
        {
            ws.Cell(dr, C_State).FormulaA1 =
                $"IF(TRIM({dec}{dr})=\"\",\"À décider\",IF(ISNUMBER(MATCH(TRIM({dec}{dr}),{unitCodes},0)),\"Accepté\",\"Refusé\"))";
            ws.Cell(dr, C_Key).FormulaA1 =
                $"IF({st}{dr}=\"Accepté\",UPPER(TRIM({dec}{dr}))&\"#\"&COUNTIF(${dec}$2:{dec}{dr},{dec}{dr}),"
                + $"IF({st}{dr}=\"Refusé\",\"REFUS#\"&COUNTIF(${st}$2:{st}{dr},\"Refusé\"),\"\"))";
        }
        ws.Column(C_Key).Hide();

        // Dropdown on the Réponse cells of the data rows only.
        if (dataRows.Count > 0 && codeLast >= 2)
        {
            var source = codes.Range(2, 1, codeLast, 1);
            foreach (var dr in dataRows)
            {
                var dv = ws.Cell(dr, C_Decision).CreateDataValidation();
                dv.List(source, true);
                dv.IgnoreBlanks = true;
            }
        }

        if (dataRows.Count > 0)
            foreach (var wc in WrapCols)
            {
                var s = ws.Range(2, wc, last, wc).Style;
                s.Alignment.WrapText = true;
                s.Alignment.Vertical = XLAlignmentVerticalValues.Top;
            }
        ws.Range(2, C_Ref, last, C_Ref).Style.Font.FontColor = XLColor.Gray;
        ws.Columns(1, Headers.Length - 1).AdjustToContents();
        ws.Column(C_Ref).Width = 12;
        ws.Column(C_Ref).Hide(); // the matching key — kept (hidden) so the file can be imported back
        ws.Column(C_Decision).Width = 16;
        foreach (var wc in WrapCols) ws.Column(wc).Width = 34;

        // ── One live sheet per unit + Refusés ─────────────────────────────────────────────────────────────
        var capacity = Math.Max(1, dataRows.Count);
        foreach (var u in units.Where(u => u.HasSheet))
            WriteLookupSheet(wb, SafeSheetName(u.Code), $"{u.Code} — {u.Name}", u.Code.ToUpperInvariant(), capacity, last, u);
        WriteLookupSheet(wb, "Refusés", "Demandes refusées", "REFUS", capacity, last, null);

        // ── Statistics ────────────────────────────────────────────────────────────────────────────────────
        WriteStats(wb, title, rows, units, classOrder, last);

        codes.Position = wb.Worksheets.Count; // reference sheet last
        ws.SetTabActive();
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static void WriteRow(IXLWorksheet ws, int r, DemandeExportRow row)
    {
        ws.Cell(r, C_Ref).Value = row.Id.ToString();
        ws.Cell(r, C_Serial).Value = row.SerialNumber;
        ws.Cell(r, C_Decision).Value = row.PrefillDecision;
        ws.Cell(r, C_Status).Value = row.CurrentStatus;
        ws.Cell(r, C_First).Value = row.FirstName;
        ws.Cell(r, C_Last).Value = row.LastName;
        ws.Cell(r, C_Gender).Value = row.Gender ?? "";
        ws.Cell(r, C_Dob).Value = row.DateOfBirth ?? "";
        if (row.Age.HasValue) ws.Cell(r, C_Age).Value = row.Age.Value;
        ws.Cell(r, C_Classe).Value = row.Classe ?? "";
        ws.Cell(r, C_School).Value = row.School ?? "";
        ws.Cell(r, C_Parents).Value = row.Parents;
        ws.Cell(r, C_Relations).Value = row.ScoutRelations;
        ws.Cell(r, C_Siblings).Value = row.Siblings;
        var c = C_Siblings + 1;
        foreach (var v in new[]
                 {
                     row.Nationality, row.Section, row.BloodType, row.Allergies, row.MedicalNotes, row.Phone, row.Email,
                     row.AddressCountry, row.AddressCity, row.AddressDetails, row.ParentsSituation, row.PreviousDemande,
                     row.ParentNotes, row.SubmittedAt,
                 })
            ws.Cell(r, c++).Value = v ?? "";
    }

    // Codes sheet: unit codes first (rows 2..unitLast — the "accepted" range), then "--" + the reason codes.
    private static (int UnitLast, int CodeLast) WriteCodes(IXLWorksheet ws, IReadOnlyList<DemandeExportUnit> units,
        IReadOnlyList<(string Code, string Label)> reasons, string? defaultReasonLabel)
    {
        ws.Cell(1, 1).Value = "Code";
        ws.Cell(1, 2).Value = "Signification";
        ws.Range(1, 1, 1, 2).Style.Font.Bold = true;
        var r = 2;
        foreach (var u in units) { ws.Cell(r, 1).Value = u.Code; ws.Cell(r, 2).Value = $"Accepter → {u.Name}"; r++; }
        var unitLast = Math.Max(2, r - 1);
        if (!string.IsNullOrWhiteSpace(defaultReasonLabel))
        { ws.Cell(r, 1).Value = "--"; ws.Cell(r, 2).Value = $"Refuser → {defaultReasonLabel} (par défaut)"; r++; }
        foreach (var (code, label) in reasons) { ws.Cell(r, 1).Value = code; ws.Cell(r, 2).Value = $"Refuser → {label}"; r++; }
        ws.Columns().AdjustToContents();
        return (unitLast, Math.Max(2, r - 1));
    }

    // A sheet listing the children whose key starts with keyPrefix (a unit code, or REFUS): row k looks up
    // "<prefix>#k" in the main sheet's hidden Clé column — filled the moment the Réponse is picked.
    private static void WriteLookupSheet(XLWorkbook wb, string name, string heading, string keyPrefix, int capacity,
        int mainLast, DemandeExportUnit? unit)
    {
        var ws = wb.Worksheets.Add(name);
        var dec = $"{MainSheet}!${Col(C_Decision)}$2:${Col(C_Decision)}${mainLast}";
        var gen = $"{MainSheet}!${Col(C_Gender)}$2:${Col(C_Gender)}${mainLast}";
        var st = $"{MainSheet}!${Col(C_State)}$2:${Col(C_State)}${mainLast}";
        var key = $"{MainSheet}!${Col(C_Key)}$1:${Col(C_Key)}${mainLast}";

        ws.Cell(1, 1).Value = heading;
        ws.Cell(1, 1).Style.Font.Bold = true;
        ws.Cell(1, 1).Style.Font.FontSize = 14;
        if (unit is not null)
        {
            var count = $"COUNTIF({dec},\"{unit.Code}\")";
            var summary = $"\"Acceptés : \"&{count}&\"  (garçons \"&COUNTIFS({dec},\"{unit.Code}\",{gen},\"{Boy}\")"
                + $"&\", filles \"&COUNTIFS({dec},\"{unit.Code}\",{gen},\"{Girl}\")&\")\""
                + $"&\"   ·   effectif actuel {unit.CurrentActive}, après : \"&({unit.CurrentActive}+{count})";
            if (unit.Quota is int q)
                summary += $"&\"   ·   quota {q}, places restantes : \"&({q}-{count})";
            ws.Cell(2, 1).FormulaA1 = summary;
        }
        else
            ws.Cell(2, 1).FormulaA1 = $"\"Refusés : \"&COUNTIF({st},\"Refusé\")";

        var cols = unit is null ? new[] { (Col: C_Decision, Header: "Motif") }.Concat(UnitCols).ToArray() : UnitCols;
        const int headRow = 4;
        for (var c = 0; c < cols.Length; c++) ws.Cell(headRow, c + 1).Value = cols[c].Header;
        var head = ws.Range(headRow, 1, headRow, cols.Length);
        head.Style.Font.Bold = true;
        head.Style.Fill.BackgroundColor = HeaderFill;
        ws.SheetView.FreezeRows(headRow);

        for (var k = 1; k <= capacity; k++)
        {
            var rr = headRow + k;
            var match = $"MATCH(\"{keyPrefix}#{k}\",{key},0)";
            for (var c = 0; c < cols.Length; c++)
            {
                var src = Col(cols[c].Col);
                ws.Cell(rr, c + 1).FormulaA1 =
                    $"IFERROR(INDEX({MainSheet}!${src}$1:${src}${mainLast},{match})&\"\",\"\")";
            }
        }
        var body = ws.Range(headRow + 1, 1, headRow + capacity, cols.Length).Style;
        body.Alignment.Vertical = XLAlignmentVerticalValues.Top;
        for (var c = 0; c < cols.Length; c++)
        {
            var src = cols[c].Col;
            ws.Column(c + 1).Width = src is C_Parents or C_Relations or C_Siblings ? 34 : src is C_School ? 28 : 12;
            if (src is C_Parents or C_Relations or C_Siblings) ws.Column(c + 1).Style.Alignment.WrapText = true;
        }
    }

    private static void WriteStats(XLWorkbook wb, string title, IReadOnlyList<DemandeExportRow> rows,
        IReadOnlyList<DemandeExportUnit> units, IReadOnlyList<string> classOrder, int mainLast)
    {
        var ws = wb.Worksheets.Add("Statistiques");
        string Range(int col) => $"{MainSheet}!${Col(col)}$2:${Col(col)}${mainLast}";
        var refR = Range(C_Ref);
        var gen = Range(C_Gender);
        var st = Range(C_State);
        var dec = Range(C_Decision);
        var cls = Range(C_Classe);
        var sch = Range(C_School);

        ws.Cell(1, 1).Value = $"Statistiques — {title}";
        ws.Cell(1, 1).Style.Font.Bold = true;
        ws.Cell(1, 1).Style.Font.FontSize = 14;
        ws.Cell(2, 1).Value = "Mis à jour automatiquement à chaque réponse choisie dans la feuille « Demandes ».";
        ws.Cell(2, 1).Style.Font.Italic = true;
        var r = 4;

        // Header helper + a rate cell (accepted / demandes).
        void Head(params string[] hs)
        {
            for (var i = 0; i < hs.Length; i++) ws.Cell(r, i + 1).Value = hs[i];
            var h = ws.Range(r, 1, r, hs.Length);
            h.Style.Font.Bold = true;
            h.Style.Fill.BackgroundColor = HeaderFill;
            r++;
        }
        void Section(string text)
        {
            ws.Cell(r, 1).Value = text;
            ws.Cell(r, 1).Style.Font.Bold = true;
            ws.Cell(r, 1).Style.Font.FontSize = 12;
            r++;
        }
        void Rate(int row, int acceptedCol, int totalCol)
        {
            var c = ws.Cell(row, totalCol + 4);
            c.FormulaA1 = $"IF({Col(totalCol)}{row}=0,\"\",{Col(acceptedCol)}{row}/{Col(totalCol)}{row})";
            c.Style.NumberFormat.Format = "0%";
        }
        // Demandes / Acceptés / Refusés / À décider / Taux for one criteria set ("" = all rows).
        void Counts(int row, string criteria)
        {
            var extra = criteria.Length > 0 ? "," + criteria : "";
            ws.Cell(row, 2).FormulaA1 = $"COUNTIFS({refR},\"<>\"{extra})";
            ws.Cell(row, 3).FormulaA1 = $"COUNTIFS({st},\"Accepté\"{extra})";
            ws.Cell(row, 4).FormulaA1 = $"COUNTIFS({st},\"Refusé\"{extra})";
            ws.Cell(row, 5).FormulaA1 = $"COUNTIFS({st},\"À décider\"{extra})";
            Rate(row, 3, 2);
        }
        static string Esc(string s) => s.Replace("\"", "\"\"");

        // 1. Overview by gender.
        Section("Vue d'ensemble");
        Head("", "Demandes", "Acceptés", "Refusés", "À décider", "Taux d'acceptation");
        foreach (var (label, g) in new[] { ("Garçons", Boy), ("Filles", Girl) })
        {
            ws.Cell(r, 1).Value = label;
            Counts(r, $"{gen},\"{g}\"");
            r++;
        }
        ws.Cell(r, 1).Value = "Total";
        Counts(r, "");
        ws.Range(r, 1, r, 6).Style.Font.Bold = true;
        r += 2;

        // 2. By unit — accepted, quota, places left, headcount after.
        var sheetUnits = units.Where(u => u.HasSheet).ToList();
        Section("Par unité");
        Head("Unité", "Nom", "Acceptés", "Garçons", "Filles", "Effectif actuel", "Effectif après", "Quota", "Places restantes");
        var unitTop = r;
        foreach (var u in sheetUnits)
        {
            var code = Esc(u.Code);
            ws.Cell(r, 1).Value = u.Code;
            ws.Cell(r, 2).Value = u.Name;
            ws.Cell(r, 3).FormulaA1 = $"COUNTIF({dec},\"{code}\")";
            ws.Cell(r, 4).FormulaA1 = $"COUNTIFS({dec},\"{code}\",{gen},\"{Boy}\")";
            ws.Cell(r, 5).FormulaA1 = $"COUNTIFS({dec},\"{code}\",{gen},\"{Girl}\")";
            ws.Cell(r, 6).Value = u.CurrentActive;
            ws.Cell(r, 7).FormulaA1 = $"F{r}+C{r}";
            if (u.Quota is int q)
            {
                ws.Cell(r, 8).Value = q;
                ws.Cell(r, 9).FormulaA1 = $"H{r}-C{r}";
            }
            r++;
        }
        ws.Cell(r, 1).Value = "Total";
        foreach (var c in new[] { 3, 4, 5, 6, 7 })
            ws.Cell(r, c).FormulaA1 = $"SUM({Col(c)}{unitTop}:{Col(c)}{r - 1})";
        ws.Range(r, 1, r, 9).Style.Font.Bold = true;
        // Places left in red once a unit goes over its quota.
        if (r > unitTop)
            ws.Range(unitTop, 9, r - 1, 9).AddConditionalFormat().WhenLessThan(0).Font.SetFontColor(XLColor.Red);
        r += 2;

        // 3. By classe (managed list order, then any other value found).
        var classes = classOrder.Where(c => rows.Any(x => x.Classe == c))
            .Concat(rows.Select(x => x.Classe ?? "").Where(c => c != "" && !classOrder.Contains(c)).Distinct().OrderBy(c => c))
            .ToList();
        Section("Par classe");
        Head("Classe", "Demandes", "Acceptés", "Refusés", "À décider", "Taux d'acceptation");
        foreach (var c in classes)
        {
            ws.Cell(r, 1).Value = c;
            Counts(r, $"{cls},\"{Esc(c)}\"");
            r++;
        }
        r++;

        // 4. By école (most demandes first).
        var schools = rows.Where(x => !string.IsNullOrWhiteSpace(x.School)).GroupBy(x => x.School!)
            .OrderByDescending(g => g.Count()).ThenBy(g => g.Key).Select(g => g.Key).ToList();
        Section("Par école");
        Head("École", "Demandes", "Acceptés", "Refusés", "À décider", "Taux d'acceptation");
        foreach (var s in schools)
        {
            ws.Cell(r, 1).Value = s;
            Counts(r, $"{sch},\"{Esc(s)}\"");
            r++;
        }
        r++;

        // 5. Accepted per unit × classe.
        Section("Acceptés par unité et par classe");
        ws.Cell(r, 1).Value = "Unité";
        for (var i = 0; i < classes.Count; i++) ws.Cell(r, i + 2).Value = classes[i];
        ws.Cell(r, classes.Count + 2).Value = "Total";
        var gridHead = ws.Range(r, 1, r, classes.Count + 2);
        gridHead.Style.Font.Bold = true;
        gridHead.Style.Fill.BackgroundColor = HeaderFill;
        r++;
        foreach (var u in sheetUnits)
        {
            ws.Cell(r, 1).Value = u.Code;
            for (var i = 0; i < classes.Count; i++)
                ws.Cell(r, i + 2).FormulaA1 = $"COUNTIFS({dec},\"{Esc(u.Code)}\",{cls},\"{Esc(classes[i])}\")";
            ws.Cell(r, classes.Count + 2).FormulaA1 = $"SUM(B{r}:{Col(classes.Count + 1)}{r})";
            r++;
        }

        ws.Column(1).Width = 30;
        ws.Column(2).Width = 26;
        for (var c = 3; c <= Math.Max(10, classes.Count + 2); c++) ws.Column(c).Width = 13;
    }

    private static string Col(int n) => XLHelper.GetColumnLetterFromNumber(n);

    // Sheet names can't contain : \ / ? * [ ] and are capped at 31 chars.
    private static string SafeSheetName(string s)
    {
        var clean = new string(s.Select(ch => ":\\/?*[]".Contains(ch) ? '-' : ch).ToArray()).Trim();
        if (clean.Length == 0) clean = "Unité";
        return clean.Length > 31 ? clean[..31] : clean;
    }

    public IReadOnlyList<DemandeDecisionRow> Parse(byte[] file)
    {
        using var ms = new MemoryStream(file);
        using var wb = new XLWorkbook(ms);
        var ws = wb.Worksheets.FirstOrDefault(w => w.Name == MainSheet) ?? wb.Worksheet(1);

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
        int ColOf(string header) => cols.TryGetValue(header, out var c) ? c : 0;
        int refC = ColOf(H_Ref), decC = ColOf(H_Decision);
        if (decC == 0) decC = ColOf(H_DecisionLegacy);

        // The import matches rows by the Réf. (id) column and reads the Réponse column — nothing else. Inserting,
        // reordering, editing or deleting ANY other column is harmless (they're ignored). But if one of these two
        // required columns is gone (header renamed/deleted), fail loudly rather than silently importing nothing.
        if (refC == 0)
            throw new DemandeSheetFormatException("Colonne « Réf. (ne pas modifier) » introuvable. Réimportez le fichier exporté sans renommer ni supprimer cette colonne.");
        if (decC == 0)
            throw new DemandeSheetFormatException("Colonne « Réponse (unité ou motif) » introuvable. Réimportez le fichier exporté sans renommer ni supprimer cette colonne.");

        var list = new List<DemandeDecisionRow>();
        for (var rr = 2; rr <= lastRow; rr++)
        {
            var idStr = ws.Cell(rr, refC).GetString().Trim();
            var dec = ws.Cell(rr, decC).GetString().Trim();

            // Skip empty rows and the gender title rows (no Réf., no Réponse).
            if (string.IsNullOrEmpty(idStr) && string.IsNullOrEmpty(dec)) continue;

            Guid? id = Guid.TryParse(idStr, out var g) ? g : null;
            list.Add(new DemandeDecisionRow(rr, id, string.IsNullOrWhiteSpace(dec) ? null : dec));
        }
        return list;
    }
}
