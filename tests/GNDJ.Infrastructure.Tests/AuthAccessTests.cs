using System.Text.Json;
using GNDJ.Application.Auth.Common;
using GNDJ.Domain.Entities;
using P = GNDJ.Domain.Enums.Permissions;

namespace GNDJ.Infrastructure.Tests;

// AuthAccess.LoadAsync is the single chokepoint (login + refresh) that turns a member's active assignments +
// any access delegation into the permission set + authorized-unit list baked into their JWT. These tests pin
// the union/scope rules the permissions rework depends on — especially the live-profile delegation ("agir
// comme") added in slice 3 and the additive-only nature of a granular grant.
public class AuthAccessTests
{
    private static readonly Guid Me = Guid.CreateVersion7();

    [Fact]
    public async Task Plain_unit_role_grants_its_perms_and_only_its_unit()
    {
        using var db = TestDb.New();
        var (_, role, unit) = TestDb.SeedRole(db, "chef-unite", groupLevel: false, P.MembersView, P.MembersEdit);
        var otherUnit = new Unit { Id = Guid.CreateVersion7(), Name = "Other", Code = "O" };
        db.Units.Add(otherUnit); // a second unit the member is NOT in
        var m = new Member { Id = Me, FirstName = "A", LastName = "B" };
        db.Members.Add(m);
        TestDb.Assign(db, m, role, unit);
        await db.SaveChangesAsync();

        var (perms, units) = await AuthAccess.LoadAsync(db, Me, isSuperAdmin: false, default);

        Assert.Contains(P.MembersView, perms);
        Assert.Contains(P.MembersEdit, perms);
        Assert.Equal([unit.Id], units); // scoped to the assignment unit only, not the whole group
    }

    [Fact]
    public async Task Group_level_role_sees_all_units()
    {
        using var db = TestDb.New();
        var (_, role, unit) = TestDb.SeedRole(db, "chef-de-groupe", groupLevel: true, P.MembersEdit, P.MaitriseManage);
        var u2 = new Unit { Id = Guid.CreateVersion7(), Name = "U2", Code = "U2" };
        var u3 = new Unit { Id = Guid.CreateVersion7(), Name = "U3", Code = "U3" };
        db.Units.AddRange(u2, u3);
        var m = new Member { Id = Me, FirstName = "A", LastName = "B" };
        db.Members.Add(m);
        TestDb.Assign(db, m, role, unit);
        await db.SaveChangesAsync();

        var (_, units) = await AuthAccess.LoadAsync(db, Me, isSuperAdmin: false, default);

        Assert.Equal(3, units.Count); // group-level → ALL units, like a super-admin
        Assert.Contains(u2.Id, units);
        Assert.Contains(u3.Id, units);
    }

    [Fact]
    public async Task Delegated_group_profile_acts_as_that_profile_all_units_and_perms()
    {
        // The slice-3 "agir comme (profil)" case: a plain CU is handed a group-level profile via delegation →
        // they gain its perms AND group-wide scope, without any group assignment.
        using var db = TestDb.New();
        var (cuProfile, cuRole, unit) = TestDb.SeedRole(db, "chef-unite", groupLevel: false, P.MembersEdit);
        var cgProfile = new SecurityProfile
        {
            Id = Guid.CreateVersion7(), Name = "chef-de-groupe", Code = "chef-de-groupe", IsGroupLevel = true,
            Permissions = new[] { P.DemandeView, P.DemandeManage, P.MaitriseManage }
                .Select(p => new SecurityProfilePermission { Permission = p }).ToList(),
        };
        db.SecurityProfiles.Add(cgProfile);
        var u2 = new Unit { Id = Guid.CreateVersion7(), Name = "U2", Code = "U2" };
        db.Units.Add(u2);
        var m = new Member { Id = Me, FirstName = "A", LastName = "B", DelegatedProfileId = cgProfile.Id };
        db.Members.Add(m);
        TestDb.Assign(db, m, cuRole, unit);
        await db.SaveChangesAsync();

        var (perms, units) = await AuthAccess.LoadAsync(db, Me, isSuperAdmin: false, default);

        Assert.Contains(P.MembersEdit, perms);   // from their own CU role
        Assert.Contains(P.DemandeManage, perms); // from the delegated CG profile
        Assert.Contains(P.MaitriseManage, perms);
        Assert.Equal(2, units.Count);            // delegated group-level profile → all units
        _ = cuProfile;
    }

    [Fact]
    public async Task Delegated_profile_is_resolved_live_reflecting_current_perms()
    {
        // "Stays in sync": the delegation stores only a profile REFERENCE, so editing the profile changes the
        // member's effective access on the next token issue — no re-save of the delegation needed.
        using var db = TestDb.New();
        var (_, cuRole, unit) = TestDb.SeedRole(db, "chef-unite", groupLevel: false, P.MembersEdit);
        var prof = new SecurityProfile
        {
            Id = Guid.CreateVersion7(), Name = "camp-only", Code = "camp-only", IsGroupLevel = true,
            Permissions = new List<SecurityProfilePermission> { new() { Permission = P.CampGrade } },
        };
        db.SecurityProfiles.Add(prof);
        var m = new Member { Id = Me, FirstName = "A", LastName = "B", DelegatedProfileId = prof.Id };
        db.Members.Add(m);
        TestDb.Assign(db, m, cuRole, unit);
        await db.SaveChangesAsync();

        var (before, _) = await AuthAccess.LoadAsync(db, Me, isSuperAdmin: false, default);
        Assert.Contains(P.CampGrade, before);
        Assert.DoesNotContain(P.CampManage, before);

        // Grant the profile an extra perm → the delegated member inherits it on the next load, no re-save.
        // Insert via the DbSet (never mutate the tracked nav collection — the app's own gotcha).
        db.SecurityProfilePermissions.Add(new SecurityProfilePermission { SecurityProfileId = prof.Id, Permission = P.CampManage });
        await db.SaveChangesAsync();

        var (after, _) = await AuthAccess.LoadAsync(db, Me, isSuperAdmin: false, default);
        Assert.Contains(P.CampManage, after);
    }

    [Fact]
    public async Task Granular_delegation_is_additive_only_never_widens_unit_scope()
    {
        // A JSON ad-hoc grant adds permissions but does NOT make a non-group member group-wide.
        using var db = TestDb.New();
        var (_, cuRole, unit) = TestDb.SeedRole(db, "chef-unite", groupLevel: false, P.MembersEdit);
        var otherUnit = new Unit { Id = Guid.CreateVersion7(), Name = "Other", Code = "O" };
        db.Units.Add(otherUnit);
        var m = new Member
        {
            Id = Me, FirstName = "A", LastName = "B",
            DelegatedPermissionsJson = JsonSerializer.Serialize(new[] { P.CampGrade, P.CampManage }),
        };
        db.Members.Add(m);
        TestDb.Assign(db, m, cuRole, unit);
        await db.SaveChangesAsync();

        var (perms, units) = await AuthAccess.LoadAsync(db, Me, isSuperAdmin: false, default);

        Assert.Contains(P.CampManage, perms); // granted
        Assert.Contains(P.MembersEdit, perms);
        Assert.Equal([unit.Id], units);        // still scoped to their own unit — granular grant carries no scope
    }

    [Fact]
    public async Task Legacy_full_cg_flag_grants_all_units()
    {
        using var db = TestDb.New();
        var (_, cuRole, unit) = TestDb.SeedRole(db, "chef-unite", groupLevel: false, P.MembersEdit);
        var u2 = new Unit { Id = Guid.CreateVersion7(), Name = "U2", Code = "U2" };
        db.Units.Add(u2);
        var m = new Member { Id = Me, FirstName = "A", LastName = "B", DelegatedGroupAccess = true };
        db.Members.Add(m);
        TestDb.Assign(db, m, cuRole, unit);
        await db.SaveChangesAsync();

        var (_, units) = await AuthAccess.LoadAsync(db, Me, isSuperAdmin: false, default);

        Assert.Equal(2, units.Count); // legacy full-CG snapshot flag still widens to all units
    }

    [Fact]
    public async Task Ended_assignments_are_ignored()
    {
        using var db = TestDb.New();
        var (_, role, unit) = TestDb.SeedRole(db, "chef-unite", groupLevel: false, P.MembersEdit);
        var m = new Member { Id = Me, FirstName = "A", LastName = "B" };
        db.Members.Add(m);
        TestDb.Assign(db, m, role, unit, end: new DateOnly(2025, 10, 1)); // historical, not active
        await db.SaveChangesAsync();

        var (perms, units) = await AuthAccess.LoadAsync(db, Me, isSuperAdmin: false, default);

        Assert.Empty(perms); // no active assignment → no role-derived permissions
        Assert.Empty(units);
    }

    [Fact]
    public async Task Super_admin_gets_all_permissions_and_all_units()
    {
        using var db = TestDb.New();
        db.Units.AddRange(
            new Unit { Id = Guid.CreateVersion7(), Name = "U1", Code = "U1" },
            new Unit { Id = Guid.CreateVersion7(), Name = "U2", Code = "U2" });
        await db.SaveChangesAsync();

        var (perms, units) = await AuthAccess.LoadAsync(db, Me, isSuperAdmin: true, default);

        Assert.Equal(P.All.Length, perms.Count);
        Assert.Equal(2, units.Count);
    }
}
