using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common.Interfaces;

public interface IApplicationDbContext
{
    DbSet<Association> Associations { get; }
    DbSet<UnitType> UnitTypes { get; }
    DbSet<Unit> Units { get; }
    DbSet<Team> Teams { get; }
    DbSet<Member> Members { get; }
    DbSet<User> Users { get; }
    DbSet<SecurityProfile> SecurityProfiles { get; }
    DbSet<SecurityProfilePermission> SecurityProfilePermissions { get; }
    DbSet<FunctionalRole> FunctionalRoles { get; }
    DbSet<MemberPhone> MemberPhones { get; }
    DbSet<MemberEmail> MemberEmails { get; }
    DbSet<MemberAddress> MemberAddresses { get; }
    DbSet<MemberAssignment> MemberAssignments { get; }
    DbSet<MemberRelationship> MemberRelationships { get; }
    DbSet<Guardian> Guardians { get; }
    DbSet<GuardianLink> GuardianLinks { get; }
    DbSet<GuardianPhone> GuardianPhones { get; }
    DbSet<GuardianEmail> GuardianEmails { get; }
    DbSet<AuditLog> AuditLogs { get; }
    DbSet<Setting> Settings { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
