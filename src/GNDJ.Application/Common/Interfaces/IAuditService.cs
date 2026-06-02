namespace GNDJ.Application.Common.Interfaces;

public interface IAuditService
{
    Task LogAsync(string action, string entityType, Guid? entityId, object? oldValues = null, object? newValues = null, CancellationToken cancellationToken = default);
}
