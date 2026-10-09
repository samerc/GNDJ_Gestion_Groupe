# Demandes d'inscription (enrolment)

Applicant portal, CG review, decisions, Excel, sending responses, conversion to members, « Déjà membre ? ».

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

### Demande d'inscription — public enrollment portal (Complete — 2026-06)
- [x] Public landing page at `/` (two options: Espace membres/chefs → /login, Demande d'inscription → /inscription).
      Dashboard moved to `/dashboard`. Placeholder for a future full group site (news/units/resources).
- [x] Isolated `ApplicantAccount` auth (own JWT with `applicant` claim, never touches User/Member/permissions).
      Register → email-verify → login → refresh; public `/auth/register` left as-is but applicants never use it.
- [x] Applicant portal `/inscription/*`: landing, register, login, verify, portail (list demandes), 4-step wizard
      (Enfant → Parents+adresse [shared] → Proches scouts [shared] → Récap) with free nav + on-spot & on-Next validation.
- [x] Entities: ApplicantAccount, ApplicantGuardian (père/mère shared), ApplicantScoutRelation, Demande, UnitIntakeQuota.
      FunctionalRole.Rank (lowest = base youth role), UnitType.Gender, Passage.IsLeaving.
- [x] Passage "Quitte le groupe": finalize closes the assignment, creates none (member → alumni); always needs CG review.
- [x] CG review `/admin/demandes`: filters (gender/classe/age/status/unit), per-unit capacity (current · projected-after-
      passage · editable quota · accepted), approve(unit picker)/decline(reason), sibling flags. Decisions hidden from
      applicant until posted. Batch "Envoyer les réponses" — BLOCKED while any submitted demande is undecided.
- [x] Review UI reworked (2026-06-15) Excel-style: sortable TABLE (nom/âge/genre/classe/école/fratrie/statut/unité)
      with row quick approve/decline, + click a row → right-side **detail drawer** (Sheet) showing the full file in
      friendly sections (Enfant, École, Coordonnées+adresse foyer, Parents/Tuteurs w/ contacts+flags, Proches scouts,
      Médical, Note des parents, Fratrie) with inline accept(unit picker+note)/refuse(motif) + précédent/suivant nav.
      Review DTO gained the household address (AddressCountry/City/Details from the applicant account).
      Table compaction: genre M/F, unité by shortcode, école by shortcode (new `member.school_codes` json setting
      mapping full name→code, accent/case-insensitive resolver `useSchoolCode`, acronym fallback), a Relations column
      (count + hover list of proches scouts), and statut shown as a colored left border + legend (no column).
- [x] Review power tools (2026-06-15): name search box; row checkboxes + bulk bar (accept→chosen unit / accept→
      suggested unit / refuse with motif) backed by new `POST /demandes/bulk-decide` (BulkDecideDemandeCommand,
      per-item unit, skips already-sent); per-row **suggested unit** (eligible+not-full, balanced by fewest accepted)
      shown as a one-click chip + pre-selected in the drawer; **sibling grouping** (same-account rows kept adjacent +
      amber tint) gated by demande.decide_siblings_together; inline **quota ⚠** on decided/suggested unit at capacity;
      **incomplete-dossier ⚠** (missing DOB / parent / parent phone); drawer **keyboard triage** (A accept, R refuse, ←/→ nav).
- [x] Send = advisory-locked + idempotent: converts approved → Member (card#, login, deduped father+mother guardians,
      assignment w/ base role, household address), marks sent. Emails queued (IEmailQueue + background worker) so the
      request returns fast; login password hashes pre-computed in parallel before the lock. 100-batch ≈ 8.7s.
- [x] Emails (templates seeded, editable in admin with placeholder dropdown): demande_email_verification / _approved
      (username+temp password+unit) / _declined (reason). Verification resend endpoint + portal button.
- [x] Permissions demande.view/manage (super-admin + association-admin via Permissions.All). CG sidebar badge = pending count.
- [x] Maîtrise/leader displays (CU dashboard, trombinoscope, roster) ordered by role Rank desc (CU → Aumônier → ACU).
- [x] **Per-year start dates (2026-06-22):** two new `date`-typed settings — `passage.date` ("Date du passage")
      drives FinalizePassages (old assignment EndDate + new assignment StartDate) and `demande.member_start_date`
      ("Date de début des nouveaux membres") drives the SendDemandeResponses assignment StartDate. Both empty by
      default = use today; set each year. UpdateSetting validates `date` type (empty or yyyy-MM-dd); settings UI
      renders a date picker (+ Effacer). Verified: a converted member's assignment start_date honoured the setting.
- [x] Settings `demande.*` (enabled, scout_year, max_per_account [default 3], max_scout_relations [default 3],
      member_start_date, notes_max_length, require_email_verification, decide_siblings_together, intro_text). Server-side validation
      on all applicant input (HTML/XSS reject, lengths, email, DOB). max_per_account enforced in CreateDemande;
      max_scout_relations enforced in SaveApplicantHousehold (hard safety cap 50 in the validator).
- [x] Audited: IDOR (cross-account blocked), auth isolation both ways, 100-concurrent register/login/profile, CG authz.
- [x] **Applicant wizard UX pass (2026-06-17):** FIXED a no-feedback bug — the applicant portal layouts
      (ApplicantProtectedRoute + ApplicantAuthShell) never mounted a Sonner `<Toaster>`, so EVERY toast in the
      portal (submit success/error, validation) fired into the void → "Soumettre" looked like it did nothing
      (it was actually 400 "vérifiez votre email"). Toaster now mounted in both. Wizard fields aligned with the
      member forms: family name (Nom) auto-UPPERCASED on child/guardian/relation; DOB via new `DateInput`
      (displays JJ/MM/AAAA, stores ISO); Nationalité → SearchableSelect (NATIONALITY_OPTIONS, Libanaise pinned);
      Classe → Select from `member.classes`; guardian Profession → SearchableSelect (PROFESSION_OPTIONS).
      Proches scouts: "Scout actuel" now picks the **Unité** from a dropdown (eases CG matching), status dropdown
      enlarged, max-relations shown + Add disabled at cap. Récap "notre groupe" → "Membre GNDJ" (+ unit).
      ApplicantConfigDto gained `Classes`, `Units` (active units, public), `MaxScoutRelations` (configurable via
      `demande.max_scout_relations`, default 3). New settings: `demande.max_scout_relations` (default 3) and
      `demande.max_per_account` default lowered 5→3. require_email_verification set false in dev for testing.
      **DEFERRED:** block creating/submitting a demande while email unverified (kept lenient on purpose during testing).
- [x] **Demande statistics dashboard (CG, 2026-06-19):** new page `/admin/demande-stats` (sidebar "Statistiques
      demandes", Gestion group, perm demande.view) + `GET /demandes/statistics?scoutYear=` (GetDemandeStatisticsQuery).
      Shows: status pipeline (total/à traiter/acceptées/refusées/réponses envoyées + décidées progress + taux
      d'acceptation + brouillons), per-unit capacity table (reuses GetUnitOccupancy, read-only — quotas still edited
      on the review page), demographics bar-lists (genre / tranche d'âge / classe / école via useSchoolCode), and
      familles & qualité (fratries groups+demandes, avec proches scouts, dossiers incomplets = missing DOB/parent/phone).
      Grouping is **accent- & case-insensitive** (CountBy normalizes via RemoveDiacritics+lowercase, displays the
      richest spelling) so legacy variants like "Féminin"/"Feminin" and "Collège"/"College" collapse into one bucket.
- [x] **List-only fields + école auto-match (2026-06-19):** genre/classe/nationalité/profession are already
      select-only everywhere (no free text). École keeps its "Autre…" escape hatch (schools are open-ended) but a
      new `matchSchool(typed, schools)` helper (settings-service, accent/case-insensitive) snaps a typed name onto
      the canonical list entry on blur — applied in member create/detail forms + the demande wizard — so near-
      duplicate spellings collapse at entry while genuinely new schools still pass through.
- [ ] Phase 5 remainder (later): expand the landing into the full group site. API-docs polish pass (Swagger auto-includes new endpoints).

### Demande → member transition + T&C + campaign lifecycle (2026-07-08)
Reworked the enrollment→member flow end-to-end (all on main, pushed; dev-only until next deploy).
- **T&C moved OFF registration → a separate post-login accept screen** (`/inscription/conditions` +
  `ApplicantTermsGate` on the portal routes). `AcceptTermsCommand` + `POST /applicant/accept-terms`;
  `ApplicantProfile.TermsAccepted` gates the portal. **Refuse** = sign out (account kept, can accept later).
- **Conversion (SendDemandeResponses) improvements:** copies medical/allergies (already did) — NOT parentNotes
  (per user); sets `Member.PrimaryContactEmail` from a new household picker; **links siblings already in the
  group** — a proche auto-matched to an existing member + a brother/sister relation shares the household's
  guardians with that member (the app detects siblings via shared guardians). Team stays null (CU assigns).
- **Wizard:** household **primary-contact email** picker (`ApplicantAccount.PrimaryContactEmail`); **"demande
  précédente ?"** checkbox + year (`Demande.HasPreviousDemande`/`PreviousDemandeYear`, shown to the CG in the
  review drawer). Migrations `AddDemandePrimaryContactAndPreviousInfo`.
- **"Clôturer la campagne"** (CG button on Validation, shown once every demande is decided+sent): archives every
  demande+outcome into a new **`demande_archives`** table (lean denormalized snapshot; migration
  `AddDemandeArchive`), then **HARD-deletes ALL applicant data** (accounts/guardians/relations/demandes via
  ExecuteDelete) and sets `demande.enabled=false`. Converted members untouched. Advisory-locked (shared w/
  Send), transactional, blocked while any submitted demande has no response, destructive confirm.
- **Individual re-decision after the batch:** DecideDemande now clears `ResponseSentAt` on a sent-but-UNCONVERTED
  demande (a refused applicant the CG reconsiders) so it re-enters the send queue → next "Envoyer les réponses"
  processes just it. A converted demande stays locked (400). Review row/drawer lock keyed on `createdMemberId`.
- **"Retrouver mes informations" (prefill A2):** wizard (Parents step) — enter a known email → a one-time 6-digit
  code is emailed → verify → the family's **parents + address prefill** and the family's **members are added as
  proches** (relationship inferred from gender). Code proves email ownership before revealing anything (no member
  search, no enumeration; only sends when the email is a member's guardian; 15-min, SHA-256, forms-rate-limited).
  `ApplicantAccount.HouseholdLookup*` (migration `AddApplicantHouseholdLookup`); Request/VerifyHouseholdLookup +
  endpoints; seeded `household_lookup_code` template. **Entry B (from a member's profile) deferred.**

### Login pages differentiated — member vs demande (2026-07-09)
The two separate login screens (member `/login` "Espace membres" + applicant `/inscription/login` "Demande
d'inscription") were near-identical (same navy Compass branding) → parents confused them. Now visually
**distinct by audience + colour + icon**, with mutual cross-links:
- **Applicant space** (`ApplicantAuthShell`, shared by register/login/verify): switched to the **accent/teal**
  theme + **UserPlus** icon + title **"Demande d'inscription"** + a "Nouveau membre" pill; a persistent
  bottom cross-link "Vous êtes déjà membre ou chef ? Espace membres →" (to `/login`) on every applicant auth page.
- **Member `/login`**: kept navy/Compass, added a "Membres & chefs" pill + sharpened copy ("Réservé aux membres
  et chefs déjà inscrits"); the enrollment CTA (shown only while `demande.enabled`) reworded to an **accent-tinted**
  box "Vous souhaitez inscrire un enfant ? Demande d'inscription →" (echoes the teal demande theme).
- Removed the old tiny duplicate "Espace membres" link from the applicant login (now centralized in the shell).
  Frontend-only; build + eslint clean. DEV until deploy.
- **FIXED a "login error flashes then disappears" bug (both logins):** both login endpoints return **401** on
  bad credentials, and the axios 401 interceptors treated ANY 401 as an expired session → `window.location.href`
  hard-redirect to the login page → full reload wiped the inline error before it could be read. Both clients
  (`api-client` + `applicant-api-client`) now **skip the refresh/redirect for the auth endpoints themselves**
  (`/(applicant/)?(login|register|refresh)`) and just reject, so the page shows its inline error. Expired-session
  redirects on real authenticated calls are unchanged.
- **Login copy tweaks (2026-07-10):** dropped "chefs" everywhere on the member login (chefs are members) — pill
  "Membres", subtitle "Réservé aux membres déjà inscrits" (removed "— GNDJ Scout"); username field placeholder
  `prenom.nom@scouts.gndj`; the enrollment cross-link box restructured (icon chip + stacked question/CTA) so it no
  longer wraps mid-phrase, still shown only while `demande.enabled`. Copyright standardized site-wide to
  "© {year} Groupe Notre Dame - Jamhour — Tous droits réservés" (login + public footer). Applicant shell
  cross-link → "Vous êtes déjà membre ?".

### "Retrouver mes informations" now matches a member's own email too (2026-07-09)
The demande prefill ("Retrouver mes informations") emailed a code + resolved the household ONLY when the entered
email was a member's **guardian** email. Now it also matches a **member's OWN email** (member_emails) — so an
older youth, or a parent who is themselves a member, can retrieve their household with their own address. New
shared `HouseholdLookup.SeedMemberIdsAsync(email)` = members via a matching guardian email ∪ members whose own
email matches (non-deleted); used by BOTH `RequestHouseholdLookupCommand` (send a code if ANY member matches) and
`VerifyHouseholdLookupCommand` (expand seed members → their guardians → siblings → full household + address).
Behaviour for guardian-email matches is unchanged; privacy unchanged (still code-gated, generic success, no
enumeration). Wizard wording updated ("Vous ou un enfant êtes déjà au groupe ?" · "Votre email ou celui d'un
parent"). Verified live: samer@fancyshark.com (a member's own email) → code sent → verify returned Samer CHEAIB's
parents + Kahale address + himself. Build/tsc/eslint clean. DEV until deploy.
- **Dedupe duplicate guardians in the prefill (2026-07-09):** the household result could list the SAME parent twice
  (duplicate guardian records from the import) → wizard pre-filled the parent twice. Verify now collapses guardians
  by **accent/case-insensitive full name** (`TextNormalization.NormalizeKey`), keeping the **richest** record
  (has email, then phone, then profession). Verified: Samer's household went 4 → 2 guardians (kept the one with
  email+phone). Data-quality fix in the projection only (underlying dup guardian rows untouched).

### Demande: two-phase period — submission window inside the open portal (2026-07-09)
There was only ONE flag (`demande.enabled`) gating everything. Added an INNER window `demande.submissions_open`
(default true, seeded + SeedMissingSettings) that lives inside the open portal:
- **Submissions open** (`enabled=true, submissions_open=true`): parents register / create / edit / submit / delete.
- **Review phase** (`enabled=true, submissions_open=false`): the portal stays open for **viewing status only** —
  create/edit/submit/delete + **register** are all blocked (CG is reviewing).
- **Closed**: unchanged (`demande.enabled=false` / "Clôturer la campagne" archive+wipe).
- Backend: `ApplicantConfigDto.SubmissionsOpen`; shared `ApplicantHelpers.SubmissionsClosedError(config)` gates
  Register/Create/Update/Submit/SaveHousehold/Delete (returns "La période de soumission … est terminée. Vous pouvez
  consulter vos demandes…"). New CG `SetDemandeSubmissionsCommand(open)` + `GetDemandeCampaignStatusQuery`
  (`POST /demandes/submissions`, `GET /demandes/campaign-status`, both demande.manage/view), audited (Open/CloseSubmissions).
- Frontend: `ApplicantConfig.submissionsOpen`; portail gates Add/edit/delete on it + a blue "période de soumission
  terminée / en cours d'étude" banner; wizard is read-only in the review phase; register route guarded
  (`ApplicantOpenRoute submissionsRequired`). CG review page: a **Clôturer / Rouvrir les soumissions** toggle (with
  confirm) + a status pill ("Soumissions ouvertes" / "Phase de revue"). Settings page: both switches
  (`demande.enabled` + `demande.submissions_open`) are **pinned to the top** of the "Inscriptions" tab
  (`PINNED_TOP`); the submissions switch is **disabled + shown off** while the portal is closed
  (`demande.enabled=false`) with a hint "Ouvrez d'abord les inscriptions" (SettingEditor gained `disabled`/`disabledHint`).
- Verified live end-to-end: config flips, create/submit/register blocked (400 with the review message) when closed,
  reopen restores. Build + tsc + eslint clean. DEV until deploy.

### Applicant/demande live audit + terms gate (2026-08-14)
Walked the full parent enrollment flow against the live API (register → login → accept-terms → create → household
→ submit) + validation, caps, gating, isolation, data-minimization, household-lookup, email-verification. Verdict:
the portal is solid — clean 400s everywhere (weak password / honeypot / future DOB / XSS / bad gender), **zero
unhandled 500s**; create is a lenient save-as-you-go DRAFT while **submit is the real gate** (rejects 6ème + missing
required fields); caps enforced (max_per_account=3, max_scout_relations=3); auth isolation holds both ways
(applicant token → /members 403, → /auth/me 401; member token → /applicant 401); **data-minimization holds** (a
staged CG "Approved" stays hidden — applicant still sees Submitted/None until the batch is sent); household-lookup
is code-gated with no enumeration (known vs unknown = identical generic 200); with `require_email_verification` on,
submit is blocked until verified and the **CG manual verify-email unblocks it**.
- [x] **FIXED — terms of service now enforced server-side on submit.** The frontend `ApplicantTermsGate` blocked
      the portal UI until accepted, but the API's CreateDemande/SubmitDemande didn't check `TermsAcceptedAt` — a
      direct/crafted call could submit without accepting (and `RegisterApplicantCommand.AcceptedTerms` is a DEAD
      field: register with acceptedTerms=false still creates the account, terms is set only via the post-login
      accept-terms endpoint). Added a defense-in-depth gate in `SubmitDemandeCommandHandler`: `TermsAcceptedAt is
      null` → 400 "Veuillez accepter les conditions d'inscription avant de soumettre une demande." Verified live:
      submit-before-accept → 400, accept → 200, submit → 200. (The dead `AcceptedTerms` register field left as-is —
      harmless, ignored.) Backend-only, DEV until deploy.

### Demande result page + set-password link (2026-08-16)
When a parent opens a demande whose response has been SENT, the portal now shows a proper **result page**
(`/inscription/portail/demande/:id/resultat`, `demande-result.tsx`) instead of the read-only "déjà traitée"
wizard. Accepted → congratulations + admitted unit + the **onboarding steps** (activate login → set password →
sign in → upload documents) + the member's **username** + a **"Renvoyer l'email d'activation"** button + a link
to the member login; once that member has **already logged in** (`memberHasLoggedIn`), the demande no longer
opens — the portail button goes straight to `/login`. Declined → the decision + reason. A demande NOT yet
converted (declined/submitted/draft) stays viewable; the wizard redirects any sent demande to the result page.
- [x] **Conversion emails a SET-PASSWORD link, not a temp password.** `SendDemandeResponses` now stamps a 30-day
      activation token on the created User (reuses the reset-token fields, redeemed at `/reset-password?...&setup=1`)
      and `MustChangePassword` stays **false** (they set their own). The random login password is never shared. The
      `demande_approved` template + variables switched from `{{tempPassword}}` → `{{activationLink}}` + steps (seed
      for fresh DBs + **data patch `005_demande_approved_activation_link.sql`** for existing DBs, guarded on the old
      `{{tempPassword}}` so a CG-edited template is untouched; applied to the dev DB).
- [x] **Applicant DTO result fields** (`converted` / `decidedUnitName` / `memberUsername` / `memberHasLoggedIn`),
      populated ONLY once the response is sent (never leaks a staged decision), enriched in `GetApplicantProfile`
      (batched: unit name + created member's username + last-login). New resend endpoint
      **`POST /applicant/demandes/{id}/resend-activation`** (own-account, `forms` rate-limited) re-stamps a fresh
      token + queues `account_activation` to the member's contact email (household primary → account fallback).
- Verified live end-to-end (isolated year 9999, throwaway account, cleaned up — Lyanna's real 2026-2027 demande
      untouched): convert → activation token + 30-day expiry + `must_change=false` + `demande_approved` queued with
      the setup=1 link and NO tempPassword; profile returns the enriched fields; resend queues `account_activation`;
      the logged-in flag flips true. Build + tsc + eslint clean. See [[project-email-golive]]. DEV until deploy.

### Demande process fine-tuning — batch A–E (2026-08-16)
A CG‑driven review of the whole enrollment process (recap in memory [[project-demande-inscription]]) produced a
prioritized list A–I; this is the first batch (small settings). All DEV until deploy; new settings auto‑seed via
SeedMissingSettings on prod startup; verified live end‑to‑end against smtp4dev.
- [x] **A — Submission window DATES.** `demande.submission_start` / `demande.submission_deadline` (date settings).
      The portal **opens on the start date** and **submissions close after the deadline**, computed live in
      `BuildConfig` (no scheduler — `IsOpen = enabled && !beforeStart`, `SubmissionsOpen = manual && !afterDeadline`).
      Both empty = the manual "Inscriptions/Soumissions ouvertes" switches govern alone. Dates exposed to the portal;
      the `/inscription` landing shows "ouvrira le …" (before start) / "Date limite : …" (when open).
- [x] **B — Submission‑received email.** `SubmitDemande` queues a configurable **`demande_submitted`** template to
      the account holder, only on the first Draft→Submitted (guarded against re‑submit).
- [x] **C — Configurable activation window** (`member.activation_link_days`, default 30). Replaces the hardcoded 30
      in `SendDemandeResponses` + `ResendMemberActivation` + `SendAccessHandlers`; the acceptance/activation emails
      carry `{{expiryDays}}` (seed + data patch **006** upgrade the existing `demande_approved` body).
- [x] **D — Editable result‑page copy.** `demande.result_text_accepted` / `_declined` settings drive the wording on
      the applicant result page; the functional bits (username, buttons, unit, decline reason) stay in place.
- [x] **E — Draft expiry.** A draft left unsubmitted past the deadline is shown to the parent as **"Expirée"**
      (display‑only — `ApplicantHelpers.ToDto(d, deadlinePassed)` maps it; the DB row stays `Draft`; it's purged at
      campaign archive). New display‑only `DemandeStatus.Expired`.
- **Still to build (agreed order): F** email attachments per template (+ rentrée tasks: refresh attachments, draft
      refusal letter) — attachments apply to ALL templates; **G** reminders (manual buttons + checklist tasks:
      relancer non‑soumis / accès non activés) — decided MANUAL, not a scheduler; **H** archive search UI (verify a
      claimed prior submission); **I** Excel export+import of CG decisions (names only, answer columns — Maîtrises
      work in Excel; design details deferred). Note #6 (late approvals) already works via re‑running "Envoyer les
      réponses" (idempotent). See [[project-demande-inscription]].

### Demande process fine-tuning — batch F–I (2026-08-17)
The remaining backlog from the CG process review (A–E shipped 2026-08-16). All DEV until deploy; migration +
new templates/settings auto-apply on prod startup; verified live end-to-end vs smtp4dev.
- [x] **F — Email attachments (ALL templates).** `EmailTemplate.AttachmentsJson` (`[{name,url}]`, migration
      `AddEmailTemplateAttachments`); files uploaded via the existing `/content/files` endpoint and attached to
      every email from that template. `EmailService` parses the JSON into the cached `ResolvedTemplate` and adds
      each file (resolves `/api/v1/content/files/{f}` → `uploads/content/{f}`, path-traversal guarded, missing file
      skipped). Editor UI (upload / list / remove) in email-settings. Use case: an official rejection letter PDF on
      `demande_declined`. Rentrée tasks remind the CG to refresh attachments yearly + draft the refusal letter.
- [x] **G — Submission reminders (manual, NO scheduler).** `GET /demandes/unsubmitted-count` +
      `POST /demandes/send-submission-reminders` (demande.manage) email the seeded `demande_submission_reminder`
      ("soumettez avant {deadline}") to every applicant account with **no submitted demande** this year. Button on
      the review page ("Relancer les non-soumis (N)"). Reminder B (accepted members who never activated) is the
      existing "Envoyer les accès → jamais connectés" tool. Rentrée checklist tasks added for both.
- [x] **H — Archive search UI.** `GET /demandes/archives` (accent/case-insensitive name search via `DbFns.Unaccent`,
      scout-year filter, paged) over `demande_archives` + page **`/admin/demande-archives`** ("Archives des demandes",
      sidebar Suivi & demandes, demande.view). Purpose: verify a family's claimed prior submission.
- [x] **I — Excel decisions round-trip (Maîtrises work in Excel).** `GET /demandes/export-decisions` → `.xlsx`
      (one row per submitted demande, **names only** — no contact details; a Décision dropdown [Accepté/Refusé] +
      Unité + Motif columns to fill; a "Unités" reference sheet; the Réf. = demande id is the matching key) and
      `POST /demandes/import-decisions` (multipart) → **stages** the approve/decline choices (same as the web
      review; nothing sent until "Envoyer les réponses"; re-import allowed). Per-row validation with an error
      report (unknown unit / bad decision → clean error, no partial apply); unit matched accent/case-insensitively.
      `IDemandeSheetService`/`DemandeSheetService` (ClosedXML). Export/Import buttons on the review page toolbar.
- **Note #6 (late approvals) already works:** re-running "Envoyer les réponses" is idempotent and converts only
      the newly-approved demandes (a demande re-decided after a batch send has its ResponseSentAt cleared). No build.
- New rentrée goto-actions: `goto-email` / `goto-send-access` / `goto-demande-archives`; `SeedRentreeExtraTasksAsync`
      backfills the 4 new checklist tasks (idempotent per title). See [[project-demande-inscription]].

### Excel decisions — one Décision column (code) + rejection-reasons list (2026-08-17)
Reworked batch-I's Excel round-trip from THREE columns (Décision Accepté/Refusé · Unité · Motif) to a SINGLE
**Décision** column holding a CODE, plus a managed **Motifs de refus** (rejection reasons) list reused by Excel
AND the web decline. All on main, pushed; DEV until deploy. Verified live end-to-end.
- **Rejection reasons = managed list** (JSON setting `demande.rejection_reasons`, `value_type "json"`, CG-editable
      via `demande.manage`). Each reason = `{code, label, text, isDefault}`; exactly one may be default. The picked
      reason's **text** is stored as the demande's `DecisionNotes` and emailed as `{{reason}}` by the single
      `demande_declined` template — so the WHOLE decline email pipeline is unchanged; we only add a code→text lookup.
      `DemandeRejectionReasons` helper (Parse/Serialize/Resolve/TextOf); `Resolve` maps "--"/"-" → the default reason,
      else an accent/case-insensitive code match. `GetDemandeRejectionReasonsQuery` (demande.view) +
      `UpdateDemandeRejectionReasonsCommand` (demande.manage, replace-whole-list, validates unique codes / ≤1 default
      / "--" reserved). Endpoints `GET|PUT /demandes/rejection-reasons`. Seeded one default ("Manque de place").
      NOTE: `value_type "json"` + added to Settings `HIDDEN_KEYS` on purpose — as a `json_array` the generic Settings
      string-list editor would FLATTEN the objects (saw it collapse to `["6"]`); the list has its own page instead.
- **New CG page `/admin/rejection-reasons`** ("Motifs de refus", sidebar Suivi & demandes, gated demande.manage):
      add/edit/delete reasons, code + libellé + texte, ★ default toggle, save-whole-list. `useRejectionReasons` /
      `useUpdateRejectionReasons`.
- **Excel (DemandeSheetService):** the "Demandes" sheet now has ONE `Décision (code unité ou motif)` column; a
      "Codes" reference sheet lists every valid code (unit code → "Accepter → <unit>", "--" → default reason, each
      reason code → "Refuser → <label>") and drives an in-cell dropdown. Prefill: staged-approved → the unit CODE;
      staged-declined → the reason code whose text matches (else "--"). `Export(rows, units:(code,name),
      reasons:(code,label), defaultReasonLabel)`; `DemandeDecisionRow` collapsed to a single `Decision` cell.
- **Import (ImportDemandeDecisions):** a non-blank cell resolves as **(1)** a unit code (then unit name) → ACCEPT
      into that unit, **(2)** else a reason code / "--" → DECLINE with that reason's text, **(3)** else a per-row
      error ("code inconnu"). **Blank = skip** (leave undecided). Unknown-unit/reason and "--"-with-no-default report
      clean row errors; no partial apply beyond the valid rows (same staging model — nothing sent until "Envoyer les
      réponses"). Verified: M2→Approved, 6→Declined+text, --→Declined+default, ZZZ→error, blank→skipped.
- **Web decline gets the same reasons:** a shared `ReasonPicker` (Select of reasons; picking one fills the free-text
      motif, still editable) added to the decline dialog, the bulk-decline bar, and the drawer decline. DecideDemande/
      BulkDecide unchanged (still take the resolved DecisionNotes text). Export button gained a tooltip explaining the
      single-code column. See [[project-demande-inscription]].

### Demande suggester — no suggestion without a real age match (2026-08-18)
A 26-year-old (bad data) was suggested unit "F" because that unit had **no age bounds set**, so it matched every
age and won the tie-break. `suggestUnit` now returns null when the child's **age is unknown**, and only considers
units that have a **real age range** (ageMin or ageMax set) — a fully-unbounded unit is treated as mis-configured
for auto-suggest (the manual picker is unchanged). Root data issue (unit age unset) fixed separately.

### Comptes d'inscription — jump-to-demandes + password reset (2026-08-18)
Two additions to the CG "Comptes d'inscription" page (`/admin/demande-accounts`), all on main; DEV until deploy.
- **Click a row (or the "Demandes" button) → that account's demande(s).** `GetDemandesForReviewQuery` gained a
      `Guid? AccountId` filter (+ `?accountId=` on `GET /demandes`); the accounts page navigates to
      `/admin/demandes?account=<id>` (only when demandeCount>0), and the review page reads `?account=` via
      `useSearchParams`, folds it into `filters`, and shows a clearable "Demandes d'un seul compte — <contact>"
      banner (X → removes the param). ScoutYear still applies, so it shows that account's demandes for the current
      campaign.
- **Reset the parent's portal password.** New `ResetApplicantPasswordCommand` (IsGroupManager gate) → sets a fresh
      `Scout{year}!{nnn}` temp password (async bcrypt), invalidates the refresh + reset tokens, audited
      `ResetApplicantPassword`; `POST /demandes/accounts/{id}/reset-password` (demande.manage) returns
      `{email, temporaryPassword}` once. The page has a "Mot de passe" button → confirm → one-time credentials
      dialog (email + temp password, copy buttons) for the CG to relay. No forced-change flow for applicants (they
      can change it later via "mot de passe oublié"). Verified live: filter returns only that account's 4 submitted
      demandes (6 total for the year); reset → temp password → applicant login with it → 200.

### Demande delete (2026-08-27)
There was NO way to delete a demande (junk/spam/duplicate) — the CG/admin could only accept/refuse, and the
review page's "Effacer" button (Trash2 icon) only CLEARED the checkbox selection (looked like delete, did
nothing to the data). Added a real delete: `DeleteDemandeCommand` + `DELETE /demandes/{id}` (demande.manage,
super-admin included) soft-deletes a demande, **blocked once a member was created** (converted demandes keep
their link/history — refuse/re-decide those instead), audited `Delete`. Frontend (demande-validation.tsx): a
per-row **Supprimer** (Trash2) action, one in the detail drawer footer, and a **bulk Supprimer** on the
selection bar (skips converted, Promise.allSettled + summary toast) — all behind a confirm. Renamed the
misleading "Effacer" → **"Désélectionner"** (X icon). Verified live: normal → 204 soft-delete; converted → 400
blocked. Backend + frontend, DEV until deploy.

### Pre-launch enrollment shakedown — dry-run + parent-mistake hardening (2026-08-28)
Ahead of Monday's enrollment surge, ran a LIVE end-to-end dry-run of the parent flow against the running API
(throwaway accounts, cleaned up) + 3 parallel focused reviews of the enrollment hot path (concurrency, edge
cases, error-UX), then hardened against **realistic parent data-entry mistakes** ("parents will mess up on every
step"). All on main, DEV until deploy; verified live.
- **Dry-run verdict: the flow is solid.** register → verify-email → accept-terms → household → create → submit
      lands `Submitted` for the CG; email verification works; and every gate returns a clean, friendly French 400
      (terms, ≥1 parent, parents' situation, 6ème excluded, missing required fields, cap of 3, future DOB, XSS via
      AbuseDetection, invalid gender). No 500s, no dead-ends. The WEB forms already validate email format + required
      fields inline at every step (register regex, wizard `emailRe` child+guardian, `validateStep` phone/situation/
      DOB-future) — the gaps below were reachable via **direct API** (and one absurd-DOB via the manual date input).
- **FIXED — email without a TLD accepted** (the #1 real-world trap): `.NET .EmailAddress()` and browser
      `type=email` BOTH accept a bare `marie@gmail` (no `.com`). In an email-driven flow that address then bounces
      EVERY mail (verification/activation/decision) silently → the parent is stuck. New shared
      `ValidationExtensions.RealEmail()` (requires a dotted domain, empty passes) applied to the four STORING email
      fields: applicant **register** email, **child** demande email, **guardian** email, **primary-contact** email.
      (Login/reset email untouched — a no-TLD typo there just fails to match, harmless.)
- **FIXED — absurd DOB accepted** (e.g. `1816` → "age 210" from a year typo in the manual JJ/MM/AAAA wizard input):
      added a sanity floor to `DemandeInputValidator` — DOB must be ≥ today − 30 years (generous; oldest realistic new
      scout ~21, so it only catches gross typos, never a legitimate youth). Mirrored client-side in the wizard's
      `validateStep(0)` for instant feedback.
- **FIXED — 429 showed a cryptic "unexpected error"** (`parseApiError`): the `forms`/`auth` limiters reject with an
      EMPTY body, and during the surge many families share one egress IP (school/CGNAT), so a legitimate parent
      registering/resending can trip it. Now shows "Trop de tentatives en peu de temps. Veuillez patienter une minute
      puis réessayer." (added a 429 branch before the generic fallbacks).
- **FIXED — concurrent double-save → opaque 500** (`ExceptionHandlingMiddleware`): a `DbUpdateConcurrencyException`
      (household saved twice via double-tap "Suivant" / two tabs) has no PostgresException inner, so it fell through
      to the generic 500. Now caught BEFORE the `DbUpdateException` branch (it's a subclass) → 409 "Cette information
      vient d'être modifiée. Veuillez réessayer."
- **FLAGGED (not fixed — conversion-time, not Monday-surge; CG-reviewed):** the reviews surfaced pre-existing
      convert-time behaviours the CG can catch in review — (a) **sibling auto-link by name only**: a unique-homonym
      stranger (same normalized first+last name, no/unmatched unit) gets `RelatedMemberId` set and on send inherits
      the applicant household's guardians (cross-family PII merge) — the unit only narrows when >1 match; (b)
      **guardian dedup by shared phone/email** collapses two different parents sharing one contact into one Guardian;
      (c) **excluded-classe / gender / DOB** are enforced at submit but NOT re-checked at convert (a demande approved
      via Excel-import or a mid-campaign setting change can convert an excluded-grade/wrong-gender child); (d)
      **per-account cap** is check-then-insert with no DB unique backstop (self-spam only, no crash). All are
      conversion-phase (weeks after Monday) and visible to the CG in the review drawer — deferred, not rushed the
      weekend before launch. See the enrollment review notes.
- **Member (youth) flow shaken down the same way** (live, against the running API, as a real pure-youth login —
      Sydney CHEHAB; a mis-picked first subject, Clara ABBOUD, turned out to be an ACU leader, which explained an
      apparent "youth lists 160 members" that was actually legitimate unit-scoped access). Verdict: **solid.**
      Login errors (wrong pw / unknown email → generic 401), self-edit (blank required / >5 section / <script> /
      >2000 medical → clean 400; **locked identity fields — name/DOB/gender/matricule — are absent from
      `UpdateMyProfileCommand`, so an injected `firstName/dateOfBirth/gender/cardNumber` is silently ignored**,
      verified unchanged), contact IDOR (delete a non-owned phone → "introuvable"), and the full **document upload**
      battery (bad magic bytes / disallowed extension / empty file → 400; **upload for another member → 400 "Accès
      non autorisé"; self-approve own doc → 403** [youth lacks documents.approve]) all correct. Pure-youth IDOR
      re-confirmed: `GET /members` → empty, another member's detail → 404, own detail → 200.
- **FIXED (member flow) — same no-TLD email gap** on the member self-service contact + guardian email
      (`AddMyEmail`/`UpdateMyEmail`/`AddMyGuardianEmail`): applied `RealEmail()` (a member's own email can become
      their `PrimaryContactEmail` that drives reset/activation delivery, so a `nom@gmail` typo bounces it).
- **FIXED (member flow) — login was exact-match on email**: a member typing their synthetic
      `prenom.nom@scouts.gndj` login with a mobile auto-capitalized first letter or a trailing space failed. Member
      `LoginCommandHandler` now trims + lowercases the input and compares `LOWER(email)` case-insensitively (mirrors
      the applicant login; emails are unique so no ambiguity). Verified live: exact / UPPERCASE / trailing-space all
      log in.
- **CU (Chef d'Unité) flow shaken down the same way** (live, as a real CU — Sacha CHEBLI, Cheftaine de Compagnie 1;
      password reset via admin, backed up + restored). Verdict: **the unit-scoping holds.** ALL 11 cross-unit IDOR
      attempts on an out-of-unit member/unit were blocked (read detail → 404; edit / reset-password / read docs /
      read cotisations / record payment / set exempt / passage propose → 400 "Accès non autorisé à ce membre";
      doc matrix / trombinoscope / export for another unit → 400 "Accès non autorisé à cette unité"). In-unit bad
      input is clean (cotisation amount 0/negative → "montant doit être supérieur à 0"; junk currency → "Devise
      invalide"; passage to an invalid unit → 400 not 500). Privilege boundaries hold: settings write → 403, create
      unit / edit own unit (units.edit) → 403, `/demandes` (CG) → 403, group dashboard → 403. Cotisation summary is
      correctly unit-scoped (87 = Compagnie 1, not the group ~1000).
- **FIXED (CU flow) — security-profiles read was reachable by a CU** (`roles.view` over-exposure the 2026-07-29
      pentest missed): `roles.view` gates BOTH the functional-roles list (which a CU legitimately needs for the
      assignment/passage **Fonction** picker) AND the `security-profiles` GET endpoints — so a CU could
      `GET /security-profiles` + `/{id}/members` (browse the whole authorization model + enumerate who holds each
      profile = every admin/CG) via direct API/URL (no sidebar link, but the route was `roles.view`-gated). The
      security-profiles read is a **manager** tool, so its 3 GET endpoints now require **`maitrise.manage`**
      (super-admin / CG / ACG) instead of `roles.view`; functional-roles stays on `roles.view` so the CU keeps their
      Fonction picker. Frontend aligned (the "Profils & accès" route + sidebar link + Profils tab now gate on
      `maitrise.manage`). Verified live: CU → security-profiles 403 but functional-roles 200 (picker intact),
      super-admin → 200.

### Demande serial number (INS-YYYY-NNNN) (2026-09-01)
Each demande gets a human-facing reference. Format (CG's choice): **`INS-2026-0001`** — `INS-` prefix +
scout-year start year + 4-digit sequence, **per scout year** (resets each campaign).
- **Assigned on the FIRST submission** (Draft→Submitted) only — drafts stay `null` so an abandoned draft
      never burns a number. `Demande.SerialNumber` (migration `AddDemandeSerialNumber`, **unique** index;
      Postgres NULLs distinct so drafts don't collide). `Common/DemandeSerial.NextAsync` = read-max+1 per scout
      year; `SubmitDemandeCommandHandler` assigns it and **retries on the unique index** (two parents submitting
      the same instant race the read-max+1 — bounded 5-retry loop, Status/SubmittedAt ride along).
- **Shown:** parent portail (mono line under the child), the result page (Demande N° …), and the CG review
      **table** (under the name) + detail drawer. `DemandeDto`/`DemandeReviewDto` carry `SerialNumber`.
- **Email:** new **`{{demandeNumber}}`** variable added to the demande templates' send dicts (submitted /
      approved / declined) + the frontend `MODULE_VARIABLES.demande` dropdown (email-settings) so the CG can place
      it in the template. (The dropdown is driven by MODULE_VARIABLES, not the stored template JSON — no template
      patch needed; the value is always supplied at send time.)
- **Backfill:** data patch **`012_demande_serial_numbers.sql`** numbers already-SUBMITTED demandes per scout
      year ordered by `submitted_at` (idempotent, only-if-null, skips Drafts). Runs on prod at next deploy after
      the migration adds the column.
- Verified live: backfill → INS-2026-0001…0006 in submission order; a new submit → INS-2026-0007; the review DTO
      + applicant profile return it; the `demande_submitted` outbox row carries the number. Build clean
      (dotnet + tsc + eslint). DEV until deploy (migration + patch apply on prod startup).

### Unit-type Gender field + demande suggestion fix (2026-09-01)
Enrollment went live and the CG saw **girls suggested into a Troupe** (boys). Root cause: `unit_types.gender`
was **blank for every branch**, and there was **no field in the admin UI to set it**. The demande unit-suggester
(`demande-validation.tsx` `eligible()`: `!u.gender || u.gender==='Mixte' || u.gender===d.gender`) treats blank
as "matches any gender", so it fell back to age+balance only. (The suggestion is only a one-click chip — the CG
still picks the real unit; nothing auto-applied.)
- **Fix = expose + populate `UnitType.Gender`** (values `Masculin`/`Féminin`/`Mixte`/null). Added it to
      `UnitTypeDto`/`UnitTypeDetailDto`, `CreateUnitTypeCommand`/`UpdateUnitTypeCommand` (+ allowed-set validator)
      and the `GetUnitTypes` projections; the unit-type detail form (Types d'unité → Informations) got a **Genre**
      select (Garçons/Filles/Mixte/Non précisé) + a read-only row. The occupancy query (`DemandeAdminHandlers`
      L249) already projected `u.UnitType.Gender`, and the frontend `eligible()` already filtered on it — **so the
      only thing missing was the data**.
- **Data (mapping confirmed with the CG):** Garçons = Meute/Troupe/Clan · Filles = Ronde/Compagnie/Caravelles/
      Pionnières/Feu/Noyau/JEM · Mixte = Groupe. Set on dev + **data patch `011_unit_type_genders.sql`** (idempotent,
      only sets a still-NULL branch so a later UI edit isn't overwritten).
- **PROD note:** the suggester logic + occupancy gender projection are ALREADY deployed — only the data was blank.
      So prod suggestions can be fixed WITHOUT a full deploy by running `011`'s three UPDATEs on the prod DB
      (`PGCLIENTENCODING=UTF8 psql -f deploy/patches/011_unit_type_genders.sql`); otherwise patch 011 auto-runs on
      the next deploy (idempotent). The new **Genre form field** ships with that deploy.
- Verified live: list/detail/occupancy return the genders; a girl no longer matches a Troupe (Masculin≠Féminin);
      PUT round-trips gender. Build clean (dotnet + tsc + eslint). DEV until deploy (data patch on prod startup).

### Merge duplicate demandes (2026-09-08)
A CG tool to merge demandes for the same child submitted more than once (a parent re-submitted, or both parents
each registered). Mirrors the duplicate-MEMBERS "Doublons" tool but for demandes + their applicant household.
All on main, DEV until deploy; verified live end-to-end (throwaway year 9999, then cleaned up).
- **Data model reminder:** child fields live on the **Demande**; parents (`ApplicantGuardian`), proches
      (`ApplicantScoutRelation`), address, parents-situation live on the **ApplicantAccount** (shared across that
      account's demandes). So same-account duplicates share the household; cross-account ones don't.
- **Detection** `GetDuplicateDemandeSuggestionsQuery(scoutYear)` (`GET /demandes/duplicates`, IsGroupManager):
      groups mergeable demandes (non-draft, **not converted / not sent**) by normalized full name + DOB (blank DOB →
      name only). Returns `DuplicateDemandeGroupDto(Demandes: DemandeReviewDto[], Evidence)`. Refactored the review
      DTO projection into shared `DemandeReviewProjection.BuildAsync` (used by the review list AND this) so both show
      the identical file shape. Added `PhoneCountryCode` to `DemandeReviewDto` (was dropped) so the merge keeps the phone intact.
- **Merge** `MergeDemandesCommand(KeeperId, LoserIds, DemandeMergeFields, KeepGuardianIds, KeepScoutRelationIds,
      SendEmail)` (`POST /demandes/merge`, demande.manage + IsGroupManager). In one transaction: chosen child fields →
      keeper demande; chosen household fields (address/parents-situation) → keeper account (**PrimaryContactEmail left
      as-is** — not in the DTO); **parents/proches item-by-item** — a ticked keeper-account item stays, an unticked one
      is soft-deleted, a ticked **loser-account** item is **COPIED** onto the keeper account (safe — never removes it
      from an account that still has a sibling demande); loser demandes soft-deleted; a loser account **left with no
      other demande is hard-deleted** entirely (cascade like DeleteApplicantAccount), one with siblings is kept. Optional
      `demande_merged` email (seeded, idempotent) to every involved account (kept vs deleted serial numbers), queued after
      commit. GOTCHA respected: insert guardian/relation copies via the DbSet, never mutate a tracked parent's nav.
- **Frontend:** page `/admin/demande-duplicates` "Doublons de demandes" (sidebar Demandes, demande.manage). Per group:
      pick a keeper (radio); child+household fields shown as **identical (auto, green ✓) vs a choice (radio)**; parents &
      proches **deduped by signature** and pre-checked (untick to drop), loser-only items tagged "à ajouter"; a "send
      email" checkbox. Merge dialog re-inits on keeper change (render-phase reset).
- **Verified live:** detection finds a real dup (Chadi ABOU KHALIL, untouched); cross-account merge → chosen school
      applied, identical parent deduped, loser parent+proche copied, loser demande+account hard-deleted, 2 emails queued;
      same-account merge → account kept (accountsDeleted 0), unticked parent removed; sent/converted demande → 400. Build
      clean (dotnet + tsc + eslint + vite). Migration-free (template seeds on prod startup via SeedDemandeEmailTemplatesAsync).

### "Envoyer les accès" — re-inscription email choice (with / without link) (2026-09-09)
Second half of the re-inscription request (page 1 = the email): the rollout tool now sends ONE of two emails,
template-driven. All on main; DEV until deploy.
- **`SendAccessEmailsCommand.TemplateCode`** (default `account_activation`; whitelisted to
      {account_activation, reinscription_returning} so the tool can't send an arbitrary template). Behaviour is
      **template-driven**: the handler loads the chosen template and, **if its body/subject contains
      `{{activationLink}}`**, stamps a set-password token + sends the link (new / first-time member); **otherwise**
      it sends link-free (NO token) with `{{loginUrl}}` (returning member logs in with their existing account). So
      next year the CG sends with-link to new members, without-link to returning ones. Vars now include
      loginUrl + scoutYear (from `passage.scout_year`) alongside memberName/username(/activationLink/expiryDays).
      `SendAccessRequest` + `POST /members/send-access` carry TemplateCode; audit records the template.
- **New seeded template `reinscription_returning`** (module auth, idempotent in `SeedMemberEmailTemplatesAsync`):
      the same rentrée letter as `account_activation` but link-free — "connectez-vous avec votre identifiant + votre
      mot de passe", `{{loginUrl}}`, mot-de-passe-oublié hint, a to-do list (vérifier la fiche / téléverser les
      documents [mentions the new prefilled templates] / cotisation). Editable in Admin → Email. `account_activation`
      left untouched (no seeder rewrite → a CG-edited prod body is safe).
- **Frontend** (`send-access.tsx`): an "Email à envoyer" `Select` (Activation vs Réinscription) → passes
      `templateCode`; the info banner adapts (link-free wording for réinscription); `useSendAccess` body carries it.
- **Rentrée:** new task **"Mettre à jour les modèles de documents (autorisation, fiche médicale…)"** (Configuration
      phase, CG, action `goto-document-types`) — added to the master template AND the idempotent
      `SeedRentreeExtraTasksAsync` (backfills existing DBs). New rentrée action **`goto-document-types`** →
      `/admin/document-types` (backend allowed-set + frontend `rentree-actions.ts`).
- **Verified live** (super-admin, member Rhea HARFOUCHE): réinscription send → sent=1, **no token stamped**, outbox
      row `reinscription_returning`; activation send → sent=1, **token stamped**, outbox `account_activation`;
      invalid template (`error_alert`) → 400 "Modèle d'email non autorisé"; both templates seeded (link detection
      t/f); rentrée task backfilled (1 template). Test token + outbox rows cleaned up. Build clean (dotnet 0/0 +
      tsc + eslint). NOTE: same go-live caveat as all app mail — delivery needs an active SMTP + `email.override_recipient`
      cleared (see [[project-email-golive]]).

### CG edit any demande (incl. proches, after the deadline) + all-field search (2026-09-10)
Two demande-review asks. All on main; DEV until deploy; verified live.
- **CG edit of a full demande file — `AdminEditDemandeCommand` + `PUT /demandes/{id}`** (demande.manage +
      `MemberAccess.IsGroupManager`): edits the child fields (on the `Demande`) AND the shared household (address +
      situation + parents/tuteurs + proches scouts, on the `ApplicantAccount`). Unlike the applicant-side
      `UpdateDemande`/`SaveApplicantHousehold`, it **BYPASSES the submission-window / terms / relation-cap gates** —
      a CG fixes a file at ANY time, even after the deadline (a parent forgot a parent/proche, or the CG corrects a
      typo during review). Household edits affect EVERY sibling demande on the account (guardians + address are
      shared — intended). **Blocked once a member was created** (`CreatedMemberId != null` → edit the real fiche).
      Reuses the applicant validators exactly via `SetValidator(new DemandeInputValidator())` +
      `SetValidator(new SaveApplicantHouseholdCommandValidator())` (same field rules; only WHEN is relaxed). Audited
      `EditDemande`.
- **Refactor (DRY):** extracted **`ApplicantHelpers.ApplyHouseholdAsync`** (address + guardian/relation replace +
      the "current member" auto-link) out of `SaveApplicantHouseholdCommandHandler`; both the applicant save (after
      its window-gate + relation-cap) and the new CG edit call it. No SaveChanges inside — caller owns the txn. The
      controller fully-qualifies the two Applicant types in `AdminEditDemandeBody` (a broad `using
      GNDJ.Application.Applicants` collides: that namespace ALSO declares `DeleteDemandeCommand` /
      `ResetApplicantPasswordCommand` → CS0104).
- **Frontend:** new `components/admin/demande-edit-form.tsx` (mirrors the wizard's field patterns/components —
      DateInput / SearchableSelect (nationalité + profession domain) / CitySelect / PhoneInput / class+school lists
      from settings; guardians + proches add/edit/remove). Wired into the review drawer (`demande-validation.tsx`):
      a **« Modifier »** button in the `DetailPanel` header (hidden once locked) swaps the whole panel for the edit
      form; `useAdminEditDemande` (`PUT /demandes/{id}`) → invalidates `['demandes']`; A/R/arrow keyboard triage is
      suppressed while editing; edit mode resets on row navigation.
- **All-field, multi-term search (frontend-only):** the review search box (was child-name-only, client-side) now
      matches a normalized **haystack across every field** — child (name/serial/nationality/school/classe/section/
      email/phone/gender/blood/city/country/address/contact/account email/age) + every guardian (name/profession/
      domain/email/phone) + every proche (name/group/unit/function/linked-member) — and splits the query into
      space-separated terms that must **ALL** match (AND), so "marie beyrouth" or "hariri usj" narrows across the
      whole file. Accent/case-insensitive. The structured filters (status/gender/classe/age/unit) are unchanged.
- **Verified live** (super-admin, 2026-2027): edit a real demande → 204, section changed + guardians/relations
      preserved, then restored; future-DOB / `<script>` → 400 (validators fire); builds clean (dotnet 0/0 + tsc +
      eslint + vite).

### Settings past-date false error + clearer "délai dépassé" message (2026-09-11)
Two fixes from a CG report. Frontend-only; DEV until deploy.
- **Settings date "past" error only on CHANGE:** `SettingRow` (`settings.tsx`) flagged "La date ne peut pas être
      dans le passé" for ANY stored date now in the past (e.g. `demande.submission_deadline` set weeks ago) because
      `dateInPast` was computed purely from `value`. It now also requires `value !== setting.value` — so a validly
      stored past date shows no error on load (and doesn't block, though the Save button is hidden when unchanged),
      while picking a NEW past date still errors + blocks Save. (`allowsPastDate` exceptions unchanged.)
- **Clear deadline-passed messaging:** the backend already closes submissions after `demande.submission_deadline`
      (`SubmissionsOpen = !afterDeadline`; `SubmitDemande`/Create/Update/SaveHousehold/Register/Delete gated by
      `SubmissionsClosedError`), but the parent-facing UI showed the generic manual-close "en cours d'étude" review
      message. New shared `isSubmissionDeadlinePassed(deadline)` (applicant-service, compares today's local date to
      the yyyy-MM-dd deadline); when the deadline has passed, the **portail** shows an amber "La date limite de
      soumission est dépassée" banner (with the date) and the **wizard** readonly banner says "Le délai est dépassé :
      vous ne pouvez plus soumettre cette demande" — distinct from a manual CG review-phase close. Submit stays
      blocked client + server; the portal remains viewable. Verified live: config `submissionsOpen=false`,
      `submissionDeadline=2026-09-10` (today 2026-09-11). Builds clean (tsc + eslint + vite).
- **Block at "Créer un compte" + hide the new-demande button (2026-09-11 follow-up):** `ApplicantOpenRoute`
      (`submissionsRequired`, the REGISTER gate) previously `Navigate`'d a closed-submissions register to
      `/inscription` → which redirects to `/login`, so a parent clicking "Créer un compte" landed on login with NO
      explanation. It now renders a message in the `ApplicantAuthShell` — "La date limite de soumission est dépassée"
      (deadline) / "Les inscriptions sont clôturées" (manual) + a "Se connecter" link — so they see WHY. And the
      portail's "Ajouter une demande" button is now HIDDEN when `!canSubmit` (was disabled/greyed). Server register
      gate (`SubmissionsClosedError` in `RegisterApplicantCommand`) unchanged. tsc + eslint + vite clean.

### Re-inscription launch email — "Réinscription (nouveau système)" (2026-09-10)
A dedicated member re-inscription email based on **page 1 of the official Document_Complet_Reinscription letter**
(Chef de Groupe Giorgio RIZK / Cheftaine Nour BOU ATME), adapted to the new online platform + an explicit
"new system" mention. Added as a **3rd choice** in "Envoyer les accès" (NOT overwriting `account_activation`, which
is shared by "Identifiant oublié ?" + demande resend that don't supply all vars). All on main; DEV until deploy;
verified live.
- **New seeded template `reinscription_access`** (SeedMemberEmailTemplatesAsync, idempotent): the re-inscription
      letter WITH the set-password `{{activationLink}}` (imported members' login email is the synthetic
      `@scouts.gndj` — undeliverable — so the reliable path is the emailed link, not "Mot de passe oublié"). Added to
      `SendAccessHandlers.AllowedTemplates` + the send-access frontend selector (`withLink` = not the returning
      template). Editable in Admin → Email.
- **All dates dynamic** (no hard-coding): `{{dateDuJour}}` (today), `{{dateLimiteReinscription}}` (from
      `demande.submission_deadline`), `{{datePremiereReunion}}` (from a NEW setting **`passage.first_meeting_date`**
      "Première réunion de l'année", category passage, date type, seeded via SeedMissingSettings, CG-editable in
      Paramètres → Passage next to the passage date). Formatted French long form via a culture-independent
      `FrLongDate` (month/day name arrays — no fr-FR culture/ICU dependency, safe under globalization-invariant).
- **Signature from the roles:** `{{signatureCG}}` built from the ACTIVE Chef(taine) de Groupe role holders
      (`FunctionalRole.SecurityProfile.Code == "chef-de-groupe"`), **male before female** (matching the letter — Chef
      de Groupe / Cheftaine de Groupe), newline-joined and rendered in a `white-space:pre-line` block (EmailService
      HTML-encodes values, so no HTML injection; newlines survive). Extra batch-level vars computed once; harmless
      for the other two templates (they don't reference them).
- **Verified live** (sent to a test member): outbox vars resolved to dateDuJour="jeudi 10 septembre 2026",
      dateLimiteReinscription="dimanche 20 septembre 2026", datePremiereReunion="vendredi 18 septembre 2026",
      signatureCG="Giorgio RIZK — Chef de Groupe\nNour BOU ATME — Cheftaine de Groupe", + activationLink/username/
      scoutYear/expiryDays; test settings + token + outbox row cleaned up afterwards. Build clean (dotnet 0/0 + tsc +
      eslint). NOTE (user): "we will work on all email templates in the next couple of days". Made the **DEFAULT**
      choice in "Envoyer les accès" (top of the selector) since it's this year's rollout email.

### Demande late-access invite links — enroll ONE family after the deadline (2026-09-11)
The submission window is GLOBAL (once `demande.submission_deadline` passes / the CG closes submissions, NOBODY can
register/create/edit/submit — `ApplicantHelpers.SubmissionsClosedError` gated all 6 write paths + register). The CG
sometimes wants to let ONE specific family enroll after the deadline without reopening for everyone. Built a
targeted **invite-link** mechanism (the CG's chosen approach): CG generates a link → the family opens it to
register (new) or claim it (existing account) → that stamps a durable per-account grant the submission gates honor.
- **Model:** `DemandeInvite` (Token [unique], ScoutYear, Label, Email, ExpiresAt [DateOnly = link validity AND the
  granted window], ClaimedByAccountId/ClaimedAt, RevokedAt, CreatedByUserId; migration `AddDemandeInvite`) +
  `ApplicantAccount.LateSubmissionUntil` (nullable DateOnly, same migration). Single-use, expiry-bounded, revocable.
- **Gate change:** `SubmissionsClosedError(config, DateOnly? lateSubmissionUntil = null)` — an active grant
  (`>= LebanonClock.Today`) bypasses a closed submission window (NOT a fully-disabled `demande.enabled` portal). All
  5 applicant write handlers pass the account's grant (`ApplicantHelpers.LateGrantAsync`); Submit reordered to load
  the account first. `RegisterApplicantCommand` gained `InviteToken`: a valid token bypasses the closed-register
  block, **pre-verifies the email** (CG-vouched → no verify-mail dead-end), stamps the grant, and consumes the
  invite. `ApplicantProfileDto.CanSubmitLate` exposes the active grant to the portal/wizard.
- **Handlers** (`Demandes/DemandeInviteHandlers.cs`): Create/Get/Revoke (CG, `MemberAccess.IsGroupManager` +
  demande.manage/view) · `GetDemandeInviteInfoQuery` (anonymous, for the public invite page — leaks only label +
  expiry) · `ClaimDemandeInviteCommand` (applicant, existing account → sets grant to the later of current/invite
  expiry). Endpoints: `GET|POST /demandes/invites`, `DELETE /demandes/invites/{id}` (CG); `GET /applicant/invite/
  {token}` (public), `POST /applicant/invite/{token}/claim` (applicant). (Fully-qualified the two invite types in
  ApplicantController to dodge the Applicants↔Demandes CS0104 clash — same trap as before.)
- **Frontend:** public self-contained page `/inscription/invitation/:token` (OUTSIDE the "submissions open" route
  guard — own token check) → validates, then registers-with-token (new) or, if logged in, claims + continues;
  "déjà un compte" → `/inscription/login?invite=token` which claims after sign-in. Portal + wizard honor
  `canSubmitLate` (green "Accès exceptionnel accordé" banner, add/edit/submit unlocked). CG UI = collapsible
  `DemandeInvitesPanel` at the top of `/admin/demande-accounts` ("Invitations de dernière minute" — generate [label
  / email / validity days] → link auto-copied, list with status [Actif/Utilisé/Expiré/Annulé] + copy-link + revoke;
  link built client-side from `window.location.origin`).
- **Verified live end-to-end** (submissions closed, deadline passed): normal register → blocked 400; token validates;
  register-WITH-token → account created **pre-verified + canSubmitLate=true**; accept-terms → household → create →
  **submit all 200** (grant bypasses the closed window); invite marked "claimed"; existing-account claim → 200;
  revoke → validate `valid:false`, register-with-revoked → blocked. Test data cleaned up. Builds clean (dotnet 0/0 +
  tsc + eslint + vite). Migration applies on prod startup; DEV until deploy.

### Demande stats "Par école" duplicate rows (2026-09-12)
A CG saw **"CNDJ" listed twice** (218 + 4) in the demande-stats "Par école" bar-list. Root cause: the demande
école field is a managed-list SearchableSelect WITH an "Autre…" free-text escape hatch (schools are open-ended),
and `matchSchool`/`normalizeSchool` only folded accents+case — NOT punctuation/spacing. So the data holds
variants of the same school: `Collège Notre-Dame de Jamhour` (223, mapped → code CNDJ) vs `College Notre Dame de
Jamhour` (no hyphen/accent, ×4, NOT in `member.school_codes`) — the stats page `useSchoolCode` falls back to an
auto **acronym** which ALSO yields "CNDJ" for those → a duplicate row (and `Notre Dame de Jamhour` ×3 → "NDJ").
The backend `bySchool` buckets are grouped accent/case-insensitively but stay distinct raw strings; the frontend
only resolved the display label, so two buckets displayed the same code as two rows. Two frontend fixes
(frontend-only, DEV until deploy):
- **`BarList` aggregates by display label** — when `labelOf` maps distinct raw values to the same label, rows are
      merged (counts summed, re-sorted). Scoped: only "Par école" passes `labelOf`; genre/âge/classe pass none
      (server already grouped) so they're unaffected.
- **`normalizeSchool` now also collapses punctuation/spacing** (`[^a-z0-9]+` → single space, after accent-strip +
      lowercase) — so `matchSchool`/`matchCity` snap hyphen/spacing variants onto the canonical list entry, and the
      school-code resolver maps `College Notre Dame de Jamhour` → the real CNDJ (not an acronym). After both:
      "CNDJ" is ONE row (~227).
- RESIDUAL `Notre Dame de Jamhour` (×3, missing the word "Collège") normalizes differently so it can't be matched
      to the canonical automatically — FIXED via **data patch `016_school_code_ndj_alias.sql`**: adds
      `"Notre Dame de Jamhour" → "CNDJ"` to `member.school_codes` (jsonb `||` merge, guarded/idempotent, doesn't
      disturb other entries). The lookup normalizes accents/case/punctuation, so that one alias key also covers
      "Notre dame de jamhour" / "Notre-Dame de Jamhour". Applied to dev live; auto-runs on prod at next deploy
      (once per DB, tracked in `data_patches`). Result: "CNDJ" is a single row covering every variant. The wizard's
      improved matcher prevents most future hyphen/spacing variants going forward.

### Proche-scout links confirmed by the CG + conversion/report fixes (2026-09-25, DEV until deploy)
- **Proche links are now SUGGESTIONS, confirmed by the CG.** Before, a "current member" proche was auto-linked to a
  member by NAME alone (and a portal-sent member id was trusted) → at conversion that member inherited the family's
  parents + a fratrie was declared — wrong on a homonym. New `ApplicantScoutRelation.SuggestedMemberId` (migration
  `AddScoutRelationSuggestedMember`): `ApplicantHelpers.ApplyHouseholdAsync` only SUGGESTS (single name(+unit) match,
  or a verified member id sent by the portal, e.g. the "Retrouver mes informations" siblings); it carries over a
  CG-confirmed link / a pending suggestion across re-saves (the set is replaced on every save). The CG-admin edit
  path passes `trustLinks: true`. New `LinkScoutRelationMemberCommand` + `POST /demandes/relations/{id}/link-member`
  (demande.manage + IsGroupManager) — **brothers/sisters only** (`ScoutRelationKind.IsSibling`, now shared). Review
  DTO carries `SuggestedMemberId/Name/Unit`. Drawer: amber "Correspondance possible" + **Lier** / "Choisir un autre
  membre…" (MemberPickerDialog); table badge **À lier**. Conversion unchanged (acts only on confirmed
  `RelatedMemberId`, siblings only). **Patch `026`** demotes existing auto-links on not-yet-converted accounts to
  suggestions (dev: 103 demoted, 2 kept).
- **Guardian dedup at conversion needs a first-name match** (`FindExistingGuardian`): a shared phone/email alone no
  longer merges two different parents — no name match → a new guardian with the same phone/email copied.
- **Bulk passage review** clears a final team that isn't in the final unit (same rule as single review).
- **Reports:** address/phone/email fall back to the first non-primary entry and COALESCE null parts (a null city
  blanked the whole address; 1,062 addresses / 1,309 phones / 798 emails had no primary).
- **SetPrimaryContactEmail** (leader) now case-insensitive. **Removed** the dead leader contact screen
  (`LeaderContactVerification`, `VerifyMyContactCommand`, `POST /my-profile/verify-contact`, MeResponse
  `NeedsContactVerification`/`Suggested*`); `Member.ContactVerifiedAt` column kept for history.
- **Demande double-tap guard** (`demande-wizard.tsx`): `persist()` shares ONE in-flight save across concurrent calls
  (`inflightSave` ref) and remembers a just-created id (`createdIdRef`) — a fast double-tap on Suivant/Soumettre
  can't create a second demande (the per-account cap is only checked at create). Step headers disabled while saving.
- **Portal gates block on load failure** (`ApplicantVerifyGate` / `ApplicantTermsGate`): if config/profile can't
  load, show `GateLoadError` (Réessayer) instead of falling through to the portal.
- **Document-campaign steps are atomic**: new `IEmailQueue.Stage(ctx, jobs)` + `Wake()` add outbox rows to the
  CALLER's context; `RunSendErrorsAsync` / `RunApplyHoldAsync` commit emails + hold flags + notifications + the
  "step done" marker in ONE SaveChanges (`StageMarkerAsync`), so a crash can't cause a double send. Verified live:
  send-errors queued 353 + marker in one save; re-run → 0.
- **Audit `member_id` — full member Journal.** `AuditLog.MemberId` (migration `AddAuditLogMemberId`, indexed) is
  resolved AUTOMATICALLY in `AuditService.ResolveMemberIdAsync` from the entity's own member FK (Member /
  MemberAssignment / MemberCotisation / MemberProgression / MemberChangeRequest / Passage / User / MemberDocument
  [doc id, or the member id for single downloads]) — no call-site changes. `GetMemberAuditLogsQuery` now matches
  `member_id` OR `entity_id` OR the member's login (actor) OR a `Guardian` row for one of the member's parents
  (shared between siblings, so matched at query time). **Patch `027`** backfills history. Verified: sample member's
  Journal 17 → 43 entries.
- **Public nav keyboard-accessible** (`components/public/nav-dropdown.tsx` `NavDropdown`, disclosure pattern): hover
  opens; Enter/Space/↓ open (↓ focuses first link), ↑/↓ move, Escape closes + refocuses the button, closes on
  route change / outside click / Tab-out; `aria-expanded`/`aria-controls`. Mobile menu: focus moves in on open, Tab
  is trapped inside (menu + toggle), Escape closes + refocuses the toggle. Verified in real Edge (playwright-core).
- **Public-site caching** (`Api/Middleware/PublicCacheMiddleware`, before `UseOutputCache`): public endpoints use the
  new `PublicContent` output-cache policy (10 min, tags `public`+`short`, was ShortCache 2 min). ANY successful
  non-GET under `/api/v1/` (except applicant/public/auth/errors/notifications) evicts tag `public`, so admin edits
  show immediately without wiring each write endpoint. Public GET 200s get `Cache-Control: public, max-age=60,
  s-maxage=120` (not `/public/maintenance`, which is polled). Verified: header present; news create/delete visible
  at once. Cloudflare still doesn't edge-cache `/api` JSON (no cache rule); s-maxage caps staleness if one is added.
- **Rentrée — one deadline for all units**: `SetRentreeTasksDueDateCommand(TaskIds, DueDate?)` + `PUT
  /rentree/tasks/due-date` (rentree.manage) sets/clears the fixed date on every listed task; a set date also clears
  `DeadlineAnchor` (an anchor would otherwise win at resolve time). Button "Date limite pour toutes les unités" in
  the expanded rollup row (warns when the task follows a settings date). Verified: 17 unit copies in one call.
- **One-off email text per send** ("Emails aux chefs"): `SendLeaderMessageCommand` gained `SubjectOverride` /
  `BodyHtmlOverride` (+ validator: subject NoHtml ≤300, body ≤100k). The edited text rides in each job's variables
  under reserved keys `EmailOverride.SubjectKey/BodyKey` (`__subject`/`__bodyHtml`, Application/Common) — no outbox
  schema change; `EmailService.SendAsync` uses them instead of the template text (routing, attachments, test
  redirect, variable substitution unchanged) and strips the keys. Activation-token stamping keys off the EFFECTIVE
  text. Page: switch "Modifier le texte pour cet envoi" → subject input + RichTextEditor (variables menu), preview
  follows. Verified via smtp4dev: edited subject/body delivered, template untouched, no token stamped.
- **members.view = real READ-ONLY member access** (was unused: every member read required members.edit).
  `MemberAccess.HasMemberRead` (super-admin | members.view | members.edit), `CanViewMemberAsync` (same reach as
  CanAccessMemberAsync, view accepted) and `CanViewUnit`. READ handlers switched (member list/detail/unit options,
  documents list + file/page download + unit matrix/zip, guardians list [Notes shown to a staff viewer, not own
  fiche], cotisations list/receipt + paid/unpaid/exempt lists, custom-field reads, assignments history, unit
  dashboard, birthdays, progression list, member card, bulk cards, report collector [led units = roles granting
  view OR edit], template PDF, siblings, photo). EVERY write keeps CanAccessMemberAsync / members.edit or its own
  module permission at the controller. Frontend: member panel photo upload, Postes (`readOnly`) and Parents (new
  `readOnly` prop) hide edit controls without members.edit. No existing profile changes behaviour (only the unused
  "observateur" profile is view-only). Verified live: a youth with a members.view-only grant reads list (58) /
  detail / documents / parents but gets 403 on add-phone and update; a plain youth is still refused everywhere.
- **Camp BP — Commission BP**: `CampCommissionMember` (CampId, MemberId, unique; migration `AddCampCommission`;
  cascade on camp + member; merge service moves memberships). `AuthAccess.LoadAsync` adds `camp.manage` +
  `camp.grade` for a member on the commission of a non-archived, non-deleted camp — nothing else. CG-only actions
  (`CampCg.IsCg` = super-admin or `roles.manage_group`, since ACGs hold maitrise.manage and commission members hold
  camp.manage): create / archive / delete a camp and `SetCampCommissionCommand`. Endpoints `GET|PUT
  /camps/{id}/commission`. Camp page "Commission" tab (member picker; read-only for commission members); "Nouveau
  camp" / Archiver / Supprimer hidden unless CG (`useIsCampCg`). Verified live: CU off-commission 403 → on it 200 →
  camp archived 403; CU refused create/archive/set-commission.
- **New demande from Ma fiche** ("Inscrire un frère ou une sœur", shown while inscriptions are open):
  `StartSiblingDemandeCommand` + `POST /my-profile/start-sibling-demande` (auth, own member). Picks the family
  email (PrimaryContactEmail → a parent's email → own), finds or creates the family's `ApplicantAccount` (created
  VERIFIED, random password — "mot de passe oublié" works later), prefills a new/empty account from the shared
  `HouseholdLookup.BuildAsync` (extracted from the household-lookup verify handler): parents, address, and the
  household members as "Frère / Sœur" proches with `SuggestedMemberId` (CG confirms with Lier). Returns an applicant
  session; `useApplicantStore.adoptSession` stores it and the page navigates to `/inscription/portail/demande/new`
  (terms/verify gates + window/caps still apply). Impersonation (read-only) can't use it (POST). Verified live on a
  real family: account created on the father's email, 2 parents + address + 2 brothers (suggestions), 2nd call reuses.

### Demandes menu follows the demande period (2026-09-26, DEV until deploy)
- "Clôturer la campagne" renamed **"Clôturer les demandes"** (button, confirm, toast, audit label, CG guide).
- `DemandeCampaignStatusDto.Active` = `demande.enabled` OR any demande still exists; also sent in `/auth/bootstrap`
  (`demandeCampaign`, only with demande.view) and primed into `['demandes','campaign-status']`.
- Sidebar/top bar `placeDemandes()`: when not active (after "Clôturer les demandes"), the Demandes group is hidden and
  **Archives des demandes** appears in Configuration → Structure & données; reopening inscriptions brings the group
  back (saving a `demande.*` setting refreshes the status). Submission deadline passing does NOT hide it.

### New members Excel to each CU on "Envoyer les réponses" (2026-09-26, DEV until deploy)
- After the send commits, `SendDemandeResponses.NotifyUnitLeadersAsync` (best-effort, never fails the send): per
  decided unit, one email to each chef d'unité (unit HEAD = role on profile `chef-unite`; contact via
  `ContactEmailResolver`) with template **`demande_unit_new_members`** (seeded; category Chefs; vars leaderName,
  unitName, count, scoutYear) and a per-send **Excel attachment** built by `IUnitNewMembersSheet`
  (`UnitNewMembersSheet`, ClosedXML): Nom, Prénom, date de naissance, genre, classe, école, matricule, Père, Mère,
  autres tuteurs (NAMES only — no phone/email), Frère/sœur dans l'unité (same family accepted into the same unit, or
  a declared sibling already active in it; other proches not mentioned). File saved under
  `<AuditArchive:Directory or cwd/archives>/demandes-unites` (the only root the sender accepts for per-send
  attachments). One copy per CU, `EmailAttachment.DeleteAfterSend=true` → the outbox sender DELETES the file as
  soon as that email is Sent (a finally-failed email keeps its file for a manual retry; pruned after 30 days). Units without a reachable CU are listed in the audit entry (`UnitsWithoutCu`).

### Demandes — Excel "Réponses" workbook (2026-09-29, DEV until deploy)
- `GET /demandes/export-decisions` rebuilt (`DemandeSheetService`): main sheet « Demandes » = every submitted demande,
  boys then girls under title rows, key columns first, hidden Réf. column, « Réponse (unité ou motif) » dropdown
  (unit codes then refusal codes). Live sheets with plain formulas (INDEX/MATCH on a hidden « Clé » column
  "M2#3"; no macros / dynamic arrays): one per unit (all active units except the Groupe, parcours order) + « Refusés »
  + « Statistiques » (gender, unit with headcount/quota/places left, classe, école, unit × classe) + « Codes ».
  `DemandeExportUnit` carries quota + youth headcount. Import reads only this layout (Réf. + Réponse headers);
  gender title rows are skipped (no Réf.). Verified: LibreOffice-computed values correct, import round trip OK.
  (2026's decisions were staged on prod from the CG's hand-made files with a one-off script, since removed.)

### Demandes / Maîtrises / Passage batch (2026-09-29/30, DEV until deploy)
- **Demandes decisions on prod:** 2026 boys (112) + girls (129 incl. Haya HALWANY → R3) staged from the CG's
  hand-made Excel files (157 accepted / 84 declined « faute de place »); the one-off script was deleted afterwards.
  Left « Soumise » on purpose: Anna HIMO, Yasmina HOBEICHE, Sasha MAALOUF. Christia Sleilaty (NOYAU sheet) has no demande.
- **Passage projection counts accepted demandes** (`PassageProjectionDto.Newcomers`: Approved, not converted, decided
  unit, scout year = `demande.scout_year`) as arrivals « Demandes » in both modes.
- **Demandes spreadsheet mode** (`components/admin/demande-grid.tsx`, « Modifier » above the review table, desktop):
  nom/prénom/naissance/genre/classe/école + Réponse edited in cells, drafts in yellow, « Enregistrer (N) » saves all.
  Child fields via new `PUT /demandes/{id}/quick-edit` (`QuickEditDemandeCommand`, never touches the household);
  answer via the existing decide endpoint. Review page search is compact: only the search bar + « Filtres » (count).
- **« Lier » confirmation** (`components/admin/link-relation-dialog.tsx`): `GET /demandes/relations/{id}/link-preview
  ?memberId=` compares the declared proche + family parents with the member (birth date, posts, parents; parents in
  common flagged); « Non, ce n'est pas lui » = `POST .../dismiss-suggestion` (clears SuggestedMemberId). Links made
  at submission are suggestions only (dev: 103 pending « À lier », 0 confirmed on open demandes).
- **Maîtrises « Ajouter un chef »** search = `GET /maitrises/candidates?search=` (`GetMaitriseCandidatesQuery`):
  chefs anywhere + older branches only (no Meute/Ronde/Troupe/Compagnie youth), shows current posts, 25 results.
- **Validation des passages:** with a unit selected, « Tous les membres » embeds the CU page (`PassageUnitPanel`
  exported from `pages/passage.tsx`, `embedded` = no CU header/picker/Terminer, finished unit not locked for the CG)
  showing every member with the CU's choices; « Lignes de passage » = the review view. Unit codes only (name on
  hover). On phones the units table is a card list.
- **Camp BP « Liste de présence »** (2026-09-30): `GET /camps/{id}/presence/xlsx?unitId=` (camp.grade) →
  `GenerateCampPresenceListQuery` reuses `GetCampGradingQuery` (same scope: CU = own units, CG = all) →
  `ICampPresenceSheet` (ClosedXML): one sheet per unit (code, parcours order), framed title, Prénom / Nom / Présence /
  Cotisation, « Absent(e) » for members marked « Ne vient pas ». Buttons: CU grading page + Familles toolbar.
  FIXED: SaveCampGrades skipped a not-coming member with no grade (the absence was never stored).
- **Camp BP rotation for any size** (2026-09-30): `CampRotationGrid.Build(G)` for G games / 2G familles / G slots
  (MaxGames 50). 25 = the commission's historical grid (unchanged); odd G = formula A(g−t) vs B(g+t) mod G; even G =
  precomputed first slot (`EvenBases`, cyclic search, shifted by one each slot). `Problem(familles)` refuses odd, 4,
  6 (2/3 games are mathematically impossible) and > 100. Generate takes `FirstDaySlots` (default ~60 %, 15 for 25);
  default hours = the 2026 hours for 25 games, else 13-min étapes every 20 min from 11:30 / 11:00. Game numbers
  1…familles/2 (checked server-side). Rotation DTO: GamesCount, GridProblem, GeneratedFamilles (page warns + offers
  « Régénérer » when the famille count changed). Unit tests check every size 1…50.
- **Camp BP « Liste par unité » PDF** (2026-09-30): one unit per page in TWO columns balanced by height (a team cut
  in the middle continues as « … (suite) »), compact rows, `ScaleToFit` so a unit never spills onto a 2nd page.
  NOTE: until BP work is done, BP changes get NO changelog.json lines and NO docs/help edits (one pass at the end).
- **Camp BP counts include Père/Mère** (2026-09-30): Père/Mère are campers — CampDto/CampListDto counts cover every
  attending participant; « dans une famille » = FamilleId set OR Role Père/Mère (a leader has FamilleId null but belongs
  to the famille they lead). New PereCount / MereCount / LeadersCompleteCount → header « Père/Mère : x/50 ». The
  « Liste par unité » PDF lists Père/Mère in their own unit with « (Père) / (Mère) » and their famille number.
- **Camp BP draft « Inclure les Pères / Mères »** (2026-09-30): checkbox in the « Lancer le tirage » dialog →
  `RunCampDraftCommand(IncludeLeaders)` (`POST /camps/{id}/draft {includeLeaders}`). Ticked: releases every Père/Mère,
  picks one boy + one girl per famille at random among attending participants ticked « Père/Mère » (IsLeaderCandidate),
  the rest are dealt as members; returns `CampDraftResultDto` (toast warns when candidates are short). Unticked: members
  only, hand-picked Pères/Mères stay. Nothing is assigned automatically without the box.
- **Camp BP « liste de matériel » per game** (2026-09-30): `CampGame.MaterialsJson` (migration `AddCampGameMaterials`,
  JSON `[{name, quantity?}]`, `CampMaterials` Parse/Serialize). `PUT /camps/games/{id}/materials {items}`
  (`SetCampGameMaterialsCommand`: ≤200 items, name NoHtml ≤150, quantity 1…100000; commission Jeux edit OR an
  étapiste of the game; refused once archived). `Materials` on CampGameDto + MyCampGameDto; shared
  `components/camp/game-materials.tsx` on the game card (Jeux tab) and « Mes jeux » (étapiste can edit); game PDF
  lists it under « Matériel ».
- **Camp BP game card redesign** (2026-09-30): `components/camp/game-card.tsx` (`GameCard`) — header = number badge
  (amber « ? » when not in the rotation), name, lieu A / lieu B, icon actions; body = étapistes chips + « Gérer », plan B
  line, description clamped with « Voir plus », and a « Matériel » panel (GameMaterials, `framed` only in « Mes jeux »).
  Jeux tab widened to max-w-4xl (two columns from md).

### Demandes — scheduled « Envoyer les réponses » (2026-10-05, DEV until deploy)
- **Dry run on real data (prod copy of Oct 3), dev restored afterwards:** the send is refused while any demande is
  Submitted (3 left on prod: Sasha MAALOUF, Yasmina HOBEICHE, Anna HIMO); once decided → 161 members + 83 refusals in
  7.4 s, second press sends nothing (idempotent), every member got card/login/post/parent/entrée; 477 emails queued
  (309 acceptances to 291 addresses, 157 refusals to 142, 11 chef d'unité Excel emails), no unit without a CU.
- **Scheduling:** `Application/Demandes/DemandeResponsesSchedule.cs` — hidden settings `demande.responses_scheduled_at`
  ("yyyy-MM-ddTHH:mm", Lebanon time) + `demande.responses_schedule_status` (last automatic run JSON). Endpoints
  `GET|PUT /demandes/responses-schedule` (view / manage + group manager; must be in the future; empty = cancel).
  `DemandeResponsesSchedulerBackgroundService` (every minute, job "Envoi programmé des réponses aux demandes") clears
  the schedule FIRST (never fires twice) then runs the same `SendDemandeResponsesCommand(demande.scout_year)`, stores
  the result and notifies group managers (bell + push) — success or failure (failure = nothing sent).
- UI: `components/admin/demande-responses-schedule.tsx` on the review page (Programmer l'envoi / Modifier / Annuler,
  warning while demandes are undecided, last automatic result).
- **Recipients changed (2026-10-05):** responses now go ONLY to the applicant-account email (one per demande); fallback
  first parent's email, then the child's, only if the account has none. Prod numbers: 244 family emails (161 + 83) +
  11 CU emails, instead of 477. Guide (guide-chef-groupe) updated.
- Rentrée: progress key `demandes-scheduled` (done when a date is set or all sent) + seeded task « Programmer la date
  d'envoi des réponses aux demandes » (Demandes phase, before « Envoyer les réponses… », `SeedRentreeResponsesScheduleTaskAsync`;
  existing years: « Ajouter les nouvelles tâches »).
- Live-tested: past/garbage time 400, CU 403, failure path (undecided → nothing sent + notification), success path
  (fired on the minute, 161/83, notification), UI schedule + cancel in Edge.

### Newcomer weekend check (2026-10-08, DEV until deploy)
Dry run of « Envoyer les réponses » on a dev copy (161 accepted / 83 refused in 9 s, 255 emails) + phone walkthroughs
(`tests/e2e/newcomer_walk.mjs <activationUrl> <outDir>`, screenshots per step). Fixes:
- **Activation signs in directly** (`pages/reset-password.tsx`): after setting the password the page calls the normal
  login and goes to /dashboard; the form shows the identifiant in a read-only `autocomplete=username` field (the
  browser saves identifiant + password). Fallback card shows the identifiant + `/login?username=` (login page prefill).
- **Late joiners can always upload** (`DocumentCampaign.ForMemberAsync`): a member created after
  `documents.deposit_deadline` is outside this year's campaign (upload open, banner none). Used by the upload gate,
  « Ma rentrée » and `GET /documents/campaign` (`?group=true` = group-wide phase, used by the CU matrix banner).
- « Inscrire un frère ou une sœur » hidden (and refused server-side) once `SubmissionsOpen` is false.
- Shared `DialogContent` gets `[&>*]:min-w-0` (grid items could not shrink → contact-review popup overflowed on phones).
- Command palette member query only runs when searching (`useMembers(params, enabled)`) — was a 403 on every page for youth.
- Online-form date blanks: text field JJ/MM/AAAA (`lib/form-dates.ts`), also MM/AAAA or AAAA; sent as yyyy-MM-dd /
  MM/yyyy / yyyy; server `TemplateFormAnswers.IsFormDate`.

### Demande → member conversion check + fixes (2026-10-08, DEV until deploy)
- **`deploy/diagnostics/demande-conversion-check.sql`** (read-only, `psql -v year="'2026-2027'" -f …`): for every
  accepted + answered demande, compares the created member with the demande (14 sections, only problems listed):
  missing member, field differences, medical, login, unit post, Entrée progression, parents linked (first name),
  existing parent with a different family (letters-only/containment), parent phone/email missing (last 7 digits),
  household (address / main email / parents situation), possible duplicate (name + DOB), same-account siblings not
  linked, declared sibling not linked, matricule. Tested on a dev copy: fixed code → only the review items remain.
- **Conversion fixes (`SendDemandeResponses`)**: (1) all children converted for one account (this send + earlier
  sends) + CG-confirmed existing siblings → ONE SiblingGroup (was only when an existing sibling was named);
  (2) a REUSED existing guardian gets the demande's phone (`SamePhone` = last 7 digits) / email if missing (was:
  contacts only added to NEW guardians). Patches **039** (link same-account siblings) + **040** (copy missing parent
  contacts) fix data already converted on prod (both idempotent; dev: 10 families linked, 33 phones + 4 emails).
- **Preview warning**: an accepted child matching an existing member (normalized name + DOB) → « Déjà membre(s) du
  groupe … deuxième fiche ». Dev copy had 6 such duplicates (re-enrolled existing members) → merge in Fratries → Doublons.
- **« The demande wins »** (user rule, 2026-10-08): a reused existing guardian takes the demande's last name /
  profession / profession domain (and deceased) when given; patch **041** applies it to families already converted
  (dev copy: 75 parents). Merge dialog (Fratries → Doublons): `DuplicateMemberDto.FromDemande`; with one demande
  file in the group the default keeper is the OLDER file and every differing field defaults to the demande file's
  value except login / SDL card / photo (`KEEPER_OWNED`). Then « Envoyer l'accès » sends the old identifiant.
- **Merge login fix** (`MemberMergeService`): a kept login that was switched off (e.g. patch 022 orphan cleanup) is
  switched back on when a merged-in login was active — else the person had no working login.
- **Late-joiner rule refined** (`DocumentCampaign.ForMemberAsync`): in the campaign = file created by the deposit
  deadline AND a current post started by then; else upload open (covers a returning member merged into an old file).
  Verified: merged returning member + new member open, existing member closed.

### « Déjà membre ? » on demandes (2026-10-08, DEV until deploy)
- `Application/Demandes/DemandeMemberMatch.FindAsync` (computed live, batched): a demande matches an existing member on
  the SAME birth date + full name (accent/case/space/hyphen-insensitive, or first/last swapped) OR same last name +
  close first name (contains / ≤2 letters) OR same last name / first name + a parent phone (last 7 digits) / email in
  common; apart from an identical full name both genders must agree (twins). Its own converted file is excluded.
  Used by the review projection (`DemandeReviewDto.MemberMatch`), the send preview and the submit notification
  (title « Nouvelle demande — déjà membre ? »).
- Only the CG's answer is stored: `Demande.MemberMatchId` + `MemberMatchStatus` (Confirmed / Rejected), migration
  `AddDemandeMemberMatch`. `POST /demandes/{id}/member-match/confirm|reject {memberId}`, `DELETE …/member-match`
  (demande.manage + group manager). Confirm refused if another demande of the year already holds that member.
- **Send with a confirmed match** (`SendDemandeResponses`): no new file — the existing member is updated (demande wins
  on every field it gives), missing contacts added, the demande address becomes primary, the demande's père/mère
  update the member's existing père/mère when not matched by contact, youth posts in other units end on the start
  date (maîtrise posts kept), no duplicate post / Entrée, the existing login is reactivated with a new activation
  token and the acceptance email gives the OLD identifiant.
- **Confirm after the send** (a second file exists): `IMemberMergeService` merges the new file into the existing one
  (demande values win; existing identifiant, SDL card, photo kept), then `SendAccessEmailsCommand` emails the access.
  Reject after the send also tombstones the pair in Doublons. MemberMergeService now keeps the fratrie (keeper joins
  the loser's sibling group).
- UI: `components/admin/member-match-card.tsx` in the demande drawer, `MemberMatchBadge` in the list, filter
  « Déjà membre ? (à vérifier) »; hooks in `services/demande-member-match-service.ts` (kept out of the entry chunk).
  Account-menu « Mes appareils » dialog is lazy-loaded (entry 451 → 438 KB).

### Active members who send a demande — « Déjà membre » (2026-10-08, DEV until deploy)
- New persisted `DemandeStatus.AlreadyMember`. « Déjà membre ? » → « Même personne » on a member with an ACTIVE post, demande
  not sent yet → status AlreadyMember (unit / notes / « refus voulu » cleared). `ConfirmMemberMatchResult.AlreadyMember`.
  « Annuler » (clear the match) puts it back to Submitted. Former members keep the old behaviour (file reused, email).
- `SendDemandeResponses`: AlreadyMember demandes go through the same fiche update as a reused member (demande wins on
  fields, contacts, address, parents) then STOP — no post change, no Entrée, no login change, no email; demande marked
  sent + CreatedMemberId = the member; counted in the fratrie declaration. Result/audit carry AlreadyMembers.
- Active member ACCEPTED into a unit he isn't in (confirm keeps Approved; or set aside then « Accepter ») → the send
  moves him like a reused member (other youth posts end on the start date, new post + Entrée if missing, listed in that
  unit's CU Excel) but skips the login/token and the email. A refusal for a confirmed active member sends no email.
  Tested on a DB copy (Nicolas T3 → T10: T3 ended 2026-10-08, T10 started, token untouched, 0 family email).
- Counted as decided (send gate, rentrée progress, reminders, applicant view after the send = « Déjà membre du groupe »
  result page). Preview: own line + a warning when a REFUSAL would go to the family of an unanswered active match.
- Tested on a DB copy: 3 active matches set aside, posts unchanged (T3/T10/R2), 0 email to those families, classe
  updated; 160 accepted / 81 refused / 252 emails (241 families + 11 chefs). Excel export shows « Déjà membre ».

