using System.Text.Json;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using GNDJ.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Infrastructure.Services;

// Writes audit-trail rows for sensitive mutations. Captures WHO (current user), WHAT (action +
// entity type/id), the before/after state (serialized to JSON), and request provenance (IP + user
// agent from the ambient HttpContext) so admin actions can be reviewed after the fact.
public class AuditService : IAuditService
{
    private readonly GndjDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public AuditService(GndjDbContext context, ICurrentUserService currentUser, IHttpContextAccessor httpContextAccessor)
    {
        _context = context;
        _currentUser = currentUser;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task LogAsync(string action, string entityType, Guid? entityId, object? oldValues = null, object? newValues = null, CancellationToken cancellationToken = default)
    {
        var httpContext = _httpContextAccessor.HttpContext;

        var log = new AuditLog
        {
            UserId = _currentUser.UserId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            MemberId = await ResolveMemberIdAsync(entityType, entityId, cancellationToken),
            OldValues = oldValues is not null ? JsonSerializer.Serialize(oldValues) : null,
            NewValues = newValues is not null ? JsonSerializer.Serialize(newValues) : null,
            IpAddress = httpContext?.Connection.RemoteIpAddress?.ToString(),
            UserAgent = httpContext?.Request.Headers.UserAgent.ToString(),
            Timestamp = DateTime.UtcNow
        };

        _context.AuditLogs.Add(log);
        await _context.SaveChangesAsync(cancellationToken);
    }

    // Which member does this row concern? Looked up from the entity's own member FK (IgnoreQueryFilters so a just
    // soft-deleted row still resolves). One small indexed query per audit write — audit is low-frequency. Never
    // throws: a lookup failure just leaves MemberId null (the row is still written).
    private async Task<Guid?> ResolveMemberIdAsync(string entityType, Guid? entityId, CancellationToken ct)
    {
        if (entityId is not Guid id) return null;
        try
        {
            return entityType switch
            {
                "Member" => id,
                "MemberAssignment" => await _context.MemberAssignments.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => (Guid?)x.MemberId).FirstOrDefaultAsync(ct),
                "MemberCotisation" => await _context.MemberCotisations.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => (Guid?)x.MemberId).FirstOrDefaultAsync(ct),
                "MemberProgression" => await _context.MemberProgressions.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => (Guid?)x.MemberId).FirstOrDefaultAsync(ct),
                "MemberChangeRequest" => await _context.MemberChangeRequests.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => (Guid?)x.MemberId).FirstOrDefaultAsync(ct),
                "Passage" => await _context.Passages.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => (Guid?)x.MemberId).FirstOrDefaultAsync(ct),
                "User" => await _context.Users.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => (Guid?)x.MemberId).FirstOrDefaultAsync(ct),
                // A document row — or, for single-file downloads, the member id itself is the EntityId.
                "MemberDocument" => await _context.MemberDocuments.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => (Guid?)x.MemberId).FirstOrDefaultAsync(ct)
                    ?? await _context.Members.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => (Guid?)x.Id).FirstOrDefaultAsync(ct),
                _ => null,
            };
        }
        catch { return null; }
    }
}
