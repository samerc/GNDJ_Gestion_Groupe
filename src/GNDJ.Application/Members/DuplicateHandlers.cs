using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

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
    string? Allergies, string? Notes, string? PrimaryContactEmail, string? PhotoPath,
    string? UnitName, bool HasAccount, bool IsActiveMember, int AssignmentCount, DateTime CreatedAt);

// A set of members that look like the same person.
public record DuplicateGroupDto(IReadOnlyList<DuplicateMemberDto> Members, string Evidence);

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

        // All non-deleted members, projected with the fields the dialog needs.
        var members = await context.Members
            .Where(m => !m.IsDeleted)
            .Select(m => new DuplicateMemberDto(
                m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.Gender,
                m.CardNumber, m.ExternalCardNumber, m.BloodType, m.Nationality, m.School,
                m.Classe, m.Section, m.ProfessionDomain, m.Profession, m.MedicalNotes,
                m.Allergies, m.Notes, m.PrimaryContactEmail, m.PhotoPath,
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(),
                context.Users.Any(u => u.MemberId == m.Id && !u.IsDeleted),
                m.Assignments.Any(a => a.EndDate == null),
                m.Assignments.Count(a => !a.IsDeleted),
                m.CreatedAt))
            .ToListAsync(ct);

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

        // Group by the tuple of the selected keys' values; a member is skipped if ANY selected key is empty.
        var groups = members
            .Select(m => (m, vals: keys.Select(k => KeyValue(m, k)).ToList()))
            .Where(x => x.vals.All(v => !string.IsNullOrWhiteSpace(v)))
            .GroupBy(x => string.Join("", x.vals), x => x.m)
            .Where(g => g.Count() >= 2 && g.Count() <= MaxGroupSize)
            .Select(g =>
            {
                // Keeper suggestion order: active first, then most assignments, then oldest record — but the CG chooses.
                var ordered = g.OrderByDescending(m => m.IsActiveMember)
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
}

// Merge the losers into the keeper with the chosen field values. Group manager only. Delegates the data moves +
// soft-delete to IMemberMergeService (transactional). Audited.
public record MergeMembersCommand(Guid KeeperId, IReadOnlyList<Guid> LoserIds, MemberMergeFields Fields) : IRequest<Result<int>>;

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

        await mergeService.MergeAsync(request.KeeperId, losers, request.Fields, ct);

        await audit.LogAsync("MergeMembers", "Member", request.KeeperId,
            newValues: new { request.KeeperId, LoserIds = losers }, cancellationToken: ct);
        return Result<int>.Success(losers.Count);
    }
}
