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

    // Assigns one side (A or B) for the given games, in game-number order: each game takes the first place of the
    // list that still has room (`used` = how many games already hold each place on that side — the games NOT being
    // reassigned). When no place is free, the game stays without a place.
    public static List<(Guid GameId, string? Place)> Assign(
        IReadOnlyList<CampPlace> places, IReadOnlyList<(Guid Id, int? Number, string Name)> games, Dictionary<string, int> used)
    {
        var free = places.ToDictionary(p => p.Name, p => p.Capacity - used.GetValueOrDefault(p.Name), StringComparer.OrdinalIgnoreCase);
        var result = new List<(Guid, string?)>();
        foreach (var g in games.OrderBy(g => g.Number ?? int.MaxValue).ThenBy(g => g.Name))
        {
            var pick = places.FirstOrDefault(p => free[p.Name] > 0);
            if (pick is not null) free[pick.Name]--;
            result.Add((g.Id, pick?.Name));
        }
        return result;
    }
}

// Auto-assign the places of a camp's games: lieu A, lieu B or both. Replace = redo every game; otherwise only the
// games without a place on that side get one (the places they already hold count as taken). Jeux edit rights.
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

        var noPlace = new List<string>();
        int RunSide(bool main)
        {
            var sidePlaces = places.Where(p => main ? p.A : p.B).ToList();
            string? Get(Domain.Entities.CampGame g) => main ? g.MainLocation : g.BackupLocation;
            var todo = games.Where(g => request.Replace || string.IsNullOrWhiteSpace(Get(g))).ToList();
            var used = games.Except(todo).Where(g => !string.IsNullOrWhiteSpace(Get(g)))
                .GroupBy(g => Get(g)!, StringComparer.OrdinalIgnoreCase).ToDictionary(x => x.Key, x => x.Count(), StringComparer.OrdinalIgnoreCase);
            var picks = CampPlaces.Assign(sidePlaces, todo.Select(g => (g.Id, g.Number, g.Name)).ToList(), used);
            var side = main ? "lieu A" : "lieu B";
            var count = 0;
            foreach (var (id, place) in picks)
            {
                var g = todo.First(x => x.Id == id);
                if (main) g.MainLocation = place; else g.BackupLocation = place;
                if (place is null) noPlace.Add($"{g.Name} ({side})");
                else count++;
            }
            return count;
        }

        var a = request.Main ? RunSide(true) : 0;
        var b = request.Backup ? RunSide(false) : 0;
        await context.SaveChangesAsync(ct);
        return Result<CampPlacesAssignResult>.Success(new CampPlacesAssignResult(a, b, noPlace));
    }
}
