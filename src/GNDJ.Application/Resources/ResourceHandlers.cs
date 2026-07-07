using FluentValidation;
using GNDJ.Application.Common.Content;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Resources;

// Heritage / knowledge-base resources (CMS) for the public "Ressources" library. Mirrors the News feature
// (slug + rich body + cover + mp3/PDF/image attachments) but organised by Category with free-text Tags and
// a public search. Content is hand-curated by the chefs — no automated import.

// ===== DTOs =====
public record ResourceAttachmentDto(string Name, string Url);
public record ResourceAdminDto(Guid Id, string Title, string Slug, string Category, bool IsPublished, DateTime CreatedAt);
public record ResourceEditDto(Guid Id, string Title, string BodyHtml, string Category, string? Tags, string? CoverImagePath, bool IsPublished, IReadOnlyList<ResourceAttachmentDto> Attachments);
public record PublicResourceListItemDto(string Slug, string Title, string? Excerpt, string Category, string? Tags, string? CoverImagePath, int AttachmentCount);
public record PublicResourceDetailDto(string Slug, string Title, string BodyHtml, string Category, string? Tags, string? CoverImagePath, IReadOnlyList<ResourceAttachmentDto> Attachments);

// Attachments stored as a JSON array on Resource.AttachmentsJson (no child table). (De)serialize defensively.
internal static class ResourceAttachments
{
    public static IReadOnlyList<ResourceAttachmentDto> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return System.Text.Json.JsonSerializer.Deserialize<List<ResourceAttachmentDto>>(json) ?? []; }
        catch { return []; }
    }
    public static string? Serialize(IReadOnlyList<ResourceAttachmentDto>? items)
    {
        var clean = (items ?? [])
            .Where(a => !string.IsNullOrWhiteSpace(a.Url) && !string.IsNullOrWhiteSpace(a.Name))
            .Select(a => new ResourceAttachmentDto(a.Name.Trim(), a.Url.Trim()))
            .ToList();
        return clean.Count == 0 ? null : System.Text.Json.JsonSerializer.Serialize(clean);
    }
}

internal static class ResourceValidation
{
    // Scalar rules shared by Create/Update (attachments are validated in each validator with a direct
    // member expression so FluentValidation can infer the property name for the child paths).
    public static void Common<T>(AbstractValidator<T> v, System.Func<T, string> title, System.Func<T, string> body,
        System.Func<T, string> category, System.Func<T, string?> tags, System.Func<T, string?> cover)
    {
        v.RuleFor(x => title(x)).NotEmpty().WithMessage("Le titre est requis.").MaximumLength(200).NoHtml();
        v.RuleFor(x => body(x)).NotEmpty().WithMessage("Le contenu est requis.").MaximumLength(100000);
        v.RuleFor(x => category(x)).Must(c => ResourceCategories.All.Contains(c)).WithMessage("Catégorie invalide.");
        v.RuleFor(x => tags(x)).MaximumLength(400).NoHtml().When(x => tags(x) != null);
        v.RuleFor(x => cover(x)).MaximumLength(500);
    }
}

// ===== Create =====
public record CreateResourceCommand(string Title, string BodyHtml, string Category, string? Tags, string? CoverImagePath = null, bool IsPublished = false, IReadOnlyList<ResourceAttachmentDto>? Attachments = null)
    : IRequest<Result<Guid>>;

public class CreateResourceCommandValidator : AbstractValidator<CreateResourceCommand>
{
    public CreateResourceCommandValidator()
    {
        ResourceValidation.Common(this, x => x.Title, x => x.BodyHtml, x => x.Category, x => x.Tags, x => x.CoverImagePath);
        RuleFor(x => x.Attachments).Must(a => a == null || a.Count <= 30).WithMessage("Trop de fichiers (max 30).");
        RuleForEach(x => x.Attachments).ChildRules(a =>
        {
            a.RuleFor(z => z.Name).NotEmpty().MaximumLength(200).NoHtml();
            a.RuleFor(z => z.Url).NotEmpty().MaximumLength(500);
        });
    }
}

public class CreateResourceCommandHandler(IApplicationDbContext context, IAuditService audit) : IRequestHandler<CreateResourceCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateResourceCommand request, CancellationToken ct)
    {
        var baseSlug = ContentText.Slugify(request.Title);
        var slug = baseSlug;
        for (var i = 2; await context.Resources.AnyAsync(r => r.Slug == slug, ct); i++) slug = $"{baseSlug}-{i}";

        var entity = new Resource
        {
            Title = request.Title.Trim(),
            Slug = slug,
            Summary = ContentText.Excerpt(request.BodyHtml),
            BodyHtml = request.BodyHtml,
            Category = request.Category,
            Tags = string.IsNullOrWhiteSpace(request.Tags) ? null : request.Tags.Trim(),
            CoverImagePath = string.IsNullOrWhiteSpace(request.CoverImagePath) ? null : request.CoverImagePath.Trim(),
            AttachmentsJson = ResourceAttachments.Serialize(request.Attachments),
            IsPublished = request.IsPublished,
            PublishedAt = request.IsPublished ? DateTime.UtcNow : null,
        };
        context.Resources.Add(entity);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Create", "Resource", entity.Id, newValues: new { entity.Title, entity.Slug, entity.Category, entity.IsPublished }, cancellationToken: ct);
        return Result<Guid>.Success(entity.Id);
    }
}

// ===== Update =====
public record UpdateResourceCommand(Guid Id, string Title, string BodyHtml, string Category, string? Tags, string? CoverImagePath = null, bool IsPublished = false, IReadOnlyList<ResourceAttachmentDto>? Attachments = null)
    : IRequest<Result<bool>>;

public class UpdateResourceCommandValidator : AbstractValidator<UpdateResourceCommand>
{
    public UpdateResourceCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        ResourceValidation.Common(this, x => x.Title, x => x.BodyHtml, x => x.Category, x => x.Tags, x => x.CoverImagePath);
        RuleFor(x => x.Attachments).Must(a => a == null || a.Count <= 30).WithMessage("Trop de fichiers (max 30).");
        RuleForEach(x => x.Attachments).ChildRules(a =>
        {
            a.RuleFor(z => z.Name).NotEmpty().MaximumLength(200).NoHtml();
            a.RuleFor(z => z.Url).NotEmpty().MaximumLength(500);
        });
    }
}

public class UpdateResourceCommandHandler(IApplicationDbContext context, IAuditService audit) : IRequestHandler<UpdateResourceCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateResourceCommand request, CancellationToken ct)
    {
        var entity = await context.Resources.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Ressource introuvable.");

        if (request.IsPublished && entity.PublishedAt is null) entity.PublishedAt = DateTime.UtcNow;

        entity.Title = request.Title.Trim();
        entity.Summary = ContentText.Excerpt(request.BodyHtml);
        entity.BodyHtml = request.BodyHtml;
        entity.Category = request.Category;
        entity.Tags = string.IsNullOrWhiteSpace(request.Tags) ? null : request.Tags.Trim();
        entity.CoverImagePath = string.IsNullOrWhiteSpace(request.CoverImagePath) ? null : request.CoverImagePath.Trim();
        entity.AttachmentsJson = ResourceAttachments.Serialize(request.Attachments);
        entity.IsPublished = request.IsPublished;
        // Slug is kept stable across edits to preserve existing links.

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Update", "Resource", entity.Id, newValues: new { entity.Title, entity.Slug, entity.Category, entity.IsPublished }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ===== Delete =====
public record DeleteResourceCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteResourceCommandHandler(IApplicationDbContext context, IAuditService audit) : IRequestHandler<DeleteResourceCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteResourceCommand request, CancellationToken ct)
    {
        var entity = await context.Resources.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Ressource introuvable.");
        context.Resources.Remove(entity);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Delete", "Resource", entity.Id, oldValues: new { entity.Title }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ===== Admin queries =====
public record GetResourcesAdminQuery() : IRequest<IReadOnlyList<ResourceAdminDto>>;

public class GetResourcesAdminQueryHandler(IApplicationDbContext context) : IRequestHandler<GetResourcesAdminQuery, IReadOnlyList<ResourceAdminDto>>
{
    public async ValueTask<IReadOnlyList<ResourceAdminDto>> Handle(GetResourcesAdminQuery request, CancellationToken ct)
        => await context.Resources
            .OrderBy(r => r.Category).ThenBy(r => r.Title)
            .Select(r => new ResourceAdminDto(r.Id, r.Title, r.Slug, r.Category, r.IsPublished, r.CreatedAt))
            .ToListAsync(ct);
}

public record GetResourceByIdQuery(Guid Id) : IRequest<ResourceEditDto?>;

public class GetResourceByIdQueryHandler(IApplicationDbContext context) : IRequestHandler<GetResourceByIdQuery, ResourceEditDto?>
{
    public async ValueTask<ResourceEditDto?> Handle(GetResourceByIdQuery request, CancellationToken ct)
    {
        var r = await context.Resources.Where(r => r.Id == request.Id)
            .Select(r => new { r.Id, r.Title, r.BodyHtml, r.Category, r.Tags, r.CoverImagePath, r.IsPublished, r.AttachmentsJson })
            .FirstOrDefaultAsync(ct);
        return r is null ? null
            : new ResourceEditDto(r.Id, r.Title, r.BodyHtml, r.Category, r.Tags, r.CoverImagePath, r.IsPublished, ResourceAttachments.Parse(r.AttachmentsJson));
    }
}

// ===== Public queries =====
// Optional category filter + free-text search (title / summary / tags, case-insensitive).
public record GetPublicResourcesQuery(string? Category = null, string? Search = null, int Page = 1, int PageSize = 24)
    : IRequest<PaginatedList<PublicResourceListItemDto>>;

public class GetPublicResourcesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPublicResourcesQuery, PaginatedList<PublicResourceListItemDto>>
{
    public async ValueTask<PaginatedList<PublicResourceListItemDto>> Handle(GetPublicResourcesQuery request, CancellationToken ct)
    {
        var filtered = context.Resources.Where(r => r.IsPublished);
        if (!string.IsNullOrWhiteSpace(request.Category) && ResourceCategories.All.Contains(request.Category))
            filtered = filtered.Where(r => r.Category == request.Category);
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToLower();
            filtered = filtered.Where(r => r.Title.ToLower().Contains(term)
                || (r.Summary != null && r.Summary.ToLower().Contains(term))
                || (r.Tags != null && r.Tags.ToLower().Contains(term)));
        }

        var query = filtered
            .OrderBy(r => r.Title)
            .Select(r => new PublicResourceListItemDto(r.Slug, r.Title, r.Summary, r.Category, r.Tags, r.CoverImagePath,
                r.AttachmentsJson == null ? 0 : 1)); // presence flag (real count parsed client-side if needed)
        return await PaginatedList<PublicResourceListItemDto>.CreateAsync(query, request.Page, Math.Clamp(request.PageSize, 1, 60), ct);
    }
}

public record GetPublicResourceBySlugQuery(string Slug) : IRequest<PublicResourceDetailDto?>;

public class GetPublicResourceBySlugQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPublicResourceBySlugQuery, PublicResourceDetailDto?>
{
    public async ValueTask<PublicResourceDetailDto?> Handle(GetPublicResourceBySlugQuery request, CancellationToken ct)
    {
        var slug = request.Slug.Trim().ToLowerInvariant();
        var r = await context.Resources.Where(r => r.Slug == slug && r.IsPublished)
            .Select(r => new { r.Slug, r.Title, r.BodyHtml, r.Category, r.Tags, r.CoverImagePath, r.AttachmentsJson })
            .FirstOrDefaultAsync(ct);
        return r is null ? null
            : new PublicResourceDetailDto(r.Slug, r.Title, r.BodyHtml, r.Category, r.Tags, r.CoverImagePath, ResourceAttachments.Parse(r.AttachmentsJson));
    }
}
