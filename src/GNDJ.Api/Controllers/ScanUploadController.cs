using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.ScanUpload;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GNDJ.Api.Controllers;

/// <summary>
/// "Scanner un document avec le téléphone" — a desktop→phone hand-off for uploading a member's document. A
/// logged-in user opens a session on the desktop (a member they can access); the desktop shows a QR of
/// /scan-upload/{token}; the phone opens that URL WITHOUT logging in (the token is a short-lived, upload-only
/// capability) and photographs the paper, which uploads straight into the member's dossier. The desktop polls
/// the session to refresh when a document arrives.
/// Mixed auth: session create/poll require a JWT; the phone info + upload actions are anonymous (the token
/// authorizes them). File validation (size/extension/magic bytes) mirrors the normal document upload.
/// </summary>
[Authorize]
[Route("api/v1/scan-upload")]
public class ScanUploadController : BaseApiController
{
    private readonly IApplicationDbContext _context;

    public ScanUploadController(IApplicationDbContext context) => _context = context;

    public record CreateSessionBody(Guid MemberId);

    /// <summary>Creates a scan-upload session for a member (desktop, authenticated). Returns the token to encode in the QR.</summary>
    [HttpPost("sessions")]
    public async Task<IActionResult> CreateSession([FromBody] CreateSessionBody body)
    {
        var result = await Mediator.Send(new CreateUploadSessionCommand(body.MemberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Polls a session's status (how many documents have arrived + whether it expired). Creator/super-admin only.</summary>
    [HttpGet("sessions/{id:guid}")]
    public async Task<IActionResult> GetStatus(Guid id)
    {
        var result = await Mediator.Send(new GetUploadSessionStatusQuery(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Minimal context for the phone scan page (member label + document types). Anonymous — the token authorizes it.</summary>
    [AllowAnonymous]
    [HttpGet("{token}")]
    public async Task<IActionResult> GetInfo(string token)
    {
        var result = await Mediator.Send(new GetScanUploadInfoQuery(token));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>
    /// Uploads photographed document file(s) via a scan session (anonymous — the token authorizes it). Validates
    /// size/extension/magic bytes; rate-limited; 20MB cap. Routes into the same document write path as a normal upload.
    /// </summary>
    [AllowAnonymous]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    [HttpPost("{token}/upload")]
    public async Task<IActionResult> Upload(string token, [FromForm] Guid documentTypeId, [FromForm] DateOnly? expiryDate, IFormFileCollection files)
    {
        if (files is null || files.Count == 0)
            return BadRequest(new { error = "Aucun fichier n'a été fourni." });

        var (saved, savedPaths, error) = await DocumentUploadFiles.SaveAsync(_context, files);
        if (error is not null) return BadRequest(new { error });

        var result = await Mediator.Send(new ScanUploadDocumentCommand(token, documentTypeId, expiryDate, saved));
        if (!result.IsSuccess)
        {
            DocumentUploadFiles.Cleanup(savedPaths);
            return BadRequest(new { error = result.Error });
        }
        return Ok(new { id = result.Value });
    }
}
