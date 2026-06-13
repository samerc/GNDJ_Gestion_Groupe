using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Roles.Commands;

// Create
public record CreateFunctionalRoleCommand(string Name, string Code, string? Description, Guid SecurityProfileId, Guid? UnitTypeId, int Rank = 0) : IRequest<Result<Guid>>;

public class CreateFunctionalRoleCommandValidator : AbstractValidator<CreateFunctionalRoleCommand>
{
    public CreateFunctionalRoleCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50);
        RuleFor(x => x.SecurityProfileId).NotEmpty().WithMessage("Le profil de sécurité est requis.");
    }
}

public class CreateFunctionalRoleCommandHandler : IRequestHandler<CreateFunctionalRoleCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public CreateFunctionalRoleCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<Guid>> Handle(CreateFunctionalRoleCommand request, CancellationToken cancellationToken)
    {
        var codeExists = await _context.FunctionalRoles.AnyAsync(r => r.Code == request.Code, cancellationToken);
        if (codeExists)
            return Result<Guid>.Failure("Une fonction avec ce code existe déjà.");

        var entity = new FunctionalRole
        {
            Name = request.Name,
            Code = request.Code,
            Description = request.Description,
            SecurityProfileId = request.SecurityProfileId,
            UnitTypeId = request.UnitTypeId,
            Rank = request.Rank
        };

        _context.FunctionalRoles.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Create", "FunctionalRole", entity.Id, newValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<Guid>.Success(entity.Id);
    }
}

// Update
public record UpdateFunctionalRoleCommand(Guid Id, string Name, string Code, string? Description, Guid SecurityProfileId, Guid? UnitTypeId, int Rank = 0) : IRequest<Result<bool>>;

public class UpdateFunctionalRoleCommandValidator : AbstractValidator<UpdateFunctionalRoleCommand>
{
    public UpdateFunctionalRoleCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50);
        RuleFor(x => x.SecurityProfileId).NotEmpty().WithMessage("Le profil de sécurité est requis.");
    }
}

public class UpdateFunctionalRoleCommandHandler : IRequestHandler<UpdateFunctionalRoleCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public UpdateFunctionalRoleCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(UpdateFunctionalRoleCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.FunctionalRoles.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Fonction introuvable.");

        var codeExists = await _context.FunctionalRoles.AnyAsync(r => r.Code == request.Code && r.Id != request.Id, cancellationToken);
        if (codeExists)
            return Result<bool>.Failure("Une fonction avec ce code existe déjà.");

        var oldValues = new { entity.Name, entity.Code };
        entity.Name = request.Name;
        entity.Code = request.Code;
        entity.Description = request.Description;
        entity.SecurityProfileId = request.SecurityProfileId;
        entity.UnitTypeId = request.UnitTypeId;
        entity.Rank = request.Rank;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "FunctionalRole", entity.Id, oldValues: oldValues, newValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}

// Delete
public record DeleteFunctionalRoleCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteFunctionalRoleCommandHandler : IRequestHandler<DeleteFunctionalRoleCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public DeleteFunctionalRoleCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(DeleteFunctionalRoleCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.FunctionalRoles
            .Include(r => r.Assignments.Where(a => a.EndDate == null))
            .FirstOrDefaultAsync(r => r.Id == request.Id, cancellationToken);

        if (entity is null)
            return Result<bool>.Failure("Fonction introuvable.");

        if (entity.Assignments.Any())
            return Result<bool>.Failure("Impossible de supprimer une fonction utilisée par des membres actifs.");

        _context.FunctionalRoles.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Delete", "FunctionalRole", entity.Id, oldValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
