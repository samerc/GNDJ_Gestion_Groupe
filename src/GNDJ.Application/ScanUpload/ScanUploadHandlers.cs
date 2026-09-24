using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Documents;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;

namespace GNDJ.Application.ScanUpload;

// "Scanner un document avec le téléphone" — a desktop→phone hand-off for document upload.
//
// Flow: on the DESKTOP a leader (or a member on their own laptop) opens a session for a member; the desktop
// shows a QR of {origin}/scan-upload/{token}; the phone opens that URL WITHOUT logging in (the token is a
// scoped, short-lived capability) and photographs the paper, which uploads straight into the member's dossier
// at the chosen document type. The desktop polls the session and refreshes when a document arrives.
//
// Security: the session is created only by a user who can already access that member (MemberAccess), the raw
// token is never stored (only its SHA-256 hash), it expires quickly, is capped, and can only UPLOAD. Worst case
// if a QR leaks: one unwanted document on one member, which a leader reviews before accepting anyway.
public static class ScanUploadConstants
{
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromMinutes(10);
    public const int MaxUploadsPerSession = 30; // hard cap so a leaked link can't spam a dossier
}

// Random token generation + hashing. The raw token travels in the QR/URL; only its hash is persisted.
static class ScanUploadToken
{
    public static (string raw, string hash) Generate()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        // URL-safe base64 (no padding) so it's a clean path segment.
        var raw = Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return (raw, Hash(raw));
    }

    public static string Hash(string raw)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));

    // "Jean D." — first name + last initial only (confirms the target on the phone without leaking the full name).
    public static string MemberLabel(string firstName, string lastName)
    {
        var first = (firstName ?? string.Empty).Trim();
        var last = (lastName ?? string.Empty).Trim();
        return string.IsNullOrEmpty(last) ? first : $"{first} {last[0]}.".Trim();
    }
}

// ── Create a session (DESKTOP, authenticated) ────────────────────────────────
public record CreateUploadSessionResult(Guid Id, string Token, DateTime ExpiresAt);
public record CreateUploadSessionCommand(Guid MemberId) : IRequest<Result<CreateUploadSessionResult>>;

public class CreateUploadSessionCommandValidator : AbstractValidator<CreateUploadSessionCommand>
{
    public CreateUploadSessionCommandValidator() => RuleFor(x => x.MemberId).NotEmpty();
}

public class CreateUploadSessionCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<CreateUploadSessionCommand, Result<CreateUploadSessionResult>>
{
    public async ValueTask<Result<CreateUploadSessionResult>> Handle(CreateUploadSessionCommand request, CancellationToken ct)
    {
        // Same authorization as uploading a document for the member (own record, or a members.edit leader of the
        // member's unit). A youth can only open a session for themselves.
        if (!await MemberAccess.CanAccessMemberAsync(context, currentUser, request.MemberId, ct))
            return Result<CreateUploadSessionResult>.Failure("Accès non autorisé à ce membre.");

        // Existence guard: a non-super-admin's access check already implies the member exists (it requires an
        // active assignment), but a super-admin bypasses that — so verify the member is real (and not soft-deleted,
        // the query filter applies) to avoid minting a session that the phone can't resolve ("Membre introuvable").
        if (!await context.Members.AnyAsync(m => m.Id == request.MemberId, ct))
            return Result<CreateUploadSessionResult>.Failure("Membre introuvable.");

        // Respect the document-verification campaign / on-hold gate at creation time: a member whose deposit
        // window is closed can't scan-upload either (leaders bypass, exactly like the normal upload). Because we
        // gate here, we don't need to re-check inside the short session window (the campaign won't flip in 10 min).
        var block = await DocumentAccessHelper.MemberUploadBlockReasonAsync(context, currentUser, request.MemberId, ct);
        if (block is not null) return Result<CreateUploadSessionResult>.Failure(block);

        var (raw, hash) = ScanUploadToken.Generate();
        var now = DateTime.UtcNow;
        var session = new UploadSession
        {
            TokenHash = hash,
            MemberId = request.MemberId,
            CreatedByUserId = currentUser.UserId ?? Guid.Empty,
            ExpiresAt = now.Add(ScanUploadConstants.SessionLifetime),
            CreatedAt = now
        };
        context.UploadSessions.Add(session);
        await context.SaveChangesAsync(ct);

        return Result<CreateUploadSessionResult>.Success(new CreateUploadSessionResult(session.Id, raw, session.ExpiresAt));
    }
}

// ── Poll a session (DESKTOP, authenticated) ──────────────────────────────────
public record UploadSessionStatusDto(int UploadedCount, bool Expired);
public record GetUploadSessionStatusQuery(Guid Id) : IRequest<Result<UploadSessionStatusDto>>;

public class GetUploadSessionStatusQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetUploadSessionStatusQuery, Result<UploadSessionStatusDto>>
{
    public async ValueTask<Result<UploadSessionStatusDto>> Handle(GetUploadSessionStatusQuery request, CancellationToken ct)
    {
        var s = await context.UploadSessions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (s is null) return Result<UploadSessionStatusDto>.Failure("Session introuvable.");
        // Only the creator (or a super-admin) may poll a session's status.
        if (!currentUser.IsSuperAdmin && s.CreatedByUserId != currentUser.UserId)
            return Result<UploadSessionStatusDto>.Failure("Accès non autorisé.");
        return Result<UploadSessionStatusDto>.Success(new UploadSessionStatusDto(s.UploadedCount, s.ExpiresAt <= DateTime.UtcNow));
    }
}

// ── Read minimal session info (PHONE, anonymous) ─────────────────────────────
public record ScanDocTypeDto(Guid Id, string Name, bool RequiresExpiry);
public record ScanUploadInfoDto(string MemberLabel, IReadOnlyList<ScanDocTypeDto> DocTypes, DateTime ExpiresAt);
public record GetScanUploadInfoQuery(string Token) : IRequest<Result<ScanUploadInfoDto>>;

public class GetScanUploadInfoQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetScanUploadInfoQuery, Result<ScanUploadInfoDto>>
{
    public async ValueTask<Result<ScanUploadInfoDto>> Handle(GetScanUploadInfoQuery request, CancellationToken ct)
    {
        var session = await ResolveValidSessionAsync(context, request.Token, ct);
        if (session is null) return Result<ScanUploadInfoDto>.Failure("Ce lien a expiré ou n'est plus valide. Demandez un nouveau code sur l'ordinateur.");

        var member = await context.Members
            .Where(m => m.Id == session.MemberId)
            .Select(m => new { m.FirstName, m.LastName })
            .FirstOrDefaultAsync(ct);
        if (member is null) return Result<ScanUploadInfoDto>.Failure("Membre introuvable.");

        // Same active document types the member sees in-app (nothing sensitive: it's the required-docs checklist).
        var docTypes = await context.DocumentTypes
            .Where(d => d.IsActive)
            .OrderBy(d => d.DisplayOrder).ThenBy(d => d.Name)
            .Select(d => new ScanDocTypeDto(d.Id, d.Name, d.RequiresExpiry))
            .ToListAsync(ct);

        return Result<ScanUploadInfoDto>.Success(new ScanUploadInfoDto(
            ScanUploadToken.MemberLabel(member.FirstName, member.LastName), docTypes, session.ExpiresAt));
    }

    internal static async Task<UploadSession?> ResolveValidSessionAsync(IApplicationDbContext context, string token, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        var hash = ScanUploadToken.Hash(token);
        var s = await context.UploadSessions.FirstOrDefaultAsync(x => x.TokenHash == hash, ct);
        if (s is null || s.ExpiresAt <= DateTime.UtcNow) return null;
        return s;
    }
}

// ── Upload a photographed document (PHONE, anonymous — token-authorized) ──────
// The controller already saved + validated the files (size/extension/magic bytes). This resolves the session
// from the token, then routes into the SAME write path as a normal upload (create-or-append, auto-approve,
// audit), attributed to the session's creator, and bumps the session counter so the desktop sees it arrive.
public record ScanUploadDocumentCommand(string Token, Guid DocumentTypeId, DateOnly? ExpiryDate, IReadOnlyList<SavedDocFile> Files) : IRequest<Result<Guid>>;

public class ScanUploadDocumentCommandValidator : AbstractValidator<ScanUploadDocumentCommand>
{
    public ScanUploadDocumentCommandValidator()
    {
        RuleFor(x => x.Token).NotEmpty().MaximumLength(200);
        RuleFor(x => x.DocumentTypeId).NotEmpty();
        RuleFor(x => x.Files).NotEmpty().WithMessage("Aucun fichier n'a été fourni.");
    }
}

public class ScanUploadDocumentCommandHandler(IApplicationDbContext context, IAuditService auditService)
    : IRequestHandler<ScanUploadDocumentCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(ScanUploadDocumentCommand request, CancellationToken ct)
    {
        var session = await GetScanUploadInfoQueryHandler.ResolveValidSessionAsync(context, request.Token, ct);
        if (session is null) return Result<Guid>.Failure("Ce lien a expiré ou n'est plus valide. Demandez un nouveau code sur l'ordinateur.");
        if (session.UploadedCount >= ScanUploadConstants.MaxUploadsPerSession)
            return Result<Guid>.Failure("Limite d'envois atteinte pour cette session. Demandez un nouveau code sur l'ordinateur.");

        // Route through the shared writer (create-or-append + auto-approve + audit), attributed to the session's
        // creator. The upload is tagged "scan mobile" in the audit so the trail shows how it arrived.
        var result = await MemberDocumentWriter.WriteAsync(context, auditService,
            session.MemberId, request.DocumentTypeId, title: null,
            request.ExpiryDate, LebanonClock.Today, request.Files,
            session.CreatedByUserId, via: "scan mobile", ct);
        if (!result.IsSuccess) return result;

        // Bump the session counter + remember the last document, so the desktop's poll sees the arrival.
        session.UploadedCount += request.Files.Count;
        session.LastDocumentId = result.Value;
        await context.SaveChangesAsync(ct);

        return result;
    }
}
