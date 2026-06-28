namespace GNDJ.Domain.Enums;

// Review state of a MemberDocument (stored as a string, not a C# enum).
public static class DocumentStatus
{
    public const string Pending = "Pending";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
}
