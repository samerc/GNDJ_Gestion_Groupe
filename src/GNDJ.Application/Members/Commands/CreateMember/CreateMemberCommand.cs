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
// Father/Mother are optional: when provided, Père/Mère Guardian records are created and linked so they
// show in the Famille tab. The father's first-initial also disambiguates a duplicate username.
// UnitId is optional: when set, the member is placed in that unit (no team, the unit type's default
// function) so they show on the CU roster immediately — no separate assignment step needed.
public record CreateMemberCommand(
    string FirstName, string LastName, DateOnly? DateOfBirth, string? Gender,
    string? CardNumber, string? ExternalCardNumber, string? BloodType, string? Nationality, string? School,
    string? Classe, string? Section,
    string? MedicalNotes, string? Allergies, string? Notes,
    string? FatherName = null, string? MotherName = null, string? MotherMaidenName = null,
    Guid? UnitId = null
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
        // Classe is optional on manual creation (a walk-in who skipped the demande may not have it yet).
        RuleFor(x => x.Classe).MaximumLength(50);
        RuleFor(x => x.Section).MaximumLength(5).WithMessage("La section ne doit pas dépasser 5 caractères.");
        RuleFor(x => x.MedicalNotes).MaximumLength(2000);
        RuleFor(x => x.Allergies).MaximumLength(2000);
        RuleFor(x => x.Notes).MaximumLength(2000);
        // Optional parent names (create Père/Mère guardians). Length-capped + no HTML like other free text.
        RuleFor(x => x.FatherName).MaximumLength(100)
            .Must(n => n == null || !n.Contains('<') && !n.Contains('>')).WithMessage("Le nom du père contient des caractères invalides.");
        RuleFor(x => x.MotherName).MaximumLength(100)
            .Must(n => n == null || !n.Contains('<') && !n.Contains('>')).WithMessage("Le nom de la mère contient des caractères invalides.");
        RuleFor(x => x.MotherMaidenName).MaximumLength(100)
            .Must(n => n == null || !n.Contains('<') && !n.Contains('>')).WithMessage("Le nom de jeune fille contient des caractères invalides.");
    }
}

public class CreateMemberCommandHandler : IRequestHandler<CreateMemberCommand, Result<CreateMemberResult>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ICurrentUserService _currentUser;

    public CreateMemberCommandHandler(IApplicationDbContext context, IAuditService auditService, IPasswordHasher passwordHasher, ICurrentUserService currentUser)
    {
        _context = context;
        _auditService = auditService;
        _passwordHasher = passwordHasher;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<CreateMemberResult>> Handle(CreateMemberCommand request, CancellationToken cancellationToken)
    {
        // The official SDL/GDL card number must be unique (DB index enforces it too — this returns a
        // friendly 400 instead of a 500 on collision).
        if (!string.IsNullOrWhiteSpace(request.ExternalCardNumber))
        {
            var ext = request.ExternalCardNumber.Trim();
            if (await _context.Members.AnyAsync(m => m.ExternalCardNumber == ext, cancellationToken))
                return Result<CreateMemberResult>.Failure($"Le numéro de carte « {ext} » est déjà attribué à un autre membre.");
        }

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

        var fn = Normalize(request.FirstName);
        var ln = Normalize(request.LastName);
        var email = $"{fn}.{ln}@{domain}";

        // On a duplicate, disambiguate with the father's first initial (e.g. georges.a.khoury). Falls back
        // to a numeric suffix if no father name was given or the initialled variant is also taken.
        if (await _context.Users.AnyAsync(u => u.Email == email, cancellationToken))
        {
            var fatherInitial = Normalize(request.FatherName ?? "").FirstOrDefault(char.IsLetter);
            var mid = fatherInitial != default ? $".{fatherInitial}" : "";
            email = $"{fn}{mid}.{ln}@{domain}";
            var suffix = 2;
            while (await _context.Users.AnyAsync(u => u.Email == email, cancellationToken))
            {
                email = $"{fn}{mid}.{ln}{suffix}@{domain}";
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

        // Optionally create Père/Mère guardians. The father's family name = the member's (so no separate
        // surname field for him); the mother keeps her own maiden name when provided, else the family name.
        var fatherName = request.FatherName?.Trim();
        var motherName = request.MotherName?.Trim();
        var motherMaiden = request.MotherMaidenName?.Trim();
        if (!string.IsNullOrEmpty(fatherName))
        {
            var father = new Guardian { FirstName = fatherName, LastName = member.LastName };
            _context.Guardians.Add(father);
            _context.GuardianLinks.Add(new GuardianLink
            {
                GuardianId = father.Id, MemberId = member.Id, RelationshipType = "Père", IsPrimaryContact = true,
            });
        }
        if (!string.IsNullOrEmpty(motherName))
        {
            var mother = new Guardian
            {
                FirstName = motherName,
                LastName = !string.IsNullOrEmpty(motherMaiden) ? motherMaiden : member.LastName,
            };
            _context.Guardians.Add(mother);
            _context.GuardianLinks.Add(new GuardianLink
            {
                GuardianId = mother.Id, MemberId = member.Id, RelationshipType = "Mère",
                // Mother is the primary contact only when there's no father; always an emergency contact.
                IsPrimaryContact = string.IsNullOrEmpty(fatherName), IsEmergencyContact = true,
            });
        }

        // Optional unit placement: put the member in the chosen unit with NO team and the unit type's default
        // ("base") function, so the CU sees them on their roster right away — even if the CG never runs a passage
        // or assigns a team. This mirrors how a demande→member conversion places accepted members.
        if (request.UnitId is { } unitId)
        {
            var unit = await _context.Units
                .Where(u => u.Id == unitId)
                .Select(u => new { u.Id, u.UnitTypeId })
                .FirstOrDefaultAsync(cancellationToken);
            if (unit is null)
                return Result<CreateMemberResult>.Failure("Unité introuvable.");
            // Unit-scoped: a non-super-admin may only place a member in a unit they have access to (a Chef de
            // Groupe holds all units, so this still allows the CG scenario; a CU is limited to their own units).
            if (!_currentUser.IsSuperAdmin && !_currentUser.AuthorizedUnitIds.Contains(unitId))
                return Result<CreateMemberResult>.Failure("Vous n'avez pas accès à cette unité.");

            // Base role = the unit type's default function, else its lowest-rank non-archived one.
            var baseRoleId = (await _context.FunctionalRoles
                    .Where(r => r.UnitTypeId == unit.UnitTypeId && !r.IsArchived)
                    .Select(r => new { r.Id, r.Rank, r.Name, r.IsDefaultForNewMembers })
                    .ToListAsync(cancellationToken))
                .OrderByDescending(r => r.IsDefaultForNewMembers)
                .ThenBy(r => r.Rank).ThenBy(r => r.Name)
                .Select(r => (Guid?)r.Id)
                .FirstOrDefault();
            if (baseRoleId is null)
                return Result<CreateMemberResult>.Failure("Aucune fonction disponible pour cette unité.");

            _context.MemberAssignments.Add(new MemberAssignment
            {
                MemberId = member.Id,
                UnitId = unitId,
                TeamId = null,
                FunctionalRoleId = baseRoleId.Value,
                StartDate = DateOnly.FromDateTime(DateTime.UtcNow),
                Notes = "Création manuelle",
            });
        }

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
