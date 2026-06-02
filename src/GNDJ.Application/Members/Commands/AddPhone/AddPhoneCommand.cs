using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;

namespace GNDJ.Application.Members.Commands.AddPhone;

public record AddPhoneCommand(Guid MemberId, string CountryCode, string Number, string Type, bool IsPrimary, bool IsEmergency) : IRequest<Result<Guid>>;

public class AddPhoneCommandValidator : AbstractValidator<AddPhoneCommand>
{
    public AddPhoneCommandValidator()
    {
        RuleFor(x => x.CountryCode).NotEmpty().WithMessage("L'indicatif pays est requis.");
        RuleFor(x => x.Number).NotEmpty().WithMessage("Le numéro est requis.").MaximumLength(30);
        RuleFor(x => x.Type).NotEmpty().WithMessage("Le type est requis.");
    }
}

public class AddPhoneCommandHandler : IRequestHandler<AddPhoneCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;

    public AddPhoneCommandHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<Result<Guid>> Handle(AddPhoneCommand request, CancellationToken cancellationToken)
    {
        var entity = new MemberPhone
        {
            MemberId = request.MemberId,
            CountryCode = request.CountryCode,
            Number = request.Number,
            Type = request.Type,
            IsPrimary = request.IsPrimary,
            IsEmergency = request.IsEmergency
        };
        _context.MemberPhones.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<Guid>.Success(entity.Id);
    }
}
