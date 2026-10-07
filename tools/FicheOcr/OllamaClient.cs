using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace FicheOcr;

/// <summary>What the model read on one fiche.</summary>
public record ModelReading(Dictionary<string, string> Values, bool IsFiche, bool Signed);

/// <summary>Ollama itself is down / overloaded: not the fiche's fault, so it is retried on the next run.</summary>
public sealed class OllamaUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Talks to the local Ollama server (http://127.0.0.1:11434 — never exposed outside the machine).</summary>
public sealed class OllamaClient(string baseUrl, string model, int threads) : IDisposable
{
    // A CPU-only 7B vision model can take several minutes per fiche.
    readonly HttpClient _http = new() { BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/"), Timeout = TimeSpan.FromMinutes(30) };

    /// <summary>Null when Ollama answers; otherwise a French explanation for the operator.</summary>
    public async Task<string?> CheckAsync()
    {
        try
        {
            var tags = await _http.GetFromJsonAsync<JsonObject>("api/tags");
            var names = tags?["models"]?.AsArray().Select(m => m?["name"]?.GetValue<string>() ?? "").ToList() ?? [];
            var wanted = model.Contains(':') ? model : model + ":latest";
            if (!names.Contains(wanted))
                return $"Le modèle « {model} » n'est pas téléchargé (présents : {(names.Count == 0 ? "aucun" : string.Join(", ", names))}). Lancez : ollama pull {model}";
            return null;
        }
        catch (Exception e)
        {
            return $"Ollama ne répond pas sur {_http.BaseAddress} ({e.Message}). Est-il démarré ?";
        }
    }

    public async Task<ModelReading> ReadAsync(IReadOnlyList<byte[]> pages, CancellationToken ct)
    {
        var body = new JsonObject
        {
            ["model"] = model,
            ["stream"] = false,
            ["format"] = FicheFields.Schema(),
            // Keep the model loaded between fiches (unloaded 10 min after the last one).
            ["keep_alive"] = "10m",
            ["options"] = new JsonObject
            {
                ["temperature"] = 0,
                ["num_thread"] = threads,
                ["num_ctx"] = 8192,
            },
            ["messages"] = new JsonArray
            {
                new JsonObject
                {
                    ["role"] = "user",
                    ["content"] = FicheFields.Prompt(),
                    ["images"] = new JsonArray(pages.Select(p => (JsonNode)JsonValue.Create(Convert.ToBase64String(p))!).ToArray()),
                },
            },
        };

        // A plain body with Content-Length (not chunked): the images make it a few MB.
        using var payload = new StringContent(body.ToJsonString(), System.Text.Encoding.UTF8, "application/json");
        HttpResponseMessage resp;
        try { resp = await _http.PostAsync("api/chat", payload, ct); }
        catch (Exception e) when (e is HttpRequestException || (e is TaskCanceledException && !ct.IsCancellationRequested))
        {
            throw new OllamaUnavailableException($"Ollama injoignable ou trop lent : {e.Message}", e);
        }
        using var _ = resp;
        var text = await resp.Content.ReadAsStringAsync(ct);
        if ((int)resp.StatusCode >= 500)
            throw new OllamaUnavailableException($"Ollama {(int)resp.StatusCode} : {Truncate(text, 300)}");
        if (!resp.IsSuccessStatusCode)
            throw new InvalidOperationException($"Ollama {(int)resp.StatusCode} : {Truncate(text, 300)}");

        var content = JsonNode.Parse(text)?["message"]?["content"]?.GetValue<string>()
                      ?? throw new InvalidOperationException("Réponse Ollama sans contenu.");
        return Parse(content);
    }

    /// <summary>Reads the JSON answer; tolerant of a model that wraps it in text or returns numbers.</summary>
    public static ModelReading Parse(string content)
    {
        var start = content.IndexOf('{');
        var end = content.LastIndexOf('}');
        if (start < 0 || end <= start) throw new InvalidOperationException($"Réponse non JSON : {Truncate(content, 200)}");
        var obj = JsonNode.Parse(content[start..(end + 1)])?.AsObject()
                  ?? throw new InvalidOperationException("Réponse JSON vide.");

        var values = new Dictionary<string, string>();
        foreach (var f in FicheFields.All)
            values[f.Key] = obj[f.Key] is JsonValue v ? v.ToString() : "";
        return new ModelReading(values, Bool(obj["estFicheMedicale"], true), Bool(obj["signee"], false));
    }

    static bool Bool(JsonNode? n, bool fallback) => n is JsonValue v
        ? v.TryGetValue<bool>(out var b) ? b : bool.TryParse(v.ToString(), out var b2) ? b2 : fallback
        : fallback;

    static string Truncate(string s, int n) => s.Length <= n ? s : s[..n] + "…";

    public void Dispose() => _http.Dispose();
}
