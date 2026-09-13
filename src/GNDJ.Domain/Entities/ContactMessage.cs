using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A message submitted through the public contact form. Persisted so managers can VIEW + REPLY to messages
// from an in-app inbox (previously the message only went out as an email whose "reply-to" was buried in the
// body). The sender's details are captured at submission; a reply is queued to that email and stamped here.
public class ContactMessage : BaseEntity
{
    public string SenderName { get; set; } = string.Empty;
    public string SenderEmail { get; set; } = string.Empty; // the address to reply to
    public string Subject { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;

    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }

    // Reply tracking — set when a manager answers from the inbox (a "Re:" email is queued to SenderEmail).
    public DateTime? RepliedAt { get; set; }
    public string? ReplySubject { get; set; }
    public string? ReplyBody { get; set; }
    public Guid? RepliedByUserId { get; set; }
}
