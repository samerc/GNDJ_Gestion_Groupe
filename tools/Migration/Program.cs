using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using Npgsql;
using NpgsqlTypes;

// ─── Configuration ─────────────────────────────────────────────
var connStr = args.FirstOrDefault(a => a.StartsWith("--conn="))?.Substring(7)
              ?? "Host=localhost;Port=5432;Database=gndj;Username=gndj_admin;Password=GndjDev2026!";
var dataDir = args.FirstOrDefault(a => a.StartsWith("--data="))?.Substring(7)
              ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "reinscriptions"));
var tempPassword = BCrypt.Net.BCrypt.HashPassword("Gndj2026!", workFactor: 12);
var scoutYear = "2025-2026";
var now = DateTime.UtcNow;

// ─── BP 2026 reconciliation options ─────────────────────────────
// --members-only: reuse the existing org (associations/types/units/teams/roles/stages/badges by
//   looking them up from the DB) and only (re)import members + dependents. Org customisations
//   (function ranks/defaults/archive) are preserved.
// The authoritative 2025-2026 unit rosters ("BP 2026") override each member's CURRENT open
// assignment so placement reflects the (never-recorded) 2025-2026 passage.
bool reuseOrg = args.Contains("--members-only");
var bpDir = args.FirstOrDefault(a => a.StartsWith("--bp="))?.Substring(5)
            ?? @"C:\Users\Administrator\Desktop\BP 2026";
var passageDate = new DateOnly(2025, 10, 1); // 2025-2026 scout-year start (Oct 1)

Console.WriteLine($"Data directory: {dataDir}");
Console.WriteLine($"Files found: {Directory.GetFiles(dataDir, "*.xlsx").Length}");

// ─── Helpers ───────────────────────────────────────────────────
Guid NewId() => Guid.CreateVersion7();
string Cell(IXLWorksheet ws, int row, int col) => ws.Cell(row, col).GetString().Trim();
DateOnly? ParseDate(string s)
{
    if (string.IsNullOrWhiteSpace(s)) return null;
    s = s.Trim();
    // EtatService uses yyyymmdd; WEBDEV elsewhere uses dd/mm/yyyy. Parse explicitly (culture-invariant)
    // so dd/mm isn't misread as mm/dd.
    if (s.Length == 8 && s.All(char.IsDigit)
        && DateOnly.TryParseExact(s, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d8)) return d8;
    foreach (var fmt in new[] { "dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "yyyy-MM-dd" })
        if (DateOnly.TryParseExact(s, fmt, CultureInfo.InvariantCulture, DateTimeStyles.None, out var df)) return df;
    if (DateTime.TryParse(s, out var dt)) return DateOnly.FromDateTime(dt);
    return null;
}

string ExpandNationality(string code) => code.ToUpper() switch
{
    "LB" => "Libanaise", "FR" => "Française", "US" => "Américaine", "CA" => "Canadienne",
    "AU" => "Australienne", "GB" => "Britannique", "DE" => "Allemande", "IT" => "Italienne",
    "ES" => "Espagnole", "BR" => "Brésilienne", "SY" => "Syrienne", "JO" => "Jordanienne",
    "EG" => "Égyptienne", "IQ" => "Irakienne", "SA" => "Saoudienne", "AE" => "Émiratie",
    "KW" => "Koweïtienne", "PS" => "Palestinienne", "AR" => "Argentine",
    _ => code
};

string MapSchool(string code, string other) => code.ToUpper() switch
{
    "CNDJ" => "Collège Notre-Dame de Jamhour",
    "CSG" => "Collège Saint-Grégoire",
    "" when !string.IsNullOrWhiteSpace(other) => other,
    "" => "",
    _ => string.IsNullOrWhiteSpace(other) ? code : other
};

IXLWorksheet OpenSheet(string filename)
{
    var path = Path.Combine(dataDir, filename);
    if (!File.Exists(path))
    {
        // V2 data folder uses Export_*.xlsx names — map the canonical name to the export name.
        var v2 = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Membres.xlsx"] = "Export_membres.xlsx", ["UniteFonc.xlsx"] = "Export_UniteFonc.xlsx",
            ["EtatService.xlsx"] = "Export_EtatsService.xlsx", ["Login.xlsx"] = "Export_Login.xlsx",
            ["Telephones.xlsx"] = "Export_Telephones.xlsx", ["Emails.xlsx"] = "Export_Emails.xlsx",
            ["Adresses.xlsx"] = "Export_Adresses.xlsx", ["T_Badges.xlsx"] = "Export_T_Badges.xlsx",
        };
        if (v2.TryGetValue(filename, out var alt))
        {
            var p = Path.Combine(dataDir, alt);
            if (File.Exists(p)) path = p;
        }
    }
    // Copy to temp to avoid lock issues
    var temp = Path.Combine(Path.GetTempPath(), $"mig_{Path.GetFileName(path)}");
    File.Copy(path, temp, true);
    return new XLWorkbook(temp).Worksheet(1);
}

// ─── Tracking maps (old ID → new UUID) ────────────────────────
var memberIdMap = new Dictionary<int, Guid>();       // old IDMEMBRES → new UUID
var unitIdMap = new Dictionary<string, Guid>();       // old CODEUNITE → new UUID
var unitTypeIdMap = new Dictionary<string, Guid>();   // old TYPEUNITE code → new UUID
var assocIdMap = new Dictionary<string, Guid>();      // SDL/GDL → new UUID
var roleIdMap = new Dictionary<string, Guid>();       // old CODEFONCTION → new UUID
var teamIdMap = new Dictionary<string, Guid>();       // "UNITE|TOTEM" → new UUID (dedup guard)
var teamLookup = new Dictionary<string, Guid>();      // normalized "unit|name" (bare/full/display, ci) → team UUID
var stageIdMap = new Dictionary<string, Guid>();      // "TYPEUNITE|CODEETAT" → new UUID
var badgeIdMap = new Dictionary<string, Guid>();      // "TYPEUNITE|CODEBADGE" → new UUID
var guardianIdMap = new Dictionary<string, Guid>();   // "memberId|father/mother" → guardian UUID
var cotisationIdMap = new Dictionary<int, Guid>();    // old IDMEMBRES → cotisation UUID
// norm(last) → members, for matching BP rows that have no # (by first name, sex, father).
var memberByLast = new Dictionary<string, List<(Guid id, string? gender, string normFirst, string normFather)>>();

// Card number counters
int nextMaleCard = 1;
int nextFemaleCard = 1;

await using var conn = new NpgsqlConnection(connStr);
await conn.OpenAsync();

Console.WriteLine("Connected to database. Starting migration...\n");
if (reuseOrg)
{
    Console.Write("0. Loading existing org (members-only mode)... ");
    await LoadExistingOrg();
    Console.WriteLine($"OK (units:{unitIdMap.Count} roles:{roleIdMap.Count} teams:{teamIdMap.Count})");
}

// ═══════════════════════════════════════════════════════════════
// STEP 1: Associations
// ═══════════════════════════════════════════════════════════════
Console.Write("1. Associations... ");
var associations = new Dictionary<string, (Guid id, string name)>
{
    ["SDL"] = (NewId(), "Scouts Du Liban"),
    ["GDL"] = (NewId(), "Guides Du Liban"),
};
if (!reuseOrg) foreach (var (code, (id, name)) in associations)
{
    assocIdMap[code] = id;
    await Exec(conn, @"INSERT INTO associations (id, name, code, description, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $5, false) ON CONFLICT DO NOTHING",
        id, name, code, (string?)null, now);
}
Console.WriteLine("OK (2)");

// ═══════════════════════════════════════════════════════════════
// STEP 2: Unit Types
// ═══════════════════════════════════════════════════════════════
Console.Write("2. Unit Types... ");
var unitTypes = new Dictionary<string, string>
{
    ["MEU"] = "Meute", ["TRO"] = "Troupe", ["CLA"] = "Clan",
    ["RON"] = "Ronde", ["COM"] = "Compagnie", ["CAR"] = "Caravelles",
    ["JEM"] = "Jeunes en Marche", ["FEU"] = "Feu", ["GRP"] = "Groupe",
    ["PIO"] = "Pionnières", ["NOY"] = "Noyau",
};
// Number of years per branch — drives the Camp BP Note multiplier (Note = Force + years×Année + offset).
var unitTypeYears = new Dictionary<string, int>
{
    ["MEU"] = 3, ["RON"] = 3, ["COM"] = 4, ["TRO"] = 5,
    ["CLA"] = 3, ["JEM"] = 3, ["FEU"] = 3, ["CAR"] = 4, ["PIO"] = 3, ["NOY"] = 1, ["GRP"] = 1,
};
if (!reuseOrg) foreach (var (code, name) in unitTypes)
{
    var id = NewId();
    unitTypeIdMap[code] = id;
    await Exec(conn, @"INSERT INTO unit_types (id, name, code, description, number_of_years, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $6, false) ON CONFLICT DO NOTHING",
        id, name, code, (string?)null, unitTypeYears.GetValueOrDefault(code, 3), now);
}
Console.WriteLine($"OK ({unitTypes.Count})");

// ═══════════════════════════════════════════════════════════════
// STEP 3: Functional Roles
// ═══════════════════════════════════════════════════════════════
Console.Write("3. Functional Roles... ");
var wsRoles = OpenSheet("T_Fonc.xlsx");
int roleCount = 0;
// Get existing security profiles for linking
var leaderProfileId = await ScalarGuid(conn, "SELECT id FROM security_profiles WHERE code = 'chef-unite' AND is_deleted = false LIMIT 1");
var memberProfileId = await ScalarGuid(conn, "SELECT id FROM security_profiles WHERE code = 'read-only' AND is_deleted = false LIMIT 1");
var groupProfileId = await ScalarGuid(conn, "SELECT id FROM security_profiles WHERE code = 'chef-de-groupe' AND is_deleted = false LIMIT 1");
var assistantGroupProfileId = await ScalarGuid(conn, "SELECT id FROM security_profiles WHERE code = 'assistant-de-groupe' AND is_deleted = false LIMIT 1");

if (!reuseOrg) for (int r = 2; r <= wsRoles.LastRowUsed()!.RowNumber(); r++)
{
    var code = Cell(wsRoles, r, 3); // CODEFONCTION
    var name = Cell(wsRoles, r, 4); // NOMFONCTION
    var isMaitrise = Cell(wsRoles, r, 5) == "1";
    var utCode = Cell(wsRoles, r, 9); // TYPEUNITE

    if (string.IsNullOrWhiteSpace(code)) continue;
    if (roleIdMap.ContainsKey(code)) continue;

    var id = NewId();
    roleIdMap[code] = id;
    // Group staff (GRP unit type) → only the head CG gets the full chef-de-groupe profile; the rest
    // (ACG/AUG/SG/TG/INT/ANIM) get the assistant baseline (no maîtrise/access management). Other
    // maîtrise → unit leader; everyone else → read-only.
    var profileId = (utCode == "GRP" && isMaitrise)
        ? (code == "CG" ? groupProfileId
           : assistantGroupProfileId != Guid.Empty ? assistantGroupProfileId : groupProfileId)
        : isMaitrise ? leaderProfileId : memberProfileId;
    Guid? utId = unitTypeIdMap.GetValueOrDefault(utCode);

    await Exec(conn, @"INSERT INTO functional_roles (id, name, code, description, security_profile_id, unit_type_id, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7, false) ON CONFLICT DO NOTHING",
        id, name, code, (string?)null, profileId, utId == Guid.Empty ? null : utId, now);
    roleCount++;
}
Console.WriteLine($"OK ({roleCount})");

// ═══════════════════════════════════════════════════════════════
// STEP 4: Units
// ═══════════════════════════════════════════════════════════════
Console.Write("4. Units... ");
var wsUnits = OpenSheet("T_Unites.xlsx");
int unitCount = 0;
if (!reuseOrg) for (int r = 2; r <= wsUnits.LastRowUsed()!.RowNumber(); r++)
{
    var code = Cell(wsUnits, r, 2);  // CODEUNITE
    var name = Cell(wsUnits, r, 3);  // NOMUNITE
    var assocCode = Cell(wsUnits, r, 4); // ASSOC
    var utCode = Cell(wsUnits, r, 5);    // TYPEUNITE
    var visible = Cell(wsUnits, r, 11);  // UNITE_VISIBLE

    if (string.IsNullOrWhiteSpace(code)) continue;

    var id = NewId();
    var assocId = assocIdMap.GetValueOrDefault(assocCode);
    var utId = unitTypeIdMap.GetValueOrDefault(utCode);
    // Unit type is mandatory; association is optional (e.g. Maîtrise de Groupe "G" spans both
    // associations and has none — import it with a NULL association rather than dropping it).
    if (utId == Guid.Empty) continue;
    unitIdMap[code] = id;

    await Exec(conn, @"INSERT INTO units (id, name, code, description, association_id, unit_type_id, is_active, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, false)",
        id, name, code, (string?)null, assocId == Guid.Empty ? (object)DBNull.Value : assocId, utId, visible != "0", now);
    unitCount++;
}
Console.WriteLine($"OK ({unitCount})");

// ═══════════════════════════════════════════════════════════════
// STEP 5: Teams
// ═══════════════════════════════════════════════════════════════
Console.Write("5. Teams... ");
var wsTeams = OpenSheet("PatEqSiz.xlsx");
int teamCount = 0;
if (!reuseOrg) for (int r = 2; r <= wsTeams.LastRowUsed()!.RowNumber(); r++)
{
    var unitCode = Cell(wsTeams, r, 2); // UNITE
    var totem = Cell(wsTeams, r, 3);    // TOTEM
    var adjective = Cell(wsTeams, r, 4);
    // COULEUR1/COULEUR2 (cols 5/6) are WEBDEV palette INDICES (integers 0–16), not hex — the
    // app's color picker expects #RRGGBB. Without the original WEBDEV combo's index→colour legend
    // the indices are meaningless here, so colours are intentionally NOT imported (decided 2026-06-19).
    // Restore by mapping each index to a hex value once the legend is available.

    if (string.IsNullOrWhiteSpace(unitCode) || string.IsNullOrWhiteSpace(totem)) continue;
    var unitId = unitIdMap.GetValueOrDefault(unitCode);
    if (unitId == Guid.Empty) continue;

    var key = $"{unitCode}|{totem}";
    if (teamIdMap.ContainsKey(key)) continue;

    var isMaitrise = totem.StartsWith(".");
    var teamName = isMaitrise ? totem.TrimStart('.').Trim() : totem;
    if (string.IsNullOrWhiteSpace(teamName)) teamName = totem;

    var id = NewId();
    teamIdMap[key] = id;

    // Assignments (UniteFonc.TOTEM) reference a team by its BARE totem ("Etalons"),
    // its FULL sizaine/patrouille name ("Etalons Tenaces" = totem + adjectif), OR its
    // display name — inconsistently. Register all variants (case-insensitive) so the
    // assignment step can match any of them.
    RegisterTeam(unitCode, totem, id);
    RegisterTeam(unitCode, teamName, id);
    if (!string.IsNullOrWhiteSpace(adjective)) RegisterTeam(unitCode, $"{totem} {adjective}", id);

    await Exec(conn, @"INSERT INTO teams (id, name, description, unit_id, display_order, totem, adjective, color1, color2, is_maitrise, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, false)",
        id, teamName, (string?)null, unitId, teamCount, totem, NullIfEmpty(adjective),
        (string?)null, (string?)null, isMaitrise, now);
    teamCount++;
}
Console.WriteLine($"OK ({teamCount})");

// ═══════════════════════════════════════════════════════════════
// STEP 6: Members
// ═══════════════════════════════════════════════════════════════
Console.Write("6. Members... ");
var wsMembers = OpenSheet("Membres.xlsx");
int memberCount = 0;
// First pass: find max existing card numbers
for (int r = 2; r <= wsMembers.LastRowUsed()!.RowNumber(); r++)
{
    var cardRaw = Cell(wsMembers, r, 3);
    if (!cardRaw.StartsWith("[") && !string.IsNullOrWhiteSpace(cardRaw))
    {
        if (cardRaw.StartsWith("M-") && int.TryParse(cardRaw[2..], out var mn)) nextMaleCard = Math.Max(nextMaleCard, mn + 1);
        if (cardRaw.StartsWith("F-") && int.TryParse(cardRaw[2..], out var fn)) nextFemaleCard = Math.Max(nextFemaleCard, fn + 1);
    }
}

for (int r = 2; r <= wsMembers.LastRowUsed()!.RowNumber(); r++)
{
    var oldId = int.TryParse(Cell(wsMembers, r, 2), out var oid) ? oid : 0;
    if (oldId == 0) continue;

    var cardRaw = Cell(wsMembers, r, 3);
    var lastName = Cell(wsMembers, r, 4);
    var firstName = Cell(wsMembers, r, 5);
    var dob = ParseDate(Cell(wsMembers, r, 6));
    var gender = Cell(wsMembers, r, 14) == "F" ? "Féminin" : Cell(wsMembers, r, 14) == "M" ? "Masculin" : null;
    var bloodType = NullIfEmpty(Cell(wsMembers, r, 16));
    var nationality = ExpandNationality(Cell(wsMembers, r, 17));
    var photo = NullIfEmpty(Cell(wsMembers, r, 18));
    var school = MapSchool(Cell(wsMembers, r, 19), Cell(wsMembers, r, 20));
    var classe = NullIfEmpty(Cell(wsMembers, r, 21));
    var section = NullIfEmpty(Cell(wsMembers, r, 22));

    // Card number
    string? cardNumber;
    if (cardRaw.StartsWith("[") && cardRaw.EndsWith("]"))
    {
        // Temporary → generate
        if (gender == "Masculin") { cardNumber = $"M-{nextMaleCard:D4}"; nextMaleCard++; }
        else { cardNumber = $"F-{nextFemaleCard:D4}"; nextFemaleCard++; }
    }
    else if (string.IsNullOrWhiteSpace(cardRaw))
    {
        if (gender == "Masculin") { cardNumber = $"M-{nextMaleCard:D4}"; nextMaleCard++; }
        else { cardNumber = $"F-{nextFemaleCard:D4}"; nextFemaleCard++; }
    }
    else
    {
        cardNumber = cardRaw;
    }

    var id = NewId();
    memberIdMap[oldId] = id;

    await Exec(conn, @"INSERT INTO members (id, first_name, last_name, date_of_birth, gender, card_number, blood_type, nationality, school, classe, section, photo_path, medical_notes, allergies, notes, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16, false)",
        id, firstName, lastName, dob.HasValue ? dob.Value : DBNull.Value,
        gender ?? (object)DBNull.Value, cardNumber, bloodType ?? (object)DBNull.Value,
        NullIfEmpty(nationality) ?? (object)DBNull.Value, NullIfEmpty(school) ?? (object)DBNull.Value,
        classe ?? (object)DBNull.Value, section ?? (object)DBNull.Value,
        photo != null ? $"photos/{photo}" : (object)DBNull.Value,
        (object)DBNull.Value, (object)DBNull.Value, (object)DBNull.Value, now);

    var lk = Norm(lastName);
    if (!memberByLast.TryGetValue(lk, out var nmList)) { nmList = new(); memberByLast[lk] = nmList; }
    nmList.Add((id, gender, Norm(firstName), Norm(Cell(wsMembers, r, 7))));
    memberCount++;
}
Console.WriteLine($"OK ({memberCount})");

// ═══════════════════════════════════════════════════════════════
// STEP 7: Guardians (from Membres flat fields)
// ═══════════════════════════════════════════════════════════════
Console.Write("7. Guardians... ");
int guardianCount = 0;
for (int r = 2; r <= wsMembers.LastRowUsed()!.RowNumber(); r++)
{
    var oldId = int.TryParse(Cell(wsMembers, r, 2), out var oid2) ? oid2 : 0;
    if (oldId == 0 || !memberIdMap.ContainsKey(oldId)) continue;
    var memberId = memberIdMap[oldId];
    var memberLastName = Cell(wsMembers, r, 4);
    var separated = Cell(wsMembers, r, 15); // U = separated

    // Father
    var fatherFirst = Cell(wsMembers, r, 7);
    if (!string.IsNullOrWhiteSpace(fatherFirst))
    {
        var fatherDeceased = Cell(wsMembers, r, 8) == "1";
        var fatherProf = NullIfEmpty(Cell(wsMembers, r, 9));
        var gid = NewId();
        guardianIdMap[$"{oldId}|father"] = gid;

        await Exec(conn, @"INSERT INTO guardians (id, first_name, last_name, profession, is_deceased, notes, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7, false)",
            gid, fatherFirst, memberLastName, fatherProf ?? (object)DBNull.Value,
            fatherDeceased, separated == "U" ? "Parents séparés/divorcés" : (object)DBNull.Value, now);

        var linkId = NewId();
        var relType = "Pere";
        await Exec(conn, @"INSERT INTO guardian_links (id, member_id, guardian_id, relationship_type, is_primary_contact, is_emergency_contact, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7, false)",
            linkId, memberId, gid, relType, true, false, now);
        guardianCount++;
    }

    // Mother
    var motherFirst = Cell(wsMembers, r, 11);
    if (!string.IsNullOrWhiteSpace(motherFirst))
    {
        var motherLast = NullIfEmpty(Cell(wsMembers, r, 10)) ?? memberLastName;
        var motherDeceased = Cell(wsMembers, r, 12) == "1";
        var motherProf = NullIfEmpty(Cell(wsMembers, r, 13));
        var gid = NewId();
        guardianIdMap[$"{oldId}|mother"] = gid;

        await Exec(conn, @"INSERT INTO guardians (id, first_name, last_name, profession, is_deceased, notes, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7, false)",
            gid, motherFirst, motherLast, motherProf ?? (object)DBNull.Value,
            motherDeceased, separated == "U" ? "Parents séparés/divorcés" : (object)DBNull.Value, now);

        var linkId = NewId();
        await Exec(conn, @"INSERT INTO guardian_links (id, member_id, guardian_id, relationship_type, is_primary_contact, is_emergency_contact, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7, false)",
            linkId, memberId, gid, "Mere", false, false, now);
        guardianCount++;
    }
}
Console.WriteLine($"OK ({guardianCount})");

// ═══════════════════════════════════════════════════════════════
// STEP 8: Phones
// ═══════════════════════════════════════════════════════════════
Console.Write("8. Phones... ");
var wsPhones = OpenSheet("Telephones.xlsx");
int phoneCount = 0;
for (int r = 2; r <= wsPhones.LastRowUsed()!.RowNumber(); r++)
{
    var oldMemberId = int.TryParse(Cell(wsPhones, r, 3), out var pm) ? pm : 0;
    var typeCode = Cell(wsPhones, r, 4);
    var label = Cell(wsPhones, r, 5);
    var countryCode = Cell(wsPhones, r, 6);
    var region = Cell(wsPhones, r, 7);
    var number = Cell(wsPhones, r, 8);
    var urgence = Cell(wsPhones, r, 10) == "1";

    if (oldMemberId == 0 || string.IsNullOrWhiteSpace(number)) continue;

    var fullNumber = !string.IsNullOrWhiteSpace(region) ? $"{region}-{number}" : number;
    var cc = !string.IsNullOrWhiteSpace(countryCode) ? $"+{countryCode}" : "+961";

    // Father phone (type 02) or Mother phone (type 03) → guardian
    if (typeCode == "02" && guardianIdMap.TryGetValue($"{oldMemberId}|father", out var fatherGid))
    {
        await Exec(conn, @"INSERT INTO guardian_phones (id, guardian_id, country_code, number, type, is_primary, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7, false)",
            NewId(), fatherGid, cc, fullNumber, NullIfEmpty(label) ?? "Mobile", false, now);
        phoneCount++;
    }
    else if (typeCode == "03" && guardianIdMap.TryGetValue($"{oldMemberId}|mother", out var motherGid))
    {
        await Exec(conn, @"INSERT INTO guardian_phones (id, guardian_id, country_code, number, type, is_primary, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7, false)",
            NewId(), motherGid, cc, fullNumber, NullIfEmpty(label) ?? "Mobile", false, now);
        phoneCount++;
    }
    else if (memberIdMap.TryGetValue(oldMemberId, out var memId))
    {
        var phoneType = typeCode switch { "01" => "Mobile", "04" => "Domicile", "05" => "Bureau", _ => NullIfEmpty(label) ?? "Autre" };
        await Exec(conn, @"INSERT INTO member_phones (id, member_id, country_code, number, type, is_primary, is_emergency, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, false)",
            NewId(), memId, cc, fullNumber, phoneType, false, urgence, now);
        phoneCount++;
    }
}
Console.WriteLine($"OK ({phoneCount})");

// ═══════════════════════════════════════════════════════════════
// STEP 9: Emails
// ═══════════════════════════════════════════════════════════════
Console.Write("9. Emails... ");
var wsEmails = OpenSheet("Emails.xlsx");
int emailCount = 0;
for (int r = 2; r <= wsEmails.LastRowUsed()!.RowNumber(); r++)
{
    var oldMemberId = int.TryParse(Cell(wsEmails, r, 3), out var em) ? em : 0;
    var typeCode = Cell(wsEmails, r, 4);
    var label = Cell(wsEmails, r, 5);
    var address = Cell(wsEmails, r, 6);

    if (oldMemberId == 0 || string.IsNullOrWhiteSpace(address)) continue;

    if (typeCode == "5" && guardianIdMap.TryGetValue($"{oldMemberId}|father", out var fgid))
    {
        await Exec(conn, @"INSERT INTO guardian_emails (id, guardian_id, address, type, is_primary, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $6, false)",
            NewId(), fgid, address.Trim(), NullIfEmpty(label) ?? "Personnel", false, now);
        emailCount++;
    }
    else if (typeCode == "6" && guardianIdMap.TryGetValue($"{oldMemberId}|mother", out var mgid))
    {
        await Exec(conn, @"INSERT INTO guardian_emails (id, guardian_id, address, type, is_primary, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $6, false)",
            NewId(), mgid, address.Trim(), NullIfEmpty(label) ?? "Personnel", false, now);
        emailCount++;
    }
    else if (memberIdMap.TryGetValue(oldMemberId, out var memId))
    {
        var emailType = typeCode switch { "1" => "Personnel", "2" => "Professionnel", _ => NullIfEmpty(label) ?? "Autre" };
        await Exec(conn, @"INSERT INTO member_emails (id, member_id, address, type, is_primary, is_emergency, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7, false)",
            NewId(), memId, address.Trim(), emailType, false, false, now);
        emailCount++;
    }
}
Console.WriteLine($"OK ({emailCount})");

// ═══════════════════════════════════════════════════════════════
// STEP 10: Addresses
// ═══════════════════════════════════════════════════════════════
Console.Write("10. Addresses... ");
var wsAddresses = OpenSheet("Adresses.xlsx");
int addrCount = 0;
for (int r = 2; r <= wsAddresses.LastRowUsed()!.RowNumber(); r++)
{
    var oldMemberId = int.TryParse(Cell(wsAddresses, r, 3), out var am) ? am : 0;
    if (oldMemberId == 0 || !memberIdMap.TryGetValue(oldMemberId, out var memId)) continue;

    var label = NullIfEmpty(Cell(wsAddresses, r, 5)) ?? "Domicile";
    var street = NullIfEmpty(Cell(wsAddresses, r, 6));
    var apt = NullIfEmpty(Cell(wsAddresses, r, 7));
    var sector = NullIfEmpty(Cell(wsAddresses, r, 8));
    var city = NullIfEmpty(Cell(wsAddresses, r, 9));
    var building = NullIfEmpty(Cell(wsAddresses, r, 10));
    var country = NullIfEmpty(Cell(wsAddresses, r, 12));

    var details = string.Join(", ", new[] { street, apt, building, sector }.Where(s => s != null));
    var countryExpanded = country?.ToUpper() == "LB" || country == "Liban" ? "Liban" : country ?? "Liban";

    if (string.IsNullOrWhiteSpace(city) && string.IsNullOrWhiteSpace(details)) continue;

    await Exec(conn, @"INSERT INTO member_addresses (id, member_id, type, country, city, details, is_primary, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, false)",
        NewId(), memId, label, countryExpanded, city ?? "", NullIfEmpty(details), false, now);
    addrCount++;
}
Console.WriteLine($"OK ({addrCount})");

// ═══════════════════════════════════════════════════════════════
// STEP 11: Assignments
// ═══════════════════════════════════════════════════════════════
Console.Write("11. Assignments... ");
var wsAssign = OpenSheet("UniteFonc.xlsx");
int assignCount = 0;
int autoTeamCount = 0;
int skippedJunk = 0;
var importToday = DateOnly.FromDateTime(DateTime.Today);

// Read every UniteFonc row first, then process GROUPED BY MEMBER. Grouping lets us handle the common
// WEBDEV quirk where a historical function (EnCours = 0) has a real DATEDEB but a BLANK DATEFIN: rather
// than collapsing it to a zero-day record, we carry its end forward to the START of the member's NEXT
// function (incl. their active EnCours = 1 row). A function with no later row falls back to the end of
// its scout year (next October 1, capped at today). Rows with neither a start nor an end and EnCours = 0
// are abandoned/incomplete source entries (often duplicates) and are skipped entirely.
var assignRows = new List<(int OldMember, string Unit, string Totem, string Func, DateOnly? Start, DateOnly? End, string? Notes, bool EnCours)>();
for (int r = 2; r <= wsAssign.LastRowUsed()!.RowNumber(); r++)
{
    var oldMemberId = int.TryParse(Cell(wsAssign, r, 3), out var aom) ? aom : 0;
    if (oldMemberId == 0) continue;
    assignRows.Add((
        oldMemberId,
        Cell(wsAssign, r, 5), Cell(wsAssign, r, 6), Cell(wsAssign, r, 7),
        ParseDate(Cell(wsAssign, r, 9)), ParseDate(Cell(wsAssign, r, 10)),
        NullIfEmpty(Cell(wsAssign, r, 11)), Cell(wsAssign, r, 13) == "1"));
}

foreach (var grp in assignRows.GroupBy(x => x.OldMember))
{
    if (!memberIdMap.TryGetValue(grp.Key, out var memId)) continue;

    // Drop abandoned rows (no start, no end, historical) — they'd otherwise become zero-day blips.
    var rows = grp.Where(x => x.Start != null || x.End != null || x.EnCours).ToList();
    skippedJunk += grp.Count() - rows.Count;

    // Chronological order; an active-but-dateless row defaults to today and so sorts last.
    rows = rows.OrderBy(x => x.Start ?? (x.EnCours ? importToday : DateOnly.MaxValue)).ToList();

    for (int i = 0; i < rows.Count; i++)
    {
        var row = rows[i];
        if (!unitIdMap.TryGetValue(row.Unit, out var unitId)) continue;
        var roleId = roleIdMap.GetValueOrDefault(row.Func);
        if (roleId == Guid.Empty) continue;

        Guid? teamId = null;
        if (!string.IsNullOrWhiteSpace(row.Totem) && row.Totem != "--" && row.Totem != "-")
        {
            if (teamLookup.TryGetValue(TeamKey(row.Unit, row.Totem), out var tid))
            {
                teamId = tid;
            }
            else if (row.EnCours)
            {
                // Active member whose totem has no team in PatEqSiz (e.g. JEM "Jeunes en Marche").
                // Auto-create the team so the member is attached rather than left team-less.
                var newTid = NewId();
                var isMait = row.Totem.StartsWith(".");
                var nm = isMait ? row.Totem.TrimStart('.').Trim() : row.Totem;
                if (string.IsNullOrWhiteSpace(nm)) nm = row.Totem;
                await Exec(conn, @"INSERT INTO teams (id, name, description, unit_id, display_order, totem, adjective, color1, color2, is_maitrise, created_at, updated_at, is_deleted)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, false)",
                    newTid, nm, (string?)null, unitId, 900 + autoTeamCount, row.Totem,
                    (string?)null, (string?)null, (string?)null, isMait, now);
                RegisterTeam(row.Unit, row.Totem, newTid);
                teamId = newTid;
                autoTeamCount++;
            }
        }

        var start = row.Start ?? importToday;
        DateOnly? closedEnd;
        if (row.EnCours)
        {
            closedEnd = null;                       // EnCours = 1 → the current, open-ended assignment
        }
        else if (row.End.HasValue)
        {
            closedEnd = row.End;                    // historical with a real recorded end
        }
        else
        {
            // Historical with a blank DATEFIN: carry forward to the next function's start so the real
            // duration is preserved instead of collapsing to one day.
            DateOnly? nextStart = null;
            for (int j = i + 1; j < rows.Count; j++)
            {
                var ns = rows[j].Start ?? (rows[j].EnCours ? importToday : (DateOnly?)null);
                if (ns.HasValue && ns.Value > start) { nextStart = ns; break; }
            }
            if (nextStart.HasValue)
            {
                closedEnd = nextStart;
            }
            else
            {
                // No later function: assume they finished that scout year (next October 1, capped at today)
                // rather than leaving a misleading single-day record.
                var nextOct1 = start >= new DateOnly(start.Year, 10, 1)
                    ? new DateOnly(start.Year + 1, 10, 1)
                    : new DateOnly(start.Year, 10, 1);
                closedEnd = nextOct1 > importToday ? importToday : nextOct1;
            }
        }

        // A function spanning multiple scout years is split into one assignment per scout year,
        // cut on October 1 (the scout-year boundary). See SplitScoutYears for the exact month rules.
        foreach (var (segStart, segEnd) in SplitScoutYears(start, closedEnd, row.EnCours))
        {
            await Exec(conn, @"INSERT INTO member_assignments (id, member_id, unit_id, team_id, functional_role_id, start_date, end_date, notes, created_at, updated_at, is_deleted)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, false)",
                NewId(), memId, unitId, teamId ?? (object)DBNull.Value, roleId,
                segStart,
                segEnd.HasValue ? segEnd.Value : (object)DBNull.Value,
                row.Notes ?? (object)DBNull.Value, now);
            assignCount++;
        }
    }
}
Console.WriteLine($"OK ({assignCount}, auto-created teams: {autoTeamCount}, skipped junk: {skippedJunk})");

// ═══════════════════════════════════════════════════════════════
// STEP 11b: BP 2026 roster override — authoritative 2025-2026 placement
// For each member on a unit roster, replace their CURRENT open assignment with the roster's
// unit + function (+ team). Members active in a roster-covered unit but absent from every roster
// are treated as having left (their open assignment is closed as of the passage date).
// ═══════════════════════════════════════════════════════════════
Console.Write("11b. BP 2026 rosters... ");
var bpFuncFix = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { ["CCSE"] = "CSE" };
var bpMembers = new HashSet<Guid>();
var bpUnitCodes = new HashSet<string>();
var bpProtectNames = new HashSet<string>(); // "unitCode|normLast|normFirst" — on a roster but unplaced; never auto-close
int bpChanged = 0, bpUnchanged = 0, bpCreated = 0;
var bpUnmatched = new List<string>();
var bpUnknownFunc = new List<string>();
void BpUnplaced(string unitCode, string last, string first) => bpProtectNames.Add($"{unitCode}|{Norm(last)}|{Norm(first)}");

// ── Roster team resolver ─────────────────────────────────────────
// Roster team names are variants of the DB team names: singular↔plural / gender (Léopard→Léopards,
// Noir→Noire, Bleu→Bleue), accents (Béluga→Beluga), totem+adjectif (Irbis Fougeux→Irbis,
// Mouettes Aux-Larges→Mouettes), équipe numbers (1→Equipe 1), and the odd spelling diff
// (Cerval→Serval, Marmousset→Marmousets). Match exact → first-token → stem → fuzzy(≤2); create only a
// genuinely-new sizaine/patrouille (e.g. Beige in M3); skip non-teams (Compagnon, check, 0, --).
var teamsByUnit = new Dictionary<string, List<(Guid id, string name, string norm, string firstTok, string firstStem)>>();
await using (var tc = new NpgsqlCommand("SELECT t.id, u.code, t.name FROM teams t JOIN units u ON u.id=t.unit_id WHERE t.is_deleted=false AND COALESCE(t.is_maitrise,false)=false", conn))
{
    await using var rd = await tc.ExecuteReaderAsync();
    while (await rd.ReadAsync())
    {
        var uc = rd.GetString(1).Trim().ToLowerInvariant();
        var nm = rd.GetString(2);
        var nn = Norm(nm);
        if (nn.Length == 0) continue;
        if (!teamsByUnit.TryGetValue(uc, out var lst)) { lst = new(); teamsByUnit[uc] = lst; }
        var ftok = nn.Split(' ')[0];
        lst.Add((rd.GetGuid(0), nm, nn, ftok, Stem(ftok)));
    }
}
int bpTeamMatched = 0, bpTeamCreated = 0;
var bpTeamCache = new Dictionary<string, Guid>();              // "ucl|rawNorm" → resolved/created team id
var bpTeamDecisions = new SortedDictionary<string, string>(); // distinct "UNIT  raw" → decision (report)

async Task<Guid?> ResolveBpTeam(string unitCode, Guid unitId, string raw)
{
    var rawNorm = Norm(raw);
    if (rawNorm.Length == 0 || rawNorm is "0" or "-" or "--" or "na" or "x" or "check") return null;
    if (rawNorm == "compagnon") return null; // Route/Clan progression level, not a team
    var ucl = unitCode.Trim().ToLowerInvariant();
    if (bpTeamCache.TryGetValue($"{ucl}|{rawNorm}", out var cached)) return cached;
    if (teamLookup.TryGetValue(TeamKey(unitCode, raw), out var exactReg))
    {
        bpTeamCache[$"{ucl}|{rawNorm}"] = exactReg; bpTeamMatched++;
        bpTeamDecisions[$"{unitCode}  {raw}"] = "→ (exact registered)";
        return exactReg;
    }
    var cands = teamsByUnit.GetValueOrDefault(ucl) ?? new();

    // équipe number: "1" → "Equipe 1"
    if (System.Text.RegularExpressions.Regex.IsMatch(rawNorm, @"^\d+$"))
    {
        var hit = cands.Where(c => c.norm == $"equipe {rawNorm}" || c.norm.EndsWith(" " + rawNorm)).ToList();
        if (hit.Count == 1) { bpTeamCache[$"{ucl}|{rawNorm}"] = hit[0].id; bpTeamMatched++; bpTeamDecisions[$"{unitCode}  {raw}"] = $"→ {hit[0].name}"; return hit[0].id; }
        bpTeamDecisions[$"{unitCode}  {raw}"] = "→ (no équipe match, team-less)"; return null;
    }

    var ft = rawNorm.Split(' ')[0];
    var ftStem = Stem(ft);
    var method = "";
    var m = cands.Where(c => c.norm == rawNorm).ToList();                       if (m.Count == 1) method = "exact-norm";
    if (m.Count != 1) { m = cands.Where(c => c.firstTok == ft).ToList();        if (m.Count == 1) method = "first-token"; }
    if (m.Count != 1) { m = cands.Where(c => c.firstStem == ftStem).ToList();   if (m.Count == 1) method = "stem"; }
    if (m.Count != 1)
    {
        var scored = cands.Select(c => (c, d: Lev(c.firstStem, ftStem))).Where(t => t.d <= 2).OrderBy(t => t.d).ToList();
        if (scored.Count > 0)
        {
            var best = scored[0].d;
            var top = scored.Where(t => t.d == best).Select(t => t.c).ToList();
            if (top.Count == 1) { m = top; method = $"fuzzy({best})"; }
        }
    }

    if (m.Count == 1)
    {
        bpTeamCache[$"{ucl}|{rawNorm}"] = m[0].id; bpTeamMatched++;
        bpTeamDecisions[$"{unitCode}  {raw}"] = $"→ {m[0].name} [{method}]";
        return m[0].id;
    }
    if (m.Count > 1)
    {
        bpTeamDecisions[$"{unitCode}  {raw}"] = $"→ AMBIGUOUS ({m.Count}) — left team-less";
        return null;
    }

    // genuinely new sizaine/patrouille → create it in this unit
    var newId = NewId();
    var newName = raw.Trim();
    await Exec(conn, @"INSERT INTO teams (id, name, description, unit_id, display_order, totem, adjective, color1, color2, is_maitrise, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, false)",
        newId, newName, (string?)null, unitId, 800, newName, (string?)null, (string?)null, (string?)null, false, now);
    RegisterTeam(unitCode, newName, newId);
    cands.Add((newId, newName, rawNorm, ft, ftStem));
    if (!teamsByUnit.ContainsKey(ucl)) teamsByUnit[ucl] = cands;
    bpTeamCache[$"{ucl}|{rawNorm}"] = newId; bpTeamCreated++;
    bpTeamDecisions[$"{unitCode}  {raw}"] = $"→ CREATED '{newName}'";
    return newId;
}

foreach (var bf in Directory.GetFiles(bpDir, "*.xlsx"))
{
    var fname = Path.GetFileName(bf);
    // Only the per-unit roster files are BP rosters. Skip the summary sheet, temp locks, and any
    // reference/export workbooks the user may keep in this folder (e.g. Export_membres.xlsx).
    if (fname.StartsWith("Tableau") || fname.StartsWith("~") || fname.StartsWith("Export", StringComparison.OrdinalIgnoreCase)) continue;
    var tmp = Path.Combine(Path.GetTempPath(), $"bp_{fname}");
    File.Copy(bf, tmp, true);
    var ws = new XLWorkbook(tmp).Worksheet(1);
    for (int r = 2; r <= ws.LastRowUsed()!.RowNumber(); r++)
    {
        var numRaw = Cell(ws, r, 1);
        var fullName = Cell(ws, r, 2);
        var unitCode = Cell(ws, r, 3);
        var func = Cell(ws, r, 4);
        var sexe = Cell(ws, r, 6);
        var teamName = Cell(ws, r, 12);
        var last = Cell(ws, r, 16);
        var first = Cell(ws, r, 17);
        if (string.IsNullOrWhiteSpace(fullName) || fullName == "Nom et Prénom") continue;
        if (string.IsNullOrWhiteSpace(unitCode) || unitCode == "Uni.") continue;
        if (string.IsNullOrWhiteSpace(func) || func == "Fonc.") continue;
        if (!unitIdMap.TryGetValue(unitCode, out var unitId)) { bpUnmatched.Add($"{fname}: unit '{unitCode}' not found — {fullName}"); continue; }
        bpUnitCodes.Add(unitCode);

        // ── resolve role FIRST (unknown-function rows are reported, never created) ──
        var fc = bpFuncFix.TryGetValue(func, out var ff) ? ff : func;
        if (!roleIdMap.TryGetValue(fc, out var roleId)) { bpUnknownFunc.Add($"{fname}: unknown function '{func}' — {fullName}"); BpUnplaced(unitCode, last, first); continue; }

        var pere = Cell(ws, r, 7);
        var gender = sexe.ToUpperInvariant() == "F" ? "Féminin" : sexe.ToUpperInvariant() == "M" ? "Masculin" : null;

        // ── resolve member: by # (IDMEMBRES), else by name (sex + father + first-token), else CREATE ──
        Guid memId = Guid.Empty;
        if (int.TryParse(numRaw, out var num) && memberIdMap.TryGetValue(num, out var mid)) memId = mid;
        else
        {
            var nl = Norm(last); var nf = Norm(first); var nfTok = nf.Split(' ')[0]; var nPere = Norm(pere);
            if (memberByLast.TryGetValue(nl, out var cands) && cands.Count > 0)
            {
                var pool = cands.Where(c => c.normFirst == nf).ToList();
                if (pool.Count == 0) pool = cands.Where(c => nfTok.Length > 0 && c.normFirst.Split(' ')[0] == nfTok).ToList();
                if (pool.Count > 1 && gender != null) { var s = pool.Where(c => c.gender == gender).ToList(); if (s.Count > 0) pool = s; }
                if (pool.Count > 1 && nPere.Length > 0) { var s = pool.Where(c => c.normFather == nPere).ToList(); if (s.Count == 1) pool = s; }
                if (pool.Count == 1) memId = pool[0].id;
                else if (pool.Count > 1) { bpUnmatched.Add($"{fname}: ambiguous ({pool.Count}) — {fullName}"); BpUnplaced(unitCode, last, first); continue; }
            }
            if (memId == Guid.Empty)
            {
                // Newcomer not in the WEBDEV export → create from the roster row.
                if (string.IsNullOrWhiteSpace(last) && string.IsNullOrWhiteSpace(first)) { bpUnmatched.Add($"{fname}: blank name — {fullName}"); BpUnplaced(unitCode, last, first); continue; }
                memId = NewId();
                var card = gender == "Masculin" ? $"M-{nextMaleCard++:D4}" : $"F-{nextFemaleCard++:D4}";
                await Exec(conn, @"INSERT INTO members (id, first_name, last_name, gender, card_number, notes, created_at, updated_at, is_deleted)
                    VALUES ($1, $2, $3, $4, $5, NULL, $6, $6, false)",
                    memId, first, last, gender ?? (object)DBNull.Value, card, now);
                if (!memberByLast.TryGetValue(Norm(last), out var lst2)) { lst2 = new(); memberByLast[Norm(last)] = lst2; }
                lst2.Add((memId, gender, Norm(first), Norm(pere)));
                if (!string.IsNullOrWhiteSpace(pere))
                {
                    var gid = NewId();
                    await Exec(conn, "INSERT INTO guardians (id, first_name, last_name, is_deceased, created_at, updated_at, is_deleted) VALUES ($1,$2,$3,false,$4,$4,false)", gid, pere, last, now);
                    await Exec(conn, "INSERT INTO guardian_links (id, member_id, guardian_id, relationship_type, is_primary_contact, is_emergency_contact, created_at, updated_at, is_deleted) VALUES ($1,$2,$3,'Pere',true,false,$4,$4,false)", NewId(), memId, gid, now);
                }
                bpCreated++;
            }
        }

        // ── resolve team (fuzzy: roster variants → DB teams; creates genuinely-new sizaines) ──
        Guid? teamId = string.IsNullOrWhiteSpace(teamName) ? null : await ResolveBpTeam(unitCode, unitId, teamName);

        bpMembers.Add(memId);

        // current open assignment(s)
        var openIds = new List<Guid>();
        Guid? curUnit = null, curRole = null, curTeam = null;
        await using (var c = new NpgsqlCommand("SELECT id, unit_id, functional_role_id, team_id FROM member_assignments WHERE member_id = $1 AND end_date IS NULL", conn))
        {
            c.Parameters.Add(new NpgsqlParameter { Value = memId });
            await using var rd = await c.ExecuteReaderAsync();
            while (await rd.ReadAsync())
            {
                openIds.Add(rd.GetGuid(0));
                curUnit = rd.GetGuid(1); curRole = rd.GetGuid(2); curTeam = rd.IsDBNull(3) ? null : rd.GetGuid(3);
            }
        }
        bool matches = openIds.Count == 1 && curUnit == unitId && curRole == roleId && curTeam == teamId;
        if (matches) { bpUnchanged++; continue; }

        if (openIds.Count > 0)
            await Exec(conn, "DELETE FROM member_assignments WHERE member_id = $1 AND end_date IS NULL", memId);
        await Exec(conn, @"INSERT INTO member_assignments (id, member_id, unit_id, team_id, functional_role_id, start_date, end_date, notes, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7, $7, false)",
            NewId(), memId, unitId, teamId ?? (object)DBNull.Value, roleId, passageDate, now);
        bpChanged++;
    }
}

// Leavers: open assignment in a roster-covered unit, member not on any roster → close it.
// SAFETY: protect per-member — a member whose name matches an UNPLACED roster row (ambiguous /
// unknown-function) is left active rather than wrongly closed; everyone else genuinely left.
int bpLeavers = 0, bpProtected = 0;
if (bpUnitCodes.Count > 0)
{
    var bpUnitIds = bpUnitCodes.Select(c => unitIdMap[c]).ToArray();
    var leaverRows = new List<(Guid aid, Guid memId, string ucode, string last, string first)>();
    await using (var c = new NpgsqlCommand(@"SELECT a.id, a.member_id, u.code, m.last_name, m.first_name
        FROM member_assignments a JOIN units u ON u.id=a.unit_id JOIN members m ON m.id=a.member_id
        WHERE a.end_date IS NULL AND a.unit_id = ANY($1)", conn))
    {
        c.Parameters.Add(new NpgsqlParameter { Value = bpUnitIds });
        await using var rd = await c.ExecuteReaderAsync();
        while (await rd.ReadAsync()) leaverRows.Add((rd.GetGuid(0), rd.GetGuid(1), rd.GetString(2), rd.GetString(3), rd.GetString(4)));
    }
    foreach (var (aid, memId, ucode, last, first) in leaverRows)
    {
        if (bpMembers.Contains(memId)) continue; // placed by a roster
        if (bpProtectNames.Contains($"{ucode}|{Norm(last)}|{Norm(first)}")) { bpProtected++; continue; } // unresolved roster straggler
        await Exec(conn, "UPDATE member_assignments SET end_date = $1, updated_at = $2 WHERE id = $3", passageDate, now, aid);
        bpLeavers++;
    }
}
if (bpProtected > 0)
    Console.WriteLine($"\n  ⚠ {bpProtected} active member(s) kept (match an unresolved roster row — see _out reports).");

var bpOut = Path.Combine(bpDir, "_out");
Directory.CreateDirectory(bpOut);
File.WriteAllLines(Path.Combine(bpOut, "unmatched.txt"), bpUnmatched);
File.WriteAllLines(Path.Combine(bpOut, "unknown_func.txt"), bpUnknownFunc);
File.WriteAllLines(Path.Combine(bpOut, "team_resolution.txt"), bpTeamDecisions.Select(kv => $"{kv.Key,-28} {kv.Value}"));
Console.WriteLine($"OK (changed:{bpChanged} unchanged:{bpUnchanged} created:{bpCreated} leavers-closed:{bpLeavers} team-matched:{bpTeamMatched} team-created:{bpTeamCreated} unmatched:{bpUnmatched.Count} unknown-func:{bpUnknownFunc.Count})");

// ═══════════════════════════════════════════════════════════════
// STEP 12: Stages + Badges
// ═══════════════════════════════════════════════════════════════
Console.Write("12. Stages... ");
var wsStages = OpenSheet("T_Etats.xlsx");
int stageCount = 0;
if (!reuseOrg) for (int r = 2; r <= wsStages.LastRowUsed()!.RowNumber(); r++)
{
    var utCode = Cell(wsStages, r, 2);
    var code = Cell(wsStages, r, 3);
    var name = Cell(wsStages, r, 4);
    var visible = Cell(wsStages, r, 5);
    var order = int.TryParse(Cell(wsStages, r, 7), out var o) ? o : 0;

    if (string.IsNullOrWhiteSpace(code)) continue;
    var utId = unitTypeIdMap.GetValueOrDefault(utCode);
    if (utId == Guid.Empty) continue;

    var key = $"{utCode}|{code}";
    if (stageIdMap.ContainsKey(key)) continue;

    var id = NewId();
    stageIdMap[key] = id;
    await Exec(conn, @"INSERT INTO scout_stages (id, unit_type_id, name, code, description, display_order, is_active, is_badge_stage, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $8, false)",
        id, utId, name, code, (string?)null, order, visible == "1", now);
    stageCount++;
}
Console.WriteLine($"OK ({stageCount})");

Console.Write("    Badges... ");
var wsBadges = OpenSheet("T_Badges.xlsx");
int badgeCount = 0;
// Badge definitions were never imported (DB table empty) — import them even in members-only mode.
// Idempotent: badgeIdMap is pre-loaded from the DB, so an existing badge is skipped.
if (!reuseOrg || badgeIdMap.Count == 0) for (int r = 2; r <= wsBadges.LastRowUsed()!.RowNumber(); r++)
{
    var utCode = Cell(wsBadges, r, 2);
    var code = Cell(wsBadges, r, 3);
    var name = Cell(wsBadges, r, 4);
    var visible = Cell(wsBadges, r, 5);

    if (string.IsNullOrWhiteSpace(code)) continue;
    var utId = unitTypeIdMap.GetValueOrDefault(utCode);
    if (utId == Guid.Empty) continue;

    var key = $"{utCode}|{code}";
    if (badgeIdMap.ContainsKey(key)) continue;

    var id = NewId();
    badgeIdMap[key] = id;
    await Exec(conn, @"INSERT INTO badges (id, unit_type_id, name, code, description, display_order, is_active, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, false)",
        id, utId, name, code, (string?)null, badgeCount, visible == "1", now);
    badgeCount++;
}
Console.WriteLine($"OK ({badgeCount})");

// ═══════════════════════════════════════════════════════════════
// STEP 13: Progressions (EtatService)
// ═══════════════════════════════════════════════════════════════
Console.Write("13. Progressions... ");
var wsProgress = OpenSheet("EtatService.xlsx");
int progCount = 0, progSkipStage = 0, progSkipUnit = 0, progSkipDate = 0;
// member → (unit, start date) from one active assignment — fallback for the NOT NULL unit_id and date.
var memActive = new Dictionary<Guid, (Guid unit, DateOnly start)>();
await using (var ma = new NpgsqlCommand("SELECT DISTINCT ON (member_id) member_id, unit_id, start_date FROM member_assignments WHERE end_date IS NULL AND is_deleted=false ORDER BY member_id, start_date", conn))
await using (var mrd = await ma.ExecuteReaderAsync())
    while (await mrd.ReadAsync()) memActive[mrd.GetGuid(0)] = (mrd.GetGuid(1), DateOnly.FromDateTime(mrd.GetDateTime(2)));

for (int r = 2; r <= wsProgress.LastRowUsed()!.RowNumber(); r++)
{
    var oldMemberId = int.TryParse(Cell(wsProgress, r, 3), out var pom) ? pom : 0;
    var utCode = Cell(wsProgress, r, 4);
    var etatCode = Cell(wsProgress, r, 5);
    var badgeCode = NullIfEmpty(Cell(wsProgress, r, 6));
    var progUnit = Cell(wsProgress, r, 7);
    var dateStr = Cell(wsProgress, r, 8);
    var lieu = NullIfEmpty(Cell(wsProgress, r, 9));

    if (oldMemberId == 0 || !memberIdMap.TryGetValue(oldMemberId, out var memId)) continue;

    // scout_stage_id is NOT NULL — a progression must reference a stage.
    var stageId = stageIdMap.GetValueOrDefault($"{utCode}|{etatCode}");
    if (stageId == Guid.Empty) { progSkipStage++; continue; }

    // unit_id is NOT NULL — prefer the row's UNITE, else the member's active-assignment unit.
    Guid unitId = unitIdMap.GetValueOrDefault(progUnit);
    if (unitId == Guid.Empty && memActive.TryGetValue(memId, out var actU)) unitId = actU.unit;
    if (unitId == Guid.Empty) { progSkipUnit++; continue; }

    Guid? bId = null;
    if (badgeCode != null)
    {
        var b = badgeIdMap.GetValueOrDefault($"{utCode}|{badgeCode}");
        if (b != Guid.Empty) bId = b;
    }

    // date is NOT NULL — fall back to the member's active-assignment start date.
    var date = ParseDate(dateStr) ?? (memActive.TryGetValue(memId, out var actD) ? actD.start : (DateOnly?)null);
    if (date == null) { progSkipDate++; continue; }

    await Exec(conn, @"INSERT INTO member_progressions (id, member_id, unit_id, scout_stage_id, badge_id, date, location, notes, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, false)",
        NewId(), memId, unitId, stageId, bId ?? (object)DBNull.Value,
        date.Value, lieu ?? (object)DBNull.Value, (string?)null, now);
    progCount++;
}
Console.WriteLine($"OK ({progCount}; skipped no-stage:{progSkipStage} no-unit:{progSkipUnit} no-date:{progSkipDate})");

// ═══════════════════════════════════════════════════════════════
// STEP 14: Users
// ═══════════════════════════════════════════════════════════════
Console.Write("14. Users... ");
var wsLogin = OpenSheet("Login.xlsx");
int userCount = 0;
// Permissions come from ROLES (functional role → security profile), NOT from Login.Type_Utilisateur:
//   • Group staff (GRP functions) → chef-de-groupe profile (group-wide, IsGroupLevel) via their G assignment.
//   • CU/ACU (maîtrise functions) → chef-unite profile (unit-scoped).
//   • Youth → read-only.
// So no user is flagged super-admin here. The technical super admin (system config) is a MANUAL flag
// set on the 1-2 real admin accounts (admin@gndj.local seeded; samer.cheaib.admin set post-import).
// The old WEBDEV Type_Utilisateur (1/3/5/9) is recorded in a report only (helps spot expected CGs/admins).
var adminAccounts = new List<string>();   // WEBDEV type 9 (were full admins)
var cgAccounts = new List<string>();      // WEBDEV type 5 (were CG)
var oddTypeAccounts = new List<string>();
for (int r = 2; r <= wsLogin.LastRowUsed()!.RowNumber(); r++)
{
    var oldMemberId = int.TryParse(Cell(wsLogin, r, 3), out var lom) ? lom : 0;
    var username = Cell(wsLogin, r, 4);
    var active = Cell(wsLogin, r, 8);
    var typeUtil = Cell(wsLogin, r, 9);
    var loginUnite = Cell(wsLogin, r, 10);
    var disabled = Cell(wsLogin, r, 12);

    if (oldMemberId == 0 || !memberIdMap.TryGetValue(oldMemberId, out var memId)) continue;
    if (string.IsNullOrWhiteSpace(username)) continue;

    var isActive = active == "1" && disabled != "1";
    if (typeUtil == "9") adminAccounts.Add($"{username.Trim()}  (Unité {loginUnite})");
    else if (typeUtil == "5") cgAccounts.Add($"{username.Trim()}  (Unité {loginUnite})");
    else if (typeUtil != "1" && typeUtil != "3") oddTypeAccounts.Add($"{username.Trim()}  (type {typeUtil}, Unité {loginUnite})");

    await Exec(conn, @"INSERT INTO users (id, member_id, email, password_hash, is_super_admin, is_active, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, false, $5, $6, $6, false) ON CONFLICT DO NOTHING",
        NewId(), memId, username.Trim(), tempPassword, isActive, now);
    userCount++;
}
Console.WriteLine($"OK ({userCount}; WEBDEV type9:{adminAccounts.Count}, type5/CG:{cgAccounts.Count}, other:{oddTypeAccounts.Count} — see report; perms come from roles)");
var loginOut = Path.Combine(bpDir, "_out");
Directory.CreateDirectory(loginOut);
File.WriteAllLines(Path.Combine(loginOut, "login_cg_accounts.txt"),
    new[] { $"# WEBDEV full-admin accounts (Type_Utilisateur=9) — flag is_super_admin manually if still needed: {adminAccounts.Count}" }.Concat(adminAccounts)
    .Concat(new[] { "", $"# CG accounts (Type_Utilisateur=5): {cgAccounts.Count}" }).Concat(cgAccounts)
    .Concat(new[] { "", $"# Other/undefined Type_Utilisateur (NOT granted — review): {oddTypeAccounts.Count}" }).Concat(oddTypeAccounts));

// ═══════════════════════════════════════════════════════════════
// STEP 15: Cotisations + Document statuses (Reinscription)
// ═══════════════════════════════════════════════════════════════
Console.Write("15. Cotisations... ");
var wsReinsc = OpenSheet("Reinscription.xlsx");
int cotCount = 0, docStatusCount = 0;

// We need document type IDs for AUT, FM, CI
var autDocTypeId = await ScalarGuid(conn, "SELECT id FROM document_types WHERE code = 'AUT' AND is_deleted = false LIMIT 1");
var fmDocTypeId = await ScalarGuid(conn, "SELECT id FROM document_types WHERE code = 'FM' AND is_deleted = false LIMIT 1");
var ciDocTypeId = await ScalarGuid(conn, "SELECT id FROM document_types WHERE code = 'CI' AND is_deleted = false LIMIT 1");

for (int r = 2; r <= wsReinsc.LastRowUsed()!.RowNumber(); r++)
{
    var oldMemberId = int.TryParse(Cell(wsReinsc, r, 3), out var rom) ? rom : 0;
    if (oldMemberId == 0 || !memberIdMap.TryGetValue(oldMemberId, out var memId)) continue;

    var cotStatus = Cell(wsReinsc, r, 7);
    var amountLBP = decimal.TryParse(Cell(wsReinsc, r, 8), out var lbp) ? lbp : 0;
    var amountUSD = decimal.TryParse(Cell(wsReinsc, r, 9), out var usd) ? usd : 0;
    var receiptNum = NullIfEmpty(Cell(wsReinsc, r, 10));

    // Create cotisation if paid
    if (cotStatus == "C" && (amountUSD > 0 || amountLBP > 0))
    {
        var cotId = NewId();
        cotisationIdMap[oldMemberId] = cotId;
        var receipt = receiptNum ?? $"MIG-{oldMemberId:D4}";

        await Exec(conn, @"INSERT INTO member_cotisations (id, member_id, scout_year, payment_date, receipt_number, notes, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7, false)",
            cotId, memId, scoutYear, DateOnly.FromDateTime(DateTime.Today), receipt, "Migration", now);

        if (amountUSD > 0)
        {
            await Exec(conn, @"INSERT INTO cotisation_payments (id, cotisation_id, amount, currency, payment_method, created_at, updated_at, is_deleted)
                VALUES ($1, $2, $3, $4, $5, $6, $6, false)",
                NewId(), cotId, amountUSD, "USD", "Cash", now);
        }
        if (amountLBP > 0)
        {
            await Exec(conn, @"INSERT INTO cotisation_payments (id, cotisation_id, amount, currency, payment_method, created_at, updated_at, is_deleted)
                VALUES ($1, $2, $3, $4, $5, $6, $6, false)",
                NewId(), cotId, amountLBP, "LBP", "Cash", now);
        }
        cotCount++;
    }

    // Document statuses (only create metadata entries, not actual files)
    // AUT = Autorisation des Parents, FM = Fiche Médicale, CI = Carte d'Identité
    var autStatus = MapDocStatus(Cell(wsReinsc, r, 4));
    var fmStatus = MapDocStatus(Cell(wsReinsc, r, 5));
    var ciStatus = MapDocStatus(Cell(wsReinsc, r, 6));

    // Only create doc records if there's a status and we have the doc type
    if (autStatus != null && autDocTypeId != Guid.Empty)
    {
        await InsertDocStatus(conn, memId, autDocTypeId, autStatus, now);
        docStatusCount++;
    }
    if (fmStatus != null && fmDocTypeId != Guid.Empty)
    {
        await InsertDocStatus(conn, memId, fmDocTypeId, fmStatus, now);
        docStatusCount++;
    }
    if (ciStatus != null && ciDocTypeId != Guid.Empty)
    {
        await InsertDocStatus(conn, memId, ciDocTypeId, ciStatus, now);
        docStatusCount++;
    }
}
Console.WriteLine($"OK (cotisations: {cotCount}, doc statuses: {docStatusCount})");

// ═══════════════════════════════════════════════════════════════
Console.WriteLine("\n✅ Migration complete!");
Console.WriteLine($"   Members: {memberCount}");
Console.WriteLine($"   Guardians: {guardianCount}");
Console.WriteLine($"   Phones: {phoneCount}");
Console.WriteLine($"   Emails: {emailCount}");
Console.WriteLine($"   Addresses: {addrCount}");
Console.WriteLine($"   Assignments: {assignCount}");
Console.WriteLine($"   Stages: {stageCount}, Badges: {badgeCount}");
Console.WriteLine($"   Progressions: {progCount}");
Console.WriteLine($"   Users: {userCount}");
Console.WriteLine($"   Cotisations: {cotCount}");

// ─── Helper functions ──────────────────────────────────────────
string? NullIfEmpty(string? s) => string.IsNullOrWhiteSpace(s) ? null : s;

// Normalize a name token: accent/case-insensitive, "(father)" suffix dropped, spaces collapsed.
string Norm(string? s)
{
    s = (s ?? "").Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
    var sb = new StringBuilder();
    foreach (var ch in s) if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark) sb.Append(ch);
    var x = System.Text.RegularExpressions.Regex.Replace(sb.ToString(), @"\(.*?\)", "");
    return System.Text.RegularExpressions.Regex.Replace(x, @"\s+", " ").Trim();
}

// Stem a team token for singular/plural/gender-insensitive matching (Léopards≈Leopard, Noire≈Noir).
string Stem(string s)
{
    if (s.Length > 3 && s.EndsWith("s")) s = s[..^1];
    if (s.Length > 3 && s.EndsWith("e")) s = s[..^1];
    return s;
}
// Levenshtein edit distance (small fuzzy fallback for spelling diffs: Cerval↔Serval, Marmousset↔Marmousets).
int Lev(string a, string b)
{
    var d = new int[a.Length + 1, b.Length + 1];
    for (int i = 0; i <= a.Length; i++) d[i, 0] = i;
    for (int j = 0; j <= b.Length; j++) d[0, j] = j;
    for (int i = 1; i <= a.Length; i++)
        for (int j = 1; j <= b.Length; j++)
            d[i, j] = Math.Min(Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1),
                               d[i - 1, j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1));
    return d[a.Length, b.Length];
}

// The source files use 'CLA' for the Clan unit type, but the live DB unit_type was renamed to 'CLAN'
// in-app. Register both codes so badge/stage/progression lookups (keyed by the source TYPEUNITE)
// resolve against the renamed DB type.
string[] UtVariants(string c) => c == "CLAN" ? ["CLAN", "CLA"] : c == "CLA" ? ["CLA", "CLAN"] : [c];

// Members-only mode: load the existing org (created by a prior run) into the ID maps so the
// member/assignment steps can reference units/roles/teams/etc. without recreating them.
async Task LoadExistingOrg()
{
    async Task Load(string sql, Action<NpgsqlDataReader> onRow)
    {
        await using var c = new NpgsqlCommand(sql, conn);
        await using var rd = await c.ExecuteReaderAsync();
        while (await rd.ReadAsync()) onRow(rd);
    }
    await Load("SELECT code, id FROM associations WHERE is_deleted=false", rd => assocIdMap[rd.GetString(0)] = rd.GetGuid(1));
    await Load("SELECT code, id FROM unit_types WHERE is_deleted=false", rd => unitTypeIdMap[rd.GetString(0)] = rd.GetGuid(1));
    foreach (var (code, id) in unitTypeIdMap.ToList())
        foreach (var v in UtVariants(code)) unitTypeIdMap.TryAdd(v, id); // CLA↔CLAN alias
    await Load("SELECT code, id FROM functional_roles WHERE is_deleted=false", rd => { var code = rd.GetString(0); if (!string.IsNullOrWhiteSpace(code)) roleIdMap[code] = rd.GetGuid(1); });
    await Load("SELECT code, id FROM units WHERE is_deleted=false", rd => unitIdMap[rd.GetString(0)] = rd.GetGuid(1));
    await Load(@"SELECT t.id, u.code, t.totem, t.name, t.adjective FROM teams t JOIN units u ON u.id = t.unit_id WHERE t.is_deleted=false", rd =>
    {
        var id = rd.GetGuid(0); var uc = rd.GetString(1);
        var totem = rd.IsDBNull(2) ? null : rd.GetString(2);
        var nm = rd.IsDBNull(3) ? null : rd.GetString(3);
        var adj = rd.IsDBNull(4) ? null : rd.GetString(4);
        teamIdMap[$"{uc}|{totem ?? nm}"] = id;
        if (totem != null) RegisterTeam(uc, totem, id);
        if (nm != null) RegisterTeam(uc, nm, id);
        if (totem != null && !string.IsNullOrWhiteSpace(adj)) RegisterTeam(uc, $"{totem} {adj}", id);
    });
    var utRev = new Dictionary<Guid, string>();
    foreach (var (code, id) in unitTypeIdMap) utRev.TryAdd(id, code); // dedup (CLA/CLAN share one id)
    await Load("SELECT code, unit_type_id, id FROM scout_stages WHERE is_deleted=false", rd => { if (utRev.TryGetValue(rd.GetGuid(1), out var uc)) foreach (var v in UtVariants(uc)) stageIdMap[$"{v}|{rd.GetString(0)}"] = rd.GetGuid(2); });
    await Load("SELECT code, unit_type_id, id FROM badges WHERE is_deleted=false", rd => { if (utRev.TryGetValue(rd.GetGuid(1), out var uc)) foreach (var v in UtVariants(uc)) badgeIdMap[$"{v}|{rd.GetString(0)}"] = rd.GetGuid(2); });
}

// ── Scout-year splitting ───────────────────────────────────────
// Divide a function that spans multiple scout years into one assignment per scout year,
// cut on October 1. The boundary months are asymmetric (the changeover is early October):
//   • START: September belongs to the NEW scout year (Sept+ → that year; Aug- → previous year).
//   • END:   October is the tail of the year that just ENDED (Jan–Oct → previous year; Nov–Dec → that year),
//            so a few days past Oct 1 are absorbed, but anything reaching November starts a new segment.
// The first segment keeps the real start, the last keeps the real end (or stays open for active functions).
int StartScoutYear(DateOnly d) => d.Month >= 9 ? d.Year : d.Year - 1;
int EndScoutYear(DateOnly d) => d.Month >= 11 ? d.Year : d.Year - 1;

List<(DateOnly Start, DateOnly? End)> SplitScoutYears(DateOnly start, DateOnly? end, bool open)
{
    var startSy = StartScoutYear(start);
    var endSy = open ? StartScoutYear(DateOnly.FromDateTime(DateTime.Today)) : EndScoutYear(end!.Value);

    // Single scout year (or a short function straddling the Sept↔Oct transition, or bad data) → one row.
    if (endSy <= startSy)
        return [(start, open ? null : end)];

    var segments = new List<(DateOnly, DateOnly?)>();
    for (var sy = startSy; sy <= endSy; sy++)
    {
        var segStart = sy == startSy ? start : new DateOnly(sy, 10, 1);
        DateOnly? segEnd = sy == endSy ? (open ? null : end) : new DateOnly(sy + 1, 10, 1);
        segments.Add((segStart, segEnd));
    }
    return segments;
}

string TeamKey(string unit, string name) => $"{unit.Trim().ToLowerInvariant()}|{name.Trim().ToLowerInvariant()}";
void RegisterTeam(string unit, string name, Guid id)
{
    if (string.IsNullOrWhiteSpace(name)) return;
    teamLookup[TeamKey(unit, name)] = id;
}

string? MapDocStatus(string code) => code switch
{
    "A" => "Approved",
    "P" => "Pending",
    "R" => "Rejected",
    _ => null
};

async Task InsertDocStatus(NpgsqlConnection c, Guid memberId, Guid docTypeId, string status, DateTime ts)
{
    await Exec(c, @"INSERT INTO member_documents (id, member_id, document_type_id, title, file_name, file_path, mime_type, file_size, status, issued_date, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $10, false)",
        NewId(), memberId, docTypeId, "Migration", "migration.pdf", "migration/placeholder", "application/pdf", status,
        DateOnly.FromDateTime(DateTime.Today), ts);
}

async Task<bool> Exec(NpgsqlConnection c, string sql, params object?[] parameters)
{
    await using var cmd = new NpgsqlCommand(sql, c);
    for (int i = 0; i < parameters.Length; i++)
    {
        var val = parameters[i];
        if (val is null) val = DBNull.Value;
        cmd.Parameters.Add(new NpgsqlParameter { Value = val });
    }
    try
    {
        await cmd.ExecuteNonQueryAsync();
        return true;
    }
    catch (PostgresException ex)
    {
        Console.Error.WriteLine($"\n  ⚠ SQL error: {ex.MessageText} (constraint: {ex.ConstraintName})");
        return false;
    }
}

async Task<Guid> ScalarGuid(NpgsqlConnection c, string sql)
{
    await using var cmd = new NpgsqlCommand(sql, c);
    var result = await cmd.ExecuteScalarAsync();
    return result is Guid g ? g : Guid.Empty;
}
