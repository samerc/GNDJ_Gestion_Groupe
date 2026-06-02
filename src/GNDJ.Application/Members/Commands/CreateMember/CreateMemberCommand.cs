using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.CreateMember;

public record CreateMemberResult(Guid MemberId, string Username, string TemporaryPassword);

public record CreateMemberCommand(
    string FirstName, string LastName, DateOnly? DateOfBirth, string? Gender,
    string? CardNumber, string? BloodType, string? Nationality, string? School,
    string? MedicalNotes, string? Allergies, string? Notes
) : IRequest<Result<CreateMemberResult>>;

public class CreateMemberCommandValidator : AbstractValidator<CreateMemberCommand>
{
    public CreateMemberCommandValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Le prénom est requis.").MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.CardNumber).MaximumLength(20);
        RuleFor(x => x.BloodType).MaximumLength(10);
        RuleFor(x => x.Nationality).MaximumLength(50);
        RuleFor(x => x.School).MaximumLength(100);
    }
}

public class CreateMemberCommandHandler : IRequestHandler<CreateMemberCommand, Result<CreateMemberResult>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;
    private readonly IPasswordHasher _passwordHasher;

    public CreateMemberCommandHandler(IApplicationDbContext context, IAuditService auditService, IPasswordHasher passwordHasher)
    {
        _context = context;
        _auditService = auditService;
        _passwordHasher = passwordHasher;
    }

    public async ValueTask<Result<CreateMemberResult>> Handle(CreateMemberCommand request, CancellationToken cancellationToken)
    {
        // Create member
        var member = new Member
        {
            FirstName = request.FirstName,
            LastName = request.LastName,
            DateOfBirth = request.DateOfBirth,
            Gender = request.Gender,
            CardNumber = request.CardNumber,
            BloodType = request.BloodType,
            Nationality = request.Nationality,
            School = request.School,
            MedicalNotes = request.MedicalNotes,
            Allergies = request.Allergies,
            Notes = request.Notes
        };
        _context.Members.Add(member);

        // Generate username
        var domain = await _context.Settings
            .Where(s => s.Key == "user_domain")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(cancellationToken) ?? "scouts.gndj";

        var baseUsername = $"{Normalize(request.FirstName)}.{Normalize(request.LastName)}";
        var email = $"{baseUsername}@{domain}";

        // Check for duplicates
        if (await _context.Users.AnyAsync(u => u.Email == email, cancellationToken))
        {
            // Try with middle initial placeholder — in practice this would use father's initial
            email = $"{Normalize(request.FirstName)}.x.{Normalize(request.LastName)}@{domain}";
            var suffix = 2;
            while (await _context.Users.AnyAsync(u => u.Email == email, cancellationToken))
            {
                email = $"{Normalize(request.FirstName)}.{Normalize(request.LastName)}{suffix}@{domain}";
                suffix++;
            }
        }

        // Generate temporary password
        var tempPassword = $"Scout{DateTime.UtcNow.Year}!{Random.Shared.Next(100, 999)}";

        var user = new User
        {
            MemberId = member.Id,
            Email = email,
            PasswordHash = _passwordHasher.Hash(tempPassword),
            IsActive = true,
            IsSuperAdmin = false,
        };
        _context.Users.Add(user);

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Create", "Member", member.Id, newValues: new { member.FirstName, member.LastName, Username = email }, cancellationToken: cancellationToken);

        return Result<CreateMemberResult>.Success(new CreateMemberResult(member.Id, email, tempPassword));
    }

    private static string Normalize(string name)
    {
        return name.Trim().ToLower()
            .Replace(' ', '.')
            .Replace('é', 'e').Replace('è', 'e').Replace('ê', 'e').Replace('ë', 'e')
            .Replace('à', 'a').Replace('â', 'a').Replace('ä', 'a')
            .Replace('ù', 'u').Replace('û', 'u').Replace('ü', 'u')
            .Replace('ô', 'o').Replace('ö', 'o')
            .Replace('î', 'i').Replace('ï', 'i')
            .Replace('ç', 'c')
            .Replace("'", "");
    }
}
