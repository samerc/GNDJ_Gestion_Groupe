using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.UnitTypes.Commands.UpdateUnitType;

public record UpdateUnitTypeCommand(Guid Id, string Name, string Code, string? Description, int? NumberOfYears) : IRequest<Result<bool>>;

public class UpdateUnitTypeCommandValidator : AbstractValidator<UpdateUnitTypeCommand>
{
    public UpdateUnitTypeCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50);
        RuleFor(x => x.NumberOfYears).GreaterThan(0).When(x => x.NumberOfYears.HasValue).WithMessage("Le nombre d'années doit être positif.");
    }
}

public class UpdateUnitTypeCommandHandler : IRequestHandler<UpdateUnitTypeCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public UpdateUnitTypeCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(UpdateUnitTypeCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.UnitTypes.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Type d'unité introuvable.");

        var codeExists = await _context.UnitTypes.AnyAsync(ut => ut.Code == request.Code && ut.Id != request.Id, cancellationToken);
        if (codeExists)
            return Result<bool>.Failure("Un type d'unité avec ce code existe déjà.");

        var oldValues = new { entity.Name, entity.Code, entity.Description, entity.NumberOfYears };

        entity.Name = request.Name;
        entity.Code = request.Code;
        entity.Description = request.Description;
        entity.NumberOfYears = request.NumberOfYears;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "UnitType", entity.Id, oldValues: oldValues, newValues: new { entity.Name, entity.Code, entity.Description, entity.NumberOfYears }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
