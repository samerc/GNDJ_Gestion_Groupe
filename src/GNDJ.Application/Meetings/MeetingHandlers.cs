using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Meetings;

// Séances / absences. A séance is a unit-wide OR team-scoped meeting/outing/camp; attendance is an absentee list
// (present by default). A CU (attendance.manage + unit) manages everything in their units; a chef d'équipe (a
// member holding an IsTeamLeader role on a team) can create a PENDING séance for their team and fill its
// attendance. Absence counts (per member) surface on the CU roster, CG list, and member fiche.

// ── Shared authorization helpers ───────────────────────────────────────────────
public static class AttendanceAccess
{
    // A CU/CG manages a unit's séances when they hold attendance.manage AND the unit is in scope (CG = all units).
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
}

// ── DTOs ───────────────────────────────────────────────────────────────────────
public record MeetingDto(
    Guid Id, Guid UnitId, string UnitName, Guid? TeamId, string? TeamName,
    string Type, string? Title, DateOnly Date, DateOnly? EndDate, string Status,
    int RosterCount, int AbsentCount, bool CanManage);

// The caller's manageable units + led teams — drives the page (which unit/team to create/fill séances for).
public record AttendanceScopeDto(IReadOnlyList<ScopeUnit> Units, IReadOnlyList<ScopeTeam> Teams);
public record ScopeUnit(Guid UnitId, string UnitName);
public record ScopeTeam(Guid TeamId, string TeamName, Guid UnitId, string UnitName);

public record AttendanceRosterRow(Guid MemberId, string Name, string? TeamName, bool Absent, string? Reason);
public record MeetingAttendanceDto(
    Guid Id, Guid UnitId, string UnitName, Guid? TeamId, string? TeamName,
    string Type, string? Title, DateOnly Date, DateOnly? EndDate, string Status, bool CanManage,
    IReadOnlyList<AttendanceRosterRow> Roster);

public record MemberAbsenceCount(Guid MemberId, int Count);

// ── Queries ────────────────────────────────────────────────────────────────────

// The caller's attendance scope: units they manage (attendance.manage) + teams they lead (chef d'équipe).
public record GetAttendanceScopeQuery() : IRequest<Result<AttendanceScopeDto>>;

public class GetAttendanceScopeQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetAttendanceScopeQuery, Result<AttendanceScopeDto>>
{
    public async ValueTask<Result<AttendanceScopeDto>> Handle(GetAttendanceScopeQuery request, CancellationToken ct)
    {
        // Units the caller manages.
        var manageableUnitIds = currentUser.IsSuperAdmin
            ? await context.Units.Where(u => u.IsActive).Select(u => u.Id).ToListAsync(ct)
            : currentUser.Permissions.Contains(Permissions.AttendanceManage)
                ? currentUser.AuthorizedUnitIds.ToList()
                : [];
        var units = await context.Units.Where(u => manageableUnitIds.Contains(u.Id))
            .OrderBy(u => u.Name).Select(u => new ScopeUnit(u.Id, u.Name)).ToListAsync(ct);

        // Teams the caller leads (chef d'équipe).
        var ledTeamIds = await AttendanceAccess.LeadTeamIdsAsync(context, currentUser.MemberId, ct);
        var teams = await context.Teams.Where(t => ledTeamIds.Contains(t.Id))
            .OrderBy(t => t.Unit.Name).ThenBy(t => t.Name)
            .Select(t => new ScopeTeam(t.Id, t.Name, t.UnitId, t.Unit.Name)).ToListAsync(ct);

        return Result<AttendanceScopeDto>.Success(new AttendanceScopeDto(units, teams));
    }
}

// Séances for a unit the caller manages, OR (for a chef d'équipe) their team's séances in that unit.
// ScoutYear (optional) filters to that year's Oct-1 window so two years can be viewed in parallel.
public record GetMeetingsQuery(Guid UnitId, string? ScoutYear = null) : IRequest<Result<IReadOnlyList<MeetingDto>>>;

public class GetMeetingsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMeetingsQuery, Result<IReadOnlyList<MeetingDto>>>
{
    public async ValueTask<Result<IReadOnlyList<MeetingDto>>> Handle(GetMeetingsQuery request, CancellationToken ct)
    {
        var canManage = AttendanceAccess.CanManageUnit(currentUser, request.UnitId);
        var ledTeamIds = await AttendanceAccess.LeadTeamIdsAsync(context, currentUser.MemberId, ct);
        var ledInThisUnit = await context.Teams.Where(t => ledTeamIds.Contains(t.Id) && t.UnitId == request.UnitId).Select(t => t.Id).ToListAsync(ct);
        if (!canManage && ledInThisUnit.Count == 0)
            return Result<IReadOnlyList<MeetingDto>>.Failure("Accès non autorisé à cette unité.");

        var q = context.Meetings.Where(m => m.UnitId == request.UnitId);
        // A team leader only sees their own team's séances (CU sees all).
        if (!canManage) q = q.Where(m => m.TeamId != null && ledInThisUnit.Contains(m.TeamId.Value));
        // Optional scout-year filter (Oct-1 window) so a leader can view/log either year during the transition.
        if (!string.IsNullOrWhiteSpace(request.ScoutYear))
        {
            var (start, end) = ScoutYearHelper.Window(request.ScoutYear);
            q = q.Where(m => m.Date >= start && m.Date < end);
        }

        var meetings = await q.OrderByDescending(m => m.Date).ThenByDescending(m => m.CreatedAt)
            .Select(m => new
            {
                m.Id, m.UnitId, UnitName = m.Unit.Name, m.TeamId, TeamName = m.Team != null ? m.Team.Name : null,
                m.Type, m.Title, m.Date, m.EndDate, m.Status,
                AbsentCount = m.Absences.Count(a => !a.IsDeleted),
            }).ToListAsync(ct);

        // Roster size per meeting (unit-wide = active unit members; team = active team members).
        var result = new List<MeetingDto>();
        foreach (var m in meetings)
        {
            var rosterCount = await RosterQuery(context, m.UnitId, m.TeamId).CountAsync(ct);
            result.Add(new MeetingDto(m.Id, m.UnitId, m.UnitName, m.TeamId, m.TeamName, m.Type, m.Title,
                m.Date, m.EndDate, m.Status, rosterCount, m.AbsentCount, canManage));
        }
        return Result<IReadOnlyList<MeetingDto>>.Success(result);
    }

    // Active members in scope of a séance: the whole unit (teamId null) or one team.
    internal static IQueryable<MemberAssignment> RosterQuery(IApplicationDbContext ctx, Guid unitId, Guid? teamId) =>
        teamId is null
            ? ctx.MemberAssignments.Where(a => a.UnitId == unitId && a.EndDate == null)
            : ctx.MemberAssignments.Where(a => a.UnitId == unitId && a.EndDate == null && a.TeamId == teamId);
}

// The roster + current absentees for one séance (to fill attendance).
public record GetMeetingAttendanceQuery(Guid Id) : IRequest<Result<MeetingAttendanceDto>>;

public class GetMeetingAttendanceQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMeetingAttendanceQuery, Result<MeetingAttendanceDto>>
{
    public async ValueTask<Result<MeetingAttendanceDto>> Handle(GetMeetingAttendanceQuery request, CancellationToken ct)
    {
        var m = await context.Meetings.Include(x => x.Unit).Include(x => x.Team)
            .FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<MeetingAttendanceDto>.Failure("Séance introuvable.");

        var canManage = AttendanceAccess.CanManageUnit(currentUser, m.UnitId);
        var ledTeamIds = await AttendanceAccess.LeadTeamIdsAsync(context, currentUser.MemberId, ct);
        var canFill = canManage || (m.TeamId != null && ledTeamIds.Contains(m.TeamId.Value));
        if (!canFill) return Result<MeetingAttendanceDto>.Failure("Accès non autorisé à cette séance.");

        var roster = await GetMeetingsQueryHandler.RosterQuery(context, m.UnitId, m.TeamId)
            .Select(a => new { a.MemberId, a.Member.FirstName, a.Member.LastName, TeamName = a.Team != null ? a.Team.Name : null })
            .ToListAsync(ct);
        var absences = await context.MeetingAbsences.Where(a => a.MeetingId == m.Id && !a.IsDeleted)
            .Select(a => new { a.MemberId, a.Reason }).ToListAsync(ct);
        var absentBy = absences.ToDictionary(a => a.MemberId, a => a.Reason);

        var rows = roster
            .GroupBy(r => r.MemberId).Select(g => g.First()) // a member could match twice on a unit-wide roster
            .OrderBy(r => r.LastName).ThenBy(r => r.FirstName)
            .Select(r => new AttendanceRosterRow(r.MemberId, $"{r.FirstName} {r.LastName}".Trim(), r.TeamName,
                absentBy.ContainsKey(r.MemberId), absentBy.GetValueOrDefault(r.MemberId)))
            .ToList();

        return Result<MeetingAttendanceDto>.Success(new MeetingAttendanceDto(
            m.Id, m.UnitId, m.Unit.Name, m.TeamId, m.Team?.Name, m.Type, m.Title, m.Date, m.EndDate, m.Status, canManage, rows));
    }
}

// Per-member absence counts for a unit (drives the roster / CG list count), scoped to a scout year.
public record GetUnitAbsenceCountsQuery(Guid UnitId, string? ScoutYear) : IRequest<Result<IReadOnlyList<MemberAbsenceCount>>>;

public class GetUnitAbsenceCountsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetUnitAbsenceCountsQuery, Result<IReadOnlyList<MemberAbsenceCount>>>
{
    public async ValueTask<Result<IReadOnlyList<MemberAbsenceCount>>> Handle(GetUnitAbsenceCountsQuery request, CancellationToken ct)
    {
        // Any leader who can see the unit's members can see the absence counts.
        if (!AttendanceAccess.CanManageUnit(currentUser, request.UnitId)
            && !currentUser.Permissions.Contains(Permissions.MembersEdit))
            return Result<IReadOnlyList<MemberAbsenceCount>>.Success([]);

        var (start, end) = ScoutYearHelper.Window(request.ScoutYear);
        // Count absences on APPROVED séances of this unit within the scout-year window.
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

public record CreateMeetingCommand(Guid UnitId, Guid? TeamId, string Type, string? Title, DateOnly Date, DateOnly? EndDate, string? Notes)
    : IRequest<Result<Guid>>;

public class CreateMeetingCommandValidator : AbstractValidator<CreateMeetingCommand>
{
    public CreateMeetingCommandValidator()
    {
        RuleFor(x => x.Type).Must(t => MeetingTypes.All.Contains(t)).WithMessage("Type de séance invalide.");
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
        // If a team is set, it must belong to the unit.
        if (request.TeamId is Guid tid)
        {
            var okTeam = await context.Teams.AnyAsync(t => t.Id == tid && t.UnitId == request.UnitId, ct);
            if (!okTeam) return Result<Guid>.Failure("Équipe invalide pour cette unité.");
        }

        var canManage = AttendanceAccess.CanManageUnit(currentUser, request.UnitId);
        string status;
        if (canManage)
        {
            status = MeetingStatuses.Approved; // CU/CG séances are approved immediately
        }
        else
        {
            // A chef d'équipe may create a séance ONLY for a team they lead — pending CU approval.
            var ledTeamIds = await AttendanceAccess.LeadTeamIdsAsync(context, currentUser.MemberId, ct);
            if (request.TeamId is null || !ledTeamIds.Contains(request.TeamId.Value))
                return Result<Guid>.Failure("Vous ne pouvez créer une séance que pour votre équipe.");
            status = MeetingStatuses.Pending;
        }

        var meeting = new Meeting
        {
            UnitId = request.UnitId,
            TeamId = request.TeamId,
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

// CU/CG edits a séance's details (type/title/date/range/scope). Managers only (attendance.manage + unit).
public record UpdateMeetingCommand(Guid Id, Guid? TeamId, string Type, string? Title, DateOnly Date, DateOnly? EndDate, string? Notes)
    : IRequest<Result<bool>>;

public class UpdateMeetingCommandValidator : AbstractValidator<UpdateMeetingCommand>
{
    public UpdateMeetingCommandValidator()
    {
        RuleFor(x => x.Type).Must(t => MeetingTypes.All.Contains(t)).WithMessage("Type de séance invalide.");
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
        var m = await context.Meetings.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<bool>.Failure("Séance introuvable.");
        // Only a CU/CG (manager of the unit) may edit a séance's details.
        if (!AttendanceAccess.CanManageUnit(currentUser, m.UnitId))
            return Result<bool>.Failure("Seul le chef d'unité peut modifier une séance.");

        // If a team is set, it must belong to the séance's unit.
        if (request.TeamId is Guid tid)
        {
            var okTeam = await context.Teams.AnyAsync(t => t.Id == tid && t.UnitId == m.UnitId, ct);
            if (!okTeam) return Result<bool>.Failure("Équipe invalide pour cette unité.");
        }

        m.TeamId = request.TeamId;
        m.Type = request.Type;
        m.Title = string.IsNullOrWhiteSpace(request.Title) ? null : request.Title.Trim();
        m.Date = request.Date;
        m.EndDate = request.Type == MeetingTypes.Camp ? request.EndDate : null; // only camps span dates
        m.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();

        // Changing the scope (team ↔ whole unit) changes the roster: drop any absence for a member no longer
        // in the new roster so the counts stay consistent.
        var rosterIds = (await GetMeetingsQueryHandler.RosterQuery(context, m.UnitId, m.TeamId)
            .Select(a => a.MemberId).Distinct().ToListAsync(ct)).ToHashSet();
        var stale = await context.MeetingAbsences.Where(a => a.MeetingId == m.Id && !rosterIds.Contains(a.MemberId)).ToListAsync(ct);
        if (stale.Count > 0) context.MeetingAbsences.RemoveRange(stale);

        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// CU approves (or the creator/CU deletes) a séance.
public record ApproveMeetingCommand(Guid Id) : IRequest<Result<bool>>;

public class ApproveMeetingCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<ApproveMeetingCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ApproveMeetingCommand request, CancellationToken ct)
    {
        var m = await context.Meetings.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<bool>.Failure("Séance introuvable.");
        if (!AttendanceAccess.CanManageUnit(currentUser, m.UnitId))
            return Result<bool>.Failure("Seul le chef d'unité peut approuver une séance.");
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
        if (m is null) return Result<bool>.Failure("Séance introuvable.");
        var canManage = AttendanceAccess.CanManageUnit(currentUser, m.UnitId);
        // A team leader may delete their OWN still-pending séance.
        var ownPending = m.Status == MeetingStatuses.Pending && m.CreatedByMemberId == currentUser.MemberId;
        if (!canManage && !ownPending) return Result<bool>.Failure("Accès non autorisé.");
        context.Meetings.Remove(m);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// Replace the absentee list for a séance (present = not in the list).
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
        if (m is null) return Result<bool>.Failure("Séance introuvable.");

        var canManage = AttendanceAccess.CanManageUnit(currentUser, m.UnitId);
        var ledTeamIds = await AttendanceAccess.LeadTeamIdsAsync(context, currentUser.MemberId, ct);
        var canFill = canManage || (m.TeamId != null && ledTeamIds.Contains(m.TeamId.Value));
        if (!canFill) return Result<bool>.Failure("Accès non autorisé à cette séance.");

        // Only members actually in the séance's roster may be marked absent (ignore anything else).
        var rosterIds = (await GetMeetingsQueryHandler.RosterQuery(context, m.UnitId, m.TeamId)
            .Select(a => a.MemberId).Distinct().ToListAsync(ct)).ToHashSet();

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
