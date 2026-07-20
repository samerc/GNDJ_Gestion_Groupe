using System.Text.Json;
using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Applicants;

// Public enrolment portal — the APPLICANT side (a parent registering their children), fully isolated
// from the internal User/Member/permission system (own ApplicantAccount + JWT). Flow: register →
// verify email → fill shared household (guardians, address, scout relations) → one Demande per child
// (draft → submit). The CG then reviews/sends responses in DemandeAdminHandlers, which converts an
// approved demande into a real Member.

// ============================================================
// DTOs
// ============================================================
public record ApplicantAuthDto(Guid AccountId, string Email, bool EmailVerified, string AccessToken, string RefreshToken, DateTime ExpiresAt);

// Public config the wizard reads on load: whether enrolment is open + the managed pick-lists
// (schools/classes/cities/units/profession domains) and caps, so the portal stays a thin client.

// IsOpen (demande.enabled) = the portal is accessible at all (login + view). SubmissionsOpen
// (demande.submissions_open) is the INNER window inside it: while true, parents can create/edit/submit/delete;
// once the CG closes it (review phase), the portal stays open for viewing but all writes are blocked.
public record ApplicantConfigDto(bool IsOpen, bool SubmissionsOpen, string ScoutYear, int MaxPerAccount, int NotesMaxLength, bool RequireEmailVerification, string? IntroText,
    IReadOnlyList<string> Schools, IReadOnlyList<string> Classes, IReadOnlyList<string> Cities, IReadOnlyList<string> Units, int MaxScoutRelations,
    // ExcludedClasse: a grade that cannot enroll (default 6ème) — hidden from the wizard's classe dropdown
    // and rejected at submit. Empty/null = no restriction. Editable via the demande.excluded_classe setting.
    IReadOnlyList<string> ProfessionDomains, string? Terms, string? ExcludedClasse = null);

public record ApplicantGuardianDto(Guid? Id, string Relationship, string FirstName, string LastName, string? Profession, string? ProfessionDomain,
    string? PhoneCountryCode, string? PhoneNumber, string? Email, bool IsDeceased, bool IsPrimaryContact, bool IsEmergencyContact);

public record ApplicantScoutRelationDto(Guid? Id, string Status, string? Relationship, Guid? RelatedMemberId,
    string? FirstName, string? LastName, string? LastUnit, string? LastFunction, string? OtherGroupName,
    // CG-only: when RelatedMemberId was auto-matched to a real member, these surface who, so the CG can confirm.
    // Left null in the applicant portal path (privacy — applicants must not learn who is in the group).
    string? RelatedMemberName = null, string? RelatedMemberUnit = null);

public record DemandeDto(Guid Id, string ScoutYear, string FirstName, string LastName, DateOnly? DateOfBirth, string? Gender,
    string? Nationality, string? School, string? Classe, string? Section, string? BloodType, string? MedicalNotes, string? Allergies,
    string? PhoneCountryCode, string? PhoneNumber, string? Email, string? ParentNotes,
    string Status, string? DecisionNotes, DateTime? SubmittedAt, DateTime? ResponseSentAt,
    bool HasPreviousDemande = false, string? PreviousDemandeYear = null);

public record ApplicantProfileDto(Guid AccountId, string Email, bool EmailVerified, string? ContactName,
    string? AddressCountry, string? AddressCity, string? AddressDetails,
    IReadOnlyList<ApplicantGuardianDto> Guardians, IReadOnlyList<ApplicantScoutRelationDto> ScoutRelations,
    IReadOnlyList<DemandeDto> Demandes,
    // True once the applicant has accepted the T&C (now a separate post-login step, not part of registration).
    bool TermsAccepted = false,
    // Household primary contact email (one per family) — chosen in the wizard, copied to each member on conversion.
    string? PrimaryContactEmail = null);

// Shared child-field payload for create/update (the per-child part of a demande; the household part
// lives on the account and is saved separately via SaveApplicantHousehold).
public record DemandeInput(
    string FirstName, string LastName, DateOnly? DateOfBirth, string? Gender,
    string? Nationality, string? School, string? Classe, string? Section,
    string? BloodType, string? MedicalNotes, string? Allergies,
    string? PhoneCountryCode, string? PhoneNumber, string? Email, string? ParentNotes,
    bool HasPreviousDemande = false, string? PreviousDemandeYear = null);

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
        "demande.enabled", "demande.submissions_open", "demande.scout_year", "passage.scout_year", "demande.max_per_account",
        "demande.notes_max_length", "demande.require_email_verification", "demande.intro_text",
        "demande.max_scout_relations", "demande.terms", "demande.excluded_classe", "member.schools", "member.classes", "member.cities", "member.profession_domains"
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
        // The submission window defaults OPEN (only "false" closes it) so existing/new campaigns behave as
        // before until the CG explicitly closes submissions to start the review phase.
        var submissionsOpen = Get("demande.submissions_open") != "false";
        var year = Get("demande.scout_year") ?? Get("passage.scout_year") ?? "2026-2027";
        var max = int.TryParse(Get("demande.max_per_account"), out var m) && m > 0 ? m : 3;
        var notesLen = int.TryParse(Get("demande.notes_max_length"), out var n) ? n : 500;
        var maxRelations = int.TryParse(Get("demande.max_scout_relations"), out var mr) && mr > 0 ? Math.Min(mr, MaxScoutRelationsHardCap) : 3;
        var requireVerify = Get("demande.require_email_verification") != "false";
        var intro = Get("demande.intro_text");
        var terms = Get("demande.terms");
        var excludedClasse = Get("demande.excluded_classe");

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

        return new ApplicantConfigDto(enabled, submissionsOpen, year, max, notesLen, requireVerify, intro, schools, classes, cities, units, maxRelations, professionDomains, terms, excludedClasse);
    }

    // Returns an error message if the applicant may NOT submit/edit right now (portal closed, or the submission
    // window is closed = CG review phase), else null. Centralizes the two-phase gate for all write handlers.
    public static string? SubmissionsClosedError(ApplicantConfigDto config)
    {
        if (!config.IsOpen) return "Les inscriptions sont actuellement fermées.";
        if (!config.SubmissionsOpen) return "La période de soumission des demandes est terminée. Vous pouvez consulter vos demandes ; les résultats vous seront communiqués prochainement.";
        return null;
    }

    public static DemandeDto ToDto(Demande d)
    {
        // The CG's decision is STAGED: an Approved/Declined status and its DecisionNotes must stay hidden from the
        // applicant until the batch response is actually sent (ResponseSentAt). Before that, a decided demande still
        // reads as "Submitted" (under review) and the notes are withheld — otherwise a parent could see the outcome
        // (and the decline reason) before the CG posts it, while it can still change.
        var sent = d.ResponseSentAt != null;
        var decided = d.Status == DemandeStatus.Approved || d.Status == DemandeStatus.Declined;
        var status = (!sent && decided) ? DemandeStatus.Submitted : d.Status;
        var notes = sent ? d.DecisionNotes : null;
        return new(
            d.Id, d.ScoutYear, d.FirstName, d.LastName, d.DateOfBirth, d.Gender, d.Nationality, d.School, d.Classe, d.Section,
            d.BloodType, d.MedicalNotes, d.Allergies, d.PhoneCountryCode, d.PhoneNumber, d.Email, d.ParentNotes,
            status, notes, d.SubmittedAt, d.ResponseSentAt, d.HasPreviousDemande, d.PreviousDemandeYear);
    }

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
        d.HasPreviousDemande = i.HasPreviousDemande;
        d.PreviousDemandeYear = i.HasPreviousDemande ? i.PreviousDemandeYear?.Trim() : null;
    }
}

// ============================================================
// Auth
// ============================================================
public record RegisterApplicantCommand(string Email, string Password, string? ContactName, bool AcceptedTerms = false) : IRequest<Result<ApplicantAuthDto>>;

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
        // No new applicant accounts while inscriptions are closed OR the submission window is closed
        // (review phase). Defense-in-depth: the UI already hides the register page, but block the endpoint too.
        var config = await ApplicantHelpers.BuildConfig(context, ct);
        var regClosed = ApplicantHelpers.SubmissionsClosedError(config);
        if (regClosed is not null) return Result<ApplicantAuthDto>.Failure(regClosed);

        var addr = request.Email.Trim().ToLowerInvariant();
        var exists = await context.ApplicantAccounts.AnyAsync(a => a.Email == addr, ct);
        if (exists)
            return Result<ApplicantAuthDto>.Failure("Un compte existe déjà avec cette adresse email.");

        // Terms & conditions are accepted AFTER account creation, on a separate screen (AcceptTermsCommand) —
        // NOT here. New accounts start with TermsAcceptedAt = null; the portal gates on it until accepted.
        var passwordHash = await hasher.HashAsync(request.Password);
        var account = new ApplicantAccount
        {
            Email = addr,
            PasswordHash = passwordHash,
            ContactName = string.IsNullOrWhiteSpace(request.ContactName) ? null : request.ContactName.Trim(),
            EmailVerified = false,
            EmailVerificationToken = Guid.NewGuid().ToString("N"),
            EmailVerificationTokenExpiry = DateTime.UtcNow.AddDays(7),
            TermsAcceptedAt = null,
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
        if (account is null || !account.IsActive || !await hasher.VerifyAsync(request.Password, account.PasswordHash))
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
            guardians, relations, demandes, account.TermsAcceptedAt != null, account.PrimaryContactEmail));
    }
}

// ============================================================
// Accept the terms & conditions (separate post-login step)
// ============================================================
public record AcceptTermsCommand() : IRequest<Result<bool>>;

public class AcceptTermsCommandHandler(IApplicationDbContext context, ICurrentApplicantService current) : IRequestHandler<AcceptTermsCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(AcceptTermsCommand request, CancellationToken ct)
    {
        var id = current.ApplicantAccountId;
        if (id is null) return Result<bool>.Failure("Non autorisé.");

        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (account is null) return Result<bool>.Failure("Compte introuvable.");

        // Idempotent: record the first acceptance timestamp; re-accepting keeps the original.
        account.TermsAcceptedAt ??= DateTime.UtcNow;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ============================================================
// "Retrouver mes informations" — prefill the household from an existing member, gated by an email code.
// The applicant enters an email; if it's a guardian of an existing member we email a one-time code; on
// verification we return that family's household (parents + address) + its members (as sibling candidates).
// The code proves the applicant controls the address, so revealing the data is safe.
// ============================================================
public record HouseholdLookupMemberDto(Guid Id, string Name, string? Unit, string? Gender);
public record HouseholdLookupDto(IReadOnlyList<ApplicantGuardianDto> Guardians,
    string? AddressCountry, string? AddressCity, string? AddressDetails,
    IReadOnlyList<HouseholdLookupMemberDto> Members);

// Resolves the member ids an email belongs to — matching a member's OWN email OR a member's guardian's
// email. Shared by the request (decide whether to send a code) and verify (build the household) handlers.
// Member-email support lets someone who is themselves a member (an older youth, or a parent who is also a
// member) retrieve their household using their own address, not only a parent/guardian email.
internal static class HouseholdLookup
{
    public static async Task<List<Guid>> SeedMemberIdsAsync(IApplicationDbContext context, string email, CancellationToken ct)
    {
        // Members reached through a matching guardian email (guardian must be linked to a member).
        var viaGuardian = await context.GuardianEmails
            .Where(e => e.Address == email && !e.IsDeleted)
            .SelectMany(e => e.Guardian.Links.Where(l => !l.IsDeleted).Select(l => l.MemberId))
            .Distinct().ToListAsync(ct);
        // Members whose OWN email matches (not soft-deleted).
        var viaMember = await context.MemberEmails
            .Where(e => e.Address == email && !e.IsDeleted && !e.Member.IsDeleted)
            .Select(e => e.MemberId)
            .Distinct().ToListAsync(ct);
        return viaGuardian.Concat(viaMember).Distinct().ToList();
    }
}

public record RequestHouseholdLookupCommand(string Email) : IRequest<Result<bool>>;

public class RequestHouseholdLookupCommandValidator : AbstractValidator<RequestHouseholdLookupCommand>
{
    public RequestHouseholdLookupCommandValidator()
        => RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(254);
}

public class RequestHouseholdLookupCommandHandler(IApplicationDbContext context, ICurrentApplicantService current, IPasswordHasher hasher, IEmailQueue emailQueue)
    : IRequestHandler<RequestHouseholdLookupCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(RequestHouseholdLookupCommand request, CancellationToken ct)
    {
        var id = current.ApplicantAccountId;
        if (id is null) return Result<bool>.Failure("Non autorisé.");
        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (account is null) return Result<bool>.Failure("Compte introuvable.");

        var email = request.Email.Trim();
        // Only email a code when the address belongs to a member (their own email) or a member's guardian
        // (don't spam arbitrary addresses). Return generic success regardless so we don't reveal which
        // emails exist in the system.
        var seedMemberIds = await HouseholdLookup.SeedMemberIdsAsync(context, email, ct);
        if (seedMemberIds.Count > 0)
        {
            var code = Random.Shared.Next(100000, 999999).ToString();
            account.HouseholdLookupEmail = email;
            account.HouseholdLookupCodeHash = hasher.HashToken(code);
            account.HouseholdLookupExpiry = DateTime.UtcNow.AddMinutes(15);
            await context.SaveChangesAsync(ct);
            emailQueue.Enqueue(new EmailJob("household_lookup_code", email, new Dictionary<string, string> { ["code"] = code }));
        }
        return Result<bool>.Success(true);
    }
}

public record VerifyHouseholdLookupCommand(string Email, string Code) : IRequest<Result<HouseholdLookupDto>>;

public class VerifyHouseholdLookupCommandValidator : AbstractValidator<VerifyHouseholdLookupCommand>
{
    public VerifyHouseholdLookupCommandValidator()
    {
        RuleFor(x => x.Email).NotEmpty().MaximumLength(254);
        RuleFor(x => x.Code).NotEmpty().MaximumLength(10);
    }
}

public class VerifyHouseholdLookupCommandHandler(IApplicationDbContext context, ICurrentApplicantService current, IPasswordHasher hasher)
    : IRequestHandler<VerifyHouseholdLookupCommand, Result<HouseholdLookupDto>>
{
    public async ValueTask<Result<HouseholdLookupDto>> Handle(VerifyHouseholdLookupCommand request, CancellationToken ct)
    {
        var id = current.ApplicantAccountId;
        if (id is null) return Result<HouseholdLookupDto>.Failure("Non autorisé.");
        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (account is null) return Result<HouseholdLookupDto>.Failure("Compte introuvable.");

        var email = request.Email.Trim();
        if (account.HouseholdLookupEmail is null || account.HouseholdLookupExpiry is null || account.HouseholdLookupExpiry < DateTime.UtcNow
            || !string.Equals(account.HouseholdLookupEmail, email, StringComparison.OrdinalIgnoreCase)
            || account.HouseholdLookupCodeHash != hasher.HashToken(request.Code.Trim()))
            return Result<HouseholdLookupDto>.Failure("Code invalide ou expiré.");

        // One-time: clear the code now.
        account.HouseholdLookupEmail = null; account.HouseholdLookupCodeHash = null; account.HouseholdLookupExpiry = null;

        // The verified email → its member(s) (own email) and/or its guardian's children → then expand to the
        // FULL household: the guardians of those seed members, and every member those guardians parent (siblings).
        var seedMemberIds = await HouseholdLookup.SeedMemberIdsAsync(context, email, ct);
        var seedGuardianIds = await context.GuardianLinks.Where(l => seedMemberIds.Contains(l.MemberId) && !l.IsDeleted).Select(l => l.GuardianId).Distinct().ToListAsync(ct);
        var siblingIds = await context.GuardianLinks.Where(l => seedGuardianIds.Contains(l.GuardianId) && !l.IsDeleted).Select(l => l.MemberId).Distinct().ToListAsync(ct);
        var memberIds = seedMemberIds.Concat(siblingIds).Distinct().ToList();
        var activeMemberIds = await context.MemberAssignments.Where(a => memberIds.Contains(a.MemberId) && a.EndDate == null && !a.IsDeleted).Select(a => a.MemberId).Distinct().ToListAsync(ct);
        var relevant = activeMemberIds.Count > 0 ? activeMemberIds : memberIds;

        var allGuardianIds = await context.GuardianLinks.Where(l => relevant.Contains(l.MemberId) && !l.IsDeleted).Select(l => l.GuardianId).Distinct().ToListAsync(ct);
        var guardianEntities = await context.Guardians.Where(g => allGuardianIds.Contains(g.Id) && !g.IsDeleted)
            .Include(g => g.Phones).Include(g => g.Emails).Include(g => g.Links).ToListAsync(ct);
        var guardians = guardianEntities.Select(g =>
        {
            var link = g.Links.FirstOrDefault(l => relevant.Contains(l.MemberId) && !l.IsDeleted);
            var phone = g.Phones.Where(p => !p.IsDeleted).OrderByDescending(p => p.IsPrimary).FirstOrDefault();
            var mail = g.Emails.Where(e => !e.IsDeleted).OrderByDescending(e => e.IsPrimary).FirstOrDefault();
            return new ApplicantGuardianDto(null, link?.RelationshipType ?? "Tuteur", g.FirstName, g.LastName, g.Profession, g.ProfessionDomain,
                phone?.CountryCode, phone?.Number, mail?.Address, g.IsDeceased, link?.IsPrimaryContact ?? false, link?.IsEmergencyContact ?? false);
        }).ToList();

        // Collapse duplicate guardian records (the same parent imported twice → same name) so the wizard
        // doesn't pre-fill the same person more than once. Group by accent/case-insensitive full name and keep
        // the richest entry (has email, then phone, then profession).
        guardians = guardians
            .GroupBy(g => TextNormalization.NormalizeKey($"{g.FirstName} {g.LastName}"))
            .Select(grp => grp
                .OrderByDescending(x => !string.IsNullOrWhiteSpace(x.Email))
                .ThenByDescending(x => !string.IsNullOrWhiteSpace(x.PhoneNumber))
                .ThenByDescending(x => !string.IsNullOrWhiteSpace(x.Profession))
                .First())
            .ToList();

        var addr = await context.MemberAddresses.Where(a => relevant.Contains(a.MemberId) && !a.IsDeleted).OrderByDescending(a => a.IsPrimary).FirstOrDefaultAsync(ct);
        var members = await context.Members.Where(m => relevant.Contains(m.Id))
            .Select(m => new HouseholdLookupMemberDto(m.Id, m.FirstName + " " + m.LastName,
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(), m.Gender))
            .ToListAsync(ct);

        await context.SaveChangesAsync(ct);
        return Result<HouseholdLookupDto>.Success(new HouseholdLookupDto(guardians, addr?.Country, addr?.City, addr?.Details, members));
    }
}

// ============================================================
// Save shared household data (address + guardians + scout relations)
// ============================================================
public record SaveApplicantHouseholdCommand(
    string? ContactName, string? AddressCountry, string? AddressCity, string? AddressDetails,
    List<ApplicantGuardianDto> Guardians, List<ApplicantScoutRelationDto> ScoutRelations,
    string? PrimaryContactEmail = null) : IRequest<Result<bool>>;

public class SaveApplicantHouseholdCommandHandler(IApplicationDbContext context, ICurrentApplicantService current) : IRequestHandler<SaveApplicantHouseholdCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SaveApplicantHouseholdCommand request, CancellationToken ct)
    {
        var id = current.ApplicantAccountId;
        if (id is null) return Result<bool>.Failure("Non autorisé.");

        // Household edits are part of filling a demande — blocked once the submission window closes.
        var closed = ApplicantHelpers.SubmissionsClosedError(await ApplicantHelpers.BuildConfig(context, ct));
        if (closed is not null) return Result<bool>.Failure(closed);

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
        account.PrimaryContactEmail = string.IsNullOrWhiteSpace(request.PrimaryContactEmail) ? null : request.PrimaryContactEmail.Trim();

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

        // Active members (by name + unit) — used to auto-link a "current member" relative to the real member
        // record when there's a single confident match. Ambiguous/no match leaves RelatedMemberId null for
        // the CG to resolve. No public member search is exposed; the applicant only typed a name + unit.
        var activeMembers = await context.MemberAssignments
            .Where(a => a.EndDate == null && !a.IsDeleted)
            .Select(a => new { a.MemberId, a.Member.FirstName, a.Member.LastName, UnitName = a.Unit.Name })
            .ToListAsync(ct);
        static string NormName(string? s) => string.IsNullOrWhiteSpace(s) ? "" : new string(
            s.Trim().ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD)
             .Where(c => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.NonSpacingMark)
             .ToArray());

        foreach (var r in request.ScoutRelations.Where(r => !string.IsNullOrWhiteSpace(r.FirstName) || !string.IsNullOrWhiteSpace(r.LastName) || r.RelatedMemberId.HasValue))
        {
            var relatedId = r.RelatedMemberId;
            if (relatedId is null && r.Status == "CurrentInGroup" && !string.IsNullOrWhiteSpace(r.FirstName) && !string.IsNullOrWhiteSpace(r.LastName))
            {
                string nf = NormName(r.FirstName), nl = NormName(r.LastName);
                var matches = activeMembers.Where(m => NormName(m.FirstName) == nf && NormName(m.LastName) == nl).ToList();
                // Narrow by the chosen unit only when that disambiguates (keeps a single name-match otherwise).
                if (matches.Count > 1 && !string.IsNullOrWhiteSpace(r.LastUnit))
                {
                    var byUnit = matches.Where(m => NormName(m.UnitName) == NormName(r.LastUnit)).ToList();
                    if (byUnit.Count > 0) matches = byUnit;
                }
                if (matches.Count == 1) relatedId = matches[0].MemberId; // confident single match → link it
            }

            context.ApplicantScoutRelations.Add(new ApplicantScoutRelation
            {
                ApplicantAccountId = id.Value,
                Status = r.Status,
                Relationship = r.Relationship,
                RelatedMemberId = relatedId,
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
        RuleFor(x => x.PreviousDemandeYear).MaximumLength(20).Must(NoHtml);
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
        RuleFor(x => x.PrimaryContactEmail).MaximumLength(254).EmailAddress()
            .When(x => !string.IsNullOrWhiteSpace(x.PrimaryContactEmail));
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
        var closed = ApplicantHelpers.SubmissionsClosedError(config);
        if (closed is not null) return Result<Guid>.Failure(closed);

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
        var closed = ApplicantHelpers.SubmissionsClosedError(config);
        if (closed is not null) return Result<bool>.Failure(closed);

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
        var closed = ApplicantHelpers.SubmissionsClosedError(config);
        if (closed is not null) return Result<bool>.Failure(closed);

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

        // Enrolment cut-off: a configured grade (default 6ème) cannot submit. The wizard already hides it
        // from the dropdown; this rejects a crafted submission too (defense-in-depth).
        if (!string.IsNullOrWhiteSpace(config.ExcludedClasse) &&
            string.Equals(demande.Classe?.Trim(), config.ExcludedClasse.Trim(), StringComparison.OrdinalIgnoreCase))
            return Result<bool>.Failure($"Un enfant en {config.ExcludedClasse} ne peut pas s'inscrire.");

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

        // No deleting once the submission window closes (the CG is reviewing).
        var closed = ApplicantHelpers.SubmissionsClosedError(await ApplicantHelpers.BuildConfig(context, ct));
        if (closed is not null) return Result<bool>.Failure(closed);

        var demande = await context.Demandes.FirstOrDefaultAsync(d => d.Id == request.Id && d.ApplicantAccountId == id, ct);
        if (demande is null) return Result<bool>.Failure("Demande introuvable.");
        if (demande.ResponseSentAt is not null || demande.ReviewedAt is not null)
            return Result<bool>.Failure("Cette demande a déjà été traitée et ne peut plus être supprimée.");

        context.Demandes.Remove(demande);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
