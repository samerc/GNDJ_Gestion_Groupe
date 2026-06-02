using GNDJ.Domain.Interfaces;

namespace GNDJ.Infrastructure.Persistence;

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
