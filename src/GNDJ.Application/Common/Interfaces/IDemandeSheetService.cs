namespace GNDJ.Application.Common.Interfaces;

// Excel round-trip of CG decisions: export the submitted demandes to an .xlsx the Maîtrise fills in with a
// SINGLE "Décision" column, then import the file to stage those decisions. In that column the CG types a CODE:
// a unit code (C2, M2, …) to ACCEPT into that unit, a rejection-reason code (or "--" for the default reason) to
// DECLINE. Names only — no contact details. The Réf. (demande id) column is the matching key. A "Codes"
// reference sheet lists every valid code + its meaning and drives an in-cell dropdown. Implemented via ClosedXML.

// One export row = one submitted demande — the FULL file so the Maîtrise can review everything in Excel (child
// identity + school + medical + contacts + household + detailed parents/proches/fratrie) PLUS the current staged
// status and the PREFILL for the single Décision cell (the unit CODE when already staged-approved, the reason
// code / "--" when staged-declined, else ""). Parents/ScoutRelations/Siblings are pre-formatted multi-line strings.
public record DemandeExportRow(
    Guid Id, string SerialNumber, string PrefillDecision, string CurrentStatus,
    string FirstName, string LastName, string? DateOfBirth, int? Age, string? Gender, string? Nationality,
    string? Classe, string? Section, string? School, string? BloodType, string? Allergies, string? MedicalNotes,
    string? Phone, string? Email,
    string? AddressCountry, string? AddressCity, string? AddressDetails, string? ParentsSituation,
    string Parents, string ScoutRelations, string Siblings,
    string? PreviousDemande, string? ParentNotes, string? SubmittedAt);

// One parsed decision row from an uploaded file (RowNumber for error messages; Id from the Réf. column; the
// single Décision cell = a unit code, a reason code, or "--").
public record DemandeDecisionRow(int RowNumber, Guid? Id, string? Decision);

// Thrown by Parse when the uploaded file is missing a REQUIRED column (Réf. or Décision) — e.g. the CG renamed
// or deleted its header. Carries a user-facing French message the import handler surfaces as-is, so the failure
// is loud and specific instead of silently importing nothing.
public class DemandeSheetFormatException(string message) : Exception(message);

public interface IDemandeSheetService
{
    // Builds the .xlsx: header + one row per demande + a "Codes" reference sheet (unit codes + reason codes)
    // that drives the Décision dropdown. units = (code, name); reasons = (code, label); the default reason (if
    // any) is offered as the special code "--".
    byte[] Export(string title, IReadOnlyList<DemandeExportRow> rows,
        IReadOnlyList<(string Code, string Name)> units,
        IReadOnlyList<(string Code, string Label)> reasons,
        string? defaultReasonLabel);

    // Reads back a filled file into decision rows (by header name, so inserted columns don't break it).
    IReadOnlyList<DemandeDecisionRow> Parse(byte[] file);
}
