using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Teams.Commands.UpdateTeam;

public record UpdateTeamCommand(
    Guid Id, string Name, Guid UnitId, string? Description,
    string? Totem, string? Adjective, string? Color1, string? Color2, int DisplayOrder
) : IRequest<Result<bool>>;

public class UpdateTeamCommandValidator : AbstractValidator<UpdateTeamCommand>
{
    public UpdateTeamCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(200);
        RuleFor(x => x.UnitId).NotEmpty().WithMessage("L'unité est requise.");
    }
}

public class UpdateTeamCommandHandler : IRequestHandler<UpdateTeamCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUser;

    public UpdateTeamCommandHandler(IApplicationDbContext context, IAuditService auditService, ICurrentUserService currentUser)
    {
        _context = context;
        _auditService = auditService;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<bool>> Handle(UpdateTeamCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.Teams.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Équipe introuvable.");

        if (!_currentUser.IsSuperAdmin && !_currentUser.AuthorizedUnitIds.Contains(entity.UnitId))
            return Result<bool>.Failure("Accès non autorisé à cette unité.");

        var nameExists = await _context.Teams.AnyAsync(t => t.Name == request.Name && t.UnitId == request.UnitId && t.Id != request.Id, cancellationToken);
        if (nameExists)
            return Result<bool>.Failure("Une équipe avec ce nom existe déjà dans cette unité.");

        var oldValues = new { entity.Name, entity.Totem, entity.Adjective };

        entity.Name = request.Name;
        entity.UnitId = request.UnitId;
        entity.Description = request.Description;
        entity.Totem = request.Totem;
        entity.Adjective = request.Adjective;
        entity.Color1 = request.Color1;
        entity.Color2 = request.Color2;
        entity.DisplayOrder = request.DisplayOrder;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "Team", entity.Id, oldValues: oldValues, newValues: new { entity.Name, entity.Totem, entity.Adjective }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
