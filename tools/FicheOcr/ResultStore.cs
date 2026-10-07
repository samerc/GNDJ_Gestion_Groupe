using System.Text.Json;

namespace FicheOcr;

/// <summary>The outcome for one document. Written as one JSON line per document in resultats.jsonl, so a run
/// stopped at 6:00 (or by a crash) picks up the next night where it stopped.</summary>
public record FicheResult(
    Guid DocumentId, Guid MemberId, string LastName, string FirstName, string? CardNumber, string? UnitCode,
    string? UnitName, string Status, DateTime UploadedAt, int PageCount, string FirstFile,
    bool Ok, string? Error, Dictionary<string, string>? Values, bool IsFiche, bool Signed,
    List<string> Reasons, double Seconds, DateTime ProcessedAt, string Model, string? MemberBloodType = null)
{
    /// <summary>The checks re-applied to the stored values, so rows read earlier follow the current rules.</summary>
    public FicheResult Rechecked()
    {
        if (!Ok || Values is null) return this;
        var reasons = new List<string>();
        var values = FicheFields.Check(Values, IsFiche, Signed, MemberBloodType, reasons);
        reasons.AddRange(Reasons.Where(r => r.StartsWith("Seules les", StringComparison.Ordinal)));
        return this with { Values = values, Reasons = reasons };
    }
}

public sealed class ResultStore
{
    readonly string _path;
    readonly Dictionary<Guid, FicheResult> _byDoc = new();
    static readonly JsonSerializerOptions Json = new();

    public ResultStore(string outDir)
    {
        _path = Path.Combine(outDir, "resultats.jsonl");
        if (!File.Exists(_path)) return;
        foreach (var line in File.ReadLines(_path))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            try
            {
                var r = JsonSerializer.Deserialize<FicheResult>(line, Json);
                if (r is not null) _byDoc[r.DocumentId] = r; // last line for a document wins (a retry)
            }
            catch (JsonException) { /* a line cut by a crash: that document is simply read again */ }
        }
    }

    public IReadOnlyCollection<FicheResult> All => _byDoc.Values;

    public bool IsDone(Guid documentId, bool retryErrors) =>
        _byDoc.TryGetValue(documentId, out var r) && (r.Ok || !retryErrors);

    public void Add(FicheResult r)
    {
        _byDoc[r.DocumentId] = r;
        File.AppendAllText(_path, JsonSerializer.Serialize(r, Json) + Environment.NewLine);
    }
}
