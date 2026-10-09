# Foundations — first build phases

Original Phase 1 build, admin tools, quality pass, API keys, PDF reports, custom fields, logging.

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

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

### Phase 2b — Admin Tools (Complete)
- [x] Audit log viewer (read-only, filters by entity/action/date, JSON key-value detail dialog)
- [x] Security profiles admin (list profiles, checklist permission editor per profile, group toggle)
- [x] Custom security profiles (2026-06-16): create (name + permission checklist; code auto-slugged & unique;
      validated vs Permissions.All) + delete (blocked for IsSystem profiles or profiles still used by a functional
      role). Endpoints POST/DELETE /security-profiles (roles.manage). Permission editor groups now cover ALL
      permissions (added Progression/Passage/Demandes/Site public). New profiles are assignable to functions.

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

### Serilog Logging (Complete)
- [x] Serilog.AspNetCore + Serilog.Sinks.File + Serilog.Sinks.PostgreSQL
- [x] File sink: daily rolling logs in logs/ folder, 30-day retention, structured JSON
- [x] PostgreSQL sink: Warning+ level logs to application_logs table (auto-created)
- [x] No console output — file + DB only
- [x] HTTP request logging with method, path, status code, duration
- [x] User context enrichment: UserId, MemberId, RemoteIP per request

