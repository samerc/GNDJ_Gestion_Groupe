using FluentValidation;
using GNDJ.Application.Common.Content;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Events;

// Public calendar events (CMS). Mirrors the News feature (slug + rich body + cover + branch/unit tag) but
// with scheduling (StartDate + optional EndDate/TimeLabel/Location) and an "upcoming-only" public query.

// ===== DTOs =====
public record EventAdminDto(Guid Id, string Title, string Slug, DateOnly StartDate, DateOnly? EndDate, bool IsPublished, string TagLabel);
public record EventEditDto(Guid Id, string Title, string BodyHtml, DateOnly StartDate, DateOnly? EndDate, string? TimeLabel, string? Location, bool IsPublished, string TagType, Guid? TagUnitTypeId, Guid? TagUnitId, string? CoverImagePath);
public record PublicEventListItemDto(string Slug, string Title, string? Excerpt, DateOnly StartDate, DateOnly? EndDate, string? TimeLabel, string? Location, string TagLabel, string? CoverImagePath);
public record PublicEventDetailDto(string Slug, string Title, string BodyHtml, DateOnly StartDate, DateOnly? EndDate, string? TimeLabel, string? Location, string TagLabel, string? CoverImagePath);

internal static class EventTagValidation
{
    public static void Rules<T>(AbstractValidator<T> v,
        System.Func<T, string> tagType, System.Func<T, System.Guid?> unitTypeId, System.Func<T, System.Guid?> unitId)
    {
        v.RuleFor(x => tagType(x)).Must(t => EventTagTypes.All.Contains(t)).WithMessage("Étiquette invalide.");
        v.RuleFor(x => unitTypeId(x)).NotNull().When(x => tagType(x) == EventTagTypes.UnitType).WithMessage("Choisissez une branche.");
        v.RuleFor(x => unitId(x)).NotNull().When(x => tagType(x) == EventTagTypes.Unit).WithMessage("Choisissez une unité.");
    }
}

internal static class EventTagLabel
{
    public const string Group = "Tout le groupe";
}

internal static class EventSchedule
{
    public static void Rules<T>(AbstractValidator<T> v, System.Func<T, DateOnly> start, System.Func<T, DateOnly?> end,
        System.Func<T, string?> time, System.Func<T, string?> location)
    {
        v.RuleFor(x => start(x)).NotEqual(default(DateOnly)).WithMessage("La date de début est requise.");
        v.RuleFor(x => end(x)).GreaterThanOrEqualTo(x => start(x)).When(x => end(x).HasValue)
            .WithMessage("La date de fin doit être après la date de début.");
        v.RuleFor(x => time(x)).MaximumLength(80).NoHtml().When(x => time(x) != null);
        v.RuleFor(x => location(x)).MaximumLength(200).NoHtml().When(x => location(x) != null);
    }
}

// ===== Create =====
public record CreateEventCommand(string Title, string BodyHtml, DateOnly StartDate, DateOnly? EndDate, string? TimeLabel, string? Location, bool IsPublished, string TagType, Guid? TagUnitTypeId, Guid? TagUnitId, string? CoverImagePath = null)
    : IRequest<Result<Guid>>;

public class CreateEventCommandValidator : AbstractValidator<CreateEventCommand>
{
    public CreateEventCommandValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithMessage("Le titre est requis.").MaximumLength(200).NoHtml();
        RuleFor(x => x.BodyHtml).NotEmpty().WithMessage("Le contenu est requis.").MaximumLength(100000);
        RuleFor(x => x.CoverImagePath).MaximumLength(500);
        EventSchedule.Rules(this, x => x.StartDate, x => x.EndDate, x => x.TimeLabel, x => x.Location);
        EventTagValidation.Rules(this, x => x.TagType, x => x.TagUnitTypeId, x => x.TagUnitId);
    }
}

public class CreateEventCommandHandler(IApplicationDbContext context, IAuditService audit) : IRequestHandler<CreateEventCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateEventCommand request, CancellationToken ct)
    {
        var baseSlug = ContentText.Slugify(request.Title);
        var slug = baseSlug;
        for (var i = 2; await context.Events.AnyAsync(e => e.Slug == slug, ct); i++) slug = $"{baseSlug}-{i}";

        var entity = new Event
        {
            Title = request.Title.Trim(),
            Slug = slug,
            Summary = ContentText.Excerpt(request.BodyHtml),
            BodyHtml = request.BodyHtml,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            TimeLabel = string.IsNullOrWhiteSpace(request.TimeLabel) ? null : request.TimeLabel.Trim(),
            Location = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim(),
            IsPublished = request.IsPublished,
            PublishedAt = request.IsPublished ? DateTime.UtcNow : null,
            TagType = request.TagType,
            TagUnitTypeId = request.TagType == EventTagTypes.UnitType ? request.TagUnitTypeId : null,
            TagUnitId = request.TagType == EventTagTypes.Unit ? request.TagUnitId : null,
            CoverImagePath = string.IsNullOrWhiteSpace(request.CoverImagePath) ? null : request.CoverImagePath.Trim(),
        };
        context.Events.Add(entity);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Create", "Event", entity.Id, newValues: new { entity.Title, entity.Slug, entity.StartDate, entity.IsPublished }, cancellationToken: ct);
        return Result<Guid>.Success(entity.Id);
    }
}

// ===== Update =====
public record UpdateEventCommand(Guid Id, string Title, string BodyHtml, DateOnly StartDate, DateOnly? EndDate, string? TimeLabel, string? Location, bool IsPublished, string TagType, Guid? TagUnitTypeId, Guid? TagUnitId, string? CoverImagePath = null)
    : IRequest<Result<bool>>;

public class UpdateEventCommandValidator : AbstractValidator<UpdateEventCommand>
{
    public UpdateEventCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Title).NotEmpty().WithMessage("Le titre est requis.").MaximumLength(200).NoHtml();
        RuleFor(x => x.BodyHtml).NotEmpty().WithMessage("Le contenu est requis.").MaximumLength(100000);
        RuleFor(x => x.CoverImagePath).MaximumLength(500);
        EventSchedule.Rules(this, x => x.StartDate, x => x.EndDate, x => x.TimeLabel, x => x.Location);
        EventTagValidation.Rules(this, x => x.TagType, x => x.TagUnitTypeId, x => x.TagUnitId);
    }
}

public class UpdateEventCommandHandler(IApplicationDbContext context, IAuditService audit) : IRequestHandler<UpdateEventCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateEventCommand request, CancellationToken ct)
    {
        var entity = await context.Events.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Événement introuvable.");

        if (request.IsPublished && entity.PublishedAt is null) entity.PublishedAt = DateTime.UtcNow;

        entity.Title = request.Title.Trim();
        entity.Summary = ContentText.Excerpt(request.BodyHtml);
        entity.BodyHtml = request.BodyHtml;
        entity.StartDate = request.StartDate;
        entity.EndDate = request.EndDate;
        entity.TimeLabel = string.IsNullOrWhiteSpace(request.TimeLabel) ? null : request.TimeLabel.Trim();
        entity.Location = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim();
        entity.IsPublished = request.IsPublished;
        entity.TagType = request.TagType;
        entity.TagUnitTypeId = request.TagType == EventTagTypes.UnitType ? request.TagUnitTypeId : null;
        entity.TagUnitId = request.TagType == EventTagTypes.Unit ? request.TagUnitId : null;
        entity.CoverImagePath = string.IsNullOrWhiteSpace(request.CoverImagePath) ? null : request.CoverImagePath.Trim();
        // Slug is kept stable across edits to preserve existing links.

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Update", "Event", entity.Id, newValues: new { entity.Title, entity.Slug, entity.StartDate, entity.IsPublished }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ===== Delete =====
public record DeleteEventCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteEventCommandHandler(IApplicationDbContext context, IAuditService audit) : IRequestHandler<DeleteEventCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteEventCommand request, CancellationToken ct)
    {
        var entity = await context.Events.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Événement introuvable.");
        context.Events.Remove(entity);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Delete", "Event", entity.Id, oldValues: new { entity.Title }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ===== Admin queries =====
public record GetEventsAdminQuery() : IRequest<IReadOnlyList<EventAdminDto>>;

public class GetEventsAdminQueryHandler(IApplicationDbContext context) : IRequestHandler<GetEventsAdminQuery, IReadOnlyList<EventAdminDto>>
{
    public async ValueTask<IReadOnlyList<EventAdminDto>> Handle(GetEventsAdminQuery request, CancellationToken ct)
        => await context.Events
            .OrderByDescending(e => e.StartDate)
            .Select(e => new EventAdminDto(e.Id, e.Title, e.Slug, e.StartDate, e.EndDate, e.IsPublished,
                e.TagType == EventTagTypes.Unit
                    ? (context.Units.Where(u => u.Id == e.TagUnitId).Select(u => u.Name).FirstOrDefault() ?? "Unité")
                    : e.TagType == EventTagTypes.UnitType
                    ? (context.UnitTypes.Where(t => t.Id == e.TagUnitTypeId).Select(t => t.Name).FirstOrDefault() ?? "Branche")
                    : EventTagLabel.Group))
            .ToListAsync(ct);
}

public record GetEventByIdQuery(Guid Id) : IRequest<EventEditDto?>;

public class GetEventByIdQueryHandler(IApplicationDbContext context) : IRequestHandler<GetEventByIdQuery, EventEditDto?>
{
    public async ValueTask<EventEditDto?> Handle(GetEventByIdQuery request, CancellationToken ct)
        => await context.Events.Where(e => e.Id == request.Id)
            .Select(e => new EventEditDto(e.Id, e.Title, e.BodyHtml, e.StartDate, e.EndDate, e.TimeLabel, e.Location, e.IsPublished, e.TagType, e.TagUnitTypeId, e.TagUnitId, e.CoverImagePath))
            .FirstOrDefaultAsync(ct);
}

// ===== Public queries =====
// Upcoming = events whose last day is today or later, soonest first. GroupOnly / UnitTypeId filter by branch
// (a Unit-tagged event rolls up to its unit's branch) — same model as the news tag filter.
public record GetPublicEventsQuery(int Page = 1, int PageSize = 24, bool GroupOnly = false, Guid? UnitTypeId = null)
    : IRequest<PaginatedList<PublicEventListItemDto>>;

public class GetPublicEventsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPublicEventsQuery, PaginatedList<PublicEventListItemDto>>
{
    public async ValueTask<PaginatedList<PublicEventListItemDto>> Handle(GetPublicEventsQuery request, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var filtered = context.Events.Where(e => e.IsPublished && (e.EndDate ?? e.StartDate) >= today);
        if (request.GroupOnly)
            filtered = filtered.Where(e => e.TagType == EventTagTypes.Group);
        else if (request.UnitTypeId is Guid utid)
            filtered = filtered.Where(e =>
                (e.TagType == EventTagTypes.UnitType && e.TagUnitTypeId == utid)
                || (e.TagType == EventTagTypes.Unit && context.Units.Where(u => u.Id == e.TagUnitId).Select(u => u.UnitTypeId).FirstOrDefault() == utid));

        var query = filtered
            .OrderBy(e => e.StartDate).ThenBy(e => e.Title)
            .Select(e => new PublicEventListItemDto(e.Slug, e.Title, e.Summary, e.StartDate, e.EndDate, e.TimeLabel, e.Location,
                e.TagType == EventTagTypes.Unit
                    ? (context.Units.Where(u => u.Id == e.TagUnitId).Select(u => u.Name).FirstOrDefault() ?? "Unité")
                    : e.TagType == EventTagTypes.UnitType
                    ? (context.UnitTypes.Where(t => t.Id == e.TagUnitTypeId).Select(t => t.Name).FirstOrDefault() ?? "Branche")
                    : EventTagLabel.Group,
                e.CoverImagePath));
        return await PaginatedList<PublicEventListItemDto>.CreateAsync(query, request.Page, Math.Clamp(request.PageSize, 1, 50), ct);
    }
}

public record GetPublicEventBySlugQuery(string Slug) : IRequest<PublicEventDetailDto?>;

public class GetPublicEventBySlugQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPublicEventBySlugQuery, PublicEventDetailDto?>
{
    public async ValueTask<PublicEventDetailDto?> Handle(GetPublicEventBySlugQuery request, CancellationToken ct)
    {
        var slug = request.Slug.Trim().ToLowerInvariant();
        return await context.Events.Where(e => e.Slug == slug && e.IsPublished)
            .Select(e => new PublicEventDetailDto(e.Slug, e.Title, e.BodyHtml, e.StartDate, e.EndDate, e.TimeLabel, e.Location,
                e.TagType == EventTagTypes.Unit
                    ? (context.Units.Where(u => u.Id == e.TagUnitId).Select(u => u.Name).FirstOrDefault() ?? "Unité")
                    : e.TagType == EventTagTypes.UnitType
                    ? (context.UnitTypes.Where(t => t.Id == e.TagUnitTypeId).Select(t => t.Name).FirstOrDefault() ?? "Branche")
                    : EventTagLabel.Group,
                e.CoverImagePath))
            .FirstOrDefaultAsync(ct);
    }
}
