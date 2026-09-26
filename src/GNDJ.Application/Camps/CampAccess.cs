using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

// Who sees and does what inside a Camp BP — the single place for the rules (every camp handler asks here):
//   • Camp admin = super-admin, or camp.manage (the CG, or someone the CG delegated Camp BP to): everything, incl.
//     creating / archiving / deleting a camp and choosing each camp's responsables.
//   • Responsable du camp = chef de commission (an ACG the CG picked for THIS camp): full rights on the camp —
//     chooses the Commission BP members, sets their rights, edits every area.
//   • Other commission member: the Commission tab (read-only) + each area at the level a responsable gave them
//     (Familles / Jeux / Paramètres: none | view | edit).
//   • Anyone else (e.g. a CU from outside the commission): nothing here — only the grading page (/camp), which
//     is unit-scoped and handled by CampAttendanceHandlers.

public enum CampArea { Familles, Jeux, Parametres }

public static class CampAccessLevel
{
    public const string None = "none";
    public const string View = "view";
    public const string Edit = "edit";
    public static readonly string[] All = [None, View, Edit];

    public static int Rank(string? level) => level switch { Edit => 2, View => 1, _ => 0 };
}

// What the CURRENT user may do in a camp (sent to the camp screen so it shows only the allowed tabs / buttons).
public record CampMyAccessDto(
    bool IsAdmin, bool IsCommissionMember, bool IsResponsable,
    string Familles, string Jeux, string Parametres,
    bool CanManageCommission, bool CanSetRights);

public static class CampAccess
{
    public const string Denied = "Vous n'avez pas accès à cette partie du camp.";
    public const string AdminOnly = "Réservé au chef de groupe.";

    // CG (camp.manage) or super-admin. Commission members never hold camp.manage (they get camp.commission).
    public static bool IsAdmin(ICurrentUserService u) => u.IsSuperAdmin || u.Permissions.Contains(Permissions.CampManage);

    public static async Task<CampMyAccessDto> ForAsync(IApplicationDbContext context, ICurrentUserService u, Guid campId, CancellationToken ct)
    {
        if (IsAdmin(u))
            return new CampMyAccessDto(true, false, false, CampAccessLevel.Edit, CampAccessLevel.Edit, CampAccessLevel.Edit, true, true);

        var row = u.MemberId is Guid mid
            ? await context.CampCommissionMembers
                .Where(c => c.CampId == campId && c.MemberId == mid && !c.Camp.IsArchived)
                .Select(c => new { c.IsResponsable, c.FamillesAccess, c.JeuxAccess, c.ParametresAccess })
                .FirstOrDefaultAsync(ct)
            : null;
        if (row is null)
            return new CampMyAccessDto(false, false, false, CampAccessLevel.None, CampAccessLevel.None, CampAccessLevel.None, false, false);
        if (row.IsResponsable)
            return new CampMyAccessDto(false, true, true, CampAccessLevel.Edit, CampAccessLevel.Edit, CampAccessLevel.Edit, true, true);
        return new CampMyAccessDto(false, true, false, row.FamillesAccess, row.JeuxAccess, row.ParametresAccess, false, false);
    }

    // Null when allowed; otherwise the refusal message. edit=false → viewing is enough.
    public static async Task<string?> DenyAsync(IApplicationDbContext context, ICurrentUserService u, Guid campId,
        CampArea area, bool edit, CancellationToken ct)
    {
        if (IsAdmin(u)) return null;
        var a = await ForAsync(context, u, campId, ct);
        var level = area switch { CampArea.Familles => a.Familles, CampArea.Jeux => a.Jeux, _ => a.Parametres };
        return CampAccessLevel.Rank(level) >= (edit ? 2 : 1) ? null : Denied;
    }
}
