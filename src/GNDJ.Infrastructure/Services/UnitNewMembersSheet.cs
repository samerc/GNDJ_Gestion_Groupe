using ClosedXML.Excel;
using GNDJ.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;

namespace GNDJ.Infrastructure.Services;

// Excel of a unit's newly accepted members (sent to the unit's CU after "Envoyer les réponses"). A throw-away
// file: written under <archive root>/demandes-unites (the non-web-served root the email sender accepts for
// per-send attachments — config AuditArchive:Directory, else <cwd>/archives) and DELETED by the outbox sender
// once the email is sent. Only a file whose email finally failed can remain; those are pruned after 30 days.
public sealed class UnitNewMembersSheet(IConfiguration config) : IUnitNewMembersSheet
{
    private static readonly TimeSpan KeepFor = TimeSpan.FromDays(30);

    public string Save(string unitName, string scoutYear, IReadOnlyList<NewMemberSheetRow> rows)
    {
        var root = config["AuditArchive:Directory"];
        if (string.IsNullOrWhiteSpace(root)) root = Path.Combine(Directory.GetCurrentDirectory(), "archives");
        var dir = Path.Combine(root, "demandes-unites");
        Directory.CreateDirectory(dir);
        Prune(dir);

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Nouveaux membres");
        var withFrom = rows.Any(r => !string.IsNullOrWhiteSpace(r.FromUnit));
        string[] headers = ["Nom", "Prénom", "Date de naissance", "Genre", "Classe", "École", "Matricule",
                            "Père", "Mère", "Autre(s) tuteur(s)", "Frère / sœur dans l'unité", .. (withFrom ? new[] { "Unité d'origine" } : [])];
        for (var i = 0; i < headers.Length; i++) ws.Cell(1, i + 1).Value = headers[i];
        var head = ws.Range(1, 1, 1, headers.Length);
        head.Style.Font.Bold = true;
        head.Style.Fill.BackgroundColor = XLColor.FromHtml("#E8EEF7");

        var r = 2;
        foreach (var m in rows)
        {
            ws.Cell(r, 1).Value = m.LastName;
            ws.Cell(r, 2).Value = m.FirstName;
            if (m.DateOfBirth is { } dob) { ws.Cell(r, 3).Value = dob.ToDateTime(TimeOnly.MinValue); ws.Cell(r, 3).Style.DateFormat.Format = "dd/MM/yyyy"; }
            ws.Cell(r, 4).Value = m.Gender ?? "";
            ws.Cell(r, 5).Value = m.Classe ?? "";
            ws.Cell(r, 6).Value = m.School ?? "";
            ws.Cell(r, 7).Value = m.CardNumber ?? "";
            ws.Cell(r, 8).Value = m.Father ?? "";
            ws.Cell(r, 9).Value = m.Mother ?? "";
            ws.Cell(r, 10).Value = m.OtherGuardians ?? "";
            ws.Cell(r, 11).Value = m.SiblingsInUnit ?? "";
            if (withFrom) ws.Cell(r, 12).Value = m.FromUnit ?? "";
            r++;
        }
        ws.SheetView.FreezeRows(1);
        ws.Range(1, 1, Math.Max(1, r - 1), headers.Length).SetAutoFilter();
        ws.Columns().AdjustToContents();

        var safe = string.Concat($"{unitName} {scoutYear}".Where(c => !Path.GetInvalidFileNameChars().Contains(c))).Trim();
        var path = Path.Combine(dir, $"Nouveaux membres - {safe} - {Guid.NewGuid():N}.xlsx");
        wb.SaveAs(path);
        return path;
    }

    private static void Prune(string dir)
    {
        try
        {
            foreach (var f in Directory.EnumerateFiles(dir, "*.xlsx"))
                if (DateTime.UtcNow - File.GetLastWriteTimeUtc(f) > KeepFor) File.Delete(f);
        }
        catch { /* best-effort housekeeping */ }
    }
}
