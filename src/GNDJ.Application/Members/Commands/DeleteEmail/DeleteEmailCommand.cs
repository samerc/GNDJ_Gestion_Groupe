using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Members.Commands.DeleteEmail;

public record DeleteEmailCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteEmailCommandHandler : IRequestHandler<DeleteEmailCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;

    public DeleteEmailCommandHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<Result<bool>> Handle(DeleteEmailCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.MemberEmails.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Courriel introuvable.");
        _context.MemberEmails.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }
}
