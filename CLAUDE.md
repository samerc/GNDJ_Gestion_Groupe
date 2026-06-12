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
- Seed data: 6 security profiles, 5 functional roles, 1 super admin user, configurable settings (schools, classes, nationalities, etc.)

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

### Phase 3 — Progression & Badges (Complete)
- [x] Scout stages (per unit type, ordered, isActive, isBadgeStage flag)
- [x] Badges (per unit type, isActive, linked to badge-type stages)
- [x] Member progressions (stage + optional badge, date, location, notes)
- [x] Admin page: Progression scoute (tabbed: Étapes / Badges, filtered by unit type)
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
- [x] Auto-renewal: members without passage record get renewed automatically on finalization
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

### Remaining / Next
- [ ] **Option 1 (DECIDED, not yet built):** keep all imported members incl. inactive, but make counts
      honest — admin dashboard "Total members" should count ACTIVE (930) not all (2259); admin members
      list should default to active with an "Anciens/Alumni" toggle (backend `alumni` param already exists)
- [ ] Migration data cleanup (deferred): name spacing ("Marie- Lynn"), GET /photo unit-scope
- [ ] Deployment: move secrets to env vars, CORS production policy, HTTPS/HSTS, httpOnly cookies
