using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Reports;

// Member-facing trombinoscope: a member views the photo grid of the unit(s) they belong(ed) to, per scout
// year. This is a DELIBERATE exception to the member-data IDOR lock — a member may see their co-members'
// photos/names for a unit they were part of. The PDF is generated server-side (photos embedded), so no
// per-photo endpoint is opened up. Access is limited to units the caller was actually active in that year.

// ── The (year, unit) pairs the caller can view ───────────────────────────────
public record MyTrombinoscoreYearDto(string ScoutYear, Guid UnitId, string UnitName);
public record GetMyTrombinoscoreYearsQuery : IRequest<IReadOnlyList<MyTrombinoscoreYearDto>>;

public class GetMyTrombinoscoreYearsHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMyTrombinoscoreYearsQuery, IReadOnlyList<MyTrombinoscoreYearDto>>
{
    public async ValueTask<IReadOnlyList<MyTrombinoscoreYearDto>> Handle(GetMyTrombinoscoreYearsQuery request, CancellationToken ct)
    {
        var memberId = currentUser.MemberId;
        if (memberId is null) return [];

        // Every assignment the member has held (current + past). Assignments are split per scout year, so
        // each maps to one scout year (derived from its start date). Distinct (scout year, unit).
        var rows = await context.MemberAssignments
            .Where(a => a.MemberId == memberId && !a.IsDeleted)
            .Select(a => new { a.UnitId, UnitName = a.Unit.Name, a.StartDate })
            .ToListAsync(ct);

        return rows
            .Select(r => new MyTrombinoscoreYearDto(ScoutYearHelper.Of(r.StartDate), r.UnitId, r.UnitName))
            .DistinctBy(r => new { r.ScoutYear, r.UnitId })
            .OrderByDescending(r => r.ScoutYear).ThenBy(r => r.UnitName)
            .ToList();
    }
}

// ── The trombinoscope PDF for one (unit, year) the caller was in ─────────────
public record GenerateMyTrombinoscoreQuery(Guid UnitId, string ScoutYear) : IRequest<Result<TrombinoscorePdf>>;

public class GenerateMyTrombinoscoreHandler(IApplicationDbContext context, ICurrentUserService currentUser, ITrombinoscoreService trombinoscoreService)
    : IRequestHandler<GenerateMyTrombinoscoreQuery, Result<TrombinoscorePdf>>
{
    public async ValueTask<Result<TrombinoscorePdf>> Handle(GenerateMyTrombinoscoreQuery request, CancellationToken ct)
    {
        var memberId = currentUser.MemberId;
        if (memberId is null) return Result<TrombinoscorePdf>.Failure("Aucun membre associé à ce compte.");

        var (windowStart, windowEnd) = ScoutYearHelper.Window(request.ScoutYear);

        // Access: the caller must have been ACTIVE in this unit during this scout year (date-range overlap).
        var wasInUnit = await context.MemberAssignments.AnyAsync(a =>
            a.MemberId == memberId && a.UnitId == request.UnitId && !a.IsDeleted
            && a.StartDate < windowEnd && (a.EndDate == null || a.EndDate > windowStart), ct);
        if (!wasInUnit)
            return Result<TrombinoscorePdf>.Failure("Vous n'avez pas fait partie de cette unité cette année-là.");

        var unit = await context.Units.Where(u => u.Id == request.UnitId).Select(u => new { u.Name }).FirstOrDefaultAsync(ct);
        if (unit is null) return Result<TrombinoscorePdf>.Failure("Unité introuvable.");

        // Roster = everyone active in the unit DURING that scout year (overlap), grouped by team, Maîtrise first.
        var assignments = await context.MemberAssignments
            .Where(a => a.UnitId == request.UnitId && !a.IsDeleted
                && a.StartDate < windowEnd && (a.EndDate == null || a.EndDate > windowStart))
            .OrderBy(a => a.Team != null ? a.Team.DisplayOrder : 999)
            .ThenByDescending(a => a.FunctionalRole.Rank)
            .ThenBy(a => a.Member.LastName).ThenBy(a => a.Member.FirstName)
            .Select(a => new
            {
                a.Member.FirstName, a.Member.LastName, a.Member.CardNumber, a.Member.PhotoPath,
                a.TeamId,
                TeamName = a.Team != null ? a.Team.Name : null,
                TeamOrder = a.Team != null ? a.Team.DisplayOrder : 999,
                IsMaitrise = a.Team != null && a.Team.IsMaitrise,
            })
            .ToListAsync(ct);

        // A member can appear once per unit even across split assignments — dedupe by name+card.
        var teams = assignments
            .DistinctBy(a => new { a.FirstName, a.LastName, a.CardNumber })
            .GroupBy(a => new { a.TeamId, a.TeamName, a.TeamOrder, a.IsMaitrise })
            .OrderByDescending(g => g.Key.IsMaitrise).ThenBy(g => g.Key.TeamOrder)
            .Select(g => new TrombinoscoreTeam(
                g.Key.TeamName ?? "Sans équipe",
                g.Select(a => new TrombinoscoreMember($"{a.FirstName} {a.LastName}", a.CardNumber, a.PhotoPath)).ToList()))
            .ToList();

        var pdf = trombinoscoreService.Generate(new TrombinoscoreData(unit.Name, request.ScoutYear, true, teams));
        return Result<TrombinoscorePdf>.Success(new TrombinoscorePdf(pdf, TrombinoscoreFile.Name(unit.Name, request.ScoutYear)));
    }
}
