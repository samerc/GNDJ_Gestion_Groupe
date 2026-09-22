using System.Security.Cryptography;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members;

// ── "Comptes manquants" — create login accounts for members who don't have one ──
// Some members (imported leaders, older records) never got a login, so they can't sign in or receive access.
// This creates a synthetic prenom.nom@<domain> username for them. If the member has a contact email we send the
// same set-password ACTIVATION link as "Envoyer les accès"; if not, we return a TEMP PASSWORD for the CG to relay
// by hand (WhatsApp/paper). Gated members.reset_password (a CU can do their own unit; a CG the whole group).

public record MissingLoginDto(Guid MemberId, string MemberName, string? UnitName, string? UnitCode, bool HasEmail, string? ContactEmail);

// List active members WITHOUT a login. UnitId → that unit (unit-leader or group). Null → ALL active members
// across the group missing a login (INCLUDING maîtrise — accountless leaders matter), group-manager only.
public record GetMissingLoginsQuery(Guid? UnitId) : IRequest<Result<IReadOnlyList<MissingLoginDto>>>;

public class GetMissingLoginsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMissingLoginsQuery, Result<IReadOnlyList<MissingLoginDto>>>
{
    public async ValueTask<Result<IReadOnlyList<MissingLoginDto>>> Handle(GetMissingLoginsQuery request, CancellationToken ct)
    {
        List<Guid> activeIds;
        if (request.UnitId is Guid unitId)
        {
            if (!currentUser.IsSuperAdmin && !currentUser.AuthorizedUnitIds.Contains(unitId))
                return Result<IReadOnlyList<MissingLoginDto>>.Failure("Accès non autorisé à cette unité.");
            activeIds = await context.MemberAssignments
                .Where(a => a.UnitId == unitId && !a.IsDeleted && a.EndDate == null)
                .Select(a => a.MemberId).Distinct().ToListAsync(ct);
        }
        else
        {
            if (!MemberAccess.IsGroupManager(currentUser))
                return Result<IReadOnlyList<MissingLoginDto>>.Failure("Accès réservé au chef de groupe.");
            activeIds = await context.MemberAssignments
                .Where(a => !a.IsDeleted && a.EndDate == null)
                .Select(a => a.MemberId).Distinct().ToListAsync(ct);
        }
        if (activeIds.Count == 0) return Result<IReadOnlyList<MissingLoginDto>>.Success(new List<MissingLoginDto>());

        // "Has a login" = a non-deleted user row (the DbSet's soft-delete filter applies).
        var withLogin = (await context.Users.Where(u => activeIds.Contains(u.MemberId)).Select(u => u.MemberId).ToListAsync(ct)).ToHashSet();
        var missingIds = activeIds.Where(id => !withLogin.Contains(id)).ToList();
        if (missingIds.Count == 0) return Result<IReadOnlyList<MissingLoginDto>>.Success(new List<MissingLoginDto>());

        var members = await context.Members
            .Where(m => missingIds.Contains(m.Id) && !m.IsDeleted)
            .Select(m => new
            {
                m.Id, m.FirstName, m.LastName, m.PrimaryContactEmail,
                UnitName = m.Assignments.Where(a => a.EndDate == null && !a.IsDeleted).Select(a => a.Unit.Name).FirstOrDefault(),
                UnitCode = m.Assignments.Where(a => a.EndDate == null && !a.IsDeleted).Select(a => a.Unit.Code).FirstOrDefault()
            }).ToListAsync(ct);

        var resolver = await ContactEmailResolver.LoadAsync(context, members.Select(m => m.Id).ToList(), ct);
        var list = members
            .OrderBy(m => m.UnitName).ThenBy(m => m.LastName).ThenBy(m => m.FirstName)
            .Select(m =>
            {
                var email = resolver.Resolve(m.Id, m.PrimaryContactEmail);
                return new MissingLoginDto(m.Id, $"{m.FirstName} {m.LastName}".Trim(), m.UnitName, m.UnitCode, !string.IsNullOrWhiteSpace(email), email);
            }).ToList();
        return Result<IReadOnlyList<MissingLoginDto>>.Success(list);
    }
}

// ── Create a login for ONE member ──
public record CreateMemberLoginResult(string Username, string? TemporaryPassword, string? SentToEmail);
public record CreateMemberLoginCommand(Guid MemberId) : IRequest<Result<CreateMemberLoginResult>>;

public class CreateMemberLoginCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, IPasswordHasher hasher, IEmailQueue emailQueue, IAuditService audit)
    : IRequestHandler<CreateMemberLoginCommand, Result<CreateMemberLoginResult>>
{
    public async ValueTask<Result<CreateMemberLoginResult>> Handle(CreateMemberLoginCommand request, CancellationToken ct)
    {
        // Access: super-admin (CG) or an active leader of the member's unit — same rule as reset-password.
        if (!currentUser.IsSuperAdmin)
        {
            var authIds = currentUser.AuthorizedUnitIds;
            var ok = await context.MemberAssignments.AnyAsync(a =>
                a.MemberId == request.MemberId && !a.IsDeleted && a.EndDate == null && authIds.Contains(a.UnitId), ct);
            if (!ok) return Result<CreateMemberLoginResult>.Failure("Accès non autorisé à ce membre.");
        }

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == request.MemberId && !m.IsDeleted, ct);
        if (member is null) return Result<CreateMemberLoginResult>.Failure("Membre introuvable.");
        if (await context.Users.AnyAsync(u => u.MemberId == request.MemberId, ct))
            return Result<CreateMemberLoginResult>.Failure("Ce membre a déjà un compte.");

        var settings = await LoginProvisioning.LoadSettingsAsync(context, ct);
        var fatherName = await LoginProvisioning.FatherNameAsync(context, request.MemberId, ct);
        var resolver = await ContactEmailResolver.LoadAsync(context, [member.Id], ct);
        var contactEmail = resolver.Resolve(member.Id, member.PrimaryContactEmail);

        var jobs = new List<EmailJob>();
        var (username, tempPassword, sentEmail) = await LoginProvisioning.ProvisionAsync(
            context, hasher, member, fatherName, contactEmail, settings, new HashSet<string>(StringComparer.OrdinalIgnoreCase), jobs, ct);

        await context.SaveChangesAsync(ct);
        await emailQueue.EnqueueManyAsync(jobs, ct);
        await audit.LogAsync("CreateLogin", "User", null, newValues: new
        {
            Member = await AuditNames.MemberAsync(context, member.Id, ct), Username = username, EmailEnvoye = sentEmail
        }, cancellationToken: ct);

        return Result<CreateMemberLoginResult>.Success(new CreateMemberLoginResult(username, tempPassword, sentEmail));
    }
}

// ── Bulk create logins for a whole scope (unit / all active / an explicit list) ──
// No-email members are created too, and their credentials are returned in NoEmailCreds for the CG to relay
// (there aren't hundreds — the on-screen list stays manageable).
public record MissingLoginCred(Guid MemberId, string MemberName, string Username, string TemporaryPassword);
public record CreateMissingLoginsResult(int Created, int EmailSent, int AlreadyHad, int NoAccess, List<MissingLoginCred> NoEmailCreds);
public record CreateMissingLoginsCommand(Guid? UnitId, List<Guid>? MemberIds, bool AllActive) : IRequest<Result<CreateMissingLoginsResult>>;

public class CreateMissingLoginsCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, IPasswordHasher hasher, IEmailQueue emailQueue, IAuditService audit)
    : IRequestHandler<CreateMissingLoginsCommand, Result<CreateMissingLoginsResult>>
{
    public async ValueTask<Result<CreateMissingLoginsResult>> Handle(CreateMissingLoginsCommand request, CancellationToken ct)
    {
        // ── Resolve the target member set + enforce access (mirrors the send-access scoping) ──
        List<Guid> targetIds;
        int noAccess = 0;
        if (request.MemberIds is { Count: > 0 })
        {
            var requested = request.MemberIds.Distinct().ToList();
            targetIds = requested;
            if (!currentUser.IsSuperAdmin)
            {
                var authIds = currentUser.AuthorizedUnitIds;
                var allowed = await context.MemberAssignments
                    .Where(a => requested.Contains(a.MemberId) && !a.IsDeleted && a.EndDate == null && authIds.Contains(a.UnitId))
                    .Select(a => a.MemberId).Distinct().ToListAsync(ct);
                targetIds = requested.Where(allowed.Contains).ToList();
                noAccess = requested.Count - targetIds.Count;
            }
        }
        else if (request.AllActive)
        {
            if (!MemberAccess.IsGroupManager(currentUser))
                return Result<CreateMissingLoginsResult>.Failure("Accès réservé au chef de groupe.");
            targetIds = await context.MemberAssignments
                .Where(a => !a.IsDeleted && a.EndDate == null).Select(a => a.MemberId).Distinct().ToListAsync(ct);
        }
        else if (request.UnitId is Guid unitId)
        {
            if (!currentUser.IsSuperAdmin && !currentUser.AuthorizedUnitIds.Contains(unitId))
                return Result<CreateMissingLoginsResult>.Failure("Accès non autorisé à cette unité.");
            targetIds = await context.MemberAssignments
                .Where(a => a.UnitId == unitId && !a.IsDeleted && a.EndDate == null).Select(a => a.MemberId).Distinct().ToListAsync(ct);
        }
        else return Result<CreateMissingLoginsResult>.Failure("Précisez une unité ou une liste de membres.");

        if (targetIds.Count == 0)
            return Result<CreateMissingLoginsResult>.Success(new CreateMissingLoginsResult(0, 0, 0, noAccess, []));

        // Skip members who already have a login.
        var alreadyIds = (await context.Users.Where(u => targetIds.Contains(u.MemberId)).Select(u => u.MemberId).ToListAsync(ct)).ToHashSet();
        var toCreate = targetIds.Where(id => !alreadyIds.Contains(id)).ToList();
        int alreadyHad = targetIds.Count - toCreate.Count;
        if (toCreate.Count == 0)
            return Result<CreateMissingLoginsResult>.Success(new CreateMissingLoginsResult(0, 0, alreadyHad, noAccess, []));

        var members = await context.Members.Where(m => toCreate.Contains(m.Id) && !m.IsDeleted).ToListAsync(ct);
        var settings = await LoginProvisioning.LoadSettingsAsync(context, ct);
        var fatherByMember = await LoginProvisioning.FatherNamesAsync(context, toCreate, ct);
        var resolver = await ContactEmailResolver.LoadAsync(context, toCreate, ct);

        var jobs = new List<EmailJob>();
        var creds = new List<MissingLoginCred>();
        var taken = new HashSet<string>(StringComparer.OrdinalIgnoreCase);  // usernames assigned in THIS batch (not yet saved)
        int created = 0, emailSent = 0;

        foreach (var m in members.OrderBy(m => m.LastName).ThenBy(m => m.FirstName))
        {
            var contactEmail = resolver.Resolve(m.Id, m.PrimaryContactEmail);
            var (username, tempPassword, sentEmail) = await LoginProvisioning.ProvisionAsync(
                context, hasher, m, fatherByMember.GetValueOrDefault(m.Id), contactEmail, settings, taken, jobs, ct);
            created++;
            if (sentEmail is not null) emailSent++;
            else creds.Add(new MissingLoginCred(m.Id, $"{m.FirstName} {m.LastName}".Trim(), username, tempPassword!));
        }

        await context.SaveChangesAsync(ct);
        await emailQueue.EnqueueManyAsync(jobs, ct);
        await audit.LogAsync("CreateLogins", "User", null, newValues: new
        {
            created, emailSent, sansEmail = creds.Count, alreadyHad,
            Unit = request.AllActive ? "Tous les membres actifs" : await AuditNames.UnitAsync(context, request.UnitId, ct)
        }, cancellationToken: ct);

        return Result<CreateMissingLoginsResult>.Success(new CreateMissingLoginsResult(created, emailSent, alreadyHad, noAccess, creds));
    }
}

// Shared login-provisioning: settings + father-name lookup + the actual "create a User" step used by the single
// and bulk handlers so they behave identically.
static class LoginProvisioning
{
    public record LoginSettings(string Domain, string BaseUrl, int ActivationExpiryDays, string ScoutYear);

    public static async Task<LoginSettings> LoadSettingsAsync(IApplicationDbContext context, CancellationToken ct)
    {
        var domain = await UsernameFactory.GetDomainAsync(context, ct);
        var baseUrl = ((await context.Settings.Where(s => s.Key == "app.base_url").Select(s => s.Value).FirstOrDefaultAsync(ct))
            ?? "http://localhost:5173").TrimEnd('/');
        var days = int.TryParse(await context.Settings.Where(s => s.Key == "member.activation_link_days").Select(s => s.Value).FirstOrDefaultAsync(ct), out var d) && d > 0 ? d : 30;
        var year = await context.Settings.Where(s => s.Key == "passage.scout_year").Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "";
        return new LoginSettings(domain, baseUrl, days, year);
    }

    // The member's father's first name (for username disambiguation) — matched accent/case-insensitively on the
    // guardian-link relationship. Optional; null when there's no father on file.
    public static async Task<string?> FatherNameAsync(IApplicationDbContext context, Guid memberId, CancellationToken ct)
        => (await FatherNamesAsync(context, [memberId], ct)).GetValueOrDefault(memberId);

    public static async Task<Dictionary<Guid, string>> FatherNamesAsync(IApplicationDbContext context, List<Guid> memberIds, CancellationToken ct)
    {
        var links = await context.GuardianLinks
            .Where(l => memberIds.Contains(l.MemberId) && !l.Guardian.IsDeleted)
            .Select(l => new { l.MemberId, l.RelationshipType, l.Guardian.FirstName })
            .ToListAsync(ct);
        return links
            .Where(l => TextNormalization.NormalizeKey(l.RelationshipType ?? "").Contains("pere"))
            .GroupBy(l => l.MemberId)
            .ToDictionary(g => g.Key, g => g.First().FirstName);
    }

    // Create the User. Email present → activation link (they set their own password, MustChangePassword=false);
    // no email → temp password returned for the CG to relay (MustChangePassword=true). Adds the User to the context
    // and, when sending, an EmailJob to `jobs`. Does NOT SaveChanges (the caller owns the transaction).
    public static async Task<(string Username, string? TempPassword, string? SentEmail)> ProvisionAsync(
        IApplicationDbContext context, IPasswordHasher hasher, Member member, string? fatherName, string? contactEmail,
        LoginSettings s, ISet<string> taken, List<EmailJob> jobs, CancellationToken ct)
    {
        var username = await UsernameFactory.GenerateUniqueAsync(context, member.FirstName, member.LastName, fatherName, s.Domain, ct, taken);
        taken.Add(username);

        var tempPassword = $"Scout{DateTime.UtcNow.Year}!{Random.Shared.Next(100, 999)}";
        var user = new User
        {
            MemberId = member.Id,
            Email = username,
            PasswordHash = await hasher.HashAsync(tempPassword),
            IsActive = true,
            IsSuperAdmin = false,
            MustChangePassword = true,
        };
        context.Users.Add(user);

        if (!string.IsNullOrWhiteSpace(contactEmail))
        {
            // Reuse the reset-token fields as a set-password activation token (redeemed at /reset-password?...&setup=1).
            var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace("+", "").Replace("/", "").Replace("=", "");
            user.PasswordResetToken = token;
            user.PasswordResetTokenExpiry = DateTime.UtcNow.AddDays(s.ActivationExpiryDays);
            user.MustChangePassword = false;   // the activation link sets their password
            var link = $"{s.BaseUrl}/reset-password?token={token}&email={Uri.EscapeDataString(username)}&setup=1";
            jobs.Add(new EmailJob("account_activation", contactEmail!, new Dictionary<string, string>
            {
                ["memberName"] = $"{member.FirstName} {member.LastName}".Trim(),
                ["username"] = username,
                ["activationLink"] = link,
                ["expiryDays"] = s.ActivationExpiryDays.ToString(),
                ["loginUrl"] = s.BaseUrl,
                ["scoutYear"] = s.ScoutYear,
            }));
            return (username, null, contactEmail);
        }

        // No email → temp password shown on screen for the CG to relay by hand.
        return (username, tempPassword, null);
    }
}
