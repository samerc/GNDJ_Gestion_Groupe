namespace GNDJ.Application.Common.Interfaces;

// Camp BP « Liste de présence »: Excel workbook with one sheet per unit (Prénom / Nom / Présence / Cotisation).
// Presence is pre-filled only for members marked "ne vient pas" (Absent / Absente); the rest is filled on paper.
public interface ICampPresenceSheet
{
    byte[] Build(IReadOnlyList<CampPresenceUnit> units);
}

public record CampPresenceUnit(string Code, string Name, IReadOnlyList<CampPresenceRow> Rows);
public record CampPresenceRow(string FirstName, string LastName, string? Presence);
