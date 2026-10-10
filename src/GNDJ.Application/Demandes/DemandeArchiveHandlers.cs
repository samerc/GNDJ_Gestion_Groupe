using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// Read-only browse of the demande archive (DemandeArchive) — a permanent snapshot of every application + its
// outcome, written when a campaign is closed. Purpose: history + verifying a family's claim that they applied
// before. Searchable by child name, account email / contact name, or birth date (JJ/MM/AAAA or AAAA-MM-JJ);
// filterable by scout year. Names/outcomes only (no full household).

public record DemandeArchiveDto(
    Guid Id, string ScoutYear, string FirstName, string LastName, string? DateOfBirth, string? Gender,
    string? Classe, string? School, string? AccountEmail, string? ContactName,
    string Status, string? DecidedUnitName, string? DecisionNotes, DateTime? ResponseSentAt,
    string? CreatedMemberCardNumber, DateTime ArchivedAt);

public record DemandeArchiveListDto(IReadOnlyList<DemandeArchiveDto> Items, int Total, IReadOnlyList<string> ScoutYears);

public record GetDemandeArchivesQuery(string? Search, string? ScoutYear, int Page = 1, int PageSize = 50)
    : IRequest<Result<DemandeArchiveListDto>>;

public class GetDemandeArchivesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetDemandeArchivesQuery, Result<DemandeArchiveListDto>>
{
    public async ValueTask<Result<DemandeArchiveListDto>> Handle(GetDemandeArchivesQuery request, CancellationToken ct)
    {
        var q = context.DemandeArchives.AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.ScoutYear))
            q = q.Where(a => a.ScoutYear == request.ScoutYear);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            // A birth date (« 10/08/2017 », « 10-08-2017 », « 2017-08-10 ») searches that date; anything else is an
            // accent- & case-insensitive search on the child's name (either order), the account email and the
            // contact name (a family that spelled the child differently is still found by its email).
            var s = request.Search.Trim().ToLower();
            if (DateOnly.TryParseExact(s, ["dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "d-M-yyyy", "yyyy-MM-dd"],
                    System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var dob))
                q = q.Where(a => a.DateOfBirth == dob);
            else
            {
                // Hyphens count as spaces in names (« el khoury » finds « El-Khoury »); the email keeps the raw text.
                var n = s.Replace('-', ' ');
                q = q.Where(a =>
                    DbFns.Unaccent((a.FirstName + " " + a.LastName).Replace("-", " ").ToLower()).Contains(DbFns.Unaccent(n)) ||
                    DbFns.Unaccent((a.LastName + " " + a.FirstName).Replace("-", " ").ToLower()).Contains(DbFns.Unaccent(n)) ||
                    (a.AccountEmail != null && a.AccountEmail.ToLower().Contains(s)) ||
                    (a.ContactName != null && DbFns.Unaccent(a.ContactName.Replace("-", " ").ToLower()).Contains(DbFns.Unaccent(n))));
            }
        }

        var total = await q.CountAsync(ct);
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 200);

        var items = await q
            .OrderByDescending(a => a.ScoutYear).ThenBy(a => a.LastName).ThenBy(a => a.FirstName)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(a => new DemandeArchiveDto(
                a.Id, a.ScoutYear, a.FirstName, a.LastName,
                a.DateOfBirth != null ? a.DateOfBirth.Value.ToString("dd/MM/yyyy") : null, a.Gender,
                a.Classe, a.School, a.AccountEmail, a.ContactName,
                a.Status, a.DecidedUnitName, a.DecisionNotes, a.ResponseSentAt,
                a.CreatedMemberCardNumber, a.ArchivedAt))
            .ToListAsync(ct);

        // Distinct scout years present in the archive (for the filter dropdown).
        var years = await context.DemandeArchives.Select(a => a.ScoutYear).Distinct().OrderByDescending(y => y).ToListAsync(ct);

        return Result<DemandeArchiveListDto>.Success(new DemandeArchiveListDto(items, total, years));
    }
}
