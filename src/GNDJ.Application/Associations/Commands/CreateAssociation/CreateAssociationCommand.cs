using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Associations.Commands.CreateAssociation;

// Create an association. Code must be unique (checked in the handler).
public record CreateAssociationCommand(string Name, string Code, string? Description) : IRequest<Result<Guid>>;

public class CreateAssociationCommandValidator : AbstractValidator<CreateAssociationCommand>
{
    public CreateAssociationCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(200).NoHtml();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
    }
}

public class CreateAssociationCommandHandler : IRequestHandler<CreateAssociationCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public CreateAssociationCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<Guid>> Handle(CreateAssociationCommand request, CancellationToken cancellationToken)
    {
        var codeExists = await _context.Associations.AnyAsync(a => a.Code == request.Code, cancellationToken);
        if (codeExists)
            return Result<Guid>.Failure("Une association avec ce code existe déjà.");

        var entity = new Association
        {
            Name = request.Name,
            Code = request.Code,
            Description = request.Description
        };

        _context.Associations.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Create", "Association", entity.Id, newValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<Guid>.Success(entity.Id);
    }
}
