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
// Available = a SAVED (archived) trombinoscope exists for that unit+year. We only serve the frozen file a
// leader has published (so photos stay as they were that year), so a year with no archive is shown but
// disabled ("pas encore disponible") rather than live-generated with today's photos.
public record MyTrombinoscoreYearDto(string ScoutYear, Guid UnitId, string UnitName, bool Available);
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

        var pairs = rows
            .Select(r => new { ScoutYear = ScoutYearHelper.Of(r.StartDate), r.UnitId, r.UnitName })
            .DistinctBy(r => new { r.ScoutYear, r.UnitId })
            .ToList();

        // Which of the member's (unit, year) pairs have a saved trombinoscope.
        var unitIds = pairs.Select(p => p.UnitId).Distinct().ToList();
        var archived = await context.TrombinoscopeArchives
            .Where(t => unitIds.Contains(t.UnitId))
            .Select(t => new { t.UnitId, t.ScoutYear })
            .ToListAsync(ct);
        var archivedSet = archived.Select(a => $"{a.UnitId}|{a.ScoutYear}").ToHashSet();

        return pairs
            .Select(p => new MyTrombinoscoreYearDto(p.ScoutYear, p.UnitId, p.UnitName, archivedSet.Contains($"{p.UnitId}|{p.ScoutYear}")))
            .OrderByDescending(r => r.ScoutYear).ThenBy(r => r.UnitName)
            .ToList();
    }
}

// ── The trombinoscope PDF for one (unit, year) the caller was in ─────────────
// Serves the SAVED (frozen) trombinoscope, not a live regeneration — so the member sees the photos as they
// were that year. Access: the caller must have been active in that unit during that scout year.
public record GenerateMyTrombinoscoreQuery(Guid UnitId, string ScoutYear) : IRequest<Result<TrombinoscorePdf>>;

public class GenerateMyTrombinoscoreHandler(IApplicationDbContext context, ICurrentUserService currentUser)
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

        // Serve the frozen file the leader published for that year (photos as they were).
        var archive = await context.TrombinoscopeArchives
            .Where(t => t.UnitId == request.UnitId && t.ScoutYear == request.ScoutYear)
            .Select(t => new { t.PdfData, t.FileName })
            .FirstOrDefaultAsync(ct);
        if (archive is null)
            return Result<TrombinoscorePdf>.Failure("Le trombinoscope de cette année n'est pas encore disponible.");

        return Result<TrombinoscorePdf>.Success(new TrombinoscorePdf(archive.PdfData, archive.FileName));
    }
}
