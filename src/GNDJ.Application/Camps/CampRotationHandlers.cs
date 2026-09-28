using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

// Camp BP — the grand jeu rotation. The grid (which two familles play which game at each slot) is fixed
// (CampRotationGrid); per camp we store the slots' dates / hours and one row per match (which also holds its score).
// A game is linked to the grid by its Number (Jeu 1…25), which is how a match finds its name, places and étapistes.
//
// Who does what:
//   • Set up the rotation (generate, hours, rain plan): the commission with Jeux "edit" (or the CG).
//   • Look up where a famille is: anyone at the camp who runs it — CG, commission, CUs (camp.grade), étapistes.
//   • Score a match: the commission with Jeux "edit", or an étapiste of THAT game. View: Jeux "view" or étapiste.

// ─── DTOs ────────────────────────────────────────────────────────────────────
public record CampRotationSlotDto(int Number, DateOnly Date, TimeOnly StartTime, TimeOnly EndTime);
public record CampRotationGameDto(int Number, Guid? GameId, string? Name, string? MainLocation, string? BackupLocation, IReadOnlyList<string> Etapistes,
    string? BackupGameName = null);
public record CampRotationDto(bool Generated, bool UseBackupLocations, int FamillesCount, int ExistingFamilles,
    int MatchCount, int ScoredCount, IReadOnlyList<CampRotationSlotDto> Slots, IReadOnlyList<CampRotationGameDto> Games,
    DateTime Now);

public record CampPersonMatchDto(Guid MemberId, string FirstName, string LastName, string? UnitCode, string Role,
    int? FamilleNumber, string? FamilleName);

public record CampScheduleStepDto(int Slot, DateOnly Date, TimeOnly StartTime, TimeOnly EndTime, int GameNumber,
    string? GameName, string? MainLocation, string? BackupLocation, int Opponent, string? OpponentName, IReadOnlyList<string> Etapistes,
    string? BackupGameName = null); // played instead of GameName when Plan B is on
public record CampFamilleScheduleDto(int Number, string? Name, string? SuperFamille, string? PereName, string? PerePhone,
    string? MereName, string? MerePhone, int MemberCount, bool UseBackupLocations, DateTime Now, IReadOnlyList<CampScheduleStepDto> Steps);

public record CampMatchDto(Guid Id, int SlotNumber, DateOnly? Date, TimeOnly? StartTime, TimeOnly? EndTime, int GameNumber, string? GameName,
    int FamilleA, string? FamilleAName, int FamilleB, string? FamilleBName,
    string? RetardA, string? RetardB, string? Manche1, string? Manche2, int? EspritA, string? FirstArrived,
    int? PointsA, int? PointsB, int? EspritB, string? Enigme, DateTime? ScoredAt, string? ScoredByName, string? Source,
    bool CanEdit);

public record CampRankingRowDto(int Rank, int Number, string? Name, string? SuperFamille, int GamePoints, int Esprit, int Total,
    int Enigmes, int Played);
public record CampSuperFamilleRankingDto(string Name, int Familles, int Total, double Average);
public record CampRankingDto(int ScoredCount, int MatchCount, IReadOnlyList<CampRankingRowDto> Familles, IReadOnlyList<CampSuperFamilleRankingDto> SuperFamilles);

// ─── Access helpers ──────────────────────────────────────────────────────────
static class CampRotationAccess
{
    public const string NotGenerated = "La rotation n'a pas encore été générée pour ce camp.";

    // Game numbers of this camp where the caller is an étapiste (empty when not).
    public static async Task<HashSet<int>> EtapisteGameNumbersAsync(IApplicationDbContext context, ICurrentUserService u, Guid campId, CancellationToken ct)
    {
        if (u.MemberId is not { } me) return [];
        return (await context.CampGames
                .Where(g => g.CampId == campId && !g.IsDeleted && g.Number != null && g.Etapistes.Any(e => e.MemberId == me && !e.IsDeleted))
                .Select(g => g.Number!.Value).ToListAsync(ct))
            .ToHashSet();
    }

    // The lookup (where is a famille now) is for everyone running the camp: CG, commission, CUs, étapistes.
    public static async Task<bool> CanLookupAsync(IApplicationDbContext context, ICurrentUserService u, Guid campId, CancellationToken ct)
    {
        if (CampAccess.IsAdmin(u) || u.Permissions.Contains(Permissions.CampGrade)) return true;
        var a = await CampAccess.ForAsync(context, u, campId, ct);
        if (a.IsCommissionMember) return true;
        return (await EtapisteGameNumbersAsync(context, u, campId, ct)).Count > 0;
    }

    public static async Task<string> DisplayNameAsync(IApplicationDbContext context, ICurrentUserService u, CancellationToken ct)
    {
        if (u.MemberId is not { } me) return "Administrateur";
        return await context.Members.Where(m => m.Id == me).Select(m => m.FirstName + " " + m.LastName).FirstOrDefaultAsync(ct) ?? "—";
    }
}

// ─── Rotation setup ──────────────────────────────────────────────────────────
public record GetCampRotationQuery(Guid CampId) : IRequest<Result<CampRotationDto>>;
public class GetCampRotationQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetCampRotationQuery, Result<CampRotationDto>>
{
    public async ValueTask<Result<CampRotationDto>> Handle(GetCampRotationQuery request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Jeux, false, ct) is { } denied) return Result<CampRotationDto>.Failure(denied);
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.CampId, ct);
        if (camp is null) return Result<CampRotationDto>.Failure("Camp introuvable.");

        var slots = await context.CampRotationSlots.Where(s => s.CampId == camp.Id).OrderBy(s => s.Number)
            .Select(s => new CampRotationSlotDto(s.Number, s.Date, s.StartTime, s.EndTime)).ToListAsync(ct);
        var counts = await context.CampRotationMatches.Where(m => m.CampId == camp.Id)
            .GroupBy(_ => 1).Select(g => new { Total = g.Count(), Scored = g.Count(m => m.ScoredAt != null) }).FirstOrDefaultAsync(ct);
        var games = await CampRotationData.GamesByNumberAsync(context, camp.Id, ct);
        var existing = await context.Familles.CountAsync(f => f.CampId == camp.Id && !f.IsDeleted && f.Number <= CampRotationGrid.Familles, ct);

        var gameRows = Enumerable.Range(1, CampRotationGrid.Games).Select(n => games.TryGetValue(n, out var g)
            ? new CampRotationGameDto(n, g.Id, g.Name, g.MainLocation, g.BackupLocation, g.Etapistes, g.BackupGameName)
            : new CampRotationGameDto(n, null, null, null, null, [])).ToList();

        return Result<CampRotationDto>.Success(new CampRotationDto(slots.Count > 0, camp.UseBackupLocations, camp.FamillesCount, existing,
            counts?.Total ?? 0, counts?.Scored ?? 0, slots, gameRows, LebanonClock.Now));
    }
}

// Creates the 25 slots (15 on the first day, 10 on the second, default hours) and the 625 matches of the fixed grid.
// Refused once a score has been entered (regenerating would wipe it).
public record GenerateCampRotationCommand(Guid CampId, DateOnly FirstDay, DateOnly SecondDay) : IRequest<Result<bool>>;
public class GenerateCampRotationCommandValidator : AbstractValidator<GenerateCampRotationCommand>
{
    public GenerateCampRotationCommandValidator()
    {
        RuleFor(x => x.SecondDay).GreaterThanOrEqualTo(x => x.FirstDay).WithMessage("Le 2ème jour doit suivre le 1er jour.");
    }
}
public class GenerateCampRotationCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<GenerateCampRotationCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(GenerateCampRotationCommand request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Jeux, true, ct) is { } denied) return Result<bool>.Failure(denied);
        if (!await context.Camps.AnyAsync(c => c.Id == request.CampId && !c.IsArchived, ct)) return Result<bool>.Failure("Camp introuvable ou archivé.");
        if (await context.CampRotationMatches.AnyAsync(m => m.CampId == request.CampId && m.ScoredAt != null, ct))
            return Result<bool>.Failure("Des scores ont déjà été saisis : la rotation ne peut plus être régénérée. Modifiez seulement les horaires.");

        await context.CampRotationMatches.Where(m => m.CampId == request.CampId).ExecuteDeleteAsync(ct);
        await context.CampRotationSlots.Where(s => s.CampId == request.CampId).ExecuteDeleteAsync(ct);

        for (var s = 1; s <= CampRotationGrid.Slots; s++)
        {
            var (start, end) = CampRotationGrid.DefaultTimes[s - 1];
            context.CampRotationSlots.Add(new CampRotationSlot
            {
                CampId = request.CampId, Number = s, StartTime = start, EndTime = end,
                Date = s <= CampRotationGrid.FirstDaySlots ? request.FirstDay : request.SecondDay,
            });
            var pairs = CampRotationGrid.Pairs[s - 1];
            for (var g = 1; g <= CampRotationGrid.Games; g++)
                context.CampRotationMatches.Add(new CampRotationMatch
                {
                    CampId = request.CampId, SlotNumber = s, GameNumber = g, FamilleA = pairs[g - 1].A, FamilleB = pairs[g - 1].B,
                });
        }
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("GenerateRotation", "Camp", request.CampId, null,
            new { FirstDay = request.FirstDay.ToString("yyyy-MM-dd"), SecondDay = request.SecondDay.ToString("yyyy-MM-dd") }, ct);
        return Result<bool>.Success(true);
    }
}

// Dates / hours of the slots (the grid itself never changes).
public record CampRotationSlotInput(int Number, DateOnly Date, TimeOnly StartTime, TimeOnly EndTime);
public record UpdateCampRotationSlotsCommand(Guid CampId, List<CampRotationSlotInput> Slots) : IRequest<Result<bool>>;
public class UpdateCampRotationSlotsCommandValidator : AbstractValidator<UpdateCampRotationSlotsCommand>
{
    public UpdateCampRotationSlotsCommandValidator()
    {
        RuleFor(x => x.Slots).NotEmpty().Must(s => s.Count <= CampRotationGrid.Slots);
        RuleForEach(x => x.Slots).Must(s => s.EndTime > s.StartTime).WithMessage("L'heure de fin doit suivre l'heure de début.");
    }
}
public class UpdateCampRotationSlotsCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<UpdateCampRotationSlotsCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateCampRotationSlotsCommand request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Jeux, true, ct) is { } denied) return Result<bool>.Failure(denied);
        var slots = await context.CampRotationSlots.Where(s => s.CampId == request.CampId).ToListAsync(ct);
        if (slots.Count == 0) return Result<bool>.Failure(CampRotationAccess.NotGenerated);
        foreach (var input in request.Slots)
        {
            var s = slots.FirstOrDefault(x => x.Number == input.Number);
            if (s is null) continue;
            s.Date = input.Date; s.StartTime = input.StartTime; s.EndTime = input.EndTime;
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// Rain plan on/off for the whole camp: the lookup and passports show the backup places.
public record SetCampBackupLocationsCommand(Guid CampId, bool UseBackup) : IRequest<Result<bool>>;
public class SetCampBackupLocationsCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<SetCampBackupLocationsCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetCampBackupLocationsCommand request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Jeux, true, ct) is { } denied) return Result<bool>.Failure(denied);
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.CampId, ct);
        if (camp is null) return Result<bool>.Failure("Camp introuvable.");
        camp.UseBackupLocations = request.UseBackup;
        await context.SaveChangesAsync(ct);
        await audit.LogAsync(request.UseBackup ? "PlanBOn" : "PlanBOff", "Camp", camp.Id, null, new { camp.Name }, ct);
        return Result<bool>.Success(true);
    }
}

// ─── Lookup: where is a famille? ─────────────────────────────────────────────
// Search a person (member of a famille, or its Père / Mère) by name — or a famille by its number.
public record SearchCampPeopleQuery(Guid CampId, string Q) : IRequest<Result<IReadOnlyList<CampPersonMatchDto>>>;
public class SearchCampPeopleQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<SearchCampPeopleQuery, Result<IReadOnlyList<CampPersonMatchDto>>>
{
    public async ValueTask<Result<IReadOnlyList<CampPersonMatchDto>>> Handle(SearchCampPeopleQuery request, CancellationToken ct)
    {
        if (!await CampRotationAccess.CanLookupAsync(context, currentUser, request.CampId, ct)) return Result<IReadOnlyList<CampPersonMatchDto>>.Failure(CampAccess.Denied);
        var q = (request.Q ?? "").Trim().ToLowerInvariant();
        if (q.Length < 2 && !int.TryParse(q, out _)) return Result<IReadOnlyList<CampPersonMatchDto>>.Success([]);

        var familles = await context.Familles.Where(f => f.CampId == request.CampId && !f.IsDeleted)
            .Select(f => new { f.Id, f.Number, f.Name, f.PereMemberId, f.MereMemberId }).ToListAsync(ct);

        var results = new List<CampPersonMatchDto>();
        // A number = the famille itself (shown as its Père / Mère or a placeholder row).
        if (int.TryParse(q, out var num))
        {
            var f = familles.FirstOrDefault(x => x.Number == num);
            if (f != null) results.Add(new CampPersonMatchDto(Guid.Empty, "Famille", num.ToString(), null, "Famille", f.Number, f.Name));
            return Result<IReadOnlyList<CampPersonMatchDto>>.Success(results);
        }

        var members = await context.CampParticipants
            .Where(p => p.CampId == request.CampId && !p.IsDeleted && p.IsAttending && p.FamilleId != null
                && (DbFns.Unaccent((p.Member.FirstName + " " + p.Member.LastName).ToLower()).Contains(DbFns.Unaccent(q))
                    || DbFns.Unaccent((p.Member.LastName + " " + p.Member.FirstName).ToLower()).Contains(DbFns.Unaccent(q))))
            .OrderBy(p => p.Member.LastName).ThenBy(p => p.Member.FirstName).Take(30)
            .Select(p => new
            {
                p.MemberId, p.Member.FirstName, p.Member.LastName, FamId = p.FamilleId!.Value,
                UnitCode = p.Member.Assignments.Where(a => !a.IsDeleted && a.EndDate == null).Select(a => a.Unit.Code).FirstOrDefault(),
            })
            .ToListAsync(ct);
        foreach (var m in members)
        {
            var f = familles.FirstOrDefault(x => x.Id == m.FamId);
            results.Add(new CampPersonMatchDto(m.MemberId, m.FirstName, m.LastName, m.UnitCode, "Membre", f?.Number, f?.Name));
        }

        // Père / Mère of a famille (they aren't participants).
        var leaderIds = familles.SelectMany(f => new[] { f.PereMemberId, f.MereMemberId }).Where(x => x != null).Select(x => x!.Value).ToList();
        var leaders = await context.Members
            .Where(m => leaderIds.Contains(m.Id)
                && (DbFns.Unaccent((m.FirstName + " " + m.LastName).ToLower()).Contains(DbFns.Unaccent(q))
                    || DbFns.Unaccent((m.LastName + " " + m.FirstName).ToLower()).Contains(DbFns.Unaccent(q))))
            .Select(m => new
            {
                m.Id, m.FirstName, m.LastName,
                UnitCode = m.Assignments.Where(a => !a.IsDeleted && a.EndDate == null).Select(a => a.Unit.Code).FirstOrDefault(),
            })
            .ToListAsync(ct);
        foreach (var l in leaders)
        {
            var f = familles.First(x => x.PereMemberId == l.Id || x.MereMemberId == l.Id);
            results.Add(new CampPersonMatchDto(l.Id, l.FirstName, l.LastName, l.UnitCode, f.PereMemberId == l.Id ? "Père" : "Mère", f.Number, f.Name));
        }
        return Result<IReadOnlyList<CampPersonMatchDto>>.Success(results.OrderBy(r => r.LastName).ThenBy(r => r.FirstName).ToList());
    }
}

// The famille's whole route (its 25 steps: time, game, place, opponent) + its Père / Mère with a phone to call.
// The screen picks the step in progress, the one before and the one after from `Now` (camp time, Lebanon).
public record GetFamilleScheduleQuery(Guid CampId, int FamilleNumber) : IRequest<Result<CampFamilleScheduleDto>>;
public class GetFamilleScheduleQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetFamilleScheduleQuery, Result<CampFamilleScheduleDto>>
{
    public async ValueTask<Result<CampFamilleScheduleDto>> Handle(GetFamilleScheduleQuery request, CancellationToken ct)
    {
        if (!await CampRotationAccess.CanLookupAsync(context, currentUser, request.CampId, ct)) return Result<CampFamilleScheduleDto>.Failure(CampAccess.Denied);
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.CampId, ct);
        if (camp is null) return Result<CampFamilleScheduleDto>.Failure("Camp introuvable.");

        var fam = await context.Familles.Where(f => f.CampId == camp.Id && !f.IsDeleted && f.Number == request.FamilleNumber)
            .Select(f => new { f.Id, f.Number, f.Name, SuperFamille = f.SuperFamille != null ? f.SuperFamille.Name : null, f.PereMemberId, f.MereMemberId })
            .FirstOrDefaultAsync(ct);
        if (fam is null) return Result<CampFamilleScheduleDto>.Failure("Famille introuvable.");

        var slots = await context.CampRotationSlots.Where(s => s.CampId == camp.Id).ToDictionaryAsync(s => s.Number, ct);
        if (slots.Count == 0) return Result<CampFamilleScheduleDto>.Failure(CampRotationAccess.NotGenerated);
        var matches = await context.CampRotationMatches
            .Where(m => m.CampId == camp.Id && (m.FamilleA == fam.Number || m.FamilleB == fam.Number))
            .OrderBy(m => m.SlotNumber).ToListAsync(ct);
        var games = await CampRotationData.GamesByNumberAsync(context, camp.Id, ct);
        var names = await CampRotationData.FamilleNamesAsync(context, camp.Id, ct);

        var leaderIds = new[] { fam.PereMemberId, fam.MereMemberId }.Where(x => x != null).Select(x => x!.Value).ToList();
        var leaders = await context.Members.Where(m => leaderIds.Contains(m.Id))
            .Select(m => new
            {
                m.Id, Name = m.FirstName + " " + m.LastName,
                Phone = m.Phones.Where(p => !p.IsDeleted).OrderByDescending(p => p.IsPrimary).Select(p => (p.CountryCode + " " + p.Number).Trim()).FirstOrDefault(),
            })
            .ToListAsync(ct);
        var pere = leaders.FirstOrDefault(l => l.Id == fam.PereMemberId);
        var mere = leaders.FirstOrDefault(l => l.Id == fam.MereMemberId);
        var memberCount = await context.CampParticipants.CountAsync(p => p.FamilleId == fam.Id && !p.IsDeleted && p.IsAttending, ct);

        var steps = matches.Where(m => slots.ContainsKey(m.SlotNumber)).Select(m =>
        {
            var s = slots[m.SlotNumber];
            var opp = m.FamilleA == fam.Number ? m.FamilleB : m.FamilleA;
            games.TryGetValue(m.GameNumber, out var g);
            return new CampScheduleStepDto(m.SlotNumber, s.Date, s.StartTime, s.EndTime, m.GameNumber, g?.Name, g?.MainLocation, g?.BackupLocation,
                opp, names.GetValueOrDefault(opp), g?.Etapistes ?? [], g?.BackupGameName);
        }).ToList();

        return Result<CampFamilleScheduleDto>.Success(new CampFamilleScheduleDto(fam.Number, fam.Name, fam.SuperFamille,
            pere?.Name, pere?.Phone, mere?.Name, mere?.Phone, memberCount, camp.UseBackupLocations, LebanonClock.Now, steps));
    }
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
// The matches of a camp (optionally one game or one slot), with their score. An étapiste only sees the matches of
// their own game(s); the commission (Jeux view) sees them all.
public record GetCampMatchesQuery(Guid CampId, int? GameNumber, int? SlotNumber) : IRequest<Result<IReadOnlyList<CampMatchDto>>>;
public class GetCampMatchesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetCampMatchesQuery, Result<IReadOnlyList<CampMatchDto>>>
{
    public async ValueTask<Result<IReadOnlyList<CampMatchDto>>> Handle(GetCampMatchesQuery request, CancellationToken ct)
    {
        var viewAll = await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Jeux, false, ct) is null;
        var editAll = viewAll && await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Jeux, true, ct) is null;
        var mine = await CampRotationAccess.EtapisteGameNumbersAsync(context, currentUser, request.CampId, ct);
        if (!viewAll && mine.Count == 0) return Result<IReadOnlyList<CampMatchDto>>.Failure(CampAccess.Denied);
        var archived = await context.Camps.Where(c => c.Id == request.CampId).Select(c => c.IsArchived).FirstOrDefaultAsync(ct);

        var query = context.CampRotationMatches.Where(m => m.CampId == request.CampId);
        if (request.GameNumber is int gn) query = query.Where(m => m.GameNumber == gn);
        if (request.SlotNumber is int sn) query = query.Where(m => m.SlotNumber == sn);
        if (!viewAll) query = query.Where(m => mine.Contains(m.GameNumber));
        var matches = await query.OrderBy(m => m.GameNumber).ThenBy(m => m.SlotNumber).ToListAsync(ct);

        var slots = await context.CampRotationSlots.Where(s => s.CampId == request.CampId).ToDictionaryAsync(s => s.Number, ct);
        var games = await CampRotationData.GamesByNumberAsync(context, request.CampId, ct);
        var names = await CampRotationData.FamilleNamesAsync(context, request.CampId, ct);

        return Result<IReadOnlyList<CampMatchDto>>.Success(matches.Select(m =>
        {
            slots.TryGetValue(m.SlotNumber, out var s);
            games.TryGetValue(m.GameNumber, out var g);
            return new CampMatchDto(m.Id, m.SlotNumber, s?.Date, s?.StartTime, s?.EndTime, m.GameNumber, g?.Name,
                m.FamilleA, names.GetValueOrDefault(m.FamilleA), m.FamilleB, names.GetValueOrDefault(m.FamilleB),
                m.RetardA, m.RetardB, m.Manche1, m.Manche2, m.EspritA, m.FirstArrived,
                m.PointsA, m.PointsB, m.EspritB, m.Enigme, m.ScoredAt, m.ScoredByName, m.Source,
                !archived && (editAll || mine.Contains(m.GameNumber)));
        }).ToList());
    }
}

// Enter (or correct) the score of a match. Source: "online" when filled on the spot, "paper" when typed from the
// paper sheet afterwards. The points are always recomputed here from the inputs (the client only previews them).
public record SaveCampMatchScoreCommand(Guid MatchId, string? RetardA, string? RetardB, string? Manche1, string? Manche2,
    int? EspritA, string? FirstArrived, string Source) : IRequest<Result<CampScoreResult>>;
public class SaveCampMatchScoreCommandValidator : AbstractValidator<SaveCampMatchScoreCommand>
{
    public SaveCampMatchScoreCommandValidator()
    {
        RuleFor(x => x.Source).Must(s => s is "online" or "paper").WithMessage("Source invalide.");
        RuleFor(x => x.RetardA).Must(v => v is null || CampLateness.All.Contains(v)).WithMessage("Retard invalide.");
        RuleFor(x => x.RetardB).Must(v => v is null || CampLateness.All.Contains(v)).WithMessage("Retard invalide.");
        RuleFor(x => x.Manche1).Must(v => v is null || CampMatchSide.All.Contains(v)).WithMessage("Manche invalide.");
        RuleFor(x => x.Manche2).Must(v => v is null || CampMatchSide.All.Contains(v)).WithMessage("Manche invalide.");
        RuleFor(x => x.FirstArrived).Must(v => v is null or CampMatchSide.A or CampMatchSide.B).WithMessage("Valeur invalide.");
        RuleFor(x => x.EspritA).InclusiveBetween(0, 5);
    }
}
public class SaveCampMatchScoreCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<SaveCampMatchScoreCommand, Result<CampScoreResult>>
{
    public async ValueTask<Result<CampScoreResult>> Handle(SaveCampMatchScoreCommand request, CancellationToken ct)
    {
        var m = await context.CampRotationMatches.FirstOrDefaultAsync(x => x.Id == request.MatchId, ct);
        if (m is null) return Result<CampScoreResult>.Failure("Match introuvable.");
        if (await CampMatchEdit.DenyAsync(context, currentUser, m, ct) is { } denied) return Result<CampScoreResult>.Failure(denied);

        var plan = CampScoring.Plan(request.RetardA, request.RetardB);
        var input = new CampScoreInput(request.RetardA ?? CampLateness.None, request.RetardB ?? CampLateness.None,
            plan.Manche1Stake is null ? null : request.Manche1, plan.Manche2Stake is null ? null : request.Manche2,
            request.EspritA, request.FirstArrived);
        var (result, error) = CampScoring.Compute(input);
        if (result is null) return Result<CampScoreResult>.Failure(error!);

        var old = m.ScoredAt is null ? null : new { m.PointsA, m.PointsB, m.EspritA, m.Enigme };
        m.RetardA = input.RetardA; m.RetardB = input.RetardB; m.Manche1 = input.Manche1; m.Manche2 = input.Manche2;
        m.EspritA = result.EspritA; m.EspritB = result.EspritB; m.FirstArrived = input.FirstArrived;
        m.PointsA = result.PointsA; m.PointsB = result.PointsB; m.Enigme = result.Enigme;
        m.ScoredAt = DateTime.UtcNow; m.Source = request.Source;
        m.ScoredByName = await CampRotationAccess.DisplayNameAsync(context, currentUser, ct);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync(old is null ? "Score" : "ScoreCorrection", "CampMatch", m.Id, old,
            new { Jeu = m.GameNumber, Etape = m.SlotNumber, Familles = $"{m.FamilleA} – {m.FamilleB}", m.PointsA, m.PointsB, m.EspritA, m.EspritB, m.Enigme, m.Source }, ct);
        return Result<CampScoreResult>.Success(result);
    }
}

// Remove a score entered by mistake (the match goes back to "not scored").
public record ClearCampMatchScoreCommand(Guid MatchId) : IRequest<Result<bool>>;
public class ClearCampMatchScoreCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<ClearCampMatchScoreCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ClearCampMatchScoreCommand request, CancellationToken ct)
    {
        var m = await context.CampRotationMatches.FirstOrDefaultAsync(x => x.Id == request.MatchId, ct);
        if (m is null) return Result<bool>.Failure("Match introuvable.");
        if (await CampMatchEdit.DenyAsync(context, currentUser, m, ct) is { } denied) return Result<bool>.Failure(denied);
        var old = new { m.PointsA, m.PointsB, m.EspritA, m.Enigme };
        m.RetardA = m.RetardB = m.Manche1 = m.Manche2 = m.FirstArrived = m.Enigme = m.Source = m.ScoredByName = null;
        m.EspritA = m.EspritB = m.PointsA = m.PointsB = null;
        m.ScoredAt = null;
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("ScoreCleared", "CampMatch", m.Id, old, new { Jeu = m.GameNumber, Etape = m.SlotNumber }, ct);
        return Result<bool>.Success(true);
    }
}

static class CampMatchEdit
{
    // Null when the caller may edit this match's score: commission with Jeux "edit", or an étapiste of its game.
    public static async Task<string?> DenyAsync(IApplicationDbContext context, ICurrentUserService u, CampRotationMatch m, CancellationToken ct)
    {
        if (await context.Camps.Where(c => c.Id == m.CampId).Select(c => c.IsArchived).FirstOrDefaultAsync(ct))
            return "Ce camp est archivé.";
        if (await CampAccess.DenyAsync(context, u, m.CampId, CampArea.Jeux, true, ct) is null) return null;
        return (await CampRotationAccess.EtapisteGameNumbersAsync(context, u, m.CampId, ct)).Contains(m.GameNumber)
            ? null : "Seuls les étapistes de ce jeu et la commission peuvent saisir ce score.";
    }
}

// Ranking of the familles (game points + esprit), with the énigmes won — and by superfamille when there are some.
public record GetCampRankingQuery(Guid CampId) : IRequest<Result<CampRankingDto>>;
public class GetCampRankingQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetCampRankingQuery, Result<CampRankingDto>>
{
    public async ValueTask<Result<CampRankingDto>> Handle(GetCampRankingQuery request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Jeux, false, ct) is { } denied) return Result<CampRankingDto>.Failure(denied);
        var matches = await context.CampRotationMatches.Where(m => m.CampId == request.CampId).ToListAsync(ct);
        var familles = await context.Familles.Where(f => f.CampId == request.CampId && !f.IsDeleted && f.Number <= CampRotationGrid.Familles)
            .Select(f => new { f.Number, f.Name, SuperFamille = f.SuperFamille != null ? f.SuperFamille.Name : null })
            .ToListAsync(ct);

        var rows = familles.Select(f =>
        {
            int pts = 0, esp = 0, enig = 0, played = 0;
            foreach (var m in matches.Where(x => x.ScoredAt != null))
            {
                if (m.FamilleA == f.Number) { pts += m.PointsA ?? 0; esp += m.EspritA ?? 0; if (m.Enigme == CampMatchSide.A) enig++; played++; }
                else if (m.FamilleB == f.Number) { pts += m.PointsB ?? 0; esp += m.EspritB ?? 0; if (m.Enigme == CampMatchSide.B) enig++; played++; }
            }
            return new { f.Number, f.Name, f.SuperFamille, Pts = pts, Esp = esp, Enig = enig, Played = played };
        })
        .OrderByDescending(r => r.Pts + r.Esp).ThenByDescending(r => r.Pts).ThenBy(r => r.Number).ToList();

        // Rank with ties sharing a place (1, 2, 2, 4…).
        var ranked = new List<CampRankingRowDto>();
        for (var i = 0; i < rows.Count; i++)
        {
            var r = rows[i];
            var rank = i > 0 && rows[i - 1].Pts + rows[i - 1].Esp == r.Pts + r.Esp ? ranked[i - 1].Rank : i + 1;
            ranked.Add(new CampRankingRowDto(rank, r.Number, r.Name, r.SuperFamille, r.Pts, r.Esp, r.Pts + r.Esp, r.Enig, r.Played));
        }
        var supers = ranked.Where(r => r.SuperFamille != null).GroupBy(r => r.SuperFamille!)
            .Select(g => new CampSuperFamilleRankingDto(g.Key, g.Count(), g.Sum(x => x.Total), Math.Round(g.Average(x => x.Total), 1)))
            .OrderByDescending(s => s.Average).ToList();

        return Result<CampRankingDto>.Success(new CampRankingDto(matches.Count(m => m.ScoredAt != null), matches.Count, ranked, supers));
    }
}

// ─── Shared data ─────────────────────────────────────────────────────────────
public record CampGameInfo(Guid Id, string Name, string? MainLocation, string? BackupLocation, IReadOnlyList<string> Etapistes, string? BackupGameName = null);

static class CampRotationData
{
    public static async Task<Dictionary<int, CampGameInfo>> GamesByNumberAsync(IApplicationDbContext context, Guid campId, CancellationToken ct)
    {
        var games = await context.CampGames.Where(g => g.CampId == campId && !g.IsDeleted && g.Number != null)
            .Select(g => new
            {
                Number = g.Number!.Value, g.Id, g.Name, g.MainLocation, g.BackupLocation, g.BackupGameName,
                Etapistes = g.Etapistes.Where(e => !e.IsDeleted).Select(e => e.Member.FirstName + " " + e.Member.LastName).ToList(),
            })
            .ToListAsync(ct);
        return games.GroupBy(g => g.Number).ToDictionary(x => x.Key, x =>
        {
            var g = x.First();
            return new CampGameInfo(g.Id, g.Name, g.MainLocation, g.BackupLocation, g.Etapistes, g.BackupGameName);
        });
    }

    public static async Task<Dictionary<int, string?>> FamilleNamesAsync(IApplicationDbContext context, Guid campId, CancellationToken ct) =>
        (await context.Familles.Where(f => f.CampId == campId && !f.IsDeleted).Select(f => new { f.Number, f.Name }).ToListAsync(ct))
            .GroupBy(f => f.Number).ToDictionary(g => g.Key, g => g.First().Name);
}

// ─── Printouts ───────────────────────────────────────────────────────────────
// Kind "passports" = every famille (or one, FamilleNumber) with its route; "scoresheets" = every game (or one,
// GameNumber) with its matches, to score on paper. An étapiste may print the score sheet of their own game.
public record CampPdf(byte[] Data, string FileName);
public record GenerateCampRotationPdfQuery(Guid CampId, string Kind, int? Number) : IRequest<Result<CampPdf>>;
public class GenerateCampRotationPdfQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser, ICampRotationReportService reports)
    : IRequestHandler<GenerateCampRotationPdfQuery, Result<CampPdf>>
{
    public async ValueTask<Result<CampPdf>> Handle(GenerateCampRotationPdfQuery request, CancellationToken ct)
    {
        var canView = await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Jeux, false, ct) is null;
        var mine = await CampRotationAccess.EtapisteGameNumbersAsync(context, currentUser, request.CampId, ct);
        var ownSheet = request.Kind == "scoresheets" && request.Number is int n0 && mine.Contains(n0);
        if (!canView && !ownSheet) return Result<CampPdf>.Failure(CampAccess.Denied);

        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.CampId, ct);
        if (camp is null) return Result<CampPdf>.Failure("Camp introuvable.");
        var slots = await context.CampRotationSlots.Where(s => s.CampId == camp.Id).ToDictionaryAsync(s => s.Number, ct);
        if (slots.Count == 0) return Result<CampPdf>.Failure(CampRotationAccess.NotGenerated);
        var matches = await context.CampRotationMatches.Where(m => m.CampId == camp.Id).ToListAsync(ct);
        var games = await CampRotationData.GamesByNumberAsync(context, camp.Id, ct);

        if (request.Kind == "scoresheets")
        {
            var numbers = request.Number is int gn ? [gn] : Enumerable.Range(1, CampRotationGrid.Games).ToList();
            var sheets = numbers.Select(num =>
            {
                games.TryGetValue(num, out var g);
                var rows = matches.Where(m => m.GameNumber == num && slots.ContainsKey(m.SlotNumber))
                    .Select(m => { var s = slots[m.SlotNumber]; return new CampScoreSheetRow(m.SlotNumber, s.Date, s.StartTime, s.EndTime, m.FamilleA, m.FamilleB); })
                    .ToList();
                return new CampScoreSheetGame(num, g?.Name, g?.MainLocation, g?.BackupLocation, g?.Etapistes ?? [], rows, g?.BackupGameName);
            }).ToList();
            var file = request.Number is int one ? $"Pointage - Jeu {one}.pdf" : "Pointage - tous les jeux.pdf";
            return Result<CampPdf>.Success(new CampPdf(reports.ScoreSheets(camp.Name, sheets), file));
        }

        var fams = await context.Familles.Where(f => f.CampId == camp.Id && !f.IsDeleted && f.Number <= camp.FamillesCount
                && (request.Number == null || f.Number == request.Number))
            .OrderBy(f => f.Number)
            .Select(f => new { f.Id, f.Number, f.Name, f.Description, Super = f.SuperFamille != null ? f.SuperFamille.Name : null, f.PereMemberId, f.MereMemberId })
            .ToListAsync(ct);
        var famIds = fams.Select(f => f.Id).ToList();
        var members = await context.CampParticipants
            .Where(p => p.FamilleId != null && famIds.Contains(p.FamilleId.Value) && !p.IsDeleted && p.IsAttending)
            .Select(p => new { Fam = p.FamilleId!.Value, Name = p.Member.FirstName + " " + p.Member.LastName, p.Member.LastName, p.Member.FirstName })
            .ToListAsync(ct);
        var leaderIds = fams.SelectMany(f => new[] { f.PereMemberId, f.MereMemberId }).Where(x => x != null).Select(x => x!.Value).ToList();
        var leaderNames = await context.Members.Where(m => leaderIds.Contains(m.Id)).ToDictionaryAsync(m => m.Id, m => m.FirstName + " " + m.LastName, ct);

        var passports = fams.Select(f => new CampPassportFamille(f.Number, f.Name, f.Description, f.Super,
            f.PereMemberId is { } p ? leaderNames.GetValueOrDefault(p) : null,
            f.MereMemberId is { } m ? leaderNames.GetValueOrDefault(m) : null,
            members.Where(x => x.Fam == f.Id).OrderBy(x => x.LastName).ThenBy(x => x.FirstName).Select(x => x.Name).ToList(),
            matches.Where(x => (x.FamilleA == f.Number || x.FamilleB == f.Number) && slots.ContainsKey(x.SlotNumber)).OrderBy(x => x.SlotNumber)
                .Select(x =>
                {
                    var s = slots[x.SlotNumber];
                    games.TryGetValue(x.GameNumber, out var g);
                    var place = camp.UseBackupLocations ? g?.BackupLocation ?? g?.MainLocation : g?.MainLocation;
                    // Plan B: an étape with a backup game plays it instead.
                    var gameName = camp.UseBackupLocations && g?.BackupGameName is { } bg ? bg : g?.Name;
                    return new CampPassportStep(x.SlotNumber, s.Date, s.StartTime, s.EndTime, x.GameNumber, gameName, place,
                        x.FamilleA == f.Number ? x.FamilleB : x.FamilleA);
                }).ToList())).ToList();
        if (passports.Count == 0) return Result<CampPdf>.Failure("Aucune famille pour l'instant.");
        var name = request.Number is int fn ? $"Passeport - Famille {fn}.pdf" : "Passeports des familles.pdf";
        return Result<CampPdf>.Success(new CampPdf(reports.Passports(camp.Name, camp.UseBackupLocations, passports), name));
    }
}
