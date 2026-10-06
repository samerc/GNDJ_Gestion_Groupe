using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

// Camp BP — « Fiches médicales »: for each famille, one page with every camper (Père / Mère first) and what the
// chefs need on the ground: age, blood type, allergies, medical remarks (from the member's file) and who to call
// (parents' phones). Members with allergies are also listed in a box at the top so they can't be missed.
// Medical data → same right as the Familles tab (view), and every download is written to the audit log.
public record GenerateCampMedicalCardsQuery(Guid CampId, int? FamilleNumber) : IRequest<Result<byte[]>>;

public class GenerateCampMedicalCardsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser,
    ICampReportService reports, IAuditService audit) : IRequestHandler<GenerateCampMedicalCardsQuery, Result<byte[]>>
{
    public async ValueTask<Result<byte[]>> Handle(GenerateCampMedicalCardsQuery request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Familles, false, ct) is { } denied)
            return Result<byte[]>.Failure(denied);
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.CampId, ct);
        if (camp is null) return Result<byte[]>.Failure("Camp introuvable.");

        var fams = await context.Familles
            .Where(f => f.CampId == camp.Id && f.Number <= camp.FamillesCount
                        && (request.FamilleNumber == null || f.Number == request.FamilleNumber))
            .OrderBy(f => f.Number)
            .Select(f => new { f.Id, f.Number, f.Name, f.PereMemberId, f.MereMemberId }).ToListAsync(ct);
        if (fams.Count == 0) return Result<byte[]>.Failure("Aucune famille à imprimer.");
        var famIds = fams.Select(f => f.Id).ToList();

        // Who is in each famille: the members dealt into it + its Père / Mère.
        var members = await context.CampParticipants
            .Where(p => p.CampId == camp.Id && p.IsAttending && p.Role == CampRole.Membre && p.FamilleId != null && famIds.Contains(p.FamilleId.Value))
            .Select(p => new { p.MemberId, FamilleId = p.FamilleId!.Value }).ToListAsync(ct);
        var numberOf = fams.ToDictionary(f => f.Id, f => f.Number);
        var rows = members.Select(m => (m.MemberId, Famille: numberOf[m.FamilleId], Role: (string?)null)).ToList();
        foreach (var f in fams)
        {
            if (f.PereMemberId is Guid p) rows.Add((p, f.Number, "Père"));
            if (f.MereMemberId is Guid m) rows.Add((m, f.Number, "Mère"));
        }
        var ids = rows.Select(r => r.MemberId).Distinct().ToList();

        var info = await context.Members.Where(m => ids.Contains(m.Id))
            .Select(m => new
            {
                m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.BloodType, m.Allergies, m.MedicalNotes,
                UnitCode = m.Assignments.Where(a => a.EndDate == null && !a.IsDeleted).Select(a => a.Unit.Code).FirstOrDefault(),
                OwnPhone = m.Phones.OrderByDescending(p => p.IsPrimary).Select(p => new { p.CountryCode, p.Number }).FirstOrDefault(),
            }).ToDictionaryAsync(m => m.Id, ct);

        // Parents to call: emergency contact first, then mother, father, others; each with their main phone.
        var links = await context.GuardianLinks
            .Where(l => ids.Contains(l.MemberId) && !l.Guardian.IsDeleted && !l.Guardian.IsDeceased)
            .Select(l => new
            {
                l.MemberId, l.RelationshipType, l.IsEmergencyContact,
                Name = l.Guardian.FirstName + " " + l.Guardian.LastName,
                Phone = l.Guardian.Phones.Where(p => !p.IsDeleted).OrderByDescending(p => p.IsPrimary)
                    .Select(p => new { p.CountryCode, p.Number }).FirstOrDefault(),
            }).ToListAsync(ct);
        var contactsOf = links.GroupBy(l => l.MemberId).ToDictionary(g => g.Key, g => g
            .Where(l => l.Phone != null)
            .OrderByDescending(l => l.IsEmergencyContact).ThenBy(l => RelationRank(l.RelationshipType))
            .Take(2)
            .Select(l => $"{RelationLabel(l.RelationshipType)}{l.Name} : {Phone(l.Phone!.CountryCode, l.Phone.Number)}")
            .ToList());

        var today = LebanonClock.Today;
        CampMedicalMember Row(Guid id, string? role)
        {
            var m = info[id];
            return new CampMedicalMember($"{m.FirstName} {m.LastName}", role, m.UnitCode, Age(m.DateOfBirth, today),
                Clean(m.BloodType), Clean(m.Allergies), Clean(m.MedicalNotes), contactsOf.GetValueOrDefault(id) ?? [],
                m.OwnPhone is null ? null : Phone(m.OwnPhone.CountryCode, m.OwnPhone.Number));
        }

        var data = fams.Select(f => new CampMedicalFamille(f.Number, f.Name,
            rows.Where(r => r.Famille == f.Number && info.ContainsKey(r.MemberId))
                .OrderBy(r => r.Role == "Père" ? 0 : r.Role == "Mère" ? 1 : 2)
                .ThenBy(r => info[r.MemberId].LastName).ThenBy(r => info[r.MemberId].FirstName)
                .Select(r => Row(r.MemberId, r.Role)).ToList())).ToList();

        await audit.LogAsync("Download", "Camp", camp.Id,
            newValues: new { Camp = camp.Name, Document = "Fiches médicales", Famille = request.FamilleNumber?.ToString() ?? "Toutes" },
            cancellationToken: ct);
        return Result<byte[]>.Success(reports.MedicalCards(camp.Name, camp.ScoutYear, data));
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static int? Age(DateOnly? dob, DateOnly today)
    {
        if (dob is not DateOnly d) return null;
        var age = today.Year - d.Year;
        if (today.Month < d.Month || (today.Month == d.Month && today.Day < d.Day)) age--;
        return age;
    }

    // Lebanese numbers are printed as dialled locally; foreign ones keep their country code.
    private static string Phone(string? code, string number) =>
        string.IsNullOrWhiteSpace(code) || code.Trim() == "+961" ? number.Trim() : $"{code.Trim()} {number.Trim()}";

    private static int RelationRank(string? rel) =>
        TextNormalization.NormalizeKey(rel ?? "") switch { "mere" => 0, "pere" => 1, _ => 2 };

    private static string RelationLabel(string? rel) =>
        TextNormalization.NormalizeKey(rel ?? "") switch { "mere" => "Mère — ", "pere" => "Père — ", _ => "" };
}
