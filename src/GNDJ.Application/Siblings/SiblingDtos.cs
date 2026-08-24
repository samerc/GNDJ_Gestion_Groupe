using GNDJ.Application.Common;

namespace GNDJ.Application.Siblings;

// ── DTOs shared by the sibling (fratrie) suggestion, review and reconcile flows ──

// A member as shown in a suggested family / a confirmed group (lean).
public record SiblingCandidateMemberDto(Guid MemberId, string FirstName, string LastName, DateOnly? DateOfBirth,
    string? PhotoPath, string? UnitName, Guid? SiblingGroupId);

// A suggested family: the members the matching engine clustered together + WHY (evidence) + a confidence tag.
public record SiblingSuggestionDto(IReadOnlyList<SiblingCandidateMemberDto> Members,
    IReadOnlyList<string> Evidence, string Confidence /* "Élevée" | "Moyenne" */);

// A confirmed fratrie (for the "Fratries confirmées" tab).
public record SiblingGroupDto(Guid GroupId, IReadOnlyList<SiblingCandidateMemberDto> Members);

// Sibling shown on a member's fiche (confirmed group members other than the member).
public record MemberSiblingDto(Guid MemberId, string FirstName, string LastName, string? PhotoPath,
    string? UnitName, DateOnly? DateOfBirth);

// ── Reconcile dialog data (loaded when the CG opens "Réviser" to approve a family) ──
public record SiblingGuardianDto(Guid GuardianId, string FirstName, string LastName, string Role /* pere|mere|autre */,
    IReadOnlyList<string> Phones, IReadOnlyList<string> Emails, IReadOnlyList<Guid> LinkedMemberIds);

public record SiblingAddressDto(Guid AddressId, Guid MemberId, string Country, string City, string? Details, bool IsPrimary);

public record SiblingReconcileMemberDto(Guid MemberId, string FirstName, string LastName, DateOnly? DateOfBirth,
    string? UnitName, Guid? SiblingGroupId);

// The full picture the CG reconciles: members + the union of their parents (by role) + their addresses. The CG
// picks one canonical father / mother / address; approve then dedupes the rest onto those.
public record SiblingReconcileDto(
    IReadOnlyList<SiblingReconcileMemberDto> Members,
    IReadOnlyList<SiblingGuardianDto> Fathers,
    IReadOnlyList<SiblingGuardianDto> Mothers,
    IReadOnlyList<SiblingGuardianDto> OtherGuardians,
    IReadOnlyList<SiblingAddressDto> Addresses);

// Small shared helpers for the sibling matching + reconcile logic.
internal static class SiblingUtil
{
    // Normalize a guardian-link relationship to a coarse role so "Père"/"pere"/… collapse.
    public static string NormRole(string? rel)
    {
        var k = TextNormalization.NormalizeKey(rel ?? "");
        if (k.Contains("pere")) return "pere";
        if (k.Contains("mere")) return "mere";
        return "autre";
    }

    // Digits-only form of a phone number (drops spaces/dashes/+/country-code punctuation) for matching + dedup.
    public static string Digits(string? s) => new(( s ?? "").Where(char.IsDigit).ToArray());

    public static string NormEmail(string? e) => (e ?? "").Trim().ToLowerInvariant();

    // Order a member pair canonically (A <= B) so a rejection tombstone / edge is direction-independent.
    public static (Guid A, Guid B) Pair(Guid a, Guid b) => a.CompareTo(b) <= 0 ? (a, b) : (b, a);
}
