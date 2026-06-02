using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;

namespace GNDJ.Application.Members.Commands.AddAddress;

public record AddAddressCommand(Guid MemberId, string Type, string Country, string City, string? Details, bool IsPrimary) : IRequest<Result<Guid>>;

public class AddAddressCommandValidator : AbstractValidator<AddAddressCommand>
{
    public AddAddressCommandValidator()
    {
        RuleFor(x => x.Type).NotEmpty().WithMessage("Le type est requis.");
        RuleFor(x => x.Country).NotEmpty().WithMessage("Le pays est requis.");
        RuleFor(x => x.City).NotEmpty().WithMessage("La ville est requise.");
    }
}

public class AddAddressCommandHandler : IRequestHandler<AddAddressCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;

    public AddAddressCommandHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<Result<Guid>> Handle(AddAddressCommand request, CancellationToken cancellationToken)
    {
        var entity = new MemberAddress
        {
            MemberId = request.MemberId,
            Type = request.Type,
            Country = request.Country,
            City = request.City,
            Details = request.Details,
            IsPrimary = request.IsPrimary
        };
        _context.MemberAddresses.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<Guid>.Success(entity.Id);
    }
}
