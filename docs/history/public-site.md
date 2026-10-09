# Public website

Public site CMS (news, pages, events, resources), units pages, domain switch.

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

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

