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
public record NewsPostEditDto(Guid Id, string Title, string BodyHtml, bool IsPublished, string TagType, Guid? TagUnitTypeId, Guid? TagUnitId);
public record PublicNewsListItemDto(string Slug, string Title, string? Excerpt, DateTime? PublishedAt, string TagLabel);
public record PublicNewsArticleDto(string Slug, string Title, string BodyHtml, DateTime? PublishedAt, string TagLabel);

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
public record CreateNewsPostCommand(string Title, string BodyHtml, bool IsPublished, string TagType, Guid? TagUnitTypeId, Guid? TagUnitId)
    : IRequest<Result<Guid>>;

public class CreateNewsPostCommandValidator : AbstractValidator<CreateNewsPostCommand>
{
    public CreateNewsPostCommandValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithMessage("Le titre est requis.").MaximumLength(200).NoHtml();
        RuleFor(x => x.BodyHtml).NotEmpty().WithMessage("Le contenu est requis.").MaximumLength(100000);
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
        };
        context.NewsPosts.Add(entity);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Create", "NewsPost", entity.Id, newValues: new { entity.Title, entity.Slug, entity.IsPublished }, cancellationToken: ct);
        return Result<Guid>.Success(entity.Id);
    }
}

// ===== Update =====
public record UpdateNewsPostCommand(Guid Id, string Title, string BodyHtml, bool IsPublished, string TagType, Guid? TagUnitTypeId, Guid? TagUnitId)
    : IRequest<Result<bool>>;

public class UpdateNewsPostCommandValidator : AbstractValidator<UpdateNewsPostCommand>
{
    public UpdateNewsPostCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Title).NotEmpty().WithMessage("Le titre est requis.").MaximumLength(200).NoHtml();
        RuleFor(x => x.BodyHtml).NotEmpty().WithMessage("Le contenu est requis.").MaximumLength(100000);
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
        => await context.NewsPosts.Where(n => n.Id == request.Id)
            .Select(n => new NewsPostEditDto(n.Id, n.Title, n.BodyHtml, n.IsPublished, n.TagType, n.TagUnitTypeId, n.TagUnitId))
            .FirstOrDefaultAsync(ct);
}

// ===== Public queries =====
public record GetPublicNewsQuery(int Page = 1, int PageSize = 12) : IRequest<PaginatedList<PublicNewsListItemDto>>;

public class GetPublicNewsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPublicNewsQuery, PaginatedList<PublicNewsListItemDto>>
{
    public async ValueTask<PaginatedList<PublicNewsListItemDto>> Handle(GetPublicNewsQuery request, CancellationToken ct)
    {
        var query = context.NewsPosts
            .Where(n => n.IsPublished)
            .OrderByDescending(n => n.PublishedAt)
            .Select(n => new PublicNewsListItemDto(n.Slug, n.Title, n.Summary, n.PublishedAt,
                n.TagType == NewsTagTypes.Unit
                    ? (context.Units.Where(u => u.Id == n.TagUnitId).Select(u => u.Name).FirstOrDefault() ?? "Unité")
                    : n.TagType == NewsTagTypes.UnitType
                    ? (context.UnitTypes.Where(t => t.Id == n.TagUnitTypeId).Select(t => t.Name).FirstOrDefault() ?? "Branche")
                    : NewsTagLabel.Group));
        return await PaginatedList<PublicNewsListItemDto>.CreateAsync(query, request.Page, Math.Clamp(request.PageSize, 1, 50), ct);
    }
}

public record GetPublicNewsArticleQuery(string Slug) : IRequest<PublicNewsArticleDto?>;

public class GetPublicNewsArticleQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPublicNewsArticleQuery, PublicNewsArticleDto?>
{
    public async ValueTask<PublicNewsArticleDto?> Handle(GetPublicNewsArticleQuery request, CancellationToken ct)
    {
        var slug = request.Slug.Trim().ToLowerInvariant();
        return await context.NewsPosts.Where(n => n.Slug == slug && n.IsPublished)
            .Select(n => new PublicNewsArticleDto(n.Slug, n.Title, n.BodyHtml, n.PublishedAt,
                n.TagType == NewsTagTypes.Unit
                    ? (context.Units.Where(u => u.Id == n.TagUnitId).Select(u => u.Name).FirstOrDefault() ?? "Unité")
                    : n.TagType == NewsTagTypes.UnitType
                    ? (context.UnitTypes.Where(t => t.Id == n.TagUnitTypeId).Select(t => t.Name).FirstOrDefault() ?? "Branche")
                    : NewsTagLabel.Group))
            .FirstOrDefaultAsync(ct);
    }
}
