using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Teams.Commands.CreateTeam;

public record CreateTeamCommand(
    string Name, Guid UnitId, string? Description,
    string? Totem, string? Adjective, string? Color1, string? Color2, int DisplayOrder
) : IRequest<Result<Guid>>;

public class CreateTeamCommandValidator : AbstractValidator<CreateTeamCommand>
{
    public CreateTeamCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(200);
        RuleFor(x => x.UnitId).NotEmpty().WithMessage("L'unité est requise.");
    }
}

public class CreateTeamCommandHandler : IRequestHandler<CreateTeamCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUser;

    public CreateTeamCommandHandler(IApplicationDbContext context, IAuditService auditService, ICurrentUserService currentUser)
    {
        _context = context;
        _auditService = auditService;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<Guid>> Handle(CreateTeamCommand request, CancellationToken cancellationToken)
    {
        if (!_currentUser.IsSuperAdmin && !_currentUser.AuthorizedUnitIds.Contains(request.UnitId))
            return Result<Guid>.Failure("Accès non autorisé à cette unité.");

        var unitExists = await _context.Units.AnyAsync(u => u.Id == request.UnitId, cancellationToken);
        if (!unitExists)
            return Result<Guid>.Failure("Unité introuvable.");

        var nameExists = await _context.Teams.AnyAsync(t => t.Name == request.Name && t.UnitId == request.UnitId, cancellationToken);
        if (nameExists)
            return Result<Guid>.Failure("Une équipe avec ce nom existe déjà dans cette unité.");

        var entity = new Team
        {
            Name = request.Name,
            UnitId = request.UnitId,
            Description = request.Description,
            Totem = request.Totem,
            Adjective = request.Adjective,
            Color1 = request.Color1,
            Color2 = request.Color2,
            DisplayOrder = request.DisplayOrder
        };

        _context.Teams.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Create", "Team", entity.Id, newValues: new { entity.Name, entity.UnitId }, cancellationToken: cancellationToken);

        return Result<Guid>.Success(entity.Id);
    }
}
