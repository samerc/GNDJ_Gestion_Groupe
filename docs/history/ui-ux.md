# UI, navigation & settings

Design passes, menus/navigation, Paramètres hub, dashboards, dark mode, mobile, QOL.

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

### Mobile Responsiveness Pass (Complete)
- [x] All 2-column layouts (members, dashboard, photo-session) stack vertically on mobile
- [x] Drag handles hidden on mobile, member lists get compact max-height
- [x] All tables have overflow-x-auto + min-width for horizontal scrolling
- [x] Button bars wrap on mobile (flex-wrap)
- [x] Form grids stack on mobile (grid-cols-1 sm:grid-cols-2/3)
- [x] Dialog max-widths responsive (max-w-[95vw] sm:max-w-lg/3xl)
- [x] Card designer preview scales to fit mobile viewport
- [x] Audit log filters in responsive grid
- [x] Bulk action bars stack on mobile (flex-col sm:flex-row)
- [x] All TabsLists have overflow-x-auto flex-nowrap for horizontal scroll

### Mobile Pass 2 — newer pages (Complete — 2026-06-22)
Audited (3 parallel agents) + fixed the public site, applicant portal, and CG demandes screens (all built
AFTER the first mobile pass). Verdict: every flow is completable on a phone. Fixes:
- [x] Applicant wizard: relations "Situation" select was a fixed `w-72`/`sm:w-96` that overflowed the card on a
      ~360px phone → now `flex-1 min-w-0 sm:max-w-96` (BLOCKER fixed).
- [x] SearchableSelect dialog (nationalité/profession, also member forms): `max-w-sm` → `max-w-[95vw] sm:max-w-sm`
      so it has gutters on ≤384px screens.
- [x] Public CMS RichContent: author HTML now constrained — `[&_img]:max-w-full h-auto`, `[&_table]:block
      overflow-x-auto`, `[&_pre]:overflow-x-auto`, `break-words` — stops wide images/tables/long URLs overflowing
      `/actualites/:slug`, `/p/:slug`, news article.
- [x] Mounted `<Toaster>` in PublicLayout (was missing — latent silent-toast trap like the one that bit the portal).
- [x] Public mobile menu: `max-h-[calc(100vh-4rem)] overflow-y-auto` so long page lists stay reachable while body
      scroll is locked.
- [x] CG demande-validation: filter controls + bulk-action controls now `w-full sm:w-NN` (stack cleanly on mobile
      instead of a ragged fixed-width row); review table hides École/Relations/Fratrie columns `< md` (still shown
      in the detail drawer) for a compact phone table; detail-drawer field grid `grid-cols-1 sm:grid-cols-2`;
      keyboard-shortcut hint hidden on mobile (`hidden sm:block`).
- FLAGGED (tricky / desktop-oriented, not fixed): the 10-column triage table is inherently dense on a phone —
      mobile path is tap-a-row → full-width detail drawer (works); keyboard triage (A/R/←/→) is desktop-only but has
      full tap equivalents; DateInput is manual JJ/MM/AAAA entry (deliberate, no native calendar). Visual checks via
      headless Edge confirmed layouts stack/wrap; note headless window-size crops the right edge ~30px on ALL pages
      (incl. known-good /login), so it's unreliable for pixel-exact overflow — code audit was the source of truth.

### Admin UX Pass + Unit Type Colors (Complete)
- [x] Dashboard professional bar charts (value labels, animated fills)
- [x] Members search: X button to clear
- [x] Units page: association + unit-type filters, search clear, detail (Eye) icon separate from edit
- [x] Unit detail: teams divided with expandable member lists, Maîtrise pinned top, up/down reorder
- [x] Functions page: color-coded table by unit type, sortable layout
- [x] Change password moved to header user dropdown (global)
- [x] Session: auto-refresh while active, warn/expire only after 15 min idle
- [x] Admin menu grouped: Données scouts / Gestion / Administration
- [x] Unit Type Color: unique hex per type (enforced), used in functions list + diagrams
- [x] Cotisation: single entry per year with multiple payment lines (multi-currency); A5 landscape receipt with logo header + totals via exchange rates; settings for default currency + rates
- [x] CG cotisation dashboard, custom report templates (CG creates, CU generates)
- [x] Progression path diagram (UnitTypeProgression): per-gender/role flow, passage auto-suggest
- [x] Skeleton loaders (page/table/cards/detail/form/profile variants)
- [x] Member documents screen redesign (progress bar, color-coded status borders)
- [x] Member "Mes documents" page + admin route guard (non-admins blocked from /admin/*)

### UI Polish Pass (Complete — 2026-06)
- [x] Typography: Inter Variable (@fontsource-variable/inter), font smoothing + tabular/cv feature settings,
      tightened heading tracking
- [x] Design tokens (index.css): soft OKLCH shadow scale (--shadow-2xs…lg) + `.shadow-card`/`.shadow-elevated`
      utilities, refined thin custom scrollbars, selection color, full-height root
- [x] Primitives polished: Card (rounded-xl + soft elevation), Button (depth on solid variants + active press),
      Input (refined focus ring), Table (uppercase muted header on tinted bg), Dialog (blurred overlay + soft shadow)
- [x] Shell: sidebar brand mark (gradient Compass tile + wordmark/subtitle), active-nav teal accent bar +
      highlighted item + colored icon, refined section labels; sticky blurred header with gradient avatar
- [x] Login redesigned: gradient backdrop with glow, brand mark, elevated card, footer
- [x] Dashboard: header subtitle, rounded-xl stat icon tiles, rounded chart bars
- [x] Branding: page title "GNDJ Scout — Gestion de Groupe", lang=fr, theme-color, custom navy fleur-de-lis favicon
- [x] Verified visually via headless Edge screenshots (login, dashboard, members, passage) — builds clean, tsc 0 errors

### CG dashboard — year-aware (2026-06-22)
- [x] The admin/CG dashboard year selector was effectively a no-op (only `unpaidCotisations` was year-scoped,
      and the cotisation table is empty so it never changed; every other tile was a live "today" snapshot —
      `totalMembers` even counted ALL members incl. alumni = 2465). FIXED: `GetAdminDashboardQuery` now scopes
      EVERY tile (total/gender/units/ages/unpaid/docs) to members whose assignment was **active during the
      selected scout year** — a date-range overlap on the Oct 1→Oct 1 window (`ScoutYearWindow`,
      `StartDate < windowEnd && (EndDate == null || EndDate > windowStart)`; matches the migration's per-SY split
      so past years are accurate). Ages computed as of that year's Oct 1. "Sans unité" is 0 in year-scoped view.
      Verified: 2025-26 → 1404, 2024-25 → 588, 2023-24 → 623 (was identical across all years). NOTE: the current
      year (1404) counts everyone active at ANY point this year incl. mid-year leavers, so it's higher than the
      1135 "active right now"; switch the in-progress year to a point-in-time "today" snapshot if that's preferred.
      This supersedes the old "Option 1" honest-counts item for the dashboard (members LIST alumni toggle still TODO).

### Post-publish polish (2026-06-28)
- **Mobile UX:** unit-leader dashboard reworked to a true mobile master/detail (full-width list → tap → full
  detail with a Retour button; single-scroll action bar; desktop split-pane unchanged) + member photos in the
  roster list (PhotoPath added to the dashboard DTO). Passage page → card list on mobile (desktop table kept).
  Trombinoscope photo fills a 3:4 box (was letterboxed smaller than the placeholder). Rentrée rollup progress
  bar stacks under the text on mobile.
- **Docs consolidation:** merged `INSTALL_GUIDE.md` into a single `docs/DEPLOYMENT.md` (Part I = copy-paste
  first install, Part II = ops/reference incl. build-the-staging-package + ship paths). Updated all `§`-number
  refs (CLAUDE.md/.gitignore/publish.ps1/memory) to the new Part numbers.
- **Project-wide code commenting pass** (comments-only, verified no code removed): role summaries + non-obvious
  logic notes across Domain/Application/Infrastructure/Api + the whole React frontend; matched existing density,
  skipped shadcn ui primitives + auto-generated migrations.
- **Swagger/OpenAPI now complete:** enabled the XML doc file (`GenerateDocumentationFile`, NoWarn 1591;1573 —
  CS1570 kept on); a Program.cs **operation transformer** derives 400/401/403 from each endpoint's metadata
  (no per-endpoint clutter); `///` summaries on all 34 controllers + every action (251/251 real endpoints) with
  required-permission notes, plus `[ProducesResponseType]` for non-systematic 404/201/anonymous-401. Removed the
  WeatherForecast template leftover. Verified live: spec lists summaries + response codes on every operation.

### Pre-launch shakedown — member/CU journeys + UX fixes (2026-07-10)
Ran the full member + CU flows live (real accounts) + 2 parallel screen-review agents. **Everything worked
end-to-end** (member self-edit profil/médical; document upload → CU approve + reject-with-reason → member sees
status+reason; trombinoscope this-year available; reset-password full loop; IDOR held — a youth got 403 approving
her own doc + 404 reading a co-unit member). Fixed the UX gaps most likely to generate support calls:
- **Ma fiche add phone/email/address (my-profile.tsx):** the ADD dialogs swallowed errors and had no double-submit
  guard — a failed add showed nothing (dialog stuck with the typed data) and a double-tap made duplicates. Now
  toast on failure (visible over the modal), keep the dialog open with the data, disable the submit while pending.
  Delete-contact got try/catch + a `loading` gate on the confirm dialog.
- **member-guardians self-service:** add phone/email now try/catch+toast; phone/email delete surfaces errors +
  disables while pending; the create button reads "Ajouter" in self-service (was the jargon "Créer et lier").
- **Members panel Modifier-on-every-tab (members/index.tsx):** tabs made **controlled**; the Modifier/Save controls
  now render ONLY on the Informations + Médical tabs (form tabs) — before, a CU on Documents/Progression saw Save
  with no form and could persist stale data (the exact bug fixed earlier in Ma fiche had regressed here).
- **Document matrix quick approve/reject (unit-documents.tsx):** errors → toast (were a hidden top banner) +
  double-submit guard (`reviewMutation.isPending`). Exempt-toggle error → toast too. (Mobile already works via the
  cell-tap → review dialog; the quick buttons are a desktop hover convenience.)
- **CU reports empty-unit (dashboard-unit-leader.tsx):** roster/export/cards are blob responses, so a backend JSON
  error was unreadable → now `parseBlobError` shows the real "aucun membre" message (matches the zip fix).
- **French accents** on the password pages + login ("Réinitialiser", "expiré", "réinitialisé avec succès",
  "Retour à la connexion", "Mot de passe oublié ?").
- **Youth self-propose now parcours-filtered (ChangeRequestHandlers `GetProposableUnitsQuery`):** the propose-fonction
  unit dropdown showed ALL active units → now only units of the member's **current branch** (their active
  assignments' unit types), so a youth proposes within their branch (a Compagnie guide sees the 4 Compagnie units,
  NOT the Noyau or other branches). Falls back to all active units only if the member has no active assignment.
  Verified live: Naï (Compagnie youth) → exactly the 4 Compagnie units. Builds clean (dotnet+tsc+eslint), DEV until deploy.
- **FLAGGED (not fixed) for the user:** the synthetic `@scouts.gndj` login means parents typing their real email get
  "Compte introuvable" (known go-live decision); "Test Doc Type" (TDT) is a leftover junk document type to remove;
  Clara ABBOUD has a duplicate active Compagnie-1 assignment (test artifact). Deferred: shared-mutation "greys all
  rows" on change-requests/doc-matrix; a member has no self-withdraw for a mistaken proposal.

### CG + Super-admin shakedown + admin-screen UX hardening (2026-07-10)
Ran the CG + Super-admin journeys live (access control CLEAN — CG group-wide read+write, correctly 403 on org
structure [units/unit-types/roles/settings/api-keys/security-profile create]; super-admin all 53 perms; the one
real leak this whole pass found was the CU cotisation one, already fixed). Then 2 review agents swept the CG +
super-admin screens and I fixed the findings across ~20 admin files (all frontend; build + tsc + eslint clean):
- **Silent delete failures → toasts (the #1 fix, 9 screens):** associations / unit-types / units / units-detail
  (teams) / document-types / custom-fields / news / events / resources deleted via `setError()` which renders in a
  now-CLOSED dialog → an FK-blocked delete showed NOTHING. Now `toast.error(parseApiError)`. (pages/cities already
  toasted.)
- **In-use delete → "Désactiver" (document-types, custom-fields):** when `documentCount`/`valueCount` > 0 the confirm
  warns it's in use + shows the count and the button becomes "Désactiver…" (opens the edit dialog's isActive toggle)
  instead of a hard-blocked delete. Mirrors the functions/stages archive pattern.
- **Cascade counts** added to org-delete confirms (association→units, unit-type→units, unit→teams+members, team→members).
- **Double-submit guards:** demande drawer keyboard triage (A/R) now checks `busy`; progression/stages quick-add
  Enter checks `isPending`; camp Archive + delete-game get loading guards.
- **Passage triage per-row disable:** quick approve/reject used one shared mutation → greyed ALL rows; now a
  `pendingId` disables only the acting row. Plus **fixed pervasive missing accents** on passage-validation
  (approuvé(s)/rejeté(s)/clôturées/créées/définitive/Unité/Équipe/…).
- **Under-warned destructive actions → real confirms:** rentrée "Régénérer" (wipes group progress) now a destructive
  ConfirmDialog; parent-page delete warns about sub-pages; camp delete-game confirms.
- **CMS TipTap dialogs (news/pages/events/resources):** unsaved-changes guard (`window.confirm` on dirty close) +
  Save disabled while a cover/attachment upload is in flight (was saving without it). rich-text-editor link inserter
  now normalizes bare domains to `https://`. site-texts no longer spins forever on empty/error (renders empty form).
- **functional-roles-list:** reorder gets in-flight guard + error toast; the ★ default is clearable; an amber "Aucune
  fonction par défaut" warning shows when a unit type has roles but no default (silent demande→member base-role break).
- **api-keys:** the one-time key reveal now requires a "J'ai copié la clé" checkbox before Fermer + can't be dismissed
  by Esc/outside-click (was losing the only copy). **group-access:** beforeunload guard for unsaved per-card edits.
  **demande send** button now has a tooltip explaining it needs the "Toutes" filter.
- DEV until deploy. (Access-control verification found no CG/super-admin leaks; these are UX/robustness fixes.)

### Managed member-data lists → one CG page (2026-07-11)
Cities were editable in TWO places (dedicated Villes page + Settings). Consolidated ALL four managed member-data
lists into a single **Chef-de-Groupe-accessible** page and removed them from Settings.
- New **"Listes"** page (`/admin/lists`, `client/pages/admin/managed-lists.tsx`, perm `maitrise.manage`) with tabs
  **Écoles / Classes / Villes / Professions** (member.schools/classes/cities/profession_domains). Replaces the old
  `/admin/cities` "Villes" page (deleted). Sidebar "Villes" → "Listes".
- Extracted the rich `ManagedListEditor` (was inline in settings.tsx) to **`components/shared/managed-list-editor.tsx`**
  — add, inline **rename that CASCADES** onto member/applicant fiches, **archive** an in-use value (kept on fiches,
  restorable), usage counts, filter. Used by the Listes page AND Settings.
- Backend: the 4 list-value endpoints (list-usage / rename / archive / unarchive) **relaxed from
  associations.manage → maitrise.manage**, with a handler guard (`ListValueHelpers.CanManageKey`) so a
  non-super-admin can only touch the four member-data lists (`CgManagedKeys`) — any other json_array stays
  super-admin. New **CG-accessible `AddListValueCommand`** (`POST /settings/list-value/add`) so the shared editor's
  ADD works for a CG (the old add went through the super-admin generic setting write). All four keys removed from
  the Settings page (`HIDDEN_KEYS`) — Settings is now pure system config.
- Verified live with a real CG (`giorgio.rizk`): full CRUD (add/rename-cascade/archive) on écoles/classes/villes/
  professions; a super-admin still does everything. Builds clean (dotnet+tsc+eslint). DEV until deploy.

### Sidebar/menu pass + error-log clear + app versioning (2026-07-28)
Post-error-handling polish (all on main, pushed; DEV until deploy). Also fixed two prod log noises.
- [x] **Prod log fixes:** (1) `SecurityProfilePermission` (not a BaseEntity) now filters through its parent
      (`!SecurityProfile.IsDeleted`) — silences the recurring EF "required end of a relationship with a
      query-filtered entity" startup Warning (query filter only, no migration). (2) `deploy/deploy.ps1` now
      ensures `dataprotection-keys`/`uploads`/`logs` exist + grants the IIS app-pool Modify (best-effort,
      needs elevation) — fixes the prod "An error occurred while reading the key ring"
      UnauthorizedAccessException on `C:\inetpub\www\gndj\dataprotection-keys` (one-time server fix:
      `icacls <dir> /grant "IIS AppPool\gndj:(OI)(CI)M" /T`).
- [x] **Error log "Vider le journal":** `DELETE /logs` (super-admin only, optional `?before=` keeps newer
      rows) via `IErrorLogReader.PurgeAsync` (parameterized DELETE, no-op if table absent) + a destructive-
      confirm button on the Journal des erreurs page (toast with deleted count). Verified: cleared 1024→0;
      non-super-admin → 403.
- [x] **Sidebar = collapsible accordion, regrouped by task (managers).** The manager (super-admin/CG/ACG)
      nav rendered ~39 links at once (groups never collapsed; "Gestion" was a 14-item junk drawer). Now:
      groups are a persisted **accordion** (collapsed by default, the group holding the active route
      auto-expands; state in `sidebar-store` via zustand persist; icon-collapsed sidebar still shows all
      items). Pinned the daily items (Tableau de bord, Membres) at top; split "Gestion" into
      **Suivi & demandes / Unités & maîtrise / Camp & rentrée / Configuration / Site public / Système**
      (ordered by frequency). Pending badges (demandes/change-requests) roll up onto a COLLAPSED group's
      header so nothing actionable hides. Every link keeps its permission gate.
- [x] **Set-and-forget pages out of the nav → Paramètres.** Associations + Champs personnalisés + Carte
      membre moved behind a **"Pages de configuration ▾"** dropdown in the Paramètres header (all
      associations.manage, same as Settings access). Routes unchanged. **Rapports stays in the menu** (user
      request).
- [x] **App version number + private changelog ("Journal des versions").** Version source = `client/
      package.json` (npm semver). `vite.config.ts` bakes **version + git short-commit + build date** into the
      bundle (`define`; declared in new `src/env.d.ts`, surfaced via `src/lib/app-version.ts`), so the live
      build is always identifiable. **Super-admin-only** page `/admin/changelog` (NOT in the main nav; reached
      from a discreet `vX.Y.Z` link in the **sidebar footer**, shown to super-admin only) lists the current
      build identity + release history from `src/data/changelog.json`. **Release tooling:**
      `deploy/bump.ps1 -Type major|minor|patch [-Push]` bumps package.json, auto-generates the changelog from
      the **commit subjects since the previous `v*` tag** (`git log <lastTag>..HEAD`, minus `chore(release)`;
      written by `deploy/bump.mjs` to avoid PS 5.1 JSON quirks), commits `chore(release): vX.Y.Z` + tags it;
      guarded (clean tree + **refuses if the checkout is behind origin** so a release can't be authored on a
      stale clone). Baseline tag **v1.0.0** created. `update.ps1` gained `-Bump major|minor|patch` (calls
      bump.ps1 before build) for a one-command deploy-and-release. **Final agreed process: bump on DEV
      (`bump.ps1 -Type patch -Push`), then deploy on prod (`update.ps1 -Pull`)** — dev stays the authoritative
      history; prod is pull-only. Versions live on **origin** (whoever bumps pushes there).

### Navigation redesign — horizontal top bar + role-coloured chrome (2026-08-18)
Reworked the manager navigation from the long left sidebar into a **horizontal top menubar**, and made the whole
chrome **colour-coded by the signed-in user's role**. Plus a batch of small UX fixes. On `main` at 3.3.0 (no bump
per request); deploys with the next `update.ps1 -Pull`.
- **Horizontal admin nav (`AdminNav` in sidebar.tsx):** managers (super-admin / CG / ACG — `useIsManager` in
      `lib/use-is-manager.ts`) no longer get the left sidebar; the header IS the nav — brand + pinned links
      (Tableau de bord / Membres) + one **dropdown per admin group** (pending badges roll up onto the group
      trigger + show on the item). Active item in a dropdown = filled row + left accent bar + bold primary.
      Non-managers (CU/youth) keep the left sidebar; everyone's **mobile drawer** (MobileSidebar) is unchanged.
      `app-layout.tsx` renders `<Sidebar>` only when `!isManager`.
- **Merged the two account menus into ONE** (`components/layout/user-menu.tsx`, extracted from the header): the
      old header avatar menu + the nav "Mon espace" dropdown collapsed into a single avatar menu (Ma fiche / Mes
      documents / Trombinoscope + change-password / sign-out-others / logout + the dialogs). Header is now the
      single top bar (no second row).
- **Role-coloured chrome (`useRoleTheme`):** header + CU/member sidebar + mobile drawer are tinted by role
      (member / CU / CG / super-admin). Nav text/hover/active/badges use **white overlays** so any dark colour
      reads. Colours are **configurable** — new **`ui.role_colors`** json setting (hex per role, seeded via
      SeedMissingSettings, category `apparence`, hidden from the generic Settings page) + a new **`/admin/appearance`**
      page ("Apparence", Système group, associations.manage) with a colour picker + preset palette + live preview
      per role. Applied **inline** (`style`), NOT a Tailwind class, so runtime hex works (no purge issue). Defaults:
      member emerald-800 / CU indigo-800 / CG teal-700 / super-admin slate-900.
- **Progression page:** the inline stage/badge quick-adds → **full "Ajouter" modals** (`StageFormDialog`/
      `BadgeFormDialog`, create+edit unified; name/description/code[auto if blank]/active). Add button moved to the
      **top**. Removed the **"Étape avec badge"** switch + the ladder "Badge" tag (flag kept in data, preserved on
      save, just not shown/editable). Unit-type pills **sorted by parcours order** (`PROG_RANK` by code: MEU→RON→
      TRO→COM→CLAN→NOY→JEM→FEU→CAR→GRP) instead of alphabetical.
- **Dashboard year selector fixed:** it showed BLANK (hardcoded 2023–2025 list omitted the current year). Now
      built dynamically from the current scout year (current labelled "— année en cours" + previous 4), with a
      "Année scoute" label + calendar icon; never blank.
- **Rentrée:** the "En attente : …" blocked-by line **dedupes** titles (a group task depending on a per-unit
      task listed the same title ~18×).

### Settings consolidation (2026-08-19)
Three small Paramètres cleanups (frontend + a data patch; DEV until deploy).
- **Removed `pinned_professions` ("Professions épinglées").** It only floated 5 favourites to the top of the parent
  **Profession** picker (whose options are a hardcoded constant, not a managed list) — confusingly redundant next
  to the managed **Domaine** list in *Listes*. Dropped `pinnedValues` from the guardian add/edit forms, hid the key
  + removed the `SETTING_OPTIONS` entry, removed both seed entries, **data patch `007`** deletes the row from
  existing DBs (dev row deleted live). The now-empty **Famille** settings tab disappears.
- **Merged Contact → Email tab.** The *Contact* category held one setting (contact-form recipient); folded into the
  Email tab via `effectiveCategory` (`contact`→`email`), renamed the tab **"Email & contact"**, dropped the
  standalone Contact tab.
- **Pages de configuration are now tabs, not routes.** Associations / Champs personnalisés / Carte membre moved
  from the "Pages de configuration ▾" header dropdown (and their `/admin/*` routes) INTO Paramètres as three extra
  **tabs** (`CONFIG_TABS`, lazy-loaded, mounted only when active). Removed the dropdown + the 3 routes/imports from
  App.tsx (nothing else linked to them). Supersedes the 2026-07-28 "set-and-forget pages behind a dropdown" note.

### Menu reorganization + page merges (2026-08-23, frontend-only, DEV until deploy)
Follow-up sidebar tidy after the rentrée work (all on main, pushed; tsc+eslint+vite clean each commit).
- **Rentrée: "Modèle de rentrée" page reorganized** (rentree-template.tsx) — task list grouped by PHASE headers
      (phases are contiguous in display order; up/down arrows still reorder across the whole list), cleaner rows
      with icons; edit/add FORM split into sections (Tâche / Responsable / Échéance / Suivi & action /
      Dépendances) in a logical order with inline help. Header explains model-vs-yearly-list + links to /rentree;
      the /rentree page keeps a clearer "Modèle de rentrée" button. **The template page is KEPT** (it's the master
      template the yearly list is generated from).
- **Sidebar moves:** "Modèle de rentrée" → Configuration; "Rentrée scoute" → Suivi; "Accès maîtrise" → Système;
      the now-empty "Camp & rentrée" group removed. (Camp BP handled dynamically, below.)
- **Camp BP dynamic placement** (sidebar `NavContent`): while NO camp is active it lives in the **Configuration**
      group (so a `camp.manage` CG can create one); as soon as a **non-archived camp exists** it's PROMOTED to the
      **main menu** for everyone with access — the manager link `/admin/camps` (camp.manage) and the CU grading link
      `/camp` (camp.grade). Never shown in both places at once. `useCamps(enabled)` gained a flag so the sidebar
      only fetches the camp list for users holding camp.grade/camp.manage (no 403s for youth). Verified: dev has 0
      camps → CG sees Camp BP under Configuration.
- **Merged "Profils de sécurité" + "Accès maîtrise" → one page `/admin/roles-access` ("Profils & accès").** New
      `pages/admin/roles-access.tsx` hosts both as **permission-gated tabs**: Profils de sécurité (roles.view) +
      Accès maîtrise (roles.manage_group). The two child pages gained an `embedded` prop (suppresses their own
      header) and render unchanged inside the tabs — no logic rewritten, gates preserved (super-admin/CG see both;
      roles.view-only sees just Profils, no tab bar). Single Système sidebar entry; old `/admin/security-profiles`
      + `/admin/group-access` routes redirect (Navigate) for back-compat. Orphan scan of pages/ = none.

### Flow-simplification / discoverability pass A–F (2026-08-24)
A review of "lots of features, many hidden" → journey audits (CU/CG/member/applicant) → a themed plan the user
approved. All on main, pushed, DEV until deploy. Plus two bugs found while testing.
- **BUG (cross-user data leak, fixed):** logout cleared tokens+auth store but NOT the TanStack Query cache, and
      login/logout are SPA nav (no reload) with 5-min staleTime + no refetch-on-focus → the previous user's cached
      data (rentrée/members/…) stayed visible to the next account in the same tab. Fix: `lib/query-client.ts` singleton
      + `queryClient.clear()` on login/register/logout in BOTH the member and applicant stores.
- **BUG (multi-unit leader, fixed):** Passage + Session photo hardcoded `unitAccess[0]` → a CU/ACU leading >1 unit
      could only act on their first. New `hooks/use-leader-units.ts` (units where the role grants members.edit,
      excluding the group-Maîtrise assignment) drives a unit picker shown when >1. ACU roles use the `chef-unite`
      profile (members.edit) so an ACU-in-X + CU-in-Y sees both units automatically (no ACU/CU special-casing).
- **A** — CG group dashboard renamed **"Statistiques"** (nav + heading); the **Rentrée** checklist promoted from
      the "Suivi" dropdown to a **pinned top-nav** item (the guided startup workflow is the manager's to-do list).
      CU nav unchanged (their menu is already beside them).
- **B** — merged **"Vérification documents" + "Relance documents" → one "Suivi des documents"** page (Campagne /
      Relances tabs, embedded prop, old routes redirect, `?tab=relances` deep-link). Removed **"Modèle de rentrée"**
      from the menu (reached via the button on the /rentree page). Progression left as-is (Parcours scouts is
      administrative; only 2 items).
- **C** — clearer labels: "Demandes de modification"→**"Modifications à valider"**, "Listes"→**"Listes (écoles,
      classes, villes…)"**, "Rapports"→**"Modèles de rapports"**, "Textes du site"→**"Accueil & pied de page"**.
- **D** — the member panel's four hover-only unlabelled icons (Envoyer l'accès / Réinitialiser le mot de passe /
      Carte / Supprimer) → one labelled **"Actions ▾"** dropdown. Passage: the low-contrast ghost "Modifier" CUs
      missed → a visible outline **"Modifier le choix"** button (kept the flow, avoided a risky rewrite).
- **E** — parent portal streamlined: removed the `/inscription` **landing** (open → straight to **login**, which
      now has a full "Créer un compte" button); new **`ApplicantVerifyGate`** enforces email verification (LINK-based)
      **up front** when `demande.require_email_verification` is on (verify page gained an "awaiting / resend" state);
      after login+verify+terms a family with **no demande opens the wizard directly** (skip the empty portail); the
      **"Retrouver mes informations"** household prefill is surfaced at the **wizard start**, reworded for **siblings**
      (brother/sœur already a member) and shown only on the FIRST child (the next inherits the household). Route order
      ProtectedRoute > VerifyGate > TermsGate > portal.
- **F** — merged **"Envoyer les accès" + "Message aux chefs" → one "Communications & accès"** page (Emails aux chefs
      / Envoyer les accès tabs, permission-gated, old routes redirect, rentrée goto-actions updated).
- Each theme built + tsc/eslint/vite-clean + committed separately. Frontend routing/UX changes need browser
      verification by the user. NEXT (user-requested, deferred): a way to explicitly **link brothers & sisters**
      (beyond implicit shared-guardian detection) — see memory [[project-link-siblings]].

### Settings opened to CG (per-category) + rejection motifs moved into Paramètres (2026-08-25)
Reworked settings access so a **Chef de Groupe reaches Paramètres** and edits the operational categories, while
sensitive config stays super-admin only; and folded the standalone "Motifs de refus" page into the Inscriptions
settings tab (a CG suggestion: "in settings we have a tab for demandes, so add the rejection motifs there").
All on main, pushed; DEV until deploy.
- **Per-category access model** (`Application/Settings/SettingsAccess.cs`): CG-editable categories (agreed with
      the user) = **demande, documents, cotisations, passage, members, reports**. Admin-only by omission = **email**
      (could redirect all outgoing mail via `email.override_recipient`), **security** (password policy),
      **maintenance** (site kill-switches), **site** (public content), **general/advanced** (plumbing), plus
      apparence/camp/rentree/contact. `CanEdit(category,user)` = admin (super-admin OR associations.manage) OR
      (maitrise.manage AND category ∈ CG set); `CanViewAny` = admin OR maitrise.manage.
- **Backend gates:** `GetSettingsQuery` now injects `ICurrentUserService` — throws 403 if not CanViewAny, returns
      ALL settings for an admin, else only the CG categories (in-memory filter; table is ~50 rows). `GET /settings`
      lost its `[HasPermission(AssociationsManage)]` (any authed user hits it, handler filters) AND its `[OutputCache]`
      (the response now varies by user — caching would leak the admin's full list to a CG). `UpdateSettingCommand`
      injects `ICurrentUserService` and throws 403 (`UnauthorizedAccessException`) on a cross-category write; `PUT
      /settings/{key}` lost its permission attribute (per-category enforced in the handler). The managed member-data
      list endpoints were already maitrise.manage.
- **Frontend:** `/admin/settings` route moved from `<AdminRoute>` (super-admin) to `PermissionRoute
      MAITRISE_MANAGE`; sidebar "Paramètres" perm ASSOCIATIONS_MANAGE→MAITRISE_MANAGE. The Settings page hides the
      admin-only config tabs (Associations / Champs personnalisés / Carte membre) unless the user has
      associations.manage; tabs otherwise auto-filter to whatever `GET /settings` returns (so a CG sees only the 6
      operational category tabs). **Rejection motifs** (`RejectionReasonsPage`, gated demande.manage) gained an
      `embedded` prop and renders inside the **Inscriptions** tab; standalone `/admin/rejection-reasons` route →
      redirect to `/admin/settings`, sidebar link removed.
- **Verified live:** super-admin = 66 settings / all categories + can write email (204); CG (giorgio.rizk) = 46
      settings / exactly {cotisations, demande, documents, members, passage, reports}, writes demande (204),
      **blocked from email + security (403)**, rejection-reasons 200; a chef-unité (non-manager) → GET/PUT settings
      403; `email.override_recipient` untouched. Test accounts' password hashes reset for testing then restored
      exactly (backups). Build clean (dotnet 0/0, tsc 0, eslint 0).

### Translation-extension crash guard (2026-09-08)
Prod error log showed repeated client errors on `/inscription/register`: `Failed to execute 'insertBefore' /
'removeChild' on 'Node': ... not a child of this node.` These are the classic signature of a **browser
page-translation feature** (Google Translate / Chrome-Edge "Traduire cette page") wrapping/moving text nodes on
the French page — React's next commit then calls insertBefore/removeChild against a node the translator already
relocated → throw → white-screen. NOT our bug (a Lebanese-ISP user auto-translating). Fixed both symptoms:
- **`client/src/lib/translate-guard.ts`** (imported FIRST in `main.tsx`, before React mounts): patches
      `Node.prototype.removeChild`/`insertBefore` to NO-OP safely when the child/reference isn't actually a child of
      the parent — i.e. exactly the already-broken path that would have thrown. Normal ops untouched, so React
      recovers on its next render instead of crashing. Standard mitigation for translated React apps.
- **Stop logging the noise:** `isBenignError` (error-report.ts) now also treats `insertBefore' on 'Node'` /
      `removeChild' on 'Node'` messages as benign, and the `ErrorBoundary.componentDidCatch` skips reporting benign
      errors — so even any that slip past the guard never hit the Journal des erreurs / admin alert.
- Frontend-only, tsc + eslint + vite clean. DEV until deploy.

### Settings + menu consolidation — PHASE 1: menu (Option C hybrid) (2026-09-11)
First phase of a "too many settings/features, it's confusing" consolidation (discussed via HTML menu mockups in
`temp/menu-mockups/` — current vs Light vs Medium vs Hybrid). User chose **Option C (hybrid)** for the menu +
**Option 1 (Paramètres = hub)** for settings; agreed to PHASE it. This is the menu half (frontend-only, DEV until
deploy; Phase 2 = the settings hub is NOT built yet). All in `sidebar.tsx` / `header.tsx` / `dashboard.tsx`:
- **"Accueil" via the logo.** The manager group-dashboard (`/dashboard`) reverts from "Statistiques" → **"Accueil"**
  (page `<h1>` + removed from the pinned nav). It's reached by clicking the **GNDJ Scout** brand (header brand +
  desktop sidebar logo already linked to `/dashboard`; made the **mobile header wordmark** + **MobileSidebar brand**
  Links too, + a hover state/`title="Accueil"` on the manager brand). `/dashboard` is role-aware, so the logo does
  the right thing for every role. CU/youth keep their `/dashboard` labelled **"Mon unité"** (leaderNavItems — only
  the manager side reverts to Accueil). Pinned manager items are now just **Rentrée scoute + Membres**.
- **Merged "Configuration" + "Système" → ONE "Configuration" drawer** (Option C: daily groups Demandes / Suivi /
  Unités & maîtrise / Site public untouched; nothing renamed or moved between groups, Champs/Carte stay Paramètres
  tabs). The merged group's items carry a new optional **`section`** field (`NavLink` type) rendered as sub-headers:
  **Structure & données** (types d'unité, fonctions, parcours, progression, types de documents, listes, modèles de
  rapports, + Camp BP when inactive) / **Système & sécurité** (profils & accès, email/SMTP, file d'emails, clés API,
  journaux, sessions, corbeille, apparence) / **Paramètres** (the hub link). Headers render only for sections with
  ≥1 permission-visible item (items are filtered before the section-change check), in BOTH the AdminNav dropdown
  (via `DropdownMenuLabel`/`DropdownMenuSeparator` in a `display:contents` wrapper; content now `max-h-[80vh]
  overflow-y-auto` since the drawer is tall) and the mobile/CU accordion. Manager top-level groups: 6 → 5.
- Builds clean (tsc + eslint + vite). Mockups + plan kept in `temp/menu-mockups/`.

### Settings consolidation — PHASE 2: Paramètres = hub (2026-09-11)
Second phase (Option 1): fold the true-settings dedicated pages into Paramètres as tabs + a launchpad to the CRUD
apps that stay their own pages. Frontend-only, DEV until deploy. All in `settings.tsx` + `sidebar.tsx` + the target
pages. `CONFIG_TABS` gained a per-tab **`permission`** (was all-or-nothing super-admin) so each config tab shows only
if the user holds its permission (a CG sees **Listes** [maitrise.manage]; super-admin tools stay hidden).
- **New Paramètres tabs** (lazy, gated): **Listes** (managed-lists, CG), **Apparence** (appearance, super-admin),
  **Accueil & pied de page** (site-texts, content.manage), **Clés API** (api-keys, super-admin; moved out of the
  sidebar 2026-09-11) — alongside the existing Associations / Champs / Carte tabs.
- **Types de documents** is embedded INSIDE the **Documents** tab (below the settings; `document-types.tsx` gained an
  `embedded` prop that hides its own h1; gated `document_types.view`, mounted only when the Documents tab is active).
- **"Rapports" tab removed** — its only visible setting `reports.cards_enabled` now renders inside the **Carte membre**
  tab (found by key + rendered as a SettingEditor above CardDesignerPage). `'reports'` dropped from CATEGORY_ORDER/LABELS.
- **Launchpad** — a "Autres pages de configuration" card at the top of Paramètres links the config apps that stay
  their own pages (**Email/SMTP**, **Modèles de rapports**, **Profils & accès**), filtered by permission. Those three
  pages gained a shared **`<BackToSettings>`** ("← Retour aux paramètres" → /admin/settings) so there's always a way back.
- **Sidebar (Configuration drawer) trimmed**: removed **Types de documents** + **Listes** (Structure & données),
  **Apparence** (Système & sécurité), **Accueil & pied de page** (Site public). Their `/admin/*` routes still work
  (deep links) — they're just reached via the Paramètres tabs now (same pattern as Associations/Champs/Carte).
- **Deliberately NOT pulled in:** the document-campaign DATES stay on "Suivi documents" — they need order validation
  (deposit < correction < final) the generic editor can't enforce (HIDDEN_KEYS comment); un-hiding them would let a
  user save them out of order and break the campaign phases.
- **Left grouped vertical nav (DONE 2026-09-11):** the ~17-tab wrapping row is replaced by a **left vertical nav**
  grouped into **Réglages** (the setting categories) + **Configuration** (the config-page tabs), content on the right
  (`SettingsNavGroup` component; `cn`-based active state; sticky). Dropped Radix `Tabs` for plain buttons + a
  conditional content pane (only the active section mounts — so DocumentTypesPage/config pages mount lazily on
  select). Mobile: a single `<select>` (optgroups Réglages/Configuration) replaces the nav. Search mode unchanged.

### Accueil dashboard — action hub + timely panels (2026-09-11)
Turned the CG/super-admin/ACG **Accueil** landing (was purely descriptive: 4 count tiles + members-by-unit +
age charts) into an **action hub**. All on main, DEV until deploy; verified live.
- **New backend `GetDashboardOverviewQuery`** (`Dashboard/DashboardOverviewHandlers.cs`, `GET /dashboard/overview`,
  group-level guard byte-identical to `GetAdminDashboardQuery` — super-admin / maitrise.manage / group-level role).
  Returns TIMELY/"now" content, independent of the stats' year selector: **action items** (pendingDemandes,
  pendingChangeRequests, passagesToFinalize [Passage.Approved], pendingDocuments [MemberDocument.Pending, active
  type], membersOnHold), **campaign** pipeline (non-draft demandes of `demande.scout_year`: total/pending/approved/
  declined/responsesSent/decided + acceptanceRate), **rentrée** (`passage.scout_year` tasks ROLLED UP by TemplateId
  like the /rentree page — done = every instance effectively done, reusing `RentreeProgress.ComputeAsync`),
  **cotisations** (group-wide operating-year paid/unpaid/exempt, honoring the maîtrise-ne-paie-pas toggle via
  `MaitriseCotisation`), and a **trend** (members active NOW vs. the previous scout year's overlap window). Reuses
  existing helpers; no N+1 beyond the rentrée progress signals the /rentree page already pays.
- **Frontend** (`dashboard.tsx` + `dashboard-service.ts` `useDashboardOverview`, 60s staleTime): `AdminDashboard`
  now renders, above the stats — an **"À traiter"** strip that surfaces ONLY non-zero action items (each a `<Link>`
  card to its page: demandes→/admin/demandes, changes→/change-requests, passages→/admin/passage-validation, docs &
  on-hold→/admin/documents-suivi; red for suspended, amber otherwise; "Tout est à jour" green card when all clear),
  then **Campagne d'inscription** (6-number pipeline + décidées bar + ouvertes/fermées badge), **Effectif** (this vs
  last year with a ↑/↓ delta), **Rentrée scoute** (done/total bar), **Cotisations** (à jour/total bar + à relancer/
  exemptés) — all clickable cards. The **year-scoped** 4 tiles + 2 charts stay below under a "Statistiques —
  {année}" header that now owns the year selector (the overview is "now", so it no longer sits in the page header).
- Verified live (super-admin): overview returns real data (208 demandes en attente, 49 passages à finaliser, 9 docs,
  rentrée 4/24, effectif 1069 vs 1219, campagne 208 reçues); endpoint requires auth (401 without token). Build clean
  (dotnet 0/0, tsc + eslint + vite).

### Settings hub — Email integrated + split into two tabs (2026-09-12)
Continued the "Paramètres = hub" consolidation. The Email / SMTP config was one of the 3 remaining launchpad
pages (`/admin/email-settings`, reached via the "Autres pages de configuration" card + a sidebar link). It's now
folded INTO Paramètres and, at the user's request, **split into two focused config tabs**:
- **Serveurs SMTP** (`email-smtp.tsx`) — SMTP server CRUD + test dialog (config, set once).
- **Modèles d'email** (`email-templates.tsx`) — email-template CRUD (TipTap editor, module variables, attachments;
      content edited often).
  The old combined `email-settings.tsx` (with two sub-tabs) was DELETED and its two `SmtpTab`/`TemplatesTab`
  bodies moved verbatim into the two new files — separate modules so opening "Serveurs SMTP" doesn't statically
  import the heavy rich-text editor (only `email-templates` imports RichTextEditor). Each page takes an
  `embedded` prop (hides its standalone `BackToSettings` + h1 when rendered as a Paramètres tab); the CONFIG_TABS
  Component type is now `React.ComponentType<{ embedded?: boolean }>` and the render passes `embedded` (pages that
  ignore it are unaffected — a 0-arg component is assignable).
- **Deep-linkable tabs:** `settings.tsx` now reads a **`?tab=<key>`** query param on mount (guarded, validated
      against the accessible categories/config tabs, falls back to the first section) so external links can open a
      specific tab. Repointed the 3 references: the old **route** `/admin/email-settings` → `<Navigate>` to
      `/admin/settings?tab=cfg:smtp`; the **rentrée** `goto-email` action + the **communications** "Modifier le
      texte du modèle" link → `/admin/settings?tab=cfg:email-templates`.
- **Sidebar:** removed the "Email / SMTP" entry (Système & sécurité) — reached via Paramètres now; route redirect
      kept for bookmarks. Dropped the now-unused `Mail` icon import.
- **Removed** Email/SMTP from the Paramètres launchpad card (now just Modèles de rapports + Profils & accès —
      the 2 remaining separate pages, next candidates to integrate).
- NOTE (bundle): `editor-vendor` is imported by ~120 chunks via a shared helper `manualChunks` bucketed there, so
      it's effectively always loaded — the split's real win is UI discoverability (two visible nav entries), not a
      big bundle saving; but the SMTP tab's own code no longer pulls the templates form/editor. Build clean
      (tsc + eslint + vite). Frontend-only, DEV until deploy.

### QOL: WhatsApp links (leaders) + undo-on-delete (2026-09-13)
First two of a QOL batch the user picked (global search is the next one). All on main, DEV until deploy.
- **WhatsApp one-tap (CU and above only):** a green WhatsApp icon next to phone numbers opens `wa.me/<digits>`
  (families here run on WhatsApp). New `lib/phone-links.ts` (`whatsappHref(countryCode, number)` — digits only,
  drops the trunk 0, defaults to Lebanon 961 when no dial code; `whatsappHrefFromText(combined)` — Lebanon-first
  heuristic for an already-combined display string; `telHref`) + `components/shared/whatsapp-link.tsx`
  (`WhatsappLink` for structured countryCode+number, `WhatsappTextLink` for a combined string; inline WhatsApp SVG
  since lucide dropped brand glyphs; renders nothing for an unusable number; stops click propagation). Wired into
  LEADER contexts only: the member panel Coordonnées phones (members/index), guardian phones in `MemberGuardians`
  **gated on `!selfService`** (so it's hidden on the member's own Ma fiche), the CU unit-leader dashboard roster
  phones, and the CG cotisation-dashboard parent phones (uses the text variant — that phone is a pre-combined
  string incl. the country code). Deliberately NOT on Ma fiche / member-facing views. No permission flag needed —
  these screens are already CU+/CG-only.
- **Undo on delete (toast "Annuler"):** deleting a **member** (members panel) and a **contact message** now shows a
  success toast with an **Annuler** action that restores it in one tap (leverages soft-delete). Member reuses the
  existing `useRestoreMember` (`POST /members/{id}/restore`); contact messages got a new
  `RestoreContactMessageCommand` + `POST /contact-messages/{id}/restore` (loads via `IgnoreQueryFilters`, clears
  IsDeleted/DeletedAt/DeletedBy) + `useRestoreContactMessage`. Members stay recoverable in the Corbeille too.
  Verified live: contact message delete 204 → gone from list → restore 204 → back in list. tsc + eslint + vite +
  dotnet all clean.

### QOL: global quick-search / command palette (2026-09-13)
Third QOL item (frontend-only, DEV until deploy). `components/layout/command-palette.tsx` — Ctrl/⌘-K (or a header
"Rechercher…" pill / icon on mobile) opens a `cmdk` dialog to (a) find a MEMBER by name → jump to `/members/{id}`
(the page's existing `/members/:id` route syncs the selection), and (b) jump to any admin page. The `cmdk`
primitive was already installed (`components/ui/command.tsx`) but unused; extended `CommandDialog` with an optional
`shouldFilter` prop (passed `false` here so async server member-results aren't re-filtered by cmdk — I do all
filtering: server for members [accent-insensitive `/members?search=`], manual accent/case-insensitive for the
curated nav list). **Leaders only** (`user.isSuperAdmin || members.edit || maitrise.manage`): a youth has no admin
pages and can't search other members (the members endpoint requires members.edit → empty), so the palette + hotkey
self-gate to null for them. Mounted in the header before the bell. tsc + eslint + vite clean.

### QOL batch: copy, remember-view, favorites/recents, birthdays (2026-09-13)
The first four of the "worth doing" QOL list (the user asked for all 8). DEV until deploy.
- **Copy-to-clipboard** — `components/shared/copy-button.tsx` (`navigator.clipboard` + hidden-textarea fallback,
  ✓ confirmation). Next to phones/emails in the member panel + `MemberGuardians` (leader — `!selfService`).
- **Remember last members-list view** — the members page persists the unit filter + Actifs/Anciens toggle to
  localStorage (`members.unitFilter` / `members.showAlumni`), restored via lazy `useState` initializers + two
  write effects.
- **Favorites + recently-viewed members** — `lib/recent-members.ts` (localStorage, per-device: `pushRecentMember`
  on fiche open, `toggleFavoriteMember` via a ★ in the member-panel header, `getRecent/getFavorite`). Surfaced in
  the Ctrl-K palette as "Favoris" + "Récemment consultés" groups when the query is empty (loaded in the open
  handlers, not an effect — `openRef` keeps the hotkey handler's view of open current). Client-only, no backend.
- **Upcoming birthdays (unit-scoped)** — `GetUpcomingBirthdaysQuery` + `GET /members/birthdays?days=30`
  (`[HasPermission(MembersEdit)]`, leader-only; scoped to `AuthorizedUnitIds` for non-super-admin so a CU sees
  their unit's members, a CG/super-admin sees everyone). Computes the next-birthday window in memory over the
  active-members-with-DOB set (Feb-29 → Feb-28 in non-leap years). `components/shared/birthdays-card.tsx` exports
  `BirthdaysCard` (group Accueil dashboard) + `BirthdaysButton` (action-bar button→dialog for the height-locked CU
  unit dashboard); both hide when empty. `useUpcomingBirthdays` (hourly staleTime). Verified live: today+1 →
  turning-age correct, 30d=101 / 90d=262 (monotonic), ordered by daysUntil. dotnet + tsc + eslint + vite clean.

### QOL: dark mode (2026-09-13)
Item 7 of the QOL list (frontend-only). The `.dark` token overrides ALREADY existed in `index.css` (full set),
so this only wired a toggle: `stores/theme-store.ts` (zustand: `theme` light/dark/system + `resolved`; toggles
`.dark` on `<html>`, persists to `localStorage['theme']`, listens to the OS `prefers-color-scheme` change for
"system") + an inline no-flash script in `index.html` (applies the saved theme before first paint) + a 3-way
segmented switcher (Clair / Sombre / Auto, Sun/Moon/Monitor) in the account menu (`user-menu.tsx`, plain buttons
so picking one doesn't close the dropdown). Role-coloured header/sidebar use inline hex (unaffected — already
dark); everything else flips via the semantic tokens. tsc + eslint + vite clean.

### Customizable group dashboard (Accueil) — per-user widget layout (2026-09-14)
The manager Accueil dashboard was a fixed stack of sections → too long to scroll on small screens (user: "someone
with a small screen cannot see anything"). Made it customizable per user: reorder (drag) + show/hide + width
(full/half/third), saved to the account so it syncs across devices. All on main, DEV until deploy (migration).
- **Backend:** `User.DashboardLayoutJson` (nullable text; migration `AddUserDashboardLayout`) stored OPAQUELY —
  the frontend owns the widget schema and merges the saved layout against its registry on load, so adding a widget
  later is forward-compatible. `Application/Dashboard/DashboardLayoutHandlers.cs`: `GetDashboardLayoutQuery` +
  `UpdateDashboardLayoutCommand` (validator: ≤4000 chars + must be a JSON array; empty = reset to null), both
  resolve the caller's own `UserId` server-side (auth-only, no IDOR). Endpoints on `MyProfileController`:
  `GET|PUT /my-profile/dashboard-layout`. Verified live: default null → save → read back → invalid (non-array) 400
  → reset (empty) → null.
- **Frontend:** `lib/dashboard-layout.ts` = the widget SCHEMA (9 widgets: actions/campaign/effectif/rentree/
  cotisations/birthdays/keyNumbers/unitChart/ageChart), `DEFAULT_LAYOUT`, `WIDTH_COLSPAN` (full=6/half=3/third=2 on
  a `md:grid-cols-6`), `mergeLayout` (keeps saved order/visibility/width, drops unknown ids, appends new widgets —
  forward-compatible), `serializeLayout` (returns null when equal to default so a future default change is picked
  up). `dashboard-service.ts` gained `useDashboardLayout` + `useUpdateDashboardLayout`. `dashboard.tsx`:
  `OverviewPanels` split into individual placeable widget components (CampaignPanel/EffectifPanel/RentreePanel/
  CotisationsPanel + year-scoped KeyNumbers/UnitChart/AgeChart), a `renderWidget` dispatcher, and `DashboardEditor`
  (dnd-kit vertical sortable list of ALL widgets: drag handle + eye toggle + width select; Réinitialiser/Annuler/
  Terminé). Normal mode renders visible widgets into the 6-col grid by width; the year selector moved to the header
  (shown only when a year-scoped widget is visible — the old "Statistiques — {year}" divider is gone). Birthdays
  self-hides → its grid cell is skipped when empty (no gap). Working copy re-syncs from the saved layout via a
  render-phase reset (guarded against clobbering an in-progress edit).
- Scope: the GROUP dashboard only (super-admin/CG/ACG). The unit-leader dashboard is unchanged (could get the same
  later). tsc + eslint + vite + dotnet all clean; migration applies on prod startup.

### Dashboard responsive polish + graph redesign + birthdays (2026-09-14)
Follow-ups to the customizable dashboard, from live testing at various widths. Frontend + one small backend field;
DEV until deploy (birthday DTO change needs the rebuild).
- **Container queries (the key fix):** widget inner grids used VIEWPORT breakpoints (`sm:`/`lg:`/`xl:`), so when a
  card was set to half/third width (or on a small screen) they still tried 2–3 columns and the content got
  crushed / labels vanished. Reworked À traiter (`@md/@2xl:grid-cols`), Campaign 6-number grid (`@xl:grid-cols-6`),
  Chiffres clés (`@xs:grid-cols-2 @2xl:grid-cols-4`), and the unit-chart `% complets` suffix (`@max-xs:hidden`) to
  respond to the CARD's width via `@container`. Cotisations + gender rows got `flex-wrap`. Labels wrap instead of
  `truncate` so they never disappear. (Tailwind v4 container queries are core — verified they compile:
  `@container (width>=…rem)`.)
- **Whitespace:** the widget grid stretched every card in a row to the tallest one (a short À traiter next to a
  20-row Anniversaires got padded with empty space). Added `items-start` to the grid → each card keeps its
  natural height.
- **Graphs redesigned** (`ChartBar`): the chunky pill-with-number-inside (+ a hacky ≤20% inside/outside CSS-var
  calc) → a slim rounded **gradient** bar (`from-primary to-primary/70` / `from-indigo-500 to-violet-500`) with the
  value aligned to the right (`tabular-nums`), always readable regardless of bar length.
- **Anniversaires à venir:** removed the "dans X j / Aujourd'hui / Demain" relative text (the date column suffices),
  kept a **🎉** on same-day birthdays, and show the **unit code** (M2, T3…) instead of the full unit name. Backend
  `UpcomingBirthdayDto` gained `UnitCode` (`a.Unit.Code`); frontend `UpcomingBirthday.unitCode`. Verified live: the
  birthdays endpoint returns unitCode (e.g. "M3").
- À traiter is now a Card too (earlier commit b606d23). tsc + eslint + vite + dotnet all clean.

### Stale-deploy chunk error → self-healing lazy routes (2026-09-14)
Prod error log showed a client error `Failed to fetch dynamically imported module:
https://gndj.org/assets/error-log-DfvXt912.js` (a CG navigating to /admin/error-log). Root cause: the app
code-splits every route with `React.lazy` → Vite emits **content-hashed** chunk filenames; after a redeploy the
hashes change, so a browser still running the OLD `index.html` requests a chunk name the new build no longer has
→ the dynamic import rejects. Not a real bug (a reload fixes it) but it crashed to the ErrorBoundary + got
logged/alerted. Fix (frontend-only, DEV until deploy):
- **`client/src/lib/lazy-with-reload.ts`** — `lazyWithReload` wraps `React.lazy`; on a chunk-load failure
  (`isChunkLoadError`: "Failed to fetch dynamically imported module" / "error loading dynamically imported
  module" / "Importing a module script failed") it **reloads the page once** (fresh index.html → new chunk
  names), guarded by a `sessionStorage['chunk-reload-at']` 10s window so a genuine failure (offline / real 500)
  can't loop; while reloading it returns a never-resolving promise so the Suspense fallback stays up.
- **App.tsx** imports it aliased — `import { lazyWithReload as lazy }` (+ dropped `lazy` from the react import) —
  so all ~120 route `lazy(() => import(...))` calls use it transparently. Chunk splitting verified intact
  (dnd-vendor/editor-vendor/members/demande-validation still separate chunks).
- **error-report.ts `isBenignError`** now treats `isChunkLoadError` as benign → never reported to `/errors/report`
  / the admin alert (the ErrorBoundary already skips reporting benign errors). tsc + eslint + vite build clean.

### Theme reverted to light on refresh — inline no-flash script blocked by CSP (2026-09-14)
User: "no matter what theme I pick, it reverts to light on refresh." Root cause: the dark-mode work added an
INLINE `<script>` in `index.html` (the no-flash theme applier), but the production CSP is `script-src 'self'`
(no `'unsafe-inline'`) — so the browser BLOCKS that inline script in prod (CSP is applied only outside
Development), and nothing applied `.dark` on load → the persisted choice silently reverted to light every
refresh. (Dev has no CSP, so it worked there — but the fix doesn't rely on that.) Two-part fix:
- **No-flash script → external file** `client/public/theme-init.js` (served at `/theme-init.js`, same-origin →
  allowed by `script-src 'self'`), referenced via `<script src="/theme-init.js">` in `index.html` (replaces the
  blocked inline script). Runs before first paint (no flash) AND is CSP-compliant.
- **Store also applies on load** (`stores/theme-store.ts` now calls `apply(stored())` at module init) + is
  imported at app entry (`main.tsx`) — a bundled `/assets/*.js` module (CSP-allowed), so the theme is re-applied
  from the store regardless of the inline/external script. Belt-and-suspenders: works in every environment.
- Verified: `dist/theme-init.js` ships (857 B), `dist/index.html` references it; tsc+eslint+vite clean. CSP
  unchanged (external same-origin script needs no `'unsafe-inline'`). Frontend-only; DEV until deploy.

### Dark-mode bug: `dark:` followed the OS, not the app theme (2026-09-14)
User reported "colors wrong in [a built env], but fine in dev" — a light page with dark banners/badges (e.g. the
Sessions info box + role badges). Root cause: the dark-theme sweep added hundreds of `dark:` utilities + a `.dark`
class toggle (theme store), but **index.css never declared `@custom-variant dark`**, so in **Tailwind v4** the
`dark:` variant defaulted to `@media (prefers-color-scheme: dark)` (the OS). Meanwhile the semantic tokens
(`bg-background`/`bg-card`) are driven by the `.dark` CLASS. So whenever the **OS was dark but the app theme was
Light** (`.dark` class absent), the page stayed light (tokens) while every `dark:` utility fired via the media
query → the inconsistent half-dark look. "Fine in dev" = that browser/OS was in light mode, so `dark:` never
triggered. FIX = one line at the top of `client/src/index.css`:
`@custom-variant dark (&:where(.dark, .dark *));` — binds `dark:` to the `.dark` class (matching the toggle).
Verified in the built CSS: `prefers-color-scheme:dark` occurrences 0 (was all `dark:` utilities); every `dark:`
rule now compiles to `…:where(.dark,.dark *)` (365 `.dark` selectors). Light theme → no dark styling regardless
of OS; Dark/System → follows the app toggle. CSS-only, no rebuild of the backend.

### Dark-theme consistency sweep (2026-09-13)
Dark mode (added 2026-08-26) works ONLY via `.dark` on `<html>` flipping the CSS-variable semantic tokens
(`bg-background/card/muted/border/primary/accent/destructive/...` in index.css). Audit found the app had **zero
`dark:` variants anywhere** — so every HARDCODED Tailwind palette color stayed light in dark mode (glaring bright
`bg-amber-50`/`bg-emerald-50` callout boxes, light chips, light-gray surfaces). Fixed ~205 spots across **54 files**
(fanned out to 6 parallel subagents with one shared convention; additive only — light mode unchanged):
- **Tinted color surfaces** (callout/banner/chip/tile with `bg-C-50`/`bg-C-100`/`border-C-200|300`/`text-C-600..900`
  for C ∈ red/amber/emerald/blue/sky/…): added a `dark:` sibling per class — `bg-C-50`→`dark:bg-C-950/40`,
  `bg-C-50/NN`→`dark:bg-C-950/30`, `bg-C-100`→`dark:bg-C-950/50`, `border-C-200`→`dark:border-C-900`,
  `border-C-300`→`dark:border-C-800`, `text-C-600`→`dark:text-C-400`, `text-C-700/800`→`dark:text-C-300`,
  `text-C-900`→`dark:text-C-200`. Applied inside className template-literals, ternaries, AND const/lookup-map string
  values (audit-logs badge consts, notification-bell/error-log/document-reminders/demande-invites tone maps, etc.).
- **Neutral grays → semantic tokens** (already dark-aware): `bg-gray-50/100`,`bg-slate-50/100`→`bg-muted`;
  `text-gray/slate-400..700`→`text-muted-foreground`; `border-gray/slate-200/300` (incl. `<input type=checkbox>`
  borders)→`border-input`; neutral dots `bg-gray-300/400`→`bg-muted-foreground/50`.
- **Two `bg-white`/border fixes**: `progression-path.tsx` diagram node `bg-white`→`bg-card`; member-documents
  `statusColor` default `border-l-gray-300`→`border-l-border`.
- **Form-builder `.gndj-*` classes** (document-template editor, index.css — hardcoded light/dark hex mirroring the
  printed white-paper PDF): added a `.dark` override block lifting the checkbox/fill/box borders + field/split pills so
  they stay visible on the dark editor surface. PDF renderer draws its own controls → **PDF output unchanged**.
- **LEFT AS-IS (correct in both themes):** the role-colored (dark navy) sidebar/header chrome (`bg-white/10`, white
  count badges with `text-slate-900` on dark chrome), the Switch thumb, camera overlay, the member-card PREVIEW
  (a physical white card), and the **public marketing site** (`pages/public/*` — white cards on colored hero
  gradients, own design). Standalone icon accent colors `text-C-500/600` and solid `bg-C-500` bars/dots/progress/
  badges read fine on dark and were left. Minor deferred polish: a few bare status NUMBERS (`text-C-600`) on dark
  cards in the group dashboard are slightly dim but legible.
- Verified: `dark:` went 0 → 205 across 54 files; tsc + eslint (--max-warnings=0) + vite build all clean. DEV until deploy.


### 2026-10-10 — Text colour in the rich-text editor
- The Color extension was loaded (pasted colours kept) but there was no control: the `demande_declined` template had a
  sentence pasted in white (`color: rgb(255,255,255)`), invisible in the editor and in mail clients, and the CG could
  not fix it. `rich-text-editor.tsx`: « Couleur » select (Par défaut + 6 colours, « Autre couleur » for a pasted one),
  same scope rule as the font menus (no selection = whole text). Hidden in the document-template builder
  (`enableFont`) — the PDF renderer doesn't print colours.
