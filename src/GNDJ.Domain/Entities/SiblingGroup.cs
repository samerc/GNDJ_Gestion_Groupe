using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A confirmed fratrie — a set of members who are brothers/sisters. Created when a Chef de Groupe approves a
// suggested (or manually linked) family. A member belongs to at most ONE group (Member.SiblingGroupId), so
// "who are X's siblings" is authoritative (the group), not guessed live from shared guardians. Approving a
// group also RECONCILES the family data (dedupes the parents, shares one home address + parent contacts), which
// is why this doubles as the fix for the import's duplicate/inconsistent parent records.
public class SiblingGroup : BaseEntity
{
    public string? Notes { get; set; }

    public ICollection<Member> Members { get; set; } = [];
}

// Tombstone: records that two members were reviewed and are NOT siblings, so the suggestion engine never
// re-proposes that pair. Stored with the ids normalized (MemberAId < MemberBId) + a unique index. A CG
// "reject" on a suggested family writes one tombstone per pair; manually linking a pair removes any tombstone.
public class SiblingRejection : BaseEntity
{
    public Guid MemberAId { get; set; }
    public Guid MemberBId { get; set; }
}
