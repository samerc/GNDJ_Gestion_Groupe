namespace GNDJ.Domain.Entities;

// A history record of ONE manual notification "broadcast" — a targeted send performed by an admin / Chef de
// Groupe from the "Envoyer une notification" page (NOT the app's automatic notifications). One row per send,
// so a manager can review what was sent, to whom, by whom and when. Like Notification, it is deliberately NOT
// a BaseEntity (lightweight plumbing, no soft-delete/audit) and its display fields are DENORMALIZED (baked at
// send time) so the history renders without depending on the sender/unit/group still existing.
public class NotificationBroadcast
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    // Who sent it. SentByMemberId is the acting member (nullable — defensive); SentByName is denormalized so the
    // list never needs a join and survives the member being renamed/removed.
    public Guid? SentByMemberId { get; set; }
    public string SentByName { get; set; } = string.Empty;

    public DateTime SentAt { get; set; } // real instant (UTC)

    public string Type { get; set; } = "message";     // coarse category baked into the recipients' notifications
    public string Title { get; set; } = string.Empty;
    public string? Body { get; set; }
    public string? Url { get; set; }                    // relative app route the notification opened

    public string AudienceLabel { get; set; } = string.Empty; // human description ("Unité : Meute 2 · 3 membres")
    public int RecipientCount { get; set; }             // distinct members the send reached
}
