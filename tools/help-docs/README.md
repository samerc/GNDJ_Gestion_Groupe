# Guide tools (docs/help)

The in-app **Aide** guides are Markdown files in `docs/help/*.md` (front matter: `title`, `audience`
[public | member | cu | cg | admin | dev], `order`, `summary`), with screenshots in `docs/help/img`.
The API serves them role-filtered (`/api/v1/help`); in Development it reads the repo folder directly, so an edit
shows on refresh. Diagrams: ```` ```mermaid ```` blocks. Callouts: blockquotes starting with 💡, ⚠️ or ✅.
Link to another guide with `[text](guide-membre.md#section)`.

Both tools run against the LOCAL dev app (API :5000 + Vite :5173), dev data from `deploy/dev-sync-from-prod.ps1`,
every login `Gndj2026!`. `npm install` once in this folder.

- `node capture.mjs [public member cu cg admin]` — retakes the screenshots. Every real name, email and phone is
  replaced by a consistent FAKE one (gender kept), initials badges recomputed, member photos blurred — the dev
  database is a copy of prod, so a guide must never show a real family. Check the new images before committing.
- `node pdf.mjs [slug ...]` — exports the guides to `docs/help/pdf/*.pdf` from the app's own print view.

Accounts per role: see `ACCOUNTS` in `lib.mjs` (override with GNDJ_CU, GNDJ_CG, GNDJ_MEMBER, GNDJ_ADMIN).
