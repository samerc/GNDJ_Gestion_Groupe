using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Validation;

namespace GNDJ.Application.Passages;

// passage.enabled + passage.scout_year are always read together — this reads both in ONE query instead of
// two sequential round-trips (they gate every open/propose/bulk-propose path).
internal static class PassageConfig
{
    public static async Task<(bool Enabled, string Year)> LoadAsync(IApplicationDbContext context, CancellationToken ct)
    {
        var map = await context.Settings
            .Where(s => s.Key == "passage.enabled" || s.Key == "passage.scout_year")
            .Select(s => new { s.Key, s.Value })
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        return (map.GetValueOrDefault("passage.enabled") == "true", map.GetValueOrDefault("passage.scout_year") ?? "");
    }
}

// Annual passage workflow: each scout year the CU proposes where every member goes next. Lines that stay
// in the same unit (no change, équipe or fonction change) and departures are accepted automatically; a move
// to another unit waits (Pending) for the CG. The CG never rejects: they accept or CHANGE a line (with an
// optional reason the CU sees) — a changed line is locked for the CU. When the CU is done they finish the
// unit ("Terminer"), which locks the whole unit for them. Posting (finalize) is group-wide: it needs every
// active member to have a line and every unit finished, accepts the lines still Pending, ends the current
// assignments and creates the new ones, then emails each receiving unit's CU the list of newcomers.

// DTOs
// One passage line for a member: a snapshot of Current/Proposed/Final (unit, team, role) + status.
public record PassageDto(
    Guid Id, string ScoutYear, Guid MemberId, string MemberName, string? CardNumber,
    DateOnly? DateOfBirth, int? Age,
    Guid CurrentUnitId, string CurrentUnitCode, string CurrentUnitName,
    string? CurrentTeamName, string CurrentRoleName,
    Guid ProposedUnitId, string ProposedUnitCode, string ProposedUnitName,
    Guid? ProposedTeamId, string? ProposedTeamName, string ProposedRoleName,
    Guid? FinalUnitId, string? FinalUnitCode, string? FinalUnitName,
    Guid? FinalTeamId, string? FinalTeamName, string? FinalRoleName,
    string Status, bool IsLeaving, string? CuNotes, string? CgNotes,
    DateTime CreatedAt,
    bool? FinalIsLeaving, bool CgModified
);

// CG completeness view: status tallies + Expected (active members) vs MissingLines (active members
// without a passage line) — the finalize gate blocks until MissingLines reaches 0.
public record PassageSummaryDto(
    string ScoutYear, int TotalMembers, int Pending, int Approved, int Rejected, int Finalized,
    int ExpectedMembers, int MissingLines,
    IReadOnlyList<PassageUnitSummaryDto> UnitSummaries,
    int UnitsNotSubmitted
);

// Submitted = the CU finished the unit's passage (locked for the CU). Units with active members must all be
// finished before posting.
public record PassageUnitSummaryDto(
    Guid UnitId, string UnitCode, string UnitName,
    int Total, int Pending, int Approved, int Rejected, int Finalized,
    int ExpectedMembers, int MissingLines,
    bool Submitted, DateTime? SubmittedAt);

// Locks: once a unit is finished, or a line was changed by the CG, only the CG (passage.manage) may change it.
static class PassageLocks
{
    public const string UnitLocked = "Le passage de cette unité est terminé : seule la Maîtrise de Groupe peut encore le modifier.";
    public const string CgModified = "Cette ligne a été modifiée par la Maîtrise de Groupe : seule elle peut encore la changer.";

    public static bool IsManager(ICurrentUserService u) =>
        u.IsSuperAdmin || u.Permissions.Contains(GNDJ.Domain.Enums.Permissions.PassageManage);

    public static Task<bool> IsUnitSubmittedAsync(IApplicationDbContext context, Guid unitId, string scoutYear, CancellationToken ct) =>
        context.PassageUnitSubmissions.AnyAsync(s => s.UnitId == unitId && s.ScoutYear == scoutYear, ct);
}

// Helper
static class PassageAccessHelper
{
    public static async Task<bool> CanAccessUnit(IApplicationDbContext context, ICurrentUserService currentUser, Guid unitId, CancellationToken ct)
    {
        if (currentUser.IsSuperAdmin) return true;
        // Passage is a leader tool (co-members' proposed transitions). A read-only youth holds passage.view
        // + their own unit in AuthorizedUnitIds, so require the members.edit leader signal, not bare membership.
        if (!currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MembersEdit)) return false;
        return currentUser.AuthorizedUnitIds.Contains(unitId);
    }
}

// ============================================================
// Queries
// ============================================================

// 1. GetPassagesByUnit — CU sees passages for their unit
public record GetPassagesByUnitQuery(Guid UnitId, string ScoutYear) : IRequest<Result<IReadOnlyList<PassageDto>>>;

public class GetPassagesByUnitQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetPassagesByUnitQuery, Result<IReadOnlyList<PassageDto>>>
{
    public async ValueTask<Result<IReadOnlyList<PassageDto>>> Handle(GetPassagesByUnitQuery request, CancellationToken ct)
    {
        if (!await PassageAccessHelper.CanAccessUnit(context, currentUser, request.UnitId, ct))
            return Result<IReadOnlyList<PassageDto>>.Failure("Accès non autorisé à cette unité.");

        var today = LebanonClock.Today;

        var items = await context.Passages
            .Where(p => p.CurrentUnitId == request.UnitId && p.ScoutYear == request.ScoutYear)
            .OrderBy(p => p.Member.LastName).ThenBy(p => p.Member.FirstName)
            .Select(p => new PassageDto(
                p.Id, p.ScoutYear, p.MemberId,
                p.Member.FirstName + " " + p.Member.LastName,
                p.Member.CardNumber,
                p.Member.DateOfBirth,
                // age = year diff, minus 1 if this year's birthday hasn't occurred yet. Compare month/day directly
                // (NOT via new DateOnly(today.Year, …)) so a 29 Feb birthday doesn't build an invalid date in a
                // non-leap year — make_date(2026, 2, 29) throws 22008 in Postgres and crashes the whole query.
                p.Member.DateOfBirth != null ? today.Year - p.Member.DateOfBirth.Value.Year - ((today.Month < p.Member.DateOfBirth.Value.Month || (today.Month == p.Member.DateOfBirth.Value.Month && today.Day < p.Member.DateOfBirth.Value.Day)) ? 1 : 0) : null,
                p.CurrentUnitId, p.CurrentUnit.Code, p.CurrentUnit.Name,
                p.CurrentTeamId != null ? context.Teams.Where(t => t.Id == p.CurrentTeamId).Select(t => t.Name).FirstOrDefault() : null,
                p.CurrentRole.Name,
                p.ProposedUnitId, p.ProposedUnit.Code, p.ProposedUnit.Name,
                p.ProposedTeamId,
                p.ProposedTeamId != null ? context.Teams.Where(t => t.Id == p.ProposedTeamId).Select(t => t.Name).FirstOrDefault() : null,
                p.ProposedRole.Name,
                p.FinalUnitId, p.FinalUnit != null ? p.FinalUnit.Code : null, p.FinalUnit != null ? p.FinalUnit.Name : null,
                p.FinalTeamId,
                p.FinalTeamId != null ? context.Teams.Where(t => t.Id == p.FinalTeamId).Select(t => t.Name).FirstOrDefault() : null,
                p.FinalRole != null ? p.FinalRole.Name : null,
                p.Status, p.IsLeaving, p.CuNotes, p.CgNotes,
                p.CreatedAt,
                p.FinalIsLeaving, p.CgModified
            ))
            .ToListAsync(ct);

        return Result<IReadOnlyList<PassageDto>>.Success(items);
    }
}

// 2. GetAllPassages — CG sees all passages with filters (super-admin only)
public record GetAllPassagesQuery(string ScoutYear, string? Status, Guid? UnitId) : IRequest<Result<IReadOnlyList<PassageDto>>>;

public class GetAllPassagesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetAllPassagesQuery, Result<IReadOnlyList<PassageDto>>>
{
    public async ValueTask<Result<IReadOnlyList<PassageDto>>> Handle(GetAllPassagesQuery request, CancellationToken ct)
    {
        // CG-level view: the passage page is for the Chef de Groupe (passage.manage). Enforced by the
        // controller [HasPermission]; kept here as defense-in-depth. All passage.manage holders are group-level
        // (granted all units at login), so this group-wide read is appropriate.
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.PassageManage))
            return Result<IReadOnlyList<PassageDto>>.Failure("Accès réservé à la maîtrise de groupe.");

        var today = LebanonClock.Today;

        var query = context.Passages
            .Where(p => p.ScoutYear == request.ScoutYear);

        if (!string.IsNullOrEmpty(request.Status))
            query = query.Where(p => p.Status == request.Status);

        if (request.UnitId.HasValue)
            query = query.Where(p => p.CurrentUnitId == request.UnitId.Value);

        var items = await query
            .OrderBy(p => p.CurrentUnit.Code).ThenBy(p => p.Member.LastName).ThenBy(p => p.Member.FirstName)
            .Select(p => new PassageDto(
                p.Id, p.ScoutYear, p.MemberId,
                p.Member.FirstName + " " + p.Member.LastName,
                p.Member.CardNumber,
                p.Member.DateOfBirth,
                // age = year diff, minus 1 if this year's birthday hasn't occurred yet. Compare month/day directly
                // (NOT via new DateOnly(today.Year, …)) so a 29 Feb birthday doesn't build an invalid date in a
                // non-leap year — make_date(2026, 2, 29) throws 22008 in Postgres and crashes the whole query.
                p.Member.DateOfBirth != null ? today.Year - p.Member.DateOfBirth.Value.Year - ((today.Month < p.Member.DateOfBirth.Value.Month || (today.Month == p.Member.DateOfBirth.Value.Month && today.Day < p.Member.DateOfBirth.Value.Day)) ? 1 : 0) : null,
                p.CurrentUnitId, p.CurrentUnit.Code, p.CurrentUnit.Name,
                p.CurrentTeamId != null ? context.Teams.Where(t => t.Id == p.CurrentTeamId).Select(t => t.Name).FirstOrDefault() : null,
                p.CurrentRole.Name,
                p.ProposedUnitId, p.ProposedUnit.Code, p.ProposedUnit.Name,
                p.ProposedTeamId,
                p.ProposedTeamId != null ? context.Teams.Where(t => t.Id == p.ProposedTeamId).Select(t => t.Name).FirstOrDefault() : null,
                p.ProposedRole.Name,
                p.FinalUnitId, p.FinalUnit != null ? p.FinalUnit.Code : null, p.FinalUnit != null ? p.FinalUnit.Name : null,
                p.FinalTeamId,
                p.FinalTeamId != null ? context.Teams.Where(t => t.Id == p.FinalTeamId).Select(t => t.Name).FirstOrDefault() : null,
                p.FinalRole != null ? p.FinalRole.Name : null,
                p.Status, p.IsLeaving, p.CuNotes, p.CgNotes,
                p.CreatedAt,
                p.FinalIsLeaving, p.CgModified
            ))
            .ToListAsync(ct);

        return Result<IReadOnlyList<PassageDto>>.Success(items);
    }
}

// 3. GetPassageSummary — CG sees summary stats (super-admin only)
public record GetPassageSummaryQuery(string ScoutYear) : IRequest<Result<PassageSummaryDto>>;

public class GetPassageSummaryQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetPassageSummaryQuery, Result<PassageSummaryDto>>
{
    public async ValueTask<Result<PassageSummaryDto>> Handle(GetPassageSummaryQuery request, CancellationToken ct)
    {
        // CG-level view (passage.manage) — see GetAllPassages note. Controller-gated; defense-in-depth here.
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.PassageManage))
            return Result<PassageSummaryDto>.Failure("Accès réservé à la maîtrise de groupe.");

        var passages = await context.Passages
            .Where(p => p.ScoutYear == request.ScoutYear)
            .Include(p => p.CurrentUnit)
            .ToListAsync(ct);

        // Every active member is expected to have a passage line. "Expected" / "missing" let the CG
        // see (and the finalize gate enforce) that the process is complete before finalizing.
        var activeAssignments = await context.MemberAssignments
            .Where(a => a.EndDate == null)
            .Select(a => new { a.MemberId, a.UnitId, a.Unit.Code, a.Unit.Name })
            .ToListAsync(ct);

        // memberId set that already has a line, per unit (keyed by the member's active unit)
        var lineMembersByUnit = passages
            .GroupBy(p => p.CurrentUnitId)
            .ToDictionary(g => g.Key, g => g.Select(p => p.MemberId).ToHashSet());

        var passagesByUnit = passages.GroupBy(p => p.CurrentUnitId).ToDictionary(g => g.Key, g => g.ToList());
        var submitted = await context.PassageUnitSubmissions.Where(s => s.ScoutYear == request.ScoutYear)
            .ToDictionaryAsync(s => s.UnitId, s => s.SubmittedAt, ct);

        // Union of units that have active members and/or passages
        var unitInfos = activeAssignments
            .Select(a => (a.UnitId, a.Code, a.Name))
            .Concat(passages.Select(p => (p.CurrentUnitId, p.CurrentUnit.Code, p.CurrentUnit.Name)))
            .Distinct()
            .ToList();

        var unitSummaries = unitInfos
            .Select(u =>
            {
                var unitPassages = passagesByUnit.GetValueOrDefault(u.Item1) ?? new List<Passage>();
                var lineMembers = lineMembersByUnit.GetValueOrDefault(u.Item1) ?? new HashSet<Guid>();
                var activeMemberIds = activeAssignments.Where(a => a.UnitId == u.Item1).Select(a => a.MemberId).Distinct().ToList();
                var expected = activeMemberIds.Count;
                var missing = activeMemberIds.Count(mid => !lineMembers.Contains(mid));
                return new PassageUnitSummaryDto(
                    u.Item1, u.Item2, u.Item3,
                    unitPassages.Count,
                    unitPassages.Count(p => p.Status == PassageStatus.Pending),
                    unitPassages.Count(p => p.Status == PassageStatus.Approved),
                    unitPassages.Count(p => p.Status == PassageStatus.Rejected),
                    unitPassages.Count(p => p.Status == PassageStatus.Finalized),
                    expected, missing,
                    submitted.ContainsKey(u.Item1), submitted.TryGetValue(u.Item1, out var at) ? at : null
                );
            })
            .OrderBy(u => u.UnitCode)
            .ToList();

        var allActiveMemberIds = activeAssignments.Select(a => a.MemberId).Distinct().ToList();
        var lineMemberIds = passages.Select(p => p.MemberId).ToHashSet();
        var missingTotal = allActiveMemberIds.Count(mid => !lineMemberIds.Contains(mid));

        var summary = new PassageSummaryDto(
            request.ScoutYear,
            passages.Count,
            passages.Count(p => p.Status == PassageStatus.Pending),
            passages.Count(p => p.Status == PassageStatus.Approved),
            passages.Count(p => p.Status == PassageStatus.Rejected),
            passages.Count(p => p.Status == PassageStatus.Finalized),
            allActiveMemberIds.Count, missingTotal,
            unitSummaries,
            unitSummaries.Count(u => u.ExpectedMembers > 0 && !u.Submitted)
        );

        return Result<PassageSummaryDto>.Success(summary);
    }
}

// ============================================================
// 3b. GetPassageProjection — CG "next year" simulation (super-admin, like the summary/review queries).
// Lets the CG preview each unit's roster for the COMING year before doing all the approval work. Returns the
// raw per-member movement + unit metadata so the client can compute BOTH modes without a refetch:
//   • Simulation (default): treat every PENDING and APPROVED line as approved (the "what-if all approved").
//   • Réel: apply only APPROVED lines — a pending line = not yet decided, so the member is still counted where
//     they are now.
// Members with NO line (or a REJECTED one) are assumed to STAY in their current unit. FINALIZED lines are
// skipped (already applied — the member's active assignment is the new unit). MissingLines is surfaced as a
// caveat (how many active members have no proposal yet, all assumed to stay).
// ============================================================
public record GetPassageProjectionQuery(string ScoutYear) : IRequest<Result<PassageProjectionDto>>;

public record PassageProjectionUnitDto(
    Guid UnitId, string UnitCode, string UnitName, Guid UnitTypeId, string? UnitTypeName,
    int? Quota, int? AgeMin, int? AgeMax);
// LineStatus: "None" | "Pending" | "Approved" | "Rejected". DestUnitId = FinalUnitId ?? ProposedUnitId
// (null when leaving or no line). IsLeaving = the member quits the group next year.
public record PassageProjectionMemberDto(
    Guid MemberId, string MemberName, Guid CurrentUnitId,
    string LineStatus, bool IsLeaving, Guid? DestUnitId);
public record PassageProjectionDto(
    string ScoutYear, int MissingLines,
    IReadOnlyList<PassageProjectionUnitDto> Units,
    IReadOnlyList<PassageProjectionMemberDto> Members);

public class GetPassageProjectionQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetPassageProjectionQuery, Result<PassageProjectionDto>>
{
    public async ValueTask<Result<PassageProjectionDto>> Handle(GetPassageProjectionQuery request, CancellationToken ct)
    {
        // Group-wide preview — CG-level (passage.manage). Controller-gated; defense-in-depth here.
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.PassageManage))
            return Result<PassageProjectionDto>.Failure("Accès réservé à la maîtrise de groupe.");

        // Who's active now (the projection universe) with name + current unit.
        var active = await context.MemberAssignments
            .Where(a => a.EndDate == null)
            .Select(a => new { a.MemberId, Name = a.Member.FirstName + " " + a.Member.LastName, a.UnitId })
            .ToListAsync(ct);

        // This year's lines that still represent a pending movement/decision. Finalized = already applied
        // (skip — the assignment already moved); rejected kept so we can show the member as "stays".
        var lines = await context.Passages
            .Where(p => p.ScoutYear == request.ScoutYear && p.Status != PassageStatus.Finalized)
            .Select(p => new { p.MemberId, p.CurrentUnitId, p.Status, IsLeaving = p.FinalIsLeaving ?? p.IsLeaving, Dest = p.FinalUnitId ?? p.ProposedUnitId })
            .ToListAsync(ct);
        var lineByMember = lines.GroupBy(l => l.MemberId).ToDictionary(g => g.Key, g => g.First());

        // One projection row per active member (a member with >1 active assignment uses their line's current
        // unit if present, else their first assignment unit).
        var members = active
            .GroupBy(a => a.MemberId)
            .Select(g =>
            {
                var line = lineByMember.GetValueOrDefault(g.Key);
                var currentUnit = line?.CurrentUnitId ?? g.First().UnitId;
                var status = line?.Status ?? "None";
                var isLeaving = line?.IsLeaving ?? false;
                Guid? dest = (line is not null && !isLeaving) ? line.Dest : null;
                return new PassageProjectionMemberDto(g.Key, g.First().Name, currentUnit, status, isLeaving, dest);
            })
            .ToList();

        var missingLines = members.Count(m => m.LineStatus == "None");

        // Unit metadata: every active unit + any unit referenced as a current/destination unit.
        var quotas = await context.UnitIntakeQuotas.Where(q => q.ScoutYear == request.ScoutYear)
            .ToDictionaryAsync(q => q.UnitId, q => q.Quota, ct);
        var referenced = members.Select(m => m.CurrentUnitId)
            .Concat(members.Where(m => m.DestUnitId is not null).Select(m => m.DestUnitId!.Value))
            .Distinct().ToHashSet();
        var unitRows = await context.Units
            .Where(u => u.IsActive || referenced.Contains(u.Id))
            .Select(u => new { u.Id, u.Code, u.Name, u.UnitTypeId, TypeName = u.UnitType.Name, u.UnitType.AgeMin, u.UnitType.AgeMax })
            .ToListAsync(ct);
        var units = unitRows
            .Select(u => new PassageProjectionUnitDto(u.Id, u.Code, u.Name, u.UnitTypeId, u.TypeName,
                quotas.TryGetValue(u.Id, out var q) ? q : (int?)null, u.AgeMin, u.AgeMax))
            .OrderBy(u => u.UnitCode)
            .ToList();

        return Result<PassageProjectionDto>.Success(new PassageProjectionDto(
            request.ScoutYear, missingLines, units, members));
    }
}

// 4. IsPassageOpen — Checks if passage is enabled for this year
public record IsPassageOpenQuery(string ScoutYear) : IRequest<Result<PassageStatusDto>>;
public record PassageStatusDto(bool IsOpen, string ScoutYear);

public class IsPassageOpenQueryHandler(IApplicationDbContext context) : IRequestHandler<IsPassageOpenQuery, Result<PassageStatusDto>>
{
    public async ValueTask<Result<PassageStatusDto>> Handle(IsPassageOpenQuery request, CancellationToken ct)
    {
        var (isEnabled, configuredYear) = await PassageConfig.LoadAsync(context, ct);

        // Passage is open if enabled AND the requested year matches the configured year
        var isOpen = isEnabled && (string.IsNullOrEmpty(request.ScoutYear) || configuredYear == request.ScoutYear);

        return Result<PassageStatusDto>.Success(new PassageStatusDto(isOpen, configuredYear));
    }
}

// ============================================================
// Commands
// ============================================================

// 1. ProposePassage — CU creates/updates a passage for a member
public record ProposePassageCommand(
    Guid MemberId, string ScoutYear,
    Guid ProposedUnitId, Guid? ProposedTeamId, Guid ProposedRoleId,
    string? CuNotes, bool IsLeaving = false
) : IRequest<Result<Guid>>;

public class ProposePassageCommandValidator : AbstractValidator<ProposePassageCommand>
{
    public ProposePassageCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty().WithMessage("Le membre est requis.");
        RuleFor(x => x.ScoutYear).NotEmpty().WithMessage("L'année scoute est requise.").MaximumLength(20);
        RuleFor(x => x.ProposedUnitId).NotEmpty().WithMessage("L'unité proposée est requise.");
        RuleFor(x => x.ProposedRoleId).NotEmpty().WithMessage("Le rôle proposé est requis.");
        RuleFor(x => x.CuNotes).MaximumLength(1000);
    }
}

public class ProposePassageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<ProposePassageCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(ProposePassageCommand request, CancellationToken ct)
    {
        // Check passage is open
        var (isEnabled, configuredYear) = await PassageConfig.LoadAsync(context, ct);
        if (!isEnabled)
            return Result<Guid>.Failure("Le processus de passage n'est pas actif.");
        if (configuredYear != request.ScoutYear)
            return Result<Guid>.Failure("L'année scoute du passage ne correspond pas à l'année configurée.");

        // Get member's active assignment
        var assignment = await context.MemberAssignments
            .Where(a => a.MemberId == request.MemberId && a.EndDate == null)
            .Include(a => a.Unit)
            .FirstOrDefaultAsync(ct);

        if (assignment is null)
            return Result<Guid>.Failure("Ce membre n'a pas d'affectation active.");

        // Check unit-scoped access
        if (!await PassageAccessHelper.CanAccessUnit(context, currentUser, assignment.UnitId, ct))
            return Result<Guid>.Failure("Accès non autorisé à cette unité.");

        // A finished unit is locked for the CU (the CG planned on it); only the CG can still change it.
        var isManager = PassageLocks.IsManager(currentUser);
        if (!isManager && await PassageLocks.IsUnitSubmittedAsync(context, assignment.UnitId, request.ScoutYear, ct))
            return Result<Guid>.Failure(PassageLocks.UnitLocked);

        // Validate proposed unit and role exist
        var proposedUnitExists = await context.Units.AnyAsync(u => u.Id == request.ProposedUnitId, ct);
        if (!proposedUnitExists)
            return Result<Guid>.Failure("L'unité proposée est introuvable.");

        var proposedRoleExists = await context.FunctionalRoles.AnyAsync(r => r.Id == request.ProposedRoleId, ct);
        if (!proposedRoleExists)
            return Result<Guid>.Failure("Le rôle proposé est introuvable.");

        if (request.ProposedTeamId.HasValue)
        {
            var teamExists = await context.Teams.AnyAsync(t => t.Id == request.ProposedTeamId.Value && t.UnitId == request.ProposedUnitId, ct);
            if (!teamExists)
                return Result<Guid>.Failure("L'équipe proposée est introuvable dans cette unité.");
        }

        // Check for existing passage (update if pending)
        var existing = await context.Passages
            .FirstOrDefaultAsync(p => p.MemberId == request.MemberId && p.ScoutYear == request.ScoutYear, ct);

        if (existing is not null)
        {
            if (existing.Status == PassageStatus.Finalized)
                return Result<Guid>.Failure("Ce passage a déjà été traité et ne peut plus être modifié.");
            if (existing.CgModified && !isManager)
                return Result<Guid>.Failure(PassageLocks.CgModified);

            existing.ProposedUnitId = request.ProposedUnitId;
            existing.ProposedTeamId = request.ProposedTeamId;
            existing.ProposedRoleId = request.ProposedRoleId;
            existing.CuNotes = request.CuNotes;
            existing.IsLeaving = request.IsLeaving;
            // Update current snapshot in case assignment changed
            existing.CurrentUnitId = assignment.UnitId;
            existing.CurrentTeamId = assignment.TeamId;
            existing.CurrentRoleId = assignment.FunctionalRoleId;

            // Re-evaluate: staying in the same unit or leaving → accepted automatically; a move to another unit
            // waits for the CG. A new proposal replaces any earlier CG decision on this line.
            existing.Status = PassageAutoApprove.Applies(request.IsLeaving, request.ProposedUnitId, assignment.UnitId)
                ? PassageStatus.Approved : PassageStatus.Pending;
            existing.FinalUnitId = null;
            existing.FinalTeamId = null;
            existing.FinalRoleId = null;
            existing.FinalIsLeaving = null;
            existing.CgModified = false;
            existing.CgNotes = null;
            existing.ReviewedByUserId = null;
            existing.ReviewedAt = null;

            await context.SaveChangesAsync(ct);
            // Readable snapshot (names, not GUIDs) so the audit detail is legible.
            await auditService.LogAsync("Update", "Passage", existing.Id,
                newValues: new
                {
                    Member = await AuditNames.MemberAsync(context, existing.MemberId, ct),
                    ProposedUnit = await AuditNames.UnitAsync(context, existing.ProposedUnitId, ct),
                    ProposedRole = await AuditNames.RoleAsync(context, existing.ProposedRoleId, ct),
                    IsLeaving = existing.IsLeaving,
                    existing.CuNotes,
                },
                cancellationToken: ct);

            return Result<Guid>.Success(existing.Id);
        }

        // Staying in the same unit (no change, équipe or fonction change) or leaving → accepted automatically.
        var autoApprove = PassageAutoApprove.Applies(request.IsLeaving, request.ProposedUnitId, assignment.UnitId);

        // Create new passage
        var passage = new Passage
        {
            ScoutYear = request.ScoutYear,
            MemberId = request.MemberId,
            CurrentUnitId = assignment.UnitId,
            CurrentTeamId = assignment.TeamId,
            CurrentRoleId = assignment.FunctionalRoleId,
            ProposedUnitId = request.ProposedUnitId,
            ProposedTeamId = request.ProposedTeamId,
            ProposedRoleId = request.ProposedRoleId,
            CuNotes = request.CuNotes,
            IsLeaving = request.IsLeaving,
            Status = autoApprove ? PassageStatus.Approved : PassageStatus.Pending,
            ProposedByUserId = currentUser.UserId!.Value
        };

        context.Passages.Add(passage);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "Passage", passage.Id,
            newValues: new
            {
                Member = await AuditNames.MemberAsync(context, passage.MemberId, ct),
                ProposedUnit = await AuditNames.UnitAsync(context, passage.ProposedUnitId, ct),
                ProposedRole = await AuditNames.RoleAsync(context, passage.ProposedRoleId, ct),
                IsLeaving = passage.IsLeaving,
            },
            cancellationToken: ct);

        return Result<Guid>.Success(passage.Id);
    }
}

// 2. BulkProposePassage — CU proposes same change for multiple members
public record BulkProposePassageCommand(
    List<Guid> MemberIds, string ScoutYear,
    Guid ProposedUnitId, Guid? ProposedTeamId, Guid ProposedRoleId,
    string? CuNotes
) : IRequest<Result<int>>;

public class BulkProposePassageCommandValidator : AbstractValidator<BulkProposePassageCommand>
{
    public BulkProposePassageCommandValidator()
    {
        RuleFor(x => x.MemberIds).NotEmpty().WithMessage("Au moins un membre est requis.")
            .Must(list => list.Count <= 1000).WithMessage("Trop d'éléments (max 1000).");
        RuleFor(x => x.ScoutYear).NotEmpty().WithMessage("L'année scoute est requise.").MaximumLength(20);
        RuleFor(x => x.ProposedUnitId).NotEmpty().WithMessage("L'unité proposée est requise.");
        RuleFor(x => x.ProposedRoleId).NotEmpty().WithMessage("Le rôle proposé est requis.");
        RuleFor(x => x.CuNotes).MaximumLength(1000);
    }
}

public class BulkProposePassageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<BulkProposePassageCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(BulkProposePassageCommand request, CancellationToken ct)
    {
        // Check passage is open
        var (isEnabled, configuredYear) = await PassageConfig.LoadAsync(context, ct);
        if (!isEnabled)
            return Result<int>.Failure("Le processus de passage n'est pas actif.");
        if (configuredYear != request.ScoutYear)
            return Result<int>.Failure("L'année scoute du passage ne correspond pas à l'année configurée.");

        // Validate proposed unit and role exist
        var proposedUnitExists = await context.Units.AnyAsync(u => u.Id == request.ProposedUnitId, ct);
        if (!proposedUnitExists)
            return Result<int>.Failure("L'unité proposée est introuvable.");

        var proposedRoleExists = await context.FunctionalRoles.AnyAsync(r => r.Id == request.ProposedRoleId, ct);
        if (!proposedRoleExists)
            return Result<int>.Failure("Le rôle proposé est introuvable.");

        if (request.ProposedTeamId.HasValue)
        {
            var teamExists = await context.Teams.AnyAsync(t => t.Id == request.ProposedTeamId.Value && t.UnitId == request.ProposedUnitId, ct);
            if (!teamExists)
                return Result<int>.Failure("L'équipe proposée est introuvable dans cette unité.");
        }

        int count = 0;
        var errors = new List<string>();
        var isManager = PassageLocks.IsManager(currentUser);
        var submittedUnits = (await context.PassageUnitSubmissions.Where(s => s.ScoutYear == request.ScoutYear)
            .Select(s => s.UnitId).ToListAsync(ct)).ToHashSet();

        var memberIds = request.MemberIds.Distinct().ToList();

        // Batch-load the three things the loop needs (active assignment, any existing passage, member name
        // for the error path) in three queries total instead of three PER member. Tracked (no AsNoTracking)
        // because existing passages are mutated below and persisted on SaveChanges.
        var assignmentByMember = (await context.MemberAssignments
                .Where(a => a.EndDate == null && memberIds.Contains(a.MemberId))
                .ToListAsync(ct))
            .GroupBy(a => a.MemberId)
            .ToDictionary(g => g.Key, g => g.First());

        var existingByMember = (await context.Passages
                .Where(p => p.ScoutYear == request.ScoutYear && memberIds.Contains(p.MemberId))
                .ToListAsync(ct))
            .GroupBy(p => p.MemberId)
            .ToDictionary(g => g.Key, g => g.First());

        var memberNames = await context.Members
            .Where(m => memberIds.Contains(m.Id))
            .Select(m => new { m.Id, m.FirstName, m.LastName })
            .ToDictionaryAsync(m => m.Id, m => $"{m.FirstName} {m.LastName}", ct);

        foreach (var memberId in memberIds)
        {
            if (!assignmentByMember.TryGetValue(memberId, out var assignment))
            {
                memberNames.TryGetValue(memberId, out var memberName);
                errors.Add($"{memberName}: pas d'affectation active.");
                continue;
            }

            if (!await PassageAccessHelper.CanAccessUnit(context, currentUser, assignment.UnitId, ct))
            {
                errors.Add($"Membre {memberId}: accès non autorisé.");
                continue;
            }
            if (!isManager && submittedUnits.Contains(assignment.UnitId))
                return Result<int>.Failure(PassageLocks.UnitLocked);

            var existing = existingByMember.GetValueOrDefault(memberId);

            var autoStatus = PassageAutoApprove.Applies(false, request.ProposedUnitId, assignment.UnitId)
                ? PassageStatus.Approved : PassageStatus.Pending;

            if (existing is not null)
            {
                if (existing.Status == PassageStatus.Finalized)
                    continue; // already posted
                if (existing.CgModified && !isManager)
                    continue; // changed by the CG — the CU can no longer overwrite it

                existing.ProposedUnitId = request.ProposedUnitId;
                existing.ProposedTeamId = request.ProposedTeamId;
                existing.ProposedRoleId = request.ProposedRoleId;
                existing.CuNotes = request.CuNotes;
                existing.CurrentUnitId = assignment.UnitId;
                existing.CurrentTeamId = assignment.TeamId;
                existing.CurrentRoleId = assignment.FunctionalRoleId;
                existing.Status = autoStatus;
                existing.IsLeaving = false;
                existing.FinalUnitId = null; existing.FinalTeamId = null; existing.FinalRoleId = null;
                existing.FinalIsLeaving = null; existing.CgModified = false; existing.CgNotes = null;
            }
            else
            {
                var passage = new Passage
                {
                    ScoutYear = request.ScoutYear,
                    MemberId = memberId,
                    CurrentUnitId = assignment.UnitId,
                    CurrentTeamId = assignment.TeamId,
                    CurrentRoleId = assignment.FunctionalRoleId,
                    ProposedUnitId = request.ProposedUnitId,
                    ProposedTeamId = request.ProposedTeamId,
                    ProposedRoleId = request.ProposedRoleId,
                    CuNotes = request.CuNotes,
                    Status = autoStatus,
                    ProposedByUserId = currentUser.UserId!.Value
                };
                context.Passages.Add(passage);
            }
            count++;
        }

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("BulkCreate", "Passage", null,
            newValues: new
            {
                Count = count,
                ProposedUnit = await AuditNames.UnitAsync(context, request.ProposedUnitId, ct),
                ProposedRole = await AuditNames.RoleAsync(context, request.ProposedRoleId, ct),
                request.ScoutYear,
            },
            cancellationToken: ct);

        return Result<int>.Success(count);
    }
}

// 3. ReviewPassage — CG accepts a line as proposed, or CHANGES it (unit / équipe / fonction, or leaving ↔
// staying). There is no "reject": disagreeing means choosing something else. An optional reason (CgNotes) is
// shown to the CU. A changed line is marked CgModified (locked for the CU) and the unit's leaders are notified.
public record ReviewPassageCommand(
    Guid Id, string Status,
    Guid? FinalUnitId, Guid? FinalTeamId, Guid? FinalRoleId,
    string? CgNotes, bool? FinalIsLeaving = null
) : IRequest<Result<bool>>;

public class ReviewPassageCommandValidator : AbstractValidator<ReviewPassageCommand>
{
    public ReviewPassageCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("L'identifiant du passage est requis.");
        RuleFor(x => x.Status).Equal(PassageStatus.Approved)
            .WithMessage("Une ligne ne se rejette pas : choisissez l'unité / la fonction voulue à la place.");
        RuleFor(x => x.CgNotes).MaximumLength(1000).NoHtml();
    }
}

public class ReviewPassageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService,
    INotificationService notifications) : IRequestHandler<ReviewPassageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ReviewPassageCommand request, CancellationToken ct)
    {
        // CG-level operation (passage.manage) — controller-gated; defense-in-depth here.
        if (!PassageLocks.IsManager(currentUser))
            return Result<bool>.Failure("Accès réservé à la maîtrise de groupe.");

        var passage = await context.Passages.FindAsync([request.Id], ct);
        if (passage is null)
            return Result<bool>.Failure("Passage introuvable.");

        if (passage.Status == PassageStatus.Finalized)
            return Result<bool>.Failure("Ce passage a déjà été finalisé.");

        var oldStatus = passage.Status;
        var leaving = request.FinalIsLeaving ?? passage.IsLeaving;

        if (leaving)
        {
            passage.FinalUnitId = null;
            passage.FinalTeamId = null;
            passage.FinalRoleId = null;
        }
        else
        {
            // Omitted fields fall back to the CU's proposal. A proposed team only carries over when the unit stays
            // the proposed one (it belongs to that unit).
            var finalUnitId = request.FinalUnitId ?? passage.ProposedUnitId;
            var finalTeamId = request.FinalTeamId ?? (finalUnitId == passage.ProposedUnitId ? passage.ProposedTeamId : null);
            var finalRoleId = request.FinalRoleId ?? passage.ProposedRoleId;

            if (!await context.Units.AnyAsync(u => u.Id == finalUnitId, ct))
                return Result<bool>.Failure("L'unité finale est introuvable.");
            if (!await context.FunctionalRoles.AnyAsync(r => r.Id == finalRoleId, ct))
                return Result<bool>.Failure("Le rôle final est introuvable.");
            // A final team must belong to the final unit (else finalize would create a cross-unit assignment).
            if (finalTeamId.HasValue && !await context.Teams.AnyAsync(t => t.Id == finalTeamId.Value && t.UnitId == finalUnitId, ct))
                return Result<bool>.Failure("L'équipe finale n'appartient pas à l'unité finale.");

            passage.FinalUnitId = finalUnitId;
            passage.FinalTeamId = finalTeamId;
            passage.FinalRoleId = finalRoleId;
        }

        passage.FinalIsLeaving = leaving == passage.IsLeaving ? null : leaving;
        passage.CgModified = leaving != passage.IsLeaving
            || (!leaving && (passage.FinalUnitId != passage.ProposedUnitId
                             || passage.FinalTeamId != passage.ProposedTeamId
                             || passage.FinalRoleId != passage.ProposedRoleId));
        passage.CgNotes = string.IsNullOrWhiteSpace(request.CgNotes) ? null : request.CgNotes.Trim();
        passage.Status = PassageStatus.Approved;
        passage.ReviewedByUserId = currentUser.UserId;
        passage.ReviewedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(ct);

        var memberName = await AuditNames.MemberAsync(context, passage.MemberId, ct);
        await auditService.LogAsync("Review", "Passage", passage.Id,
            oldValues: new { Status = oldStatus },
            newValues: new
            {
                Member = memberName,
                passage.Status,
                FinalUnit = await AuditNames.UnitAsync(context, passage.FinalUnitId, ct),
                FinalRole = await AuditNames.RoleAsync(context, passage.FinalRoleId, ct),
                IsLeaving = leaving,
                passage.CgModified,
                passage.CgNotes,
            },
            cancellationToken: ct);

        // Tell the unit's leaders the CG changed their proposal (with the reason, if any).
        if (passage.CgModified)
        {
            async Task<string> Describe(bool isLeaving, Guid? unitId, Guid? teamId, Guid? roleId)
            {
                if (isLeaving) return "Quitte le groupe";
                var team = await AuditNames.TeamAsync(context, teamId, ct);
                return $"{await AuditNames.UnitAsync(context, unitId, ct)}{(team is null ? "" : " / " + team)} · {await AuditNames.RoleAsync(context, roleId, ct)}";
            }
            var body = $"Proposé : {await Describe(passage.IsLeaving, passage.ProposedUnitId, passage.ProposedTeamId, passage.ProposedRoleId)}"
                       + $" → Décision : {await Describe(leaving, passage.FinalUnitId, passage.FinalTeamId, passage.FinalRoleId)}"
                       + (passage.CgNotes is null ? "" : $". Raison : {passage.CgNotes}");
            var leaders = await UnitNewMembersMail.UnitLeaderIdsAsync(context, passage.CurrentUnitId, ct);
            await notifications.NotifyMembersAsync(leaders.Where(id => id != currentUser.MemberId), NotificationTypes.Info,
                $"Passage modifié : {memberName}", body, "/passage", ct);
        }

        return Result<bool>.Success(true);
    }
}

// 4. BulkReviewPassage — CG accepts several lines at once, as proposed (no rejection any more).
public record BulkReviewPassageCommand(
    List<Guid> PassageIds, string Status,
    string? CgNotes
) : IRequest<Result<int>>;

public class BulkReviewPassageCommandValidator : AbstractValidator<BulkReviewPassageCommand>
{
    public BulkReviewPassageCommandValidator()
    {
        RuleFor(x => x.PassageIds).NotEmpty().WithMessage("Au moins un passage est requis.")
            .Must(list => list.Count <= 1000).WithMessage("Trop d'éléments (max 1000).");
        RuleFor(x => x.Status).Equal(PassageStatus.Approved)
            .WithMessage("Une ligne ne se rejette pas : choisissez l'unité / la fonction voulue à la place.");
        RuleFor(x => x.CgNotes).MaximumLength(1000).NoHtml();
    }
}

public class BulkReviewPassageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<BulkReviewPassageCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(BulkReviewPassageCommand request, CancellationToken ct)
    {
        // CG-level operation (passage.manage) — controller-gated; defense-in-depth here.
        if (!PassageLocks.IsManager(currentUser))
            return Result<int>.Failure("Accès réservé à la maîtrise de groupe.");

        var passages = await context.Passages
            .Where(p => request.PassageIds.Contains(p.Id) && p.Status != PassageStatus.Finalized)
            .ToListAsync(ct);

        // Team → unit map for every team these passages reference (one query), so an accepted line whose team
        // doesn't belong to its final unit can be corrected (same rule as the single ReviewPassage).
        var teamIds = passages.SelectMany(p => new[] { p.FinalTeamId, p.ProposedTeamId })
            .Where(t => t.HasValue).Select(t => t!.Value).Distinct().ToList();
        var teamUnit = await context.Teams.Where(t => teamIds.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t.UnitId, ct);

        int count = 0;
        foreach (var passage in passages)
        {
            passage.Status = PassageStatus.Approved;
            if (!string.IsNullOrWhiteSpace(request.CgNotes)) passage.CgNotes = request.CgNotes.Trim();
            passage.ReviewedByUserId = currentUser.UserId;
            passage.ReviewedAt = DateTime.UtcNow;

            if (!(passage.FinalIsLeaving ?? passage.IsLeaving))
            {
                // Keep a decision the CG already made; otherwise take the proposal.
                passage.FinalUnitId ??= passage.ProposedUnitId;
                passage.FinalTeamId ??= passage.ProposedTeamId;
                passage.FinalRoleId ??= passage.ProposedRoleId;

                // A team that isn't in the final unit would make finalize create a cross-unit assignment — clear
                // it instead of failing the whole batch (the receiving CU assigns the team later, as on a transfer).
                if (passage.FinalTeamId is Guid tid && teamUnit.GetValueOrDefault(tid) != passage.FinalUnitId)
                    passage.FinalTeamId = null;
            }

            count++;
        }

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("BulkReview", "Passage", null,
            newValues: new { Count = count, Status = PassageStatus.Approved },
            cancellationToken: ct);

        return Result<int>.Success(count);
    }
}

// 5. FinalizePassages ("Publier le passage") — group-wide only. Needs every active member to have a line and
// every unit with active members to be finished by its CU. Lines still Pending are accepted automatically.
// Ends the current assignments, creates the new ones, then emails each receiving unit's CU its newcomers.
public record FinalizePassagesCommand(string ScoutYear) : IRequest<Result<int>>;

public class FinalizePassagesCommandValidator : AbstractValidator<FinalizePassagesCommand>
{
    public FinalizePassagesCommandValidator()
        => RuleFor(x => x.ScoutYear).NotEmpty().WithMessage("L'année scoute est requise.")
            .MaximumLength(20).Matches(@"^[0-9\- ]+$").WithMessage("Année scoute invalide (ex. 2026-2027).");
}

public class FinalizePassagesCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService,
    IEmailQueue emailQueue, IUnitNewMembersSheet unitSheet,
    Microsoft.Extensions.Logging.ILogger<FinalizePassagesCommandHandler> logger) : IRequestHandler<FinalizePassagesCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(FinalizePassagesCommand request, CancellationToken ct)
    {
        // CG-level operation (passage.manage) — controller-gated; defense-in-depth here.
        if (!PassageLocks.IsManager(currentUser))
            return Result<int>.Failure("Accès réservé à la maîtrise de groupe.");

        var today = LebanonClock.Today;
        // "Date du passage" setting drives the effective date: old assignments end on it and the new
        // ones start on it. Empty/unset → today.
        var passageDateRaw = await context.Settings.Where(s => s.Key == "passage.date").Select(s => s.Value).FirstOrDefaultAsync(ct);
        var passageDate = DateOnly.TryParseExact(passageDateRaw, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var pd) ? pd : today;

        // Serialize finalize: a transaction-scoped advisory lock means a second concurrent finalize
        // (double-click, or two CG users at once) blocks until the first commits, then finds the
        // passages already Finalized and does nothing — so no duplicate assignments can be created.
        await using var tx = await context.BeginTransactionAsync(ct);
        await context.AcquireAdvisoryLockAsync(917320250, ct);

        // Gate 1: every active member has a passage line (a real change or "Pas de changement").
        var active = await context.MemberAssignments.Where(a => a.EndDate == null)
            .Select(a => new { a.MemberId, a.UnitId }).ToListAsync(ct);
        var lineMemberIds = (await context.Passages.Where(p => p.ScoutYear == request.ScoutYear)
            .Select(p => p.MemberId).ToListAsync(ct)).ToHashSet();
        var missing = active.Select(a => a.MemberId).Distinct().Count(mid => !lineMemberIds.Contains(mid));
        if (missing > 0)
            return Result<int>.Failure($"Le passage est incomplet : {missing} membre(s) actif(s) sans ligne de passage. Chaque membre doit avoir une décision (proposition ou « Pas de changement ») avant la publication.");

        // Gate 2: every unit with active members has been finished by its CU (or by the CG).
        var submittedUnits = (await context.PassageUnitSubmissions.Where(s => s.ScoutYear == request.ScoutYear)
            .Select(s => s.UnitId).ToListAsync(ct)).ToHashSet();
        var unfinished = active.Select(a => a.UnitId).Distinct().Where(u => !submittedUnits.Contains(u)).ToList();
        if (unfinished.Count > 0)
        {
            var codes = await context.Units.Where(u => unfinished.Contains(u.Id)).OrderBy(u => u.Code).Select(u => u.Code).ToListAsync(ct);
            return Result<int>.Failure($"Toutes les unités doivent avoir terminé leur passage. Pas encore terminé : {string.Join(", ", codes)}.");
        }

        // Gate 3: legacy rejected lines (from before "reject" was removed) must be changed first.
        if (await context.Passages.AnyAsync(p => p.ScoutYear == request.ScoutYear && p.Status == PassageStatus.Rejected, ct))
            return Result<int>.Failure("Des lignes sont encore « rejetées » : ouvrez-les et choisissez la destination voulue avant de publier.");

        var passages = await context.Passages
            .Where(p => p.ScoutYear == request.ScoutYear && (p.Status == PassageStatus.Approved || p.Status == PassageStatus.Pending))
            .ToListAsync(ct);

        // Lines still waiting for the CG are accepted as proposed. A proposed team outside the proposed unit is
        // dropped (the receiving CU assigns the team later).
        var pendingTeamIds = passages.Where(p => p.Status == PassageStatus.Pending && p.ProposedTeamId != null)
            .Select(p => p.ProposedTeamId!.Value).Distinct().ToList();
        var teamUnit = await context.Teams.Where(t => pendingTeamIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.UnitId, ct);
        var autoAccepted = 0;
        foreach (var p in passages.Where(p => p.Status == PassageStatus.Pending))
        {
            if (!(p.FinalIsLeaving ?? p.IsLeaving))
            {
                p.FinalUnitId ??= p.ProposedUnitId;
                p.FinalRoleId ??= p.ProposedRoleId;
                p.FinalTeamId ??= p.ProposedTeamId is Guid tid && teamUnit.GetValueOrDefault(tid) == p.FinalUnitId ? tid : null;
            }
            p.Status = PassageStatus.Approved;
            p.ReviewedByUserId = currentUser.UserId;
            p.ReviewedAt = DateTime.UtcNow;
            autoAccepted++;
        }

        // Batch-load every affected member's active assignment in ONE query instead of one per passage.
        // This runs inside the advisory-lock transaction, so collapsing N round-trips to 1 directly shortens
        // how long the lock is held. Tracked (no AsNoTracking) so the EndDate mutation below persists.
        var memberIds = passages.Select(p => p.MemberId).ToList();
        var activeByMember = (await context.MemberAssignments
                .Where(a => a.EndDate == null && memberIds.Contains(a.MemberId))
                .ToListAsync(ct))
            .GroupBy(a => a.MemberId)
            .ToDictionary(g => g.Key, g => g.First());

        // Pre-load (once, outside the loop) what the entrée auto-create needs, so it costs no extra query per
        // member inside the advisory lock. Destination units = where a non-leaving member joins a DIFFERENT unit.
        var destUnitIds = passages
            .Where(p => !(p.FinalIsLeaving ?? p.IsLeaving) && (p.FinalUnitId ?? p.ProposedUnitId) != p.CurrentUnitId)
            .Select(p => p.FinalUnitId ?? p.ProposedUnitId)
            .Distinct().ToList();
        var entreeStageByUnit = await EntreeStageResolver.ResolveStagesForUnitsAsync(context, destUnitIds, ct);
        // Existing (member, unit, stage) entrées for the affected members — so a member returning to a former
        // unit (or one already backfilled) doesn't get a duplicate. HashSet.Add later doubles as the guard.
        var existingEntrees = (await context.MemberProgressions
                .Where(p => memberIds.Contains(p.MemberId))
                .Select(p => new { p.MemberId, p.UnitId, p.ScoutStageId })
                .ToListAsync(ct))
            .Select(p => (p.MemberId, p.UnitId, p.ScoutStageId))
            .ToHashSet();

        int count = 0;
        var moves = new List<PassageNewcomers.Move>();

        foreach (var passage in passages)
        {
            // End the member's current active assignment
            if (activeByMember.TryGetValue(passage.MemberId, out var activeAssignment))
            {
                activeAssignment.EndDate = passageDate;
            }

            // "Quitte le groupe": close the assignment and create NO new one — member becomes alumni.
            if (!(passage.FinalIsLeaving ?? passage.IsLeaving))
            {
                var finalUnitId = passage.FinalUnitId ?? passage.ProposedUnitId;
                var finalRoleId = passage.FinalRoleId ?? passage.ProposedRoleId;

                // If unit changed, clear team (member joins new unit without team — CU assigns later)
                Guid? finalTeamId;
                if (finalUnitId != passage.CurrentUnitId)
                    finalTeamId = null;
                else
                    finalTeamId = passage.FinalTeamId ?? passage.ProposedTeamId;

                context.MemberAssignments.Add(new MemberAssignment
                {
                    MemberId = passage.MemberId,
                    UnitId = finalUnitId,
                    TeamId = finalTeamId,
                    FunctionalRoleId = finalRoleId,
                    StartDate = passageDate,
                    Notes = $"Passage {passage.ScoutYear}"
                });

                if (finalUnitId != passage.CurrentUnitId)
                    moves.Add(new PassageNewcomers.Move(passage.MemberId, passage.CurrentUnitId, finalUnitId));

                // If the member joined a DIFFERENT unit, auto-create that unit's "Entrée à …" progression
                // (a same-unit team/role change gets no new entrée). Idempotent: skip if the member already
                // has that entrée (returning to a former unit, or one seeded by the backfill).
                if (finalUnitId != passage.CurrentUnitId
                    && entreeStageByUnit.GetValueOrDefault(finalUnitId) is Guid entreeStageId
                    && existingEntrees.Add((passage.MemberId, finalUnitId, entreeStageId)))
                {
                    context.MemberProgressions.Add(new MemberProgression
                    {
                        MemberId = passage.MemberId,
                        UnitId = finalUnitId,
                        ScoutStageId = entreeStageId,
                        Date = passageDate,
                        Notes = EntreeStageResolver.AutoNote
                    });
                }
            }

            // Mark passage as finalized
            passage.Status = PassageStatus.Finalized;
            count++;
        }

        await context.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        // Tell each receiving unit's CU who joined (Excel attached). Best-effort: the passage is committed.
        var unitsWithoutCu = new List<string>();
        try
        {
            unitsWithoutCu = await PassageNewcomers.EmailUnitHeadsAsync(context, emailQueue, unitSheet, request.ScoutYear, moves, ct);
        }
        catch (Exception ex)
        {
            Microsoft.Extensions.Logging.LoggerExtensions.LogWarning(logger, ex, "Envoi aux chefs d'unité des nouveaux membres du passage échoué ({ScoutYear})", request.ScoutYear);
        }

        await auditService.LogAsync("Finalize", "Passage", null,
            newValues: new
            {
                Count = count,
                AutoAccepted = autoAccepted,
                Newcomers = moves.Count,
                request.ScoutYear,
                UnitsWithoutCu = unitsWithoutCu,
            },
            cancellationToken: ct);

        return Result<int>.Success(count);
    }
}

// 5b. Finish / reopen a unit's passage. "Terminer" (CU, or CG) needs every active member of the unit to have
// a line; afterwards the CU can no longer change the unit (the CG plans per unit). "Rouvrir" is CG-only.
public record PassageUnitStatusDto(Guid UnitId, bool Submitted, DateTime? SubmittedAt, int ExpectedMembers, int MissingLines);

public record GetPassageUnitStatusQuery(Guid UnitId, string ScoutYear) : IRequest<Result<PassageUnitStatusDto>>;

public class GetPassageUnitStatusQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetPassageUnitStatusQuery, Result<PassageUnitStatusDto>>
{
    public async ValueTask<Result<PassageUnitStatusDto>> Handle(GetPassageUnitStatusQuery request, CancellationToken ct)
    {
        if (!PassageLocks.IsManager(currentUser) && !await PassageAccessHelper.CanAccessUnit(context, currentUser, request.UnitId, ct))
            return Result<PassageUnitStatusDto>.Failure("Accès non autorisé à cette unité.");
        return Result<PassageUnitStatusDto>.Success(await PassageUnitStatus.LoadAsync(context, request.UnitId, request.ScoutYear, ct));
    }
}

internal static class PassageUnitStatus
{
    public static async Task<PassageUnitStatusDto> LoadAsync(IApplicationDbContext context, Guid unitId, string scoutYear, CancellationToken ct)
    {
        var submission = await context.PassageUnitSubmissions.FirstOrDefaultAsync(s => s.UnitId == unitId && s.ScoutYear == scoutYear, ct);
        var activeIds = await context.MemberAssignments.Where(a => a.UnitId == unitId && a.EndDate == null)
            .Select(a => a.MemberId).Distinct().ToListAsync(ct);
        var withLine = (await context.Passages.Where(p => p.ScoutYear == scoutYear && activeIds.Contains(p.MemberId))
            .Select(p => p.MemberId).ToListAsync(ct)).ToHashSet();
        return new PassageUnitStatusDto(unitId, submission is not null, submission?.SubmittedAt,
            activeIds.Count, activeIds.Count(id => !withLine.Contains(id)));
    }
}

public record SubmitPassageUnitCommand(Guid UnitId, string ScoutYear) : IRequest<Result<bool>>;

public class SubmitPassageUnitCommandValidator : AbstractValidator<SubmitPassageUnitCommand>
{
    public SubmitPassageUnitCommandValidator()
    {
        RuleFor(x => x.UnitId).NotEmpty();
        RuleFor(x => x.ScoutYear).NotEmpty().MaximumLength(20).Matches(@"^[0-9\- ]+$");
    }
}

public class SubmitPassageUnitCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService,
    INotificationService notifications) : IRequestHandler<SubmitPassageUnitCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SubmitPassageUnitCommand request, CancellationToken ct)
    {
        var isManager = PassageLocks.IsManager(currentUser);
        if (!isManager && !await PassageAccessHelper.CanAccessUnit(context, currentUser, request.UnitId, ct))
            return Result<bool>.Failure("Accès non autorisé à cette unité.");

        var (enabled, year) = await PassageConfig.LoadAsync(context, ct);
        if (!enabled || year != request.ScoutYear)
            return Result<bool>.Failure("Le processus de passage n'est pas actif pour cette année.");

        var status = await PassageUnitStatus.LoadAsync(context, request.UnitId, request.ScoutYear, ct);
        if (status.Submitted) return Result<bool>.Success(true);
        if (status.MissingLines > 0)
            return Result<bool>.Failure($"{status.MissingLines} membre(s) n'ont pas encore de ligne de passage. Chaque membre doit avoir une décision avant de terminer.");

        context.PassageUnitSubmissions.Add(new PassageUnitSubmission
        {
            ScoutYear = request.ScoutYear, UnitId = request.UnitId, SubmittedByUserId = currentUser.UserId,
        });
        await context.SaveChangesAsync(ct);

        var unitName = await AuditNames.UnitAsync(context, request.UnitId, ct);
        await auditService.LogAsync("SubmitUnit", "Passage", null,
            newValues: new { Unit = unitName, request.ScoutYear }, cancellationToken: ct);
        if (!isManager)
            await notifications.NotifyGroupManagersAsync(NotificationTypes.Info, $"Passage terminé : {unitName}",
                "Le chef d'unité a terminé le passage de son unité.", "/admin/passage-validation", currentUser.MemberId, ct);
        return Result<bool>.Success(true);
    }
}

public record ReopenPassageUnitCommand(Guid UnitId, string ScoutYear) : IRequest<Result<bool>>;

public class ReopenPassageUnitCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService,
    INotificationService notifications) : IRequestHandler<ReopenPassageUnitCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ReopenPassageUnitCommand request, CancellationToken ct)
    {
        if (!PassageLocks.IsManager(currentUser))
            return Result<bool>.Failure("Accès réservé à la maîtrise de groupe.");

        var submission = await context.PassageUnitSubmissions
            .FirstOrDefaultAsync(s => s.UnitId == request.UnitId && s.ScoutYear == request.ScoutYear, ct);
        if (submission is null) return Result<bool>.Success(true);

        context.PassageUnitSubmissions.Remove(submission);
        await context.SaveChangesAsync(ct);

        var unitName = await AuditNames.UnitAsync(context, request.UnitId, ct);
        await auditService.LogAsync("ReopenUnit", "Passage", null,
            newValues: new { Unit = unitName, request.ScoutYear }, cancellationToken: ct);
        var leaders = await UnitNewMembersMail.UnitLeaderIdsAsync(context, request.UnitId, ct);
        await notifications.NotifyMembersAsync(leaders.Where(id => id != currentUser.MemberId), NotificationTypes.Info,
            $"Passage rouvert : {unitName}", "La Maîtrise de Groupe a rouvert le passage de votre unité : vous pouvez à nouveau le modifier.", "/passage", ct);
        return Result<bool>.Success(true);
    }
}


// 6. TogglePassage — CG opens/closes the passage process
public record TogglePassageCommand(bool Enabled, string ScoutYear) : IRequest<Result<bool>>;

public class TogglePassageCommandValidator : AbstractValidator<TogglePassageCommand>
{
    public TogglePassageCommandValidator()
        => RuleFor(x => x.ScoutYear).NotEmpty().WithMessage("L'année scoute est requise.")
            .MaximumLength(20).Matches(@"^[0-9\- ]+$").WithMessage("Année scoute invalide (ex. 2026-2027).");
}

public class TogglePassageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<TogglePassageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(TogglePassageCommand request, CancellationToken ct)
    {
        // CG-level operation (passage.manage) — controller-gated; defense-in-depth here.
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.PassageManage))
            return Result<bool>.Failure("Accès réservé à la maîtrise de groupe.");

        var enabledSetting = await context.Settings.FirstOrDefaultAsync(s => s.Key == "passage.enabled", ct);
        var yearSetting = await context.Settings.FirstOrDefaultAsync(s => s.Key == "passage.scout_year", ct);

        if (enabledSetting is not null)
        {
            enabledSetting.Value = request.Enabled ? "true" : "false";
        }
        else
        {
            context.Settings.Add(new Setting
            {
                Key = "passage.enabled",
                Value = request.Enabled ? "true" : "false",
                Category = "passage",
                Label = "Passage annuel actif",
                Description = "Active ou désactive le processus de passage annuel",
                ValueType = "boolean"
            });
        }

        if (yearSetting is not null)
        {
            yearSetting.Value = request.ScoutYear;
        }
        else
        {
            context.Settings.Add(new Setting
            {
                Key = "passage.scout_year",
                Value = request.ScoutYear,
                Category = "passage",
                Label = "Année scoute du passage",
                Description = "Année scoute cible pour le passage en cours",
                ValueType = "string"
            });
        }

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Toggle", "Passage", null,
            newValues: new { request.Enabled, request.ScoutYear },
            cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}

// 7. DeletePassage — CU removes a line of their unit (until the unit is finished or the CG changed the line)
public record DeletePassageCommand(Guid Id) : IRequest<Result<bool>>;

public class DeletePassageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<DeletePassageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeletePassageCommand request, CancellationToken ct)
    {
        var passage = await context.Passages.FindAsync([request.Id], ct);
        if (passage is null)
            return Result<bool>.Failure("Passage introuvable.");

        if (passage.Status == PassageStatus.Finalized)
            return Result<bool>.Failure("Ce passage a déjà été publié.");

        // Check access: must be super admin or have access to the unit
        if (!await PassageAccessHelper.CanAccessUnit(context, currentUser, passage.CurrentUnitId, ct))
            return Result<bool>.Failure("Accès non autorisé.");

        // A finished unit, or a line the CG changed, is no longer the CU's to delete.
        if (!PassageLocks.IsManager(currentUser))
        {
            if (passage.CgModified) return Result<bool>.Failure(PassageLocks.CgModified);
            if (await PassageLocks.IsUnitSubmittedAsync(context, passage.CurrentUnitId, passage.ScoutYear, ct))
                return Result<bool>.Failure(PassageLocks.UnitLocked);
        }

        // Resolve names BEFORE the delete so the audit snapshot is readable (member/unit still queryable).
        var delMember = await AuditNames.MemberAsync(context, passage.MemberId, ct);
        var delUnit = await AuditNames.UnitAsync(context, passage.ProposedUnitId, ct);
        context.Passages.Remove(passage);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "Passage", passage.Id,
            oldValues: new { Member = delMember, ProposedUnit = delUnit, passage.ScoutYear },
            cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
