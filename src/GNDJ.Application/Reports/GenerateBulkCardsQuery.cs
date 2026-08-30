using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Reports;

// Bulk member-card PDF — every active member of a unit, 10 cards per A4 page with cut lines.
// Same card layout/config as GenerateMemberCardQuery; reuses its DeserializeCardSettings. Unit-scoped.
public record GenerateBulkCardsQuery(Guid UnitId) : IRequest<Result<byte[]>>;

public class GenerateBulkCardsQueryHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    IMemberCardService cardService
) : IRequestHandler<GenerateBulkCardsQuery, Result<byte[]>>
{
    public async ValueTask<Result<byte[]>> Handle(GenerateBulkCardsQuery request, CancellationToken ct)
    {
        // Card generation can be turned off group-wide by the CG/super-admin (reports.cards_enabled).
        if (!await CardConfig.CardsEnabledAsync(context, ct))
            return Result<byte[]>.Failure("La génération des cartes membres est désactivée.");

        // Leader-only report (multi-member PII): members.edit + unit scope, not bare co-unit membership.
        if (!currentUser.IsSuperAdmin && !(currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MembersEdit) && currentUser.AuthorizedUnitIds.Contains(request.UnitId)))
            return Result<byte[]>.Failure("Accès non autorisé.");

        var unit = await context.Units.Where(u => u.Id == request.UnitId).Select(u => u.Name).FirstOrDefaultAsync(ct);
        if (unit is null) return Result<byte[]>.Failure("Unité introuvable.");

        // Get all active members in this unit
        var members = await context.MemberAssignments
            .Where(a => a.UnitId == request.UnitId && a.EndDate == null)
            .OrderByDescending(a => a.Team != null ? a.Team.IsMaitrise : false)
            .ThenBy(a => a.Team != null ? a.Team.DisplayOrder : 999)
            .ThenBy(a => a.Member.LastName).ThenBy(a => a.Member.FirstName)
            .Select(a => new
            {
                a.MemberId,
                a.Member.FirstName, a.Member.LastName, a.Member.CardNumber,
                a.Member.BloodType, a.Member.DateOfBirth, a.Member.PhotoPath,
                UnitName = a.Unit.Name,
                TeamName = a.Team != null ? a.Team.Name : null,
                RoleName = a.FunctionalRole.Name,
            })
            .ToListAsync(ct);

        var memberIds = members.Select(m => m.MemberId).ToList();

        // Emergency contacts
        var emergencyMap = await context.GuardianLinks
            .Where(gl => memberIds.Contains(gl.MemberId) && gl.IsEmergencyContact)
            .Select(gl => new
            {
                gl.MemberId,
                Contact = gl.Guardian.FirstName + " " + gl.Guardian.LastName + " " +
                    gl.Guardian.Phones.Where(p => !p.IsDeleted).Select(p => p.CountryCode + " " + p.Number).FirstOrDefault()
            })
            .GroupBy(x => x.MemberId)
            .ToDictionaryAsync(g => g.Key, g => g.First().Contact, ct);

        // Custom fields
        var customMap = await context.MemberCustomFieldValues
            .Where(v => memberIds.Contains(v.MemberId) && v.CustomField.IsActive && v.CustomField.ShowOnCard)
            .OrderBy(v => v.CustomField.DisplayOrder)
            .Select(v => new { v.MemberId, v.CustomField.Name, v.Value })
            .ToListAsync(ct);
        var customByMember = customMap.GroupBy(v => v.MemberId)
            .ToDictionary(g => g.Key, g => g.Select(v => new MemberCardCustomField(v.Name, v.Value)).ToList());

        // Card settings
        var cardConfigJson = await context.Settings
            .Where(s => s.Key == "card_config")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct);
        var cardSettings = GenerateMemberCardQueryHandler.DeserializeCardSettings(cardConfigJson);

        var cards = members.Select(m => new MemberCardData(
            $"{m.FirstName} {m.LastName}",
            m.CardNumber,
            m.UnitName,
            m.TeamName,
            m.RoleName,
            m.BloodType,
            m.DateOfBirth?.ToString("dd/MM/yyyy"),
            m.PhotoPath,
            emergencyMap.GetValueOrDefault(m.MemberId),
            customByMember.GetValueOrDefault(m.MemberId, [])
        )).ToList();

        return Result<byte[]>.Success(cardService.GenerateBulk(cards, cardSettings));
    }
}
