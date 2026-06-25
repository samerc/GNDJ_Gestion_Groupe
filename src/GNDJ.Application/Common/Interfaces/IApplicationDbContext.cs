using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

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
    DbSet<ApplicantAccount> ApplicantAccounts { get; }
    DbSet<ApplicantGuardian> ApplicantGuardians { get; }
    DbSet<ApplicantScoutRelation> ApplicantScoutRelations { get; }
    DbSet<Demande> Demandes { get; }
    DbSet<UnitIntakeQuota> UnitIntakeQuotas { get; }
    DbSet<NewsPost> NewsPosts { get; }
    DbSet<Page> Pages { get; }
    DbSet<RentreeTaskTemplate> RentreeTaskTemplates { get; }
    DbSet<RentreeTask> RentreeTasks { get; }
    DbSet<Camp> Camps { get; }
    DbSet<Famille> Familles { get; }
    DbSet<CampParticipant> CampParticipants { get; }
    DbSet<CampGame> CampGames { get; }
    DbSet<CampGameEtapiste> CampGameEtapistes { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

    // For handlers needing explicit serialization (e.g. passage finalize). Implemented in Infrastructure
    // so the relational/raw-SQL dependency stays out of the Application layer.
    Task<IDbContextTransaction> BeginTransactionAsync(CancellationToken cancellationToken = default);
    Task AcquireAdvisoryLockAsync(long key, CancellationToken cancellationToken = default);
}
