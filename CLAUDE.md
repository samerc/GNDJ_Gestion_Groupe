# GNDJ — Scout Group Management Platform

## Project Overview
Web application for managing a Scout organization: members, units, teams, roles, documents, badges.
- **UI language**: French
- **Code language**: English

## Tech Stack
- **Backend**: ASP.NET Core 10 (.NET 10), Entity Framework Core, Mediator (source-generated), FluentValidation
- **Frontend**: React 19 + TypeScript + Vite, Shadcn/ui + Tailwind CSS v4, TanStack Query, Zustand, React Router v7
- **Database**: PostgreSQL 18 (UUIDv7 primary keys)
- **Auth**: Custom JWT + BCrypt (no ASP.NET Identity)
- **PDF**: QuestPDF (receipt generation)
- **Notifications**: Sonner (toast system)

## Solution Structure
```
GNDJ.slnx                          # .NET solution
src/GNDJ.Domain/                    # Entities, enums, interfaces — zero dependencies
src/GNDJ.Application/               # Mediator commands/queries, DTOs, validators, pipeline behaviors
src/GNDJ.Infrastructure/            # EF Core, DB context, identity services
src/GNDJ.Api/                       # Controllers, middleware, authorization
tests/GNDJ.*.Tests/                 # xUnit test projects
client/                             # React frontend (Vite)
docker-compose.yml                  # PostgreSQL 18 + pgAdmin
start.ps1                           # Start both backend + frontend
seed-sample-data.sql                # Sample data (Lebanese scout group)
```

## Build Commands
```bash
# Both (PowerShell)
.\start.ps1

# Backend
export PATH="/c/Program Files/dotnet:$HOME/.dotnet/tools:$PATH"
dotnet build GNDJ.slnx
dotnet test GNDJ.slnx
dotnet run --project src/GNDJ.Api --urls "http://localhost:5000"

# Frontend
cd client
npm install
npm run dev          # Dev server (port 5173, proxies /api to localhost:5000)
npm run build        # Production build

# Database
# Local PostgreSQL 18 on port 5432 (user: gndj_admin, db: gndj)
# Migrations:
dotnet ef migrations add <Name> --project src/GNDJ.Infrastructure --startup-project src/GNDJ.Api --output-dir Persistence/Migrations
dotnet ef database update --project src/GNDJ.Infrastructure --startup-project src/GNDJ.Api
```

## Architecture Conventions
- Clean Architecture: Domain → Application → Infrastructure → Api
- CQRS-lite with Mediator source generator (commands + queries per feature folder)
- FluentValidation pipeline behavior (auto-invoked before every handler)
- Global soft-delete via EF Core query filters
- Permissions enforced server-side via `[HasPermission("x")]` attribute
- Unit-scoped data filtering in every query and command handler
- UUIDv7 for all primary keys (`Guid.CreateVersion7()`)
- Auto-generated card numbers: M-0001 (boys), F-0001 (girls)
- Role-based sidebar: super admin sees all, unit leaders see Ma fiche + Mon unité only
- Toast notifications (sonner) on all create/edit/delete operations
- API Key authentication via X-API-Key header with scope-based permissions
- Swagger UI at /swagger, OpenAPI spec at /openapi/v1.json

## Database
- 32 tables: associations, unit_types, units, teams, members, users, security_profiles, security_profile_permissions, functional_roles, member_assignments, member_relationships, member_phones, member_emails, member_addresses, guardians, guardian_links, guardian_phones, guardian_emails, audit_logs, settings, document_types, member_documents, member_cotisations, scout_stages, badges, member_progressions, passages, api_keys, custom_fields, member_custom_field_values, smtp_servers, email_templates
- Member fields: firstName, lastName, dateOfBirth, gender, cardNumber, bloodType, nationality, school, classe, section, medicalNotes, allergies, notes
- UnitType fields: name, code, description, numberOfYears, ageMin, ageMax
- Snake_case naming convention via EFCore.NamingConventions
- Global soft-delete query filters on all BaseEntity types
- Interceptors: AuditableEntityInterceptor (created/updated timestamps), SoftDeleteInterceptor (converts Delete to soft-delete)
- Seed data: 5 security profiles (super-admin, association-admin, chef-unite, chef-equipe, read-only), 4 functional roles, 1 super admin user, configurable settings (schools, classes, nationalities, etc.). The `animateur` profile was removed (2026-06-15) — it was an over-permissioned youth bucket (had members.edit/documents.create); youth/members now use `read-only`. Migration maps non-maîtrise roles → read-only.

## Security
- Rate limiting: auth endpoints (10 req/5min), file uploads (20 req/10min)
- HTTP security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-Permitted-Cross-Domain-Policies
- Global request body size limit: 1MB (file uploads override to 20MB)
- File upload hardening: MIME magic number validation (PDF/JPG/PNG), path traversal prevention, filename sanitization
- Unit-scoped authorization on ALL query and command handlers (contacts, assignments, documents, cotisations, progression)
- IDOR prevention: members can only access own profile or members in authorized units

## Test Accounts
- `admin@gndj.local` / `Admin123!` — Super Admin
- `joseph.elkhoury@scouts.gndj` / `Admin123!` — Chef d'unité Meute
- `marie.assaf@scouts.gndj` / `Admin123!` — Chef d'unité Troupe
- `patrick.doumit@scouts.gndj` / `Admin123!` — Chef d'unité Route
- `nadine.boutros@scouts.gndj` / `Admin123!` — Chef d'unité Maîtrise

## Current Phase: 3 (Complete) + Quality Pass

### Phase 1 (Complete)
- [x] Solution structure + project references
- [x] NuGet packages installed (no vulnerabilities)
- [x] React + Vite + Tailwind + Shadcn/ui initialized
- [x] Frontend builds successfully
- [x] Domain entities (26 entities + enums + interfaces)
- [x] Database layer (EF configs, interceptors, migration, seed data)
- [x] Authentication backend (JWT + BCrypt, register/login/refresh/logout/me endpoints tested)
- [x] Authentication frontend (Zustand store, api-client with token refresh, login/register pages, sidebar/header layout, React Router)
- [x] Authorization (HasPermission attribute, PermissionPolicyProvider, unit-scoped access via CurrentUserService)
- [x] Associations CRUD (backend + frontend admin page)
- [x] Unit Types CRUD (backend + frontend admin page)
- [x] Units CRUD (backend + frontend with unit-scoped access)
- [x] Teams CRUD (backend + frontend with totem/colors, unit filter)
- [x] Members CRUD (backend + frontend, list with search, tabbed detail: profile/contact/medical)
- [x] Assignments (create, end, delete, unit/active filters, cascading team dropdown)
- [x] Guardians/Family (shared guardians, sibling detection, guardian contacts)
- [x] Functional Roles management (unit type detail + admin page)
- [x] Settings system (key-value, admin page, pinned nationalities/professions, user domain)
- [x] Auto user account creation on member creation
- [x] Role-based dashboard (admin overview, unit leader 2-column roster, Ma fiche)
- [x] Role-based sidebar navigation
- [x] Field validation with red border highlighting
- [x] Searchable select with pinned favorites (nationalities, professions)
- [x] Debounced search on all list pages
- [x] Navy Doux color palette
- [x] Collapsible sidebar with mobile hamburger

### Phase 2 — Documents & Cotisations (Complete)
- [x] Document types (dynamic, admin-managed with code, expiry/approval flags, isActive toggle)
- [x] Member documents (upload, download, approve/reject workflow, expiry tracking)
- [x] Member checklist view (Ma fiche — required docs with direct upload per type)
- [x] CU Documents page (/unit-documents — matrix table: members × doc types + cotisation)
- [x] Inline document preview (images + PDF) with approve/reject from popup
- [x] Quick approve/reject directly from matrix cells (hover + keyboard accessible)
- [x] Status changes allowed at any time (approve→reject, reject→approve)
- [x] Zip download (all docs or filtered by doc type, organized by member folders)
- [x] Member cotisations (per année scoute, multi-currency USD/LBP/EUR, receipt number auto-generation)
- [x] Cotisation entry from CU matrix table (click cell → payment dialog)
- [x] Receipt PDF generation (QuestPDF, A5 format, downloadable with member name in filename)
- [x] Document/cotisation tabs on member detail + Ma fiche + unit leader dashboard
- [x] Dashboard warnings (expiring documents, unpaid cotisations)
- [x] Settings: max file size, allowed file types, default cotisation amount, current année scoute
- [x] File upload validation (size + type from settings + MIME magic number check)
- [x] Upload progress bar
- [x] Unit-scoped access on all document/cotisation operations
- [x] Members can upload own documents + view/download own cotisation receipts
- [x] Regular members redirected to Ma fiche (no unit page access)
- [x] New permissions: document_types.*, documents.*, cotisations.*
- [x] SeedMissingPermissionsAsync — auto-patches existing security profiles on startup

### Phase 2b — Admin Tools (Complete)
- [x] Audit log viewer (read-only, filters by entity/action/date, JSON key-value detail dialog)
- [x] Security profiles admin (list profiles, checklist permission editor per profile, group toggle)
- [x] Custom security profiles (2026-06-16): create (name + permission checklist; code auto-slugged & unique;
      validated vs Permissions.All) + delete (blocked for IsSystem profiles or profiles still used by a functional
      role). Endpoints POST/DELETE /security-profiles (roles.manage). Permission editor groups now cover ALL
      permissions (added Progression/Passage/Demandes/Site public). New profiles are assignable to functions.

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

### Quality Pass (Complete)
#### Bug fixes
- [x] FluentValidation pipeline behavior (was dead code — all validators now auto-invoked)
- [x] Member validation: firstName, lastName, DOB, gender, nationality, school, classe required
- [x] 500→400 on invalid FK references (assignments, cotisations, teams check existence)
- [x] Dashboard gender count case-insensitive
- [x] Document upload title optional (auto from doc type name)
- [x] Member delete returns 404 (not 400) for missing
- [x] Document matrix matches by docTypeId (not fragile array index)
- [x] Silent error swallowing fixed in assignments + guardians
- [x] Preview error state shown (not stuck on "Chargement...")
- [x] Frontend TypeScript build errors fixed (path alias, 20 TS errors)

#### UX improvements (42 items)
- [x] Toast notifications (sonner) on all create/edit/delete across 15+ files
- [x] Login autofocus on email field
- [x] 404 page ("Page introuvable" with dashboard link)
- [x] Admin dashboard error state + school year selector
- [x] Logout loading state
- [x] Document matrix cells bigger (36px) + keyboard accessible quick approve/reject
- [x] Missing doc status contrast improved
- [x] Status legend above table
- [x] Credentials dialog copy buttons
- [x] Member tabs scrollable on mobile (overflow-x-auto)
- [x] Doc compliance "% dossiers complets" context
- [x] Doc type checkboxes with explanation text
- [x] Cotisation cell uses Receipt icon (distinct from missing doc)
- [x] Assignment toggle replaced with clear "Terminer aujourd'hui" UX
- [x] Guardian edit form: notes textarea + isPrimaryContact/isEmergencyContact toggles
- [x] Receipt filename includes member name + year
- [x] Upload progress bar on document upload
- [x] Color picker preview on team forms (visual + hex input)
- [x] Country code searchable select (SearchableSelect replaces 200+ entry dropdown)
- [x] Session timeout warning (5-minute JWT expiry countdown banner)
- [x] Sidebar tooltips in collapsed mode (CSS tooltip on hover)
- [x] Clear option on gender/blood type selects + X button on nationality
- [x] Audit log JSON detail as key-value table (not raw JSON)
- [x] Unsaved changes warning (beforeunload on profile edit)
- [x] Sort arrows more visible (opacity 50%)
- [x] Audit log filter labels bigger (text-sm)
- [x] Row striping on admin tables
- [x] Form field error message improved
- [x] LoadingSpinner aria-label for screen readers
- [x] Empty state icons more visible
- [x] File upload requirements shown ("PDF, JPG, PNG — Max 10 Mo")
- [x] Security profile save confirmation toast
- [x] isActive toggle in Units edit form
- [x] Team deletion error shown (not swallowed)

#### New member fields
- [x] Classe (dropdown, configurable via settings, required)
- [x] Section (free text, max 5 chars, optional)
- [x] École dropdown (configurable schools + "Autre..." free text, required)
- [x] Auto-generated card number: M-0001 (boys), F-0001 (girls)
- [x] Settings: member.schools, member.default_school, member.classes

#### Contact editing (#28)
- [x] Backend: PUT endpoints for phones, emails, addresses
- [x] Frontend: Pencil edit button + edit dialog on all contact items
- [x] Unit-scoped access check on all contact add/update/delete handlers

#### Security audit + fixes
- [x] 0 NuGet vulnerabilities, 0 npm vulnerabilities
- [x] Rate limiting on auth (10 req/5min) and upload (20 req/10min) endpoints
- [x] HTTP security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- [x] Global 1MB request body limit (file uploads override to 20MB)
- [x] File upload MIME magic number validation (PDF/JPG/PNG header bytes)
- [x] Path traversal prevention on download + zip (Path.GetFullPath + StartsWith)
- [x] Filename sanitization (Path.GetFileName strips directory components)
- [x] Unit-scoped authorization on ALL 17 handlers (contacts, assignments, teams, member detail, unit detail, dashboard)
- [x] IDOR prevention verified (CU cannot access cross-unit data)
- [x] Register endpoint user enumeration fix (generic error message)
- [x] Admin dashboard super-admin guard at handler level

### Phase 4 — Passage annuel (Complete)
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

### API Keys & Documentation (Complete)
- [x] ApiKey entity (name, hashed key, prefix, scopes, optional member binding, expiry)
- [x] API Key middleware: validates X-API-Key header, maps scopes to permissions, resolves unit access
- [x] Scope system: members:read-own, documents:upload, cotisations:read-own, members:read, members:write, documents:read
- [x] Admin CRUD page: create (key shown once + copy button), list, toggle active, delete
- [x] Swagger UI at /swagger with all endpoints documented
- [x] OpenAPI spec at /openapi/v1.json (85 endpoints)
- [x] Dual auth support: JWT Bearer (internal app) + API Key (external integrations)

### PDF Reports & Custom Fields (Complete)
- [x] Member photo upload (JPG/PNG, 5MB, MIME validated) + authenticated serve endpoint
- [x] Trombinoscope PDF: A4/A3 auto-select based on member count, team rows, photo grid, placeholders
- [x] Team `isMaitrise` flag — Maîtrise teams always appear first in trombinoscope, roster, dashboard
- [x] Custom fields system: admin defines fields (text/number/select/boolean), values per member, ShowOnCard flag
- [x] Admin page: Champs personnalisés (CRUD with field type, options for select, display order)
- [x] Member tab: "Infos complémentaires" with inline editing per field type
- [x] Member card PDF: credit-card sized (85.6mm × 54mm), configurable fields via card designer
- [x] Card designer admin page: org name + field toggles with live preview
- [x] Bulk card print: 10 cards per A4 page with cut lines, all unit members
- [x] Roster PDF: A4 landscape, 14 selectable columns + custom fields, grouped by team
- [x] Roster dialog: column checkboxes grouped by category, school year, PDF download
- [x] CU dashboard buttons: Trombinoscope, Liste, Cartes, Exporter
- [x] Excel/CSV export: column picker, format toggle, ClosedXML for .xlsx, UTF-8 BOM CSV
- [x] Export available on CU dashboard + admin members page (unit-scoped)
- [x] Reports controller: /reports/trombinoscope, /reports/member-card/{id}, /reports/bulk-cards/{unitId}, /reports/roster, /reports/export

### Email Infrastructure & Password Management (Complete)
- [x] SmtpServer entity (name, host, port, credentials, from address, SSL, active toggle)
- [x] EmailTemplate entity (code, module, subject, HTML body, variables JSON, SMTP server binding)
- [x] Email service: loads template + SMTP from DB, replaces {{variables}}, sends via System.Net.Mail
- [x] Admin page: Email / SMTP (two tabs: SMTP servers CRUD with test button, templates CRUD)
- [x] TipTap rich text editor: toolbar (bold, italic, underline, alignment, lists, links), variable insertion dropdown per module
- [x] Module variables: auth (memberName, resetLink, expiryHours), documents, cotisations, passage
- [x] Default "password_reset" template seeded with French HTML email
- [x] Password reset: forgot-password page → email with token → reset-password page (1h expiry)
- [x] Change password: dialog on Ma fiche (validates current, enforces different new, invalidates sessions)
- [x] CG/leader reset member password: POST /members/{id}/reset-password (members.edit + super-admin-or-
      active-unit-leader access check) generates a temp password (Scout{year}!{nnn}), invalidates sessions +
      reset token, audited (ResetPassword). "Réinitialiser le mot de passe" button on member detail → confirm →
      credentials dialog with copy buttons. 404 if member has no user account.
- [x] "Mot de passe oublié ?" link on login page
- [x] Audit logging on password reset + change
- [x] New tables: smtp_servers, email_templates + PasswordResetToken fields on User

### Serilog Logging (Complete)
- [x] Serilog.AspNetCore + Serilog.Sinks.File + Serilog.Sinks.PostgreSQL
- [x] File sink: daily rolling logs in logs/ folder, 30-day retention, structured JSON
- [x] PostgreSQL sink: Warning+ level logs to application_logs table (auto-created)
- [x] No console output — file + DB only
- [x] HTTP request logging with method, path, status code, duration
- [x] User context enrichment: UserId, MemberId, RemoteIP per request

### Photo Session (Complete)
- [x] Camera capture component: getUserMedia, 3:4 ratio, JPEG 85% compression (600x800)
- [x] SVG silhouette overlay (dashed head + shoulders guide)
- [x] Front/back camera toggle, desktop fallback to file upload
- [x] Photo session page: member list with status checkmarks, progress bar, batch workflow
- [x] Preview with "Garder / Reprendre" confirm step
- [x] Sidebar link + CU dashboard "Photos" button

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

### Public Website — Phase A (Built 2026-06-14/15, NOT yet committed)
Modern public-facing group website built INTO the app (shared DB + chef CMS), replacing the old 20-year static
site. Clean/modern design, navy/teal tokens, French. Anonymous public API + a content CMS in the admin.
- **Shell/routing:** `components/public/public-layout.tsx` (scroll-aware sticky header, dynamic nav, footer),
  `lib/public-api-client.ts` (plain axios, no auth/redirect). `/` is the public HOME (old chooser landing
  removed). Public routes: `/`, `/unites`, `/unites/:slug`, `/actualites`, `/actualites/:slug`, `/p/:slug`
  (standalone CMS pages), `/contact`. `PublicController` (anonymous, OutputCache "ShortCache").
- **Unités:** live from DB. Unit gets Slug/IsPublished/FoundedDate; public description lives on **UnitType**
  (category, shared). Public list grouped by branch w/ category description; detail shows maîtrise (members on
  IsMaitrise team, name+role ordered by FunctionalRole.Rank DESC — set distinct ranks!), team names + youth
  counts, founding year. Publishing auto-generates a slug if empty. Admin: "Site public" section on unit form
  (publish, slug, founded date); public description on the unit-TYPE form.
- **Actualités (News CMS):** NewsPost (auto-slug from title, auto-excerpt from body, tag = Group|UnitType|Unit).
  Admin `/admin/news` (TipTap + image upload, tag picker). Public paged list + article (tag chip + excerpt).
- **Pages CMS:** Page (auto-slug, ParentId one-level hierarchy, DisplayOrder draggable via @dnd-kit, ShowInMenu).
  Admin `/admin/pages` nested tree (children drag within parent block). Public standalone `/p/:slug` + dynamic
  nav (top-level ShowInMenu pages, capped inline MAX_INLINE_PAGES=5 + "Plus" dropdown; sub-pages in dropdowns).
- **Site texts:** editable via ONE `site.content` json setting → admin `/admin/site-texts` ("Textes du site");
  home/footer/contact read it from `GET /public/site-config` (also returns inscriptionsOpen = demande.enabled).
- **Conditional CTAs:** all "Demande d'inscription" buttons + unit "Rejoindre le Groupe" banner only show when
  inscriptions open. Member /login = "Espace membres et chefs" (hides demande button when closed); applicant
  login = "Connexion — Demande d'inscription". Closed inscription landing hides the login link.
- **Contact form:** `POST /public/contact` (forms rate-limit + honeypot + NoHtml) → emails via IEmailQueue using
  seeded `contact_form` template; recipient = `contact.recipient_email` setting else first super-admin. Replaces
  old open-relay. Image upload: `ContentImagesController` (content.manage, magic-byte validated → uploads/content;
  anonymous serve). CMS HTML rendered via `components/public/rich-content.tsx` (DOMPurify — only
  dangerouslySetInnerHTML in app). New permission `content.manage` (auto-seeded super-admin + assoc-admin).
- **Settings page redesign:** `pages/admin/settings.tsx` rebuilt — tabbed by category + search; type-aware
  widgets (boolean→Switch, number→stepper+unit, exchange_rates→row editor); hides site.content/card.config.
  New `components/ui/switch.tsx`.
- **Migrations added:** AddUnitPublicFields, CmsContentTagsHierarchy, AddPageShowInMenu (default true),
  AddUnitFoundedDate. New entities NewsPost, Page; new DbSets.
- **Deps:** `npm audit` + `dotnet list package --vulnerable` = 0 vulnerabilities (2026-06-15). Safe (non-major)
  freshness updates available both stacks; majors deferred (@types/node 24→25, test SDKs).
- **Deferred:** member photo opt-in for public leader photos (initials avatars for now); heritage resources
  library (chants/tabs/mp3/knots/techniques/biographies via scripted import); photo gallery; birthdays; events;
  i18n. Full plan + state in memory `project_public_website.md`.

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

### Members LIST honest counts — DONE (2026-06-24)
- [x] **Option 1 remainder closed.** Admin members list now defaults to ACTIVE members with an **Actifs / Anciens**
      segmented toggle (passes `alumni`). Backend `GetMembersQuery`: the active (non-alumni) branch now also
      requires ANY active assignment when no unit filter is set — so a super-admin's default no longer counts
      alumni (previously showed all ~2.4k incl. former members). Alumni branch gained a group-level no-unit case:
      **super-admin OR Chef de Groupe** (holds `maitrise.manage` → `isGroupLevel`) sees ALL former members
      (ended somewhere, no active assignment anywhere); a unit leader still sees only their units' alumni. Alumni
      rows expose identity only (contact withheld), unchanged. Unit filter "Sans unité (anciens)" relabelled
      "Sans unité". Builds clean (dotnet + tsc).

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
- [ ] Migration tool: replicate the card-number split on re-import (populate external from source, always
      generate internal) — currently only the live DB is split.

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

### Public site — news enrichment (2026-06-29, commit 6f16b49)
- **Cover images for news** (the latent `NewsPost.CoverImagePath` was a dead stub — never uploaded/shown): now
  wired end-to-end. Admin news CMS has a cover-image upload (reuses `/content/images`); the public home teaser,
  `/actualites` cards, and the article header render the cover (branded gradient + Newspaper icon as fallback).
- **Attachments on news articles:** `NewsPost.AttachmentsJson` (JSON array of `{name,url}`, migration
  `AddNewsAttachments`) — no child table. New **`/content/files`** upload endpoint (PDF + images, 15 MB,
  magic-byte validated, content.manage, anonymous serve) mirrors ContentImagesController. Admin CMS: add/remove
  attachments with an editable label; public article shows a "Pièces jointes" download list. Create/Update commands
  carry `Attachments` (validated: ≤20, name ≤200 NoHtml, url ≤500); read queries deserialize in memory (EF can't
  run JsonSerializer in a projection).
- **`/actualites` featured lead + tag filter:** page 1 shows the newest post as a wide featured card; a chip bar
  filters **Tout / Le groupe / <each branch>**. `GetPublicNewsQuery` gained `GroupOnly` + `UnitTypeId` (a
  Unit-tagged post rolls up to its unit's branch); `PublicUnitGroupDto` gained `UnitTypeId` so the page builds the
  branch chips from `usePublicUnits()`. Builds clean (dotnet Release + tsc).
- NOTE: the `AddNewsAttachments` migration is applied on dev; it reaches prod with the pending deploy / dump.

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

### Member-facing email delivery + test redirect (2026-07-05)
The only member-facing email (password reset) went to the login `User.Email`, which for imported members is a
synthetic `@scouts.gndj` address (undeliverable). Now member/guardian real emails drive delivery; demande
responses fan out to the whole file; and a global override protects real families during testing.
- [x] **`Member.PrimaryContactEmail`** (migration `AddMemberPrimaryContactEmail`): the designated recipient for
      member-facing mail. `MemberDetailDto` gained `PrimaryContactEmail` + `GuardianEmails`; `PUT /members/{id}/
      primary-email` (members.edit, unit-scoped) sets/clears it (must be one of the member's own or a guardian's
      emails). Panel Coordonnées has a "Courriel de contact principal" picker (Auto | member/guardian emails).
- [x] **Leader "Réinitialiser le mot de passe" now emails the temp password** to the resolved contact email
      (`PrimaryContactEmail` → member's own primary/first → a guardian's) via new template `member_password_reset`
      (seeded, module auth). `ResetMemberPasswordResult.SentToEmail` returned → panel shows "email envoyé à X"
      (green) or a warning + on-screen creds if the file has NO email. Member changes it on first login (guidance
      text, no forced-change mechanism built).
- [x] **Demande responses → all emails on the file:** `SendDemandeResponses` now sends the accepted/refused email
      to the applicant account (login) + every guardian email + the child's email, **deduped** (was account only).
- [x] **SAFETY NET — `email.override_recipient` setting** (category `email`): when set, `EmailService.SendAsync`
      (the single chokepoint for ALL templated mail) redirects EVERY email to that one address, with the intended
      recipient shown in the subject `[TEST → real@addr] …`. Empty = real delivery (prod). The SMTP **Test** button
      is unaffected (separate SmtpClient). **Set to `samer_cheaib@hotmail.com` in the dev DB** for now; SMTP2GO also
      left **inactive** in dev (double safety). NOTE: EmailService picks the template's SMTP server else the **first
      active** one (no OrderBy) — fragile; bind templates to a server or keep the real server inactive until go-live.
- Verified against the running API WITHOUT delivering mail (resolver returned the right guardian address; a test
      reset failed against the non-running local smtp4dev — nothing delivered). tsc + dotnet build clean.
- **TODO (user: "we will also work on this"):** the go-live plan so real users can start — see the open discussion
      (which SMTP server + binding, when to clear the override, the fake `@scouts.gndj` login vs real-email login,
      forcing a password change on first login, prod deploy of all this session's work).

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

### Public site — Phase B (2026-07-07): social links + Events + Ressources
Three public-site features built on `main` (pushed; dev-only until next prod deploy). Each mirrors the
existing News CMS end-to-end (entity → EF config → CQRS handlers → controller + PublicController public
endpoints → admin CMS page → public list+detail → routes/sidebar/nav). Full plan in memory
`project_public_website.md` (Phase B). Mobile-verified via 390px headless screenshots.
- [x] **#1 Social links (commit 41322c5):** `SiteFooterContent` gained nullable Instagram/Facebook URLs
      (edited on Admin → Textes du site → Pied de page); public footer renders social icon links (inline SVG —
      lucide 1.23 dropped its brand icons) when set. (The "Notre groupe" page is authored via the Pages CMS.)
- [x] **#2 Events / Agenda (commit 8491747):** `Event` entity (slug + rich body + cover + Group/branch/unit
      tag) + scheduling — StartDate (req), optional EndDate/TimeLabel/Location, stored as **DateOnly** (no TZ).
      Public `GET /public/events` = UPCOMING (last day ≥ today, soonest first) + branch filter; `/public/events/
      {slug}`. Admin `/admin/events`; public `/agenda` (grouped by month, branch chips) + `/agenda/:slug`; home
      "Prochains rendez-vous" teaser. Migration AddEvents. 3 French sample events kept in the dev DB.
- [x] **#3 Heritage / Ressources (commit 52b2539):** STRUCTURED `Resource` entity (category Chant/Technique/
      Noeud/Badge/Biographie/Document + free-text Tags + mp3/PDF/image attachments JSON). Public `GET /public/
      resources` = category filter + title/summary/tags **search**; `/public/resources/{slug}`. Admin
      `/admin/resources`; public `/ressources` (grid, category chips, search) + `/ressources/:slug` (audio players
      for mp3, download list for files). **ContentFilesController now accepts MP3** (audio/mpeg; magic-byte = ID3
      tag or MPEG frame sync). Migration AddResources. Content is HAND-CURATED (no import, per user). 3 French
      sample resources kept in the dev DB.
- [x] **Fixed a pre-existing latent News bug** found while building: creating a news post WITH an attachment
      **500'd** — FluentValidation "Could not infer property name" because the attachment `RuleForEach` ChildRules
      went through a `Func` indirection (`x => attachments(x)`). Fix: declare `RuleForEach(x => x.Attachments)`
      with a DIRECT member expression in each validator (News + Resources). Verified news-with-attachment → 201,
      validation still enforced (empty name → 400).
- [x] **Menu cleanup (commit 3579e5a + dev-DB data):** the public nav was consolidated. **Code** (3579e5a):
      Actualités + Agenda merged into ONE "Actualités" dropdown (children Actualités→/actualites, Agenda→
      /agenda; FIXED_RIGHT entries can now be a link OR a group with children; mobile flattens them). Home:
      the two teaser bands replaced by ONE "Actualités & agenda" section showing the most recent of BOTH side
      by side (latest news | upcoming events). **Data** (dev DB, reaches prod via the next dump): reparented
      "Notre histoire" + "Historique" under the "Le Groupe" page (so the nav shows a single "Le Groupe ▾"
      dropdown = Notre methode + Notre histoire + Historique) and DELETED the "Test" page the user had made.
- **DEV-DB sample content kept for review** (goes to prod with the next dump): 3 French events (Camp d'été
      2026, Sortie nature d'automne, Réunion de rentrée scoute) + 3 resources (Chant "Kaïma", Nœud "Le nœud
      plat", Biographie "Baden-Powell"). Delete/replace before or after go-live as desired.
- DEFERRED (unchanged): native photo gallery → lean on Instagram (even the IG embed later); the heritage
      content itself (chants/nœuds/…) is entered by the chefs via the new CMS.

### Settings/footer polish + inscription gate + PROD DEPLOY (2026-07-07, prod @ d5b6cf8)
- [x] **Inscription portal closed-gate:** the `/inscription` landing showed a "fermées" notice but the
      login/register/verify sub-routes were directly reachable (rendered the form). New `ApplicantOpenRoute`
      guard redirects those three to the landing when `demande.enabled=false`; `RegisterApplicantCommand` also
      blocks server-side (defense-in-depth) so a direct POST can't create an account while closed.
- [x] **Public home "Nos unités" → branches:** was listing individual units (flattened, first 4) so multiple
      units of one branch showed separately. Now one card per BRANCH from the already-grouped `/public/units`
      (only types with a published unit are returned → every public branch shown), using the unit-type colour/
      age/description. Also **swapped section order** so "Actualités & agenda" comes before "Nos unités".
- [x] **Settings list-value editor — rename-cascade + archive.** The managed list settings (schools/classes/
      cities/profession domains) are json arrays of allowed strings stored DIRECTLY on member/parent/demande
      records with NO FK, so editing was add/remove only. New `ManagedListEditor` (immediate mode): inline
      **rename CASCADES** the new spelling onto every record holding the old value (members.school/classe,
      member_addresses.city, guardians.profession_domain + demande/applicant copies) via ExecuteUpdate; **delete
      ARCHIVES** an in-use value (companion `<key>.archived` list: hidden from pickers, kept on the records,
      restorable via Réactiver) or hard-removes an unused one — mirroring functions/badges; each row shows its
      live usage count. Backend `ListValueHandlers` (usage/rename/archive/unarchive) + SettingsController
      endpoints (associations.manage). Options-backed arrays keep the pill table; `.archived` rows hidden from
      the settings list. Also reworked ALL json_array editors from a pill cloud → a scrollable filterable table.
- [x] **Public footer reworked:** dropped the redundant "Naviguer" column (dup of header nav); new **Contact**
      column = address (existing) + optional public **email**/**phone** (mailto:/tel:, added to the editable
      SiteFooterContent + validators + Textes du site editor + TS type, shown only when set); Rejoindre trimmed
      to the two membership actions; bottom bar = copyright + "Retour en haut" (was the duplicated tagline).
- [x] **DEPLOYED to prod** (new.gndj.org) via `update.ps1 -Pull` on the prod server — fresh `GNDJ API started`
      2026-07-07 15:38, clean (no pk_settings recurrence), migrations **AddEvents + AddResources** applied
      (verified `/public/events` 200). Email still locked OFF. Dev-DB sample content (events/resources/page tidy)
      NOT shipped (data, not code) — prod Events/Ressources empty until real content added. See memory
      [[project-production-deployment]].

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

### CU test follow-ups: cotisation scoping + unit stats + passage re-edit (2026-07-10)
From the CU shakedown. Three fixes:
- **Cotisation summary scoped to the caller's units.** `GetCotisationSummaryQuery` was group-wide (any
  `cotisations.view` holder — i.e. every CU — got the whole group's totals + per-unit breakdown). Now it filters
  active assignments to `currentUser.AuthorizedUnitIds` for non-super-admins: a **CU sees only their unit(s)**
  (verified: 86 members / just "Compagnie 1" vs super-admin's 1077 / 18 units); a **Chef de Groupe** still sees
  everything (login grants all units to a group-level holder); super-admin bypasses. The `/admin/cotisations`
  route (CG group dashboard) was also re-gated from `COTISATIONS_VIEW` → **`MAITRISE_MANAGE`** (CG-only), so a CU
  can't reach the group page at all.
- **CU per-unit cotisation stats** added to the unit-documents page (`unit-documents.tsx`): a compact bar computed
  CLIENT-SIDE from the already-loaded matrix (no extra call) — "N payées · M en attente · K exemptées · sur T ·
  Total encaissé …". Gives the CU their own numbers without any group data.
- **CU can change a passage line until the CG FINALIZES it.** The backend already re-proposed Pending/Approved
  lines (updates in place), but the passage page only showed a status badge once a line existed — no way to change
  an auto-approved "Pas de changement". Added a **"Modifier"** toggle (`passage.tsx`): an editable line
  (Pending/Approved, i.e. not Finalized/Rejected) shows badge + Modifier → re-reveals the Pas de changement /
  Proposer / Quitte actions (+ Annuler). Verified: no-change → re-propose "quitte" updates the SAME line
  (1 row, now Pending). DEV until deploy.

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

### Public site content — old-GNDJ import + /unites ordering (2026-07-10)
Filled the empty public-site content from the group's OWN old FrontPage site (`C:\Users\Administrator\Documents\old`,
a static `.htm` archive — the authentic source, NOT SDL/GDL). All content lands in EDITABLE fields (unit-type
`public_description`, Pages CMS, `site.content` "Textes du site") — nothing hardcoded. Content is DEV-DB data
(reaches prod on the next dump); only the /unites ordering is code.
- **8 branch descriptions** (Meute/Ronde/Troupe/Compagnie/Clan/Noyau/JEM/Feu) written into `unit_types.public_description`
  from the old branch pages — parent-facing (âge, méthode, devise). Feu is a generic "aînés" placeholder (it sits
  outside the parcours — user to confirm what Feu is).
- **CMS pages** (Pages, TipTap-editable): filled the empty **Le Groupe** (intro: 1935, Collège ND Jamhour, Scouts+
  Guides du Liban, double héritage Baden-Powell + P. Jacques Sevin s.j., ~700 membres) and **Notre méthode** (les 5
  buts + système des équipes); NEW **Nos valeurs** (Loi scoute 10 + 3 principes + Promesse + côté Guides) and
  **Spiritualité** (identité ignatienne, Jacques Sevin, aumôniers, Prière scoute). **Merged history**: moved the real
  1935→2010 "Historique" content into "Notre histoire" (stripped stale `localhost/old/*` `<a>` links, h1→h2) and
  soft-deleted the redundant "Historique" stub. Nav: **Le Groupe ▾** = Notre méthode · Notre histoire · Nos valeurs · Spiritualité.
- **Published** Troupe 2/3/10ème + Noyau (were unpublished → the Éclaireurs branch was invisible while Meute/Ronde/
  Compagnie showed); **unpublished** the 4 internal "(Non affectés)" placeholder units so /unites is clean.
- **`/unites` ordering (CODE — `PublicUnitQueries.cs`):** branches now ordered by an explicit parcours sequence
  (`BranchOrder` by unit-type code: MEU,RON,TRO,COM,CLAN,NOY,JEM,FEU,CAR,GRP) instead of alphabetical; units within
  a branch **natural-sorted** by the first number in the name (`UnitNumber` regex → 2,3,10 not 10,2,3). Set unit-type
  **ages** (Meute/Ronde 8-11, Troupe 11-16, Compagnie 11-15, Noyau 15-17, Clan/JEM 17-21) so the cards show age labels.
- **Home "Textes du site":** gender-inclusive intro ("chaque jeune, garçons et filles, des plus jeunes aux aînés" —
  was "du louveteau au routier", which excluded girls); **stats** corrected 13→**15 Unités**, 4→**7 Branches**; the
  **Foi** value card now names the BP + Jacques Sevin heritage.
- Verified live (`GET /api/v1/public/units`): Meute→Ronde→Troupe→Compagnie→Clan→Noyau→JEM, units 2/3/10 in order,
  ages shown. Build clean; API rebuilt+restarted on :5000.

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

### CG cotisation dashboard — actionable unpaid list (2026-07-25)
The `/admin/cotisations` "Membres sans cotisation" list was a flat alphabetical **name + unit** table —
nothing to act on, so useless for actually chasing payments. Reworked into a follow-up worklist:
- **Backend** (`GetUnpaidCotisationsQuery`/`UnpaidCotisationDto`): now carries `UnitId` + a resolved
  follow-up **contact** — `ParentName`, `ContactEmail`, `ContactPhone` — via a batched `UnpaidContactResolver`
  (member's PrimaryContactEmail → own primary/first → guardian; phone own→guardian; parent = primary-contact
  guardian first). One-pass, no N+1. Ordered by unit → name. CG-only (members.edit gate) so contact is fine.
- **Frontend** (`cotisation-dashboard.tsx`): **grouped by unit** (per-unit count), each row shows the parent +
  clickable **mailto:/tel:** links; **member name → opens the member file** (`/members/:id`); inline
  **"Paiement"** (compact single-line record-payment dialog → `useCreateCotisation`, auto receipt#) and
  **"Ne paiera pas"** (exempt → `useSetCotisationExempt`), both refreshing the unpaid+summary queries;
  **Exporter (CSV)** (client-side, UTF-8 BOM for Excel) + **Imprimer** (new `@media print` isolation in
  index.css — `.print-area` shows alone, `.no-print` hidden).
- Verified live: 1073 unpaid returned with parent/email/phone resolved + unit grouping. Build + tsc + eslint
  clean. DEV until deploy.

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
  inbox flood; over the cap the error is still logged, only email suppressed). KEPT AS-IS (revisit once using
  the app): `AbuseDetectionMiddleware` runs before `/errors/report`, so a crash whose stack contains an attack
  signature (e.g. `union select`) could 400 that one report — reliability edge only (the error still lands in
  application_logs); not exempting the endpoint for now.

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

### Member audit + multi-page documents (2026-08-14)
Audited the regular-member (youth) journey live (login → see own data → submit docs). Result: solid, zero 500s —
forced first-login password (must_change → change → cleared), all own-data reads OK, document upload (own → 201,
fake magic bytes → 400, upload-for-another-member → 400, self-approve → 403), self-edit `/my-profile` with identity
fields locked (nom/prénom/DOB/sexe aren't in the command), change-request propose, and IDOR/leader-action denial all
correct (other member 404/400/403; matrix/members-list/pending empty or denied; reset-other 403). Then built the
one gap the member surfaced:
- [x] **Multi-page / multi-file documents (an ID as recto + verso, a multi-page scan) → ONE reviewable document.**
      Previously one document = one file, and a 2nd file of the same type made a competing duplicate record. Now a
      document holds several files: page 1 stays inline on `MemberDocument`, extra pages go in a new
      **`member_document_pages`** child table (migration `AddMemberDocumentPages`, cascade FK). The CU approves the
      whole document once. Backend: upload accepts **several files** (`IFormFileCollection`, back-compatible) — first
      = page 1, rest = pages — and **appends to an existing PENDING document of the same type** (so "send recto" then
      "send verso" build one doc, and re-sending doesn't duplicate); `UploadMemberDocumentCommand` replaced
      `CreateMemberDocumentCommand`. New: `POST /documents/{id}/pages` (add pages; re-opens a Rejected doc),
      `GET /documents/pages/{pageId}/download`, `DELETE /documents/pages/{pageId}` (documents.delete; deletes the
      file). `GetMemberDocuments` DTO gained `pages[]` (page 1 + extras, each with a download route); the zip export
      includes every page (` - p2` suffix); `MemberPurgeService` now also deletes page files. Frontend
      (`member-documents.tsx`): the file picker is **multiple**, the row shows a "N pages" link → a **pages viewer**
      (download each page, leader delete extra pages, "Ajouter une page"). GOTCHA fixed during build: appending by
      mutating the tracked parent's `.Pages` collection threw `DbUpdateConcurrencyException` (spurious parent
      UPDATE) → insert pages directly via `context.MemberDocumentPages.Add` (never load/mutate the parent). Verified
      live end-to-end (2-file upload → 1 doc/2 pages, 3rd file appends to same doc, page downloads, add-page,
      CU delete-page, member delete-page 403) + in a real browser (member uploads recto+verso → "2 pages" viewer).
      Backend+frontend, migration applies on prod startup; DEV until deploy.
- [x] **CU review preview pages through a multi-file document** (`unit-documents.tsx`): the matrix click-to-preview
      loaded only page 1. It now fetches the document's `pages[]` on open and shows a **◀ Page X / N ▶** pager
      (each page's file loaded on demand; per-page MIME so a PNG recto + PDF verso both render); download grabs the
      current page. Verified live as a CU: Raul's 4-page Fiche Médicale → "Page 1/4 → 2/4". (Pre-existing React
      key-prop warning in the matrix left as-is — unrelated.)
- [x] **UI wording: "Approuver/Approuvé" → "Accepter/Accepté"** across documents + passage + change-requests +
      security-profile labels + document-types (7 files, French display strings only — the internal `'Approved'`
      status value and `documents.approve` permission key are untouched). Verified: 0 French `approuv*` left, badge
      shows "Accepté".
- [x] **A Chef de Groupe can upload to / manage ANY member — including orphans (no active assignment).**
      `MemberAccess.CanAccessMemberAsync` required an ACTIVE assignment in the caller's units, so a CG (all units
      granted) could reach any *active* member but got 404/400 on a member with no active unit (between assignments/
      alumni). Now a **group manager** (`IsGroupManager` = super-admin OR `maitrise.manage` → CG/ACG/assoc-admin)
      bypasses the active-assignment requirement, same as super-admin. Also **`GetMemberByIdQuery` had drifted to an
      inline copy** of the old check (it wasn't using `MemberAccess`) — routed it back through the shared policy so
      the member detail (and thus the Documents tab) opens for a CG on any member. Read paths for docs/cotis/
      guardians/custom-fields/progression already use `MemberAccess` so they picked it up automatically. Verified
      live: CG → orphan member detail/documents/cotisations all 200 (were 404/400) + upload → 201; a **CU is still
      blocked** from a member outside their unit (404) and youth stay own-only. HOW A CU/CG UPLOADS (existing path):
      member → detail → **Documents** tab → **Envoyer** (multi-file). Backend-only, DEV until deploy. (Matrix-cell
      inline upload offered but not built — the CU/CG upload from the member's Documents tab.)

### Email provider plan + outbox send-rate throttle (2026-08-15)
Planning for go-live email + a throttle so a big blast can't trip a provider's free-tier rate limit.
- **Active-member email volume (dev = prod-like):** **1,077 active members** (69 chefs / 1,008 youth), **not**
  the ~2,200 total (rest are alumni). **1,008 reachable** by ≥1 email; **69 have NO email** (biggest gaps: Clan
  12/50, both big Troupes 9 each — those get the on-screen temp password instead). Activation = **~1,008 emails**
  (one per member via the contact resolver); all-addresses fan-out = 2,194 (1,634 distinct). Maîtrise counted on
  their PERSONAL email only (guardians excluded). Per-unit query lives in the session; biggest units ~80–85.
- **Provider routing (decided):** **SMTP2GO** (free 1,000/mo, resets the 12th) → **demandes** (Sept ~350 confirms +
  Oct ~700 responses fit, each in its own cycle). **Mailgun Flex** (legacy PAYG still active on the group account:
  1,000 free/mo then $0.002/msg, un-throttled, resets 12th) + **SendPulse** (free 12k/mo but **50/hr**) → member
  activation + post-launch ops (reset/warnings/announcements). Mailgun Flex is the smoothest vehicle for the
  one-time ~1,008 activation blast (~$0.02, no throttle). SendGrid dropped (free tier ended). NOTE: **DNS must
  authorize each provider** before use — `gndj.org` SPF currently = Mailjet+Zoho, DKIM → SendGrid; add each
  chosen provider's SPF include + DKIM first. See [[project-email-golive]].
- [x] **Per-provider send-rate throttle on the outbox.** New nullable **`SmtpServer.MaxPerHour`** (null =
      unlimited, unchanged) + **`OutboxEmail.SmtpServerId`** (stamped at send; migration `AddEmailThrottle`, +
      index). **`IEmailService.ResolveRouteAsync`** exposes which server + cap a template routes to WITHOUT
      sending, so `OutboxSenderBackgroundService` can rate-limit before dispatch. Model = **rolling-hour count**
      re-derived from the durable table each sweep (no in-memory cursor to drift/run-away; survives restarts for
      free): a capped server dispatches while its rows Sent in the last hour < cap; at the cap, further rows defer
      to when the window frees (oldest in-window send + 1h), staggered one interval (3600/cap) apart → guarantees
      ≤ cap sends in any rolling hour. Un-throttled servers keep the parallel fast path. So the whole activation
      blast can be enqueued at once and trickles out cleanly — **no Failed pile-up, no babysitting**. SMTP server
      form gained a **"Max emails / heure"** field (+ Limite/h column); set SendPulse free to ~45. NOTE: an
      earlier smooth min-interval-cursor design was tried and REJECTED — the in-memory cursor ran ahead of the
      pre-assigned slots so matured rows got re-deferred (verified failing); the rolling-count model has no such
      state. Verified live (cap=3, 6 rows → exactly 3 dispatched, 3 deferred ~1h staggered 20 min apart, stamped,
      no burst). Build + 4 tests + tsc + eslint clean. DEV until deploy (migration applies on prod startup).

### Relance documents — CG reminder emails (2026-08-15)
After the document submission + CU-verification window, the **Chef de Groupe** can email the families whose
dossier is still incomplete a personalized list of exactly what's missing / to correct / to renew. Same shape as
*Envoyer les accès*: pick a unit → preview the non-compliant members + gaps → send one email per member via the
durable outbox → sent/no-email report.
- [x] **Backend** `Application/Documents/DocumentReminderHandlers.cs`: `GetDocumentReminderCandidatesQuery(unitId)`
      (non-compliant members + gaps + resolved contact email) + `SendDocumentRemindersCommand(unitId?|memberIds?)`.
      "Required" = every **active** document type (the CU matrix already treats all active types as expected — no
      per-type required flag). A gap = **missing** (no doc), **rejected** ("à corriger"), or **expired** (Approved
      past expiry → "à renouveler"); a **Pending** doc is NOT nagged (CU's turn); fully-compliant members skipped.
      Shared `DocumentGaps.Compute` used by both preview + send so they can't diverge; server recomputes gaps on
      send (never trusts the client). Uses `ContactEmailResolver` (PrimaryContactEmail→own→guardian, one email/member).
- [x] **CG-only** (user: "this is a CG feature", "of course a superadmin can also send"): endpoints gated on
      **`maitrise.manage`** + handler `MemberAccess.IsGroupManager` (super-admin OR maitrise.manage → CG/ACG). A
      **chef-unité** (holds documents.approve but NOT maitrise.manage) is **403**. `GET /documents/unit/{id}/
      reminder-candidates` + `POST /documents/send-reminders`. Frontend page `/admin/document-reminders`
      ("Relance documents", sidebar **Suivi & demandes**, gated maitrise.manage) — unit picker, candidate table
      (member/équipe/gap chips colored by reason/contact email), row-select or whole-unit send, result summary.
- [x] **Seeded template `document_reminder`** (module documents; `{{documentsList}}` is a plain-text bulleted list
      in a `white-space:pre-line` block so newlines survive EmailService's HTML-encode-at-the-sink). Routes via the
      outbox → whichever SMTP the template binds (per the provider plan, member-facing = Mailgun/SendPulse).
- [x] **Added to the CG rentrée checklist:** new template task **"Relancer les familles avec des documents
      manquants"** (phase Dossiers membres, role chef-de-groupe, not fanned-out, depends on the CU doc-verification
      task) with a new **`goto-document-reminders`** rentrée action (added to RentreeActions + rentree-actions.ts).
      Idempotent `SeedRentreeReminderTaskAsync` inserts it into DBs whose template was already seeded (existing
      dev/prod) — wired in Program.cs; a fresh DB gets it from the full template seed. Verified live: candidates
      (Feu Jamhour → members missing both active doc types + contact email), send (sent=1, outbox row w/ bulleted
      list + unit), CU→403, both seeds applied. Build + 4 tests + tsc + eslint + vite clean. DEV until deploy.
- [x] **Worklist redesign (user: "send in one click to a unit… not clicking on an individual name"):** the page
      now opens on a **one-click-per-unit worklist** instead of a unit dropdown. New `GetDocumentReminderSummaryQuery`
      + `GET /documents/reminder-summary` (maitrise.manage) = every unit WITH incomplete dossiers + its count
      (incompleteCount / withEmailCount), computed group-wide in one pass, ordered by count desc. The page lists
      each unit with a **"Relancer l'unité"** button (one click → confirm → sends to all its incomplete members
      with an email) + a **"Membres"** expander that lazy-loads that unit's candidates for **individual** per-row
      "Relancer". Both modes hit the same `POST /documents/send-reminders` (unitId vs memberIds). Verified live:
      summary ranks units by incomplete count; one-click Feu Jamhour → 6 members → 6 distinct outbox rows.

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

### Relance documents — compact codes + single-unit picker (2026-08-19)
Reworked the CG "Relance documents" page (`/admin/document-reminders`) for readability when members have many
document gaps. DEV until deploy.
- **Gaps shown by document CODE, not full name.** `DocGapDto` gained `DocTypeCode` (the doc type's short code,
  e.g. AUT/FM); `DocumentGaps.Compute` + all 3 active-type selects (summary/candidates/send) now carry the code.
  The email body still uses the full `DocTypeName` (parents need the readable name). Frontend `DocGap` gained
  `docTypeCode`; the table shows a compact colour-by-reason **code chip** (missing=red, rejected=orange,
  expired=amber) with a **hover tooltip = full name — reason**, plus a legend.
- **One unit at a time via a picker.** Replaced the all-units expandable worklist with a **unit `<Select>`** at the
  top (options = only units with incomplete dossiers + their count), a **"Relancer l'unité (N)"** one-click button,
  and the selected unit's incomplete members below (member/équipe/code chips/email/Relancer). Verified live:
  candidates return `docTypeCode` (AUT, FM) alongside the full name.

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

### Public site audit — fix batch (2026-08-20)
Ran a full public-site audit (4 parallel agents: correctness, security, performance, UI/UX-a11y-SEO). Security
came back clean (no S1/S2), mobile safe. Fixed the actionable batch (frontend + 2 controllers; DEV until deploy):
- [x] **Editorial content rendered correctly (root cause of "lists don't apply").** The public renderer
      (`rich-content.tsx`) + the editor (`rich-text-editor.tsx`) relied on `prose` classes that are **inert** (no
      `@tailwindcss/typography` plugin installed), so author lists/headings/rules/tables showed no styling in the
      editor and (for the newly-covered elements) on the site. Both now style every element the TipTap toolbar can
      produce **explicitly** via `[&_*]` utilities — added `h1`/`h4`/`hr`/`th`/`td` to the existing ul/ol/li/a/h2/h3
      set. Editor + public render now match.
- [x] **Content assets edge-cacheable.** `ContentImagesController` + `ContentFilesController` serve endpoints now
      send `Cache-Control: public, max-age=31536000, immutable` (filenames are content-addressed GUIDs → bytes
      never change), so the browser + Cloudflare stop re-fetching images/attachments on every page view.
- [x] **Link hardening + memoized sanitize.** `rich-content.tsx` registers a DOMPurify `afterSanitizeAttributes`
      hook that adds `rel="noopener noreferrer"` to any `target=_blank`/external anchor (reverse-tabnabbing +
      referrer leak), and wraps `DOMPurify.sanitize` in `useMemo(html)` so re-renders don't re-sanitize.
- [x] **SEO (partial).** New `components/public/seo.tsx` (`<Seo title description>`) uses **React 19 native
      document metadata** (renders `<title>` + `<meta name=description>` + `og:title`/`og:description`, hoisted to
      `<head>`) — wired into all 10 public pages (home, units, unit-detail, news list+article, agenda list+event,
      ressources list+resource, standalone page, contact); detail pages derive the description from the CMS body via
      `metaFromHtml` (strip tags → truncate 160, in `lib/utils.ts`). `index.html` gained a static OG/Twitter floor
      (site name, locale fr_FR, favicon og:image). NOTE: JS-rendered meta helps browsers + Google but NOT non-JS
      social scrapers (Facebook/WhatsApp) — full share-card accuracy needs **server-side prerendering** (deferred).
- [x] **A11y + polish.** Contact form inputs got `id`+`htmlFor` label association; home event dates use the
      agenda's string-split parser (DateOnly timezone off-by-one fix); softer empty-state copy on agenda/ressources/
      news ("à venir / bientôt" when nothing's published, vs "pour cette sélection" when a filter returns nothing).
- **Verified:** frontend `tsc` + `eslint --max-warnings=0` + `vite build` clean; API builds 0 warn; Cache-Control
      header confirmed live on a served content image. **Deferred follow-ups** (documented, NOT in this batch):
      longer output-cache TTL + edge Cache-Control on public JSON; full social-scraper prerender/SSR;
      keyboard-accessible nav dropdowns + mobile-menu focus trap; foulard regex / date-format-consistency polish.

### Email "mode test" guardrail (2026-08-20)
- [x] **Bulk email-send pages now warn when delivery is in test mode.** `email.override_recipient` (when set)
      makes `EmailService` REDIRECT every outgoing email to one test address — so a mass send *looks* successful
      (counts + "envoyé") but no real recipient gets anything. This silently swallows leader activation links
      (Envoyer les accès), the chefs broadcast (Message aux chefs), and document reminders (Relance documents). New
      shared `<EmailDeliveryWarning>` (reads `email.override_recipient` via the auth-only `GET /settings/{key}`, so a
      CG can see it; the test address itself is not shown) renders a prominent amber banner on those three pages when
      the override is set. Frontend-only, DEV until deploy — **NOT on the prod build deployed this afternoon**, so
      the immediate launch protection is still a pilot send (see below).

### Onboarding email carries the activation link — one email (2026-08-20)
- [x] **The rentrée onboarding email now contains the set-password link** (no separate "Envoyer les accès" pass).
      `SendLeaderMessageCommandHandler` (Message aux chefs): if the chosen template's body/subject contains
      `{{activationLink}}`, it stamps a set-password token per recipient (reusing the reset-token fields, configurable
      `member.activation_link_days` expiry, default 30) and provides `{{username}}`/`{{activationLink}}`/`{{expiryDays}}`
      — mirroring SendAccess. Tokens saved BEFORE enqueue; a recipient with no active login account is reported as
      `NoAccount` (can't get a link). A plain announcement template (no `{{activationLink}}`) behaves as before (no
      tokens, sent to anyone with an email). `SendLeaderMessageResult` gained `NoAccount`/`NoAccountNames` (surfaced
      in the toast). Both seeded templates `cu_rentree` + `cu_rentree_nouveau` now embed a "Votre accès" block
      ({{username}} + "Activer mon compte" {{activationLink}} valid {{expiryDays}} jours); `SeedMemberEmailTemplatesAsync`
      also **upgrades existing DBs in place** (guarded on the old seeded signature "identifiant habituel" /
      "qui vous a été communiqué", so a CG-customized body is left alone; idempotent). Frontend `general` module
      variable list gained the onboarding + activation vars so a CG can insert them.
- **Future (next year):** returning chefs are already members with accounts — no activation needed. The mechanism
      is template-driven, so next year just **remove the `{{activationLink}}` block from `cu_rentree`** → it becomes
      instructions-only (no token stamped), while `cu_rentree_nouveau` (genuinely new chefs) keeps the link. No code
      change. Documented in `docs/emails/cu_onboarding.md`. Verified live: send to an account+email leader stamped a
      token (expiry = today+30) + queued a `cu_rentree_nouveau` outbox row; a no-email leader reported, no delivery
      (dev SMTP off). Backend+frontend, DEV until deploy (seeder upgrade applies on prod startup).

### "Message aux chefs" (Communications) page redesign (2026-08-21)
- [x] **Clearer audience + send-up + preview + a latent CG 403 fix.** The page mixed a unit dropdown + a
      "nouveaux chefs" toggle + per-member checkboxes with no hierarchy, the send button sat below a long table,
      and there was no way to see the email. Reworked: **audience = segmented "Toutes les maîtrises / Une unité"**
      (unit picker only for "Une unité") **+ a Switch "Nouveaux chefs uniquement"** (never-logged-in, combines with
      the audience) **+ checkboxes to fine-tune** (with a caption); the **Envoyer bar moved to the top** (above the
      list, with a live "à N chef(s) de <audience>" summary); a **live preview** (subject + body rendered via
      RichContent, `{{variables}}` filled with sample values, only shown once a template is picked) + an activation-
      link note when the body has `{{activationLink}}` + a "Modifier le modèle" link (super-admin only).
- [x] **Fixed: a real CG saw NO templates.** The page listed templates via `useEmailTemplates` (`GET /email/templates`,
      **associations.manage** = super-admin only) → a CG (maitrise.manage) got 403 and an empty dropdown. New
      CG-accessible **`GET /communications/templates`** (`GetLeaderMessageTemplatesQuery`, IsGroupManager gate,
      returns active templates' id/name/code/subject/body/variables — read-only; editing stays super-admin) +
      `useLeaderMessageTemplates`. `useLeaderRecipients` gained an `enabled` flag (holds the fetch on "Une unité"
      until a unit is chosen). Verified: endpoint returns 15 active templates. Build clean (dotnet + tsc + eslint +
      vite). DEV until deploy.
- **NOT done (offered):** true per-send content editing (one-off tweak of subject/body before sending) — the email
      pipeline is fully template-code-driven (EmailJob/outbox store only the template code + variables; EmailService
      renders from the saved template), so an override needs new nullable outbox columns (migration) + an
      EmailService override path. Deferred; "adjust" today = edit the saved template (super-admin) or preview then send.

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
- [x] **Dev "WebRootPath not found (wwwroot)" warning silenced.** In Development the SPA is served by Vite (:5173)
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

### Domain switch → gndj.org (2026-08-29, DONE + live)
Made **`gndj.org`** the primary production domain (was `new.gndj.org`). The `gndj.org` zone was already on
Cloudflare; apex `@`+`www` were DNS-only pointing at the disposable **old** static site (`185.190.91.230`). App
**origin IP = `144.91.89.20`**. Walked the user through it on the prod server (samer's box). Full detail in memory
[[project-production-deployment]] + `docs/DEPLOYMENT.md` §11 (DONE callout).
- **TLS = free Cloudflare Origin Certificate** (`gndj.org` + `*.gndj.org`, 15 yr) — chosen over win-acme (user
      wanted free + no-renewals + Cloudflare-only posture, no CT-log exposure). PEM→PFX (`openssl pkcs12`) →
      `LocalMachine\My` (thumbprint `C101C44B…`) → IIS **SNI** bindings on site `GNDJ` for `gndj.org`/`www` (80+443,
      `netsh http add sslcert hostnameport=`). `new.gndj.org` keeps its win-acme cert (coexist via SNI). Cloudflare
      **SSL mode = Full (strict)**.
- **`AllowedHosts`** in `appsettings.Production.json` was **`new.gndj.org`** only → `gndj.org;www.gndj.org;new.gndj.org`
      (else the app 400s the new Host); recycled app pool `gndj` (NOT `iisreset` — shared box). `Cloudflare:Enabled`
      stays true.
- **DNS cutover:** apex `@` A → `144.91.89.20` **Proxied**, `www` CNAME → `gndj.org` **Proxied**. **MX (Zoho) + all
      TXT (SPF/DKIM/DMARC) untouched** — email unaffected. Verified: `gndj.org` → CF edge, public API 200, app
      homepage title, public Google-Trust edge cert.
- **Redirect:** this CF account has **Page Rules** (not Redirect Rules) → Page Rule `new.gndj.org/*` → **Forwarding
      URL 301** `https://gndj.org/$1` (preserves path+query; a `/reset-password?token=…` link 301s intact).
- **`app.base_url` → `https://gndj.org`** (email links).
- **Legacy `/gndj` redirect (code, commit `5270181`):** the old site lived under `/gndj` and 301-redirected root
      there → that permanent redirect is **cached in returning visitors' browsers** → opening `gndj.org` replays it
      to `/gndj` = app 404. Added client-side routes `/gndj` + `/gndj/*` → `<Navigate to="/">` (App.tsx). Safe
      (pushState, no HTTP GET of `/`, can't re-trigger the cached 301 → no loop). Deployed via `update.ps1 -Pull`.
      Also fixed the communications email-preview sample URL new.→gndj. (commit `e9de257`), and the **CU guide + PDF**
      login URL → `gndj.org`.
- **PENDING:** (a) **origin firewall → Cloudflare IPs only** (the real hardening — closes direct-to-origin bypass +
      makes the Origin-cert CF-only caveat moot); (b) **retire `new.gndj.org`** (DNS + Page Rule + drop from
      AllowedHosts) after the activation-link overlap; (c) optional one-time Cloudflare cache purge.

### CG feedback: public maîtrise phones + dedup (2026-08-29)
Two items from the CG's live test of the public site.
- **Maîtrise phone on the public unit page — DATA, no code needed.** The backend `LeaderPhone`
      (`PublicUnitQueries`) already returns each leader's OWN primary `member_phone`, and the frontend
      `LeaderCard` (`public/unit-detail.tsx`) already renders it as a clickable `tel:` link — both already in
      HEAD/on prod. Phones just weren't on file. The CG provided `Mail du grp.xlsx` (63 maîtrise: unit shortcode
      + name + personal email + phone). Matched 62/63 to **prod matricules** (via a prod maîtrise export the user
      ran — dev was stale; unit map Clan→C, MDG→G; reconciled spelling variants Jude/Joud, Kannan/Kanaan,
      Azoury/Azouri, Haber/Habr, Hadwane/Hedwane, Feghaly/KHALIL EL FEGHALI, El Khoury/KHOURY EL, Abou Mrad/
      ABOUMRAD, middle names Elsa Karol/Sacha Maria, etc.). Generated `deploy/golive/import_maitrise_contacts.sql`
      (idempotent DO block, keyed by card_number so it's correct on prod, skips-with-NOTICE if a matricule is
      missing): sets each leader's personal phone as their **primary** member_phone + adds the email + sets
      `primary_contact_email`. **Phone stored VERBATIM as in the sheet ("81-400 112") with an EMPTY country_code**
      so the public shows exactly the local number (LeaderPhone renders just the number when country_code is
      blank) — per the CG's "show it like the Excel". **PII → gitignored** (not committed); run once on prod
      (`psql -f`), then phones appear immediately (display already live). Validated on dev via a rolled-back txn.
      OMITTED: **Kinda Tayar** (Excel M3) — not in prod's current M3 maîtrise (fix her assignment first);
      Séréna Abou Rached has no email in the sheet (phone only).
- **Dedup a leader with two functions in the same unit (code, deploys next).** `PublicUnitQueries` built one
      maîtrise entry per assignment row, so someone holding two roles in a unit (e.g. Sélim Asly & Samer Cheaib =
      Assistant de Groupe + Trésorier on the Groupe) showed twice. Now collapsed to ONE entry that LISTS both
      roles, senior first ("Assistant de Groupe · Trésorier de Groupe") — GroupBy on the rank-desc leaderRows.
      Builds clean; DEV until deploy.

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

### Audit-log date-filter 500 fix (2026-08-30)
A CG (giorgio.rizk) hit a **500 on `GET /audit-logs`** filtering by date (surfaced in the Journal des erreurs).
Root cause: `GetAuditLogsQuery` compared the `From`/`To` bounds — which arrive `Kind=Unspecified` from the query
string — directly against the `timestamptz` `timestamp` column, and Npgsql throws "Cannot write DateTime with
Kind=Unspecified … only UTC is supported". The `PurgeAuditLogsCommand` already normalized to UTC; the READ query
didn't. Fix: a shared `ToUtc` (SpecifyKind Utc for Unspecified, else ToUniversalTime) applied to both `From`/`To`.
Verified live: `?from=&to=` → 200 (was 500). Backend-only, DEV until deploy (prod still crashes until deployed).

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

### Super-admin grant UI + security-profile merge + relift (2026-08-30) The `/admin/cotisations`
      dashboard is an unpaid worklist — the green "payé" count isn't drillable. Offered to make it clickable to
      reveal paying members + receipts (mirror the unpaid expand). Not built. For now: the SQL (members with a
      `cotisation_payments` row for a unit) or the new "Documents par unité" matrix (green cotisation cell).
- [ ] **Feature idea (from the rentrée review): capture leavers' contacts at passage.** When a CU marks a member
      *Quitte le groupe*, pop a dialog to capture/confirm the member's PERSONAL email + phone (approve / edit /
      dismiss, editable later) so the group can re-contact them next year. Currently a manual checklist task
      (*Collecter les coordonnées des membres qui quittent au passage*); this would make it a real in-app step.
- [ ] **Go-live for real users (discuss + build):** SMTP server choice + per-template binding; clear
      `email.override_recipient` only when ready; **`require_email_verification` stays ON** (manual-verify safety
      net now BUILT); run `deploy/golive/force-password-reset.sql` when activating accounts; login identity stays
      synthetic `@scouts.gndj`. Forced first-login password + configurable policy now BUILT. Deploy this session's
      dev-only work to prod (code + dump). Activation-link sender ("Envoyer les accès") BUILT — run it unit by unit
      (Maîtrise first) after email delivery works, to TEST the pipeline before members.
- [ ] Public site #3: knowledge / ressources section (lightweight CMS pages vs structured downloadable library).
- [ ] Optional: disable logins for the 86 login-having orphans; correct the 50 zero-day marker dates in-app.
- [ ] Deployment hardening (optional): secrets → env vars, httpOnly cookies. (HSTS done; prod CORS moot — SPA is
      same-origin; secrets already gitignored server-side.)
- [ ] Perf (optional later): async Serilog file sink (Serilog.Sinks.Async); DbContextCheck on /health; batch the
      demande-send in-loop unit/role/email lookups (now indexed, so low priority)
- [ ] **TypeScript 6 → 7** (deferred 2026-07-19): the codebase is ALREADY TS-7-clean — trialled live, `tsc` +
      `vite build` pass with ZERO code changes; the ONLY change needed is tsconfig.app.json (remove `baseUrl` +
      `ignoreDeprecations`, make paths relative `"@/*": ["./src/*"]`). Blocker: **`typescript-eslint` hard-fails on
      TS 7.0** (throws "does not support TS 7.0", tracked for TS ≥7.1 — GH issue typescript-eslint#10940), which
      would break `eslint`/CI. **Revisit when typescript-eslint ships TS 7 support** → then it's a 5-min bump:
      `npm i -D typescript@7 typescript-eslint@<new>` + the tsconfig edit above, no code work. (TS 7 = native/Go
      compiler; benefit is type-check speed only — Vite emits the bundle, so no runtime change either way.)
