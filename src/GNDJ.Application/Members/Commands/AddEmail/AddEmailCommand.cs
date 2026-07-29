using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.AddEmail;

// Adds an email to a member. Access (IDOR guard): own profile / super-admin / active unit leader.
public record AddEmailCommand(Guid MemberId, string Address, string Type, bool IsPrimary, bool IsEmergency) : IRequest<Result<Guid>>;

public class AddEmailCommandValidator : AbstractValidator<AddEmailCommand>
{
    public AddEmailCommandValidator()
    {
        RuleFor(x => x.Address).NotEmpty().WithMessage("L'adresse courriel est requise.").EmailAddress().WithMessage("L'adresse courriel est invalide.").MaximumLength(254);
        RuleFor(x => x.Type).NotEmpty().WithMessage("Le type est requis.").MaximumLength(50).NoHtml();
    }
}

public class AddEmailCommandHandler : IRequestHandler<AddEmailCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public AddEmailCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<Guid>> Handle(AddEmailCommand request, CancellationToken cancellationToken)
    {
        if (!await MemberAccess.CanAccessMemberAsync(_context, _currentUser, request.MemberId, cancellationToken))
            return Result<Guid>.Failure("Accès non autorisé.");

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
