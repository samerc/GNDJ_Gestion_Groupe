using GNDJ.Application.Common;
using GNDJ.Domain.Entities;
using GNDJ.Infrastructure.Persistence;
using P = GNDJ.Domain.Enums.Permissions;

namespace GNDJ.Infrastructure.Tests;

// MemberAccess.CanAccessMemberAsync is the single member-data authorization policy. Slice 5 made it govern
// member-file access by the "Membres" domaine (members.edit) rather than by maitrise.manage, so a group profile
// with Membres = "Aucun" truly hides member files. These tests pin that policy: own-record bypass needs no
// permission, member-file access requires members.edit (maitrise.manage alone is not enough), and a group
// manager reaches orphans while a plain unit leader is confined to their units.
public class MemberAccessTests
{
    // Seeds a member with an ACTIVE assignment in `unit`; returns the member id. If unit is null, the member is
    // an orphan (no active assignment).
    private static async Task<Guid> SeedMember(GndjDbContext db, Guid? unitId = null)
    {
        var m = new Member { Id = Guid.CreateVersion7(), FirstName = "A", LastName = "B" };
        db.Members.Add(m);
        if (unitId is Guid uid)
        {
            var role = new FunctionalRole { Id = Guid.CreateVersion7(), Name = "r", Code = "r", SecurityProfileId = Guid.CreateVersion7() };
            db.FunctionalRoles.Add(role);
            db.MemberAssignments.Add(new MemberAssignment
            {
                Id = Guid.CreateVersion7(), MemberId = m.Id, UnitId = uid, FunctionalRoleId = role.Id,
                StartDate = new DateOnly(2026, 1, 1), EndDate = null,
            });
        }
        await db.SaveChangesAsync();
        return m.Id;
    }

    [Fact]
    public async Task Super_admin_reaches_any_member()
    {
        using var db = TestDb.New();
        var member = await SeedMember(db);
        Assert.True(await MemberAccess.CanAccessMemberAsync(db, new FakeCurrentUser(true), member, default));
    }

    [Fact]
    public async Task Own_record_is_reachable_with_zero_permissions()
    {
        // The emptied read-only youth (no perms) must still reach their OWN fiche.
        using var db = TestDb.New();
        var member = await SeedMember(db);
        var me = new FakeCurrentUser(false) { MemberId = member };
        Assert.True(await MemberAccess.CanAccessMemberAsync(db, me, member, default));
    }

    [Fact]
    public async Task Maitrise_manage_without_members_edit_is_denied()
    {
        // The slice-5 guarantee: maitrise.manage alone no longer opens member files — "Membres: Aucun" is honest.
        using var db = TestDb.New();
        var unit = Guid.CreateVersion7();
        var member = await SeedMember(db, unit);
        var caller = new FakeCurrentUser(false, P.MaitriseManage) { AuthorizedUnitIds = [unit] };
        Assert.False(await MemberAccess.CanAccessMemberAsync(db, caller, member, default));
    }

    [Fact]
    public async Task Group_manager_with_members_edit_reaches_an_orphan()
    {
        // A CG (members.edit + maitrise.manage) reaches a member with NO active assignment.
        using var db = TestDb.New();
        var orphan = await SeedMember(db, unitId: null);
        var cg = new FakeCurrentUser(false, P.MembersEdit, P.MaitriseManage);
        Assert.True(await MemberAccess.CanAccessMemberAsync(db, cg, orphan, default));
    }

    [Fact]
    public async Task Unit_leader_reaches_member_in_authorized_unit()
    {
        using var db = TestDb.New();
        var unit = Guid.CreateVersion7();
        var member = await SeedMember(db, unit);
        var cu = new FakeCurrentUser(false, P.MembersEdit) { AuthorizedUnitIds = [unit] };
        Assert.True(await MemberAccess.CanAccessMemberAsync(db, cu, member, default));
    }

    [Fact]
    public async Task Unit_leader_denied_member_outside_their_units()
    {
        using var db = TestDb.New();
        var memberUnit = Guid.CreateVersion7();
        var member = await SeedMember(db, memberUnit);
        var cu = new FakeCurrentUser(false, P.MembersEdit) { AuthorizedUnitIds = [Guid.CreateVersion7()] }; // a DIFFERENT unit
        Assert.False(await MemberAccess.CanAccessMemberAsync(db, cu, member, default));
    }

    [Fact]
    public async Task Unit_leader_without_group_manager_cannot_reach_an_orphan()
    {
        // members.edit but NOT maitrise.manage → confined to active members in their units; an orphan (no active
        // assignment) is out of reach (they aren't in any of the leader's units).
        using var db = TestDb.New();
        var orphan = await SeedMember(db, unitId: null);
        var cu = new FakeCurrentUser(false, P.MembersEdit) { AuthorizedUnitIds = [Guid.CreateVersion7()] };
        Assert.False(await MemberAccess.CanAccessMemberAsync(db, cu, orphan, default));
    }
}
