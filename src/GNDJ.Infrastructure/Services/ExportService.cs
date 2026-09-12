using System.Text;
using ClosedXML.Excel;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Infrastructure.Services;

// Exports a member roster to a spreadsheet — Excel (.xlsx via ClosedXML) or CSV. Both honour a
// caller-chosen column set (validated against the known columns, falling back to a sensible default)
// and the same value-resolution logic, so the two formats stay in sync. Unknown column keys resolve
// to a member custom-field value of that name.
public class ExportService : IExportService
{
    // Maps a column key (the API contract) to its French header label.
    private static readonly Dictionary<string, string> ColumnLabels = new()
    {
        ["name"] = "Nom",
        ["firstName"] = "Pr\u00e9nom",
        ["lastName"] = "Nom de famille",
        ["cardNumber"] = "Matricule",
        ["externalCardNumber"] = "N\u00b0 carte",
        ["gender"] = "Genre",
        ["dateOfBirth"] = "Date naissance",
        ["age"] = "\u00c2ge",
        ["bloodType"] = "Groupe sanguin",
        ["nationality"] = "Nationalit\u00e9",
        ["school"] = "\u00c9cole",
        ["classe"] = "Classe",
        ["section"] = "Section",
        ["profession"] = "Profession",
        ["professionDomain"] = "Domaine professionnel",
        ["phone"] = "T\u00e9l\u00e9phone",
        ["email"] = "Email",
        ["address"] = "Adresse",
        ["primaryContactEmail"] = "Email de contact",
        ["fatherName"] = "P\u00e8re",
        ["fatherPhone"] = "T\u00e9l. p\u00e8re",
        ["motherName"] = "M\u00e8re",
        ["motherPhone"] = "T\u00e9l. m\u00e8re",
        ["guardianEmails"] = "Emails parents",
        ["unit"] = "Unit\u00e9",
        ["role"] = "Fonction",
        ["team"] = "\u00c9quipe",
        ["startDate"] = "Date d'arriv\u00e9e",
    };

    public byte[] GenerateExcel(ExportData data)
    {
        var columns = ResolveColumns(data.Columns);

        using var workbook = new XLWorkbook();
        // Excel forbids : \ / ? * [ ] in a sheet name (ClosedXML throws) and caps it at 31 chars. Real unit
        // names can contain "/" (e.g. "10ème / Jamhour"), so sanitize before adding the sheet.
        var safeTitle = System.Text.RegularExpressions.Regex.Replace(data.Title ?? "", @"[:\\/?*\[\]]", "-").Trim();
        if (string.IsNullOrEmpty(safeTitle)) safeTitle = "Export";
        var sheetName = safeTitle.Length > 31 ? safeTitle[..31] : safeTitle;
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

    // Keep only recognized column keys (drops anything unknown/malicious); empty selection → default set.
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
        "firstName" => m.FirstName ?? "",
        "lastName" => m.LastName ?? "",
        "cardNumber" => m.CardNumber ?? "",
        "externalCardNumber" => m.ExternalCardNumber ?? "",
        "gender" => m.Gender ?? "",
        "dateOfBirth" => m.DateOfBirth ?? "",
        "age" => m.Age?.ToString() ?? "",
        "bloodType" => m.BloodType ?? "",
        "nationality" => m.Nationality ?? "",
        "school" => m.School ?? "",
        "classe" => m.Classe ?? "",
        "section" => m.Section ?? "",
        "profession" => m.Profession ?? "",
        "professionDomain" => m.ProfessionDomain ?? "",
        "phone" => m.Phone ?? "",
        "email" => m.Email ?? "",
        "address" => m.Address ?? "",
        "primaryContactEmail" => m.PrimaryContactEmail ?? "",
        "fatherName" => m.FatherName ?? "",
        "fatherPhone" => m.FatherPhone ?? "",
        "motherName" => m.MotherName ?? "",
        "motherPhone" => m.MotherPhone ?? "",
        "guardianEmails" => m.GuardianEmails ?? "",
        "unit" => m.UnitName ?? "",
        "role" => m.RoleName ?? "",
        "team" => m.TeamName ?? "",
        "startDate" => m.StartDate ?? "",
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
