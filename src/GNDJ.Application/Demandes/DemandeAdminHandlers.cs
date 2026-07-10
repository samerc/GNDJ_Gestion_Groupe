using FluentValidation;
using GNDJ.Application.Applicants;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Validation;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// CG (admin) side of the enrolment workflow. An applicant submits a demande; the CG reviews it here
// (filtered list, unit-occupancy/quota context, statistics), decides per demande (approve→unit /
// decline), then SendDemandeResponses converts the approved ones into real members and emails everyone.
// Decisions stay hidden from the applicant until SendDemandeResponses posts them all at once.

// ============================================================
// DTOs
// ============================================================
public record SiblingDto(Guid Id, string FirstName, string LastName, string Status, bool ResponseSent);

// Full reviewable file for one demande: child fields + the account's shared household (address,
// guardians, scout relations) + sibling demandes on the same account.

public record DemandeReviewDto(
    Guid Id, string ScoutYear, string FirstName, string LastName, DateOnly? DateOfBirth, int? Age,
    string? Gender, string? Nationality, string? School, string? Classe, string? Section, string? BloodType,
    string? MedicalNotes, string? Allergies, string? PhoneNumber, string? Email, string? ParentNotes,
    string Status, Guid? DecidedUnitId, string? DecidedUnitName, string? DecisionNotes,
    DateTime? SubmittedAt, DateTime? ResponseSentAt, Guid? CreatedMemberId,
    Guid AccountId, string AccountEmail, string? ContactName,
    string? AddressCountry, string? AddressCity, string? AddressDetails,
    IReadOnlyList<ApplicantGuardianDto> Guardians, IReadOnlyList<ApplicantScoutRelationDto> ScoutRelations,
    IReadOnlyList<SiblingDto> Siblings,
    bool HasPreviousDemande = false, string? PreviousDemandeYear = null);

// Per-unit capacity card for the CG: current active members, Projected (after applying this year's
// passage moves in/out), the editable intake Quota, and how many demandes are already Accepted into it.
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

    static string NormalizeKey(string s) => TextNormalization.NormalizeKey(s);
    static bool HasDiacritics(string s) => s != TextNormalization.RemoveDiacritics(s);
}

// ============================================================
// Review list — the CG's filterable triage table (submitted/decided demandes, never drafts)
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

        // Resolve the auto-matched relatives so the CG can SEE/confirm the link (name + current active unit).
        // Only CurrentInGroup relations ever get a RelatedMemberId set (see SaveApplicantHousehold auto-match).
        var relatedMemberIds = relations.Values.SelectMany(rs => rs)
            .Where(r => r.RelatedMemberId.HasValue).Select(r => r.RelatedMemberId!.Value).Distinct().ToList();
        var relatedMembers = relatedMemberIds.Count == 0
            ? new Dictionary<Guid, (string Name, string? Unit)>()
            : await context.Members.Where(m => relatedMemberIds.Contains(m.Id))
                .Select(m => new
                {
                    m.Id,
                    Name = m.FirstName + " " + m.LastName,
                    // Their current (open) assignment's unit, if any — gives the CG context for the match.
                    Unit = m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault()
                })
                .ToDictionaryAsync(x => x.Id, x => (x.Name, x.Unit), ct);

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
                rs.Select(r =>
                {
                    var match = r.RelatedMemberId.HasValue ? relatedMembers.GetValueOrDefault(r.RelatedMemberId.Value) : default;
                    return new ApplicantScoutRelationDto(r.Id, r.Status, r.Relationship, r.RelatedMemberId, r.FirstName, r.LastName, r.LastUnit, r.LastFunction, r.OtherGroupName,
                        match.Name, match.Unit);
                }).ToList(),
                sibs, d.HasPreviousDemande, d.PreviousDemandeYear);
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
        // A response already went out. Re-deciding is allowed ONLY when no member was created (a declined
        // applicant the CG now wants to reconsider): clearing ResponseSentAt re-enters it into the pending
        // queue so the next "Envoyer les réponses" processes just this one (an individual re-send). A
        // converted demande (member exists) stays locked — un-converting is out of scope.
        if (demande.ResponseSentAt is not null)
        {
            if (demande.CreatedMemberId is not null)
                return Result<bool>.Failure("Un membre a déjà été créé pour cette demande — décision verrouillée.");
            demande.ResponseSentAt = null;
        }

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
        // Sibling proches already in the group (auto-matched to a member) — used below to link families.
        var acctSiblingRelations = (await context.ApplicantScoutRelations
                .Where(r => accountIds.Contains(r.ApplicantAccountId) && r.RelatedMemberId != null).ToListAsync(ct))
            .Where(r => IsSiblingRelation(r.Relationship))
            .GroupBy(r => r.ApplicantAccountId).ToDictionary(g => g.Key, g => g.ToList());

        var unitIds = approved.Where(d => d.DecidedUnitId.HasValue).Select(d => d.DecidedUnitId!.Value).Distinct().ToList();
        var unitNames = await context.Units.Where(u => unitIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name, ct);
        var baseUrl = ((await context.Settings.Where(s => s.Key == "app.base_url").Select(s => s.Value).FirstOrDefaultAsync(ct)) ?? "http://localhost:5173").TrimEnd('/');
        var loginUrl = $"{baseUrl}/login";

        // PERF: pre-resolve everything the per-member loop used to query one-by-one INSIDE the advisory lock —
        // base role per unit, existing guardians by contact, and taken usernames — into a few batched reads,
        // so a large batch issues a handful of queries instead of O(members + guardians) round-trips (which
        // stretched the lock hold time).
        // (A) Base role per decided unit = the unit type's default function, else its lowest-rank non-archived one.
        var unitTypeByUnit = await context.Units.Where(u => unitIds.Contains(u.Id))
            .Select(u => new { u.Id, u.UnitTypeId }).ToDictionaryAsync(u => u.Id, u => u.UnitTypeId, ct);
        var typeIds = unitTypeByUnit.Values.Distinct().ToList();
        var baseRoleByType = (await context.FunctionalRoles.Where(r => r.UnitTypeId != null && typeIds.Contains(r.UnitTypeId.Value) && !r.IsArchived)
                .Select(r => new { r.Id, UnitTypeId = r.UnitTypeId!.Value, r.Rank, r.Name, r.IsDefaultForNewMembers }).ToListAsync(ct))
            .GroupBy(r => r.UnitTypeId)
            .ToDictionary(g => g.Key, g => (g.FirstOrDefault(r => r.IsDefaultForNewMembers)
                ?? g.OrderBy(r => r.Rank).ThenBy(r => r.Name).FirstOrDefault())?.Id);
        foreach (var (uId, typeId) in unitTypeByUnit)
            baseRoleCache[uId] = baseRoleByType.GetValueOrDefault(typeId);

        // (B) Existing guardians matched by email (case-sensitive, as before) then phone — loaded once.
        var agAll = acctGuardians.Values.SelectMany(g => g).ToList();
        var agEmails = agAll.Where(a => !string.IsNullOrWhiteSpace(a.Email)).Select(a => a.Email!).Distinct().ToList();
        var agPhones = agAll.Where(a => !string.IsNullOrWhiteSpace(a.PhoneNumber)).Select(a => a.PhoneNumber!).Distinct().ToList();
        var guardianByEmail = (await context.GuardianEmails.Where(e => agEmails.Contains(e.Address))
                .Select(e => new { e.Address, e.Guardian }).ToListAsync(ct))
            .GroupBy(x => x.Address, StringComparer.Ordinal)
            .ToDictionary(x => x.Key, x => x.First().Guardian, StringComparer.Ordinal);
        var guardianByPhone = (await context.GuardianPhones.Where(p => agPhones.Contains(p.Number))
                .Select(p => new { p.Number, p.Guardian }).ToListAsync(ct))
            .GroupBy(x => x.Number, StringComparer.Ordinal)
            .ToDictionary(x => x.Key, x => x.First().Guardian, StringComparer.Ordinal);

        // (C) Usernames already taken — one read instead of an AnyAsync per member.
        var takenEmails = new HashSet<string>(await context.Users.Select(u => u.Email).ToListAsync(ct), StringComparer.OrdinalIgnoreCase);

        // Email jobs collected during the batch, sent only AFTER the transaction commits.
        var emailJobs = new List<(string Code, string To, Dictionary<string, string> Vars)>();

        // Every response goes to all emails on the file: the applicant account (login), every guardian
        // email, and the child's own email — deduplicated (case-insensitive), blanks skipped.
        HashSet<string> Recipients(Demande d, ApplicantAccount? acc)
        {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            void Add(string? e) { if (!string.IsNullOrWhiteSpace(e)) set.Add(e!.Trim()); }
            Add(acc?.Email);
            foreach (var ag in acctGuardians.GetValueOrDefault(d.ApplicantAccountId) ?? []) Add(ag.Email);
            Add(d.Email);
            return set;
        }

        foreach (var d in approved)
        {
            var unitId = d.DecidedUnitId!.Value;

            // base role for the unit (pre-resolved into baseRoleCache above)
            if (!baseRoleCache.TryGetValue(unitId, out var roleId))
                return Result<SendDemandeResponsesResult>.Failure($"Unité introuvable pour {d.FirstName} {d.LastName}.");
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

            // household primary contact email (chosen in the wizard) → drives member-facing mail delivery
            if (!string.IsNullOrWhiteSpace(acc?.PrimaryContactEmail))
                member.PrimaryContactEmail = acc.PrimaryContactEmail.Trim();

            // guardians (dedup by email/phone, reuse across siblings)
            foreach (var ag in acctGuardians.GetValueOrDefault(d.ApplicantAccountId) ?? [])
            {
                if (!guardianCache.TryGetValue(ag.Id, out var guardian))
                {
                    guardian = FindExistingGuardian(ag, guardianByEmail, guardianByPhone);
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
            var username = UniqueEmail(d.FirstName, d.LastName, domain, usedEmails, takenEmails);
            usedEmails.Add(username);
            string tempPassword, passwordHash;
            if (creds.TryGetValue(d.Id, out var c)) { tempPassword = c.Pwd; passwordHash = c.Hash; }
            else { tempPassword = $"Scout{DateTime.UtcNow.Year}!{Random.Shared.Next(100, 999)}"; passwordHash = hasher.Hash(tempPassword); }
            context.Users.Add(new User { MemberId = member.Id, Email = username, PasswordHash = passwordHash, IsActive = true, IsSuperAdmin = false });

            d.CreatedMemberId = member.Id;
            d.ResponseSentAt = DateTime.UtcNow;

            var approvedVars = new Dictionary<string, string>
            {
                ["contactName"] = acc?.ContactName ?? "",
                ["childName"] = $"{d.FirstName} {d.LastName}",
                ["unitName"] = unitNames.GetValueOrDefault(unitId, ""),
                ["username"] = username,
                ["tempPassword"] = tempPassword,
                ["loginUrl"] = loginUrl,
            };
            foreach (var to in Recipients(d, acc))
                emailJobs.Add(("demande_approved", to, approvedVars));
        }

        foreach (var d in declined)
        {
            d.ResponseSentAt = DateTime.UtcNow;
            var acc = accounts.GetValueOrDefault(d.ApplicantAccountId);
            var declinedVars = new Dictionary<string, string>
            {
                ["contactName"] = acc?.ContactName ?? "",
                ["childName"] = $"{d.FirstName} {d.LastName}",
                ["reason"] = string.IsNullOrWhiteSpace(d.DecisionNotes) ? "" : d.DecisionNotes!,
            };
            foreach (var to in Recipients(d, acc))
                emailJobs.Add(("demande_declined", to, declinedVars));
        }

        // Link families: for a household that named a sibling already in the group (a proche auto-matched to
        // an existing member), share the household's guardians with that member — the app detects siblings via
        // shared guardians, so this ties the newly-converted child(ren) to the existing member. Deduped against
        // links already present (usually the guardian is reused via contact-match, so this rarely adds a row).
        if (acctSiblingRelations.Count > 0)
        {
            var siblingMemberIds = acctSiblingRelations.Values.SelectMany(rs => rs).Select(r => r.RelatedMemberId!.Value).Distinct().ToList();
            var links = (await context.GuardianLinks.Where(l => siblingMemberIds.Contains(l.MemberId) && !l.IsDeleted)
                .Select(l => new { l.GuardianId, l.MemberId }).ToListAsync(ct))
                .Select(x => (x.GuardianId, x.MemberId)).ToHashSet();

            foreach (var (accId, rels) in acctSiblingRelations)
                foreach (var ag in acctGuardians.GetValueOrDefault(accId) ?? [])
                {
                    if (!guardianCache.TryGetValue(ag.Id, out var guardian) || guardian is null) continue;
                    foreach (var r in rels)
                    {
                        var mid = r.RelatedMemberId!.Value;
                        if (links.Add((guardian.Id, mid)))
                            context.GuardianLinks.Add(new GuardianLink { GuardianId = guardian.Id, MemberId = mid, RelationshipType = ag.Relationship, IsPrimaryContact = ag.IsPrimaryContact, IsEmergencyContact = ag.IsEmergencyContact });
                    }
                }
        }

        await context.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        // Queue notification emails (sent in the background — the request returns immediately).
        foreach (var job in emailJobs)
            emailQueue.Enqueue(new EmailJob(job.Code, job.To, job.Vars));
        await audit.LogAsync("SendResponses", "Demande", null, newValues: new { Approved = approved.Count, Declined = declined.Count, request.ScoutYear }, cancellationToken: ct);

        return Result<SendDemandeResponsesResult>.Success(new SendDemandeResponsesResult(approved.Count, declined.Count));
    }

    // A proche-scout relationship that means brother/sister (so the two children share parents → siblings).
    // Cousins/other relatives are excluded (they don't share the household's guardians).
    private static bool IsSiblingRelation(string? relationship)
    {
        if (string.IsNullOrWhiteSpace(relationship)) return false;
        var r = TextNormalization.RemoveDiacritics(relationship).ToLowerInvariant();
        return r.Contains("frere") || r.Contains("soeur") || r.Contains("broth") || r.Contains("sist")
            || r.Contains("jumeau") || r.Contains("jumelle");
    }

    // In-memory guardian match against the batch-loaded contact dictionaries (email then phone), matching the
    // original per-item query semantics (exact/case-sensitive) without a DB round-trip per applicant guardian.
    private static Guardian? FindExistingGuardian(ApplicantGuardian ag, Dictionary<string, Guardian> byEmail, Dictionary<string, Guardian> byPhone)
    {
        if (!string.IsNullOrWhiteSpace(ag.Email) && byEmail.TryGetValue(ag.Email, out var g1)) return g1;
        if (!string.IsNullOrWhiteSpace(ag.PhoneNumber) && byPhone.TryGetValue(ag.PhoneNumber, out var g2)) return g2;
        return null;
    }

    // Unique login local-part, checked against usernames taken in this batch (`used`) and already-existing
    // ones (`taken`, pre-loaded) — no per-member DB round-trip.
    private static string UniqueEmail(string first, string last, string domain, HashSet<string> used, HashSet<string> taken)
    {
        var baseName = $"{Normalize(first)}.{Normalize(last)}";
        var email = $"{baseName}@{domain}";
        var suffix = 2;
        while (used.Contains(email) || taken.Contains(email))
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

// ============================================================
// Close the campaign: archive every demande + its outcome, then HARD-delete all applicant-side data
// (accounts, guardians, scout relations, demandes) and disable inscriptions. Converted members are untouched.
// ============================================================
public record CloseDemandeCampaignResult(int Archived, int AccountsDeleted);
public record CloseDemandeCampaignCommand(string ScoutYear) : IRequest<Result<CloseDemandeCampaignResult>>;

public class CloseDemandeCampaignCommandValidator : AbstractValidator<CloseDemandeCampaignCommand>
{
    public CloseDemandeCampaignCommandValidator()
        => RuleFor(x => x.ScoutYear).NotEmpty().MaximumLength(20).Matches(@"^[0-9\- ]+$");
}

public class CloseDemandeCampaignCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<CloseDemandeCampaignCommand, Result<CloseDemandeCampaignResult>>
{
    public async ValueTask<Result<CloseDemandeCampaignResult>> Handle(CloseDemandeCampaignCommand request, CancellationToken ct)
    {
        await using var tx = await context.BeginTransactionAsync(ct);
        await context.AcquireAdvisoryLockAsync(917320251, ct); // shared with SendDemandeResponses — mutually exclusive

        // Block if any submitted application is still awaiting a response — closing would discard it unreviewed.
        var pendingResponse = await context.Demandes.CountAsync(d => d.Status == DemandeStatus.Submitted && d.ResponseSentAt == null, ct);
        if (pendingResponse > 0)
            return Result<CloseDemandeCampaignResult>.Failure($"{pendingResponse} demande(s) sans réponse. Envoyez toutes les réponses avant de clôturer.");

        var demandes = await context.Demandes.ToListAsync(ct);
        var accIds = demandes.Select(d => d.ApplicantAccountId).Distinct().ToList();
        var accounts = await context.ApplicantAccounts.Where(a => accIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct);
        var unitIds = demandes.Where(d => d.DecidedUnitId.HasValue).Select(d => d.DecidedUnitId!.Value).Distinct().ToList();
        var unitNames = await context.Units.Where(u => unitIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name, ct);
        var memberIds = demandes.Where(d => d.CreatedMemberId.HasValue).Select(d => d.CreatedMemberId!.Value).Distinct().ToList();
        var memberCards = await context.Members.IgnoreQueryFilters().Where(m => memberIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, m => m.CardNumber, ct);

        var now = DateTime.UtcNow;
        foreach (var d in demandes)
        {
            var acc = accounts.GetValueOrDefault(d.ApplicantAccountId);
            context.DemandeArchives.Add(new DemandeArchive
            {
                ScoutYear = d.ScoutYear,
                FirstName = d.FirstName, LastName = d.LastName, DateOfBirth = d.DateOfBirth, Gender = d.Gender,
                Nationality = d.Nationality, School = d.School, Classe = d.Classe, Section = d.Section, BloodType = d.BloodType,
                MedicalNotes = d.MedicalNotes, Allergies = d.Allergies, PhoneNumber = d.PhoneNumber, Email = d.Email,
                ParentNotes = d.ParentNotes, HasPreviousDemande = d.HasPreviousDemande, PreviousDemandeYear = d.PreviousDemandeYear,
                AccountEmail = acc?.Email, ContactName = acc?.ContactName, AddressCity = acc?.AddressCity,
                Status = d.Status,
                DecidedUnitName = d.DecidedUnitId.HasValue ? unitNames.GetValueOrDefault(d.DecidedUnitId.Value) : null,
                DecisionNotes = d.DecisionNotes, ResponseSentAt = d.ResponseSentAt, CreatedMemberId = d.CreatedMemberId,
                CreatedMemberCardNumber = d.CreatedMemberId.HasValue ? memberCards.GetValueOrDefault(d.CreatedMemberId.Value) : null,
                ArchivedAt = now,
            });
        }
        await context.SaveChangesAsync(ct); // persist the snapshot first

        // Hard-delete all applicant-side data (ExecuteDelete bypasses the soft-delete interceptor; IgnoreQueryFilters
        // so even soft-deleted rows go). Order respects FKs: demandes → relations/guardians → accounts.
        await context.Demandes.IgnoreQueryFilters().ExecuteDeleteAsync(ct);
        await context.ApplicantScoutRelations.IgnoreQueryFilters().ExecuteDeleteAsync(ct);
        await context.ApplicantGuardians.IgnoreQueryFilters().ExecuteDeleteAsync(ct);
        var accountsDeleted = await context.ApplicantAccounts.IgnoreQueryFilters().ExecuteDeleteAsync(ct);

        // Close inscriptions.
        var enabled = await context.Settings.FirstOrDefaultAsync(s => s.Key == "demande.enabled", ct);
        if (enabled is not null) enabled.Value = "false";
        await context.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        await audit.LogAsync("CloseCampaign", "Demande", null,
            newValues: new { request.ScoutYear, Archived = demandes.Count, AccountsDeleted = accountsDeleted }, cancellationToken: ct);
        return Result<CloseDemandeCampaignResult>.Success(new CloseDemandeCampaignResult(demandes.Count, accountsDeleted));
    }
}

// ── Submission window toggle (CG) ─────────────────────────────────────────────────────────────────────
// Opens/closes the INNER submission period (demande.submissions_open) that sits inside the open portal.
// Closing it begins the review phase: parents keep read-only access to their demandes but can no longer
// create/edit/submit/delete. Distinct from CloseCampaign (which archives + wipes everything at the very end).
public record SetDemandeSubmissionsCommand(bool Open) : IRequest<Result<bool>>;

public class SetDemandeSubmissionsCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<SetDemandeSubmissionsCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetDemandeSubmissionsCommand request, CancellationToken ct)
    {
        var value = request.Open ? "true" : "false";
        var setting = await context.Settings.FirstOrDefaultAsync(s => s.Key == "demande.submissions_open", ct);
        if (setting is null)
            context.Settings.Add(new Setting { Key = "demande.submissions_open", Value = value, Category = "demande", Label = "Soumissions ouvertes", ValueType = "boolean" });
        else
            setting.Value = value;
        await context.SaveChangesAsync(ct);
        await audit.LogAsync(request.Open ? "OpenSubmissions" : "CloseSubmissions", "Demande", null, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// Campaign status for the CG review page: is the portal open, is the submission window open, and the year.
public record DemandeCampaignStatusDto(bool Enabled, bool SubmissionsOpen, string ScoutYear);
public record GetDemandeCampaignStatusQuery : IRequest<Result<DemandeCampaignStatusDto>>;

public class GetDemandeCampaignStatusQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetDemandeCampaignStatusQuery, Result<DemandeCampaignStatusDto>>
{
    public async ValueTask<Result<DemandeCampaignStatusDto>> Handle(GetDemandeCampaignStatusQuery request, CancellationToken ct)
    {
        var map = await context.Settings
            .Where(s => s.Key == "demande.enabled" || s.Key == "demande.submissions_open" || s.Key == "demande.scout_year")
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        var enabled = map.GetValueOrDefault("demande.enabled") == "true";
        var submissionsOpen = map.GetValueOrDefault("demande.submissions_open") != "false";
        var year = map.GetValueOrDefault("demande.scout_year") ?? "";
        return Result<DemandeCampaignStatusDto>.Success(new DemandeCampaignStatusDto(enabled, submissionsOpen, year));
    }
}
