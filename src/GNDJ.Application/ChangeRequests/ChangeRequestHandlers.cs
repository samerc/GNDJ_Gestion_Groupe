using System.Text.Json;
using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.ChangeRequests;

// Member-proposed changes that require a leader's approval (progression + fonctions). A member PROPOSES
// (creates a Pending MemberChangeRequest for their OWN record); their CU or CG REVIEWS (approve → the real
// record is created; reject → discarded with a reason). Kinds: "Progression", "Assignment".

public static class ChangeRequestKinds { public const string Progression = "Progression", Assignment = "Assignment"; }
public static class ChangeRequestStatus { public const string Pending = "Pending", Approved = "Approved", Rejected = "Rejected"; }

// Serialized payloads (stored in PayloadJson).
public record ProgressionPayload(Guid UnitId, Guid ScoutStageId, Guid? BadgeId, DateOnly Date, string? Location, string? Notes);
public record AssignmentPayload(Guid UnitId, Guid? TeamId, Guid FunctionalRoleId, DateOnly StartDate);

public record MemberChangeRequestDto(
    Guid Id, Guid MemberId, string MemberName, string Kind, string Summary, string Status,
    string? DecisionNotes, DateTime CreatedAt, DateTime? ReviewedAt);

static class ChangeRequestAccess
{
    // The caller can manage this member = super-admin, or a members.edit leader with the member active in
    // one of their units. Same "leader of the member's current unit" rule used across the app.
    public static async Task<bool> CanManageMember(IApplicationDbContext ctx, ICurrentUserService user, Guid memberId, CancellationToken ct)
    {
        if (user.IsSuperAdmin) return true;
        if (!user.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MembersEdit)) return false;
        return await ctx.MemberAssignments.AnyAsync(a =>
            a.MemberId == memberId && a.EndDate == null && !a.IsDeleted && user.AuthorizedUnitIds.Contains(a.UnitId), ct);
    }
}

// ── Propose: Progression (member) ────────────────────────────────────────────
public record ProposeProgressionCommand(Guid UnitId, Guid ScoutStageId, Guid? BadgeId, DateOnly Date, string? Location, string? Notes) : IRequest<Result<Guid>>;

public class ProposeProgressionValidator : AbstractValidator<ProposeProgressionCommand>
{
    public ProposeProgressionValidator()
    {
        RuleFor(x => x.UnitId).NotEmpty();
        RuleFor(x => x.ScoutStageId).NotEmpty();
        RuleFor(x => x.Date).LessThanOrEqualTo(_ => DateOnly.FromDateTime(DateTime.UtcNow)).WithMessage("La date ne peut pas être dans le futur.");
        RuleFor(x => x.Location).MaximumLength(200).NoHtml();
        RuleFor(x => x.Notes).MaximumLength(2000).NoHtml();
    }
}

public class ProposeProgressionHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<ProposeProgressionCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(ProposeProgressionCommand request, CancellationToken ct)
    {
        var memberId = currentUser.MemberId;
        if (memberId is null) return Result<Guid>.Failure("Aucun membre associé à ce compte.");

        // The target unit must exist and be active. A member may propose progression for ANY unit (the CU/CG
        // reviews it) — not just units they've belonged to.
        if (!await context.Units.AnyAsync(u => u.Id == request.UnitId && u.IsActive, ct))
            return Result<Guid>.Failure("Unité introuvable.");

        var stage = await context.ScoutStages.FindAsync([request.ScoutStageId], ct);
        if (stage is null) return Result<Guid>.Failure("Étape introuvable.");
        if (stage.IsBadgeStage && request.BadgeId is null) return Result<Guid>.Failure("Un badge est requis pour cette étape.");

        var badgeName = request.BadgeId is null ? null : (await context.Badges.FindAsync([request.BadgeId.Value], ct))?.Name;
        var unitName = (await context.Units.FindAsync([request.UnitId], ct))?.Name ?? "";
        var summary = $"Progression : {stage.Name}{(badgeName is null ? "" : $" · {badgeName}")} — {unitName}";

        var payload = JsonSerializer.Serialize(new ProgressionPayload(request.UnitId, request.ScoutStageId, request.BadgeId, request.Date, request.Location, request.Notes));
        var entity = new MemberChangeRequest { MemberId = memberId.Value, Kind = ChangeRequestKinds.Progression, PayloadJson = payload, Summary = summary, Status = ChangeRequestStatus.Pending };
        context.MemberChangeRequests.Add(entity);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(entity.Id);
    }
}

// ── Units a member may target when proposing a fonction ──────────────────────
// ALL active units (not unit-scoped like GetUnitsQuery) so a member can propose moving to ANY unit — the
// CU/CG reviews the proposal anyway. Minimal fields for the picker (id + name + unit type for role scoping).
public record ProposableUnitDto(Guid Id, string Name, Guid UnitTypeId);
public record GetProposableUnitsQuery : IRequest<IReadOnlyList<ProposableUnitDto>>;

public class GetProposableUnitsHandler(IApplicationDbContext context) : IRequestHandler<GetProposableUnitsQuery, IReadOnlyList<ProposableUnitDto>>
{
    public async ValueTask<IReadOnlyList<ProposableUnitDto>> Handle(GetProposableUnitsQuery request, CancellationToken ct)
        => await context.Units.Where(u => u.IsActive).OrderBy(u => u.Name)
            .Select(u => new ProposableUnitDto(u.Id, u.Name, u.UnitTypeId)).ToListAsync(ct);
}

// ── Propose: Assignment / fonction (member) ──────────────────────────────────
public record ProposeAssignmentCommand(Guid UnitId, Guid? TeamId, Guid FunctionalRoleId, DateOnly StartDate) : IRequest<Result<Guid>>;

public class ProposeAssignmentValidator : AbstractValidator<ProposeAssignmentCommand>
{
    public ProposeAssignmentValidator()
    {
        RuleFor(x => x.UnitId).NotEmpty();
        RuleFor(x => x.FunctionalRoleId).NotEmpty();
    }
}

public class ProposeAssignmentHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<ProposeAssignmentCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(ProposeAssignmentCommand request, CancellationToken ct)
    {
        var memberId = currentUser.MemberId;
        if (memberId is null) return Result<Guid>.Failure("Aucun membre associé à ce compte.");

        var unit = await context.Units.FindAsync([request.UnitId], ct);
        if (unit is null) return Result<Guid>.Failure("Unité introuvable.");
        var role = await context.FunctionalRoles.FindAsync([request.FunctionalRoleId], ct);
        if (role is null) return Result<Guid>.Failure("Fonction introuvable.");
        string? teamName = null;
        if (request.TeamId is not null)
        {
            var team = await context.Teams.FindAsync([request.TeamId.Value], ct);
            if (team is null || team.UnitId != request.UnitId) return Result<Guid>.Failure("L'équipe n'appartient pas à cette unité.");
            teamName = team.Name;
        }

        var summary = $"Fonction : {role.Name} — {unit.Name}{(teamName is null ? "" : $" · {teamName}")}";
        var start = request.StartDate == default ? DateOnly.FromDateTime(DateTime.UtcNow) : request.StartDate;
        var payload = JsonSerializer.Serialize(new AssignmentPayload(request.UnitId, request.TeamId, request.FunctionalRoleId, start));
        var entity = new MemberChangeRequest { MemberId = memberId.Value, Kind = ChangeRequestKinds.Assignment, PayloadJson = payload, Summary = summary, Status = ChangeRequestStatus.Pending };
        context.MemberChangeRequests.Add(entity);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(entity.Id);
    }
}

// ── My requests (member) ─────────────────────────────────────────────────────
public record GetMyChangeRequestsQuery : IRequest<IReadOnlyList<MemberChangeRequestDto>>;

public class GetMyChangeRequestsHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetMyChangeRequestsQuery, IReadOnlyList<MemberChangeRequestDto>>
{
    public async ValueTask<IReadOnlyList<MemberChangeRequestDto>> Handle(GetMyChangeRequestsQuery request, CancellationToken ct)
    {
        var memberId = currentUser.MemberId;
        if (memberId is null) return [];
        return await context.MemberChangeRequests
            .Where(r => r.MemberId == memberId)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new MemberChangeRequestDto(r.Id, r.MemberId, r.Member.FirstName + " " + r.Member.LastName, r.Kind, r.Summary, r.Status, r.DecisionNotes, r.CreatedAt, r.ReviewedAt))
            .ToListAsync(ct);
    }
}

// ── Pending requests (CU/CG review) ──────────────────────────────────────────
public record GetPendingChangeRequestsQuery : IRequest<IReadOnlyList<MemberChangeRequestDto>>;

public class GetPendingChangeRequestsHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetPendingChangeRequestsQuery, IReadOnlyList<MemberChangeRequestDto>>
{
    public async ValueTask<IReadOnlyList<MemberChangeRequestDto>> Handle(GetPendingChangeRequestsQuery request, CancellationToken ct)
    {
        // Leader-only. A read-only youth has no members.edit → nothing.
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MembersEdit))
            return [];

        var query = context.MemberChangeRequests.Where(r => r.Status == ChangeRequestStatus.Pending);
        if (!currentUser.IsSuperAdmin)
        {
            // Restrict to members currently active in one of the caller's authorized units.
            var authorizedUnitIds = currentUser.AuthorizedUnitIds;
            query = query.Where(r => context.MemberAssignments.Any(a =>
                a.MemberId == r.MemberId && a.EndDate == null && !a.IsDeleted && authorizedUnitIds.Contains(a.UnitId)));
        }

        return await query
            .OrderBy(r => r.CreatedAt)
            .Select(r => new MemberChangeRequestDto(r.Id, r.MemberId, r.Member.FirstName + " " + r.Member.LastName, r.Kind, r.Summary, r.Status, r.DecisionNotes, r.CreatedAt, r.ReviewedAt))
            .ToListAsync(ct);
    }
}

// Pending count for the sidebar badge (same scoping as the list).
public record GetPendingChangeRequestsCountQuery : IRequest<int>;
public class GetPendingChangeRequestsCountHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetPendingChangeRequestsCountQuery, int>
{
    public async ValueTask<int> Handle(GetPendingChangeRequestsCountQuery request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MembersEdit)) return 0;
        var query = context.MemberChangeRequests.Where(r => r.Status == ChangeRequestStatus.Pending);
        if (!currentUser.IsSuperAdmin)
        {
            var authorizedUnitIds = currentUser.AuthorizedUnitIds;
            query = query.Where(r => context.MemberAssignments.Any(a =>
                a.MemberId == r.MemberId && a.EndDate == null && !a.IsDeleted && authorizedUnitIds.Contains(a.UnitId)));
        }
        return await query.CountAsync(ct);
    }
}

// ── Review: approve (apply) / reject (CU/CG) ─────────────────────────────────
public record ReviewChangeRequestCommand(Guid Id, bool Approve, string? DecisionNotes) : IRequest<Result<bool>>;

public class ReviewChangeRequestValidator : AbstractValidator<ReviewChangeRequestCommand>
{
    public ReviewChangeRequestValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.DecisionNotes).MaximumLength(1000).NoHtml();
    }
}

public class ReviewChangeRequestHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<ReviewChangeRequestCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ReviewChangeRequestCommand request, CancellationToken ct)
    {
        var entity = await context.MemberChangeRequests.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Demande introuvable.");
        if (entity.Status != ChangeRequestStatus.Pending) return Result<bool>.Failure("Cette demande a déjà été traitée.");
        if (!await ChangeRequestAccess.CanManageMember(context, currentUser, entity.MemberId, ct))
            return Result<bool>.Failure("Accès non autorisé à ce membre.");

        if (request.Approve)
        {
            // Apply the proposed change: create the real record from the payload.
            if (entity.Kind == ChangeRequestKinds.Progression)
            {
                var p = JsonSerializer.Deserialize<ProgressionPayload>(entity.PayloadJson)!;
                context.MemberProgressions.Add(new MemberProgression
                {
                    MemberId = entity.MemberId, UnitId = p.UnitId, ScoutStageId = p.ScoutStageId,
                    BadgeId = p.BadgeId, Date = p.Date, Location = p.Location, Notes = p.Notes,
                });
            }
            else if (entity.Kind == ChangeRequestKinds.Assignment)
            {
                var p = JsonSerializer.Deserialize<AssignmentPayload>(entity.PayloadJson)!;
                context.MemberAssignments.Add(new MemberAssignment
                {
                    MemberId = entity.MemberId, UnitId = p.UnitId, TeamId = p.TeamId,
                    FunctionalRoleId = p.FunctionalRoleId, StartDate = p.StartDate, EndDate = null,
                });
            }
            else return Result<bool>.Failure("Type de demande inconnu.");

            entity.Status = ChangeRequestStatus.Approved;
        }
        else
        {
            entity.Status = ChangeRequestStatus.Rejected;
        }

        entity.ReviewedByUserId = currentUser.UserId;
        entity.ReviewedAt = DateTime.UtcNow;
        entity.DecisionNotes = request.DecisionNotes;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync(request.Approve ? "Approve" : "Reject", "MemberChangeRequest", entity.Id,
            newValues: new { entity.Kind, entity.Summary, entity.Status }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
