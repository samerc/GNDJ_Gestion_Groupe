using System.Security.Cryptography;
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
public record ApplicantConfigDto(bool IsOpen, bool SubmissionsOpen, string ScoutYear, int MaxPerAccount, int NotesMaxLength, bool RequireEmailVerification,
    IReadOnlyList<string> Schools, IReadOnlyList<string> Classes, IReadOnlyList<string> Cities, IReadOnlyList<string> Units, int MaxScoutRelations,
    // ExcludedClasse: a grade that cannot enroll (default 6ème) — hidden from the wizard's classe dropdown
    // and rejected at submit. Empty/null = no restriction. Editable via the demande.excluded_classe setting.
    IReadOnlyList<string> ProfessionDomains, string? Terms, string? ExcludedClasse = null,
    // SubmissionStart/Deadline (yyyy-MM-dd, or null): the window dates driving IsOpen/SubmissionsOpen above —
    // exposed so the landing/portal can show "ouvre le …" / "clôture le …". ResultText* = editable result-page
    // copy. ActivationLinkDays = how long an accepted member's set-password link stays valid.
    string? SubmissionStart = null, string? SubmissionDeadline = null,
    string? ResultTextAccepted = null, string? ResultTextDeclined = null, int ActivationLinkDays = 30);

public record ApplicantGuardianDto(Guid? Id, string Relationship, string FirstName, string LastName, string? Profession, string? ProfessionDomain,
    string? PhoneCountryCode, string? PhoneNumber, string? Email, bool IsDeceased, bool IsPrimaryContact, bool IsEmergencyContact);

public record ApplicantScoutRelationDto(Guid? Id, string Status, string? Relationship, Guid? RelatedMemberId,
    string? FirstName, string? LastName, string? LastUnit, string? LastFunction, string? OtherGroupName,
    // For OtherGroup: whether the person is a FORMER member of that other group (true) or a current one (false).
    bool OtherGroupIsFormer = false,
    // CG-only: when RelatedMemberId was auto-matched to a real member, these surface who, so the CG can confirm.
    // Left null in the applicant portal path (privacy — applicants must not learn who is in the group).
    string? RelatedMemberName = null, string? RelatedMemberUnit = null);

public record DemandeDto(Guid Id, string ScoutYear, string FirstName, string LastName, DateOnly? DateOfBirth, string? Gender,
    string? Nationality, string? School, string? Classe, string? Section, string? BloodType, string? MedicalNotes, string? Allergies,
    string? PhoneCountryCode, string? PhoneNumber, string? Email, string? ParentNotes,
    string Status, string? DecisionNotes, DateTime? SubmittedAt, DateTime? ResponseSentAt,
    bool HasPreviousDemande = false, string? PreviousDemandeYear = null,
    string? SerialNumber = null, // human-facing reference (INS-YYYY-NNNN); null for an unsubmitted draft
    // Result-page fields — populated only once the response is SENT (never leak a staged decision):
    // Converted = an accepted demande that produced a member account; DecidedUnitName = the admitted unit;
    // MemberUsername = that member's login; MemberHasLoggedIn = they've already entered the member area
    // (so the portal stops showing onboarding steps and just links to the login page).
    bool Converted = false, string? DecidedUnitName = null, string? MemberUsername = null, bool MemberHasLoggedIn = false);

public record ApplicantProfileDto(Guid AccountId, string Email, bool EmailVerified, string? ContactName,
    string? AddressCountry, string? AddressCity, string? AddressDetails,
    IReadOnlyList<ApplicantGuardianDto> Guardians, IReadOnlyList<ApplicantScoutRelationDto> ScoutRelations,
    IReadOnlyList<DemandeDto> Demandes,
    // True once the applicant has accepted the T&C (now a separate post-login step, not part of registration).
    bool TermsAccepted = false,
    // Household primary contact email (one per family) — chosen in the wizard, copied to each member on conversion.
    string? PrimaryContactEmail = null,
    // Parents' relationship status (Unis / Séparés / Divorcés).
    string? ParentsSituation = null);

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
        await queue.EnqueueAsync(new EmailJob("demande_email_verification", account.Email, new Dictionary<string, string>
        {
            ["contactName"] = account.ContactName ?? "",
            ["verifyLink"] = link,
            ["expiryDays"] = "7",
        }), ct);
    }

    static readonly string[] ConfigKeys =
    [
        "demande.enabled", "demande.submissions_open", "demande.scout_year", "passage.scout_year", "demande.max_per_account",
        "demande.notes_max_length", "demande.require_email_verification",
        "demande.max_scout_relations", "demande.terms", "demande.excluded_classe", "member.schools", "member.classes", "member.cities", "member.profession_domains",
        "demande.submission_start", "demande.submission_deadline", "demande.result_text_accepted", "demande.result_text_declined", "member.activation_link_days"
    ];

    // Parses a yyyy-MM-dd setting into a DateOnly (null if empty/invalid).
    public static DateOnly? ParseDate(string? raw) =>
        DateOnly.TryParseExact(raw, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var d) ? d : null;

    // Absolute safety cap enforced by SaveApplicantHouseholdCommandValidator regardless of the configurable
    // business limit (demande.max_scout_relations, default 3, exposed to the wizard via the config endpoint).
    public const int MaxScoutRelationsHardCap = 50;

    public static async Task<ApplicantConfigDto> BuildConfig(IApplicationDbContext ctx, CancellationToken ct)
    {
        // Single query for all settings this endpoint needs (hit on every public page load).
        var map = await ctx.Settings.Where(s => ConfigKeys.Contains(s.Key))
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        string? Get(string k) => map.TryGetValue(k, out var v) ? v : null;

        // Date-driven window: the portal OPENS on the start date and submissions CLOSE after the deadline,
        // computed live (no scheduled job). Empty dates = no gate → the manual switches govern alone.
        var start = ParseDate(Get("demande.submission_start"));
        var deadline = ParseDate(Get("demande.submission_deadline"));
        var today = LebanonClock.Today;
        var beforeStart = start.HasValue && today < start.Value;
        var afterDeadline = deadline.HasValue && today > deadline.Value;

        // IsOpen (portal accessible) = the master switch AND on-or-after the start date.
        var enabled = Get("demande.enabled") == "true" && !beforeStart;
        // The submission window defaults OPEN (only "false" closes it); the deadline auto-closes it too. So the CG
        // can still close submissions early (manual review phase), and it closes on its own after the deadline.
        var submissionsOpen = Get("demande.submissions_open") != "false" && !afterDeadline;
        var activationDays = int.TryParse(Get("member.activation_link_days"), out var ad) && ad > 0 ? ad : 30;
        var year = Get("demande.scout_year") ?? Get("passage.scout_year") ?? "2026-2027";
        var max = int.TryParse(Get("demande.max_per_account"), out var m) && m > 0 ? m : 3;
        var notesLen = int.TryParse(Get("demande.notes_max_length"), out var n) ? n : 500;
        var maxRelations = int.TryParse(Get("demande.max_scout_relations"), out var mr) && mr > 0 ? Math.Min(mr, MaxScoutRelationsHardCap) : 3;
        var requireVerify = Get("demande.require_email_verification") != "false";
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

        return new ApplicantConfigDto(enabled, submissionsOpen, year, max, notesLen, requireVerify, schools, classes, cities, units, maxRelations, professionDomains, terms, excludedClasse,
            Get("demande.submission_start"), Get("demande.submission_deadline"), Get("demande.result_text_accepted"), Get("demande.result_text_declined"), activationDays);
    }

    // Returns an error message if the applicant may NOT submit/edit right now (portal closed, or the submission
    // window is closed = CG review phase), else null. Centralizes the two-phase gate for all write handlers.
    public static string? SubmissionsClosedError(ApplicantConfigDto config)
    {
        if (!config.IsOpen) return "Les inscriptions sont actuellement fermées.";
        if (!config.SubmissionsOpen) return "La période de soumission des demandes est terminée. Vous pouvez consulter vos demandes ; les résultats vous seront communiqués prochainement.";
        return null;
    }

    public static DemandeDto ToDto(Demande d, bool deadlinePassed = false)
    {
        // The CG's decision is STAGED: an Approved/Declined status and its DecisionNotes must stay hidden from the
        // applicant until the batch response is actually sent (ResponseSentAt). Before that, a decided demande still
        // reads as "Submitted" (under review) and the notes are withheld — otherwise a parent could see the outcome
        // (and the decline reason) before the CG posts it, while it can still change.
        var sent = d.ResponseSentAt != null;
        var decided = d.Status == DemandeStatus.Approved || d.Status == DemandeStatus.Declined;
        var status = (!sent && decided) ? DemandeStatus.Submitted : d.Status;
        // A draft never submitted before the deadline is shown as "Expirée" (discarded — it can't be submitted
        // anymore and is purged at campaign archive). Display-only; the DB row stays Draft.
        if (status == DemandeStatus.Draft && deadlinePassed) status = DemandeStatus.Expired;
        var notes = sent ? d.DecisionNotes : null;
        return new(
            d.Id, d.ScoutYear, d.FirstName, d.LastName, d.DateOfBirth, d.Gender, d.Nationality, d.School, d.Classe, d.Section,
            d.BloodType, d.MedicalNotes, d.Allergies, d.PhoneCountryCode, d.PhoneNumber, d.Email, d.ParentNotes,
            status, notes, d.SubmittedAt, d.ResponseSentAt, d.HasPreviousDemande, d.PreviousDemandeYear, d.SerialNumber);
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
    public RegisterApplicantCommandValidator(IPasswordPolicy policy)
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().WithMessage("Adresse email invalide.").MaximumLength(254).RealEmail();
        RuleFor(x => x.Password).PasswordPolicy(policy);
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
        account.LastLoginAt = DateTime.UtcNow;
        account.LastActivityAt = DateTime.UtcNow;

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
        // Always run exactly one bcrypt verify (dummy when the account is missing/inactive) so response time
        // doesn't leak which applicant emails are registered — see IPasswordHasher.VerifyDummyAsync.
        var ok = account is not null && account.IsActive
            ? await hasher.VerifyAsync(request.Password, account.PasswordHash)
            : await hasher.VerifyDummyAsync(request.Password);
        if (account is null || !account.IsActive || !ok)
            return Result<ApplicantAuthDto>.Failure("Email ou mot de passe incorrect.");

        var refresh = tokens.GenerateRefreshToken();
        account.RefreshToken = hasher.HashToken(refresh);
        account.RefreshTokenExpiry = tokens.GetRefreshTokenExpiry();
        account.LastLoginAt = DateTime.UtcNow;
        account.LastActivityAt = DateTime.UtcNow;
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
        account.LastActivityAt = DateTime.UtcNow; // ~15-min heartbeat while active

        await context.SaveChangesAsync(ct);

        var access = tokens.GenerateApplicantToken(account);
        return Result<ApplicantAuthDto>.Success(new ApplicantAuthDto(account.Id, account.Email, account.EmailVerified, access, refresh, DateTime.UtcNow.AddMinutes(15)));
    }
}

// ============================================================
// Password reset (anonymous, public portal)
// ============================================================
// The applicant's email IS their real inbox (they registered with it), so the reset link is emailed
// straight to it — no contact resolution needed (unlike the member reset, which fans out to a member's
// file). ALWAYS returns generic success so a caller can't discover which emails are registered
// (anti-enumeration matters on a public portal — the member tool deliberately does the opposite).
public record RequestApplicantPasswordResetCommand(string Email) : IRequest<Result<bool>>;

public class RequestApplicantPasswordResetCommandValidator : AbstractValidator<RequestApplicantPasswordResetCommand>
{
    public RequestApplicantPasswordResetCommandValidator()
        => RuleFor(x => x.Email).NotEmpty().WithMessage("L'adresse email est requise.")
            .EmailAddress().WithMessage("Adresse email invalide.").MaximumLength(254);
}

public class RequestApplicantPasswordResetCommandHandler(IApplicationDbContext context, IEmailQueue emailQueue)
    : IRequestHandler<RequestApplicantPasswordResetCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(RequestApplicantPasswordResetCommand request, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Email == email && a.IsActive, ct);
        // Only mint a token + send when the address actually has an account; return generic success either way.
        if (account is not null)
        {
            var token = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32))
                .Replace("+", "").Replace("/", "").Replace("=", "");
            account.PasswordResetToken = token;
            account.PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(1);
            await context.SaveChangesAsync(ct);

            var baseUrl = (await ApplicantHelpers.Setting(context, "app.base_url", ct) ?? "http://localhost:5173").TrimEnd('/');
            var link = $"{baseUrl}/inscription/reset-password?token={token}&email={Uri.EscapeDataString(email)}";
            await emailQueue.EnqueueAsync(new EmailJob("demande_password_reset", account.Email, new Dictionary<string, string>
            {
                ["contactName"] = account.ContactName ?? "",
                ["resetLink"] = link,
                ["expiryHours"] = "1",
            }), ct);
        }
        return Result<bool>.Success(true);
    }
}

public record ResetApplicantPasswordCommand(string Email, string Token, string NewPassword) : IRequest<Result<bool>>;

public class ResetApplicantPasswordCommandValidator : AbstractValidator<ResetApplicantPasswordCommand>
{
    public ResetApplicantPasswordCommandValidator(IPasswordPolicy policy)
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(254);
        RuleFor(x => x.Token).NotEmpty().MaximumLength(200);
        RuleFor(x => x.NewPassword).PasswordPolicy(policy);
    }
}

public class ResetApplicantPasswordCommandHandler(IApplicationDbContext context, IPasswordHasher hasher)
    : IRequestHandler<ResetApplicantPasswordCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ResetApplicantPasswordCommand request, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Email == email && a.IsActive, ct);
        // Same generic message for unknown-email / wrong or expired token — don't reveal which check failed.
        if (account is null || account.PasswordResetToken != request.Token || account.PasswordResetTokenExpiry < DateTime.UtcNow)
            return Result<bool>.Failure("Lien de réinitialisation invalide ou expiré.");

        account.PasswordHash = await hasher.HashAsync(request.NewPassword);
        account.PasswordResetToken = null;
        account.PasswordResetTokenExpiry = null;
        // Changing the password invalidates any existing session (refresh token).
        account.RefreshToken = null;
        account.RefreshTokenExpiry = null;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
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
                r.FirstName, r.LastName, r.LastUnit, r.LastFunction, r.OtherGroupName, r.OtherGroupIsFormer))
            .ToListAsync(ct);

        var demandeEntities = await context.Demandes.Where(d => d.ApplicantAccountId == id)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(ct);

        // A draft left unsubmitted past the submission deadline is shown as "Expirée" (see ToDto).
        var deadline = ApplicantHelpers.ParseDate(await ApplicantHelpers.Setting(context, "demande.submission_deadline", ct));
        var deadlinePassed = deadline.HasValue && LebanonClock.Today > deadline.Value;

        // For SENT + converted (accepted) demandes, surface what the result page needs: the admitted unit's
        // name, the created member's login username, and whether that member has already logged in (so the
        // portal stops showing onboarding and just links to the member login). Batched — one query each.
        var createdMemberIds = demandeEntities.Where(d => d.ResponseSentAt != null && d.CreatedMemberId != null)
            .Select(d => d.CreatedMemberId!.Value).Distinct().ToList();
        var decidedUnitIds = demandeEntities.Where(d => d.ResponseSentAt != null && d.DecidedUnitId != null)
            .Select(d => d.DecidedUnitId!.Value).Distinct().ToList();
        var unitNames = decidedUnitIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await context.Units.Where(u => decidedUnitIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name, ct);
        var memberUsers = createdMemberIds.Count == 0
            ? new Dictionary<Guid, (string Email, bool LoggedIn)>()
            : (await context.Users.Where(u => createdMemberIds.Contains(u.MemberId))
                    .Select(u => new { u.MemberId, u.Email, u.LastLoginAt }).ToListAsync(ct))
                .ToDictionary(u => u.MemberId, u => (Email: u.Email, LoggedIn: u.LastLoginAt != null));

        var demandes = demandeEntities.Select(d =>
        {
            var dto = ApplicantHelpers.ToDto(d, deadlinePassed);
            if (d.ResponseSentAt == null) return dto; // never enrich (or leak) a staged/unsent decision
            var unitName = d.DecidedUnitId != null ? unitNames.GetValueOrDefault(d.DecidedUnitId.Value) : null;
            var converted = d.CreatedMemberId != null;
            string? username = null; var loggedIn = false;
            if (d.CreatedMemberId != null && memberUsers.TryGetValue(d.CreatedMemberId.Value, out var mu)) { username = mu.Email; loggedIn = mu.LoggedIn; }
            return dto with { Converted = converted, DecidedUnitName = unitName, MemberUsername = username, MemberHasLoggedIn = loggedIn };
        }).ToList();

        return Result<ApplicantProfileDto>.Success(new ApplicantProfileDto(
            account.Id, account.Email, account.EmailVerified, account.ContactName,
            account.AddressCountry, account.AddressCity, account.AddressDetails,
            guardians, relations, demandes, account.TermsAcceptedAt != null, account.PrimaryContactEmail,
            account.ParentsSituation));
    }
}

// ============================================================
// Resend the member activation email for an accepted (converted) demande
// ============================================================
// From the result page a parent can re-send the set-password link (e.g. the acceptance email was lost or
// its 30-day token expired). Owns-account guarded; re-stamps a FRESH token and queues the account_activation
// email to the member's contact address. No enumeration risk — the caller can only touch their own demande.
public record ResendMemberActivationCommand(Guid DemandeId) : IRequest<Result<bool>>;

public class ResendMemberActivationCommandHandler(IApplicationDbContext context, ICurrentApplicantService current, IEmailQueue emailQueue)
    : IRequestHandler<ResendMemberActivationCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ResendMemberActivationCommand request, CancellationToken ct)
    {
        var id = current.ApplicantAccountId;
        if (id is null) return Result<bool>.Failure("Non autorisé.");

        var demande = await context.Demandes.FirstOrDefaultAsync(d => d.Id == request.DemandeId && d.ApplicantAccountId == id, ct);
        if (demande is null) return Result<bool>.Failure("Demande introuvable.");
        if (demande.ResponseSentAt is null || demande.CreatedMemberId is null)
            return Result<bool>.Failure("Aucun compte membre n'est associé à cette demande.");

        var user = await context.Users.FirstOrDefaultAsync(u => u.MemberId == demande.CreatedMemberId, ct);
        if (user is null || !user.IsActive) return Result<bool>.Failure("Compte membre introuvable.");

        // Activation-link validity is configurable (member.activation_link_days, default 30).
        var activationDays = int.TryParse(await ApplicantHelpers.Setting(context, "member.activation_link_days", ct), out var ad) && ad > 0 ? ad : 30;
        // Fresh activation token (reuses the reset-token fields, redeemed at /reset-password?...&setup=1).
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace("+", "").Replace("/", "").Replace("=", "");
        user.PasswordResetToken = token;
        user.PasswordResetTokenExpiry = DateTime.UtcNow.AddDays(activationDays);
        await context.SaveChangesAsync(ct);

        var baseUrl = (await ApplicantHelpers.Setting(context, "app.base_url", ct) ?? "http://localhost:5173").TrimEnd('/');
        var link = $"{baseUrl}/reset-password?token={token}&email={Uri.EscapeDataString(user.Email)}&setup=1";

        // Deliver to the member's designated contact email (household primary → account email fallback).
        var member = await context.Members.Where(m => m.Id == demande.CreatedMemberId)
            .Select(m => new { m.FirstName, m.LastName, m.PrimaryContactEmail }).FirstAsync(ct);
        var accountEmail = await context.ApplicantAccounts.Where(a => a.Id == id).Select(a => a.Email).FirstOrDefaultAsync(ct);
        var to = !string.IsNullOrWhiteSpace(member.PrimaryContactEmail) ? member.PrimaryContactEmail! : accountEmail;
        if (string.IsNullOrWhiteSpace(to)) return Result<bool>.Failure("Aucune adresse email au dossier.");

        await emailQueue.EnqueueAsync(new EmailJob("account_activation", to!, new Dictionary<string, string>
        {
            ["memberName"] = $"{member.FirstName} {member.LastName}".Trim(),
            ["username"] = user.Email,
            ["activationLink"] = link,
            ["expiryDays"] = activationDays.ToString(),
        }), ct);

        return Result<bool>.Success(true);
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
            await emailQueue.EnqueueAsync(new EmailJob("household_lookup_code", email, new Dictionary<string, string> { ["code"] = code }), ct);
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
    string? PrimaryContactEmail = null, string? ParentsSituation = null) : IRequest<Result<bool>>;

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
        account.ParentsSituation = string.IsNullOrWhiteSpace(request.ParentsSituation) ? null : request.ParentsSituation.Trim();

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
                OtherGroupIsFormer = r.OtherGroupIsFormer,
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
        RuleFor(x => x.Email).MaximumLength(254).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email)).WithMessage("Adresse email invalide.").RealEmail();
        RuleFor(x => x.MedicalNotes).MaximumLength(2000);
        RuleFor(x => x.Allergies).MaximumLength(2000);
        RuleFor(x => x.ParentNotes).MaximumLength(2000);
        RuleFor(x => x.PreviousDemandeYear).MaximumLength(20).Must(NoHtml);
        RuleFor(x => x.DateOfBirth).Must(d => d == null || d.Value <= LebanonClock.Today)
            .WithMessage("La date de naissance ne peut pas être dans le futur.");
        // Sanity floor: catches a gross year typo (e.g. 1816 / 1916 instead of 2016 → an "age 210" applicant).
        // 30 years is generous — the oldest realistic new scout applicant is ~21 (Clan) — so this only rejects
        // obvious data-entry mistakes, never a legitimate youth, and the manual JJ/MM/AAAA wizard input can hit it.
        RuleFor(x => x.DateOfBirth).Must(d => d == null || d.Value >= LebanonClock.Today.AddYears(-30))
            .WithMessage("La date de naissance semble incorrecte (année trop ancienne).");
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
            g.RuleFor(x => x.Email).MaximumLength(254).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email)).WithMessage("Adresse email invalide.").RealEmail();
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
            .When(x => !string.IsNullOrWhiteSpace(x.PrimaryContactEmail)).RealEmail();
        RuleFor(x => x.ParentsSituation).Must(s => s is "Unis" or "Séparés" or "Divorcés")
            .When(x => !string.IsNullOrWhiteSpace(x.ParentsSituation))
            .WithMessage("Situation des parents invalide.");
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

public class SubmitDemandeCommandHandler(IApplicationDbContext context, ICurrentApplicantService current, IEmailQueue emailQueue) : IRequestHandler<SubmitDemandeCommand, Result<bool>>
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
        // Terms of service: the portal (ApplicantTermsGate) blocks the UI until accepted, but enforce it at the
        // API too (defense-in-depth) so the accepted-terms consent is real even for a crafted/direct submission.
        if (account.TermsAcceptedAt is null)
            return Result<bool>.Failure("Veuillez accepter les conditions d'inscription avant de soumettre une demande.");

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

        var guardians = await context.ApplicantGuardians.Where(g => g.ApplicantAccountId == id).ToListAsync(ct);
        if (guardians.Count == 0)
            return Result<bool>.Failure("Veuillez renseigner au moins un parent/tuteur avant de soumettre.");
        // #3 — every living parent/tuteur must have a phone number.
        if (guardians.Any(g => !g.IsDeceased && string.IsNullOrWhiteSpace(g.PhoneNumber)))
            return Result<bool>.Failure("Le numéro de téléphone de chaque parent/tuteur est obligatoire.");
        // #4 — the parents' situation (unis / séparés / divorcés) is required.
        if (string.IsNullOrWhiteSpace(account.ParentsSituation))
            return Result<bool>.Failure("Veuillez préciser la situation des parents (unis / séparés / divorcés).");

        // Only send the confirmation on the first Draft → Submitted transition (not on a re-submit).
        var wasSubmitted = demande.Status == DemandeStatus.Submitted;
        demande.Status = DemandeStatus.Submitted;
        demande.SubmittedAt = DateTime.UtcNow;
        // Assign the human-facing reference on the first submission only (drafts stay unnumbered). Retry on the
        // unique index in case two parents submit at the same instant and race the read-max+1 (the Status/
        // SubmittedAt changes ride along and persist on the successful save).
        if (demande.SerialNumber is null)
            demande.SerialNumber = await DemandeSerial.NextAsync(context, demande.ScoutYear, ct);
        for (var attempt = 0; ; attempt++)
        {
            try { await context.SaveChangesAsync(ct); break; }
            catch (DbUpdateException) when (attempt < 5 && demande.SerialNumber is not null)
            {
                demande.SerialNumber = await DemandeSerial.NextAsync(context, demande.ScoutYear, ct);
            }
        }

        // "We received your demande" confirmation email (configurable template) to the account holder — queued in
        // the background (best-effort; never fails the submit).
        if (!wasSubmitted)
            await emailQueue.EnqueueAsync(new EmailJob("demande_submitted", account.Email, new Dictionary<string, string>
            {
                ["contactName"] = account.ContactName ?? "",
                ["childName"] = $"{demande.FirstName} {demande.LastName}".Trim(),
                ["scoutYear"] = demande.ScoutYear,
                ["demandeNumber"] = demande.SerialNumber ?? "",
            }), ct);

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
