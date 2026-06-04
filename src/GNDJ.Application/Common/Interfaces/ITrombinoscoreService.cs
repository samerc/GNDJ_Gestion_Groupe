namespace GNDJ.Application.Common.Interfaces;

public record TrombinoscoreData(
    string UnitName,
    string SchoolYear,
    bool IncludePhotos,
    IReadOnlyList<TrombinoscoreTeam> Teams
);

public record TrombinoscoreTeam(string TeamName, IReadOnlyList<TrombinoscoreMember> Members);
public record TrombinoscoreMember(string Name, string? CardNumber, string? PhotoPath);

public interface ITrombinoscoreService
{
    byte[] Generate(TrombinoscoreData data);
}
