using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Meetings;
using GNDJ.Application.Passages;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Dashboard;

// « À traiter » on the chef d'unité's « Mon unité »: what needs the chef's action in THIS unit right now, so they
// don't have to visit each page to find out. Only counts; the strip shows the non-zero ones as shortcuts.
//   • WithoutTeam        — youth (non-maîtrise) of the unit with no équipe (typically new members after
//                          « Envoyer les réponses » or the passage);
//   • DocumentsToVerify  — documents waiting for the chef's check (active document types);
//   • ChangeRequests     — members' requests (progression / unit, équipe, fonction) waiting for confirmation;
//   • MeetingsToApprove  — réunions created by a chef d'équipe, waiting for the chef's approval;
//   • PassageMissing     — while the passage is open and the unit isn't finished: youth with no passage choice yet;
//   • RepeatedAbsences   — members whose current run of missed réunions reaches attendance.absence_alert_count.
// Gated like the unit dashboard: a leader of this unit (members.edit) or super-admin.
public record UnitTodoDto(int WithoutTeam, int DocumentsToVerify, int ChangeRequests, int MeetingsToApprove,
    bool PassageOpen, bool PassageFinished, int PassageMissing, IReadOnlyList<RepeatedAbsenceDto>? RepeatedAbsences = null);
public record RepeatedAbsenceDto(Guid MemberId, string Name, int Count);

public record GetUnitTodoQuery(Guid UnitId) : IRequest<UnitTodoDto?>;

public class GetUnitTodoQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetUnitTodoQuery, UnitTodoDto?>
{
    public async ValueTask<UnitTodoDto?> Handle(GetUnitTodoQuery request, CancellationToken ct)
    {
        if (!MemberAccess.CanLeadUnit(currentUser, request.UnitId)) return null;
        var unitId = request.UnitId;

        // Members with an active post in the unit (anyone: maîtrise documents need checking too).
        var activeIds = context.MemberAssignments.Where(a => a.UnitId == unitId && a.EndDate == null).Select(a => a.MemberId);

        var withoutTeam = await context.MemberAssignments
            .Where(a => a.UnitId == unitId && a.EndDate == null && a.TeamId == null && !a.FunctionalRole.IsMaitrise)
            .Select(a => a.MemberId).Distinct().CountAsync(ct);

        var documents = await context.MemberDocuments
            .Where(d => d.Status == DocumentStatus.Pending && d.DocumentType.IsActive && activeIds.Contains(d.MemberId))
            .CountAsync(ct);

        var requests = await context.MemberChangeRequests
            .Where(r => r.Status == "Pending" && activeIds.Contains(r.MemberId))
            .CountAsync(ct);

        var meetings = await context.Meetings
            .Where(m => m.UnitId == unitId && m.Status == MeetingStatuses.Pending)
            .CountAsync(ct);

        // Passage: only while it's open; nothing to do once the unit is finished.
        var (passageOpen, year) = await PassageConfig.LoadAsync(context, ct);
        var finished = passageOpen && await PassageLocks.IsUnitSubmittedAsync(context, unitId, year, ct);
        var missing = 0;
        if (passageOpen && !finished)
        {
            var youth = PassageScope.ActiveYouth(context).Where(a => a.UnitId == unitId).Select(a => a.MemberId).Distinct();
            var withLine = PassageScope.Lines(context).Where(p => p.ScoutYear == year).Select(p => p.MemberId);
            missing = await youth.Where(id => !withLine.Contains(id)).CountAsync(ct);
        }

        var threshold = await AbsenceStreaks.ThresholdAsync(context, ct);
        var repeated = new List<RepeatedAbsenceDto>();
        if (threshold > 0)
        {
            var runs = (await AbsenceStreaks.ComputeAsync(context, unitId, null, ct)).Where(r => r.Value.Count >= threshold)
                .ToDictionary(r => r.Key, r => r.Value.Count);
            if (runs.Count > 0)
            {
                var ids = runs.Keys.ToList();
                var people = await context.Members.Where(m => ids.Contains(m.Id))
                    .Select(m => new { m.Id, m.FirstName, m.LastName }).ToListAsync(ct);
                repeated = people.Select(p => new RepeatedAbsenceDto(p.Id, $"{p.LastName} {p.FirstName}", runs[p.Id]))
                    .OrderByDescending(r => r.Count).ThenBy(r => r.Name).ToList();
            }
        }

        return new UnitTodoDto(withoutTeam, documents, requests, meetings, passageOpen, finished, missing, repeated);
    }
}
