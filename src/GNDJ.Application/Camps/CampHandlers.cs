using System.Text.Json;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

// Camp BP — edition CRUD + the Note formula (the score that drives the balanced famille draft).
// A camp's lifecycle status is Setup → Assigned (after the draft) → Closed.

// ─── DTOs ────────────────────────────────────────────────────────────────────
public record CampListDto(Guid Id, string Name, string ScoutYear, int FamillesCount, string Status, bool IsArchived,
    int ParticipantCount, int GradedCount, int AssignedCount);

public record CampDto(Guid Id, string Name, string ScoutYear, int FamillesCount, string Status, bool IsArchived,
    double NoteForceCoef, double NoteOffset, IReadOnlyList<BranchMultiplierDto> BranchMultipliers,
    int ParticipantCount, int GradedCount, int AssignedCount, int FamilleCreatedCount);

public record BranchMultiplierDto(Guid UnitTypeId, string UnitTypeName, int Multiplier, int DefaultYears);

public record CampAttendeeDto(Guid MemberId, string FirstName, string LastName, string? Gender, string? UnitName,
    string? Branche, bool IsAttending, Guid? ParticipantId, string Role);

public record CampGradeRowDto(Guid? ParticipantId, Guid MemberId, string FirstName, string LastName, string? Gender,
    string? Branche, string? UnitName, string? TeamName, bool IsAttending,
    int? Force, int? Annee, double? Note, bool IsLeaderCandidate, string Role, string? Notes);

// ─── Note formula ────────────────────────────────────────────────────────────
public static class CampNote
{
    public static Dictionary<Guid, int> ParseMultipliers(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            var raw = JsonSerializer.Deserialize<Dictionary<string, int>>(json) ?? [];
            var d = new Dictionary<Guid, int>();
            foreach (var (k, v) in raw) if (Guid.TryParse(k, out var g)) d[g] = v;
            return d;
        }
        catch { return []; }
    }

    // Note = ForceCoef*Force + multiplier(branche)*Année + Offset. The branch multiplier is the unit
    // type's NumberOfYears (e.g. Meute 3, Troupe 5) — this makes a Troupe Y3 outscore a Meute Y3 so older
    // branches weigh more, WITHOUT cumulating across years. `multipliers` is keyed by UnitTypeId; 5 is the
    // fallback when a type's NumberOfYears is unset.
    public static double? Compute(Camp camp, CampParticipant p, IReadOnlyDictionary<Guid, int> multipliers)
    {
        if (p.Force is null || p.Annee is null || p.UnitTypeId is null) return null;
        var mult = multipliers.TryGetValue(p.UnitTypeId.Value, out var m) ? m : 5;
        return camp.NoteForceCoef * p.Force.Value + mult * p.Annee.Value + camp.NoteOffset;
    }

    // Year-in-branch from assignment tenure (scout year starts ~Oct 1; Sept counts as the new year).
    public static int AnneeFromStart(DateOnly start, DateOnly today, int maxYears)
    {
        int Sy(DateOnly d) => d.Month >= 9 ? d.Year : d.Year - 1;
        var annee = Sy(today) - Sy(start) + 1;
        if (annee < 1) annee = 1;
        if (maxYears > 0 && annee > maxYears) annee = maxYears;
        return annee;
    }
}

// ─── List / get ──────────────────────────────────────────────────────────────
public record GetCampsQuery() : IRequest<Result<IReadOnlyList<CampListDto>>>;

public class GetCampsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetCampsQuery, Result<IReadOnlyList<CampListDto>>>
{
    public async ValueTask<Result<IReadOnlyList<CampListDto>>> Handle(GetCampsQuery request, CancellationToken ct)
    {
        var camps = await context.Camps.OrderByDescending(c => c.IsArchived ? 0 : 1).ThenByDescending(c => c.CreatedAt)
            .Select(c => new CampListDto(c.Id, c.Name, c.ScoutYear, c.FamillesCount, c.Status, c.IsArchived,
                c.Participants.Count(p => !p.IsDeleted && p.IsAttending && p.Role == CampRole.Membre),
                c.Participants.Count(p => !p.IsDeleted && p.IsAttending && p.Role == CampRole.Membre && p.Note != null),
                c.Participants.Count(p => !p.IsDeleted && p.IsAttending && p.Role == CampRole.Membre && p.FamilleId != null)))
            .ToListAsync(ct);
        return Result<IReadOnlyList<CampListDto>>.Success(camps);
    }
}

public record GetCampQuery(Guid Id) : IRequest<Result<CampDto>>;

public class GetCampQueryHandler(IApplicationDbContext context) : IRequestHandler<GetCampQuery, Result<CampDto>>
{
    public async ValueTask<Result<CampDto>> Handle(GetCampQuery request, CancellationToken ct)
    {
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.Id, ct);
        if (camp is null) return Result<CampDto>.Failure("Camp introuvable.");

        // Unit types actually present among this camp's member participants (the graded branches).
        // The multiplier IS the unit type's NumberOfYears (data-driven, not per-camp).
        var branches = await context.CampParticipants
            .Where(p => p.CampId == camp.Id && !p.IsDeleted && p.Role == CampRole.Membre && p.UnitTypeId != null)
            .Select(p => p.UnitTypeId!.Value).Distinct().ToListAsync(ct);
        var types = await context.UnitTypes.Where(t => branches.Contains(t.Id))
            .Select(t => new { t.Id, t.Name, t.NumberOfYears }).ToListAsync(ct);
        var branchDtos = types.OrderBy(t => t.Name)
            .Select(t => new BranchMultiplierDto(t.Id, t.Name, t.NumberOfYears ?? 5, t.NumberOfYears ?? 5))
            .ToList();

        var pc = await context.CampParticipants.Where(p => p.CampId == camp.Id && !p.IsDeleted && p.IsAttending && p.Role == CampRole.Membre)
            .Select(p => new { p.Note, p.FamilleId }).ToListAsync(ct);
        var familleCount = await context.Familles.CountAsync(f => f.CampId == camp.Id && !f.IsDeleted, ct);

        return Result<CampDto>.Success(new CampDto(camp.Id, camp.Name, camp.ScoutYear, camp.FamillesCount, camp.Status, camp.IsArchived,
            camp.NoteForceCoef, camp.NoteOffset, branchDtos,
            pc.Count, pc.Count(x => x.Note != null), pc.Count(x => x.FamilleId != null), familleCount));
    }
}

// ─── Create ──────────────────────────────────────────────────────────────────
public record CreateCampCommand(string Name, string ScoutYear, int? FamillesCount) : IRequest<Result<Guid>>;

public class CreateCampCommandHandler(IApplicationDbContext context) : IRequestHandler<CreateCampCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateCampCommand request, CancellationToken ct)
    {
        var defaultCount = await context.Settings.Where(s => s.Key == "camp.familles_count").Select(s => s.Value).FirstOrDefaultAsync(ct);
        var count = request.FamillesCount ?? (int.TryParse(defaultCount, out var d) ? d : 12);

        var camp = new Camp { Name = request.Name.Trim(), ScoutYear = request.ScoutYear.Trim(), FamillesCount = count };
        context.Camps.Add(camp);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(camp.Id);
    }
}

// ─── Update settings / formula ───────────────────────────────────────────────
public record UpdateCampCommand(Guid Id, string Name, string ScoutYear, int FamillesCount,
    double NoteForceCoef, double NoteOffset, IReadOnlyList<BranchMultiplierInput>? BranchMultipliers) : IRequest<Result<bool>>;
public record BranchMultiplierInput(Guid UnitTypeId, int Multiplier);

public class UpdateCampCommandHandler(IApplicationDbContext context) : IRequestHandler<UpdateCampCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateCampCommand request, CancellationToken ct)
    {
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.Id, ct);
        if (camp is null) return Result<bool>.Failure("Camp introuvable.");

        camp.Name = request.Name.Trim();
        camp.ScoutYear = request.ScoutYear.Trim();
        camp.FamillesCount = request.FamillesCount;
        camp.NoteForceCoef = request.NoteForceCoef;
        camp.NoteOffset = request.NoteOffset;

        // Recompute every note with the new coefs (multiplier = unit type NumberOfYears).
        var branchYears = await context.UnitTypes.ToDictionaryAsync(t => t.Id, t => t.NumberOfYears ?? 5, ct);
        var parts = await context.CampParticipants.Where(p => p.CampId == camp.Id && !p.IsDeleted).ToListAsync(ct);
        foreach (var p in parts) p.Note = CampNote.Compute(camp, p, branchYears);

        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record ArchiveCampCommand(Guid Id, bool Archive) : IRequest<Result<bool>>;
public class ArchiveCampCommandHandler(IApplicationDbContext context) : IRequestHandler<ArchiveCampCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ArchiveCampCommand request, CancellationToken ct)
    {
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.Id, ct);
        if (camp is null) return Result<bool>.Failure("Camp introuvable.");
        camp.IsArchived = request.Archive;
        if (request.Archive) camp.Status = CampStatus.Closed;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record DeleteCampCommand(Guid Id) : IRequest<Result<bool>>;
public class DeleteCampCommandHandler(IApplicationDbContext context) : IRequestHandler<DeleteCampCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteCampCommand request, CancellationToken ct)
    {
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.Id, ct);
        if (camp is null) return Result<bool>.Failure("Camp introuvable.");
        context.Camps.Remove(camp);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
