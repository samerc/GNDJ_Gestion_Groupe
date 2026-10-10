# Ops, security, performance & audits

Deploy, monitoring, errors/logging, security & pentest, validation, performance, audit log, dependency updates, docs.

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

### Security & Performance Audit (Complete — 2026-06)
- [x] FIXED CRITICAL: global EF `NoTracking` default silently broke ALL update handlers (returned
      204 but never persisted) — reverted; list queries already project to DTOs
- [x] FIXED CRITICAL: broken access control on UpdateMember, DeleteMember, CreateAssignment
      (privilege escalation), UploadPhoto, CreateMemberProgression — all now check
      IsSuperAdmin || own || authorized-unit
- [x] FIXED CRITICAL: auth rate limiter was GLOBAL (10 logins/5min system-wide) → now per-IP (100/min)
- [x] FIXED: all member-data access checks now require an ACTIVE assignment (a.EndDate == null) —
      a CU can no longer see/edit a member who moved to another unit
- [x] Alumni view: `GET /members?alumni=true&unitId=` shows former unit members, identity only
      (email/phone withheld); full detail/docs/cotisations stay blocked
- [x] PERF: bcrypt WF12→WF10 + concurrency semaphore (2-core box); refresh token O(N) bcrypt scan
      → SHA-256 indexed lookup; response compression (gzip/brotli); per-IP connection pool
- [x] Load test: 100 concurrent logins went from 10/100 success (median 52s) to 100/100 (median ~13s,
      sequential 168ms). NOTE: server has only 2 CPU cores — production should use 4+.
- [x] Verified: document verification workflow (upload→pending→approve/reject+notes), cross-unit
      review/download/matrix all blocked, file magic-byte validation, IDOR on uploads blocked

### Input-validation hardening (Complete — 2026-06)
- [x] Shared `ValidationExtensions` (Application/Common/Validation): `.NoHtml()` (rejects `<`/`>`),
      `.HexColor()`, `.StrongPassword()` (8–128 + upper/lower/digit) — reused across validators.
- [x] Added validators where missing: ALL Guardian writes (were unvalidated), Update Phone/Email/Address,
      Update ScoutStage/Badge/UnitTypeProgression (PathType allowed-set restored), Bulk Propose/Review passage
      (NotEmpty + ≤1000 list cap).
- [x] UpdateSetting validates Value against the setting's ValueType (number/boolean/json/json_array) + 10k cap.
- [x] UpdateSecurityProfilePermissions rejects permission strings not in Permissions.All. (System profiles stay
      editable — that's the intended admin feature.)
- [x] Unified password policy (StrongPassword) across Register/Reset/Change/ApplicantRegister; rate-limited
      reset-password, change-password, /auth/refresh, applicant refresh/verify-email/resend-verification.
- [x] Free-text caps (MaxLength) + NoHtml on all member/guardian/assignment/config notes & descriptions
      (were unbounded `text`); colors hex-validated; ages/years/ranks/displayOrder range-checked; AgeMin≤AgeMax.
- [x] ApiKey scopes whitelisted + expiry future-check; SetMemberCustomFieldValue validates value vs FieldType
      (number/boolean/select-options).
- [x] Frontend: register confirm-match + length, password min 8 (reset/change), cotisation inline amount>0,
      member-edit + guardian-edit required-field guards.
- [x] Second sweep (2026-06-14): re-audited ALL ~64 mutating commands vs their validators. Added the last
      missing ones — LoginApplicant (was 500 NRE on null email → now 400), RequestPasswordReset, RefreshToken,
      RefreshApplicantToken, VerifyApplicantEmail (NotEmpty + email/length caps), TogglePassage + SendDemandeResponses
      (ScoutYear NotEmpty + ≤20 + `^[0-9\- ]+$`). Every input command now has an AbstractValidator OR equivalent
      in-handler checks (UpdateSetting, UpdateSecurityProfilePermissions). Live-tested 400/200.
- [ ] Minor cosmetic (deferred): export `Format` silently defaults to Excel on invalid value; UpdateAssignment
      bad Unit/Role FK returns 500 not 400 (FK still protects integrity). Not security issues.

### Injection / XSS audit (Complete — 2026-06-14)
- [x] SQLi: swept all of `src` — the ONLY raw SQL is the advisory lock (`SELECT pg_advisory_xact_lock({0})`),
      parameterized with a hardcoded `long` constant (not user input). Everything else is EF Core/LINQ →
      parameterized. No string-built SQL, no `FromSqlRaw`/`ExecuteSqlRaw` with user data anywhere.
- [x] XSS (frontend): zero `dangerouslySetInnerHTML` / `innerHTML` / `eval` / `document.write` in client/src —
      React auto-escapes all rendered content. No user-controlled `href`/`window.location` (no `javascript:`
      scheme vector). TipTap renders template HTML via ProseMirror, not raw injection.
- [x] XSS (email sink): `EmailService.ReplaceVariables` was substituting values into the HTML body raw
      (`IsBodyHtml=true`). Now HTML-encodes every substituted value for the BODY (WebUtility.HtmlEncode;
      admin-authored template markup left intact), subject left verbatim (plain text). Defense-in-depth at the
      sink covers ALL templates regardless of which field feeds them.
- [x] Decline reason (`DecideDemandeCommand.DecisionNotes`, emailed as `{{reason}}`) was the one emailed
      free-text field lacking `NoHtml` — added it (now rejects `<`/`>` like every other notes field). Live-tested 400.
- [x] File uploads (verified intact): magic-byte validation (PDF/JPG/PNG headers), `Path.GetFileName` strips
      directory components, download/zip enforce `Path.GetFullPath` + `StartsWith(uploadsRoot)` traversal guards,
      zip entry names sanitized.

### Field-level validation audit (Complete — 2026-06-14)
Per-field sweep of every data-accepting command against 6 criteria (type / string-length / number-range /
date-validity / string-enum allowed-set / array-count). Type & date-format are enforced by ASP.NET JSON model
binding; the real gaps were string-enums (stored as strings, not C# enums) and uncapped lists. Fixes:
- [x] Member `Add*` validators (AddPhone/AddEmail/AddAddress) brought to parity with their `Update*` siblings —
      were missing length caps + NoHtml on CountryCode/Type/Address/Country/City/Details.
- [x] Added missing validators: FinalizePassages (ScoutYear), ReorderScoutStages + ReorderBadges (OrderedIds
      count ≤1000), GenerateExportQuery (Format must be excel/csv — fixes the silent-Excel-default note;
      Columns count ≤100 + element length; ScoutYear cap), UpdateSecurityProfilePermissions (Permissions count ≤500).
- [x] String-enum allowed-sets: EmailTemplate.Module (new `EmailTemplateModules.All`, synced to frontend
      MODULE_OPTIONS), DemandeInput.Gender (Masculin/Féminin), applicant scout-relation Status
      (CurrentInGroup/AncienInGroup/OtherGroup). Guardian/relation Relationship left free-text (accented values)
      but now length-capped + NoHtml.
- [x] Array caps: SaveApplicantHousehold Guardians ≤20 / ScoutRelations ≤50; Cotisation Payments ≤50.
- [x] Misc: SMTP Username/Password/FromName/FromEmail length caps; EmailTemplate BodyHtml ≤100k + Variables ≤5k;
      CreateMemberProgression Date future-ceiling + Notes NoHtml.
- Confirmed-OK (no change needed): all org-config commands (Associations/UnitTypes/Units/Teams/Roles/Assignments),
      Progression/Badge/UnitTypeProgression/CustomField, Documents/DocumentTypes, ApiKey (scopes whitelisted +
      expiry future-check), Auth, ReviewDocument/DecideDemande/ReviewPassage status enums, Currency. Live-tested
      400s (length, module, perms-count, export-format, finalize-year) + positive control (valid phone → 201).

### Abuse-pattern defenses (Complete — 2026-06-14)
- [x] (1) Form-submission throttle: new `forms` rate-limit policy = 10/min partitioned by user (sub/applicant_id
      claim) else IP → 429 until next window. Applied to public/abuse-prone write forms (auth register,
      forgot/reset-password, applicant register, resend-verification). Deliberately NOT on authenticated admin
      data-entry (a CU may add >10 members/min); login/refresh stay on the 100/min `auth` policy (shared NAT).
- [x] (2) `AbuseDetectionMiddleware` (Api/Middleware) scans JSON POST/PUT/PATCH bodies for high-confidence
      attack signatures — script/event-handler/XSS, multi-token SQLi (`union select`, `' or 1=1`, `drop table`,
      `xp_cmdshell`, quote+comment, etc.), and any >10k non-whitespace token — LOGS via Serilog (Warning →
      also hits application_logs) with reason/method/path/IP/user, then 400. Conservative (multi-token only, never
      bare keywords) to avoid false positives; skips `/email/templates` (admin authors legit HTML). DB is already
      fully parameterized + React auto-escapes, so this is logging/defense-in-depth.
- [x] (3) Honeypot: hidden `website` field on all 6 public forms (login/register both apps, forgot/reset-password)
      via reusable `<HoneypotField>` (off-screen, tabIndex -1, aria-hidden). Middleware rejects any body with a
      non-empty `website` (no real form has that field). Frontend sends it in the payload (backend ignores the
      unknown prop; middleware reads it raw).
- [x] Live-tested: honeypot→400, SQLi→400, script→400, clean login→200 (no false positive), 10 forgot-password
      OK then 11th→429, and all three attack types confirmed in the Serilog file + DB sink.

### Query optimization / over-fetch audit (Complete — 2026-06-14)
Fanned out a per-area read-only audit (over-fetch columns/rows, N+1, dead Includes, client-side eval, missing
pagination). Codebase was already mostly clean (list/detail queries project to DTOs + paginate; mutation handlers
correctly load tracked entities — do NOT add AsNoTracking, a global one previously broke updates). Real fixes:
- [x] Admin dashboard: was loading ALL members (~2.4k rows) to count in memory → gender/total via SQL `GroupBy`,
      `withoutUnit` via `CountAsync`, and only the ACTIVE subset (Id+DOB) materialized for the reused downstream
      logic (unpaid / missing-docs / age-groups). paidMemberIds → HashSet.
- [x] Unit documents matrix: `Include(Member)+Include(Team)` full entities and full `MemberDocument` rows →
      projected to slim records (only the cell fields). Biggest per-page query.
- [x] Cotisation summary: two `MemberCotisations` round-trips → one projected query (paid = cotisation record
      exists, unchanged). Dropped dead `Include`s in GetUnpaidCotisations + GetExpiringDocuments.
- [x] Passage list queries (×2): removed 7 dead `Include`s each (EF ignores Include when a final `.Select`
      projection follows — they only triggered warnings + wasted loads).
- [x] GetUnitOccupancy: two `ToList().GroupBy().Count()` → SQL `GroupBy`. DeleteUnitType: `Include(Units)` +
      in-memory `.Any()` → `AnyAsync`.
- Left as-is (low value / risky): dead Includes in GetUnits/Teams/Assignments list queries (EF already ignores
      them), export's redundant DB-side team ordering, DeleteMember's small assignment include, GetPassageSummary
      (Include is used, not a projection; bounded set). Live-tested all 5 rewritten endpoints → 200 + correct data.

### Production deployment + load test (2026-06-27/28)
- **LIVE at https://new.gndj.org** (temp domain → gndj.org later) on a separate server: 8-core AMD EPYC,
  24 GB, Windows Server 2025, PostgreSQL 18, **behind Cloudflare**, IIS in-process at `C:\inetpub\www\gndj`,
  HTTPS via **win-acme** (Let's Encrypt auto-renew). Full state in memory `project_production_deployment.md`.
- **TLS/ACME fix:** `Program.cs` serves `<ContentRoot>/.well-known/acme-challenge` (extensionless, no
  dot-dir exclusion) BEFORE the SPA fallback — required so win-acme HTTP-01 issuance/renewal works on the
  single in-process SPA site. **`Cloudflare.Enabled` must be true** in prod appsettings (CF IP ranges in
  base config) for correct per-IP rate limiting + client IPs.
- **Docs/scripts:** `docs/DEPLOYMENT.md` is the SINGLE deploy guide (Part I = copy-paste first install Parts
  1–8; Part II = ops/reference: updates, build-the-package, domain switch, backups, perf tuning, Cloudflare).
  INSTALL_GUIDE.md was merged into it (2026-06-28). `deploy/update.ps1` (one-command build+ship, remembers
  target), `deploy/reset-to-import.ps1` (DESTRUCTIVE test reset to a pg_dump snapshot). Site path is
  `C:\inetpub\www\gndj` everywhere.
- **Load/functional test** (`temp/test_gndj.py`, browser UA — Cloudflare 403s python-urllib): **35/35 pass**.
  Reads ~250 ms / ~33 req/s @ 50 concurrent; logins bcrypt-bound ~1.4 s (intentional, WF10). 8 cores ample.
- **Bugs found + fixed:** (1) `GET /cotisations/unpaid` 500 — EF can't translate `Distinct()+OrderBy()` over
  a projected DTO → materialize + `DistinctBy`+`OrderBy` in memory (pre-existing; broke CG impayés list).
  (2) Login/Refresh did 3–5 redundant DB round-trips → one shared `Auth/Common/AuthAccess.LoadAsync`
  (behaviour preserved). `GET /demandes` needs `?scoutYear=` (not a bug).

### Performance optimization pass (2026-06-28)
Full-stack audit (4 parallel agents: DB/EF, backend API, frontend, infra) + fixes. Core was already healthy
(compression, per-IP rate limiting, bcrypt gate, prior over-fetch fixes hold). Shipped:
- **Static-asset cache headers (code):** `Program.cs` `UseStaticFiles` `OnPrepareResponse` → `/assets/*`
  (Vite content-hashed) `max-age=31536000, immutable`; everything else (incl. index.html) `no-cache`. Was a
  documented manual TODO never implemented; lets browser + Cloudflare edge skip revalidation. (DEPLOYMENT Part 16.)
- **DbContext pooling:** `AddDbContext` → `AddDbContextPool`. Required making the two EF interceptors
  (Auditable/SoftDelete) + `ICurrentUserAccessor` **singletons** — they're stateless and read the current user
  lazily from the singleton `IHttpContextAccessor` at SaveChanges time, so pooling is safe. Verified login/
  refresh (SaveChanges through the audit interceptor) still persist on the pooled context.
- **Member search index (B4):** search did `unaccent(lower(name)) LIKE '%term%'` = seq scan/keystroke. Added
  migration `AddMemberSearchTrgmIndex`: `pg_trgm` + an IMMUTABLE `f_unaccent` wrapper (unaccent(text) is only
  STABLE so can't be indexed) + two GIN trgm indexes on `f_unaccent(lower(first_name/last_name))`. EF DbFunction
  `DbFns.Unaccent` repointed from `unaccent`→`f_unaccent` so the query matches the index. Verified live: EXPLAIN
  uses `Bitmap Index Scan on ix_members_firstname_trgm`, accent search ("rhea"→Rhéa) still correct.
- **N+1 in passage batch ops:** `FinalizePassages` (ran a per-passage assignment query INSIDE the advisory-lock
  txn) + `BulkProposePassage` (3 queries/member) now batch-load assignments/existing-passages/member-names up
  front into dicts. Shortens lock-hold time.
- **Guardian dedup indexes:** migration `AddGuardianContactIndexes` adds btree on `guardian_emails.address` +
  `guardian_phones.number` — speeds demande "send responses" `FindExistingGuardian` (was seq-scanning ~5k rows
  per lookup in the send loop) + guardian dedup.
- **Frontend route code-splitting:** `App.tsx` all ~60 pages `React.lazy` + `Suspense`; `vite.config.ts`
  `manualChunks` (function form). Result: TipTap (**434 kB/135 kB gz**) is its own `editor-vendor` chunk loaded
  only by the 3 CMS routes; `dnd-vendor` 58 kB separate; each page an 8–48 kB chunk. Regular users no longer
  download the editor/admin code.
- **MemberPhoto lazy-load:** `IntersectionObserver` (200px rootMargin, one-shot) gates the authenticated
  blob-XHR fetch so only on-screen avatars load — kills the photo-session request storm (was up to ~150
  full-res fetches on mount).
- **Misc:** `refetchOnWindowFocus:false` (CRUD app, not a live feed); `GET /health` liveness (for IIS AppInit
  warm-up + monitoring); email channel `Unbounded`→`Bounded(10_000)` (SMTP-outage memory safety).
- **Ops scripts (run on server):** `deploy/tune-apppool.ps1` (idle-timeout 0 / no periodic recycle /
  AlwaysRunning / preload — kills cold starts) and `deploy/pg-profile.ps1 -Profile High|Low` (seasonal PG memory
  toggle for the **shared** box: High Sept–Oct, Low rest of year; ALTER SYSTEM + restart). DEPLOYMENT Part 15.
- **Evaluated + deliberately SKIPPED:** broad settings-cache refactor (hot paths read no settings; the one
  frequent reader already batches; batch handlers must read fresh for txn correctness) and frontend bulk-settings
  (the `GET /settings` list endpoint is admin-only by design — per-key reads stay open to all users). Async
  Serilog sink deferred (needs a package; PG sink is already Warning+ only).
- Builds clean (dotnet Release 0 warn, tsc+vite OK), 4 tests pass, live smoke-tested. NOTE: the trgm + guardian
  migrations apply on next prod startup (idempotent SQL).

### Post-publish polish 2 (2026-06-29) — all on main, NOT yet deployed
- **Assignment history — full cross-unit view:** `GetAssignmentsQuery` was unit-scoped, so a CU only saw a
  member's assignments in their OWN unit (hiding e.g. their Ronde years). Now, when querying a specific member
  you're allowed to see (own record, or a member active in one of your units — same rule as the member detail),
  it returns the FULL history across all units; plain list views keep strict unit-scoping.
- **Collapsed-history migration bug (big):** WEBDEV `UniteFonc` rows with `EnCours=0` + a real start but a
  BLANK `DATEFIN` imported as zero-day assignments (end=start), erasing real durations (815 rows / 682 members;
  + 203 dateless junk / 157 members). Migration STEP 11 reworked: group per member, carry an open-ended
  historical function to the NEXT function's start (incl. the active row), Oct-1 fallback for a last function,
  skip dateless junk (BP-compatible). LIVE DEV DB fixed in place (backup `_bak_assign_collapse_20260629`):
  205 junk deleted, 451 extended to next-assignment, 442 alumni-last extended to next Oct 1, 18 same-unit+role
  duplicates deleted; 50 zero-day kept (real prior branches like Noyau, 1-day markers for members to correct).
  Detail in memory `project_migration_cleanup_todo.md`. NOTE: a member's pre-WEBDEV history that was never
  digitized (e.g. Karen ABI HAIDAR's Ronde/Compagnie) is unrecoverable.
- **Tooltips:** new reusable shadcn `Tooltip` (`@radix-ui/react-tooltip`) + one-line `<Tip content>` wrapper;
  `TooltipProvider` in AppLayout. ~100 French tooltips on icon-only/action buttons across member, CU, CG and
  super-admin views (replaced the few native `title=`).
- **Reports — school codes + Matricule:** new backend `SchoolCode` resolver (reads `member.school_codes`,
  accent/case-insensitive) → roster (PDF) and export (Excel/CSV) show CNDJ/CSG etc.; schools WITHOUT a code
  keep their FULL name (no acronym fallback on the backend). Renamed the report "N° carte" column → "Matricule"
  (it holds the internal matricule post card-number split) in both services + the column pickers.
- **Passage page:** search box + status filter (À proposer / En attente / Approuvé / Quitte / Rejeté) +
  click-to-sort headers; added a Fonction column (was only Équipe); Unité now shows the short-code (C3) not the
  full name (resolved from the units list). Filters/sort apply to the mobile cards too.
- **Member name fix:** IDMEMBRES 1931 = Angelina ELIAS (WEBDEV had NOM/PRENOM swapped) — live DB + a
  `nameOverrides` map in the migration tool.
- **Documents zip friendly error:** zip is a blob, so the backend's JSON 400 ("no documents") came back as an
  unreadable Blob → always generic error. New `parseBlobError` (client/src/lib/error-utils) reads the blob's
  JSON; the empty-unit case now shows a friendly info toast, real failures an error toast with the real message.
- **Demande terms & conditions (configurable + accepted at registration):** new `demande.terms` setting
  (textarea in admin settings; exposed via `ApplicantConfigDto.Terms`). When set, the applicant must tick
  "J'accepte" on the REGISTER page to create an account (gated client + server in `RegisterApplicantCommand`);
  acceptance recorded on `ApplicantAccount.TermsAcceptedAt` (migration `AddApplicantTermsAccepted`). New rentrée
  template task "Mettre à jour les conditions d'inscription" blocks "Ouvrir les inscriptions". (Placement: at
  account registration, not per-demande — user's choice.)
- **Demande wizard: Profession (texte libre)** was wrongly a dropdown → now a free-text `<Input>` (the managed
  list stays on the separate "Domaine" field).
- **Demande: auto-link a "current member" relative:** `SaveApplicantHousehold` matches a `CurrentInGroup`
  scout relation (typed name, narrowed by chosen unit) against active members; a single confident match sets
  `ApplicantScoutRelation.RelatedMemberId` (field already existed). Ambiguous/none → null. No public member
  search exposed. **CG review now surfaces the match (2026-06-29):** `GetDemandesForReview` batch-loads each
  auto-matched member's name + current active unit into `ApplicantScoutRelationDto.RelatedMemberName/Unit`
  (CG-only — left null in the applicant portal path for privacy); the review drawer "Proches scouts" cards show
  a green "Lié à un membre : Nom (Unité)" chip so the CG can see/confirm the link.

### Production deploy + post-deploy data fixes (2026-06-29)
- **DEPLOYED the current `main` to prod** (new.gndj.org). Prod has no .NET SDK/Node, so we built the package on
  the dev box (`deploy/publish.ps1`) and shipped the ship-only half (`deploy/deploy.ps1`, run elevated — the IIS
  folder needs admin). Restored the clean dev dataset via `deploy/reset-to-import.ps1` (members=2493), ran
  `tune-apppool.ps1` + `pg-profile.ps1 -Profile Low`. NOTE: the prod clone is at
  `C:\Users\samer\Desktop\Projects\GNDJ\GNDJ_Gestion_Groupe`; the SDK + Node were installed there so future
  deploys CAN `update.ps1 -Pull` (but `npm ci` skipped devDeps under NODE_ENV=production — see deploy-script fix).
- **Deploy-script fixes:** `publish.ps1` now `npm ci --include=dev` (devDeps — TypeScript/Vite — were skipped when
  NODE_ENV=production, breaking `tsc`); `pg-profile.ps1` verify-hint quoting fixed (backtick, not backslash — it
  printed a bogus `SHOW` CommandNotFound after applying settings).
- **Maîtrise-on-youth-team fix:** a maîtrise (leadership) role must never sit on a youth sizaine. 18 active leaders
  carried a youth équipe (e.g. an Assistante de Compagnie under "Aquila") — moved each to their unit's existing
  **Maîtrise team** (every affected unit had one; 43 other leaders were already correct). Live dev DB fixed (backup
  `_bak_maitrise_team_20260629`). **Migration tool patched** (`tools/Migration`): now populates `is_maitrise` on
  roles (was never set) and routes a maîtrise role's assignment to the unit's Maîtrise team (or none) in BOTH the
  main UniteFonc loop and the BP roster override — so a re-import won't reintroduce it.
- **Classe overhaul:** the `member.classes` setting was still the EB-style seed while members used ordinal grades.
  Canonical list set to `8ème,7ème,6ème,5ème,4ème,3ème,2nde,1ère,Term,Université`. **Promoted every member up one
  grade** (atomic CASE: 8ème→7ème … 1ère→Term, Term→Université; junk U→Université, 4th→3ème, 5rd→4ème; 2293 rows)
  and **cleared `section` for all** (1604 rows). Backup `_bak_classe_promote_20260629`. Run from a UTF-8 file via
  `psql -f` (PowerShell here-string pipe mangles accents; and `settings` has no `updated_at` column).
- **Demande 6ème restriction:** new `demande.excluded_classe` setting (default `6ème`, editable; auto-seeds via
  SeedMissingSettings). `ApplicantConfigDto.ExcludedClasse` exposes it; the wizard hides that grade from the Classe
  dropdown + shows "Un enfant en {classe} ne peut pas s'inscrire."; `SubmitDemande` rejects it (defense-in-depth).
- **CG review surfaces the auto-linked relative** (commit daea8af) — see the auto-link entry above.
- **Full data-integrity checkup + fixes (dev DB, all backed up `_bak_*_20260629`):**
  - **#1 Schools dropdown rebuilt:** `member.schools` had only 2 entries while 33 were in use (Saint-Grégoire =
    174 members, USJ, AUB, GLFL…). Set the setting to all 33 in-use schools (CNDJ first). Only the "Autre"
    placeholder now sits outside the list. Seed `member.classes` default also realigned (commit 7124895).
  - **#2 149 negative-duration assignments** (end < start): root cause = migration `start = row.Start ??
    importToday` gave blank-start rows the import date (2026-06-24) while keeping an old end. Collapsed
    `start = end` (valid historical marker). **Migration tool fixed** (commit 403ef06): `row.Start ?? row.End
    ?? importToday`.
  - **#3/#4 overlapping active assignments:** BP roster is authoritative → BP row (start 2026-06-24) wins; the
    exact-dup older row (Angela KASSIS) soft-deleted, superseded older roles (Giorgio RIZK CG vs old Assistant,
    Maria BOU FADEL) closed as of the BP date. Samer CHEAIB left multi-active (two group roles, no BP row — review).
  - **#5 role↔unit-type typing (111→6):** migration kept the first unit_type per role code, so ACN/CN/CAR were
    typed Feu and JEM mis-typed → they didn't appear in the role dropdown for their real units. Re-typed ACN/CN/CAR
    → Noyau, JEM → Jeunes en Marche. Residual 6 = Caravelle/JEM on Feu units (left for manual review).
  - **Confirmed OK / known (no action):** 50 zero-day markers, 177 alumni orphans, 2 null matricules, 1 empty
    gender (Admin Système), 129 null DOB, Metn/Keserwan free-text regions, 1 US address, 45 disabled merge-loser
    user rows (login already off). Code audit: member/demande forms read settings (no hardcoded classe/school
    lists); `section` still shown in forms/exports though now cleared (optionally hide later).
- NOTE: these data fixes (maîtrise team, classe promotion, section clear) + the demande code + setting live on
  **dev only** so far — prod got an EARLIER snapshot/build. A FINAL prod sync is pending: re-ship the code (for the
  excluded-classe feature) + a fresh `pg_dump`/restore (for the maîtrise + classe data). Held at the user's request.

### Dependency refresh + dead-code/dup cleanup (2026-07-06)
- [x] **Dependency update (pre-launch, all incl. majors):** NuGet — Swashbuckle 10.2.1→10.2.3, AutoMapper
      16.1.1→16.2.0, QuestPDF 2026.6.0→2026.7.0, Microsoft.NET.Test.Sdk 18.6.0→18.7.0. npm — ~25 in-range
      bumps + 3 majors: react-router 7.18→**8.1.0** (zero code changes — only stable core APIs used),
      @types/node 24→26, lucide-react 1.20→1.23. Fixed the one moderate advisory (dompurify ≤3.4.10
      ALLOWED_ATTR pollution) via 3.4.11. Both stacks: 0 vulnerabilities, build clean, 4 tests pass.
- [x] **Dead-code sweep (2 parallel audit agents, all findings verified before deletion; net −1,900 lines):**
      - Deleted 8 dead frontend files (0 external refs each): `pages/landing.tsx` (superseded by public/home),
        `pages/members/detail.tsx` (superseded by the rebuilt members/index panel), `pages/teams/index.tsx` +
        `pages/assignments/index.tsx` (now inline), `pages/register.tsx` + `components/auth/register-form.tsx`
        (public registration disabled), unused shadcn primitives `ui/resizable.tsx` + `ui/calendar.tsx`.
      - Deleted the never-injected generic-repository/UoW scaffolding: `IRepository`/`GenericRepository`/
        `IUnitOfWork`/`UnitOfWork` (4 files + 2 DI lines in `DependencyInjection.cs`; the whole app uses
        `IApplicationDbContext` directly). Removed dead `SmtpServerListDto`.
      - Removed `SettingsCacheService` **entirely** — it was a no-op (cache only `Invalidate()`d, never read;
        handlers read settings straight from the DbContext). Dropped its DI reg + the two `Invalidate()` call
        sites in `SettingsController` (the OutputCache eviction there stays).
- [x] **De-duplication:** backend — the identical `RemoveDiacritics` copied 3× (DemandeAdminHandlers, SchoolCode,
      CitiesHandlers) → one `Common/TextNormalization.cs` (`RemoveDiacritics` + `NormalizeKey`). Frontend —
      `formatDate` copied 3× (public home/news/news-article) → `formatDateLong` in `lib/utils.ts`; `computeAge`/
      `calculateAge` (members/index, passage) → shared `computeAge` in `lib/utils.ts`.
- **ESLint backlog CLEARED (2026-07-06):** the ~80 errors newly surfaced by `eslint-plugin-react-hooks@7`
      (React Compiler rule set — never enforced before the bump) are all fixed → **0 errors, 0 warnings**.
      Real fixes (no blanket rule-disabling): `no-unused-expressions` Set-toggle ternaries → `if/else`;
      `refs`-in-render (`hasLoadedOnce` search-box latch, 4 list pages) → derived from the search term (ref
      dropped); `purity` (`useRef(Date.now())`) → stamp in the mount effect; `error-boundaries` (JSX in
      try/catch) → parse in try, build JSX outside; `static-components` (ToolbarButton, SortHead defined in
      render) → hoisted to module scope (SortHead takes sort/onSort props); ~26 `set-state-in-effect` →
      **render-phase reset** (React's prev-value-tracking / derive pattern) for the pure state-syncs, with a
      justified inline disable kept ONLY on 4 genuine side-effecting effects (camera stream, member-photo blob
      fetch, one-shot email-verify POST, multi-source demande-wizard hydration); `preserve-manual-memoization`
      → memo dep `[data?.value]`→`[data]`; unstable `all`/`occList` `?? []` fallbacks wrapped in `useMemo`.
      Config: `react-refresh/only-export-components` turned off for `components/ui/**` (shadcn co-locates cva()
      variants). Verified: eslint clean, `tsc`+`vite` build clean.

### Performance audit + optimizations (2026-07-10)
Component-wide audit (2 parallel agents: backend handlers/services + frontend queries/render). Codebase was
already healthy (prior perf passes hold; NO remaining sequential per-item network loops — bulk ops already use
Promise.all/Task.WhenAll). Fixes shipped (all verified live):
- **Email batch sends (High):** `EmailService.SendAsync` re-read the template + SMTP server + `override_recipient`
  from the DB on EVERY email; a bulk send (demande "Envoyer les réponses" fans out account+guardians+child per
  demande) = hundreds × 3 identical reads, sent one-at-a-time. Now the resolved template/SMTP/override are cached
  as plain records in the shared singleton `IMemoryCache` (60s template TTL, 15s override TTL — missing templates
  throw and aren't cached), and `EmailQueueBackgroundService` drains with **bounded concurrency** (SemaphoreSlim=5,
  each send its own scope+DbContext+SmtpClient) instead of strictly serial — SMTP latency dominates, so a batch
  now drains in ~1/N wall-clock. Verified: a 3-recipient forgot-password burst → all delivered via smtp4dev.
- **SendDemandeResponses (Med):** the approved-member conversion loop did per-item queries INSIDE the advisory
  lock (base role per unit ×2-3 queries, `FindExistingGuardian` ×1-2 per applicant guardian, `UniqueEmail`'s
  `AnyAsync` per member). All three are now **batch-loaded up front** into dicts (base role per unit type;
  existing guardians by email/phone; all taken usernames) — the locked transaction issues a handful of queries
  instead of O(members+guardians). Verified live end-to-end (isolated throwaway year): demande → member M-1327 +
  login + Meute assignment w/ base role L + linked guardian, then fully cleaned up.
- **Admin dashboard (Med):** scanned `member_documents` twice (GroupBy for the "missing docs" tile + again for the
  per-unit breakdown). Now computes the per-member doc-count dict ONCE over the active-member set (unit members
  are a subset) and reuses it. Verified: totals unchanged.
- **#2 Member detail panel (Med):** opening a member fired 5 secondary list queries (guardians/assignments/
  documents/cotisations/progressions) just to render tab-count badges. Counts are now **folded into
  `GET /members/{id}`** (`MemberTabCountsDto`, correlated subqueries — no extra round-trips), so the panel is ONE
  request instead of six on the app's busiest screen. Verified: counts `{famille,unites,documents,cotisations,progression}` returned.
- **Low:** passage `enabled`+`scout_year` read in one query (`PassageConfig.LoadAsync`, ×3 handlers); forgot-password
  emails now **queued** (off the request path) instead of inline blocking SMTP; photo-session `filter/find`
  memoized (up to 500 members); units/detail team-reorder swap → `Promise.all`.
- **Deliberately SKIPPED (net-negative / auditor-flagged):** roster/export parallelization (pooled DbContext isn't
  concurrent-safe — needs a 2nd scope, not worth it for an admin PDF); `AuditService`'s post-save write (deliberate
  audit-after-commit); bulk-cards' unit query (a legit 404 guard, not real redundancy); ≤100-item list sorts
  (auditor said "none required"). Builds clean (dotnet + tsc + eslint), key flows verified live. DEV until deploy.

### Pre-launch stress test + hardening (2026-07-13)
Ran a live load test (150-concurrent login storm, concurrent public reads/registrations, double-submit, bad-input
battery) against the running API + 3 parallel code audits (enrollment flow, concurrency/hangs, uploads/reports),
targeting the busiest week (September enrollment: non-technical parents hammering the demande portal). Fixes (all
verified live, committed; DEV until deploy):
- **DB constraint → clean 4xx** (`ExceptionHandlingMiddleware`): a `DbUpdateException` wrapping a `PostgresException`
  now maps SqlState → 400/409 (23505→409 "existe déjà", 23502/22001/23514→400, 23503→400) instead of an opaque
  500. This is the root fix — a parent double-clicking "S'inscrire" now gets **409** (verified), field overflows
  → 400, card-number collisions → retryable, etc.
- **Async bcrypt gate** (`PasswordHasher` → `HashAsync`/`VerifyAsync` with `WaitAsync` + `Task.Run`; `IPasswordHasher`
  made async; all ~10 callers awaited): a login storm no longer starves the thread pool. Verified: public reads
  during a 150-login storm went **1426ms → 317ms p50, 0 errors**. (ApiKeyMiddleware still BCrypt-direct — low vol.)
- **QuestPDF layout failure → 400** (middleware, namespace check): one member with pathological data no longer
  500s a whole trombinoscope/roster/cards report. Plus `GetInitials` null-guard (both PDF services).
- **Excel export** sheet-name sanitized (a unit named ".../..." with `/ \ ? * [ ]` no longer crashes ClosedXML).
- **Document download/zip**: `FileStream` open wrapped in try/catch (a file deleted/locked at download time →
  404 / skipped, not 500).
- **Email queue** logs a Warning when the bounded channel is full (was silently dropping mail during a big batch).
- **Doc upload limit is settings-driven everywhere** (`member-documents.tsx`): the "Formats … — Max N Mo" text,
  the `accept` attr, AND a new client-side size/type pre-check all read `documents.max_file_size_mb` /
  `documents.allowed_file_types` (via `useSettingValue`/`useSettingArray`, `GET /settings/{key}` is open to any
  auth user) — the on-screen limit always matches what the server enforces (was hardcoded "10 Mo" while the setting
  default is 5).
- Verified SAFE (no change): advisory locks (distinct keys, no deadlock pair, bcrypt/email outside the lock),
  email worker (timeout+retry+bounded concurrency, can't stall the app or OOM), rate limiting (per-IP w/ CF real
  IP), path-traversal + magic-byte upload guards. 150 concurrent → 0 crashes/timeouts even on the 2-core dev box.
- **OPEN go-live items (ops/decisions, NOT code)** — see memory [[project-email-golive]]: (1) DEPLOY this to prod;
  (2) **CLEAR `email.override_recipient`** or parents never get acceptance/decline mail (biggest enrollment
  blocker); (3) set an explicit **prod DB pool size** — recommend `Maximum Pool Size=150;Minimum Pool Size=5` in
  the prod connection string + Postgres `max_connections≥200` (default 100 could bottleneck at high concurrency);
  (4) `require_email_verification` will be turned ON for launch — that REQUIRES #2 (working email) first, else a
  parent whose verification mail never arrives is stuck (no admin manual-verify exists yet — consider adding).
  Forms rate limit (10/min/IP) confirmed fine (a parent can't fill a demande that fast).

### Ops hardening + activation-link access rollout (2026-07-18)
Launch-readiness batch (all on main, pushed; scripts + code — reaches prod on the next deploy).
- **Off-server backups + health monitoring (deploy/, script-only, run ON the prod server):**
  `backup-db.ps1` (nightly pg_dump → local + off-server cloud via **rclone** [OneDrive/Google Drive] +
  retention prune both sides + email status), `healthcheck.ps1` (pings the PUBLIC /health with a browser UA
  through Cloudflare; emails only on up↔down **state change**, tracked in a state file), `install-ops-tasks.ps1`
  (registers both as **SYSTEM** scheduled tasks), `ops-common.ps1` (config loader + SMTP alert sender). Secrets
  live in the gitignored `deploy/ops-alert.config.json` (example + `deploy/OPS.md` setup guide: `rclone config`,
  Zoho :587 STARTTLS for ops mail). Scripts are **ASCII-only** (PS 5.1 parses non-BOM files as ANSI, so
  box-drawing/arrow chars in comments broke the parser — learned the hard way).
- **"Envoyer les accès" — the login rollout tool (how existing members first sign in).** Sends each member
  their **username + a one-click set-password link** (activation email). REUSES the existing reset-token fields
  on `User` with a **30-day** expiry (rollout window); link = `/reset-password?token=…&email=…&setup=1` (the
  reset page switches to "Activez votre compte" wording when `setup=1`). No migration. Backend
  `Members/SendAccessHandlers.cs`: `GetAccessCandidatesQuery(unitId)` (unit's active members + login/email/
  last-login status) + `SendAccessEmailsCommand(unitId? | memberIds?, onlyNeverLoggedIn)` (batched contact-email
  resolver PrimaryContactEmail→own→guardian; stamps token, queues `account_activation`; returns a
  sent/no-email/no-account/skipped report). Endpoints `GET /members/access-candidates`, `POST /members/send-access`
  (perm **members.reset_password**, unit-scoped — CG all units, CU own). Frontend: new page **`/admin/send-access`**
  ("Envoyer les accès", sidebar Gestion) — unit picker → status table with per-row select + whole-unit send +
  "seulement ceux qui ne se sont jamais connectés" toggle + result summary; plus a per-member **"Envoyer l'accès"**
  button on the member panel (single resend). Seeded template `account_activation` (auth, idempotent via
  SeedMemberEmailTemplatesAsync). Run unit by unit, **Maîtrise first**. NOTE: the app only knows the mail was
  QUEUED — delivery/bounces are in the SMTP provider dashboard.
- **"Identifiant oublié ?" — self-service access recovery (login page).** A member/parent enters an email
  **on file for them** (own email / a linked guardian's email / primary contact email) → the backend emails
  THAT address each matching account's username + a set-password link (reuses `account_activation`, **7-day**
  token — shorter than the 30-day CG rollout). The email being on file IS the proof of ownership, so the
  response is **always generic** ("Si cette adresse est enregistrée…") — no account enumeration. **One family
  email → several accounts** (a parent's children): each gets its own clearly-named email. Backend
  `Auth/Commands/ForgotUsername/RequestMyAccessCommand.cs` (anonymous, FluentValidation email, `forms` rate-limit
  + honeypot), endpoint `POST /auth/forgot-username`. Frontend page `/forgot-username` + "Identifiant oublié ?"
  link under "Mot de passe oublié ?" on the login form. Verified live: `edmond.raad@gmail.com` (guardian on 5
  accounts) → all 5 tokens stamped w/ 7-day expiry; unknown email → same generic 200; honeypot → 400.
- **DNS finding (go-live blocker #3):** `gndj.org` SPF authorizes **Mailjet + Zoho** only; DKIM selectors
  `s1/s2` → **SendGrid**; DMARC `p=none`; MX Zoho. So DNS is NOT set up for **SMTP2GO/Mailgun** — sending via
  either now fails SPF + has no DKIM (→ spam). Each provider a category routes through MUST be added to DNS
  first. **Multi-SMTP routing already works** via `EmailTemplate.SmtpServerId` (bind demandes → SMTP2GO,
  auth/reset → Mailgun, etc.); `EmailService` uses the template's bound server else the oldest active one.
- Verified live: access-candidates (50 rows, inactive logins correctly flagged), single send → `sent=1` +
  token stamped w/ exactly 30-day expiry + template seeded; no real mail (dev SMTP off). Backend + tsc + eslint
  + vite build all clean. DEV until deploy.

### API data-minimization / over-exposure audit (2026-07-19)
Pre-launch sweep of what the API actually RETURNS (not access control — that was the 2026-07-09 IDOR sweep),
via 2 parallel audits (anonymous public surface + self-registered applicant portal) + a secrets check.
- **Secrets:** clean — every `PasswordHash`/`RefreshToken`/`PasswordResetToken` hit is an assignment or an auth
  comparison; none appear in a response DTO. `AuthResponse` returns the access/refresh tokens (intended);
  `MeResponse` exposes nothing sensitive. All controllers return DTOs, never raw EF entities.
- **Public surface (PublicController, anonymous): CLEAN.** Youth appear only as per-team **counts** (never named/
  IDed/photographed); the maîtrise is **name + role only** (no email/phone/photo/DOB). No member photo is served
  anonymously (content images are CMS-only, path-traversal-guarded). Public DTOs key on **slugs, not GUIDs** (no
  enumeration surface). Contact-form recipient + site-config are server-side/intended-public only.
- **Applicant portal (self-registered parents): one real leak, FIXED.** `ApplicantHelpers.ToDto` (the applicant's
  own `GET /applicant/profile`) returned the demande's **`Status` + `DecisionNotes` unconditionally** — so a parent
  could see the CG's **staged** Approved/Declined decision (and the decline reason) BEFORE the CG posts the batch,
  while it can still change (violates DemandeStatus's "decisions are staged, revealed when the batch is sent"). Fix:
  `ToDto` now withholds the decision until `ResponseSentAt` is set — a decided-but-unsent demande reads as
  **`Submitted`** with **null** notes; once sent, the real status + notes appear. (CG review DTO unaffected — that
  path SHOULD show the decision.) Verified live: staged Approved → applicant sees `Submitted`/no notes; after
  `response_sent_at` set → `Approved` + notes revealed. Also confirmed OK: `RelatedMemberName/Unit` stay null on the
  applicant path (CG-only), household-lookup requires the emailed code + returns only the matched family,
  ApplicantConfigDto is config/pick-lists only, applicant token fully isolated (no permissions/units).
- dotnet build clean. Backend-only (ApplicantHandlers.cs), DEV until deploy.

### Dependency update — vulns cleared + in-range refresh (2026-07-19)
`npm audit` flagged **2 high** vulns (fixed); backend NuGet had **0**. Result: both stacks 0 vulnerabilities.
- **Frontend:** `npm audit fix` bumped **react-router 8.2.0→8.3.0** (advisory GHSA-qwww-vcr4-c8h2, "RSC-mode CSRF
  bypass" — this SPA doesn't use RSC mode, so not actually exploitable here, but patched anyway) + **brace-expansion**
  (transitive DoS). Then a **selective** `npm update` of the safe in-range families (Radix, React 19.2.8, TanStack,
  Vite 8.1.5, lucide, tailwind, react-hook-form, typescript-eslint, eslint, @vitejs/plugin-react, fontsource).
  **Held back on purpose:** (1) **TipTap 3.27.3** — the 3.29 minor bumps ONLY starter-kit unless every @tiptap
  package moves together, which fragments `@tiptap/core` into two copies and breaks the editor's types; not
  security-relevant, so pinned at 3.27.3 (all @tiptap consistent). (2) **@hookform/resolvers 5.4.0** — 5.4.2's new
  peerOptional wants valibot ^1.0.0 while the tree has valibot 0.39.0 (an unused optional peer — the app validates
  with **zod**); trivial patch, not worth the ERESOLVE. (3) **TypeScript 6→7** — major, deferred (can surface new
  type errors pre-launch). Verified: tsc + eslint + `vite build` clean, **`npm ci` clean** (the deploy path), 0 vulns.
- **Backend:** bumped EF Core + EFCore.Relational/Design/Tools + AspNetCore.OpenApi + JwtBearer **10.0.9→10.0.10**,
  System.IdentityModel.Tokens.Jwt **8.19.1→8.21.0**, Microsoft.NET.Test.Sdk **18.7.0→18.8.1** (all patch/minor, no
  majors). `dotnet build` clean, **4 tests pass**, `list package --vulnerable` = 0, live smoke (health + login,
  exercising the EF + JWT paths) OK. DEV until deploy.

### Error handling — friendly messages + admin alerting (2026-07-27)
Two goals: a user who hits an error gets a clear explanation + a reference, and the super-admin is
auto-notified so they can act. Built on the existing single `ExceptionHandlingMiddleware` chokepoint +
`IEmailQueue`; Serilog already logs 500s to `application_logs`.
- **Server errors:** the middleware's final 500 branch now mints a short **reference** (`errorId`, 8 hex),
  logs it structured (`{ErrorId} {Method} {Path} User=`), and returns a friendly message
  ("Une erreur est survenue de notre côté. Notre équipe a été prévenue automatiquement. Référence : XXXX")
  + `errorId` in the JSON. The 4xx branches (validation/DbUpdate/QuestPDF) are unchanged (expected, no alert).
- **`IErrorNotifier` / `ErrorNotifier`** (Infrastructure, **singleton**, best-effort — NEVER throws): emails
  the admin via the email queue. **Deduped** via IMemoryCache (one alert per `source|path|message` signature
  per 30 min → an error storm ≠ inbox flood). Recipient = setting **`error.notify_email`** → config
  `ErrorAlerts:Email` → first active super-admin, resolved in a FRESH DbContext scope (the failing request's
  scope may be faulted; falls back to config if the DB itself is down). Seeded template **`error_alert`**
  (module auth; errorId/source/timestamp/user/method/path/message/detail — detail passed RAW since
  EmailService HTML-encodes substituted values). New setting `error.notify_email` (category email, default
  empty; SeedMissingSettings).
- **Client crashes:** new **`ErrorBoundary`** (class component, wraps the app in main.tsx) catches render
  crashes → shows a reassuring French page (reload / accueil) instead of a white screen + auto-reports and
  shows the same reference. Plus global `window` `error`/`unhandledrejection` handlers (safety net for async
  errors) with `isBenignError` filtering (skips already-handled axios errors + ResizeObserver noise).
  `lib/error-report.ts` (`reportClientError`) uses a bare fetch (no axios interceptors), auth-only, throttled
  30s/signature. **`POST /errors/report`** (auth + forms rate-limit) logs + notifies (source "client"),
  returns the errorId.
- **Delivery depends on email being ON** (same as all app mail): in dev SMTP is inactive + override set, so
  alerts are QUEUED + attempted but not delivered (verified: client report → 200 + errorId, logged to
  application_logs, error_alert queued to the resolved recipient, worker dropped after 3 tries vs inactive
  SMTP). Once an SMTP server is active at go-live, alerts deliver; the user sets `error.notify_email` (or it
  falls back to super-admin / `ErrorAlerts:Email`). Build clean (dotnet + tsc + eslint + vite). DEV until deploy.
- NOTE/optional next: an in-app "Journal des erreurs" admin page over `application_logs` (data already there,
  email-independent) if the user wants to browse/resolve errors without relying on the inbox.

### Error-log page + ops-SMTP alerts + maintenance kill-switches (2026-07-28)
Follow-ups to the error-handling feature + a maintenance/kill-switch system. All DEV until deploy.
- **Ops-SMTP for alerts (independent of app email):** `ErrorNotifier` now prefers a DEDICATED alert SMTP —
  appsettings `ErrorAlerts:Smtp:{Host,Port,Username,Password,From,UseSsl}` — sent DIRECTLY via System.Net.Mail
  (fire-and-forget, never blocks the request), so error alerts work even before the member-email go-live and
  are never redirected by `email.override_recipient`. Falls back to the templated email queue when
  `ErrorAlerts:Smtp:Host` is empty. Set the SMTP2GO creds in appsettings.Production.json.
- **"Journal des erreurs" (super-admin):** browse recent Warning+ `application_logs` (where every error
  reference lands) in-app, no email needed. `IErrorLogReader`/`ErrorLogReader` (direct parameterized Npgsql —
  the table is Serilog's, not EF; **filter params explicitly typed Text** else Postgres 42P08 on NULL params;
  returns empty if the table doesn't exist yet). `GET /logs?level=&search=&page=&pageSize=` (super-admin ONLY,
  IsSuperAdmin gate — logs carry emails/IPs). Page `/admin/error-log` (level filter, debounced search,
  expandable exception, pagination), route under `AdminRoute`, sidebar "Journal des erreurs" (Administration).
- **Maintenance / kill-switches:** turn off the whole site OR a single module (public / demande / membres)
  from Settings → a user hitting it sees a "Sous maintenance" page. Settings `maintenance.{site,public,demande,
  membres}` (boolean) + `maintenance.message` (category `maintenance`). **`MaintenanceMiddleware`** (after auth)
  returns **503** `{maintenance,message}` for `/api/*` calls to a module in maintenance — EXCEPT the super-admin
  (claim `is_super_admin` — they toggle it back off), the member auth endpoints (login/refresh/me), the status
  probe, and crash reporting. Module by path: `/public/*`→public, `/applicant*`→demande, else membres. Only
  gates `/api/*` (SPA HTML always loads so the maintenance page renders). `IMaintenanceProvider`/
  `MaintenanceProvider` reads the flags cached 15s. Anonymous `GET /public/maintenance` (`GetMaintenanceStatusQuery`)
  drives the frontends: `useMaintenance()` (public client, polled 60s) + `MaintenancePage`; gated in AppLayout
  (site||membres, super-admin sees an amber banner instead), PublicLayout (site||public), and a new
  `ApplicantMaintenanceGate` wrapping all `/inscription` routes (site||demande).
- **Settings page:** added the missing `email` + `maintenance` category tabs to CATEGORY_ORDER/LABELS (the
  `email.*` settings incl. override_recipient were previously not surfaced anywhere — now editable).
- Verified live: /logs 200 (1010 rows) + level/search filters + 403 for non-super-admin; maintenance.membres=on
  → member 503, super-admin 200, login 200, public 200; status endpoint returns flags. Build clean
  (dotnet+tsc+eslint). NOTE: alert delivery still needs an SMTP (ops `ErrorAlerts:Smtp` OR app email on).
- **Security review (2026-07-28):** audited this session's surfaces. Verified live: maintenance toggle + `/logs`
  are super-admin-ONLY (CG/youth → 403; write needs `AssociationsManage` which CG lacks), `/errors/report`
  auth-only (anon → 401), log search parameterized (SQLi → 200, table intact), maintenance super-admin bypass
  rides a signed JWT claim (unforgeable), 500 responses leak only the reference (no stack/message), alert
  emails HTML-encode all values + no user-controlled headers. FIXED: added a **global 30-alerts/clock-hour
  circuit-breaker** in `ErrorNotifier` (the per-signature dedupe could be bypassed by varying the message →
  inbox flood; over the cap the error is still logged, only email suppressed). `/errors/report` is now EXEMPT
  from the `AbuseDetectionMiddleware` content scan (2026-09-25): a crash whose stack contains attack-looking text
  (`union select`) or a long minified token is no longer rejected (endpoint is auth-only + rate-limited, only logged).

### Dead-code / duplication cleanup + delete-member button + drop dead table (2026-07-29)
An audit-driven cleanup pass (all on main, pushed; DEV until deploy). Net backend −47 lines on the access
sweep alone; builds clean (dotnet 0 warn, tsc+eslint+vite OK), 4 tests pass, live-verified end-to-end.
- **Frontend `lib/download.ts` (saveBlob/openBlob):** replaced ~11 copies of the
      `createObjectURL → anchor.click → revokeObjectURL` (and open-PDF-in-new-tab) boilerplate across
      member-documents/cotisations, export/roster/trombinoscope dialogs, dashboard-unit-leader, members panel,
      unit-documents (zip), cotisation-dashboard (CSV), camp-service, my-profile-service. (unit-documents' preview
      blob + camera/member-photo preview blobs are NOT downloads — left as-is.)
- **Backend dedups:** `Common/ContactEmailResolver` (batched PrimaryContactEmail→own→guardian) moved out of
      SendAccessHandlers; single-member `ResetMemberPassword` now reuses it (the cotisation superset resolver
      w/ phone+parent-name and the list-returning password-reset intentionally stay separate).
      `Infrastructure/Services/PdfText.GetInitials` shared by Trombinoscope + MemberCard (were identical).
      `Common/FunctionalRoleQueries.ResolveBaseRoleId(s)` (default-for-new-members else lowest rank then name)
      shared by CreateMember + demande-send.
- **`Common/MemberAccess` = single member-data authz policy.** Consolidated ~20 hand-copied checks:
      **CanAccessMemberAsync** (super-admin | own record | members.edit leader of the member's ACTIVE unit) —
      the 3 identical helper bodies (Document/Cotisation/Guardian) delegate; the inline copies in Progression
      (read), CustomFields (read), GenerateMemberCard, UpdateMember, SetPrimaryContactEmail and all 9 contact
      commands (Add/Update/Delete × Phone/Email/Address) call it directly. **CanLeadUnit** (super-admin |
      members.edit + unit) — DocumentHandlers' IsUnitLeaderFor + trombinoscope CanManageUnit delegate. The
      contact/update commands lacked an in-handler members.edit gate but are all members.edit-gated at the
      controller, so routing them through the shared policy only ADDS defense-in-depth (own + super-admin bypass
      unchanged). Leader-only mutations with no own-access (progression/custom-field create/delete) are
      intentionally NOT unified. **Live-verified:** admin all-200; read-only youth own-data 200 / cross-member
      denied (docs/cotis/progression/card 400, guardians 403, custom-fields empty) / own card 200; chef-unité
      own-unit 200 + cotisation summary scoped; youth cross-write (AddPhone) 403.
- **Removed the dead `MemberRelationship` feature:** entity + `RelationshipType` enum (only that entity used it)
      + `Member.Relationships`/`InverseRelationships` navs + EF config + `MemberRelationships` DbSet + the dead
      `DELETE FROM member_relationships` in MemberPurgeService. Migration **`DropMemberRelationships`** drops the
      (empty) table (applies on next startup/deploy; dropped on dev + verified). The live guardian-link
      `RelationshipType` string field and the `relationships.*` permission labels are unrelated and untouched.
- **Members panel: wired the missing "Supprimer le membre" button** (red Trash, gated on members.delete) →
      confirm dialog (soft-delete → Corbeille, login disabled, restorable) → clears selection + toast. Deletion
      previously had no trigger from the panel where CUs actually work.

### Pentest pass — JWT secret, youth data leak, login timing (2026-07-29)
Ran a full live attack battery (auth/JWT, IDOR/BOLA, BFLA, path traversal, file upload, rate-limit, info
disclosure, mass assignment, XSS, CORS, DoS) + SQLi. Most of the app held up (SQLi none; object-IDOR denied;
path traversal neutralized; magic-byte upload validation rejects disguised files; mass assignment ignores
locked fields; token isolation; generic error messages; security headers present). Three real findings FIXED
(all on main, pushed; backend-only, DEV until deploy):
- **#1 (critical) Weak/committed JWT secret.** `appsettings.json` ships the placeholder
      `CHANGE_THIS_..._IN_PRODUCTION`; a token forged with it was accepted as super-admin. JWT *validation*
      is fine (alg=none/tamper/strip/wrong-key all 401) — the risk is the key. Added a startup guard in
      `DependencyInjection` that throws if `Jwt:Secret` is missing / < 32 chars / still the placeholder outside
      Development. Prod now refuses to boot with the default key (verified); Development still starts.
- **#2 (high) Read-only youth read privileged data.** The `read-only` profile = ALL `.view` perms, so a youth
      could GET `/audit-logs` (trail + IPs), `/demandes` (children's medical/PII), `/security-profiles` +
      `/{id}/members` (authz model + who's super-admin), `/demandes/statistics`. Root cause = the same "all
      .view" design the 2026-07-09 sweep fixed for member-data but not these aggregate endpoints. Fix:
      `SeedData.ReadOnlyExcludedViews` = {audit.view, demande.view, roles.view, passage.view} removed from the
      read-only profile (seed + missing-perms add + an idempotent startup **revoke** for existing DBs) → the
      `[HasPermission]` attributes now deny youth automatically. Plus `MemberAccess.IsGroupManager` (super-admin
      OR maitrise.manage) defense-in-depth on the demande review + statistics handlers. Verified: youth perms
      15→11, all leak endpoints 403, own data still 200, super-admin/CG still 200.
- **#3 (medium) Login user-enumeration via timing.** bcrypt ran only for existing accounts (0.006s unknown vs
      0.32s valid = 50×) → email enumeration despite the generic message. Both member + applicant login now run
      exactly one bcrypt verify; the account-missing path runs `IPasswordHasher.VerifyDummyAsync` (a fixed dummy
      hash pinned to **WF12** to match the stored population — new hashes are WF10 but all existing users are
      WF12). Verified: gap 0.318s → 0.031s.
- **Noted / not code bugs:** login rate limit is 100/min per-IP (generous for credential-spraying, esp. with
      the shared temp password `Gndj2026!` — mitigate at launch via forced first-login change + per-account
      backoff); oversized body → 500 instead of 413 (+ fires an error-alert, mildly spammable); `Server: Kestrel`
      header (masked by Cloudflare). All the "confirmed secure" categories above needed no change.

### Crash-consistency / partial-failure audit (2026-08)
Swept the app for "a small interruption → a bigger issue" (multi-write atomicity, file+DB ordering, side-effect-
before-commit, sequence races). Most heavy ops were already correct. Details in memory
[[project-crash-consistency-audit]].
- [x] **Photo upload reorder (real bug, FIXED):** `MembersController.UploadPhoto` deleted the old photo file
      BEFORE writing/committing the new one → an IO error or crash mid-upload lost the member's photo (DB still
      pointed at the now-deleted file → 404 → initials; a flaky batch photo session could wipe photos). Now:
      write new file → `SaveChangesAsync` (DB points at new) → THEN delete the old file, and only on an
      **extension change** (the filename is deterministic `{memberId}.{ext}`, so same-ext overwrites in place).
      Worst case on a crash is now a harmless orphan file, never a broken reference. Mirrors MemberPurgeService
      (files after commit). Verified live: upload + same-ext re-upload + fetch all 200. DEV until deploy.
- **Verified CORRECT (no change):** CreateMember = one atomic SaveChanges; SendDemandeResponses / campaign-close /
      FinalizePassages = advisory-lock single txns, emails Enqueued ONLY after CommitAsync (no false sends);
      MemberPurgeService = capture paths → all raw deletes in one txn (rollback on crash) → files after commit;
      document upload = file first + compensating delete if the DB save fails; card/receipt numbers = read-max+1
      guarded by unique indexes (collision → clean 409). 
- [x] **Durable email outbox (systemic caveat FIXED):** the email queue WAS an in-memory `Channel` drained by a
      background service — enqueued after the state commit (no false sends) but a restart/crash/deploy lost
      queued/in-flight mail (at-most-once). Sharpest case = leader reset-member-password (password already changed
      → member locked out if the mail vanished). Replaced with a persistent **`email_outbox`** table (migration
      `AddEmailOutbox`; plain table, no soft-delete/audit; index on `(status, next_attempt_at)`). `IEmailQueue.Enqueue`
      → async **`EnqueueAsync`/`EnqueueManyAsync`**; **`OutboxEmailQueue`** (singleton, opens a scope) persists a
      Pending row + signals the sender; all 9 call sites await it. **`OutboxSenderBackgroundService`** polls due rows,
      **leases** them (crash-safe — a mid-send crash retries after the lease), sends with bounded concurrency (5),
      and records the outcome: **Sent**, or a **retry** with increasing backoff (30s/2m/10m/30m), or **Failed** after
      5 attempts (LastError kept for inspection). `IOutboxSignal` wakes it on enqueue (15s fallback poll). Now
      at-least-once + survives restart. Verified live via row-state (email off in dev): enqueue→Pending; worker
      attempts + backs off + records last_error; the row **survived a process kill** and the restarted worker
      resumed it; reached Failed after max attempts. Pending→Sent needs a live SMTP (go-live). See
      [[project-email-golive]] / [[project-crash-consistency-audit]].

### Pre-launch full audit + fixes (2026-08-23, v3.5.0, DEV until deploy)
"Last push before launch" — ran a full-app audit: objective baselines + 5 parallel review agents (security/authz,
correctness/logic, French language, UX/robustness, performance), then verified each finding against the code and
fixed the clear-cut ones.
- **Baselines ALL GREEN:** dotnet build Release (0 warn), frontend tsc+vite build, `dotnet test` (all projects),
      `eslint --max-warnings=0`. French user-facing text swept across all recent screens + email templates = **clean**
      (no accent/grammar/mojibake errors). Authz audit found the app's IDOR class properly closed on the new features
      (self-service `/my-profile/*` resolve own id server-side; cross-member/unit reads go through `MemberAccess`;
      read-only youth stripped of aggregate `.view` perms).
- **FIXED — Perf N+1 (Séances list):** `GetMeetingsQuery` ran one `CountAsync` PER meeting for the roster size (40–80
      sequential round-trips mid-season). Now batched: one whole-unit active count + one grouped per-team count, looked
      up per meeting. `MeetingHandlers.cs`.
- **FIXED — Rentrée empty-unit permanent blocker:** a fanned-out per-unit progress task for an EMPTY unit (0 active
      members, e.g. a "(Non affectés)" placeholder) had `Complete = total > 0 && …` → never complete → never auto-done
      → **permanently blocked** any dependent group task (e.g. "Finaliser les passages") and dragged phase progress,
      and (being an auto/progress task) couldn't be manually ticked. Now `total == 0` counts as complete (nothing to
      do). `RentreeProgress.cs` (all 4 per-unit signals: passage-proposed / documents-verified / photos-done /
      cotisations-paid).
- **FIXED — Security (cross-unit leak):** `GetUnitAbsenceCountsQuery`'s `members.edit` branch was NOT unit-scoped —
      any CU could pass another unit's id and read its per-member absence counts (GUIDs+ints, no names, but still
      cross-unit). Now scoped to super-admin / `AuthorizedUnitIds.Contains(unitId)`. `MeetingHandlers.cs`.
- **FIXED — UX:** rejection-reasons delete now goes through a `ConfirmDialog` (was one-click destructive; warns if
      it's the ★ default); security-profiles delete failure now surfaces a `toast.error` (was `setError` into the
      just-closed dialog); rentrée-template reorder `move()` guarded against overlapping in-flight reorders. (The
      template Save button already had `disabled={save.isPending}` — that agent finding was a false positive.)
- **Verified live:** séances list + absence-counts endpoints → 200 (batched GroupBy translates); builds+tests+eslint
      clean; API restarted on :5000.
- **Follow-up fixes (2026-08-23/24, same audit) — the flagged items, now resolved:**
  - **Timezone → Lebanon (app-wide):** new `Application/Common/LebanonClock.cs` (`Today`/`Now`; resolves
      "Asia/Beirut" then Windows "Middle East Standard Time", falls back to UTC). Replaced ALL ~34
      `DateOnly.FromDateTime(DateTime.UtcNow)` + the 2 `DateTime.Today` (MaitriseHandlers) + `ScoutYearHelper`'s UTC
      `now` with `LebanonClock`. So every calendar-date decision (scout year, passage/demande/document deadlines,
      overdue, absence windows, payment/assignment dates, DOB "not future" validators, dashboard ages) is Lebanon
      local. **Real instants (audit/token/outbox timestamps) stay `DateTime.UtcNow`.** Verified on this box: it's
      currently UTC+3 (DST) — Beirut date was already the NEXT day vs UTC at ~21:00 UTC, exactly the off-by-a-day the
      fix removes. (PDF "Généré le" footers left on server-local `DateTime.Now` — cosmetic.) Client overdue is
      server-computed, so no frontend tz change needed.
  - **Document-campaign duplicate-email race:** `DocumentCampaignActions` now guards the two shared steps
      (`RunSendErrorsAsync` / `RunApplyHoldAsync`) with a process-wide `SemaphoreSlim` + a re-check of the
      (committed) marker after acquiring it → the 12h auto job and a CG's manual button can't both run the same step
      (loser is a no-op). Cross-process overlap was already prevented (startup advisory lock).
  - **Marker date parses → invariant** `DateOnly.TryParseExact(v, "yyyy-MM-dd", …)` in DocumentCampaign(.Handlers)
      + RentreeReminders (culture-independent).
  - **Not changed (verified fine):** outbox `MaxPerHour` throttle correctly defers the excess ~1h when a cap is
      consumed in a sweep (that IS the per-hour semantics; cap 50 ≫ batch 20 anyway); MeetingAbsence soft-delete
      row-bloat on re-save is cosmetic (correctness holds via `!IsDeleted`).
- **DATA finding (Q5, for the user):** 4 "(Non affectés)" migration-placeholder units exist. Meute/Ronde/Troupe
      ones are inactive + empty. **Compagnie (Non affectés) [CO] is still `is_active=true` and holds 1 active member —
      Naia TUFENKJI (F-0629), Guide, since 2025-10-01.** It's not published (hidden from public site) but IS active,
      so it shows in unit pickers / dashboard / rentrée fan-out. Recommend: move Naia to her real Compagnie unit,
      then set all 4 placeholders `is_active=false` so they drop out. (The empty-unit rentrée blocker fix above means
      the 3 empty ones no longer stall dependents in the meantime.)

### Startup fixes — DataPatchRunner crash + EF warning (2026-08-24)
Two prod startup issues surfaced on the Journal des erreurs (new.gndj.org). Both fixed on main, pushed; prod
self-heals on the next deploy/startup.
- [x] **DataPatchRunner crash blocked all pending patches (the real error).** `DataPatchRunner` ran each patch
      body via EF `ExecuteSqlRawAsync`, whose `RawSqlCommandBuilder` parses the SQL as a `String.Format` composite
      string to find `{n}` placeholders. Patches **005/006** UPDATE the `demande_approved` email template and set a
      `variables` JSON literal `[{"key":...}]`; the bare `{` threw `FormatException: Expected an ASCII digit` (offset
      1983), rolled the patch back, and — because it logs *"Skipping remaining patches"* — **005/006/007 never ran on
      any DB** (dev was stuck at 004 too). Fix: execute the patch body through a **plain ADO.NET `DbCommand`** enlisted
      in the ambient transaction (verbatim SQL, no format parsing); the brace-free tracking-row INSERT keeps its
      `{0}` parameter binding. **Verified live:** dev was stuck at 004 → after the fix a restart applied 005/006/007
      and recorded them in `data_patches`. **Lesson: patch files are verbatim trusted SQL — never route them through
      `ExecuteSqlRaw`** (any bare `{` in JSON/template content breaks it). Also fixed the marker-date parse elsewhere
      is separate.
- [x] **Dev "WebRootPath not found (wwwroot)" warning silenced.** In Development the SPA is served by Vite (:5180)
      and the API has no `wwwroot`, but it still registered `UseDefaultFiles`/`UseStaticFiles` + `MapFallbackToFile`
      → a framework Warning on every startup, flooding the dev Journal des erreurs. Guarded all three behind
      `!app.Environment.IsDevelopment()` (dev API is API-only). Prod unchanged. (2026-08-25)
- [x] **`MemberDocumentPage` query-filter Warning silenced.** The page (plain child) has a REQUIRED parent
      `MemberDocument` (BaseEntity w/ global soft-delete filter) → EF logged a Warning on every startup (inconsistent
      filters on a required relationship), persisted to `application_logs`. Added a matching child filter
      `!e.MemberDocument.IsDeleted` (same pattern as SecurityProfilePermission → SecurityProfile). Verified: no new
      occurrence after restart. Query-filter only, no migration.

### Prod cold-start / warm-up hardening (2026-08-24)
Diagnosed a "site is very slow" report (prod, single user). NOT idle-spindown — the gndj app pool is already
tuned (AlwaysRunning, idleTimeout 0, no periodic recycle, AppInit installed, site preloadEnabled). Root cause via
the Windows System event log: a **single ANCM "unhealthy condition" recycle (event 5078) ~11 min prior** →
the fresh worker cold-started and the ~1–2 min cold window is what was felt. Prod is a **SHARED IIS box** (~10
other sites: echoes, snoozer-v2, carolinerizk.com, construct-box.com, DefaultAppPool, *.fancyshark.com — all on
the default 20-min idle timeout, constantly cold-starting), so contention can briefly starve gndj's health check
and trigger an unhealthy recycle. Warm reads are fast (~0.18s through Cloudflare); the issue is only the
post-recycle cold window. Mitigations:
- **Ops (done on server):** `GNDJ-HealthCheck` scheduled task interval tightened **5min → 2min** (worst-case
      cold window after a recycle halves; idleTimeout is already 0 so it never goes cold otherwise).
- **Code (this repo, ships next deploy):** the old `/health` was a pure liveness check that never touched the DB,
      so pinging it warmed the pipeline but NOT the Npgsql/EF data path (connection pool + provider) — the first
      authenticated call still paid that cost. Added **`Api/Health/DatabaseHealthCheck`** (a cheap `SELECT 1`
      via a scoped `GndjDbContext`); `AddHealthChecks().AddCheck<DatabaseHealthCheck>("database")`. Now `/health`
      also reports Unhealthy (503) if Postgres is down (better monitoring) AND warms the DB path.
- **Code — self-warm after every recycle:** added a **project `src/GNDJ.Api/web.config`** (the SUPPORTED way to
      customize ANCM — `dotnet publish` transforms only the `<aspNetCore>` process attrs and PRESERVES the rest;
      verified via a temp publish). It (a) raises ANCM **`startupTimeLimit` 120→240s** + `shutdownTimeLimit` 30s so
      a slow startup on the contended box isn't killed → recycled (attacks the 5078 trigger), and (b) adds
      **`<applicationInitialization doAppInitAfterRestart="true"><add initializationPage="/health"/>`** so IIS
      auto-warms the app — now including the DB path — after EVERY recycle/reboot, before the first user.
      Deliberately NO `<httpErrors>` (that patch caused the 2026-08-16 outage; `publish.ps1` documents "never patch
      web.config from publish.ps1" — this is a PROJECT web.config, the supported route, not a publish-time patch).
- Verified live: build clean, `/health` → Healthy (DB SELECT 1 runs), published web.config keeps
      startupTimeLimit=240 + the AppInit block. DEV until deploy. Prod DB memory for peak season is handled
      separately by `pg-profile.ps1 -Profile High`.

### Performance pass — concurrency/latency (2026-08-26)
A full-stack perf audit (4 parallel agents: backend/EF, Postgres, IIS, frontend) targeting a modest SHARED VPS
with dozens of concurrent users. Baseline was already healthy (auth reads permissions/units from the JWT — ZERO
DB hits per request; compression, DbContextPool, trgm search index, static-asset immutable headers, async Serilog
sinks, app-pool warm-keeping all in place). Shipped code wins (all on main, pushed; DEV until deploy — migration
+ bg-service apply on prod startup):
- [x] **Two hot-path partial indexes on `member_assignments`** (migration `AddAssignmentHotIndexes`):
      **`ix_member_assignments_unit_active`** = `(unit_id) WHERE end_date IS NULL AND is_deleted=false` — the #1
      query in the app (roster / doc matrix / cotisation dashboard / reports / member list all filter
      `unit_id + end_date IS NULL`); the existing member-first partial index couldn't serve a unit-only filter, so
      it was re-reading every historical row for the unit. **`ix_member_assignments_start_end`** =
      `(start_date, end_date) WHERE is_deleted=false` — the CG dashboard's scout-year range overlap. Verified live:
      EXPLAIN now shows **Index-Only Scan using ix_member_assignments_unit_active** on the active-by-unit query.
- [x] **`application_logs` index + retention** (`ApplicationLogMaintenanceBackgroundService`, daily, self-healing):
      Serilog auto-creates that table with NO index and there was no retention → an unbounded full-scan table that
      bloats cache for the WHOLE shared box. The service guards on table existence (skips a fresh DB until the sink
      creates it), `CREATE INDEX IF NOT EXISTS ix_application_logs_timestamp (timestamp DESC)`, and deletes rows
      older than **`logs.retention_days`** (new setting, default 90, category maintenance, super-admin-only; 0 =
      keep forever). Not a data patch (patches can't do non-transactional DDL and it's a non-EF table); the daily
      service self-heals every env. Verified: the DO block runs + creates the index on dev.
- [x] **`GET /auth/bootstrap`** (`GetBootstrapQuery`) — collapses the ~5 authenticated first-paint round-trips
      (`/auth/me` + `/settings/ui.role_colors` + `/settings/passage.scout_year` + `/demandes/pending-count` +
      `/change-requests/pending/count`) into **ONE** call. Reuses `GetMeQuery` + the two count queries via the
      mediator (demande count gated by `demande.view`; change-request count self-gates); both settings in one DB
      query. `auth-store.loadUser()` now calls it and **primes the TanStack Query cache**
      (`queryClient.setQueryData`) for those keys so the header/sidebar/dashboard hooks read from cache instead of
      each firing an XHR — the biggest perceived-latency win on a mobile link. No new exposure (single-key settings
      were already readable by any authed user; counts reuse their gated handlers). `/auth/me` kept for API
      integrations; `/api/v1/auth/` is already maintenance-exempt so bootstrap works during membres-maintenance.
      Verified live: one call returns `{me, roleColors, scoutYear, pendingDemandes:3, pendingChangeRequests:0}`.
- [x] **Frontend refetch discipline (`staleTime`):** `ui.role_colors` / `passage.scout_year` (read by header+sidebar
      on EVERY route via `useSetting`, previously 0 staleTime → an XHR per navigation) → 5 min; the two sidebar
      **pending-count** badges → 55–60s (was refetching on every admin-page navigation); **`useCamps`** (sidebar link
      placement) → 5 min; **maintenance** dropped `refetchOnWindowFocus` (was the "called twice" duplicate at login,
      the interval already covers freshness). Global query **retry** now skips 4xx (fail fast — a 403/404 no longer
      waits for a pointless second attempt) and only retries transient 5xx.
- [x] **`ThreadPool.SetMinThreads` floor** (Program.cs, `8×cores` clamped 32–128): in-process IIS hosting serves
      requests off the .NET ThreadPool (Kestrel limits don't apply), which grows only ~1 thread/500ms — a September
      login spike (bcrypt-bound) can queue behind slow thread injection even when CPU isn't pegged. Complements async
      bcrypt.
- [x] **AppInit warms 2 more anonymous GETs** (`web.config`): `/api/v1/public/site-config` + `/api/v1/public/units`
      alongside `/health`, so after every recycle the MVC/EF/JSON pipeline + first query plans are JIT'd BEFORE the
      first real user (health only primed the DB path). Only anonymous output-cached routes (AppInit can't auth).
- **SERVER-SIDE checklist handed to the user (NOT code — they apply on the box):** (1) **Npgsql pool sizing** on the
      prod connection string — it's UNSET (defaults to 100/process) against PG `max_connections=100` shared with ~10
      sites; recommend `Maximum Pool Size=40;Minimum Pool Size=5;Connection Idle Lifetime=300;Timeout=15` + raise PG
      `max_connections` to 200. THE top operational lever for concurrency. (2) Verify **IIS dynamic compression is
      OFF** at the site (the app compresses; double-compression wastes CPU — DEPLOYMENT says off but no script
      enforces it). (3) **autovacuum** tuning + the pool/max_connections alignment in `pg-profile.ps1`. (4) optional:
      disable IIS W3C request logging (Cloudflare + Serilog already cover it). Skipped (Cloudflare handles): origin
      HTTP/2/3, request-queue caps. The "drop app JSON compression behind Cloudflare" idea = measure origin CPU first.

### Timestamptz Kind=Unspecified sweep — audit + outbox + error-log date filters (2026-08-30)
A CG (giorgio.rizk) hit a **500 on `GET /audit-logs`** filtering by date (surfaced in the Journal des erreurs).
Root cause: a `DateTime` bound from the query string arrives `Kind=Unspecified`; comparing/writing it to a
`timestamptz` column makes Npgsql throw "Cannot write DateTime with Kind=Unspecified … only UTC is supported".
`GetAuditLogsQuery` (From/To) had it. Swept ALL query-string `DateTime?` bounds and fixed the class:
- **New shared `Application/Common/DateTimeExtensions.AsUtc()`** (UTC as-is, Local→UTC, Unspecified→SpecifyKind Utc;
      + a `DateTime?` overload). Applied to: `GetAuditLogsQuery` From/To (the reported crash), `PurgeAuditLogsCommand`
      Before (was inline OK → now uses the helper), **`PurgeSentOutboxEmailsCommand` Before** (`SentAt < before` —
      same latent crash on the outbox "Vider les envoyés" with a date), and **`ErrorLogReader.PurgeAsync` Before**
      (raw Npgsql — an explicit `NpgsqlDbType.TimestampTz` param does NOT relax the Kind check, so it was also
      vulnerable). Verified live (far-past dates so nothing deleted): all three → 200 (audit filter, outbox
      purge-sent, logs clear).
- **Checked SAFE (no change):** every other timestamptz comparison uses `DateTime.UtcNow` (auth/token/reset/outbox
      sender = Kind=Utc); `LebanonClock.Now` is Kind=Unspecified BUT only feeds `ScoutYearHelper` (extracts year/
      month → `DateOnly`), never a query; no `DateOnly.ToDateTime`/`DateTime.Parse` reaching a query; assignment/
      meeting/scout-year windows compare `DateOnly` to `date` columns (no Kind issue). So these 4 were the complete
      set. Backend-only, DEV until deploy (prod still crashes on those filters until deployed).

### Dead-code / unused audit + 2 unused-dep removals (2026-09-03)
Full codebase sweep for anything unused (2 parallel Explore agents [frontend + backend] + a scripted settings
audit + an orphan-file scan). Verdict: the codebase is very clean (prior dead-code passes hold). Findings:
- **Removed `AutoMapper`** (NuGet, GNDJ.Application.csproj) — 0 uses in src + tests, no `AddAutoMapper`/Profile/
      IMapper anywhere (the app maps manually + projects to DTOs). **Removed `react-day-picker`** (npm,
      client/package.json) — 0 imports (orphaned when `ui/calendar.tsx` was deleted 2026-07-06; dropped it + its
      unique transitive `@date-fns/tz`, 34 lockfile deletions, nothing added). Both builds clean after removal
      (dotnet 0/0, tsc+eslint+vite).
- **Settings: all 70 seeded keys are referenced** (scripted key-vs-usage check) — no orphan settings (the team
      already prunes dead ones, e.g. `demande.intro_text` via patch 010).
- **No dead frontend files** (orphan-file scan corrected for `React.lazy(()=>import())` → 0), no unused
      exports/routes; **no orphan backend commands/queries/DTOs/services/entities/DbSets** (every IRequest is Sent
      by a controller; all ~76 DbSets queried).
- **FLAGGED (separate, NOT fixed — out of scope of this cleanup):** `npm audit` now reports **31 moderate prod
      vulns, all `@tiptap/react`-related** — pre-existing advisory drift since the 2026-07-19 "0 vulns" check, NOT
      caused by this removal (verified: lockfile diff only dropped react-day-picker). Needs its own dependency-review
      pass (a blind `npm audit fix` risks breaking the TipTap editor — the 3.27.3 pin is deliberate, see the
      2026-07-19 dep note). Backend NuGet still 0 vulns. **→ RESOLVED same day, see below.**

### Dev data sync from prod — repeatable, email-safe (2026-09-07)
`deploy/dev-sync-from-prod.ps1` refreshes the LOCAL dev DB from a prod pg_dump snapshot while guaranteeing dev
can never send real email — run it periodically to test against fresh real data. Uses the dev `gndj_admin` role
(owns the DB + CREATEDB, so NO postgres superuser / no `iisreset` — unlike the prod `reset-to-import.ps1`).
Order is deliberate: (1) stop the dev API; (2) back up the current dev DB to `C:\gndj-dev-backups` + capture the
current dev `smtp_servers`; (3) drop/recreate `gndj` + restore the dump; (4) **NEUTRALIZE email BEFORE restarting
the app** — unbind templates, clear the outbox, DELETE all prod SMTP servers (the real active providers
SMTP2GO/Mailgun/SendPulse), re-insert the captured dev smtp4dev, set `app.base_url`→localhost, clear
`email.override_recipient`; (5) print a safety check (internet-capable active providers MUST be 0). Then YOU start
the dev API (`dotnet run`) so EF applies pending migrations on the prod data. **Why neutralize before startup:**
the outbox worker drains queued mail on boot — with prod's active real providers live it would send prod's queued
emails to real families. Verified live 2026-09-07 (dump `gndj_20260907_0300.dump`): 2440 members, 3 real active
providers removed, 615 queued outbox mails cleared, migrations applied (parents_situation col added), login OK,
`ErrorAlerts:Smtp` host empty in dev appsettings (the one direct-send bypass — real creds live only in
appsettings.Production.json, not loaded under Development). See memory [[reference-dev-sync-from-prod]].

### Dependency update — all in-range + TipTap security fix (2026-09-03)
Updated every dependency that could move without a known-breaking major, both stacks. Result: **npm 0 vulns,
NuGet 0 vulns**, builds + 102 tests all clean. All on main, DEV until deploy.
- **Frontend — TipTap security fix:** the 31 moderate `@tiptap/core` vulns (GHSA-cp6q-959q-f8rh, `mergeAttributes`
      prototype-pollution, fixed >3.30.3) cleared by moving **all 9 `@tiptap/*` 3.27.3 → 3.31.2 TOGETHER** (single
      `@tiptap/core@3.31.2`, no fragmentation — the exact failure mode the old 3.27.3 pin guarded against). npm's
      incremental peer resolver ERESOLVE'd on a one-at-a-time upgrade of the interdependent peers → fixed by bumping
      all `@tiptap` ranges to `^3.31.2` in package.json + a **clean `rm -rf node_modules package-lock.json && npm
      install`** (also the `npm ci` deploy path), which resolves the graph at once AND moves every other `^` dep to
      its latest in-range.
- **Frontend — everything else in-range** (via the clean regenerate): @hookform/resolvers 5.4→5.9, react-query
      5.101→5.102, @types/node 26.1→26.4, @vitejs/plugin-react 6.0→6.1, axios 1.18→1.20, dompurify 3.4.13→3.4.14,
      eslint 10.8→10.9, lucide-react 1.26→1.40, react-hook-form 7.83→7.87, react-router 8.3.0→8.3.1, sonner 2.0.7→
      2.0.8, typescript-eslint 8.65→8.69, vite 8.1.5→8.2.2, zod 4.4→4.5, zustand 5.0.14→5.0.15. tsc + eslint + vite
      all clean.
- **Backend — patch/minor + one test-tool major:** EF Core + AspNetCore (EntityFrameworkCore/.Design/.Relational/
      .Tools, OpenApi, JwtBearer) **10.0.10 → 10.0.11**; ClosedXML 0.105.0→0.105.1; QuestPDF 2026.7.1→2026.8.0;
      System.IdentityModel.Tokens.Jwt 8.21→8.22; Microsoft.NET.Test.Sdk 18.8.1→18.9.0; **xunit.runner.visualstudio
      3.1.5 → 4.0.0 (major, test-only)**. Build 0/0, **102 tests pass** (validates the runner major), live login +
      EF reads OK.
- **DEFERRED (unchanged, known blocker):** TypeScript **6 → 7** — `typescript-eslint` still hard-fails on TS 7, so
      the bump would break `eslint`/CI. Revisit when typescript-eslint ships TS 7 support (then it's a ~5-min bump).
      Backend xunit core stays 2.9.3 (v3 is a migration, not a plain update).

### Audit log — human-readable details (resolve GUIDs → names) (2026-09-11)
The audit detail dialog showed raw GUIDs for related entities (a deleted Passage read `MemberId` /
`ProposedUnitId` = ids). Assignments were already fixed (2026-08-31 `AssignmentAudit.DescribeAsync`) but every
other handler that logged an id field wasn't. Fixed the class + made the whole page read in French.
- **New shared `Common/AuditNames.cs`** — null-safe resolvers `MemberAsync`/`UnitAsync`/`RoleAsync`/`TeamAsync`/
  `GuardianAsync`/`MembersAsync(list)` (all `IgnoreQueryFilters` so a soft-deleted loser/unit still resolves;
  unknown id → the id string, never crashes). Audit is low-frequency, so the extra lookups are fine.
- **Handlers now log names, not GUIDs:** Passage Create/Update/BulkCreate/Review/Finalize/Delete (Member +
  ProposedUnit/ProposedRole + FinalUnit/FinalRole; Finalize null unit → "Toutes les unités"); Maîtrise Transfer
  (Member + NewUnit/NewRole); Organization SetAssignmentPlacement (Member + before/after Team/Role); Demande
  Decide/SetUnit (child name + DecidedUnit) + MergeDemandes (child + kept ref + merged count); SuperAdmin grant/
  revoke (Member); Siblings Approve (Members + Father/Mother) / Link (Member + Target) / Unlink (Member); Duplicate
  MergeMembers (Keeper + Merged names — resolved after the soft-delete via IgnoreQueryFilters); Team Create/Delete
  (unit name); SendAccess + SendDocumentReminders reports (unit name; SendAccess AllNonMaitrise → label).
- **Frontend `audit-logs.tsx`:** expanded `ACTION_LABELS` to translate + colour EVERY action string the backend
  emits (Révision, Finalisation, Transfert, Décision, Fusion, Fratrie confirmée, Envoi des accès, …; fallback =
  raw string, no colour); expanded `ENTITY_LABELS` (Passage, Demande, Fratrie, Clé API, Événement, Actualité,
  Page, Ressource, Étape, Badge, Serveur SMTP, Modèle d'email…) and `FIELD_LABELS` (the resolved-name keys +
  send-report keys); `entitySummary` now also picks Child/Keeper/Members so the row summary is meaningful.
- **Verified live:** create+delete a Team → audit stored `"Unit": "Clan Jamhour"` (name, not GUID); test rows
  cleaned up. Builds clean (dotnet 0/0 + tsc + eslint). Backend + frontend, DEV until deploy.

### Audit-log free-text search (2026-09-12)
Added a `Search` param to `GetAuditLogsQuery` + `GET /audit-logs?search=` (audit.view). Accent- + case-insensitive
(`DbFns.Unaccent(col.ToLower()).Contains(DbFns.Unaccent(s))`, same pattern as member/demande search) over user
email, IP, action, entity type, AND the **before/after JSON snapshots** (which hold the resolved names — see the
audit-names work), so a member/unit name finds every action touching it. GOTCHA: `OldValues`/`NewValues` are
**jsonb** columns → `lower(jsonb)` doesn't exist (500). Fixed by a new `DbFns.JsonbToText` mapped to Postgres's
built-in **`jsonb_pretty`** (`.HasName("jsonb_pretty")` in GndjDbContext) so the snapshot is rendered to text
before lower/unaccent. Unindexed scan across the JSON — fine for low-frequency admin use. Frontend
(`audit-logs.tsx`): a debounced (`useDebounce`) search box above the filters (X to clear; folded into "Effacer"),
page resets to 1 on change. Verified live: `login`→663, IP `127`→7, snapshot `meute`→6, `2eme`==`2ème`==3
(accent-insensitive), nonsense→0. Build clean (dotnet 0/0, tsc + eslint + vite). Backend + frontend, DEV until deploy.

### Whole-system bug hunt — 6 verified fixes (2026-09-12)
Ran a full bug-hunt round (14 parallel review agents: 6 over the v3.1.0..HEAD diff + 8 over the whole app by
domain), then personally verified each high-severity candidate against the code before fixing. Refuted several
agent claims (member-merge "nulls fields" — the frontend loops ALL `MERGE_FIELDS` and always sends the resolved
value; api-client "infinite refresh loop" — `_retry` bounds it; NotifyMemberLeaders archived-role drop —
degrades to CG-only, harmless). Fixed the 6 confirmed ones (all on main, pushed; DEV until deploy):
- [x] **#1 [HIGH] Cross-unit privilege escalation in Update Assignment** (`UpdateAssignmentCommand`): authorized
      only the assignment's CURRENT unit, then wrote `request.UnitId`/`FunctionalRoleId` unchecked — so since the
      edit dialog was unlocked (2026-08-25) a CU could move a member into ANY unit (+ assign a maîtrise role) they
      don't lead. Added the target-unit authorization (`!IsSuperAdmin && request.UnitId != entity.UnitId &&
      !AuthorizedUnitIds.Contains(request.UnitId)` → 400), matching CreateAssignment. A real branch move still goes
      through passage.
- [x] **#2 [MED] Abuse middleware false-400 on CMS content** (`AbuseDetectionMiddleware`): only
      `/api/v1/email/templates` was exempt from the script/SQL scan, so a news/page/event/resource with an
      `<iframe>`/`<svg>` embed (video/map) or author CSS `/* */`, and the document-template builder HTML, tripped
      the pattern → hard 400 (CG couldn't save). Extended `IsRichContentPath` (now `RichContentPrefixes`) to
      `/news`, `/pages`, `/events`, `/resources`, `/content`, `/document-types`. Verified live: authenticated POST
      `/news` with `<iframe>`+`<svg>`+`/* */` reaches the controller (normal validation error), while `/members`
      with `<script>` still returns the abuse block.
- [x] **#3 [MED] Matricule can be nulled / collide on member edit** (`UpdateMemberCommand`): the panel exposes an
      editable required "Matricule" but the server had NO `NotEmpty` and NO uniqueness check on `CardNumber` (only
      `MaximumLength`) — clearing it nulled the internal matricule; a duplicate hit the unique index (409). Added
      `NotEmpty` + a uniqueness pre-check (friendly 400), mirroring `ExternalCardNumber`.
- [x] **#4 [MED] Deleting a member's last address wiped confirmed siblings' addresses** (`HouseholdSync`):
      `PropagateAddressesAsync` with an EMPTY source `RemoveRange`d every sibling's address and added nothing —
      reachable by a youth via self-service DeleteMyAddress. Now skips mirroring when the source set is empty
      (removing the last address leaves siblings as-is).
- [x] **#5 [MED] Group/branch reports could include a unit the caller is only a youth in** (`ReportDataCollector`):
      non-super leaders were filtered to `AuthorizedUnitIds` (includes youth units), not units they LEAD. Now a
      group manager (super-admin / maitrise.manage) keeps the full authorized scope, but a PLAIN unit leader is
      restricted to units where they hold a `members.edit`-granting active role (`SecurityProfile.Permissions.Any(
      == MembersEdit)`) — so a leader-in-A/youth-in-B member can't export B's roster incl. parents' PII.
- [x] **#6 [LOW-MED] Forgot/Reset-password email lookup was case-sensitive** while Login is case-insensitive +
      trimmed (`RequestPasswordReset` + `ResetPassword`): a user who signs in fine (mobile auto-capital / trailing
      space) got "account not found" on reset — go-live-relevant (forced-reset rollout). Both now trim + lower and
      compare `u.Email.ToLower() == email`; the reset link carries the normalized email. Verified live:
      `ADMIN@GNDJ.LOCAL` and `  Admin@Gndj.Local  ` → found:true (was false).
- Build clean (dotnet 0/0), API live-smoke OK. **NOT fixed (documented/lower):** applicant verify/terms gates fall
      through on a transient profile-fetch error (server still blocks submit); report address-column blank when city
      is null; doc-campaign enqueue-before-marker email re-send on a crash; `SetPrimaryContactEmail` case-sensitive +
      `VerifyMyContact` missing `.RealEmail()`; `BulkReviewPassage` skips the final-team-belongs-to-unit check. Known/
      intended (no change): passage completeness gate counts Pending équipe-changes; name-only sibling auto-link;
      MustChangePassword is a UI nudge; single-key `GET /settings/{key}` readable by any authed user; camp report
      PDFs are group-wide (CU + CG by design).

### Changelog: per-entry dates (2026-09-13)
The "Journal des versions" showed one date per version block, but the single unreleased 3.1.0 block had accumulated
350 entries across ~27 days (bump was never run to split releases), so the block date (2026-09-10) was meaningless
per entry. Now each entry carries its own date. Backward-compatible + sustainable:
- **Model:** `ChangelogChange = string | { date?: string; text: string }` (`lib/app-version.ts`); a plain string
  falls back to the block/release date. `changelog.tsx` renders a small muted date pill (`shortDate` → "13 sept.")
  before each `<li>` via `changeParts(c, entry.date)`.
- **Backfill:** a one-off `git blame --date=short` script wrapped every string in the current block into
  `{date, text}` with its true add-date (surgical — text kept verbatim, escaping preserved, rest of file untouched).
  350 entries dated, range 2026-07-29..2026-09-13 (07-29 = when changelog.json was first created in git; nothing
  older is recoverable via blame). Script deleted after running.
- **Tooling:** `deploy/bump.ps1` now logs `%ad|%s` (`--date=short`) and `deploy/bump.mjs` splits each line into
  `{date, text}` — future auto-generated release entries carry their commit date too.
- Convention updated in memory [[feedback-update-changelog]] (add new entries as `{date,text}` objects with today's date).

### Input-sanitization sweep — recent commands (2026-09-13)
User asked to "make sure all inputs are sanitized." Audited the mutating-command surface added since the last
validation sweep (3 parallel read-only agents), verified each finding against the code, fixed the real per-field
gaps vs the project's own standard (`.MaximumLength(N)` + `ValidationExtensions.NoHtml()` [rejects `<`/`>`] +
allowed-set for string-enums + `.RealEmail()` + list count caps). Baseline was already strong (most handlers fully
validated; `AbuseDetectionMiddleware` blocks script/multi-token-SQL on JSON write bodies; React output-escapes;
validators auto-discovered via `AddValidatorsFromAssemblyContaining<AssemblyMarker>`). Backend-only, no migration.
Fixes:
- **MergeMembersCommand** (`DuplicateHandlers`, highest) — added a validator: the CG-chosen keeper field values
  (names/nationality/school/classe/section/profession/medical/allergies/notes + PhotoPath NoHtml+cap,
  PrimaryContactEmail RealEmail, LoserIds ≤20). Previously arbitrary free-text was written to a live member.
- **CreateDemandeInviteCommand** — Label MaxLength(100)+NoHtml (shown on the ANONYMOUS invite page), Email
  RealEmail+cap.
- **Camp / CampGame** create+update — Name/ScoutYear/Description caps + NoHtml (were only `.Trim()`'d).
- **Rentrée** SaveTemplate/CreateTask/UpdateTask — Title/Description/Phase/DeadlineLabel/AssigneeRole caps + NoHtml.
- **Meetings** — added NoHtml to Title/Notes (create+update) + absence Reason.
- **ArchiveTrombinoscore / SetPublished** — ScoutYear NotEmpty+cap+NoHtml (flows into the PDF header + filename).
- **EmailTemplate attachments** — per-item Name (≤200, NoHtml) + Url (≤500) caps (only the list count was capped).
- **MemberGroup rule Value** — cap(200)+reject angle brackets (stored raw).
- **DemandeReminder SendSubmissionReminders** — ScoutYear NotEmpty+cap+`^[0-9\- ]+$`.
- **ContactMessage reply** — Subject reject angle brackets (body is HTML-encoded at the email sink).
- Verified live: a demande-invite `<b>x</b>` label (NOT caught by the abuse middleware — it only flags
  script/SQL) is now rejected by NoHtml → proves the per-field checks add real coverage; camp `<script>` → 400
  (abuse middleware), valid camp → 201, bad invite email → 400. 102 tests pass.
- **DELIBERATELY NOT NoHtml'd** (documented decision — they can legitimately contain `<`/`>` and are already safe
  at OUTPUT [React-escaped, never `dangerouslySetInnerHTML`] + AbuseDetection blocks script + admin/CG-gated):
  `UpdateSettingCommand.Value` for string-typed settings (login/result/maintenance MESSAGES — a CG may write
  "Réunion < 18 ans") and custom-field text values / select options (a value like "< 1m50"). These keep their
  length caps. Also intentionally exempt (render sanitized): TipTap/CMS HTML bodies (News/Page/Event/Resource,
  EmailTemplate BodyHtml, DocumentType.TemplateHtml) — DOMPurify at render + HTML-encode at the email sink.
- Convention recorded as a standing rule — see memory [[feedback-input-sanitization-default]].

### Audit log — member Journal tab + export + purge-backup + user filter (2026-09-19, DEV until deploy)
Improvements to the (already mature) audit trail. Migration `AddAuditLogEntityIdIndex` applies on prod startup.
- **Member fiche "Journal" tab** (gated `audit.view` = CG/super-admin): `GetMemberAuditLogsQuery` +
  `GET /audit-logs/member/{id}` returns rows where **`EntityId == memberId` (subject) OR `UserId == the member's
  login` (actor)** — direct member actions (profile/contact edits, reset-password, delegation, super-admin,
  restore…) + the member's own actions (logins, self-edits, proposals). Added an `entity_id` index so the OR uses
  **BitmapOr** over `ix_audit_logs_entity_id` + `ix_audit_logs_user_id` (verified via EXPLAIN). NOTE: actions on a
  member's OWNED entities (a document/assignment/cotisation row) log the CHILD entity's id, so they're NOT in the
  tab — full coverage would need a dedicated `member_id` column on `audit_logs` (documented future enhancement).
  New `MemberAuditLog` component + tab in `members/index.tsx`.
- **Export** — `GET /audit-logs/export` (audit.view) streams the current filtered view as a CSV ("Exporter" button).
- **Purge now backs up first** — `DELETE /audit-logs` (super-admin) serializes the deleted rows to a CSV
  (auto-downloaded, `X-Deleted-Count` header) BEFORE `ExecuteDelete`, and writes a surviving **"Purge"** audit row
  (Count + Before) so the wipe itself is recorded. `AuditCsv.BuildAsync` (UTF-8 BOM, RFC-4180) shared by both.
- **User filter** — `GetAuditFilterOptionsQuery` now also returns the distinct actor users; the viewer has a
  Utilisateur dropdown (the backend `userId` filter was already there, just unexposed).
- **Shared rendering** — extracted the label maps / UA parser / value formatter / row summary to `lib/audit-format.ts`
  and `DiffViewer` to `components/admin/audit-diff.tsx` (react-refresh wants component files to export only
  components), reused by the admin page + the member tab. `formatVal` now renders nested arrays/objects (was
  "[object Object]"). Verified live: endpoints auth-gate (401), member journal returns rows, builds 0/0 + tsc/eslint/vite clean.
- [x] **Trigram GIN index for audit search — DONE (2026-09-20, DEV until deploy).** Was: seq scan + `jsonb_pretty`
  on old+new values per row = ~170ms over 9k rows. Fixed with a single generated STORED column
  **`AuditLog.SearchText`** = `f_unaccent(lower(coalesce(ip_address,'') || ' ' || action || ' ' || entity_type ||
  ' ' || coalesce(old_values::text,'') || ' ' || coalesce(new_values::text,'')))` (all IMMUTABLE: f_unaccent
  wrapper + jsonb_out + concat) + a **GIN `gin_trgm_ops`** index on it (migration `AddAuditLogSearchText`; the
  index via raw SQL — fluent API can't express gin_trgm_ops). `AuditFilters.Apply` search is now ONE branch
  `a.SearchText.Contains(DbFns.Unaccent(s))` → `search_text LIKE '%'||f_unaccent(@s)||'%'` = **Bitmap Index Scan**,
  **1.6ms (~100×)**. Chose one generated column over 6 per-branch indexes (an OR forces a full scan unless every
  branch is indexed) — one GIN index, and GIN fastupdate batches the write cost on this append-heavy table. Live:
  meute→120 (unchanged), 2eme→77 (accent-insensitive). TRADE-OFF: the free-text search no longer matches the
  actor's **email** (it's on the joined users table, not in the per-row haystack) — the **Utilisateur** filter
  dropdown covers actor filtering. `DbFns.JsonbToText` (jsonb_pretty) is now unused but left mapped (harmless).
- **DEFERRED (proposed, needs a decision / separate batch):** (2) a **retention policy** for `audit_logs` — audit is
  compliance data, so auto-deletion is a governance call (keep-forever vs trim); the purge-with-backup already
  covers the manual path. (3) **sensitive-READ auditing** (who VIEWED a minor's medical/documents) — a big new
  logging surface (volume + perf + privacy), deserves its own conversation.

### Audit-log retention — auto archive+clear on new scout year (2026-09-19, DEV until deploy)
Chosen retention model (with the CG): keep ~12 months, and **at each new scout year the whole audit trail is
exported, emailed to admin + CG, and cleared**. Made it AUTOMATIC on year rollover (no scheduler, no checklist).
- **Trigger:** `UpdateSettingCommandHandler` — when **`passage.scout_year` moves FORWARD** to a new year (parsed
  leading 4-digit start year; guarded so a correction/re-set never fires, and by an idempotency marker). So
  *setting the new year IS the trigger* — set it when you want the fresh log (it can fire a bit early if you set
  the year ahead, which is fine: nothing is lost, the new year's log just starts then).
- **Flow** (`Application/AuditLogs/AuditYearArchive.RunAsync`, irreversible-safe ordering): build a CSV of the
  WHOLE trail → **persist it to a durable, NON-web-served folder FIRST** (`IAuditArchiveStorage` →
  `AuditArchive:Directory`, else `<cwd>/archives/audit`; NOT `uploads/content`, which `ContentFilesController`
  serves anonymously — the CSV holds emails/IPs/PII) → in ONE transaction `ExecuteDelete` the trail + write a
  surviving **`ArchiveAnnuelle`** audit row + advance the marker **`audit.last_archived_year`** → commit → THEN
  email admin (super-admins) + CG (group-level role holders, resolved via `ContactEmailResolver`) via the durable
  outbox, with the CSV as a **per-send attachment** (unless > 15 MB → notification-only). If the durable write
  fails the year is NOT changed (`UpdateSetting` returns an error) so nothing is lost silently. Idempotent (marker
  → a retry / same-year re-set never re-archives).
- **Per-send email attachments (new capability):** `OutboxEmail.AttachmentsJson` (migration
  `AddOutboxEmailAttachments`) + `EmailJob.Attachments` (`EmailAttachment(Name, Path)`) + `IEmailService.SendAsync`
  gained an optional `extraAttachments`; `EmailService` validates each per-send path is under an allowed archive
  root (config `AuditArchive:Directory` / `<cwd>/archives`) before attaching — never web-served content. The
  outbox sender deserializes the row's attachments and passes them. Template attachments (uploads/content) are
  unchanged. Seeded template `audit_year_archive` ({{year}}/{{count}}/{{date}}/{{note}}).
- **Ops (`deploy/`):** `backup-db.ps1` now ALSO rclone-syncs the audit-archive folder OFF-server
  (`backup.auditArchiveDir` → `<remote>/audit`, kept, never pruned) and its status notification goes to
  `backup.alertTo` = **admin + CG**. **PROD:** set `AuditArchive:Directory` in appsettings.Production.json to a
  folder OUTSIDE the site (e.g. `C:\gndj-backups\audit`) so a deploy never wipes it, and point
  `backup.auditArchiveDir` at the same folder. The internal marker `audit.last_archived_year` is hidden from the
  Settings UI (client HIDDEN_KEYS).
- **Verified live end-to-end** (dev, then fully restored): rolling `passage.scout_year` 2026-2027 → 2027-2028
  archived 9072 rows to a 3.1 MB CSV under `archives/audit/`, cleared the trail to just the `ArchiveAnnuelle`
  row, set the marker, and queued **11 outbox emails** (super-admin + CG/ACG contact emails) each carrying the
  CSV attachment (sent via smtp4dev). Then restored dev exactly (audit_logs, scout_year, marker, outbox, admin
  hash, archive dir). Build 0/0, tsc+eslint clean. NOTE on tooling: after `dotnet ef migrations add`, REBUILD
  before running with `--no-build` — `migrations add` writes the new snapshot `.cs` but does not recompile it, so
  a `--no-build` run trips EF's runtime `PendingModelChangesWarning` (not real drift). Also updated the global
  `dotnet-ef` tool to match the runtime (10.0.12).

### Two production bugs found by live end-to-end tests (2026-09-25, DEV until deploy)
- **Demande submit 409 after deleting the newest demande.** `DemandeSerial.NextAsync` read the max INS number
  through the soft-delete query filter, but `ix_demandes_serial_number` is UNFILTERED (covers deleted rows). Once the
  highest-numbered demande was deleted, every later submission re-picked that number, the 5 retries all collided, and
  submit returned 409 "Cet enregistrement existe déjà". PROD was affected since 2026-09-16 (INS-2026-0246 deleted →
  late-invite submissions failed). Fix: `IgnoreQueryFilters()` so deleted serials count (a number is never reused).
- **Deleting a member with ended assignments → 500.** `DeleteMemberCommand` did `Include(m => m.Assignments)` then
  `Members.Remove`, so EF tried to sever the required MemberAssignment→Member FK ("association … severed"). Hit
  practically every alumnus. Fix: load the member alone and read assignment facts with a separate query (same
  pattern as the earlier User fix). Verified: delete 204 → soft-deleted + login disabled → restore → delete → purge.
- Also found (DATA, not fixed — needs a human): 3 malformed emails that the outbox can never deliver (it retries then
  marks Failed, not blocking the rest): member `chloejohannabachaalany<chloejohannabachaalany7@`, guardians
  `a.lahoud@lahoud_lowfimcom` and `cassaf@tyanzgheibcom` (missing dot). Prod copy from 09-24, so prod has them.

### Improvement batch (2026-09-25, DEV until deploy)
- **Per-account login lockout:** `ILoginThrottle` / `Infrastructure/Services/LoginThrottle` (in-memory, singleton) —
  5 failures in a row on one email → locked 1 min, then doubling (2, 4, 8…), max 30 min; forgotten after 1 h without
  failures. Keyed by the TYPED email (normalised), so unknown emails lock the same way (no account enumeration).
  Applied to the member password login, the email-code login and the parent-portal login; checked BEFORE the
  password (the right password waits too). Cleared by a successful login and by every password reset (link, leader
  reset, parent reset, CG reset of a parent). Message: `LoginThrottleMessages.Locked`.
- **Parent-portal sessions per device:** `ApplicantSession` (table `applicant_sessions`, migration
  `AddApplicantSessions`, copies each account's live token so nobody is signed out; dev: 149 carried over).
  `DeviceSession` abstract base shared with `UserSession`; `ApplicantSessions` helper next to `UserSessions`
  (start / find-by-token with the 120 s grace / end-all). `applicant_accounts.refresh_token*` dropped. Sessions
  actives lists parent devices too (Appareil column for both).
- Verified live 14/15 (the 15th was a wrong test assumption: a carried-over session has no device name).
- **Lighter first load:** the rich-text editor was already lazy; the real weight was `libphonenumber-js` (~309 KB
  raw) pulled into the ENTRY chunk by the always-mounted contact-review popup, and `qrcode.react` (~43 KB) by the
  PWA install banner. The popup is now a tiny gate (`contact-review-popup.tsx`) that lazy-loads the dialog
  (`contact-review-dialog.tsx`); the banner lazy-loads the QR component. Entry chunk 581 → 399 KB, first-load JS
  1121 → 940 KB raw (286 KB gzip). Measure with `vite build --sourcemap` + the source-map breakdown.
- **Offline:** `public/sw.js` (SW_VERSION gndj-v2) answers a failed PAGE load with a self-contained "Pas de
  connexion" screen (auto-reloads on `online`, Réessayer button); API/assets still pass straight through (no
  caching, on purpose). `components/shared/offline-banner.tsx` (in AppLayout under the header) shows an amber
  banner while `navigator.onLine` is false. Browser-verified 6/6.
- **Email bounces:** `EmailBounce` (table `email_bounces`, migration `AddEmailBounces`, one row per address: kind
  hard/soft/complaint, count, suppressed). `EmailWebhooksController` (anonymous, authenticated): `POST
  /email/webhooks/mailgun` (HMAC-SHA256 of timestamp+token with `EmailBounces:MailgunSigningKey`, 1 h replay window)
  and `POST /email/webhooks/{provider}/{token}` (token = `EmailBounces:WebhookToken`; JSON object/array or form;
  flexible field names for SMTP2GO / SendPulse). `RecordEmailBounceCommand` upserts: hard/complaint suppress at once,
  soft after 3. The outbox sender marks rows to a suppressed address **Failed** ("Adresse en échec…") instead of
  sending. Webhook path exempt from the abuse scan. Setup steps in `deploy/OPS.md`.
- **"Qualité des données"** (`/admin/data-quality`, Suivi, maitrise.manage; `GET /data-quality`, `DELETE
  /data-quality/bounces/{id}` = Réactiver): active members only — invalid emails (same rule as the forms,
  `ValidationExtensions.IsRealEmail`), bounced emails with their owners, members with no reachable email
  (`ContactEmailResolver`), missing date of birth / gender, duplicate count (→ Fratries → Doublons). ≤500 lines per
  section. Dev: 1 invalid, 22 without email, 26 without DOB. Verified live (webhooks, suppression, report, CU 403).
- **Backup restore test:** `deploy/restore-test.ps1` (ASCII, PS 5.1) restores the newest `gndj_*.dump` into a
  scratch DB (`gndj_restore_test`), compares 7 key tables with live (non-empty, ≥90 %) + the latest migration,
  fails if the newest dump is older than 36 h, drops the scratch DB, emails OK/FAILED (`-NoEmail` to just print).
  Registered by `install-ops-tasks.ps1` as **GNDJ-RestoreTest** (every 4 weeks, Sunday 04:00). Config block
  `restoreTest` (optional user/password if the DB user lacks CREATEDB). PS 5.1 gotchas handled: native stderr under
  EAP=Stop (local Continue + `client_min_messages=warning`), bare `"` stripped from native args (use `\"`),
  history table column is `migration_id` (snake_case). Verified on dev: OK run + a real FAILED run (old dump).
- **End-to-end smoke suite (`tests/e2e/`)** — run before EVERY deploy: `powershell -ExecutionPolicy Bypass -File
  tests/e2e/run.ps1` (`-ApiOnly` without the frontend, `-Unit` to also run `dotnet test`). `api_smoke.py` (stdlib,
  38 checks: sign-in + lockout, per-device sessions, access control youth/CU/CG/super-admin, main endpoints, data
  quality + bounce webhooks, public + portal) and `ui_smoke.mjs` (playwright-core driving the installed Edge, 18
  checks: login pages, CU roster + member file, phone + installed-app back button, offline screen, admin pages, no
  JS errors). Dev data from `dev-sync-from-prod.ps1` (password `Gndj2026!`); accounts overridable by env vars;
  refuses non-localhost; cleans up its own sessions/bounces. README in the folder.

### System health batch (2026-09-25, DEV until deploy)
Catch problems before members notice them. Migration-free (patch 028 only).
- **Job heartbeats:** `IJobMonitor` / `JobMonitor` (in-memory singleton). Every background service registers
  (key, French label, expected interval) and reports each run (`Succeeded`/`Failed`). Stale = no run for
  1.5 × interval + 15 min (from startup when never run); Failing = last run errored. Keys: email-outbox,
  push-outbox, member-purge, document-campaign, rentree-reminders, log-maintenance, ops-alert.
- **Slow pages:** `SlowRequestMiddleware` (after auth) times `/api` requests; ≥ `Monitoring:SlowRequestMs` (2000)
  → `ISlowRequestLog` (bounded ring + per-route aggregates, route normalised GUID/number → {id}, coarse role) +
  a Warning log.
- **`ISystemHealthService` / `SystemHealthService`:** the Système snapshot — jobs, email + push outbox stats
  (stuck = Pending > 2 h; email failures exclude bounce-suppressed rows), disk (`Monitoring:DiskLow*`), slow
  routes, config issues — and the plain-language `Problems` list.
- **`IOpsAlertSender` / `OpsAlertSender`:** recipient resolution (error.notify_email → ErrorAlerts:Email → oldest
  super-admin) + delivery (dedicated `ErrorAlerts:Smtp` if set, else outbox `adhoc_message`). `ErrorNotifier` now
  uses it (logic moved, behaviour unchanged).
- **`OpsAlertBackgroundService`:** hourly; emails the `Problems` list at most once per Lebanon day (marker setting
  `ops.alert_last_sent`, category maintenance). `Monitoring:OpsAlertInitialDelaySeconds` (default 20 min) for tests.
- **`Application/SystemHealth/ConfigurationChecks`:** settings rules (scout-year format + consistency, enrolment
  window order, the 5 document-campaign dates in order [links to /admin/documents-suivi], test email mode, excluded
  classe in the list, cotisation currencies/amounts/rates, no alert recipient) and email-template rules (every
  `{{var}}` declared in the template's Variables JSON; no stray braces; active templates only). Patch **028**
  declares `demandeNumber` on the 3 demande templates (it was supplied by code but undeclared); seeds updated.
- **Stray uploads:** `IUploadFileAudit` / `UploadFileAudit` — files in uploads/documents + uploads/photos that no
  row points to (incl. soft-deleted; by file name), older than a day; delete re-scans server-side and REFUSES when
  > 20 orphans and more than half of the scanned files (wrong folder / other database). uploads/content not scanned.
- **API** `SystemController` (api/v1/system): `status` (super-admin), `settings-check` (CanViewAny; a CG sees
  issues for categories they edit + page links), `email-templates-check` (SettingsAccess.IsAdmin), `orphan-files`
  GET/DELETE (super-admin, delete audited).
- **Frontend:** page `/admin/system` "Système" (sidebar Configuration → Système & sécurité, super-admin; refreshes
  every minute). `ConfigIssuesBanner` (shared) on Paramètres (top) and Modèles d'email. Check queries keyed under
  `['settings','check']` / `['email-templates','check']` so saving re-runs them.
- **Server:** `deploy/healthcheck.ps1` also watches free disk (`disk` block, default C + backup drive, 10 % / 5 GB),
  emailing on change only (`deploy/disk-state.txt`, gitignored). `ops-common.ps1` Send-OpsAlert works without SMTP
  credentials (local relay).
- **Smoke suite:** +10 API checks (48 total), Système page in the browser checks (19), and `bundle_budget.mjs`
  (builds into a temp folder: entry ≤ 450 KB raw, first-load JS ≤ 320 KB gzip; `run.ps1 -SkipBundle` to skip).
  +13 unit tests (`ConfigurationChecksTests`).
- NOTE (dev): the first stray-file run deleted 49 unreferenced files from `src/GNDJ.Api/uploads` (dev test leftovers
  orphaned by the prod DB sync); that's why the safety stop was added.

### Documentation — in-app "Aide" + guides (2026-09-25, DEV until deploy)
- **Guides = Markdown in `docs/help/*.md`** (front matter `title`, `audience` public|member|cu|cg|admin|dev,
  `order`, `summary`; screenshots in `docs/help/img`). Six guides: `guide-inscription` (public, families),
  `guide-membre`, `guide-chef-unite` (replaces the old docs/guides CU guide), `guide-chef-groupe`,
  `guide-administration`, `documentation-technique`.
- **Server-side access** (`GNDJ.Api/Help/HelpDocs` + `HelpController`, `/api/v1/help`, `[AllowAnonymous]`, gated per
  guide): public = anyone; member = signed-in member; cu = members.edit or group manager; cg = group manager;
  admin/dev = super-admin. Images need auth except those used by a public guide. Search = accent-insensitive per
  section. Development reads the repo folder live (edit → refresh); prod reads `<output>/HelpDocs` (csproj copies
  docs/help/*.md + img/*). Never bundle guides into the frontend (static chunks are public).
- **Frontend:** `/aide` + `/aide/:slug` (list by audience, search, TOC; single guide → list hidden), print view
  `/aide/imprimer/:slug` (no chrome, sets `body[data-help-ready]`), public `/guide/:slug` + `/guide/imprimer/:slug`.
  `components/help/markdown-view.tsx`: marked + DOMPurify, heading anchors (`headingId`), images fetched as blobs
  with auth, ```mermaid (lazy-loaded, GNDJ theme, securityLevel strict), callouts (💡 ⚠️ ✅ blockquotes),
  cross-guide links `other.md#anchor`. Menu: "Aide" in the member sidebar + account menu; portal header + auth shell
  link the public guide. mermaid 12 + marked added; `lodash-es` overridden to 4.18.1 (mermaid's chevrotain pulled a
  vulnerable one) → 0 vulnerabilities.
- **Tools (`tools/help-docs`, see README):** `capture.mjs [public|portal|member|cu|cg|admin]` retakes screenshots on
  the dev app with every real name/email/phone/IP replaced by consistent FAKE ones (gender-aware first names from
  the DB, initials badges recomputed, photos blurred; the portal group opens enrolment temporarily with a fictitious
  family and restores/deletes everything). `pdf.mjs` exports every guide to `docs/help/pdf` (gitignored) from the
  app's own print view.
- Smoke suite: +7 API checks on guide access (55 total), browser check opens a guide (20).

### UI consistency pass (2026-10-04, DEV until deploy)
Full-app audit (4 reviewers) → fixes by area. Conventions written down in the session (kit usage, wording, dates):
- **Shared kit, always:** Page + PageHeader (icon + one-line description, header shown while loading/empty), BackLink /
  BackToSettings, Callout (every tinted notice and every error box), EmptyState, LoadingSpinner (matching variant),
  SearchInput, SegmentedToggle (now `disabled`), `ui/textarea` (new), DateInput (never type=date), CopyButton, Badge
  variants, Button `variant="success"` (new) for positive actions, Tip + aria-label on icon-only buttons.
- **Confirmations:** `confirmAsync({title, description, confirmLabel, destructive})` from `lib/confirm.ts` (promise-based,
  rendered by `ConfirmHostGate` in main.tsx, lazy) replaces every native confirm; ConfirmDialog for the rest.
- **One `<Toaster>` in main.tsx** (removed from AppLayout / PublicLayout / applicant shells — the forced-password screen
  had none). Mutations: success toast + `toast.error(parseApiError(e))`; blob downloads `parseBlobError`.
- **Dates (`lib/utils`):** formatDate (04/10/2026), formatDateLong (4 octobre 2026), formatDateTime, formatMonthShort,
  parseDay (yyyy-MM-dd as a local day). Page-local helpers removed (fixed the public agenda "avri/octo" months).
- **Wording:** "Email" (no "courriel", backend messages too), "Identifiant" (login name; login error "Identifiant ou mot
  de passe incorrect."), "Espace membres", "chef d'unité" (no "CU" in UI), "…" single character, "Fermer" in dialogs.
  `GROUP_NAME` constant (lib/constants). Menu labels = page titles ("Documents & cotisations", "Modèles de rapports",
  "Validation des passages", "Suivi des documents", "Réunions & absences", "Archives des demandes", "Parcours scouts",
  "File d'emails", "Emails aux chefs"); nav arrays moved to `components/layout/nav-items.ts` (sidebar + command palette).
- New: `MemberAuthShell` (forgot/reset/login share the /login look), `components/public/pagination.tsx`,
  `public-back-link.tsx`. DateInput no longer wipes a half-edited pre-filled date.
- Behaviour changes: member create form validates DOB/sexe/nationalité/école (server already required them); new
  confirms (document page delete, custom-field clear, passage open/close, notification send, commission removal,
  login-message delete, email-queue delete, guardian phone/email delete); demande quota no longer saves 0 on blur.
- Verified: tsc + eslint + build clean, smoke suite 60/60 API + 20/20 browser, bundle budget OK (entry unchanged).
  NOTE: port 5173 on this box is used by ANOTHER project's Vite ("Vessel Compliance") → GNDJ's dev frontend now runs on
  a FIXED port **5180** (vite.config `port: 5180, strictPort: true`; API CORS, app.base_url default + dev-sync script,
  start.ps1, smoke tests and help-docs tools all point at 5180).

### Performance audit (2026-10-08, DEV until deploy)
Measured first (all API endpoints 1–235 ms on dev; page loads 1–1.6 s; compressed payloads fine), then fixed:
- **Entry chunk 438 → 214 KB**: `lib/app-version.ts` no longer imports `data/changelog.json` (~200 KB, grew every
  release); the changelog is in `lib/changelog.ts`, imported only by the changelog page. Budget lowered to entry
  280 KB / first-load 260 KB gzip (`tests/e2e/bundle_budget.mjs`).
- `/auth/bootstrap` also returns `shellSettings` (cotisation.currency_symbols, pwa.install_promotion) + `switchAccounts`,
  primed into the cache; `GetMeQuery` computes `ProtectedAccount` from rows it already loads (`FamilyAccess.IsProtectedAsync`
  removed). Account menu fetches the password policy only when its dialog opens; maintenance poll 60 s → 120 s.
- `PublicCacheMiddleware`: frequent non-public writes (my-profile, documents, meetings, camps, cotisations, passages,
  demandes, …) no longer evict the public output cache; passage finalize, send-responses, close-campaign, submissions
  and rentrée run-action still do. `MarkAppInstalled` = one conditional UPDATE, and the client skips it once flagged.
- Demande review: haystacks built once per load + `useDeferredValue` search; only the visible layout is mounted
  (`hooks/use-media-query.ts`); waits for `demande.scout_year` instead of fetching with a fallback year; review
  projection loads 5 sibling fields and only decided units.
- Dashboard editor (dnd-kit) split to `components/dashboard/dashboard-editor.tsx` (lazy). Member photos cached in
  TanStack (`['member-photo', id, photoPath, refreshKey]`, blob URL revoked on removal — lib/query-client.ts);
  upload/delete drop the cached photo.
- Attendance save applies a diff (no soft-deleted copies per save). Calendar skips the roster query when the viewer
  sees the réunion anyway; ICS line folding without per-char allocation. Dashboard overview: one demande query.
  System status caches the uploads-folder size 1 h. Partial index `ix_member_change_requests_pending`
  (migration `AddChangeRequestPendingIndex`).
- Manual probe `tests/e2e/page_probe.mjs` (page load time + API calls per page on a `vite preview` build).
- Not changed (measured fine / low value): MemberTodo batching for « Ma famille », document-campaign triple compute,
  audit-log filter options, narrower demande-mutation invalidation.

### Code audit fixes + comments pass (2026-10-08, DEV until deploy)
- **Secrets:** `Common/SecureTokens` — `TempPassword()` (shown passwords, « Scout2026!K7mQ4x », ~2.7e10 values; was 900),
  `HiddenPassword()` (never-shown logins: demande conversion), `UrlToken()` (activation / reset links; was copied 6×).
- **Bugs:** UpdateTeam checks the TARGET unit too; photo upload/delete/get use `MemberAccess.CanAccessMemberAsync` /
  `CanViewMemberAsync` (CG reaches members with no active post); passage-validation + rentrée « Générer » use the
  configured year (`useCurrentScoutYear`, whose fallback is now `calendarScoutYear()`, no hard-coded year left);
  `todayIso()` (lib/utils, device-local) replaces `toISOString()` dates; PDFs « Généré le » use `LebanonClock.Now`;
  `Common/ParentRoles` = exact père/mère match (not grand-père / beau-père); camp ranking shows played/real game count.
- **Dead code removed:** `SetDemandeEnabledCommand`, client hooks useSwapParticipants / useActiveCustomFields /
  useMemberCustomFieldValues / useMaitrises / useLinkSiblings, exports MEETING_STATUS_LABELS / MeetingType /
  ExpiringDocumentDto / PROFESSION_OPTIONS / telHref. Endpoints only those hooks called were KEPT (API keys may use them):
  POST /camps/swap, GET /custom-fields/active + /member/{id}, GET /maitrises, POST /siblings/link, GET /documents/expiring.
- **Shared helpers:** `normalizeSearch` (lib/utils, client accent-free search), `RELATIONSHIP_OPTIONS` +
  `relationshipLabel` + `canonicalRelationship` (lib/options), `formatDayLong` (lib/utils); hand-made date formats →
  formatDate / formatDateLong / formatDateTime; backend: TextNormalization.NormalizeKey, UsernameFactory.Normalize,
  MemberAccess.IsGroupManager reused instead of copies.
- **Comments pass:** ~400 comment lines on the 80 least-commented files (components, pages, backend handlers/services);
  `tools/comments-only-check.py [git diff args]` verifies a diff only touches comment lines.
- **Follow-up (same day):** nothing outside connects to the API, so the 6 kept endpoints were REMOVED with their handlers
  (POST /camps/swap, GET /custom-fields/active + /member/{id}, GET /maitrises, POST /siblings/link, GET /documents/expiring).
  `BaseApiController` gained `OkOrBadRequest` / `NoContentOrBadRequest` / `OkIdOrBadRequest` (Result → 200 / 204 /
  200 {id}, else 400 {error}); 187 repeated blocks + the local Res / Wrap / FromResult helpers use them (actions that do
  more than send-and-map keep their own code). « Ma famille »: `MemberTodo.ComputeManyAsync` (group data once, each table
  one query for all children) + `DocumentCampaign.ForMembersAsync`; the single-member forms wrap them. `Common/PhoneNumbers`
  (Digits + SameDigits = last 7 digits) replaces the copies in demande conversion / Déjà membre ? / Fratries / guardian
  search / leaver contact. `timeAgo` in lib/utils (rounded down, « hier », short date after 30 days) for the bell + Sessions.

### Background-jobs fix batch from the full-app review (2026-10-10, DEV until deploy)
- **Member purge**: re-checks (`FOR UPDATE`) that the member is still soft-deleted inside the transaction (a member
  restored from the Corbeille mid-run was wiped); the photo file is deleted only if no remaining member points to it
  (a merge keeps the loser's photo for the keeper).
- **Rentrée digest**: current scout year only (`passage.scout_year`); digests are STAGED and saved with the "sent"
  marker in one SaveChanges (no double send on a failed save). **Passage reminders**: marker saved before sending.
- **Background services**: every `catch (OperationCanceledException)` is now `when (stoppingToken.IsCancellationRequested)`
  — a timeout inside a run no longer stops the job until the next restart.
- **LebanonClock.ToUtc**: a time skipped by summer time (00:00–00:59 on the spring-forward night) moves one hour later
  instead of throwing (it broke the whole phone calendar feed). Unit test added.
- **Email outbox**: a sweep where every email (3+) fails = provider outage → rows retried in 5 min without using an
  attempt (only rows < 24 h old, so a broken setup still ends Failed).
- **Housekeeping**: calendar reminder markers older than 60 days pruned daily (outbox/push/notifications already were).
- **Smoke suite**: default CG/CU accounts updated after the 2026 publish (christian.asmar / valerie.chedid.el.helou);
  62/62 API + 21/21 browser checks pass.


### 2026-10-10 — Client disconnects no longer logged as 500
- `/auth/refresh` 500s in the error log were `ConnectionResetException` (phone lost network while IIS read the body
  in `AbuseDetectionMiddleware`). `ExceptionHandlingMiddleware` now treats `ConnectionResetException` / IOException
  on an aborted request like the existing cancelled-request case: Information log, 499, no error reference/alert.

### 2026-10-10 — Refresh race no longer reported as an error
- Prod journal showed « Concurrency conflict on POST /api/v1/auth/refresh » (Warning) + « responded 500 » (Error) for the
  same request: two tabs / browser + PWA refreshing the same device session at once. `UserSession.TokenHash` is a
  concurrency token on purpose (one rotation wins); the loser is answered 409 and `api-client.ts` replays with the
  tokens the winner stored — the user saw nothing. The « 500 » was the request logger seeing the exception before
  ExceptionHandlingMiddleware turned it into 409.
- Now: refresh races are logged at Information (no stack, out of the journal); `GetLevel` maps
  `DbUpdateConcurrencyException` to Information (the middleware logs other conflicts as Warning itself). Live race
  test: 1×409, 0×500, nothing in application_logs.
