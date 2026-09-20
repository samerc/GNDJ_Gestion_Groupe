using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Siblings;

// ── "Signaler une erreur" (fratrie error reports) ──────────────────────────────────────────────────────
// A member flags a problem with their fratrie ("il manque un frère/sœur", "ce n'est pas mon frère/sœur", autre)
// from the "Frères et sœurs" section of their fiche / Ma fiche. It becomes a CG worklist (the "Signalements"
// tab on the Fratries page) + an in-app notification to the group managers, who fix it via Link/Unlink.
// Members flag; the CG resolves. The reporter is always the authenticated member (server-side) → no IDOR.

public record SiblingReportDto(Guid Id, Guid ReporterMemberId, string ReporterName, string? ReporterUnit,
    string Kind, string? Note, string Status, DateTime CreatedAt, DateTime? ResolvedAt, string? ReplyMessage);

// The kinds a member can pick. Keep in sync with the frontend labels in member-siblings.tsx.
public static class SiblingReportKinds
{
    public const string Missing = "missing";  // il manque un frère/sœur
    public const string Wrong = "wrong";      // ce n'est pas mon frère/sœur
    public const string Other = "other";      // autre
    public static readonly string[] All = [Missing, Wrong, Other];
}

// ── Create (member) ─────────────────────────────────────────────────────────────
public record CreateSiblingReportCommand(string Kind, string? Note) : IRequest<Result<bool>>;

public class CreateSiblingReportCommandValidator : AbstractValidator<CreateSiblingReportCommand>
{
    public CreateSiblingReportCommandValidator()
    {
        RuleFor(x => x.Kind).Must(k => SiblingReportKinds.All.Contains(k)).WithMessage("Type de signalement invalide.");
        RuleFor(x => x.Note).MaximumLength(1000).NoHtml();
    }
}

public class CreateSiblingReportCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, INotificationService notifications)
    : IRequestHandler<CreateSiblingReportCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(CreateSiblingReportCommand request, CancellationToken ct)
    {
        if (currentUser.MemberId is not Guid memberId) return Result<bool>.Failure("Non authentifié.");

        context.SiblingReports.Add(new SiblingReport
        {
            ReporterMemberId = memberId,
            Kind = request.Kind,
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
            Status = "Pending",
        });
        await context.SaveChangesAsync(ct);

        // Notify the group managers (bell → the Signalements worklist). Best-effort, after the commit.
        var name = await context.Members.Where(m => m.Id == memberId)
            .Select(m => (m.FirstName + " " + m.LastName).Trim()).FirstOrDefaultAsync(ct);
        var label = request.Kind switch
        {
            SiblingReportKinds.Missing => "Il manque un frère/sœur",
            SiblingReportKinds.Wrong => "Une personne n'est pas de la fratrie",
            _ => "Signalement de fratrie",
        };
        await notifications.NotifyGroupManagersAsync(NotificationTypes.Info,
            "Signalement de fratrie", $"{name} : {label}", "/admin/siblings?tab=reports", excludeMemberId: memberId, ct: ct);

        return Result<bool>.Success(true);
    }
}

// ── List (CG worklist) ──────────────────────────────────────────────────────────
public record GetSiblingReportsQuery(bool IncludeResolved = false) : IRequest<IReadOnlyList<SiblingReportDto>>;

public class GetSiblingReportsQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetSiblingReportsQuery, IReadOnlyList<SiblingReportDto>>
{
    public async ValueTask<IReadOnlyList<SiblingReportDto>> Handle(GetSiblingReportsQuery request, CancellationToken ct)
    {
        var q = context.SiblingReports.AsQueryable();
        if (!request.IncludeResolved) q = q.Where(r => r.Status == "Pending");

        return await q
            .OrderBy(r => r.Status == "Pending" ? 0 : 1) // pending first
            .ThenByDescending(r => r.CreatedAt)
            .Select(r => new SiblingReportDto(
                r.Id, r.ReporterMemberId,
                (context.Members.Where(m => m.Id == r.ReporterMemberId).Select(m => m.FirstName + " " + m.LastName).FirstOrDefault() ?? "").Trim(),
                context.Members.Where(m => m.Id == r.ReporterMemberId)
                    .Select(m => m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault()).FirstOrDefault(),
                r.Kind, r.Note, r.Status, r.CreatedAt, r.ResolvedAt, r.ReplyMessage))
            .ToListAsync(ct);
    }
}

// ── Resolve / reopen (CG) ─────────────────────────────────────────────────────────
public record ResolveSiblingReportCommand(Guid Id, bool Resolve = true) : IRequest<Result<bool>>;

public class ResolveSiblingReportCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<ResolveSiblingReportCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ResolveSiblingReportCommand request, CancellationToken ct)
    {
        var report = await context.SiblingReports.FirstOrDefaultAsync(r => r.Id == request.Id, ct);
        if (report is null) return Result<bool>.Failure("Signalement introuvable.");

        if (request.Resolve)
        {
            report.Status = "Resolved";
            report.ResolvedByUserId = currentUser.UserId;
            report.ResolvedAt = DateTime.UtcNow;
        }
        else
        {
            report.Status = "Pending";
            report.ResolvedByUserId = null;
            report.ResolvedAt = null;
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── Reply (CG answers the member) ──────────────────────────────────────────────────
// A manager answers a fratrie report: the message lands in the member's notification bell (and as a push
// notification if they enabled it), and the report is marked resolved. Gated by maitrise.manage at the controller.
public record ReplySiblingReportCommand(Guid Id, string Message) : IRequest<Result<bool>>;

public class ReplySiblingReportCommandValidator : AbstractValidator<ReplySiblingReportCommand>
{
    public ReplySiblingReportCommandValidator()
    {
        RuleFor(x => x.Message).NotEmpty().WithMessage("Le message est requis.").MaximumLength(2000).NoHtml();
    }
}

public class ReplySiblingReportCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, INotificationService notifications)
    : IRequestHandler<ReplySiblingReportCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ReplySiblingReportCommand request, CancellationToken ct)
    {
        var report = await context.SiblingReports.FirstOrDefaultAsync(r => r.Id == request.Id, ct);
        if (report is null) return Result<bool>.Failure("Signalement introuvable.");

        var message = request.Message.Trim();
        report.ReplyMessage = message;
        report.Status = "Resolved";           // answering closes the report
        report.ResolvedByUserId = currentUser.UserId;
        report.ResolvedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(ct);

        // Notify the member who reported it (bell + push if enabled). Best-effort, after the commit; the member
        // sees it on their own fiche (Contact & famille section) via /my-profile.
        await notifications.NotifyMemberAsync(report.ReporterMemberId, NotificationTypes.Info,
            "Réponse à votre signalement de fratrie", message, "/my-profile", ct);

        return Result<bool>.Success(true);
    }
}
