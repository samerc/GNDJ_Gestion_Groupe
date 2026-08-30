using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// CG tools for the applicant (parent) ACCOUNTS behind demandes — distinct from the demandes themselves.
// The reason this exists: email verification is REQUIRED to submit a demande, so a parent whose verification
// email never arrives (dead address, spam) is stuck and has NO demande for the CG to act on. This gives the CG
// a list of accounts (incl. unverified ones with no demande) + a "verify manually" safety valve.

// One applicant account row for the CG list.
public record DemandeAccountDto(
    Guid Id,
    string Email,
    string? ContactName,
    bool EmailVerified,
    bool IsActive,
    int DemandeCount,        // total demandes on the account (any status)
    int SubmittedCount,      // demandes actually submitted (not drafts)
    DateTime CreatedAt);

// List applicant accounts, optionally only the ones still unverified (the ones a CG would fix).
public record GetDemandeAccountsQuery(bool UnverifiedOnly = false, string? Search = null)
    : IRequest<Result<IReadOnlyList<DemandeAccountDto>>>;

public class GetDemandeAccountsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetDemandeAccountsQuery, Result<IReadOnlyList<DemandeAccountDto>>>
{
    public async ValueTask<Result<IReadOnlyList<DemandeAccountDto>>> Handle(GetDemandeAccountsQuery request, CancellationToken ct)
    {
        // Group-wide enrolment data (parent PII) — restrict to a whole-group manager, like the review/stats lists.
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<IReadOnlyList<DemandeAccountDto>>.Success([]);

        var q = context.ApplicantAccounts.AsQueryable();
        if (request.UnverifiedOnly)
            q = q.Where(a => !a.EmailVerified);
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToLower();
            q = q.Where(a => a.Email.ToLower().Contains(term)
                          || (a.ContactName != null && a.ContactName.ToLower().Contains(term)));
        }

        var rows = await q
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new DemandeAccountDto(
                a.Id,
                a.Email,
                a.ContactName,
                a.EmailVerified,
                a.IsActive,
                a.Demandes.Count,
                a.Demandes.Count(d => d.SubmittedAt != null),
                a.CreatedAt))
            .Take(500)
            .ToListAsync(ct);

        return Result<IReadOnlyList<DemandeAccountDto>>.Success(rows);
    }
}

// Returned once so the CG can relay the new portal credentials to the parent.
public record ResetApplicantPasswordResult(string Email, string TemporaryPassword);

// CG resets an applicant (parent) portal login: sets a fresh temp password and invalidates any active
// session + pending reset link. Shown once on screen for the CG to relay (there's no forced-change flow
// for applicants — the parent can change it later via "mot de passe oublié").
public record ResetApplicantPasswordCommand(Guid AccountId) : IRequest<Result<ResetApplicantPasswordResult>>;

public class ResetApplicantPasswordCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, IPasswordHasher passwordHasher, IAuditService audit)
    : IRequestHandler<ResetApplicantPasswordCommand, Result<ResetApplicantPasswordResult>>
{
    public async ValueTask<Result<ResetApplicantPasswordResult>> Handle(ResetApplicantPasswordCommand request, CancellationToken ct)
    {
        // Same authority as posting decisions / manual-verify — a whole-group manager. (Controller also gates demande.manage.)
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<ResetApplicantPasswordResult>.Failure("Action non autorisée.");

        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Id == request.AccountId, ct);
        if (account is null)
            return Result<ResetApplicantPasswordResult>.Failure("Compte introuvable.");

        // Same temp-password shape as member creation/reset.
        var tempPassword = $"Scout{DateTime.UtcNow.Year}!{Random.Shared.Next(100, 999)}";
        account.PasswordHash = await passwordHasher.HashAsync(tempPassword);
        // Invalidate any active session + pending reset link so the old credentials can't be replayed.
        account.RefreshToken = null;
        account.RefreshTokenExpiry = null;
        account.PasswordResetToken = null;
        account.PasswordResetTokenExpiry = null;

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("ResetApplicantPassword", "ApplicantAccount", account.Id,
            newValues: new { account.Email }, cancellationToken: ct);

        return Result<ResetApplicantPasswordResult>.Success(new ResetApplicantPasswordResult(account.Email, tempPassword));
    }
}

// Returned so the confirm/toast can report what was removed.
public record DeleteApplicantAccountResult(int DemandesDeleted);

// CG hard-deletes an applicant (parent) account AND everything on it — its demandes, guardians and scout
// relations — in one transaction (mirrors the campaign-close cascade, scoped to one account). Any member
// already CREATED from a demande on this account is kept (the member is a separate record; only the
// applicant-side data goes). Irreversible.
public record DeleteApplicantAccountCommand(Guid AccountId) : IRequest<Result<DeleteApplicantAccountResult>>;

public class DeleteApplicantAccountCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<DeleteApplicantAccountCommand, Result<DeleteApplicantAccountResult>>
{
    public async ValueTask<Result<DeleteApplicantAccountResult>> Handle(DeleteApplicantAccountCommand request, CancellationToken ct)
    {
        // Same authority as posting decisions / manual-verify — a whole-group manager. (Controller also gates demande.manage.)
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<DeleteApplicantAccountResult>.Failure("Action non autorisée.");

        var account = await context.ApplicantAccounts.IgnoreQueryFilters()
            .FirstOrDefaultAsync(a => a.Id == request.AccountId, ct);
        if (account is null)
            return Result<DeleteApplicantAccountResult>.Failure("Compte introuvable.");

        var id = account.Id;
        await using var tx = await context.BeginTransactionAsync(ct);

        // FK order: demandes → relations/guardians → account. ExecuteDelete hard-deletes (bypasses the
        // soft-delete interceptor); IgnoreQueryFilters so any already-soft-deleted rows go too.
        var demandesDeleted = await context.Demandes.IgnoreQueryFilters()
            .Where(d => d.ApplicantAccountId == id).ExecuteDeleteAsync(ct);
        await context.ApplicantScoutRelations.IgnoreQueryFilters()
            .Where(r => r.ApplicantAccountId == id).ExecuteDeleteAsync(ct);
        await context.ApplicantGuardians.IgnoreQueryFilters()
            .Where(g => g.ApplicantAccountId == id).ExecuteDeleteAsync(ct);
        await context.ApplicantAccounts.IgnoreQueryFilters()
            .Where(a => a.Id == id).ExecuteDeleteAsync(ct);

        await tx.CommitAsync(ct);
        await audit.LogAsync("DeleteAccount", "ApplicantAccount", id,
            newValues: new { account.Email, DemandesDeleted = demandesDeleted }, cancellationToken: ct);

        return Result<DeleteApplicantAccountResult>.Success(new DeleteApplicantAccountResult(demandesDeleted));
    }
}

// Manually mark an applicant account's email as verified (CG safety net when the verification email failed).
public record VerifyApplicantEmailManuallyCommand(Guid AccountId) : IRequest<Result<bool>>;

public class VerifyApplicantEmailManuallyCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<VerifyApplicantEmailManuallyCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(VerifyApplicantEmailManuallyCommand request, CancellationToken ct)
    {
        // Same authority as posting decisions — a whole-group manager. (The controller also gates demande.manage.)
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<bool>.Failure("Action non autorisée.");

        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Id == request.AccountId, ct);
        if (account is null)
            return Result<bool>.Failure("Compte introuvable.");

        if (account.EmailVerified)
            return Result<bool>.Success(true); // already verified — idempotent

        account.EmailVerified = true;
        // Clear the pending token so the (now moot) link can't be replayed.
        account.EmailVerificationToken = null;
        account.EmailVerificationTokenExpiry = null;
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("VerifyEmailManual", "ApplicantAccount", account.Id,
            newValues: new { account.Email }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
