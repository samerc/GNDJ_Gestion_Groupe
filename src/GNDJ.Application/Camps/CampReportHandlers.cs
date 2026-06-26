using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

// Kind: "famille" (one), "all" (all familles one per page), "units" (unit list with famille numbers).
public record GenerateCampReportQuery(Guid CampId, string Kind, int? FamilleNumber) : IRequest<Result<byte[]>>;

public class GenerateCampReportQueryHandler(IApplicationDbContext context, ICampReportService reports)
    : IRequestHandler<GenerateCampReportQuery, Result<byte[]>>
{
    public async ValueTask<Result<byte[]>> Handle(GenerateCampReportQuery request, CancellationToken ct)
    {
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.CampId, ct);
        if (camp is null) return Result<byte[]>.Failure("Camp introuvable.");

        var parts = await context.CampParticipants
            .Where(p => p.CampId == camp.Id && !p.IsDeleted && p.IsAttending && p.Role == CampRole.Membre)
            .Select(p => new CampReportMember(
                p.Member.FirstName + " " + p.Member.LastName, p.Gender, p.Branche,
                p.Member.Assignments.Where(a => !a.IsDeleted && a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(),
                p.Note, p.Famille != null ? p.Famille.Number : (int?)null))
            .ToListAsync(ct);

        var fams = await context.Familles.Where(f => f.CampId == camp.Id && !f.IsDeleted && f.Number <= camp.FamillesCount)
            .OrderBy(f => f.Number).Select(f => new { f.Number, f.PereMemberId, f.MereMemberId }).ToListAsync(ct);
        var leaderIds = fams.SelectMany(f => new[] { f.PereMemberId, f.MereMemberId }).Where(x => x != null).Select(x => x!.Value).Distinct().ToList();
        var names = await context.Members.Where(m => leaderIds.Contains(m.Id))
            .Select(m => new { m.Id, N = m.FirstName + " " + m.LastName }).ToDictionaryAsync(m => m.Id, m => m.N, ct);
        string? Name(Guid? id) => id != null && names.TryGetValue(id.Value, out var n) ? n : null;

        var famillesData = fams.Select(f => new CampReportFamille(f.Number, Name(f.PereMemberId), Name(f.MereMemberId),
            parts.Where(m => m.FamilleNumber == f.Number).OrderBy(m => m.Branche).ThenByDescending(m => m.Note ?? 0).ToList())).ToList();

        var unitsData = parts.GroupBy(m => m.UnitName ?? "—").OrderBy(g => g.Key)
            .Select(g => new CampReportUnit(g.Key, g.OrderBy(m => m.Name).ToList())).ToList();

        var data = new CampReportData(camp.Name, camp.ScoutYear, famillesData, unitsData);

        var pdf = request.Kind switch
        {
            "famille" => reports.Famille(data, request.FamilleNumber ?? 1),
            "units" => reports.UnitList(data),
            _ => reports.AllFamilles(data),
        };
        return Result<byte[]>.Success(pdf);
    }
}
