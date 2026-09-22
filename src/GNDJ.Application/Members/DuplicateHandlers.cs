using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Siblings; // SiblingUtil.Pair (normalized member pair) — reused for the "not duplicates" tombstone
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

using FluentValidation;
using GNDJ.Application.Common.Validation;

namespace GNDJ.Application.Members;

// ── Duplicate MEMBER detection + merge (the "Doublons" tab on the Fratries page) ──
// The import created some members twice. This finds likely duplicates (SAME normalized full name AND SAME date
// of birth — a true "same person entered twice" signal, distinct from siblings who merely share parents) and
// lets a group manager pick a keeper + which field values to keep, then merges everything onto the keeper and
// soft-deletes the losers (restorable from the Corbeille). Management is CG/super-admin only (IsGroupManager).

// One member in a duplicate group — carries every field the merge dialog shows / lets the CG choose from.
public record DuplicateMemberDto(
    Guid MemberId, string FirstName, string LastName, DateOnly? DateOfBirth, string? Gender,
    string? CardNumber, string? ExternalCardNumber, string? BloodType, string? Nationality, string? School,
    string? Classe, string? Section, string? ProfessionDomain, string? Profession, string? MedicalNotes,
    string? Allergies, string? Notes, string? PrimaryContactEmail, string? PhotoPath, string? Username,
    string? UnitName, string? UnitCode, bool HasAccount, bool IsActiveMember, int AssignmentCount, DateTime CreatedAt);

// A set of members that look like the same person.
public record DuplicateGroupDto(IReadOnlyList<DuplicateMemberDto> Members, string Evidence);

// Shared projection for the merge DTO — used by the auto-suggestions AND the manual "merge any two" lookup, so
// both show the EXACT same fields (and stay in sync). Takes the context as a parameter (for the correlated User
// subqueries) so the expression captures a local, not a field.
public static class DuplicateMemberProjection
{
    public static IQueryable<DuplicateMemberDto> Project(IApplicationDbContext context, IQueryable<Domain.Entities.Member> source) =>
        source.Select(m => new DuplicateMemberDto(
            m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.Gender,
            m.CardNumber, m.ExternalCardNumber, m.BloodType, m.Nationality, m.School,
            m.Classe, m.Section, m.ProfessionDomain, m.Profession, m.MedicalNotes,
            m.Allergies, m.Notes, m.PrimaryContactEmail, m.PhotoPath,
            context.Users.Where(u => u.MemberId == m.Id && !u.IsDeleted).Select(u => u.Email).FirstOrDefault(),
            m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(),
            m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Code).FirstOrDefault(),
            context.Users.Any(u => u.MemberId == m.Id && !u.IsDeleted),
            m.Assignments.Any(a => a.EndDate == null),
            m.Assignments.Count(a => !a.IsDeleted),
            m.CreatedAt));
}

// Fetch the merge DTO for specific members — powers the MANUAL "merge any two members" flow (the CG searches +
// picks two arbitrary members, not from an auto-detected group). Group manager only. Returns the members ordered
// as requested (so the first picked defaults to the keeper on the client).
public record GetMembersForMergeQuery(IReadOnlyList<Guid> MemberIds) : IRequest<Result<IReadOnlyList<DuplicateMemberDto>>>;

public class GetMembersForMergeQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMembersForMergeQuery, Result<IReadOnlyList<DuplicateMemberDto>>>
{
    public async ValueTask<Result<IReadOnlyList<DuplicateMemberDto>>> Handle(GetMembersForMergeQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<IReadOnlyList<DuplicateMemberDto>>.Failure("Accès non autorisé.");

        var ids = request.MemberIds.Where(id => id != Guid.Empty).Distinct().ToList();
        if (ids.Count < 2) return Result<IReadOnlyList<DuplicateMemberDto>>.Failure("Sélectionnez deux membres différents à fusionner.");
        if (ids.Count > 20) return Result<IReadOnlyList<DuplicateMemberDto>>.Failure("Trop de membres sélectionnés (max 20).");

        var members = await DuplicateMemberProjection.Project(context, context.Members.Where(m => !m.IsDeleted && ids.Contains(m.Id))).ToListAsync(ct);
        if (members.Count < 2) return Result<IReadOnlyList<DuplicateMemberDto>>.Failure("Un ou plusieurs membres sont introuvables.");

        // Preserve the requested order so the first-picked member is the default keeper on the client.
        var ordered = ids.Select(id => members.First(m => m.MemberId == id)).ToList();
        return Result<IReadOnlyList<DuplicateMemberDto>>.Success(ordered);
    }
}

// Which fields the duplicate detection matches on (configurable by the CG). A member is grouped with another
// only when they share ALL of the selected keys (each of which must be non-empty on both). The available keys +
// their labels are the single source of truth for the backend and the frontend checkboxes.
public static class DuplicateMatchKeys
{
    public const string LastName = "lastName";
    public const string FirstName = "firstName";
    public const string Dob = "dob";
    public const string Gender = "gender";
    public const string Nationality = "nationality";
    public const string School = "school";

    // key → French label (used to build the evidence line). Only fields that two duplicate records can legitimately
    // SHARE are offered — the external card number is excluded (a unique index means two live members can't share it).
    public static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>
    {
        [LastName] = "nom", [FirstName] = "prénom", [Dob] = "date de naissance",
        [Gender] = "sexe", [Nationality] = "nationalité", [School] = "école",
    };

    // Sensible default when none are supplied: same name + same date of birth (the original behaviour).
    public static readonly string[] Default = [LastName, FirstName, Dob];
}

public record GetDuplicateMemberSuggestionsQuery(IReadOnlyList<string>? Keys = null) : IRequest<Result<IReadOnlyList<DuplicateGroupDto>>>;

public class GetDuplicateMemberSuggestionsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetDuplicateMemberSuggestionsQuery, Result<IReadOnlyList<DuplicateGroupDto>>>
{
    private const int MaxGroups = 200;
    private const int MaxGroupSize = 12;   // a bucket bigger than this is a generic match, not a duplicate — skipped

    public async ValueTask<Result<IReadOnlyList<DuplicateGroupDto>>> Handle(GetDuplicateMemberSuggestionsQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<IReadOnlyList<DuplicateGroupDto>>.Failure("Accès non autorisé.");

        // Keep only recognized keys (default if none valid).
        var keys = (request.Keys ?? [])
            .Where(k => DuplicateMatchKeys.Labels.ContainsKey(k)).Distinct().ToList();
        if (keys.Count == 0) keys = DuplicateMatchKeys.Default.ToList();

        // All non-deleted members, projected with the fields the dialog needs (shared projection).
        var members = await DuplicateMemberProjection.Project(context, context.Members.Where(m => !m.IsDeleted)).ToListAsync(ct);

        // The normalized value of one match key for a member; null/empty means the member can't be grouped on it.
        static string? KeyValue(DuplicateMemberDto m, string key) => key switch
        {
            DuplicateMatchKeys.LastName => Norm(m.LastName),
            DuplicateMatchKeys.FirstName => Norm(m.FirstName),
            DuplicateMatchKeys.Dob => m.DateOfBirth?.ToString("yyyy-MM-dd"),
            DuplicateMatchKeys.Gender => Norm(m.Gender),
            DuplicateMatchKeys.Nationality => Norm(m.Nationality),
            DuplicateMatchKeys.School => Norm(m.School),
            _ => null,
        };

        // Pairs a group manager marked "not duplicates" — used to split them back out of the detected groups below.
        var rejected = (await context.MemberDuplicateRejections.Select(r => new { r.MemberAId, r.MemberBId }).ToListAsync(ct))
            .Select(r => SiblingUtil.Pair(r.MemberAId, r.MemberBId)).ToHashSet();

        // Group by the tuple of the selected keys' values; a member is skipped if ANY selected key is empty.
        var groups = members
            .Select(m => (m, vals: keys.Select(k => KeyValue(m, k)).ToList()))
            .Where(x => x.vals.All(v => !string.IsNullOrWhiteSpace(v)))
            .GroupBy(x => string.Join("", x.vals), x => x.m)
            .Where(g => g.Count() >= 2 && g.Count() <= MaxGroupSize)
            // Within each same-key clique, drop the pairs the CG rejected ("not duplicates"); a member left with no
            // remaining duplicate splits off — a fully-rejected pair disappears, a partly-rejected trio keeps the rest.
            .SelectMany(g => SplitByRejections(g.ToList(), rejected))
            .Where(sub => sub.Count >= 2)
            .Select(sub =>
            {
                // Keeper suggestion order: active first, then most assignments, then oldest record — but the CG chooses.
                var ordered = sub.OrderByDescending(m => m.IsActiveMember)
                    .ThenByDescending(m => m.AssignmentCount)
                    .ThenBy(m => m.CreatedAt)
                    .ToList();
                var evidence = "Même " + string.Join(" + ", keys.Select(k => DuplicateMatchKeys.Labels[k]));
                return new DuplicateGroupDto(ordered, evidence);
            })
            .OrderBy(g => g.Members[0].LastName).ThenBy(g => g.Members[0].FirstName)
            .Take(MaxGroups)
            .ToList();

        return Result<IReadOnlyList<DuplicateGroupDto>>.Success(groups);
    }

    private static string? Norm(string? s) => string.IsNullOrWhiteSpace(s) ? null : TextNormalization.NormalizeKey(s);

    // Split a same-key clique into connected sub-groups after removing the "not duplicates" pairs. A clique with no
    // rejected pair returns unchanged (one group); otherwise union-find over the remaining (non-rejected) pairs, so a
    // rejected pair cleanly separates its members (a lone member then drops out via the >=2 filter upstream).
    private static IEnumerable<List<DuplicateMemberDto>> SplitByRejections(List<DuplicateMemberDto> clique, HashSet<(Guid, Guid)> rejected)
    {
        if (rejected.Count == 0) { yield return clique; yield break; }
        var ids = clique.Select(m => m.MemberId).ToList();

        // Fast path: no rejected pair among these members → the clique stands as one group.
        bool anyRejected = false;
        for (int i = 0; i < ids.Count && !anyRejected; i++)
            for (int j = i + 1; j < ids.Count; j++)
                if (rejected.Contains(SiblingUtil.Pair(ids[i], ids[j]))) { anyRejected = true; break; }
        if (!anyRejected) { yield return clique; yield break; }

        // Union-find over the NON-rejected pairs; members with no surviving pair end up as singletons (filtered out).
        var parent = ids.ToDictionary(id => id, id => id);
        Guid Find(Guid x) { while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
        void Union(Guid a, Guid b) { var ra = Find(a); var rb = Find(b); if (ra != rb) parent[ra] = rb; }
        for (int i = 0; i < ids.Count; i++)
            for (int j = i + 1; j < ids.Count; j++)
                if (!rejected.Contains(SiblingUtil.Pair(ids[i], ids[j]))) Union(ids[i], ids[j]);

        foreach (var comp in clique.GroupBy(m => Find(m.MemberId)))
            yield return comp.ToList();
    }
}

// Merge the losers into the keeper with the chosen field values. Group manager only. Delegates the data moves +
// soft-delete to IMemberMergeService (transactional). Audited.
public record MergeMembersCommand(Guid KeeperId, IReadOnlyList<Guid> LoserIds, MemberMergeFields Fields) : IRequest<Result<int>>;

// The chosen field values are written verbatim onto the surviving member, so they must be sanitized like a normal
// member edit (length caps + NoHtml + real email) — otherwise a group manager could store unbounded / angle-bracket
// text (names, medical notes, notes) on the keeper, later shown in the UI / PDF / exports.
public class MergeMembersCommandValidator : AbstractValidator<MergeMembersCommand>
{
    public MergeMembersCommandValidator()
    {
        RuleFor(x => x.LoserIds).NotNull().Must(l => l.Count <= 20).WithMessage("Trop de doublons sélectionnés (max 20).");
        RuleFor(x => x.Fields).NotNull();
        When(x => x.Fields != null, () =>
        {
            RuleFor(x => x.Fields.FirstName).MaximumLength(100).NoHtml();
            RuleFor(x => x.Fields.LastName).MaximumLength(100).NoHtml();
            RuleFor(x => x.Fields.Gender).MaximumLength(20).NoHtml();
            RuleFor(x => x.Fields.ExternalCardNumber).MaximumLength(50).NoHtml();
            RuleFor(x => x.Fields.BloodType).MaximumLength(10).NoHtml();
            RuleFor(x => x.Fields.Nationality).MaximumLength(50).NoHtml();
            RuleFor(x => x.Fields.School).MaximumLength(100).NoHtml();
            RuleFor(x => x.Fields.Classe).MaximumLength(50).NoHtml();
            RuleFor(x => x.Fields.Section).MaximumLength(20).NoHtml();
            RuleFor(x => x.Fields.ProfessionDomain).MaximumLength(100).NoHtml();
            RuleFor(x => x.Fields.Profession).MaximumLength(150).NoHtml();
            RuleFor(x => x.Fields.MedicalNotes).MaximumLength(2000).NoHtml();
            RuleFor(x => x.Fields.Allergies).MaximumLength(2000).NoHtml();
            RuleFor(x => x.Fields.Notes).MaximumLength(2000).NoHtml();
            RuleFor(x => x.Fields.PrimaryContactEmail).MaximumLength(254).RealEmail();
            RuleFor(x => x.Fields.PhotoPath).MaximumLength(500).NoHtml();
            // Login username (User.Email) — only validated when the CG chose to change it.
            RuleFor(x => x.Fields.Username).MaximumLength(254)
                .Matches(@"^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$")
                .When(x => !string.IsNullOrWhiteSpace(x.Fields.Username))
                .WithMessage("L'identifiant doit être au format prenom.nom@scouts.gndj (sans espaces).");
        });
    }
}

public class MergeMembersCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IMemberMergeService mergeService, IAuditService audit)
    : IRequestHandler<MergeMembersCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(MergeMembersCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<int>.Failure("Accès non autorisé.");

        var losers = request.LoserIds.Where(id => id != request.KeeperId).Distinct().ToList();
        if (losers.Count == 0) return Result<int>.Failure("Sélectionnez au moins un doublon à fusionner.");

        // Keeper + all losers must exist and not be already deleted.
        var ids = losers.Append(request.KeeperId).ToList();
        var found = await context.Members.Where(m => ids.Contains(m.Id) && !m.IsDeleted).Select(m => m.Id).ToListAsync(ct);
        if (!found.Contains(request.KeeperId)) return Result<int>.Failure("Le membre à conserver est introuvable.");
        var missing = losers.Where(l => !found.Contains(l)).ToList();
        if (missing.Count > 0) return Result<int>.Failure("Un ou plusieurs doublons sont introuvables.");

        // If the CG chose a login username, make sure no OTHER account (not the keeper's or a loser's — those are
        // handled by the merge) already uses it. Losers' logins are freed during the merge, so they don't conflict.
        var username = request.Fields.Username?.Trim();
        if (!string.IsNullOrWhiteSpace(username))
        {
            var lower = username.ToLower();
            var taken = await context.Users.AnyAsync(u => !u.IsDeleted && u.Email.ToLower() == lower
                && u.MemberId != request.KeeperId && !losers.Contains(u.MemberId), ct);
            if (taken) return Result<int>.Failure("Cet identifiant est déjà utilisé par un autre compte.");
        }

        await mergeService.MergeAsync(request.KeeperId, losers, request.Fields, ct);

        // Names resolve even for the now soft-deleted losers (AuditNames ignores the soft-delete filter).
        await audit.LogAsync("MergeMembers", "Member", request.KeeperId,
            newValues: new
            {
                Keeper = await AuditNames.MemberAsync(context, request.KeeperId, ct),
                Merged = await AuditNames.MembersAsync(context, losers, ct),
            }, cancellationToken: ct);
        return Result<int>.Success(losers.Count);
    }
}

// ── "Ce ne sont pas des doublons": tombstone each pair so duplicate detection never re-flags this group ──
// Mirrors RejectSiblingSuggestionCommand (the "not siblings" tombstone) but for the Doublons tab. Group manager only.
public record RejectDuplicateMembersCommand(IReadOnlyList<Guid> MemberIds) : IRequest<Result<bool>>;

public class RejectDuplicateMembersCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<RejectDuplicateMembersCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(RejectDuplicateMembersCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<bool>.Failure("Accès non autorisé.");

        var ids = request.MemberIds.Distinct().ToList();
        if (ids.Count < 2) return Result<bool>.Failure("Sélectionnez au moins deux membres.");

        // Ids stored normalized (A < B), one tombstone per pair; skip any that already exist.
        var existing = (await context.MemberDuplicateRejections.Select(r => new { r.MemberAId, r.MemberBId }).ToListAsync(ct))
            .Select(x => SiblingUtil.Pair(x.MemberAId, x.MemberBId)).ToHashSet();

        for (int i = 0; i < ids.Count; i++)
            for (int j = i + 1; j < ids.Count; j++)
            {
                var (a, b) = SiblingUtil.Pair(ids[i], ids[j]);
                if (existing.Add((a, b)))
                    context.MemberDuplicateRejections.Add(new MemberDuplicateRejection { MemberAId = a, MemberBId = b });
            }

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("RejectDuplicateMembers", "MemberDuplicateRejection", null,
            newValues: new { Members = await AuditNames.MembersAsync(context, ids, ct) }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
