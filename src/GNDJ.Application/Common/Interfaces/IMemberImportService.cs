namespace GNDJ.Application.Common.Interfaces;

// Parsed spreadsheet: the header row + the data rows (each a list of cell strings, aligned to Headers by index).
public record MemberImportFile(IReadOnlyList<string> Headers, IReadOnlyList<IReadOnlyList<string>> Rows);

// Reads an uploaded member-import file (.xlsx via ClosedXML, or .csv) and builds the blank template. Kept in
// Infrastructure so the ClosedXML dependency stays out of the Application layer.
public interface IMemberImportService
{
    // Parse the uploaded bytes into headers + rows. Throws on an unreadable file (caller maps to a friendly error).
    MemberImportFile Parse(byte[] file, string fileName);

    // A blank .xlsx template: the expected header row + one example row, for the user to fill in.
    byte[] BuildTemplate();
}
