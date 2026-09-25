using GNDJ.Application.Auth.Common;
using System.Security.Cryptography;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Applicants;

// "Inscrire un frère ou une sœur" from Ma fiche. A parent signed in as their child starts a demande for a younger
// sibling WITHOUT the email-code step: the family is already known, so the server
//  1. picks the family email on the member's file (courriel principal → a parent's email → the member's own),
//  2. finds the family's parent-portal account for that email, or creates it (already verified — the member
//     account proves the family; a random password: the parent can use "mot de passe oublié" in the portal),
//  3. on a NEW or still-empty account, prefills parents + address and adds the household's members as
//     "frère / sœur" proches — as SUGGESTIONS only (the CG confirms each link with "Lier", like every other match),
//  4. returns a portal session so the page can open the new-demande wizard directly.
// The submission window / terms / caps are still enforced by the portal itself.
public record StartSiblingDemandeCommand : IRequest<Result<ApplicantAuthDto>>;

public class StartSiblingDemandeCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser,
    IPasswordHasher hasher, ITokenService tokens, IAuditService audit)
    : IRequestHandler<StartSiblingDemandeCommand, Result<ApplicantAuthDto>>
{
    public async ValueTask<Result<ApplicantAuthDto>> Handle(StartSiblingDemandeCommand request, CancellationToken ct)
    {
        if (currentUser.MemberId is not Guid memberId) return Result<ApplicantAuthDto>.Failure("Aucun membre associé à ce compte.");

        var config = await ApplicantHelpers.BuildConfig(context, ct);
        if (!config.IsOpen) return Result<ApplicantAuthDto>.Failure("Les inscriptions ne sont pas ouvertes pour le moment.");

        // 1. The family email on this member's file.
        var member = await context.Members.Where(m => m.Id == memberId)
            .Select(m => new { m.PrimaryContactEmail }).FirstOrDefaultAsync(ct);
        if (member is null) return Result<ApplicantAuthDto>.Failure("Membre introuvable.");
        var guardianEmail = await context.GuardianLinks
            .Where(l => l.MemberId == memberId && !l.IsDeleted)
            .SelectMany(l => l.Guardian.Emails.Where(e => !e.IsDeleted))
            .OrderByDescending(e => e.IsPrimary).Select(e => e.Address).FirstOrDefaultAsync(ct);
        var ownEmail = await context.MemberEmails.Where(e => e.MemberId == memberId && !e.IsDeleted)
            .OrderByDescending(e => e.IsPrimary).Select(e => e.Address).FirstOrDefaultAsync(ct);
        var email = new[] { member.PrimaryContactEmail, guardianEmail, ownEmail }
            .FirstOrDefault(e => !string.IsNullOrWhiteSpace(e))?.Trim().ToLowerInvariant();
        if (email is null)
            return Result<ApplicantAuthDto>.Failure("Aucun courriel de famille sur votre fiche. Ajoutez un courriel (onglet Contact & famille) puis réessayez.");

        // 2. The family's portal account (created if needed).
        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Email.ToLower() == email, ct);
        var created = false;
        if (account is null)
        {
            var randomPassword = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24));
            account = new ApplicantAccount
            {
                Email = email,
                PasswordHash = await hasher.HashAsync(randomPassword),
                EmailVerified = true, // the family is already known (member account) — no verification dead-end
            };
            context.ApplicantAccounts.Add(account);
            created = true;
        }
        else if (!account.EmailVerified) { account.EmailVerified = true; account.EmailVerificationToken = null; }

        // 3. Prefill the household on a new / still-empty account (never overwrite what the family already entered).
        var hasGuardians = !created && await context.ApplicantGuardians.AnyAsync(g => g.ApplicantAccountId == account.Id, ct);
        if (!hasGuardians)
        {
            var household = await HouseholdLookup.BuildAsync(context, [memberId], ct);
            account.AddressCountry ??= household.AddressCountry;
            account.AddressCity ??= household.AddressCity;
            account.AddressDetails ??= household.AddressDetails;
            account.PrimaryContactEmail ??= email;
            account.ContactName ??= household.Guardians.Select(g => $"{g.FirstName} {g.LastName}".Trim()).FirstOrDefault();
            foreach (var g in household.Guardians)
                context.ApplicantGuardians.Add(new ApplicantGuardian
                {
                    ApplicantAccountId = account.Id, Relationship = g.Relationship, FirstName = g.FirstName, LastName = g.LastName,
                    Profession = g.Profession, ProfessionDomain = g.ProfessionDomain,
                    PhoneCountryCode = g.PhoneCountryCode, PhoneNumber = g.PhoneNumber, Email = g.Email,
                    IsDeceased = g.IsDeceased, IsPrimaryContact = g.IsPrimaryContact, IsEmergencyContact = g.IsEmergencyContact,
                });
            var existingRelations = created ? [] : await context.ApplicantScoutRelations
                .Where(r => r.ApplicantAccountId == account.Id).Select(r => new { r.SuggestedMemberId, r.RelatedMemberId }).ToListAsync(ct);
            foreach (var m in household.Members)
            {
                if (existingRelations.Any(r => r.SuggestedMemberId == m.Id || r.RelatedMemberId == m.Id)) continue;
                var parts = m.Name.Split(' ', 2);
                context.ApplicantScoutRelations.Add(new ApplicantScoutRelation
                {
                    ApplicantAccountId = account.Id, Status = "CurrentInGroup", Relationship = "Frère / Sœur",
                    SuggestedMemberId = m.Id, // a suggestion: the CG confirms the link ("Lier")
                    FirstName = parts[0], LastName = parts.Length > 1 ? parts[1] : null, LastUnit = m.Unit,
                });
            }
        }

        // 4. A portal session for this account.
        var refresh = await ApplicantSessions.StartAsync(context, tokens, hasher, currentUser, account.Id, true, ct);
        account.LastLoginAt = DateTime.UtcNow;
        await context.SaveChangesAsync(ct);

        await audit.LogAsync("StartSiblingDemande", "ApplicantAccount", account.Id, newValues: new
        {
            Member = await AuditNames.MemberAsync(context, memberId, ct), account.Email, AccountCreated = created,
        }, cancellationToken: ct);

        var access = tokens.GenerateApplicantToken(account);
        return Result<ApplicantAuthDto>.Success(new ApplicantAuthDto(account.Id, account.Email, account.EmailVerified, access, refresh, DateTime.UtcNow.AddMinutes(15)));
    }
}
