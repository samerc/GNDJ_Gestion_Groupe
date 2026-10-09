# Progression, units & functions

Stages/badges, unit types, functions (rank, default, archive).

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

### Phase 3 — Progression & Badges (Complete)
- [x] Scout stages (per unit type, ordered, isActive, isBadgeStage flag)
- [x] Badges (per unit type, isActive, linked to badge-type stages)
- [x] Member progressions (stage + optional badge, date, location, notes)
- [x] Admin page: Progression scoute (tabbed: Étapes / Badges, filtered by unit type)
- [x] Progression scoute redesigned (2026-06-16) friendlier: **unit-type-first** (pills at top, defaults to first —
      no more all-types jumble), Étapes shown as a **vertical numbered ladder** (drag-reorder, inline Switch for
      active, usage count, edit dialog), Badges as a **chip grid** (inline Switch, hover edit/delete). Both have
      **inline quick-add** (type a name → Enter); the stage/badge **code is auto-generated** from the name (unique
      per unit type, slugified) when blank — backend CreateScoutStage/CreateBadge relaxed Code validator + added
      ProgressionCodes.ResolveAsync. StagesTab/BadgesTab → StagesLadder/BadgesGrid (also used on unit-type detail).
- [x] Drag-and-drop reordering for stages and badges (@dnd-kit)
- [x] Stages/badges tabs on unit type detail page (pre-selected unit type)
- [x] Progression tab on member detail, CU dashboard, Ma fiche
- [x] Auto-resolve unitId/unitTypeId from member's active assignment
- [x] New permissions: progression.view, progression.manage

### Archive-instead-of-delete + bulk delete (2026-06-22)
- [x] **Fonctions / Étapes / Badges**: deleting one that is USED by members no longer fails — it is ARCHIVED
      (hidden from pickers but kept so it still shows on the members who hold it); UNUSED ones are hard-deleted.
      Backend delete handlers return `{ archived: bool }` (true=archived, false=deleted). FunctionalRole got a new
      `IsArchived` column (migration `AddFunctionalRoleIsArchived`) + `Unarchive` command/endpoint + `IsArchived`/
      `UsedByMembers` on its DTO; ScoutStage/Badge REUSE their existing `IsActive` flag (archive = IsActive=false,
      un-archive = the existing inline Switch). "Used" = ANY assignment/progression (active OR historical).
- [x] Archived functions are filtered out of the assignment "Fonction" picker (kept if it's the row's current value,
      shown as "(archivée)") and excluded from the demande base-role resolution. Stage/badge dropdowns already filter
      IsActive.
- [x] **Bulk delete** added to all three admin lists (checkbox per row + select-all/bar): functional-roles-list,
      StagesLadder, BadgesGrid. Bulk runs the per-item delete (archive-if-used) and shows a summary toast
      (N supprimée(s) · M archivée(s)/désactivée(s) · K échec(s)). Fonctions list also shows an "Archivée" badge +
      a Réactiver (unarchive) action and sorts archived rows last. Verified live: delete-of-used → {archived:true} +
      is_archived set; unarchive restores; build clean (dotnet + tsc).

### Functions: drag-to-rank + explicit default (2026-06-22)
- [x] Replaced the manual "Rang" number field with **drag-to-rank** on the unit-type page. `FunctionalRolesList`
      gained a `sortable` mode (used by unit-type-detail, `sortable` prop): the type-specific non-archived functions
      are a dnd-kit ladder, **top = most senior** (highest rank). Reorder → `PUT /functional-roles/reorder` sets
      `Rank = n-1-index` (top highest, matching the rank-desc maîtrise displays). Rank dropped from Create/Update
      commands; new functions auto-rank to `max+1` (senior end, never the default). The all-types `/admin/roles`
      page keeps the flat table (no cross-type drag); archived + global functions shown in separate non-draggable
      sections in sortable mode.
- [x] The "auto-assigned to new members" role is now an **explicit marker** (`IsDefaultForNewMembers`, one per unit
      type) instead of "lowest rank". Star toggle in the sortable list → `POST /functional-roles/{id}/set-default`
      (clears the others in that unit type). Migration `AddFunctionalRoleDefaultFlag` backfills it = each unit type's
      current lowest-rank role (preserves behaviour: Meute→Louveteau, Ronde→Jeannette, …). SendDemandeResponses
      base-role resolution now prefers the explicit default, falling back to lowest-rank (non-archived) if none set.
      Verified: backfill = 1/type, set-default round-trip (exactly one default), build clean, ordering top=senior.

### Unités & Types d'unité — one record page for create + edit (2026-08-18)
Removed the confusing split where **creating** a unit/type used a popup form but **clicking a row** opened a
separate detail page. Now the **detail page IS the record page** for both (frontend-only; all fields already on
the GET/POST/PUT endpoints — no backend/migration change). DEV until deploy.
- **Types d'unité:** `unit-type-detail.tsx` gained an editable **"Informations"** section (Nom/Code/Description/
  Nb années/Âge min-max/Couleur/Description publique) — read-only with a **Modifier** button, or the inline form.
  `id="new"` (route `/admin/unit-types/:id` already matches `new`) = **create mode** (form shown blank; on save →
  `navigate('/admin/unit-types/<newId>')`). The Fonctions/Étapes/Badges tabs render only for an existing type.
  The list page (`unit-types.tsx`) dropped the create/edit **Dialog** + the row **pencil**; "Nouveau type" →
  `/admin/unit-types/new`; row-click → detail; delete stays inline.
- **Unités:** same treatment in `units/detail.tsx` — an editable **Informations** section (Nom/Code/Association/
  Type/Description/Statut) + the **Site public** block (publish/slug/date de fondation) inline, plus the existing
  summary cards + teams list (existing units only). `/units/new` = create mode → on save navigates to `/units/<id>`.
  `units/index.tsx` dropped the Dialog + pencil; "Nouvelle unité" → `/units/new`; the eye icon (now "Voir /
  modifier") + delete stay.
- `useCreateUnit`/`useCreateUnitType` now **return `{ id }`** (POST already returned it) so the page can navigate to
  the new record. `useTeams` gained an **`enabled`** flag so the teams query doesn't fire in unit create mode
  (`unitId="new"` isn't a valid guid).

### "Badge" progression captures WHICH badge (2026-09-12)
A CG saw a change-request "Progression : Badge — Troupe 2ème Beyrouth" with no badge NAME. Root cause: the app's
**badge-stage** mechanism (a stage flagged `IsBadgeStage` shows a badge picker on record/propose → captures a
specific `BadgeId` → summary shows "Badge · <name>") was **completely unused** — 0 stages flagged — while a stage
literally named **"Badge"** (Troupe + Compagnie, used 88×) had `is_badge_stage=false`, so no badge was ever
captured. (The admin "Étape avec badge" toggle was hidden in the 2026-08-18 redesign, but the flag is still
**preserved on save** — the stage form loads `stage.isBadgeStage` and sends it back — so a data flag sticks.)
- **Data patch `015_badge_stage_flag.sql`**: `is_badge_stage=true` where `lower(trim(name))='badge'` (idempotent;
  applied on dev → both Badge stages flagged, verified via `/scout-stages/list` → `Badge -> True`; ships to prod on
  next deploy).
- **Migration tool**: the stage insert now sets `is_badge_stage = (name == "Badge")` so re-imports keep it (was a
  hardcoded `false`).
- No frontend/backend code change — the propose/record form (`member-progression.tsx`) already shows the required
  badge picker for a badge-stage, and `ProposeProgression` already bakes "Progression : {stage} · {badge} — {unit}".
- **Limits (told the user):** existing badge-less "Badge" progressions + the reported pending proposal predate the
  flag (BadgeId null → still show generic "Badge") — the CG rejects the pending one so the member re-proposes WITH a
  badge. Editing an old "Badge" progression now requires picking a badge (validation), which is correct.

### Batch 2026-09-19 — global progression items + demande/passage/fonctions UX (DEV until deploy)
A batch of adjustments; all on main, DEV until deploy. Two migrations generated + applied to dev; backend rebuilt
(0/0), frontend tsc+eslint+vite clean.
- **Progression: GLOBAL étapes/badges as a separate "Général" entity.** `ScoutStage.UnitTypeId` +
  `Badge.UnitTypeId` are now **nullable** (null = global, available to every branch; migration
  `MakeProgressionUnitTypeNullable`) AND `MemberProgression.UnitId` is nullable (a global progression has no unit;
  migration `MakeProgressionUnitNullable`). Admin `Progression scoute` gained a **"Global (tous les types)"** pill
  (sentinel `'__global__'`) to manage them apart; `Get{ScoutStages,Badges}Query` gained `GlobalOnly` (+ controller
  `?globalOnly=`); create commands accept null UnitTypeId (with a "…globale…" dup-code message). The picker `/list`
  endpoints take `?global=` and are **NOT merged** — a real unit returns ONLY its own items, `global=true` returns
  ONLY globals. Member form (`member-progression.tsx`) unit picker has a separate **"Général (hors unité)"** option
  (`GENERAL='__general__'`) → global items only, stored with null unit (shown "Général"). Create/Update/Propose
  commands + `ProgressionPayload` all nullable-unit + global-stage logic (a global stage forces null unit; the
  review-approve skips the per-unit authz check when `p.UnitId` is null). Add-button gate relaxed to
  `canManage || proposing`. `EntreeStageResolver` + passage entrée-dedup verified safe. Key gotcha this session:
  the FIRST attempt merged globals into every unit's list, which the user rejected ("separate entity, not in all
  units") → reverted to the separate-option model above.
- **Demandes — export Excel = the FULL file + robust import.** `DemandeSheetService`/`IDemandeSheetService`/
  `DemandeSheetHandlers`: the decisions `.xlsx` now carries every field per demande (built via the shared
  `DemandeReviewProjection.BuildAsync`), with `Réf.` + a highlighted `Décision` (col 3, dropdown) kept at the left.
  Import reads ONLY `Réf.` (id) + `Décision` **by header name** (reorder/edit/sort/annotate anything else is
  harmless); a new typed `DemandeSheetFormatException` makes the import **fail loudly** if either header is
  renamed/deleted (was silently importing nothing).
- **Demandes — filter on many more fields** (`demande-validation.tsx`, client-side over the loaded set so the
  send-gate is unaffected): École / Unité décidée / Nationalité / Ville / Situation parents / Réponse envoyée /
  Proche-scout type dropdowns + toggles (Dossier incomplet / Avec proches / Fratrie / Demande précédente) + result
  count + Réinitialiser. Via a memoized `matchesFilters`.
- **Passages — "Sans passage" as a top stat card** (`passage-validation.tsx`): 5th amber card (uses
  `missingInScope`, grid → `lg:grid-cols-5`); bottom block trimmed to a one-line hint.
- **Fonctions — search / sort / filter / mobile** (`functional-roles-list.tsx`, table mode only): search box +
  sortable columns (module-scope `SortTh`) + Profil / Maîtrise-Jeunes / Statut filters + Réinitialiser; controls
  stack on mobile, row actions `h-9 w-9 sm:h-7 sm:w-7`. Drag-to-rank unit-type view untouched.
- NOTE: dev admin password is NOT `Admin123!` (dev synced from prod) → backend verified via build + psql schema
  checks (both migrations applied, columns nullable YES), not live JWT calls.

