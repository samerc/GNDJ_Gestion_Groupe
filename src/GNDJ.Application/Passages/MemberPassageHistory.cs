using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Passages;

// A member's passage lines, every scout year (newest first), for the member file: where they were, what the chef
// d'unité proposed, what the CG decided, notes, status and who did what. Staff only — a chef who can see the member
// (members.view / members.edit + the member's unit) or a group manager; NOT the member themselves (the CG's notes
// are internal).
public record GetMemberPassagesQuery(Guid MemberId) : IRequest<List<MemberPassageDto>>;

public record MemberPassageDto(
    Guid Id, string ScoutYear, string Status,
    string CurrentUnit, string? CurrentTeam, string CurrentRole,
    string ProposedUnit, string? ProposedTeam, string ProposedRole, bool IsLeaving, string? CuNotes, string? ProposedBy,
    string? FinalUnit, string? FinalTeam, string? FinalRole, bool? FinalIsLeaving, bool CgModified, string? CgNotes,
    string? ReviewedBy, DateTime? ReviewedAt, DateTime CreatedAt);

public class GetMemberPassagesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMemberPassagesQuery, List<MemberPassageDto>>
{
    public async ValueTask<List<MemberPassageDto>> Handle(GetMemberPassagesQuery request, CancellationToken ct)
    {
        if (!MemberAccess.HasMemberRead(currentUser)
            || !await MemberAccess.CanViewMemberAsync(context, currentUser, request.MemberId, ct))
            throw new UnauthorizedAccessException("Accès non autorisé à ce membre.");

        var rows = await context.Passages
            .Where(p => p.MemberId == request.MemberId)
            .Select(p => new
            {
                p.Id, p.ScoutYear, p.Status, p.CreatedAt,
                CurrentUnit = p.CurrentUnit.Name, p.CurrentTeamId, CurrentRole = p.CurrentRole.Name,
                ProposedUnit = p.ProposedUnit.Name, p.ProposedTeamId, ProposedRole = p.ProposedRole.Name,
                p.IsLeaving, p.CuNotes, p.ProposedByUserId,
                FinalUnit = p.FinalUnit != null ? p.FinalUnit.Name : null, p.FinalTeamId,
                FinalRole = p.FinalRole != null ? p.FinalRole.Name : null,
                p.FinalIsLeaving, p.CgModified, p.CgNotes, p.ReviewedByUserId, p.ReviewedAt,
            })
            .ToListAsync(ct);
        if (rows.Count == 0) return [];

        // Team and user names (no navigation for those on Passage) — kept even if the team was deleted since.
        var teamIds = rows.SelectMany(r => new[] { r.CurrentTeamId, r.ProposedTeamId, r.FinalTeamId })
            .Where(x => x.HasValue).Select(x => x!.Value).Distinct().ToList();
        var teams = await context.Teams.IgnoreQueryFilters().Where(t => teamIds.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t.Name, ct);
        var userIds = rows.SelectMany(r => new[] { (Guid?)r.ProposedByUserId, r.ReviewedByUserId })
            .Where(x => x.HasValue).Select(x => x!.Value).Distinct().ToList();
        var users = await context.Users.IgnoreQueryFilters().Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, Name = u.Member.FirstName + " " + u.Member.LastName })
            .ToDictionaryAsync(u => u.Id, u => u.Name, ct);

        string? Team(Guid? id) => id is { } g ? teams.GetValueOrDefault(g) : null;
        string? User(Guid? id) => id is { } g ? users.GetValueOrDefault(g) : null;

        return rows
            .OrderByDescending(r => r.ScoutYear).ThenByDescending(r => r.CreatedAt)
            .Select(r => new MemberPassageDto(r.Id, r.ScoutYear, r.Status,
                r.CurrentUnit, Team(r.CurrentTeamId), r.CurrentRole,
                r.ProposedUnit, Team(r.ProposedTeamId), r.ProposedRole, r.IsLeaving, r.CuNotes, User(r.ProposedByUserId),
                r.FinalUnit, Team(r.FinalTeamId), r.FinalRole, r.FinalIsLeaving, r.CgModified, r.CgNotes,
                User(r.ReviewedByUserId), r.ReviewedAt, r.CreatedAt))
            .ToList();
    }
}
