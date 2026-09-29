namespace GNDJ.Domain.Entities;

// "C'est voulu" on the Qualité des données page: the CG confirms that a flagged case is intended (e.g. a chef de
// groupe who is also chef d'unité elsewhere holds two posts on purpose). The case is hidden while its Signature still
// matches — for posts, the sorted ids of the member's active posts — so it comes back if those posts change.
// Plain table (one row per check + member); "Annuler" deletes it.
public class DataQualityAck
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public string CheckKey { get; set; } = string.Empty;
    public Guid MemberId { get; set; }
    public string Signature { get; set; } = string.Empty;
    public DateTime AckAt { get; set; } = DateTime.UtcNow;
    public Guid? AckByUserId { get; set; }
    public string? AckByName { get; set; }
}
