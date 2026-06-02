using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Members.Commands.DeletePhone;

public record DeletePhoneCommand(Guid Id) : IRequest<Result<bool>>;

public class DeletePhoneCommandHandler : IRequestHandler<DeletePhoneCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;

    public DeletePhoneCommandHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<Result<bool>> Handle(DeletePhoneCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.MemberPhones.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Téléphone introuvable.");
        _context.MemberPhones.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }
}
