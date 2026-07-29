using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.CustomFields;

// Admin-defined extra member fields (text/number/select/boolean). FieldType drives input + validation;
// Options holds the JSON array of choices for "select"; ShowOnCard surfaces the value on the member card.

// DTOs
public record CustomFieldDto(Guid Id, string Name, string Code, string FieldType, string? Options, int DisplayOrder, bool IsActive, bool ShowOnCard, int ValueCount);
public record CustomFieldListDto(Guid Id, string Name, string Code, string FieldType, string? Options, bool ShowOnCard);
public record MemberCustomFieldValueDto(Guid Id, Guid CustomFieldId, string FieldName, string FieldCode, string FieldType, string? FieldOptions, string Value);

// === Queries ===

// GetCustomFields (admin list)
public record GetCustomFieldsQuery() : IRequest<List<CustomFieldDto>>;

public class GetCustomFieldsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetCustomFieldsQuery, List<CustomFieldDto>>
{
    public async ValueTask<List<CustomFieldDto>> Handle(GetCustomFieldsQuery request, CancellationToken ct)
    {
        return await context.CustomFields
            .OrderBy(cf => cf.DisplayOrder).ThenBy(cf => cf.Name)
            .Select(cf => new CustomFieldDto(
                cf.Id, cf.Name, cf.Code, cf.FieldType, cf.Options, cf.DisplayOrder, cf.IsActive, cf.ShowOnCard,
                cf.Values.Count(v => !v.IsDeleted)
            ))
            .ToListAsync(ct);
    }
}

// GetActiveCustomFields (for forms/dropdowns)
public record GetActiveCustomFieldsQuery() : IRequest<List<CustomFieldListDto>>;

public class GetActiveCustomFieldsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetActiveCustomFieldsQuery, List<CustomFieldListDto>>
{
    public async ValueTask<List<CustomFieldListDto>> Handle(GetActiveCustomFieldsQuery request, CancellationToken ct)
    {
        return await context.CustomFields
            .Where(cf => cf.IsActive)
            .OrderBy(cf => cf.DisplayOrder).ThenBy(cf => cf.Name)
            .Select(cf => new CustomFieldListDto(cf.Id, cf.Name, cf.Code, cf.FieldType, cf.Options, cf.ShowOnCard))
            .ToListAsync(ct);
    }
}

// GetMemberCustomFieldValues
public record GetMemberCustomFieldValuesQuery(Guid MemberId) : IRequest<List<MemberCustomFieldValueDto>>;

public class GetMemberCustomFieldValuesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetMemberCustomFieldValuesQuery, List<MemberCustomFieldValueDto>>
{
    public async ValueTask<List<MemberCustomFieldValueDto>> Handle(GetMemberCustomFieldValuesQuery request, CancellationToken ct)
    {
        // Access check: own member, or a leader (members.edit) of the member's unit. A read-only youth
        // holds members.view + their own unit in AuthorizedUnitIds, so without this any authenticated user
        // could read another member's custom-field values. Unauthorized → empty list.
        if (!await MemberAccess.CanAccessMemberAsync(context, currentUser, request.MemberId, ct))
            return [];

        return await context.MemberCustomFieldValues
            .Where(v => v.MemberId == request.MemberId && v.CustomField.IsActive)
            .OrderBy(v => v.CustomField.DisplayOrder)
            .Select(v => new MemberCustomFieldValueDto(
                v.Id, v.CustomFieldId, v.CustomField.Name, v.CustomField.Code,
                v.CustomField.FieldType, v.CustomField.Options, v.Value
            ))
            .ToListAsync(ct);
    }
}

// === Commands ===

// CreateCustomField
public record CreateCustomFieldCommand(string Name, string Code, string FieldType, string? Options, int DisplayOrder, bool IsActive, bool ShowOnCard) : IRequest<Result<Guid>>;

public class CreateCustomFieldCommandValidator : AbstractValidator<CreateCustomFieldCommand>
{
    public CreateCustomFieldCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Options).MaximumLength(4000);
        RuleFor(x => x.DisplayOrder).InclusiveBetween(0, 9999);
        RuleFor(x => x.FieldType).NotEmpty().WithMessage("Le type de champ est requis.")
            .Must(t => t is "text" or "number" or "select" or "boolean")
            .WithMessage("Type de champ invalide (text, number, select, boolean).");
    }
}

public class CreateCustomFieldCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<CreateCustomFieldCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateCustomFieldCommand request, CancellationToken ct)
    {
        var codeExists = await context.CustomFields.AnyAsync(cf => cf.Code == request.Code, ct);
        if (codeExists)
            return Result<Guid>.Failure("Un champ personnalisé avec ce code existe déjà.");

        var entity = new CustomField
        {
            Name = request.Name,
            Code = request.Code,
            FieldType = request.FieldType,
            Options = request.Options,
            DisplayOrder = request.DisplayOrder,
            IsActive = request.IsActive,
            ShowOnCard = request.ShowOnCard
        };

        context.CustomFields.Add(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "CustomField", entity.Id, newValues: new { entity.Name, entity.Code, entity.FieldType }, cancellationToken: ct);

        return Result<Guid>.Success(entity.Id);
    }
}

// UpdateCustomField
public record UpdateCustomFieldCommand(Guid Id, string Name, string Code, string FieldType, string? Options, int DisplayOrder, bool IsActive, bool ShowOnCard) : IRequest<Result<bool>>;

public class UpdateCustomFieldCommandValidator : AbstractValidator<UpdateCustomFieldCommand>
{
    public UpdateCustomFieldCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Options).MaximumLength(4000);
        RuleFor(x => x.DisplayOrder).InclusiveBetween(0, 9999);
        RuleFor(x => x.FieldType).NotEmpty().WithMessage("Le type de champ est requis.")
            .Must(t => t is "text" or "number" or "select" or "boolean")
            .WithMessage("Type de champ invalide (text, number, select, boolean).");
    }
}

public class UpdateCustomFieldCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<UpdateCustomFieldCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateCustomFieldCommand request, CancellationToken ct)
    {
        var entity = await context.CustomFields.FindAsync([request.Id], ct);
        if (entity is null)
            return Result<bool>.Failure("Champ personnalisé introuvable.");

        var codeExists = await context.CustomFields.AnyAsync(cf => cf.Code == request.Code && cf.Id != request.Id, ct);
        if (codeExists)
            return Result<bool>.Failure("Un champ personnalisé avec ce code existe déjà.");

        var oldValues = new { entity.Name, entity.Code, entity.FieldType, entity.Options, entity.DisplayOrder, entity.IsActive, entity.ShowOnCard };

        entity.Name = request.Name;
        entity.Code = request.Code;
        entity.FieldType = request.FieldType;
        entity.Options = request.Options;
        entity.DisplayOrder = request.DisplayOrder;
        entity.IsActive = request.IsActive;
        entity.ShowOnCard = request.ShowOnCard;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "CustomField", entity.Id, oldValues: oldValues, newValues: new { entity.Name, entity.Code, entity.IsActive }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}

// DeleteCustomField
public record DeleteCustomFieldCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteCustomFieldCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<DeleteCustomFieldCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteCustomFieldCommand request, CancellationToken ct)
    {
        var entity = await context.CustomFields
            .Include(cf => cf.Values)
            .FirstOrDefaultAsync(cf => cf.Id == request.Id, ct);

        if (entity is null)
            return Result<bool>.Failure("Champ personnalisé introuvable.");

        // Blocked once any member has a value — deactivate (IsActive=false) to retire it without data loss.
        if (entity.Values.Any())
            return Result<bool>.Failure("Impossible de supprimer un champ ayant des valeurs existantes. Désactivez-le plutôt.");

        context.CustomFields.Remove(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "CustomField", entity.Id, oldValues: new { entity.Name, entity.Code }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}

// Upserts one member's value for a custom field (the Value string is validated against the field's
// declared FieldType below). Unit-scoped to the member.
public record SetMemberCustomFieldValueCommand(Guid MemberId, Guid CustomFieldId, string Value) : IRequest<Result<Guid>>;

public class SetMemberCustomFieldValueCommandValidator : AbstractValidator<SetMemberCustomFieldValueCommand>
{
    public SetMemberCustomFieldValueCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty().WithMessage("Le membre est requis.");
        RuleFor(x => x.CustomFieldId).NotEmpty().WithMessage("Le champ est requis.");
        RuleFor(x => x.Value).NotEmpty().WithMessage("La valeur est requise.").MaximumLength(500);
    }
}

public class SetMemberCustomFieldValueCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<SetMemberCustomFieldValueCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(SetMemberCustomFieldValueCommand request, CancellationToken ct)
    {
        // Unit-scoped access check
        if (!currentUser.IsSuperAdmin)
        {
            var canAccess = await context.MemberAssignments.AnyAsync(a =>
                a.MemberId == request.MemberId && a.EndDate == null && currentUser.AuthorizedUnitIds.Contains(a.UnitId), ct);
            if (!canAccess)
                return Result<Guid>.Failure("Accès non autorisé.");
        }

        var memberExists = await context.Members.AnyAsync(m => m.Id == request.MemberId, ct);
        if (!memberExists) return Result<Guid>.Failure("Membre introuvable.");

        var field = await context.CustomFields.FirstOrDefaultAsync(cf => cf.Id == request.CustomFieldId, ct);
        if (field is null) return Result<Guid>.Failure("Champ personnalisé introuvable.");

        // Validate the value against the field's declared type.
        switch (field.FieldType)
        {
            case "number":
                if (!decimal.TryParse(request.Value, System.Globalization.CultureInfo.InvariantCulture, out _))
                    return Result<Guid>.Failure("Ce champ attend une valeur numérique.");
                break;
            case "boolean":
                if (request.Value is not ("true" or "false"))
                    return Result<Guid>.Failure("Ce champ attend « true » ou « false ».");
                break;
            case "select":
                var allowed = new List<string>();
                if (!string.IsNullOrWhiteSpace(field.Options))
                {
                    try { allowed = System.Text.Json.JsonSerializer.Deserialize<List<string>>(field.Options) ?? []; } catch { /* ignore malformed options */ }
                }
                if (allowed.Count > 0 && !allowed.Contains(request.Value))
                    return Result<Guid>.Failure("Valeur non autorisée pour ce champ.");
                break;
        }

        // Upsert: find existing value for this member + field
        var existing = await context.MemberCustomFieldValues
            .FirstOrDefaultAsync(v => v.MemberId == request.MemberId && v.CustomFieldId == request.CustomFieldId, ct);

        if (existing is not null)
        {
            existing.Value = request.Value;
            await context.SaveChangesAsync(ct);
            return Result<Guid>.Success(existing.Id);
        }

        var entity = new MemberCustomFieldValue
        {
            MemberId = request.MemberId,
            CustomFieldId = request.CustomFieldId,
            Value = request.Value
        };

        context.MemberCustomFieldValues.Add(entity);
        await context.SaveChangesAsync(ct);

        return Result<Guid>.Success(entity.Id);
    }
}

// DeleteMemberCustomFieldValue
public record DeleteMemberCustomFieldValueCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteMemberCustomFieldValueCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<DeleteMemberCustomFieldValueCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteMemberCustomFieldValueCommand request, CancellationToken ct)
    {
        var entity = await context.MemberCustomFieldValues
            .Include(v => v.Member)
            .FirstOrDefaultAsync(v => v.Id == request.Id, ct);

        if (entity is null)
            return Result<bool>.Failure("Valeur introuvable.");

        // Unit-scoped access check
        if (!currentUser.IsSuperAdmin)
        {
            var canAccess = await context.MemberAssignments.AnyAsync(a =>
                a.MemberId == entity.MemberId && a.EndDate == null && currentUser.AuthorizedUnitIds.Contains(a.UnitId), ct);
            if (!canAccess)
                return Result<bool>.Failure("Accès non autorisé.");
        }

        context.MemberCustomFieldValues.Remove(entity);
        await context.SaveChangesAsync(ct);

        return Result<bool>.Success(true);
    }
}
