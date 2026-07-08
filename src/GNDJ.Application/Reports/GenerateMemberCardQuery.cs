using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Reports;

// Credit-card-sized member ID card PDF. Access: super-admin, the member themselves, or a leader of the
// member's active unit. Fields shown are driven by the admin "card designer" (the card.config setting).
public record GenerateMemberCardQuery(Guid MemberId) : IRequest<Result<byte[]>>;

public class GenerateMemberCardQueryHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    IMemberCardService cardService
) : IRequestHandler<GenerateMemberCardQuery, Result<byte[]>>
{
    public async ValueTask<Result<byte[]>> Handle(GenerateMemberCardQuery request, CancellationToken ct)
    {
        // Access check: own card always; another member's card is leader-only (members.edit) + unit-scoped.
        if (!currentUser.IsSuperAdmin && currentUser.MemberId != request.MemberId)
        {
            if (!currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MembersEdit))
                return Result<byte[]>.Failure("Accès non autorisé.");
            var canAccess = await context.MemberAssignments.AnyAsync(a =>
                a.MemberId == request.MemberId && a.EndDate == null && currentUser.AuthorizedUnitIds.Contains(a.UnitId), ct);
            if (!canAccess) return Result<byte[]>.Failure("Accès non autorisé.");
        }

        var member = await context.Members
            .Where(m => m.Id == request.MemberId)
            .Select(m => new
            {
                m.FirstName, m.LastName, m.CardNumber, m.BloodType,
                m.DateOfBirth, m.PhotoPath,
                UnitName = m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(),
                TeamName = m.Assignments.Where(a => a.EndDate == null && a.Team != null).Select(a => a.Team!.Name).FirstOrDefault(),
                RoleName = m.Assignments.Where(a => a.EndDate == null).Select(a => a.FunctionalRole.Name).FirstOrDefault(),
            })
            .FirstOrDefaultAsync(ct);

        if (member is null) return Result<byte[]>.Failure("Membre introuvable.");

        // Emergency contact from guardians
        var emergency = await context.GuardianLinks
            .Where(gl => gl.MemberId == request.MemberId && gl.IsEmergencyContact)
            .Select(gl => new
            {
                Name = gl.Guardian.FirstName + " " + gl.Guardian.LastName,
                Phone = gl.Guardian.Phones.Where(p => !p.IsDeleted).Select(p => p.CountryCode + " " + p.Number).FirstOrDefault()
            })
            .FirstOrDefaultAsync(ct);

        // Custom fields marked ShowOnCard
        var customValues = await context.MemberCustomFieldValues
            .Where(v => v.MemberId == request.MemberId && v.CustomField.IsActive && v.CustomField.ShowOnCard)
            .OrderBy(v => v.CustomField.DisplayOrder)
            .Select(v => new MemberCardCustomField(v.CustomField.Name, v.Value))
            .ToListAsync(ct);

        // Load card settings
        var cardConfigJson = await context.Settings
            .Where(s => s.Key == "card.config")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct);

        var cardSettings = DeserializeCardSettings(cardConfigJson);

        var cardData = new MemberCardData(
            $"{member.FirstName} {member.LastName}",
            member.CardNumber,
            member.UnitName,
            member.TeamName,
            member.RoleName,
            member.BloodType,
            member.DateOfBirth?.ToString("dd/MM/yyyy"),
            member.PhotoPath,
            emergency is not null ? $"{emergency.Name} {emergency.Phone}" : null,
            customValues
        );

        return Result<byte[]>.Success(cardService.Generate(cardData, cardSettings));
    }

    internal static CardSettings DeserializeCardSettings(string? json)
    {
        if (string.IsNullOrEmpty(json))
            return new CardSettings("GNDJ Scout", new CardFieldSettings(true, true, true, true, true, true, true, true, true, true));

        try
        {
            var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            var orgName = root.TryGetProperty("orgName", out var on) ? on.GetString() ?? "GNDJ Scout" : "GNDJ Scout";
            var fields = root.GetProperty("fields");

            return new CardSettings(orgName, new CardFieldSettings(
                fields.TryGetProperty("photo", out var p) && p.GetBoolean(),
                !fields.TryGetProperty("name", out var n) || n.GetBoolean(), // default true
                fields.TryGetProperty("cardNumber", out var cn) && cn.GetBoolean(),
                fields.TryGetProperty("unit", out var u) && u.GetBoolean(),
                fields.TryGetProperty("team", out var t) && t.GetBoolean(),
                fields.TryGetProperty("role", out var r) && r.GetBoolean(),
                fields.TryGetProperty("dateOfBirth", out var d) && d.GetBoolean(),
                fields.TryGetProperty("bloodType", out var b) && b.GetBoolean(),
                fields.TryGetProperty("emergencyContact", out var e) && e.GetBoolean(),
                fields.TryGetProperty("customFields", out var cf) && cf.GetBoolean()
            ));
        }
        catch
        {
            return new CardSettings("GNDJ Scout", new CardFieldSettings(true, true, true, true, true, true, true, true, true, true));
        }
    }
}
