using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace GNDJ.Application.ApiKeys;

// DTOs
public record ApiKeyDto(Guid Id, string Name, string KeyPrefix, string Scopes, Guid? MemberId, string? MemberName, bool IsActive, DateTime? ExpiresAt, DateTime? LastUsedAt, DateTime CreatedAt);
public record ApiKeyCreatedDto(Guid Id, string Key); // Key only shown once at creation

// Get all
public record GetApiKeysQuery() : IRequest<IReadOnlyList<ApiKeyDto>>;

public class GetApiKeysQueryHandler(IApplicationDbContext context) : IRequestHandler<GetApiKeysQuery, IReadOnlyList<ApiKeyDto>>
{
    public async ValueTask<IReadOnlyList<ApiKeyDto>> Handle(GetApiKeysQuery request, CancellationToken ct)
    {
        return await context.ApiKeys
            .OrderByDescending(k => k.CreatedAt)
            .Select(k => new ApiKeyDto(
                k.Id, k.Name, k.KeyPrefix, k.Scopes, k.MemberId,
                k.Member != null ? k.Member.FirstName + " " + k.Member.LastName : null,
                k.IsActive, k.ExpiresAt, k.LastUsedAt, k.CreatedAt
            ))
            .ToListAsync(ct);
    }
}

// Create
public record CreateApiKeyCommand(string Name, string Scopes, Guid? MemberId, DateTime? ExpiresAt) : IRequest<Result<ApiKeyCreatedDto>>;

public class CreateApiKeyCommandValidator : AbstractValidator<CreateApiKeyCommand>
{
    public CreateApiKeyCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.Scopes).NotEmpty().WithMessage("Les scopes sont requis.");
    }
}

public class CreateApiKeyCommandHandler(IApplicationDbContext context, IPasswordHasher passwordHasher, IAuditService auditService) : IRequestHandler<CreateApiKeyCommand, Result<ApiKeyCreatedDto>>
{
    public async ValueTask<Result<ApiKeyCreatedDto>> Handle(CreateApiKeyCommand request, CancellationToken ct)
    {
        // Generate a secure random key
        var keyBytes = RandomNumberGenerator.GetBytes(32);
        var rawKey = $"gndj_{Convert.ToBase64String(keyBytes).Replace("+", "").Replace("/", "").Replace("=", "")}";
        var prefix = rawKey[..8];

        var entity = new ApiKey
        {
            Name = request.Name,
            KeyHash = passwordHasher.Hash(rawKey),
            KeyPrefix = prefix,
            Scopes = request.Scopes,
            MemberId = request.MemberId,
            IsActive = true,
            ExpiresAt = request.ExpiresAt
        };

        context.ApiKeys.Add(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "ApiKey", entity.Id, newValues: new { entity.Name, entity.Scopes }, cancellationToken: ct);

        return Result<ApiKeyCreatedDto>.Success(new ApiKeyCreatedDto(entity.Id, rawKey));
    }
}

// Toggle active
public record ToggleApiKeyCommand(Guid Id) : IRequest<Result<bool>>;

public class ToggleApiKeyCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<ToggleApiKeyCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ToggleApiKeyCommand request, CancellationToken ct)
    {
        var entity = await context.ApiKeys.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Clé API introuvable.");

        entity.IsActive = !entity.IsActive;
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "ApiKey", entity.Id, newValues: new { entity.IsActive }, cancellationToken: ct);

        return Result<bool>.Success(entity.IsActive);
    }
}

// Delete
public record DeleteApiKeyCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteApiKeyCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<DeleteApiKeyCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteApiKeyCommand request, CancellationToken ct)
    {
        var entity = await context.ApiKeys.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Clé API introuvable.");

        context.ApiKeys.Remove(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "ApiKey", entity.Id, oldValues: new { entity.Name }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
