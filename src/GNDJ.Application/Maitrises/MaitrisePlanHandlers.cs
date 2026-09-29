using System.Text.Json;
using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Maitrises;

// The maîtrise "passage": the CG plans next year's leaders (who stops, who changes unit/function, who joins) and
// the plan is applied together with the youth passage, on the passage date, when the CG clicks "Publier le passage".
// Nothing changes before that. A youth planned to join the maîtrise gets their youth passage line set to "leaves the
// unit" (overwriting the CU's line, which is kept so cancelling restores it). Immediate changes (effective today)
// stay available through the existing Remove / Transfer commands and AddMaitriseNowCommand below.

// ── Shared helpers ─────────────────────────────────────────────────────────────────────────────
public static class MaitrisePlan
{
    // Profiles whose functions head a unit (chef d'unité / chef de groupe) — used to warn about a unit with no head.
    public static readonly string[] HeadProfiles = HeadReplacement.HeadProfiles;

    public const string AlreadyPublished = "Le passage de cette année est déjà publié : la maîtrise ne peut plus être planifiée pour cette année.";
    public const string YouthLocked = "Ce membre rejoint la maîtrise l'an prochain (page Maîtrises) : annulez ce changement là-bas pour modifier sa ligne de passage.";

    public static async Task<string> ScoutYearAsync(IApplicationDbContext context, CancellationToken ct)
        => await context.Settings.Where(s => s.Key == "passage.scout_year").Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "";

    public static Task<bool> IsPublishedAsync(IApplicationDbContext context, string year, CancellationToken ct)
        => context.Passages.AnyAsync(p => p.ScoutYear == year && p.Status == PassageStatus.Finalized, ct);

    // True when the member's youth passage line is held by the maîtrise plan (joins the maîtrise next year).
    public static Task<bool> HoldsYouthLineAsync(IApplicationDbContext context, string year, Guid memberId, CancellationToken ct)
        => context.MaitrisePlanLines.AnyAsync(l => l.ScoutYear == year && l.MemberId == memberId
            && l.YouthPassageId != null && l.AppliedAt == null, ct);

    // What the plan saves about a youth line before overwriting it (restored when the planned change is cancelled).
    public record YouthSnapshot(Guid? FinalUnitId, Guid? FinalTeamId, Guid? FinalRoleId, bool? FinalIsLeaving,
        bool CgModified, string? CgNotes, string Status, Guid? ReviewedByUserId, DateTime? ReviewedAt);

    // Applies the year's plan inside the passage publication (same transaction, same date). Returns how many
    // changes were applied. Ends first, then starts; a start that already exists is skipped (idempotent).
    public static async Task<int> ApplyAsync(IApplicationDbContext context, string year, DateOnly passageDate, CancellationToken ct)
    {
        var lines = await context.MaitrisePlanLines.Where(l => l.ScoutYear == year && l.AppliedAt == null).ToListAsync(ct);
        if (lines.Count == 0) return 0;

        var endIds = lines.Where(l => l.Kind == MaitrisePlanKinds.End && l.AssignmentId != null).Select(l => l.AssignmentId!.Value).ToList();
        var toEnd = await context.MemberAssignments.Where(a => endIds.Contains(a.Id) && a.EndDate == null).ToListAsync(ct);
        foreach (var a in toEnd) a.EndDate = passageDate;

        var starts = lines.Where(l => l.Kind == MaitrisePlanKinds.Start).ToList();
        var unitIds = starts.Select(l => l.UnitId).Distinct().ToList();
        var maitriseTeam = (await context.Teams.Where(t => unitIds.Contains(t.UnitId) && t.IsMaitrise)
                .Select(t => new { t.UnitId, t.Id }).ToListAsync(ct))
            .GroupBy(t => t.UnitId).ToDictionary(g => g.Key, g => g.First().Id);
        var memberIds = starts.Select(l => l.MemberId).Distinct().ToList();
        var endedNow = toEnd.Select(a => a.Id).ToHashSet();
        var existing = (await context.MemberAssignments
                .Where(a => a.EndDate == null && memberIds.Contains(a.MemberId))
                .Select(a => new { a.Id, a.MemberId, a.UnitId, a.FunctionalRoleId }).ToListAsync(ct))
            .Where(a => !endedNow.Contains(a.Id))
            .Select(a => (a.MemberId, a.UnitId, a.FunctionalRoleId)).ToHashSet();

        foreach (var l in starts)
        {
            if (!existing.Add((l.MemberId, l.UnitId, l.FunctionalRoleId))) continue;
            // One chef d'unité per unit: a new head ends any head still in place (normally already planned to stop).
            await HeadReplacement.EndOtherHeadsAsync(context, l.UnitId, l.FunctionalRoleId, l.MemberId, passageDate, ct);
            context.MemberAssignments.Add(new MemberAssignment
            {
                MemberId = l.MemberId,
                UnitId = l.UnitId,
                FunctionalRoleId = l.FunctionalRoleId,
                TeamId = maitriseTeam.TryGetValue(l.UnitId, out var tid) ? tid : null,
                StartDate = passageDate,
                Notes = $"Maîtrise {year}",
            });
        }

        var now = DateTime.UtcNow;
        foreach (var l in lines) l.AppliedAt = now;
        return lines.Count;
    }
}

// ── The plan page: every active unit with its current leaders + the year's planned changes ─────
public record MaitrisePlanMemberDto(Guid AssignmentId, Guid MemberId, string FirstName, string LastName,
    Guid FunctionalRoleId, string FunctionName, int Rank, bool IsHead);

public record MaitrisePlanUnitDto(Guid UnitId, string UnitCode, string UnitName, Guid UnitTypeId, string? UnitTypeName,
    string? UnitTypeColor, bool IsGroupUnit, IReadOnlyList<MaitrisePlanMemberDto> Current);

public record MaitrisePlanLineDto(Guid Id, string Kind, Guid MemberId, string FirstName, string LastName,
    Guid UnitId, Guid FunctionalRoleId, string FunctionName, int Rank, bool IsHead, Guid? AssignmentId,
    string? Notes, bool JoinsFromYouth, string? YouthUnitCode, bool Applied, Guid? CausedByLineId);

public record MaitrisePlanDto(string ScoutYear, string? PassageDate, bool Published,
    IReadOnlyList<MaitrisePlanUnitDto> Units, IReadOnlyList<MaitrisePlanLineDto> Lines);

public record GetMaitrisePlanQuery : IRequest<MaitrisePlanDto>;

public class GetMaitrisePlanQueryHandler(IApplicationDbContext context) : IRequestHandler<GetMaitrisePlanQuery, MaitrisePlanDto>
{
    public async ValueTask<MaitrisePlanDto> Handle(GetMaitrisePlanQuery request, CancellationToken ct)
    {
        var year = await MaitrisePlan.ScoutYearAsync(context, ct);
        var passageDate = await context.Settings.Where(s => s.Key == "passage.date").Select(s => s.Value).FirstOrDefaultAsync(ct);
        var published = !string.IsNullOrEmpty(year) && await MaitrisePlan.IsPublishedAsync(context, year, ct);
        var heads = MaitrisePlan.HeadProfiles;

        var current = await context.MemberAssignments
            .Where(a => a.EndDate == null && a.FunctionalRole.IsMaitrise)
            .Select(a => new
            {
                a.UnitId,
                Dto = new MaitrisePlanMemberDto(a.Id, a.MemberId, a.Member.FirstName, a.Member.LastName,
                    a.FunctionalRoleId, a.FunctionalRole.Name, a.FunctionalRole.Rank,
                    heads.Contains(a.FunctionalRole.SecurityProfile.Code)),
            })
            .ToListAsync(ct);
        var byUnit = current.GroupBy(c => c.UnitId).ToDictionary(g => g.Key, g => g.Select(x => x.Dto)
            .OrderByDescending(m => m.Rank).ThenBy(m => m.LastName).ThenBy(m => m.FirstName).ToList());

        var lineRows = await context.MaitrisePlanLines.Where(l => l.ScoutYear == year)
            .OrderBy(l => l.CreatedAt)
            .Select(l => new
            {
                l.Id, l.Kind, l.MemberId, l.Member.FirstName, l.Member.LastName, l.UnitId, l.FunctionalRoleId,
                FunctionName = l.FunctionalRole.Name, l.FunctionalRole.Rank,
                IsHead = heads.Contains(l.FunctionalRole.SecurityProfile.Code),
                l.AssignmentId, l.Notes, l.YouthPassageId, l.AppliedAt, l.CausedByLineId,
            })
            .ToListAsync(ct);
        // Youth joiners: show the unit they come from.
        var youthIds = lineRows.Where(l => l.YouthPassageId != null).Select(l => l.YouthPassageId!.Value).ToList();
        var youthUnit = await context.Passages.Where(p => youthIds.Contains(p.Id))
            .Select(p => new { p.Id, p.CurrentUnit.Code }).ToDictionaryAsync(p => p.Id, p => p.Code, ct);
        var lines = lineRows.Select(l => new MaitrisePlanLineDto(l.Id, l.Kind, l.MemberId, l.FirstName, l.LastName,
            l.UnitId, l.FunctionalRoleId, l.FunctionName, l.Rank, l.IsHead, l.AssignmentId, l.Notes,
            l.YouthPassageId != null, l.YouthPassageId is Guid y ? youthUnit.GetValueOrDefault(y) : null, l.AppliedAt != null, l.CausedByLineId)).ToList();

        // Every active unit (a unit with no leader today still shows, so a first chef can be planned) + any unit a
        // current leader or planned line points to.
        var unitIds = byUnit.Keys.Concat(lines.Select(l => l.UnitId)).Distinct().ToList();
        var units = await context.Units.Where(u => u.IsActive || unitIds.Contains(u.Id))
            .Select(u => new { u.Id, u.Code, u.Name, u.UnitTypeId, TypeName = u.UnitType.Name, u.UnitType.Color, TypeCode = u.UnitType.Code })
            .ToListAsync(ct);

        var unitDtos = units
            .Select(u => new MaitrisePlanUnitDto(u.Id, u.Code, u.Name, u.UnitTypeId, u.TypeName, u.Color, u.TypeCode == "GRP",
                byUnit.GetValueOrDefault(u.Id) ?? []))
            .OrderByDescending(u => u.IsGroupUnit).ThenBy(u => u.UnitCode)
            .ToList();

        return new MaitrisePlanDto(year, string.IsNullOrWhiteSpace(passageDate) ? null : passageDate, published, unitDtos, lines);
    }
}

// ── Plan: a new leadership function next year (a new chef, or an extra function for a current one) ──
public record PlanMaitriseStartCommand(Guid MemberId, Guid UnitId, Guid FunctionalRoleId, string? Notes) : IRequest<Result<Guid>>;

public class PlanMaitriseStartCommandValidator : AbstractValidator<PlanMaitriseStartCommand>
{
    public PlanMaitriseStartCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty();
        RuleFor(x => x.UnitId).NotEmpty();
        RuleFor(x => x.FunctionalRoleId).NotEmpty();
        RuleFor(x => x.Notes).MaximumLength(1000).NoHtml();
    }
}

public class PlanMaitriseStartCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<PlanMaitriseStartCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(PlanMaitriseStartCommand request, CancellationToken ct)
    {
        var year = await MaitrisePlan.ScoutYearAsync(context, ct);
        if (string.IsNullOrEmpty(year)) return Result<Guid>.Failure("L'année scoute du passage n'est pas définie (Paramètres → Passage).");
        if (await MaitrisePlan.IsPublishedAsync(context, year, ct)) return Result<Guid>.Failure(MaitrisePlan.AlreadyPublished);

        var check = await PlanChecks.StartAsync(context, year, request.MemberId, request.UnitId, request.FunctionalRoleId, null, ct);
        if (check is not null) return Result<Guid>.Failure(check);

        var line = new MaitrisePlanLine
        {
            ScoutYear = year, Kind = MaitrisePlanKinds.Start, MemberId = request.MemberId, UnitId = request.UnitId,
            FunctionalRoleId = request.FunctionalRoleId, Notes = Clean(request.Notes), CreatedByUserId = currentUser.UserId,
        };
        await YouthLine.HoldAsync(context, currentUser, year, line, ct);
        context.MaitrisePlanLines.Add(line);
        var replaced = await HeadSwap.PlanEndsAsync(context, currentUser, line, ct);
        await context.SaveChangesAsync(ct);

        await audit.LogAsync("PlanMaitrise", "MaitrisePlanLine", line.Id, newValues: new
        {
            Member = await AuditNames.MemberAsync(context, line.MemberId, ct),
            Unit = await AuditNames.UnitAsync(context, line.UnitId, ct),
            Role = await AuditNames.RoleAsync(context, line.FunctionalRoleId, ct),
            Change = "Nouvelle fonction", ScoutYear = year, line.Notes, Replaces = replaced,
        }, cancellationToken: ct);
        return Result<Guid>.Success(line.Id);
    }

    internal static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}

// ── Plan: stop a leadership function next year ─────────────────────────────────────────────────
public record PlanMaitriseEndCommand(Guid AssignmentId, string? Notes) : IRequest<Result<Guid>>;

public class PlanMaitriseEndCommandValidator : AbstractValidator<PlanMaitriseEndCommand>
{
    public PlanMaitriseEndCommandValidator()
    {
        RuleFor(x => x.AssignmentId).NotEmpty();
        RuleFor(x => x.Notes).MaximumLength(1000).NoHtml();
    }
}

public class PlanMaitriseEndCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<PlanMaitriseEndCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(PlanMaitriseEndCommand request, CancellationToken ct)
    {
        var year = await MaitrisePlan.ScoutYearAsync(context, ct);
        if (string.IsNullOrEmpty(year)) return Result<Guid>.Failure("L'année scoute du passage n'est pas définie (Paramètres → Passage).");
        if (await MaitrisePlan.IsPublishedAsync(context, year, ct)) return Result<Guid>.Failure(MaitrisePlan.AlreadyPublished);

        var (line, error) = await PlanChecks.EndLineAsync(context, currentUser, year, request.AssignmentId, request.Notes, ct);
        if (line is null) return Result<Guid>.Failure(error!);
        context.MaitrisePlanLines.Add(line);
        await context.SaveChangesAsync(ct);

        await audit.LogAsync("PlanMaitrise", "MaitrisePlanLine", line.Id, newValues: new
        {
            Member = await AuditNames.MemberAsync(context, line.MemberId, ct),
            Unit = await AuditNames.UnitAsync(context, line.UnitId, ct),
            Role = await AuditNames.RoleAsync(context, line.FunctionalRoleId, ct),
            Change = "Arrête", ScoutYear = year, line.Notes,
        }, cancellationToken: ct);
        return Result<Guid>.Success(line.Id);
    }
}

// ── Plan: change a leader's unit and/or function next year (= stop the old + start the new) ─────
public record PlanMaitriseChangeCommand(Guid AssignmentId, Guid NewUnitId, Guid NewFunctionalRoleId, bool KeepOld, string? Notes) : IRequest<Result<bool>>;

public class PlanMaitriseChangeCommandValidator : AbstractValidator<PlanMaitriseChangeCommand>
{
    public PlanMaitriseChangeCommandValidator()
    {
        RuleFor(x => x.AssignmentId).NotEmpty();
        RuleFor(x => x.NewUnitId).NotEmpty();
        RuleFor(x => x.NewFunctionalRoleId).NotEmpty();
        RuleFor(x => x.Notes).MaximumLength(1000).NoHtml();
    }
}

public class PlanMaitriseChangeCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<PlanMaitriseChangeCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(PlanMaitriseChangeCommand request, CancellationToken ct)
    {
        var year = await MaitrisePlan.ScoutYearAsync(context, ct);
        if (string.IsNullOrEmpty(year)) return Result<bool>.Failure("L'année scoute du passage n'est pas définie (Paramètres → Passage).");
        if (await MaitrisePlan.IsPublishedAsync(context, year, ct)) return Result<bool>.Failure(MaitrisePlan.AlreadyPublished);

        MaitrisePlanLine? end = null;
        if (!request.KeepOld)
        {
            var (line, error) = await PlanChecks.EndLineAsync(context, currentUser, year, request.AssignmentId, request.Notes, ct);
            if (line is null) return Result<bool>.Failure(error!);
            end = line;
        }
        var memberId = end?.MemberId ?? await context.MemberAssignments.Where(a => a.Id == request.AssignmentId && a.EndDate == null)
            .Select(a => (Guid?)a.MemberId).FirstOrDefaultAsync(ct);
        if (memberId is null) return Result<bool>.Failure("Affectation introuvable ou déjà clôturée.");

        var check = await PlanChecks.StartAsync(context, year, memberId.Value, request.NewUnitId, request.NewFunctionalRoleId,
            end?.AssignmentId, ct);
        if (check is not null) return Result<bool>.Failure(check);

        var start = new MaitrisePlanLine
        {
            ScoutYear = year, Kind = MaitrisePlanKinds.Start, MemberId = memberId.Value, UnitId = request.NewUnitId,
            FunctionalRoleId = request.NewFunctionalRoleId, Notes = PlanMaitriseStartCommandHandler.Clean(request.Notes),
            CreatedByUserId = currentUser.UserId,
        };
        // The old function's stop belongs to this change: cancelling either side cancels both.
        if (end is not null) { end.CausedByLineId = start.Id; context.MaitrisePlanLines.Add(end); }
        context.MaitrisePlanLines.Add(start);
        var replaced = await HeadSwap.PlanEndsAsync(context, currentUser, start, ct);
        await context.SaveChangesAsync(ct);

        await audit.LogAsync("PlanMaitrise", "MaitrisePlanLine", start.Id, newValues: new
        {
            Member = await AuditNames.MemberAsync(context, memberId.Value, ct),
            Unit = await AuditNames.UnitAsync(context, request.NewUnitId, ct),
            Role = await AuditNames.RoleAsync(context, request.NewFunctionalRoleId, ct),
            Change = request.KeepOld ? "Fonction ajoutée" : "Changement d'unité / de fonction", ScoutYear = year, start.Notes, Replaces = replaced,
        }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ── Cancel a planned change (restores the youth passage line it had overwritten) ────────────────
public record CancelMaitrisePlanLineCommand(Guid Id) : IRequest<Result<bool>>;

public class CancelMaitrisePlanLineCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<CancelMaitrisePlanLineCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(CancelMaitrisePlanLineCommand request, CancellationToken ct)
    {
        var line = await context.MaitrisePlanLines.FirstOrDefaultAsync(l => l.Id == request.Id, ct);
        if (line is null) return Result<bool>.Failure("Changement introuvable.");
        if (line.AppliedAt != null) return Result<bool>.Failure("Ce changement a déjà été appliqué (passage publié).");

        // A change = the new function (Start) + the lines it caused: the stop of the member's old function and, when
        // it gives the chef d'unité function, the stop of the current chef. Cancelling any of them cancels the whole
        // change — the replaced chef d'unité is reinstated (a unit never ends up with two chefs d'unité).
        var root = line;
        if (line.Kind == MaitrisePlanKinds.End && line.CausedByLineId is Guid causeId)
            root = await context.MaitrisePlanLines.FirstOrDefaultAsync(l => l.Id == causeId && l.AppliedAt == null, ct) ?? line;
        var group = new List<MaitrisePlanLine> { root };
        if (root.Kind == MaitrisePlanKinds.Start)
            group.AddRange(await context.MaitrisePlanLines.Where(l => l.CausedByLineId == root.Id && l.AppliedAt == null).ToListAsync(ct));
        if (!group.Contains(line)) group.Add(line);
        foreach (var l in group.Where(l => l.Kind == MaitrisePlanKinds.Start))
            await YouthLine.ReleaseAsync(context, l, ct);
        context.MaitrisePlanLines.RemoveRange(group);
        await context.SaveChangesAsync(ct);

        await audit.LogAsync("CancelPlanMaitrise", "MaitrisePlanLine", line.Id, oldValues: new
        {
            Member = await AuditNames.MemberAsync(context, line.MemberId, ct),
            Unit = await AuditNames.UnitAsync(context, line.UnitId, ct),
            Role = await AuditNames.RoleAsync(context, line.FunctionalRoleId, ct),
            Change = line.Kind == MaitrisePlanKinds.End ? "Arrête" : "Nouvelle fonction", line.ScoutYear,
        }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ── Immediate: give someone a leadership function today (mid-year) ─────────────────────────────
// A youth who becomes a chef today leaves their youth function today.
public record AddMaitriseNowCommand(Guid MemberId, Guid UnitId, Guid FunctionalRoleId) : IRequest<Result<Guid>>;

public class AddMaitriseNowCommandValidator : AbstractValidator<AddMaitriseNowCommand>
{
    public AddMaitriseNowCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty();
        RuleFor(x => x.UnitId).NotEmpty();
        RuleFor(x => x.FunctionalRoleId).NotEmpty();
    }
}

public class AddMaitriseNowCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<AddMaitriseNowCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(AddMaitriseNowCommand request, CancellationToken ct)
    {
        var roleError = await PlanChecks.RoleForUnitAsync(context, request.UnitId, request.FunctionalRoleId, ct);
        if (roleError is not null) return Result<Guid>.Failure(roleError);
        if (!await context.Members.AnyAsync(m => m.Id == request.MemberId, ct)) return Result<Guid>.Failure("Membre introuvable.");
        if (await context.MemberAssignments.AnyAsync(a => a.MemberId == request.MemberId && a.UnitId == request.UnitId
                && a.FunctionalRoleId == request.FunctionalRoleId && a.EndDate == null, ct))
            return Result<Guid>.Failure("Ce membre a déjà cette fonction active dans cette unité.");

        var today = LebanonClock.Today;
        var isLeader = await context.MemberAssignments.AnyAsync(a => a.MemberId == request.MemberId && a.EndDate == null && a.FunctionalRole.IsMaitrise, ct);
        var endedYouth = 0;
        if (!isLeader)
        {
            var youth = await context.MemberAssignments.Where(a => a.MemberId == request.MemberId && a.EndDate == null).ToListAsync(ct);
            foreach (var a in youth) { a.EndDate = today; endedYouth++; }
        }
        var teamId = await context.Teams.Where(t => t.UnitId == request.UnitId && t.IsMaitrise).Select(t => (Guid?)t.Id).FirstOrDefaultAsync(ct);
        var assignment = new MemberAssignment
        {
            MemberId = request.MemberId, UnitId = request.UnitId, FunctionalRoleId = request.FunctionalRoleId,
            TeamId = teamId, StartDate = today,
        };
        context.MemberAssignments.Add(assignment);
        var replaced = await HeadReplacement.EndOtherHeadsAsync(context, request.UnitId, request.FunctionalRoleId, request.MemberId, today, ct);
        await context.SaveChangesAsync(ct);

        await audit.LogAsync("Create", "MemberAssignment", assignment.Id, newValues: new
        {
            Member = await AuditNames.MemberAsync(context, request.MemberId, ct),
            Unit = await AuditNames.UnitAsync(context, request.UnitId, ct),
            Role = await AuditNames.RoleAsync(context, request.FunctionalRoleId, ct),
            Reason = "Ajout à la maîtrise", EndedYouthFunctions = endedYouth, Replaced = replaced,
        }, cancellationToken: ct);
        return Result<Guid>.Success(assignment.Id);
    }
}

// ── Checks shared by the plan commands ─────────────────────────────────────────────────────────
static class PlanChecks
{
    public static async Task<string?> RoleForUnitAsync(IApplicationDbContext context, Guid unitId, Guid roleId, CancellationToken ct)
    {
        var unit = await context.Units.FirstOrDefaultAsync(u => u.Id == unitId, ct);
        if (unit is null) return "Unité introuvable.";
        var role = await context.FunctionalRoles.FirstOrDefaultAsync(r => r.Id == roleId, ct);
        if (role is null) return "Fonction introuvable.";
        if (!role.IsMaitrise) return "Choisissez une fonction de maîtrise.";
        if (role.UnitTypeId != null && role.UnitTypeId != unit.UnitTypeId)
            return "Cette fonction n'appartient pas au type de cette unité.";
        return null;
    }

    // A start is refused when the member already holds (and keeps) that function, or it's already planned.
    public static async Task<string?> StartAsync(IApplicationDbContext context, string year, Guid memberId, Guid unitId, Guid roleId,
        Guid? endingAssignmentId, CancellationToken ct)
    {
        var roleError = await RoleForUnitAsync(context, unitId, roleId, ct);
        if (roleError is not null) return roleError;
        if (!await context.Members.AnyAsync(m => m.Id == memberId, ct)) return "Membre introuvable.";

        var plannedEnds = await context.MaitrisePlanLines
            .Where(l => l.ScoutYear == year && l.Kind == MaitrisePlanKinds.End && l.MemberId == memberId && l.AppliedAt == null)
            .Select(l => l.AssignmentId).ToListAsync(ct);
        var holds = await context.MemberAssignments.AnyAsync(a => a.MemberId == memberId && a.UnitId == unitId
            && a.FunctionalRoleId == roleId && a.EndDate == null && a.Id != endingAssignmentId && !plannedEnds.Contains(a.Id), ct);
        if (holds) return "Ce membre a déjà cette fonction dans cette unité (et la garde l'an prochain).";
        var planned = await context.MaitrisePlanLines.AnyAsync(l => l.ScoutYear == year && l.Kind == MaitrisePlanKinds.Start
            && l.MemberId == memberId && l.UnitId == unitId && l.FunctionalRoleId == roleId && l.AppliedAt == null, ct);
        if (planned) return "Ce changement est déjà prévu.";
        return null;
    }

    public static async Task<(MaitrisePlanLine? Line, string? Error)> EndLineAsync(IApplicationDbContext context,
        ICurrentUserService currentUser, string year, Guid assignmentId, string? notes, CancellationToken ct)
    {
        var a = await context.MemberAssignments.Where(x => x.Id == assignmentId && x.EndDate == null)
            .Select(x => new { x.MemberId, x.UnitId, x.FunctionalRoleId, x.FunctionalRole.IsMaitrise }).FirstOrDefaultAsync(ct);
        if (a is null) return (null, "Affectation introuvable ou déjà clôturée.");
        if (!a.IsMaitrise) return (null, "Cette fonction n'est pas une fonction de maîtrise.");
        if (await context.MaitrisePlanLines.AnyAsync(l => l.ScoutYear == year && l.Kind == MaitrisePlanKinds.End
                && l.AssignmentId == assignmentId && l.AppliedAt == null, ct))
            return (null, "L'arrêt de cette fonction est déjà prévu.");
        return (new MaitrisePlanLine
        {
            ScoutYear = year, Kind = MaitrisePlanKinds.End, MemberId = a.MemberId, UnitId = a.UnitId,
            FunctionalRoleId = a.FunctionalRoleId, AssignmentId = assignmentId,
            Notes = PlanMaitriseStartCommandHandler.Clean(notes), CreatedByUserId = currentUser.UserId,
        }, null);
    }
}

// ── A new chef d'unité replaces the current one ─────────────────────────────────────────────────
static class HeadSwap
{
    // When `start` gives a head function (chef d'unité / chef de groupe) in a unit, the current holders of a head
    // function there (other members, not already planned to stop) are planned to stop too, linked to `start`.
    // Returns the names of the replaced heads (for the audit).
    public static async Task<List<string>> PlanEndsAsync(IApplicationDbContext context, ICurrentUserService currentUser,
        MaitrisePlanLine start, CancellationToken ct)
    {
        var heads = MaitrisePlan.HeadProfiles;
        var isHead = await context.FunctionalRoles.AnyAsync(r => r.Id == start.FunctionalRoleId && heads.Contains(r.SecurityProfile.Code), ct);
        if (!isHead) return [];
        var plannedEnds = await context.MaitrisePlanLines
            .Where(l => l.ScoutYear == start.ScoutYear && l.Kind == MaitrisePlanKinds.End && l.AppliedAt == null)
            .Select(l => l.AssignmentId).ToListAsync(ct);
        var current = await context.MemberAssignments
            .Where(a => a.UnitId == start.UnitId && a.EndDate == null && a.MemberId != start.MemberId
                && heads.Contains(a.FunctionalRole.SecurityProfile.Code) && !plannedEnds.Contains(a.Id))
            .Select(a => new { a.Id, a.MemberId, a.FunctionalRoleId, a.Member.FirstName, a.Member.LastName }).ToListAsync(ct);
        foreach (var a in current)
            context.MaitrisePlanLines.Add(new MaitrisePlanLine
            {
                ScoutYear = start.ScoutYear, Kind = MaitrisePlanKinds.End, MemberId = a.MemberId, UnitId = start.UnitId,
                FunctionalRoleId = a.FunctionalRoleId, AssignmentId = a.Id, CausedByLineId = start.Id,
                CreatedByUserId = currentUser.UserId,
            });
        return current.Select(a => $"{a.FirstName} {a.LastName}").ToList();
    }
}

// ── The youth passage line of a member planned to join the maîtrise ─────────────────────────────
static class YouthLine
{
    // If the member is a youth today (active assignment, no leadership function), their youth passage line becomes
    // "leaves the unit" — creating it when the CU hasn't entered one, otherwise overwriting it (kept in a snapshot).
    public static async Task HoldAsync(IApplicationDbContext context, ICurrentUserService currentUser, string year,
        MaitrisePlanLine line, CancellationToken ct)
    {
        var active = await context.MemberAssignments.Where(a => a.MemberId == line.MemberId && a.EndDate == null)
            .Select(a => new { a.UnitId, a.TeamId, a.FunctionalRoleId, a.FunctionalRole.IsMaitrise }).ToListAsync(ct);
        if (active.Count == 0 || active.Any(a => a.IsMaitrise)) return; // not a youth (alumni, or already a chef)
        // Another planned start already holds the line: nothing more to do.
        if (await MaitrisePlan.HoldsYouthLineAsync(context, year, line.MemberId, ct)) return;

        var unitName = await context.Units.Where(u => u.Id == line.UnitId).Select(u => u.Name).FirstOrDefaultAsync(ct);
        var roleName = await context.FunctionalRoles.Where(r => r.Id == line.FunctionalRoleId).Select(r => r.Name).FirstOrDefaultAsync(ct);
        var note = $"Rejoint la maîtrise l'an prochain : {unitName} — {roleName} (décision du CG).";

        var passage = await context.Passages.FirstOrDefaultAsync(p => p.ScoutYear == year && p.MemberId == line.MemberId, ct);
        if (passage is null)
        {
            var youth = active[0];
            passage = new Passage
            {
                ScoutYear = year, MemberId = line.MemberId,
                CurrentUnitId = youth.UnitId, CurrentTeamId = youth.TeamId, CurrentRoleId = youth.FunctionalRoleId,
                ProposedUnitId = youth.UnitId, ProposedTeamId = youth.TeamId, ProposedRoleId = youth.FunctionalRoleId,
                ProposedByUserId = currentUser.UserId ?? Guid.Empty,
            };
            context.Passages.Add(passage);
            line.YouthPassageCreated = true;
        }
        else
        {
            if (passage.Status == PassageStatus.Finalized) return;
            line.YouthPassageSnapshot = JsonSerializer.Serialize(new MaitrisePlan.YouthSnapshot(passage.FinalUnitId, passage.FinalTeamId,
                passage.FinalRoleId, passage.FinalIsLeaving, passage.CgModified, passage.CgNotes, passage.Status,
                passage.ReviewedByUserId, passage.ReviewedAt));
        }

        passage.FinalUnitId = null;
        passage.FinalTeamId = null;
        passage.FinalRoleId = null;
        passage.FinalIsLeaving = passage.IsLeaving ? null : true;
        passage.CgModified = true; // locked for the CU: the CG decided
        passage.CgNotes = note;
        passage.Status = PassageStatus.Approved;
        passage.ReviewedByUserId = currentUser.UserId;
        passage.ReviewedAt = DateTime.UtcNow;
        line.YouthPassageId = passage.Id;
    }

    // Cancelling the planned start that holds the line: hand it to another planned start of the same member if
    // any, else restore the CU's line (or remove the line the plan created).
    public static async Task ReleaseAsync(IApplicationDbContext context, MaitrisePlanLine line, CancellationToken ct)
    {
        if (line.YouthPassageId is not Guid passageId) return;
        var other = await context.MaitrisePlanLines.FirstOrDefaultAsync(l => l.Id != line.Id && l.ScoutYear == line.ScoutYear
            && l.MemberId == line.MemberId && l.Kind == MaitrisePlanKinds.Start && l.AppliedAt == null, ct);
        if (other is not null)
        {
            other.YouthPassageId = line.YouthPassageId;
            other.YouthPassageCreated = line.YouthPassageCreated;
            other.YouthPassageSnapshot = line.YouthPassageSnapshot;
            return;
        }

        var passage = await context.Passages.FirstOrDefaultAsync(p => p.Id == passageId, ct);
        if (passage is null || passage.Status == PassageStatus.Finalized) return;
        if (line.YouthPassageCreated)
        {
            context.Passages.Remove(passage);
            return;
        }
        var s = line.YouthPassageSnapshot is null ? null : JsonSerializer.Deserialize<MaitrisePlan.YouthSnapshot>(line.YouthPassageSnapshot);
        if (s is null) return;
        passage.FinalUnitId = s.FinalUnitId;
        passage.FinalTeamId = s.FinalTeamId;
        passage.FinalRoleId = s.FinalRoleId;
        passage.FinalIsLeaving = s.FinalIsLeaving;
        passage.CgModified = s.CgModified;
        passage.CgNotes = s.CgNotes;
        passage.Status = s.Status;
        passage.ReviewedByUserId = s.ReviewedByUserId;
        passage.ReviewedAt = s.ReviewedAt;
    }
}

// ── Member search for « Ajouter un chef » ──────────────────────────────────────────────────────
// Who can be picked: members with an active post that is either a leadership function (a chef anywhere) or in a
// branch that isn't a youth branch (Clan, Noyau, JEM, Feu, Groupe…). Pure youth of Meute / Ronde / Troupe /
// Compagnie are left out — they're too young to join a maîtrise. Each result carries its current posts
// ("JEM · Jeune En Marche") so homonyms can be told apart. Name / matricule search, accent-insensitive, every word
// must match; up to 25 results.
public record MaitriseCandidateDto(Guid MemberId, string FirstName, string LastName, string Posts);
public record GetMaitriseCandidatesQuery(string? Search) : IRequest<List<MaitriseCandidateDto>>;

public class GetMaitriseCandidatesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetMaitriseCandidatesQuery, List<MaitriseCandidateDto>>
{
    private static readonly string[] YouthBranchCodes = ["MEU", "RON", "TRO", "COM"];

    public async ValueTask<List<MaitriseCandidateDto>> Handle(GetMaitriseCandidatesQuery request, CancellationToken ct)
    {
        var terms = (request.Search ?? "").ToLower().Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (terms.Length == 0) return [];

        var members = context.Members.Where(m => context.MemberAssignments.Any(a => a.MemberId == m.Id && a.EndDate == null
            && (a.FunctionalRole.IsMaitrise || !YouthBranchCodes.Contains(a.Unit.UnitType.Code))));
        foreach (var raw in terms)
        {
            var term = raw;
            members = members.Where(m =>
                DbFns.Unaccent(m.FirstName.ToLower()).Contains(DbFns.Unaccent(term)) ||
                DbFns.Unaccent(m.LastName.ToLower()).Contains(DbFns.Unaccent(term)) ||
                (m.CardNumber != null && m.CardNumber.ToLower().Contains(term)));
        }
        var found = await members.OrderBy(m => m.LastName).ThenBy(m => m.FirstName).Take(25)
            .Select(m => new { m.Id, m.FirstName, m.LastName }).ToListAsync(ct);
        var ids = found.Select(m => m.Id).ToList();
        var posts = await context.MemberAssignments
            .Where(a => ids.Contains(a.MemberId) && a.EndDate == null)
            .OrderByDescending(a => a.FunctionalRole.IsMaitrise).ThenByDescending(a => a.FunctionalRole.Rank)
            .Select(a => new { a.MemberId, a.Unit.Code, Role = a.FunctionalRole.Name })
            .ToListAsync(ct);
        return found.Select(m => new MaitriseCandidateDto(m.Id, m.FirstName, m.LastName,
                string.Join(" · ", posts.Where(p => p.MemberId == m.Id).Select(p => $"{p.Code} {p.Role}"))))
            .ToList();
    }
}
