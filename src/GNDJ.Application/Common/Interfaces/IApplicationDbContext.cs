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
    DbSet<DocumentType> DocumentTypes { get; }
    DbSet<MemberDocument> MemberDocuments { get; }
    DbSet<MemberCotisation> MemberCotisations { get; }
    DbSet<CotisationPayment> CotisationPayments { get; }
    DbSet<ScoutStage> ScoutStages { get; }
    DbSet<Badge> Badges { get; }
    DbSet<MemberProgression> MemberProgressions { get; }
    DbSet<Passage> Passages { get; }
    DbSet<ApiKey> ApiKeys { get; }
    DbSet<CustomField> CustomFields { get; }
    DbSet<MemberCustomFieldValue> MemberCustomFieldValues { get; }
    DbSet<SmtpServer> SmtpServers { get; }
    DbSet<EmailTemplate> EmailTemplates { get; }
    DbSet<ReportTemplate> ReportTemplates { get; }
    DbSet<UnitTypeProgression> UnitTypeProgressions { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
