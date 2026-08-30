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

public record GetDuplicateMemberSuggestionsQuery : IRequest<Result<IReadOnlyList<DuplicateGroupDto>>>;

public class GetDuplicateMemberSuggestionsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetDuplicateMemberSuggestionsQuery, Result<IReadOnlyList<DuplicateGroupDto>>>
{
    private const int MaxGroups = 200;

    public async ValueTask<Result<IReadOnlyList<DuplicateGroupDto>>> Handle(GetDuplicateMemberSuggestionsQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<IReadOnlyList<DuplicateGroupDto>>.Failure("Accès non autorisé.");

        // Only members WITH a date of birth (the confirming signal). Projected with the fields the dialog needs.
        var members = await context.Members
            .Where(m => !m.IsDeleted && m.DateOfBirth != null)
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

        // Group by (normalized first name, normalized last name, DOB) — accent/case-insensitive.
        var groups = members
            .GroupBy(m => (TextNormalization.NormalizeKey(m.FirstName), TextNormalization.NormalizeKey(m.LastName), m.DateOfBirth))
            .Where(g => g.Count() >= 2)
            .Select(g =>
            {
                // Keeper suggestion order: active first, then most assignments, then oldest record — but the CG chooses.
                var ordered = g.OrderByDescending(m => m.IsActiveMember)
                    .ThenByDescending(m => m.AssignmentCount)
                    .ThenBy(m => m.CreatedAt)
                    .ToList();
                var dob = g.Key.Item3;
                return new DuplicateGroupDto(ordered,
                    $"Même nom + date de naissance ({(dob.HasValue ? dob.Value.ToString("dd/MM/yyyy") : "?")})");
            })
            .OrderBy(g => g.Members[0].LastName).ThenBy(g => g.Members[0].FirstName)
            .Take(MaxGroups)
            .ToList();

        return Result<IReadOnlyList<DuplicateGroupDto>>.Success(groups);
    }
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
