using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Settings;
using Mediator;

namespace GNDJ.Application.SystemHealth;

// "Système" page (super-admin): background jobs, email/push delivery, disk, slow pages, configuration checks.
public record GetSystemStatusQuery() : IRequest<Result<SystemStatusDto>>;

public class GetSystemStatusQueryHandler(ISystemHealthService health, ICurrentUserService currentUser)
    : IRequestHandler<GetSystemStatusQuery, Result<SystemStatusDto>>
{
    public async ValueTask<Result<SystemStatusDto>> Handle(GetSystemStatusQuery request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin) throw new UnauthorizedAccessException("Accès réservé aux super administrateurs.");
        return Result<SystemStatusDto>.Success(await health.GetStatusAsync(ct));
    }
}

// Settings consistency (Paramètres banner). Anyone who can open Paramètres sees the issues of the categories they
// can edit; an admin sees all.
public record GetSettingsCheckQuery() : IRequest<Result<List<ConfigIssue>>>;

public class GetSettingsCheckQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetSettingsCheckQuery, Result<List<ConfigIssue>>>
{
    public async ValueTask<Result<List<ConfigIssue>>> Handle(GetSettingsCheckQuery request, CancellationToken ct)
    {
        if (!SettingsAccess.CanViewAny(currentUser)) throw new UnauthorizedAccessException("Accès non autorisé.");
        var issues = await ConfigurationChecks.SettingsAsync(context, ct);
        if (!SettingsAccess.IsAdmin(currentUser))
            issues = issues.Where(i => i.Tab is not null && (i.Tab.StartsWith('/') || SettingsAccess.CanEdit(i.Tab, currentUser))).ToList();
        return Result<List<ConfigIssue>>.Success(issues);
    }
}

// Email template placeholders (templates page + smoke suite). Same audience as template editing.
public record GetEmailTemplateCheckQuery() : IRequest<Result<List<ConfigIssue>>>;

public class GetEmailTemplateCheckQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetEmailTemplateCheckQuery, Result<List<ConfigIssue>>>
{
    public async ValueTask<Result<List<ConfigIssue>>> Handle(GetEmailTemplateCheckQuery request, CancellationToken ct)
    {
        if (!SettingsAccess.IsAdmin(currentUser)) throw new UnauthorizedAccessException("Accès non autorisé.");
        return Result<List<ConfigIssue>>.Success(await ConfigurationChecks.EmailTemplatesAsync(context, ct));
    }
}

// Stray upload files (super-admin): list, then delete what a fresh scan finds.
public record GetOrphanFilesQuery() : IRequest<Result<OrphanFileReportDto>>;

public class GetOrphanFilesQueryHandler(IUploadFileAudit audit, ICurrentUserService currentUser)
    : IRequestHandler<GetOrphanFilesQuery, Result<OrphanFileReportDto>>
{
    public async ValueTask<Result<OrphanFileReportDto>> Handle(GetOrphanFilesQuery request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin) throw new UnauthorizedAccessException("Accès réservé aux super administrateurs.");
        return Result<OrphanFileReportDto>.Success(await audit.FindOrphansAsync(ct));
    }
}

public record DeleteOrphanFilesResult(int Deleted, long FreedBytes);
public record DeleteOrphanFilesCommand() : IRequest<Result<DeleteOrphanFilesResult>>;

public class DeleteOrphanFilesCommandHandler(IUploadFileAudit audit, ICurrentUserService currentUser, IAuditService auditLog)
    : IRequestHandler<DeleteOrphanFilesCommand, Result<DeleteOrphanFilesResult>>
{
    public async ValueTask<Result<DeleteOrphanFilesResult>> Handle(DeleteOrphanFilesCommand request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin) throw new UnauthorizedAccessException("Accès réservé aux super administrateurs.");
        int deleted; long freed;
        try { (deleted, freed) = await audit.DeleteOrphansAsync(ct); }
        catch (InvalidOperationException ex) { return Result<DeleteOrphanFilesResult>.Failure(ex.Message); }
        await auditLog.LogAsync("Delete", "UploadFiles", null, null, new { Deleted = deleted, FreedBytes = freed }, ct);
        return Result<DeleteOrphanFilesResult>.Success(new DeleteOrphanFilesResult(deleted, freed));
    }
}
