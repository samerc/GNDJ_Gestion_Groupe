using System.Text.Json;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

// Camp BP — the places where the games are played (setting camp.places, the same every year; edited in
// Paramètres → Camp BP). A place can serve as lieu A (main) and/or lieu B (bad-weather repli) and has a
// capacity = how many games it hosts at the same time (all 25 games run in every step, so e.g. a big préau may
// hold two). A camp's games keep their own chosen places (text), so the
// list can change without touching past camps.
public record CampPlace(string Name, bool A, bool B, int Capacity);

public static class CampPlaces
{
    public const string SettingKey = "camp.places";

    public static List<CampPlace> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return [];
            var list = new List<CampPlace>();
            foreach (var e in doc.RootElement.EnumerateArray())
            {
                if (e.ValueKind != JsonValueKind.Object) continue;
                var name = e.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString()?.Trim() : null;
                // Same rules as a game's place (≤150, no HTML) — the names are copied onto games.
                if (string.IsNullOrEmpty(name) || name.Length > 150 || name.IndexOfAny(['<', '>']) >= 0) continue;
                if (list.Any(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase))) continue;
                bool Flag(string k) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.True;
                int Int(string k, int def) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i) ? i : def;
                list.Add(new CampPlace(name, Flag("a"), Flag("b"), Math.Clamp(Int("capacity", 1), 1, 25)));
            }
            return list;
        }
        catch (JsonException) { return []; }
    }

    public static async Task<List<CampPlace>> LoadAsync(IApplicationDbContext context, CancellationToken ct) =>
        Parse(await context.Settings.Where(s => s.Key == SettingKey).Select(s => s.Value).FirstOrDefaultAsync(ct));

}

// Auto-assign the places of a camp's games: lieu A, lieu B or both. Replace = redo every game; otherwise only the
// games without a place on that side get one (the places they already hold count as taken). A place that is both
// lieu A and lieu B is put on both sides of the game (when the other side is free). Jeux edit rights.
public record AutoAssignCampPlacesCommand(Guid CampId, bool Main, bool Backup, bool Replace) : IRequest<Result<CampPlacesAssignResult>>;
public record CampPlacesAssignResult(int AssignedMain, int AssignedBackup, IReadOnlyList<string> NoPlace);

public class AutoAssignCampPlacesCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<AutoAssignCampPlacesCommand, Result<CampPlacesAssignResult>>
{
    public async ValueTask<Result<CampPlacesAssignResult>> Handle(AutoAssignCampPlacesCommand request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Jeux, true, ct) is { } denied)
            return Result<CampPlacesAssignResult>.Failure(denied);
        if (!request.Main && !request.Backup) return Result<CampPlacesAssignResult>.Failure("Choisissez le lieu A, le lieu B ou les deux.");
        if (await context.Camps.AnyAsync(c => c.Id == request.CampId && c.IsArchived, ct))
            return Result<CampPlacesAssignResult>.Failure("Ce camp est archivé.");

        var places = await CampPlaces.LoadAsync(context, ct);
        if (request.Main && !places.Any(p => p.A)) return Result<CampPlacesAssignResult>.Failure("Aucun lieu A défini : ajoutez les lieux dans Paramètres → Camp BP.");
        if (request.Backup && !places.Any(p => p.B)) return Result<CampPlacesAssignResult>.Failure("Aucun lieu B défini : ajoutez les lieux dans Paramètres → Camp BP.");
        var games = await context.CampGames.Where(g => g.CampId == request.CampId && !g.IsDeleted).ToListAsync(ct);
        if (games.Count == 0) return Result<CampPlacesAssignResult>.Failure("Aucun jeu dans ce camp.");

        // Which games get a place on each side in this run: every game when replacing, else those without one.
        // Their current place on that side is cleared first, so the capacity count below only sees the kept ones.
        static string? Get(Domain.Entities.CampGame g, bool main) => main ? g.MainLocation : g.BackupLocation;
        static void Set(Domain.Entities.CampGame g, bool main, string? v) { if (main) g.MainLocation = v; else g.BackupLocation = v; }
        var todoA = request.Main ? games.Where(g => request.Replace || string.IsNullOrWhiteSpace(g.MainLocation)).ToHashSet() : [];
        var todoB = request.Backup ? games.Where(g => request.Replace || string.IsNullOrWhiteSpace(g.BackupLocation)).ToHashSet() : [];
        foreach (var g in todoA) g.MainLocation = null;
        foreach (var g in todoB) g.BackupLocation = null;

        // Games currently holding a place on a side (live, so mirrored places count too).
        int Occupied(string place, bool main) => games.Count(g => string.Equals(Get(g, main), place, StringComparison.OrdinalIgnoreCase));
        bool HasRoom(CampPlace p, bool main) => Occupied(p.Name, main) < p.Capacity;

        var noPlace = new List<string>();
        int a = 0, b = 0;
        // In game-number order, each game takes the first place of the list (usable on that side) with room left.
        // A place that is BOTH lieu A and lieu B also goes on the game's other side when that side is being assigned
        // in this run or is still empty (never over a place chosen by hand), if it has room there too.
        void RunSide(bool main, HashSet<Domain.Entities.CampGame> todo)
        {
            var sidePlaces = places.Where(p => main ? p.A : p.B).ToList();
            foreach (var g in todo.OrderBy(g => g.Number ?? int.MaxValue).ThenBy(g => g.Name))
            {
                if (!string.IsNullOrWhiteSpace(Get(g, main))) continue; // already filled by a mirror from the other side
                var pick = sidePlaces.FirstOrDefault(p => HasRoom(p, main));
                if (pick is null) { noPlace.Add($"{g.Name} ({(main ? "lieu A" : "lieu B")})"); continue; }
                Set(g, main, pick.Name);
                if (main) a++; else b++;
                var other = !main;
                // (The other side is empty when it's being redone in this run — its old place was cleared above.)
                if (pick.A && pick.B && string.IsNullOrWhiteSpace(Get(g, other)) && HasRoom(pick, other))
                {
                    Set(g, other, pick.Name);
                    if (other) a++; else b++;
                }
            }
        }

        // A first, then B (games that got their B by mirroring are skipped).
        if (request.Main) RunSide(true, todoA);
        if (request.Backup) RunSide(false, todoB);
        await context.SaveChangesAsync(ct);
        return Result<CampPlacesAssignResult>.Success(new CampPlacesAssignResult(a, b, noPlace));
    }
}
