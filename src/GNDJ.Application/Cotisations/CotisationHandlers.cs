using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Cotisations;

// DTOs
public record CotisationPaymentDto(Guid Id, decimal Amount, string Currency, string PaymentMethod);

public record MemberCotisationDto(
    Guid Id, Guid MemberId, string ScoutYear,
    DateOnly PaymentDate, string ReceiptNumber, string? Notes,
    List<CotisationPaymentDto> Payments, DateTime CreatedAt
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
            a.MemberId == memberId && !a.IsDeleted && a.EndDate == null && authorizedUnitIds.Contains(a.UnitId), ct);
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
            .Include(c => c.Payments.Where(p => !p.IsDeleted))
            .OrderByDescending(c => c.ScoutYear)
            .Select(c => new MemberCotisationDto(
                c.Id, c.MemberId, c.ScoutYear,
                c.PaymentDate, c.ReceiptNumber, c.Notes,
                c.Payments.Where(p => !p.IsDeleted).Select(p => new CotisationPaymentDto(p.Id, p.Amount, p.Currency, p.PaymentMethod)).ToList(),
                c.CreatedAt
            ))
            .ToListAsync(ct);

        return Result<IReadOnlyList<MemberCotisationDto>>.Success(items);
    }
}

// Create cotisation with payment lines
public record PaymentLineInput(decimal Amount, string Currency, string PaymentMethod);

public record CreateCotisationCommand(
    Guid MemberId, string ScoutYear,
    DateOnly PaymentDate, string? Notes,
    List<PaymentLineInput> Payments
) : IRequest<Result<CotisationCreatedDto>>;

public record CotisationCreatedDto(Guid Id, string ReceiptNumber);

public class CreateCotisationCommandValidator : AbstractValidator<CreateCotisationCommand>
{
    public CreateCotisationCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty().WithMessage("Le membre est requis.");
        RuleFor(x => x.ScoutYear).NotEmpty().WithMessage("L'année scoute est requise.").MaximumLength(20);
        RuleFor(x => x.Payments).NotEmpty().WithMessage("Au moins un paiement est requis.");
        RuleForEach(x => x.Payments).ChildRules(p =>
        {
            p.RuleFor(x => x.Amount).GreaterThan(0).WithMessage("Le montant doit être supérieur à 0.");
            p.RuleFor(x => x.Currency).NotEmpty().WithMessage("La devise est requise.")
                .Must(c => Domain.Enums.Currency.All.Contains(c)).WithMessage("Devise invalide.");
            p.RuleFor(x => x.PaymentMethod).NotEmpty().WithMessage("Le mode de paiement est requis.");
        });
    }
}

public class CreateCotisationCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<CreateCotisationCommand, Result<CotisationCreatedDto>>
{
    public async ValueTask<Result<CotisationCreatedDto>> Handle(CreateCotisationCommand request, CancellationToken ct)
    {
        var memberExists = await context.Members.AnyAsync(m => m.Id == request.MemberId, ct);
        if (!memberExists)
            return Result<CotisationCreatedDto>.Failure("Membre introuvable.");

        if (!await CotisationAccessHelper.CanAccessMember(context, currentUser, request.MemberId, ct))
            return Result<CotisationCreatedDto>.Failure("Accès non autorisé à ce membre.");

        // Check duplicate for same member + scout year
        var exists = await context.MemberCotisations.AnyAsync(c =>
            c.MemberId == request.MemberId && c.ScoutYear == request.ScoutYear, ct);
        if (exists)
            return Result<CotisationCreatedDto>.Failure("Une cotisation existe déjà pour ce membre et cette année scoute. Modifiez-la pour ajouter des paiements.");

        // Generate receipt number: GNDJ-YYYY-NNNN
        var year = request.ScoutYear.Split('-')[0];
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
            ScoutYear = request.ScoutYear,
            PaymentDate = request.PaymentDate,
            ReceiptNumber = receiptNumber,
            Notes = request.Notes
        };

        foreach (var p in request.Payments)
        {
            entity.Payments.Add(new CotisationPayment
            {
                Amount = p.Amount,
                Currency = p.Currency,
                PaymentMethod = p.PaymentMethod
            });
        }

        context.MemberCotisations.Add(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "MemberCotisation", entity.Id,
            newValues: new { entity.ReceiptNumber, Payments = request.Payments, entity.ScoutYear },
            cancellationToken: ct);

        return Result<CotisationCreatedDto>.Success(new CotisationCreatedDto(entity.Id, receiptNumber));
    }
}

// Update cotisation
public record UpdateCotisationCommand(
    Guid Id, DateOnly PaymentDate, string? Notes,
    List<PaymentLineInput> Payments
) : IRequest<Result<bool>>;

public class UpdateCotisationCommandValidator : AbstractValidator<UpdateCotisationCommand>
{
    public UpdateCotisationCommandValidator()
    {
        RuleFor(x => x.Payments).NotEmpty().WithMessage("Au moins un paiement est requis.");
        RuleForEach(x => x.Payments).ChildRules(p =>
        {
            p.RuleFor(x => x.Amount).GreaterThan(0).WithMessage("Le montant doit être supérieur à 0.");
            p.RuleFor(x => x.Currency).NotEmpty().Must(c => Domain.Enums.Currency.All.Contains(c)).WithMessage("Devise invalide.");
            p.RuleFor(x => x.PaymentMethod).NotEmpty().WithMessage("Le mode de paiement est requis.");
        });
    }
}

public class UpdateCotisationCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<UpdateCotisationCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateCotisationCommand request, CancellationToken ct)
    {
        var entity = await context.MemberCotisations
            .Include(c => c.Payments.Where(p => !p.IsDeleted))
            .FirstOrDefaultAsync(c => c.Id == request.Id, ct);
        if (entity is null)
            return Result<bool>.Failure("Cotisation introuvable.");

        if (!await CotisationAccessHelper.CanAccessMember(context, currentUser, entity.MemberId, ct))
            return Result<bool>.Failure("Accès non autorisé.");

        entity.PaymentDate = request.PaymentDate;
        entity.Notes = request.Notes;

        // Replace all payment lines
        foreach (var existing in entity.Payments.ToList())
        {
            context.CotisationPayments.Remove(existing);
        }
        foreach (var p in request.Payments)
        {
            entity.Payments.Add(new CotisationPayment
            {
                Amount = p.Amount,
                Currency = p.Currency,
                PaymentMethod = p.PaymentMethod
            });
        }

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "MemberCotisation", entity.Id,
            newValues: new { entity.PaymentDate, Payments = request.Payments },
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
            oldValues: new { entity.ReceiptNumber, entity.ScoutYear },
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
            .Include(c => c.Payments.Where(p => !p.IsDeleted))
            .FirstOrDefaultAsync(c => c.Id == request.Id, ct);

        if (cotisation is null)
            return Result<ReceiptData>.Failure("Cotisation introuvable.");

        if (!await CotisationAccessHelper.CanAccessMember(context, currentUser, cotisation.MemberId, ct))
            return Result<ReceiptData>.Failure("Accès non autorisé.");

        // Load currency settings
        var settings = await context.Settings
            .Where(s => s.Key == "cotisation.default_currency" || s.Key == "cotisation.exchange_rates")
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);

        var defaultCurrency = settings.GetValueOrDefault("cotisation.default_currency", "USD");
        var exchangeRates = new Dictionary<string, decimal>();
        if (settings.TryGetValue("cotisation.exchange_rates", out var ratesJson))
        {
            try
            {
                var parsed = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, decimal>>(ratesJson);
                if (parsed is not null) exchangeRates = parsed;
            }
            catch { /* ignore parse errors */ }
        }

        var payments = cotisation.Payments
            .Select(p => new ReceiptPaymentLine(p.Amount, p.Currency, p.PaymentMethod))
            .ToList();

        return Result<ReceiptData>.Success(new ReceiptData(
            cotisation.ReceiptNumber,
            $"{cotisation.Member.FirstName} {cotisation.Member.LastName}",
            cotisation.ScoutYear,
            payments,
            cotisation.PaymentDate,
            cotisation.Notes,
            defaultCurrency,
            exchangeRates
        ));
    }
}

// Cotisation summary for dashboard
public record GetCotisationSummaryQuery(string ScoutYear) : IRequest<CotisationSummaryDto>;

public record CotisationSummaryDto(
    int TotalActiveMembers,
    int MembersWithPayment,
    int MembersWithoutPayment,
    List<CurrencyTotalDto> TotalsByCurrency,
    List<UnitCotisationSummaryDto> ByUnit
);

public record CurrencyTotalDto(string Currency, decimal Total, int Count);
public record UnitCotisationSummaryDto(string UnitName, int TotalMembers, int PaidMembers, List<CurrencyTotalDto> Totals);

public class GetCotisationSummaryQueryHandler(IApplicationDbContext context) : IRequestHandler<GetCotisationSummaryQuery, CotisationSummaryDto>
{
    public async ValueTask<CotisationSummaryDto> Handle(GetCotisationSummaryQuery request, CancellationToken ct)
    {
        var activeAssignments = await context.MemberAssignments
            .Where(a => a.EndDate == null)
            .Select(a => new { a.MemberId, UnitName = a.Unit.Name })
            .Distinct()
            .ToListAsync(ct);

        var activeMemberIds = activeAssignments.Select(a => a.MemberId).Distinct().ToList();

        // Get payment lines through cotisations
        var payments = await context.MemberCotisations
            .Where(c => c.ScoutYear == request.ScoutYear && activeMemberIds.Contains(c.MemberId))
            .SelectMany(c => c.Payments.Where(p => !p.IsDeleted).Select(p => new { c.MemberId, p.Amount, p.Currency }))
            .ToListAsync(ct);

        var paidMemberIds = await context.MemberCotisations
            .Where(c => c.ScoutYear == request.ScoutYear && activeMemberIds.Contains(c.MemberId))
            .Select(c => c.MemberId)
            .Distinct()
            .ToListAsync(ct);

        var totalsByCurrency = payments
            .GroupBy(p => p.Currency)
            .Select(g => new CurrencyTotalDto(g.Key, g.Sum(p => p.Amount), g.Count()))
            .ToList();

        var paidSet = paidMemberIds.ToHashSet();

        var unitGroups = activeAssignments
            .GroupBy(a => a.UnitName)
            .Select(g =>
            {
                var unitMemberIds = g.Select(a => a.MemberId).Distinct().ToList();
                var unitPayments = payments.Where(p => unitMemberIds.Contains(p.MemberId)).ToList();
                var unitPaid = unitMemberIds.Count(id => paidSet.Contains(id));
                var unitTotals = unitPayments
                    .GroupBy(p => p.Currency)
                    .Select(cg => new CurrencyTotalDto(cg.Key, cg.Sum(p => p.Amount), cg.Count()))
                    .ToList();
                return new UnitCotisationSummaryDto(g.Key, unitMemberIds.Count, unitPaid, unitTotals);
            })
            .OrderBy(u => u.UnitName)
            .ToList();

        return new CotisationSummaryDto(
            activeMemberIds.Count,
            paidSet.Count,
            activeMemberIds.Count - paidSet.Count,
            totalsByCurrency,
            unitGroups
        );
    }
}

// Dashboard: unpaid cotisations for current year
public record GetUnpaidCotisationsQuery(string ScoutYear) : IRequest<IReadOnlyList<UnpaidCotisationDto>>;
public record UnpaidCotisationDto(Guid MemberId, string MemberName, string UnitName);

public class GetUnpaidCotisationsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetUnpaidCotisationsQuery, IReadOnlyList<UnpaidCotisationDto>>
{
    public async ValueTask<IReadOnlyList<UnpaidCotisationDto>> Handle(GetUnpaidCotisationsQuery request, CancellationToken ct)
    {
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

        var paidMemberIds = await context.MemberCotisations
            .Where(c => c.ScoutYear == request.ScoutYear)
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
