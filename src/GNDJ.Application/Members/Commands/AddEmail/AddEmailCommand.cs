using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;

namespace GNDJ.Application.Members.Commands.AddEmail;

public record AddEmailCommand(Guid MemberId, string Address, string Type, bool IsPrimary, bool IsEmergency) : IRequest<Result<Guid>>;

public class AddEmailCommandValidator : AbstractValidator<AddEmailCommand>
{
    public AddEmailCommandValidator()
    {
        RuleFor(x => x.Address).NotEmpty().WithMessage("L'adresse courriel est requise.").EmailAddress().WithMessage("L'adresse courriel est invalide.");
        RuleFor(x => x.Type).NotEmpty().WithMessage("Le type est requis.");
    }
}

public class AddEmailCommandHandler : IRequestHandler<AddEmailCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;

    public AddEmailCommandHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<Result<Guid>> Handle(AddEmailCommand request, CancellationToken cancellationToken)
    {
        var entity = new MemberEmail
        {
            MemberId = request.MemberId,
            Address = request.Address,
            Type = request.Type,
            IsPrimary = request.IsPrimary,
            IsEmergency = request.IsEmergency
        };
        _context.MemberEmails.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<Guid>.Success(entity.Id);
    }
}
