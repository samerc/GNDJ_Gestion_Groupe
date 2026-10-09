# Passage & maîtrise

Yearly passage (CU proposals, CG review, publish), projection, reminders, maîtrise page and next-year maîtrise plan.

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

### Phase 4 — Passage annuel (Complete)
- [x] **Rework (2026-09-26, DEV until deploy)** — accepting ≠ posting, units finish, no rejection:
      - **Auto-accept on propose** (`PassageAutoApprove`): same-unit lines (no change / équipe / fonction change) and
        departures → Approved; only a move to ANOTHER unit stays Pending. Patch **032** applies it to existing lines.
      - **No reject**: Review/BulkReview only accept Approved (Rejected → 400). The CG **changes** a line instead
        (final unit/team/role, or `FinalIsLeaving`; effective leaving = `FinalIsLeaving ?? IsLeaving`) with an
        optional reason (`CgNotes`, NoHtml). A differing decision sets **`Passage.CgModified`** → locked for the CU
        + in-app notification to the unit's leaders (members.edit holders) with proposal → decision + reason.
      - **Finish a unit**: `PassageUnitSubmission` (table `passage_unit_submissions`, one per unit+year; migration
        `PassageUnitFinishAndCgChanges` also adds `cg_modified` + `final_is_leaving`). `POST /passages/unit/{id}/submit`
        (CU or CG; needs every active member of the unit to have a line) → the CU can no longer propose/bulk/delete
        in that unit (`PassageLocks`); CG notified. `POST .../reopen` (CG, notifies the CU), `GET .../status`.
      - **Posting is group-wide** (`FinalizePassagesCommand(ScoutYear)`, UnitId removed): needs no missing line, every
        unit with active members finished, no legacy Rejected line; auto-accepts Pending lines; then emails each
        receiving unit's CU (template `passage_unit_new_members`, Excel via `IUnitNewMembersSheet` with a new
        "Unité d'origine" column; shared `UnitNewMembersMail` helper also used by the demande send).
      - **CG Word export** (`GET /passages/newcomers` + `/newcomers/docx?associationId=`, passage.manage):
        `IPassageNewcomersDocument` (OpenXml via ClosedXML's dependency) — one .docx per association of the
        destination unit: "Passe à la <unité> :" then one name per line (units in parcours order, natural numbers).
      - UI: CU page "Terminer le passage de l'unité" + lock banner + "Modifié par le CG" / "Décision du CG" / reason;
        CG page: no Rejeter, "Changer" dialog (incl. Quitte le groupe + reason), "Avancement par unité" (finish/reopen),
        "Publier le passage", Word buttons per association. Guides updated. Tested end-to-end on a DB copy (32/32).
- [x] Passage entity with current/proposed/final unit+team+role, CU/CG notes, status workflow
- [x] Status: Pending → Approved → Finalized (or Rejected)
- [x] CG opens/closes passage process (toggle endpoint + setting)
- [x] CU proposes changes per member (single + bulk)
- [x] "No change" proposals auto-approved (skip CG review)
- [x] CG reviews/modifies/approves/rejects (single + bulk)
- [x] CG finalizes: ends old assignments, creates new ones
- [x] ~~Auto-renewal of members without a passage record~~ REMOVED (2026-06). Every active member
      must have an explicit passage line (real proposal or "Pas de changement"). Finalize is now
      BLOCKED until every active member in scope has a line (completeness gate). No silent org-wide
      renewal — fixes a footgun where an early per-unit finalize rolled the whole group forward.
- [x] Finalize serialized via Postgres advisory lock (pg_advisory_xact_lock) inside a transaction +
      idempotent (only Approved processed, then flipped Finalized) — double-click / two-CG-at-once safe
- [x] ReviewPassage validates the final team belongs to the final unit
- [x] Passage summary returns expected vs. missing line counts per unit + overall (CG completeness view)
- [x] Team cleared on unit transfer (new CU assigns team later)
- [x] Double-finalize protection (idempotent)
- [x] UnitType AgeMin/AgeMax fields for age-based hints
- [x] CU page: member table with proposals, bulk actions, age hints, status badges
- [x] CG page: toggle, summary cards, filters, review table, bulk approve/reject, finalize
- [x] Permissions: passage.view, passage.propose, passage.manage
- [x] Sidebar: "Passage des membres" (CU), "Validation passages" (admin)

### CG management tools + Maîtrises + UX pass (2026-06-24)
A batch of CG-facing features + fixes built on the Chef de Groupe tier.
- [x] **Accent-insensitive member search:** Postgres `unaccent` extension (migration `AddIsMaitriseAndUnaccent`)
      mapped as an EF `DbFunction` (`Application/Common/DbFns.Unaccent`, registered in GndjDbContext) — member
      search unaccent()s both column + term so "rhea" finds "Rhéa". (Gotcha: keep `Unaccent()` INSIDE the LINQ
      expression — calling it on a C# variable throws the DB-only stub.)
- [x] **`FunctionalRole.IsMaitrise`** flag (migration above) + create/edit toggle; backfilled = leadership roles
      (profile chef-unite/chef-de-groupe). Drives who appears on the Maîtrises page.
- [x] **Profiles → Members tab** (`/admin/security-profiles`): super-admin sees Permissions + Membres tabs;
      CG sees Membres only (read-only) — gated by `roles.view`. `GET /security-profiles/{id}/members`
      (super-admin profile lists the flagged accounts since super-admin is a flag, not a role).
- [x] **Maîtrises page** (`/maitrises`, sidebar "Maîtrises", perm `maitrise.manage`): hierarchical by unit
      (Maîtrise de Groupe first), members by rank, **collapsible cards (collapsed by default)**, unit pill tinted
      with the **unit-type colour**. Actions: **Retirer** (ends the function, with warning) + **Transférer** to
      another unit (CG picks the new function; keep-both or close-old). Backend `MaitriseHandlers` (Get/Remove/Transfer).
- [x] **Permission-gated admin routes + sidebar** (`PermissionRoute` component): replaced the blanket super-admin
      `AdminRoute` on CG-reachable pages (demandes, passage-validation, cotisations, progression, document-types,
      news/pages/site-texts, audit, security-profiles, maîtrises) with per-permission guards; sidebar shows the
      admin nav/groups to managers (super-admin OR `maitrise.manage`) filtered by permission, so a CG sees exactly
      what they can reach. Org structure / roles / system settings stay super-admin only (sidebar perms aligned to
      `*.manage` so CG doesn't see dead links). **CG lands on the group dashboard** (AdminDashboard) — handler guard
      relaxed to super-admin OR `maitrise.manage`.
- [x] **Per-function group access** (`/admin/group-access` "Accès maîtrise", perm `roles.manage_group`): CG sets,
      per group function, per area (Membres/Demandes/Cotisations/Documents/Passages/Progression/Famille/Affectations/
      Site/Audit) a level **Aucun/Lecture/Complet** (`GroupAccessAreas` map + `SetGroupFunctionAccessCommand`).
      **Lazy-fork:** a function shares its profile until customised, then forks to its own group-level profile (others
      untouched). **Capped:** can only grant what the editor holds; `NonDelegatable` (maitrise.manage, roles.manage,
      roles.manage_group, associations.manage, unit_types/units, hard-delete) is never granted to an assistant.
- [x] **CG vs assistant split:** only the head **CG** function keeps `chef-de-groupe` (incl. the CG-only powers
      maitrise.manage + roles.manage_group); all other group functions (ACG/AUG/SG/TG/INT/ANIM) move to a seeded
      **`assistant-de-groupe`** baseline (`SeedData.SeedAssistantDeGroupeProfileAsync`, idempotent; migration tool
      step-3 routes non-CG GRP → assistant). So the Maîtrises + Accès pages are truly CG-only (super-admin covers
      the empty CG seat for now).
- [x] **Member "Informations" tab redesign** (`members/index.tsx`): hero (3:4 portrait via extended `MemberPhoto`
      + initials placeholder + chips: âge/genre/nationalité/groupe sanguin) → Identité / Scolarité / **Coordonnées**
      sections; the standalone **Contact tab merged in** (9→8 tabs). `MemberPhoto` gained `height`/`rounded` props.
- [x] **Function-delete member popup:** deleting a function used by members lists who holds it
      (`GET /functional-roles/{id}/members`, shown in the confirm dialog; `ConfirmDialog` gained `children`).
- [x] **Parcours scouts: merged SDL+GDL** — `UnitTypeProgression.AssociationId` now nullable (migration
      `MakeProgressionAssociationNullable`, existing rows set NULL); paths are group-wide, distinguished by gender;
      suggestion matches by gender (works for Noyau/G which have no association). **Branching diagram** — a node
      with multiple destinations (e.g. Noyau → Meute/Ronde/Compagnie) renders as a stacked tree, not a single line.
- [x] **Login/public wording:** "Espace membres et chefs" → "Espace membres" (login + public site + portal links).

### Passage UX + Famille/cotisation polish (2026-08-19)
Frontend-only batch (all on main, pushed at v3.3.0; DEV until deploy).
- **Passage CG default view = real changes only.** `admin/passage-validation.tsx` now hides **true "Pas de
  changement"** members by default (same unit AND équipe AND fonction — what the backend auto-approves), keeping
  every real change visible (unit move, **équipe change**, fonction change, leaving). A checkbox **« Afficher les
  membres sans changement »** (+ count) reveals them. KEY FIX: an earlier draft hid all same-unit members, which
  wrongly hid **équipe-changers** — those stay **Pending** and MUST be CG-approved or finalize (only processes
  `Approved`) silently skips them (the completeness gate only checks a line *exists*, not that it's approved). The
  no-change detector compares unit id + team **name** + role **name** (the DTO carries names, not team/role ids).
- **Passage CG « Revue » dialog is parcours-driven.** The « Unité finale » picker now lists **only the units the
  member can go to** (grouped *Même branche* / *Unité supérieure*, from `GET /unit-type-progressions/destinations/
  {memberId}`), not every unit; « Fonction finale » scoped to the destination unit's TYPE (non-archived,
  non-maîtrise), an *up* move auto-selects + locks the base youth role. The CU's proposed unit is always kept
  selectable (a *Proposition CU* group) even if outside the parcours. Fonction now defaults to the CU's proposed
  role (was blank); destinations load before the role default is resolved.
- **Passage CU bulk « Déplacer vers… »** now uses the same parcours-driven pickers as the single-member dialog
  (extracted `renderDestinationSelect` / `renderFonctionSelect` / `renderTeamBlock` helpers in `passage.tsx`;
  `openBulk` fetches destinations for the first selected member — all selected are in the same unit). Was listing
  every unit + every function. The « En attente » status badge is now **yellow** (was grey secondary).
- **Famille tab redesign** (`member-guardians.tsx`): parent cards get an initials **avatar**, a tinted header band
  grouping name/relationship/flag badges + profession, and phones/emails as bordered chip rows in a two-column grid
  (stacked on mobile). Behaviour/dialogs unchanged.
- **Cotisation:** the « Ce membre ne paiera pas » control is now an outline **button** (was ghost/plain text); on
  the member Cotisations tab the « Aucune cotisation enregistrée » line is **hidden when the member is exempt** (the
  exemption banner already states it — the two no longer contradict).

### Passage — "next year" projection / simulation (2026-09-06)
CG can preview each unit's coming-year roster on `/admin/passage-validation` BEFORE doing the approval work.
Requested because the real rosters only change on FINALIZE (approved lines). All on main, DEV until deploy;
verified live.
- **Backend** `GetPassageProjectionQuery(scoutYear)` (`GET /passages/projection`, `[HasPermission(PassageManage)]`
      + IsSuperAdmin handler gate — same as the sibling GetAllPassages/GetPassageSummary, so consistent with the
      super-admin-only passage page). Returns RAW per-member movement + unit metadata (not precomputed per mode) so
      the client computes BOTH modes with no refetch: each active member → `{currentUnitId, lineStatus
      (None/Pending/Approved/Rejected), isLeaving, destUnitId=Final??Proposed}`; plus units (code/name/type/quota/
      age) + `missingLines`. Universe = active members; a member with no line (or a Rejected one) is assumed to STAY;
      **Finalized lines are skipped** (already applied to the assignment).
- **Frontend** `components/passage/passage-projection.tsx` — a collapsible "Projection de l'année prochaine" panel
      (lazy-fetched on open) after the summary cards. **Mode toggle**: Simulation (default — Pending+Approved all
      treated as approved) vs Réel (Approved only; Pending = member stays). Per-unit table Actuel → Arrivées(+) /
      Départs(−) → Projeté (red when > quota); click a unit to expand **Restent / Arrivent (depuis X) / Partent
      (→ Y or quitte le groupe)** member lists. Group totals (now / next year / quittent) + a "N sans proposition,
      supposés rester" caveat. `effectiveDest(member, mode)` is the whole rule (Approved always applies; Pending
      only in simulation; None/Rejected stay).
- **Verified live:** CU (no passage.manage) → 403; super-admin → 17 units / 1080 members / 1072 assumed-stay; the
      real M2 lines (1 move → T10, 1 leaver) give M2 75→73, T10 80→81; a temp Pending move proved SIM counts it
      (M2 72 / T10 82) while RÉEL doesn't (M2 73 / T10 81), then reverted. Builds clean (dotnet 0/0, tsc+eslint+vite).
- **Passage page opened to the CG (2026-09-06, same session):** the whole passage flow had a redundant
      `IsSuperAdmin` handler gate on top of the `[HasPermission(PassageManage)]` controller attribute — so a real
      Chef de Groupe (passage.manage, not super-admin) got "Accès réservé aux super administrateurs" (400) on the
      page despite the frontend route + sidebar already being passage.manage-gated. The passage page is a **CG
      tool** (confirmed by the user), so all 7 handlers (GetAllPassages, GetPassageSummary, GetPassageProjection,
      ReviewPassage, BulkReviewPassage, FinalizePassages, TogglePassage) now gate on
      `IsSuperAdmin || Permissions.Contains(PassageManage)` (defense-in-depth behind the controller attribute; all
      passage.manage holders are group-level = all units, so the group-wide views are appropriate). Verified live:
      a real CG (thea-maria.tayar) gets 200 on list/summary/projection + passes review/finalize auth; a CU without
      passage.manage stays 403 at the controller.

### Passage page 500 — 29-Feb DOB crash (2026-09-19, DEV until deploy)
Prod report (a CU opening `/api/v1/passages/unit/{id}`): **`22008: date field value out of range: 2026-02-29`**.
Root cause: the passage age projection (`PassageHandlers.cs`, 2 queries) computed age with
`today < new DateOnly(today.Year, dob.Month, dob.Day)`, which EF translates to `make_date(2026, 2, 29)` — invalid
in a non-leap year, so the whole unit's passage list 500s if ANY member has a **29 Feb** DOB (dev has 2: the ABOU
RJEILY twins, born 2012-02-29; the prod unit had one). Fix: compare **month/day directly**
(`today.Month < dob.Month || (today.Month == dob.Month && today.Day < dob.Day)`) — no date construction, leap-safe
in both SQL and C#. Applied the same to `DemandeAdminHelpers.AgeAt` (a static in-memory helper that would throw
`ArgumentOutOfRangeException` on a 29-Feb DOB). `ReportDataCollector` + `DashboardHandlers` already compute age
in-memory via `DayOfYear` (no `make_date`, no crash) — left as-is. Verified on dev: old `make_date(2026,2,29)`
reproduces the error; the new expression returns the correct age (14) for the 2012-02-29 members. Also cleaned a
pre-existing CS8602 warning in `EntreeStageResolver` (`s.UnitType!.Code`, nullable after the global-progression
batch) to keep the build 0/0. DEV until deploy — **prod still 500s on that unit until the next deploy**.

### Passage — bulk change + reminders to unfinished units (2026-09-27, DEV until deploy)
- **"Changer la sélection"** (CG page): `BulkChangePassagesCommand` + `POST /passages/bulk-change` (passage.manage) gives
  every selected line the same decision (unit + optional équipe + fonction, or leaving) + optional reason — same rules
  as the single review (sets CgModified/Final*, team must belong to the unit), ONE audit row and ONE notification per
  current unit (to its members.edit leaders) listing the members. Dialog `components/passage/bulk-change-dialog.tsx`
  (active units grouped by branch in parcours order; fonction = member roles of the destination branch, default first).
- **Reminders** (`Application/Passages/PassageReminders.cs`): units with active members and no PassageUnitSubmission →
  notification (bell + push) + email `passage_unit_reminder` (seeded; vars leaderName/unitName/missing/passageDate/
  scoutYear/passageUrl) to every leader of the unit. Manual: `POST /passages/remind-units` ("Relancer les unités non
  terminées" on "Avancement par unité", shown while the passage is open). Automatic: `PassageReminderBackgroundService`
  (6 h, job "Rappels du passage aux unités") sends once at 7 and once at 2 days before `passage.date` while the passage
  is open; marker setting `passage.reminders_sent` = "<year>:7,2" (hidden in Settings). Start delay overridable via
  `Monitoring:PassageReminderInitialDelaySeconds` (tests).
- **Rentrée:** progress key `passage-finished` (per unit: PassageUnitSubmission exists, or no active members) + template
  task "Terminer le passage de l'unité" (per unit, CU, due passage.date, depends on "Proposer…", "Finaliser…" now waits
  for it) via `SeedData.SeedRentreePassageFinishTaskAsync` (idempotent). Existing years: "Ajouter les nouvelles tâches".
- Tested on a DB copy: 19/19 (auto run at the 7-day threshold only once, emails/notifications, CU 403, bulk change incl.
  leaving + wrong-team 400, one notification per unit, rentrée task turns done when the unit is finished).

### Scheduled sends verified + passage ordering fix (2026-10-08, DEV until deploy)
- Tested both scheduled actions end to end on a copy of the dev DB (second API on :5001): demandes « Envoyer les
  réponses » (refused + notified while demandes are undecided; then 161 members / 83 refusals / 244 family + 11 CU
  emails; a second run sends nothing) and « Publier le passage » (refused + notified while lines/units are missing;
  then published, maîtrise plan applied, 8 CU emails; scheduling again refused).
- **Fixed:** `PassageScope.NewcomerIds` = members created/re-placed by demandes of the passage's scout year. They are
  outside the passage (ActiveYouth + Lines): sending the demande responses BEFORE publishing used to add every
  newcomer to « sans ligne de passage » and block publishing (161 extra on dev). The projection now counts converted
  demandes as arrivals too (only when the child is outside the passage, so never twice).
- **Fixed:** FinalizePassages archives (soft-deletes) the year's lines it left out (chefs / newcomers at that moment).
  Before, a chef leaving with the maîtrise plan had their old youth line come back as « à finaliser » (dashboard +
  rentrée counts wrong) and a second « Publier » would apply it. Audit field LeftOutLines.

### Post notes: import markers cleared + editable again (2026-10-08, DEV until deploy)
- WEBDEV « Passage20 » / « Passage21 » markers were copied by the import onto every yearly split of a function
  (dev: 702 posts / ~300 members, e.g. Sami AOUN). Patch **042** clears exact matches (`^passage\s*NN$`, any case);
  the migration tool drops them on import. The 28 real notes are untouched.
- They couldn't be edited because the note field was removed from « Modifier le poste » (2026-06-26: posts don't
  take notes). The field is back ONLY when the post already has a note (correct / clear it; empty = removed); new
  posts still have none. UpdateAssignment Notes now NoHtml too.

### Maîtrise plan for next year — applied with the passage (2026-09-29, DEV until deploy)
- **`MaitrisePlanLine`** (table `maitrise_plan_lines`, migration `AddMaitrisePlan`, plain table, cancel = delete): per
  scout year (= `passage.scout_year`) planned leadership changes — `End` (AssignmentId to close) or `Start` (member +
  unit + IsMaitrise role); a change of unit/function = End + Start. CG-only (maitrise.manage), no CU proposing.
- **Applied by `FinalizePassagesCommand`** ("Publier le passage") in the same transaction via `MaitrisePlan.ApplyAsync`:
  ends on `passage.date`, starts on `passage.date` in the unit's IsMaitrise team, notes "Maîtrise {year}", AppliedAt set.
  Planning is refused once the year's passage is published.
- **Youth joining the maîtrise** (`YouthLine.HoldAsync`): their youth passage line is set to leaving (created if the CU
  had none; otherwise the CU's line is snapshotted in `YouthPassageSnapshot`), CgModified + CgNotes "Rejoint la
  maîtrise…". Cancelling restores it (or deletes a plan-created line). While held, Review / BulkChange / Delete of that
  passage line are refused (`MaitrisePlan.YouthLocked`).
- `Application/Maitrises/MaitrisePlanHandlers.cs`: GetMaitrisePlan, PlanMaitriseStart/End/Change,
  CancelMaitrisePlanLine, AddMaitriseNow (immediate; a youth's youth functions end today). Endpoints `GET
  /maitrises/plan`, `POST /maitrises/plan/start|end|change`, `DELETE /maitrises/plan/{id}`, `POST /maitrises/add-now`
  (existing remove/transfer = the "maintenant" path).
- Page `/maitrises` rebuilt like the passage overview: one row per active unit (CU next year, chefs now → next year
  +/−, alert when a unit has no head [role profile chef-unite/chef-de-groupe]); expanded = Restent / Arrivent / Partent
  with Changer, Ajouter un chef, ↺ cancel; dialogs choose "Au passage" or "Maintenant". Passage page step 3 mentions
  the planned maîtrise changes. Verified end-to-end on a DB copy (publish applied ends/starts/youth correctly).
- **Head swap + grouped undo** (`CausedByLineId`, migration `AddMaitrisePlanCausedBy`): a Start giving a head function
  (profile chef-unite/chef-de-groupe) auto-plans the End of the unit's current head(s) (`HeadSwap`), linked to it; a
  change's own End (old function) is linked to its Start too. Cancelling the Start — or the member's own End — cancels
  the whole group (old head reinstated, old function kept) — so does cancelling the replaced head's End (never two heads).
  `ApplyAsync` also calls `HeadReplacement` per started head (safety net). Re-verified on a DB copy: publish applied
  2 head swaps + a youth joining another unit + a stop, one head per unit afterwards, plan/undo refused once published.
  UI: a same-unit promotion shows once under Arrivent (« était … »), the replaced head under Partent (« remplacé(e) par … »).
- **One head per unit, everywhere** (`Common/HeadReplacement.EndOtherHeadsAsync`): giving an ACTIVE head function right
  away — CreateAssignment, UpdateAssignment (role/unit changed), Maîtrises transfer + add-now — ends the other members'
  head functions in that unit the day the new head starts (audited « Remplacé(e) comme chef d'unité »).
- **Pre-publish quick wins (2026-09-29):** FinalizePassages closes ALL of a passage member's active youth posts (was the
  first only — a duplicate open post stayed active next to the new one); Qualité des données gained a « Plusieurs
  postes actifs » section — every member with >1 active post, chefs included; per post an ✕ (ends it today via
  PUT /assignments/{id}/end) and « C'est voulu » (`DataQualityAck`, table `data_quality_acks`, migration
  `AddDataQualityAcks`; signature = sorted active assignment ids, so a confirmed case reappears when its posts change;
  POST/DELETE /data-quality/acks, maitrise.manage; « Confirmés comme voulus » sub-list with Annuler) (dev: 3). Full suite green: 150 unit tests, 60 API + 20 browser checks, bundle budget.

### Passage lines on the member file (2026-10-09, DEV until deploy)
- `GET /passages/member/{memberId}` (`GetMemberPassagesQuery`, Application/Passages/MemberPassageHistory.cs): every
  non-deleted passage line of the member, newest year first — current / proposed / final placement (unit, team,
  role, leaving), CU + CG notes, CgModified, status, proposed-by / reviewed-by names (+ date). Staff only:
  `HasMemberRead` + `CanViewMemberAsync` (chef of the member's unit, group manager, super-admin); the member
  themselves gets 403 (CG notes are internal). Card « Passages » (`components/members/member-passages.tsx`) at the
  TOP of the member file's Unités / Fonctions tab, showing only Pending/Approved lines (hidden once the passage is
  published, back during next year's passage); hook `useMemberPassages`
  (['passages','member',id]).

### Fix batch from the full-app review (2026-10-09, DEV until deploy)
Checked first on the dev copy that already holds this afternoon's real publish (1,008 lines): none of the bugs
below had hit it (`deploy/diagnostics/passage-publish-check.sql`, run it on prod too). Fixes for next year:
- **Propose / BulkPropose** refuse a line held by the maîtrise plan (`HoldsYouthLineAsync`), like Review/BulkChange.
- **Finalize**: lines of members with no active youth post are not published (archived); **gate 4** refuses lines
  whose member is no longer in the line's current unit (e.g. « Corriger l'unité » after the CU answered) and names
  them; a youth with an unapplied maîtrise Start never gets a youth post; team = CG decision when there is one (even
  "none") else the CU's, and only a team OF the final unit; posts never end before their start (and the new post
  starts when the old one ends). `MaitrisePlan.ApplyAsync` uses the same end-date guard.
- **Preview** (`GetFinalizePreviewQuery`) shows the same cases before the click (blocker: changed unit; warnings:
  no post, other-unit team, youth joining the maîtrise whose line isn't "leaving").
- **ScheduledRun**: `IApplicationDbContext.ClearChangeTracker()` after the action, so a FAILED scheduled send /
  publish can't have its rolled-back edits saved by the status write; the status write is guarded and the managers
  are always notified.

