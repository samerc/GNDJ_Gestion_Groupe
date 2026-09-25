using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.NewYear;

// "Nettoyage de nouvelle année" — what is reset when a new scout year starts. Run by the Chef de Groupe (prompted
// right after they move passage.scout_year forward in Paramètres, or from the shortcut card in Paramètres →
// Passage). Once per scout year. It:
//   1. exports EVERY document (all pages) to a zip kept on the server outside the website (+ off-server backup),
//   2. deletes every document except the kept types (setting newyear.keep_document_types, default carte d'identité),
//   3. resets the approval of the kept documents unless newyear.keep_id_approval is on,
//   4. clears the section of every member,
//   5. moves every active member's classe up one year (member.classes order; the last one stays), skipping the
//      members just created from this year's demandes (they were enrolled with the new year's classe).
// The heavy work runs in the background (INewYearCleanupService) — a zip of several GB can't be built inside one
// web request (Cloudflare cuts at 100 s). Crash-safe order: zip first, then ALL database changes in one transaction
// (incl. the "done for year" marker), then the file deletions.

public static class NewYearKeys
{
    public const string KeepDocumentTypes = "newyear.keep_document_types"; // json array of document-type CODES
    public const string KeepIdApproval = "newyear.keep_id_approval";       // "true" = kept documents stay approved
    public const string DoneFor = "newyear.cleanup_done_for";               // scout year the cleanup last completed for
    public const string Status = "newyear.cleanup_status";                  // json NewYearRunStatus of the last run
}

// What the run would do right now (computed live, nothing changed).
public record NewYearPreviewDto(
    string ScoutYear,
    int DocumentsToDelete, long BytesToDelete, int DocumentsKept, int ApprovalsToReset,
    int SectionsToClear, int ClassesToPromote, int NewMembersSkipped,
    IReadOnlyList<string> KeptTypeNames, bool KeepApproval);

// State of the last/ongoing run (persisted in a setting so it survives a restart and every CG sees it).
public record NewYearRunStatus(
    string State,            // "running" | "done" | "failed"
    string ScoutYear, string? Phase, DateTime StartedAt, DateTime? FinishedAt, string? Error,
    int? Exported, int? MissingFiles, int? Deleted, int? ApprovalsReset, int? SectionsCleared, int? ClassesPromoted,
    string? ArchiveFile, long? ArchiveBytes, string? StartedBy);

public record NewYearCleanupStatusDto(
    NewYearPreviewDto Preview, string? DoneFor, bool DoneForCurrentYear, bool Running, NewYearRunStatus? LastRun);

public interface INewYearCleanupService
{
    Task<NewYearPreviewDto> PreviewAsync(CancellationToken ct);
    Task<NewYearRunStatus?> GetLastRunAsync(CancellationToken ct);
    Task<string?> GetDoneForAsync(CancellationToken ct);
    bool IsRunning { get; }
    // Starts the background run for the CURRENT scout year. Fails (no start) when already running or already done.
    Task<Result<bool>> StartAsync(Guid? userId, string? userLabel, CancellationToken ct);
    // Full path of an archive zip in the archive folder (null if it doesn't exist / name escapes the folder).
    string? ResolveArchive(string fileName);
}

// ── Status + preview (CG) ──
public record GetNewYearCleanupStatusQuery : IRequest<Result<NewYearCleanupStatusDto>>;

public class GetNewYearCleanupStatusQueryHandler(INewYearCleanupService service, ICurrentUserService currentUser)
    : IRequestHandler<GetNewYearCleanupStatusQuery, Result<NewYearCleanupStatusDto>>
{
    public async ValueTask<Result<NewYearCleanupStatusDto>> Handle(GetNewYearCleanupStatusQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) return Result<NewYearCleanupStatusDto>.Failure("Accès réservé au chef de groupe.");
        var preview = await service.PreviewAsync(ct);
        var doneFor = await service.GetDoneForAsync(ct);
        return Result<NewYearCleanupStatusDto>.Success(new NewYearCleanupStatusDto(
            preview, doneFor, doneFor == preview.ScoutYear, service.IsRunning, await service.GetLastRunAsync(ct)));
    }
}

// ── Start (CG) ──
public record StartNewYearCleanupCommand : IRequest<Result<bool>>;

public class StartNewYearCleanupCommandHandler(INewYearCleanupService service, ICurrentUserService currentUser)
    : IRequestHandler<StartNewYearCleanupCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(StartNewYearCleanupCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) return Result<bool>.Failure("Accès réservé au chef de groupe.");
        return await service.StartAsync(currentUser.UserId, null, ct);
    }
}
