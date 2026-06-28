using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.CreateMember;

// Returned to the caller so the credentials dialog can show the auto-created login once.
public record CreateMemberResult(Guid MemberId, string Username, string TemporaryPassword);

// Creates a member AND auto-provisions a User login for them (username derived from the name,
// temporary password). CardNumber is ignored on input — the matricule is auto-generated below.
public record CreateMemberCommand(
    string FirstName, string LastName, DateOnly? DateOfBirth, string? Gender,
    string? CardNumber, string? ExternalCardNumber, string? BloodType, string? Nationality, string? School,
    string? Classe, string? Section,
    string? MedicalNotes, string? Allergies, string? Notes
) : IRequest<Result<CreateMemberResult>>;

public class CreateMemberCommandValidator : AbstractValidator<CreateMemberCommand>
{
    private static readonly string[] AllowedGenders = ["Masculin", "Féminin"];

    public CreateMemberCommandValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Le prénom est requis.")
            .MaximumLength(100).WithMessage("Le prénom ne doit pas dépasser 100 caractères.")
            .Must(n => n == null || !n.Contains('<') && !n.Contains('>')).WithMessage("Le prénom contient des caractères invalides.");
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Le nom est requis.")
            .MaximumLength(100).WithMessage("Le nom ne doit pas dépasser 100 caractères.")
            .Must(n => n == null || !n.Contains('<') && !n.Contains('>')).WithMessage("Le nom contient des caractères invalides.");
        RuleFor(x => x.DateOfBirth).NotEmpty().WithMessage("La date de naissance est requise.")
            .LessThanOrEqualTo(DateOnly.FromDateTime(DateTime.UtcNow))
            .When(x => x.DateOfBirth.HasValue)
            .WithMessage("La date de naissance ne peut pas être dans le futur.");
        RuleFor(x => x.Gender).NotEmpty().WithMessage("Le genre est requis.")
            .Must(g => AllowedGenders.Contains(g))
            .When(x => !string.IsNullOrEmpty(x.Gender))
            .WithMessage("Le genre doit être 'Masculin' ou 'Féminin'.");
        RuleFor(x => x.CardNumber).MaximumLength(20);
        RuleFor(x => x.ExternalCardNumber).MaximumLength(50)
            .Must(n => n == null || !n.Contains('<') && !n.Contains('>')).WithMessage("Le numéro de carte contient des caractères invalides.");
        RuleFor(x => x.BloodType).MaximumLength(10);
        RuleFor(x => x.Nationality).NotEmpty().WithMessage("La nationalité est requise.").MaximumLength(50);
        RuleFor(x => x.School).NotEmpty().WithMessage("L'école est requise.").MaximumLength(100);
        RuleFor(x => x.Classe).NotEmpty().WithMessage("La classe est requise.").MaximumLength(50);
        RuleFor(x => x.Section).MaximumLength(5).WithMessage("La section ne doit pas dépasser 5 caractères.");
        RuleFor(x => x.MedicalNotes).MaximumLength(2000);
        RuleFor(x => x.Allergies).MaximumLength(2000);
        RuleFor(x => x.Notes).MaximumLength(2000);
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
        // Auto-generate internal matricule: M-0001 for boys, F-0001 for girls. IgnoreQueryFilters so
        // soft-deleted members still reserve their number (no reuse → no collisions on the next insert).
        var prefix = request.Gender == "Féminin" ? "F" : "M";
        var lastCard = await _context.Members
            .IgnoreQueryFilters()
            .Where(m => m.CardNumber != null && m.CardNumber.StartsWith(prefix + "-"))
            .OrderByDescending(m => m.CardNumber)
            .Select(m => m.CardNumber)
            .FirstOrDefaultAsync(cancellationToken);

        int nextNum = 1;
        if (lastCard is not null)
        {
            var parts = lastCard.Split('-');
            if (parts.Length == 2 && int.TryParse(parts[1], out var last))
                nextNum = last + 1;
        }
        var cardNumber = $"{prefix}-{nextNum:D4}";

        // Create member
        var member = new Member
        {
            FirstName = request.FirstName,
            LastName = request.LastName,
            DateOfBirth = request.DateOfBirth,
            Gender = request.Gender,
            CardNumber = cardNumber,
            ExternalCardNumber = string.IsNullOrWhiteSpace(request.ExternalCardNumber) ? null : request.ExternalCardNumber.Trim(),
            BloodType = request.BloodType,
            Nationality = request.Nationality,
            School = request.School,
            Classe = request.Classe,
            Section = request.Section,
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
