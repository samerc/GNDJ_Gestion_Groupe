using ClosedXML.Excel;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Infrastructure.Services;

// Camp BP « Liste de présence »: one printable sheet per unit — framed title (unit name in capitals), then
// Prénom / Nom / Présence / Cotisation with borders on every cell. Only « Absent(e) » is pre-filled.
// Built by GenerateCampPresenceListQuery (GET /camps/{id}/presence/xlsx); the units arrive already scoped to the caller
// and in parcours order — this class only lays them out.
public sealed class CampPresenceSheet : ICampPresenceSheet
{
    public byte[] Build(IReadOnlyList<CampPresenceUnit> units)
    {
        using var wb = new XLWorkbook();
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var unit in units)
        {
            var ws = wb.Worksheets.Add(SheetName(unit.Code, used));

            var title = ws.Range(1, 1, 1, 4);
            title.Merge();
            title.Value = unit.Name.ToUpperInvariant();
            title.Style.Font.Bold = true;
            title.Style.Font.FontSize = 20;
            title.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            title.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            title.Style.Border.OutsideBorder = XLBorderStyleValues.Thick;
            ws.Row(1).Height = 46;

            string[] headers = ["Prénom", "Nom", "Présence", "Cotisation"];
            for (var c = 0; c < headers.Length; c++) ws.Cell(2, c + 1).Value = headers[c];
            ws.Range(2, 1, 2, 4).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Range(2, 1, 2, 4).Style.Font.Bold = true;

            var r = 3;
            foreach (var m in unit.Rows)
            {
                ws.Cell(r, 1).Value = m.FirstName;
                ws.Cell(r, 2).Value = m.LastName;
                if (m.Presence is { } p)
                {
                    ws.Cell(r, 3).Value = p;
                    ws.Cell(r, 3).Style.Font.FontColor = XLColor.FromHtml("#B91C1C");
                    ws.Cell(r, 3).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                }
                ws.Row(r).Height = 20;
                r++;
            }

            // Max(2, …): an empty unit still gets a bordered header row.
            var grid = ws.Range(2, 1, Math.Max(2, r - 1), 4);
            grid.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
            grid.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            grid.Style.Font.FontSize = 12;
            ws.Row(2).Height = 20;
            ws.Column(1).Width = 26;
            ws.Column(2).Width = 22;
            ws.Column(3).Width = 22;
            ws.Column(4).Width = 22;

            // Print: one page wide, header rows repeated on every page.
            ws.PageSetup.PageOrientation = XLPageOrientation.Portrait;
            ws.PageSetup.PaperSize = XLPaperSize.A4Paper;
            ws.PageSetup.FitToPages(1, 0);
            ws.PageSetup.SetRowsToRepeatAtTop(1, 2);
            ws.PageSetup.CenterHorizontally = true;
        }

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    // Excel sheet names: ≤ 31 chars, none of : \ / ? * [ ], unique.
    private static string SheetName(string code, HashSet<string> used)
    {
        var baseName = new string(code.Where(c => !@":\/?*[]".Contains(c)).ToArray()).Trim();
        if (baseName.Length == 0) baseName = "Unité";
        // 28 leaves room for a " 2"…" 99" suffix when two units share a code after cleaning.
        if (baseName.Length > 28) baseName = baseName[..28];
        var name = baseName;
        for (var i = 2; !used.Add(name); i++) name = $"{baseName} {i}";
        return name;
    }
}
