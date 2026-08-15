using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Organization;

// "Organiser mon unité" — the CU roster board. A single query returns everything the board needs (the unit's
// teams, the unit type's fonctions, and the active members with their current placement), and a tiny placement
// command moves ONE member between équipes / changes their fonction by editing the EXISTING active assignment
// in place (never creating a new one — that's what the passage does). Access = leader of the unit (members.edit
// + the unit is authorized) or super-admin, so a CU works on their own unit and a CG/ACG on any.

// ============================================================
// DTOs
// ============================================================
public record OrgTeamDto(Guid Id, string Name, bool IsMaitrise, int DisplayOrder);
public record OrgRoleDto(Guid Id, string Name, int Rank, bool IsMaitrise, bool IsDefault);
public record OrgMemberDto(
    Guid MemberId, string FirstName, string LastName, string? PhotoPath, string? Gender, DateOnly? DateOfBirth,
    Guid AssignmentId, Guid? TeamId, Guid FunctionalRoleId, string FunctionalRoleName, int RoleRank);
public record UnitOrganizationDto(
    Guid UnitId, string UnitName, Guid UnitTypeId, string UnitTypeName,
    IReadOnlyList<OrgTeamDto> Teams, IReadOnlyList<OrgRoleDto> Roles, IReadOnlyList<OrgMemberDto> Members);

// Shared access rule for the board: super-admin, or a leader (members.edit) of the given unit.
internal static class OrgAccess
{
    public static bool CanLeadUnit(ICurrentUserService user, Guid unitId) =>
        user.IsSuperAdmin || (user.Permissions.Contains(Permissions.MembersEdit) && user.AuthorizedUnitIds.Contains(unitId));
}

// ============================================================
// Query — the whole board in one call
// ============================================================
public record GetUnitOrganizationQuery(Guid UnitId) : IRequest<Result<UnitOrganizationDto>>;

public class GetUnitOrganizationQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetUnitOrganizationQuery, Result<UnitOrganizationDto>>
{
    public async ValueTask<Result<UnitOrganizationDto>> Handle(GetUnitOrganizationQuery request, CancellationToken ct)
    {
        if (!OrgAccess.CanLeadUnit(currentUser, request.UnitId))
            return Result<UnitOrganizationDto>.Failure("Accès non autorisé à cette unité.");

        var unit = await context.Units
            .Where(u => u.Id == request.UnitId)
            .Select(u => new { u.Id, u.Name, u.UnitTypeId, UnitTypeName = u.UnitType.Name })
            .FirstOrDefaultAsync(ct);
        if (unit is null) return Result<UnitOrganizationDto>.Failure("Unité introuvable.");

        // Teams of the unit — Maîtrise pinned first, then by display order (matches rosters/trombinoscope).
        var teams = await context.Teams
            .Where(t => t.UnitId == request.UnitId)
            .OrderByDescending(t => t.IsMaitrise).ThenBy(t => t.DisplayOrder).ThenBy(t => t.Name)
            .Select(t => new OrgTeamDto(t.Id, t.Name, t.IsMaitrise, t.DisplayOrder))
            .ToListAsync(ct);

        // Fonctions available for the dropdown = the unit type's non-archived roles, most senior first.
        var roles = await context.FunctionalRoles
            .Where(r => r.UnitTypeId == unit.UnitTypeId && !r.IsArchived)
            .OrderByDescending(r => r.Rank).ThenBy(r => r.Name)
            .Select(r => new OrgRoleDto(r.Id, r.Name, r.Rank, r.IsMaitrise, r.IsDefaultForNewMembers))
            .ToListAsync(ct);

        // Active members currently in this unit, with their active assignment (id + current team + fonction).
        var members = await context.MemberAssignments
            .Where(a => a.UnitId == request.UnitId && a.EndDate == null)
            .Select(a => new OrgMemberDto(
                a.MemberId, a.Member.FirstName, a.Member.LastName, a.Member.PhotoPath, a.Member.Gender, a.Member.DateOfBirth,
                a.Id, a.TeamId, a.FunctionalRoleId, a.FunctionalRole.Name, a.FunctionalRole.Rank))
            .ToListAsync(ct);
        // Order: most senior fonction first, then name — so leaders float to the top of each column.
        members = members
            .OrderByDescending(m => m.RoleRank)
            .ThenBy(m => m.LastName).ThenBy(m => m.FirstName)
            .ToList();

        return Result<UnitOrganizationDto>.Success(
            new UnitOrganizationDto(unit.Id, unit.Name, unit.UnitTypeId, unit.UnitTypeName, teams, roles, members));
    }
}

// ============================================================
// Command — move ONE member (team + fonction) in place
// ============================================================
// Edits the existing ACTIVE assignment only (team + fonction) — never the unit, dates, or a new row. This is a
// same-unit correction; moving to another unit / next branch is the passage, which creates history on finalize.
public record SetAssignmentPlacementCommand(Guid AssignmentId, Guid? TeamId, Guid FunctionalRoleId) : IRequest<Result<bool>>;

public class SetAssignmentPlacementCommandValidator : AbstractValidator<SetAssignmentPlacementCommand>
{
    public SetAssignmentPlacementCommandValidator()
    {
        RuleFor(x => x.AssignmentId).NotEmpty();
        RuleFor(x => x.FunctionalRoleId).NotEmpty().WithMessage("La fonction est requise.");
    }
}

public class SetAssignmentPlacementCommandHandler(IApplicationDbContext context, IAuditService auditService, ICurrentUserService currentUser)
    : IRequestHandler<SetAssignmentPlacementCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetAssignmentPlacementCommand request, CancellationToken ct)
    {
        var entity = await context.MemberAssignments.FindAsync([request.AssignmentId], ct);
        if (entity is null) return Result<bool>.Failure("Affectation introuvable.");
        // Only the CURRENT placement is editable here (adjusting the live roster). A closed row is history.
        if (entity.EndDate is not null) return Result<bool>.Failure("Cette affectation est terminée.");

        if (!OrgAccess.CanLeadUnit(currentUser, entity.UnitId))
            return Result<bool>.Failure("Accès non autorisé à cette unité.");

        // Validate role exists + team (if any) belongs to THIS unit — friendly 400 instead of a raw FK 500.
        if (!await context.FunctionalRoles.AnyAsync(r => r.Id == request.FunctionalRoleId, ct))
            return Result<bool>.Failure("Fonction introuvable.");
        if (request.TeamId.HasValue &&
            !await context.Teams.AnyAsync(t => t.Id == request.TeamId.Value && t.UnitId == entity.UnitId, ct))
            return Result<bool>.Failure("L'équipe sélectionnée n'appartient pas à cette unité.");

        var oldValues = new { entity.TeamId, entity.FunctionalRoleId };
        entity.TeamId = request.TeamId;
        entity.FunctionalRoleId = request.FunctionalRoleId;
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "MemberAssignment", entity.Id, oldValues: oldValues,
            newValues: new { entity.TeamId, entity.FunctionalRoleId }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
