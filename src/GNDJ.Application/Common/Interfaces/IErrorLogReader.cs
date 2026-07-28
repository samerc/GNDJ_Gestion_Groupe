namespace GNDJ.Application.Common.Interfaces;

// One row of the Serilog `application_logs` table (Warning+ level, written by the PostgreSQL sink).
public record ErrorLogEntry(DateTime Timestamp, string Level, string Message, string? Exception);
public record ErrorLogPage(IReadOnlyList<ErrorLogEntry> Items, int Total);

// Read-only access to the application logs for the super-admin "Journal des erreurs" page. Kept out of EF
// (the table is owned by Serilog, not a domain entity) — implemented with a direct parameterized query.
public interface IErrorLogReader
{
    Task<ErrorLogPage> QueryAsync(string? level, string? search, int page, int pageSize, CancellationToken ct);

    // Delete log rows (super-admin "Vider le journal"). When `before` is set, only rows older than it are
    // removed; otherwise the whole table is cleared. Returns the number of rows deleted.
    Task<int> PurgeAsync(DateTime? before, CancellationToken ct);
}
