using GNDJ.Application.Roles.Commands;
using GNDJ.Domain.Entities;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using P = GNDJ.Domain.Enums.Permissions;

namespace GNDJ.Infrastructure.Tests;

// SetProfileAreaAccessCommand is the full-merge editor: a group role is now an ordinary profile, and tuning
// one of its delegable AREAS (Membres, Demandes, Camp BP…) must NEVER strip the profile's other permissions
// (maitrise.manage, rentree.manage…). These tests pin that preservation guarantee plus the CG no-escalation cap
// and the authorization gates.
public class SetProfileAreaAccessTests
{
    private static async Task<(GndjDbContext Db, SecurityProfile Profile)> SeedProfile(
        bool groupLevel, string code, params string[] perms)
    {
        var db = TestDb.New();
        var profile = new SecurityProfile
        {
            Id = Guid.CreateVersion7(), Name = code, Code = code, IsGroupLevel = groupLevel,
            Permissions = perms.Select(p => new SecurityProfilePermission { Permission = p }).ToList(),
        };
        db.SecurityProfiles.Add(profile);
        await db.SaveChangesAsync();
        return (db, profile);
    }

    private static async Task<HashSet<string>> PermsOf(GndjDbContext db, Guid profileId) =>
        (await db.SecurityProfilePermissions.Where(p => p.SecurityProfileId == profileId)
            .Select(p => p.Permission).ToListAsync()).ToHashSet();

    private static SetProfileAreaAccessCommandHandler Handler(GndjDbContext db, bool isSuper, params string[] callerPerms)
        => new(db, new FakeCurrentUser(isSuper, callerPerms), new NoopAudit());

    [Fact]
    public async Task Preserves_non_area_perms_while_applying_an_area()
    {
        // The core guarantee: the profile keeps maitrise.manage + rentree.manage (non-area perms) even though
        // the CG is only setting the Demandes area to "complet".
        var (db, profile) = await SeedProfile(groupLevel: true, "assistant-de-groupe",
            P.MaitriseManage, P.RentreeManage, P.MembersView, P.MembersEdit);
        using (db)
        {
            var result = await Handler(db, isSuper: true).Handle(
                new SetProfileAreaAccessCommand(profile.Id, new() { ["demandes"] = "complet" }), default);

            Assert.True(result.IsSuccess);
            var perms = await PermsOf(db, profile.Id);
            Assert.Contains(P.MaitriseManage, perms); // preserved, untouched
            Assert.Contains(P.RentreeManage, perms);  // preserved, untouched
            Assert.Contains(P.DemandeView, perms);    // demandes → complet
            Assert.Contains(P.DemandeManage, perms);
        }
    }

    [Fact]
    public async Task Lecture_grants_view_only_complet_grants_manage_aucun_removes()
    {
        var (db, profile) = await SeedProfile(groupLevel: true, "assistant-de-groupe",
            P.MaitriseManage, P.CotisationsView, P.CotisationsCreate, P.CotisationsEdit, P.CotisationsDelete);
        using (db)
        {
            // documents → lecture (view only), cotisations → aucun (remove), camp → complet (view + manage)
            var result = await Handler(db, isSuper: true).Handle(new SetProfileAreaAccessCommand(profile.Id, new()
            {
                ["documents"] = "lecture",
                ["cotisations"] = "aucun",
                ["camp"] = "complet",
            }), default);

            Assert.True(result.IsSuccess);
            var perms = await PermsOf(db, profile.Id);
            Assert.Contains(P.DocumentsView, perms);
            Assert.DoesNotContain(P.DocumentsApprove, perms);  // lecture ≠ manage
            Assert.DoesNotContain(P.CotisationsView, perms);   // aucun cleared the whole area
            Assert.DoesNotContain(P.CotisationsCreate, perms);
            Assert.Contains(P.CampGrade, perms);               // complet = view…
            Assert.Contains(P.CampManage, perms);              // …+ manage
            Assert.Contains(P.MaitriseManage, perms);          // non-area perm preserved throughout
        }
    }

    [Fact]
    public async Task Non_super_editor_can_only_grant_area_perms_they_hold()
    {
        // A CG who holds demande.view but NOT demande.manage sets Demandes → complet: only the view perm they
        // actually hold is granted; demande.manage is capped out. Preserved perms are unaffected.
        var (db, profile) = await SeedProfile(groupLevel: true, "assistant-de-groupe", P.MaitriseManage);
        using (db)
        {
            var handler = Handler(db, isSuper: false, P.RolesManageGroup, P.DemandeView); // no DemandeManage
            var result = await handler.Handle(
                new SetProfileAreaAccessCommand(profile.Id, new() { ["demandes"] = "complet" }), default);

            Assert.True(result.IsSuccess);
            var perms = await PermsOf(db, profile.Id);
            Assert.Contains(P.DemandeView, perms);       // held by the CG → granted
            Assert.DoesNotContain(P.DemandeManage, perms); // NOT held → capped out
            Assert.Contains(P.MaitriseManage, perms);    // preserved (not an area perm, cap doesn't touch it)
        }
    }

    [Fact]
    public async Task Cg_cannot_edit_chef_de_groupe_profile()
    {
        var (db, profile) = await SeedProfile(groupLevel: true, "chef-de-groupe", P.MaitriseManage);
        using (db)
        {
            var handler = Handler(db, isSuper: false, P.RolesManageGroup, P.MembersView);
            var result = await handler.Handle(
                new SetProfileAreaAccessCommand(profile.Id, new() { ["membres"] = "lecture" }), default);

            Assert.False(result.IsSuccess);
            Assert.Equal(new[] { P.MaitriseManage }.ToHashSet(), await PermsOf(db, profile.Id)); // unchanged
        }
    }

    [Fact]
    public async Task Cg_cannot_edit_a_non_group_profile()
    {
        var (db, profile) = await SeedProfile(groupLevel: false, "chef-unite", P.MembersEdit);
        using (db)
        {
            var handler = Handler(db, isSuper: false, P.RolesManageGroup, P.DemandeView);
            var result = await handler.Handle(
                new SetProfileAreaAccessCommand(profile.Id, new() { ["demandes"] = "lecture" }), default);

            Assert.False(result.IsSuccess);
        }
    }

    [Fact]
    public async Task Non_manager_is_refused()
    {
        var (db, profile) = await SeedProfile(groupLevel: true, "assistant-de-groupe", P.MaitriseManage);
        using (db)
        {
            var handler = Handler(db, isSuper: false, P.MembersEdit); // no roles.manage_group
            var result = await handler.Handle(
                new SetProfileAreaAccessCommand(profile.Id, new() { ["membres"] = "lecture" }), default);

            Assert.False(result.IsSuccess);
            Assert.Equal("Accès non autorisé.", result.Error);
        }
    }

    [Fact]
    public async Task Super_admin_can_edit_a_non_group_profile()
    {
        // Super-admin is uncapped and unrestricted by the group-level / chef-de-groupe gates.
        var (db, profile) = await SeedProfile(groupLevel: false, "read-only", P.MembersView);
        using (db)
        {
            var result = await Handler(db, isSuper: true).Handle(
                new SetProfileAreaAccessCommand(profile.Id, new() { ["cotisations"] = "complet" }), default);

            Assert.True(result.IsSuccess);
            var perms = await PermsOf(db, profile.Id);
            Assert.Contains(P.CotisationsCreate, perms);
        }
    }

    [Fact]
    public async Task Missing_profile_fails()
    {
        using var db = TestDb.New();
        var result = await Handler(db, isSuper: true).Handle(
            new SetProfileAreaAccessCommand(Guid.CreateVersion7(), new() { ["membres"] = "lecture" }), default);
        Assert.False(result.IsSuccess);
    }
}
