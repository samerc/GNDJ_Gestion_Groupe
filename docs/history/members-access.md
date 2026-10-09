# Members, families & access

Member file, Ma fiche, siblings/fratries, duplicates, login & sessions, permissions, delegation, super-admin, member groups, photos.

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

### Photo Session (Complete)
- [x] Camera capture component: getUserMedia, 3:4 ratio, JPEG 85% compression (600x800)
- [x] SVG silhouette overlay (dashed head + shoulders guide)
- [x] Front/back camera toggle, desktop fallback to file upload
- [x] Photo session page: member list with status checkmarks, progress bar, batch workflow
- [x] Preview with "Garder / Reprendre" confirm step
- [x] Sidebar link + CU dashboard "Photos" button

### Members LIST honest counts — DONE (2026-06-24)
- [x] **Option 1 remainder closed.** Admin members list now defaults to ACTIVE members with an **Actifs / Anciens**
      segmented toggle (passes `alumni`). Backend `GetMembersQuery`: the active (non-alumni) branch now also
      requires ANY active assignment when no unit filter is set — so a super-admin's default no longer counts
      alumni (previously showed all ~2.4k incl. former members). Alumni branch gained a group-level no-unit case:
      **super-admin OR Chef de Groupe** (holds `maitrise.manage` → `isGroupLevel`) sees ALL former members
      (ended somewhere, no active assignment anywhere); a unit leader still sees only their units' alumni. Alumni
      rows expose identity only (contact withheld), unchanged. Unit filter "Sans unité (anciens)" relabelled
      "Sans unité". Builds clean (dotnet + tsc).

### CU experience pass (2026-06-26)
A batch of fixes from a live CU (chef d'unité) test session. Key root cause: `chef-unite` holds `members.edit`
but **NOT `units.edit`** (it was dropped), so anything gated on `units.edit` was invisible to a CU.
- **CU lands on their unit roster.** Dashboard + sidebar "Mon unité" were gated on `units.edit` (which no CU has)
  → re-gated on **`members.edit`** (chef-unite has it; read-only youth & chef-équipe don't). A CU now lands on the
  `UnitLeaderDashboard` (their unit roster w/ member detail) as their default page. NOTE: `unitAccess` is built from
  ALL active assignments (youth included) so it can't be the leader signal — `members.edit` is. (dashboard.tsx,
  sidebar.tsx)
- **Camp BP grading page reworked (camp.tsx + backend):** ONE searchable + sortable table (no more separate
  "Présences" dialog). Columns: **Ne vient pas** checkbox (default = vient; unchecking attendance greys the row),
  Membre (no gender sign), **Équipe**, Année, Force, **Père/Mère = plain checkbox** (was a ★ star), Note, Cas
  particulier. `GetCampGrading` now returns ALL eligible youth in scope (attending or not) + `teamName` +
  `isAttending` + année default; `SaveCampGrades` is **member-keyed** (`{memberId, attending, force, annee,
  isLeaderCandidate, notes}`) and upserts/flips the participant (attendance + grade in one save).
- **Rentrée: a CU only ever sees their OWN tasks.** `GetRentreeTasksQuery` forces mine-only for non-managers
  (not super-admin / not `rentree.manage`); the "Toutes / Mes tâches" toggle + unit filter are hidden for them.
- **Passage propose is parcours-driven.** New `GET /unit-type-progressions/destinations/{memberId}` returns the
  **current branch (kind "same" — équipe/fonction change) + every parcours-scout target (kind "up" — unité
  supérieure)** for the member's gender. The propose dialog's destination dropdown is now **grouped** by those two
  kinds (e.g. Compagnie → Compagnie units + Noyau), falling back to all units if no parcours. The 3 row actions
  (Pas de changement / Proposer / Quitte le groupe) restyled as consistent outline buttons (green/blue/orange).
- **Documents & Cotisations relift (unit-documents.tsx):** bigger status icons (h-11 cells, h-5 icons) + larger
  legend/header/name text; cotisation cell is now **green = payée / red = non payée / slate = ne paiera pas**.
- **Cotisation "ne paiera pas" (exempt) flag — shared CU↔CG.** New `MemberCotisation.WillNotPay` (migration
  `AddCotisationWillNotPay`; the unique receipt index now excludes empty receipts so exemption-only marker rows
  coexist). `PUT /cotisations/exempt {memberId, scoutYear, willNotPay}` (cotisations.edit) upserts/removes a
  marker row (no payments, empty receipt). Set it on the CU matrix dialog OR the member-detail Cotisations tab
  (CG) — it's one shared per-(member,year) fact. Summary excludes exempt from "impayés" + reports a new
  `membersExempt`/`exemptMembers`; unpaid list drops paid OR exempt. "Paid" everywhere now = a cotisation **with a
  payment line** (so empty markers don't read as paid).
- **Ma fiche fixes (my-profile.tsx):** the global "Modifier" button only edited Profil/Médical but showed on every
  tab → now **only rendered on those two tabs** (Tabs made controlled). Assignments tab was hard `readOnly` → now
  `readOnly={!assignments.create}` so a leader can manage assignments from their own fiche (youth stay read-only).
  Documents upload already worked (own profile → canUpload); the dead Modifier button was the confusion.

### Member panel rebuild + reset-password RBAC (2026-07-05)
The Membres master/detail panel (`members/index.tsx`) was read-only except the SDL/GDL card number and
had NO reset-password button — that action only lived on the unused standalone `members/detail.tsx`, so
from where CUs actually work no one could reset a member's login. Rebuilt the panel + made reset an RBAC
permission (all on main, pushed; frontend + backend CODE — reaches prod on the next deploy).
- [x] **Header:** shows the login **username** under the name + a "Réinitialiser le mot de passe" button
      (confirm → one-time credentials dialog), next to the card-PDF button, always visible. New backend field
      `MemberDetailDto.Username` (correlated subquery on the linked user; null if no account).
- [x] **Full inline edit** ("Modifier" in the header): Identité/Scolarité/Médical become a form, Coordonnées
      (phones/emails/addresses) get add/edit/delete; the external-card-number editor folds into the form (no
      longer the lone editable field). Panel `key={memberId}` so edit state resets on member switch.
- [x] **Tabs 8 → 6:** merged **Documents+Cotisations** ("Documents & cotisations") and **Médical+Infos
      complémentaires** ("Médical & infos").
- [x] **New RBAC permission `members.reset_password`** (was piggybacking on members.edit). Endpoint re-gated
      (`[HasPermission(MembersResetPassword)]`); handler keeps the super-admin-or-active-unit-leader IDOR check.
      Seeded onto **chef-unite** (initial seed + SeedMissingPermissionsAsync back-fill) + super-admin/assoc-admin/
      chef-de-groupe via their All-derived sets; added to the security-profiles permission editor (Membres group)
      and the group-access **Membres/Complet** delegable set. Frontend reset button gated on the new permission.
      **Verified live:** a real CU (lynn.cortas) holds it and reset a member (200 + temp password).
- NOTE: an existing `assistant-de-groupe` profile is NOT auto-back-filled with the new perm (its seeder only
      creates-if-missing + strips CG-only powers) — a CG can grant it via Accès maîtrise. Not critical (CU covered).

### Member-data IDOR sweep — youth can't read other members (2026-07-09)
Root cause: the **read-only youth** profile is `Permissions.All.Where(.view)` — so a youth holds EVERY `.view`
perm (members/documents/cotisations/progression/passage.view) — AND `AuthAccess` puts their OWN unit in
`AuthorizedUnitIds` (all active-assignment units, role-agnostic). So any access check gated purely on a
`.view` perm or `AuthorizedUnitIds.Contains(unit)` let a plain youth read **co-unit members'** data via the
API (the frontend hid it, but the endpoints were open). Fixed by requiring the **`members.edit` leader signal**
(held by chef-unite/chef-de-groupe/assoc-admin/super-admin; NOT youth or chef-équipe) for every CROSS-member /
unit-wide read — super-admin and own-record (`MemberId == memberId`) bypasses preserved:
- **Documents** (commit fa85ec2): `CanAccessMember` non-own → members.edit; matrix/zip/expiring → new
  `IsUnitLeaderFor` (members.edit + unit). Status edit was already `documents.approve` (youth lack it).
- **Cotisations**: `CanAccessMember` non-own → members.edit (GetMemberCotisations + receipt PDF); `unpaid`
  list (member names) → members.edit else empty. `summary` left (aggregate counts, no personal data).
- **Guardians**: `CanAccessMember` gained an own bypass + members.edit; `CanAccessGuardian` → members.edit
  (mutations were already members.edit-gated at the controller).
- **Member detail** (`GetMemberByIdQuery`, full profile incl. medical/contacts) + **members LIST**
  (`GetMembersQuery`) + **photo** (`MembersController.GetPhoto`) → members.edit for non-own / listing.
- **Progression**, **CustomFields** (had NO check — added ICurrentUserService + own/leader gate),
  **Assignments** (`GetAssignmentsQuery` — non-leader restricted to OWN rows; leader keeps full cross-unit
  history), **Passages** (`CanAccessUnit` → members.edit).
- **Reports** (trombinoscope/roster/export/bulk-cards → members.edit + unit; member-card keeps own-bypass) +
  **unit dashboard** (`GetUnitDashboardQuery` → members.edit + unit). **Camp** already gated on
  camp.grade/camp.manage (not `.view`, so youth never had it). Admin dashboard already on maitrise.manage.
- Pattern used: `currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MembersEdit)`. Non-leaders get
  denied (400/403/404) or an EMPTY result (list/customfields/assignments/unpaid → 200 `[]`, no data).
- **Verified live** with a real read-only youth (co-unit member → all denied/empty; own data → 200; status
  edit → 403), a **pure chef-unite** (own unit → full access incl. list=73/detail/cotisations/guardians/
  progression/customfields/dashboard/matrix/passages; ANOTHER unit → all denied), and super-admin (200). Build
  clean. Backend-only, DEV until next deploy.

### Member self-edit + approval flow (2026-07-09)
A member can now maintain their OWN fiche. Two mechanisms:
- **Direct self-edit (no approval, own record):** new **auth-only** endpoints under `/my-profile/*` that always
  resolve the caller's own member id server-side (never a client id), so no `members.edit` needed and no co-unit
  IDOR path (unlike the leader-facing member commands). Covers: **profile** (`UpdateMyProfileCommand` — editable
  fields only: nationalité/école/classe/section/groupe sanguin + médical; LOCKED: nom/prénom/DOB/sexe/matricule/
  n° carte, which render read-only and are never sent), **coordonnées** (`MyContactHandlers`: phones/emails/
  addresses add/edit/delete, each own-scoped), and **famille** (`MyGuardianHandlers`: create-new + edit own linked
  guardians + contacts + unlink — **no search/link-existing**, so a member can't enumerate other families).
  Ma fiche (`my-profile.tsx`) uses self-service hooks (`my-profile-service.ts`); `MemberGuardians` gained a
  `selfService` prop that swaps to the self-service hooks and hides the search mode.
- **Propose + approval (progression + fonctions):** new unified `MemberChangeRequest` entity (Kind
  Progression|Assignment, PayloadJson, Summary, Status Pending→Approved|Rejected, ReviewedBy/At, DecisionNotes;
  migration `AddMemberChangeRequests`). A member **proposes** (`/change-requests/progression|assignment`, auth-only,
  own member) → **Pending**; their **CU or CG reviews** (`/change-requests/pending` + `/{id}/review`, gated on
  `members.edit` + member active in the caller's unit / super-admin) → **approve creates the real MemberProgression/
  MemberAssignment** from the payload, **reject** discards with a reason. `ChangeRequestHandlers`. Frontend:
  `MemberProgression` + `MemberAssignments` gained a `selfPropose` prop (member sees "Proposer" + their pending
  proposals in an amber banner); new CU/CG review page `/change-requests` ("Demandes de modification", sidebar
  nav + pending-count badge, perm `members.edit`).
- **Verified live:** youth self-edits classe/blood/allergies (204) with identity locked; youth proposes a
  progression + a fonction → CU sees both, approves the progression (real record created) + rejects the fonction
  (none created), statuses Approved/Rejected, badge count → 0; youth CANNOT review (403) and their pending list is
  empty. Builds clean (dotnet + tsc + eslint). Backend-only migration applies on prod startup; DEV until deploy.

### Dashboard: leader lands on the right unit + CG/ACG↔CU toggle (2026-07-09)
- **Land on the unit you LEAD, not one you belong to as a youth:** a member who is a youth in one unit and a
  chef/ACU in another used to land on `unitAccess[0]` (their youth unit). `UnitAccessDto` gained **`IsLeader`**
  (the assignment's role profile grants members.edit) — set in `GetMeQuery` — and the dashboard now defaults to
  the units they actually lead.
- **CG/ACG + CU/ACU mixed roles:** `UnitAccessDto` also gained **`IsGroupLevel`** (the role's profile
  `IsGroupLevel`). The dashboard now:
  - **Group-level** = super-admin / Chef de Groupe (maitrise.manage) / **Assistant Chef de Groupe** (a
    group-level role — no maitrise.manage). The group overview (`GetAdminDashboardQuery`) was relaxed to allow
    any active **group-level assignment**, so an ACG can now see it (was maitrise.manage-only). Sidebar
    `isManager` likewise includes group-level (an ACG gets the admin nav, still filtered by their own perms).
  - Someone who is **both** group-level AND a real unit leader gets a **Groupe | Mon unité toggle** — Groupe =
    the group overview, Mon unité = a picker of only the units where they hold a **CU/ACU** role (excludes the
    group Maîtrise assignment and all-units noise; their group-level access already reaches any unit via the nav).
- Verified live: Clara (youth in C1 + ACU in a Meute) lands on the Meute; a real ACG loads the group dashboard
  (200, was denied); an ACG+CU sees both dashboards and "Mon unité" = only their Compagnie. Backend-only DTO
  change, DEV until deploy.

### Member trombinoscope page (2026-07-09)
New member-facing page **Trombinoscope** (sidebar, under Ma fiche / Mes documents; `/my-trombinoscope`, all
members). Lists each **(scout year, unit)** the member was active in (current + past — derived from their
assignments via `ScoutYearHelper.Of(startDate)`, Oct-1 boundary); "Voir" opens the trombinoscope **PDF** for
that unit+year in a new tab. Backend `MyTrombinoscoreHandlers` (auth-only, `/my-profile/trombinoscopes` +
`/my-profile/trombinoscope?unitId&scoutYear`): the PDF roster = everyone active in that unit **during that
scout year** (date-range overlap on the `ScoutYearHelper.Window`), reusing `ITrombinoscoreService`. **Access
is limited to units the member was actually active in that year** (else 400). This is a DELIBERATE exception to
the member-data IDOR lock — a member sees co-members' photos/names for their own unit — but safe: the PDF is
generated server-side with photos embedded, so no per-photo endpoint is opened. Verified: a youth sees 3 years
of their Meute, gets a valid PDF, and is denied a unit they were never in. Shared `Common/ScoutYearHelper`
(Window + Of). DEV until deploy.
- **Single-page fit (2026-07-09):** the trombinoscope PDF used to paginate (big units spilled onto a 2nd/3rd
      sheet). `TrombinoscoreService.Generate` now **shrinks the photo cells to fit ONE page** — an
      `EstimateHeight(cellWidth)` steps the cell size down from the ideal (A4 56 / A3 70) to a floor (24pt) and
      picks the largest cell whose estimated grid height (teams + rows + headers) fits the page's usable height
      (7% safety margin + pessimistic 2-line name height so long scout names never spill). Photo/name-font/columns
      all derive from the chosen cell width; A3 still auto-selected for >60 members. Applies to BOTH the member
      trombinoscope and the CU report (shared service). Verified: 87-member Compagnie 1 → `/Count 1` (one page).
- **Friendly filename (2026-07-09):** the server now names the PDF `Trombinoscope <unité> <année>.pdf`
      (`TrombinoscoreFile.Name`, strips invalid chars) so the member page (opens the blob in a new tab → uses the
      server's Content-Disposition name) and the CU report both get a meaningful name. Both trombinoscope queries
      now return a `TrombinoscorePdf(Data, FileName)` instead of bare `byte[]`.
- **Photo history — SAVE (freeze) the trombinoscope (2026-07-09):** the trombinoscope always embedded each
      member's CURRENT photo, so regenerating a past year showed today's faces (roster/names were correct — assignments
      are date-scoped — but photos weren't historical; replacing a photo silently rewrote every past trombinoscope).
      FIX = **archive the generated PDF per (unit, scout year)** and serve THAT frozen file everywhere:
      - New entity **`TrombinoscopeArchive`** (UnitId, ScoutYear, FileName, `PdfData` bytea, MemberCount; one live
        row per unit+year, migration `AddTrombinoscopeArchive`). PDF bytes stored in the DB so snapshots travel with
        the pg dump.
      - Shared `TrombinoscoreRoster.BuildAsync` (current active roster grouped by team, Maîtrise first) +
        `CanManageUnit` (members.edit + unit) reused by the live CU query AND the archive save (identical PDF).
      - Endpoints (members.edit): `POST /reports/trombinoscope/archive` (freeze/overwrite for a unit+year, returns
        `{exists, fileName, savedAt, memberCount}`), `GET /reports/trombinoscope/archive` (status), `GET
        /reports/trombinoscope/archive/download` (re-download the saved PDF). `POST /reports/trombinoscope` stays the
        live **preview** (unsaved).
      - **CU dialog:** **generating IS saving** — one "Générer / Générer à nouveau" button freezes the current-roster
        PDF (upsert → replaces the old one for everyone) AND downloads it (no separate unsaved preview; the app no
        longer calls the raw `POST /reports/trombinoscope`, kept only for API integrations). A green status banner
        shows the saved version ("Version enregistrée le … · N membres · visible par les membres. Générer à nouveau
        la remplacera.") with a re-download link.
      - **Member page** now serves the **archived** PDF only (never live-regenerates with today's photos):
        `GetMyTrombinoscoreYearsQuery` marks each (year, unit) `Available` (= an archive exists); the page shows
        "Voir" when available else "Pas encore disponible"; `GenerateMyTrombinoscoreQuery` returns the frozen bytes if
        the caller was active in that unit that year (else "pas encore disponible" / access error).
      - Verified live end-to-end: super-admin archives Compagnie 1 (87 members, one page) → member sees available=true
        + downloads the same 57 KB PDF; a year she was in but unarchived → "pas encore disponible"; a unit/year she
        was never in → access denied. Build + tsc + eslint clean. DEV until deploy (migration applies on prod startup).

### Pre-launch batch — member mgmt, permissions, deletion lifecycle (2026-07-13)
A session of launch-prep work (all on main, pushed; DEV until the next deploy unless noted).
- **Public /unites cards → historic foulard colours.** Each unit card header is a diagonal two-tone band in its
  sub-group's scarf colours (2ᵉ Beyrouth solid blue · 3ᵉ blue/white · 10ᵉ blue/orange · Jamhour navy/light-blue),
  sourced from the old site. `components/public/foulard.tsx` (`foulardColors(name)` maps by sub-group in the unit
  name). Dropped the broken-looking Compass gradient + the redundant per-card age; unified header/description/grid.
- **Manual member creation upgraded** (`CreateMemberCommand`): optional **father/mother name + mother maiden name**
  → creates linked Père/Mère **Guardians**; **Classe optional**; optional **Unité placement** → an active
  assignment (no team, unit-type default function) so the member shows on the CU roster immediately; duplicate
  username now disambiguated with the **father's initial** (`georges.b.testparent`) instead of `x`. Unit placement
  is unit-scoped (a non-super-admin can only place in their own units).
- **Member creation restricted to CG / super-admin.** `members.create` removed from **chef-unite** (seed + an
  idempotent revoke in `SeedMissingPermissionsAsync` so existing DBs self-patch on startup + live dev DB). The
  "Nouveau membre" button is gated on `members.create`.
- **ACG = CG except Demandes + Camp BP.** `AssistantDeGroupePermissions` = `ChefDeGroupePermissions` minus
  `demande.*`, `camp.*`, `roles.manage_group` (the appointment tool stays CG-only so only the CG appoints). ACG
  now KEEPS `maitrise.manage`/`members.reset_password`/`rentree.manage`. `SeedAssistantDeGroupeProfileAsync` now
  **targeted-syncs** the base profile (adds missing baseline perms, revokes only the CG-only ones — doesn't nuke
  other admin edits). Added a **"Camp BP" delegable area** to *Accès maîtrise* (Demandes already existed) and
  removed `maitrise.manage` from `NonDelegatable` so an appointed ACG's forked profile keeps it. So a CG appoints a
  specific ACG to Demandes and/or Camp BP per function.
- **ACHG → ACG unify (data).** The active group assistant role was coded `ACHG` while the pre-consolidation `ACG`
  lingered as an archived role (55 historical assignments). Merged: moved that history onto the active role, deleted
  the empty archived ACG, renamed `ACHG`→`ACG`. Done on **live dev DB**; shipped to other envs via the new patch
  system (below). Seed/migration-tool still say `ACHG` — alignment deferred (a re-import/fresh DB isn't affected
  since the ScoutStructure seeder is guarded).
- **Automatic prod data-patch runner.** `deploy/patches/*.sql` = idempotent, reviewed **data** patches (not carried
  by EF migrations/seeders). `DataPatchRunner` (wired in Program.cs after migrations+seeders) applies each unrun
  patch once, in filename order, each in its own transaction, tracked in a **`data_patches`** table (runs at most
  once/DB). `.sql` copied into the app output at publish. Files must have NO `BEGIN/COMMIT` (the runner owns the txn)
  and are idempotent; a failing patch rolls back + logs + is skipped (never crashes startup). First patch:
  **`001_achg_to_acg.sql`** (the unify above). See `deploy/patches/README.md`. This keeps prod's member data
  untouched — only committed patch files run; dev-only cleanup never becomes a file.
- **Dashboard per-unit counts fixed.** The group dashboard counted **assignment rows over the whole scout year**
  (incl. mid-year leavers + double-counting members with >1 assignment row) → C1 showed 121 vs 86 real. Now counts
  **distinct members**, and for the **in-progress year** a point-in-time "today" snapshot (past years keep the
  window, still distinct). Applied consistently so per-unit sums to the total. Matches the public site (Meute 2 = 73
  both places).
- **Sidebar: managers get "Ma fiche".** A group-level user (CG/ACG/super-admin) was shown `adminNavItems` which
  lacked the personal links — extracted `personalNavItems` (Ma fiche / Mes documents / Trombinoscope) shown to
  EVERYONE, then the role nav.
- **Member deletion = two-phase lifecycle.** DELETE `/members/{id}` (members.delete) now **soft-deletes + disables
  the login immediately** (clears refresh token) — hidden + can't sign in, but fully restorable. A daily
  **`MemberPurgeBackgroundService`** permanently purges members soft-deleted > `member.purge_after_days` (new
  setting, default 30): the member, login, and ALL connected data (contacts, guardian links + orphaned shared
  guardians, documents+files, cotisations, progressions, assignments, passages, relationships, camp entries) in
  FK-safe order via `MemberPurgeService` (raw SQL bypasses the soft-delete interceptor; RESTRICT children cleared
  first, demande unlinked, member row cascades the rest). Login made defensive (null member → clean auth failure,
  no 500). New **"Corbeille"** admin page (`/admin/deleted-members`, sidebar Gestion, members.delete): lists deleted
  members with a purge countdown + **Restaurer** (undo + re-enable login) and **Supprimer définitivement** (purge
  now). No migration (reuses IsDeleted/DeletedAt). NOTE: the 53 members soft-deleted 2026-06-24 (merge losers/
  cleanup) will auto-purge ~2026-07-24 once live.
- **Dependencies bumped** (pre-launch, in-range, 0 vulns both stacks): Npgsql.EFCore 10.0.2→10.0.3, QuestPDF
  2026.7.0→2026.7.1; frontend `npm update` (84 pkgs — Radix, TipTap 3.27.3, vite 8.1.4, react-router 8.2, dompurify
  3.4.12, lucide 1.24). TypeScript 6→7 (major) deferred. Builds + 4 tests pass.

### "Déconnecter les autres appareils" — session control (2026-07-25)
Sessions use a stateless 15-min access token (localStorage, unrevocable until expiry) + a **single** rotating
refresh token per user (`User.RefreshToken`, SHA-256 hash, 7-day). So there is no session table/device list, and
each login/refresh **overwrites** the one token (whichever device refreshed last owns it; others are orphaned on
their next refresh). Change/reset-password already null the token (log out everywhere). Added an explicit,
discoverable control for a lost/shared/public device:
- **`POST /auth/sign-out-other-devices`** (`SignOutOtherDevicesCommand`, [Authorize]) — **rotates** the refresh
  token: issues a brand-new one (overwriting the stored hash, orphaning every OTHER device — their next refresh
  401s, access dies ≤15 min) and returns a **fresh token pair** so the CURRENT device stays signed in. Audited
  `SignOutOtherDevices`. No password change needed.
- **Placement:** header user dropdown ("Déconnecter les autres appareils", next to Modifier le mot de passe) —
  deliberately NOT on Ma fiche (would crowd the page for every member). Confirm dialog; on success
  `authStore.applyTokens(new pair)` re-persists so this device is uninterrupted. `useSignOutOtherDevices()`.
- Verified live: login A → sign-out-other-devices returns a new refresh token; the OLD token → **401**, the NEW
  token → **200** (current device kept in). Build + tsc + eslint clean. DEV until deploy.
- Inherent limits (stateless JWT): revocation is "≤15 min," never instant; still no per-device list / "last login
  from" (that needs a `user_sessions` table — backlog if leaders go multi-device); no MFA / new-device alert
  (a fresh login from a stolen laptop with the password looks normal). Deemed acceptable for launch.

### Go-live prep batch (2026-08) — manual verify + forced password + policy
Built ahead of the September go-live (all on main, pushed; DEV until deploy). Plan/decisions in memory
[[project-email-golive]].
- [x] **CG manual email-verify** (email verification is REQUIRED for demandes, so a parent whose verification
      email fails is stuck with no demande to act on): new page **`/admin/demande-accounts`** ("Comptes
      d'inscription", sidebar Suivi & demandes, perm demande.view) lists applicant accounts incl. unverified ones
      with no demande (unverifiedOnly + search). `GET /demandes/accounts` (IsGroupManager) +
      `POST /demandes/accounts/{id}/verify-email` (demande.manage, marks verified + clears token, audited
      `VerifyEmailManual`). Verified live.
- [x] **Force every member to set their own password on first login.** `User.MustChangePassword` (migration
      `AddUserMustChangePassword`) set on ALL temp-password paths (CreateMember, demande conversion, leader
      ResetMemberPassword) and cleared when the user sets their own (activation link/self-service reset via
      ResetPassword, or ChangePassword). Login/refresh/me carry the flag; **AppLayout shows a blocking
      "Définissez votre mot de passe" screen** (`ForcePasswordChange`) until cleared. Activation-link users set
      their password via the link (flag already clear) so they never see it. **Manual go-live script**
      `deploy/golive/force-password-reset.sql` (NOT in deploy/patches — deliberately not auto-applied) flags all
      existing member logins (excludes super-admins) when accounts are activated for real. Frontend nudge, not an
      access boundary (a member only accesses their own data).
- [x] **Password complexity configurable via Settings.** New `security.password_*` settings (min length +
      require upper/lower/digit/special, category "Sécurité") read by a cached **`IPasswordPolicy`** service that
      replaces the hardcoded `StrongPassword` across register/reset/change/applicant-register. The validation
      pipeline (`ValidationBehavior`) now runs **`ValidateAsync`** so the policy rule can read settings (sync rules
      unaffected; 4 tests pass). `GET /auth/password-policy` (anonymous) exposes the rules; the set/change/reset
      screens show a **live checklist** (`PasswordRules` + `lib/password-policy`) and enforce the same policy
      client-side. Verified live: weak passwords 400 with the right messages; endpoint reflects settings.
- NOTE (frontend enforcement): MustChangePassword blocks the UI only — the server doesn't reject API calls from a
      must-change user (they're authenticated as themselves, own-data only). Acceptable for launch (hygiene nudge).
- [x] **Communications — "Message aux chefs" (leaders broadcast tool).** Reusable CG tool (perm maitrise.manage)
      to send an email template to selected leaders — for the yearly rentrée onboarding + any mid-year
      announcement. Leaders-only by design (parents/all-members broadcast deliberately out of scope). Two seeded
      editable templates: **`cu_rentree`** (returning chef) + **`cu_rentree_nouveau`** (new chef = same + a "prise
      en main"). `GET /communications/leaders` lists leaders (active maîtrise assignment) with resolved contact
      email (`ContactEmailResolver`) + has-account + never-logged-in flags, filterable by unit + "nouveaux chefs"
      (never logged in); `POST /communications/send` queues the template per-recipient (leaderName/unitName/
      scoutYear/loginUrl) via the durable outbox → sent/no-email report. Page **`/admin/communications`** (sidebar
      "Message aux chefs", Unités & maîtrise group). Rentrée gained a task "Envoyer l'email d'accueil aux chefs"
      + a `goto-communications` action. Verified live: 69 leaders (63 w/ email), never-logged-in filter, send →
      Pending outbox rows + report. (The `docs/emails/cu_onboarding.md` draft is now superseded by the seeded
      templates — kept as reference.) See [[project-email-golive]].

### CU live audit + logging fix (2026-08-14)
Logged in as a real CU (Chef de Troupe, 89 members) and walked the whole stay against the live API — reads,
permission gates, IDOR, all 6 PDF/Excel/CSV reports, and mutations (passage propose, cotisation, reset-password)
all pass; IDOR is solidly blocked (404/400/403, no existence leak). Findings:
- [x] **FIXED — handled 4xx were logged as 500 Errors.** `ExceptionHandlingMiddleware` (registered outermost,
      Program.cs) wraps `UseSerilogRequestLogging`, so an exception it translates into a clean 4xx (FluentValidation
      →400, UnauthorizedAccess→403, Postgres constraint→409/400, QuestPDF→400) still propagated through Serilog
      first → logged as **"responded 500" + full stack** and persisted to `application_logs` (DB sink is Warning+),
      flooding the Journal des erreurs with non-errors (every form-validation failure / permission denial) and
      burying real faults — go-live's 2205 forced password changes would have amplified it on every fumbled attempt.
      Added a Serilog **`options.GetLevel`** that downgrades those deliberately-4xx exception types to Information
      (still in the file log; below the DB threshold); genuine unhandled faults + any 5xx stay Error. Client
      responses unchanged. Verified live: validation 400 / authz 403 / change-password 400 now produce ZERO
      Error-level DB rows. Backend-only, DEV until deploy.
- [x] **CHECKED (not a bug) — passage `/passage` client crash `baseRoleForType is not defined`** (a CU hit it
      2026-08-13): it was a transient stale/HMR bundle during the passage-change edit — the committed code defines
      the helper (tsc-clean, in-component scope). Re-verified in a real browser: the propose dialog opens, selecting
      an "up" destination (Troupe→Clan) auto-sets Fonction = base role **"Routier"**, field **disabled** + 0 options
      when clicked, no runtime error. The "up → base youth role only" change is confirmed end-to-end in the UI.
- [x] **FIXED (email observability, go-live) — silent email-delivery blindness → "Emails — file d'attente /
      échecs" admin page.** The problem: with email OFF (or SMTP misconfigured), reset-password / send-access /
      communications all report success ("envoyé"/counts) because those mean QUEUED not delivered; a Failed outbox
      row only logged a Warning (no alert, no admin UI). reset-password itself is OK (the dialog ALWAYS shows the
      temp password on screen as a manual fallback — the `sentToEmail` ternary only swaps the banner), but the
      link-based bulk flows (send-access / communications / demande-responses) have no on-screen fallback. BUILT a
      new super-admin/assoc-admin page **`/admin/email-outbox`** ("File d'emails", sidebar Système, perm
      associations.manage) over the `email_outbox` table: pending/failed/sent count cards, status filter + recipient/
      template search, per-row **last-error** (expandable) + **Réessayer** (requeue: fresh attempt budget, due now —
      the sender polls ≤15s, no signal needed) + **Supprimer**, plus **Réessayer les échecs** (bulk requeue) and
      **Vider les envoyés** (housekeeping). Backend `Application/Email/OutboxHandlers.cs` (Get/Retry/RetryFailed/
      Delete/PurgeSent) + `EmailController` `/email/outbox*`. Payload is deliberately NOT exposed (holds the temp
      password for reset templates). Verified live: CU 403; super-admin list/summary, single retry (→Pending,
      attempts 0), bulk retry-failed (count), CU-blocked; page renders clean. STILL DO at go-live: pilot-verify SMTP
      to Maîtrise before any mass send. See [[project-email-golive]]. Backend+frontend, DEV until deploy.

### Members unit-filter dropdown — scroll fix + Maîtrises + hide-empty (2026-08-15)
Four fixes to the members-page "Toutes les unités" filter (from a live report):
- [x] **Long dropdowns now scroll (shared primitive bug).** `ui/select.tsx` `SelectContent` had
      `max-h-[--radix-select-content-available-height]` — in **Tailwind v4** a bracket CSS-var needs `var()`, so
      the height cap emitted invalid CSS and never applied → long lists (units, schools) overflowed past the
      viewport with no scroll. Fixed to `max-h-[var(--radix-...available-height)]` (+ the `origin-[var(...)]`).
      Fixes EVERY long Select in the app.
- [x] **"Maîtrises" filter option** — shows all leadership-role holders across the caller's units. Backend
      `GetMembersQuery` gained a `Maitrise` flag (active/alumni-aware, scoped: super-admin/CG all units, CU their
      own) + `?maitrise=` on `GET /members`. Verified: 69 maîtrise members group-wide.
- [x] **Hide empty units, per view.** New `GetMemberUnitOptionsQuery(alumni)` + `GET /members/unit-options?alumni=`
      returns only units that HAVE members in the current view (with a count): under **Actifs** a unit with no
      active members is hidden; under **Anciens** it appears if it still has former members. Verified live: Actifs
      18 units (incl. "Compagnie (Non affectés) 1"), Anciens 17 (empty placeholders gone). The dropdown fetches
      this (re-fetched on the Actifs/Anciens toggle) instead of listing all units; the create-form unit picker
      still lists all active units. GOTCHA: EF can't translate `GroupBy(...).Count()` over a `Distinct()` subquery
      → materialize the distinct (member,unit) pairs via `SELECT DISTINCT` then group in memory (bounded set).
- [x] **Reset stale selection on toggle:** if the chosen unit vanishes from the options after flipping Actifs/
      Anciens, the filter falls back to "Toutes les unités" (render-phase reset). Export + the export dialog treat
      `maitrises` as a non-unit (disabled, like `all`/`none`). Build + tsc + eslint + vite clean. DEV until deploy.

### Member feedback on rejected change-requests + small UX (2026-08-19)
Follow-ups (backend + frontend; all on main, pushed at v3.3.0; DEV until deploy).
- **A member now sees a REJECTED change-request on Ma fiche (was silent).** `member-progression.tsx` +
  `member-assignments.tsx` (self-propose mode) only showed **Pending** proposals — once a CU/CG rejected one it
  became `Rejected` and was filtered out, so the member saw nothing and no reason. Now a **red « Proposition
  refusée » banner** lists rejected proposals with the **« Motif : … »** (`decisionNotes`), and the member can
  **dismiss** it (X). New backend `DELETE /change-requests/{id}` (`DismissChangeRequestCommand`, auth-only,
  own-record only, soft-deletes the row) + `useDismissChangeRequest`. Approved ones need no notice (the real
  progression/assignment already shows in the list).
- **Refuse dialog wording** (`change-requests.tsx`): footer was **Annuler / Refuser** (two negatives, confusing)
  → now **« Retour »** (dismiss) / **« Confirmer le refus »** (the destructive action).
- **Ma fiche « Mes documents » bar** (`documents-cta.tsx`): counted only Approved, so an uploaded-but-unverified
  dossier read « 0/2 — envoyez vos documents » (looked like nothing was submitted). Now the sub-label reflects the
  real state — **« Documents envoyés — en attente de validation »** when all uploaded & pending, « N à corriger »
  when rejected — plus a **« · N en attente »** hint next to the count and a **two-segment bar** (green = accepted,
  amber = uploaded/awaiting). Still « Dossier complet — merci ! » at 100% approved.

### Custom fields — "Rempli par" scope (member / CU / CG) (2026-08-19)
Each custom field now declares WHO may fill its value (backend + frontend; migration applies on prod startup).
- **`CustomField.EditableBy`** (migration `AddCustomFieldEditableBy`, `editable_by` varchar default **`UnitLeader`**
  so existing fields keep the prior behaviour = leaders edit): `Member` (the youth themselves + leaders),
  `UnitLeader` (chef d'unité + chef de groupe), `GroupLeader` (chef de groupe only). **Reading is unaffected** —
  only editing is gated. Hierarchy: a higher level can always edit lower-scoped fields.
- **Backend enforcement** (`CustomFieldHandlers.cs`): the leader endpoint (`PUT /custom-fields/member/{id}/{fieldId}`,
  members.edit) now rejects a `GroupLeader` field unless the caller is a group manager (`MemberAccess.IsGroupManager`)
  — a CU with members.edit can't touch it (400 "réservé au chef de groupe"). New **member self-service** endpoints
  `PUT|DELETE /my-profile/custom-fields/{fieldId}` (auth-only, own member resolved server-side) allow a youth to fill
  **only `Member`-scoped** fields (`SetMyCustomFieldValueCommand` / `DeleteMyCustomFieldValueCommand`). Create/Update
  commands + validators carry `EditableBy` (allowed-set `CustomFieldEditableBy.All`); DTOs expose it. Shared
  `CustomFieldValueOps` (type-validate + upsert) reused by both write paths.
- **Frontend:** admin *Champs personnalisés* form gained a **« Rempli par »** select (Le membre / Chef d'unité /
  Chef de groupe) + a table column. `MemberCustomFields` gained `selfService` (Ma fiche passes it) and per-field
  `canEdit` (group-manager → any; unit-leader → Member+UnitLeader; member → Member only); non-editable fields render
  **read-only with a « Rempli par … » lock hint**. Self-service uses the `/my-profile/custom-fields` hooks; leaders
  use the members.edit hooks. Mirrors the server rules so the UI never offers an edit the API would reject.
- Verified live: member self-sets a `Member` field (204) but is blocked on a `GroupLeader` field (400); admin/leader
  sets any; bad `editableBy` → 400. Default `UnitLeader` preserves existing fields. dotnet + tsc + eslint clean.

### Fix a member's unit — "Corriger l'unité" (2026-08-24)
For a WRONG placement (member accepted into / passage-sent to the wrong unit) where the wrong assignment must
NOT be kept. Distinct from PASSAGE (which ends the old assignment + creates a new one, preserving history): a
**correction repoints the CURRENT active assignment IN PLACE** so the wrong unit leaves no trace.
- **Backend** `Assignments/Commands/CorrectMemberUnit/CorrectMemberUnitCommand.cs` (`PUT /assignments/{id}/
  correct-unit {newUnitId}`): keeps the original StartDate; **resets the team** to none (old team belonged to the
  old unit; receiving CU assigns later); **role** is kept when the unit TYPE is unchanged, else replaced by the new
  type's **default** youth role (`FunctionalRoleQueries.ResolveBaseRoleIdAsync`); **CG/super-admin only**
  (`MaitriseManage` on the controller + `MemberAccess.IsGroupManager` in the handler); guards (active assignment
  only, new unit exists+active, not same unit). Any **Passage** that finalized the member INTO the old unit is
  KEPT with an appended CgNotes note `[Unité corrigée le … : old → new]` (case 2); audited `CorrectUnit`.
- **Frontend** `member-assignments.tsx`: an "↔ Corriger l'unité" action on each active post (shown only with
  `maitrise.manage`) → dialog explaining it's for a mauvaise affectation (moved in place, old unit not kept, team
  reset, role adapted) + a new-unit picker (active units, current excluded). `useCorrectMemberUnit` hook.
- **Verified live:** same-type keeps the role; cross-type (Compagnie→Meute) switches to the Meute default
  (Louveteau); team reset + start date preserved; a CU (members.edit, no maitrise.manage) → 403, super-admin → 204.
  Backend+frontend, DEV until deploy. NOTE: Naia F-0629's C1 placement is still an ASSUMPTION to verify
  ([[project-fix-member-unit]]) — she's the first real use case for this tool.

### Fratries — sibling reconciliation (2026-08-24, v3.5.0, DEV until deploy)
A CG tool to IDENTIFY siblings (the import left duplicate/inconsistent parent records) → approve/reject → and on
approve RECONCILE the family data. Design decisions (user): explicit **sibling group** + reconcile **parents +
address + contacts**. Full plan in memory [[project-link-siblings]].
- **Domain:** `SiblingGroup` (a fratrie; `Member.SiblingGroupId` FK, SetNull) + `SiblingRejection` (tombstone of a
      rejected pair, unique on normalized (A,B)). Migration `AddSiblingGroups`.
- **Suggestion engine** (`GetSiblingSuggestionsQuery`, gated maitrise.manage): builds candidate PAIRS (edges) from
      4 signals — shared guardian record / guardians sharing a phone / sharing an email (all **Élevée** — the phone &
      email ones catch DUPLICATE parent records) / same last name + same street (**Moyenne**) — drops rejected pairs
      + pairs already in one confirmed group, then **union-find** into families (edge-level filtering means a rejected
      pair splits a family). Buckets size-capped (guardian/contact 15, address 12) to avoid bogus mega-families;
      ≤200 suggestions. Verified live: 200 families with real evidence, incl. cross-spelling catches (MOAWAD/MOUAWAD
      via shared parent email).
- **Reconcile** (`ApproveSiblingGroupCommand`, transactional): create/merge the group + set it on all selected
      members; for the CG-chosen canonical **père/mère**, re-point every sibling's parent link to it, **merge the
      duplicate parents' phones/emails onto the canonical** (deduped) and soft-delete the orphaned duplicate
      guardians; copy the chosen **address** to all siblings; drop tombstones among them. GOTCHA (same as multi-page
      docs): insert child contacts via the DbSet with the FK, NEVER mutate the tracked parent's nav collection (that
      throws DbUpdateConcurrencyException). Verified live end-to-end on the GHORAYEB family (3 mother spellings →
      1 canonical, links repointed, contacts merged) then **restored dev to baseline** via a timestamp marker.
- **Reject** = tombstone each pair. **Link/Unlink** (manual, from a member fiche): group two members / remove one
      (dissolves a <2 group). **GetMemberSiblingsQuery** (gated by MemberAccess) powers the fiche section + Ma fiche.
- **API** `SiblingsController` (api/v1/siblings): suggestions, groups, reconcile-data, approve, reject, link,
      unlink (maitrise.manage) + member/{id} (member-access). Endpoints validated live (suggestions 200/0.27s,
      link/unlink/reconcile/approve all correct). Fixed a `DateOnly.MaxValue` OrderBy that EF couldn't translate
      (materialize then sort in memory).
- **Frontend:** `sibling-service.ts` + page **`/admin/siblings` "Fratries"** (sidebar Unités & maîtrise,
      maitrise.manage) — Suggestions tab (evidence chips + confidence + Réviser/Rejeter; the Réviser reconcile dialog
      picks canonical père/mère/adresse, defaults to the record covering the most siblings) + Fratries confirmées tab
      (search + per-member unlink). `MemberSiblings` component on the member fiche Famille tab (CG: link/unlink,
      clickable to the sibling) + on Ma fiche (display-only). tsc + eslint + vite clean.

### Member editing + admin-log clears + dashboard/startup fixes (2026-08-25, DEV until deploy)
A batch from live CU/CG testing on dev. All on main, pushed; build (dotnet+tsc+eslint+vite) clean; live-verified.
- **Fratries redesign:** the sibling reconcile dialog now shows a family-comparison view — "Après confirmation"
      summary (résulting unified family), children as a checkable grid, and père/mère as comparison CARDS with full
      contacts + "Principale"/"Sera fusionné" tags when duplicates exist. Suggestion cards split into children +
      an "En commun" panel (typed evidence w/ icons). (see [[project-link-siblings]])
- **Edit unités/fonctions:** the assignment edit dialog USED to lock unit/team/fonction (dates only). Unlocked —
      the Pencil (Modifier) on any post now edits unité/équipe/fonction + dates (CG/CU). Backend UpdateAssignment
      already accepted it (frontend-only). For a real branch move that keeps history, still use the passage.
- **Edit progressions:** new `UpdateMemberProgressionCommand` + `PUT /progressions/{id}` (progression.manage,
      same access model as create/delete) + a "Modifier" action on each progression entry (was add/delete only).
- **"Active member with no unité/fonction" mystery (dev): NOT a data bug.** All 1080 active members have a valid
      unit+role. The empty "Postes actuels" panel a CG saw was a TRANSIENT stale result — the API was restarted
      several times during the session, so a panel request that landed mid-restart cached an empty list. Reload
      fixes it. BUT it surfaced a real latent bug (fixed): `GetAssignmentsQuery` projected `a.Unit.Name`/
      `a.FunctionalRole.Name` as required navs → INNER JOIN, so a SOFT-DELETED unit/role would silently DROP the
      whole assignment row (member looks "active with no post"). Made null-safe (LEFT JOIN) → shows "(unité/
      fonction supprimée)" instead of dropping. 0 members affected today; defensive.
- **Audit log "Vider le journal":** `DELETE /audit-logs` (`PurgeAuditLogsCommand`, super-admin only via handler
      throw, optional `?before=` normalized to UTC for the timestamptz column) + a super-admin button on the Journal
      d'audit page (mirrors the error-log clear).
- **Dashboard load:** `dashboard.tsx` statically imported `UnitLeaderDashboard` (which pulls the whole member-
      detail panel + report/export dialogs), bloating the group-dashboard LANDING chunk. Lazy-loaded it → landing
      chunk ~33kB→11kB, unit-leader split to its own ~22kB chunk loaded only when a leader opens their roster (also
      removes the heavy dev on-demand compile an admin hit on the dashboard). Backend /dashboard/admin was ~0.12s.
- **Dev "WebRootPath not found (wwwroot)" warning** silenced (dev API is API-only; guarded SPA static + fallback
      behind !IsDevelopment). **Error alerts / go-live:** to see errors when the site is down, the out-of-band path
      is file logs + `application_logs` in PG + the `ErrorAlerts:Smtp` email alert (config in prod appsettings) —
      NOT a public error page (would leak PII). Set `ErrorAlerts:Smtp` at go-live. (see [[project-email-golive]])

### Member first-login welcome tour (2026-08-26)
- [x] **A short, once-per-member onboarding carousel** for REGULAR members (youth/parents) on first login —
      orients them to the 3 things that matter (envoyer ses documents → CTA to /my-documents · tenir sa fiche à
      jour · où changer le mot de passe / trouver l'aide). Deliberately a **carousel, not a DOM-spotlight tour**:
      the member base is mobile-heavy and the member nav is behind a hamburger, so pointing at sidebar items
      would break — the carousel is layout-independent and tiny (no tour library).
- [x] **Server flag** (`Member.OnboardingSeenAt`, migration `AddMemberOnboardingSeen`) so it never re-appears on
      another device (not localStorage). Exposed as `MeResponse.HasSeenOnboarding` (via GetMeQuery → also on
      `/auth/bootstrap`); `POST /my-profile/onboarding-seen` (`MarkOnboardingSeenCommand`, auth-only, own member
      resolved server-side, idempotent) stamps it. Any dismissal (skip / finish / CTA / outside-click) marks it
      seen — optimistically flips the cached user flag so it hides instantly; the server call is best-effort.
- [x] **Members-only** (chefs get the printed guide): `MemberWelcomeTour` (mounted in AppLayout after the
      password/contact gates, self-gating) shows only when the user is NOT a super-admin and holds NO leadership
      (`isLeader`) or group-level (`isGroupLevel`) role — so CU/ACU/CG/ACG are excluded; a chef d'équipe (member,
      no members.edit role) still sees it. Verified live: the flag round-trips False → 204 → True. DEV until deploy
      (migration applies on prod startup). Companion doc: the CU guide (`docs/guides/guide-chef-unite.md`) was also
      refreshed this session (Réunions/absences section, Actions ▾ menu, renamed items).

### Country-aware phone formatting (2026-08-28)
Phone numbers now format per-country as-you-type + display formatted everywhere. Frontend-only + one small
backend robustness fix. DEV until deploy.
- **`components/ui/phone-input.tsx`** — `libphonenumber-js` (default/min bundle, ~25 KB gz, lazy with the
      routes that use it). `formatPhoneNational(dialCode, raw)` derives the calling code from the stored dial
      code (`+961` → `961`) and runs `AsYouType({defaultCallingCode})` → national grouping (Liban "76 123 456",
      "01 234 567"; landlines too). `formatPhoneDisplay` = `"+961 76 123 456"`. `<PhoneInput dialCode value
      onChange>` formats as the user types. All defensive (unknown/foreign country → returned as typed, never
      throws). Lebanon (~99% of numbers) formats correctly with the small bundle; other countries pass through.
      **Caret preservation:** reformatting inserts grouping spaces, which by default snaps the caret to the end
      each keystroke (a visible flicker/jump). `PhoneInput` remembers how many DIGITS were before the caret,
      reformats, then restores the caret right after that digit in a `useLayoutEffect` (before paint) — only when
      the string actually changed. Verified: the caret always lands after the last-typed digit, no flicker.
- **Stored value = the formatted string** (spaces), so it shows formatted EVERYWHERE for free — including the
      backend-generated PDFs / rosters / exports (which concatenate `CountryCode + " " + Number`, no .NET formatter
      needed) and the wizard recap. Legacy migrated digit-only numbers are formatted on DISPLAY via
      `formatPhoneDisplay`.
- **Wired:** the demande wizard (child + guardian phones), Ma fiche (add/edit phone + display),
      member-guardians self-service (add + display), the CU member panel (add/edit phone + display), and the
      leader contact-verification screen. (Backend PDF/roster/export display formats for free from the stored value.)
- **Backend dedup made digit-robust** (`DemandeAdminHandlers`): formatting spaces would have broken the
      exact-string guardian phone match at demande→member conversion (formatted "76 123 456" vs migrated
      "76123456" → a duplicate parent). `guardianByPhone` now keys by **digits only** (`PhoneDigits` helper;
      the guardian_phones table is small, loaded once and normalized in memory), and `FindExistingGuardian`
      looks up by the applicant guardian's digits. So "76 123 456" ≡ "76123456" — no duplicate guardians.
- Verified: as-you-type "76123456"→"76 123 456", legacy "76123456" displays "+961 76 123 456", landline
      "01234567"→"01 234 567", digit-match dedup equal; dotnet + tsc + eslint + vite clean; API smoke OK.
- NOTE (not wired, low value): admin/settings phone fields + the CU roster/dashboard inline contact strings
      that come pre-concatenated from the backend already show the stored formatted value, so they're covered;
      the SMTP/config phone-ish fields are not phone numbers.

### "Rester connecté" (remember me) + support-email help note (2026-09-01)
Two login-experience items (all on main, pushed; DEV until deploy). Verified live.
- **Support-email help note.** New setting **`demande.support_email`** (default `demande@gndj.org`, category
      demande, CG-editable in Paramètres → Inscriptions; empty = hide) exposed via **both** `PublicSiteConfigDto`
      (member login) + `ApplicantConfigDto` (portal). New `<SupportNote>` component renders "Un problème de
      connexion ou d'inscription ? Écrivez-nous à …" on the member `/login` and ALL applicant auth pages (via
      `ApplicantAuthShell` — login/register/verify/closed-landing). Motivated by a flood of "Échec connexion"
      audit rows during enrollment (parents on the wrong login page / wrong email). Diagnostic query
      **`deploy/diagnostics/failed-logins.sql`** (read-only, run on prod) classifies each failing email from the
      audit log: valid member login (wrong pw) / has an INSCRIPTION account (wrong page) / member typing personal
      email vs synthetic username / unknown. The `LoginFailed` audit already stores `{Email, Reason}` in new_values.
- **"Rester connecté" (remember me), default ON, BOTH realms.** Model reminder: 15-min access JWT + one rotating
      refresh token per account. Levers changed:
  - **Idle timeout 15 → 30 min** (member `SessionWarning`; the applicant portal has no idle timer). When
        "remember me" is ON the idle-logout is **suppressed** (silent refresh instead — `keepAlive = active ||
        remembered`); the 30-min idle-logout + countdown warning apply only to a NOT-remembered session.
  - **Refresh window**: `ITokenService.GetRefreshTokenExpiry(bool rememberMe)` → **30 days** remembered (config
        `Jwt:RememberMeExpirationDays`, default 30) vs **7 days** session. `LoginCommand`/`RefreshTokenCommand`/
        `LoginApplicantCommand`/`RefreshApplicantTokenCommand` gained `RememberMe` (register stays 7-day); the
        frontend sends it on login AND on every refresh so rotation keeps the right window. Verified live: login
        rememberMe=true → refresh_token_expiry +30d, false → +7d.
  - **Token storage centralized** in `client/src/lib/token-storage.ts` (realm = member|applicant): ON → tokens in
        **localStorage** (persist across restart); OFF → **sessionStorage** (cleared on browser close = shared-device
        mode). The remember flag persists in localStorage so reads/refresh use the same backing store; reads check
        sessionStorage first then localStorage; writes clear BOTH first so exactly one store holds tokens. Both api
        clients (`api-client`/`applicant-api-client`), both auth stores, `session-warning` and `error-report` all
        read/write through the helper (no direct `localStorage.getItem('accessToken')` left). **Deploy-safe:**
        existing sessions have no flag → default remembered → localStorage → keep working, no forced logout.
  - Checkbox "Rester connecté sur cet appareil" on both login forms (`login-form.tsx`, `inscription/login.tsx`),
        default checked. Build clean (dotnet 0/0, tsc + eslint + vite), migration-free.
- **Login-experience trio (same day).** (1) **Audit both portals + tag it.** The applicant login was NOT audited
      at all → `LoginApplicantCommandHandler` now injects `IAuditService` and logs `Login`/`LoginFailed` as
      entity_type **`ApplicantAccount`** with `{Email, Reason, Portal="Portail des demandes"}`; the member login
      audit gained `Portal="Espace membres"` (both success + fail). Audit page: `ENTITY_LABELS.ApplicantAccount =
      "Compte d'inscription"`, `FIELD_LABELS.Portal = "Portail"`. `deploy/diagnostics/failed-logins.sql` now shows a
      `portail` column (covers both). (2) **Cross-portal suggestion.** New setting exposure `user_domain`
      (e.g. `scouts.gndj`) on BOTH `PublicSiteConfigDto` + `ApplicantConfigDto`; `lib/email-domain.ts` helper — the
      member login shows "Aller au portail des demandes →" when the typed email's domain ≠ user_domain (and
      inscriptions open), the portal login shows "Aller à l'espace membres →" when it = user_domain. (3) **3 failed
      logins → offer reset.** Both login forms count consecutive failures (client-side, reset on success); at ≥3 an
      amber box links to the password reset (member also → "retrouver votre identifiant"). Verified live: applicant
      login failure audited with the portal; both configs return userDomain=scouts.gndj. Build clean, migration-free.

### Member "Profession" field + optional classe (2026-08-29)
Some chefs/aînés (Clan, Noyau, maîtrises) are working professionals, not students — so the member area needed a
Profession field and classe shouldn't be mandatory for them.
- **New `Member.ProfessionDomain`** (nullable; migration `AddMemberProfessionDomain`) — a **category from the
      managed `member.profession_domains` list** (the SAME categories the demande uses for guardians). UI label
      "Profession". Wired into CreateMember + UpdateMember + UpdateMyProfile (commands/validators/mapping),
      MemberDetailDto + GetMemberById projection, and the member-service TS types.
- **Classe made optional in the member area:** `UpdateMember` + `UpdateMyProfile` dropped the `NotEmpty` on
      Classe (CreateMember was already optional); the member forms no longer require it (a clearable Select).
      The **demande wizard keeps classe required** (untouched — it reads the same list but its own validators).
- **Frontend:** a "Profession" Select (from `member.profession_domains`) added next to Classe in the member
      create dialog, the member edit panel, and **Ma fiche** (`my-profile.tsx`); shown for all members (optional),
      intended for Clan/Noyau/maîtrise. Detail views show Profession when set.
- **Managed-list cascade:** renaming/archiving a profession domain in *Listes* now also cascades to
      `members.profession_domain` (added to `ListValueHandlers` usage-count + rename cascade, alongside guardians).
- Verified live (admin API): update with classe=null → 204 (was 400 "La classe est requise"); profession value
      persists + reads back. Builds clean (dotnet + tsc + eslint), migration applied on dev. DEV until deploy.
- **Free-text Profession + "Situation" toggle (2026-08-30):** added `Member.Profession` (free-text job title,
      migration `AddMemberProfession`) paired with the existing `ProfessionDomain` category — mirrors the guardian
      model (Domaine + free-text Profession). Wired through Create/Update/UpdateMyProfile (params + NoHtml/≤150
      validators + mapping), `MemberDetailDto` + the detail projection. The member forms (panel + create dialog +
      Ma fiche) now show a **"Situation" segmented toggle — Scolarisé(e) / En activité**: student → Classe + Section,
      working → Domaine (select) + Profession (free text). **Mutually exclusive**: the hidden side is sent as null on
      save (`situation==='student'` clears profession(Domain); `'working'` clears classe/section) so a member is
      never both; the toggle's initial state is derived from the data (profession filled → working). Read-only views
      show Domaine+Profession or Classe+Section accordingly. Verified live: update→working persists profession +
      clears classe; `<script>` → 400. Builds clean (dotnet+tsc+eslint+vite). DEV until deploy.
- **Branch-gated (2026-08-30):** the "En activité / Profession" option is HIDDEN for youth (school-age) — the toggle
      shows only when `MemberDetailDto.ShowProfession` is true. Server-computed in `GetMemberByIdQuery`:
      false for a member whose EVERY active assignment is a **non-maîtrise role in a youth branch**
      (`YouthBranchCodes` = MEU/RON/COM/TRO); true for maîtrise/chefs (even in a youth unit), older branches
      (Clan/Noyau/JEM/Feu…), or no active assignment. Panel + Ma fiche gate the toggle + force 'student' on it; the
      create dialog gates on the selected unit's branch (`UnitDto.UnitTypeCode` added to the list query + TS type;
      `YOUTH_BRANCH_CODES` const). Verified live: pure youth (Meute) → false (no toggle); Clan member → true; chef in
      a youth branch → true; a youth who is ALSO an ACU elsewhere → true (correct — leaders can work).

### Member groups (rule-based) + group réunions + ACU profile split (2026-08-30)
Reusable **rule-based member groups** — created by a group manager (CG/ACG/super-admin, `maitrise.manage`) — usable
as a **réunion scope** (and reusable elsewhere later). Replaces a first draft of two hardcoded "dynamic groups".
- **Entities** (`MemberGroup` + plain child `MemberGroupRule`, migration `AddMemberGroups`): a group = a **scope**
      (`Group` / `UnitType`+unitTypeId / `Unit`+unitId) + **rules**. Membership = **union of include rules minus
      exclude rules**, constrained to the scope, resolved LIVE by **`Common/MemberGroupResolver.RosterQuery`**
      (returns `IQueryable<MemberAssignment>` of active members; UNION ALL of include predicates, `.Where(!excl)`).
      Criteria (`MemberGroupCriteria`): `all` / `maitrise` / `youth` / `team-leader` (IsTeamLeader) / `profile`
      (Value=code) / `role` / `unit` / `unit-type` / `member` (Value=GUID, parsed OUTSIDE the expr tree). `IsVisible`
      = the show/hide-in-pickers toggle; `IsSystem` = a seeded preset (only show/hide-able, not deletable).
- **CRUD** (`MemberGroups/MemberGroupHandlers.cs` + `MemberGroupsController` `api/v1/member-groups`, gated
      `maitrise.manage`): list (with live member count per group) / create / update (a system preset only toggles
      visibility) / delete (blocked for a preset or a group used by réunions — hide instead). Validated (scope needs
      its target; ≥1 include rule; value-requiring criteria need a value).
- **Réunions integration:** `Meeting.MemberGroupId` (FK, migration in `AddMemberGroups`) replaces the draft string;
      `GetAttendanceScope` returns usable groups (manager → all visible; a CU → visible Unit-scoped groups of their
      units); `GetMeetings`/create/attendance/update/save branch on the group (roster via `RosterQueryForAsync`,
      anchor unit = the group's own unit for Unit-scope else the Groupe unit, approved immediately). Access:
      `AttendanceAccess.CanManageGroup` = Unit-scoped → that unit's manager (CU/CG); else group manager. The
      attendance page's scope picker now lists **Unités + Groupes**; the create dialog hides the team selector for a
      group. New admin page **`/admin/member-groups` "Groupes"** (sidebar Unités & maîtrise) = a full rule builder
      (scope + include/exclude rows with per-criterion value pickers: profile/role/unit/branch/member-search).
- **Two seeded presets** (`SeedMemberGroupPresetsAsync`): **Grande Maîtrise** (rule `maitrise`, group-wide) +
      **Chefs d'unité** (rules `profile:chef-unite` + `profile:chef-de-groupe` + `profile:assistant-de-groupe` = CU +
      MDG). Verified live: 70 and 27 members respectively (match SQL).
- **ACU profile split** (`SeedAssistantUniteProfileAsync`, one-time, after ScoutStructure): creates
      **`assistant-unite`** (clone of chef-unite's perms — no behaviour change) and moves the **assistant** maîtrise
      roles (name contains "assistant"/"adjoint" or starts "co-") off `chef-unite` → so `chef-unite` = the unit
      HEADS only, which makes "Chefs d'unité" a clean rule. Moved 10 roles (ACM/ACR/ACO/ACT/ACC/ACN/ACJ/ACF/ACML/CAJ);
      heads (CM/CR/CCO/CT/CC/CN/AJ…) stayed. Nothing branches on the `chef-unite` code (only seed defs), so safe.
- **Who manages:** dynamic-group réunions + the group definitions are CG/ACG/super-admin (`maitrise.manage`); an ACG
      that had it stripped can be granted via *Accès délégué*. A Unit-scoped group's réunions are managed by that
      unit's CU too. Verified live end-to-end: create group meeting → roster 70 + per-member unit column + save
      absence + list counts; custom Unit-scoped "Haute Patrouille" (team-leader rule) → 4 members; preset delete
      blocked; dev left with only the 2 presets. Build clean (dotnet + 4 tests + tsc + eslint + vite). DEV until deploy
      (migrations `AddMemberGroups` + the seeders apply on prod startup).
- **Where a group appears (refined same day):** a **whole-group** group (`ScopeType=Group` → Grande Maîtrise, Chefs
      d'unité) is a **top-level** réunion scope (group managers). A **branch/unit** group (`UnitType`/`Unit` scope, e.g.
      "Haute Patrouille" on the Troupes branch) is **unit-context**: it does NOT show top-level — it appears in the
      relevant unit's **"Concernés"** list when creating a réunion, resolves to **that unit only** (roster = the
      group's rules **∩ the réunion's unit**), and its réunions show **within that unit's** list. Managed by that
      unit's CU/CG (not group-manager-only). Wiring: `AttendanceScopeDto.UnitGroups` (per manageable unit, its
      applicable branch/unit groups; UnitType matches the unit's `UnitTypeId`, Unit matches the unit) alongside
      top-level `Groups` (whole-group only); `GetMeetings(unitId)` now includes unit-context group réunions (excludes
      whole-group) with per-group `∩ unit` roster counts; create anchors a UnitType group to the passed `UnitId`
      (validated to the branch); `RosterQueryForAsync` ∩'s the meeting's unit for non-whole-group; access =
      `CanManageGroupMeeting(scopeType, meeting.UnitId)`. Frontend: the create dialog's Concernés = Toute l'unité +
      teams + applicable groups; a group réunion shows a group badge. Verified live: Haute Patrouille (Troupes,
      team-leader rule) → in all 3 Troupes' Concernés (not top-level), réunion for one Troupe → its 7 team-leaders
      only + listed in that Troupe.
- **Réunions "Concernés" dropdown grouped (2026-08-30):** teams and groups are now split into labelled
      `SelectGroup` sections ("Équipes" / "Groupes"; "Toute l'unité" stands alone at top) so they're visually distinct.
- **`MemberGroup.ShowInUnitList` — "Visible dans la liste de l'unité" (2026-08-30):** a SECOND, independent
      visibility toggle (migration `AddMemberGroupShowInUnitList`, bool default false; `IsVisible` = réunions picker,
      `ShowInUnitList` = CU roster). When on, the group is offered as a **filter** in the CU/CG unit-leader roster
      (`dashboard-unit-leader.tsx` team-filter dropdown, `grp:<id>` encoding under a "Groupes" section). NEVER exposed
      publicly or to members — it rides the leader-only unit dashboard. `GetUnitDashboardQuery` returns
      `UnitDashboardDto.Groups: UnitRosterGroupDto(Id, Name, MemberIds)` = every `ShowInUnitList` group applicable to
      the unit (whole-group / this branch / this exact unit), each resolved via `MemberGroupResolver.RosterQuery ∩
      this unit` (empty groups hidden). Both create/update commands + the system-preset path carry the flag; the
      Groupes admin form has the toggle + a "Liste d'unité" badge; group mutations invalidate `['dashboard']`.
      Verified live: Haute Patrouille (Troupes, team-leader rule, ShowInUnitList=true) → appears in every Troupe's
      roster filter (7 in Troupe 2, 4 in Troupe 3, matches SQL), absent from Meute, presets stay off.
- **Groupes page relift + "Voir les membres" (2026-08-30):** (a) **Rule labels resolved** — `GetMemberGroupsQuery`
      now batch-resolves each rule's `Value` (role/unit/branch/member GUID or profile code) to a human name into a
      new read-only `MemberGroupRuleDto.ValueLabel` (writes ignore it), so chips read "Fonction : Chef de Patrouille"
      / "Membre : Rhéa Assaf" instead of a GUID. (b) **Card redesign** (`member-groups.tsx`): 2-col grid,
      icon+name+scope, big member count, an "Apparaît dans :" row with both visibility states (Réunions/Liste d'unité
      as green ✓ / muted – chips via `VisChip`), rules grouped Membres/"Sauf" with resolved names; header count +
      name search (shown >4 groups). (c) **See members** — `GetMemberGroupMembersQuery` + `GET /member-groups/{id}/
      members` (maitrise.manage) resolves the live roster (dedup by member, unit/team/role); the card's member count
      is a button → `MembersDialog` (grouped by unit, searchable >8). Verified live: HP labels = Chef/Second de
      Patrouille, 49 members listed by unit matching the count. Build clean (dotnet+tsc+eslint).
- **Member groups — per-unit vs combined + mailing list (2026-08-30):** rethink from a live CG report.
  - **`MemberGroup.PerUnit`** (migration `AddMemberGroupPerUnit`, existing UnitType groups backfilled → true to
      preserve behaviour). Meaningful only for a **branch (UnitType)** scope: `true` = SPLIT per unit (one
      independent list/réunion/mailing per unit — e.g. Haute Patrouille = each troupe's CP/SP), `false` = ONE
      combined list across the branch (e.g. join the 3 troupes). Shared helper `MemberGroupModes.IsTopLevel /
      IsPerUnit` (Domain): top-level = Group OR (UnitType && !PerUnit); unit-context = Unit OR (UnitType &&
      PerUnit). Réunion logic (`MeetingHandlers`) reworked to key on these instead of `ScopeType==Group`:
      `CanManageGroupMeeting(scopeType, perUnit, unitId)`, `GetAttendanceScope` (top-level `groups` vs per-unit
      `unitGroups`), `GetMeetings` (top-level combined branch now a valid `memberGroupId` scope; unit list includes
      unit-context group meetings), create anchoring (top-level→Groupe unit, per-unit branch→the target unit),
      `RosterQueryForAsync` (∩ unit only for unit-context). Frontend: an "Organisation" select (Une liste par unité
      / Une seule liste combinée) shown for a branch scope; a "Par unité"/"Combiné" chip on the card. Verified live:
      HP (per-unit) shows 3× in unitGroups, a combined branch group shows top-level.
  - **Groups as mailing lists.** Members endpoint now returns each member's reachable **email + phone** (own primary
      first, else a guardian's — `ContactEmailResolver` + a local `MemberContactPhones`). MembersDialog shows them
      with **Copier les emails** + **Exporter (CSV)** (name/unit/role/team/email/phone). **Send email**:
      `SendGroupMessageCommand` + `POST /member-groups/{id}/send-message` (maitrise.manage) — a saved template OR
      free text (subject+body via the seeded **`adhoc_message`** template: `{{subject}}` / `{{body}}` in a
      white-space:pre-line block, so plain-text line breaks survive the sink's HTML-encode). One email per DISTINCT
      resolved address (deduped), optional `unitId` narrows a per-unit group; queued via the durable outbox; returns
      recipients/no-contact report. Compose dialog reuses `useLeaderMessageTemplates`. Verified live: free-text send
      to HP∩Troupe3 → 12 recipients, 12 Pending outbox rows w/ subject.
- **Member groups — fixes from CG feedback (2026-08-30):**
  - **FIXED save-throws-409:** `UpdateMemberGroupCommandHandler` hard-replaced rules by mutating the tracked
      parent's nav collection (`g.Rules.Clear()` + `g.Rules.Add()`) → EF relationship fixup severed the
      just-deleted children → `DbUpdateConcurrencyException` → 409 "Cette information vient d'être modifiée" on
      EVERY edit of a non-system group (e.g. toggling ShowInUnitList on HP). Now rules are removed/added via the
      **DbSet directly** (never touch `g.Rules`) — same gotcha/fix as multi-page docs + sibling contacts. Verified:
      HP edit → 204.
  - **Rule reorder:** ▲▼ handles on each rule row (`moveRule`); order preserved on save (new rules get sequential
      v7 ids in array order) and read back via `OrderBy(r.Id)` in `GetMemberGroupsQuery`. Cosmetic (rules are a
      union) — for readability. Verified: reorder persists across save.
  - **Per-unit members = tabs:** `MembersDialog` shows a **per-unit branch group** (`perUnit && >1 unit`) as one
      TAB per unit (`MemberPane`, `unitId`), each with its own list + copy/export/send acting on THAT unit
      (`unitId` added to `MemberGroupMemberDto` + the query; send passes it). Combined/Group/Unit scopes stay one
      list. Verified: HP → 3 tabs (Troupe 2/3/10, 18/12/19).
  - **Flicker on open:** the RuleRow's `/members` search query fired for EVERY rule (3× on opening HP) → extracted
      into `MemberRuleSearch` that only mounts for the "member" criterion; `useMemberGroups` (60s) +
      `useMemberGroupMembers` (30s) got `staleTime` so the list doesn't refetch under an open dialog.
  - **Members-dialog flicker (2026-08-30, follow-up):** the reported flicker was the "Voir les membres" dialog —
      diagnosed with a headless-Edge/CDP probe (login → open → sample): exactly 1 `/members` fetch, single dialog,
      static once open (NO render loop / double-fetch). The flicker was the dialog opening SMALL (header + centered
      spinner) then snapping to full height when the list arrived. FIX = fixed `h-[80vh]` on the members
      `DialogContent` + spinner centered in `flex-1`, so it opens at its final size (no size-jump).
  - **Root cause of the residual flicker = `backdrop-blur` on the Dialog overlay (2026-08-30, 3rd pass):** after
      the size-jump fix the flicker persisted AND showed on the (small, no-fetch) send dialog too → not
      content-specific. Instrumented the open with a headless-Edge/CDP probe (network count / mount-timeline via
      setInterval / **Animation.animationStarted** / **Page screencast**): exactly 1 fetch, single dialog, static
      once open, NO double-mount, NO enter-animation replay — clean in headless `--disable-gpu`. The tell: it only
      flickers on a real GPU. The shared shadcn `DialogOverlay` had **`backdrop-blur-sm`** while `DialogContent`
      animates with `zoom-in-95` + `slide-in-from-top-[48%]` — a `backdrop-filter` blur repainted UNDER a transform
      animation is a classic GPU flicker (worse for the big `h-[80vh]` members dialog). FIX: removed
      `backdrop-blur-sm` from the overlay (kept the `bg-foreground/40` dim) in `components/ui/dialog.tsx` —
      **app-wide**, benefits every modal. Confirmed fixed by the user.
  - **Page scales to dozens of groups (2026-08-30):** the flat 2-col card grid was unmanageable at scale. Added an
      always-on **search** (matches name + branch + unit names) + a **scope filter** (Toutes / Tout le groupe / Une
      branche / Une unité), and the results are **grouped into scope sections** ("Tout le groupe" / "Par branche" /
      "Par unité") with per-section counts, sorted by branch/unit then name; grid widened to `md:2 / xl:3` columns.

### Access delegation — "accès délégué" per member (2026-08-30)
A CG-succession + delegation tool: grant a SPECIFIC member extra access WITHOUT any assignment or visible role
(invisible on the public site / maîtrises), so an **incoming CG can work the demandes + full toolset before the
role change is announced** (or if the outgoing CG becomes unavailable — happened when a CG travelled), and so a CG
can hand one person a single feature (e.g. Camp BP) regardless of their role. Key realization: an ACG already
holds `maitrise.manage` → is already `IsGroupManager`, so the ONLY thing blocking them from demandes is the two
`demande.*` perms — this feature simply merges extra perms into that member's JWT, invisibly.
- **Model:** `Member.DelegatedPermissionsJson` (JSON array of permission strings) + `Member.DelegatedGroupAccess`
      (bool → grant all units + group-manager scope) — migration `AddMemberDelegatedAccess` (2 nullable/defaulted
      cols, no new table). Merged in **`AuthAccess.LoadAsync`** (the single chokepoint for BOTH login + refresh):
      union the delegated perms; if `DelegatedGroupAccess`, set `groupLevel=true` → all units (like a CG profile).
      Takes effect on the member's next login/refresh (≤15 min).
- **Grant model reuses `GroupAccessAreas`** (the same per-area map as the *Accès maîtrise* page): two shapes —
      (a) **full CG** ("Chef de Groupe entrant") = the entire live `chef-de-groupe` permission set (INCL.
      `roles.manage_group` / the appointment power, on purpose — a true stand-in) + `DelegatedGroupAccess=true`;
      (b) **granular** = one or more areas at Aucun/Lecture/Complet (e.g. Camp BP → Complet). Granular strips
      `GroupAccessAreas.NonDelegatable` (never leaks appointment/system perms); the full-CG preset does NOT (it IS
      the CG set). **No-escalation cap:** a non-super granter's result is intersected with their own perms.
- **API** (`Application/Members/MemberDelegationHandlers.cs`): `GET /members/{id}/delegation` (per-area levels +
      fullCg flag) + `PUT /members/{id}/delegation { fullCg, areaLevels }` (empty clears) — both gated
      **`roles.manage_group`** (CG) / super-admin; audited `SetDelegation`. `MemberDetailDto` gained
      `HasDelegatedAccess` + `DelegatedGroupAccess` for a panel badge.
- **UI:** member panel **Actions ▾ → "Délégation d'accès"** (shown with `roles.manage_group`) → dialog
      (`members/delegation-dialog.tsx`): a **"Accès complet Chef de Groupe (entrant)"** switch + granular per-area
      selects + "Tout retirer"; a **"Accès délégué : Chef de Groupe"** badge on the panel when active.
- **Tracking + add-from-there (2026-08-30):** an **"Accès délégués"** overview at the top of the *Accès maîtrise*
      tab (`/admin/roles-access`) — `GetMemberDelegationsQuery` + `GET /members/delegations` (roles.manage_group)
      lists every member holding a delegation (name · unit · chips = "Chef de Groupe (accès complet)" or the granular
      "Label (niveau)"), with **Ajouter** (member search → the same DelegationDialog), **Modifier** (reopen), and
      **Retirer** (clears). `MemberDelegationsSection` in `pages/admin/member-delegations.tsx`, rendered inside
      `group-access.tsx`; the set-hook now also invalidates `['members','delegations']`. So delegations are no longer
      invisible until you open each fiche. Verified live: list shows full-CG (CG-first) + granular rows correctly.
- **Verified live end-to-end:** full-CG on a plain CU → 47 CG perms + all 17 units in the JWT + `/demandes` 200;
      granular Camp BP → only `camp.*` (no demande/appointment), `/demandes` 403; clear → NULL; a plain CU (no
      `roles.manage_group`) → 403 on the endpoints. Build clean (dotnet + tsc + eslint + vite). DEV until deploy
      (migration applies on prod startup).

### Super-admin grant UI + security-profile merge + relift (2026-08-30)
Two role/permission gaps from a CG request. All on main, DEV until deploy; verified live.
- **Grant/revoke super-admin from the app** (was a DB-only `User.IsSuperAdmin` flag). `Members/SuperAdminHandlers.cs`:
      `GetSuperAdminsQuery` + `SetSuperAdminCommand(memberId, grant)` — **super-admin only** (enforced in-handler,
      no permission maps to the flag); grant needs a login account; the **last super-admin can't be revoked**;
      audited Grant/RevokeSuperAdmin; effective on the target's next login/refresh (the flag is read in
      `AuthAccess.LoadAsync`). Endpoints on MembersController: `GET /members/super-admins`,
      `PUT /members/{id}/super-admin {grant}` (`[Authorize]`, handler gates). **Both places** (user's choice):
      (a) member panel **Actions ▾ → Rendre/Retirer super-administrateur** (shown only to a super-admin viewer),
      (b) a **"Super administrateurs"** section on the Profils & accès page (`super-admins.tsx`, add via member
      search / remove). `MemberDetailDto.IsSuperAdmin` added but **gated** — populated true only for a super-admin
      viewer (`_currentUser.IsSuperAdmin && <target flag>`), always false for a CU, so it never leaks who's
      super-admin. Extracted a shared `components/shared/member-picker-dialog.tsx` (searchable member picker).
- **Merge duplicate security profiles** (the "move members between profils d'accès" ask = cleaning up dup
      profiles; members follow their fonction, so merge = repoint the source's fonctions onto the keeper).
      `MergeSecurityProfilesCommand(sourceId, targetId)` (roles.manage): repoints EVERY fonction using the source
      (incl. soft-deleted, via IgnoreQueryFilters, so the required FK never dangles) onto the target, then deletes
      the source + its permissions; audited Merge; returns rolesRepointed. `POST /security-profiles/merge`.
      UI: a **"Fusionner"** button on the Profils de sécurité editor → pick a target profile → confirm.
- **Relift:** `GetSecurityProfileByIdQuery`/`SecurityProfileDetailDto` gained **`RoleNames`** (the fonctions using
      the profile, name + unit-type) — the editor now lists WHICH fonctions use a profile (not just a count),
      helping spot/decide a merge.
- **"Set which profile a fonction uses" was already done** (the fonction edit form's "Profil de sécurité" picker) —
      confirmed with the user, no work.
- Verified live: super-admin grant→204 (Maria appears in the list)→revoke→204 (gone); a CU caller → 400 "Accès non
      autorisé"; merge of a throwaway profile with 1 bound fonction → rolesRepointed=1, source 404, fonction now on
      the target. Build clean (dotnet + tsc + eslint + vite). **NEXT in this batch: duplicate-MEMBERS merge tool
      (Fratries "Doublons" tab).**

### Duplicate MEMBERS merge — Fratries "Doublons" tab (2026-08-30)
A CG tool to merge duplicate member records (the import created some members twice). Same shape as the sibling
reconcile but for a SINGLE person entered twice. All on main, DEV until deploy; verified live end-to-end.
- **Detection** (`Application/Members/DuplicateHandlers.cs` `GetDuplicateMemberSuggestionsQuery`, gated
      `MemberAccess.IsGroupManager` = super-admin/CG/ACG): groups non-deleted members that share ALL of a
      **configurable set of match keys** — the CG checks which fields must match. `DuplicateMatchKeys` (backend) +
      `DUPLICATE_MATCH_KEYS` (frontend) = the single source of truth: **lastName / firstName / dob / gender /
      nationality / school** (external card deliberately EXCLUDED — its `is_deleted`-filtered unique index means two
      live members can't share it, so it'd never match). Default = **nom + prénom + date de naissance** (the original
      behaviour). Values normalized accent/case-insensitively (`TextNormalization.NormalizeKey`); a member is skipped
      if any selected key is empty. Groups > 12 members are skipped (a generic match, not a duplicate). Evidence line
      = "Même " + the chosen labels. `GET /siblings/duplicates?keys=lastName,dob` (comma-separated; empty = default).
      Each member carries all the fields the merge dialog shows/lets you choose from + unit/account/active/
      assignment-count/createdAt. Keeper suggestion order = active → most assignments → oldest. Cap 200 groups.
      UI: a config bar of checkboxes at the top of the Doublons tab re-queries on change (e.g. uncheck Prénom to
      catch a first-name typo with the same nom + DOB). Verified live: default misses a Jean/Jon typo, keys=nom+DOB
      finds it.
- **Merge** (`MergeMembersCommand(KeeperId, LoserIds[], MemberMergeFields)` → `IMemberMergeService` /
      `Infrastructure/Services/MemberMergeService.cs`, mirrors MemberPurgeService's raw-SQL architecture): ONE
      transaction — (1) move each loser's connected rows onto the keeper: **dedup-on-move** for tables with a natural
      key (phones by digits, emails by lower(address), addresses by city+details, guardian_links by guardian,
      custom_field_values by field, camp_participants by camp, camp_game_etapistes by game, meeting_absences by
      meeting — drop the loser's row the keeper already has, move the rest) + plain re-point for the rest
      (assignments/documents/cotisations/progressions/change_requests/passages/api_keys + repoint
      applicant_scout_relations.related_member_id / demandes.created_member_id / camp_familles pere/mere); (2) give
      the keeper the loser's LOGIN if it has none, else disable the loser's (is_active=false, clear token); (3)
      **soft-delete** the loser (frees its card numbers from the `is_deleted`-filtered unique indexes + nulls its
      external card) — restorable from the Corbeille; (4) apply the CG-chosen field values to the keeper LAST (via a
      tracked EF entity — NOT raw SQL, so nulls map cleanly; done last so a carried external card can't collide).
      Keeper always keeps its OWN internal matricule; only ExternalCardNumber can be carried. Audited MergeMembers.
- **UI:** a **"Doublons"** tab on the Fratries page (`siblings.tsx`) — cards per duplicate group → **"Fusionner"**
      → dialog: pick the member to KEEP + for each field that DIFFERS, which value wins (chip picker), then merge.
      Endpoints `GET /siblings/duplicates` + `POST /siblings/merge-members` (maitrise.manage). Extracted a shared
      member-picker earlier; here the group members come from the suggestion.
- **Verified live** (throwaway same-name+DOB pair, cleaned up): detection flags them; merge carries the loser's
      external card + school onto the keeper, moves its phone, **dedups** a shared email on move, soft-deletes the
      loser with its external card freed, keeper keeps its matricule; a mid-merge failure rolled back cleanly (tx).
      dotnet + tsc + eslint + vite all clean. NOTE: dev currently has **0** same-name+DOB duplicates (prior 48-pair
      + 45 merges already done); real ones surface wherever they exist (e.g. prod's earlier snapshot). Detection is
      **name+DOB only** — two records of the same person with a mismatched/missing DOB aren't auto-flagged (a
      manual "merge any two members" entry could be added later if needed).

### Active sessions — "Sessions actives" viewer + force-disconnect (2026-08-31)
Super-admin page (`/admin/sessions`, sidebar Système) to see who currently holds a live session + kick one.
- **Model reminder:** stateless 15-min access token + ONE rotating 7-day refresh token per account (no
      per-device table), so this shows **one row per account**. A "session" = an account with a non-null,
      unexpired `RefreshToken`. New `LastActivityAt` stamped on **login AND every token refresh** (~15-min
      heartbeat while active) → drives an **"En ligne"** flag (activity within 20 min); `LastLoginAt` stays the
      original sign-in ("connecté depuis"). Migration `AddSessionActivity` adds `users.last_activity_at` +
      `applicant_accounts.last_login_at`/`last_activity_at`.
- **Covers BOTH realms** (user's choice): **Membres et chefs** (`User`) + **Portail des parents** (`ApplicantAccount`)
      — the applicant login/register/refresh now stamp the same timestamps. Two tables on one page.
- **Backend** `Application/Sessions/SessionHandlers.cs`: `GetActiveSessionsQuery` (members joined to Member for a
      name + applicants; only `RefreshToken != null && RefreshTokenExpiry > now && IsActive`; `IsOnline` computed
      in memory) + `DisconnectSessionCommand(Kind, Id)` (clears the refresh token → the account can't refresh, its
      access dies within ≤15 min; audited `DisconnectSession`). **Super-admin ONLY** — both handlers throw
      `UnauthorizedAccessException` if `!IsSuperAdmin` (super-admin isn't a permission, same gate as the audit/error
      log purge). `SessionsController` (`api/v1/sessions` GET + `/disconnect`), route under `<AdminRoute>`.
- **Frontend** `pages/admin/sessions.tsx` (auto-refetch 30s) — **ONE combined table** (members + parents merged,
      2026-09-11) with columns État (En ligne/Session ouverte), Nom, Identifiant (email), **Où** (a badge = the space:
      "Membres et chefs" vs "Portail des demandes", from `kind`), Connecté depuis, Dernière activité, Session expire,
      **Déconnecter** (confirm). Rows sorted online-first then most-recent activity. Blue note explains the ≤15-min
      caveat + that "en ligne" = last-activity window. (Backend still returns `{members, applicants}` — merged client-side.)
- **Inherent limits (documented, accepted):** revocation is "≤15 min" not instant (stateless JWT); one session per
      account, no per-device list / "last login from" (would need a `user_sessions` table); no new-device alert.
- Verified live: super-admin GET → 8 member + 1 applicant sessions w/ online + timestamps; a **CU → 403** on both
      GET and disconnect; disconnecting a session → the account's next refresh **401** (session truly ended);
      re-login restores. Build clean (dotnet 0/0, tsc + eslint). Migration applies on prod startup; DEV until deploy.

### Login-screen announcement banners (2026-09-03)
Configurable message shown prominently at the top of each login screen — member (`/login`) and applicant portal
(`/inscription/login`). Two INDEPENDENT settings so the CG can show a message on one, the other, or both, same or
different. All on main, DEV until deploy; verified live.
- **Settings `login.member_message` + `login.applicant_message`** (string, empty default = no banner) in a NEW
      **`login` category** ("Connexion" tab, added to CATEGORY_ORDER/LABELS) that is **CG-editable**
      (`SettingsAccess.CgCategories` += "login"). The `*message*` key auto-renders as a textarea (multi-line ok).
- **Exposed via each screen's anonymous config:** member = `PublicSiteConfigDto.LoginMessage`
      (`GET /public/site-config`); applicant = `ApplicantConfigDto.LoginMessage` (`GET /applicant/config`, added to
      `ConfigKeys` + BuildConfig). Empty → null (banner hidden).
- **Frontend:** shared `components/login-announcement.tsx` (`<LoginAnnouncement message tone>`) — a prominent
      Megaphone callout (border-2 + shadow, whitespace-pre-line, break-words), `tone="primary"` on the member login
      (navy) / `tone="accent"` on the applicant login (teal), rendered above the form; renders null when empty.
- Verified live: setting each message → surfaces on the matching anonymous config endpoint; empty → null; builds
      clean (dotnet 0/0, tsc + eslint + vite). Migration-free (settings seed on prod startup via SeedMissingSettings).

### Household sync across a confirmed fratrie (2026-09-11)
User: "if i change something on a member linked to a household, it should change for all linked members (brothers)."
Decided (via question): fields = **Situation des parents + Adresse** (+ parents already shared); **automatic**; scope =
**confirmed fratrie only** (`Member.SiblingGroupId`). New `Application/Common/HouseholdSync.cs`:
- `PropagateParentsSituationAsync(ctx, memberId, value, ct)` — copies the value onto the other members of the same
  `SiblingGroupId` (skips no-ops); called BEFORE the handler's SaveChanges (same txn). Wired into **UpdateMember**
  + **UpdateMyProfile**.
- `PropagateAddressesAsync(ctx, memberId, ct)` — mirrors the member's CURRENT address set onto the siblings
  (replaces theirs with copies = the shared-household address); idempotent via `AlreadyMirrored` (no soft-delete
  churn when already in sync); does its OWN SaveChanges AFTER the source op is persisted. Wired into the leader
  **Add/Update/DeleteAddress** + the self-service **AddMy/UpdateMy/DeleteMyAddress** (Ma fiche).
- **Guardians need NO code** — they're already SHARED records across a confirmed fratrie (the Fratrie *confirm*
  step merges duplicate parents into one), so editing a parent already propagates to every linked child.
- Members with no `SiblingGroupId` are untouched. **Verified live** on a real 4-member fratrie: PUT a member's
  parents-situation → all 4 became "Unis"; POST an address → all 4 mirrored the set (a sibling's old address
  replaced); then restored the family to its original state. Build clean (dotnet 0 err). Backend-only, DEV until deploy.

### Fratries page — side-drawer reconcile (2026-09-11)
Redesigned the Suggestions tab of `/admin/siblings` (`siblings.tsx`). Iterated through the user's feedback to the
final shape: **compact list rows + a right-side Sheet** for the details.
- **`SuggestionRow`** = one compact clickable card per family: confidence + children chips + a one-line "why".
  The evidence is **deduped to distinct signal types** (the raw list repeats one entry per matching pair, so it
  showed "Même email parent" ×3 etc. — now each shows once) and rendered as a light inline list, not pill chips.
  Rejeter sits on the row (stopPropagation so it doesn't open the drawer).
- **`ReconcileSheet`** = clicking a row opens a `Sheet` (side="right", `sm:max-w-2xl`, sticky header + footer,
  scrollable body) that **lazy-loads** the shared common info (`useReconcileData` on `onOpenAutoFocus`) and shows
  the full reconcile UI: "Après confirmation" summary, père/mère comparison pickers (`ParentSection`, contacts +
  Principale/Sera-fusionné), children checkboxes, address radios, and **Confirmer la fratrie** in the footer. On
  confirm, `useApproveSiblingGroup` invalidates `['siblings']` (row disappears) and the sheet closes.
- The earlier center **dialog** AND the intermediate **inline-collapsible** version were both replaced by this
  drawer. Reconcile data only loads when a row is opened, so a long list stays fast. Confirmées / Doublons tabs
  untouched. Frontend, DEV until deploy. See [[project-link-siblings]].

### Guardian edit form — Relation + Profession pre-fill fixes (2026-09-12)
A CG reported the member Famille tab's "Modifier le parent" dialog showed **Relation** and **Profession** EMPTY
for most parents while the display (card) showed them filled. Two root causes:
- **Profession** — the "Profession (texte libre)" field was actually a `SearchableSelect` locked to ~15 hardcoded
  `PROFESSION_OPTIONS` (Médecin/Ingénieur/…), so a stored free-text title like "Pharmacienne" (not in the list) →
  `selectedLabel` undefined → placeholder shown, AND you couldn't type it. Changed BOTH the create + edit forms to
  a free-text `<Input>` (matching the demande wizard, whose Profession is already a free `<Input>`). Removed the
  now-unused `PROFESSION_OPTIONS` import. The activity CATEGORY stays the "Domaine" `SearchableSelect` over the
  managed `member.profession_domains` list (shared with the demande).
- **Relation** — migrated links stored **unaccented** `"Pere"`/`"Mere"` (4859 rows) while `RELATIONSHIP_OPTIONS` +
  the demande conversion use `"Père"`/`"Mère"`; Radix `<Select>` is exact-match → empty (the card worked via the
  fuzzy `relationshipLabel`/`normRel`). Fixes: (a) **data patch `014_guardian_relationship_accents.sql`** canonicalizes
  `Pere→Père`/`Mere→Mère` in `guardian_links` (idempotent; applied on dev, ships to prod on next deploy — verified
  2439 Père / 2423 Mère after); (b) **migration tool** now writes `"Père"`/`"Mère"` (3 spots) so re-imports stay
  consistent; (c) UI `canonicalRel()` maps a stored value onto the canonical option value (accent-insensitive) when
  loading the edit form, so even a stray unaccented value pre-selects.
- **Hardened `SearchableSelect`**: shows the raw stored `value` when it isn't among the options (`selectedLabel ??
  (value || placeholder)`) — so a Domaine that was archived/renamed still shows instead of looking empty.
- **Migration-matching (the CG's question):** Domaine uses the SAME managed `member.profession_domains` list in both
  the member form and the demande wizard, and `SendDemandeResponses` copies `ProfessionDomain` verbatim → they match
  by construction. Profession is free text in both → nothing to match. The old hardcoded job dropdown (unrelated to
  either) was the source of the confusion and is gone.
- Verified live: guardians API returns rel=`Mère` / domain=`Chimie, pharmacie` / prof=`Pharmacienne` (all pre-fill).
  Build clean (dotnet 0/0 API + migration tool, tsc + eslint). Frontend + data patch, DEV until deploy.

### Change-requests page — mobile layout fix (2026-09-12)
"Modifications à valider" cards used one wrapping flex row (icon + `flex-1` text + both buttons) → on a narrow
screen the buttons wrapped into the MIDDLE of the row and crushed the member name/detail into a tiny column. Now
`flex-col` on mobile (icon+text on top full-width, then full-width Refuser/Accepter buttons that each grow),
`sm:flex-row` on desktop (unchanged). Dropped the redundant `Tip` tooltip on Refuser (button has a visible label).
Frontend-only, DEV until deploy.

### QOL: member import (Excel/CSV) (2026-09-13)
Item 8 (the last of the QOL list). Bulk-create members from a spreadsheet. DEV until deploy; migration-free.
- **Parsing** — `IMemberImportService` / `MemberImportService` (Infrastructure, singleton): `Parse(bytes, fileName)`
  → `MemberImportFile(Headers, Rows)` (ClosedXML for .xlsx; a small RFC-4180-ish CSV parser handling quotes/
  embedded commas + UTF-8 BOM for .csv) and `BuildTemplate()` (a .xlsx with the header row + one example row).
- **Handlers** (`Application/Members/MemberImportHandlers.cs`, gated members.create): `PreviewMemberImportCommand`
  (dry-run — maps headers accent/case-insensitively to fields, validates every row [required prénom/nom/DOB/genre;
  DOB parse dd/MM/yyyy·yyyy-MM-dd + not future; genre normalized Masculin/Féminin from M/F/Garçon/…; unit resolved
  by code or name + caller-authorized], returns per-row `MemberImportRowDto` + valid/error counts + file-level
  errors) and `CommitMemberImportCommand` (re-parses+re-validates server-side — never trusts the client — then
  creates each valid row via the normal `CreateMemberCommand` through `IMediator`, so card number/login/optional
  parents+unit assignment all behave like manual creation; blank nationalité→"Libanaise", école→"Autre"; per-row
  failures collected, capped at 100). Unit per row must be one the caller may place into.
- **Endpoints** (MembersController, members.create): `GET /members/import/template` (xlsx), `POST /members/import/
  preview` + `POST /members/import/commit` (multipart IFormFile, 10 MB cap).
- **Frontend**: `components/admin/member-import-dialog.tsx` (download template → pick file → auto-preview table
  [valid/errors] → "Importer N membre(s)" → result summary) + an **"Importer"** button on the members page next to
  "Nouveau membre" (gated members.create). `usePreviewMemberImport`/`useCommitMemberImport` (FormData).
- Verified live: template 200 (6834 B); preview of a 2-row CSV → 1 valid / 1 error (missing DOB + bad genre with
  the right messages); commit → created 1 (matricule M-1327 auto-assigned) / failed 1; test member cleaned up.
  GOTCHA (test only): curl `-F @/tmp/...` fails exit 26 under MSYS — use a Windows path (`pwd -W`). dotnet + tsc +
  eslint + vite clean.

### Members list — pin a deep-linked member not in the filtered page (2026-09-14)
A CG clicked a name in the birthdays card → landed on the member's detail (`/members/:id`), but couldn't find
that member in the LEFT list. Root cause: the list is filtered + PAGINATED (unit filter, Actifs/Anciens, A–Z
letter, 50/page over 1070 members), so a deep-linked member (birthdays card / notification / command palette)
is very often not on the currently-loaded page — the selected-row highlight exists but there's no row to
highlight. Fix (frontend-only, `pages/members/index.tsx`, DEV until deploy):
- The page now also reads the selected member's detail (`useMember(selectedMemberId)` — **cached**, the detail
  panel fetches the same `['members', id]` key, so no extra request) and computes `selectedInList` +
  `pinnedMember`. When the selected member is NOT in the current `data.items`, a **highlighted "pinned" row**
  (initials + "LASTNAME FirstName" + "Sélectionné · hors de la liste filtrée") renders at the top of the list
  scroll container. It disappears automatically once the member appears in the list itself.
- Chose this over auto-mutating the user's filters. Considered + rejected: jump the A–Z letter to the member's
  initial (a single surname letter can exceed one page → member stranded on page 2, and it wrongly flips to
  Anciens); jump via search (the search box is debounced → the staged presence check judged stale data). Pinning
  is always correct, has no pagination/timing pitfalls, and doesn't disturb the user's filters. Row clicks
  (`setSelectedMemberId`, URL unchanged) are unaffected — only route deep links produce a pin. tsc+eslint+vite clean.

### Contact-review popup + guardian-contact edit + tracking (2026-09-16)
One-time, SKIPPABLE « Vérifiez vos coordonnées » modal on login (for EVERYONE, replacing the leader-only prompt) so
members fix the "father's email is primary but the mother handles things" problem. All on main, DEV until deploy
(migration `AddMemberContactReviewed` applies on prod startup); live-verified end-to-end.
- **Model:** `Member.ContactReviewedAt` (null = not reviewed). `GetMe`/`/auth/bootstrap` expose
  `needsContactReview` = `!IsSuperAdmin && ContactReviewedAt is null` (`MeResponse.NeedsContactReview` /
  `user.needsContactReview`).
- **Backend** `ReviewMyContactsCommand` + `POST /my-profile/review-contacts` (auth-only, own member resolved
  server-side): ATOMICALLY sets `PrimaryContactEmail` (validated ∈ the member's own emails ∪ their guardians'
  emails — a stranger email → 400), the **téléphone principal** (per-list `IsPrimary` on the chosen member OR
  guardian phone, clearing siblings — reuses the existing flag, no new field), `ParentsSituation`
  (+`HouseholdSync.PropagateParentsSituationAsync` to a confirmed fratrie), per-parent **urgence**
  (`GuardianLink.IsEmergencyContact`, per child) + **décédé** (`Guardian.IsDeceased`, shared household fact), and
  stamps `ContactReviewedAt`. Audited `ReviewContacts`.
- **Frontend** `components/members/contact-review-popup.tsx`: an OUTER gate (fires no queries unless it will show —
  `needsContactReview && memberId && !sessionStorage skip`) + a Dialog: §1 courriel principal + téléphone principal
  (radio across own + each parent's, with inline Ajouter/Supprimer via the existing self-service hooks; adding a
  courriel auto-selects it as principal), §2 Vos parents (urgence + décédé, décédé styled quiet), §3 situation des
  parents. « Plus tard » = sessionStorage skip (re-appears next login); « Confirmer » → command + `loadUser()`.
  Mounted in AppLayout (`!impersonating && <ContactReviewPopup/>`); the leader full-screen gate + its import were
  REMOVED; the welcome tour is gated `!user?.needsContactReview` so the two modals never stack. One-shot hydration
  uses the render-phase reset pattern (not an effect — the React-Compiler eslint rule forbids setState-in-effect).
  A converted demande member (ContactReviewedAt null by default) gets it on first login automatically.
- **Guardian phone/email EDIT** (the "add the edit please" ask — guardian contacts were add/delete-only): new
  `UpdateMyGuardianPhone/Email` (self) + `UpdateGuardianPhone/Email` (leader) commands/validators + `PUT
  /my-profile/guardian-phones|emails/{id}` and `PUT /guardians/phones|emails/{id}`, hooks
  (`useUpdate{My,}GuardianPhone/Email`), and a pencil wired into `MemberGuardians` (both modes) with edit dialogs.
- **Tracking:** `MemberDetailDto.ContactReviewedAt` (+ `GetMembersQuery` projection + TS type) → the member panel
  header shows, under the last-login line, "Coordonnées vérifiées le …" (green) or "Coordonnées à vérifier" (amber),
  so a CU/CG sees who ignored the popup. (A members-list filter could follow.)
- The leader `ContactVerifiedAt` / `VerifyMyContact` / `LeaderContactVerification.tsx` are now DEAD (superseded) but
  left in place. Build clean (dotnet 0/0 + tsc + eslint + vite).

### Contact & famille tab merge + household coordonnées + Voir-comme in a new tab (2026-09-16)
Follow-up UX batch (all on main, DEV until deploy; builds clean dotnet 0/0 + tsc + eslint + vite).
- **Merged Contact + Famille → one "Contact & famille" tab** on BOTH Ma fiche (`my-profile.tsx`) and the CG/admin
  member panel (`members/index.tsx`). On the admin panel the Coordonnées moved OUT of the Informations tab (now
  identity+scolarité only). Removed a big block of now-duplicated inline contact dialogs/state/handlers/imports from
  both files (the shared component owns it). GOTCHA: while deleting the admin panel's dead contact-dialog JSX by line
  range I also removed the adjacent absence-detail dialog — restored it from `git diff`.
- **`components/members/household-contacts.tsx` (`HouseholdContacts`, shared)** — "Coordonnées du foyer": ALL the
  household phones + emails pooled in one place (the member's own + each parent's), each row tagged with the owner
  (Vous / Père · X / Mère · Y) + an **Urgence** badge (member = per-contact flag; parent = the guardian link's
  `IsEmergencyContact`, so it shows on all that parent's rows) + a **Principal** badge (email = matches
  `PrimaryContactEmail`; phone = per-list IsPrimary). Add/edit/delete inline (owner picker on add, type derived from
  owner; edit fixes the value + the parent's relation via the guardian link) + the courriel-principal picker +
  member addresses. `selfService` (Ma fiche → my-profile hooks) vs leader (member panel → member-service hooks),
  chosen via a `pick(selfService, self, leader)` helper (the two hook sets differ only in response generic, so it's
  cast to the self-service type). New **self endpoint** `SetMyPrimaryContactEmailCommand` + `PUT /my-profile/primary-email`
  (+ `useSetMyPrimaryContactEmail`) so a member can set their own primary contact email.
- **Parents section shows details only** — `MemberGuardians` gained `hideContacts` (drops the phone/email blocks;
  keeps name/relation/profession/flags + edit/unlink/add). `dashboard-unit-leader` still uses it WITH contacts (no
  hideContacts), so the guardian-contact code stays alive.
- **Design unified** — `MemberGuardians` + `MemberSiblings` restructured into proper `<Card>` (CardHeader title +
  action button + CardContent) matching HouseholdContacts; parent entries are now plain bordered rows (removed the
  tinted `bg-muted/30` header band); siblings moved from a plain box to a Card. So the tab is three consistent
  titled Cards: Coordonnées du foyer · Parents / tuteurs · Frères et sœurs.
- **"Voir comme" opens in a NEW tab** (the admin keeps their own session in the original tab). Since the
  impersonation token lives in per-tab sessionStorage, the admin tab mints it then hands it to the new tab via a
  short-lived localStorage courier (`writeImpersonationHandoff`/`consumeImpersonationHandoff` in `lib/impersonation`,
  <2 min, single-use, carries ok|error). `impersonation-store.startInNewTab` opens the tab synchronously (no popup
  block) → POSTs → writes the result. New PUBLIC route `/voir-comme` (`components/layout/impersonation-handoff.tsx`)
  consumes it (instant via the `storage` event + a poll fallback), adopts the token, `loadUser`, → `/dashboard`;
  shows the real error if the POST failed. Works regardless of the admin's remember-me (the new tab needs no admin
  auth — the impersonation token alone makes it the member). The banner's **Quitter closes the tab** (falls back to
  `stop()` if it can't). Verified the impersonate endpoint returns 200 + token on the live API.

### Maintenance blocks member login + delete-member 500 fix (2026-09-13)
Two backend fixes (DEV until deploy; both verified live). No migration.
- **Maintenance now blocks non-super-admin member login + refresh.** Previously the whole site being in maintenance
  still let members SIGN IN (the `MaintenanceMiddleware` exempts `/api/v1/auth/*` so a super-admin can recover — but
  at login time there's no super-admin claim to distinguish, so the exemption applied to everyone; a member logged in
  then hit the "Sous maintenance" wall, and an already-open session could keep refreshing indefinitely). Fix = a gate
  INSIDE the handlers (where the user's super-admin flag is known): `LoginCommandHandler` and `RefreshTokenCommandHandler`
  inject `IMaintenanceProvider` and, when `state.Site || state.Membres` and the user is **not** super-admin, return the
  maintenance message (401). Login gate is AFTER credential verification (so it can't probe accounts) + audited
  `LoginBlocked`; refresh gate means an open non-admin session lapses once its ≤15-min access token expires. Super-admins
  always pass (to toggle maintenance off). The applicant portal login (`/api/v1/applicant*`) was already blocked by the
  middleware (applicants are never super-admin). Verified live: member login/refresh → 401 maintenance message,
  super-admin → 200, wrong password → generic 401 (gate is post-credential).
- **Delete-member 500 fixed** (`DeleteMemberCommand`, pre-existing, found while testing above): the handler
  `Include(m => m.User)` then `Members.Remove(entity)` — removing the Member (principal) while its `User` (dependent,
  **required** non-nullable `MemberId`) was tracked made EF try to sever that required relationship →
  `InvalidOperationException: association … severed … required` → 500 for ANY member with a login account. Fix = drop
  the `Include(User)` and disable the login with a **set-based** `ExecuteUpdateAsync` (untracked, no cascade) before the
  soft-delete. Login stays blocked either way because the login handler treats a soft-deleted member (Member == null) as
  a failure. Verified live: delete a member WITH an account → 204 + soft-deleted + login disabled + refresh cleared;
  restore → 204 re-enables both.

### Members list — A–Z index + page picker + page-size (2026-09-13)
More navigation control on the Membres master list (`pages/members/index.tsx`). All on main, DEV until deploy;
verified live.
- **Family-name A–Z index** — a wrap row of letter buttons (Tous + A–Z) above the list; picking one filters to
  last names starting with that letter. Server-side + **accent-insensitive**: `GetMembersQuery` gained a `Letter`
  param → `DbFns.Unaccent(m.LastName.ToLower()).StartsWith(letter)` (so "E" includes "É…"); `GET /members?letter=`.
  Combines (AND) with search + unit/alumni/maîtrise filters; resets to page 1.
- **Page-size selector** (25 / 50 / 100 / 200), replacing the hardcoded `pageSize: 50`; **persisted** to
  `localStorage['members.pageSize']` (validated to the allowed set) alongside the existing unitFilter/showAlumni.
- **Page picker** — the footer's plain "p/N" counter is now a `Select` (Page 1…N) to jump directly to any page,
  flanked by Préc./Suiv. + "/ N".
- **Range indicator** — "X–Y sur Total" next to the filters (was just the total count). Empty-state message also
  reflects the letter ("Aucun nom commençant par « X »").
- Verified live (super-admin): letter=A → 167 (all A), letter=E → 54 (accent-insensitive), pageSize=200 → 200
  items / 6 pages, letter=Z → 21. dotnet build 0/0, tsc + eslint + vite clean. Frontend + backend (query+controller),
  no migration.

### Switch between sibling accounts (2026-09-17)
A parent signed into one child can hop to a **confirmed sibling's** account without logging out. Security model
(the user's choice): **password once, then remembered** — the first switch to a sibling on a device asks for THAT
account's password; the client then pools its refresh token so later switches are instant. All on main, DEV until
deploy (migration-free; needs the backend rebuild for the new endpoint).
- **Backend:** `GetMySwitchAccountsQuery` (auth-only, resolves the caller's OWN member id) → confirmed siblings
  (same `SiblingGroupId`) that have a usable login, returning `{memberId, name, username}`. `GET /my-profile/
  switch-accounts`. Deliberately narrow exposure (name + login identifier of one's own confirmed fratrie); the
  password gate means listing the username grants nothing on its own. Switching itself REUSES the existing
  login/refresh endpoints — no new switch/impersonation endpoint (this is a real session as the sibling, full
  access, NOT read-only like "Voir comme").
- **Client multi-session pool** (`lib/account-pool.ts`): stores each authenticated member account's refresh token
  in the member realm's backing store (localStorage when remembered, else sessionStorage), keyed by memberId.
  Cleared on logout (leave the whole family on this device). Auth store (`auth-store.ts`): `loadUser` pools the
  active account with its freshest token + name; **`switchToAccount(memberId)`** snapshots the current account then
  mints a fresh session by calling `/auth/refresh` with the pooled token (bare axios so the active interceptor
  can't hijack it) — updates the pool with the ROTATED token (single rotating token per user, so this is required),
  throws `NO_SESSION` on a stale token (removed from pool → caller prompts for password); **`addAndSwitchAccount(
  username, password)`** = a login for the new account (current pooled first so it stays switchable). Both
  `queryClient.clear()` on switch so no cross-account data leak.
- **UI:** in the avatar/account menu (`user-menu.tsx`) — a "Changer de compte" section (only when the member has
  confirmed siblings; hidden while impersonating) listing each sibling with initials + a green ✓ (remembered →
  instant) or a key (needs password). First switch opens a small "Se connecter en tant que …" password dialog
  (username shown read-only). `useSwitchAccounts()` in my-profile-service.
- **Verified live** (test fratrie Jad+Marc MATAR, both `Gndj2026!`): endpoint lists the sibling with username;
  login-as-sibling (add) + refresh-with-stored-token (instant switch) both work; the old token 401s after rotation
  (proving the pool must store the new one — it does). dotnet 0/0 + tsc + eslint + vite clean. NOTE: dev has a
  labeled **"TEST account switch demo"** sibling group (Jad+Marc MATAR — not real siblings, no shared guardian);
  remove it via the Fratries page (Confirmées → unlink) or `DELETE FROM sibling_groups WHERE notes='TEST account
  switch demo'` + null their `sibling_group_id`.

### Fratries — remove data-cleanup tools + "not duplicates" (2026-09-19, DEV until deploy)
Two adjustments on the Fratries page (all on main; migration `DropSiblingAddressReviewAddDuplicateRejection`
applies on prod startup; build 0/0, tsc+eslint+vite clean).
- **Removed the one-time data-cleanup ("backfill") tools** now that they've served: the two Suggestions-tab banners
  **Déclaration automatique des fratries** (`AutoDeclareSiblingsCommand`) + **Unifier les adresses « à vérifier »**
  (`ReunifyFratrieAddressesCommand`) — both command files deleted, their controller endpoints (`/siblings/
  auto-declare`, `/siblings/reunify-addresses`) removed, frontend hooks/types dropped — AND the **"À vérifier —
  adresse" worklist** on the Confirmed tab, including the `SiblingGroup.AddressNeedsReview` column (dropped by the
  migration; removed from the entity, DTO `SiblingGroupDto`, `GetSiblingGroupsQuery`, and the
  `ApproveSiblingGroup` handler which used to clear it). The core feature stays: suggestions, confirm/reconcile
  (`SiblingReconcileSheet`), link/unlink, Signalements, Doublons.
- **Signalements — reply to the member (2026-09-21, DEV until deploy):** a manager can now ANSWER a fratrie report
  (before, the Signalements tab only had Résolu/Rouvrir — the member got no response). `SiblingReport.ReplyMessage`
  (migration `AddSiblingReportReply`) + `ReplySiblingReportCommand` + `POST /siblings/reports/{id}/reply`
  (maitrise.manage): sets the reply, marks the report Resolved, and `INotificationService.NotifyMemberAsync`s the
  reporter (bell + push if enabled, link `/my-profile`). Frontend: a "Répondre" button on each Signalements card →
  a dialog (textarea, prefilled with any existing reply); the sent reply is shown on the card
  ("Votre réponse : …"). `useReplySiblingReport`; `SiblingReportDto`/type gained `ReplyMessage`.
- **Doublons — "Ce ne sont pas des doublons" button** (per group, next to Fusionner): tombstones the group's
  member pairs so detection never re-flags them (mirrors the sibling "reject"). New entity
  **`MemberDuplicateRejection`** (normalized pair A<B, unique index; table `member_duplicate_rejections`) + DbSet +
  config; `RejectDuplicateMembersCommand` + `POST /siblings/not-duplicates` (maitrise.manage / `IsGroupManager`,
  audited `RejectDuplicateMembers`). `GetDuplicateMemberSuggestionsQuery` now splits each same-key clique by the
  tombstoned pairs via union-find over the surviving pairs (`SplitByRejections`) — a fully-rejected pair
  disappears, a partly-rejected trio keeps the rest. `SiblingUtil.Pair` reused (internal, same assembly).

### Disable/enable member login + parents-situation backfill (2026-09-20, DEV until deploy)
Two data-cleanup items from the pending list.
- **Disable/enable a member's login without deleting the member.** New `SetMemberLoginActiveCommand` +
  `PUT /members/{id}/login-active {active}` (perm members.reset_password; `MemberAccess.CanAccessMemberAsync` gate =
  super-admin / group manager [covers orphans] / active-unit-leader). Disabling sets `User.IsActive=false` + clears
  the refresh token (session dies ≤15 min); the member record + all data stay intact + restorable by re-enabling.
  Audited `DisableLogin`/`EnableLogin`. `MemberDetailDto.LoginActive` (bool? — null=no account) drives a member-panel
  **Actions ▾ → "Désactiver / Réactiver la connexion"** item (confirm dialog) + a red "Connexion désactivée" header
  banner. Distinct from DeleteMember (which soft-deletes the whole member). Use case: lock out orphan accounts /
  leavers while keeping their history.
- **parents-situation backfill** — data patch `021_parents_situation_backfill.sql` (see [[project-batch-2026-09-01]]):
  fills `members.parents_situation` (Unis/Séparés/Divorcés) from the WEBDEV export by name+DOB, ONLY where empty
  (never overwrites parent/chef corrections). Dev: 2045 filled; prod on next deploy.

### Super-admin grant UI + security-profile merge + relift (2026-08-30)
- [x] **Cotisation dashboard "payé" drill-down — DONE (2026-09-20, DEV until deploy, frontend-only).** The
      `/admin/cotisations` per-unit rows already reveal an "Ont payé" list (name → fiche, date, montants, receipt
      download) + Exemptés + à-relancer on click (`cotisation-dashboard.tsx`). Added the missing group-level
      affordance: the **green "Payé"** and **orange "Impayés"** summary cards are now clickable (`revealAllUnits`
      → `expandAll` + scroll the "Par unité" card into view via a `parUniteRef`), plus a **"Développer tout /
      Réduire tout"** button on the "Par unité" header. `expandableUnits` = units with any paid/exempt/unpaid
      member. tsc + eslint + vite clean.
- [x] **Capture leavers' contacts at passage — DONE (2026-09-20, DEV until deploy).** When a CU clicks *Quitte le
      groupe* on the passage page (`passage.tsx`), a **LeaverContactDialog** opens first: it fetches the member's
      detail, prefills the personal email (primaryContactEmail → primary/first own email) + phone (primary/first own
      phone), and lets the CU confirm/edit them (both optional) + an optional note. On confirm →
      `PUT /members/{id}/leaver-contact` (`SaveLeaverContactCommand`, members.edit, `MemberAccess.CanAccessMemberAsync`)
      adds the email/phone to the member's OWN contacts if missing (email deduped case-insensitive, phone deduped on
      digits) + sets `PrimaryContactEmail` = the email (so it lives on the alumni fiche + drives future mail); then
      the leaving passage line is recorded (isLeaving, note → cuNotes) as before. **Bulk** "Quitte le groupe" (new
      orange button in the bulk bar) steps through the selected members one dialog at a time (progress "X/N",
      **Passer** to skip one without recording, **Annuler tout** to stop; completion clears the selection). Backend
      command reuses the RealEmail/NoHtml validators + audits `Update`/Member with LeaverEmail/LeaverPhone. Files:
      `SaveLeaverContact/SaveLeaverContactCommand.cs`, `MembersController` `PUT {id}/leaver-contact`,
      `useSaveLeaverContact` (member-service), `components/passage/leaver-contact-dialog.tsx`. dotnet 0/0 + tsc +
      eslint + vite clean. (The manual rentrée task *Collecter les coordonnées des membres qui quittent au passage*
      is now a real in-app step.)
- [x] **Go-live for real users — DONE (confirmed 2026-09-20).** Prod: `email.override_recipient` CLEARED; SMTP2GO +
      SendPulse + Mailgun all active + working; enrollment live since Sept 1; forced first-login password +
      configurable policy + manual email-verify all BUILT; synthetic `@scouts.gndj` logins kept. Activation-link
      sender ("Envoyer les accès") available for the ongoing unit-by-unit rollout. See [[project-email-golive]].
- [ ] Public site #3: knowledge / ressources section (lightweight CMS pages vs structured downloadable library).
- [x] Orphan logins + zero-day markers — DONE 2026-09-20. Orphan logins (never-logged-in, no assignment) disabled
      via patch 022 (51 on dev; super-admins preserved) + a reusable disable/enable-login panel toggle. Zero-day
      assignments now have a CG review page (`/admin/zero-day-assignments`): date or delete each. See the
      "Data-cleanup batch" section above.
- [x] Deployment hardening — RESOLVED/decided (2026-09-20). SMTP passwords can now live in `appsettings` config
      instead of the DB (externalize path built; prod purge `UPDATE smtp_servers SET password=''` pending — see
      [[SMTP Credentials Storage]]). Secrets→env-vars + httpOnly-cookies decided **won't-do**: secrets are already
      gitignored server-side (env vars = marginal gain), and httpOnly cookies would rearchitect the whole
      JS-token auth model (remember-me / sibling-switch / impersonation) for low benefit given CSP + React escaping.
- [x] Perf leftovers — all DONE (checked 2026-09-25): Serilog file + DB sinks are async (Serilog.Sinks.Async), /health
      runs a DB check (DatabaseHealthCheck), demande-send lookups batched (perf pass 2026-07-10), prod Npgsql pool set.
- [ ] **TypeScript 6 → 7** (deferred 2026-07-19): the codebase is ALREADY TS-7-clean — trialled live, `tsc` +
      `vite build` pass with ZERO code changes; the ONLY change needed is tsconfig.app.json (remove `baseUrl` +
      `ignoreDeprecations`, make paths relative `"@/*": ["./src/*"]`). Blocker: **`typescript-eslint` hard-fails on
      TS 7.0** (throws "does not support TS 7.0", tracked for TS ≥7.1 — GH issue typescript-eslint#10940), which
      would break `eslint`/CI. **Revisit when typescript-eslint ships TS 7 support** → then it's a 5-min bump:
      `npm i -D typescript@7 typescript-eslint@<new>` + the tsconfig edit above, no code work. (TS 7 = native/Go
      compiler; benefit is type-check speed only — Vite emits the bundle, so no runtime change either way.)

### CU "Mon unité" — shared member file + per-CU customization (2026-09-25, DEV until deploy)
- **One member file for everyone:** the member detail panel was extracted from `pages/members/index.tsx` into
  `components/members/member-detail-panel.tsx` (`MemberDetailPanel`, props memberId / onDeleted? / initialTab? /
  onBack? [mobile back arrow]). The CU unit roster (`dashboard-unit-leader.tsx`) used an OLD private 9-tab copy
  (no Contact & famille merge, no Actions menu, no siblings) — it now renders the shared panel. Every tab/action is
  already permission-gated, so the CU just sees fewer actions. The CU chose NOT to customize tabs (all tabs stay).
  `credentialsMessage` moved to `lib/credentials.ts`.
- **Per-CU preferences** (`User.UnitDashboardPrefsJson`, migration `AddUserUnitDashboardPrefs`; `GET|PUT
  /my-profile/unit-dashboard-prefs`, own account, JSON-object validator ≤4000): schema owned by the frontend
  (`lib/unit-dashboard-prefs.ts`, merged against defaults on load, null when equal to defaults) = action-bar buttons
  order/visibility (Anniversaires/Liste/Trombinoscope/Exporter/Cartes/Photos/Équipes), roster row fields (photo,
  fonction, équipe, matricule, âge, absences, état du dossier), grouping (par équipe | A–Z). "Personnaliser" (sliders
  icon) at the end of the button bar → `components/dashboard/unit-dashboard-customize.tsx`. Defaults = the previous
  look exactly.
- **Dossier flags on roster rows:** `RosterMemberDto` gained `DocsComplete` / `CotisationOk`, computed by the new
  shared `Common/MemberCompliance.ComputeAsync` (3 batched queries) — `GetMembersQuery` now uses it too (same rule).
- `ui/switch.tsx` gained an optional `aria-label` (was dropped → unnamed switches for screen readers).
- Verified live as a real CU (Troupe 3): shared file with 6 tabs + Actions; hide Photos / A–Z / dossier icons saved,
  survive reload, Réinitialiser restores defaults; no page errors. Build + tsc + eslint + vite clean.

### One session per device (2026-09-25, DEV until deploy)
Signing in on one device used to sign the others out: each account had ONE rotating refresh token
(`users.refresh_token`) and every login/refresh overwrote it (a phone + PC user signed in ~27 times in 5 days).
- **`UserSession`** (table `user_sessions`, migration `AddUserSessions`): one row per signed-in device with its own
  rotating refresh token (SHA-256 `token_hash`, unique), `expires_at` (sliding), `remember_me`, created/last-activity,
  user agent + IP. `users.refresh_token*` DROPPED; the migration COPIES every live token into a session first, so the
  deploy signs nobody out (dev: 594 carried over). Cascade-deleted with the login account.
- **`Auth/Common/UserSessions`** = the single place for the rules: `StartAsync` (login / login code / register;
  prunes expired + caps 20 devices per account), `FindByTokenAsync` + `Rotate` (refresh; the PREVIOUS token stays
  valid for a 120 s grace window so a lost refresh response on a flaky mobile network doesn't sign the device out),
  `KeepThisDeviceOnlyAsync` (change-password + "déconnecter les autres"), `EndAllAsync` (password reset by link,
  leader reset, disable login, delete member, merge loser).
- The access token carries **`sid`** = the session id (`ICurrentUserService.SessionId`, + `UserAgent`/`IpAddress`),
  so logout ends ONLY the calling device.
- **"Mes appareils connectés"** (account menu, `my-devices-dialog.tsx`): `GET /auth/devices`, `DELETE
  /auth/devices/{id}` (own sessions only) + "déconnecter les autres". **Sessions actives** (super-admin): one row per
  member DEVICE with an Appareil column + "Cet appareil"; disconnect ends that device only. Parent-portal accounts
  keep their single token (unchanged).
- Patches 019/022 no longer reference the dropped column (a fresh DB would have failed on them).
- Verified live: 28/28 API checks (phone survives PC login, grace window, per-device end/logout, sign-out-others,
  password change, admin per-device disconnect, CU 403), disable-login ends all devices, browser 7/7.

### « Session photo » switch (2026-10-09, DEV until deploy)
- Setting `members.photo_session_enabled` (boolean, default true, category members = CG-editable; SeedMissingSettings).
  Off → `/photo-session` shows a « désactivée » notice, its menu link + Ctrl-K entry and the « Photos » button on Mon unité
  are hidden, and the rentrée task with action `goto-photo` is gated (`RentreeFeatureGates.Photo`). Uploading a photo
  from the member file is unaffected. Client hook `usePhotoSessionEnabled()` (settings-service).

### « Photos des membres » page (2026-10-09, DEV until deploy)
- `/unit-photos` (`pages/unit-photos.tsx`): one unit's active members as 3:4 photo tiles grouped by team (maîtrise
  first), grey silhouette when no photo (`MemberPhoto placeholder="silhouette"`), « Sans photo » filter, click → big
  photo (editable: replace/delete) + « Ouvrir la fiche ». A chef sees the units they lead (picker if several); a group
  manager picks any active unit (parcours order). `GET /units/{id}/photos` (`GetUnitPhotosQuery`: CanLeadUnit or
  IsGroupManager, one row per member = most senior post). Menu: CU leader nav + « Unités & maîtrise » for managers.
  Hook `useUnitPhotos` keyed under ['members', …] so photo uploads refresh it.
- **Photo thumbnails:** `GET /members/{id}/photo?size=thumb` → `IPhotoThumbnails` / `PhotoThumbnails` (SkiaSharp,
  ≤320 px tall, JPEG q75, EXIF orientation applied) cached in `uploads/photo-thumbs/<file>.<lastWriteTicks>.jpg`
  (outside uploads/photos → not seen by the stray-file check; old versions deleted when remade; falls back to the
  original if decoding fails). `MemberPhoto` fetches the thumb whenever its height ≤ 160 px (query key adds 'thumb').
- **Camera choice on the member file:** `MemberPhoto editable` camera button = menu « Prendre une photo » (dialog with
  the lazy-loaded `CameraCapture` silhouette frame) / « Choisir une photo » (file picker, unchanged). With
  `members.photo_session_enabled` off the button picks a file directly.

### « Lier automatiquement » sure sibling links (2026-10-09, DEV until deploy)
- « Frères et sœurs à lier » window (`demande-flag-review.tsx`): button « Lier automatiquement les correspondances
  sûres (N) » → confirm → `link-member` for each sure suggestion, one after another. Sure (`isSureLink`, client-side):
  declared first+last name = suggested member's name exactly (letters/digits only, accents/case ignored, order may be
  swapped) AND père/mère identical — each role present on both sides or neither, one record each, same full name — with
  at least one parent. One letter off, a missing parent or two fathers on file → stays manual. Dev: 55 of 69.

