namespace GNDJ.Application.Common.Interfaces;

// Coarse notification categories — drive the icon/colour on the frontend. Keep in sync with the client
// mapping in notification-service.ts.
public static class NotificationTypes
{
    public const string Document = "document";
    public const string ChangeRequest = "change_request";
    public const string Demande = "demande";
    public const string Hold = "hold";
    public const string Info = "info";
}

// Best-effort in-app notifications. Implementations MUST never throw — a notification failure must not mask
// or roll back the action that triggered it (it runs after the triggering state change is committed). The
// recipient is always a Member (a login is 1:1 with a member); a member without a login still gets a row
// (harmless — only a logged-in member ever reads their own list).
public interface INotificationService
{
    // One recipient member.
    Task NotifyMemberAsync(Guid memberId, string type, string title, string? body = null, string? link = null, CancellationToken ct = default);

    // Several recipient members (deduped).
    Task NotifyMembersAsync(IEnumerable<Guid> memberIds, string type, string title, string? body = null, string? link = null, CancellationToken ct = default);

    // Group managers = super-admins + active group-level (Chef de Groupe / ACG) role holders.
    Task NotifyGroupManagersAsync(string type, string title, string? body = null, string? link = null, CancellationToken ct = default);

    // The member's unit leaders (holders of members.edit active in the member's units) + group managers,
    // EXCLUDING the member themselves.
    Task NotifyMemberLeadersAsync(Guid memberId, string type, string title, string? body = null, string? link = null, CancellationToken ct = default);
}
