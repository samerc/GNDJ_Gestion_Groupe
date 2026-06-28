namespace GNDJ.Domain.Interfaces;

// Commits the changes staged through repositories in one transaction (the DbContext, behind an abstraction).
public interface IUnitOfWork : IDisposable
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
