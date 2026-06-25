using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

static class CampScope
{
    // CG (camp.manage / super-admin) sees the whole group; a CU sees only their authorized units.
    public static bool SeesAll(ICurrentUserService u) => u.IsSuperAdmin || u.Permissions.Contains(Permissions.CampManage);
}

// ─── Attendance ──────────────────────────────────────────────────────────────
public record GetCampAttendanceQuery(Guid CampId, Guid? UnitId) : IRequest<Result<IReadOnlyList<CampAttendeeDto>>>;

public class GetCampAttendanceQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetCampAttendanceQuery, Result<IReadOnlyList<CampAttendeeDto>>>
{
    public async ValueTask<Result<IReadOnlyList<CampAttendeeDto>>> Handle(GetCampAttendanceQuery request, CancellationToken ct)
    {
        var seesAll = CampScope.SeesAll(currentUser);
        var authorized = currentUser.AuthorizedUnitIds;

        // Active YOUTH via their current assignment (chefs/maîtrise are not campers — excluded).
        var q = context.MemberAssignments.Where(a => !a.IsDeleted && a.EndDate == null && !a.FunctionalRole.IsMaitrise);
        if (!seesAll) q = q.Where(a => authorized.Contains(a.UnitId));
        if (request.UnitId is not null) q = q.Where(a => a.UnitId == request.UnitId);

        var rows = await q.Select(a => new
        {
            a.MemberId, a.Member.FirstName, a.Member.LastName, a.Member.Gender,
            UnitName = a.Unit.Name, Branche = a.Unit.UnitType.Name
        }).ToListAsync(ct);

        var parts = await context.CampParticipants.Where(p => p.CampId == request.CampId && !p.IsDeleted)
            .Select(p => new { p.Id, p.MemberId, p.IsAttending, p.Role }).ToListAsync(ct);
        var byMember = parts.GroupBy(p => p.MemberId).ToDictionary(g => g.Key, g => g.First());

        var result = rows
            .GroupBy(r => r.MemberId).Select(g => g.First())
            .Select(r =>
            {
                byMember.TryGetValue(r.MemberId, out var p);
                return new CampAttendeeDto(r.MemberId, r.FirstName, r.LastName, r.Gender, r.UnitName, r.Branche,
                    p?.IsAttending ?? false, p?.Id, p?.Role ?? CampRole.Membre);
            })
            .OrderBy(r => r.Branche).ThenBy(r => r.LastName).ThenBy(r => r.FirstName)
            .ToList();
        return Result<IReadOnlyList<CampAttendeeDto>>.Success(result);
    }
}

public record SetCampAttendanceCommand(Guid CampId, IReadOnlyList<AttendanceItem> Items) : IRequest<Result<bool>>;
public record AttendanceItem(Guid MemberId, bool Attending);

public class SetCampAttendanceCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<SetCampAttendanceCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetCampAttendanceCommand request, CancellationToken ct)
    {
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.CampId, ct);
        if (camp is null) return Result<bool>.Failure("Camp introuvable.");

        var seesAll = CampScope.SeesAll(currentUser);
        var authorized = currentUser.AuthorizedUnitIds;
        var memberIds = request.Items.Select(i => i.MemberId).ToList();

        // Current (active) assignment per member — snapshot + access check.
        var active = await context.MemberAssignments
            .Where(a => !a.IsDeleted && a.EndDate == null && memberIds.Contains(a.MemberId))
            .Select(a => new { a.MemberId, a.UnitId, a.Unit.UnitTypeId, Branche = a.Unit.UnitType.Name,
                Years = a.Unit.UnitType.NumberOfYears, a.Member.Gender, a.StartDate })
            .ToListAsync(ct);
        var currentByMember = active.GroupBy(a => a.MemberId).ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.StartDate).First());

        // ALL assignments (incl. ended) for année: count distinct scout-years spent in the *current unit*.
        var allAssigns = await context.MemberAssignments
            .Where(a => !a.IsDeleted && memberIds.Contains(a.MemberId))
            .Select(a => new { a.MemberId, a.UnitId, a.StartDate, a.EndDate })
            .ToListAsync(ct);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        static int Sy(DateOnly d) => d.Month >= 9 ? d.Year : d.Year - 1; // scout year starts ~Oct (Sept = new year)
        int AnneeInUnit(Guid memberId, Guid unitId, int maxYears)
        {
            var years = new HashSet<int>();
            foreach (var a in allAssigns.Where(x => x.MemberId == memberId && x.UnitId == unitId))
                for (int y = Sy(a.StartDate); y <= Sy(a.EndDate ?? today); y++) years.Add(y);
            var n = Math.Max(1, years.Count);
            return maxYears > 0 ? Math.Min(n, maxYears) : n;
        }

        var existing = await context.CampParticipants.Where(p => p.CampId == request.CampId && !p.IsDeleted && memberIds.Contains(p.MemberId)).ToListAsync(ct);
        var existingByMember = existing.ToDictionary(p => p.MemberId);

        foreach (var item in request.Items)
        {
            if (!currentByMember.TryGetValue(item.MemberId, out var a)) continue;       // not an active member
            if (!seesAll && !authorized.Contains(a.UnitId)) continue;                   // out of scope

            if (existingByMember.TryGetValue(item.MemberId, out var p))
            {
                p.IsAttending = item.Attending;
                p.UnitId = a.UnitId; p.UnitTypeId = a.UnitTypeId; p.Branche = a.Branche; p.Gender = a.Gender;
            }
            else if (item.Attending)
            {
                context.CampParticipants.Add(new CampParticipant
                {
                    CampId = request.CampId, MemberId = item.MemberId, IsAttending = true,
                    UnitId = a.UnitId, UnitTypeId = a.UnitTypeId, Branche = a.Branche, Gender = a.Gender,
                    Annee = AnneeInUnit(item.MemberId, a.UnitId, a.Years ?? 0),
                });
            }
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ─── Grading ─────────────────────────────────────────────────────────────────
public record GetCampGradingQuery(Guid CampId, Guid? UnitId) : IRequest<Result<IReadOnlyList<CampGradeRowDto>>>;

public class GetCampGradingQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetCampGradingQuery, Result<IReadOnlyList<CampGradeRowDto>>>
{
    public async ValueTask<Result<IReadOnlyList<CampGradeRowDto>>> Handle(GetCampGradingQuery request, CancellationToken ct)
    {
        var seesAll = CampScope.SeesAll(currentUser);
        var authorized = currentUser.AuthorizedUnitIds;

        var q = context.CampParticipants.Where(p => p.CampId == request.CampId && !p.IsDeleted && p.IsAttending);
        if (!seesAll) q = q.Where(p => p.UnitId != null && authorized.Contains(p.UnitId.Value));
        if (request.UnitId is not null) q = q.Where(p => p.UnitId == request.UnitId);

        var rows = await q.Select(p => new CampGradeRowDto(p.Id, p.MemberId, p.Member.FirstName, p.Member.LastName,
                p.Gender, p.Branche, p.Member.Assignments.Where(a => !a.IsDeleted && a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(),
                p.Force, p.Annee, p.Note, p.IsLeaderCandidate, p.Role, p.Notes))
            .ToListAsync(ct);
        var ordered = rows.OrderBy(p => p.Branche).ThenBy(p => p.LastName).ThenBy(p => p.FirstName).ToList();
        return Result<IReadOnlyList<CampGradeRowDto>>.Success(ordered);
    }
}

public record SaveCampGradesCommand(Guid CampId, IReadOnlyList<GradeItem> Grades) : IRequest<Result<bool>>;
public record GradeItem(Guid ParticipantId, int? Force, int? Annee, bool IsLeaderCandidate, string? Notes);

public class SaveCampGradesCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<SaveCampGradesCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SaveCampGradesCommand request, CancellationToken ct)
    {
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.CampId, ct);
        if (camp is null) return Result<bool>.Failure("Camp introuvable.");

        var seesAll = CampScope.SeesAll(currentUser);
        var authorized = currentUser.AuthorizedUnitIds;
        var ids = request.Grades.Select(g => g.ParticipantId).ToList();
        var parts = await context.CampParticipants.Where(p => p.CampId == request.CampId && !p.IsDeleted && ids.Contains(p.Id)).ToListAsync(ct);
        var byId = parts.ToDictionary(p => p.Id);
        var branchYears = await context.UnitTypes.ToDictionaryAsync(t => t.Id, t => t.NumberOfYears ?? 5, ct);

        foreach (var g in request.Grades)
        {
            if (!byId.TryGetValue(g.ParticipantId, out var p)) continue;
            if (!seesAll && (p.UnitId is null || !authorized.Contains(p.UnitId.Value))) continue;
            if (g.Force is < 1 or > 5) return Result<bool>.Failure("La force doit être entre 1 et 5.");
            if (g.Annee is < 1 or > 10) return Result<bool>.Failure("L'année est invalide.");
            p.Force = g.Force;
            p.Annee = g.Annee;
            p.IsLeaderCandidate = g.IsLeaderCandidate;
            p.Notes = string.IsNullOrWhiteSpace(g.Notes) ? null : g.Notes.Trim();
            p.Note = CampNote.Compute(camp, p, branchYears);
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
