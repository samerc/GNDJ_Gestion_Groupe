using System.Text.Json;
using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Applicants;

// ============================================================
// DTOs
// ============================================================
public record ApplicantAuthDto(Guid AccountId, string Email, bool EmailVerified, string AccessToken, string RefreshToken, DateTime ExpiresAt);

public record ApplicantConfigDto(bool IsOpen, string ScoutYear, int MaxPerAccount, int NotesMaxLength, bool RequireEmailVerification, string? IntroText,
    IReadOnlyList<string> Schools, IReadOnlyList<string> Classes, IReadOnlyList<string> Cities, IReadOnlyList<string> Units, int MaxScoutRelations,
    IReadOnlyList<string> ProfessionDomains);

public record ApplicantGuardianDto(Guid? Id, string Relationship, string FirstName, string LastName, string? Profession, string? ProfessionDomain,
    string? PhoneCountryCode, string? PhoneNumber, string? Email, bool IsDeceased, bool IsPrimaryContact, bool IsEmergencyContact);

public record ApplicantScoutRelationDto(Guid? Id, string Status, string? Relationship, Guid? RelatedMemberId,
    string? FirstName, string? LastName, string? LastUnit, string? LastFunction, string? OtherGroupName);

public record DemandeDto(Guid Id, string ScoutYear, string FirstName, string LastName, DateOnly? DateOfBirth, string? Gender,
    string? Nationality, string? School, string? Classe, string? Section, string? BloodType, string? MedicalNotes, string? Allergies,
    string? PhoneCountryCode, string? PhoneNumber, string? Email, string? ParentNotes,
    string Status, string? DecisionNotes, DateTime? SubmittedAt, DateTime? ResponseSentAt);

public record ApplicantProfileDto(Guid AccountId, string Email, bool EmailVerified, string? ContactName,
    string? AddressCountry, string? AddressCity, string? AddressDetails,
    IReadOnlyList<ApplicantGuardianDto> Guardians, IReadOnlyList<ApplicantScoutRelationDto> ScoutRelations,
    IReadOnlyList<DemandeDto> Demandes);

// Shared child-field payload for create/update
public record DemandeInput(
    string FirstName, string LastName, DateOnly? DateOfBirth, string? Gender,
    string? Nationality, string? School, string? Classe, string? Section,
    string? BloodType, string? MedicalNotes, string? Allergies,
    string? PhoneCountryCode, string? PhoneNumber, string? Email, string? ParentNotes);

// ============================================================
// Shared helpers
// ============================================================
static class ApplicantHelpers
{
    public static async Task<string?> Setting(IApplicationDbContext ctx, string key, CancellationToken ct) =>
        await ctx.Settings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync(ct);

    // Queues the verification email (sent in the background — never blocks/fails registration).
    public static async Task SendVerificationEmail(IApplicationDbContext ctx, IEmailQueue queue, ApplicantAccount account, CancellationToken ct)
    {
        var baseUrl = (await Setting(ctx, "app.base_url", ct) ?? "http://localhost:5173").TrimEnd('/');
        var link = $"{baseUrl}/inscription/verify?token={account.EmailVerificationToken}";
        queue.Enqueue(new EmailJob("demande_email_verification", account.Email, new Dictionary<string, string>
        {
            ["contactName"] = account.ContactName ?? "",
            ["verifyLink"] = link,
            ["expiryDays"] = "7",
        }));
    }

    static readonly string[] ConfigKeys =
    [
        "demande.enabled", "demande.scout_year", "passage.scout_year", "demande.max_per_account",
        "demande.notes_max_length", "demande.require_email_verification", "demande.intro_text",
        "demande.max_scout_relations", "member.schools", "member.classes", "member.cities", "member.profession_domains"
    ];

    // Absolute safety cap enforced by SaveApplicantHouseholdCommandValidator regardless of the configurable
    // business limit (demande.max_scout_relations, default 3, exposed to the wizard via the config endpoint).
    public const int MaxScoutRelationsHardCap = 50;

    public static async Task<ApplicantConfigDto> BuildConfig(IApplicationDbContext ctx, CancellationToken ct)
    {
        // Single query for all settings this endpoint needs (hit on every public page load).
        var map = await ctx.Settings.Where(s => ConfigKeys.Contains(s.Key))
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        string? Get(string k) => map.TryGetValue(k, out var v) ? v : null;

        var enabled = Get("demande.enabled") == "true";
        var year = Get("demande.scout_year") ?? Get("passage.scout_year") ?? "2026-2027";
        var max = int.TryParse(Get("demande.max_per_account"), out var m) && m > 0 ? m : 3;
        var notesLen = int.TryParse(Get("demande.notes_max_length"), out var n) ? n : 500;
        var maxRelations = int.TryParse(Get("demande.max_scout_relations"), out var mr) && mr > 0 ? Math.Min(mr, MaxScoutRelationsHardCap) : 3;
        var requireVerify = Get("demande.require_email_verification") != "false";
        var intro = Get("demande.intro_text");

        static IReadOnlyList<string> ParseJsonArray(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return [];
            try { return JsonSerializer.Deserialize<string[]>(raw) ?? []; } catch { return []; }
        }

        var schools = ParseJsonArray(Get("member.schools"));
        var classes = ParseJsonArray(Get("member.classes"));
        var cities = ParseJsonArray(Get("member.cities"));
        var professionDomains = ParseJsonArray(Get("member.profession_domains"));

        // Active units of the group — public (the public website already lists them). Helps applicants
        // indicate which unit a current-member relative belongs to, easing family matching for the CG.
        var units = await ctx.Units.Where(u => u.IsActive).OrderBy(u => u.Name).Select(u => u.Name).ToListAsync(ct);

        return new ApplicantConfigDto(enabled, year, max, notesLen, requireVerify, intro, schools, classes, cities, units, maxRelations, professionDomains);
    }

    public static DemandeDto ToDto(Demande d) => new(
        d.Id, d.ScoutYear, d.FirstName, d.LastName, d.DateOfBirth, d.Gender, d.Nationality, d.School, d.Classe, d.Section,
        d.BloodType, d.MedicalNotes, d.Allergies, d.PhoneCountryCode, d.PhoneNumber, d.Email, d.ParentNotes,
        d.Status, d.DecisionNotes, d.SubmittedAt, d.ResponseSentAt);

    public static void Apply(Demande d, DemandeInput i)
    {
        d.FirstName = i.FirstName.Trim();
        d.LastName = i.LastName.Trim();
        d.DateOfBirth = i.DateOfBirth;
        d.Gender = i.Gender;
        d.Nationality = i.Nationality;
        d.School = i.School;
        d.Classe = i.Classe;
        d.Section = i.Section;
        d.BloodType = i.BloodType;
        d.MedicalNotes = i.MedicalNotes;
        d.Allergies = i.Allergies;
        d.PhoneCountryCode = i.PhoneCountryCode;
        d.PhoneNumber = i.PhoneNumber;
        d.Email = i.Email;
        d.ParentNotes = i.ParentNotes;
    }
}

// ============================================================
// Auth
// ============================================================
public record RegisterApplicantCommand(string Email, string Password, string? ContactName) : IRequest<Result<ApplicantAuthDto>>;

public class RegisterApplicantCommandValidator : AbstractValidator<RegisterApplicantCommand>
{
    public RegisterApplicantCommandValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().WithMessage("Adresse email invalide.").MaximumLength(254);
        RuleFor(x => x.Password).StrongPassword();
        RuleFor(x => x.ContactName).MaximumLength(200).NoHtml();
    }
}

public class RegisterApplicantCommandHandler(IApplicationDbContext context, IPasswordHasher hasher, ITokenService tokens, IEmailQueue emailQueue) : IRequestHandler<RegisterApplicantCommand, Result<ApplicantAuthDto>>
{
    public async ValueTask<Result<ApplicantAuthDto>> Handle(RegisterApplicantCommand request, CancellationToken ct)
    {
        var addr = request.Email.Trim().ToLowerInvariant();
        var exists = await context.ApplicantAccounts.AnyAsync(a => a.Email == addr, ct);
        if (exists)
            return Result<ApplicantAuthDto>.Failure("Un compte existe déjà avec cette adresse email.");

        var account = new ApplicantAccount
        {
            Email = addr,
            PasswordHash = hasher.Hash(request.Password),
            ContactName = string.IsNullOrWhiteSpace(request.ContactName) ? null : request.ContactName.Trim(),
            EmailVerified = false,
            EmailVerificationToken = Guid.NewGuid().ToString("N"),
            EmailVerificationTokenExpiry = DateTime.UtcNow.AddDays(7),
        };

        var refresh = tokens.GenerateRefreshToken();
        account.RefreshToken = hasher.HashToken(refresh);
        account.RefreshTokenExpiry = tokens.GetRefreshTokenExpiry();

        context.ApplicantAccounts.Add(account);
        await context.SaveChangesAsync(ct);

        await ApplicantHelpers.SendVerificationEmail(context, emailQueue, account, ct);

        var access = tokens.GenerateApplicantToken(account);
        return Result<ApplicantAuthDto>.Success(new ApplicantAuthDto(account.Id, account.Email, account.EmailVerified, access, refresh, DateTime.UtcNow.AddMinutes(15)));
    }
}

// Resend the verification email for the current applicant account.
public record ResendVerificationCommand() : IRequest<Result<bool>>;

public class ResendVerificationCommandHandler(IApplicationDbContext context, ICurrentApplicantService current, IEmailQueue emailQueue) : IRequestHandler<ResendVerificationCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ResendVerificationCommand request, CancellationToken ct)
    {
        var id = current.ApplicantAccountId;
        if (id is null) return Result<bool>.Failure("Non autorisé.");
        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (account is null) return Result<bool>.Failure("Compte introuvable.");
        if (account.EmailVerified) return Result<bool>.Success(true);

        account.EmailVerificationToken = Guid.NewGuid().ToString("N");
        account.EmailVerificationTokenExpiry = DateTime.UtcNow.AddDays(7);
        await context.SaveChangesAsync(ct);
        await ApplicantHelpers.SendVerificationEmail(context, emailQueue, account, ct);
        return Result<bool>.Success(true);
    }
}

public record VerifyApplicantEmailCommand(string Token) : IRequest<Result<bool>>;

public class VerifyApplicantEmailCommandValidator : AbstractValidator<VerifyApplicantEmailCommand>
{
    public VerifyApplicantEmailCommandValidator()
        => RuleFor(x => x.Token).NotEmpty().WithMessage("Jeton requis.").MaximumLength(200);
}

public class VerifyApplicantEmailCommandHandler(IApplicationDbContext context) : IRequestHandler<VerifyApplicantEmailCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(VerifyApplicantEmailCommand request, CancellationToken ct)
    {
        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.EmailVerificationToken == request.Token, ct);
        if (account is null || account.EmailVerificationTokenExpiry < DateTime.UtcNow)
            return Result<bool>.Failure("Lien de vérification invalide ou expiré.");

        account.EmailVerified = true;
        account.EmailVerificationToken = null;
        account.EmailVerificationTokenExpiry = null;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record LoginApplicantCommand(string Email, string Password) : IRequest<Result<ApplicantAuthDto>>;

public class LoginApplicantCommandValidator : AbstractValidator<LoginApplicantCommand>
{
    public LoginApplicantCommandValidator()
    {
        RuleFor(x => x.Email).NotEmpty().WithMessage("L'adresse email est requise.")
            .EmailAddress().WithMessage("Adresse email invalide.").MaximumLength(254);
        RuleFor(x => x.Password).NotEmpty().WithMessage("Le mot de passe est requis.").MaximumLength(128);
    }
}

public class LoginApplicantCommandHandler(IApplicationDbContext context, IPasswordHasher hasher, ITokenService tokens) : IRequestHandler<LoginApplicantCommand, Result<ApplicantAuthDto>>
{
    public async ValueTask<Result<ApplicantAuthDto>> Handle(LoginApplicantCommand request, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Email == email, ct);
        if (account is null || !account.IsActive || !hasher.Verify(request.Password, account.PasswordHash))
            return Result<ApplicantAuthDto>.Failure("Email ou mot de passe incorrect.");

        var refresh = tokens.GenerateRefreshToken();
        account.RefreshToken = hasher.HashToken(refresh);
        account.RefreshTokenExpiry = tokens.GetRefreshTokenExpiry();
        await context.SaveChangesAsync(ct);

        var access = tokens.GenerateApplicantToken(account);
        return Result<ApplicantAuthDto>.Success(new ApplicantAuthDto(account.Id, account.Email, account.EmailVerified, access, refresh, DateTime.UtcNow.AddMinutes(15)));
    }
}

public record RefreshApplicantTokenCommand(string RefreshToken) : IRequest<Result<ApplicantAuthDto>>;

public class RefreshApplicantTokenCommandValidator : AbstractValidator<RefreshApplicantTokenCommand>
{
    public RefreshApplicantTokenCommandValidator()
        => RuleFor(x => x.RefreshToken).NotEmpty().WithMessage("Jeton requis.").MaximumLength(500);
}

public class RefreshApplicantTokenCommandHandler(IApplicationDbContext context, IPasswordHasher hasher, ITokenService tokens) : IRequestHandler<RefreshApplicantTokenCommand, Result<ApplicantAuthDto>>
{
    public async ValueTask<Result<ApplicantAuthDto>> Handle(RefreshApplicantTokenCommand request, CancellationToken ct)
    {
        var hash = hasher.HashToken(request.RefreshToken);
        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.RefreshToken == hash, ct);
        if (account is null || account.RefreshTokenExpiry < DateTime.UtcNow || !account.IsActive)
            return Result<ApplicantAuthDto>.Failure("Session expirée. Veuillez vous reconnecter.");

        var refresh = tokens.GenerateRefreshToken();
        account.RefreshToken = hasher.HashToken(refresh);
        account.RefreshTokenExpiry = tokens.GetRefreshTokenExpiry();
        await context.SaveChangesAsync(ct);

        var access = tokens.GenerateApplicantToken(account);
        return Result<ApplicantAuthDto>.Success(new ApplicantAuthDto(account.Id, account.Email, account.EmailVerified, access, refresh, DateTime.UtcNow.AddMinutes(15)));
    }
}

// ============================================================
// Config (anonymous)
// ============================================================
public record GetApplicantConfigQuery() : IRequest<Result<ApplicantConfigDto>>;

public class GetApplicantConfigQueryHandler(IApplicationDbContext context) : IRequestHandler<GetApplicantConfigQuery, Result<ApplicantConfigDto>>
{
    public async ValueTask<Result<ApplicantConfigDto>> Handle(GetApplicantConfigQuery request, CancellationToken ct)
        => Result<ApplicantConfigDto>.Success(await ApplicantHelpers.BuildConfig(context, ct));
}

// ============================================================
// Profile (account + shared data + demandes)
// ============================================================
public record GetApplicantProfileQuery() : IRequest<Result<ApplicantProfileDto>>;

public class GetApplicantProfileQueryHandler(IApplicationDbContext context, ICurrentApplicantService current) : IRequestHandler<GetApplicantProfileQuery, Result<ApplicantProfileDto>>
{
    public async ValueTask<Result<ApplicantProfileDto>> Handle(GetApplicantProfileQuery request, CancellationToken ct)
    {
        var id = current.ApplicantAccountId;
        if (id is null) return Result<ApplicantProfileDto>.Failure("Non autorisé.");

        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (account is null) return Result<ApplicantProfileDto>.Failure("Compte introuvable.");

        var guardians = await context.ApplicantGuardians.Where(g => g.ApplicantAccountId == id)
            .Select(g => new ApplicantGuardianDto(g.Id, g.Relationship, g.FirstName, g.LastName, g.Profession, g.ProfessionDomain,
                g.PhoneCountryCode, g.PhoneNumber, g.Email, g.IsDeceased, g.IsPrimaryContact, g.IsEmergencyContact))
            .ToListAsync(ct);

        var relations = await context.ApplicantScoutRelations.Where(r => r.ApplicantAccountId == id)
            .Select(r => new ApplicantScoutRelationDto(r.Id, r.Status, r.Relationship, r.RelatedMemberId,
                r.FirstName, r.LastName, r.LastUnit, r.LastFunction, r.OtherGroupName))
            .ToListAsync(ct);

        var demandes = await context.Demandes.Where(d => d.ApplicantAccountId == id)
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => ApplicantHelpers.ToDto(d))
            .ToListAsync(ct);

        return Result<ApplicantProfileDto>.Success(new ApplicantProfileDto(
            account.Id, account.Email, account.EmailVerified, account.ContactName,
            account.AddressCountry, account.AddressCity, account.AddressDetails,
            guardians, relations, demandes));
    }
}

// ============================================================
// Save shared household data (address + guardians + scout relations)
// ============================================================
public record SaveApplicantHouseholdCommand(
    string? ContactName, string? AddressCountry, string? AddressCity, string? AddressDetails,
    List<ApplicantGuardianDto> Guardians, List<ApplicantScoutRelationDto> ScoutRelations) : IRequest<Result<bool>>;

public class SaveApplicantHouseholdCommandHandler(IApplicationDbContext context, ICurrentApplicantService current) : IRequestHandler<SaveApplicantHouseholdCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SaveApplicantHouseholdCommand request, CancellationToken ct)
    {
        var id = current.ApplicantAccountId;
        if (id is null) return Result<bool>.Failure("Non autorisé.");

        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (account is null) return Result<bool>.Failure("Compte introuvable.");

        // Enforce the configurable business cap on scout relations (demande.max_scout_relations, default 3).
        var maxRelations = int.TryParse(await ApplicantHelpers.Setting(context, "demande.max_scout_relations", ct), out var mr) && mr > 0
            ? Math.Min(mr, ApplicantHelpers.MaxScoutRelationsHardCap) : 3;
        var relationCount = request.ScoutRelations.Count(r => !string.IsNullOrWhiteSpace(r.FirstName) || !string.IsNullOrWhiteSpace(r.LastName) || r.RelatedMemberId.HasValue);
        if (relationCount > maxRelations)
            return Result<bool>.Failure($"Vous pouvez ajouter au maximum {maxRelations} proches scouts.");

        account.ContactName = string.IsNullOrWhiteSpace(request.ContactName) ? account.ContactName : request.ContactName.Trim();
        account.AddressCountry = request.AddressCountry;
        account.AddressCity = request.AddressCity;
        account.AddressDetails = request.AddressDetails;

        // Replace guardians + relations (small shared sets)
        var existingGuardians = await context.ApplicantGuardians.Where(g => g.ApplicantAccountId == id).ToListAsync(ct);
        context.ApplicantGuardians.RemoveRange(existingGuardians);
        foreach (var g in request.Guardians.Where(g => !string.IsNullOrWhiteSpace(g.FirstName) || !string.IsNullOrWhiteSpace(g.LastName)))
        {
            context.ApplicantGuardians.Add(new ApplicantGuardian
            {
                ApplicantAccountId = id.Value,
                Relationship = g.Relationship,
                FirstName = g.FirstName.Trim(),
                LastName = g.LastName.Trim(),
                Profession = g.Profession,
                ProfessionDomain = g.ProfessionDomain,
                PhoneCountryCode = g.PhoneCountryCode,
                PhoneNumber = g.PhoneNumber,
                Email = g.Email,
                IsDeceased = g.IsDeceased,
                IsPrimaryContact = g.IsPrimaryContact,
                IsEmergencyContact = g.IsEmergencyContact,
            });
        }

        var existingRelations = await context.ApplicantScoutRelations.Where(r => r.ApplicantAccountId == id).ToListAsync(ct);
        context.ApplicantScoutRelations.RemoveRange(existingRelations);
        foreach (var r in request.ScoutRelations.Where(r => !string.IsNullOrWhiteSpace(r.FirstName) || !string.IsNullOrWhiteSpace(r.LastName) || r.RelatedMemberId.HasValue))
        {
            context.ApplicantScoutRelations.Add(new ApplicantScoutRelation
            {
                ApplicantAccountId = id.Value,
                Status = r.Status,
                Relationship = r.Relationship,
                RelatedMemberId = r.RelatedMemberId,
                FirstName = r.FirstName,
                LastName = r.LastName,
                LastUnit = r.LastUnit,
                LastFunction = r.LastFunction,
                OtherGroupName = r.OtherGroupName,
            });
        }

        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ============================================================
// Demande create / update / submit / delete
// ============================================================
public class DemandeInputValidator : AbstractValidator<DemandeInput>
{
    static bool NoHtml(string? s) => string.IsNullOrEmpty(s) || (!s.Contains('<') && !s.Contains('>'));
    public DemandeInputValidator()
    {
        RuleFor(x => x.FirstName).MaximumLength(100).Must(NoHtml).WithMessage("Caractères non autorisés.");
        RuleFor(x => x.LastName).MaximumLength(100).Must(NoHtml).WithMessage("Caractères non autorisés.");
        RuleFor(x => x.Nationality).MaximumLength(100).Must(NoHtml);
        RuleFor(x => x.School).MaximumLength(200).Must(NoHtml);
        RuleFor(x => x.Classe).MaximumLength(50).Must(NoHtml);
        RuleFor(x => x.Section).MaximumLength(20);
        RuleFor(x => x.BloodType).MaximumLength(10);
        RuleFor(x => x.PhoneNumber).MaximumLength(30);
        RuleFor(x => x.Email).MaximumLength(254).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email)).WithMessage("Adresse email invalide.");
        RuleFor(x => x.MedicalNotes).MaximumLength(2000);
        RuleFor(x => x.Allergies).MaximumLength(2000);
        RuleFor(x => x.ParentNotes).MaximumLength(2000);
        RuleFor(x => x.DateOfBirth).Must(d => d == null || d.Value <= DateOnly.FromDateTime(DateTime.UtcNow))
            .WithMessage("La date de naissance ne peut pas être dans le futur.");
        RuleFor(x => x.Gender).Must(g => string.IsNullOrEmpty(g) || g == "Masculin" || g == "Féminin")
            .WithMessage("Genre invalide.");
    }
}

public class CreateDemandeCommandValidator : AbstractValidator<CreateDemandeCommand>
{
    public CreateDemandeCommandValidator() => RuleFor(x => x.Data).NotNull().SetValidator(new DemandeInputValidator());
}

public class UpdateDemandeCommandValidator : AbstractValidator<UpdateDemandeCommand>
{
    public UpdateDemandeCommandValidator() => RuleFor(x => x.Data).NotNull().SetValidator(new DemandeInputValidator());
}

public class SaveApplicantHouseholdCommandValidator : AbstractValidator<SaveApplicantHouseholdCommand>
{
    static bool NoHtml(string? s) => string.IsNullOrEmpty(s) || (!s.Contains('<') && !s.Contains('>'));
    public SaveApplicantHouseholdCommandValidator()
    {
        RuleFor(x => x.Guardians).NotNull().Must(l => l.Count <= 20).WithMessage("Trop de responsables.");
        RuleFor(x => x.ScoutRelations).NotNull().Must(l => l.Count <= 50).WithMessage("Trop de proches.");
        RuleForEach(x => x.Guardians).ChildRules(g =>
        {
            g.RuleFor(x => x.FirstName).MaximumLength(100).Must(NoHtml).WithMessage("Caractères non autorisés.");
            g.RuleFor(x => x.LastName).MaximumLength(100).Must(NoHtml).WithMessage("Caractères non autorisés.");
            g.RuleFor(x => x.Email).MaximumLength(254).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email)).WithMessage("Adresse email invalide.");
            g.RuleFor(x => x.PhoneCountryCode).MaximumLength(10);
            g.RuleFor(x => x.PhoneNumber).MaximumLength(30);
            g.RuleFor(x => x.Profession).MaximumLength(150).Must(NoHtml);
            g.RuleFor(x => x.ProfessionDomain).MaximumLength(100).Must(NoHtml);
            g.RuleFor(x => x.Relationship).MaximumLength(50).Must(NoHtml);
        });
        RuleForEach(x => x.ScoutRelations).ChildRules(r =>
        {
            r.RuleFor(x => x.Status).Must(s => s is "CurrentInGroup" or "AncienInGroup" or "OtherGroup")
                .WithMessage("Statut de proche invalide.");
            r.RuleFor(x => x.FirstName).MaximumLength(100).Must(NoHtml);
            r.RuleFor(x => x.LastName).MaximumLength(100).Must(NoHtml);
            r.RuleFor(x => x.Relationship).MaximumLength(50).Must(NoHtml);
            r.RuleFor(x => x.LastUnit).MaximumLength(100).Must(NoHtml);
            r.RuleFor(x => x.LastFunction).MaximumLength(100).Must(NoHtml);
            r.RuleFor(x => x.OtherGroupName).MaximumLength(200).Must(NoHtml);
        });
        RuleFor(x => x.AddressCity).MaximumLength(100);
        RuleFor(x => x.AddressCountry).MaximumLength(100);
        RuleFor(x => x.AddressDetails).MaximumLength(500).Must(NoHtml);
    }
}

public record CreateDemandeCommand(DemandeInput Data) : IRequest<Result<Guid>>;

public class CreateDemandeCommandHandler(IApplicationDbContext context, ICurrentApplicantService current) : IRequestHandler<CreateDemandeCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateDemandeCommand request, CancellationToken ct)
    {
        var id = current.ApplicantAccountId;
        if (id is null) return Result<Guid>.Failure("Non autorisé.");

        var config = await ApplicantHelpers.BuildConfig(context, ct);
        if (!config.IsOpen) return Result<Guid>.Failure("Les inscriptions sont actuellement fermées.");

        var count = await context.Demandes.CountAsync(d => d.ApplicantAccountId == id && d.ScoutYear == config.ScoutYear, ct);
        if (count >= config.MaxPerAccount)
            return Result<Guid>.Failure($"Vous avez atteint le nombre maximum de demandes ({config.MaxPerAccount}).");

        var demande = new Demande { ApplicantAccountId = id.Value, ScoutYear = config.ScoutYear, Status = DemandeStatus.Draft };
        ApplicantHelpers.Apply(demande, request.Data);
        context.Demandes.Add(demande);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(demande.Id);
    }
}

public record UpdateDemandeCommand(Guid Id, DemandeInput Data) : IRequest<Result<bool>>;

public class UpdateDemandeCommandHandler(IApplicationDbContext context, ICurrentApplicantService current) : IRequestHandler<UpdateDemandeCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateDemandeCommand request, CancellationToken ct)
    {
        var id = current.ApplicantAccountId;
        if (id is null) return Result<bool>.Failure("Non autorisé.");

        var config = await ApplicantHelpers.BuildConfig(context, ct);
        if (!config.IsOpen) return Result<bool>.Failure("Les inscriptions sont fermées — modification impossible.");

        var demande = await context.Demandes.FirstOrDefaultAsync(d => d.Id == request.Id && d.ApplicantAccountId == id, ct);
        if (demande is null) return Result<bool>.Failure("Demande introuvable.");
        if (demande.ResponseSentAt is not null || demande.ReviewedAt is not null)
            return Result<bool>.Failure("Cette demande a déjà été traitée et ne peut plus être modifiée.");

        ApplicantHelpers.Apply(demande, request.Data);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record SubmitDemandeCommand(Guid Id) : IRequest<Result<bool>>;

public class SubmitDemandeCommandHandler(IApplicationDbContext context, ICurrentApplicantService current) : IRequestHandler<SubmitDemandeCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SubmitDemandeCommand request, CancellationToken ct)
    {
        var id = current.ApplicantAccountId;
        if (id is null) return Result<bool>.Failure("Non autorisé.");

        var config = await ApplicantHelpers.BuildConfig(context, ct);
        if (!config.IsOpen) return Result<bool>.Failure("Les inscriptions sont fermées.");

        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (account is null) return Result<bool>.Failure("Compte introuvable.");
        if (config.RequireEmailVerification && !account.EmailVerified)
            return Result<bool>.Failure("Veuillez vérifier votre adresse email avant de soumettre une demande.");

        var demande = await context.Demandes.FirstOrDefaultAsync(d => d.Id == request.Id && d.ApplicantAccountId == id, ct);
        if (demande is null) return Result<bool>.Failure("Demande introuvable.");

        // Required member-equivalent fields
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(demande.FirstName)) missing.Add("prénom");
        if (string.IsNullOrWhiteSpace(demande.LastName)) missing.Add("nom");
        if (demande.DateOfBirth is null) missing.Add("date de naissance");
        if (string.IsNullOrWhiteSpace(demande.Gender)) missing.Add("genre");
        if (string.IsNullOrWhiteSpace(demande.Nationality)) missing.Add("nationalité");
        if (string.IsNullOrWhiteSpace(demande.School)) missing.Add("école");
        if (string.IsNullOrWhiteSpace(demande.Classe)) missing.Add("classe");
        if (missing.Count > 0)
            return Result<bool>.Failure($"Informations manquantes : {string.Join(", ", missing)}.");

        var hasGuardian = await context.ApplicantGuardians.AnyAsync(g => g.ApplicantAccountId == id, ct);
        if (!hasGuardian)
            return Result<bool>.Failure("Veuillez renseigner au moins un parent/tuteur avant de soumettre.");

        demande.Status = DemandeStatus.Submitted;
        demande.SubmittedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record DeleteDemandeCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteDemandeCommandHandler(IApplicationDbContext context, ICurrentApplicantService current) : IRequestHandler<DeleteDemandeCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteDemandeCommand request, CancellationToken ct)
    {
        var id = current.ApplicantAccountId;
        if (id is null) return Result<bool>.Failure("Non autorisé.");

        var demande = await context.Demandes.FirstOrDefaultAsync(d => d.Id == request.Id && d.ApplicantAccountId == id, ct);
        if (demande is null) return Result<bool>.Failure("Demande introuvable.");
        if (demande.ResponseSentAt is not null || demande.ReviewedAt is not null)
            return Result<bool>.Failure("Cette demande a déjà été traitée et ne peut plus être supprimée.");

        context.Demandes.Remove(demande);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
