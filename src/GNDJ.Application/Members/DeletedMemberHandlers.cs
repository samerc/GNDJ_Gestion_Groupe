using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members;

// "Corbeille" (trash) — list soft-deleted members, restore them, or purge them immediately. A soft-deleted
// member is hidden everywhere and their login is disabled; they stay fully restorable until the background job
// permanently purges them after member.purge_after_days (default 30). PurgeAt = when that will happen.
public record DeletedMemberDto(Guid Id, string FirstName, string LastName, string? CardNumber, DateTime DeletedAt, DateTime PurgeAt);

public record GetDeletedMembersQuery : IRequest<IReadOnlyList<DeletedMemberDto>>;

public class GetDeletedMembersQueryHandler : IRequestHandler<GetDeletedMembersQuery, IReadOnlyList<DeletedMemberDto>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetDeletedMembersQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<IReadOnlyList<DeletedMemberDto>> Handle(GetDeletedMembersQuery request, CancellationToken ct)
    {
        var retentionDays = await GetRetentionDaysAsync(_context, ct);

        // IgnoreQueryFilters to reach soft-deleted rows. Non-super-admins are scoped to members who had an
        // assignment (any, incl. ended) in one of their authorized units — same rule as who could delete them.
        var query = _context.Members.IgnoreQueryFilters().Where(m => m.IsDeleted);
        if (!_currentUser.IsSuperAdmin)
        {
            var authIds = _currentUser.AuthorizedUnitIds;
            query = query.Where(m => m.Assignments.Any(a => authIds.Contains(a.UnitId)));
        }

        var rows = await query
            .OrderByDescending(m => m.DeletedAt)
            .Select(m => new { m.Id, m.FirstName, m.LastName, m.CardNumber, m.DeletedAt })
            .ToListAsync(ct);

        return rows
            .Where(r => r.DeletedAt.HasValue)
            .Select(r => new DeletedMemberDto(r.Id, r.FirstName, r.LastName, r.CardNumber,
                r.DeletedAt!.Value, r.DeletedAt.Value.AddDays(retentionDays)))
            .ToList();
    }

    internal static async Task<int> GetRetentionDaysAsync(IApplicationDbContext context, CancellationToken ct)
    {
        var val = await context.Settings.Where(s => s.Key == "member.purge_after_days").Select(s => s.Value).FirstOrDefaultAsync(ct);
        return int.TryParse(val, out var d) && d > 0 ? d : 30;
    }
}

// ── Restore a soft-deleted member (undo the deletion) ──
public record RestoreMemberCommand(Guid Id) : IRequest<Result<bool>>;

public class RestoreMemberCommandHandler : IRequestHandler<RestoreMemberCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;

    public RestoreMemberCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    {
        _context = context;
        _currentUser = currentUser;
        _audit = audit;
    }

    public async ValueTask<Result<bool>> Handle(RestoreMemberCommand request, CancellationToken ct)
    {
        var member = await _context.Members.IgnoreQueryFilters()
            .Include(m => m.Assignments)
            .Include(m => m.User)
            .FirstOrDefaultAsync(m => m.Id == request.Id, ct);

        if (member is null || !member.IsDeleted)
            return Result<bool>.Failure("Membre supprimé introuvable.");
        if (!CanAccess(member))
            return Result<bool>.Failure("Accès non autorisé à ce membre.");

        // Undo the soft-delete + re-enable the login. Assignments are NOT re-created — the member returns as an
        // alumni (no active unit); re-add an affectation if needed.
        member.IsDeleted = false;
        member.DeletedAt = null;
        member.DeletedBy = null;
        if (member.User is not null) member.User.IsActive = true;

        await _context.SaveChangesAsync(ct);
        await _audit.LogAsync("Restore", "Member", member.Id, newValues: new { member.FirstName, member.LastName }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }

    private bool CanAccess(Domain.Entities.Member member) =>
        _currentUser.IsSuperAdmin || member.Assignments.Any(a => _currentUser.AuthorizedUnitIds.Contains(a.UnitId));
}

// ── Purge a soft-deleted member NOW (permanent, skips the wait) ──
public record PurgeMemberCommand(Guid Id) : IRequest<Result<bool>>;

public class PurgeMemberCommandHandler : IRequestHandler<PurgeMemberCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IMemberPurgeService _purge;
    private readonly IAuditService _audit;

    public PurgeMemberCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IMemberPurgeService purge, IAuditService audit)
    {
        _context = context;
        _currentUser = currentUser;
        _purge = purge;
        _audit = audit;
    }

    public async ValueTask<Result<bool>> Handle(PurgeMemberCommand request, CancellationToken ct)
    {
        var member = await _context.Members.IgnoreQueryFilters()
            .Include(m => m.Assignments)
            .FirstOrDefaultAsync(m => m.Id == request.Id, ct);

        if (member is null || !member.IsDeleted)
            return Result<bool>.Failure("Membre supprimé introuvable.");
        if (!_currentUser.IsSuperAdmin && !member.Assignments.Any(a => _currentUser.AuthorizedUnitIds.Contains(a.UnitId)))
            return Result<bool>.Failure("Accès non autorisé à ce membre.");

        // Audit BEFORE the purge — afterwards the member row (and its id) is gone.
        await _audit.LogAsync("Purge", "Member", member.Id, oldValues: new { member.FirstName, member.LastName }, cancellationToken: ct);
        await _purge.PurgeAsync(member.Id, ct);
        return Result<bool>.Success(true);
    }
}
