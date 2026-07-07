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

### Remaining / Next
- [ ] **Go-live for real users (discuss + build):** SMTP server choice + per-template binding; clear
      `email.override_recipient` only when ready; decide login identity (synthetic `@scouts.gndj` vs real email);
      optional force-password-change-on-first-login; deploy this session's dev-only work to prod (code + dump).
- [ ] Public site #3: knowledge / ressources section (lightweight CMS pages vs structured downloadable library).
- [ ] Optional: disable logins for the 86 login-having orphans; correct the 50 zero-day marker dates in-app.
- [ ] Deployment hardening (optional): secrets → env vars, httpOnly cookies. (HSTS done; prod CORS moot — SPA is
      same-origin; secrets already gitignored server-side.)
- [ ] Perf (optional later): async Serilog file sink (Serilog.Sinks.Async); DbContextCheck on /health; batch the
      demande-send in-loop unit/role/email lookups (now indexed, so low priority)
