# Camp BP

Familles, grading, commission roles, grand jeu rotation/scoring, places, map.

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

### Camp BP — familles + grading (phase 1, 2026-06-25)
A camp feature: split the whole group into balanced "familles" (mixed teams), each led by a Père + Mère.
- **Entities** (migration `AddCampBp`): `Camp` (edition: name, scoutYear, famillesCount, status Setup→Assigned→Closed,
  formula coefs), `Famille` (number, PereMemberId/MereMemberId), `CampParticipant` (memberId, branche/gender snapshot,
  Force, Année, Note, IsLeaderCandidate, Role Membre/Pere/Mere, FamilleId, notes), `CampGame` + `CampGameEtapiste`.
- **Note formula (customizable per camp):** `Note = ForceCoef×Force + multiplier(branche)×Année + Offset`. The
  **multiplier defaults to the unit type's NumberOfYears** (Meute/Ronde 3, Compagnie 4, Troupe 5) — this is what
  makes a Troupe Y3 outscore a Meute Y3 **without cumulating** (the user's own model, from their Excel
  `Force + 5×Année − 4`). Année auto-derived from assignment tenure (scout year ~Oct 1), CU-adjustable. Coefs +
  per-branch multipliers editable per camp.
- **Flow:** CU marks **attendance** + **grades** (Force + année + Père/Mère candidate ★ + cas particulier) for their
  own unit (`camp.grade`, unit-scoped) on the **`/camp`** page → CG runs the **balanced randomized draft**
  (per branche×genre stratum, deal highest-Note first to the famille with fewest of that stratum, tie-broken by
  lowest Note-sum → balances note/size/branch/gender) → CG assigns **Père/Mère** per famille (candidates = ★-flagged
  + members in the older non-pool branches; pinned, excluded from balance) → CG **swaps/moves** members on a board
  showing live size/avg-note(min=blue,max=amber)/♂♀/branche metrics → CG defines **Jeux** + étapiste sets (maîtrise
  members). Phase 2 = scoring the games (later).
- **Permissions** `camp.manage` (CG/super-admin) + `camp.grade` (CU; added to chef-unite seed). Setting
  `camp.familles_count` (default per-camp). Pages: `/camp` (CU grading), `/admin/camps` + `/admin/camps/:id`
  (CG: Familles board / Jeux / Paramètres).
- **Refinements after the full live test (2026-06-26):** (a) multiplier is now **UnitType.NumberOfYears**
  (data-driven, not per-camp; set Meute/Ronde 3, Compagnie 4, Troupe 5, … in the live DB + migration tool;
  per-camp editor removed, shown read-only). (b) **Année auto-derive** rewritten: counts the distinct
  **scout-years the member spent in their current unit across ALL assignments (incl. expired)** — fixes the old
  tenure-from-active-assignment which returned 1 for everyone after the reimport. (c) **Pools:** campers exclude
  maîtrise (chefs aren't graded); **Père/Mère** candidates = older youth (routiers/Noyau/JEM/Feu, non-maîtrise) +
  ★-flagged Troupe/Compagnie; **Étapistes** = maîtrise + those older youth (Troupe/Compagnie campers can't be
  étapistes). (d) Famille board shows the **unit** per member. **Tested live:** 851 youth → 50 familles in 3.3s,
  balance excellent (size 15–18, note-sum spread 2, branches/gender ±1); 25 games + étapistes OK. Two EF
  translation 500s found+fixed (grading OrderBy-over-DTO, familles GroupBy-over-entities). TODO: Commission BP
  designation (2 ACG + ACUs the CG sets); phase 2 = game scoring.
- **Père = male / Mère = female (2026-06-26):** PereMereCandidateDto carries gender; the Père/Mère dialog shows only
  the gender-appropriate button (♂→Père, ♀→Mère) and SetFamillePereMere rejects a non-male Père / non-female Mère.
- **Familles board = drag-drop two-pane (2026-06-26):** left = famille table (big F# + avg-note bar, low=blue
  high=amber) where you pick two familles **A**/**B**; right = the two familles as columns of member cards (full
  name, ♂/♀, branche·unité, note). dnd-kit: drag a member onto the other **column** = move, onto a **member** = swap.
  Replaced the cramped chip grid. Fixed the Père/Mère dialog header that showed the Père name but only `✓` for the
  Mère (now `nameOf()` resolves both against the full candidate list, not the search-filtered one).
- **Printable PDF reports (2026-06-26):** `ICampReportService` (QuestPDF, `CampReportService`) +
  `GenerateCampReportQuery(campId, kind, familleNumber?)`. Three reports: **single famille** (Père/Mère + member
  table branche/unité/note), **all familles one-per-page**, **unit list grouped by unit with each member's famille
  number**. Endpoints `GET /camps/{id}/familles/{number}/pdf`, `/familles/pdf`, `/unit-list/pdf` (camp.grade).
  Board UI: printer icon per A/B column + "Toutes les familles" / "Liste par unité" buttons (download helpers in
  camp-service.ts). Smoke-tested live → valid PDFs.
- **Report tweaks (2026-06-26):** unit list = **one unit per page**, no branche, members grouped **per équipe**;
  famille sheet lists **Père/Mère as numbered members** (tinted, no gender sign, no note column — `# · Nom · Unité`).

### Camp BP — chefs de commission + roles inside the commission (2026-09-26, DEV until deploy)
- **`CampAccess`** (Application/Camps) = the single rule set, asked by every camp handler: **admin** = super-admin or
  `camp.manage` (the CG, or someone the CG delegated Camp BP to) → create / archive / delete + choose the chefs de commission;
  **Chef de commission** (`CampCommissionMember.IsChef`, ACGs = active group-level role,
  picked by the CG at creation or via `PUT /camps/{id}/chefs`) → full rights on THAT camp (choose the commission
  members, set their rights, every area); **member** → per area `FamillesAccess`/`JeuxAccess`/`ParametresAccess` =
  none/view/edit (`PUT /camps/{id}/
  commission/{memberId}/access`). Anyone on the commission sees the Commission tab; outside CUs only the grading page.
  Migration `AddCampCommissionRoles`.
- **ACGs no longer hold camp.* by default** (unchanged baseline); commission membership grants `camp.grade` + the
  non-assignable `camp.commission` (NOT camp.manage) at sign-in. Camp endpoints are gated `camp.grade` and each
  handler checks the area (Familles incl. draft/move/swap/Père-Mère/PDFs; Jeux incl. étapistes; Paramètres = update).
- **Commission = maîtrise only** (active IsMaitrise role), checked server-side; picker from `GET /camps/commission-
  candidates` (`?groupLevelOnly=true` for the chefs). The check applies to members being ADDED only (existing
  ones can always be removed). Chefs can't be removed by SetCommission (only via /chefs).
- Frontend: `camp.myAccess` drives the tabs; "view" = read-only (no draft/drag/leaders, no game edits, settings
  fieldset disabled). `/admin/camps` open to camp.manage OR camp.commission (PermissionRoute accepts a list); sidebar
  "Commission BP" link for commission members. Create dialog has the chefs de commission picker. Empty game name → inline error.
- **Étapistes = maîtrise only** (`EtapisteCandidates.LoadAsync`, active IsMaitrise role — an ACG / commission member is
  listed only as maîtrise). Setting **`camp.etapistes_aines`** (Paramètres → Camp BP; `camp` is now a CG-editable
  category) adds the older youth of CLAN / CAR / JEM, flagged `IsAine` + `Branch` and shown in a separate amber
  "Aînés" section of the picker. SetGameEtapistes checks only NEWLY added members (an existing étapiste never blocks a save).

### Camp BP — formatted game description (2026-09-26, DEV until deploy)
- `CampGame.Description` (existing text column) now holds TipTap HTML: validator 50k, NoHtml dropped (rendered via
  `RichContent` = DOMPurify; the abuse middleware still blocks script). No migration.
- Jeux tab: pencil (or "+ Ajouter une description") opens `GameEditDialog` (name + `RichTextEditor`), `useUpdateGame`
  → `PUT /camps/games/{id}`; the description shows on the game card for every viewer (read-only too).
- **Étapistes read their games:** `MeResponse.IsCampEtapiste` (étapiste of a game in a non-archived camp) shows a
  **"Mes jeux"** link (`/mes-jeux`, sidebar personal links + account menu) → `GetMyCampGamesQuery` (`GET /camps/my-games`,
  any signed-in member, own games only) with the formatted description + the other étapistes. **Fiche PDF** per game
  (`GetCampGamePdfQuery`, `GET /camps/games/{id}/pdf`, reuses `IDocumentTemplateRenderer`): allowed for the game's
  étapistes or anyone with Jeux view; also a printer button on each game in the Jeux tab.
- **Game locations:** `CampGame.MainLocation` + `BackupLocation` (bad weather), migration `AddCampGameLocations`,
  picked in the game editor from the setting **`camp.game_locations`** (json_array, category camp = CG-editable,
  auto-seeded `[]`); stored as text (a renamed place stays on old games). Shown on the game card, "Mon jeu", PDF.
- **Where étapistes read their game:** shared `components/camp/my-games-list.tsx` (`MyGamesList`, `GameLocations`) —
  at the top of the unit Camp BP page (`/camp`, hidden when the member runs no game) and on `/mes-jeux`. The
  "Mes jeux" menu link now shows only to étapistes WITHOUT camp.grade (routiers/caravelles/JEM); leaders see it on
  /camp. Each member sees only their own game(s) + that game's other étapistes.
- **One active camp at a time:** CreateCamp refuses while a non-archived camp exists; archiving is FINAL (un-archive
  refused, no "Désarchiver" button; "Archiver" asks for confirmation). `/admin/camps` redirects (replace) to the active camp; with none it lists old camps + "Nouveau
  camp" (CG). The camp page has a "Camp" dropdown (active first, then old camps) instead of the "Tous les camps" link
  (link kept only when no camp is active).
- **Automatic name + year, theme:** a camp takes the current `passage.scout_year` at creation and is named
  `CampNaming.NameFor` = "Camp BP <second year>" (2026-2027 → Camp BP 2027); both are fixed (no longer in
  Create/UpdateCampCommand). One camp per scout year (create refused otherwise). New `Camp.Theme` (≤200, NoHtml,
  migration `AddCampTheme`) edited in Paramètres (Parametres edit rights). Patch **031** renames existing camps to the
  rule. Paramètres tab: Enregistrer right-aligned under the form; Archiver/Supprimer in a separate "Clôture du camp" box.
- "Nouveau camp" is shown ONLY when creation is possible (CG, list loaded, no active camp, no camp yet for the current
  scout year — an archived one counts); otherwise a note says this year's camp is closed.

### Camp BP — grand jeu: rotation, lookup, scoring (2026-09-28, DEV until deploy)
From the commission's 2026 archive (Archive BP). Migration `AddCampRotationScoring`.
- **Fixed rotation grid** `Application/Camps/CampRotationGrid.cs` (generated from "Grille de Rotation.xlsx" — do not edit by
  hand): 50 familles × 25 games × 25 slots (15 day 1, 10 day 2), every famille plays each game once and never meets the
  same famille twice (unit-tested). Per camp only the dates / hours and the games' places change. `CampRotationSlot`
  (camp_rotation_slots) + `CampRotationMatch` (camp_rotation_matches, famille NUMBERS so re-drafting never breaks it; the
  score lives on the row). `CampGame.Number` (1–25, unique per camp) links a game to the grid. `Camp.UseBackupLocations`
  = Plan B (lookup + passports show the backup places).
- **Lookup** (`SearchCampPeopleQuery` / `GetFamilleScheduleQuery`, `GET /camps/{id}/lookup?q=`, `/familles/{n}/schedule`,
  no permission attribute — handler: CG / commission / camp.grade (CUs) / étapistes): name (accent-insensitive; members,
  Père, Mère) or famille number → the famille's 25 steps + Père/Mère phones + server camp time. Client
  (`components/camp/camp-lookup.tsx`) shows the step before / in progress (or next) / after, time selectable.
- **Scoring** `CampScoring` (Application, unit-tested against the rules sheet; mirrored in `client/src/lib/camp-scoring.ts`
  for the live preview): 2 rounds × 50 (tie 25/25), 5 esprit points split, lateness A (3–7 min: round 1 to the on-time
  famille, round 2 on 50; A vs A → round 2 on 100) / B (7–10 min: 100 to the other; A vs B → 100 to A; B vs B → 0),
  énigme = winner of the rounds, tie → first arrived (inferred from lateness when it differs), never a retard-B famille.
  Inputs + computed points stored on the match with `Source` online|paper and `ScoredByName`. Edit = Jeux edit or an
  étapiste of THAT game (`CampMatchEdit`); refused once the camp is archived. `GET /camps/{id}/ranking` (Jeux view).
- **PDFs** `ICampRotationReportService` (QuestPDF): famille passports (1 A4 page each: members, 25 steps with place,
  opponent, blank note/énigme/signature) and paper score sheets (1 landscape page per game, one line per match, both
  familles side by side). `GET /camps/{id}/passports/pdf?famille=`, `/score-sheets/pdf?game=` (étapiste: own game).
- **Familles**: `Famille.Description` + optional `CampSuperFamille` (camp_super_familles; auto split in number order).
  **Sub-commissions**: `Camp.SubCommissionsJson` (default Trésor / Jeu / Code / Logistique – Intendance / Logistique –
  Animation / Veillée) + `CampCommissionMember.SubCommissions` (text[]), set by the CG / chefs de commission.
- UI: camp page tabs **Rotation / Pointage / Où est… ?** (+ superfamilles, famille name, game number, sub-commission
  chips + overview); CU `/camp` and étapistes' "Mes jeux" get the lookup card; étapistes score their game there.
  Tested: 37 API checks, 11 browser checks, grid + scoring unit tests, smoke suite 60/60.

### Camp BP — places of the games + backup games (2026-09-28, DEV until deploy)
- **Setting `camp.places`** (json, category camp = CG-editable, own editor `components/camp/camp-places-editor.tsx` in
  Paramètres → Camp BP; replaces the flat `camp.game_locations`, now hidden): `[{name, a, b, capacity}]` = usable as
  lieu A and/or lieu B, games hosted at the same time. Parsed by `CampPlaces.Parse` (Application) / `parsePlaces`
  (client/src/lib/camp-places.ts). No size on purpose (the archive has none — the user asked to drop invented
  sizes). Dev filled from the archive's "Lieux jeux 25-26" (43 places; capacity = games that shared a place in
  2026) — **not yet on prod** (export as a data patch once the CG has reviewed it).
- **CampGame** gained `BackupGameName` + `BackupGameDescription` (TipTap HTML) — migration `AddCampGameBackupGame`.
  With Plan B on, an étape with a backup game plays it instead (passports use its name; schedule steps / rotation
  rows / my-games carry `BackupGameName`; score sheet + game PDF mention it). Clearing the name drops the description.
- **Auto-assign** `AutoAssignCampPlacesCommand` (`POST /camps/{id}/games/auto-places {main, backup, replace}`, Jeux
  edit): per side, in game-number order, each game takes the first place of the list with room left; none free →
  reported in `noPlace`. Without `replace`, only games with no place on that side are filled and the kept ones count
  against capacity. Capacity is per side. A place marked both A and B is mirrored onto the game's other side when
  that side is empty (or being redone in this run) and has room — same in the game editor (picking it on either side).

### Camp BP — carte du collège (2026-09-28, DEV until deploy)
- Clean modern plan of the Jamhour grounds, NO pins/names on purpose: `client/public/camp/carte-jamhour.svg`, generated by
  `tools/camp-map/build.mjs` (traced from a Google Maps satellite view, north up — the archive's architect plan is turned
  ~180°; `--preview <screenshot.png>` writes preview.png + overlay.png to check the tracing, gitignored).
- "Carte" tab on the camp page (`components/camp/camp-map.tsx`, anyone with some camp access): Imprimer = the map alone on
  ONE landscape page (the `@page { size: landscape }` rule is injected only for that print, then removed on afterprint, so
  other prints keep portrait), Télécharger = the SVG.

