using System.Text.Json;
using Npgsql;

namespace FicheOcr;

/// <summary>One file of a document (page 1 = the document row itself, then member_document_pages).</summary>
public record PageFile(string Path, string MimeType);

/// <summary>A fiche to read, with what the Excel needs to identify the member.</summary>
public record FicheDoc(
    Guid DocumentId, Guid MemberId, string LastName, string FirstName, string? CardNumber, string? UnitCode,
    string? UnitName, string? MemberBloodType, string Status, DateTime UploadedAt, List<PageFile> Pages);

public static class Sources
{
    /// <summary>One document per member: the accepted one first, else the newest (rejected ones are skipped).
    /// By default only members active today and not leaving at this year's passage (« Quitte le groupe ») — they are the
    /// ones whose next form gets pre-filled.</summary>
    public static async Task<List<FicheDoc>> FromDatabaseAsync(string connectionString, string docTypeCode, bool allMembers)
    {
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();

        var docs = new List<FicheDoc>();
        await using (var cmd = new NpgsqlCommand("""
            SELECT DISTINCT ON (d.member_id)
                   d.id, d.member_id, m.last_name, m.first_name, m.card_number, m.blood_type,
                   d.file_path, d.mime_type, d.status, d.created_at,
                   (SELECT u.code FROM member_assignments a JOIN units u ON u.id = a.unit_id
                     WHERE a.member_id = m.id AND a.end_date IS NULL AND NOT a.is_deleted
                     ORDER BY a.start_date DESC LIMIT 1) AS unit_code,
                   (SELECT u.name FROM member_assignments a JOIN units u ON u.id = a.unit_id
                     WHERE a.member_id = m.id AND a.end_date IS NULL AND NOT a.is_deleted
                     ORDER BY a.start_date DESC LIMIT 1) AS unit_name
            FROM member_documents d
            JOIN document_types t ON t.id = d.document_type_id
            JOIN members m ON m.id = d.member_id
            WHERE t.code = @code AND NOT d.is_deleted AND NOT m.is_deleted AND d.status <> 'Rejected'
              AND (@all OR EXISTS (SELECT 1 FROM member_assignments a
                                   WHERE a.member_id = m.id AND a.end_date IS NULL AND NOT a.is_deleted))
              -- « Quitte le groupe » at this year's passage: leaving, so no fiche to pre-fill next year.
              AND (@all OR NOT EXISTS (SELECT 1 FROM passages p
                                       WHERE p.member_id = m.id AND NOT p.is_deleted AND p.status <> 'Rejected'
                                         AND COALESCE(p.final_is_leaving, p.is_leaving)
                                         AND p.scout_year = (SELECT s.value FROM settings s WHERE s.key = 'passage.scout_year')))
            ORDER BY d.member_id, (d.status = 'Approved') DESC, d.created_at DESC
            """, conn))
        {
            cmd.Parameters.AddWithValue("code", docTypeCode);
            cmd.Parameters.AddWithValue("all", allMembers);
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                docs.Add(new FicheDoc(
                    r.GetGuid(0), r.GetGuid(1), r.GetString(2), r.GetString(3),
                    r.IsDBNull(4) ? null : r.GetString(4), r.IsDBNull(10) ? null : r.GetString(10),
                    r.IsDBNull(11) ? null : r.GetString(11), r.IsDBNull(5) ? null : r.GetString(5),
                    r.GetString(8), r.GetDateTime(9), [new PageFile(r.GetString(6), r.GetString(7))]));
        }

        // Extra pages (recto/verso, multi-page scans), in order.
        var byId = docs.ToDictionary(d => d.DocumentId);
        await using (var cmd = new NpgsqlCommand("""
            SELECT p.member_document_id, p.file_path, p.mime_type
            FROM member_document_pages p
            JOIN member_documents d ON d.id = p.member_document_id
            JOIN document_types t ON t.id = d.document_type_id
            WHERE t.code = @code AND NOT d.is_deleted
            ORDER BY p.member_document_id, p.page_order
            """, conn))
        {
            cmd.Parameters.AddWithValue("code", docTypeCode);
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                if (byId.TryGetValue(r.GetGuid(0), out var d)) d.Pages.Add(new PageFile(r.GetString(1), r.GetString(2)));
        }
        return docs;
    }

    /// <summary>Reads the connection string from the site's appsettings.Production.json (then appsettings.json).</summary>
    public static string? ConnectionStringFromSite(string siteRoot)
    {
        foreach (var name in new[] { "appsettings.Production.json", "appsettings.json" })
        {
            var path = Path.Combine(siteRoot, name);
            if (!File.Exists(path)) continue;
            using var doc = JsonDocument.Parse(File.ReadAllText(path), new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
            if (doc.RootElement.TryGetProperty("ConnectionStrings", out var cs)
                && cs.TryGetProperty("DefaultConnection", out var v) && v.GetString() is { Length: > 0 } s)
                return s;
        }
        return null;
    }

    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    /// <summary>Copies the fiches + a manifest into a folder, to run the reading on another computer.</summary>
    public static void Export(List<FicheDoc> docs, string siteRoot, string exportDir)
    {
        var filesDir = Path.Combine(exportDir, "files");
        Directory.CreateDirectory(filesDir);
        var copied = new List<FicheDoc>();
        foreach (var d in docs)
        {
            var pages = new List<PageFile>();
            var i = 1;
            foreach (var p in d.Pages)
            {
                var src = ResolvePath(siteRoot, p.Path);
                if (!File.Exists(src)) continue;
                var name = $"{d.DocumentId}_p{i++}{Path.GetExtension(src)}";
                File.Copy(src, Path.Combine(filesDir, name), overwrite: true);
                pages.Add(new PageFile(Path.Combine("files", name), p.MimeType));
            }
            if (pages.Count > 0) copied.Add(d with { Pages = pages });
        }
        File.WriteAllText(Path.Combine(exportDir, "manifest.json"), JsonSerializer.Serialize(copied, Json));
        Console.WriteLine($"Export : {copied.Count} fiche(s) copiée(s) dans {exportDir} ({docs.Count - copied.Count} sans fichier).");
    }

    public static List<FicheDoc> FromManifest(string manifestPath) =>
        JsonSerializer.Deserialize<List<FicheDoc>>(File.ReadAllText(manifestPath)) ?? [];

    /// <summary>Stored paths are relative to the site folder ("uploads\documents\…"); exported ones to the manifest.</summary>
    public static string ResolvePath(string root, string stored)
    {
        var rel = stored.Replace('\\', Path.DirectorySeparatorChar).Replace('/', Path.DirectorySeparatorChar);
        return Path.IsPathRooted(rel) ? rel : Path.GetFullPath(Path.Combine(root, rel));
    }
}
