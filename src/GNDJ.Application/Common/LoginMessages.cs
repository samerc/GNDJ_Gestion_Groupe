using System.Text.Json;

namespace GNDJ.Application.Common;

// Login-page announcements. A "login.<audience>_messages" setting holds a JSON array of scheduled messages —
// each with its own optional start/end window — so the CG can queue several banners at once. This parses that
// JSON and returns the texts that are ACTIVE right now (non-empty text + within [start, end] per AnnouncementWindow),
// in the authored order. Malformed JSON → no messages (never throws). The stored shape is:
//   [ { "text": "…", "start": "2026-09-01" | null, "end": "2026-09-30" | null }, … ]
public static class LoginMessages
{
    private sealed record Msg(string? Text, string? Start, string? End);

    public static List<string> ActiveTexts(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            var list = JsonSerializer.Deserialize<List<Msg>>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            if (list is null) return [];
            return list
                .Where(m => !string.IsNullOrWhiteSpace(m.Text) && AnnouncementWindow.IsActive(m.Start, m.End))
                .Select(m => m.Text!.Trim())
                .ToList();
        }
        catch (JsonException) { return []; }
    }
}
