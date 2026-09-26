namespace GNDJ.Application.Common.Interfaces;

// One newly accepted member, as listed in the Excel emailed to their unit's chef(s) d'unité after
// "Envoyer les réponses". Parents: names only (no phone / email). SiblingsInUnit: brothers/sisters who are
// (or are becoming) members of the SAME unit — empty otherwise (other proches are not mentioned).
public record NewMemberSheetRow(
    string LastName, string FirstName, DateOnly? DateOfBirth, string? Gender, string? Classe, string? School,
    string? CardNumber, string? Father, string? Mother, string? OtherGuardians, string? SiblingsInUnit);

// Builds that Excel and saves it under the server's archive folder (not web-served), returning the ABSOLUTE
// path — the email sender only attaches per-send files that sit under that folder.
public interface IUnitNewMembersSheet
{
    string Save(string unitName, string scoutYear, IReadOnlyList<NewMemberSheetRow> rows);
}
