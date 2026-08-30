namespace GNDJ.Application.Common.Interfaces;

// Merges duplicate MEMBER records: moves every loser's connected data (assignments, contacts, documents,
// cotisations, progressions, guardian links, passages, camp entries, absences, change requests, api keys, …)
// onto the KEEPER, applies the CG-chosen field values to the keeper, then soft-deletes each loser and disables
// its login. Raw-SQL data moves live in Infrastructure (mirrors MemberPurgeService). Reversible: losers are
// soft-deleted (restorable from the Corbeille until the purge job runs), not hard-deleted.
public interface IMemberMergeService
{
    Task MergeAsync(Guid keeperId, IReadOnlyList<Guid> loserIds, MemberMergeFields fields, CancellationToken ct = default);
}

// The final scalar field values to set on the surviving (keeper) member — the CG picks, per field, which
// duplicate's value wins. The internal matricule (CardNumber) is deliberately NOT here: the keeper always keeps
// its own (it's an internal id); only the official ExternalCardNumber can be carried over.
public record MemberMergeFields(
    string? FirstName, string? LastName, DateOnly? DateOfBirth, string? Gender,
    string? ExternalCardNumber, string? BloodType, string? Nationality, string? School, string? Classe,
    string? Section, string? ProfessionDomain, string? Profession, string? MedicalNotes, string? Allergies,
    string? Notes, string? PrimaryContactEmail, string? PhotoPath);
