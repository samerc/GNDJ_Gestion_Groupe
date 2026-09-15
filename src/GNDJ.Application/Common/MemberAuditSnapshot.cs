using GNDJ.Domain.Entities;

namespace GNDJ.Application.Common;

// Snapshot + diff of a member's editable profile fields for the audit log, so an "Update Member" entry records
// exactly WHAT changed (before → after) instead of a fixed subset of fields. Keys line up with the frontend
// FIELD_LABELS so the audit detail dialog shows friendly French labels. Shared by the leader edit (UpdateMember)
// and the self-service edit (UpdateMyProfile).
public static class MemberAuditSnapshot
{
    public static Dictionary<string, object?> Capture(Member m) => new()
    {
        ["FirstName"] = m.FirstName,
        ["LastName"] = m.LastName,
        ["DateOfBirth"] = m.DateOfBirth?.ToString("yyyy-MM-dd"),
        ["Gender"] = m.Gender,
        ["CardNumber"] = m.CardNumber,
        ["ExternalCardNumber"] = m.ExternalCardNumber,
        ["BloodType"] = m.BloodType,
        ["Nationality"] = m.Nationality,
        ["School"] = m.School,
        ["Classe"] = m.Classe,
        ["Section"] = m.Section,
        ["ProfessionDomain"] = m.ProfessionDomain,
        ["Profession"] = m.Profession,
        ["MedicalNotes"] = m.MedicalNotes,
        ["Allergies"] = m.Allergies,
        ["Notes"] = m.Notes,
        ["ParentsSituation"] = m.ParentsSituation,
    };

    // Returns only the fields that actually changed, as parallel old/new dictionaries (empty when nothing changed).
    public static (Dictionary<string, object?> Old, Dictionary<string, object?> New) Diff(
        Dictionary<string, object?> before, Dictionary<string, object?> after)
    {
        var oldValues = new Dictionary<string, object?>();
        var newValues = new Dictionary<string, object?>();
        foreach (var key in before.Keys)
            if (!Equals(before[key], after.GetValueOrDefault(key)))
            {
                oldValues[key] = before[key];
                newValues[key] = after.GetValueOrDefault(key);
            }
        return (oldValues, newValues);
    }
}
