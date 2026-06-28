namespace GNDJ.Application.Common.Interfaces;

// Writes an audit_logs row recording who did what to which entity (with optional before/after values).
// Called explicitly by handlers for security-relevant actions (login, password change, deletes, etc.).
public interface IAuditService
{
    Task LogAsync(string action, string entityType, Guid? entityId, object? oldValues = null, object? newValues = null, CancellationToken cancellationToken = default);
}
