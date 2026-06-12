using ClosedXML.Excel;

var dir = @"c:\Users\Administrator\Documents\coding\GNDJ_Gestion_Groupe\reinscriptions";
using var wb = new XLWorkbook(System.IO.Path.Combine(dir, "UniteFonc.xlsx"));
var ws = wb.Worksheet(1);
int last = ws.LastRowUsed()!.RowNumber();

// EnCours distribution overall
var enCoursCounts = new Dictionary<string, int>();
// For Clan (UNITE = 'C'): EnCours by start year
var clanByYear = new Dictionary<string, (int active, int inactive)>();
int totalActive = 0, totalInactive = 0;

for (int r = 2; r <= last; r++)
{
    var unit = ws.Cell(r, 5).GetString().Trim();
    var dateDeb = ws.Cell(r, 9).GetString().Trim();
    var enCours = ws.Cell(r, 13).GetString().Trim();
    enCoursCounts[enCours] = enCoursCounts.GetValueOrDefault(enCours) + 1;
    if (enCours == "1") totalActive++; else totalInactive++;

    if (unit == "C")
    {
        var year = dateDeb.Length >= 4 ? (dateDeb.Contains('/') ? dateDeb.Split('/').Last() : dateDeb[..4]) : "?";
        var cur = clanByYear.GetValueOrDefault(year);
        if (enCours == "1") cur.active++; else cur.inactive++;
        clanByYear[year] = cur;
    }
}

Console.WriteLine($"Total UniteFonc rows: {last - 1}");
Console.WriteLine("EnCours values: " + string.Join(", ", enCoursCounts.Select(kv => $"'{kv.Key}'={kv.Value}")));
Console.WriteLine($"Active (EnCours=1): {totalActive}   Inactive: {totalInactive}");
Console.WriteLine("\nClan (UNITE='C') by start year — active(EnCours=1)/inactive:");
foreach (var kv in clanByYear.OrderBy(k => k.Key))
    Console.WriteLine($"  {kv.Key}: active={kv.Value.active} inactive={kv.Value.inactive}");
