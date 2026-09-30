using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

// Camp BP « Liste de présence » (Excel): the same members as the grading page (active youth of the caller's
// units — every unit for the CG), one sheet per unit in parcours order, members in the grading order (équipe,
// then name). Members marked "ne vient pas" stay on the list with « Absent » / « Absente ».
public record GenerateCampPresenceListQuery(Guid CampId, Guid? UnitId) : IRequest<Result<byte[]>>;

public class GenerateCampPresenceListQueryHandler(IApplicationDbContext context, IMediator mediator, ICampPresenceSheet sheet)
    : IRequestHandler<GenerateCampPresenceListQuery, Result<byte[]>>
{
    private static readonly string[] BranchOrder = { "MEU", "RON", "TRO", "COM", "CLAN", "NOY", "JEM", "FEU", "CAR", "GRP" };

    public async ValueTask<Result<byte[]>> Handle(GenerateCampPresenceListQuery request, CancellationToken ct)
    {
        if (!await context.Camps.AnyAsync(c => c.Id == request.CampId, ct)) return Result<byte[]>.Failure("Camp introuvable.");

        // Reuse the grading query so the scope (CU = own units) and the "ne vient pas" flag are exactly the page's.
        var grading = await mediator.Send(new GetCampGradingQuery(request.CampId, request.UnitId), ct);
        if (!grading.IsSuccess) return Result<byte[]>.Failure(grading.Error!);
        var rows = grading.Value!;
        if (rows.Count == 0) return Result<byte[]>.Failure("Aucun membre à lister.");

        // The grading rows carry the unit NAME; fetch code + branch for sheet names and ordering.
        var names = rows.Select(r => r.UnitName).Where(n => n != null).Distinct().ToList();
        var units = await context.Units.Where(u => names.Contains(u.Name))
            .Select(u => new { u.Name, u.Code, TypeCode = u.UnitType.Code }).ToListAsync(ct);
        var byName = units.GroupBy(u => u.Name).ToDictionary(g => g.Key, g => g.First());

        static int Rank(string? code) { var i = Array.IndexOf(BranchOrder, code); return i < 0 ? BranchOrder.Length : i; }
        static int Number(string s) { var m = System.Text.RegularExpressions.Regex.Match(s, @"\d+"); return m.Success ? int.Parse(m.Value) : 0; }

        var result = rows.GroupBy(r => r.UnitName ?? "")
            .Select(g =>
            {
                byName.TryGetValue(g.Key, out var u);
                return new
                {
                    Rank = Rank(u?.TypeCode), Num = Number(g.Key),
                    Unit = new CampPresenceUnit(u?.Code ?? g.Key, g.Key, g.Select(r => new CampPresenceRow(r.FirstName, r.LastName,
                        r.IsAttending ? null : IsFemale(r.Gender) ? "Absente" : "Absent")).ToList()),
                };
            })
            .OrderBy(x => x.Rank).ThenBy(x => x.Num).ThenBy(x => x.Unit.Name)
            .Select(x => x.Unit).ToList();

        return Result<byte[]>.Success(sheet.Build(result));
    }

    private static bool IsFemale(string? gender) => gender is not null && gender.Trim().StartsWith("F", StringComparison.OrdinalIgnoreCase);
}
