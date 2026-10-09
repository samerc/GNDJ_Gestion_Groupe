# Data migration & cleanup

WEBDEV import tool, BP reconciliation, data cleanup passes, managed lists data.

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

### Data Migration (Complete — see memory project_data_migration.md)
- [x] C# console migration tool (tools/Migration) reads 18 WEBDEV Excel files → PostgreSQL
- [x] 2259 members, 4446 guardians, 5805 phones, 4515 emails, 4523 assignments, 2048 users
- [x] **Active-membership criterion = WEBDEV `UniteFonc.EnCours` flag** (NOT DATEFIN, which was
      often left blank). EnCours=1 → active (end_date NULL); EnCours=0 → closed. 989 active
      assignments / 930 active members; rest are alumni (kept, not dropped — data fixable in-app).
- [x] All imported users have temp password `Gndj2026!` (bcrypt WF10)
- [x] **Multi-year functions split per scout year (2026-06-16):** a `UniteFonc` row spanning several scout
      years is divided into one assignment per scout year, cut on **October 1** (`SplitScoutYears` in
      tools/Migration/Program.cs). Boundary months are asymmetric (changeover is early October): START —
      September belongs to the new SY (Sept+ → that year, Aug- → previous); END — October is the tail of the
      year just ended (Jan–Oct → previous SY, Nov–Dec → that SY). First segment keeps the real start, last
      keeps the real end; ACTIVE (EnCours=1) functions split history closed + leave only the current SY open.
      E.g. Oct 10 2022→Oct 16 2025 ⇒ 3 rows (…→Oct1'23, Oct1'23→Oct1'24, Oct1'24→Oct 16'25). Applies to ALL
      functions (multiplies historical rows). Migration-tool only — effective on the next re-import.
- [x] **Empty-teams bug FIXED (2026-06-15):** `UniteFonc.TOTEM` named teams by the FULL sizaine name
      (totem + adjectif, "Etalons Tenaces") but teams were created keyed by bare totem ("Etalons") →
      47% of active assignments got `team_id=NULL`. Tool now registers each team under bare/full/display
      names (case-insensitive) + auto-creates a team for an active member whose totem has no PatEqSiz row.
      Live DB backfilled non-destructively (active-with-team 418→905). Added `NOY`=Noyau unit type.
- [x] **Unit association now NULLABLE** — a unit may span both associations and belong to none (Maîtrise
      de Groupe "G", empty ASSOC in source). `Unit.AssociationId` → `Guid?` (migration
      MakeUnitAssociationNullable), Create/UpdateUnit no longer require it, unit form has "Aucune (inter-
      associations)", list/detail show "Inter-associations". Migration imports empty-ASSOC units as NULL.
      (C1/CO were not lost — they'd been recoded in-app C1→CO1/CO→X3; renamed back in the live DB. N+G
      not created in live DB per user — a re-import now produces them.)

### BP 2026 reconciliation + V2 reimport + Chef de Groupe tier (2026-06-23)
Off-repo data work + a new permission tier. Full detail in memory `project_bp2026_reconciliation.md`.
- [x] **BP 2026 rosters** (2025-26 unit lists the CU never finished as a passage) drive current placement.
      `tools/Migration` gained `--members-only` (reuse DB org; only re-import members+deps) + a step-11b BP
      override (match by WEBDEV `#`/IDMEMBRES, else name; create newcomers; close leavers). Fuzzy team
      resolver (stem/Levenshtein) maps roster team variants (Léopard→Léopards, Cerval→Serval, 1→Equipe 1)
      → DB teams; creates genuinely-new sizaines. active-with-team 432→711.
- [x] **V2 reimport** from up-to-date exports in `reinscriptions/v2/` (Export_*.xlsx, max IDMEMBRES 2810 —
      covers 208 members the old export capped at 2416 missed; + corrected school/DOB/contacts). Tool: `--data=`
      arg + canonical→Export_* name map; robust ParseDate (yyyymmdd + dd/MM/yyyy); **CLA→CLAN** unit-type alias
      (source code vs in-app-renamed DB code). DOB now on 2366 members; created-from-roster 224→26.
- [x] **Badges + progressions were silently failing** (both 0 in DB) — FIXED: badge INSERT omitted
      `display_order` (NOT NULL); progression INSERT omitted `unit_id` (NOT NULL) + treated stage/date as
      optional. Now 124 badges, 1997 progressions.
- [x] **Chef de Groupe tier (roles-based perms, NOT WEBDEV Type_Utilisateur):** `SecurityProfile.IsGroupLevel`
      (migration `AddSecurityProfileGroupLevel`); seeded **`chef-de-groupe`** profile (all perms EXCEPT
      AssociationsManage [also gates settings/SMTP/email/API keys], Units Create/Edit/Delete, UnitTypesManage,
      RolesManage, AdminHardDelete) via `SeedData.SeedChefDeGroupeProfileAsync` (idempotent, wired in Program.cs);
      `LoginCommandHandler`+`RefreshTokenCommandHandler` grant ALL units to a group-level-profile holder. Migration
      tool maps GRP functions (CG/ACG/AUG/SG/TG/INT/ANIM) → chef-de-groupe; created the missing **G (Maîtrise de
      Groupe)** unit so 15 group leaders land. Super-admin = manual flag (admin@gndj.local + 2 accounts), not a role.
      Verified: a CG sees all units, manages members + assigns CU/CG, but cannot reach settings/units/roles.

### Data cleanup + managed Cities list (2026-06-24)
Live-DB data-quality pass (all on the LIVE db, backups kept as `_bak_*` tables) + a new managed Villes list.
Full flag-lists for the deferred items live in memory `project_migration_cleanup_todo.md`.
- [x] **Member fields normalized:** blood type (`B +`→`B+`, junk `---`→null); emails lowercased+trimmed (165);
      classe `1ere`→`1ère` + **bare numbers → French ordinals** (`8`→`8ème` … `T`→`Term`, 311 rows; validated by
      age ordering — bare numbers were an older import vintage, same grades); nationality `LI`→`Libanaise`; names
      `Marie- Lynn`→`Marie-Lynn`; fixed my own `Amin Andr?`→`Amin André`.
- [x] **Schools unified** ~80→40 distinct: collapsed case/accent/typo/faculty variants (AUB, USJ, Melkart, GLFL,
      International College, Balamand, Elysée, Louise Wegmann, IML, ALBA, Sainte-Famille, LAU, Athénée…) while
      KEEPING distinct campuses separate (La Sagesse Brazilia vs Achrafieh vs Aïn Saadé). FLAGGED for joint review:
      `Autre`/`TRAVAIL` (set null?), generic `Sagesse`/`Collège La Sagesse` (which campus?), the Institut
      Moderne/Français cluster, `Lycee Francais`, `Lypa`.
- [x] **Cities — managed list + admin page + picker + normalized:**
      - `member.cities` json_array setting (seeded `SeedData.CuratedCitiesJson`, ~100 curated Lebanese towns;
        auto-added to existing DBs by `SeedMissingSettingsAsync`).
      - Admin page `/admin/cities` ("Villes", sidebar Gestion group) — add/remove/filter, gated by **maitrise.manage**
        so a **Chef de Groupe** (and super-admin) curates it. Backend `UpdateCitiesCommand` + `PUT /settings/cities`
        (CG-accessible, unlike system settings which need associations.manage; upserts + dedupes accent/case-insensitive).
      - `CitySelect` (pure component, `cities` passed in) = searchable list + "Autre…" free-text fallback that snaps
        a typed name onto a canonical city on blur (`matchCity`). Wired into member detail + Ma fiche (add+edit
        address) and the demande wizard household address. Applicant portal gets cities via `ApplicantConfigDto.Cities`
        (NOT the authenticated /settings endpoint — avoids the portal's 401→login interceptor).
      - **Data normalized** on member_addresses: generic case/accent pass + alias map for transliterations
        (Beirut→Beyrouth, Ashrafieh→Achrafieh, Hadat→Hadath, Loueize/Louaizeh→Louaize, Hazmieh+Mar Takla→Hazmieh,
        Wadi Chahrour suffixes→Wadi Chahrour, Baabda+locality→locality, etc.). The final ~30 residuals were RESOLVED
        with the user (2026-06-24): composites→the clear town (`Baabda Hazmieh`→Hazmieh, `Raboueh-Kornet Chehwan`→
        Cornet Chehwan, `Zouk`→Zouk Mikael), `Sin saade`→Ain Saade, `Rawda`→New Rawda, `Hal dib`→Jal el Dib,
        `Ecole notre dame de Jamhour`→Jamhour, etc.; **5 new towns added** to the list (Ain Ekrin, Zekrit, Bkennaya,
        Dahr el Sawan, Haret el Set) + their variants mapped; junk (`City rama`/`WESTWOOD`/`Egerggre`/`Byekut`)→empty;
        district misspellings `Maten`/`Matn`→`Metn` (Metn/Keserwan kept as free-text regions). **0 non-canonical city
        values remain.** Curated seed now ~107 towns.
- FLAGGED for "fix together" (in `project_migration_cleanup_todo.md`): **45 duplicate members** (same name+DOB, BP
      re-import artifacts), **suffix-mangled leaders** (`ZiadCU GEBEILYCU` 1936 DOB etc. = dup leaders w/ unit-code on
      the name), **10 DOB errors** (years 2105/2160/3012, toddlers), **181 orphans** (no assignment — show only under
      "Sans unité"), 7 empty gender, the school flags, and the ~30 city residuals.

### Data cleanup pass 2 + card-number split (2026-06-24)
Interactive fix of the flag-lists + a member-number model change. Live-DB edits backed up as `_bak_*`.
- [x] **Schools (decided):** generic `Sagesse`/`Collège La Sagesse`→`Sagesse`; the Institut/Français cluster
      (`Institut Français`/`Institut Moderne Lycee Francais`/`Lycée Francais Institut Moderne Libanais (fanar)`)→
      `Institut Moderne Français`; `Lypa`→`Lycee Francais`; `TRAVAIL`→`Autre`; `Autre` kept as placeholder.
- [x] **DOB:** year-typo guesses (2105→2015, 2160→2016, 3012→2012, two 2026→2016); 4 toddlers (unguessable)→NULL.
      0 future dates remain. **Empty gender:** 5 leaders set (Admin Système left).
- [x] **Deletions (soft + assignments + login disabled):** `DELETE Gabriella ANTAKI`, `DELETE Michel NASSIF`,
      `Prenom NOM`, `ZiadCU GEBEILYCU` (test), `StephanieT GHOUBRILT`. **M-0420** name swap → `Charles KREIDI`.
      (`ZiadM GEBEILYM` left — not flagged.)
- [x] **Card-number split (Matricule + Numéro de carte):** `members.card_number` was overloaded (internal
      `M-/F-` OR the SDL/GDL external id). Now: `card_number` = internal **Matricule** (auto, always present);
      new nullable `external_card_number` = **Numéro de carte** (official SDL/GDL id). Migration
      `AddMemberExternalCardNumber`. **Backfill:** 624 rows whose card_number wasn't `^[MF]-[0-9]+$` had it moved
      to external_card_number + got a fresh internal matricule (M continued from 714→1326, F 1153→1165). Create/
      Update commands + DTOs + `ApplicantConfig` untouched-for-applicants; UI shows both (hero + Identité), create
      dialog has an optional Numéro de carte field, and the panel has an inline editor for the SDL number.
      my-profile carries external through on save (was at risk of nulling it). 2 members still have null matricule.
- [x] **Duplicate merges DONE — 48 pairs.** Keeper = active assignment > most assignments. Per pair: carried the
      SDL number onto the keeper (`external_card_number = coalesce`), moved the loser's assignments + contacts +
      documents/cotisations/progressions/custom-values + non-duplicate guardian links to the keeper, disabled the
      loser's login, soft-deleted the loser. Then **deduped** the now-redundant contacts (94 phones / 17 emails /
      23 addresses collapsed, keeping primary/oldest). 0 same-name+DOB duplicates among active members remain.
      Backups: `_bak_merge_*`, `_bak_dedupe_*`.
- [x] Migration tool: replicate the card-number split on re-import — DONE (commit 835a803, 2026-06-29;
      `tools/Migration/Program.cs` populates `external_card_number` from the source id + always generates an
      internal M-/F- matricule). Verified 2026-09-20.

### Data cleanup pass 3 — guardians / addresses / professions (2026-06-25)
Live-DB pass on the parent/contact data (untouched by passes 1–2). Backups `_bak_clean2_*`, `_bak_prof`, `_bak_gmerge_*`.
- [x] **Address country** unified → `Liban` (was Liban/Lebanon/liban/LIBAN/LIban/LB LIBAN/Libn/Lila/Beyrouth/junk =
      15 spellings); only real foreign value `UNITED STATES` kept. 97 rows.
- [x] **Guardian emails** lowercased + whitespace-stripped (57); **guardian phone junk codes** (`+009`/`+001`/`+03`/`+3`)
      → `+961` (5); guardian name double-space/lowercase-initial tidy-ups.
- [x] **Professions** accent+case folded: 1725 → 1515 distinct (663 rows), keeping the proper accented spelling
      (Ingenieur→Ingénieur, Medecin→Médecin, Femme au foyer→Femme au Foyer); gendered forms (Avocat/Avocate) kept.
- [x] **Duplicate guardians merged — 1615 losers → 1219 keepers** (4867→3252 active). Criterion = **same normalized
      name AND a shared phone (≥6 digits) or email** (high-confidence import dups only; same-name-alone left alone
      since unrelated families share names). Connected-component clustering (recursive CTE), keeper = most links;
      re-pointed 1556 links (one per keeper+member+role, partial unique index), moved + deduped contacts (1097
      phones / 1342 emails), soft-deleted losers. 0 same-name+shared-contact pairs remain. Data-only.

### Guardian profession domains (category + free-text title) (2026-06-25)
- [x] **Two-field model:** `guardians.profession` (free-text title, kept) + new nullable
      `guardians.profession_domain` (activity category, migration `AddGuardianProfessionDomain`; also widened
      `profession` 100→150). 41-domain managed list seeded in `member.profession_domains` (SeedData
      `ProfessionDomainsJson` + SeedMissingSettings): the 36 from the WEBDEV taxonomy (screenshots in BP 2026/jobs)
      + 4 we added (Ingénierie, Direction Entreprise, Sans profession / Au foyer, Immobilier) + **Autre**.
- [x] **Backfill:** keyword classifier (off-repo, in `BP 2026/professions_review.xlsx` round-trip) mapped the
      1,236 distinct free-text professions → a domain; the CU reviewed (164 overrides, 7 SUPPRIMER) in an Excel with
      a dropdown (openpyxl). Applied to the live DB: **2,475 guardians got a domain**, 8 junk titles cleared. Backup
      `_bak_guardian_domain`.
- [x] **UI:** guardian add/edit form (member-guardians) gained a **Domaine** SearchableSelect (from the managed
      list) before the free-text Profession; list shows "Domaine · Titre". GuardianDto/Create/Update + validators carry
      `professionDomain`.
- [x] **Demande wizard parity (2026-06-25):** `ApplicantGuardian.ProfessionDomain` (migration
      `AddApplicantGuardianProfessionDomain`); `ApplicantConfigDto.ProfessionDomains` exposes the managed list to the
      portal; the wizard guardian step has a **Domaine** picker before the free-text Profession;
      SaveApplicantHousehold stores it and SendDemandeResponses carries it onto the converted real Guardian. New
      applicants now self-categorize.

### Data / migration cleanups (2026-06-29, commit 835a803)
- **`GET /members/{id}/photo` unit-scoped (IDOR fix):** was auth-only (any logged-in user could fetch any
  member's photo by id). Now checks super-admin / own record / active-assignment-in-authorized-unit (same rule
  as viewing the member); an unauthorized caller gets **404** (not 403) so existence isn't leaked and the UI
  falls back to initials. PDF reports read files directly (unaffected).
- **Migration tool card-number split:** `tools/Migration` now replicates the live-DB split — `card_number` =
  internal Matricule (source M-/F- kept; otherwise a fresh one is generated), `external_card_number` = the
  official SDL/GDL id (any non-M/F source value). So a re-import no longer undoes the split.
- **Name-spacing: 0 anomalies** (double-space / trim / space-around-hyphen) — already clean from prior passes.
- **Orphans (177, no assignment at all): KEPT** per decision — 91 have no login (pure alumni), 86 have a login
  but no unit (FLAGGED: could disable those logins later; not done). 50 zero-day markers still await real member
  date corrections (can't auto-fix).

### Prod sync DONE + Functional-role order overhaul (2026-07-01)
- **PROD SYNCED (new.gndj.org is LIVE with all session work):** built on prod via `update.ps1 -Pull` (prod now
  has SDK+Node + the clone; `publish.ps1` `npm ci --include=dev` fix let `tsc` run), then restored a fresh dev
  dump (`C:\gndj-backups\gndj_data_20260701_1514.dump`, members=2493) via `reset-to-import.ps1`. **GOTCHA:** the
  script's interactive secure password prompt choked on special chars → use `-PgPassword '...' -Yes` (it also
  needs an ELEVATED shell). This carried live all the data fixes + code from this session (T&C/6ème, news
  cover/attachments/filter, photo unit-scope, card-split, maîtrise-team, classe promotion, checkup fixes).
- **Functional-role order overhaul — LIVE DEV DB ONLY** (backups `_bak_roles_20260701`, `_bak_roleassign_20260701`;
  reaches prod on the NEXT dump/sync). Roles per unit type were rank-tied (all maîtrise=100 etc.) so order was
  arbitrary (assistant showing above chief). Fixes applied on dev:
  - **Distinct ranks per unit type** (top = highest, N-1…0) in proper seniority: chief → assistant(s) → team
    leaders (1st/2nd/3rd) → base youth (★ default). Applied to Meute/Ronde/Troupe/Compagnie/Noyau/JEM/Clan/Groupe.
    **Feu left tied on purpose** (user: "leave as is for now").
  - **Clan:** "Pilote" is just another team → removed roles CEP/SEP, reassigned their (historical) assignments →
    CE/SE. Clan now CC>ACC>CE>SE>Routier★.
  - **Pionnières:** removed entirely (roles + the unit type; it had 0 units).
  - **Groupe:** created **`ACHG` "Assistant Chef(taine) de Groupe"** (profile `assistant-de-groupe`, is_maitrise);
    moved all 13 non-CG active group members into it; **archived** (kept, emptied) ACG/AUG/TG/SG/INT/ANIM. Groupe
    now = CG + ACHG (active) only. No default (group has no youth).
  - **JEM:** moved the ★ default from "Animatrice JEM" → "Jeune En Marche" (base youth).
  - FLAGGED: stray duplicate profile `assistant-e-de-groupe` (ACG, now archived, points to it) vs canonical
    `assistant-de-groupe` — re-point ACG + delete the stray later.

### Seed scout structure + doc-types drag + UI/UX pass (2026-07-04)
Closed the three queued items (all on main, pushed; frontend + seed CODE — reaches prod on the next deploy;
the one live-DB edit reaches prod on the next dump).
- [x] **Role structure baked into SEED + migration tool.** New `SeedData.ScoutStructure` = the single source
      of truth (10 unit types + their fonctions: codes/ranks/defaults/is_maitrise/profiles, derived from the
      corrected live dev DB). `SeedScoutStructureAsync` (fresh-DB bootstrap, guarded by "any unit type exists"
      so it never touches a migrated DB; wired into Program.cs after the profile seeders) creates them.
      `SeedFunctionalRoleRanksAsync` **rewritten**: known codes get authoritative rank/maîtrise/default from
      ScoutStructure (fixes the old keyword TIE at 100/50/10), unknown codes keep the keyword fallback; only
      per-unit-type roles are ranked (globals stay 0). **Feu left tied** (100/10) per request; **Caravelles**
      has no per-role fonctions. Migration tool (`tools/Migration`): drop **Pionnières** (PIO); set branch
      **colours** (Meute #edcf35 / Caravelles #5d9bfd) + **Clan age** 17-21 on import; remove Clan **Pilote**
      (CEP/SEP) roles + alias their assignments → CE/SE; **STEP 15b** consolidates non-CG group functions into a
      single **ACHG** (create it, move active members, archive the rest). Both projects build clean.
- [x] **Documents requis → drag-to-reorder.** Backend `ReorderDocumentTypesCommand` + `PUT /document-types/reorder`
      (document_types.manage; DisplayOrder = position, mirrors stages/badges). Frontend: the admin list is now a
      dnd-kit sortable list (grip handle) like Étapes/Badges/Pages; **dropped the "Ordre" column + the manual
      displayOrder form field** (new types append to the end); fetches all types (pageSize 100) so the full set is
      one orderable list; drag disabled while searching.
- [x] **Stray `assistant-e-de-groupe` profile cleaned up** (LIVE DEV DB): re-pointed ACG → `assistant-de-groupe`,
      removed the stray's permissions, soft-deleted it. Backups `_bak_stray_profile*_20260704`.
- [x] **UI/UX consistency pass** (two-agent audit + fixes, frontend-only): fixed systematically **un-accented**
      French toasts/dialogs/labels in api-keys.tsx, email-settings.tsx, passage-validation.tsx, passage.tsx
      (Clé API créée, Serveur/Modèle créé/modifié/supprimé, Passage approuvé/rejeté, finalize dialog…); added a
      **search clear (X)** button to associations / unit-types / document-types (matches cities & demande review);
      camps.tsx ad-hoc empty `<p>` → shared `<EmptyState>`, bare spinner → `variant="table"`, h1 → text-2xl;
      aria-label/title on the credential Copy buttons (members/detail.tsx). NOTE (deferred): a deeper accent sweep
      of remaining static labels/headers in email-settings/passage-validation; broader striping/pagination
      standardization across list pages (mix of striped-table vs card/dnd list is intentional per feature family).

### Team foulard colours recovered from WEBDEV (2026-08-26)
The migration had skipped `PatEqSiz.COULEUR1/COULEUR2` because they're WEBDEV **palette indices (0–16)**, not hex,
and we had no legend. Recovered it:
- **Legend reverse-engineered from the data itself** — the Meute/Ronde sizaines are *named* by their colour
  (Blanc/Gris/Roux/Bleu/Jaune…), internally consistent across every unit (M2=M3=M10, R1=R2=R3), so index→colour
  decodes directly. **Validated live**: the CU confirmed the decoded Troupe-2 patrol colours. The last 2 indices
  (4, 7 — no colour-named anchor) came from the **old site's "Couleurs du scalp"** (`C:\Users\Administrator\
  Documents\old`): Marmousets=Bleu/Gris → 4=Bleu, Péléa/Abeilles int=Gris → 7=Gris. Final legend: 0 Indigo · 1
  Fauve · 2 Brun · 3 Blanc · 4/5 Bleu · 7/8 Gris · 9 Jaune · 10 Marron · 11 Mauve · 12 Noir · 13 Orange · 14
  Rouge · 16 Vert. `couleur1` then `couleur2` (two-tone foulards, 32 teams). **Non-colour teams → white** (per the
  CU): numbered Compagnie équipes, all maîtrises, and the Noyau/JEM/Feu/Groupe/Clan branches (which don't use
  foulard colours) — the `12/12`/`0/0` WEBDEV defaults, except colour-named defaults (Noir/Marron/Indigo sizaines)
  keep their colour.
- **Applied to the LIVE dev DB** (`deploy/patches/008_team_colours.sql`, backup `_bak_team_colors_20260827`):
  113 of 115 teams set (46 white, 67 real, 32 two-tone; the 2 skipped are "NA" placeholder junk). The patch is
  idempotent (matches by unit code + totem, only where `color1 IS NULL`) so it **reaches prod on the next deploy**
  without a dump. **Migration tool** (`tools/Migration`) now decodes the indices via a `TeamColour()` legend so a
  re-import keeps them (new BP-created teams → white).
- **CU verification**: this is a **one-time, this-year** ask, so it lives in the **CU onboarding email**
  (a manual line the CG adds to the `cu_rentree` / `cu_rentree_nouveau` templates before sending) — NOT the
  rentrée checklist (a rentrée task was built then reverted, since the list is meant to recur yearly). CUs
  correct any leftover colour in-app.
- The palette was reviewed by the CU via a generated `GNDJ_couleurs_equipes.xlsx` (Desktop, painted hex cells +
  Légende tab). Builds clean (dotnet Release + migration tool). DEV until deploy.

### Entrée-progression backfill (2026-08-27, LIVE DEV DB — one-time data op, AUTO-APPLIED on prod via patch 009)
Every member was given the missing **"Entrée à …"** progression for each unit they passed through. Shipped as
**`deploy/patches/009_entree_progression_backfill.sql`** — auto-applied ONCE by `DataPatchRunner` on the next
prod startup (idempotent; portable — admin resolved by email + unit types by code, no hardcoded per-DB GUIDs; no
BEGIN/COMMIT / psql meta-commands per the runner's execution model). Backup `_bak_progressions_entree_backfill`;
reversible by `DELETE … WHERE notes='Entrée — ajout automatique'`. (Dev was done by a manual run first; the patch
is a no-op there.)
- **Going forward, the entrée is auto-created** so the data stays consistent without re-running the backfill each
  year (previously entrées were ONLY ever entered by hand — passage/demande created none). New shared
  **`Common/EntreeStageResolver`** (`ResolveStagesForUnitsAsync`, batched) matches the entrée stage by EXACT NAME
  per unit-type code (display_order is unreliable — many stages share order 0, Meute's order-0 stage is "1er
  Sizenier"; CLAN has an extra inactive "Entrée Equipe Pilote"). Wired into: **passage finalize** (creates the
  destination unit's entrée when a member joins a DIFFERENT unit — same-unit team/role change gets none; idempotent
  via a pre-loaded existing-entrées HashSet, so returning to a former/backfilled unit doesn't duplicate) and
  **demande acceptance** (`SendDemandeResponses` creates the joined unit's entrée for the new member). Both
  batch-resolve stages ONCE outside their advisory-locked loops (no N+1), date = the assignment start (passage.date
  / demande.member_start_date, else today), note `Entrée — ajout automatique`. Verified live end-to-end (isolated
  throwaway units + year, then cleaned up): passage move → entrée created; re-entering a unit with an existing
  entrée → no duplicate; demande accept → member + assignment + entrée. Backend-only, DEV until deploy.
- **Rule:** for every `(member, unit)` with a **youth (non-maîtrise)** assignment, insert that unit's entrée if
  missing; **Groupe** included BY FUNCTION (any GRP assignment, maîtrise incl. → "Entrée au Groupe"). date =
  **earliest real assignment start** in that unit; **zero-day markers** (`start_date = end_date`) excluded; note
  `Entrée — ajout automatique`; admin-attributed; skip if that exact entrée already exists.
- **Pre-step cleanup (also for prod):** soft-deleted **149** migration-artifact progressions where a **Ronde
  (girls) stage** sat on a **Troupe/Clan (boys) unit** (boys are never in a Ronde) — the only stage↔unit-type
  mismatch class in the table; 0 remain.
- **Created** the missing **"Entrée au Noyau"** stage (NOY had none; active, order 0). Caravelles skipped (0
  assignments). Pionnières was already soft-deleted (prior session), so no action.
- **Result:** +2,374 auto entrées (TRO 636 · COM 573 · MEU 263 · NOY 258 · CLAN 258 · RON 214 · JEM 81 · FEU 68 ·
  GRP 23). 0 duplicates introduced; 34 pre-existing duplicate MANUAL entrées left untouched (separate legacy issue).
  CLAN mapped by exact name to dodge its extra "Entrée Equipe Pilote" stage; JEM matched via ASCII-anchored ILIKE
  (apostrophe in "l'équipe"). Piloted on Troupe 3ème Beyrouth first (215 rows) as the prod rehearsal.

### Accent/legacy-value audit — contact type + country Selects (2026-09-12)
Follow-up to the guardian Relation fix: swept every string-enum `<Select>` for the same class of bug (a stored
value that doesn't EXACTLY match an accented/fixed option → Radix renders empty). Method: dumped distinct DB
values per field and compared to the option lists.
- **Clean (no action):** members.gender (`Masculin`/`Féminin`, matches options), blood_type, classe (all in
  `member.classes` exactly), parents_situation (only `Unis`), demandes.gender — all accent-consistent with their
  option lists.
- **Broadly affected → FIXED:** contact **type** + **country** fields hold rich migrated values outside the fixed
  Selects — `guardian_phones.type` "Mobile Mère"/"Mobile Père" (~3.7k), `guardian_emails.type` "Mère"/"Père" (~4.3k,
  the relationship leaked into the type — display-only, works as a label), `member_addresses.type` "Domicile
  principal" (1373) / "Résidence secondaire", `member_phones.type` "Bureau"/"Résidence Secondaire (Tél.)",
  `member_emails.type` "Indéterminé"/"GNDJ"/"Professionnel", `member_addresses.country` "UNITED STATES". These
  render EMPTY when editing the contact (Radix Select can't show an out-of-list value; save-without-touching
  preserves it, but it *looks* blanked). Fix: new **`optionsWithCurrent(options, value)`** (lib/options) appends the
  stored value as a selectable option when it's not already present, applied to the phone/email/address **type** +
  **country** Selects in the member panel (members/index.tsx) + Ma fiche (my-profile.tsx) EDIT dialogs (add dialogs
  default to a valid option, so they're untouched). Non-destructive, future-proof. Guardian contacts are add/delete
  (no edit Select), so their labels display fine.
- **`SearchableSelect` already hardened** (prior commit) to show the raw value when out-of-list — covers Domaine /
  nationalité / école / ville.
- **FLAGGED (data-quality, not fixed — non-breaking now):** nationality holds 5 two-letter codes ("BE"/"CL"/…),
  one "Collège Elysée" near-miss vs the schools list, "UNITED STATES" address. And when the **parents-situation
  backfill** finally runs (held pending a WEBDEV re-export), it MUST write accented `Séparés`/`Divorcés` to match
  the options. Frontend-only, DEV until deploy.

### École — searchable dropdown + variant data cleanup (2026-09-12)
Follow-up to the "Par école" duplicate (root cause: parents used the "Autre…" free-text escape hatch instead of
picking from a long, UNSEARCHABLE `<Select>`, creating spelling variants). Two fixes:
- **Shared `SchoolSelect`** (`components/shared/school-select.tsx`, mirrors `CitySelect`): a SEARCHABLE dropdown
      over the managed `member.schools` list + an "Autre… (saisir)" free-text fallback that snaps a typed name onto
      the canonical entry on blur (`matchSchool`, now punctuation-insensitive) and collapses back to the list when
      it matched. Pure component — the caller passes `schools` (authenticated forms via
      `useSettingArray('member.schools')`; the applicant portal via `config.schools`, so the isolated portal never
      hits the authenticated /settings endpoint). Replaced the duplicated plain-`Select` + "Autre…" + free-text
      pattern in **4 places**: the demande wizard (removed its `schoolOther` state + `matchSchool` import), the
      member edit panel + create dialog (`members/index.tsx`, dropped the now-unused `matchSchool` import), and Ma
      fiche (`my-profile.tsx` — which also GAINED the match-on-blur it was missing). Now a parent types "notre dame"
      and picks the canonical instead of scrolling → "Autre…" becomes a true last resort for genuinely new schools.
- **Data patch `017_normalize_jamhour_school.sql`**: snapped the 7 existing 2026-2027 demandes with a Jamhour
      variant spelling → canonical "Collège Notre-Dame de Jamhour" (matched by a punctuation/accent/case-normalized
      key covering `collegenotredamedejamhour` + `notredamedejamhour`; excludes already-canonical; idempotent). A
      defensive members clause is a no-op on current data (members were verified clean, only the canonical ×2019) but
      future-proofs prod. Applied to dev live (7 rows → all "Collège Notre-Dame de Jamhour", 230 total); auto-runs on
      prod at next deploy.
- Build clean (tsc + eslint + vite). Frontend + data patch, DEV until deploy.

### Data-cleanup batch — orphan logins, zero-day page, disable-login, parents-situation (2026-09-20, DEV until deploy)
Worked the deferred "Data cleanup" pending items with the user.
- **Orphan logins disabled** — data patch `022_disable_orphan_logins.sql`: disable the login of members with an
  active account but NO assignment who NEVER signed in (excludes super-admins). Dev: 51 disabled (backup
  `_bak_orphan_logins_20260920`); reversible via the panel toggle. The only logged-in orphans left are the 2
  super-admins (Admin Système + the human super-admin) — correct.
- **"Affectations à dater" page** (`/admin/zero-day-assignments`, sidebar Unités & maîtrise, maitrise.manage) — a
  CG review worklist for **zero-day** assignments (`start_date == end_date`, 1-day WEBDEV migration markers with an
  unknown real duration; ~199 on dev). `GetZeroDayAssignmentsQuery` + `GET /assignments/zero-day` (IsGroupManager).
  Per row (member→fiche, unit/role, date, actif/ancien badge): **Dater** (dialog → UpdateAssignment with real
  start+end, end>start → drops off the list) or **Supprimer** (single + bulk). Reuses the existing update/delete
  endpoints. Member fiches untouched.

### Username rules unified (2026-10-09, DEV until deploy)
- `UsernameFactory` (Common) is the ONE rule for new logins (« Nouveau membre », « Comptes manquants », demande send):
  `Normalize` keeps only a–z / 0–9 / inner hyphens (all accents removed, œ→oe, spaces/apostrophes/dots dropped:
  « Jean Marie D'Amour » → `jeanmarie.damour`); `Candidates` = prenom.nom → prenom.<father initial>.nom → …nom2, nom3;
  `PickUnique` (in-memory, demande send — father = the account's Père) / `GenerateUniqueAsync` (DB). Existing
  usernames are untouched (3 malformed ones left on purpose). Tests: `UsernameFactoryTests`.

