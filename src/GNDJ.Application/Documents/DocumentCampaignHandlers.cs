using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Documents;

// CG-facing handlers for the document-verification campaign: read status (everyone, for banners), the admin
// dashboard (group manager), edit the schedule, and the two manual steps (send error emails / apply on-hold)
// + the on-hold list & reactivation. The automated firing lives in the daily background service, which calls
// the same DocumentCampaignActions.

// ── Status (auth-only) — drives the member/CU banners (phase + upload open/closed + dates) ──
public record GetDocumentCampaignStatusQuery() : IRequest<Result<DocumentCampaignStatus>>;

public class GetDocumentCampaignStatusQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetDocumentCampaignStatusQuery, Result<DocumentCampaignStatus>>
{
    public async ValueTask<Result<DocumentCampaignStatus>> Handle(GetDocumentCampaignStatusQuery request, CancellationToken ct)
        => Result<DocumentCampaignStatus>.Success(await DocumentCampaign.LoadAsync(context, ct));
}

// ── Admin dashboard (group manager) — status + per-unit pending/incomplete + completion + step markers ──
public record DocumentCampaignAdminDto(
    DocumentCampaignStatus Status, int PendingReviewCount, int IncompleteCount, int OnHoldCount,
    bool VerificationDone, bool ErrorsSent, bool HoldApplied, IReadOnlyList<UnitPending> Units);

public record GetDocumentCampaignAdminQuery() : IRequest<Result<DocumentCampaignAdminDto>>;

public class GetDocumentCampaignAdminQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetDocumentCampaignAdminQuery, Result<DocumentCampaignAdminDto>>
{
    public async ValueTask<Result<DocumentCampaignAdminDto>> Handle(GetDocumentCampaignAdminQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<DocumentCampaignAdminDto>.Failure("Accès réservé au Chef de Groupe.");

        var status = await DocumentCampaign.LoadAsync(context, ct);
        var units = await DocumentCampaignActions.PendingByUnitAsync(context, ct);
        var pending = await DocumentCampaignActions.PendingReviewCountAsync(context, ct);
        var incomplete = units.Sum(u => u.IncompleteCount);
        var onHold = await context.Members.CountAsync(m => m.IsOnHold, ct);

        var errorsFor = await DocumentCampaignActions.GetSettingAsync(context, DocumentCampaignKeys.ErrorsSentFor, ct);
        var holdFor = await DocumentCampaignActions.GetSettingAsync(context, DocumentCampaignKeys.HoldAppliedFor, ct);
        var year = status.ScoutYear;
        var errorsSent = !string.IsNullOrWhiteSpace(year) && errorsFor == year;
        var holdApplied = !string.IsNullOrWhiteSpace(year) && holdFor == year;

        return Result<DocumentCampaignAdminDto>.Success(new DocumentCampaignAdminDto(
            status, pending, incomplete, onHold, pending == 0, errorsSent, holdApplied, units));
    }
}

// ── Update the schedule (group manager) — upserts the documents.* settings ──
public record UpdateDocumentCampaignCommand(
    bool Enabled, string? ScoutYear,
    string? DepositStart, string? DepositDeadline, string? CorrectionStart, string? CorrectionDeadline, string? FinalDeadline)
    : IRequest<Result<bool>>;

public class UpdateDocumentCampaignCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<UpdateDocumentCampaignCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateDocumentCampaignCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<bool>.Failure("Accès réservé au Chef de Groupe.");

        static DateOnly? Parse(string? v) => DateOnly.TryParse(v, out var d) ? d : (DateOnly?)null;
        // When enabling, require the 5 dates present + strictly increasing + a scout year.
        if (request.Enabled)
        {
            var d1 = Parse(request.DepositStart); var d2 = Parse(request.DepositDeadline);
            var d3 = Parse(request.CorrectionStart); var d4 = Parse(request.CorrectionDeadline);
            var d5 = Parse(request.FinalDeadline);
            if (d1 is null || d2 is null || d3 is null || d4 is null || d5 is null)
                return Result<bool>.Failure("Toutes les dates sont requises pour activer la campagne.");
            if (!(d1 < d2 && d2 < d3 && d3 < d4 && d4 < d5))
                return Result<bool>.Failure("Les dates doivent se suivre dans l'ordre : dépôt → limite dépôt → correction → limite correction → date finale.");
            if (string.IsNullOrWhiteSpace(request.ScoutYear))
                return Result<bool>.Failure("L'année scoute est requise.");
        }

        async Task Set(string key, string? value, string valueType, string label)
        {
            var e = await context.Settings.FindAsync([key], ct);
            if (e is null) context.Settings.Add(new Domain.Entities.Setting { Key = key, Value = value ?? "", Category = "documents", Label = label, Description = label, ValueType = valueType });
            else e.Value = value ?? "";
        }

        await Set(DocumentCampaignKeys.Enabled, request.Enabled ? "true" : "false", "boolean", "Campagne de vérification des documents active");
        await Set(DocumentCampaignKeys.ScoutYear, request.ScoutYear, "string", "Année scoute (campagne documents)");
        await Set(DocumentCampaignKeys.DepositStart, request.DepositStart, "date", "Ouverture du dépôt");
        await Set(DocumentCampaignKeys.DepositDeadline, request.DepositDeadline, "date", "Date limite de dépôt");
        await Set(DocumentCampaignKeys.CorrectionStart, request.CorrectionStart, "date", "Ouverture de la correction");
        await Set(DocumentCampaignKeys.CorrectionDeadline, request.CorrectionDeadline, "date", "Date limite de correction");
        await Set(DocumentCampaignKeys.FinalDeadline, request.FinalDeadline, "date", "Date finale (mise en attente)");
        await context.SaveChangesAsync(ct);

        await audit.LogAsync("UpdateDocumentCampaign", "Setting", null,
            newValues: new { request.Enabled, request.ScoutYear }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ── Manual step 1: send the error emails now (group manager) ──
public record SendDocumentCampaignErrorsCommand() : IRequest<Result<CampaignSendReport>>;

public class SendDocumentCampaignErrorsCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IEmailQueue emailQueue, IAuditService audit)
    : IRequestHandler<SendDocumentCampaignErrorsCommand, Result<CampaignSendReport>>
{
    public async ValueTask<Result<CampaignSendReport>> Handle(SendDocumentCampaignErrorsCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<CampaignSendReport>.Failure("Accès réservé au Chef de Groupe.");
        var year = await DocumentCampaignActions.GetSettingAsync(context, DocumentCampaignKeys.ScoutYear, ct);
        var report = await DocumentCampaignActions.RunSendErrorsAsync(context, emailQueue, year, ct);
        await audit.LogAsync("SendDocumentCampaignErrors", "Member", null, newValues: new { report.Sent, report.NoEmail }, cancellationToken: ct);
        return Result<CampaignSendReport>.Success(report);
    }
}

// ── Manual step 2: put incomplete dossiers on hold now (group manager) ──
public record ApplyDocumentCampaignHoldCommand() : IRequest<Result<CampaignHoldReport>>;

public class ApplyDocumentCampaignHoldCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IEmailQueue emailQueue, IAuditService audit)
    : IRequestHandler<ApplyDocumentCampaignHoldCommand, Result<CampaignHoldReport>>
{
    public async ValueTask<Result<CampaignHoldReport>> Handle(ApplyDocumentCampaignHoldCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<CampaignHoldReport>.Failure("Accès réservé au Chef de Groupe.");
        var year = await DocumentCampaignActions.GetSettingAsync(context, DocumentCampaignKeys.ScoutYear, ct);
        var report = await DocumentCampaignActions.RunApplyHoldAsync(context, emailQueue, year, ct);
        await audit.LogAsync("ApplyDocumentCampaignHold", "Member", null, newValues: new { report.Held, report.Emailed }, cancellationToken: ct);
        return Result<CampaignHoldReport>.Success(report);
    }
}

// ── On-hold list + reactivation (group manager) ──
public record OnHoldMemberDto(Guid MemberId, string Name, string? UnitName, DateTime? OnHoldAt);

public record GetOnHoldMembersQuery() : IRequest<Result<IReadOnlyList<OnHoldMemberDto>>>;

public class GetOnHoldMembersQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetOnHoldMembersQuery, Result<IReadOnlyList<OnHoldMemberDto>>>
{
    public async ValueTask<Result<IReadOnlyList<OnHoldMemberDto>>> Handle(GetOnHoldMembersQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<IReadOnlyList<OnHoldMemberDto>>.Failure("Accès réservé au Chef de Groupe.");

        var rows = await context.Members.Where(m => m.IsOnHold)
            .Select(m => new
            {
                m.Id, m.FirstName, m.LastName, m.OnHoldAt,
                UnitName = m.Assignments.Where(a => a.EndDate == null && !a.IsDeleted).Select(a => a.Unit.Name).FirstOrDefault(),
            })
            .OrderBy(m => m.UnitName).ThenBy(m => m.LastName).ThenBy(m => m.FirstName)
            .ToListAsync(ct);

        return Result<IReadOnlyList<OnHoldMemberDto>>.Success(
            rows.Select(m => new OnHoldMemberDto(m.Id, $"{m.FirstName} {m.LastName}".Trim(), m.UnitName, m.OnHoldAt)).ToList());
    }
}

// Reactivate a single member (clear the on-hold flag).
public record ReactivateMemberCommand(Guid MemberId) : IRequest<Result<bool>>;

public class ReactivateMemberCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<ReactivateMemberCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ReactivateMemberCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<bool>.Failure("Accès réservé au Chef de Groupe.");
        var member = await context.Members.FindAsync([request.MemberId], ct);
        if (member is null) return Result<bool>.Failure("Membre introuvable.");
        if (member.IsOnHold)
        {
            member.IsOnHold = false; member.OnHoldAt = null;
            await context.SaveChangesAsync(ct);
            await audit.LogAsync("ReactivateMember", "Member", member.Id, cancellationToken: ct);
        }
        return Result<bool>.Success(true);
    }
}
