using GNDJ.Application.SystemHealth;
using GNDJ.Domain.Entities;
using GNDJ.Infrastructure.Persistence;

namespace GNDJ.Infrastructure.Tests;

// ConfigurationChecks feed the Paramètres banner, the Système page, the daily ops alert and the smoke suite.
// These pin the rules: a clean configuration reports no error, and each broken case is caught.
public class ConfigurationChecksTests
{
    private static void Set(GndjDbContext db, string key, string value) =>
        db.Settings.Add(new Setting { Key = key, Value = value, Category = key.Split('.')[0], Label = key });

    private static GndjDbContext CleanDb()
    {
        var db = TestDb.New();
        Set(db, "passage.scout_year", "2026-2027");
        Set(db, "demande.scout_year", "2026-2027");
        Set(db, "documents.scout_year", "2026-2027");
        Set(db, "demande.submission_start", "2026-09-01");
        Set(db, "demande.submission_deadline", "2026-09-10");
        Set(db, "documents.deposit_start", "2026-09-10");
        Set(db, "documents.deposit_deadline", "2026-09-20");
        Set(db, "documents.correction_start", "2026-09-20");
        Set(db, "documents.correction_deadline", "2026-09-27");
        Set(db, "documents.final_deadline", "2026-10-04");
        Set(db, "email.override_recipient", "");
        Set(db, "error.notify_email", "admin@example.com");
        Set(db, "member.classes", "[\"6ème\",\"5ème\"]");
        Set(db, "demande.excluded_classe", "6ème");
        Set(db, "cotisation.default_currency", "USD");
        Set(db, "cotisation.exchange_rates", "{\"LBP\":89500}");
        Set(db, "cotisation.full_amounts", "{\"USD\":30,\"LBP\":2500000}");
        return db;
    }

    private static void Change(GndjDbContext db, string key, string value) =>
        db.Settings.Local.Single(s => s.Key == key).Value = value;

    [Fact]
    public async Task Clean_settings_report_nothing()
    {
        using var db = CleanDb();
        await db.SaveChangesAsync();
        Assert.Empty(await ConfigurationChecks.SettingsAsync(db, default));
    }

    [Theory]
    [InlineData("documents.deposit_deadline", "2026-12-01", "error")]       // campaign dates out of order
    [InlineData("demande.submission_start", "2026-09-30", "error")]         // opens after the deadline
    [InlineData("passage.scout_year", "2026-2028", "error")]                // malformed scout year
    [InlineData("demande.scout_year", "2027-2028", "warning")]              // years differ
    [InlineData("email.override_recipient", "test@example.com", "warning")] // test mode
    [InlineData("demande.excluded_classe", "Term", "warning")]              // not in the classes list
    [InlineData("cotisation.full_amounts", "{\"EUR\":25}", "warning")]      // undefined currency
    [InlineData("cotisation.exchange_rates", "{\"LBP\":0}", "error")]       // non-positive rate
    [InlineData("error.notify_email", "", "warning")]                        // nobody gets alerts
    public async Task Each_problem_is_reported(string key, string value, string severity)
    {
        using var db = CleanDb();
        Change(db, key, value);
        await db.SaveChangesAsync();
        var issues = await ConfigurationChecks.SettingsAsync(db, default);
        Assert.Contains(issues, i => i.Severity == severity && i.Keys.Contains(key));
    }

    private static EmailTemplate Template(string body, string vars) => new()
    {
        Id = Guid.CreateVersion7(), Name = "T", Code = "t", Module = "general", Subject = "Bonjour {{name}}",
        BodyHtml = body, Variables = vars, IsActive = true,
    };

    [Fact]
    public async Task Template_with_declared_variables_is_clean()
    {
        using var db = TestDb.New();
        db.EmailTemplates.Add(Template("<p>{{name}}, {{ link }}</p>", "[{\"key\":\"name\"},{\"key\":\"link\"}]"));
        await db.SaveChangesAsync();
        Assert.Empty(await ConfigurationChecks.EmailTemplatesAsync(db, default));
    }

    [Fact]
    public async Task Unknown_variable_and_broken_braces_are_errors()
    {
        using var db = TestDb.New();
        db.EmailTemplates.Add(Template("<p>{{nmae}} {{ broken</p>", "[{\"key\":\"name\"}]"));
        await db.SaveChangesAsync();
        var issues = await ConfigurationChecks.EmailTemplatesAsync(db, default);
        Assert.Contains(issues, i => i.Severity == "error" && i.Message.Contains("{{nmae}}"));
        Assert.Contains(issues, i => i.Severity == "error" && i.Message.Contains("mal fermée"));
    }

    [Fact]
    public async Task Inactive_template_is_ignored()
    {
        using var db = TestDb.New();
        var t = Template("<p>{{nmae}}</p>", "[{\"key\":\"name\"}]");
        t.IsActive = false;
        db.EmailTemplates.Add(t);
        await db.SaveChangesAsync();
        Assert.Empty(await ConfigurationChecks.EmailTemplatesAsync(db, default));
    }
}
