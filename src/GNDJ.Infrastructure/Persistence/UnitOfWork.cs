using GNDJ.Domain.Interfaces;

namespace GNDJ.Infrastructure.Persistence;

// Commit boundary: flushes everything staged on the shared (scoped) DbContext in one SaveChanges,
// so a handler's repository writes land atomically. Both interceptors (audit + soft-delete) fire here.
public class UnitOfWork : IUnitOfWork
{
    private readonly GndjDbContext _context;

    public UnitOfWork(GndjDbContext context)
    {
        _context = context;
    }

    public async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        => await _context.SaveChangesAsync(cancellationToken);

    public void Dispose() => _context.Dispose();
}
