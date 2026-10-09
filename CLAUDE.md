# GNDJ — Scout Group Management Platform

Web app for the Groupe Notre Dame – Jamhour (Lebanese scout group, ~1,100 active members): members, units, teams,
roles, documents, cotisations, progression, demandes d'inscription, passage, rentrée, réunions, Camp BP, calendar,
notifications, public website. **Live at https://gndj.org** (behind Cloudflare, IIS on Windows Server).
- **UI language**: French · **Code / comments / commits**: English

> This file holds only what applies to every task. The full build history (why each feature works the way it does)
> lives in **`docs/history/<area>.md`** — see "Before changing a feature" below.

## Tech stack
- **Backend**: ASP.NET Core 10, EF Core (Npgsql, snake_case, pooled DbContext), **Mediator** (source-generated, not
  MediatR), FluentValidation, QuestPDF, ClosedXML, Serilog, WebPush
- **Frontend**: React 19 + TypeScript + Vite, shadcn/ui + Tailwind v4, TanStack Query, Zustand, React Router, TipTap
- **Database**: PostgreSQL 18, UUIDv7 keys (`Guid.CreateVersion7()`), global soft delete
- **Auth**: custom JWT (15 min) + per-device rotating refresh tokens, BCrypt; separate applicant (parent portal) realm

## Layout
```
src/GNDJ.Domain/          entities (66), enums, Permissions
src/GNDJ.Application/     one folder per feature (*Handlers.cs = command/query + validator + handler + DTOs), Common/
src/GNDJ.Infrastructure/  GndjDbContext, EF configs, migrations, SeedData, DataPatchRunner, services
src/GNDJ.Api/             controllers, middleware, authorization, background services, Program.cs
client/                   React app (pages/, components/{ui,shared,layout,…}, services/*-service.ts, lib/, stores/)
tests/                    xUnit projects + tests/e2e smoke suite
deploy/                   update/publish/deploy scripts, patches/*.sql, golive/, diagnostics/, ops scripts (OPS.md)
docs/                     DEPLOYMENT.md, DESIGN.md (UI conventions), help/ (in-app guides), history/ (build diary)
tools/                    Migration (WEBDEV import), FicheOcr, help-docs (screenshots/PDF), app-icon, camp-map
```

## Commands
```bash
export PATH="/c/Program Files/dotnet:$HOME/.dotnet/tools:$PATH"
dotnet build GNDJ.slnx
dotnet test GNDJ.slnx                       # stop the API first (DLL lock)
dotnet run --project src/GNDJ.Api --urls "http://localhost:5000"
cd client && npm run dev                    # :5180 (fixed, strictPort — :5173 is another project); proxies /api → :5000
cd client && npx tsc -b && npx eslint . && npm run build
powershell -ExecutionPolicy Bypass -File tests/e2e/run.ps1   # smoke suite (API + browser), BEFORE EVERY DEPLOY
dotnet ef migrations add <Name> --project src/GNDJ.Infrastructure --startup-project src/GNDJ.Api --output-dir Persistence/Migrations
```
- Dev DB: local PostgreSQL 18 :5432 (user `gndj_admin`, db `gndj`), refreshed from prod with
  `deploy/dev-sync-from-prod.ps1` (email-safe; every login's password becomes `Gndj2026!`). Local mail: smtp4dev.
- Migrations + seeders + data patches apply automatically at API startup. Rebuild after `ef migrations add`
  before running with `--no-build`.
- Deploy: on the prod server, `deploy\update.ps1 -Pull` (elevated). Never `reset-to-import.ps1` on prod.

## Backend conventions
- **Request flow**: controller (`BaseApiController`, `[HasPermission(Permissions.X)]`) → `Mediator.Send` →
  `ValidationBehavior` (every validator, async) → handler → `Result<T>`; map with `OkOrBadRequest` /
  `NoContentOrBadRequest` / `OkIdOrBadRequest`. Errors are French messages. `ExceptionHandlingMiddleware` maps
  validation → 400, `UnauthorizedAccessException` → 403, Postgres constraint → 409/400, concurrency → 409.
- **Authorization is in the handler**, not just the attribute: use `Common/MemberAccess` (`CanAccessMemberAsync`,
  `CanViewMemberAsync`, `CanLeadUnit`, `IsGroupManager`) for anything about a member or unit. `members.edit` is the
  "leader" signal; group managers = super-admin or `maitrise.manage`. Self-service endpoints (`/my-profile/*`)
  resolve the caller's own member id server-side — never trust a client id.
- **JWT** carries `permissions`, `unit_ids`, `member_id`, `is_super_admin`, `sid`; built by `Auth/Common/AuthAccess`
  (posts → function → security profile, + delegated access; group-level profile = all units). Permission changes
  take effect at the next refresh (≤15 min).
- **Every input command gets a validator**: `.NoHtml()` + `MaximumLength` on free text, allowed-sets for string
  enums, `.RealEmail()` for stored emails, count caps on lists. Exceptions: TipTap/CMS HTML bodies (sanitized at
  render) and human-message settings.
- **Dates**: business "today" = `LebanonClock.Today/Now` (never `DateTime.UtcNow` for a calendar date); real instants
  stay UTC. Scout year = Oct 1 → Oct 1 (`ScoutYearHelper`), current year = setting `passage.scout_year`.
  Query-string `DateTime` → `.AsUtc()` before comparing to timestamptz.
- **Audit**: `IAuditService.LogAsync` with readable names (`AuditNames`), never raw GUIDs.
- **Email**: always through the durable outbox (`IEmailQueue`), templates by code; enqueue AFTER the state commits
  (or `Stage` in the same SaveChanges). Notifications via `INotificationService` (also pushes).
- **Data changes on prod** = an idempotent `deploy/patches/NNN_*.sql` (no BEGIN/COMMIT; runs once per DB). Never
  copy dev data to prod.
- Settings: key/value table; new keys added to `SeedMissingSettingsAsync`; who may edit a category is in
  `SettingsAccess`.

## Frontend conventions (details in `docs/DESIGN.md`)
- Build pages with the shared kit: `Page` + `PageHeader`, `Callout`, `EmptyState`, `SearchInput`,
  `SegmentedToggle`, `DateInput` (never `type=date`), `Tip`, `confirmAsync` (never `window.confirm`), Sonner toasts
  with `parseApiError` / `parseBlobError`.
- Semantic colour tokens only (light + dark); dates via `lib/utils` helpers (`formatDate`, `formatDateLong`,
  `parseDay`, `todayIso`…); accent-free search via `normalizeSearch`.
- One `services/<resource>-service.ts` per API resource (types + TanStack hooks; keys start with the resource name;
  mutations invalidate it). Pages are lazy (`lazyWithReload`). Permissions: `PERMISSIONS` in `lib/constants.ts`,
  `useAuthStore().hasPermission`, `useIsManager`; routes guarded with `PermissionRoute` / `AdminRoute`.
- Watch the bundle budget (`tests/e2e/bundle_budget.mjs`): keep heavy libraries out of the entry chunk.
- Wording: "Email", "Identifiant", "chef d'unité" (not "CU" in UI), "Accepter/Accepté", "Réunion".

## Gotchas (each one cost a bug)
- **Child rows: add/remove through the DbSet with the FK**, never by mutating a tracked parent's navigation
  collection — that triggers a spurious parent UPDATE → `DbUpdateConcurrencyException` → 409.
- Deleting/removing a principal while a required dependent is tracked (`Include(User)`, `Include(Assignments)`)
  throws "association severed" → 500. Load the principal alone; update dependents set-based.
- `DbFns.Unaccent` only inside the LINQ expression (calling it in C# throws). It maps to the IMMUTABLE `f_unaccent`
  wrapper so trigram indexes apply.
- EF can't translate `GroupBy`/`OrderBy`/`Distinct` over projected DTOs or `DateOnly.MaxValue` — materialize first.
- Age with `new DateOnly(year, dob.Month, dob.Day)` crashes on 29 February — compare month/day instead.
- Unique indexes are NOT filtered by soft delete: reading "max + 1" (serials, card numbers) must
  `IgnoreQueryFilters()`.
- Imported data is messy: accented vs unaccented values (`Pere`/`Père`), synthetic `@scouts.gndj` login emails,
  duplicate guardians. Compare with `TextNormalization` / `ParentRoles` / `PhoneNumbers.SameDigits`, never exact.
- Radix `<Select>` shows nothing for a value not in its options — use `optionsWithCurrent` for stored legacy values.
- Tailwind v4: bracket CSS vars need `var()`; `dark:` is bound to the `.dark` class in `index.css`.
- Production CSP is `script-src 'self'`: no inline scripts; frames need `frame-src` (blob: for PDF preview).
- Data patches run as verbatim SQL through ADO.NET — never route them through `ExecuteSqlRaw` (`{` breaks it).
- Windows/PowerShell 5.1: deploy scripts must be ASCII; pipe SQL with accents via `psql -f` from a UTF-8 file.
- `npm ci` on prod needs `--include=dev`; check the lockfile with the prod npm version.

## Deliberately removed — don't rebuild without asking
Public self-registration (`/register`); bulk "Envoyer les accès" (all members got access in 2026 — only per-member
resend remains); activation links in chef emails; auto-renewal of members without a passage line; passage line
rejection (the CG changes a line instead); the `animateur` profile and dead permissions; `MemberRelationship`;
leader-only contact verification screen (replaced by the contact-review popup); one-time sibling/address backfill
tools; pinned professions; the `/inscription` landing page.

## Domain facts worth knowing
- `Feu` is a closed unit that combined Noyau + JEM — its JEM/Caravelle posts are correct.
- Unit type codes in parcours order: MEU, RON, TRO, COM, CLAN, NOY, JEM, FEU, CAR, GRP. Youth branches = MEU/RON/TRO/COM.
- Matricule (`card_number`, internal M-/F-) ≠ Numéro de carte (`external_card_number`, SDL/GDL).
- One head (chef d'unité) per unit is enforced (`HeadReplacement`); ACUs use the `assistant-unite` profile.
- Siblings are linked explicitly (`SiblingGroupId`); household data syncs across a confirmed fratrie.

## Before changing a feature
Read the matching file in `docs/history/` first (decisions, edge cases, past bugs):
`members-access` · `enrolment` · `passage-maitrise` · `documents` · `cotisations` · `rentree-calendar` ·
`camp-bp` · `email-notifications` · `public-site` · `progression-units` · `data-migration` · `ops-security-perf` ·
`ui-ux` · `foundations`. Ops/deploy reference: `docs/DEPLOYMENT.md`, `deploy/OPS.md`, `docs/GO-LIVE-CHECKLIST.md`.

## Workflow
- Comment new code (why, not what), matching the surrounding style.
- After each feature: one-line French entry at the top of `client/src/data/changelog.json` (`{date, text}`, keep
  the current version); append a short entry to the right `docs/history/<area>.md`; update CLAUDE.md **only** if a
  rule, gotcha or convention changed. Update `docs/help/` guides when the UI changes.
- **Camp BP exception**: no changelog lines and no guide edits until Camp BP is finished.
- Commit and push to `origin/main` after each finished change. Run the smoke suite before any deploy.
- Leave the API running at hand-off (stop it only to rebuild the backend).
