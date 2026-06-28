using System.Linq.Expressions;
using GNDJ.Domain.Common;

namespace GNDJ.Domain.Interfaces;

// Generic persistence abstraction for an aggregate (implemented in Infrastructure over EF Core).
// Add/Update/Remove stage changes; IUnitOfWork.SaveChangesAsync commits them.
public interface IRepository<T> where T : BaseEntity
{
    Task<T?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<T>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<T>> FindAsync(Expression<Func<T, bool>> predicate, CancellationToken cancellationToken = default);
    IQueryable<T> Query();
    void Add(T entity);
    void Update(T entity);
    void Remove(T entity);
}
