# Documents & reports

Member documents, multi-page, campaign/verification, templates & online forms, scan upload, OCR tool, reports.

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

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

### Document-type template (blank form to download) (2026-09-08)
Each document type can carry an OPTIONAL template — a blank form (PDF/Word/Excel/image) the member downloads,
fills, and uploads back. Not mandatory (null = no template, unchanged). All on main, DEV until deploy; verified live.
- **Model:** `DocumentType.TemplateFileUrl` + `TemplateFileName` (nullable; migration `AddDocumentTypeTemplate`,
      varchar 500/255). Carried through Create/Update commands + validators (MaxLength + NoHtml) and ALL three DTOs —
      incl. `DocumentTypeListDto` (the slim list the MEMBER upload screen reads) so the download link surfaces to members.
- **Upload:** new `POST /document-types/template` (gated `document_types.manage`, `upload` rate-limit, 15 MB) —
      own allowed set **pdf/jpg/jpeg/png/webp/gif/doc/docx/xls/xlsx** + magic-byte check (Office Open XML docx/xlsx =
      ZIP `PK\x03\x04`; legacy doc/xls = OLE `D0 CF 11 E0 A1 B1 1A E1`). Stores in `uploads/content`, returns the
      `/api/v1/content/files/{guid}.ext` URL + original name. Served by the existing anonymous `ContentFilesController.Get`
      (a blank form is non-sensitive) — which I extended to map Office/PDF MIME types + default to
      `application/octet-stream` (was `image/jpeg`, which would misrender a downloaded .docx).
- **Admin** (`document-types.tsx`): a "Modèle à télécharger (optionnel)" uploader in the create/edit form (upload →
      stores url+name on the form, persisted with Save; shows the current file + a Remove X); a "Modèle" download badge
      on the list row. `uploadDocumentTypeTemplate` in `document-type-service.ts` (mirrors `content-image-service`).
- **Member** (`member-documents.tsx`): a "Télécharger le modèle à remplir" link per doc type that has a template
      (plain anchor to the anonymous URL with `download`), shown regardless of upload status.
- Verified live: template upload → 200 (url+name+size); fake docx / disallowed .txt → 400 (magic + ext guards);
      served .pdf → `content-type: application/pdf`; create-with-template → `/document-types/list` returns the
      template url+name; delete cleanup 204. Build clean (dotnet 0/0, tsc + eslint + vite). NOTE: the curl `/tmp`
      binary-upload artifact (exit 26 / http 000) is an MSYS-path issue, not the endpoint — the existing
      `/content/files` behaves identically; a Windows-path upload succeeds.

### In-app document-template builder — per-member prefilled PDF (2026-09-09)
A GENERAL "create any document we want" builder: a CG authors a document (autorisation, fiche médicale, décharge…)
IN the app as rich text, inserts {{champs}} that pre-fill with each member's data, and the member downloads a
server-generated PDF filled with THEIR own info (unpicked fields left blank to complete/sign). Supersedes the
static file-upload template on the member screen when set. All on main; DEV until deploy (migration applies on prod startup).
- **Model:** `DocumentType.TemplateHtml` (nullable text; migration `AddDocumentTypeTemplateHtml`) alongside the
      existing `TemplateFileUrl/Name`. `DocumentTypeDetailDto` carries `TemplateHtml` (for the editor); the list DTOs
      (admin + member `/list`) carry a slim **`HasHtmlTemplate`** flag only (the 100k HTML is never sent to members —
      just the flag that routes the member download to the PDF endpoint). Create/Update commands + validators carry
      `TemplateHtml` (MaxLength 100k, NOT NoHtml — it IS author HTML).
- **Renderer** (`Infrastructure/Services/DocumentTemplateRenderer.cs`, singleton `IDocumentTemplateRenderer`):
      **HtmlAgilityPack** parse → **QuestPDF** layout (A4). Supports ONLY the TipTap subset the editor can produce
      (p/h1-h4/ul/ol/li/hr/br, strong/b·em/i·u·s, span/a, `style="text-align:…"`) — anything else falls through to
      its text so a template never fails to render. `{{key}}` tokens (same syntax as email templates) are substituted
      per text-node; a missing/blank value → empty string (the "pick which fields prefill" behaviour). Empty `<p></p>`
      → a preserved blank line (signature spacing). NOTE: QuestPDF is `Justify()` not `AlignJustify()`.
- **Placeholder catalog** (`Application/DocumentTypes/DocumentTemplateFields.cs`) = ONE source of truth (key +
      French label + sample): the editor's **"Variable" dropdown** (the RichTextEditor's built-in variable inserter,
      reused — no custom UI) fetches it via `GET /document-types/template-fields`, the per-member resolver fills each
      key, and the CG "Aperçu PDF" uses the samples. 23 fields: prénom/nom/nomComplet/DOB/genre/groupe sanguin/
      nationalité/école/classe/section/matricule/n° carte/unité/équipe/fonction/prénom+nom+tél du père & de la mère/
      année scoute/date du jour. Father/mother resolved from `GuardianLink.RelationshipType == "Père"/"Mère"`; unit/
      team/role from the active assignment; scout year via `ScoutYearHelper.Of(assignment start)`.
- **Endpoints** (`DocumentTypesController`): `GET /template-fields` (document_types.manage) · `POST /template-preview`
      `{html,name}` → PDF with SAMPLE values (document_types.manage — POST so the "Aperçu" reflects the CG's live
      **unsaved** edits, not the last save) · `GET /{id}/member-pdf/{memberId}` → the member's prefilled PDF, gated by
      **`MemberAccess.CanAccessMemberAsync`** (own record OR a members.edit leader of the member's unit — same rule as
      the member card). `DocumentTemplatePdf(Data,FileName)`; file name = doc-type name (+ member name).
- **Frontend:** doc-type form gained a "Modèle à générer dans l'application (optionnel)" section → opens
      `components/admin/document-template-builder.tsx` (a wider dialog wrapping the shared RichTextEditor + "Aperçu
      PDF" that opens the sample PDF in a new tab). The list DTO omits templateHtml, so **editing fetches the detail**
      (`useDocumentTypeDetail`) to seed it and **Save is gated** (`templateLoading`) until it loads so a save can't
      wipe an existing template. Member screen (`member-documents.tsx`): a doc type with `hasHtmlTemplate` shows
      **"Télécharger le modèle pré-rempli"** (downloads the per-member PDF via `downloadMemberTemplatePdf`) INSTEAD of
      the static-file link (in-app template takes precedence). Admin list row shows a "Modèle app" badge.
- **Verified live end-to-end** (super-admin): fields catalog (23) · preview PDF (28 KB, sample values, centered
      heading) · create doc type with template → list `hasHtmlTemplate=true` + detail carries the HTML · per-member
      PDF (22 KB) whose text = "Angela ABBOUD · Noyau · Assistante de Noyau · 01/01/2009", father fields (no data)
      left blank · deleted the test type. Build clean (dotnet 0/0 + tsc + eslint + vite). NOTE: HtmlAgilityPack 1.12.4
      added to Infrastructure. The Word forms generated to the Desktop earlier are superseded by this in-app builder.
- **Form-builder upgrade (same day, per CG feedback "make it friendlier / no ugly dots / need checkboxes"):** the
      editor is now a lightweight FORM BUILDER via 4 custom TipTap nodes (`components/admin/form-nodes.ts`): a
      **memberField** pill (« Prénom » instead of raw `{{prenom}}`; serialises to `<span data-field="prenom">`), a
      **fillLine** clean underline (short/long, `<span data-fill data-w>` — NOT dotted, the CG rejected dots), a
      **fillBox** bordered box for longer answers (`<div data-box data-h>`), and a **checkbox** (`<span data-checkbox>`).
      Inserted from ONE grouped **"Insérer un champ"** dropdown (Champs du membre / À remplir par le membre) — the CG
      wanted a dropdown, not a row of chips. The shared `RichTextEditor` gained optional `extraExtensions` +
      `insertMenu` (grouped, insert literal text OR a custom node) props — email/CMS editors pass neither, so they're
      unaffected. Editor CSS (`.gndj-field/.gndj-fill/.gndj-checkbox/.gndj-box` in index.css) shows them as real form
      controls. **Renderer** (`DocumentTemplateRenderer`): resolves `data-field` spans to the member value; **draws**
      the underline (`TextDescriptor.Element(...).BorderBottom`), box (bordered `col.Item()`), and checkbox (bordered
      square) — checkboxes MUST be drawn (the PDF font Lato has no ballot-box glyph — verified ☐ U+2610 renders blank,
      while underscores/`[ ]` render fine). `HasVisibleContent` treats a fill/checkbox/field-only paragraph as
      non-blank (XPath). Verified live: preview (fields→samples, drawn lines/box/checkboxes, valid PDF) + per-member
      PDF (Angela ABBOUD/Noyau resolved, no-father pill→blank, checkbox+line drawn). Build clean (dotnet + tsc +
      eslint + vite). DEV until deploy.
- **Starter templates (same day):** a **"Partir d'un exemple"** picker in the builder loads a ready-made template
      so the CG edits instead of a blank page. `client/src/lib/document-starters.ts` = 4 presets built from the
      form-node HTML (pills + fill-lines + boxes): **Document vierge, Autorisation des parents, Certificat médical,
      Autorisation de sortie / camp**. **Autorisation + Certificat médical reproduce the Group's REAL 2026-2027 Word
      forms** (`Document_Complet_Reinscription`, extracted per the user's request) — the fields we can auto-fill
      (enfant/unité/parents/DOB/groupe sanguin/année) are pills, the rest (vaccins, antécédents, allergies,
      signatures) clean blanks/boxes. They're EDITOR PRESETS (frontend only) — the CG opens their existing doc type
      (dev has AUT/FM/CI, none had a template) → "Créer un modèle" → pick a starter → adapt → save; nothing to
      seed/delete. Confirm-before-replace when the editor isn't empty. Verified live: both starters render through
      the full parse→resolve→draw pipeline (fields→samples, list bullets, lines/box drawn, valid PDF).
- **Layout polish + friendly filename (same day, per CG "align text+lines / it's 2 pages / haven't added the header
      image yet"):** (1) **Aligned label-lines** — a paragraph/li that is "some text/pills + ONE trailing fill-line"
      (`IsLabelLine`) is now rendered as a **Row**: label `AutoItem` + an underline `RelativeItem` that GROWS to the
      right margin (`LineHorizontal`), so every "Étiquette : ____" ends at the same right edge and the line never
      wraps below its label (the reported bug). Multi-field lines (≥2 fills, e.g. signatures) stay inline fixed-width.
      `RenderInline` gained a `skip` param to omit the trailing fill when drawing the label. (2) **Compacted** the
      renderer (margin 40→30, font 11→10, line-height 1.35→1.2, paragraph/heading/blank/list spacing all reduced,
      heading sizes down) → the full Certificat médical starter now fits **ONE page** (was two; verified `/Count 1`),
      leaving room for a future header image. Starter multi-field signature lines shortened so they don't wrap.
      (3) **Member PDF filename** = **"<Type> - <Nom complet> - <Code unité>.pdf"** (e.g. "Fiche Medicale - Angela
      ABBOUD - N.pdf") — resolver adds the unit Code (stashed as internal `__unitcode`, not a template field); the
      member screen reads the server's Content-Disposition (new `filenameFromDisposition` in lib/download, prefers
      the UTF-8 `filename*`) instead of the hardcoded type name. Verified live: certificat 1 page + filename header.
- **Header image / logo (same day):** the builder now passes `onImageUpload={uploadContentImage}` so the editor's
      image button works (letterhead/logo). The renderer draws `<img>` (new `case "img"` + `LoadContentImage`): reads
      the file from `uploads/content` by bare filename (path-traversal guarded; jpg/png/webp/gif only) and embeds it
      `MaxHeight(180).AlignCenter().Image().FitArea()` (fitted to width, height-capped so an oversized upload can't
      blow the layout). Reuses the existing content-images upload/serve endpoints (CG has content.manage). Verified
      live: a header image embeds as an Image XObject in the PDF (present with, absent without).
- **Spacer (same day):** a `Spacer` block node (`<div data-spacer data-h>`) + a "Mise en page" insert group (Espace
      petit/moyen/grand = 10/22/40 px) lets the CG add vertical breathing room between paragraphs; the renderer draws
      it as `col.Item().Height(h*0.75)`. Editor shows a faint hover guide (`.gndj-spacer`) so the empty block is
      visible/selectable. Verified: preview PDFs render with/without the gap, valid PDF.
- **Fixes (same day):** (a) **List-item fill-lines now align** — TipTap wraps a list item's content in a `<p>`
      (`<li><p>label : ___</p></li>`), so `IsLabelLine` (which checks direct children) missed it and the `<li>` lines
      fell back to the old inline (wrapping) fill while `<p>` lines aligned. New `Unwrap()` descends a lone `<p>`/`<div>`
      wrapper before the label-line check, so list items get the same growing right-aligned underline. (b) **Dropped
      the injected doc-type-name title** at the top of the PDF (it duplicated the template's own authored heading) —
      `IDocumentTemplateRenderer.Render` lost its `title` param; the doc-type name is still used only for the file name.
      Verified live: preview shows only the authored heading (no "Fiche Medicale" title); list renders clean.
- **Font/size + left-right split + a batch of render fixes (2026-09-10):** the builder gained **font-family + size**
      dropdowns (curated Windows fonts + 8–24 pt) via `@tiptap/extension-text-style`'s `FontFamily`/`FontSize` (v3
      bundles them — no new dep), gated behind a new `enableFont` prop so email/CMS editors are unchanged. Applying a
      font with an EMPTY selection targets the WHOLE document (then restores the cursor) — otherwise TipTap only sets
      a *stored mark* (nothing visible/serialised). The dropdowns reflect the current run via `useEditorState`
      (re-renders on selection), stripping the browser's quote-normalisation so a spaced family matches its item. New
      **`SplitPointNode`** (`<span data-split>`, "Séparateur gauche / droite" under Mise en page) — the renderer splits
      the paragraph's inline content at the ⇥ into a two-column Row (left wraps, right hugs the margin). RENDERER FIXES
      (all found by rasterising previews with pymupdf + a headless-jsdom TipTap probe to get the REAL editor HTML):
      (a) **Alignment** — TipTap emits `text-align: center` WITH a space; `ApplyAlign` matched the space-less form →
      center/right/justify silently fell to left. Strip whitespace before matching. (b) **Font in PDF** — a spaced
      family round-trips as the quoted form `font-family: "Times New Roman"` → serialises `&quot;…&quot;`;
      HtmlAgilityPack returns the raw entities, so `ApplyInlineFont` now HTML-decodes the style first (else the quotes
      survive and QuestPDF can't find the family → Lato fallback). (c) **Split/form-lines under a document-wide font**
      — applying a font to the whole doc wraps ALL block content in one `<span style="font-family:…">`, nesting the
      `data-split`/fill markers one level below where block detection looked. `Unwrap` now also descends a lone plain
      style-`<span>`, folding its font into a threaded `baseStyle` so split + the aligned "label : ____" form-lines
      (the old `IsLabelLine` was generalised to `TryFieldSegments` — any number of trailing-fill segments → equal
      growing-underline columns, so multi-field signature lines align instead of dropping below the text) work AND
      keep the chosen font. Verified end-to-end (font/size/align/split, and all combined under Times New Roman).
      Backend + frontend, DEV until deploy.
- **Template export → prod (`deploy/templates/`):** since a CG authored the AUT (Autorisation) + FM (Fiche
      Médicale) templates in dev, `deploy/templates/document-templates.sql` (idempotent `UPDATE document_types SET
      template_html=… WHERE code IN ('AUT','FM')`, generated via `format('%L')` so escaping/UTF-8/⇥ are safe) +
      `content/*.jpg` (the two header images the templates reference) + README move them to the live prod DB
      incrementally (a full dev→prod dump would clobber prod's live enrollment data). Apply AFTER the feature is
      deployed to prod (the `template_html` column + fixed renderer must exist). Copy the images into
      `C:\inetpub\www\gndj\uploads\content\`, run the SQL. Matched by `code` (AUT/FM must exist on prod).

### Document-template per-member PDF — parents were blank (2026-09-10)
The in-app document-template per-member PDF (e.g. Autorisation des parents "Nous, soussignés … et …") rendered the
**father/mother name+phone fields BLANK** for virtually every member, even though the CG "Aperçu" showed them (the
preview uses hardcoded SAMPLE values). Root cause: `GetMemberTemplateValues` (`DocumentTemplateQueries.cs`) matched
`GuardianLink.RelationshipType == "Père" || "Mère"` **exactly (accented)**, but the imported data is overwhelmingly
the **UNACCENTED `Pere`/`Mere`** (dev DB: 2408 `Pere` / 2390 `Mere` vs 1 `Père` / 2 `Mère`) → almost no match. Fix:
fetch all the member's guardian links (tiny set) and classify père/mère in memory via
`TextNormalization.RemoveDiacritics(...).Trim().ToLowerInvariant() == "pere"/"mere"` (accent + case-insensitive;
`RemoveDiacritics` can't be translated to SQL). Verified live: Maria ABBOUD's AUT PDF now fills "Miguel ABBOUD et
Hiba AZOURY". Backend-only, DEV until deploy.

### Document-template fixes (2026-09-11)
- **`{{anneeScoute}}` = the CURRENT configured scout year**, not the member's join year. `DocumentTemplateQueries.
  ResolveMemberValuesAsync` was deriving it from the member's active-assignment start (`ScoutYearHelper.Of(StartDate)`)
  → an authorization printed 2025-2026 for a member who joined last year. Now reads the **`passage.scout_year`**
  setting (e.g. "2026-2027"), falling back to the year containing today if unset. Backend, DEV until deploy.
- **Member template download gated by status** (`member-documents.tsx`): the "Télécharger le modèle" button
  (in-app pre-filled PDF OR static file) now shows ONLY when the member still needs to (re)submit —
  `canDownloadTemplate = !doc || doc.status === 'Rejected' || doc.isExpired`. Hidden once a doc is **pending or
  approved** (no point downloading a blank form for a doc already sent/accepted). Frontend, DEV until deploy.

### Doc-verification: PDF preview fix (CSP) + scroll-to-top (2026-09-12)
Two asks on the document-verification page (`unit-documents.tsx`, used by both CU and CG/super-admin):
- **PDF preview showed a "blocked" placeholder instead of the document** (images previewed fine). Root cause: the
      **CSP** (`Program.cs`) had no explicit `frame-src`, so the blob-URL `<iframe>` used to embed the downloaded
      PDF inherited `default-src 'self'` — which blocks `blob:`. (Bites in PRODUCTION only — CSP is applied outside
      Development, so it worked on the dev localhost.) Fix: added **`frame-src 'self' blob:`** to the CSP (kept
      `object-src 'none'`). Also added an **"Ouvrir"** button (opens the current page's blob in a new tab via
      `window.open`) as a reliable full-size fallback next to Télécharger. Backend CSP change deploys to prod next;
      the frontend button + the (already-working-on-dev) inline preview ship together.
- **Scroll-to-top**: new reusable `components/shared/scroll-to-top.tsx` — a floating bottom-right "Retour en haut"
      button that appears after scrolling 400px. The app scrolls INSIDE `<main>` (not the window, per AppLayout), so
      it watches that container (falls back to window) and calls its `scrollTo`. Mounted on the doc-verification
      page (the matrix gets very long with many members). z-40 so it sits under dialogs.
- Build clean (dotnet 0/0 + tsc + eslint). DEV until deploy (the PDF fix needs the deploy to reach prod, where the
      problem actually is).

### Audit log — document actions say WHOSE document (2026-09-12)
A CG noticed the audit detail of a document approval read "Statut : Pending → Approved" with no indication of
which member or document — useless for tracing "who approved whose document" in a dispute. The `ReviewDocument`
audit (entity `MemberDocument`) now resolves + logs **`Member`** (via `AuditNames.MemberAsync`) + **`Document`**
(the document type name) in BOTH old and new values, so they render as unchanged CONTEXT rows beside the
highlighted Statut change ("Membre : Jean Dupont · Document : Carte d'identité · Statut : Pending → Approved").
Applied the same to **Create** (upload → `Member` + `Document` type) and **Delete** (`Member`). Frontend
`FIELD_LABELS` gained `Document`/`ReviewNotes`/`FileName`. `AuditNames` was already imported (Common). Backend
+ one frontend label, builds clean (dotnet 0/0, tsc + eslint). DEV until deploy — only NEW audit rows carry the
names (existing rows predate the change).

### Rapports personnalisés — visual builder + targeting + rich fields + CU access (2026-09-12)
A full "shake up" of the custom-report feature. All on main, DEV until deploy; verified live end-to-end.
- **Targeting (`ReportTemplate` scope, migration `AddReportTemplateScope`):** a template now carries a **ScopeType**
      — `unit` (CU picks the unit at generation) / `units` (a fixed set, `ScopeUnitIdsJson`) / `branch` (all active
      units of `ScopeUnitTypeId`) / `group` (all active units) — plus `TitleOverride` and `MemberFilter`
      (all / youth [non-maîtrise] / maitrise). group/branch/multi-unit reports group members **by unit then team**.
- **"As much info as possible":** the roster/export column set went from ~14 → **~28** built-in columns + custom
      fields. Added prénom/nom split, `externalCardNumber` (n° carte), profession + professionDomain, address,
      primaryContactEmail, **père/mère name + phone**, guardian emails, **unit**, and startDate (arrivée). Wired
      through `RosterService.ColumnDefs` + `ExportService.ColumnLabels` + both `GetValue`s + the two data records
      (extended with defaults so old callers compile).
- **Shared `ReportDataCollector`** (Application/Reports): ONE place doing access + the rich projection (incl.
      guardian father/mother/email subqueries, accent-tolerant `Père`/`Pere` match) + the maîtrise/youth filter +
      multi-unit per-(unit,team) grouping. `GenerateRosterQuery`/`GenerateExportQuery` rewritten to use it and now
      accept `UnitIds` + `Title` + `MemberFilter` (single-unit callers unchanged). New `GenerateReportFromTemplateQuery`
      resolves a template's scope → units (group/branch/units = **group-manager only** via `MemberAccess.IsGroupManager`;
      unit = CU-facing) and dispatches to the roster/export generator via `IMediator`; `POST /report-templates/{id}/
      generate {scoutYear, unitId?}` returns the file.
- **Visual builder** (`report-templates.tsx` rebuilt): a wide dialog — left = Nom/Description/Titre/Type/Format/
      **Cible** (icon cards + conditional branche select or multi-unit checklist)/Membres/Actif; right = a **column
      builder** (grouped palette → click to add, ordered selected list with ↑/↓/✕, the order = the report column
      order) fed by the built-in catalog + active custom fields. Each template card shows a scope/filter badge + a
      **Générer** button (unit scope → a unit picker; else generates directly). Format standardized to `excel`/`csv`
      (legacy `xlsx` still accepted).
- **CU access (the "cu cannot see the create rapport" fix):** report-template **writes moved from
      `associations.manage` → `members.edit`** (CU/CG/super-admin) and the `/admin/report-templates` route moved out
      of `AdminRoute` to a `members.edit` `PermissionRoute`. A CU reaches it via **"Rapports → Créer / gérer les
      rapports…"** on their unit dashboard (the dropdown now always renders for a leader; only **unit-scoped**
      templates are runnable there). The builder **hides the Cible section for non-managers** (a CU only builds
      unit-scoped reports); `useUnits`/`useUnitTypes`/`useCustomFields` gated on `isManager` (a CU 403s on unit-types/
      custom-fields). Sidebar + Paramètres launchpad "Modèles de rapports" perm lowered to `members.edit` (CG sees it).
- Verified live: admin group-scope roster PDF (maîtrise filter) + branch-scope Excel with père/mère/guardian-email
      columns; a real **CU** creates a unit template (201), generates it for their unit (200 PDF), and is **blocked
      400** generating a group template. dotnet 0/0 + tsc + eslint + vite clean; migration applied on dev (backfills
      scope=unit/filter=all on existing rows).

### Scan a document with your phone — desktop→phone upload hand-off (2026-09-24, DEV until deploy)
On a member's **Documents** tab (member panel / Ma fiche), a desktop user opens **"Scanner avec le téléphone"** →
a QR encoding `{origin}/scan-upload/{token}`. The user scans it with their phone camera, opens that URL **without
logging in** (the token IS the scoped authorization), picks the document type + photographs the paper, and it
uploads STRAIGHT into the member's dossier at the right type — no "copy the photo to the laptop" step. The desktop
polls the session and **live-refreshes the documents** as photos arrive. Two photos of the same type (recto/verso)
build ONE document (the write path appends to a pending doc of that type — the existing multi-page mechanism).
- **Entity** `UploadSession` (plain table, migration `AddUploadSessions`): `TokenHash` (SHA-256 of the raw token —
  the raw token is NEVER stored, unique-indexed), `MemberId`, `CreatedByUserId`, `ExpiresAt` (10 min), `UploadedCount`
  (capped at 30 — abuse bound), `LastDocumentId`. NOT a BaseEntity (ephemeral plumbing). No FK to Member (orphans
  harmless; expired rows are tiny — no cleanup job built, `ExpiresAt` is indexed if one is ever wanted).
- **Handlers** `Application/ScanUpload/ScanUploadHandlers.cs`: `CreateUploadSessionCommand` (authed — gated by
  `MemberAccess.CanAccessMemberAsync` + the campaign/on-hold block, so a youth can only open one for themselves and a
  CU only for their unit; a member whose deposit window is closed is refused at creation, so no re-check is needed in
  the 10-min window) → returns `{id, token, expiresAt}`; `GetUploadSessionStatusQuery` (authed, creator/super-admin
  only) → `{uploadedCount, expired}`; `GetScanUploadInfoQuery` (**anonymous** — resolves the session by token hash) →
  `{memberLabel = "Prénom I.", docTypes, expiresAt}`; `ScanUploadDocumentCommand` (**anonymous**, token-authorized) →
  resolves the session, routes into the **shared `MemberDocumentWriter.WriteAsync`** (create-or-append + auto-approve
  + audit, tagged `via:"scan mobile"`, attributed to the session creator), bumps `UploadedCount`.
- **Refactors (DRY):** extracted `MemberDocumentWriter.WriteAsync` in `DocumentHandlers.cs` (the create-or-append
  body, now shared by the normal `UploadMemberDocumentCommand` AND the scan flow) and `DocumentUploadFiles.SaveAsync`
  in the Api layer (the size/extension/**magic-byte** validation + save, shared by `DocumentsController` AND
  `ScanUploadController`) — so both paths enforce identical limits/validation.
- **Controller** `ScanUploadController` (`api/v1/scan-upload`): `[Authorize]` on the class, `[AllowAnonymous]` on the
  two phone actions. Upload is `[EnableRateLimiting("upload")]` + 20MB cap; multipart → abuse middleware skips it.
- **Frontend:** phone page `pages/scan-upload.tsx` (**public route `/scan-upload/:token`**, self-contained mobile UI:
  doc-type `<select>`, camera `capture="environment"` + file fallback, upload progress, inline status; no app chrome,
  uses `publicApi`) + desktop `components/members/scan-upload-dialog.tsx` (QR via `qrcode.react`, polls every 2.5s,
  invalidates `['documents', memberId]` on each arrival, expiry + "Générer un nouveau code"). Button wired into
  `member-documents.tsx`, gated by **`useScanUploadEnabled()`** + `canUpload` + a fine-pointer (desktop) check.
- **Setting-driven like the PWA banner:** `scan_upload.audience` (Général: **off / maîtrise[default] / all**) drives
  the hook `hooks/use-scan-upload-audience.ts` (mirrors `usePwaEnabled`); SeedMissingSettings + settings.tsx
  SETTING_OPTIONS. The phone page always works with a valid token regardless of the audience (it only gates the
  desktop button).
- **Verified live end-to-end** (admin, cleaned up): create session → phone info returns "Admin S." + 3 doc types →
  anonymous PNG upload → session count 0→1 → the document appears on the member (type + Pending) → deleted. dotnet
  0/0, tsc + eslint + vite clean; anonymous bogus-token → friendly 400.

### Document download auditing + missing-file flag (2026-09-24, DEV until deploy)
Two related document items (all on main, DEV until deploy; migration-free — reuses the existing audit_logs table).
- **Sensitive-access auditing = DOWNLOADS only** (a CG decision: reads are far too high-volume; a *download* hands
      over the actual file bytes — a medical certificate, an ID scan — so it's the event worth tracing). New
      `Application/Documents/DocumentDownloadAudit.cs`: `LogDocumentDownloadCommand` / `LogDocumentPageDownloadCommand`
      / `LogZipDownloadCommand`, each writing an audit row via `IAuditService.LogAsync("Download", "MemberDocument", …)`.
      For a single file/page **EntityId = the member id** (so it also shows on the member's "Journal" tab), newValues =
      `{Member, Document (type name), FileName}`; for a bulk **zip** EntityId = the unit id, newValues =
      `{Unit, Document (type or null=all), FileCount}`. `DocumentsController` sends the command from the 3 download
      endpoints (`{id}/download`, `pages/{pageId}/download`, `unit/{id}/zip`) AFTER the file stream opens successfully,
      via a **best-effort** helper (`LogDownload`, try/catch-swallow) so an audit hiccup never breaks a download; the
      404 "file gone" path logs nothing. Frontend `lib/audit-format.ts`: action `Download` → "Téléchargement" (purple);
      `FileCount` → "Nombre de fichiers". Live-verified: single/page/zip each write the right row (member- vs
      unit-linked, with names/count); the 404 path writes nothing; test artifacts cleaned up.
- **Missing-file flag** (a document record whose file was deleted/lost on disk — exactly what the prod-synced dev DB
      shows: rows exist, files 404). `DocumentPageDto` gained **`FileMissing`**, computed in `DocumentPageMapper.Build`
      by a disk-existence check (same path resolution + uploads-root traversal guard as the download endpoint; any IO
      error → treated as missing). Frontend `member-documents.tsx`: a red **"Fichier manquant"** badge on the document
      row when any page's file is gone, a per-page "— fichier manquant" marker in the pages viewer, and the download
      buttons for a missing file are HIDDEN (they'd only 404) so it's clear the file must be re-uploaded. The
      `unit-documents.tsx` synthetic single-page fallback sets `fileMissing:false`. Live-verified: prod-synced docs →
      `fileMissing:true`, a fresh upload → `false`. dotnet 0/0, tsc + eslint clean.

### Paper fiche médicale reader — offline OCR → Excel (2026-10-07, tool only)
- `tools/FicheOcr` (.NET 10 console, NOT in the app): one fiche per ACTIVE member (accepted first, else newest,
  rejected skipped) from the DB + files under the site folder (PDF pages via PDFtoImage, photos turned upright from
  EXIF, longest side ≤1600 px, ≤3 pages) → local **Ollama** `/api/chat` (`qwen2.5vl:7b`, JSON-schema structured
  output, temperature 0, `num_thread` 4) → `FicheFields.Check` (blood type normalized + compared to the member's
  fiche, dates → DD/MM/YYYY, ILLISIBLE, not-a-fiche, unsigned, empty) → `C:\gndj-ocr\fiches-medicales.xlsx`
  (Lisez-moi / Fiches / Erreurs; column labels = the online form labels; hidden MemberId/DocumentId for a future
  import into member_form_answers + the Médical tab). Resumable via `resultats.jsonl`; Ollama down/slow is NOT saved
  (retried next run, 3 in a row = stop); `--essai N` (separate `essai` folder), `--until HH:mm`, `--export` /
  `--manifest` (laptop), `--check`. Lock file prevents two runs on one folder. `--report` rewrites the Excel from resultats.jsonl; the checks are
  RE-APPLIED at every Excel write (`FicheResult.Rechecked`), so rule changes reach rows read earlier. Rules after the
  first real run (prod, 4 Clan fiches, ~4–6 min/fiche at 6 threads): not-a-fiche → all boxes empty; a year or
  month/year alone is a valid vaccine date (no flag); French month names (« 20 sept 2026 ») parsed.
- Server: `deploy/ocr/setup-ocr.ps1` (elevated: Ollama zip → C:\ollama, model pulled ON THE SERVER, publish to
  C:\gndj-ocr\tool, ACL admins+SYSTEM, optional night task `GNDJ-FicheOcr` registered DISABLED) and `run-ocr.ps1`, run
  ON DEMAND (`-ListUnits`, `-Unit C1[,T3]` = FicheOcr `--list-units`/`--unit`, `-Trial N`, optional `-Until HH:mm`;
  starts Ollama 127.0.0.1 below-normal, stops it after; runs add up in one Excel; the night task passes
  `-Until 06:00 -Night` and only it honours `C:\gndj-ocr\PAUSE`). Tested here
  against a fake Ollama (rotation, flags, resume, export/manifest, script wrapper); the real model is only on the server.
- Members marked « Quitte le groupe » at this year's passage (passage line, effective leaving, `passage.scout_year`) are not read and
  are left out of the Excel (an earlier read stays in resultats.jsonl); `--all-members` includes them (2026-10-08).
- Not built yet: the import of the checked Excel; the « En ligne uniquement » document-type option for next year.

### Fix batch from the full-app review (2026-10-09, DEV until deploy)
- **Upload files** (`DocumentUploadFiles`): stored as `<guid>.<ext>` (original name kept in the DB, ≤200 chars) —
  names with `| " * ? : < >` used to throw a 500 and leave files; MIME type from the checked extension, never the
  browser's; a disk error or an exception in the command cleans the batch (`SendOrCleanupAsync`).
- **Create-or-append** (`MemberDocumentWriter`) runs in a transaction with an advisory lock per (member, type)
  (`DocumentLocks.Key`): two simultaneous uploads → one document, distinct page numbers. Inactive doc type refused.
- **Add pages** refused on an Approved, non-expired document; an expired accepted one goes back to Pending.
- **Scan upload**: per-session cap claimed atomically (conditional UPDATE), slots given back on failure.
- **Unit zip**: built in a temp file (`DeleteOnClose`) instead of MemoryStream+ToArray; the file is opened before the
  entry is created (no empty entries); UnauthorizedAccess skipped too. Matrix default year = `passage.scout_year`.
- **New-year cleanup**: the archive export uses `IgnoreQueryFilters` (same set as the deletion), and page files of
  soft-deleted documents are deleted from disk.
- **Cotisations**: currency codes saved uppercase, `CotisationCalc` matches them case-insensitively (patch 043 fixes
  old rows); receipt number = highest NUMBER + 1 (string max broke past 9999).
- Live-tested: odd file name upload, 2 parallel uploads → 1 doc, page on accepted doc refused, zip valid.


### 2026-10-10 — Template fonts after the QuestPDF 2026.9 upgrade
- Prod log: every member-PDF of « Autorisation des parents » failed with `DocumentDrawingException: font families
  not available: 'Times New Roman'`. QuestPDF ≥ 2026.9 no longer reads system fonts, and an unknown family FAILS
  the document instead of falling back.
- `Infrastructure/Services/PdfFonts`: at startup registers the template builder's families (Arial, Times New
  Roman, Georgia, Verdana, Tahoma, Calibri, Courier New — client `FONT_FAMILIES`) from `%WINDIR%\Fonts`;
  `DocumentTemplateRenderer.StyleSpan` applies a family only if `PdfFonts.IsAvailable`, else keeps Lato.
  Adding a font to the builder = add its file prefix to `PdfFonts.FilePrefixes`.
- Verified: the failing type/member now returns a PDF embedding TimesNewRomanPSMT + Bold.

### 2026-10-10 — Online fiche médicale: launch-day hardening
Reviewed (backend + frontend) and live-tested before switching FM to « Remplissable en ligne » on prod.
- **Arabic / emoji answers failed the PDF** (QuestPDF 2026.9: no system-font glyph fallback + throw on missing glyph).
  `DependencyInjection`: `Settings.UseSystemFonts = true` (Segoe UI/Arial fill in Arabic, Segoe UI Emoji the emoji —
  verified rendered, Arabic shaped RTL) + `ThrowOnMissingTextGlyphs/FontFamilies = false` (worst case a box, never a
  failed document). Applies to every PDF in the app.
- **Médical tab no longer wiped**: `SaveIntoMemberFileAsync` replaces lines written by a previous send of the form
  (« Label : … » of its blanks) but KEEPS other text (chef/imported) under « Notes précédentes : … », carried once.
- **Double send**: `MemberDocumentWriter.WriteAsync(newDocumentOnly: true)` refuses, under the advisory lock, when a
  Pending doc exists (same « déjà été envoyé » message) — a signed form never becomes page 2 of another.
- **After the document is saved nothing can fail the request**: signature audit, Médical tab and remembered answers
  are best-effort (logged, `CancellationToken.None`, tracker cleared on failure).
- `upload` rate limit keyed per user (per IP when anonymous) — mobile-carrier NAT shared 60/10 min.
- Client (`online-form-dialog.tsx`): draft in localStorage per member+type+templateHash (restored on reopen, cleared on
  success); confirm before closing a started form; « déjà été envoyé » = success (lost response on a bad network);
  invalidates members + dashboard; last signer pre-filled only on the member's own fiche (`isOwnProfile`); date blur
  shows how it was read. `form-dates.ts`: digits-only (iOS numeric keypad has no « / »): 8 = JJMMAAAA, 6 = MMAAAA or
  JJMMAA, 4 = AAAA; « , » accepted. `signature-pad.tsx`: ResizeObserver re-fits the canvas on rotation (clears it);
  < 10 points = no signature. Button needs `hasHtmlTemplate`.
- Not changed (decisions): no required fields; a chef filling for a family picks Père/Mère (no « chef » relation);
  a Pending document blocks a corrected re-send until the chef rejects it.
- **Decision (same day): online signing = family only.** `OnlineFormGate` refuses when `user.MemberId != memberId`
  (« Seule la famille peut signer ce document en ligne… »); the button shows only on the member's own fiche
  (`isOwnProfile`, now also passed by the member panel when it's the viewer's own file). A chef helping a family
  downloads the prefilled PDF — unsigned, the parent signs it. Chefs no longer need to fill for families (uploads work).
