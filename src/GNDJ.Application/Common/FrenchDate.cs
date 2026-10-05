namespace GNDJ.Application.Common;

// French day and month names without relying on the server's culture data ("samedi 14 novembre").
public static class FrenchDate
{
    private static readonly string[] Days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    private static readonly string[] Months =
        ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

    public static string DayMonth(DateOnly d) => $"{Days[(int)d.DayOfWeek]} {d.Day} {Months[d.Month - 1]}";
}
