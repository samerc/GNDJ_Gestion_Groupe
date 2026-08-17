namespace GNDJ.Application.Common.Interfaces;

// Excel round-trip of CG decisions: export the submitted demandes to an .xlsx the Maîtrise fills in with a
// SINGLE "Décision" column, then import the file to stage those decisions. In that column the CG types a CODE:
// a unit code (C2, M2, …) to ACCEPT into that unit, a rejection-reason code (or "--" for the default reason) to
// DECLINE. Names only — no contact details. The Réf. (demande id) column is the matching key. A "Codes"
// reference sheet lists every valid code + its meaning and drives an in-cell dropdown. Implemented via ClosedXML.

// One export row = one submitted demande (child + parents' names + current staged status + the PREFILL for the
// Décision cell: the unit CODE when already staged-approved, the reason code / "--" when staged-declined, else "").
public record DemandeExportRow(
    Guid Id, string FirstName, string LastName, string? DateOfBirth, string? Gender,
    string? Classe, string? School, string Parents, int Siblings, int ScoutRelations,
    string CurrentStatus, string PrefillDecision);

// One parsed decision row from an uploaded file (RowNumber for error messages; Id from the Réf. column; the
// single Décision cell = a unit code, a reason code, or "--").
public record DemandeDecisionRow(int RowNumber, Guid? Id, string? Decision);

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
