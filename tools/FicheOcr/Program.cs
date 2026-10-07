using System.Diagnostics;
using System.Globalization;
using FicheOcr;

// Offline reading of the scanned fiches médicales → Excel to check by hand.
// Everything stays on the machine: the scans are read from the site folder, the model runs in a local Ollama
// (127.0.0.1), the Excel is written outside the web root. See README.md.

Console.OutputEncoding = System.Text.Encoding.UTF8;
var opt = Options.Parse(args);
if (opt is null) { Options.PrintHelp(); return 1; }

// Never compete with the website: run below normal priority (Ollama itself is started low by run-ocr.ps1).
try { Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.BelowNormal; } catch { /* not allowed: fine */ }

// ---- Source of the fiches: the database, or a manifest exported from it (laptop) ----
List<FicheDoc> docs;
string filesRoot;
if (opt.Manifest is not null)
{
    docs = Sources.FromManifest(opt.Manifest);
    filesRoot = Path.GetDirectoryName(Path.GetFullPath(opt.Manifest))!;
}
else
{
    var cs = opt.Connection ?? Sources.ConnectionStringFromSite(opt.Site);
    if (cs is null)
    {
        Console.Error.WriteLine($"Pas de chaîne de connexion : ni --connection, ni appsettings dans {opt.Site}.");
        return 2;
    }
    docs = await Sources.FromDatabaseAsync(cs, opt.DocType, opt.AllMembers);
    filesRoot = opt.Site;
}
Console.WriteLine($"{docs.Count} fiche(s) « {opt.DocType} » trouvée(s) (une par membre).");
var allDocsCount = docs.Count; // for the Excel summary, which always covers every unit read so far

if (opt.ListUnits)
{
    // Units with their fiches, and how many are already read (main results folder).
    var read = new ResultStore(opt.Out);
    Console.WriteLine();
    Console.WriteLine("Unité      Fiches  Traitées  Restantes");
    foreach (var g in docs.GroupBy(d => d.UnitCode ?? "-").OrderBy(g => g.Key))
    {
        var n = g.Count(d => read.IsDone(d.DocumentId, retryErrors: false));
        Console.WriteLine($"{g.Key,-10} {g.Count(),6} {n,9} {g.Count() - n,10}");
    }
    return 0;
}

if (opt.Units.Count > 0)
{
    var unknown = opt.Units.Where(u => !docs.Any(d => string.Equals(d.UnitCode, u, StringComparison.OrdinalIgnoreCase))).ToList();
    if (unknown.Count > 0)
        Console.WriteLine($"Aucune fiche pour : {string.Join(", ", unknown)} (voir --list-units).");
    docs = docs.Where(d => opt.Units.Any(u => string.Equals(d.UnitCode, u, StringComparison.OrdinalIgnoreCase))).ToList();
    Console.WriteLine($"Unité(s) {string.Join(", ", opt.Units)} : {docs.Count} fiche(s).");
    if (docs.Count == 0) return 0;
}

if (opt.Export is not null)
{
    Sources.Export(docs, filesRoot, opt.Export);
    return 0;
}

if (opt.Report)
{
    // Rewrites the Excel from the saved results (current checks), without reading any fiche.
    var reportDir = opt.Trial > 0 ? Path.Combine(opt.Out, "essai") : opt.Out;
    var saved = new ResultStore(reportDir);
    Console.WriteLine($"Excel : {ExcelReport.Write(saved.All, reportDir, opt.AppUrl, filesRoot, allDocsCount)} ({saved.All.Count} fiche(s)).");
    return 0;
}

using var ollama = new OllamaClient(opt.OllamaUrl, opt.Model, opt.Threads);

if (opt.Check)
{
    var missing = docs.Count(d => !d.Pages.All(p => File.Exists(Sources.ResolvePath(filesRoot, p.Path))));
    Console.WriteLine($"Fichiers manquants : {missing}.");
    var problem = await ollama.CheckAsync();
    Console.WriteLine(problem ?? $"Ollama OK, modèle « {opt.Model} » présent.");
    return problem is null ? 0 : 3;
}

// ---- Trial: a separate folder and a fixed mix of fiches (PDFs, photos, every unit) ----
var outDir = opt.Trial > 0 ? Path.Combine(opt.Out, "essai") : opt.Out;
Directory.CreateDirectory(outDir);
if (opt.Trial > 0)
{
    var rnd = new Random(42);
    docs = docs.OrderBy(_ => rnd.Next()).Take(opt.Trial).ToList();
    Console.WriteLine($"Mode essai : {docs.Count} fiche(s), résultats dans {outDir}.");
}

// One run at a time (the night task + a manual run must not read the same fiches twice).
FileStream runLock;
try { runLock = new FileStream(Path.Combine(outDir, ".en-cours"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, 1, FileOptions.DeleteOnClose); }
catch (IOException)
{
    Console.Error.WriteLine("Une autre lecture est déjà en cours sur ce dossier.");
    return 4;
}

using (runLock)
{
    var store = new ResultStore(outDir);
    var todo = docs.Where(d => !store.IsDone(d.DocumentId, opt.RetryErrors)).ToList();
    Console.WriteLine($"Déjà traitées : {docs.Count - todo.Count}. Restantes : {todo.Count}.");
    if (opt.Limit > 0 && todo.Count > opt.Limit)
    {
        todo = todo.Take(opt.Limit).ToList();
        Console.WriteLine($"Limite de ce passage : {todo.Count}.");
    }

    if (todo.Count > 0)
    {
        var problem = await ollama.CheckAsync();
        if (problem is not null) { Console.Error.WriteLine(problem); return 3; }
    }

    using var cts = new CancellationTokenSource();
    Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); Console.WriteLine("Arrêt demandé : fin après la fiche en cours…"); };

    var deadline = opt.Until is { } until ? NextOccurrence(until) : (DateTime?)null;
    if (deadline is not null) Console.WriteLine($"Arrêt automatique à {deadline:HH:mm}.");

    var done = 0;
    var ollamaFailures = 0;
    foreach (var d in todo)
    {
        if (cts.IsCancellationRequested) break;
        if (deadline is not null && DateTime.Now >= deadline) { Console.WriteLine("Heure de fin atteinte."); break; }

        var sw = Stopwatch.StartNew();
        FicheResult result;
        try
        {
            var files = d.Pages.Select(p => Sources.ResolvePath(filesRoot, p.Path)).ToList();
            var absent = files.FirstOrDefault(f => !File.Exists(f));
            if (absent is not null) throw new FileNotFoundException($"Fichier introuvable : {absent}");

            var pages = PageImages.Load(files, opt.MaxPages, opt.MaxPixels, opt.Dpi);
            var reading = await ollama.ReadAsync(pages, cts.Token);
            var reasons = new List<string>();
            var values = FicheFields.Check(reading.Values, reading.IsFiche, reading.Signed, d.MemberBloodType, reasons);
            if (d.Pages.Count > opt.MaxPages) reasons.Add($"Seules les {opt.MaxPages} premières pages ont été lues");
            result = MakeResult(d, true, null, values, reading.IsFiche, reading.Signed, reasons, sw.Elapsed.TotalSeconds, opt.Model);
        }
        catch (OperationCanceledException) when (cts.IsCancellationRequested) { break; }
        catch (OllamaUnavailableException e)
        {
            // Not saved: this fiche is read again next time. Three in a row = stop, Ollama is down.
            Console.WriteLine($"{d.LastName} {d.FirstName} — {e.Message}");
            if (++ollamaFailures >= 3) { Console.Error.WriteLine("Ollama ne répond plus : arrêt."); break; }
            continue;
        }
        catch (Exception e)
        {
            result = MakeResult(d, false, e.Message, null, false, false, [], sw.Elapsed.TotalSeconds, opt.Model);
        }

        ollamaFailures = 0;
        store.Add(result);
        done++;
        Console.WriteLine($"[{done}/{todo.Count}] {d.LastName} {d.FirstName} ({d.UnitCode}) — " +
                          (result.Ok ? $"{(result.Reasons.Count > 0 ? "à vérifier" : "OK")}" : $"ERREUR : {result.Error}") +
                          $" — {result.Seconds:0}s");

        if (done % 10 == 0) ExcelReport.Write(store.All, outDir, opt.AppUrl, filesRoot, allDocsCount);
    }

    var path = ExcelReport.Write(store.All, outDir, opt.AppUrl, filesRoot, allDocsCount);
    // Figures for the fiches chosen in this run (one unit, or all).
    var mine = store.All.Where(r => docs.Any(d => d.DocumentId == r.DocumentId)).ToList();
    Console.WriteLine($"Excel : {path}");
    Console.WriteLine($"Lues : {mine.Count(r => r.Ok)}/{docs.Count}, dont {mine.Count(r => r.Ok && r.Reasons.Count > 0)} à vérifier ; erreurs : {mine.Count(r => !r.Ok)}.");
    if (done > 0)
    {
        var avg = store.All.Where(r => r.Ok).Select(r => r.Seconds).DefaultIfEmpty(0).Average();
        Console.WriteLine($"Temps moyen par fiche : {avg:0}s. Restant : {docs.Count - mine.Count} fiche(s).");
    }
}
return 0;

static FicheResult MakeResult(FicheDoc d, bool ok, string? error, Dictionary<string, string>? values, bool isFiche,
    bool signed, List<string> reasons, double seconds, string model) =>
    new(d.DocumentId, d.MemberId, d.LastName, d.FirstName, d.CardNumber, d.UnitCode, d.UnitName, d.Status,
        d.UploadedAt, d.Pages.Count, d.Pages[0].Path, ok, error, values, isFiche, signed, reasons, seconds,
        DateTime.Now, model, d.MemberBloodType);

// "06:00" → the next 06:00 from now (tomorrow when it has passed).
static DateTime NextOccurrence(TimeOnly t)
{
    var at = DateTime.Today.Add(t.ToTimeSpan());
    return at > DateTime.Now ? at : at.AddDays(1);
}

/// <summary>Command-line options.</summary>
record Options
{
    public string Site { get; init; } = Directory.GetCurrentDirectory();
    public string? Connection { get; init; }
    public string Out { get; init; } = @"C:\gndj-ocr";
    public string DocType { get; init; } = "FM";
    public string Model { get; init; } = "qwen2.5vl:7b";
    public string OllamaUrl { get; init; } = "http://127.0.0.1:11434";
    public string AppUrl { get; init; } = "https://gndj.org";
    public int Threads { get; init; } = 4;
    public int Trial { get; init; }
    public int Limit { get; init; }
    public TimeOnly? Until { get; init; }
    public int MaxPages { get; init; } = 3;
    public int MaxPixels { get; init; } = 1600;
    public int Dpi { get; init; } = 150;
    public bool AllMembers { get; init; }
    public bool RetryErrors { get; init; }
    public bool Check { get; init; }
    public bool ListUnits { get; init; }
    public bool Report { get; init; }
    public List<string> Units { get; init; } = [];
    public string? Export { get; init; }
    public string? Manifest { get; init; }

    public static Options? Parse(string[] a)
    {
        var o = new Options();
        for (var i = 0; i < a.Length; i++)
        {
            string Next() => i + 1 < a.Length ? a[++i] : throw new ArgumentException($"Valeur manquante après {a[i]}");
            int Int() => int.Parse(Next(), CultureInfo.InvariantCulture);
            try
            {
                o = a[i] switch
                {
                    "--site" => o with { Site = Next() },
                    "--connection" => o with { Connection = Next() },
                    "--out" => o with { Out = Next() },
                    "--doc-type" => o with { DocType = Next() },
                    "--model" => o with { Model = Next() },
                    "--ollama" => o with { OllamaUrl = Next() },
                    "--app-url" => o with { AppUrl = Next() },
                    "--threads" => o with { Threads = Int() },
                    "--essai" or "--trial" => o with { Trial = Int() },
                    "--limit" => o with { Limit = Int() },
                    "--until" => o with { Until = TimeOnly.ParseExact(Next(), "HH:mm", CultureInfo.InvariantCulture) },
                    "--max-pages" => o with { MaxPages = Int() },
                    "--max-px" => o with { MaxPixels = Int() },
                    "--dpi" => o with { Dpi = Int() },
                    "--all-members" => o with { AllMembers = true },
                    "--retry-errors" => o with { RetryErrors = true },
                    "--check" => o with { Check = true },
                    "--list-units" => o with { ListUnits = true },
                    "--report" => o with { Report = true },
                    "--unit" => o with { Units = [.. o.Units, .. Next().Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)] },
                    "--export" => o with { Export = Next() },
                    "--manifest" => o with { Manifest = Next() },
                    "-h" or "--help" => null,
                    _ => throw new ArgumentException($"Option inconnue : {a[i]}"),
                };
                if (o is null) return null;
            }
            catch (Exception e) when (e is ArgumentException or FormatException)
            {
                Console.Error.WriteLine(e.Message);
                return null;
            }
        }
        return o;
    }

    public static void PrintHelp() => Console.WriteLine("""
        FicheOcr — lecture hors ligne des fiches médicales scannées → Excel.

          --site <dossier>      dossier du site (uploads\ + appsettings.Production.json)   [dossier courant]
          --out <dossier>       dossier des résultats (hors du site !)                      [C:\gndj-ocr]
          --unit <code>         seulement cette unité (code, ex. C1 ; plusieurs : C1,T3)
          --list-units          liste les unités, avec les fiches lues et restantes
          --report              réécrit l'Excel à partir des résultats déjà lus (sans relire)
          --essai <N>           mode essai : N fiches, résultats dans <out>\essai
          --until HH:mm         s'arrête avant de commencer une fiche après cette heure (ex. 06:00)
          --limit <N>           lit au plus N fiches pendant ce passage
          --threads <N>         cœurs utilisés par le modèle                                  [4]
          --model <nom>         modèle Ollama                                                 [qwen2.5vl:7b]
          --check               vérifie la base, les fichiers et Ollama, sans rien lire
          --retry-errors        relit les fiches en erreur
          --all-members         inclut les anciens membres (par défaut : membres actifs)
          --export <dossier>    copie les fiches + un manifeste (pour lire sur un autre PC)
          --manifest <fichier>  lit les fiches d'un export au lieu de la base
          --connection <cs>     chaîne de connexion (sinon lue dans les appsettings du site)
          --doc-type <code>     type de document                                             [FM]
          --max-pages / --max-px / --dpi / --ollama <url> / --app-url <url>
        """);
}
