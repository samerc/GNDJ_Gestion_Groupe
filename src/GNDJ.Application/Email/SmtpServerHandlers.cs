using System.Net;
using System.Net.Mail;
using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace GNDJ.Application.Email;

// CRUD + connectivity test for the SMTP servers that templates send through.
// DTOs — Password is never returned. MaxPerHour = optional send-rate cap (null = unlimited).
public record SmtpServerDto(Guid Id, string Name, string Host, int Port, string Username, string FromEmail, string FromName, bool UseSsl, bool IsActive, bool IsDefault, int? MaxPerHour, DateTime CreatedAt);

// GetAll
public record GetSmtpServersQuery() : IRequest<List<SmtpServerDto>>;

public class GetSmtpServersQueryHandler(IApplicationDbContext context) : IRequestHandler<GetSmtpServersQuery, List<SmtpServerDto>>
{
    public async ValueTask<List<SmtpServerDto>> Handle(GetSmtpServersQuery request, CancellationToken ct)
    {
        return await context.SmtpServers
            .OrderBy(s => s.Name)
            .Select(s => new SmtpServerDto(s.Id, s.Name, s.Host, s.Port, s.Username, s.FromEmail, s.FromName, s.UseSsl, s.IsActive, s.IsDefault, s.MaxPerHour, s.CreatedAt))
            .ToListAsync(ct);
    }
}

// Set the explicit default server (the one "Par défaut" templates send through). Clears the flag on every
// other server so at most one is default. Only an ACTIVE server may be the default (the send only ever uses
// active servers). associations.manage-gated at the controller.
public record SetDefaultSmtpServerCommand(Guid Id) : IRequest<Result<bool>>;

public class SetDefaultSmtpServerCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<SetDefaultSmtpServerCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetDefaultSmtpServerCommand request, CancellationToken ct)
    {
        var target = await context.SmtpServers.FindAsync([request.Id], ct);
        if (target is null)
            return Result<bool>.Failure("Serveur SMTP introuvable.");
        if (!target.IsActive)
            return Result<bool>.Failure("Seul un serveur actif peut être défini par défaut. Activez-le d'abord.");

        // Only a handful of servers — load them all and flip the flag so exactly the target is default.
        var all = await context.SmtpServers.ToListAsync(ct);
        foreach (var s in all)
            s.IsDefault = s.Id == request.Id;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("SetDefault", "SmtpServer", target.Id, newValues: new { target.Name }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// Create
public record CreateSmtpServerCommand(string Name, string Host, int Port, string Username, string Password, string FromEmail, string FromName, bool UseSsl, bool IsActive, int? MaxPerHour) : IRequest<Result<Guid>>;

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
        // Optional per-hour send cap: when provided it must be a sane positive rate. Empty = unlimited.
        RuleFor(x => x.MaxPerHour!.Value).InclusiveBetween(1, 100000).WithMessage("La limite horaire doit être entre 1 et 100000.").When(x => x.MaxPerHour.HasValue);
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
            IsActive = request.IsActive,
            MaxPerHour = request.MaxPerHour
        };

        context.SmtpServers.Add(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "SmtpServer", entity.Id, newValues: new { entity.Name, entity.Host, entity.Port }, cancellationToken: ct);

        return Result<Guid>.Success(entity.Id);
    }
}

// Update — Password is optional: when blank/null the stored password is kept (UI never re-shows it).
public record UpdateSmtpServerCommand(Guid Id, string Name, string Host, int Port, string Username, string? Password, string FromEmail, string FromName, bool UseSsl, bool IsActive, int? MaxPerHour) : IRequest<Result<bool>>;

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
        RuleFor(x => x.MaxPerHour!.Value).InclusiveBetween(1, 100000).WithMessage("La limite horaire doit être entre 1 et 100000.").When(x => x.MaxPerHour.HasValue);
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
        // An inactive server can't be the default (the send only uses active servers) — clear the flag so the
        // fallback (oldest active) applies and the UI doesn't show "Par défaut" on a disabled server.
        if (!request.IsActive) entity.IsDefault = false;
        entity.MaxPerHour = request.MaxPerHour;

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

// Test — sends a real message via the saved server config to verify host/port/credentials/SSL.
public record TestSmtpCommand(Guid SmtpServerId, string TestEmail) : IRequest<Result<bool>>;

public class TestSmtpCommandValidator : AbstractValidator<TestSmtpCommand>
{
    public TestSmtpCommandValidator()
    {
        RuleFor(x => x.TestEmail).NotEmpty().EmailAddress().WithMessage("L'adresse email de test est invalide.");
    }
}

public class TestSmtpCommandHandler(IApplicationDbContext context, IConfiguration config) : IRequestHandler<TestSmtpCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(TestSmtpCommand request, CancellationToken ct)
    {
        var server = await context.SmtpServers.FindAsync([request.SmtpServerId], ct);
        if (server is null)
            return Result<bool>.Failure("Serveur SMTP introuvable.");

        // Same resolution as the real send: prefer the config password (Smtp:Passwords:<Name|Host>) so a
        // server whose secret lives only in appsettings can still be tested from the admin UI.
        var password = SmtpPassword.Resolve(config, server.Name, server.Host, server.Password);
        try
        {
            using var client = new SmtpClient(server.Host, server.Port)
            {
                Credentials = new NetworkCredential(server.Username, password),
                EnableSsl = server.UseSsl
            };

            // Include the SMTP server identity in the subject + body so that, when several servers are tested,
            // each received message clearly shows WHICH server it was sent through (the From address may be the
            // same @gndj.org on all of them).
            var message = new MailMessage(
                new MailAddress(server.FromEmail, server.FromName),
                new MailAddress(request.TestEmail))
            {
                Subject = $"Test GNDJ — Serveur SMTP « {server.Name} »",
                Body =
                    "Ce message de test confirme que la configuration SMTP fonctionne correctement.\n\n" +
                    "Envoyé via le serveur :\n" +
                    $"  • Nom : {server.Name}\n" +
                    $"  • Hôte : {server.Host}:{server.Port}\n" +
                    $"  • Utilisateur : {server.Username}\n" +
                    $"  • Expéditeur : {server.FromName} <{server.FromEmail}>\n" +
                    $"  • SSL : {(server.UseSsl ? "oui" : "non")}",
                IsBodyHtml = false
            };

            await client.SendMailAsync(message, ct);
            return Result<bool>.Success(true);
        }
        catch (Exception ex)
        {
            // Flatten the InnerException chain — SmtpException.Message is just "Failure sending mail.";
            // the real cause (auth rejected / TLS / "550 domain not allowed" / connection) is inside.
            return Result<bool>.Failure($"Erreur d'envoi : {ex.Flatten()}");
        }
    }
}
