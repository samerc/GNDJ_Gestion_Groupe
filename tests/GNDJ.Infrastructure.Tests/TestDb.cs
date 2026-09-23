using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Infrastructure.Tests;

// Shared harness for handler/logic tests that need a real GndjDbContext without Postgres. Uses the EF Core
// InMemory provider: it never emits DDL (so the Postgres-only bits — jsonb columns, the f_unaccent DbFunction,
// the trgm generated column — are simply ignored) while still applying navigation fixup + the global
// soft-delete query filters, which is exactly what these access-logic tests exercise.
internal static class TestDb
{
    public static GndjDbContext New()
    {
        var options = new DbContextOptionsBuilder<GndjDbContext>()
            .UseInMemoryDatabase($"gndj-test-{Guid.NewGuid()}")
            // The delegation/area-access logic reads a member's own profile perms in-memory; suppress the
            // InMemory transaction-not-supported warning that SaveChanges would otherwise raise.
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new GndjDbContext(options);
    }

    // Builds a self-consistent unit + role + profile graph so AuthAccess's navigation projections resolve.
    public static (SecurityProfile Profile, FunctionalRole Role, Unit Unit) SeedRole(
        GndjDbContext db, string profileCode, bool groupLevel, params string[] perms)
    {
        var profile = new SecurityProfile
        {
            Id = Guid.CreateVersion7(),
            Name = profileCode,
            Code = profileCode,
            IsGroupLevel = groupLevel,
            Permissions = perms.Select(p => new SecurityProfilePermission { Permission = p }).ToList(),
        };
        var role = new FunctionalRole
        {
            Id = Guid.CreateVersion7(),
            Name = profileCode + "-role",
            Code = profileCode + "-role",
            SecurityProfileId = profile.Id,
            SecurityProfile = profile,
        };
        var unit = new Unit { Id = Guid.CreateVersion7(), Name = "U-" + profileCode, Code = "U" };
        db.SecurityProfiles.Add(profile);
        db.FunctionalRoles.Add(role);
        db.Units.Add(unit);
        return (profile, role, unit);
    }

    public static Member SeedMember(GndjDbContext db)
    {
        var m = new Member { Id = Guid.CreateVersion7(), FirstName = "Test", LastName = "Member" };
        db.Members.Add(m);
        return m;
    }

    public static void Assign(GndjDbContext db, Member member, FunctionalRole role, Unit unit, DateOnly? end = null)
    {
        db.MemberAssignments.Add(new MemberAssignment
        {
            Id = Guid.CreateVersion7(),
            MemberId = member.Id,
            UnitId = unit.Id,
            FunctionalRoleId = role.Id,
            FunctionalRole = role,
            Unit = unit,
            StartDate = new DateOnly(2026, 1, 1),
            EndDate = end,
        });
    }
}

// Minimal fakes for the two Application services the area-access handler depends on.
internal sealed class FakeCurrentUser(bool isSuperAdmin, params string[] permissions) : ICurrentUserService
{
    public Guid? UserId => Guid.Empty;
    public Guid? MemberId => Guid.Empty;
    public bool IsSuperAdmin { get; } = isSuperAdmin;
    public IReadOnlyList<string> Permissions { get; } = permissions;
    public IReadOnlyList<Guid> AuthorizedUnitIds { get; } = [];
}

internal sealed class NoopAudit : IAuditService
{
    public Task LogAsync(string action, string entityType, Guid? entityId, object? oldValues = null,
        object? newValues = null, CancellationToken cancellationToken = default) => Task.CompletedTask;
}
