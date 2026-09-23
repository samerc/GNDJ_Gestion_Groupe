using System.Text.Json;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;
using P = GNDJ.Domain.Enums.Permissions;

namespace GNDJ.Application.Members;

// ── Effective-access viewer ("Voir les accès") ──
// Read-only resolution of what a member can ACTUALLY do, WITH provenance (which fonction / delegation /
// super-admin grants each permission). It mirrors AuthAccess.LoadAsync — the exact union the login token is
// built from — so the view matches reality, then groups the granted permissions by domain via PermissionCatalog
// for readability. Zero behaviour change: this only READS the same data the token resolution reads.

// One thing that grants access: a fonction (via its profile), an access delegation, or the super-admin flag.
public record AccessSourceDto(string Kind, string Label, string? Detail, bool IsGroupLevel);
// A granted permission + the indexes (into Sources) of everything that grants it.
public record AccessPermDto(string Key, string Label, IReadOnlyList<int> Sources);
// Level = a one-word summary of the domaine for the left list: "voir" (view only), "gerer" (some actions),
// "complet" (every action of the domaine). The exact actions are in Permissions (shown in the detail pane).
public record AccessDomainDto(string Key, string Label, string Level, IReadOnlyList<AccessPermDto> Permissions);
public record MemberEffectiveAccessDto(
    bool IsSuperAdmin,
    bool AllUnits,
    IReadOnlyList<string> UnitLabels,
    IReadOnlyList<AccessSourceDto> Sources,
    IReadOnlyList<AccessDomainDto> Domains,
    // Honest flag: the member holds maitrise.manage, which currently grants master access to EVERY member file
    // regardless of the per-domaine "Membres" level (the MemberAccess.IsGroupManager bypass). Surfaced so the
    // viewer can tell the truth until that coupling is decoupled.
    bool MaitriseManageBypass);

public record GetMemberEffectiveAccessQuery(Guid MemberId) : IRequest<Result<MemberEffectiveAccessDto>>;

public class GetMemberEffectiveAccessQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMemberEffectiveAccessQuery, Result<MemberEffectiveAccessDto>>
{
    public async ValueTask<Result<MemberEffectiveAccessDto>> Handle(GetMemberEffectiveAccessQuery request, CancellationToken ct)
    {
        // Any whole-group manager (CG / ACG / super-admin) may inspect a member's effective access.
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<MemberEffectiveAccessDto>.Failure("Accès non autorisé.");

        if (!await context.Members.AnyAsync(m => m.Id == request.MemberId, ct))
            return Result<MemberEffectiveAccessDto>.Failure("Membre introuvable.");

        // Super-admin is a flag on the member's login account, not a permission.
        var isSuperAdmin = await context.Users
            .Where(u => u.MemberId == request.MemberId)
            .Select(u => u.IsSuperAdmin)
            .FirstOrDefaultAsync(ct);

        var sources = new List<AccessSourceDto>();
        var sourcePerms = new List<HashSet<string>>(); // parallel to `sources` — the perms each source contributes
        var allUnits = false;
        var unitLabels = new List<string>();

        if (isSuperAdmin)
        {
            // The top override: everything, everywhere.
            sources.Add(new AccessSourceDto("superadmin", "Super-administrateur", "Accès total à tout", true));
            sourcePerms.Add([.. P.All]);
            allUnits = true;
        }
        else
        {
            // Each active assignment contributes its fonction's profile permissions (and unit scope). A
            // group-level profile grants ALL units, like a super-admin.
            var assignments = await context.MemberAssignments
                .Where(a => a.MemberId == request.MemberId && a.EndDate == null)
                .Select(a => new
                {
                    RoleName = a.FunctionalRole.Name,
                    UnitCode = a.Unit.Code,
                    UnitName = a.Unit.Name,
                    ProfileName = a.FunctionalRole.SecurityProfile.Name,
                    IsGroupLevel = a.FunctionalRole.SecurityProfile.IsGroupLevel,
                    Perms = a.FunctionalRole.SecurityProfile.Permissions.Select(p => p.Permission).ToList(),
                })
                .ToListAsync(ct);

            foreach (var a in assignments)
            {
                sources.Add(new AccessSourceDto("fonction", a.RoleName,
                    a.IsGroupLevel
                        ? $"{a.UnitCode} · profil « {a.ProfileName} » · toutes les unités"
                        : $"{a.UnitCode} · profil « {a.ProfileName} »",
                    a.IsGroupLevel));
                sourcePerms.Add(a.Perms.ToHashSet());
                if (a.IsGroupLevel) allUnits = true;
                else if (!unitLabels.Contains(a.UnitName)) unitLabels.Add(a.UnitName);
            }

            // Access delegation ("accès délégué") — extra perms the CG granted this member directly, merged into
            // the token in AuthAccess. Surfaced here as ONE source combining the attached profile (live) + any
            // ad-hoc areas + the legacy full-CG flag, so the CG sees exactly what was delegated and from where.
            var delegation = await context.Members
                .Where(m => m.Id == request.MemberId)
                .Select(m => new { m.DelegatedPermissionsJson, m.DelegatedGroupAccess, m.DelegatedProfileId })
                .FirstOrDefaultAsync(ct);
            if (delegation is not null)
            {
                var dperms = new HashSet<string>();
                string? detail = delegation.DelegatedGroupAccess ? "Chef de Groupe entrant" : null;
                var dgroup = delegation.DelegatedGroupAccess;
                if (delegation.DelegatedProfileId is Guid pid)
                {
                    var prof = await context.SecurityProfiles
                        .Where(p => p.Id == pid)
                        .Select(p => new { p.Name, p.IsGroupLevel, Perms = p.Permissions.Select(x => x.Permission).ToList() })
                        .FirstOrDefaultAsync(ct);
                    if (prof is not null)
                    {
                        dperms.UnionWith(prof.Perms);
                        detail = $"profil « {prof.Name} »";
                        if (prof.IsGroupLevel) dgroup = true;
                    }
                }
                if (!string.IsNullOrWhiteSpace(delegation.DelegatedPermissionsJson))
                    dperms.UnionWith(JsonSerializer.Deserialize<List<string>>(delegation.DelegatedPermissionsJson) ?? []);
                if (dperms.Count > 0)
                {
                    sources.Add(new AccessSourceDto("delegation", "Accès délégué", detail, dgroup));
                    sourcePerms.Add(dperms);
                    if (dgroup) allUnits = true;
                }
            }
        }

        // Union of everything + provenance: for each catalog permission the member holds, list the source(s)
        // that grant it (index into `sources`), grouped by domain. Domains/permissions with nothing granted are
        // dropped so the view shows only what the member CAN do.
        var union = sourcePerms.SelectMany(s => s).ToHashSet();
        var domains = new List<AccessDomainDto>();
        foreach (var dom in PermissionCatalog.Domains)
        {
            var perms = new List<AccessPermDto>();
            foreach (var info in PermissionCatalog.All.Where(p => p.DomainKey == dom.Key))
            {
                if (!union.Contains(info.Key)) continue;
                var contributors = new List<int>();
                for (var i = 0; i < sourcePerms.Count; i++)
                    if (sourcePerms[i].Contains(info.Key)) contributors.Add(i);
                perms.Add(new AccessPermDto(info.Key, info.Label, contributors));
            }
            if (perms.Count == 0) continue;
            // Summarise the domaine: Complet if every catalog action is held, else Gérer if any non-view
            // action is held, else Voir (only ".view" permissions). Exact actions live in the detail pane.
            var total = PermissionCatalog.All.Count(p => p.DomainKey == dom.Key);
            var level = perms.Count >= total ? "complet"
                : perms.Any(p => !p.Key.EndsWith(".view")) ? "gerer"
                : "voir";
            domains.Add(new AccessDomainDto(dom.Key, dom.Label, level, perms));
        }

        return Result<MemberEffectiveAccessDto>.Success(new MemberEffectiveAccessDto(
            isSuperAdmin, allUnits, unitLabels, sources, domains, union.Contains(P.MaitriseManage)));
    }
}
