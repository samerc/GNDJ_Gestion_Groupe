using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Email;

// Allowed template modules — kept in sync with the frontend MODULE_OPTIONS (email-settings.tsx).
public static class EmailTemplateModules
{
    public static readonly string[] All = { "auth", "documents", "cotisations", "passage", "demande" };
}

// DTOs
public record EmailTemplateDto(Guid Id, string Name, string Code, string Module, string Subject, string BodyHtml, string? Variables, Guid? SmtpServerId, string? SmtpServerName, bool IsActive, DateTime CreatedAt);

// GetAll
public record GetEmailTemplatesQuery() : IRequest<List<EmailTemplateDto>>;

public class GetEmailTemplatesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetEmailTemplatesQuery, List<EmailTemplateDto>>
{
    public async ValueTask<List<EmailTemplateDto>> Handle(GetEmailTemplatesQuery request, CancellationToken ct)
    {
        return await context.EmailTemplates
            .Include(t => t.SmtpServer)
            .OrderBy(t => t.Module).ThenBy(t => t.Name)
            .Select(t => new EmailTemplateDto(t.Id, t.Name, t.Code, t.Module, t.Subject, t.BodyHtml, t.Variables, t.SmtpServerId, t.SmtpServer != null ? t.SmtpServer.Name : null, t.IsActive, t.CreatedAt))
            .ToListAsync(ct);
    }
}

// GetById
public record GetEmailTemplateByIdQuery(Guid Id) : IRequest<EmailTemplateDto?>;

public class GetEmailTemplateByIdQueryHandler(IApplicationDbContext context) : IRequestHandler<GetEmailTemplateByIdQuery, EmailTemplateDto?>
{
    public async ValueTask<EmailTemplateDto?> Handle(GetEmailTemplateByIdQuery request, CancellationToken ct)
    {
        return await context.EmailTemplates
            .Include(t => t.SmtpServer)
            .Where(t => t.Id == request.Id)
            .Select(t => new EmailTemplateDto(t.Id, t.Name, t.Code, t.Module, t.Subject, t.BodyHtml, t.Variables, t.SmtpServerId, t.SmtpServer != null ? t.SmtpServer.Name : null, t.IsActive, t.CreatedAt))
            .FirstOrDefaultAsync(ct);
    }
}

// Create
public record CreateEmailTemplateCommand(string Name, string Code, string Module, string Subject, string BodyHtml, string? Variables, Guid? SmtpServerId, bool IsActive) : IRequest<Result<Guid>>;

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
public record UpdateEmailTemplateCommand(Guid Id, string Name, string Code, string Module, string Subject, string BodyHtml, string? Variables, Guid? SmtpServerId, bool IsActive) : IRequest<Result<bool>>;

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
