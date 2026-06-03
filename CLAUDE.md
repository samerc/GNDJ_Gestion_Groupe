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

## Database
- 26 tables: associations, unit_types, units, teams, members, users, security_profiles, security_profile_permissions, functional_roles, member_assignments, member_relationships, member_phones, member_emails, member_addresses, guardians, guardian_links, guardian_phones, guardian_emails, audit_logs, settings, document_types, member_documents, member_cotisations, scout_stages, badges, member_progressions
- Member fields: firstName, lastName, dateOfBirth, gender, cardNumber, bloodType, nationality, school, classe, section, medicalNotes, allergies, notes
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

### Remaining
- [ ] PDF exports — unit/team lists, member cards
- [ ] Annual transition (Phase 4) — promote members between units
- [ ] Password reset / change password feature
- [ ] Export to Excel/CSV for member lists
- [ ] Error logging system (Serilog)
- [ ] Deployment: move secrets to env vars, CORS production policy, HTTPS/HSTS, httpOnly cookies
