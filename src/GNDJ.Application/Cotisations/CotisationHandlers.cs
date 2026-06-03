using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Cotisations;

// DTOs
public record MemberCotisationDto(
    Guid Id, Guid MemberId, string SchoolYear, decimal AmountPaid, string Currency,
    DateOnly PaymentDate, string PaymentMethod, string ReceiptNumber, string? Notes, DateTime CreatedAt
);

// Helper
static class CotisationAccessHelper
{
    public static async Task<bool> CanAccessMember(IApplicationDbContext context, ICurrentUserService currentUser, Guid memberId, CancellationToken ct)
    {
        if (currentUser.IsSuperAdmin) return true;
        if (currentUser.MemberId == memberId) return true;
        var authorizedUnitIds = currentUser.AuthorizedUnitIds;
        return await context.MemberAssignments.AnyAsync(a =>
            a.MemberId == memberId && !a.IsDeleted && authorizedUnitIds.Contains(a.UnitId), ct);
    }
}

// Get cotisations for a member
public record GetMemberCotisationsQuery(Guid MemberId) : IRequest<Result<IReadOnlyList<MemberCotisationDto>>>;

public class GetMemberCotisationsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetMemberCotisationsQuery, Result<IReadOnlyList<MemberCotisationDto>>>
{
    public async ValueTask<Result<IReadOnlyList<MemberCotisationDto>>> Handle(GetMemberCotisationsQuery request, CancellationToken ct)
    {
        if (!await CotisationAccessHelper.CanAccessMember(context, currentUser, request.MemberId, ct))
            return Result<IReadOnlyList<MemberCotisationDto>>.Failure("Accès non autorisé à ce membre.");

        var items = await context.MemberCotisations
            .Where(c => c.MemberId == request.MemberId)
            .OrderByDescending(c => c.SchoolYear)
            .Select(c => new MemberCotisationDto(
                c.Id, c.MemberId, c.SchoolYear, c.AmountPaid, c.Currency,
                c.PaymentDate, c.PaymentMethod, c.ReceiptNumber, c.Notes, c.CreatedAt
            ))
            .ToListAsync(ct);

        return Result<IReadOnlyList<MemberCotisationDto>>.Success(items);
    }
}

// Create cotisation
public record CreateCotisationCommand(
    Guid MemberId, string SchoolYear, decimal AmountPaid, string Currency,
    DateOnly PaymentDate, string PaymentMethod, string? Notes
) : IRequest<Result<CotisationCreatedDto>>;

public record CotisationCreatedDto(Guid Id, string ReceiptNumber);

public class CreateCotisationCommandValidator : AbstractValidator<CreateCotisationCommand>
{
    public CreateCotisationCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty().WithMessage("Le membre est requis.");
        RuleFor(x => x.SchoolYear).NotEmpty().WithMessage("L'année scoute est requise.").MaximumLength(20);
        RuleFor(x => x.AmountPaid).GreaterThan(0).WithMessage("Le montant doit être supérieur à 0.");
        RuleFor(x => x.Currency).NotEmpty().WithMessage("La devise est requise.")
            .Must(c => Domain.Enums.Currency.All.Contains(c)).WithMessage("Devise invalide.");
        RuleFor(x => x.PaymentMethod).NotEmpty().WithMessage("Le mode de paiement est requis.");
    }
}

public class CreateCotisationCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<CreateCotisationCommand, Result<CotisationCreatedDto>>
{
    public async ValueTask<Result<CotisationCreatedDto>> Handle(CreateCotisationCommand request, CancellationToken ct)
    {
        if (!await CotisationAccessHelper.CanAccessMember(context, currentUser, request.MemberId, ct))
            return Result<CotisationCreatedDto>.Failure("Accès non autorisé à ce membre.");

        // Check duplicate for same member + school year
        var exists = await context.MemberCotisations.AnyAsync(c =>
            c.MemberId == request.MemberId && c.SchoolYear == request.SchoolYear, ct);
        if (exists)
            return Result<CotisationCreatedDto>.Failure("Une cotisation existe déjà pour ce membre et cette année scoute.");

        // Generate receipt number: GNDJ-YYYY-NNNN
        var year = request.SchoolYear.Split('-')[0];
        var lastReceipt = await context.MemberCotisations
            .IgnoreQueryFilters()
            .Where(c => c.ReceiptNumber.StartsWith($"GNDJ-{year}-"))
            .OrderByDescending(c => c.ReceiptNumber)
            .Select(c => c.ReceiptNumber)
            .FirstOrDefaultAsync(ct);

        int nextNumber = 1;
        if (lastReceipt is not null)
        {
            var parts = lastReceipt.Split('-');
            if (parts.Length == 3 && int.TryParse(parts[2], out var last))
                nextNumber = last + 1;
        }
        var receiptNumber = $"GNDJ-{year}-{nextNumber:D4}";

        var entity = new MemberCotisation
        {
            MemberId = request.MemberId,
            SchoolYear = request.SchoolYear,
            AmountPaid = request.AmountPaid,
            Currency = request.Currency,
            PaymentDate = request.PaymentDate,
            PaymentMethod = request.PaymentMethod,
            ReceiptNumber = receiptNumber,
            Notes = request.Notes
        };

        context.MemberCotisations.Add(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "MemberCotisation", entity.Id,
            newValues: new { entity.ReceiptNumber, entity.AmountPaid, entity.Currency, entity.SchoolYear },
            cancellationToken: ct);

        return Result<CotisationCreatedDto>.Success(new CotisationCreatedDto(entity.Id, receiptNumber));
    }
}

// Update cotisation
public record UpdateCotisationCommand(
    Guid Id, decimal AmountPaid, string Currency,
    DateOnly PaymentDate, string PaymentMethod, string? Notes
) : IRequest<Result<bool>>;

public class UpdateCotisationCommandValidator : AbstractValidator<UpdateCotisationCommand>
{
    public UpdateCotisationCommandValidator()
    {
        RuleFor(x => x.AmountPaid).GreaterThan(0).WithMessage("Le montant doit être supérieur à 0.");
        RuleFor(x => x.Currency).NotEmpty().Must(c => Domain.Enums.Currency.All.Contains(c)).WithMessage("Devise invalide.");
        RuleFor(x => x.PaymentMethod).NotEmpty().WithMessage("Le mode de paiement est requis.");
    }
}

public class UpdateCotisationCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<UpdateCotisationCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateCotisationCommand request, CancellationToken ct)
    {
        var entity = await context.MemberCotisations.FindAsync([request.Id], ct);
        if (entity is null)
            return Result<bool>.Failure("Cotisation introuvable.");

        if (!await CotisationAccessHelper.CanAccessMember(context, currentUser, entity.MemberId, ct))
            return Result<bool>.Failure("Accès non autorisé.");

        var oldValues = new { entity.AmountPaid, entity.Currency, entity.PaymentDate, entity.PaymentMethod };

        entity.AmountPaid = request.AmountPaid;
        entity.Currency = request.Currency;
        entity.PaymentDate = request.PaymentDate;
        entity.PaymentMethod = request.PaymentMethod;
        entity.Notes = request.Notes;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "MemberCotisation", entity.Id, oldValues: oldValues,
            newValues: new { entity.AmountPaid, entity.Currency, entity.PaymentDate, entity.PaymentMethod },
            cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}

// Delete cotisation
public record DeleteCotisationCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteCotisationCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<DeleteCotisationCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteCotisationCommand request, CancellationToken ct)
    {
        var entity = await context.MemberCotisations.FindAsync([request.Id], ct);
        if (entity is null)
            return Result<bool>.Failure("Cotisation introuvable.");

        if (!await CotisationAccessHelper.CanAccessMember(context, currentUser, entity.MemberId, ct))
            return Result<bool>.Failure("Accès non autorisé.");

        context.MemberCotisations.Remove(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "MemberCotisation", entity.Id,
            oldValues: new { entity.ReceiptNumber, entity.AmountPaid, entity.Currency },
            cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}

// Get receipt data (for PDF generation)
public record GetReceiptDataQuery(Guid Id) : IRequest<Result<ReceiptData>>;

public class GetReceiptDataQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetReceiptDataQuery, Result<ReceiptData>>
{
    public async ValueTask<Result<ReceiptData>> Handle(GetReceiptDataQuery request, CancellationToken ct)
    {
        var cotisation = await context.MemberCotisations
            .Include(c => c.Member)
            .FirstOrDefaultAsync(c => c.Id == request.Id, ct);

        if (cotisation is null)
            return Result<ReceiptData>.Failure("Cotisation introuvable.");

        if (!await CotisationAccessHelper.CanAccessMember(context, currentUser, cotisation.MemberId, ct))
            return Result<ReceiptData>.Failure("Accès non autorisé.");

        // Get organization name from settings
        var orgName = await context.Settings
            .Where(s => s.Key == "organization_name")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct) ?? "GNDJ - Guides Nationales Du Jeune";

        return Result<ReceiptData>.Success(new ReceiptData(
            cotisation.ReceiptNumber,
            $"{cotisation.Member.FirstName} {cotisation.Member.LastName}",
            cotisation.SchoolYear,
            cotisation.AmountPaid,
            cotisation.Currency,
            cotisation.PaymentDate,
            cotisation.PaymentMethod,
            cotisation.Notes,
            orgName
        ));
    }
}

// Dashboard: unpaid cotisations for current year
public record GetUnpaidCotisationsQuery(string SchoolYear) : IRequest<IReadOnlyList<UnpaidCotisationDto>>;
public record UnpaidCotisationDto(Guid MemberId, string MemberName, string UnitName);

public class GetUnpaidCotisationsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetUnpaidCotisationsQuery, IReadOnlyList<UnpaidCotisationDto>>
{
    public async ValueTask<IReadOnlyList<UnpaidCotisationDto>> Handle(GetUnpaidCotisationsQuery request, CancellationToken ct)
    {
        // Get active members with assignments
        var query = context.MemberAssignments
            .Where(a => a.EndDate == null)
            .Include(a => a.Member)
            .Include(a => a.Unit)
            .AsQueryable();

        if (!currentUser.IsSuperAdmin)
        {
            var authorizedUnitIds = currentUser.AuthorizedUnitIds;
            query = query.Where(a => authorizedUnitIds.Contains(a.UnitId));
        }

        // Get members who DON'T have a cotisation for this school year
        var paidMemberIds = await context.MemberCotisations
            .Where(c => c.SchoolYear == request.SchoolYear)
            .Select(c => c.MemberId)
            .ToListAsync(ct);

        return await query
            .Where(a => !paidMemberIds.Contains(a.MemberId))
            .Select(a => new UnpaidCotisationDto(a.MemberId, a.Member.FirstName + " " + a.Member.LastName, a.Unit.Name))
            .Distinct()
            .OrderBy(u => u.MemberName)
            .ToListAsync(ct);
    }
}
