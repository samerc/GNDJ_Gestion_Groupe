using Microsoft.Extensions.Configuration;

namespace GNDJ.Application.Common;

// Resolves the outgoing SMTP password, PREFERRING configuration over the value stored in the database.
//
// Why: SMTP passwords used to live in plaintext in the smtp_servers table, which is included in the nightly
// pg_dump that is copied OFF-server (rclone) — so the provider credentials ended up in cloud backups. Moving
// them to appsettings.Production.json (gitignored, server-only, never dumped) removes that exposure and mirrors
// how the ops/error SMTP (ErrorAlerts:Smtp) is already configured.
//
// Config shape (appsettings.Production.json):
//   "Smtp": { "Passwords": { "SMTP2GO": "...", "SendPulse": "...", "Mailgun": "..." } }
// A key matches an SMTP server by its Name OR its Host, case- AND whitespace-insensitive. When a matching,
// non-empty config value exists it wins; otherwise we fall back to the DB value (backward compatible — nothing
// breaks until the admin adds the config, and existing rows keep working). Once the config is in place the
// admin blanks the DB column (UPDATE smtp_servers SET password='') so the secret leaves the DB + backups.
public static class SmtpPassword
{
    public static string Resolve(IConfiguration config, string? serverName, string? serverHost, string? dbPassword)
    {
        var section = config.GetSection("Smtp:Passwords");
        if (section.Exists())
        {
            var name = Norm(serverName);
            var host = Norm(serverHost);
            foreach (var child in section.GetChildren())
            {
                var key = Norm(child.Key);
                if (!string.IsNullOrEmpty(child.Value) && (key == name || key == host))
                    return child.Value!;
            }
        }
        return dbPassword ?? string.Empty;
    }

    // A server that has a username but no password (neither in config nor in the DB). .NET's SmtpClient then
    // skips/abandons the login and sends unauthenticated, which providers reject with a misleading "relay access
    // denied" — so we check this ourselves and report the real cause.
    public static bool IsMissing(string? username, string? resolvedPassword)
        => !string.IsNullOrWhiteSpace(username) && string.IsNullOrEmpty(resolvedPassword);

    public static string MissingMessage(string? serverName, string? serverHost)
        => $"Aucun mot de passe trouvé pour le serveur SMTP « {serverName} » : ajoutez-le dans appsettings.Production.json "
         + $"sous Smtp:Passwords avec la clé \"{serverName}\" (le nom du serveur) ou \"{serverHost}\" (l'hôte), puis recyclez le pool IIS.";

    // Strip whitespace + lowercase so "SMTP 2GO" / "smtp2go" / "mail.smtp2go.com" match forgivingly.
    private static string Norm(string? s) =>
        new string((s ?? string.Empty).Where(c => !char.IsWhiteSpace(c)).ToArray()).ToLowerInvariant();
}
