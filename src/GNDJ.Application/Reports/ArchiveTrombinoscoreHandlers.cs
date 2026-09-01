using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Reports;

// ── Saving / serving the FROZEN trombinoscope ────────────────────────────────────────────────────────
// The CU generates the trombinoscope once (after the photo session) and SAVES it for (unit, scout year).
// The saved PDF becomes the single source of truth: the CU re-download and every member's view serve THIS
// file, so photos are frozen and it isn't regenerated on each view. Re-saving overwrites the stored bytes.

// Small status/metadata about a saved trombinoscope (drives the CU dialog's "already saved" hint).
// Published = whether members can see it on their Trombinoscope page.
public record TrombinoscoreArchiveInfo(bool Exists, string? FileName, DateTime? SavedAt, int MemberCount, bool Published = false);

// Shared roster builder for the CURRENT-roster trombinoscope (used by both the live CU report and the
// archive save). Groups a unit's active assignments by team (Maîtrise first). UnitName is null if the unit
// doesn't exist. Kept here so the live query and the archive command produce an identical PDF.
public static class TrombinoscoreRoster
{
    public static async Task<(string? UnitName, List<TrombinoscoreTeam> Teams)> BuildAsync(
        IApplicationDbContext context, Guid unitId, List<Guid>? teamIds, CancellationToken ct)
    {
        var unit = await context.Units.Where(u => u.Id == unitId).Select(u => new { u.Name }).FirstOrDefaultAsync(ct);
        if (unit is null) return (null, new List<TrombinoscoreTeam>());

        var assignments = await context.MemberAssignments
            .Where(a => a.UnitId == unitId && a.EndDate == null)
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

        if (teamIds is { Count: > 0 })
            assignments = assignments.Where(a => a.TeamId.HasValue && teamIds.Contains(a.TeamId.Value)).ToList();

        var teams = assignments
            .GroupBy(a => new { a.TeamId, a.TeamName, a.TeamOrder, a.IsMaitrise })
            .OrderByDescending(g => g.Key.IsMaitrise).ThenBy(g => g.Key.TeamOrder)
            .Select(g => new TrombinoscoreTeam(
                g.Key.TeamName ?? "Sans équipe",
                g.Select(a => new TrombinoscoreMember($"{a.FirstName} {a.LastName}", a.CardNumber, a.PhotoPath)).ToList()))
            .ToList();

        return (unit.Name, teams);
    }

    // Leader-only report (multi-member PII): members.edit + unit scope. Delegates to the shared policy.
    public static bool CanManageUnit(ICurrentUserService currentUser, Guid unitId) =>
        MemberAccess.CanLeadUnit(currentUser, unitId);
}

// Save (or overwrite) the trombinoscope for (unit, scout year) with the current roster + photos.
// Publish = make it visible to members (else it's an internal CU-only overview).
public record ArchiveTrombinoscoreCommand(Guid UnitId, string ScoutYear, bool IncludePhotos, List<Guid>? TeamIds, bool Publish = false)
    : IRequest<Result<TrombinoscoreArchiveInfo>>;

public class ArchiveTrombinoscoreCommandHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    ITrombinoscoreService trombinoscoreService
) : IRequestHandler<ArchiveTrombinoscoreCommand, Result<TrombinoscoreArchiveInfo>>
{
    public async ValueTask<Result<TrombinoscoreArchiveInfo>> Handle(ArchiveTrombinoscoreCommand request, CancellationToken ct)
    {
        if (!TrombinoscoreRoster.CanManageUnit(currentUser, request.UnitId))
            return Result<TrombinoscoreArchiveInfo>.Failure("Accès non autorisé à cette unité.");

        var (unitName, teams) = await TrombinoscoreRoster.BuildAsync(context, request.UnitId, request.TeamIds, ct);
        if (unitName is null)
            return Result<TrombinoscoreArchiveInfo>.Failure("Unité introuvable.");

        var memberCount = teams.Sum(t => t.Members.Count);
        if (memberCount == 0)
            return Result<TrombinoscoreArchiveInfo>.Failure("Aucun membre à inclure dans le trombinoscope.");

        var pdf = trombinoscoreService.Generate(new TrombinoscoreData(unitName, request.ScoutYear, request.IncludePhotos, teams));
        var fileName = TrombinoscoreFile.Name(unitName, request.ScoutYear);

        // Upsert: one saved file per (unit, year) — re-saving replaces the frozen bytes.
        var existing = await context.TrombinoscopeArchives
            .FirstOrDefaultAsync(t => t.UnitId == request.UnitId && t.ScoutYear == request.ScoutYear, ct);
        if (existing is null)
        {
            existing = new TrombinoscopeArchive { UnitId = request.UnitId, ScoutYear = request.ScoutYear };
            context.TrombinoscopeArchives.Add(existing);
        }
        existing.FileName = fileName;
        existing.PdfData = pdf;
        existing.MemberCount = memberCount;
        existing.IsPublished = request.Publish;
        await context.SaveChangesAsync(ct);

        return Result<TrombinoscoreArchiveInfo>.Success(new TrombinoscoreArchiveInfo(true, fileName, existing.UpdatedAt, memberCount, request.Publish));
    }
}

// Does a saved trombinoscope exist for (unit, year)? Drives the CU dialog status line.
public record GetTrombinoscoreArchiveInfoQuery(Guid UnitId, string ScoutYear) : IRequest<Result<TrombinoscoreArchiveInfo>>;

public class GetTrombinoscoreArchiveInfoQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetTrombinoscoreArchiveInfoQuery, Result<TrombinoscoreArchiveInfo>>
{
    public async ValueTask<Result<TrombinoscoreArchiveInfo>> Handle(GetTrombinoscoreArchiveInfoQuery request, CancellationToken ct)
    {
        if (!TrombinoscoreRoster.CanManageUnit(currentUser, request.UnitId))
            return Result<TrombinoscoreArchiveInfo>.Failure("Accès non autorisé à cette unité.");

        var a = await context.TrombinoscopeArchives
            .Where(t => t.UnitId == request.UnitId && t.ScoutYear == request.ScoutYear)
            .Select(t => new { t.FileName, t.UpdatedAt, t.MemberCount, t.IsPublished })
            .FirstOrDefaultAsync(ct);

        return Result<TrombinoscoreArchiveInfo>.Success(
            a is null
                ? new TrombinoscoreArchiveInfo(false, null, null, 0)
                : new TrombinoscoreArchiveInfo(true, a.FileName, a.UpdatedAt, a.MemberCount, a.IsPublished));
    }
}

// Publish / unpublish a saved trombinoscope WITHOUT regenerating it (just flips member visibility).
public record SetTrombinoscorePublishedCommand(Guid UnitId, string ScoutYear, bool Published) : IRequest<Result<TrombinoscoreArchiveInfo>>;

public class SetTrombinoscorePublishedCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<SetTrombinoscorePublishedCommand, Result<TrombinoscoreArchiveInfo>>
{
    public async ValueTask<Result<TrombinoscoreArchiveInfo>> Handle(SetTrombinoscorePublishedCommand request, CancellationToken ct)
    {
        if (!TrombinoscoreRoster.CanManageUnit(currentUser, request.UnitId))
            return Result<TrombinoscoreArchiveInfo>.Failure("Accès non autorisé à cette unité.");

        var a = await context.TrombinoscopeArchives
            .FirstOrDefaultAsync(t => t.UnitId == request.UnitId && t.ScoutYear == request.ScoutYear, ct);
        if (a is null)
            return Result<TrombinoscoreArchiveInfo>.Failure("Aucun trombinoscope enregistré pour cette année.");

        a.IsPublished = request.Published;
        await context.SaveChangesAsync(ct);
        return Result<TrombinoscoreArchiveInfo>.Success(new TrombinoscoreArchiveInfo(true, a.FileName, a.UpdatedAt, a.MemberCount, a.IsPublished));
    }
}

// Re-download the saved trombinoscope (CU).
public record DownloadTrombinoscoreArchiveQuery(Guid UnitId, string ScoutYear) : IRequest<Result<TrombinoscorePdf>>;

public class DownloadTrombinoscoreArchiveQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<DownloadTrombinoscoreArchiveQuery, Result<TrombinoscorePdf>>
{
    public async ValueTask<Result<TrombinoscorePdf>> Handle(DownloadTrombinoscoreArchiveQuery request, CancellationToken ct)
    {
        if (!TrombinoscoreRoster.CanManageUnit(currentUser, request.UnitId))
            return Result<TrombinoscorePdf>.Failure("Accès non autorisé à cette unité.");

        var a = await context.TrombinoscopeArchives
            .Where(t => t.UnitId == request.UnitId && t.ScoutYear == request.ScoutYear)
            .Select(t => new { t.PdfData, t.FileName })
            .FirstOrDefaultAsync(ct);
        if (a is null)
            return Result<TrombinoscorePdf>.Failure("Aucun trombinoscope enregistré pour cette année.");

        return Result<TrombinoscorePdf>.Success(new TrombinoscorePdf(a.PdfData, a.FileName));
    }
}
