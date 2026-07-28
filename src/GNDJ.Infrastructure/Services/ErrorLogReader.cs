using GNDJ.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Npgsql;
using NpgsqlTypes;

namespace GNDJ.Infrastructure.Services;

// Reads Serilog's `application_logs` table (Warning+; created by the PostgreSQL sink) for the super-admin
// error journal. Direct parameterized Npgsql query — the table is not an EF entity. Read-only; if the table
// doesn't exist yet (no Warning+ logged since deploy) it returns an empty page instead of throwing.
public class ErrorLogReader : IErrorLogReader
{
    private readonly string _connString;

    public ErrorLogReader(IConfiguration config)
    {
        _connString = config.GetConnectionString("DefaultConnection")!;
    }

    public async Task<ErrorLogPage> QueryAsync(string? level, string? search, int page, int pageSize, CancellationToken ct)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 200 ? 50 : pageSize;

        try
        {
            await using var conn = new NpgsqlConnection(_connString);
            await conn.OpenAsync(ct);

            // WHERE built with placeholders only (level/search are parameters, never concatenated). The
            // filter params are EXPLICITLY typed text — else Postgres can't infer the type of a NULL param
            // (42P08 "could not determine data type of parameter").
            const string where = "WHERE (@level IS NULL OR level = @level) AND (@search IS NULL OR message ILIKE '%' || @search || '%')";
            NpgsqlParameter Text(string name, string? value) => new(name, NpgsqlDbType.Text) { Value = (object?)value ?? DBNull.Value };

            var total = 0;
            await using (var countCmd = new NpgsqlCommand($"SELECT COUNT(*) FROM application_logs {where}", conn))
            {
                countCmd.Parameters.Add(Text("level", level));
                countCmd.Parameters.Add(Text("search", search));
                total = Convert.ToInt32(await countCmd.ExecuteScalarAsync(ct));
            }

            var items = new List<ErrorLogEntry>();
            await using (var cmd = new NpgsqlCommand(
                $"SELECT timestamp, level, message, exception FROM application_logs {where} ORDER BY timestamp DESC LIMIT @limit OFFSET @offset", conn))
            {
                cmd.Parameters.Add(Text("level", level));
                cmd.Parameters.Add(Text("search", search));
                cmd.Parameters.AddWithValue("limit", pageSize);
                cmd.Parameters.AddWithValue("offset", (page - 1) * pageSize);
                await using var reader = await cmd.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                {
                    items.Add(new ErrorLogEntry(
                        reader.IsDBNull(0) ? default : reader.GetDateTime(0),
                        reader.IsDBNull(1) ? "" : reader.GetString(1),
                        reader.IsDBNull(2) ? "" : reader.GetString(2),
                        reader.IsDBNull(3) ? null : reader.GetString(3)));
                }
            }

            return new ErrorLogPage(items, total);
        }
        catch (PostgresException ex) when (ex.SqlState == "42P01") // undefined_table — nothing logged yet
        {
            return new ErrorLogPage([], 0);
        }
    }
}
