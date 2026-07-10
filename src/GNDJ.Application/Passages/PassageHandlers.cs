using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

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

// Annual passage workflow: each scout year the CU proposes where every member goes next
// (Pending), the CG reviews/modifies/approves or rejects them (Approved/Rejected), then the CG
// finalizes the whole year — ending current assignments and creating the new ones. A "no change"
// proposal is auto-approved; a departure ("quitte le groupe") always needs CG review.

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
    DateTime CreatedAt
);

// CG completeness view: status tallies + Expected (active members) vs MissingLines (active members
// without a passage line) — the finalize gate blocks until MissingLines reaches 0.
public record PassageSummaryDto(
    string ScoutYear, int TotalMembers, int Pending, int Approved, int Rejected, int Finalized,
    int ExpectedMembers, int MissingLines,
    IReadOnlyList<PassageUnitSummaryDto> UnitSummaries
);

public record PassageUnitSummaryDto(
    Guid UnitId, string UnitCode, string UnitName,
    int Total, int Pending, int Approved, int Rejected, int Finalized,
    int ExpectedMembers, int MissingLines);

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

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var items = await context.Passages
            .Where(p => p.CurrentUnitId == request.UnitId && p.ScoutYear == request.ScoutYear)
            .OrderBy(p => p.Member.LastName).ThenBy(p => p.Member.FirstName)
            .Select(p => new PassageDto(
                p.Id, p.ScoutYear, p.MemberId,
                p.Member.FirstName + " " + p.Member.LastName,
                p.Member.CardNumber,
                p.Member.DateOfBirth,
                // age = year diff, minus 1 if this year's birthday hasn't occurred yet
                p.Member.DateOfBirth != null ? today.Year - p.Member.DateOfBirth.Value.Year - (today < new DateOnly(today.Year, p.Member.DateOfBirth.Value.Month, p.Member.DateOfBirth.Value.Day) ? 1 : 0) : null,
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
                p.CreatedAt
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
        if (!currentUser.IsSuperAdmin)
            return Result<IReadOnlyList<PassageDto>>.Failure("Accès réservé aux super administrateurs.");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

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
                p.Member.DateOfBirth != null ? today.Year - p.Member.DateOfBirth.Value.Year - (today < new DateOnly(today.Year, p.Member.DateOfBirth.Value.Month, p.Member.DateOfBirth.Value.Day) ? 1 : 0) : null,
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
                p.CreatedAt
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
        if (!currentUser.IsSuperAdmin)
            return Result<PassageSummaryDto>.Failure("Accès réservé aux super administrateurs.");

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
                    expected, missing
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
            unitSummaries
        );

        return Result<PassageSummaryDto>.Success(summary);
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
            if (existing.Status != PassageStatus.Pending && existing.Status != PassageStatus.Approved)
                return Result<Guid>.Failure("Ce passage a déjà été traité et ne peut plus être modifié.");

            existing.ProposedUnitId = request.ProposedUnitId;
            existing.ProposedTeamId = request.ProposedTeamId;
            existing.ProposedRoleId = request.ProposedRoleId;
            existing.CuNotes = request.CuNotes;
            existing.IsLeaving = request.IsLeaving;
            // Update current snapshot in case assignment changed
            existing.CurrentUnitId = assignment.UnitId;
            existing.CurrentTeamId = assignment.TeamId;
            existing.CurrentRoleId = assignment.FunctionalRoleId;

            // Re-evaluate: no change → auto-approve, otherwise back to pending.
            // A departure ("quitte le groupe") always needs CG review — never auto-approved.
            var isNoChangeUpdate = !request.IsLeaving
                && request.ProposedUnitId == assignment.UnitId
                && request.ProposedTeamId == assignment.TeamId
                && request.ProposedRoleId == assignment.FunctionalRoleId;
            existing.Status = isNoChangeUpdate ? PassageStatus.Approved : PassageStatus.Pending;
            existing.FinalUnitId = null;
            existing.FinalTeamId = null;
            existing.FinalRoleId = null;
            existing.CgNotes = null;
            existing.ReviewedByUserId = null;
            existing.ReviewedAt = null;

            await context.SaveChangesAsync(ct);
            await auditService.LogAsync("Update", "Passage", existing.Id,
                newValues: new { existing.ProposedUnitId, existing.ProposedRoleId, existing.CuNotes },
                cancellationToken: ct);

            return Result<Guid>.Success(existing.Id);
        }

        // Detect "no change": same unit, same team, same role → auto-approve.
        // A departure ("quitte le groupe") always needs CG review — never auto-approved.
        var isNoChange = !request.IsLeaving
            && request.ProposedUnitId == assignment.UnitId
            && request.ProposedTeamId == assignment.TeamId
            && request.ProposedRoleId == assignment.FunctionalRoleId;

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
            Status = isNoChange ? PassageStatus.Approved : PassageStatus.Pending,
            ProposedByUserId = currentUser.UserId!.Value
        };

        context.Passages.Add(passage);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "Passage", passage.Id,
            newValues: new { passage.MemberId, passage.ProposedUnitId, passage.ProposedRoleId },
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

            var existing = existingByMember.GetValueOrDefault(memberId);

            var isNoChange = request.ProposedUnitId == assignment.UnitId
                && request.ProposedTeamId == assignment.TeamId
                && request.ProposedRoleId == assignment.FunctionalRoleId;
            var autoStatus = isNoChange ? PassageStatus.Approved : PassageStatus.Pending;

            if (existing is not null)
            {
                if (existing.Status != PassageStatus.Pending && existing.Status != PassageStatus.Approved)
                    continue; // Skip already-reviewed passages

                existing.ProposedUnitId = request.ProposedUnitId;
                existing.ProposedTeamId = request.ProposedTeamId;
                existing.ProposedRoleId = request.ProposedRoleId;
                existing.CuNotes = request.CuNotes;
                existing.CurrentUnitId = assignment.UnitId;
                existing.CurrentTeamId = assignment.TeamId;
                existing.CurrentRoleId = assignment.FunctionalRoleId;
                existing.Status = autoStatus;
                if (isNoChange) { existing.FinalUnitId = null; existing.FinalTeamId = null; existing.FinalRoleId = null; existing.CgNotes = null; }
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
            newValues: new { Count = count, request.ProposedUnitId, request.ProposedRoleId, request.ScoutYear },
            cancellationToken: ct);

        return Result<int>.Success(count);
    }
}

// 3. ReviewPassage — CG approves/rejects/modifies a single passage
public record ReviewPassageCommand(
    Guid Id, string Status,
    Guid? FinalUnitId, Guid? FinalTeamId, Guid? FinalRoleId,
    string? CgNotes
) : IRequest<Result<bool>>;

public class ReviewPassageCommandValidator : AbstractValidator<ReviewPassageCommand>
{
    public ReviewPassageCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("L'identifiant du passage est requis.");
        RuleFor(x => x.Status).NotEmpty().WithMessage("Le statut est requis.")
            .Must(s => s == PassageStatus.Approved || s == PassageStatus.Rejected)
            .WithMessage("Le statut doit être 'Approved' ou 'Rejected'.");
        RuleFor(x => x.CgNotes).MaximumLength(1000);
    }
}

public class ReviewPassageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<ReviewPassageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ReviewPassageCommand request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin)
            return Result<bool>.Failure("Accès réservé aux super administrateurs.");

        var passage = await context.Passages.FindAsync([request.Id], ct);
        if (passage is null)
            return Result<bool>.Failure("Passage introuvable.");

        if (passage.Status == PassageStatus.Finalized)
            return Result<bool>.Failure("Ce passage a déjà été finalisé.");

        var oldStatus = passage.Status;

        passage.Status = request.Status;
        passage.CgNotes = request.CgNotes;
        passage.ReviewedByUserId = currentUser.UserId;
        passage.ReviewedAt = DateTime.UtcNow;

        if (request.Status == PassageStatus.Approved)
        {
            // If final fields provided, use them; otherwise copy from proposed
            passage.FinalUnitId = request.FinalUnitId ?? passage.ProposedUnitId;
            passage.FinalTeamId = request.FinalTeamId ?? passage.ProposedTeamId;
            passage.FinalRoleId = request.FinalRoleId ?? passage.ProposedRoleId;

            // Validate final unit and role exist
            var finalUnitExists = await context.Units.AnyAsync(u => u.Id == passage.FinalUnitId, ct);
            if (!finalUnitExists)
                return Result<bool>.Failure("L'unité finale est introuvable.");

            var finalRoleExists = await context.FunctionalRoles.AnyAsync(r => r.Id == passage.FinalRoleId, ct);
            if (!finalRoleExists)
                return Result<bool>.Failure("Le rôle final est introuvable.");

            // If a final team is set, it must belong to the final unit (otherwise finalize would
            // create an assignment whose team is in a different unit, or fail the team FK).
            if (passage.FinalTeamId.HasValue)
            {
                var finalTeamOk = await context.Teams.AnyAsync(t => t.Id == passage.FinalTeamId.Value && t.UnitId == passage.FinalUnitId, ct);
                if (!finalTeamOk)
                    return Result<bool>.Failure("L'équipe finale n'appartient pas à l'unité finale.");
            }
        }

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Review", "Passage", passage.Id,
            oldValues: new { Status = oldStatus },
            newValues: new { passage.Status, passage.FinalUnitId, passage.FinalRoleId, passage.CgNotes },
            cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}

// 4. BulkReviewPassage — CG approves/rejects multiple passages at once
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
        RuleFor(x => x.Status).NotEmpty().WithMessage("Le statut est requis.")
            .Must(s => s == PassageStatus.Approved || s == PassageStatus.Rejected)
            .WithMessage("Le statut doit être 'Approved' ou 'Rejected'.");
        RuleFor(x => x.CgNotes).MaximumLength(1000);
    }
}

public class BulkReviewPassageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<BulkReviewPassageCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(BulkReviewPassageCommand request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin)
            return Result<int>.Failure("Accès réservé aux super administrateurs.");

        if (request.Status != PassageStatus.Approved && request.Status != PassageStatus.Rejected)
            return Result<int>.Failure("Le statut doit être 'Approved' ou 'Rejected'.");

        var passages = await context.Passages
            .Where(p => request.PassageIds.Contains(p.Id) && p.Status != PassageStatus.Finalized)
            .ToListAsync(ct);

        int count = 0;
        foreach (var passage in passages)
        {
            passage.Status = request.Status;
            passage.CgNotes = request.CgNotes;
            passage.ReviewedByUserId = currentUser.UserId;
            passage.ReviewedAt = DateTime.UtcNow;

            if (request.Status == PassageStatus.Approved)
            {
                // Copy proposed to final if not already set
                passage.FinalUnitId ??= passage.ProposedUnitId;
                passage.FinalTeamId ??= passage.ProposedTeamId;
                passage.FinalRoleId ??= passage.ProposedRoleId;
            }

            count++;
        }

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("BulkReview", "Passage", null,
            newValues: new { Count = count, request.Status },
            cancellationToken: ct);

        return Result<int>.Success(count);
    }
}

// 5. FinalizePassages — CG finalizes all approved passages for a school year
public record FinalizePassagesCommand(
    string ScoutYear, Guid? UnitId
) : IRequest<Result<int>>;

public class FinalizePassagesCommandValidator : AbstractValidator<FinalizePassagesCommand>
{
    public FinalizePassagesCommandValidator()
        => RuleFor(x => x.ScoutYear).NotEmpty().WithMessage("L'année scoute est requise.")
            .MaximumLength(20).Matches(@"^[0-9\- ]+$").WithMessage("Année scoute invalide (ex. 2026-2027).");
}

public class FinalizePassagesCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<FinalizePassagesCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(FinalizePassagesCommand request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin)
            return Result<int>.Failure("Accès réservé aux super administrateurs.");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        // "Date du passage" setting drives the effective date: old assignments end on it and the new
        // ones start on it. Empty/unset → today.
        var passageDateRaw = await context.Settings.Where(s => s.Key == "passage.date").Select(s => s.Value).FirstOrDefaultAsync(ct);
        var passageDate = DateOnly.TryParseExact(passageDateRaw, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var pd) ? pd : today;

        // Serialize finalize: a transaction-scoped advisory lock means a second concurrent finalize
        // (double-click, or two CG users at once) blocks until the first commits, then finds the
        // passages already Finalized and does nothing — so no duplicate assignments can be created.
        await using var tx = await context.BeginTransactionAsync(ct);
        await context.AcquireAdvisoryLockAsync(917320250, ct);

        // Completeness gate: every active member in scope must have a passage line before finalizing.
        // (The CU creates one for each member — a real change or the "Pas de changement" button.)
        var activeMemberIdsQuery = context.MemberAssignments.Where(a => a.EndDate == null);
        if (request.UnitId.HasValue)
            activeMemberIdsQuery = activeMemberIdsQuery.Where(a => a.UnitId == request.UnitId.Value);
        var activeMemberIds = await activeMemberIdsQuery.Select(a => a.MemberId).Distinct().ToListAsync(ct);

        var lineMemberIdsQuery = context.Passages.Where(p => p.ScoutYear == request.ScoutYear);
        if (request.UnitId.HasValue)
            lineMemberIdsQuery = lineMemberIdsQuery.Where(p => p.CurrentUnitId == request.UnitId.Value);
        var lineMemberIds = (await lineMemberIdsQuery.Select(p => p.MemberId).ToListAsync(ct)).ToHashSet();

        var missing = activeMemberIds.Count(mid => !lineMemberIds.Contains(mid));
        if (missing > 0)
            return Result<int>.Failure($"Le passage est incomplet : {missing} membre(s) actif(s) sans ligne de passage. Chaque membre doit avoir une décision (proposition ou « Pas de changement ») avant la finalisation.");

        var query = context.Passages
            .Where(p => p.ScoutYear == request.ScoutYear && p.Status == PassageStatus.Approved);

        if (request.UnitId.HasValue)
            query = query.Where(p => p.CurrentUnitId == request.UnitId.Value);

        var passages = await query.ToListAsync(ct);

        // Batch-load every affected member's active assignment in ONE query instead of one per passage.
        // This runs inside the advisory-lock transaction, so collapsing N round-trips to 1 directly shortens
        // how long the lock is held (was the per-passage query at the top of the loop). Tracked (no
        // AsNoTracking) so the EndDate mutation below persists on SaveChanges.
        var memberIds = passages.Select(p => p.MemberId).ToList();
        var activeByMember = (await context.MemberAssignments
                .Where(a => a.EndDate == null && memberIds.Contains(a.MemberId))
                .ToListAsync(ct))
            .GroupBy(a => a.MemberId)
            .ToDictionary(g => g.Key, g => g.First());

        int count = 0;

        foreach (var passage in passages)
        {
            // End the member's current active assignment
            if (activeByMember.TryGetValue(passage.MemberId, out var activeAssignment))
            {
                activeAssignment.EndDate = passageDate;
            }

            // "Quitte le groupe": close the assignment and create NO new one — member becomes alumni.
            if (!passage.IsLeaving)
            {
                var finalUnitId = passage.FinalUnitId ?? passage.ProposedUnitId;
                var finalRoleId = passage.FinalRoleId ?? passage.ProposedRoleId;

                // If unit changed, clear team (member joins new unit without team — CU assigns later)
                Guid? finalTeamId;
                if (finalUnitId != passage.CurrentUnitId)
                    finalTeamId = null;
                else
                    finalTeamId = passage.FinalTeamId ?? passage.ProposedTeamId;

                var newAssignment = new MemberAssignment
                {
                    MemberId = passage.MemberId,
                    UnitId = finalUnitId,
                    TeamId = finalTeamId,
                    FunctionalRoleId = finalRoleId,
                    StartDate = passageDate,
                    Notes = $"Passage {passage.ScoutYear}"
                };
                context.MemberAssignments.Add(newAssignment);
            }

            // Mark passage as finalized
            passage.Status = PassageStatus.Finalized;
            count++;
        }

        await context.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await auditService.LogAsync("Finalize", "Passage", null,
            newValues: new { Count = count, request.ScoutYear, request.UnitId },
            cancellationToken: ct);

        return Result<int>.Success(count);
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
        if (!currentUser.IsSuperAdmin)
            return Result<bool>.Failure("Accès réservé aux super administrateurs.");

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

// 7. DeletePassage — CU can delete their own pending passage
public record DeletePassageCommand(Guid Id) : IRequest<Result<bool>>;

public class DeletePassageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<DeletePassageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeletePassageCommand request, CancellationToken ct)
    {
        var passage = await context.Passages.FindAsync([request.Id], ct);
        if (passage is null)
            return Result<bool>.Failure("Passage introuvable.");

        if (passage.Status != PassageStatus.Pending)
            return Result<bool>.Failure("Seuls les passages en attente peuvent être supprimés.");

        // Check access: must be super admin or have access to the unit
        if (!await PassageAccessHelper.CanAccessUnit(context, currentUser, passage.CurrentUnitId, ct))
            return Result<bool>.Failure("Accès non autorisé.");

        context.Passages.Remove(passage);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "Passage", passage.Id,
            oldValues: new { passage.MemberId, passage.ProposedUnitId, passage.ScoutYear },
            cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
