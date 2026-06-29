using FluentValidation;
using GNDJ.Application.Common.Content;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.News;

// ===== DTOs =====
public record NewsPostAdminDto(Guid Id, string Title, string Slug, bool IsPublished, DateTime? PublishedAt, DateTime CreatedAt, string TagLabel);
public record NewsAttachmentDto(string Name, string Url);
public record NewsPostEditDto(Guid Id, string Title, string BodyHtml, bool IsPublished, string TagType, Guid? TagUnitTypeId, Guid? TagUnitId, string? CoverImagePath, IReadOnlyList<NewsAttachmentDto> Attachments);
public record PublicNewsListItemDto(string Slug, string Title, string? Excerpt, DateTime? PublishedAt, string TagLabel, string? CoverImagePath);
public record PublicNewsArticleDto(string Slug, string Title, string BodyHtml, DateTime? PublishedAt, string TagLabel, string? CoverImagePath, IReadOnlyList<NewsAttachmentDto> Attachments);

// Attachments are stored as a JSON array on NewsPost.AttachmentsJson (no child table). These helpers
// (de)serialize defensively — a malformed/empty value reads as an empty list, never throws.
internal static class NewsAttachments
{
    public static IReadOnlyList<NewsAttachmentDto> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return System.Text.Json.JsonSerializer.Deserialize<List<NewsAttachmentDto>>(json) ?? []; }
        catch { return []; }
    }
    public static string? Serialize(IReadOnlyList<NewsAttachmentDto>? items)
    {
        var clean = (items ?? [])
            .Where(a => !string.IsNullOrWhiteSpace(a.Url) && !string.IsNullOrWhiteSpace(a.Name))
            .Select(a => new NewsAttachmentDto(a.Name.Trim(), a.Url.Trim()))
            .ToList();
        return clean.Count == 0 ? null : System.Text.Json.JsonSerializer.Serialize(clean);
    }
}

internal static class NewsAttachmentValidation
{
    // Cap the list and validate each entry (name shown to the public; url comes from the upload endpoint).
    public static void Rules<T>(AbstractValidator<T> v, System.Func<T, IReadOnlyList<NewsAttachmentDto>?> attachments)
    {
        v.RuleFor(x => attachments(x)).Must(a => a == null || a.Count <= 20).WithMessage("Trop de pièces jointes (max 20).");
        v.RuleForEach(x => attachments(x)).ChildRules(a =>
        {
            a.RuleFor(z => z.Name).NotEmpty().MaximumLength(200).NoHtml();
            a.RuleFor(z => z.Url).NotEmpty().MaximumLength(500);
        });
    }
}

internal static class NewsTagValidation
{
    public static void Rules<T>(AbstractValidator<T> v,
        System.Func<T, string> tagType, System.Func<T, System.Guid?> unitTypeId, System.Func<T, System.Guid?> unitId)
    {
        v.RuleFor(x => tagType(x)).Must(t => NewsTagTypes.All.Contains(t)).WithMessage("Étiquette invalide.");
        v.RuleFor(x => unitTypeId(x)).NotNull().When(x => tagType(x) == NewsTagTypes.UnitType).WithMessage("Choisissez une branche.");
        v.RuleFor(x => unitId(x)).NotNull().When(x => tagType(x) == NewsTagTypes.Unit).WithMessage("Choisissez une unité.");
    }
}

internal static class NewsTagLabel
{
    // EF-translatable label expression is inlined in each query; this is the in-memory fallback name.
    public const string Group = "Tout le groupe";
}

// ===== Create =====
public record CreateNewsPostCommand(string Title, string BodyHtml, bool IsPublished, string TagType, Guid? TagUnitTypeId, Guid? TagUnitId, string? CoverImagePath = null, IReadOnlyList<NewsAttachmentDto>? Attachments = null)
    : IRequest<Result<Guid>>;

public class CreateNewsPostCommandValidator : AbstractValidator<CreateNewsPostCommand>
{
    public CreateNewsPostCommandValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithMessage("Le titre est requis.").MaximumLength(200).NoHtml();
        RuleFor(x => x.BodyHtml).NotEmpty().WithMessage("Le contenu est requis.").MaximumLength(100000);
        RuleFor(x => x.CoverImagePath).MaximumLength(500); // a relative URL/path from the image upload endpoint
        NewsAttachmentValidation.Rules(this, x => x.Attachments);
        NewsTagValidation.Rules(this, x => x.TagType, x => x.TagUnitTypeId, x => x.TagUnitId);
    }
}

public class CreateNewsPostCommandHandler(IApplicationDbContext context, IAuditService audit) : IRequestHandler<CreateNewsPostCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateNewsPostCommand request, CancellationToken ct)
    {
        var baseSlug = ContentText.Slugify(request.Title);
        var slug = baseSlug;
        for (var i = 2; await context.NewsPosts.AnyAsync(n => n.Slug == slug, ct); i++) slug = $"{baseSlug}-{i}";

        var entity = new NewsPost
        {
            Title = request.Title.Trim(),
            Slug = slug,
            Summary = ContentText.Excerpt(request.BodyHtml),
            BodyHtml = request.BodyHtml,
            IsPublished = request.IsPublished,
            PublishedAt = request.IsPublished ? DateTime.UtcNow : null,
            TagType = request.TagType,
            TagUnitTypeId = request.TagType == NewsTagTypes.UnitType ? request.TagUnitTypeId : null,
            TagUnitId = request.TagType == NewsTagTypes.Unit ? request.TagUnitId : null,
            CoverImagePath = string.IsNullOrWhiteSpace(request.CoverImagePath) ? null : request.CoverImagePath.Trim(),
            AttachmentsJson = NewsAttachments.Serialize(request.Attachments),
        };
        context.NewsPosts.Add(entity);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Create", "NewsPost", entity.Id, newValues: new { entity.Title, entity.Slug, entity.IsPublished }, cancellationToken: ct);
        return Result<Guid>.Success(entity.Id);
    }
}

// ===== Update =====
public record UpdateNewsPostCommand(Guid Id, string Title, string BodyHtml, bool IsPublished, string TagType, Guid? TagUnitTypeId, Guid? TagUnitId, string? CoverImagePath = null, IReadOnlyList<NewsAttachmentDto>? Attachments = null)
    : IRequest<Result<bool>>;

public class UpdateNewsPostCommandValidator : AbstractValidator<UpdateNewsPostCommand>
{
    public UpdateNewsPostCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Title).NotEmpty().WithMessage("Le titre est requis.").MaximumLength(200).NoHtml();
        RuleFor(x => x.BodyHtml).NotEmpty().WithMessage("Le contenu est requis.").MaximumLength(100000);
        RuleFor(x => x.CoverImagePath).MaximumLength(500);
        NewsAttachmentValidation.Rules(this, x => x.Attachments);
        NewsTagValidation.Rules(this, x => x.TagType, x => x.TagUnitTypeId, x => x.TagUnitId);
    }
}

public class UpdateNewsPostCommandHandler(IApplicationDbContext context, IAuditService audit) : IRequestHandler<UpdateNewsPostCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateNewsPostCommand request, CancellationToken ct)
    {
        var entity = await context.NewsPosts.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Article introuvable.");

        if (request.IsPublished && entity.PublishedAt is null) entity.PublishedAt = DateTime.UtcNow;

        entity.Title = request.Title.Trim();
        entity.Summary = ContentText.Excerpt(request.BodyHtml);
        entity.BodyHtml = request.BodyHtml;
        entity.IsPublished = request.IsPublished;
        entity.TagType = request.TagType;
        entity.TagUnitTypeId = request.TagType == NewsTagTypes.UnitType ? request.TagUnitTypeId : null;
        entity.TagUnitId = request.TagType == NewsTagTypes.Unit ? request.TagUnitId : null;
        entity.CoverImagePath = string.IsNullOrWhiteSpace(request.CoverImagePath) ? null : request.CoverImagePath.Trim();
        entity.AttachmentsJson = NewsAttachments.Serialize(request.Attachments);
        // Slug is kept stable across edits to preserve existing links.

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Update", "NewsPost", entity.Id, newValues: new { entity.Title, entity.Slug, entity.IsPublished }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ===== Delete =====
public record DeleteNewsPostCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteNewsPostCommandHandler(IApplicationDbContext context, IAuditService audit) : IRequestHandler<DeleteNewsPostCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteNewsPostCommand request, CancellationToken ct)
    {
        var entity = await context.NewsPosts.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Article introuvable.");
        context.NewsPosts.Remove(entity);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Delete", "NewsPost", entity.Id, oldValues: new { entity.Title }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ===== Admin queries =====
public record GetNewsPostsAdminQuery() : IRequest<IReadOnlyList<NewsPostAdminDto>>;

public class GetNewsPostsAdminQueryHandler(IApplicationDbContext context) : IRequestHandler<GetNewsPostsAdminQuery, IReadOnlyList<NewsPostAdminDto>>
{
    public async ValueTask<IReadOnlyList<NewsPostAdminDto>> Handle(GetNewsPostsAdminQuery request, CancellationToken ct)
        => await context.NewsPosts
            .OrderByDescending(n => n.PublishedAt ?? n.CreatedAt)
            .Select(n => new NewsPostAdminDto(n.Id, n.Title, n.Slug, n.IsPublished, n.PublishedAt, n.CreatedAt,
                n.TagType == NewsTagTypes.Unit
                    ? (context.Units.Where(u => u.Id == n.TagUnitId).Select(u => u.Name).FirstOrDefault() ?? "Unité")
                    : n.TagType == NewsTagTypes.UnitType
                    ? (context.UnitTypes.Where(t => t.Id == n.TagUnitTypeId).Select(t => t.Name).FirstOrDefault() ?? "Branche")
                    : NewsTagLabel.Group))
            .ToListAsync(ct);
}

public record GetNewsPostByIdQuery(Guid Id) : IRequest<NewsPostEditDto?>;

public class GetNewsPostByIdQueryHandler(IApplicationDbContext context) : IRequestHandler<GetNewsPostByIdQuery, NewsPostEditDto?>
{
    public async ValueTask<NewsPostEditDto?> Handle(GetNewsPostByIdQuery request, CancellationToken ct)
    {
        // Project to an intermediate (AttachmentsJson is a raw column), then deserialize in memory.
        var n = await context.NewsPosts.Where(n => n.Id == request.Id)
            .Select(n => new { n.Id, n.Title, n.BodyHtml, n.IsPublished, n.TagType, n.TagUnitTypeId, n.TagUnitId, n.CoverImagePath, n.AttachmentsJson })
            .FirstOrDefaultAsync(ct);
        return n is null ? null
            : new NewsPostEditDto(n.Id, n.Title, n.BodyHtml, n.IsPublished, n.TagType, n.TagUnitTypeId, n.TagUnitId, n.CoverImagePath, NewsAttachments.Parse(n.AttachmentsJson));
    }
}

// ===== Public queries =====
// GroupOnly = only "tout le groupe" posts; UnitTypeId = posts for that branch (a Unit-tagged post rolls up
// to its unit's branch). Both unset = every published post. Used by the public /actualites tag filter.
public record GetPublicNewsQuery(int Page = 1, int PageSize = 12, bool GroupOnly = false, Guid? UnitTypeId = null)
    : IRequest<PaginatedList<PublicNewsListItemDto>>;

public class GetPublicNewsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPublicNewsQuery, PaginatedList<PublicNewsListItemDto>>
{
    public async ValueTask<PaginatedList<PublicNewsListItemDto>> Handle(GetPublicNewsQuery request, CancellationToken ct)
    {
        var filtered = context.NewsPosts.Where(n => n.IsPublished);
        if (request.GroupOnly)
            filtered = filtered.Where(n => n.TagType == NewsTagTypes.Group);
        else if (request.UnitTypeId is Guid utid)
            filtered = filtered.Where(n =>
                (n.TagType == NewsTagTypes.UnitType && n.TagUnitTypeId == utid)
                || (n.TagType == NewsTagTypes.Unit && context.Units.Where(u => u.Id == n.TagUnitId).Select(u => u.UnitTypeId).FirstOrDefault() == utid));

        var query = filtered
            .OrderByDescending(n => n.PublishedAt)
            .Select(n => new PublicNewsListItemDto(n.Slug, n.Title, n.Summary, n.PublishedAt,
                n.TagType == NewsTagTypes.Unit
                    ? (context.Units.Where(u => u.Id == n.TagUnitId).Select(u => u.Name).FirstOrDefault() ?? "Unité")
                    : n.TagType == NewsTagTypes.UnitType
                    ? (context.UnitTypes.Where(t => t.Id == n.TagUnitTypeId).Select(t => t.Name).FirstOrDefault() ?? "Branche")
                    : NewsTagLabel.Group,
                n.CoverImagePath));
        return await PaginatedList<PublicNewsListItemDto>.CreateAsync(query, request.Page, Math.Clamp(request.PageSize, 1, 50), ct);
    }
}

public record GetPublicNewsArticleQuery(string Slug) : IRequest<PublicNewsArticleDto?>;

public class GetPublicNewsArticleQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPublicNewsArticleQuery, PublicNewsArticleDto?>
{
    public async ValueTask<PublicNewsArticleDto?> Handle(GetPublicNewsArticleQuery request, CancellationToken ct)
    {
        var slug = request.Slug.Trim().ToLowerInvariant();
        // Project to an intermediate (tag label computed in SQL; AttachmentsJson raw), then map in memory.
        var n = await context.NewsPosts.Where(n => n.Slug == slug && n.IsPublished)
            .Select(n => new
            {
                n.Slug, n.Title, n.BodyHtml, n.PublishedAt, n.CoverImagePath, n.AttachmentsJson,
                TagLabel = n.TagType == NewsTagTypes.Unit
                    ? (context.Units.Where(u => u.Id == n.TagUnitId).Select(u => u.Name).FirstOrDefault() ?? "Unité")
                    : n.TagType == NewsTagTypes.UnitType
                    ? (context.UnitTypes.Where(t => t.Id == n.TagUnitTypeId).Select(t => t.Name).FirstOrDefault() ?? "Branche")
                    : NewsTagLabel.Group,
            })
            .FirstOrDefaultAsync(ct);
        return n is null ? null
            : new PublicNewsArticleDto(n.Slug, n.Title, n.BodyHtml, n.PublishedAt, n.TagLabel, n.CoverImagePath, NewsAttachments.Parse(n.AttachmentsJson));
    }
}
