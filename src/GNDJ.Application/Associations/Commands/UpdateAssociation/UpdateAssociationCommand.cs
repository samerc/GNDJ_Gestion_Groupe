using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Associations.Commands.UpdateAssociation;

// Update an association. Code stays unique across other associations (checked in the handler).
public record UpdateAssociationCommand(Guid Id, string Name, string Code, string? Description) : IRequest<Result<bool>>;

public class UpdateAssociationCommandValidator : AbstractValidator<UpdateAssociationCommand>
{
    public UpdateAssociationCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(200).NoHtml();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
    }
}

public class UpdateAssociationCommandHandler : IRequestHandler<UpdateAssociationCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public UpdateAssociationCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(UpdateAssociationCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.Associations.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Association introuvable.");

        var codeExists = await _context.Associations.AnyAsync(a => a.Code == request.Code && a.Id != request.Id, cancellationToken);
        if (codeExists)
            return Result<bool>.Failure("Une association avec ce code existe déjà.");

        var oldValues = new { entity.Name, entity.Code, entity.Description };

        entity.Name = request.Name;
        entity.Code = request.Code;
        entity.Description = request.Description;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "Association", entity.Id, oldValues: oldValues, newValues: new { entity.Name, entity.Code, entity.Description }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
