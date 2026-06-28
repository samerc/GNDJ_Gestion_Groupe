namespace GNDJ.Application.Common.Interfaces;

public record TrombinoscoreData(
    string UnitName,
    string ScoutYear,
    bool IncludePhotos,
    IReadOnlyList<TrombinoscoreTeam> Teams
);

public record TrombinoscoreTeam(string TeamName, IReadOnlyList<TrombinoscoreMember> Members);
public record TrombinoscoreMember(string Name, string? CardNumber, string? PhotoPath);

// Renders a trombinoscope (photo directory) PDF — member photo grid grouped by team, A4/A3 auto-sized.
public interface ITrombinoscoreService
{
    byte[] Generate(TrombinoscoreData data);
}
