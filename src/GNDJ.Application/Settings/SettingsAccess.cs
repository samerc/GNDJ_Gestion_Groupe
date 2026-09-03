using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Enums;

namespace GNDJ.Application.Settings;

// Per-setting access model for the Paramètres page.
//   • Super-admin / associations.manage → may read + edit EVERY setting.
//   • Chef de Groupe (maitrise.manage)  → may read + edit only the OPERATIONAL categories they run the
//     scout year with (enrollment, documents, cotisations, passage, member-data options, reports).
// Sensitive categories stay super-admin only because a CG must NOT be able to: redirect all outgoing
// mail (email), weaken the login policy (security), take the site down (maintenance), rewrite public
// content (site), or touch app plumbing (general/advanced). Category is the unit of control (v1).
public static class SettingsAccess
{
    // Categories a Chef de Groupe may edit (chosen by the group with the user, 2026-08-25).
    // NOTE: "contact" (contact-form recipient) is folded into the Email tab on the client and stays
    // admin-only here — it's email-adjacent. Any category not listed is admin-only by omission.
    private static readonly IReadOnlySet<string> CgCategories = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "demande", "documents", "cotisations", "passage", "members", "reports",
        // "login" = the two login-screen announcement banners — an operational communication tool for the CG.
        "login",
    };

    // True for a full admin (super-admin or associations.manage) — sees/edits everything.
    public static bool IsAdmin(ICurrentUserService user)
        => user.IsSuperAdmin || user.Permissions.Contains(Permissions.AssociationsManage);

    // Can the caller reach the settings page at all (i.e. see any settings)?
    public static bool CanViewAny(ICurrentUserService user)
        => IsAdmin(user) || user.Permissions.Contains(Permissions.MaitriseManage);

    // Is this category one a Chef de Groupe may edit?
    public static bool IsCgCategory(string category) => CgCategories.Contains(category);

    // Can the caller edit a setting in this category?
    public static bool CanEdit(string category, ICurrentUserService user)
        => IsAdmin(user)
        || (user.Permissions.Contains(Permissions.MaitriseManage) && IsCgCategory(category));
}
