using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Email;

// CRUD for the email templates the app sends (referenced by Code; rendered with {{variables}} and an
// optional bound SMTP server). Code is unique.
// Allowed template modules — kept in sync with the frontend MODULE_OPTIONS (email-settings.tsx).
public static class EmailTemplateModules
{
    public static readonly string[] All = { "auth", "documents", "cotisations", "passage", "demande", "general" };
}

// An email-template file attachment ([{name,url}] on AttachmentsJson) — the file lives under uploads/content
// (uploaded via /content/files) and is attached to every email sent from the template.
public record EmailAttachmentDto(string Name, string Url);

internal static class EmailAttachments
{
    public static IReadOnlyList<EmailAttachmentDto> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return System.Text.Json.JsonSerializer.Deserialize<List<EmailAttachmentDto>>(json) ?? []; }
        catch { return []; }
    }
    public static string? Serialize(IReadOnlyList<EmailAttachmentDto>? items)
    {
        if (items is null || items.Count == 0) return null;
        return System.Text.Json.JsonSerializer.Serialize(items.Where(a => !string.IsNullOrWhiteSpace(a.Url))
            .Select(a => new EmailAttachmentDto(a.Name.Trim(), a.Url.Trim())).ToList());
    }
    public static void Rules<T>(AbstractValidator<T> v, System.Func<T, IReadOnlyList<EmailAttachmentDto>?> get)
    {
        v.RuleFor(x => get(x)).Must(a => a is null || a.Count <= 10).WithMessage("Trop de pièces jointes (max 10).");
    }
}

// DTOs
public record EmailTemplateDto(Guid Id, string Name, string Code, string Module, string Subject, string BodyHtml, string? Variables, Guid? SmtpServerId, string? SmtpServerName, bool IsActive, DateTime CreatedAt, IReadOnlyList<EmailAttachmentDto> Attachments);

// GetAll
public record GetEmailTemplatesQuery() : IRequest<List<EmailTemplateDto>>;

public class GetEmailTemplatesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetEmailTemplatesQuery, List<EmailTemplateDto>>
{
    public async ValueTask<List<EmailTemplateDto>> Handle(GetEmailTemplatesQuery request, CancellationToken ct)
    {
        var rows = await context.EmailTemplates
            .Include(t => t.SmtpServer)
            .OrderBy(t => t.Module).ThenBy(t => t.Name)
            .Select(t => new { t.Id, t.Name, t.Code, t.Module, t.Subject, t.BodyHtml, t.Variables, t.SmtpServerId, SmtpName = t.SmtpServer != null ? t.SmtpServer.Name : null, t.IsActive, t.CreatedAt, t.AttachmentsJson })
            .ToListAsync(ct);
        return rows.Select(t => new EmailTemplateDto(t.Id, t.Name, t.Code, t.Module, t.Subject, t.BodyHtml, t.Variables, t.SmtpServerId, t.SmtpName, t.IsActive, t.CreatedAt, EmailAttachments.Parse(t.AttachmentsJson))).ToList();
    }
}

// GetById
public record GetEmailTemplateByIdQuery(Guid Id) : IRequest<EmailTemplateDto?>;

public class GetEmailTemplateByIdQueryHandler(IApplicationDbContext context) : IRequestHandler<GetEmailTemplateByIdQuery, EmailTemplateDto?>
{
    public async ValueTask<EmailTemplateDto?> Handle(GetEmailTemplateByIdQuery request, CancellationToken ct)
    {
        var t = await context.EmailTemplates
            .Include(x => x.SmtpServer)
            .Where(x => x.Id == request.Id)
            .Select(x => new { x.Id, x.Name, x.Code, x.Module, x.Subject, x.BodyHtml, x.Variables, x.SmtpServerId, SmtpName = x.SmtpServer != null ? x.SmtpServer.Name : null, x.IsActive, x.CreatedAt, x.AttachmentsJson })
            .FirstOrDefaultAsync(ct);
        return t is null ? null : new EmailTemplateDto(t.Id, t.Name, t.Code, t.Module, t.Subject, t.BodyHtml, t.Variables, t.SmtpServerId, t.SmtpName, t.IsActive, t.CreatedAt, EmailAttachments.Parse(t.AttachmentsJson));
    }
}

// Create
public record CreateEmailTemplateCommand(string Name, string Code, string Module, string Subject, string BodyHtml, string? Variables, Guid? SmtpServerId, bool IsActive, IReadOnlyList<EmailAttachmentDto>? Attachments = null) : IRequest<Result<Guid>>;

public class CreateEmailTemplateCommandValidator : AbstractValidator<CreateEmailTemplateCommand>
{
    public CreateEmailTemplateCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50);
        RuleFor(x => x.Module).NotEmpty().WithMessage("Le module est requis.").MaximumLength(50)
            .Must(m => EmailTemplateModules.All.Contains(m)).WithMessage("Module invalide.");
        RuleFor(x => x.Subject).NotEmpty().WithMessage("Le sujet est requis.").MaximumLength(200);
        RuleFor(x => x.BodyHtml).NotEmpty().WithMessage("Le contenu HTML est requis.").MaximumLength(100000);
        RuleFor(x => x.Variables).MaximumLength(5000);
        EmailAttachments.Rules(this, x => x.Attachments);
    }
}

public class CreateEmailTemplateCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<CreateEmailTemplateCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateEmailTemplateCommand request, CancellationToken ct)
    {
        var codeExists = await context.EmailTemplates.AnyAsync(t => t.Code == request.Code, ct);
        if (codeExists)
            return Result<Guid>.Failure("Un modèle avec ce code existe déjà.");

        if (request.SmtpServerId.HasValue)
        {
            var smtpExists = await context.SmtpServers.AnyAsync(s => s.Id == request.SmtpServerId.Value, ct);
            if (!smtpExists)
                return Result<Guid>.Failure("Serveur SMTP introuvable.");
        }

        var entity = new EmailTemplate
        {
            Name = request.Name,
            Code = request.Code,
            Module = request.Module,
            Subject = request.Subject,
            BodyHtml = request.BodyHtml,
            Variables = request.Variables,
            AttachmentsJson = EmailAttachments.Serialize(request.Attachments),
            SmtpServerId = request.SmtpServerId,
            IsActive = request.IsActive
        };

        context.EmailTemplates.Add(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "EmailTemplate", entity.Id, newValues: new { entity.Name, entity.Code, entity.Module }, cancellationToken: ct);

        return Result<Guid>.Success(entity.Id);
    }
}

// Update
public record UpdateEmailTemplateCommand(Guid Id, string Name, string Code, string Module, string Subject, string BodyHtml, string? Variables, Guid? SmtpServerId, bool IsActive, IReadOnlyList<EmailAttachmentDto>? Attachments = null) : IRequest<Result<bool>>;

public class UpdateEmailTemplateCommandValidator : AbstractValidator<UpdateEmailTemplateCommand>
{
    public UpdateEmailTemplateCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50);
        RuleFor(x => x.Module).NotEmpty().WithMessage("Le module est requis.").MaximumLength(50)
            .Must(m => EmailTemplateModules.All.Contains(m)).WithMessage("Module invalide.");
        RuleFor(x => x.Subject).NotEmpty().WithMessage("Le sujet est requis.").MaximumLength(200);
        RuleFor(x => x.BodyHtml).NotEmpty().WithMessage("Le contenu HTML est requis.").MaximumLength(100000);
        RuleFor(x => x.Variables).MaximumLength(5000);
        EmailAttachments.Rules(this, x => x.Attachments);
    }
}

public class UpdateEmailTemplateCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<UpdateEmailTemplateCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateEmailTemplateCommand request, CancellationToken ct)
    {
        var entity = await context.EmailTemplates.FindAsync([request.Id], ct);
        if (entity is null)
            return Result<bool>.Failure("Modèle introuvable.");

        var codeExists = await context.EmailTemplates.AnyAsync(t => t.Code == request.Code && t.Id != request.Id, ct);
        if (codeExists)
            return Result<bool>.Failure("Un modèle avec ce code existe déjà.");

        if (request.SmtpServerId.HasValue)
        {
            var smtpExists = await context.SmtpServers.AnyAsync(s => s.Id == request.SmtpServerId.Value, ct);
            if (!smtpExists)
                return Result<bool>.Failure("Serveur SMTP introuvable.");
        }

        var oldValues = new { entity.Name, entity.Code, entity.Module, entity.IsActive };

        entity.Name = request.Name;
        entity.Code = request.Code;
        entity.Module = request.Module;
        entity.Subject = request.Subject;
        entity.BodyHtml = request.BodyHtml;
        entity.Variables = request.Variables;
        entity.AttachmentsJson = EmailAttachments.Serialize(request.Attachments);
        entity.SmtpServerId = request.SmtpServerId;
        entity.IsActive = request.IsActive;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "EmailTemplate", entity.Id, oldValues: oldValues, newValues: new { entity.Name, entity.Code, entity.IsActive }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}

// Delete
public record DeleteEmailTemplateCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteEmailTemplateCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<DeleteEmailTemplateCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteEmailTemplateCommand request, CancellationToken ct)
    {
        var entity = await context.EmailTemplates.FindAsync([request.Id], ct);
        if (entity is null)
            return Result<bool>.Failure("Modèle introuvable.");

        context.EmailTemplates.Remove(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "EmailTemplate", entity.Id, oldValues: new { entity.Name, entity.Code }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
