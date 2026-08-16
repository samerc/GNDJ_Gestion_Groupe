namespace GNDJ.Application.Common.Interfaces;

// Excel round-trip of CG decisions: export the submitted demandes to an .xlsx the Maîtrise fills in
// (Décision / Unité / Motif columns), then import the file to stage those decisions. Names only — no contact
// details. The Réf. (demande id) column is the matching key. Implemented in Infrastructure via ClosedXML.

// One export row = one submitted demande (child + parents' names + current staged status).
public record DemandeExportRow(
    Guid Id, string FirstName, string LastName, string? DateOfBirth, string? Gender,
    string? Classe, string? School, string Parents, int Siblings, int ScoutRelations,
    string CurrentStatus, string? CurrentUnit);

// One parsed decision row from an uploaded file (RowNumber for error messages; Id from the Réf. column).
public record DemandeDecisionRow(int RowNumber, Guid? Id, string? Decision, string? Unit, string? Reason);

public interface IDemandeSheetService
{
    // Builds the .xlsx: header + one row per demande, a Décision dropdown, and a reference sheet of unit names.
    byte[] Export(string title, IReadOnlyList<DemandeExportRow> rows, IReadOnlyList<string> unitNames);

    // Reads back a filled file into decision rows (by header name, so inserted columns don't break it).
    IReadOnlyList<DemandeDecisionRow> Parse(byte[] file);
}
