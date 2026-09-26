using ClosedXML.Excel;
using GNDJ.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;

namespace GNDJ.Infrastructure.Services;

// Excel of a unit's newly accepted members (sent to the unit's CU after "Envoyer les réponses"). Saved under
// <archive root>/demandes-unites — the same non-web-served root the email sender accepts for per-send
// attachments (config AuditArchive:Directory, else <cwd>/archives). Files older than 90 days are pruned on
// each save: the email outbox only needs them until the mail is sent (retries included).
public sealed class UnitNewMembersSheet(IConfiguration config) : IUnitNewMembersSheet
{
    private static readonly TimeSpan KeepFor = TimeSpan.FromDays(90);

    public string Save(string unitName, string scoutYear, IReadOnlyList<NewMemberSheetRow> rows)
    {
        var root = config["AuditArchive:Directory"];
        if (string.IsNullOrWhiteSpace(root)) root = Path.Combine(Directory.GetCurrentDirectory(), "archives");
        var dir = Path.Combine(root, "demandes-unites");
        Directory.CreateDirectory(dir);
        Prune(dir);

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Nouveaux membres");
        string[] headers = ["Nom", "Prénom", "Date de naissance", "Genre", "Classe", "École", "Matricule",
                            "Père", "Mère", "Autre(s) tuteur(s)", "Frère / sœur dans l'unité"];
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
