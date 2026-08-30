using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Meetings;

// Réunions / absences. A réunion is a unit-wide OR team-scoped meeting/outing/camp; attendance is an absentee list
// (present by default). A CU (attendance.manage + unit) manages everything in their units; a chef d'équipe (a
// member holding an IsTeamLeader role on a team) can create a PENDING réunion for their team and fill its
// attendance. Absence counts (per member) surface on the CU roster, CG list, and member fiche.

// ── Shared authorization helpers ───────────────────────────────────────────────
public static class AttendanceAccess
{
    // A CU/CG manages a unit's réunions when they hold attendance.manage AND the unit is in scope (CG = all units).
    public static bool CanManageUnit(ICurrentUserService u, Guid unitId) =>
        u.IsSuperAdmin || (u.Permissions.Contains(Permissions.AttendanceManage) && u.AuthorizedUnitIds.Contains(unitId));

    // Teams the given member currently LEADS = active assignment on a team, holding an IsTeamLeader role.
    public static async Task<HashSet<Guid>> LeadTeamIdsAsync(IApplicationDbContext ctx, Guid? memberId, CancellationToken ct)
    {
        if (memberId is null) return [];
        var ids = await ctx.MemberAssignments
            .Where(a => a.MemberId == memberId && a.EndDate == null && a.TeamId != null && a.FunctionalRole.IsTeamLeader)
            .Select(a => a.TeamId!.Value).Distinct().ToListAsync(ct);
        return [.. ids];
    }

    // Group-manager (super-admin or maitrise.manage = CG/ACG, or a delegated full-CG) — may create/manage
    // group-wide & unit-type member groups + define groups.
    public static bool CanManageDynamic(ICurrentUserService u) =>
        u.IsSuperAdmin || u.Permissions.Contains(Permissions.MaitriseManage);

    // Who may create/fill a member-group réunion. A TOP-LEVEL group (whole group, or a NON-split branch) is a
    // group-manager thing. A UNIT-CONTEXT group (a single unit, or a per-unit branch) appears inside a unit's
    // "concernés", so it's managed by that specific unit's manager (CU/CG) — keyed on the réunion's own unit.
    public static bool CanManageGroupMeeting(ICurrentUserService u, string scopeType, bool perUnit, Guid unitId) =>
        MemberGroupModes.IsTopLevel(scopeType, perUnit) ? CanManageDynamic(u) : CanManageUnit(u, unitId);

    // The Groupe (MDG) unit — group réunions that aren't Unit-scoped anchor to it (roster is computed).
    public static async Task<Guid?> GroupeUnitIdAsync(IApplicationDbContext ctx, CancellationToken ct) =>
        await ctx.Units.Where(u => u.UnitType != null && u.UnitType.Code == "GRP")
            .Select(u => (Guid?)u.Id).FirstOrDefaultAsync(ct);
}

// ── DTOs ───────────────────────────────────────────────────────────────────────
public record MeetingDto(
    Guid Id, Guid UnitId, string UnitName, Guid? TeamId, string? TeamName,
    string Type, string? Title, DateOnly Date, DateOnly? EndDate, string Status,
    int RosterCount, int AbsentCount, bool CanManage,
    Guid? MemberGroupId = null, string? GroupName = null); // set for a member-group réunion

// The caller's manageable units + led teams (+ usable member groups) — drives the page.
public record AttendanceScopeDto(IReadOnlyList<ScopeUnit> Units, IReadOnlyList<ScopeTeam> Teams,
    IReadOnlyList<ScopeGroup> Groups, IReadOnlyList<ScopeUnitGroup> UnitGroups);
public record ScopeUnit(Guid UnitId, string UnitName);
public record ScopeTeam(Guid TeamId, string TeamName, Guid UnitId, string UnitName);
public record ScopeGroup(Guid Id, string Name); // a WHOLE-GROUP member group usable as a top-level réunion scope
public record ScopeUnitGroup(Guid UnitId, Guid GroupId, string GroupName); // a branch/unit group applicable IN a unit

public record AttendanceRosterRow(Guid MemberId, string Name, string? TeamName, bool Absent, string? Reason);
public record MeetingAttendanceDto(
    Guid Id, Guid UnitId, string UnitName, Guid? TeamId, string? TeamName,
    string Type, string? Title, DateOnly Date, DateOnly? EndDate, string Status, bool CanManage,
    IReadOnlyList<AttendanceRosterRow> Roster,
    Guid? MemberGroupId = null, string? GroupName = null);

public record MemberAbsenceCount(Guid MemberId, int Count);

// ── Queries ────────────────────────────────────────────────────────────────────

// The caller's attendance scope: units they manage (attendance.manage) + teams they lead (chef d'équipe).
public record GetAttendanceScopeQuery() : IRequest<Result<AttendanceScopeDto>>;

public class GetAttendanceScopeQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetAttendanceScopeQuery, Result<AttendanceScopeDto>>
{
    public async ValueTask<Result<AttendanceScopeDto>> Handle(GetAttendanceScopeQuery request, CancellationToken ct)
    {
        // Units the caller manages (with their branch, to match unit-type-scoped groups).
        var manageableUnitIds = currentUser.IsSuperAdmin
            ? await context.Units.Where(u => u.IsActive).Select(u => u.Id).ToListAsync(ct)
            : currentUser.Permissions.Contains(Permissions.AttendanceManage)
                ? currentUser.AuthorizedUnitIds.ToList()
                : [];
        var manageableUnits = await context.Units.Where(u => manageableUnitIds.Contains(u.Id))
            .OrderBy(u => u.Name).Select(u => new { u.Id, u.Name, u.UnitTypeId }).ToListAsync(ct);
        var units = manageableUnits.Select(u => new ScopeUnit(u.Id, u.Name)).ToList();

        // Teams the caller leads (chef d'équipe).
        var ledTeamIds = await AttendanceAccess.LeadTeamIdsAsync(context, currentUser.MemberId, ct);
        var teams = await context.Teams.Where(t => ledTeamIds.Contains(t.Id))
            .OrderBy(t => t.Unit.Name).ThenBy(t => t.Name)
            .Select(t => new ScopeTeam(t.Id, t.Name, t.UnitId, t.Unit.Name)).ToListAsync(ct);

        // Member groups. TOP-LEVEL groups (whole group, or a NON-split branch e.g. "join the 3 troupes") are
        // top-level scopes for a group manager — one combined réunion. UNIT-CONTEXT groups (a Unit scope, or a
        // per-unit branch e.g. "Haute Patrouille") appear inside the relevant unit's "concernés" (resolved to THAT
        // unit), returned per manageable unit. Hidden groups excluded.
        var visibleGroups = await context.MemberGroups.Where(g => g.IsVisible).OrderBy(g => g.Name)
            .Select(g => new { g.Id, g.Name, g.ScopeType, g.PerUnit, g.UnitTypeId, g.UnitId }).ToListAsync(ct);

        var isGroupMgr = AttendanceAccess.CanManageDynamic(currentUser);
        var groups = isGroupMgr
            ? visibleGroups.Where(g => MemberGroupModes.IsTopLevel(g.ScopeType, g.PerUnit)).Select(g => new ScopeGroup(g.Id, g.Name)).ToList()
            : [];

        // Per-unit applicable groups: a Unit-scoped group for that exact unit, or a PER-UNIT UnitType group for
        // that unit's branch. Available to whoever manages the unit (CU/CG). (A non-split branch group is top-level.)
        var unitGroups = (from u in manageableUnits
                          from g in visibleGroups
                          where MemberGroupModes.IsPerUnit(g.ScopeType, g.PerUnit)
                             && ((g.ScopeType == MemberGroupScopes.Unit && g.UnitId == u.Id)
                                 || (g.ScopeType == MemberGroupScopes.UnitType && g.UnitTypeId == u.UnitTypeId))
                          select new ScopeUnitGroup(u.Id, g.Id, g.Name)).ToList();

        return Result<AttendanceScopeDto>.Success(new AttendanceScopeDto(units, teams, groups, unitGroups));
    }
}

// Réunions for a unit the caller manages, OR (for a chef d'équipe) their team's réunions in that unit.
// ScoutYear (optional) filters to that year's Oct-1 window so two years can be viewed in parallel.
public record GetMeetingsQuery(Guid? UnitId, string? ScoutYear = null, Guid? MemberGroupId = null) : IRequest<Result<IReadOnlyList<MeetingDto>>>;

public class GetMeetingsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMeetingsQuery, Result<IReadOnlyList<MeetingDto>>>
{
    public async ValueTask<Result<IReadOnlyList<MeetingDto>>> Handle(GetMeetingsQuery request, CancellationToken ct)
    {
        // TOP-LEVEL group réunions (Grande Maîtrise, Chefs d'unité, or a combined branch) — group manager only;
        // one combined roster. Per-unit groups live inside a unit's list, not here.
        if (request.MemberGroupId is Guid groupId)
        {
            var group = await context.MemberGroups.Include(g => g.Rules).FirstOrDefaultAsync(g => g.Id == groupId, ct);
            if (group is null) return Result<IReadOnlyList<MeetingDto>>.Failure("Groupe introuvable.");
            // Per-unit groups aren't a top-level scope (they live inside a unit's list); reject here.
            if (!MemberGroupModes.IsTopLevel(group.ScopeType, group.PerUnit) || !AttendanceAccess.CanManageDynamic(currentUser))
                return Result<IReadOnlyList<MeetingDto>>.Failure("Accès non autorisé.");

            var dq = context.Meetings.Where(m => m.MemberGroupId == groupId);
            if (!string.IsNullOrWhiteSpace(request.ScoutYear))
            {
                var (s, e) = ScoutYearHelper.Window(request.ScoutYear);
                dq = dq.Where(m => m.Date >= s && m.Date < e);
            }
            var dmeetings = await dq.OrderByDescending(m => m.Date).ThenByDescending(m => m.CreatedAt)
                .Select(m => new { m.Id, m.UnitId, UnitName = m.Unit.Name, m.Type, m.Title, m.Date, m.EndDate, m.Status,
                    AbsentCount = m.Absences.Count(a => !a.IsDeleted) })
                .ToListAsync(ct);
            // The roster is the same for every meeting of a whole-group group → count distinct members once.
            var grpRosterCount = await MemberGroupResolver.RosterQuery(context, group)
                .Select(a => a.MemberId).Distinct().CountAsync(ct);
            var dres = dmeetings.Select(m => new MeetingDto(m.Id, m.UnitId, m.UnitName, null, group.Name,
                m.Type, m.Title, m.Date, m.EndDate, m.Status, grpRosterCount, m.AbsentCount, true, group.Id, group.Name)).ToList();
            return Result<IReadOnlyList<MeetingDto>>.Success(dres);
        }

        if (request.UnitId is not Guid unitId)
            return Result<IReadOnlyList<MeetingDto>>.Failure("Unité requise.");
        var canManage = AttendanceAccess.CanManageUnit(currentUser, unitId);
        var ledTeamIds = await AttendanceAccess.LeadTeamIdsAsync(context, currentUser.MemberId, ct);
        var ledInThisUnit = await context.Teams.Where(t => ledTeamIds.Contains(t.Id) && t.UnitId == unitId).Select(t => t.Id).ToListAsync(ct);
        if (!canManage && ledInThisUnit.Count == 0)
            return Result<IReadOnlyList<MeetingDto>>.Failure("Accès non autorisé à cette unité.");

        // A unit's list = its normal réunions + its UNIT-CONTEXT group réunions (a Unit-scoped group, or a
        // per-unit branch group). TOP-LEVEL group réunions (whole group, or a combined branch — anchored to the
        // Groupe unit) are excluded; they live under the top-level group scope.
        var q = context.Meetings.Where(m => m.UnitId == unitId
            && (m.MemberGroupId == null
                || m.MemberGroup!.ScopeType == MemberGroupScopes.Unit
                || (m.MemberGroup!.ScopeType == MemberGroupScopes.UnitType && m.MemberGroup!.PerUnit)));
        // A team leader only sees their own team's réunions (CU sees all, incl. group réunions).
        if (!canManage) q = q.Where(m => m.TeamId != null && ledInThisUnit.Contains(m.TeamId.Value));
        if (!string.IsNullOrWhiteSpace(request.ScoutYear))
        {
            var (start, end) = ScoutYearHelper.Window(request.ScoutYear);
            q = q.Where(m => m.Date >= start && m.Date < end);
        }

        var meetings = await q.OrderByDescending(m => m.Date).ThenByDescending(m => m.CreatedAt)
            .Select(m => new
            {
                m.Id, m.UnitId, UnitName = m.Unit.Name, m.TeamId, TeamName = m.Team != null ? m.Team.Name : null,
                m.Type, m.Title, m.Date, m.EndDate, m.Status, m.MemberGroupId,
                GroupName = m.MemberGroup != null ? m.MemberGroup.Name : null,
                AbsentCount = m.Absences.Count(a => !a.IsDeleted),
            }).ToListAsync(ct);

        // Roster size per meeting, BATCHED: one whole-unit active count + one grouped per-team active count.
        var unitRosterCount = await context.MemberAssignments
            .CountAsync(a => a.UnitId == unitId && a.EndDate == null, ct);
        var teamRosterCount = (await context.MemberAssignments
                .Where(a => a.UnitId == unitId && a.EndDate == null && a.TeamId != null)
                .GroupBy(a => a.TeamId!.Value)
                .Select(g => new { TeamId = g.Key, Count = g.Count() })
                .ToListAsync(ct))
            .ToDictionary(x => x.TeamId, x => x.Count);
        // Group réunions in this unit: roster = the group's rules ∩ this unit; count once per distinct group.
        var groupCounts = new Dictionary<Guid, int>();
        var gIds = meetings.Where(m => m.MemberGroupId != null).Select(m => m.MemberGroupId!.Value).Distinct().ToList();
        if (gIds.Count > 0)
            foreach (var g in await context.MemberGroups.Include(x => x.Rules).Where(x => gIds.Contains(x.Id)).ToListAsync(ct))
                groupCounts[g.Id] = await MemberGroupResolver.RosterQuery(context, g)
                    .Where(a => a.UnitId == unitId).Select(a => a.MemberId).Distinct().CountAsync(ct);

        var result = meetings.Select(m => new MeetingDto(m.Id, m.UnitId, m.UnitName, m.TeamId, m.TeamName, m.Type, m.Title,
            m.Date, m.EndDate, m.Status,
            m.MemberGroupId is Guid gid ? groupCounts.GetValueOrDefault(gid)
                : m.TeamId is null ? unitRosterCount : teamRosterCount.GetValueOrDefault(m.TeamId.Value),
            m.AbsentCount, canManage, m.MemberGroupId, m.GroupName)).ToList();
        return Result<IReadOnlyList<MeetingDto>>.Success(result);
    }

    // Active members in scope of a réunion: the whole unit (teamId null) or one team.
    internal static IQueryable<MemberAssignment> RosterQuery(IApplicationDbContext ctx, Guid unitId, Guid? teamId) =>
        teamId is null
            ? ctx.MemberAssignments.Where(a => a.UnitId == unitId && a.EndDate == null)
            : ctx.MemberAssignments.Where(a => a.UnitId == unitId && a.EndDate == null && a.TeamId == teamId);

    // Active-member roster for ANY réunion — a rule-based member group (computed) or a normal unit/team.
    // A UNIT-CONTEXT group réunion (Unit scope, or per-unit branch) is created FOR a specific unit, so its roster
    // = the group's rules ∩ that unit; a TOP-LEVEL group (whole group, or a combined branch) spans its whole
    // scope (no unit filter).
    internal static async Task<IQueryable<MemberAssignment>> RosterQueryForAsync(IApplicationDbContext ctx, Meeting m, CancellationToken ct)
    {
        if (m.MemberGroupId is Guid gid)
        {
            var group = await ctx.MemberGroups.Include(g => g.Rules).FirstOrDefaultAsync(g => g.Id == gid, ct);
            if (group is null) return ctx.MemberAssignments.Where(_ => false);
            var roster = MemberGroupResolver.RosterQuery(ctx, group);
            return MemberGroupModes.IsTopLevel(group.ScopeType, group.PerUnit) ? roster : roster.Where(a => a.UnitId == m.UnitId);
        }
        return RosterQuery(ctx, m.UnitId, m.TeamId);
    }
}

// The roster + current absentees for one réunion (to fill attendance).
public record GetMeetingAttendanceQuery(Guid Id) : IRequest<Result<MeetingAttendanceDto>>;

public class GetMeetingAttendanceQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMeetingAttendanceQuery, Result<MeetingAttendanceDto>>
{
    public async ValueTask<Result<MeetingAttendanceDto>> Handle(GetMeetingAttendanceQuery request, CancellationToken ct)
    {
        var m = await context.Meetings.Include(x => x.Unit).Include(x => x.Team).Include(x => x.MemberGroup)
            .FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<MeetingAttendanceDto>.Failure("Réunion introuvable.");

        var isGroup = m.MemberGroupId != null;
        var canManage = isGroup ? AttendanceAccess.CanManageGroupMeeting(currentUser, m.MemberGroup!.ScopeType, m.MemberGroup!.PerUnit, m.UnitId) : AttendanceAccess.CanManageUnit(currentUser, m.UnitId);
        var ledTeamIds = await AttendanceAccess.LeadTeamIdsAsync(context, currentUser.MemberId, ct);
        var canFill = canManage || (m.TeamId != null && ledTeamIds.Contains(m.TeamId.Value));
        if (!canFill) return Result<MeetingAttendanceDto>.Failure("Accès non autorisé à cette réunion.");

        // Column next to each name: a TOP-LEVEL group spans units → show the member's UNIT; a normal or a
        // unit-context group réunion is within one unit → show the member's TEAM.
        var showUnit = isGroup && MemberGroupModes.IsTopLevel(m.MemberGroup!.ScopeType, m.MemberGroup!.PerUnit);
        var rosterQuery = await GetMeetingsQueryHandler.RosterQueryForAsync(context, m, ct);
        var roster = await rosterQuery
            .Select(a => new { a.MemberId, a.Member.FirstName, a.Member.LastName,
                Label = showUnit ? a.Unit.Name : (a.Team != null ? a.Team.Name : null) })
            .ToListAsync(ct);
        var absences = await context.MeetingAbsences.Where(a => a.MeetingId == m.Id && !a.IsDeleted)
            .Select(a => new { a.MemberId, a.Reason }).ToListAsync(ct);
        var absentBy = absences.ToDictionary(a => a.MemberId, a => a.Reason);

        var rows = roster
            .GroupBy(r => r.MemberId).Select(g => g.First()) // a member could match twice on a unit-wide roster
            .OrderBy(r => r.LastName).ThenBy(r => r.FirstName)
            .Select(r => new AttendanceRosterRow(r.MemberId, $"{r.FirstName} {r.LastName}".Trim(), r.Label,
                absentBy.ContainsKey(r.MemberId), absentBy.GetValueOrDefault(r.MemberId)))
            .ToList();

        return Result<MeetingAttendanceDto>.Success(new MeetingAttendanceDto(
            m.Id, m.UnitId, m.Unit.Name, m.TeamId, m.Team?.Name, m.Type, m.Title, m.Date, m.EndDate, m.Status, canManage, rows,
            m.MemberGroupId, m.MemberGroup?.Name));
    }
}

// Per-member absence counts for a unit (drives the roster / CG list count), scoped to a scout year.
public record GetUnitAbsenceCountsQuery(Guid UnitId, string? ScoutYear) : IRequest<Result<IReadOnlyList<MemberAbsenceCount>>>;

public class GetUnitAbsenceCountsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetUnitAbsenceCountsQuery, Result<IReadOnlyList<MemberAbsenceCount>>>
{
    public async ValueTask<Result<IReadOnlyList<MemberAbsenceCount>>> Handle(GetUnitAbsenceCountsQuery request, CancellationToken ct)
    {
        // Any leader who can see THIS unit's members can see the absence counts. The members.edit branch MUST be
        // unit-scoped (super-admin / CG-all-units / a CU's own units) — otherwise any CU could read another unit's
        // per-member absence counts just by passing its id.
        var canView = AttendanceAccess.CanManageUnit(currentUser, request.UnitId)
            || currentUser.IsSuperAdmin
            || (currentUser.Permissions.Contains(Permissions.MembersEdit)
                && currentUser.AuthorizedUnitIds.Contains(request.UnitId));
        if (!canView) return Result<IReadOnlyList<MemberAbsenceCount>>.Success([]);

        var (start, end) = ScoutYearHelper.Window(request.ScoutYear);
        // Count absences on APPROVED réunions of this unit within the scout-year window.
        var rows = await context.MeetingAbsences
            .Where(a => !a.IsDeleted && a.Meeting.UnitId == request.UnitId && a.Meeting.Status == MeetingStatuses.Approved
                        && a.Meeting.Date >= start && a.Meeting.Date < end)
            .GroupBy(a => a.MemberId)
            .Select(g => new MemberAbsenceCount(g.Key, g.Count()))
            .ToListAsync(ct);
        return Result<IReadOnlyList<MemberAbsenceCount>>.Success(rows);
    }
}

// ── Commands ───────────────────────────────────────────────────────────────────

public record CreateMeetingCommand(Guid? UnitId, Guid? TeamId, string Type, string? Title, DateOnly Date, DateOnly? EndDate, string? Notes,
    Guid? MemberGroupId = null) : IRequest<Result<Guid>>;

public class CreateMeetingCommandValidator : AbstractValidator<CreateMeetingCommand>
{
    public CreateMeetingCommandValidator()
    {
        RuleFor(x => x.Type).Must(t => MeetingTypes.All.Contains(t)).WithMessage("Type de réunion invalide.");
        RuleFor(x => x.Title).MaximumLength(150);
        RuleFor(x => x.Notes).MaximumLength(1000);
        RuleFor(x => x.EndDate).GreaterThanOrEqualTo(x => x.Date).When(x => x.EndDate.HasValue)
            .WithMessage("La date de fin doit être après la date de début.");
    }
}

public class CreateMeetingCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<CreateMeetingCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateMeetingCommand request, CancellationToken ct)
    {
        Guid unitId;
        Guid? teamId;
        string status;

        if (request.MemberGroupId is Guid groupId)
        {
            // Member-group réunion (rule-based roster), approved immediately, no team. The ANCHOR unit depends on
            // the group's mode: a TOP-LEVEL group (whole group, or a combined branch) → the Groupe unit (one
            // combined réunion); a UNIT group → its own unit; a PER-UNIT branch → the specific unit the réunion is
            // created for (request.UnitId, a unit of that branch).
            var group = await context.MemberGroups.Include(g => g.Unit).FirstOrDefaultAsync(g => g.Id == groupId, ct);
            if (group is null) return Result<Guid>.Failure("Groupe introuvable.");
            Guid? anchor;
            if (MemberGroupModes.IsTopLevel(group.ScopeType, group.PerUnit))
                anchor = await AttendanceAccess.GroupeUnitIdAsync(context, ct);
            else if (group.ScopeType == MemberGroupScopes.Unit)
                anchor = group.UnitId;
            else // per-unit UnitType: the target unit must be given and belong to the group's branch
            {
                if (request.UnitId is not Guid target) return Result<Guid>.Failure("Unité requise pour ce groupe.");
                var okBranch = await context.Units.AnyAsync(x => x.Id == target && x.UnitTypeId == group.UnitTypeId, ct);
                if (!okBranch) return Result<Guid>.Failure("Cette unité n'appartient pas à la branche du groupe.");
                anchor = target;
            }
            if (anchor is null) return Result<Guid>.Failure("Aucune unité « Groupe » configurée.");
            if (!AttendanceAccess.CanManageGroupMeeting(currentUser, group.ScopeType, group.PerUnit, anchor.Value))
                return Result<Guid>.Failure("Accès non autorisé à ce groupe.");
            unitId = anchor.Value;
            teamId = null;
            status = MeetingStatuses.Approved;
        }
        else
        {
            if (request.UnitId is not Guid uid) return Result<Guid>.Failure("Unité requise.");
            unitId = uid;
            teamId = request.TeamId;
            // If a team is set, it must belong to the unit.
            if (teamId is Guid tid)
            {
                var okTeam = await context.Teams.AnyAsync(t => t.Id == tid && t.UnitId == unitId, ct);
                if (!okTeam) return Result<Guid>.Failure("Équipe invalide pour cette unité.");
            }

            if (AttendanceAccess.CanManageUnit(currentUser, unitId))
            {
                status = MeetingStatuses.Approved; // CU/CG réunions are approved immediately
            }
            else
            {
                // A chef d'équipe may create a réunion ONLY for a team they lead — pending CU approval.
                var ledTeamIds = await AttendanceAccess.LeadTeamIdsAsync(context, currentUser.MemberId, ct);
                if (teamId is null || !ledTeamIds.Contains(teamId.Value))
                    return Result<Guid>.Failure("Vous ne pouvez créer une réunion que pour votre équipe.");
                status = MeetingStatuses.Pending;
            }
        }

        var meeting = new Meeting
        {
            UnitId = unitId,
            TeamId = teamId,
            MemberGroupId = request.MemberGroupId,
            Type = request.Type,
            Title = string.IsNullOrWhiteSpace(request.Title) ? null : request.Title.Trim(),
            Date = request.Date,
            EndDate = request.Type == MeetingTypes.Camp ? request.EndDate : null, // only camps span dates
            Status = status,
            CreatedByMemberId = currentUser.MemberId ?? Guid.Empty,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
        };
        context.Meetings.Add(meeting);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(meeting.Id);
    }
}

// CU/CG edits a réunion's details (type/title/date/range/scope). Managers only (attendance.manage + unit).
public record UpdateMeetingCommand(Guid Id, Guid? TeamId, string Type, string? Title, DateOnly Date, DateOnly? EndDate, string? Notes)
    : IRequest<Result<bool>>;

public class UpdateMeetingCommandValidator : AbstractValidator<UpdateMeetingCommand>
{
    public UpdateMeetingCommandValidator()
    {
        RuleFor(x => x.Type).Must(t => MeetingTypes.All.Contains(t)).WithMessage("Type de réunion invalide.");
        RuleFor(x => x.Title).MaximumLength(150);
        RuleFor(x => x.Notes).MaximumLength(1000);
        RuleFor(x => x.EndDate).GreaterThanOrEqualTo(x => x.Date).When(x => x.EndDate.HasValue)
            .WithMessage("La date de fin doit être après la date de début.");
    }
}

public class UpdateMeetingCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<UpdateMeetingCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateMeetingCommand request, CancellationToken ct)
    {
        var m = await context.Meetings.Include(x => x.MemberGroup).FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<bool>.Failure("Réunion introuvable.");
        var isGroup = m.MemberGroupId != null;
        // Only a CU/CG (manager of the unit) — or the group's manager for a member-group réunion — may edit.
        if (!(isGroup ? AttendanceAccess.CanManageGroupMeeting(currentUser, m.MemberGroup!.ScopeType, m.MemberGroup!.PerUnit, m.UnitId) : AttendanceAccess.CanManageUnit(currentUser, m.UnitId)))
            return Result<bool>.Failure("Seul le chef d'unité peut modifier une réunion.");

        // A member-group réunion keeps its computed group (no team); a normal one may set a team of its unit.
        if (!isGroup)
        {
            if (request.TeamId is Guid tid)
            {
                var okTeam = await context.Teams.AnyAsync(t => t.Id == tid && t.UnitId == m.UnitId, ct);
                if (!okTeam) return Result<bool>.Failure("Équipe invalide pour cette unité.");
            }
            m.TeamId = request.TeamId;
        }
        m.Type = request.Type;
        m.Title = string.IsNullOrWhiteSpace(request.Title) ? null : request.Title.Trim();
        m.Date = request.Date;
        m.EndDate = request.Type == MeetingTypes.Camp ? request.EndDate : null; // only camps span dates
        m.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();

        // Changing the scope (team ↔ whole unit) changes the roster: drop any absence for a member no longer
        // in the new roster so the counts stay consistent.
        var rosterQ = await GetMeetingsQueryHandler.RosterQueryForAsync(context, m, ct);
        var rosterIds = (await rosterQ.Select(a => a.MemberId).Distinct().ToListAsync(ct)).ToHashSet();
        var stale = await context.MeetingAbsences.Where(a => a.MeetingId == m.Id && !rosterIds.Contains(a.MemberId)).ToListAsync(ct);
        if (stale.Count > 0) context.MeetingAbsences.RemoveRange(stale);

        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// CU approves (or the creator/CU deletes) a réunion.
public record ApproveMeetingCommand(Guid Id) : IRequest<Result<bool>>;

public class ApproveMeetingCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<ApproveMeetingCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ApproveMeetingCommand request, CancellationToken ct)
    {
        var m = await context.Meetings.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<bool>.Failure("Réunion introuvable.");
        if (!AttendanceAccess.CanManageUnit(currentUser, m.UnitId))
            return Result<bool>.Failure("Seul le chef d'unité peut approuver une réunion.");
        m.Status = MeetingStatuses.Approved;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record DeleteMeetingCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteMeetingCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<DeleteMeetingCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteMeetingCommand request, CancellationToken ct)
    {
        var m = await context.Meetings.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<bool>.Failure("Réunion introuvable.");
        var canManage = AttendanceAccess.CanManageUnit(currentUser, m.UnitId);
        // A team leader may delete their OWN still-pending réunion.
        var ownPending = m.Status == MeetingStatuses.Pending && m.CreatedByMemberId == currentUser.MemberId;
        if (!canManage && !ownPending) return Result<bool>.Failure("Accès non autorisé.");
        context.Meetings.Remove(m);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// Replace the absentee list for a réunion (present = not in the list).
public record AbsenceInput(Guid MemberId, string? Reason);
public record SaveMeetingAttendanceCommand(Guid MeetingId, List<AbsenceInput> Absences) : IRequest<Result<bool>>;

public class SaveMeetingAttendanceCommandValidator : AbstractValidator<SaveMeetingAttendanceCommand>
{
    public SaveMeetingAttendanceCommandValidator()
    {
        RuleFor(x => x.Absences).NotNull();
        RuleForEach(x => x.Absences).ChildRules(a => a.RuleFor(x => x.Reason).MaximumLength(300));
    }
}

public class SaveMeetingAttendanceCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<SaveMeetingAttendanceCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SaveMeetingAttendanceCommand request, CancellationToken ct)
    {
        var m = await context.Meetings.FirstOrDefaultAsync(x => x.Id == request.MeetingId, ct);
        if (m is null) return Result<bool>.Failure("Réunion introuvable.");

        var isGroup = m.MemberGroupId != null;
        if (isGroup) m.MemberGroup = await context.MemberGroups.FirstOrDefaultAsync(g => g.Id == m.MemberGroupId, ct);
        var canManage = isGroup ? AttendanceAccess.CanManageGroupMeeting(currentUser, m.MemberGroup!.ScopeType, m.MemberGroup!.PerUnit, m.UnitId) : AttendanceAccess.CanManageUnit(currentUser, m.UnitId);
        var ledTeamIds = await AttendanceAccess.LeadTeamIdsAsync(context, currentUser.MemberId, ct);
        var canFill = canManage || (m.TeamId != null && ledTeamIds.Contains(m.TeamId.Value));
        if (!canFill) return Result<bool>.Failure("Accès non autorisé à cette réunion.");

        // Only members actually in the réunion's roster may be marked absent (ignore anything else).
        var rosterQ = await GetMeetingsQueryHandler.RosterQueryForAsync(context, m, ct);
        var rosterIds = (await rosterQ.Select(a => a.MemberId).Distinct().ToListAsync(ct)).ToHashSet();

        var existing = await context.MeetingAbsences.Where(a => a.MeetingId == m.Id).ToListAsync(ct);
        context.MeetingAbsences.RemoveRange(existing);
        foreach (var a in request.Absences.Where(a => rosterIds.Contains(a.MemberId)).DistinctBy(a => a.MemberId))
            context.MeetingAbsences.Add(new MeetingAbsence
            {
                MeetingId = m.Id, MemberId = a.MemberId,
                Reason = string.IsNullOrWhiteSpace(a.Reason) ? null : a.Reason.Trim(),
            });

        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
