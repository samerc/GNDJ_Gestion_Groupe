namespace GNDJ.Application.Common;

// Father / mother detection on a free-text relationship (« Père », « Pere », « MÈRE »…). EXACT match after
// normalisation (accents, case, spaces), so « Grand-père » or « Beau-père » are never taken for the father.
public static class ParentRoles
{
    public const string Father = "pere";
    public const string Mother = "mere";

    // "pere" / "mere", or null for any other relationship.
    public static string? Of(string? relationship) =>
        TextNormalization.NormalizeKey(relationship ?? "") is var k && (k == Father || k == Mother) ? k : null;

    public static bool IsFather(string? relationship) => Of(relationship) == Father;
    public static bool IsMother(string? relationship) => Of(relationship) == Mother;
}
