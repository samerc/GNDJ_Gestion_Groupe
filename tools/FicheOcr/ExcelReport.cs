using ClosedXML.Excel;

namespace FicheOcr;

/// <summary>Builds the Excel to check by hand: one row per member, the read answers, and what to verify.</summary>
public static class ExcelReport
{
    static readonly XLColor Illegible = XLColor.FromHtml("#FDE2C4");
    static readonly XLColor ToCheck = XLColor.FromHtml("#FFF3B0");
    static readonly XLColor Header = XLColor.FromHtml("#1C2B4A");

    /// <summary>Writes the workbook; if the file is open in Excel, writes a dated copy instead. Returns the path.</summary>
    public static string Write(IEnumerable<FicheResult> results, string outDir, string appUrl, string siteRoot, int totalDocs)
    {
        using var wb = new XLWorkbook();
        results = results.Select(r => r.Rechecked()).ToList();
        var ok = results.Where(r => r.Ok).OrderBy(r => r.UnitCode ?? "~").ThenBy(r => r.LastName).ThenBy(r => r.FirstName).ToList();
        var errors = results.Where(r => !r.Ok).OrderBy(r => r.UnitCode ?? "~").ThenBy(r => r.LastName).ToList();

        WriteReadme(wb.AddWorksheet("Lisez-moi"), ok, errors, totalDocs);
        WriteFiches(wb.AddWorksheet("Fiches"), ok, appUrl, siteRoot);
        WriteErrors(wb.AddWorksheet("Erreurs"), errors, appUrl, siteRoot);
        wb.Worksheet("Fiches").SetTabActive();

        var path = Path.Combine(outDir, "fiches-medicales.xlsx");
        try { wb.SaveAs(path); }
        catch (IOException)
        {
            path = Path.Combine(outDir, $"fiches-medicales-{DateTime.Now:yyyyMMdd-HHmm}.xlsx");
            wb.SaveAs(path);
        }
        return path;
    }

    static void WriteFiches(IXLWorksheet ws, List<FicheResult> rows, string appUrl, string siteRoot)
    {
        var fixedCols = new[] { "Unité", "Nom", "Prénom", "Matricule", "Statut du document", "Envoyé le", "Pages" };
        var tailCols = new[] { "Signée", "À vérifier", "Raisons", "Fichier", "Fiche dans l'app", "MemberId", "DocumentId" };
        var col = 1;
        foreach (var h in fixedCols) ws.Cell(1, col++).Value = h;
        var firstField = col;
        foreach (var f in FicheFields.All) ws.Cell(1, col++).Value = f.Label;
        var firstTail = col;
        foreach (var h in tailCols) ws.Cell(1, col++).Value = h;
        StyleHeader(ws.Range(1, 1, 1, col - 1));

        var row = 2;
        foreach (var r in rows)
        {
            var c = 1;
            ws.Cell(row, c++).Value = r.UnitCode ?? "";
            ws.Cell(row, c++).Value = r.LastName;
            ws.Cell(row, c++).Value = r.FirstName;
            ws.Cell(row, c++).Value = r.CardNumber ?? "";
            ws.Cell(row, c++).Value = StatusFr(r.Status);
            ws.Cell(row, c++).Value = r.UploadedAt.ToLocalTime().ToString("dd/MM/yyyy");
            ws.Cell(row, c++).Value = r.PageCount;
            foreach (var f in FicheFields.All)
            {
                var v = r.Values?.GetValueOrDefault(f.Key) ?? "";
                var cell = ws.Cell(row, c++);
                cell.Value = v; // always text: dates stay DD/MM/YYYY, « 0+ » is not turned into a number
                cell.Style.NumberFormat.Format = "@";
                if (v == FicheFields.Unreadable) cell.Style.Fill.BackgroundColor = Illegible;
            }
            ws.Cell(row, c++).Value = r.Signed ? "Oui" : "Non";
            var check = ws.Cell(row, c++);
            check.Value = r.Reasons.Count > 0 ? "Oui" : "";
            if (r.Reasons.Count > 0) check.Style.Fill.BackgroundColor = ToCheck;
            ws.Cell(row, c++).Value = string.Join(" ; ", r.Reasons);
            LinkFile(ws.Cell(row, c++), siteRoot, r.FirstFile);
            var app = ws.Cell(row, c++);
            app.Value = "Ouvrir";
            app.SetHyperlink(new XLHyperlink($"{appUrl.TrimEnd('/')}/members/{r.MemberId}"));
            ws.Cell(row, c++).Value = r.MemberId.ToString();
            ws.Cell(row, c++).Value = r.DocumentId.ToString();
            row++;
        }

        ws.SheetView.FreezeRows(1);
        ws.SheetView.FreezeColumns(3);
        if (row > 2) ws.Range(1, 1, row - 1, firstTail + tailCols.Length - 1).SetAutoFilter();
        ws.Columns(1, firstField - 1).AdjustToContents();
        for (var i = firstField; i < firstTail; i++) ws.Column(i).Width = 22;
        ws.Column(firstTail + 2).Width = 50;   // Raisons
        ws.Column(firstTail + 3).Width = 18;   // Fichier
        // The ids are only for the later import into the app.
        ws.Column(firstTail + 5).Hide();
        ws.Column(firstTail + 6).Hide();
        ws.Row(1).Height = 45;
        ws.Row(1).Style.Alignment.WrapText = true;
    }

    static void WriteErrors(IXLWorksheet ws, List<FicheResult> rows, string appUrl, string siteRoot)
    {
        string[] cols = ["Unité", "Nom", "Prénom", "Matricule", "Problème", "Fichier", "Fiche dans l'app"];
        for (var i = 0; i < cols.Length; i++) ws.Cell(1, i + 1).Value = cols[i];
        StyleHeader(ws.Range(1, 1, 1, cols.Length));
        var row = 2;
        foreach (var r in rows)
        {
            ws.Cell(row, 1).Value = r.UnitCode ?? "";
            ws.Cell(row, 2).Value = r.LastName;
            ws.Cell(row, 3).Value = r.FirstName;
            ws.Cell(row, 4).Value = r.CardNumber ?? "";
            ws.Cell(row, 5).Value = r.Error ?? "";
            LinkFile(ws.Cell(row, 6), siteRoot, r.FirstFile);
            ws.Cell(row, 7).Value = "Ouvrir";
            ws.Cell(row, 7).SetHyperlink(new XLHyperlink($"{appUrl.TrimEnd('/')}/members/{r.MemberId}"));
            row++;
        }
        ws.SheetView.FreezeRows(1);
        ws.Columns().AdjustToContents();
        ws.Column(5).Width = 70;
    }

    static void WriteReadme(IXLWorksheet ws, List<FicheResult> ok, List<FicheResult> errors, int totalDocs)
    {
        var toCheck = ok.Count(r => r.Reasons.Count > 0);
        string[] lines =
        [
            "Lecture automatique des fiches médicales",
            "",
            $"Mis à jour le {DateTime.Now:dd/MM/yyyy à HH:mm}.",
            $"Fiches lues : {ok.Count} sur {totalDocs} — dont {toCheck} à vérifier. Erreurs : {errors.Count}.",
            "",
            "Comment l'utiliser",
            "1. Onglet « Fiches » : une ligne par membre, avec les réponses lues sur sa fiche scannée.",
            "2. Filtrez la colonne « À vérifier » sur « Oui » : la colonne « Raisons » dit quoi regarder.",
            $"3. Une case orange « {FicheFields.Unreadable} » = quelque chose est écrit mais n'a pas pu être lu. Ouvrez le scan (colonne « Fichier ») et corrigez la case à la main.",
            "4. Une case vide = rien n'est écrit sur la fiche.",
            "5. Les dates sont au format JJ/MM/AAAA ; une date non reconnue reste telle qu'écrite et est signalée.",
            "6. Onglet « Erreurs » : fiches qui n'ont pas pu être lues (fichier manquant, PDF abîmé…).",
            "",
            "Important",
            "- La lecture est faite par un programme : elle peut se tromper même quand rien n'est signalé. Relisez au moins les allergies et les traitements.",
            "- Ne renommez pas et ne supprimez pas les colonnes : ce fichier, une fois vérifié, pourra être importé dans l'app pour pré-remplir la fiche médicale en ligne.",
            "- Ce fichier contient des données médicales : ne le partagez pas, ne l'envoyez pas par email ni WhatsApp.",
        ];
        for (var i = 0; i < lines.Length; i++) ws.Cell(i + 1, 1).Value = lines[i];
        ws.Cell(1, 1).Style.Font.Bold = true;
        ws.Cell(1, 1).Style.Font.FontSize = 14;
        ws.Cell(6, 1).Style.Font.Bold = true;
        ws.Cell(14, 1).Style.Font.Bold = true;
        ws.Column(1).Width = 140;
    }

    static void LinkFile(IXLCell cell, string siteRoot, string storedPath)
    {
        var full = Sources.ResolvePath(siteRoot, storedPath);
        cell.Value = "Voir le scan";
        cell.SetHyperlink(new XLHyperlink(new Uri(full).AbsoluteUri));
    }

    static void StyleHeader(IXLRange r)
    {
        r.Style.Font.Bold = true;
        r.Style.Font.FontColor = XLColor.White;
        r.Style.Fill.BackgroundColor = Header;
        r.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
    }

    static string StatusFr(string s) => s switch
    {
        "Approved" => "Accepté",
        "Pending" => "En attente",
        "Rejected" => "Refusé",
        _ => s,
    };
}
