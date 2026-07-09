using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Reports;

// Trombinoscope PDF (photo grid of a unit, grouped by team, Maîtrise team first). Unit-scoped.
// Gathers the roster then delegates layout to ITrombinoscoreService.
public record GenerateTrombinoscoreQuery(
    Guid UnitId,
    string ScoutYear,
    bool IncludePhotos,
    List<Guid>? TeamIds // null = all teams
) : IRequest<Result<TrombinoscorePdf>>;

// PDF bytes + a human-friendly download filename ("Trombinoscope <unité> <année>.pdf") so the browser
// saves something meaningful even when the file is opened in a new tab (member page) rather than
// downloaded via a JS-set name (CU dialog).
public record TrombinoscorePdf(byte[] Data, string FileName);

public static class TrombinoscoreFile
{
    // Builds a safe, friendly filename from the unit name + scout year (strips characters invalid in filenames).
    public static string Name(string unitName, string scoutYear)
    {
        var invalid = System.IO.Path.GetInvalidFileNameChars();
        var cleanUnit = new string((unitName ?? "").Select(c => invalid.Contains(c) ? ' ' : c).ToArray()).Trim();
        if (string.IsNullOrWhiteSpace(cleanUnit)) cleanUnit = "unité";
        return $"Trombinoscope {cleanUnit} {scoutYear}.pdf";
    }
}

public class GenerateTrombinoscoreQueryHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    ITrombinoscoreService trombinoscoreService
) : IRequestHandler<GenerateTrombinoscoreQuery, Result<TrombinoscorePdf>>
{
    public async ValueTask<Result<TrombinoscorePdf>> Handle(GenerateTrombinoscoreQuery request, CancellationToken ct)
    {
        // Leader-only report (multi-member PII): members.edit + unit scope, not bare co-unit membership
        // (a read-only youth carries their own unit in AuthorizedUnitIds).
        if (!currentUser.IsSuperAdmin && !(currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MembersEdit) && currentUser.AuthorizedUnitIds.Contains(request.UnitId)))
            return Result<TrombinoscorePdf>.Failure("Accès non autorisé à cette unité.");

        var unit = await context.Units
            .Where(u => u.Id == request.UnitId)
            .Select(u => new { u.Name })
            .FirstOrDefaultAsync(ct);

        if (unit is null)
            return Result<TrombinoscorePdf>.Failure("Unité introuvable.");

        // Get active assignments grouped by team
        var query = context.MemberAssignments
            .Where(a => a.UnitId == request.UnitId && a.EndDate == null);

        var assignments = await query
            .OrderBy(a => a.Team != null ? a.Team.DisplayOrder : 999)
            .ThenByDescending(a => a.FunctionalRole.Rank)
            .ThenBy(a => a.Member.LastName)
            .ThenBy(a => a.Member.FirstName)
            .Select(a => new
            {
                a.Member.FirstName,
                a.Member.LastName,
                a.Member.CardNumber,
                a.Member.PhotoPath,
                TeamId = a.TeamId,
                TeamName = a.Team != null ? a.Team.Name : null,
                TeamOrder = a.Team != null ? a.Team.DisplayOrder : 999,
                IsMaitrise = a.Team != null ? a.Team.IsMaitrise : false,
            })
            .ToListAsync(ct);

        // Filter by team if specified
        if (request.TeamIds is { Count: > 0 })
            assignments = assignments.Where(a => a.TeamId.HasValue && request.TeamIds.Contains(a.TeamId.Value)).ToList();

        // Group by team
        var teams = assignments
            .GroupBy(a => new { a.TeamId, a.TeamName, a.TeamOrder, a.IsMaitrise })
            .OrderByDescending(g => g.Key.IsMaitrise).ThenBy(g => g.Key.TeamOrder)
            .Select(g => new TrombinoscoreTeam(
                g.Key.TeamName ?? "Sans équipe",
                g.Select(a => new TrombinoscoreMember(
                    $"{a.FirstName} {a.LastName}",
                    a.CardNumber,
                    a.PhotoPath
                )).ToList()
            ))
            .ToList();

        var data = new TrombinoscoreData(unit.Name, request.ScoutYear, request.IncludePhotos, teams);
        var pdf = trombinoscoreService.Generate(data);

        return Result<TrombinoscorePdf>.Success(new TrombinoscorePdf(pdf, TrombinoscoreFile.Name(unit.Name, request.ScoutYear)));
    }
}
