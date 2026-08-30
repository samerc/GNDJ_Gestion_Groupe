using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Infrastructure.Persistence;

// The single EF Core context for the whole app. Conventions applied here / via configuration:
// snake_case column naming (set in DI), UUIDv7 keys, global soft-delete query filters (OnModelCreating),
// and a Postgres f_unaccent DbFunction backing accent-insensitive member search. Also exposes the
// transaction + advisory-lock primitives used by serialized batch operations (passage finalize, demande send).
public class GndjDbContext : DbContext, IApplicationDbContext
{
    public GndjDbContext(DbContextOptions<GndjDbContext> options) : base(options) { }

    public DbSet<Association> Associations => Set<Association>();
    public DbSet<UnitType> UnitTypes => Set<UnitType>();
    public DbSet<Unit> Units => Set<Unit>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<Member> Members => Set<Member>();
    public DbSet<User> Users => Set<User>();
    public DbSet<SecurityProfile> SecurityProfiles => Set<SecurityProfile>();
    public DbSet<SecurityProfilePermission> SecurityProfilePermissions => Set<SecurityProfilePermission>();
    public DbSet<FunctionalRole> FunctionalRoles => Set<FunctionalRole>();
    public DbSet<MemberPhone> MemberPhones => Set<MemberPhone>();
    public DbSet<MemberEmail> MemberEmails => Set<MemberEmail>();
    public DbSet<MemberAddress> MemberAddresses => Set<MemberAddress>();
    public DbSet<MemberAssignment> MemberAssignments => Set<MemberAssignment>();
    public DbSet<Guardian> Guardians => Set<Guardian>();
    public DbSet<GuardianLink> GuardianLinks => Set<GuardianLink>();
    public DbSet<GuardianPhone> GuardianPhones => Set<GuardianPhone>();
    public DbSet<GuardianEmail> GuardianEmails => Set<GuardianEmail>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<DocumentType> DocumentTypes => Set<DocumentType>();
    public DbSet<MemberDocument> MemberDocuments => Set<MemberDocument>();
    public DbSet<MemberDocumentPage> MemberDocumentPages => Set<MemberDocumentPage>();
    public DbSet<MemberCotisation> MemberCotisations => Set<MemberCotisation>();
    public DbSet<CotisationPayment> CotisationPayments => Set<CotisationPayment>();
    public DbSet<ScoutStage> ScoutStages => Set<ScoutStage>();
    public DbSet<Badge> Badges => Set<Badge>();
    public DbSet<MemberProgression> MemberProgressions => Set<MemberProgression>();
    public DbSet<MemberChangeRequest> MemberChangeRequests => Set<MemberChangeRequest>();
    public DbSet<Passage> Passages => Set<Passage>();
    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();
    public DbSet<CustomField> CustomFields => Set<CustomField>();
    public DbSet<MemberCustomFieldValue> MemberCustomFieldValues => Set<MemberCustomFieldValue>();
    public DbSet<ReportTemplate> ReportTemplates => Set<ReportTemplate>();
    public DbSet<UnitTypeProgression> UnitTypeProgressions => Set<UnitTypeProgression>();
    public DbSet<SmtpServer> SmtpServers => Set<SmtpServer>();
    public DbSet<EmailTemplate> EmailTemplates => Set<EmailTemplate>();
    public DbSet<ApplicantAccount> ApplicantAccounts => Set<ApplicantAccount>();
    public DbSet<ApplicantGuardian> ApplicantGuardians => Set<ApplicantGuardian>();
    public DbSet<ApplicantScoutRelation> ApplicantScoutRelations => Set<ApplicantScoutRelation>();
    public DbSet<Demande> Demandes => Set<Demande>();
    public DbSet<DemandeArchive> DemandeArchives => Set<DemandeArchive>();
    public DbSet<UnitIntakeQuota> UnitIntakeQuotas => Set<UnitIntakeQuota>();
    public DbSet<NewsPost> NewsPosts => Set<NewsPost>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<Resource> Resources => Set<Resource>();
    public DbSet<Page> Pages => Set<Page>();
    public DbSet<RentreeTaskTemplate> RentreeTaskTemplates => Set<RentreeTaskTemplate>();
    public DbSet<RentreeTask> RentreeTasks => Set<RentreeTask>();
    public DbSet<Camp> Camps => Set<Camp>();
    public DbSet<Famille> Familles => Set<Famille>();
    public DbSet<CampParticipant> CampParticipants => Set<CampParticipant>();
    public DbSet<CampGame> CampGames => Set<CampGame>();
    public DbSet<CampGameEtapiste> CampGameEtapistes => Set<CampGameEtapiste>();
    public DbSet<TrombinoscopeArchive> TrombinoscopeArchives => Set<TrombinoscopeArchive>();
    public DbSet<OutboxEmail> OutboxEmails => Set<OutboxEmail>();
    public DbSet<Meeting> Meetings => Set<Meeting>();
    public DbSet<MeetingAbsence> MeetingAbsences => Set<MeetingAbsence>();
    public DbSet<MemberGroup> MemberGroups => Set<MemberGroup>();
    public DbSet<MemberGroupRule> MemberGroupRules => Set<MemberGroupRule>();
    public DbSet<SiblingGroup> SiblingGroups => Set<SiblingGroup>();
    public DbSet<SiblingRejection> SiblingRejections => Set<SiblingRejection>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(GndjDbContext).Assembly);

        // Map the Postgres accent-insensitive search helper. We point at f_unaccent (an IMMUTABLE wrapper
        // around unaccent(), created by the AddMemberSearchTrgmIndex migration) rather than unaccent() itself,
        // because unaccent(text) is only STABLE and Postgres refuses to build an index on a non-IMMUTABLE
        // expression. Mapping the query to f_unaccent makes it match the pg_trgm GIN indexes on
        // f_unaccent(lower(first_name)) / (last_name), so member search uses the index instead of a seq scan.
        modelBuilder.HasDbFunction(typeof(GNDJ.Application.Common.DbFns).GetMethod(nameof(GNDJ.Application.Common.DbFns.Unaccent))!)
            .HasName("f_unaccent");

        // Global soft-delete query filters for all BaseEntity types
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (typeof(GNDJ.Domain.Common.BaseEntity).IsAssignableFrom(entityType.ClrType))
            {
                var method = typeof(GndjDbContext)
                    .GetMethod(nameof(ApplySoftDeleteFilter), System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!
                    .MakeGenericMethod(entityType.ClrType);
                method.Invoke(null, [modelBuilder]);
            }
        }
    }

    private static void ApplySoftDeleteFilter<T>(ModelBuilder modelBuilder) where T : GNDJ.Domain.Common.BaseEntity
    {
        modelBuilder.Entity<T>().HasQueryFilter(e => !e.IsDeleted);
    }

    public Task<Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction> BeginTransactionAsync(CancellationToken cancellationToken = default)
        => Database.BeginTransactionAsync(cancellationToken);

    // Postgres transaction-scoped advisory lock; auto-released on commit/rollback. Must be called
    // inside an open transaction to serialize the caller against other holders of the same key.
    public Task AcquireAdvisoryLockAsync(long key, CancellationToken cancellationToken = default)
        => Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock({0})", new object[] { key }, cancellationToken);
}
