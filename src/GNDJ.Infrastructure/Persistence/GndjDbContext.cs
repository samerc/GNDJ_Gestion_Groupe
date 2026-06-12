using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Infrastructure.Persistence;

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
    public DbSet<MemberRelationship> MemberRelationships => Set<MemberRelationship>();
    public DbSet<Guardian> Guardians => Set<Guardian>();
    public DbSet<GuardianLink> GuardianLinks => Set<GuardianLink>();
    public DbSet<GuardianPhone> GuardianPhones => Set<GuardianPhone>();
    public DbSet<GuardianEmail> GuardianEmails => Set<GuardianEmail>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<DocumentType> DocumentTypes => Set<DocumentType>();
    public DbSet<MemberDocument> MemberDocuments => Set<MemberDocument>();
    public DbSet<MemberCotisation> MemberCotisations => Set<MemberCotisation>();
    public DbSet<CotisationPayment> CotisationPayments => Set<CotisationPayment>();
    public DbSet<ScoutStage> ScoutStages => Set<ScoutStage>();
    public DbSet<Badge> Badges => Set<Badge>();
    public DbSet<MemberProgression> MemberProgressions => Set<MemberProgression>();
    public DbSet<Passage> Passages => Set<Passage>();
    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();
    public DbSet<CustomField> CustomFields => Set<CustomField>();
    public DbSet<MemberCustomFieldValue> MemberCustomFieldValues => Set<MemberCustomFieldValue>();
    public DbSet<ReportTemplate> ReportTemplates => Set<ReportTemplate>();
    public DbSet<UnitTypeProgression> UnitTypeProgressions => Set<UnitTypeProgression>();
    public DbSet<SmtpServer> SmtpServers => Set<SmtpServer>();
    public DbSet<EmailTemplate> EmailTemplates => Set<EmailTemplate>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(GndjDbContext).Assembly);

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
}
