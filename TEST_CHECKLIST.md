# GNDJ — Full System Test Checklist

Test as **admin** first, then **CU**, then **regular member**.

## A. LOGIN & AUTH
- [ ] Login as admin (`admin@gndj.local` / `Admin123!`)
- [ ] Login as CU (`joseph.elkhoury@scouts.gndj` / `Admin123!`)
- [ ] Login with wrong password → error message in French
- [ ] Login with non-existent email → same generic error
- [ ] "Mot de passe oublié ?" link visible on login page
- [ ] Forgot password page → enter email → success message
- [ ] Logout → loading state → redirects to login
- [ ] Session timeout warning appears when idle (wait ~10 min or shorten JWT expiry for testing)

## B. SIDEBAR & NAVIGATION (test as each role)
- [ ] **Admin**: sees all menu items (Membres, Unités, admin section with all items)
- [ ] **CU**: sees only Ma fiche, Mon unité, Documents, Passage des membres, Session photo
- [ ] **Regular member**: sees Ma fiche, Mes documents; redirected to /my-profile
- [ ] Sidebar collapses → tooltips appear on hover
- [ ] Mobile: hamburger menu opens drawer, closes on navigation
- [ ] 404 page: go to `/nonexistent` → "Page introuvable" message

## C. ADMIN DASHBOARD
- [ ] Stats cards: Membres, Garçons/Filles (+ "Non renseigné" if applicable), Docs manquants, Cotisations impayées
- [ ] Année scoute selector works (switch years, data updates)
- [ ] Charts: Membres par unité, Répartition par âge
- [ ] Doc compliance shows "X% dossiers complets"

## D. CU DASHBOARD
- [ ] Roster loads with members grouped by team
- [ ] Maîtrise team appears first
- [ ] Click member → detail panel opens on right (desktop) / below (mobile)
- [ ] All tabs work: Info, Contact, Famille, Unités, Documents, Cotisations, Progression, Infos complémentaires, Médical
- [ ] Search filters members
- [ ] Team filter works
- [ ] **Buttons row**: Trombinoscope, Liste, Cartes, Exporter, Photos → all open dialogs/pages

## E. MEMBERS (Admin page)
- [ ] List loads with unit filter
- [ ] Sort by columns (click arrows)
- [ ] Search by name
- [ ] **Create member**: fill all required fields (prénom, nom, DOB, genre, nationalité, école, classe) → toast "Membre créé" + credentials dialog with copy buttons
- [ ] Card number auto-generated (M-xxxx or F-xxxx)
- [ ] **Edit member**: change fields → toast "Membre modifié"
- [ ] **Delete member** without assignment → toast "Membre supprimé"
- [ ] **Delete member** with active assignment → error message
- [ ] Detail panel: all 9 tabs display correctly
- [ ] Export button: enabled when unit selected, generates Excel/CSV

## F. MEMBER DETAIL TABS
- [ ] **Info**: fields display, edit mode works, école dropdown with "Autre..." option, classe dropdown, section field (max 5 chars)
- [ ] **Contact**: add phone/email/address, edit (pencil button), delete, primary/emergency badges
- [ ] **Famille**: add guardian (search or create), link, edit (notes, contact flags), unlink with confirmation
- [ ] **Unités/Fonctions**: create assignment, "Terminer aujourd'hui" button, delete with confirmation
- [ ] **Documents**: checklist per doc type, upload (progress bar), approve/reject, download, "Formats: PDF, JPG, PNG — Max 10 Mo" shown
- [x] **Cotisations**: create, edit, delete, receipt download — fixed: multiple payments per year (multi-currency)
- [ ] **Progression**: add stage/badge, delete
- [ ] **Infos complémentaires**: custom field values display, inline editing per field type
- [ ] **Médical**: blood type, allergies, notes display

## G. MA FICHE (Regular member)
- [ ] Profile displays correctly
- [x] ~~"Modifier le mot de passe" moved to header user menu~~ (was button on page, now in dropdown)
- [x] Document upload works (member can upload own docs) — fixed: added permissions to animateur profile
- [ ] Cotisations visible (read-only)
- [ ] Photo NOT editable (no camera icon)
- [ ] Tabs scroll on mobile
- [x] Unités/Fonctions tab is read-only (no add/edit/delete buttons)

## H. DOCUMENTS (CU page)
- [ ] Matrix table loads (members × doc types + cotisation)
- [ ] Status legend visible above table
- [ ] Click cell → preview dialog opens
- [ ] Quick approve/reject on hover (keyboard accessible via Tab)
- [ ] Approve → status changes, toast shown
- [ ] Reject with notes → status changes
- [ ] Cotisation cell click → payment dialog
- [ ] ZIP download works
- [ ] Table scrolls horizontally on mobile

## I. PASSAGE ANNUEL

### As admin (CG):
- [ ] Validation passages page → toggle "Ouvrir le passage"
- [ ] Status badge shows "Ouvert" (green)
- [ ] Année scoute selector works

### As CU:
- [ ] Passage des membres page → shows unit members
- [x] "Pas de changement" — per-row button added + bulk action → auto-approved, badge shows "Pas de changement"
- [ ] "Déplacer vers..." → select target unit → team field hidden (shows message about new CU assigning)
- [ ] Single member propose → dialog with unit/team/role/notes
- [ ] Role change shown in blue in proposition column

### As admin (CG):
- [ ] Validation page → default filter "En attente" → only real changes shown
- [ ] Approve single passage
- [ ] Approve with modification (change unit/team)
- [ ] Reject with CG notes
- [ ] Bulk approve/reject
- [ ] "Finaliser les passages" → confirmation dialog → creates new assignments
- [ ] Double finalize → returns 0

## J. REPORTS & EXPORTS
- [ ] **Trombinoscope**: dialog opens, team checkboxes, "Imprimer les photos" toggle, PDF downloads
- [ ] **Liste (Roster)**: column picker by category, PDF downloads (A4 landscape)
- [ ] **Cartes**: bulk cards PDF downloads (10 per A4 page with cut lines)
- [ ] **Member card**: single card download from member detail (card icon button)
- [x] **Exporter**: format toggle (Excel/CSV), column picker, file downloads correctly — fixed encoding (Année scoute)
- [ ] **Card designer** (admin): checkboxes toggle fields, live preview updates, save works

## K. PHOTO SESSION
- [ ] Page loads with member list + progress bar
- [ ] Click member → camera opens (or file upload fallback on desktop)
- [ ] Silhouette overlay visible
- [ ] Camera toggle (front/back) works
- [ ] Capture → preview with "Garder / Reprendre"
- [ ] "Garder" → uploads, toast, checkmark appears on member
- [ ] Progress bar updates
- [ ] "Reprendre" → back to camera

## L. ADMIN PAGES
- [ ] **Associations**: CRUD, delete confirmation, toast notifications
- [ ] **Types d'unité**: CRUD, detail page with stages/badges tabs
- [ ] **Unités**: CRUD, isActive toggle in edit mode
- [x] **Équipes**: CRUD, color picker, Maîtrise badge — added: click team to see members list
- [ ] **Fonctions**: CRUD
- [ ] **Types de documents**: CRUD, explanation text under expiry/approval checkboxes
- [ ] **Progression scoute**: stages/badges tabs, drag-and-drop reorder, unit type filter
- [ ] **Champs personnalisés**: CRUD (text/number/select/boolean), "Afficher sur carte" toggle
- [ ] **Clés API**: create (key shown once + copy), toggle active, delete
- [ ] **Profils de sécurité**: permission checklist, group toggles, save confirmation
- [ ] **Journal d'audit**: filters (responsive grid), detail dialog (key-value table), row striping
- [ ] **Email / SMTP**: SMTP server CRUD + test email button, template CRUD with TipTap editor + variable dropdown
- [ ] **Carte membre**: field toggles + live preview, save
- [ ] **Paramètres**: key-value settings, save per field

## M. SECURITY CHECKS
- [x] Regular members cannot access admin pages (redirected to /) — AdminRoute guard added
- [ ] CU cannot see members from other units
- [ ] CU cannot add contacts to members in other units
- [ ] CU cannot create teams in other units
- [ ] API key works for scoped access (create key, test with curl/Postman)
- [ ] Swagger UI accessible at `/swagger`

## N. MOBILE (test on phone or browser dev tools)
- [ ] Login page: form centered, usable
- [ ] Sidebar: hamburger menu works
- [ ] CU dashboard: member list stacks above detail, buttons wrap
- [ ] Members page: list stacks above detail
- [ ] Document matrix: scrolls horizontally
- [ ] Passage table: scrolls horizontally
- [ ] Photo session: member list compact above camera
- [ ] All dialogs: don't overflow viewport
- [ ] Tabs: scroll horizontally

## P. NEW FEATURES (this session)
- [ ] **Mes documents** (member page): dedicated page at /my-documents, sidebar link visible
- [ ] **Cotisation dashboard** (admin): /admin/cotisations — summary cards, progress bar, breakdown by unit, unpaid list
- [ ] **Rapports personnalisés** (admin): /admin/report-templates — CRUD for report templates
- [ ] **Rapports personnalisés** (CU): "Rapports" dropdown in CU dashboard shows active templates, generates on click
- [ ] **Multi-currency cotisations**: same member can have multiple payments per year (e.g., USD + LBP)
- [ ] **Admin menu reorganized**: 3 groups (Données scouts, Gestion, Administration)
- [ ] **Change password**: available in header dropdown for all users (not just Ma fiche)
- [ ] **SchoolYear → ScoutYear**: renamed in DB, API, and frontend

## O. TOAST NOTIFICATIONS
- [ ] Create/edit/delete operations show success toast
- [ ] Error operations show error toast
- [ ] Copy buttons show "Copié !" toast
