using FluentValidation;
using GNDJ.Application.Common.Content;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Pages;

// ===== DTOs =====
public record PageAdminDto(Guid Id, string Title, string Slug, bool IsPublished, bool ShowInMenu, int DisplayOrder, Guid? ParentId);
public record PageEditDto(Guid Id, string Title, string BodyHtml, bool IsPublished, bool ShowInMenu, Guid? ParentId);
public record PublicPageNavDto(string Slug, string Title, IReadOnlyList<PublicPageNavDto> Children);
public record PublicPageDto(string Slug, string Title, string BodyHtml);

// ===== Create =====
public record CreatePageCommand(string Title, string BodyHtml, bool IsPublished, Guid? ParentId, bool ShowInMenu = true) : IRequest<Result<Guid>>;

public class CreatePageCommandValidator : AbstractValidator<CreatePageCommand>
{
    public CreatePageCommandValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithMessage("Le titre est requis.").MaximumLength(200).NoHtml();
        RuleFor(x => x.BodyHtml).NotEmpty().WithMessage("Le contenu est requis.").MaximumLength(100000);
    }
}

public class CreatePageCommandHandler(IApplicationDbContext context, IAuditService audit) : IRequestHandler<CreatePageCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreatePageCommand request, CancellationToken ct)
    {
        // Only one level of nesting: a sub-page's parent must itself be top-level.
        if (request.ParentId is not null)
        {
            var parent = await context.Pages.Where(p => p.Id == request.ParentId).Select(p => new { p.ParentId }).FirstOrDefaultAsync(ct);
            if (parent is null) return Result<Guid>.Failure("Page parente introuvable.");
            if (parent.ParentId is not null) return Result<Guid>.Failure("Une sous-page ne peut pas avoir de sous-pages.");
        }

        var baseSlug = ContentText.Slugify(request.Title);
        var slug = baseSlug;
        for (var i = 2; await context.Pages.AnyAsync(p => p.Slug == slug, ct); i++) slug = $"{baseSlug}-{i}";

        var maxOrder = await context.Pages.Where(p => p.ParentId == request.ParentId).MaxAsync(p => (int?)p.DisplayOrder, ct) ?? -1;

        var entity = new Page
        {
            Title = request.Title.Trim(),
            Slug = slug,
            BodyHtml = request.BodyHtml,
            IsPublished = request.IsPublished,
            ShowInMenu = request.ShowInMenu,
            ParentId = request.ParentId,
            DisplayOrder = maxOrder + 1,
        };
        context.Pages.Add(entity);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Create", "Page", entity.Id, newValues: new { entity.Title, entity.Slug, entity.IsPublished }, cancellationToken: ct);
        return Result<Guid>.Success(entity.Id);
    }
}

// ===== Update =====
public record UpdatePageCommand(Guid Id, string Title, string BodyHtml, bool IsPublished, Guid? ParentId, bool ShowInMenu = true) : IRequest<Result<bool>>;

public class UpdatePageCommandValidator : AbstractValidator<UpdatePageCommand>
{
    public UpdatePageCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Title).NotEmpty().WithMessage("Le titre est requis.").MaximumLength(200).NoHtml();
        RuleFor(x => x.BodyHtml).NotEmpty().WithMessage("Le contenu est requis.").MaximumLength(100000);
    }
}

public class UpdatePageCommandHandler(IApplicationDbContext context, IAuditService audit) : IRequestHandler<UpdatePageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdatePageCommand request, CancellationToken ct)
    {
        var entity = await context.Pages.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Page introuvable.");

        if (request.ParentId is not null)
        {
            if (request.ParentId == request.Id) return Result<bool>.Failure("Une page ne peut pas être sa propre parente.");
            var parent = await context.Pages.Where(p => p.Id == request.ParentId).Select(p => new { p.ParentId }).FirstOrDefaultAsync(ct);
            if (parent is null) return Result<bool>.Failure("Page parente introuvable.");
            if (parent.ParentId is not null) return Result<bool>.Failure("Une sous-page ne peut pas avoir de sous-pages.");
            // A page with children cannot itself become a sub-page (keep nesting to one level).
            if (await context.Pages.AnyAsync(p => p.ParentId == request.Id, ct))
                return Result<bool>.Failure("Cette page a des sous-pages ; elle ne peut pas devenir une sous-page.");
        }

        if (entity.ParentId != request.ParentId)
        {
            var maxOrder = await context.Pages.Where(p => p.ParentId == request.ParentId && p.Id != request.Id).MaxAsync(p => (int?)p.DisplayOrder, ct) ?? -1;
            entity.DisplayOrder = maxOrder + 1;
            entity.ParentId = request.ParentId;
        }

        entity.Title = request.Title.Trim();
        entity.BodyHtml = request.BodyHtml;
        entity.IsPublished = request.IsPublished;
        entity.ShowInMenu = request.ShowInMenu;

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Update", "Page", entity.Id, newValues: new { entity.Title, entity.Slug, entity.IsPublished }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ===== Delete =====
public record DeletePageCommand(Guid Id) : IRequest<Result<bool>>;

public class DeletePageCommandHandler(IApplicationDbContext context, IAuditService audit) : IRequestHandler<DeletePageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeletePageCommand request, CancellationToken ct)
    {
        var entity = await context.Pages.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Page introuvable.");
        if (await context.Pages.AnyAsync(p => p.ParentId == request.Id, ct))
            return Result<bool>.Failure("Supprimez ou déplacez d'abord les sous-pages.");
        context.Pages.Remove(entity);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Delete", "Page", entity.Id, oldValues: new { entity.Title }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ===== Reorder (draggable) =====
public record ReorderPagesCommand(Guid? ParentId, List<Guid> OrderedIds) : IRequest<Result<bool>>;

public class ReorderPagesCommandValidator : AbstractValidator<ReorderPagesCommand>
{
    public ReorderPagesCommandValidator()
        => RuleFor(x => x.OrderedIds).NotNull().Must(l => l.Count <= 1000).WithMessage("Trop d'éléments.");
}

public class ReorderPagesCommandHandler(IApplicationDbContext context) : IRequestHandler<ReorderPagesCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ReorderPagesCommand request, CancellationToken ct)
    {
        var pages = await context.Pages.Where(p => p.ParentId == request.ParentId && request.OrderedIds.Contains(p.Id)).ToListAsync(ct);
        for (var i = 0; i < request.OrderedIds.Count; i++)
        {
            var page = pages.FirstOrDefault(p => p.Id == request.OrderedIds[i]);
            if (page is not null) page.DisplayOrder = i;
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ===== Admin queries =====
public record GetPagesAdminQuery() : IRequest<IReadOnlyList<PageAdminDto>>;

public class GetPagesAdminQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPagesAdminQuery, IReadOnlyList<PageAdminDto>>
{
    public async ValueTask<IReadOnlyList<PageAdminDto>> Handle(GetPagesAdminQuery request, CancellationToken ct)
        => await context.Pages.OrderBy(p => p.DisplayOrder).ThenBy(p => p.Title)
            .Select(p => new PageAdminDto(p.Id, p.Title, p.Slug, p.IsPublished, p.ShowInMenu, p.DisplayOrder, p.ParentId)).ToListAsync(ct);
}

public record GetPageByIdQuery(Guid Id) : IRequest<PageEditDto?>;

public class GetPageByIdQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPageByIdQuery, PageEditDto?>
{
    public async ValueTask<PageEditDto?> Handle(GetPageByIdQuery request, CancellationToken ct)
        => await context.Pages.Where(p => p.Id == request.Id)
            .Select(p => new PageEditDto(p.Id, p.Title, p.BodyHtml, p.IsPublished, p.ShowInMenu, p.ParentId))
            .FirstOrDefaultAsync(ct);
}

// ===== Public queries =====
public record GetPublicPagesQuery() : IRequest<IReadOnlyList<PublicPageNavDto>>;

public class GetPublicPagesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPublicPagesQuery, IReadOnlyList<PublicPageNavDto>>
{
    public async ValueTask<IReadOnlyList<PublicPageNavDto>> Handle(GetPublicPagesQuery request, CancellationToken ct)
    {
        var pages = await context.Pages.Where(p => p.IsPublished)
            .OrderBy(p => p.DisplayOrder).ThenBy(p => p.Title)
            .Select(p => new { p.Id, p.Slug, p.Title, p.ParentId, p.ShowInMenu })
            .ToListAsync(ct);

        var children = pages.Where(p => p.ParentId is not null)
            .GroupBy(p => p.ParentId!.Value)
            .ToDictionary(g => g.Key, g => g.Select(c => new PublicPageNavDto(c.Slug, c.Title, [])).ToList());

        // Only top-level pages flagged ShowInMenu appear in the nav (keeps the bar clean with many pages).
        // Their sub-pages always show under them. Pages not in the menu remain reachable at /p/{slug}.
        return pages.Where(p => p.ParentId is null && p.ShowInMenu)
            .Select(p => new PublicPageNavDto(p.Slug, p.Title,
                children.TryGetValue(p.Id, out var ch) ? ch : []))
            .ToList();
    }
}

public record GetPublicPageQuery(string Slug) : IRequest<PublicPageDto?>;

public class GetPublicPageQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPublicPageQuery, PublicPageDto?>
{
    public async ValueTask<PublicPageDto?> Handle(GetPublicPageQuery request, CancellationToken ct)
    {
        var slug = request.Slug.Trim().ToLowerInvariant();
        return await context.Pages.Where(p => p.Slug == slug && p.IsPublished)
            .Select(p => new PublicPageDto(p.Slug, p.Title, p.BodyHtml)).FirstOrDefaultAsync(ct);
    }
}
