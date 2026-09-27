namespace GNDJ.Domain.Entities;

// One reply sent from the contact inbox. A message can be answered several times (two managers, or a
// follow-up), so every reply is kept here instead of overwriting the previous one. Plain table (no
// soft-delete/audit): rows are deleted only with their message. Replier name and the address it was sent to
// are denormalized so the history still reads correctly if the account or the sender's fiche changes later.
public class ContactMessageReply
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid ContactMessageId { get; set; }
    public ContactMessage ContactMessage { get; set; } = null!;

    public string Subject { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public string SentTo { get; set; } = string.Empty;

    public Guid? RepliedByUserId { get; set; }
    public string? RepliedByName { get; set; }
    public DateTime CreatedAt { get; set; }
}
