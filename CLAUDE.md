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
- [x] Settings `demande.*` (enabled, scout_year, max_per_account [default 3], max_scout_relations [default 3],
      notes_max_length, require_email_verification, decide_siblings_together, intro_text). Server-side validation
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

### Remaining / Next
- [ ] **Option 1 (DECIDED, not yet built):** keep all imported members incl. inactive, but make counts
      honest — admin dashboard "Total members" should count ACTIVE (930) not all (2259); admin members
      list should default to active with an "Anciens/Alumni" toggle (backend `alumni` param already exists)
- [ ] Migration data cleanup (deferred): name spacing ("Marie- Lynn"), GET /photo unit-scope
- [ ] Deployment: move secrets to env vars, CORS production policy, HTTPS/HSTS, httpOnly cookies
