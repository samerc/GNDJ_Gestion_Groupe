using ClosedXML.Excel;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Infrastructure.Services;

// Reads an uploaded member-import file (.xlsx via ClosedXML, .csv otherwise) into headers + rows, and builds the
// blank template. Column MEANING is resolved by the handler (by header name), so this only tokenizes cells.
public class MemberImportService : IMemberImportService
{
    // The template's column order + labels. The handler matches these (accent/case-insensitive) back to fields.
    private static readonly string[] TemplateHeaders =
    [
        "Prénom", "Nom", "Date de naissance", "Genre", "Nationalité", "École", "Classe", "Section",
        "Unité", "Père", "Mère", "Numéro de carte", "Groupe sanguin",
    ];

    public byte[] BuildTemplate()
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Membres");
        for (var c = 0; c < TemplateHeaders.Length; c++)
        {
            var cell = ws.Cell(1, c + 1);
            cell.Value = TemplateHeaders[c];
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.LightGray;
        }
        // One example row so the expected formats are obvious (deleted by the user before import).
        var ex = new[] { "Georges", "HADDAD", "14/09/2015", "Masculin", "Libanaise", "Collège Notre-Dame de Jamhour", "6ème", "", "M2", "Elie HADDAD", "Rita HADDAD", "", "O+" };
        for (var c = 0; c < ex.Length; c++) ws.Cell(2, c + 1).Value = ex[c];
        ws.Columns().AdjustToContents();

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    public MemberImportFile Parse(byte[] file, string fileName)
    {
        var isCsv = fileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase);
        return isCsv ? ParseCsv(file) : ParseXlsx(file);
    }

    private static MemberImportFile ParseXlsx(byte[] file)
    {
        using var ms = new MemoryStream(file);
        using var wb = new XLWorkbook(ms);
        var ws = wb.Worksheets.First();
        var range = ws.RangeUsed();
        if (range is null) return new MemberImportFile([], []);

        var rows = range.RowsUsed().ToList();
        var headers = rows[0].Cells().Select(c => c.GetString().Trim()).ToList();
        var data = new List<IReadOnlyList<string>>();
        foreach (var r in rows.Skip(1))
        {
            // Read exactly as many cells as there are headers (ClosedXML trims trailing empties otherwise).
            var cells = new List<string>();
            for (var c = 1; c <= headers.Count; c++) cells.Add(r.Cell(c).GetString().Trim());
            if (cells.Any(v => !string.IsNullOrWhiteSpace(v))) data.Add(cells); // skip fully-blank rows
        }
        return new MemberImportFile(headers, data);
    }

    private static MemberImportFile ParseCsv(byte[] file)
    {
        // UTF-8 (with or without BOM). Simple RFC-4180-ish parser: handles quoted fields + embedded commas/quotes.
        var text = new System.Text.UTF8Encoding(false).GetString(file).TrimStart('﻿');
        var lines = SplitCsvLines(text);
        if (lines.Count == 0) return new MemberImportFile([], []);
        var headers = ParseCsvLine(lines[0]).Select(h => h.Trim()).ToList();
        var data = new List<IReadOnlyList<string>>();
        foreach (var line in lines.Skip(1))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var cells = ParseCsvLine(line).Select(v => v.Trim()).ToList();
            while (cells.Count < headers.Count) cells.Add("");
            if (cells.Any(v => !string.IsNullOrWhiteSpace(v))) data.Add(cells);
        }
        return new MemberImportFile(headers, data);
    }

    // Split on newlines that are NOT inside quotes.
    private static List<string> SplitCsvLines(string text)
    {
        var lines = new List<string>();
        var sb = new System.Text.StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (ch == '"') inQuotes = !inQuotes;
            if ((ch == '\n' || ch == '\r') && !inQuotes)
            {
                if (ch == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++; // CRLF
                lines.Add(sb.ToString()); sb.Clear();
            }
            else sb.Append(ch);
        }
        if (sb.Length > 0) lines.Add(sb.ToString());
        return lines;
    }

    private static List<string> ParseCsvLine(string line)
    {
        var fields = new List<string>();
        var sb = new System.Text.StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < line.Length; i++)
        {
            var ch = line[i];
            if (inQuotes)
            {
                if (ch == '"')
                {
                    if (i + 1 < line.Length && line[i + 1] == '"') { sb.Append('"'); i++; } // escaped quote
                    else inQuotes = false;
                }
                else sb.Append(ch);
            }
            else if (ch == '"') inQuotes = true;
            else if (ch == ',') { fields.Add(sb.ToString()); sb.Clear(); }
            else sb.Append(ch);
        }
        fields.Add(sb.ToString());
        return fields;
    }
}
