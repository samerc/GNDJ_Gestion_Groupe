# Rentrée, calendar & réunions

Rentrée checklist, réunions & absences, group calendar, new-year cleanup.

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

### Rentrée scoute — scout-year startup checklist (2026-06-25)
A dependency-aware task list for starting a scout year, generated each year from an editable template.
- [x] **Entities:** `RentreeTaskTemplate` (master defs) + `RentreeTask` (per-year instance). Assignees &
      dependencies stored as Postgres `uuid[]` arrays (no join tables). Migration `AddRentreeTasks`.
- [x] **Template** (super-admin + CG, perm `rentree.manage`): tasks have title/description/phase, an assignee =
      a **role** (security-profile code, with **fan-out-per-unit** toggle) OR **specific members**, a fuzzy default
      deadline label, and **dependencies** (depends-on other templates). Editor at `/admin/rentree-template`
      (add/edit/delete, up/down reorder, member search for the "members" type, dependency checklist). Seeded with a
      default ~18-task template (Configuration → Passage → Demandes → Dossiers → Organisation → Progression) via
      `SeedData.SeedRentreeTemplateAsync` (idempotent).
- [x] **Generate** (CG): `POST /rentree/generate {scoutYear, overwrite}` copies the template → tasks, **fans out
      per-unit role tasks into one task per active unit**, resolves assignees to concrete members (role→holders of
      that profile [per-unit = that unit's holders], members→explicit), and wires dependencies (per-unit→per-unit
      matches the same unit; group↔per-unit links all). Verified: 18 templates → 137 tasks (126 per-unit over 18
      units + 11 group); real CUs get exactly their 7 fan-out tasks; blocking correct.
- [x] **Rentrée page** `/rentree` (visible to ALL members; sidebar main nav): year selector, **Toutes / Mes tâches**
      filter, progress bar, tasks grouped by phase. Each row: round check (manual complete — assignee or CG;
      **disabled while blocked** by an unfinished prerequisite, shown with a lock + "En attente : …"), assignee,
      deadline (fuzzy label or fixed date, **red when overdue**). CG can edit a task (title/desc/fuzzy label/fixed
      due date) + delete. `IsMine` = my member id ∈ assignees.
- [x] **Overdue login popup:** `RentreeOverduePopup` (mounted in AppLayout) — on login, once per session
      (sessionStorage), shows my tasks past a **fixed** due date with a link to /rentree. Backed by
      `GET /rentree/my-overdue`.
- [x] New permission `rentree.manage` (super-admin + chef-de-groupe via "All except excluded"). Read endpoints are
      auth-only so the checklist shows for everyone; management gated by `rentree.manage`.
- [x] **Per-unit rollup + filters (2026-06-25):** the "Toutes" view fanned out to 137 rows — fixed. Per-unit task
      instances (same `templateId`, now on the DTO) **roll up into ONE collapsible row** with an `X/N unités`
      progress bar; expanding shows the per-unit sub-rows (each with its own check/edit/delete). Group tasks stay
      single. A **unit filter** ("Toutes les unités ▾") drills into one unit (flat list). **Phases are collapsible**
      with a per-phase `X/Y ✓` badge. "Mes tâches" stays flat (a CU only sees their own unit anyway). Result: CG sees
      ~18 rows instead of 137. Frontend-only (rentree.tsx).
- NOTE/deferred: member-level per-member tasks (e.g. each parent uploads docs) modelled as CU-owned per-unit tasks
      for v1; reassigning an instance task's members is via regenerate (edit dialog preserves existing assignees);
      no auto-completion from module state (manual checkbox, by design); per-task bulk deadline (set one date across
      all units of a rollup) not yet built — edit is per-unit-instance.

### Rentrée: actionable checklist (2026-07-11)
Made the Rentrée startup checklist *do things*, not just track them. A task can carry a built-in **action** from a
fixed catalog (chosen in the template editor OR when adding a task) — kept in sync between backend
`Application/Rentree/RentreeActions.cs` and frontend `client/src/lib/rentree-actions.ts`. Two kinds:
- **"do" actions** run a real operation from the list + auto-complete the task: **`open-demandes`** (opens the
  inscriptions) and **`open-passage`** (opens the passage). `POST /rentree/tasks/{id}/run-action`
  (`RunRentreeTaskActionCommand`, rentree.manage) executes it; blocked while a prerequisite is unfinished.
- **"goto-*" actions** are one-click page shortcuts (settings/units/maitrises/demandes/passage/passage-review/
  documents/photo/my-unit/progression). Pure frontend nav; no server work.
- **Filled a real gap:** a CG could NOT open the inscriptions (only the Settings page could, super-admin-only).
  New **`SetDemandeEnabledCommand`** (demande.manage) opens/closes `demande.enabled`; `open-demandes` uses it.
- `ActionKey` added to `RentreeTaskTemplate` + `RentreeTask` (migration `AddRentreeActionKey`); copied on generate.
  Seeded on the 18 default templates; **`SeedRentreeActionKeysAsync`** backfills existing templates AND already-
  generated tasks by title (idempotent) so current years light up without a regenerate.
- **Checklist is now fully customizable per year** (managers): **"Ajouter une tâche"** (`CreateRentreeTaskCommand`,
  `POST /rentree/tasks`) adds a **one-off task straight into a year** (TemplateId=null — regenerate/add-new never
  touch it; fan-out per unit supported); **"Ajouter les nouvelles tâches"** (`GenerateRentreeChecklistCommand`
  `AddOnly=true`) non-destructively inserts template tasks missing from a year (keeps progress); edit/delete per
  task already existed. Generate dialog: add-new (safe) vs Tout régénérer (destructive confirm).
- Fixed a dialog **clip bug** (template editor): long dependency titles in `truncate` (nowrap) spans without
  `min-w-0` forced the dialog wider than its max width. Action dropdown hint is now dynamic ("Rien d'autre à configurer").
- Verified live: open-demandes flips `demande.enabled` false→true + marks the task done (blocked path refused);
  one-off create (group=1 / fan-out=18, TemplateId null); add-new added a missing template's instances only. DEV until deploy.

### Séances & absences + document-verification campaign (2026-08-22/23, v3.5.0)
- **Séances / absences** (main @ cfd5fee/befe329/1db5618): `Meeting` + `MeetingAbsence` + `FunctionalRole.IsTeamLeader`
      (migration AddMeetings). A séance = unit-wide OR team-scoped (Réunion/Sortie/Camp w/ date range); attendance =
      an absentee list (present by default). CU (attendance.manage + unit) manages all; a **chef d'équipe** (member
      holding an IsTeamLeader role on a team — `GetMe.leadsTeam`) creates a PENDING séance for their team + fills it.
      Page `/attendance` (create/approve/delete/edit + roster with absent+reason), `MeetingHandlers` + `MeetingsController`.
      **YEAR MODEL:** absence badges (member fiche `AbsencesThisYear`, CU roster, CG list) use the scout year that
      CONTAINS TODAY (calendar, `ScoutYearHelper.Window(null)`), NOT `passage.scout_year` (set ahead) — so séances
      logged pre-season (Aug–Sep) count immediately; the Séances page has a year picker (both years in parallel).
      `IsTeamLeader` toggle on the fonction editor. See memory [[project-absences-feature]].
- **Document-verification campaign** (main @ fd616d4): group-wide yearly schedule the CG sets with 5 dates
      (documents.* settings) → member upload opens/closes automatically per phase (Dépôt → Vérif 1 → Correction →
      Vérif 2 → Terminé, computed on read via `DocumentCampaign.LoadAsync`; leaders [members.edit] bypass). A daily
      **`DocumentCampaignBackgroundService`** runs the 2 steps when verification is done (= zero docs Pending
      group-wide), else alerts the CG (email) who runs them by hand: at correction_start → email each incomplete
      member their gap list (reuses `document_reminder`); at final_deadline → put still-incomplete dossiers **on hold**
      + email. **On hold** = `Member.IsOnHold` (migration AddMemberOnHold): member can log in but doc upload disabled
      + "compte suspendu — contactez la maîtrise" banner; CG reactivates. `DocumentCampaign`/`DocumentCampaignActions`
      (shared send/hold/alert, idempotency markers stamped w/ scout year) / `DocumentCampaignHandlers`; endpoints
      `/documents/campaign*` + `/documents/on-hold*` (maitrise.manage; status auth-only); upload gate in
      DocumentHandlers; `GetMe.isOnHold`. Seeded 2 templates (membership_on_hold, document_verification_incomplete).
      Frontend: CG page `/admin/document-verification` (schedule + phase + per-unit completion + manual buttons +
      on-hold list/reactivate), `CampaignPhaseBanner` on the unit-documents matrix, member "dépôt fermé/suspendu"
      banners disabling upload. Live-verified end-to-end. **Demande auto-close by date already existed** (demande.
      submission_start/deadline) — reused, not rebuilt. NEXT (user): improve the to-do list (rentrée) next.
- **Leader first-login contact verification** (main @ 42fb9bf): when a member becomes a leader, on first login
      (AFTER the forced password step) a one-time blocking screen asks them to confirm their PERSONAL email +
      phone (many were youth with a parent's on file) — confirm in one click or correct. `Member.ContactVerifiedAt`
      (migration AddMemberContactVerified); `GetMe.needsContactVerification` (real leader = holds a leadership/
      group-level role, NOT super-admin-by-flag, ContactVerifiedAt null) + `suggestedEmail`/`suggestedPhone*`
      prefill from the member's OWN email/phone (never a guardian's). `POST /my-profile/verify-contact`
      (`VerifyMyContactCommand`, auth/own): sets PrimaryContactEmail, adds email+phone to own contacts if missing,
      stamps ContactVerifiedAt (email required, phone optional). Frontend `LeaderContactVerification` in AppLayout
      after ForcePasswordChange. Verified live (super-admin exempt; CU prompted → verify → cleared).
- Version bumped to **3.5.0** (all three features); DEV until deploy.

### Rentrée checklist — "make it live" + readability (2026-08-23)
Reworked the scout-year startup checklist from a static, manually-ticked list into a live one wired to the app's
real state, plus a readability pass. All on main (v3.5.0, DEV until deploy). Two new nullable columns
`RentreeTaskTemplate`/`RentreeTask` — `DeadlineAnchor` + `ProgressKey` (migration `AddRentreeAnchorAndProgress`).
- **Deadline anchors (`RentreeAnchors`):** a template/task can hang its due date on a real date-typed SETTING
      (`passage.date`, `demande.submission_start`/`_deadline`, `demande.member_start_date`, `documents.*`). The
      EFFECTIVE due date is resolved LIVE at read time (`ResolveDueDatesAsync`) from that setting's value → the
      checklist tracks the year's actual calendar and "overdue" fires (verified: setting submission_deadline to a
      past date made "Réviser les demandes" due+overdue). Falls back to the manual DueDate then the fuzzy label.
- **Live progress (`RentreeProgress.ComputeAsync`):** a task can reflect module state instead of a manual tick —
      `demandes-open`/`passage-open` (bool from settings), `passage-proposed`/`documents-verified`/`photos-done`/
      `cotisations-paid` (per-unit X/N), `passage-finalized`/`demandes-reviewed`/`demandes-sent` (group counts). The
      DTO carries `progressKey/Label/Current/Total/Complete`; **`IsDone` = effective done (Status==done OR progress
      complete)**. Auto-satisfied tasks unblock dependents + count toward phase progress. Verified live (real
      per-unit counts, e.g. passages proposés 6/75; documents "Rien en attente" auto-done).
- **Blocking honors effective-done** (`RentreeBlocking.HasOpenPrerequisiteAsync`): Complete + RunAction gates
      treat a progress-complete prereq as done. Verified: "Envoyer les réponses" blocked by not-yet-reviewed
      demandes; "Réviser" NOT blocked (its prereq "Ouvrir les inscriptions" is auto-done).
- **Readability:** each phase renders as a dependency FOREST (`buildForest`) — a task nests (indented + left
      guide line) under its closest same-phase prerequisite; cross-phase deps show via the "En attente" hint. Live
      progress chip (emerald complete / amber remaining, mini bar) + colored deadline chip (red overdue / amber
      within 14 days). Auto-tracked tasks show a non-clickable Activity indicator (not a manual checkbox).
- **Authoring fixes:** `RefreshRentreeAssigneesCommand` (`POST /rentree/refresh-assignees`, "Responsables" button)
      re-resolves role tasks' assignees from CURRENT holders — fixes the bootstrap gap (a CU confirmed AFTER
      generate had an empty "Mes tâches"). Add-only generate now also SYNCS template-derived fields (title/desc/
      phase/order/label/anchor/progress/action) onto existing tasks, keeping progress. Dependency CYCLE guard in
      SaveRentreeTemplate (verified → 400 "Dépendance circulaire").
- **Weekly reminder digest** (`RentreeReminders` + `RentreeReminderBackgroundService`, 12h tick, weekly cadence
      via `rentree.reminder_last_sent` marker, master switch `rentree.reminders_enabled`): one email per assignee
      listing their overdue/upcoming (≤7d) not-done tasks, via the durable outbox (seeded template
      `rentree_task_reminder`). Overdue login popup fixed to RE-surface when the overdue set changes (signature in
      sessionStorage, not a one-shot boolean) and honors anchored/auto-done tasks.
- **Template editor + one-off add** gained "Échéance basée sur une date" + "Suivi automatique" dropdowns
      (`client/src/lib/rentree-anchors.ts` + `rentree-progress.ts` mirror the backend catalogs). Default templates
      backfilled with anchors/progress by title (`SeedRentreeAnchorsAndProgressAsync`, idempotent, fills nulls on
      templates AND generated tasks — existing years light up without a regenerate). **"Modèle de rentrée"
      (`/admin/rentree-template`) is still the master template editor — kept, now with the two new fields.**
- Build clean (dotnet 0/0, tsc+eslint+vite). See memory [[project-rentree-actionable]].

### Rentrée master template rework (2026-08-25)
Reworked the **Rentrée checklist master template** (`rentree_task_templates`) from a CU/CG review (the user
edited an Excel export of the 2026-2027 tasks; I reconciled it against the live template, which had drifted +5
tasks past the snapshot the user saw). Live dev DB + the seed code; 2026-2027 regenerated.
- **Template 24 → 31 tasks.** Added: *Vérifier les textes des emails*, *Arranger le document des tenues et le
      mettre en ligne* (Config); *Collecter les coordonnées des membres qui quittent au passage* (Passage, par-unité);
      *Ouvrir la période de réinscription (dépôt des documents)*, *Vérifier les documents — 2ème vérification*,
      *Bloquer les membres dont les dossiers sont incomplets* (Dossiers). Restored 2 canonical seed tasks the live
      template had lost to drift (*Envoyer l'email d'accueil aux chefs*, *Mettre à jour les conditions d'inscription*).
      Deleted *Imprimer les cartes membres*. Repurposed the junk *"photo"* task → *Les chefs mettent à jour les
      membres (badges, étapes…)*.
- **Doc verification split + made MANUAL.** *Vérifier les documents* → *1ère vérification* + *2ème vérification*,
      both **manual** (dropped the `documents-verified` auto `progress_key`) with campaign-date deadlines
      (`documents.deposit_deadline` / `documents.correction_deadline`). Root cause of the "lots of tasks show
      complete but aren't" the user reported: the per-unit auto-tracking read "0 documents en attente" as done
      before anyone uploaded. The new upload/verif steps are date-anchored to the document campaign
      (deposit_start / deposit_deadline / correction_start / correction_deadline / final_deadline).
- **Re-phased** (quotas → Passage, séance photo → Organisation, étapes/badges → Configuration; Progression phase
      now empty) and re-wired dependencies. Kept the auto-tracking on passage/demandes/cotisations/photos (accurate).
- **Applied to:** the live dev DB template (rebuilt via generated SQL — `tools/gen_rentree_template_sql.py`, no FK
      references it, wipe+reinsert+dep-by-title), then **regenerated 2026-2027** (`POST /rentree/generate
      overwrite=true` → 175 tasks, ALL reset to pending so statuses reflect reality). Updated the C# seed
      `SeedData.SeedRentreeTemplateAsync` to the 31-task list (extended its `Add()` helper to set progressKey +
      anchor directly) so fresh installs match. Prod picks it up via the go-live dump. Verified: 175 pending, phase
      counts balanced, doc verifs manual, Imprimer-les-cartes gone. Build clean.
- **Excel exports** (`tools/gen_rentree_xlsx.py` grouped, `gen_todo_xlsx.py` full CLAUDE.md list) on the Desktop
      for reference/planning — one-way (editing the sheet doesn't write back).

### Réunion rename + CG document matrix + prod placeholder cleanup (2026-08-25/26)
- [x] **"Séance(s)" → "Réunion(s)" everywhere** (commit 00dd02b): 111 occurrences across 21 files (UI strings,
      toasts, error messages, comments, backend). Excluded **"séance photo"** (photo session) via a lookahead;
      no identifiers / DB columns / enum values touched (the meeting TYPE value `'Reunion'` + its "Réunion" label
      are separate). NOTE the umbrella is now "Réunion" while one meeting type is ALSO "Réunion" (+ Sortie/Camp) —
      mild redundancy, left as-is (offered to rename the type label; user hasn't decided). Builds clean.
- [x] **CG/super-admin document matrix — any unit via a picker** (commit 4457138): the per-unit
      document-verification grid (`/unit-documents`, `unit-documents.tsx`) was CU-only (scoped to `user.unitAccess`).
      A group manager (super-admin / maitrise.manage) now gets a FULL active-units picker (`useUnits({isActive})`,
      new `enabled` flag so the list only loads for managers) and can open ANY unit's matrix. **Backend unchanged** —
      the matrix endpoint already allows a manager on any unit (members.edit + all units granted at login), so it's a
      UI widening. Manager starts unselected ("Choisir une unité…" + "Sélectionnez une unité" prompt); CU behaviour
      unchanged. New sidebar entry **"Documents par unité"** (Suivi group, maitrise.manage). Verified: CG loads JEM
      matrix (200) with no assignment there.
- [x] **Prod placeholder-units cleanup DONE** (scripts in `deploy/golive/`): the earlier two-part run had been left
      UNCOMMITTED on prod (pgAdmin rolls back without an explicit `COMMIT`) — nothing had applied. Re-ran on prod
      **with COMMIT**: Naia (F-0629) moved to **C2** as an alumna (her Compagnie-placeholder rows repointed to the
      real C2, active row end-dated); **Meute + Ronde** placeholders hard-deleted; **Compagnie + Troupe** deactivated
      then **soft-deleted** (is_deleted=true — they had a leftover empty "NA" team + a zero-day migration marker for
      Alexandre SALHA M-0033 that RESTRICT-blocked a hard delete; soft-delete hides them from the app). Confirmed
      gone from the Unités page. `deploy/golive/fix-naia-and-retire-placeholders.sql` = the committed one-shot.
      **Authoritative unit-FK list** (for any future unit cleanup): RESTRICT on teams/member_assignments/
      member_progressions/passages(×3)/demandes/unit_intake_quotas; CASCADE on meetings/trombinoscope_archives;
      SET NULL on rentree_tasks; NON-FK (silent, not blocked by delete): events.tag_unit_id, news_posts.tag_unit_id,
      camp_participants.unit_id.
- **Excel task exports** (`tools/gen_todo_xlsx.py` = full CLAUDE.md checklist, `tools/gen_rentree_xlsx.py` = grouped
      rentrée list) on the Desktop for planning; `tools/gen_rentree_template_sql.py` rebuilds the rentrée template.
      One-way (editing the sheet doesn't write back).

### Rentrée assignees resolved LIVE — ACU + late-placement fix (2026-08-30)
Two reported bugs (an ACU with an EMPTY to-do list; "the list didn't appear to all maîtrises when they were
assigned") shared a root cause: rentrée task assignees were FROZEN into `RentreeTask.AssigneeMemberIds` only at
generate/refresh time, and per-unit tasks resolved to the **`chef-unite` profile code only**. The **ACU profile
split (2026-08-30)** moved assistants onto `assistant-unite` → a per-unit "CU" task (targets `chef-unite`) no
longer matched an ACU (e.g. Maria HARFOUCHE, R3, `assistant-unite`, `is_maitrise=t`) → empty list; and anyone
placed AFTER generate needed a manual "Responsables" (RefreshRentreeAssignees) click.
- **Fix = resolve role-task assignees LIVE at read/authz time** (new `Application/Rentree/RentreeAssignees.cs`):
      a **per-unit** role task → every **`IsMaitrise`** holder active in that unit (so CU + ACU + aumônier — the
      whole unit maîtrise); a **group-wide** role task → holders of its `SecurityProfile.Code` (CG tasks unchanged).
      `"members"` tasks keep their stored ids. So a maîtrise placed at ANY time appears immediately, no refresh.
- **Applied in 4 places** (all use `RentreeAssignees.LoadHoldersAsync` + `.Resolve(task, holders)`):
      `GetRentreeTasksQuery` (IsMine + the shown AssigneeMemberIds/Names now live), `GetMyOverdueRentreeTasksQuery`
      (candidate filter by my maîtrise units / my group profile codes — the old SQL `AssigneeMemberIds.Contains(me)`
      couldn't reflect live), `CompleteRentreeTaskCommand` (the isAssignee authz), and `RentreeReminders.SendDigestAsync`
      (weekly digest recipients). The stored `AssigneeMemberIds` snapshot (written by generate/refresh) is now just a
      cache/fallback for role tasks — the Refresh button + generate still populate it but read no longer depends on it.
- **Verified live** (super-admin `/rentree/tasks?scoutYear=2026-2027`): Maria (ACU) now on ALL 9 R3 per-unit tasks
      alongside the head CU (Lynn CORTAS) + Léa RAPHAEL; 22/22 group tasks still have assignees; the only empty
      per-unit tasks are Feu Jamhour's 9 (the one active unit with 0 maîtrise — correct). Backend build clean.
      Backend-only, DEV until deploy.

### New-year cleanup — "Nettoyage de nouvelle année" (2026-09-25, DEV until deploy)
What is reset when a scout year starts, run by the CG ONCE per scout year (marker `newyear.cleanup_done_for`).
- **Trigger:** prompted right after the CG moves `passage.scout_year` FORWARD in Paramètres (`NewYearCleanupPrompt`
  from `handleSave`), + a manual card at the top of Paramètres → Passage (`NewYearCleanupPanel`). Both CG-only
  (maitrise.manage). Preview first (live counts), then a confirm with an "J'ai compris" checkbox.
- **What it does:** (1) exports EVERY document + pages to a zip `<unité>/<NOM Prénom>/<type>[ - pN].ext` (stored,
  no compression) in `DocumentArchive:Directory` (default `<cwd>/archives/documents`; prod: outside the site, e.g.
  `C:\gndj-backups\documents`, synced off-server by `backup-db.ps1` step 2c = `backup.documentArchiveDir`); (2) deletes
  every document not of a kept type (`newyear.keep_document_types`, json array of CODES, default `["CI"]`) incl.
  pages + files; (3) resets the kept documents to Pending unless `newyear.keep_id_approval` (default true); (4) clears
  `section` on all members; (5) moves every ACTIVE member's `classe` up one step of `member.classes` (last stays),
  skipping members created from THIS year's demandes (enrolled with the new classe).
- **Background job** (`Infrastructure/Services/NewYearCleanupService`, singleton, own scopes) — a multi-GB zip can't be
  built in one request (Cloudflare 100 s). Status in setting `newyear.cleanup_status` (polled every 3 s by the UI;
  a stale "running" after a restart reads as failed). Crash-safe order: zip → ONE transaction (deletes, approvals,
  sections, classes, marker, status) → file deletions. Audited `NettoyageNouvelleAnnee`.
- **API** `NewYearController` (api/v1/new-year): `GET|POST /cleanup` (maitrise.manage + IsGroupManager),
  `GET /archives/{file}` (super-admin only, path-traversal guarded). All 4 `newyear.*` keys hidden from the generic
  settings list (edited in the card; category passage = CG-editable).
- `.gitignore` now ignores `archives/` (the audit CSV archive was NOT ignored before — personal data).
- Fixed: Paramètres `?tab=<category>` deep links locked onto the first config tab (tab chosen before settings loaded).
- Verified live on dev (snapshot + exact restore): preview == SQL, CU 403, run 202 → done (1504 docs deleted, 634
  approvals reset, 85 sections, 951 classes, Term→Université, Université stays), zip of 46 stand-in files with the
  expected layout + "- p2" pages, kept CI files stay, deleted files removed, CG can't download / super-admin can,
  traversal 404, second run refused. Browser 7/7 (card, confirm gate, prompt after year change).

### Oct 2026 improvement plan + group calendar (2026-10-05/06, DEV until deploy)
- **Member « Ma rentrée » card** (GET /my-profile/todo): state-driven to-do on Ma fiche; contact review yearly from
  `documents.deposit_start` (Common/ContactReview); cotisation line behind `cotisation.show_in_rentree` (OFF).
- **CU « À traiter » strip** on Mon unité (GET /dashboard/unit/{id}/todo) + **« ? »** next to every page title
  (PageHeader → `client/src/lib/page-help.ts` route → guide heading; keep in sync when guide headings change).
- **« Ce qui va se passer »** in the confirm of Envoyer les réponses (GET /demandes/send-responses/preview) and
  Publier le passage (GET /passages/finalize/preview): shared ActionPreviewDto/ActionPreviewPanel; blockers disable
  the confirm (`ConfirmDialog.confirmDisabled`).
- **« Emails reçus »** card on the member fiche (GET /members/{id}/emails-received; outbox matched by address,
  secret-looking variables masked, bounced addresses flagged).
- **Demandes:** « Demande reçue » popup after the first submit (serial + `demande.response_expected` free text);
  re-submitting keeps SubmittedAt; `Demande.LastEditedAt` set only on a real change of child/household data.
- **Group calendar** (`/calendrier`, everyone; Application/Calendar): `CalendarEvent` audiences Group / Branch / Unit /
  Maitrise / CgTeam (CG team creates any, a chef d'unité only their unit — `CalendarViewer`), multi-day, times,
  weekly / 2-weekly / monthly repeats (one row, expanded on read; cancelled dates in ExceptionDatesJson), reminders
  (CalendarReminderBackgroundService → bell + push, once per occurrence), « Publier aussi sur le site » (synced public
  Event), personal iCal link (`Member.CalendarFeedToken`, anonymous `/calendar/feed/{token}.ics`). Feed adds the
  viewer's units' réunions, **member-group réunions** (roster members; CG team for group-wide; the unit's chefs for
  unit ones) and the year's important dates (settings). **« Modifier cette date »** (`POST /calendar/events/{id}/
  edit-date`): the series skips the date and a one-off copy (`SeriesEventId` + `SeriesDate`, migration
  AddCalendarEventSeries) replaces it; copies are removed with the series, on a change of its dates/repetition, or
  when the date is restored.
- **« Remplir et signer en ligne »** (`DocumentType.OnlineFillable`, migration AddDocumentTypeOnlineFillable; only with
  an in-app template): `IDocumentTemplateRenderer.PrepareForm` gives every blank a key f0, f1… in document order (fill /
  box / checkbox; a fill labelled « Signature » = kind "signature") with the member's values written in;
  `GET|POST /documents/online-form` (`OnlineDocumentFormHandlers`, same access + campaign/on-hold gate as an upload,
  refused while a doc of that type is Pending, template hash guards a template edited meanwhile). Render prints the
  answers + the finger signature (on the « Signature » line, else a block at the end) → saved via
  MemberDocumentWriter as Pending; audit "Signature" keeps signer, relation, ref, PDF SHA-256, user agent, IP. Client:
  `components/documents/online-form-dialog.tsx` (template HTML → React nodes, never innerHTML) + `signature-pad.tsx`.
  The abuse middleware skips ONLY the oversized-token check on that path (base64 signature).
- **Rentrée tasks gated by a feature** (`RentreeFeatureGates`, Rentree/RentreeActions.cs): a task whose ActionKey maps to a
  switched-off setting is hidden everywhere (list, overdue popup, weekly reminders, dashboard count) and counts as done
  for its dependents. Only `goto-cards` ↔ `reports.cards_enabled` today (patch 036 gives « Imprimer les cartes membres »
  that action).
- **Camp BP « Fiches médicales »** (`GET /camps/{id}/medical/pdf[?famille=N]`, Familles view, audited "Download"):
  per famille (A4 landscape, one page), Père/Mère first, age / blood type / allergies / medical remarks / own phone /
  up to 2 parents' phones (emergency contact first), red allergy box at the top. Buttons in the Familles tab
  toolbar + per famille column.

### Absence alerts + sibling switch without password + « Ma famille » (2026-10-07, DEV until deploy)
- **Absences de suite** (`Application/Meetings/AbsenceStreaks.cs`): a member's run = consecutive absences on their
  most recent APPROVED réunions of their current unit (whole unit or their current team; member-group réunions not
  counted; last 365 days). Setting `attendance.absence_alert_count` (category members, default 3, 0 = off).
  `SaveMeetingAttendance` notifies the unit's chefs (active post IN the unit with a members.edit function = CU + ACU,
  not the CG, not parents; type `absence`, mutable) when the run reaches the setting on the member's latest réunion;
  once per run via `MeetingAbsence.AlertSentAt` (migration `AddMeetingAbsenceAlert`, carried over on re-save).
  « À traiter » (`UnitTodoDto.RepeatedAbsences`: id/name/count) → dropdown opening the member file.
- **Sibling switch without password** (`Application/Members/FamilyAccess.cs`): allowed between confirmed siblings when
  both resolve to the same main contact email (`ContactEmailResolver`) and NEITHER is protected (active maîtrise or
  group-level function, delegated access, super-admin). `POST /auth/switch-sibling {memberId}` (`SwitchToSiblingCommand`,
  needs a real device session, same maintenance gate, audited Login "Changement de compte", keeps the current
  session's remember-me). `SwitchAccountDto.Passwordless` + `.Protected`; `MeResponse.ProtectedAccount`. A protected
  account (incl. any members.edit function) is NEVER kept in the client account pool → its password is asked EVERY
  time (2026-10-08). Client `hooks/use-sibling-switch.tsx`: pooled → instant,
  else passwordless → server, else password dialog once (used by the account menu and Ma famille).
- **« Ma famille »** (`/ma-famille`, `GET /my-profile/family`, `GetMyFamilyQuery`): caller + confirmed siblings, each
  with the « Ma rentrée » to-do (`MemberTodo.ComputeAsync`, shared with GET /my-profile/todo); a protected sibling
  shows the name only. Link in the account menu (when siblings exist) + `FamilyCta` on Ma fiche. `lib/my-todo.ts`
  `todoLeft()`. On hold: family notifications (bell for any child).

### Times on the calendar's important dates (2026-10-09, DEV until deploy)
- Important dates (settings-driven, `CalendarFeed.ImportantDates`) can carry a start / end time: JSON setting
  `calendar.important_date_times` ({ "<setting key>": { start, end } }, created on first save, hidden in Paramètres),
  read into the « date » calendar items (and so the iCal feed). `SetImportantDateTimeCommand` +
  `PUT /calendar/important-dates/{key}/time {startTime, endTime}` — CG team only (`CalendarViewer.IsManager`, which
  is also the item's CanEdit); null start = all day. UI: « Modifier l'heure » in the calendar's detail dialog. The
  date itself is still changed in Paramètres.

