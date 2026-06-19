using ClosedXML.Excel;
using Npgsql;
using NpgsqlTypes;

// ─── Configuration ─────────────────────────────────────────────
var connStr = "Host=localhost;Port=5432;Database=gndj;Username=gndj_admin;Password=GndjDev2026!";
var dataDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "reinscriptions"));
var tempPassword = BCrypt.Net.BCrypt.HashPassword("Gndj2026!", workFactor: 12);
var scoutYear = "2025-2026";
var now = DateTime.UtcNow;

Console.WriteLine($"Data directory: {dataDir}");
Console.WriteLine($"Files found: {Directory.GetFiles(dataDir, "*.xlsx").Length}");

// ─── Helpers ───────────────────────────────────────────────────
Guid NewId() => Guid.CreateVersion7();
string Cell(IXLWorksheet ws, int row, int col) => ws.Cell(row, col).GetString().Trim();
DateOnly? ParseDate(string s)
{
    if (string.IsNullOrWhiteSpace(s)) return null;
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
    // Copy to temp to avoid lock issues
    var temp = Path.Combine(Path.GetTempPath(), $"mig_{filename}");
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

// Card number counters
int nextMaleCard = 1;
int nextFemaleCard = 1;

await using var conn = new NpgsqlConnection(connStr);
await conn.OpenAsync();

Console.WriteLine("Connected to database. Starting migration...\n");

// ═══════════════════════════════════════════════════════════════
// STEP 1: Associations
// ═══════════════════════════════════════════════════════════════
Console.Write("1. Associations... ");
var associations = new Dictionary<string, (Guid id, string name)>
{
    ["SDL"] = (NewId(), "Scouts Du Liban"),
    ["GDL"] = (NewId(), "Guides Du Liban"),
};
foreach (var (code, (id, name)) in associations)
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
foreach (var (code, name) in unitTypes)
{
    var id = NewId();
    unitTypeIdMap[code] = id;
    await Exec(conn, @"INSERT INTO unit_types (id, name, code, description, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $5, false) ON CONFLICT DO NOTHING",
        id, name, code, (string?)null, now);
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

for (int r = 2; r <= wsRoles.LastRowUsed()!.RowNumber(); r++)
{
    var code = Cell(wsRoles, r, 3); // CODEFONCTION
    var name = Cell(wsRoles, r, 4); // NOMFONCTION
    var isMaitrise = Cell(wsRoles, r, 5) == "1";
    var utCode = Cell(wsRoles, r, 9); // TYPEUNITE

    if (string.IsNullOrWhiteSpace(code)) continue;
    if (roleIdMap.ContainsKey(code)) continue;

    var id = NewId();
    roleIdMap[code] = id;
    var profileId = isMaitrise ? leaderProfileId : memberProfileId;
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
for (int r = 2; r <= wsUnits.LastRowUsed()!.RowNumber(); r++)
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
for (int r = 2; r <= wsTeams.LastRowUsed()!.RowNumber(); r++)
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
for (int r = 2; r <= wsAssign.LastRowUsed()!.RowNumber(); r++)
{
    var oldMemberId = int.TryParse(Cell(wsAssign, r, 3), out var aom) ? aom : 0;
    var unitCode = Cell(wsAssign, r, 5);    // UNITE
    var totem = Cell(wsAssign, r, 6);       // TOTEM
    var funcCode = Cell(wsAssign, r, 7);    // FONCTION1
    var startDate = ParseDate(Cell(wsAssign, r, 9));
    var endDate = ParseDate(Cell(wsAssign, r, 10));
    var notes = NullIfEmpty(Cell(wsAssign, r, 11));
    var enCours = Cell(wsAssign, r, 13) == "1"; // EnCours = source-of-truth "currently active" flag

    if (oldMemberId == 0 || !memberIdMap.TryGetValue(oldMemberId, out var memId)) continue;
    if (!unitIdMap.TryGetValue(unitCode, out var unitId)) continue;

    var roleId = roleIdMap.GetValueOrDefault(funcCode);
    if (roleId == Guid.Empty) continue;

    Guid? teamId = null;
    if (!string.IsNullOrWhiteSpace(totem) && totem != "--" && totem != "-")
    {
        if (teamLookup.TryGetValue(TeamKey(unitCode, totem), out var tid))
        {
            teamId = tid;
        }
        else if (enCours)
        {
            // Active member whose totem has no team in PatEqSiz (e.g. JEM "Jeunes en Marche").
            // Auto-create the team so the member is attached rather than left team-less.
            var newTid = NewId();
            var isMait = totem.StartsWith(".");
            var nm = isMait ? totem.TrimStart('.').Trim() : totem;
            if (string.IsNullOrWhiteSpace(nm)) nm = totem;
            await Exec(conn, @"INSERT INTO teams (id, name, description, unit_id, display_order, totem, adjective, color1, color2, is_maitrise, created_at, updated_at, is_deleted)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, false)",
                newTid, nm, (string?)null, unitId, 900 + autoTeamCount, totem,
                (string?)null, (string?)null, (string?)null, isMait, now);
            RegisterTeam(unitCode, totem, newTid);
            teamId = newTid;
            autoTeamCount++;
        }
    }

    // Active iff EnCours = 1. If EnCours = 0 the assignment is historical and MUST be closed,
    // even when DATEFIN is blank (WEBDEV often left it empty). Use DATEFIN when present,
    // otherwise fall back to the start date so the record is marked closed.
    var start = startDate ?? DateOnly.FromDateTime(DateTime.Today);
    DateOnly? closedEnd = enCours ? null : (endDate ?? start);

    // A function carried over multiple scout years is split into one assignment per scout year,
    // cut on October 1 (the scout-year boundary). See SplitScoutYears for the exact month rules.
    foreach (var (segStart, segEnd) in SplitScoutYears(start, closedEnd, enCours))
    {
        await Exec(conn, @"INSERT INTO member_assignments (id, member_id, unit_id, team_id, functional_role_id, start_date, end_date, notes, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, false)",
            NewId(), memId, unitId, teamId ?? (object)DBNull.Value, roleId,
            segStart,
            segEnd.HasValue ? segEnd.Value : (object)DBNull.Value,
            notes ?? (object)DBNull.Value, now);
        assignCount++;
    }
}
Console.WriteLine($"OK ({assignCount}, auto-created teams: {autoTeamCount})");

// ═══════════════════════════════════════════════════════════════
// STEP 12: Stages + Badges
// ═══════════════════════════════════════════════════════════════
Console.Write("12. Stages... ");
var wsStages = OpenSheet("T_Etats.xlsx");
int stageCount = 0;
for (int r = 2; r <= wsStages.LastRowUsed()!.RowNumber(); r++)
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
for (int r = 2; r <= wsBadges.LastRowUsed()!.RowNumber(); r++)
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
    await Exec(conn, @"INSERT INTO badges (id, unit_type_id, name, code, description, is_active, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7, false)",
        id, utId, name, code, (string?)null, visible == "1", now);
    badgeCount++;
}
Console.WriteLine($"OK ({badgeCount})");

// ═══════════════════════════════════════════════════════════════
// STEP 13: Progressions (EtatService)
// ═══════════════════════════════════════════════════════════════
Console.Write("13. Progressions... ");
var wsProgress = OpenSheet("EtatService.xlsx");
int progCount = 0;
for (int r = 2; r <= wsProgress.LastRowUsed()!.RowNumber(); r++)
{
    var oldMemberId = int.TryParse(Cell(wsProgress, r, 3), out var pom) ? pom : 0;
    var utCode = Cell(wsProgress, r, 4);
    var etatCode = Cell(wsProgress, r, 5);
    var badgeCode = NullIfEmpty(Cell(wsProgress, r, 6));
    var dateStr = Cell(wsProgress, r, 8);
    var lieu = NullIfEmpty(Cell(wsProgress, r, 9));

    if (oldMemberId == 0 || !memberIdMap.TryGetValue(oldMemberId, out var memId)) continue;

    var stageKey = $"{utCode}|{etatCode}";
    Guid? stageId = stageIdMap.GetValueOrDefault(stageKey);
    if (stageId == Guid.Empty) stageId = null;

    Guid? bId = null;
    if (badgeCode != null)
    {
        var bKey = $"{utCode}|{badgeCode}";
        bId = badgeIdMap.GetValueOrDefault(bKey);
        if (bId == Guid.Empty) bId = null;
    }

    if (stageId == null && bId == null) continue;

    var date = ParseDate(dateStr);

    await Exec(conn, @"INSERT INTO member_progressions (id, member_id, scout_stage_id, badge_id, date, location, notes, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, false)",
        NewId(), memId, stageId ?? (object)DBNull.Value, bId ?? (object)DBNull.Value,
        date.HasValue ? date.Value : (object)DBNull.Value, lieu ?? (object)DBNull.Value,
        (string?)null, now);
    progCount++;
}
Console.WriteLine($"OK ({progCount})");

// ═══════════════════════════════════════════════════════════════
// STEP 14: Users
// ═══════════════════════════════════════════════════════════════
Console.Write("14. Users... ");
var wsLogin = OpenSheet("Login.xlsx");
int userCount = 0;
for (int r = 2; r <= wsLogin.LastRowUsed()!.RowNumber(); r++)
{
    var oldMemberId = int.TryParse(Cell(wsLogin, r, 3), out var lom) ? lom : 0;
    var username = Cell(wsLogin, r, 4);
    var active = Cell(wsLogin, r, 8);
    var disabled = Cell(wsLogin, r, 12);

    if (oldMemberId == 0 || !memberIdMap.TryGetValue(oldMemberId, out var memId)) continue;
    if (string.IsNullOrWhiteSpace(username)) continue;

    var isActive = active == "1" && disabled != "1";

    await Exec(conn, @"INSERT INTO users (id, member_id, email, password_hash, is_super_admin, is_active, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, false, $5, $6, $6, false) ON CONFLICT DO NOTHING",
        NewId(), memId, username.Trim(), tempPassword, isActive, now);
    userCount++;
}
Console.WriteLine($"OK ({userCount})");

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
