using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace GNDJ.Api.Health;

// Health check that lightly touches the database (a single `SELECT 1`). Two jobs:
//   1. Readiness — /health now reports Unhealthy (503) if Postgres is unreachable, not just "process alive".
//   2. Warm-up — more importantly, this exercises the Npgsql/EF data path (opens a pooled connection, spins
//      up the provider). So when IIS Application Initialization hits /health after a recycle/reboot, the DB
//      path is primed BEFORE the first real user request — which removes the post-recycle cold window that
//      made the site feel slow (a fresh worker otherwise pays connection-pool + provider init on the first
//      authenticated call). Kept deliberately cheap (one SELECT 1) so the frequent probe stays free.
// Resolved in a per-check DI scope by the health-check middleware, so the scoped DbContext injection is safe.
public sealed class DatabaseHealthCheck : IHealthCheck
{
    private readonly GndjDbContext _db;

    public DatabaseHealthCheck(GndjDbContext db) => _db = db;

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            // Cheapest possible round-trip: proves connectivity and warms the connection pool + provider.
            await _db.Database.ExecuteSqlRawAsync("SELECT 1", cancellationToken);
            return HealthCheckResult.Healthy();
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("Database unreachable", ex);
        }
    }
}
