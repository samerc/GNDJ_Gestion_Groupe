namespace GNDJ.Application.Common.Interfaces;

// One receiving unit in the passage Word export: "Passe à la <unité> :" then one name per line.
public record PassageNewcomersSection(string Heading, IReadOnlyList<string> Names);

// Builds the Word (.docx) list of a posted passage's newcomers for ONE association (the CG sends one document
// per association).
public interface IPassageNewcomersDocument
{
    byte[] Build(string title, string subtitle, IReadOnlyList<PassageNewcomersSection> sections);
}
