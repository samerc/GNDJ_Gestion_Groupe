using System.Linq.Expressions;
using GNDJ.Domain.Common;
using GNDJ.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Infrastructure.Persistence.Repositories;

// Thin generic repository over a DbSet<T>. Add/Update/Remove only stage changes — they are NOT persisted
// until IUnitOfWork.SaveChangesAsync runs (see UnitOfWork). Query() exposes the raw IQueryable so callers
// can compose/project; the soft-delete filter on the context still applies.
public class GenericRepository<T> : IRepository<T> where T : BaseEntity
{
    protected readonly GndjDbContext Context;
    protected readonly DbSet<T> DbSet;

    public GenericRepository(GndjDbContext context)
    {
        Context = context;
        DbSet = context.Set<T>();
    }

    public async Task<T?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
        => await DbSet.FindAsync([id], cancellationToken);

    public async Task<IReadOnlyList<T>> GetAllAsync(CancellationToken cancellationToken = default)
        => await DbSet.ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<T>> FindAsync(Expression<Func<T, bool>> predicate, CancellationToken cancellationToken = default)
        => await DbSet.Where(predicate).ToListAsync(cancellationToken);

    public IQueryable<T> Query() => DbSet.AsQueryable();

    public void Add(T entity) => DbSet.Add(entity);

    public void Update(T entity) => DbSet.Update(entity);

    public void Remove(T entity) => DbSet.Remove(entity);
}
