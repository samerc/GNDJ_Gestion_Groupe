using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;
using GNDJ.Application.Common;

namespace GNDJ.Application.Maitrises;

// CG-only tools for managing the group's leaders (maîtrise = members holding an IsMaitrise function):
// view them grouped by unit, remove one (ends the leadership assignment), or transfer one to another
// unit (keeping or closing the old function). All operate on MemberAssignment rows.

// ── Hierarchical maîtrise view: each unit (Maîtrise de Groupe first) with its leaders, by rank ──
public record MaitriseMemberDto(Guid AssignmentId, Guid MemberId, string FirstName, string LastName,
    string? PhotoPath, Guid FunctionalRoleId, string FunctionName, int Rank);

public record MaitriseUnitDto(Guid UnitId, string UnitCode, string UnitName, string? UnitTypeName,
    string? UnitTypeColor, bool IsGroupUnit, IReadOnlyList<MaitriseMemberDto> Members);

public record GetMaitrisesQuery : IRequest<IReadOnlyList<MaitriseUnitDto>>;

public class GetMaitrisesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetMaitrisesQuery, IReadOnlyList<MaitriseUnitDto>>
{
    public async ValueTask<IReadOnlyList<MaitriseUnitDto>> Handle(GetMaitrisesQuery request, CancellationToken ct)
    {
        var rows = await context.MemberAssignments
            .Where(a => a.EndDate == null && a.FunctionalRole.IsMaitrise)
            .Select(a => new
            {
                a.Id, a.MemberId, a.Member.FirstName, a.Member.LastName, a.Member.PhotoPath,
                a.UnitId, UnitCode = a.Unit.Code, UnitName = a.Unit.Name,
                UnitTypeCode = a.Unit.UnitType.Code, UnitTypeName = a.Unit.UnitType.Name, UnitTypeColor = a.Unit.UnitType.Color,
                a.FunctionalRoleId, FunctionName = a.FunctionalRole.Name, a.FunctionalRole.Rank
            })
            .ToListAsync(ct);

        return rows
            .GroupBy(r => new { r.UnitId, r.UnitCode, r.UnitName, r.UnitTypeCode, r.UnitTypeName, r.UnitTypeColor })
            .Select(g => new MaitriseUnitDto(
                g.Key.UnitId, g.Key.UnitCode, g.Key.UnitName, g.Key.UnitTypeName, g.Key.UnitTypeColor,
                g.Key.UnitTypeCode == "GRP",
                g.OrderByDescending(m => m.Rank).ThenBy(m => m.LastName).ThenBy(m => m.FirstName)
                    .Select(m => new MaitriseMemberDto(m.Id, m.MemberId, m.FirstName, m.LastName,
                        m.PhotoPath, m.FunctionalRoleId, m.FunctionName, m.Rank)).ToList()))
            // Maîtrise de Groupe (G) first, then by unit code.
            .OrderByDescending(u => u.IsGroupUnit).ThenBy(u => u.UnitCode)
            .ToList();
    }
}

// ── Remove from maîtrise: close the leadership function (member leaves that unit) ──
public record RemoveFromMaitriseCommand(Guid AssignmentId) : IRequest<Result<bool>>;

public class RemoveFromMaitriseCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<RemoveFromMaitriseCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(RemoveFromMaitriseCommand request, CancellationToken ct)
    {
        var assignment = await context.MemberAssignments.FirstOrDefaultAsync(a => a.Id == request.AssignmentId && a.EndDate == null, ct);
        if (assignment is null) return Result<bool>.Failure("Affectation introuvable ou déjà clôturée.");

        assignment.EndDate = LebanonClock.Today;
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("EndAssignment", "MemberAssignment", assignment.Id,
            newValues: new { Reason = "Retrait de la maîtrise", assignment.EndDate }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ── Transfer a leader to another unit: keep both functions, or close the old and open the new ──
public record TransferMaitriseCommand(Guid AssignmentId, Guid NewUnitId, Guid NewFunctionalRoleId, bool KeepOld) : IRequest<Result<bool>>;

public class TransferMaitriseCommandValidator : AbstractValidator<TransferMaitriseCommand>
{
    public TransferMaitriseCommandValidator()
    {
        RuleFor(x => x.AssignmentId).NotEmpty();
        RuleFor(x => x.NewUnitId).NotEmpty();
        RuleFor(x => x.NewFunctionalRoleId).NotEmpty();
    }
}

public class TransferMaitriseCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<TransferMaitriseCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(TransferMaitriseCommand request, CancellationToken ct)
    {
        var assignment = await context.MemberAssignments.FirstOrDefaultAsync(a => a.Id == request.AssignmentId && a.EndDate == null, ct);
        if (assignment is null) return Result<bool>.Failure("Affectation introuvable ou déjà clôturée.");

        var unit = await context.Units.FirstOrDefaultAsync(u => u.Id == request.NewUnitId, ct);
        if (unit is null) return Result<bool>.Failure("Unité de destination introuvable.");

        var role = await context.FunctionalRoles.FirstOrDefaultAsync(r => r.Id == request.NewFunctionalRoleId, ct);
        if (role is null) return Result<bool>.Failure("Fonction introuvable.");
        // The function must be valid for the destination unit's type (or be a global function).
        if (role.UnitTypeId != null && role.UnitTypeId != unit.UnitTypeId)
            return Result<bool>.Failure("Cette fonction n'appartient pas au type de l'unité de destination.");

        var today = LebanonClock.Today;

        // Already a leader in that unit+function? Avoid a duplicate active line.
        var dup = await context.MemberAssignments.AnyAsync(a => a.MemberId == assignment.MemberId
            && a.UnitId == request.NewUnitId && a.FunctionalRoleId == request.NewFunctionalRoleId && a.EndDate == null, ct);
        if (dup) return Result<bool>.Failure("Ce membre a déjà cette fonction active dans cette unité.");

        if (!request.KeepOld)
            assignment.EndDate = today;

        context.MemberAssignments.Add(new MemberAssignment
        {
            MemberId = assignment.MemberId,
            UnitId = request.NewUnitId,
            FunctionalRoleId = request.NewFunctionalRoleId,
            TeamId = null,
            StartDate = today,
            EndDate = null,
        });

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Transfer", "MemberAssignment", assignment.Id,
            newValues: new { assignment.MemberId, request.NewUnitId, request.NewFunctionalRoleId, request.KeepOld }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
