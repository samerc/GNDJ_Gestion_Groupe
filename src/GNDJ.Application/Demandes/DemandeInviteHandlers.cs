using System.Security.Cryptography;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// Late-submission INVITES. The submission window is global (once demande.submission_deadline passes, or the CG
// closes submissions, NOBODY can create/edit/submit). Sometimes the CG wants to let ONE specific family enroll
// after the deadline without reopening for everyone. The CG generates an invite link; the family opens it to
// register (new) or claim it (existing account); claiming stamps ApplicantAccount.LateSubmissionUntil, which the
// submission gates honor. Single-use, expiry-bounded, revocable. All the CG endpoints are demande.manage +
// whole-group-manager gated; the token-lookup is anonymous (needed by the public invite page) and leaks nothing
// beyond the label + expiry; the claim is applicant-authenticated (own account).

public record DemandeInviteDto(Guid Id, string Token, string ScoutYear, string? Label, string? Email,
    DateOnly ExpiresAt, string Status, string? ClaimedEmail, DateTime? ClaimedAt, DateTime CreatedAt);

// Public (anonymous) view for the invite page: just enough to show "valid until … for …", never the account data.
public record DemandeInviteInfoDto(bool Valid, string? Label, DateOnly? ExpiresAt, string? Reason);

public record ClaimInviteResult(DateOnly ExpiresAt);

// Computes the human status of an invite (mirrored on the frontend for the badge).
internal static class InviteStatus
{
    public static string Of(DemandeInvite i, DateOnly today) =>
        i.RevokedAt != null ? "revoked"
        : i.ClaimedByAccountId != null ? "claimed"
        : i.ExpiresAt < today ? "expired"
        : "active";
}

// ── CG: create an invite ──────────────────────────────────────────────────────────────────────
public record CreateDemandeInviteCommand(string? Label, string? Email, int? ValidDays) : IRequest<Result<DemandeInviteDto>>;

public class CreateDemandeInviteCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<CreateDemandeInviteCommand, Result<DemandeInviteDto>>
{
    public async ValueTask<Result<DemandeInviteDto>> Handle(CreateDemandeInviteCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<DemandeInviteDto>.Failure("Action non autorisée.");

        // Which campaign the late demande belongs to (same resolution as the applicant config).
        var scoutYear = await context.Settings.Where(s => s.Key == "demande.scout_year").Select(s => s.Value).FirstOrDefaultAsync(ct)
            ?? await context.Settings.Where(s => s.Key == "passage.scout_year").Select(s => s.Value).FirstOrDefaultAsync(ct)
            ?? "2026-2027";

        // Link validity (also the granted late-submission window). Default 14 days; clamp to a sane range.
        var days = Math.Clamp(request.ValidDays ?? 14, 1, 90);
        var expires = LebanonClock.Today.AddDays(days);

        // URL-safe random secret (32 hex chars = 128 bits).
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();

        var invite = new DemandeInvite
        {
            Token = token,
            ScoutYear = scoutYear,
            Label = string.IsNullOrWhiteSpace(request.Label) ? null : request.Label.Trim(),
            Email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim().ToLowerInvariant(),
            ExpiresAt = expires,
            CreatedByUserId = currentUser.UserId ?? Guid.Empty,
        };
        context.DemandeInvites.Add(invite);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("CreateInvite", "DemandeInvite", invite.Id,
            newValues: new { invite.Label, invite.Email, invite.ExpiresAt, invite.ScoutYear }, cancellationToken: ct);

        return Result<DemandeInviteDto>.Success(new DemandeInviteDto(
            invite.Id, invite.Token, invite.ScoutYear, invite.Label, invite.Email, invite.ExpiresAt,
            "active", null, null, invite.CreatedAt));
    }
}

// ── CG: list invites ──────────────────────────────────────────────────────────────────────────
public record GetDemandeInvitesQuery() : IRequest<Result<IReadOnlyList<DemandeInviteDto>>>;

public class GetDemandeInvitesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetDemandeInvitesQuery, Result<IReadOnlyList<DemandeInviteDto>>>
{
    public async ValueTask<Result<IReadOnlyList<DemandeInviteDto>>> Handle(GetDemandeInvitesQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<IReadOnlyList<DemandeInviteDto>>.Success([]);

        var today = LebanonClock.Today;
        var rows = await context.DemandeInvites.OrderByDescending(i => i.CreatedAt).Take(500)
            // Left-join the claiming account's email (for the CG to see who used it).
            .Select(i => new
            {
                i.Id, i.Token, i.ScoutYear, i.Label, i.Email, i.ExpiresAt, i.RevokedAt, i.ClaimedByAccountId, i.ClaimedAt, i.CreatedAt,
                ClaimedEmail = context.ApplicantAccounts.Where(a => a.Id == i.ClaimedByAccountId).Select(a => a.Email).FirstOrDefault(),
            })
            .ToListAsync(ct);

        var dtos = rows.Select(i => new DemandeInviteDto(
            i.Id, i.Token, i.ScoutYear, i.Label, i.Email, i.ExpiresAt,
            i.RevokedAt != null ? "revoked" : i.ClaimedByAccountId != null ? "claimed" : i.ExpiresAt < today ? "expired" : "active",
            i.ClaimedEmail, i.ClaimedAt, i.CreatedAt)).ToList();

        return Result<IReadOnlyList<DemandeInviteDto>>.Success(dtos);
    }
}

// ── CG: revoke an invite (kept in the table for the trail; just marked revoked) ─────────────────
public record RevokeDemandeInviteCommand(Guid Id) : IRequest<Result<bool>>;

public class RevokeDemandeInviteCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<RevokeDemandeInviteCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(RevokeDemandeInviteCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<bool>.Failure("Action non autorisée.");

        var invite = await context.DemandeInvites.FirstOrDefaultAsync(i => i.Id == request.Id, ct);
        if (invite is null) return Result<bool>.Failure("Invitation introuvable.");
        if (invite.RevokedAt is null)
        {
            invite.RevokedAt = DateTime.UtcNow;
            await context.SaveChangesAsync(ct);
            await audit.LogAsync("RevokeInvite", "DemandeInvite", invite.Id, newValues: new { invite.Label, invite.Email }, cancellationToken: ct);
        }
        return Result<bool>.Success(true);
    }
}

// ── Public (anonymous): validate a token so the invite page can show its state ──────────────────
public record GetDemandeInviteInfoQuery(string Token) : IRequest<Result<DemandeInviteInfoDto>>;

public class GetDemandeInviteInfoQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetDemandeInviteInfoQuery, Result<DemandeInviteInfoDto>>
{
    public async ValueTask<Result<DemandeInviteInfoDto>> Handle(GetDemandeInviteInfoQuery request, CancellationToken ct)
    {
        var tok = request.Token?.Trim() ?? "";
        var invite = await context.DemandeInvites.FirstOrDefaultAsync(i => i.Token == tok, ct);
        if (invite is null) return Result<DemandeInviteInfoDto>.Success(new(false, null, null, "Lien d'invitation invalide."));
        if (invite.RevokedAt != null) return Result<DemandeInviteInfoDto>.Success(new(false, invite.Label, invite.ExpiresAt, "Cette invitation a été annulée."));
        if (invite.ClaimedByAccountId != null) return Result<DemandeInviteInfoDto>.Success(new(false, invite.Label, invite.ExpiresAt, "Cette invitation a déjà été utilisée."));
        if (invite.ExpiresAt < LebanonClock.Today) return Result<DemandeInviteInfoDto>.Success(new(false, invite.Label, invite.ExpiresAt, "Cette invitation a expiré."));
        return Result<DemandeInviteInfoDto>.Success(new(true, invite.Label, invite.ExpiresAt, null));
    }
}

// ── Applicant (authenticated): claim an invite with an EXISTING account → grants late submission ─
public record ClaimDemandeInviteCommand(string Token) : IRequest<Result<ClaimInviteResult>>;

public class ClaimDemandeInviteCommandHandler(IApplicationDbContext context, ICurrentApplicantService current)
    : IRequestHandler<ClaimDemandeInviteCommand, Result<ClaimInviteResult>>
{
    public async ValueTask<Result<ClaimInviteResult>> Handle(ClaimDemandeInviteCommand request, CancellationToken ct)
    {
        var id = current.ApplicantAccountId;
        if (id is null) return Result<ClaimInviteResult>.Failure("Non autorisé.");

        var tok = request.Token?.Trim() ?? "";
        var invite = await context.DemandeInvites.FirstOrDefaultAsync(i => i.Token == tok, ct);
        if (invite is null) return Result<ClaimInviteResult>.Failure("Lien d'invitation invalide.");
        if (invite.RevokedAt != null) return Result<ClaimInviteResult>.Failure("Cette invitation a été annulée.");
        if (invite.ExpiresAt < LebanonClock.Today) return Result<ClaimInviteResult>.Failure("Cette invitation a expiré.");
        // Single-use: only re-usable by the SAME account that already claimed it (idempotent re-open of the link).
        if (invite.ClaimedByAccountId != null && invite.ClaimedByAccountId != id)
            return Result<ClaimInviteResult>.Failure("Cette invitation a déjà été utilisée par un autre compte.");

        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (account is null) return Result<ClaimInviteResult>.Failure("Compte introuvable.");

        // Grant late submission until the invite's expiry (never shorten an existing, later grant).
        if (account.LateSubmissionUntil is null || account.LateSubmissionUntil < invite.ExpiresAt)
            account.LateSubmissionUntil = invite.ExpiresAt;
        if (invite.ClaimedByAccountId is null)
        {
            invite.ClaimedByAccountId = id;
            invite.ClaimedAt = DateTime.UtcNow;
        }
        await context.SaveChangesAsync(ct);
        return Result<ClaimInviteResult>.Success(new ClaimInviteResult(invite.ExpiresAt));
    }
}
