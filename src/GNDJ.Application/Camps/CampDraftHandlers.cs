using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

// ─── DTOs ────────────────────────────────────────────────────────────────────
public record CampFamilleMemberDto(Guid ParticipantId, Guid MemberId, string FirstName, string LastName,
    string? Gender, string? Branche, string? UnitName, double? Note, string Role);

public record CampFamilleDto(Guid Id, int Number, string? Name,
    Guid? PereMemberId, string? PereName, Guid? MereMemberId, string? MereName,
    int Size, double NoteSum, double AvgNote, int Boys, int Girls,
    IReadOnlyDictionary<string, int> BranchCounts, IReadOnlyList<CampFamilleMemberDto> Members);

public record PereMereCandidateDto(Guid MemberId, string FirstName, string LastName, string? Branche, string? Gender, bool Flagged, Guid? ParticipantId);

// ─── Run the draft ───────────────────────────────────────────────────────────
// Balanced randomized assignment: per (branche × genre) stratum, deal members (highest Note first,
// ties shuffled) to the famille that has the fewest of that stratum, tie-broken by lowest Note-sum
// then size then random. Spreads branch, gender and size evenly while balancing the Note-sum.
public record RunCampDraftCommand(Guid CampId) : IRequest<Result<bool>>;

public class RunCampDraftCommandHandler(IApplicationDbContext context) : IRequestHandler<RunCampDraftCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(RunCampDraftCommand request, CancellationToken ct)
    {
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.CampId, ct);
        if (camp is null) return Result<bool>.Failure("Camp introuvable.");

        // Ensure N familles exist (create the missing numbers).
        var familles = await context.Familles.Where(f => f.CampId == camp.Id && !f.IsDeleted).OrderBy(f => f.Number).ToListAsync(ct);
        var have = familles.Select(f => f.Number).ToHashSet();
        for (int n = 1; n <= camp.FamillesCount; n++)
            if (!have.Contains(n))
            {
                var nf = new Famille { CampId = camp.Id, Number = n };
                context.Familles.Add(nf); familles.Add(nf);
            }
        familles = familles.Where(f => f.Number <= camp.FamillesCount).OrderBy(f => f.Number).ToList();
        if (familles.Count == 0) return Result<bool>.Failure("Aucune famille à remplir.");

        var members = await context.CampParticipants
            .Where(p => p.CampId == camp.Id && !p.IsDeleted && p.IsAttending && p.Role == CampRole.Membre).ToListAsync(ct);

        // Reset member assignments (Père/Mère are Role != Membre, untouched / pinned).
        foreach (var p in members) p.FamilleId = null;

        var state = familles.ToDictionary(f => f.Id, _ => new FamilleState());
        var rng = new Random();

        foreach (var stratum in members.GroupBy(m => (m.Branche ?? "", m.Gender ?? "")))
        {
            var ordered = stratum.OrderByDescending(m => m.Note ?? 0).ThenBy(_ => rng.Next()).ToList();
            var key = stratum.Key;
            foreach (var m in ordered)
            {
                var target = familles
                    .OrderBy(f => state[f.Id].Stratum.GetValueOrDefault(key))
                    .ThenBy(f => state[f.Id].NoteSum)
                    .ThenBy(f => state[f.Id].Size)
                    .ThenBy(_ => rng.Next())
                    .First();
                m.FamilleId = target.Id;
                var s = state[target.Id];
                s.Size++; s.NoteSum += m.Note ?? 0;
                s.Stratum[key] = s.Stratum.GetValueOrDefault(key) + 1;
            }
        }

        camp.Status = CampStatus.Assigned;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }

    class FamilleState
    {
        public int Size;
        public double NoteSum;
        public Dictionary<(string, string), int> Stratum = [];
    }
}

// ─── Familles board ──────────────────────────────────────────────────────────
public record GetCampFamillesQuery(Guid CampId) : IRequest<Result<IReadOnlyList<CampFamilleDto>>>;

public class GetCampFamillesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetCampFamillesQuery, Result<IReadOnlyList<CampFamilleDto>>>
{
    public async ValueTask<Result<IReadOnlyList<CampFamilleDto>>> Handle(GetCampFamillesQuery request, CancellationToken ct)
    {
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.CampId, ct);
        if (camp is null) return Result<IReadOnlyList<CampFamilleDto>>.Failure("Camp introuvable.");

        var familles = await context.Familles.Where(f => f.CampId == request.CampId && !f.IsDeleted && f.Number <= camp.FamillesCount)
            .OrderBy(f => f.Number).ToListAsync(ct);

        // Members flat (group in memory — avoids an untranslatable SQL GroupBy over entities).
        var memberRows = await context.CampParticipants
            .Where(p => p.CampId == request.CampId && !p.IsDeleted && p.Role == CampRole.Membre && p.FamilleId != null)
            .Select(p => new { FamId = p.FamilleId!.Value, M = new CampFamilleMemberDto(p.Id, p.MemberId, p.Member.FirstName, p.Member.LastName, p.Gender, p.Branche,
                p.Member.Assignments.Where(a => !a.IsDeleted && a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(), p.Note, p.Role) })
            .ToListAsync(ct);
        var map = memberRows.GroupBy(x => x.FamId).ToDictionary(g => g.Key, g => g.Select(x => x.M).ToList());

        // Pere/Mere display names.
        var leaderIds = familles.SelectMany(f => new[] { f.PereMemberId, f.MereMemberId }).Where(x => x != null).Select(x => x!.Value).Distinct().ToList();
        var leaderNames = await context.Members.Where(m => leaderIds.Contains(m.Id))
            .Select(m => new { m.Id, m.FirstName, m.LastName }).ToDictionaryAsync(m => m.Id, m => $"{m.FirstName} {m.LastName}", ct);

        var result = familles.Select(f =>
        {
            var mem = map.GetValueOrDefault(f.Id, []);
            var noteSum = mem.Sum(m => m.Note ?? 0);
            return new CampFamilleDto(f.Id, f.Number, f.Name,
                f.PereMemberId, f.PereMemberId != null ? leaderNames.GetValueOrDefault(f.PereMemberId.Value) : null,
                f.MereMemberId, f.MereMemberId != null ? leaderNames.GetValueOrDefault(f.MereMemberId.Value) : null,
                mem.Count, noteSum, mem.Count > 0 ? Math.Round(noteSum / mem.Count, 1) : 0,
                mem.Count(m => m.Gender == "Masculin"), mem.Count(m => m.Gender == "Féminin"),
                mem.GroupBy(m => m.Branche ?? "—").ToDictionary(g => g.Key, g => g.Count()),
                mem.OrderBy(m => m.Branche).ThenBy(m => m.LastName).ToList());
        }).ToList();
        return Result<IReadOnlyList<CampFamilleDto>>.Success(result);
    }
}

// ─── Manual rebalance ────────────────────────────────────────────────────────
public record MoveCampParticipantCommand(Guid ParticipantId, Guid FamilleId) : IRequest<Result<bool>>;
public class MoveCampParticipantCommandHandler(IApplicationDbContext context) : IRequestHandler<MoveCampParticipantCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(MoveCampParticipantCommand request, CancellationToken ct)
    {
        var p = await context.CampParticipants.FirstOrDefaultAsync(x => x.Id == request.ParticipantId && !x.IsDeleted, ct);
        if (p is null) return Result<bool>.Failure("Participant introuvable.");
        var fam = await context.Familles.FirstOrDefaultAsync(f => f.Id == request.FamilleId && f.CampId == p.CampId && !f.IsDeleted, ct);
        if (fam is null) return Result<bool>.Failure("Famille introuvable.");
        p.FamilleId = request.FamilleId;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record SwapCampParticipantsCommand(Guid ParticipantAId, Guid ParticipantBId) : IRequest<Result<bool>>;
public class SwapCampParticipantsCommandHandler(IApplicationDbContext context) : IRequestHandler<SwapCampParticipantsCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SwapCampParticipantsCommand request, CancellationToken ct)
    {
        var a = await context.CampParticipants.FirstOrDefaultAsync(x => x.Id == request.ParticipantAId && !x.IsDeleted, ct);
        var b = await context.CampParticipants.FirstOrDefaultAsync(x => x.Id == request.ParticipantBId && !x.IsDeleted, ct);
        if (a is null || b is null) return Result<bool>.Failure("Participant introuvable.");
        (a.FamilleId, b.FamilleId) = (b.FamilleId, a.FamilleId);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ─── Père / Mère ─────────────────────────────────────────────────────────────
public record SetFamillePereMereCommand(Guid FamilleId, Guid? PereMemberId, Guid? MereMemberId) : IRequest<Result<bool>>;
public class SetFamillePereMereCommandHandler(IApplicationDbContext context) : IRequestHandler<SetFamillePereMereCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetFamillePereMereCommand request, CancellationToken ct)
    {
        var fam = await context.Familles.FirstOrDefaultAsync(f => f.Id == request.FamilleId && !f.IsDeleted, ct);
        if (fam is null) return Result<bool>.Failure("Famille introuvable.");

        // Père must be male, Mère female.
        if (request.PereMemberId is not null
            && await context.Members.Where(m => m.Id == request.PereMemberId).Select(m => m.Gender).FirstOrDefaultAsync(ct) != "Masculin")
            return Result<bool>.Failure("Le Père doit être un garçon.");
        if (request.MereMemberId is not null
            && await context.Members.Where(m => m.Id == request.MereMemberId).Select(m => m.Gender).FirstOrDefaultAsync(ct) != "Féminin")
            return Result<bool>.Failure("La Mère doit être une fille.");

        // Members being released from leadership → back to the drafted pool (Role = Membre).
        var oldLeaders = new[] { fam.PereMemberId, fam.MereMemberId }.Where(x => x != null).Select(x => x!.Value).ToList();
        var newLeaders = new[] { request.PereMemberId, request.MereMemberId }.Where(x => x != null).Select(x => x!.Value).ToList();

        fam.PereMemberId = request.PereMemberId;
        fam.MereMemberId = request.MereMemberId;

        var released = oldLeaders.Except(newLeaders).ToList();
        if (released.Count > 0)
        {
            var rp = await context.CampParticipants.Where(p => p.CampId == fam.CampId && !p.IsDeleted && released.Contains(p.MemberId)).ToListAsync(ct);
            foreach (var p in rp) p.Role = CampRole.Membre;
        }
        // New leaders: if they participate, pin them out of the drafted pool.
        if (newLeaders.Count > 0)
        {
            var np = await context.CampParticipants.Where(p => p.CampId == fam.CampId && !p.IsDeleted && newLeaders.Contains(p.MemberId)).ToListAsync(ct);
            foreach (var p in np)
            {
                p.Role = p.MemberId == request.PereMemberId ? CampRole.Pere : CampRole.Mere;
                p.FamilleId = null;
            }
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// Candidates: members the CU flagged, plus members in branches not part of the graded pool (routiers/caravelles/JEM).
public record GetPereMereCandidatesQuery(Guid CampId) : IRequest<Result<IReadOnlyList<PereMereCandidateDto>>>;
public class GetPereMereCandidatesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPereMereCandidatesQuery, Result<IReadOnlyList<PereMereCandidateDto>>>
{
    public async ValueTask<Result<IReadOnlyList<PereMereCandidateDto>>> Handle(GetPereMereCandidatesQuery request, CancellationToken ct)
    {
        var flagged = await context.CampParticipants
            .Where(p => p.CampId == request.CampId && !p.IsDeleted && p.IsAttending && p.IsLeaderCandidate)
            .Select(p => new PereMereCandidateDto(p.MemberId, p.Member.FirstName, p.Member.LastName, p.Branche, p.Gender, true, p.Id))
            .ToListAsync(ct);

        // Branches present in the graded pool; members in OTHER active branches (older youth:
        // routiers/Noyau/JEM/Feu) are the natural Père/Mère — but NOT maîtrise (they're étapistes).
        var poolBranches = await context.CampParticipants
            .Where(p => p.CampId == request.CampId && !p.IsDeleted && p.Role == CampRole.Membre && p.UnitTypeId != null)
            .Select(p => p.UnitTypeId!.Value).Distinct().ToListAsync(ct);

        var leaders = await context.MemberAssignments
            .Where(a => !a.IsDeleted && a.EndDate == null && !a.FunctionalRole.IsMaitrise && !poolBranches.Contains(a.Unit.UnitTypeId))
            .Select(a => new PereMereCandidateDto(a.MemberId, a.Member.FirstName, a.Member.LastName, a.Unit.UnitType.Name, a.Member.Gender, false, (Guid?)null))
            .ToListAsync(ct);

        var all = flagged.Concat(leaders).GroupBy(c => c.MemberId).Select(g => g.OrderByDescending(x => x.Flagged).First())
            .OrderByDescending(c => c.Flagged).ThenBy(c => c.LastName).ThenBy(c => c.FirstName).ToList();
        return Result<IReadOnlyList<PereMereCandidateDto>>.Success(all);
    }
}
