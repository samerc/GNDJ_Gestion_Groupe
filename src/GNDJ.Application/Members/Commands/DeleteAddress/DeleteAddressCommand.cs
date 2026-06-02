using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Members.Commands.DeleteAddress;

public record DeleteAddressCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteAddressCommandHandler : IRequestHandler<DeleteAddressCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;

    public DeleteAddressCommandHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<Result<bool>> Handle(DeleteAddressCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.MemberAddresses.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Adresse introuvable.");
        _context.MemberAddresses.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }
}
