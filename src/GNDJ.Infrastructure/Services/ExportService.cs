using System.Text;
using ClosedXML.Excel;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Infrastructure.Services;

public class ExportService : IExportService
{
    private static readonly Dictionary<string, string> ColumnLabels = new()
    {
        ["name"] = "Nom",
        ["cardNumber"] = "N\u00b0 carte",
        ["gender"] = "Genre",
        ["dateOfBirth"] = "Date naissance",
        ["age"] = "\u00c2ge",
        ["bloodType"] = "Groupe sanguin",
        ["nationality"] = "Nationalit\u00e9",
        ["school"] = "\u00c9cole",
        ["classe"] = "Classe",
        ["section"] = "Section",
        ["phone"] = "T\u00e9l\u00e9phone",
        ["email"] = "Email",
        ["role"] = "Fonction",
        ["team"] = "\u00c9quipe",
    };

    public byte[] GenerateExcel(ExportData data)
    {
        var columns = ResolveColumns(data.Columns);

        using var workbook = new XLWorkbook();
        var sheetName = data.Title.Length > 31 ? data.Title[..31] : data.Title;
        var worksheet = workbook.Worksheets.Add(sheetName);

        // Header row
        for (int col = 0; col < columns.Count; col++)
        {
            var cell = worksheet.Cell(1, col + 1);
            cell.Value = ColumnLabels[columns[col]];
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.LightGray;
        }

        // Data rows
        int row = 2;
        foreach (var team in data.Teams)
        {
            foreach (var member in team.Members)
            {
                for (int col = 0; col < columns.Count; col++)
                {
                    worksheet.Cell(row, col + 1).Value = GetValue(member, columns[col]);
                }
                row++;
            }
        }

        // Auto-fit columns
        worksheet.Columns().AdjustToContents();

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    public byte[] GenerateCsv(ExportData data)
    {
        var columns = ResolveColumns(data.Columns);

        var sb = new StringBuilder();

        // Header
        sb.AppendLine(string.Join(";", columns.Select(c => EscapeCsv(ColumnLabels[c]))));

        // Data
        foreach (var team in data.Teams)
        {
            foreach (var member in team.Members)
            {
                sb.AppendLine(string.Join(";", columns.Select(c => EscapeCsv(GetValue(member, c)))));
            }
        }

        // Return with UTF-8 BOM so Excel detects encoding
        var bom = Encoding.UTF8.GetPreamble();
        var content = Encoding.UTF8.GetBytes(sb.ToString());
        var result = new byte[bom.Length + content.Length];
        bom.CopyTo(result, 0);
        content.CopyTo(result, bom.Length);
        return result;
    }

    private static List<string> ResolveColumns(IReadOnlyList<string> requested)
    {
        var columns = requested.Where(c => ColumnLabels.ContainsKey(c)).ToList();
        if (columns.Count == 0)
            columns = ["name", "cardNumber", "age", "phone", "role", "team"];
        return columns;
    }

    private static string GetValue(ExportMemberData m, string col) => col switch
    {
        "name" => m.Name,
        "cardNumber" => m.CardNumber ?? "",
        "gender" => m.Gender ?? "",
        "dateOfBirth" => m.DateOfBirth ?? "",
        "age" => m.Age?.ToString() ?? "",
        "bloodType" => m.BloodType ?? "",
        "nationality" => m.Nationality ?? "",
        "school" => m.School ?? "",
        "classe" => m.Classe ?? "",
        "section" => m.Section ?? "",
        "phone" => m.Phone ?? "",
        "email" => m.Email ?? "",
        "role" => m.RoleName ?? "",
        "team" => m.TeamName ?? "",
        _ => m.CustomFields.FirstOrDefault(cf => cf.Name == col)?.Value ?? ""
    };

    private static string EscapeCsv(string value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        if (value.Contains('"') || value.Contains(';') || value.Contains('\n') || value.Contains('\r'))
            return $"\"{value.Replace("\"", "\"\"")}\"";
        return value;
    }
}
