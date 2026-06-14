using System.Net;
using System.Net.Mail;
using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Email;

// DTOs — Password is never returned
public record SmtpServerDto(Guid Id, string Name, string Host, int Port, string Username, string FromEmail, string FromName, bool UseSsl, bool IsActive, DateTime CreatedAt);
public record SmtpServerListDto(Guid Id, string Name, string Host, bool IsActive);

// GetAll
public record GetSmtpServersQuery() : IRequest<List<SmtpServerDto>>;

public class GetSmtpServersQueryHandler(IApplicationDbContext context) : IRequestHandler<GetSmtpServersQuery, List<SmtpServerDto>>
{
    public async ValueTask<List<SmtpServerDto>> Handle(GetSmtpServersQuery request, CancellationToken ct)
    {
        return await context.SmtpServers
            .OrderBy(s => s.Name)
            .Select(s => new SmtpServerDto(s.Id, s.Name, s.Host, s.Port, s.Username, s.FromEmail, s.FromName, s.UseSsl, s.IsActive, s.CreatedAt))
            .ToListAsync(ct);
    }
}

// Create
public record CreateSmtpServerCommand(string Name, string Host, int Port, string Username, string Password, string FromEmail, string FromName, bool UseSsl, bool IsActive) : IRequest<Result<Guid>>;

public class CreateSmtpServerCommandValidator : AbstractValidator<CreateSmtpServerCommand>
{
    public CreateSmtpServerCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.Host).NotEmpty().WithMessage("L'hôte est requis.").MaximumLength(200);
        RuleFor(x => x.Port).InclusiveBetween(1, 65535).WithMessage("Le port doit être entre 1 et 65535.");
        RuleFor(x => x.Username).MaximumLength(200);
        RuleFor(x => x.Password).MaximumLength(500);
        RuleFor(x => x.FromEmail).NotEmpty().EmailAddress().WithMessage("L'adresse email d'expédition est invalide.").MaximumLength(254);
        RuleFor(x => x.FromName).MaximumLength(100);
    }
}

public class CreateSmtpServerCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<CreateSmtpServerCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateSmtpServerCommand request, CancellationToken ct)
    {
        var entity = new SmtpServer
        {
            Name = request.Name,
            Host = request.Host,
            Port = request.Port,
            Username = request.Username,
            Password = request.Password,
            FromEmail = request.FromEmail,
            FromName = request.FromName,
            UseSsl = request.UseSsl,
            IsActive = request.IsActive
        };

        context.SmtpServers.Add(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "SmtpServer", entity.Id, newValues: new { entity.Name, entity.Host, entity.Port }, cancellationToken: ct);

        return Result<Guid>.Success(entity.Id);
    }
}

// Update
public record UpdateSmtpServerCommand(Guid Id, string Name, string Host, int Port, string Username, string? Password, string FromEmail, string FromName, bool UseSsl, bool IsActive) : IRequest<Result<bool>>;

public class UpdateSmtpServerCommandValidator : AbstractValidator<UpdateSmtpServerCommand>
{
    public UpdateSmtpServerCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.Host).NotEmpty().WithMessage("L'hôte est requis.").MaximumLength(200);
        RuleFor(x => x.Port).InclusiveBetween(1, 65535).WithMessage("Le port doit être entre 1 et 65535.");
        RuleFor(x => x.Username).MaximumLength(200);
        RuleFor(x => x.Password).MaximumLength(500);
        RuleFor(x => x.FromEmail).NotEmpty().EmailAddress().WithMessage("L'adresse email d'expédition est invalide.").MaximumLength(254);
        RuleFor(x => x.FromName).MaximumLength(100);
    }
}

public class UpdateSmtpServerCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<UpdateSmtpServerCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateSmtpServerCommand request, CancellationToken ct)
    {
        var entity = await context.SmtpServers.FindAsync([request.Id], ct);
        if (entity is null)
            return Result<bool>.Failure("Serveur SMTP introuvable.");

        var oldValues = new { entity.Name, entity.Host, entity.Port, entity.IsActive };

        entity.Name = request.Name;
        entity.Host = request.Host;
        entity.Port = request.Port;
        entity.Username = request.Username;
        if (!string.IsNullOrEmpty(request.Password))
            entity.Password = request.Password;
        entity.FromEmail = request.FromEmail;
        entity.FromName = request.FromName;
        entity.UseSsl = request.UseSsl;
        entity.IsActive = request.IsActive;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "SmtpServer", entity.Id, oldValues: oldValues, newValues: new { entity.Name, entity.Host, entity.IsActive }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}

// Delete
public record DeleteSmtpServerCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteSmtpServerCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<DeleteSmtpServerCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteSmtpServerCommand request, CancellationToken ct)
    {
        var entity = await context.SmtpServers.FindAsync([request.Id], ct);
        if (entity is null)
            return Result<bool>.Failure("Serveur SMTP introuvable.");

        context.SmtpServers.Remove(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "SmtpServer", entity.Id, oldValues: new { entity.Name, entity.Host }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}

// Test
public record TestSmtpCommand(Guid SmtpServerId, string TestEmail) : IRequest<Result<bool>>;

public class TestSmtpCommandValidator : AbstractValidator<TestSmtpCommand>
{
    public TestSmtpCommandValidator()
    {
        RuleFor(x => x.TestEmail).NotEmpty().EmailAddress().WithMessage("L'adresse email de test est invalide.");
    }
}

public class TestSmtpCommandHandler(IApplicationDbContext context) : IRequestHandler<TestSmtpCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(TestSmtpCommand request, CancellationToken ct)
    {
        var server = await context.SmtpServers.FindAsync([request.SmtpServerId], ct);
        if (server is null)
            return Result<bool>.Failure("Serveur SMTP introuvable.");

        try
        {
            using var client = new SmtpClient(server.Host, server.Port)
            {
                Credentials = new NetworkCredential(server.Username, server.Password),
                EnableSsl = server.UseSsl
            };

            var message = new MailMessage(
                new MailAddress(server.FromEmail, server.FromName),
                new MailAddress(request.TestEmail))
            {
                Subject = "Test GNDJ - Configuration SMTP",
                Body = "Ce message confirme que la configuration SMTP fonctionne correctement.",
                IsBodyHtml = false
            };

            await client.SendMailAsync(message, ct);
            return Result<bool>.Success(true);
        }
        catch (Exception ex)
        {
            return Result<bool>.Failure($"Erreur d'envoi : {ex.Message}");
        }
    }
}
