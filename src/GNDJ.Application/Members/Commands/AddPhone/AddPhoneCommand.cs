using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.AddPhone;

// Adds a phone to a member. Access (IDOR guard): own profile, super-admin, or active unit leader.
public record AddPhoneCommand(Guid MemberId, string CountryCode, string Number, string Type, bool IsPrimary, bool IsEmergency) : IRequest<Result<Guid>>;

public class AddPhoneCommandValidator : AbstractValidator<AddPhoneCommand>
{
    public AddPhoneCommandValidator()
    {
        RuleFor(x => x.CountryCode).NotEmpty().WithMessage("L'indicatif pays est requis.").MaximumLength(10).NoHtml();
        RuleFor(x => x.Number).NotEmpty().WithMessage("Le numéro est requis.").MaximumLength(30).NoHtml();
        RuleFor(x => x.Type).NotEmpty().WithMessage("Le type est requis.").MaximumLength(50).NoHtml();
    }
}

public class AddPhoneCommandHandler : IRequestHandler<AddPhoneCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public AddPhoneCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<Guid>> Handle(AddPhoneCommand request, CancellationToken cancellationToken)
    {
        // Not own profile and not super-admin → require an ACTIVE assignment in an authorized unit.
        if (!await MemberAccess.CanAccessMemberAsync(_context, _currentUser, request.MemberId, cancellationToken))
            return Result<Guid>.Failure("Accès non autorisé.");

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
