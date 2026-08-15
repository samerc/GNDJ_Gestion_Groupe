# GNDJ — Go-Live Checklist

Living launch runbook for the September rentrée. **Owner** column: **You** = Samer (prod ops, decisions, DNS,
comms) · **Me** = Claude (code/config/scripts/verification).

- `[x]` = done · `[ ]` = to do · `[~]` = built in code, still needs a prod/ops action.
- **The critical path is Phase 0 → 1 → 2 → 3.** Email (Phase 1) gates almost everything: you can't accept a
  demande, activate an account, or send onboarding/relance mail until real email leaves the building.

Last updated: 2026-08-15.

---

## Phase 0 — Deploy current `main` to prod
Everything below is built on `main` but **prod is still on an older build** — nothing works in production until this ships.

| # | Task | Owner | Status |
|---|------|-------|--------|
| 0.1 | Final `code-review` + `wrap-up` error check on `main` | Me | `[ ]` |
| 0.2 | Bump version on dev → **v3.1.0** (tagged + pushed) | Me | `[x]` |
| 0.3 | Deploy to prod: `update.ps1 -Pull` (elevated shell on prod). Migrations auto-apply on startup: `AddEmailThrottle`, `AddMemberDocumentPages`, `AddEmailOutbox` + any others. **Do NOT run `reset-to-import.ps1`** (wipes the SMTP servers/settings added on prod) | You | `[~]` |
| 0.4 | Smoke-test prod: `/health` 200, login, a member detail, one report | You + Me | `[ ]` |

---

## Phase 1 — Email delivery  ⛔ #1 blocker
**Provider plan (decided):**
- **SMTP2GO** (free 1,000/mo, resets the 12th, DNS already verified) → **demandes**.
- **Mailgun Flex** (legacy PAYG active on the group account: 1,000 free/mo then ~$0.002/msg, un-throttled) + **SendPulse** (free 12k/mo but 50/hr) → **member activation + post-launch ops** (reset / relance / announcements).
- SendGrid dropped (free tier ended). Zoho = receiving only, never sends.

| # | Task | Owner | Status |
|---|------|-------|--------|
| 1.1 | Outbox per-provider send-rate throttle (so a big blast can't trip a free-tier limit) | Me | `[x]` |
| 1.2 | **DNS + verify each provider** on `gndj.org`: SMTP2GO ✓, SendPulse ✓, **Mailgun ✓ (`mg.gndj.org` subdomain)** — all three test green | You | `[x]` |
| 1.3a | Add SMTP server rows + test: **SMTP2GO ✓**, **SendPulse ✓** (set `Max emails / heure` = 45), **Mailgun ✓** (From = `no-reply@mg.gndj.org`; fix was resetting the SMTP credential password — a bad password dropped the connection, masking as a TLS error) | You | `[x]` |
| 1.3b | Bind templates: demandes→SMTP2GO; `account_activation` / `member_password_reset` / `document_reminder` / resets → Mailgun (or SendPulse) | You | `[ ]` |
| 1.4 | **Pilot send to the Maîtrise only** — confirm real inbox delivery (not spam) before any mass send | You | `[ ]` |
| 1.5 | **Clear `email.override_recipient`** (currently forces all mail to samer_cheaib@hotmail.com) — ONLY after 1.4 passes | You | `[ ]` |
| 1.6 | Watch the **File d'emails** page (`/admin/email-outbox`) for Failed rows during the first sends | You | `[ ]` |

---

## Phase 2 — Password & identity policy

| # | Task | Owner | Status |
|---|------|-------|--------|
| 2.1 | Forced first-login password set (`MustChangePassword` + blocking screen) | Me | `[x]` |
| 2.2 | Configurable password complexity (`security.password_*` settings + live checklist) | Me | `[x]` |
| 2.3 | CG manual email-verify (`/admin/demande-accounts`) — safety net when a verification email fails | Me | `[x]` |
| 2.4 | `require_email_verification` = ON for demandes (depends on Phase 1 working) | You | `[ ]` |
| 2.5 | Run `deploy/golive/force-password-reset.sql` on prod when activating accounts (flags ~2205 member logins; excludes super-admins) | You | `[ ]` |
| 2.6 | Login identity stays synthetic `prenom.nom@scouts.gndj` (decided — do not switch to real-email login) | — | `[x]` |

---

## Phase 3 — Activate accounts (roll out logins)

| # | Task | Owner | Status |
|---|------|-------|--------|
| 3.1 | "Envoyer les accès" tool (activation link, 30-day token) | Me | `[x]` |
| 3.2 | "Identifiant oublié ?" self-service recovery | Me | `[x]` |
| 3.3 | "Message aux chefs" leaders broadcast (`/admin/communications`) | Me | `[x]` |
| 3.4 | **Send access, Maîtrise first**, then unit by unit (verify a few land before going wider) | You | `[ ]` |
| 3.5 | Send the leader onboarding email (`cu_rentree` / `cu_rentree_nouveau`) | You | `[ ]` |

---

## Phase 4 — Open enrollment (parents)

| # | Task | Owner | Status |
|---|------|-------|--------|
| 4.1 | Two-phase demande window (`demande.enabled` + `demande.submissions_open`) | Me | `[x]` |
| 4.2 | Set `demande.scout_year` + per-unit quotas | You | `[ ]` |
| 4.3 | Update the T&C text (`demande.terms`) — a rentrée task blocks opening until done | You | `[ ]` |
| 4.4 | Open inscriptions (`demande.enabled` ON — CG can do it from the Rentrée checklist action) | You | `[ ]` |
| 4.5 | Generate the Rentrée checklist for the year (`/rentree`) | You | `[ ]` |

---

## Phase 5 — Ops safety net (before real traffic)

| # | Task | Owner | Status |
|---|------|-------|--------|
| 5.1 | Off-server backups + health monitoring scripts (`deploy/backup-db.ps1`, `healthcheck.ps1`, `install-ops-tasks.ps1`) | Me | `[x]` |
| 5.2 | Install the ops scheduled tasks on prod + fill `deploy/ops-alert.config.json` (rclone + SMTP) | You | `[ ]` |
| 5.3 | Set `error.notify_email` (or `ErrorAlerts:Smtp` ops-SMTP in appsettings) so you get error alerts | You | `[ ]` |
| 5.4 | Prod DB pool: `Maximum Pool Size=150;Minimum Pool Size=5` + Postgres `max_connections≥200` | You | `[ ]` |
| 5.5 | `pg-profile.ps1 -Profile High` for the Sept–Oct enrollment load | You | `[ ]` |
| 5.6 | Rotate the **JWT secret** in `appsettings.Production.json` (startup now refuses the placeholder) | You | `[ ]` |

---

## Session build log (features ready for launch, DEV until the Phase-0 deploy)
- **Outbox send-rate throttle** — per-SMTP `Max emails / heure`; set SendPulse 45.
- **Relance documents** (CG) — one-click-per-unit reminder emails for incomplete dossiers (missing / à corriger / à renouveler) + individual send + a rentrée checklist task.
- Multi-page documents, CG-can-reach-any-member, terms gate, manual verify, forced first-login password, configurable password policy, Communications tool, email outbox admin page, error handling + alerts, maintenance kill-switches. (All detailed in `CLAUDE.md`.)

## Open decisions / notes
- **Which member-facing provider carries which template** (Mailgun vs SendPulse per-template binding) — finalize at 1.3.
- **69 active members have no email on file** (Clan 12, big Troupes 9 each) — they can't be activated/relanced by email; hand out the temp password on screen (the reset dialog always shows it). Optional pre-launch data-collection pass.
- Full email/go-live context lives in memory `project_email_golive.md`; deploy mechanics in `docs/DEPLOYMENT.md`.
