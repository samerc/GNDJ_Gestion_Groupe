using System.Globalization;
using System.Text;
using FluentValidation;
using GNDJ.Application.Applicants;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Validation;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// ============================================================
// DTOs
// ============================================================
public record SiblingDto(Guid Id, string FirstName, string LastName, string Status, bool ResponseSent);

public record DemandeReviewDto(
    Guid Id, string ScoutYear, string FirstName, string LastName, DateOnly? DateOfBirth, int? Age,
    string? Gender, string? Nationality, string? School, string? Classe, string? Section, string? BloodType,
    string? MedicalNotes, string? Allergies, string? PhoneNumber, string? Email, string? ParentNotes,
    string Status, Guid? DecidedUnitId, string? DecidedUnitName, string? DecisionNotes,
    DateTime? SubmittedAt, DateTime? ResponseSentAt, Guid? CreatedMemberId,
    Guid AccountId, string AccountEmail, string? ContactName,
    string? AddressCountry, string? AddressCity, string? AddressDetails,
    IReadOnlyList<ApplicantGuardianDto> Guardians, IReadOnlyList<ApplicantScoutRelationDto> ScoutRelations,
    IReadOnlyList<SiblingDto> Siblings);

public record UnitOccupancyDto(
    Guid UnitId, string UnitCode, string UnitName, string? AssociationName, Guid UnitTypeId,
    string? Gender, int? AgeMin, int? AgeMax, int CurrentActive, int Projected, int? Quota, int Accepted);

public record CountItem(string Label, int Count);

public record DemandeStatisticsDto(
    string ScoutYear,
    // status pipeline (over submitted+ demandes — drafts excluded except the Drafts count)
    int Total, int Pending, int Approved, int Declined, int ResponsesSent, int Decided, int Drafts,
    // demographics
    IReadOnlyList<CountItem> ByGender, IReadOnlyList<CountItem> ByAgeGroup,
    IReadOnlyList<CountItem> ByClasse, IReadOnlyList<CountItem> BySchool,
    // families & data quality
    int SiblingGroups, int SiblingDemandes, int WithScoutRelations, int IncompleteDossiers);

static class DemandeAdminHelpers
{
    public static int? AgeAt(DateOnly? dob, DateOnly on)
        => dob is null ? null : on.Year - dob.Value.Year - (on < new DateOnly(on.Year, dob.Value.Month, dob.Value.Day) ? 1 : 0);

    public static readonly string[] AgeGroupOrder =
        ["Moins de 8 ans", "8–10 ans", "11–13 ans", "14–17 ans", "18 ans et +", "Non renseignée"];

    public static string AgeGroup(int? age) => age switch
    {
        null => "Non renseignée",
        < 8 => "Moins de 8 ans",
        >= 8 and <= 10 => "8–10 ans",
        >= 11 and <= 13 => "11–13 ans",
        >= 14 and <= 17 => "14–17 ans",
        _ => "18 ans et +",
    };

    // Group string values into counts (blank → nullLabel), ordered by count desc then label.
    // Grouping is accent- AND case-insensitive ("Féminin" == "Feminin", "Collège" == "college") so
    // legacy/inconsistent spellings collapse into a single bucket. The displayed label is the richest
    // spelling seen (most frequent → with accents → longest), so the nicest form wins.
    public static List<CountItem> CountBy(IEnumerable<string?> values, string nullLabel)
        => values.Select(v => string.IsNullOrWhiteSpace(v) ? nullLabel : v.Trim())
                 .GroupBy(NormalizeKey)
                 .Select(g => new CountItem(
                     g.GroupBy(x => x)
                      .OrderByDescending(x => x.Count())
                      .ThenByDescending(x => HasDiacritics(x.Key))
                      .ThenByDescending(x => x.Key.Length)
                      .First().Key,
                     g.Count()))
                 .OrderByDescending(c => c.Count).ThenBy(c => c.Label)
                 .ToList();

    static string NormalizeKey(string s) => RemoveDiacritics(s).ToLowerInvariant().Trim();
    static bool HasDiacritics(string s) => s != RemoveDiacritics(s);
    static string RemoveDiacritics(string text)
    {
        var decomposed = text.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }
}

// ============================================================
// Review list
// ============================================================
public record GetDemandesForReviewQuery(
    string ScoutYear, string? Status, string? Gender, string? Classe, string? School,
    int? AgeMin, int? AgeMax, Guid? UnitId) : IRequest<Result<IReadOnlyList<DemandeReviewDto>>>;

public class GetDemandesForReviewQueryHandler(IApplicationDbContext context) : IRequestHandler<GetDemandesForReviewQuery, Result<IReadOnlyList<DemandeReviewDto>>>
{
    public async ValueTask<Result<IReadOnlyList<DemandeReviewDto>>> Handle(GetDemandesForReviewQuery request, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Only show submitted / decided demandes (never drafts).
        var query = context.Demandes.Where(d => d.ScoutYear == request.ScoutYear && d.Status != DemandeStatus.Draft);
        if (!string.IsNullOrEmpty(request.Status)) query = query.Where(d => d.Status == request.Status);
        if (!string.IsNullOrEmpty(request.Gender)) query = query.Where(d => d.Gender == request.Gender);
        if (!string.IsNullOrEmpty(request.School)) query = query.Where(d => d.School == request.School);
        if (!string.IsNullOrEmpty(request.Classe)) query = query.Where(d => d.Classe == request.Classe);
        if (request.UnitId.HasValue) query = query.Where(d => d.DecidedUnitId == request.UnitId.Value);

        var demandes = await query.OrderBy(d => d.LastName).ThenBy(d => d.FirstName).ToListAsync(ct);

        var accountIds = demandes.Select(d => d.ApplicantAccountId).Distinct().ToList();
        var accounts = await context.ApplicantAccounts.Where(a => accountIds.Contains(a.Id))
            .ToDictionaryAsync(a => a.Id, ct);
        var guardians = (await context.ApplicantGuardians.Where(g => accountIds.Contains(g.ApplicantAccountId)).ToListAsync(ct))
            .GroupBy(g => g.ApplicantAccountId).ToDictionary(g => g.Key, g => g.ToList());
        var relations = (await context.ApplicantScoutRelations.Where(r => accountIds.Contains(r.ApplicantAccountId)).ToListAsync(ct))
            .GroupBy(r => r.ApplicantAccountId).ToDictionary(g => g.Key, g => g.ToList());
        // All demandes per account (this year) for sibling context
        var allByAccount = (await context.Demandes.Where(d => accountIds.Contains(d.ApplicantAccountId) && d.ScoutYear == request.ScoutYear && d.Status != DemandeStatus.Draft).ToListAsync(ct))
            .GroupBy(d => d.ApplicantAccountId).ToDictionary(g => g.Key, g => g.ToList());

        var unitNames = await context.Units.ToDictionaryAsync(u => u.Id, u => u.Name, ct);

        var result = demandes.Select(d =>
        {
            var acc = accounts.GetValueOrDefault(d.ApplicantAccountId);
            var gs = guardians.GetValueOrDefault(d.ApplicantAccountId) ?? [];
            var rs = relations.GetValueOrDefault(d.ApplicantAccountId) ?? [];
            var sibs = (allByAccount.GetValueOrDefault(d.ApplicantAccountId) ?? []).Where(x => x.Id != d.Id)
                .Select(x => new SiblingDto(x.Id, x.FirstName, x.LastName, x.Status, x.ResponseSentAt != null)).ToList();
            return new DemandeReviewDto(
                d.Id, d.ScoutYear, d.FirstName, d.LastName, d.DateOfBirth, DemandeAdminHelpers.AgeAt(d.DateOfBirth, today),
                d.Gender, d.Nationality, d.School, d.Classe, d.Section, d.BloodType, d.MedicalNotes, d.Allergies,
                d.PhoneNumber, d.Email, d.ParentNotes,
                d.Status, d.DecidedUnitId, d.DecidedUnitId.HasValue ? unitNames.GetValueOrDefault(d.DecidedUnitId.Value) : null, d.DecisionNotes,
                d.SubmittedAt, d.ResponseSentAt, d.CreatedMemberId,
                d.ApplicantAccountId, acc?.Email ?? "", acc?.ContactName,
                acc?.AddressCountry, acc?.AddressCity, acc?.AddressDetails,
                gs.Select(g => new ApplicantGuardianDto(g.Id, g.Relationship, g.FirstName, g.LastName, g.Profession, g.ProfessionDomain, g.PhoneCountryCode, g.PhoneNumber, g.Email, g.IsDeceased, g.IsPrimaryContact, g.IsEmergencyContact)).ToList(),
                rs.Select(r => new ApplicantScoutRelationDto(r.Id, r.Status, r.Relationship, r.RelatedMemberId, r.FirstName, r.LastName, r.LastUnit, r.LastFunction, r.OtherGroupName)).ToList(),
                sibs);
        });

        // Age filter (computed) in-memory
        if (request.AgeMin.HasValue) result = result.Where(d => d.Age >= request.AgeMin.Value);
        if (request.AgeMax.HasValue) result = result.Where(d => d.Age <= request.AgeMax.Value);

        return Result<IReadOnlyList<DemandeReviewDto>>.Success(result.ToList());
    }
}

// Count of submitted-but-undecided demandes (for the CG sidebar badge), current scout year.
public record GetPendingDemandeCountQuery() : IRequest<Result<int>>;

public class GetPendingDemandeCountQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPendingDemandeCountQuery, Result<int>>
{
    public async ValueTask<Result<int>> Handle(GetPendingDemandeCountQuery request, CancellationToken ct)
    {
        var year = await context.Settings.Where(s => s.Key == "demande.scout_year").Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "2026-2027";
        var count = await context.Demandes.CountAsync(d => d.ScoutYear == year && d.Status == DemandeStatus.Submitted && d.ResponseSentAt == null, ct);
        return Result<int>.Success(count);
    }
}

// ============================================================
// Unit occupancy (current + projected-after-passage + quota + accepted)
// ============================================================
public record GetUnitOccupancyQuery(string ScoutYear) : IRequest<Result<IReadOnlyList<UnitOccupancyDto>>>;

public class GetUnitOccupancyQueryHandler(IApplicationDbContext context) : IRequestHandler<GetUnitOccupancyQuery, Result<IReadOnlyList<UnitOccupancyDto>>>
{
    public async ValueTask<Result<IReadOnlyList<UnitOccupancyDto>>> Handle(GetUnitOccupancyQuery request, CancellationToken ct)
    {
        var units = await context.Units.Where(u => u.IsActive)
            .Include(u => u.UnitType).Include(u => u.Association).ToListAsync(ct);

        // current active members per unit (counted in SQL)
        var activeByUnit = await context.MemberAssignments.Where(a => a.EndDate == null)
            .GroupBy(a => a.UnitId)
            .Select(g => new { UnitId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.UnitId, g => g.Count, ct);

        // passage projection: count non-finalized, non-rejected lines for the year
        var passages = await context.Passages
            .Where(p => p.ScoutYear == request.ScoutYear && p.Status != PassageStatus.Finalized && p.Status != PassageStatus.Rejected)
            .Select(p => new { p.CurrentUnitId, p.IsLeaving, Dest = p.FinalUnitId ?? p.ProposedUnitId })
            .ToListAsync(ct);
        var outgoing = new Dictionary<Guid, int>();
        var incoming = new Dictionary<Guid, int>();
        foreach (var p in passages)
        {
            if (p.IsLeaving || p.Dest != p.CurrentUnitId)
                outgoing[p.CurrentUnitId] = outgoing.GetValueOrDefault(p.CurrentUnitId) + 1;
            if (!p.IsLeaving && p.Dest != p.CurrentUnitId)
                incoming[p.Dest] = incoming.GetValueOrDefault(p.Dest) + 1;
        }

        var quotas = await context.UnitIntakeQuotas.Where(q => q.ScoutYear == request.ScoutYear)
            .ToDictionaryAsync(q => q.UnitId, q => q.Quota, ct);

        var accepted = await context.Demandes.Where(d => d.ScoutYear == request.ScoutYear && d.Status == DemandeStatus.Approved && d.DecidedUnitId != null)
            .GroupBy(d => d.DecidedUnitId!.Value)
            .Select(g => new { UnitId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.UnitId, g => g.Count, ct);

        var result = units.Select(u =>
        {
            var cur = activeByUnit.GetValueOrDefault(u.Id);
            var proj = cur - outgoing.GetValueOrDefault(u.Id) + incoming.GetValueOrDefault(u.Id);
            return new UnitOccupancyDto(u.Id, u.Code, u.Name, u.Association?.Name, u.UnitTypeId,
                u.UnitType.Gender, u.UnitType.AgeMin, u.UnitType.AgeMax,
                cur, proj, quotas.TryGetValue(u.Id, out var q) ? q : null, accepted.GetValueOrDefault(u.Id));
        }).OrderBy(u => u.UnitCode).ToList();

        return Result<IReadOnlyList<UnitOccupancyDto>>.Success(result);
    }
}

// ============================================================
// Statistics dashboard (CG) — pipeline + demographics + families/data-quality
// ============================================================
public record GetDemandeStatisticsQuery(string ScoutYear) : IRequest<Result<DemandeStatisticsDto>>;

public class GetDemandeStatisticsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetDemandeStatisticsQuery, Result<DemandeStatisticsDto>>
{
    public async ValueTask<Result<DemandeStatisticsDto>> Handle(GetDemandeStatisticsQuery request, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var drafts = await context.Demandes.CountAsync(d => d.ScoutYear == request.ScoutYear && d.Status == DemandeStatus.Draft, ct);

        // All submitted+ demandes for the year (the reviewable set).
        var demandes = await context.Demandes
            .Where(d => d.ScoutYear == request.ScoutYear && d.Status != DemandeStatus.Draft)
            .Select(d => new { d.Id, d.ApplicantAccountId, d.Gender, d.DateOfBirth, d.Classe, d.School, d.Status, d.ResponseSentAt })
            .ToListAsync(ct);

        var total = demandes.Count;
        var pending = demandes.Count(d => d.Status == DemandeStatus.Submitted && d.ResponseSentAt == null);
        var approved = demandes.Count(d => d.Status == DemandeStatus.Approved);
        var declined = demandes.Count(d => d.Status == DemandeStatus.Declined);
        var sent = demandes.Count(d => d.ResponseSentAt != null);

        // Demographics
        var byGender = DemandeAdminHelpers.CountBy(demandes.Select(d => d.Gender), "Non renseigné");
        var ageCounts = DemandeAdminHelpers.CountBy(
            demandes.Select(d => DemandeAdminHelpers.AgeGroup(DemandeAdminHelpers.AgeAt(d.DateOfBirth, today))), "Non renseignée")
            .OrderBy(c => Array.IndexOf(DemandeAdminHelpers.AgeGroupOrder, c.Label)).ToList();
        var byClasse = DemandeAdminHelpers.CountBy(demandes.Select(d => d.Classe), "Non renseignée");
        var bySchool = DemandeAdminHelpers.CountBy(demandes.Select(d => d.School), "Non renseignée");

        // Families & data quality
        var byAccount = demandes.GroupBy(d => d.ApplicantAccountId).ToList();
        var siblingGroups = byAccount.Count(g => g.Count() > 1);
        var siblingDemandes = byAccount.Where(g => g.Count() > 1).Sum(g => g.Count());

        var accountIds = byAccount.Select(g => g.Key).ToList();
        var accountsWithRelations = await context.ApplicantScoutRelations
            .Where(r => accountIds.Contains(r.ApplicantAccountId))
            .Select(r => r.ApplicantAccountId).Distinct().ToListAsync(ct);
        var relationSet = accountsWithRelations.ToHashSet();
        var withScoutRelations = demandes.Count(d => relationSet.Contains(d.ApplicantAccountId));

        // Incomplete dossier = missing DOB, OR account has no guardian, OR no guardian has a phone.
        var guardiansByAccount = (await context.ApplicantGuardians
                .Where(g => accountIds.Contains(g.ApplicantAccountId))
                .Select(g => new { g.ApplicantAccountId, g.PhoneNumber }).ToListAsync(ct))
            .GroupBy(g => g.ApplicantAccountId).ToDictionary(g => g.Key, g => g.ToList());
        var incomplete = demandes.Count(d =>
        {
            if (d.DateOfBirth is null) return true;
            var gs = guardiansByAccount.GetValueOrDefault(d.ApplicantAccountId);
            if (gs is null || gs.Count == 0) return true;
            return !gs.Any(g => !string.IsNullOrWhiteSpace(g.PhoneNumber));
        });

        return Result<DemandeStatisticsDto>.Success(new DemandeStatisticsDto(
            request.ScoutYear, total, pending, approved, declined, sent, approved + declined, drafts,
            byGender, ageCounts, byClasse, bySchool,
            siblingGroups, siblingDemandes, withScoutRelations, incomplete));
    }
}

// ============================================================
// Decide (stage approval/decline) — not yet communicated to applicant
// ============================================================
public record DecideDemandeCommand(Guid Id, string Status, Guid? DecidedUnitId, string? DecisionNotes) : IRequest<Result<bool>>;

public class DecideDemandeCommandValidator : AbstractValidator<DecideDemandeCommand>
{
    public DecideDemandeCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Status).Must(s => s is DemandeStatus.Approved or DemandeStatus.Declined or DemandeStatus.Submitted)
            .WithMessage("Statut invalide.");
        RuleFor(x => x.DecisionNotes).MaximumLength(1000).NoHtml();
    }
}

public class DecideDemandeCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit) : IRequestHandler<DecideDemandeCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DecideDemandeCommand request, CancellationToken ct)
    {
        if (request.Status != DemandeStatus.Approved && request.Status != DemandeStatus.Declined && request.Status != DemandeStatus.Submitted)
            return Result<bool>.Failure("Statut invalide.");

        var demande = await context.Demandes.FirstOrDefaultAsync(d => d.Id == request.Id, ct);
        if (demande is null) return Result<bool>.Failure("Demande introuvable.");
        if (demande.ResponseSentAt is not null) return Result<bool>.Failure("La réponse a déjà été envoyée — décision verrouillée.");

        if (request.Status == DemandeStatus.Approved)
        {
            if (request.DecidedUnitId is null) return Result<bool>.Failure("Veuillez choisir une unité pour l'acceptation.");
            var unitExists = await context.Units.AnyAsync(u => u.Id == request.DecidedUnitId.Value, ct);
            if (!unitExists) return Result<bool>.Failure("Unité introuvable.");
        }

        demande.Status = request.Status;
        demande.DecidedUnitId = request.Status == DemandeStatus.Approved ? request.DecidedUnitId : null;
        demande.DecisionNotes = request.DecisionNotes;
        demande.ReviewedByUserId = currentUser.UserId;
        demande.ReviewedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Decide", "Demande", demande.Id, newValues: new { demande.Status, demande.DecidedUnitId }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ============================================================
// Bulk decide — stage approve/decline for many demandes at once.
// Per-item unit so it serves approve-to-one-unit, approve-to-suggested, and decline.
// ============================================================
public record BulkDecideItem(Guid Id, Guid? DecidedUnitId);
public record BulkDecideDemandeResult(int Processed, int Skipped);
public record BulkDecideDemandeCommand(string Status, string? DecisionNotes, IReadOnlyList<BulkDecideItem> Items)
    : IRequest<Result<BulkDecideDemandeResult>>;

public class BulkDecideDemandeCommandValidator : AbstractValidator<BulkDecideDemandeCommand>
{
    public BulkDecideDemandeCommandValidator()
    {
        RuleFor(x => x.Status).Must(s => s is DemandeStatus.Approved or DemandeStatus.Declined or DemandeStatus.Submitted)
            .WithMessage("Statut invalide.");
        RuleFor(x => x.Items).NotEmpty().Must(i => i.Count <= 2000).WithMessage("Trop d'éléments (max 2000).");
        RuleFor(x => x.DecisionNotes).MaximumLength(1000).NoHtml();
    }
}

public class BulkDecideDemandeCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<BulkDecideDemandeCommand, Result<BulkDecideDemandeResult>>
{
    public async ValueTask<Result<BulkDecideDemandeResult>> Handle(BulkDecideDemandeCommand request, CancellationToken ct)
    {
        var approving = request.Status == DemandeStatus.Approved;
        var ids = request.Items.Select(i => i.Id).Distinct().ToList();
        var unitById = request.Items.Where(i => i.DecidedUnitId.HasValue).ToDictionary(i => i.Id, i => i.DecidedUnitId!.Value);

        // Validate referenced units exist (batch).
        var validUnitIds = approving
            ? (await context.Units.Where(u => unitById.Values.Contains(u.Id)).Select(u => u.Id).ToListAsync(ct)).ToHashSet()
            : new HashSet<Guid>();

        var demandes = await context.Demandes.Where(d => ids.Contains(d.Id)).ToListAsync(ct);
        var now = DateTime.UtcNow;
        int processed = 0, skipped = 0;

        foreach (var d in demandes)
        {
            if (d.ResponseSentAt is not null) { skipped++; continue; } // locked — already sent

            if (approving)
            {
                if (!unitById.TryGetValue(d.Id, out var unitId) || !validUnitIds.Contains(unitId)) { skipped++; continue; }
                d.Status = DemandeStatus.Approved;
                d.DecidedUnitId = unitId;
            }
            else
            {
                d.Status = request.Status;
                d.DecidedUnitId = null;
            }
            d.DecisionNotes = request.DecisionNotes;
            d.ReviewedByUserId = currentUser.UserId;
            d.ReviewedAt = now;
            processed++;
        }

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("BulkDecide", "Demande", null, newValues: new { request.Status, processed, skipped }, cancellationToken: ct);
        return Result<BulkDecideDemandeResult>.Success(new BulkDecideDemandeResult(processed, skipped));
    }
}

// ============================================================
// Intake quota upsert
// ============================================================
public record SetUnitIntakeQuotaCommand(Guid UnitId, string ScoutYear, int Quota) : IRequest<Result<bool>>;

public class SetUnitIntakeQuotaCommandValidator : AbstractValidator<SetUnitIntakeQuotaCommand>
{
    public SetUnitIntakeQuotaCommandValidator()
    {
        RuleFor(x => x.UnitId).NotEmpty();
        RuleFor(x => x.ScoutYear).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Quota).InclusiveBetween(0, 10000);
    }
}

public class SetUnitIntakeQuotaCommandHandler(IApplicationDbContext context) : IRequestHandler<SetUnitIntakeQuotaCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetUnitIntakeQuotaCommand request, CancellationToken ct)
    {
        var q = await context.UnitIntakeQuotas.FirstOrDefaultAsync(x => x.UnitId == request.UnitId && x.ScoutYear == request.ScoutYear, ct);
        if (q is null)
            context.UnitIntakeQuotas.Add(new UnitIntakeQuota { UnitId = request.UnitId, ScoutYear = request.ScoutYear, Quota = Math.Max(0, request.Quota) });
        else
            q.Quota = Math.Max(0, request.Quota);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ============================================================
// Send responses — convert approved demandes into members, mark all decided as sent
// ============================================================
public record SendDemandeResponsesResult(int Approved, int Declined);
public record SendDemandeResponsesCommand(string ScoutYear) : IRequest<Result<SendDemandeResponsesResult>>;

public class SendDemandeResponsesCommandValidator : AbstractValidator<SendDemandeResponsesCommand>
{
    public SendDemandeResponsesCommandValidator()
        => RuleFor(x => x.ScoutYear).NotEmpty().WithMessage("L'année scoute est requise.")
            .MaximumLength(20).Matches(@"^[0-9\- ]+$").WithMessage("Année scoute invalide (ex. 2026-2027).");
}

public class SendDemandeResponsesCommandHandler(IApplicationDbContext context, IPasswordHasher hasher, IAuditService audit, IEmailQueue emailQueue) : IRequestHandler<SendDemandeResponsesCommand, Result<SendDemandeResponsesResult>>
{
    public async ValueTask<Result<SendDemandeResponsesResult>> Handle(SendDemandeResponsesCommand request, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        // "Date de début des nouveaux membres" setting → assignment start date for admitted members.
        // Empty/unset → today.
        var startDateRaw = await context.Settings.Where(s => s.Key == "demande.member_start_date").Select(s => s.Value).FirstOrDefaultAsync(ct);
        var memberStartDate = DateOnly.TryParseExact(startDateRaw, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var msd) ? msd : today;

        // Pre-hash login passwords in parallel BEFORE taking the lock/transaction, so the expensive
        // bcrypt work (one per approved member) doesn't hold the advisory lock or stretch the tx.
        var preApprovedIds = await context.Demandes
            .Where(d => d.ScoutYear == request.ScoutYear && d.ResponseSentAt == null && d.Status == DemandeStatus.Approved)
            .Select(d => d.Id).ToListAsync(ct);
        var creds = new System.Collections.Concurrent.ConcurrentDictionary<Guid, (string Pwd, string Hash)>();
        await Parallel.ForEachAsync(preApprovedIds, ct, async (id, c) =>
        {
            var pwd = $"Scout{DateTime.UtcNow.Year}!{Random.Shared.Next(100, 999)}";
            var hash = await Task.Run(() => hasher.Hash(pwd), c);
            creds[id] = (pwd, hash);
        });

        // Serialize like passage finalize (double-click / concurrent CG safe).
        await using var tx = await context.BeginTransactionAsync(ct);
        await context.AcquireAdvisoryLockAsync(917320251, ct);

        // Completeness gate: results cannot be posted while any submitted application is still
        // awaiting a decision. Every submitted demande must be Approved or Declined first.
        var undecided = await context.Demandes
            .CountAsync(d => d.ScoutYear == request.ScoutYear && d.Status == DemandeStatus.Submitted && d.ResponseSentAt == null, ct);
        if (undecided > 0)
            return Result<SendDemandeResponsesResult>.Failure($"{undecided} demande(s) encore en attente de décision. Toutes les demandes doivent être acceptées ou refusées avant l'envoi des réponses.");

        var pending = await context.Demandes
            .Where(d => d.ScoutYear == request.ScoutYear && d.ResponseSentAt == null
                && (d.Status == DemandeStatus.Approved || d.Status == DemandeStatus.Declined))
            .ToListAsync(ct);

        var approved = pending.Where(d => d.Status == DemandeStatus.Approved).ToList();
        var declined = pending.Where(d => d.Status == DemandeStatus.Declined).ToList();

        var domain = await context.Settings.Where(s => s.Key == "user_domain").Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "scouts.gndj";

        // Card sequence counters (seeded from existing max), tracked across the batch
        async Task<int> MaxSeq(string prefix)
        {
            var last = await context.Members.IgnoreQueryFilters()
                .Where(m => m.CardNumber != null && m.CardNumber.StartsWith(prefix + "-"))
                .OrderByDescending(m => m.CardNumber).Select(m => m.CardNumber).FirstOrDefaultAsync(ct);
            if (last is not null) { var p = last.Split('-'); if (p.Length == 2 && int.TryParse(p[1], out var n)) return n; }
            return 0;
        }
        int mSeq = await MaxSeq("M"), fSeq = await MaxSeq("F");

        var usedEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var guardianCache = new Dictionary<Guid, Guardian>();          // applicantGuardianId -> Guardian
        var baseRoleCache = new Dictionary<Guid, Guid?>();             // unitId -> base roleId

        var accountIds = pending.Select(d => d.ApplicantAccountId).Distinct().ToList();
        var accounts = await context.ApplicantAccounts.Where(a => accountIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct);
        var acctGuardians = (await context.ApplicantGuardians.Where(g => accountIds.Contains(g.ApplicantAccountId)).ToListAsync(ct))
            .GroupBy(g => g.ApplicantAccountId).ToDictionary(g => g.Key, g => g.ToList());

        var unitIds = approved.Where(d => d.DecidedUnitId.HasValue).Select(d => d.DecidedUnitId!.Value).Distinct().ToList();
        var unitNames = await context.Units.Where(u => unitIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name, ct);
        var baseUrl = ((await context.Settings.Where(s => s.Key == "app.base_url").Select(s => s.Value).FirstOrDefaultAsync(ct)) ?? "http://localhost:5173").TrimEnd('/');
        var loginUrl = $"{baseUrl}/login";

        // Email jobs collected during the batch, sent only AFTER the transaction commits.
        var emailJobs = new List<(string Code, string To, Dictionary<string, string> Vars)>();

        foreach (var d in approved)
        {
            var unitId = d.DecidedUnitId!.Value;

            // base role for the unit (lowest rank for its unit type)
            if (!baseRoleCache.TryGetValue(unitId, out var roleId))
            {
                var unit = await context.Units.FirstOrDefaultAsync(u => u.Id == unitId, ct);
                if (unit is null) { return Result<SendDemandeResponsesResult>.Failure($"Unité introuvable pour {d.FirstName} {d.LastName}."); }
                // Prefer the explicitly-marked default function for the unit type; fall back to the
                // most-junior (lowest rank) non-archived one for unit types without a default set.
                roleId = await context.FunctionalRoles.Where(r => r.UnitTypeId == unit.UnitTypeId && !r.IsArchived && r.IsDefaultForNewMembers)
                    .Select(r => (Guid?)r.Id).FirstOrDefaultAsync(ct);
                roleId ??= await context.FunctionalRoles.Where(r => r.UnitTypeId == unit.UnitTypeId && !r.IsArchived)
                    .OrderBy(r => r.Rank).ThenBy(r => r.Name).Select(r => (Guid?)r.Id).FirstOrDefaultAsync(ct);
                baseRoleCache[unitId] = roleId;
            }
            if (roleId is null)
                return Result<SendDemandeResponsesResult>.Failure($"Aucune fonction de base définie pour l'unité de {d.FirstName} {d.LastName}. Définissez un rang dans les Fonctions.");

            // member + card number
            var prefix = d.Gender == "Féminin" ? "F" : "M";
            var seq = prefix == "F" ? ++fSeq : ++mSeq;
            var member = new Member
            {
                FirstName = d.FirstName, LastName = d.LastName, DateOfBirth = d.DateOfBirth, Gender = d.Gender,
                CardNumber = $"{prefix}-{seq:D4}", BloodType = d.BloodType, Nationality = d.Nationality,
                School = d.School, Classe = d.Classe, Section = d.Section, MedicalNotes = d.MedicalNotes, Allergies = d.Allergies,
            };
            context.Members.Add(member);

            // child contacts
            if (!string.IsNullOrWhiteSpace(d.PhoneNumber))
                context.MemberPhones.Add(new MemberPhone { MemberId = member.Id, CountryCode = d.PhoneCountryCode ?? "", Number = d.PhoneNumber!, Type = "Mobile", IsPrimary = true });
            if (!string.IsNullOrWhiteSpace(d.Email))
                context.MemberEmails.Add(new MemberEmail { MemberId = member.Id, Address = d.Email!, Type = "Personnel", IsPrimary = true });

            // household address
            var acc = accounts.GetValueOrDefault(d.ApplicantAccountId);
            if (acc is not null && (!string.IsNullOrWhiteSpace(acc.AddressCity) || !string.IsNullOrWhiteSpace(acc.AddressDetails)))
                context.MemberAddresses.Add(new MemberAddress { MemberId = member.Id, Type = "Domicile", Country = acc.AddressCountry ?? "Liban", City = acc.AddressCity ?? "", Details = acc.AddressDetails, IsPrimary = true });

            // guardians (dedup by email/phone, reuse across siblings)
            foreach (var ag in acctGuardians.GetValueOrDefault(d.ApplicantAccountId) ?? [])
            {
                if (!guardianCache.TryGetValue(ag.Id, out var guardian))
                {
                    guardian = await FindExistingGuardian(ag, ct);
                    if (guardian is null)
                    {
                        guardian = new Guardian { FirstName = ag.FirstName, LastName = ag.LastName, Profession = ag.Profession, ProfessionDomain = ag.ProfessionDomain, IsDeceased = ag.IsDeceased };
                        context.Guardians.Add(guardian);
                        if (!string.IsNullOrWhiteSpace(ag.PhoneNumber))
                            context.GuardianPhones.Add(new GuardianPhone { GuardianId = guardian.Id, CountryCode = ag.PhoneCountryCode ?? "", Number = ag.PhoneNumber!, Type = "Mobile", IsPrimary = true });
                        if (!string.IsNullOrWhiteSpace(ag.Email))
                            context.GuardianEmails.Add(new GuardianEmail { GuardianId = guardian.Id, Address = ag.Email!, Type = "Personnel", IsPrimary = true });
                    }
                    guardianCache[ag.Id] = guardian;
                }
                context.GuardianLinks.Add(new GuardianLink { GuardianId = guardian.Id, MemberId = member.Id, RelationshipType = ag.Relationship, IsPrimaryContact = ag.IsPrimaryContact, IsEmergencyContact = ag.IsEmergencyContact });
            }

            // assignment (chosen unit, base role, no team)
            context.MemberAssignments.Add(new MemberAssignment { MemberId = member.Id, UnitId = unitId, TeamId = null, FunctionalRoleId = roleId.Value, StartDate = memberStartDate, Notes = "Inscription" });

            // login — reuse the pre-computed password hash (fallback: hash inline if a demande was
            // approved between the pre-hash read and acquiring the lock)
            var username = await UniqueEmail(d.FirstName, d.LastName, domain, usedEmails, ct);
            usedEmails.Add(username);
            string tempPassword, passwordHash;
            if (creds.TryGetValue(d.Id, out var c)) { tempPassword = c.Pwd; passwordHash = c.Hash; }
            else { tempPassword = $"Scout{DateTime.UtcNow.Year}!{Random.Shared.Next(100, 999)}"; passwordHash = hasher.Hash(tempPassword); }
            context.Users.Add(new User { MemberId = member.Id, Email = username, PasswordHash = passwordHash, IsActive = true, IsSuperAdmin = false });

            d.CreatedMemberId = member.Id;
            d.ResponseSentAt = DateTime.UtcNow;

            if (acc is not null)
                emailJobs.Add(("demande_approved", acc.Email, new Dictionary<string, string>
                {
                    ["contactName"] = acc.ContactName ?? "",
                    ["childName"] = $"{d.FirstName} {d.LastName}",
                    ["unitName"] = unitNames.GetValueOrDefault(unitId, ""),
                    ["username"] = username,
                    ["tempPassword"] = tempPassword,
                    ["loginUrl"] = loginUrl,
                }));
        }

        foreach (var d in declined)
        {
            d.ResponseSentAt = DateTime.UtcNow;
            var acc = accounts.GetValueOrDefault(d.ApplicantAccountId);
            if (acc is not null)
                emailJobs.Add(("demande_declined", acc.Email, new Dictionary<string, string>
                {
                    ["contactName"] = acc.ContactName ?? "",
                    ["childName"] = $"{d.FirstName} {d.LastName}",
                    ["reason"] = string.IsNullOrWhiteSpace(d.DecisionNotes) ? "" : d.DecisionNotes!,
                }));
        }

        await context.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        // Queue notification emails (sent in the background — the request returns immediately).
        foreach (var job in emailJobs)
            emailQueue.Enqueue(new EmailJob(job.Code, job.To, job.Vars));
        await audit.LogAsync("SendResponses", "Demande", null, newValues: new { Approved = approved.Count, Declined = declined.Count, request.ScoutYear }, cancellationToken: ct);

        return Result<SendDemandeResponsesResult>.Success(new SendDemandeResponsesResult(approved.Count, declined.Count));
    }

    private async Task<Guardian?> FindExistingGuardian(ApplicantGuardian ag, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(ag.Email))
        {
            var byEmail = await context.GuardianEmails.Where(e => e.Address == ag.Email)
                .Select(e => e.Guardian).FirstOrDefaultAsync(ct);
            if (byEmail is not null) return byEmail;
        }
        if (!string.IsNullOrWhiteSpace(ag.PhoneNumber))
        {
            var byPhone = await context.GuardianPhones.Where(p => p.Number == ag.PhoneNumber)
                .Select(p => p.Guardian).FirstOrDefaultAsync(ct);
            if (byPhone is not null) return byPhone;
        }
        return null;
    }

    private async Task<string> UniqueEmail(string first, string last, string domain, HashSet<string> used, CancellationToken ct)
    {
        var baseName = $"{Normalize(first)}.{Normalize(last)}";
        var email = $"{baseName}@{domain}";
        var suffix = 2;
        while (used.Contains(email) || await context.Users.AnyAsync(u => u.Email == email, ct))
        {
            email = $"{baseName}{suffix}@{domain}";
            suffix++;
        }
        return email;
    }

    private static string Normalize(string name) => name.Trim().ToLower()
        .Replace(' ', '.').Replace('é', 'e').Replace('è', 'e').Replace('ê', 'e').Replace('ë', 'e')
        .Replace('à', 'a').Replace('â', 'a').Replace('ä', 'a').Replace('ù', 'u').Replace('û', 'u').Replace('ü', 'u')
        .Replace('ô', 'o').Replace('ö', 'o').Replace('î', 'i').Replace('ï', 'i').Replace('ç', 'c').Replace("'", "");
}
