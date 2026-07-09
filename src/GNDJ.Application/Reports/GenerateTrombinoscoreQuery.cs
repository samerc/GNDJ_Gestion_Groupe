using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

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
        if (!TrombinoscoreRoster.CanManageUnit(currentUser, request.UnitId))
            return Result<TrombinoscorePdf>.Failure("Accès non autorisé à cette unité.");

        // Current-roster PDF (shared builder — identical to what the archive save stores).
        var (unitName, teams) = await TrombinoscoreRoster.BuildAsync(context, request.UnitId, request.TeamIds, ct);
        if (unitName is null)
            return Result<TrombinoscorePdf>.Failure("Unité introuvable.");

        var data = new TrombinoscoreData(unitName, request.ScoutYear, request.IncludePhotos, teams);
        var pdf = trombinoscoreService.Generate(data);

        return Result<TrombinoscorePdf>.Success(new TrombinoscorePdf(pdf, TrombinoscoreFile.Name(unitName, request.ScoutYear)));
    }
}
