# Email, notifications & app

Email outbox/providers/templates, communications, in-app notifications, push, PWA, contact inbox.

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

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

### Email provider plan + outbox send-rate throttle (2026-08-15)
Planning for go-live email + a throttle so a big blast can't trip a provider's free-tier rate limit.
- **Active-member email volume (dev = prod-like):** **1,077 active members** (69 chefs / 1,008 youth), **not**
  the ~2,200 total (rest are alumni). **1,008 reachable** by ≥1 email; **69 have NO email** (biggest gaps: Clan
  12/50, both big Troupes 9 each — those get the on-screen temp password instead). Activation = **~1,008 emails**
  (one per member via the contact resolver); all-addresses fan-out = 2,194 (1,634 distinct). Maîtrise counted on
  their PERSONAL email only (guardians excluded). Per-unit query lives in the session; biggest units ~80–85.
- **Provider routing (decided):** **SMTP2GO** (free 1,000/mo, resets the 12th) → **demandes** (Sept ~350 confirms +
  Oct ~700 responses fit, each in its own cycle). **Mailgun Flex** (legacy PAYG still active on the group account:
  1,000 free/mo then $0.002/msg, un-throttled, resets 12th) + **SendPulse** (free 12k/mo but **50/hr**) → member
  activation + post-launch ops (reset/warnings/announcements). Mailgun Flex is the smoothest vehicle for the
  one-time ~1,008 activation blast (~$0.02, no throttle). SendGrid dropped (free tier ended). NOTE: **DNS must
  authorize each provider** before use — `gndj.org` SPF currently = Mailjet+Zoho, DKIM → SendGrid; add each
  chosen provider's SPF include + DKIM first. See [[project-email-golive]].
- [x] **Per-provider send-rate throttle on the outbox.** New nullable **`SmtpServer.MaxPerHour`** (null =
      unlimited, unchanged) + **`OutboxEmail.SmtpServerId`** (stamped at send; migration `AddEmailThrottle`, +
      index). **`IEmailService.ResolveRouteAsync`** exposes which server + cap a template routes to WITHOUT
      sending, so `OutboxSenderBackgroundService` can rate-limit before dispatch. Model = **rolling-hour count**
      re-derived from the durable table each sweep (no in-memory cursor to drift/run-away; survives restarts for
      free): a capped server dispatches while its rows Sent in the last hour < cap; at the cap, further rows defer
      to when the window frees (oldest in-window send + 1h), staggered one interval (3600/cap) apart → guarantees
      ≤ cap sends in any rolling hour. Un-throttled servers keep the parallel fast path. So the whole activation
      blast can be enqueued at once and trickles out cleanly — **no Failed pile-up, no babysitting**. SMTP server
      form gained a **"Max emails / heure"** field (+ Limite/h column); set SendPulse free to ~45. NOTE: an
      earlier smooth min-interval-cursor design was tried and REJECTED — the in-memory cursor ran ahead of the
      pre-assigned slots so matured rows got re-deferred (verified failing); the rolling-count model has no such
      state. Verified live (cap=3, 6 rows → exactly 3 dispatched, 3 deferred ~1h staggered 20 min apart, stamped,
      no burst). Build + 4 tests + tsc + eslint clean. DEV until deploy (migration applies on prod startup).

### Email "mode test" guardrail (2026-08-20)
- [x] **Bulk email-send pages now warn when delivery is in test mode.** `email.override_recipient` (when set)
      makes `EmailService` REDIRECT every outgoing email to one test address — so a mass send *looks* successful
      (counts + "envoyé") but no real recipient gets anything. This silently swallows leader activation links
      (Envoyer les accès), the chefs broadcast (Message aux chefs), and document reminders (Relance documents). New
      shared `<EmailDeliveryWarning>` (reads `email.override_recipient` via the auth-only `GET /settings/{key}`, so a
      CG can see it; the test address itself is not shown) renders a prominent amber banner on those three pages when
      the override is set. Frontend-only, DEV until deploy — **NOT on the prod build deployed this afternoon**, so
      the immediate launch protection is still a pilot send (see below).

### Onboarding email carries the activation link — one email (2026-08-20)
- [x] **The rentrée onboarding email now contains the set-password link** (no separate "Envoyer les accès" pass).
      `SendLeaderMessageCommandHandler` (Message aux chefs): if the chosen template's body/subject contains
      `{{activationLink}}`, it stamps a set-password token per recipient (reusing the reset-token fields, configurable
      `member.activation_link_days` expiry, default 30) and provides `{{username}}`/`{{activationLink}}`/`{{expiryDays}}`
      — mirroring SendAccess. Tokens saved BEFORE enqueue; a recipient with no active login account is reported as
      `NoAccount` (can't get a link). A plain announcement template (no `{{activationLink}}`) behaves as before (no
      tokens, sent to anyone with an email). `SendLeaderMessageResult` gained `NoAccount`/`NoAccountNames` (surfaced
      in the toast). Both seeded templates `cu_rentree` + `cu_rentree_nouveau` now embed a "Votre accès" block
      ({{username}} + "Activer mon compte" {{activationLink}} valid {{expiryDays}} jours); `SeedMemberEmailTemplatesAsync`
      also **upgrades existing DBs in place** (guarded on the old seeded signature "identifiant habituel" /
      "qui vous a été communiqué", so a CG-customized body is left alone; idempotent). Frontend `general` module
      variable list gained the onboarding + activation vars so a CG can insert them.
- **Future (next year):** returning chefs are already members with accounts — no activation needed. The mechanism
      is template-driven, so next year just **remove the `{{activationLink}}` block from `cu_rentree`** → it becomes
      instructions-only (no token stamped), while `cu_rentree_nouveau` (genuinely new chefs) keeps the link. No code
      change. Documented in `docs/emails/cu_onboarding.md`. Verified live: send to an account+email leader stamped a
      token (expiry = today+30) + queued a `cu_rentree_nouveau` outbox row; a no-email leader reported, no delivery
      (dev SMTP off). Backend+frontend, DEV until deploy (seeder upgrade applies on prod startup).

### "Message aux chefs" (Communications) page redesign (2026-08-21)
- [x] **Clearer audience + send-up + preview + a latent CG 403 fix.** The page mixed a unit dropdown + a
      "nouveaux chefs" toggle + per-member checkboxes with no hierarchy, the send button sat below a long table,
      and there was no way to see the email. Reworked: **audience = segmented "Toutes les maîtrises / Une unité"**
      (unit picker only for "Une unité") **+ a Switch "Nouveaux chefs uniquement"** (never-logged-in, combines with
      the audience) **+ checkboxes to fine-tune** (with a caption); the **Envoyer bar moved to the top** (above the
      list, with a live "à N chef(s) de <audience>" summary); a **live preview** (subject + body rendered via
      RichContent, `{{variables}}` filled with sample values, only shown once a template is picked) + an activation-
      link note when the body has `{{activationLink}}` + a "Modifier le modèle" link (super-admin only).
- [x] **Fixed: a real CG saw NO templates.** The page listed templates via `useEmailTemplates` (`GET /email/templates`,
      **associations.manage** = super-admin only) → a CG (maitrise.manage) got 403 and an empty dropdown. New
      CG-accessible **`GET /communications/templates`** (`GetLeaderMessageTemplatesQuery`, IsGroupManager gate,
      returns active templates' id/name/code/subject/body/variables — read-only; editing stays super-admin) +
      `useLeaderMessageTemplates`. `useLeaderRecipients` gained an `enabled` flag (holds the fetch on "Une unité"
      until a unit is chosen). Verified: endpoint returns 15 active templates. Build clean (dotnet + tsc + eslint +
      vite). DEV until deploy.
- **NOT done (offered):** true per-send content editing (one-off tweak of subject/body before sending) — the email
      pipeline is fully template-code-driven (EmailJob/outbox store only the template code + variables; EmailService
      renders from the saved template), so an override needs new nullable outbox columns (migration) + an
      EmailService override path. Deferred; "adjust" today = edit the saved template (super-admin) or preview then send.

### Envoyer les accès — "Tous les membres (hors maîtrise)" scope (2026-09-10)
Added a whole-group scope to "Envoyer les accès": send the access/re-inscription email in one go to EVERY active
member EXCEPT the maîtrise (leaders get the onboarding via "Emails aux chefs"). On main; DEV until deploy; tested live.
- **Backend:** `SendAccessEmailsCommand` + `GetAccessCandidatesQuery` gained `AllNonMaitrise`. Shared
      `AccessTargets.ActiveNonMaitriseMemberIdsAsync` = distinct members with an **active** assignment
      (`EndDate == null`, not deleted) MINUS anyone holding an **active `FunctionalRole.IsMaitrise`** role (a
      youth-in-one-unit + leader-in-another is excluded). **Group-manager only** (`MemberAccess.IsGroupManager`) —
      it spans all units, so a plain CU is refused; the member projection also drops soft-deleted members, so it's
      strictly active members. Controller `?allNonMaitrise=` + `SendAccessRequest.AllNonMaitrise`.
- **Frontend** (`send-access.tsx`): a "Tous les membres (hors maîtrise)" entry at the top of the unit `Select`
      (shown only to a manager via `useIsManager`); when chosen, the candidates list + send target the group-wide
      non-maîtrise set (send passes `allNonMaitrise:true` when no rows are individually checked). The
      "seulement jamais connectés" toggle still applies.
- **Tested live** (super-admin, dev): candidates `allNonMaitrise` = **1001**, which EXACTLY equals SQL
      active(1069) − maîtrise(68); spot-checks — CG Giorgio RIZK excluded, youth Maria ABBOUD included, **0 alumni**
      and **0 maîtrise** among the 1001. Real smtp4dev delivery of `reinscription_access` to one member rendered all
      dynamic dates + the male-before-female CG signature + the activation link. The allNonMaitrise SEND branch
      returned **sent=955** (= eligible with account+email) + 44 no-account + 2 no-email = 1001; a chef d'unité is
      **blocked 400 "Accès réservé au chef de groupe"** on both the candidates + send while their own unit still
      returns 200. Test artifacts (tokens, outbox rows, settings) cleaned up. Builds clean (dotnet 0/0 + tsc +
      eslint + vite).

### In-app notifications (bell) + demande "Remettre à étudier" (2026-09-12)
Two items. All on main, DEV until deploy; verified live end-to-end.
- **Demande reset (urgent fix):** a CG could accept/refuse a demande by mistake but the review UI only offered
  Accepter/Refuser. `DecideDemandeCommand` ALREADY accepts `Status="Submitted"` (clears the unit; if sent-but-not-
  converted, re-queues), so this was frontend-only: a **↺ "Remettre à étudier"** action on the review row + the
  detail drawer footer (`resetTarget` → decide with Submitted), shown when the demande is decided (Approved/Declined)
  and not converted (`createdMemberId` null). Converted demandes stay locked.
- **In-app notifications — the app's own alerting, independent of email** (the fragile-delivery de-risk):
  - **Model:** `Notification` entity (plain table, NOT a BaseEntity — no audit/soft-delete; `CreatedAt` = real UTC
    instant). Recipient keyed by **`MemberId`** (every acting user is a member; "my notifications" = MemberId ==
    current user's). Title/Body/LinkUrl **denormalized** at creation (rendering never depends on the source row).
    Migration `AddNotifications` (index `(member_id, is_read, created_at desc)`).
  - **`INotificationService`** (Infrastructure `NotificationService`, **singleton** — owns its own scope, **never
    throws**, runs after the triggering commit; mirrors `IErrorNotifier`): `NotifyMemberAsync` / `NotifyMembersAsync`
    / `NotifyGroupManagersAsync` (super-admins + active group-level role holders) / `NotifyMemberLeadersAsync`
    (members.edit holders in the member's active units + group managers, minus the member themselves).
  - **Triggers wired:** document reviewed (approved/rejected → the member, "/my-documents"); change-request reviewed
    (accepted/refused → the member, "/my-profile"); change-request created (progression + assignment → the member's
    leaders + CG, "/change-requests"); demande submitted (first submission → group managers, "/admin/demandes"); a
    member put on-hold (`DocumentCampaignActions.RunApplyHoldAsync` inserts a `Notification` row inline in the same
    transaction → the member, "/my-documents").
  - **API** (`NotificationsController`, auth-only, recipient resolved server-side — no IDOR, no permission): `GET
    /notifications` (paged, newest first) · `GET /notifications/unread-count` · `POST /notifications/{id}/read`
    (idempotent, foreign id = no-op) · `POST /notifications/read-all` (ExecuteUpdate). `GetNotificationsQuery` /
    `GetUnreadNotificationCountQuery` / `MarkNotificationReadCommand` / `MarkAllNotificationsReadCommand`.
  - **Frontend:** `notification-service.ts` (unread-count polled 60s; list fetched only while the dropdown is open;
    mark-read/all invalidate `['notifications']`) + `NotificationBell` (header, before UserMenu — shown to ALL roles
    since the top bar renders for everyone): a bell + red unread badge → a DropdownMenu list (icon+colour per type,
    unread = bold + primary tint + dot, French time-ago, click → navigate to `linkUrl` + mark read) + "Tout marquer
    comme lu" + empty state.
  - **Verified live:** approving a real pending document wrote the member's "Document accepté" row (then reverted);
    seed→list→mark-read→count 0→read-all round-trip via the API; table columns correct. Build clean (dotnet 0/0,
    tsc + eslint + vite). Migration applies on prod startup.
  - **Delete added (2026-09-13):** notifications could only be marked read, not removed. Added `DeleteNotificationCommand`
    (hard delete — Notification is not a BaseEntity — scoped to the caller's member id, idempotent) +
    `ClearReadNotificationsCommand` (ExecuteDelete all the caller's READ ones); endpoints `DELETE /notifications/{id}`
    + `DELETE /notifications/read` (declared BEFORE `{id:guid}` so "read" isn't parsed as a guid). Bell UI: a per-item
    ✕ (hover/focus-revealed) + an "Effacer les lues" header action next to "Tout marquer comme lu"; the item row was
    restructured from a single `<button>` to a `div` (clickable region button + ✕ button sibling — no nested buttons).
    `useDeleteNotification` / `useClearReadNotifications`. Verified live: delete-one 204, read-all 200, clear-read
    deleted 1, list then empty. DEV until deploy.

### Contact-form inbox — view + reply in-app (2026-09-13)
The public contact form (`POST /public/contact`) previously ONLY queued a notification email (sender's address
buried in the body) — no way to browse/reply. Added a persisted in-app inbox. All on main, DEV until deploy;
verified live end-to-end.
- **Entity `ContactMessage : BaseEntity`** (migration `AddContactMessages`; `contact_messages` table, index
  `(is_read, created_at)`): sender name/email/subject/message + IsRead/ReadAt + reply tracking (RepliedAt/
  ReplySubject/ReplyBody/RepliedByUserId). `SendContactMessageCommandHandler` now **persists first** (never lost
  even if SMTP is off), **notifies group managers in-app** (`INotificationService.NotifyGroupManagersAsync` →
  bell, link `/admin/contact-messages`), THEN sends the legacy `contact_form` email as before (nothing changes for
  those relying on it).
- **`ContactMessageHandlers.cs`** (all gated at the controller by **`content.manage`** = super-admin / assoc-admin /
  CG / ACG — same permission as the public-site CMS): `GetContactMessagesQuery` (paged, unread-first then newest,
  accent-insensitive search across name/email/subject/message via `DbFns.Unaccent` — GOTCHA: keep the search term a
  plain lowercased string and wrap BOTH sides in `DbFns.Unaccent` INSIDE the LINQ expression; calling it on a C#
  variable throws the DB-only stub — hit + fixed live), `GetUnreadContactMessageCountQuery` (sidebar badge),
  `MarkContactMessageReadCommand` (read/unread), `ReplyContactMessageCommand` (queues a "Re:" email to the sender
  via the seeded `adhoc_message` template through the durable outbox, stamps the reply + marks read),
  `DeleteContactMessageCommand` (soft). `ContactMessagesController` (`api/v1/contact-messages`).
- **Frontend:** `contact-message-service.ts` (list/unread-count[polled 60s]/mark-read/reply/delete) + page
  `/admin/contact-messages` "Messages de contact" (`pages/admin/contact-messages.tsx`, lazy, content.manage route):
  search + "Non lus uniquement" toggle + unread pill; message rows (unread = bold + primary tint + Mail icon,
  "Répondu" chip); click → detail Dialog (full message, mailto sender, previous reply, reply composer defaulting
  subject to "Re: …", mark-unread, delete via ConfirmDialog) + pagination. Shows `<EmailDeliveryWarning>` (reply
  goes out as email). Sidebar entry in the **Site public** group with an unread badge (wired into BOTH `NavContent`
  groupPending/renderLink AND `AdminNav` badgeFor).
- Verified live: public submit → persisted + unread=1 + group-manager notification + `contact_form` email; list/
  unread/search (accent-insensitive: "kuhkh" → 1); reply → 204 + `adhoc_message` outbox row to the sender; delete →
  204; unauthenticated → 401. Build clean (dotnet 0/0 + tsc + eslint + vite). Migration applies on prod startup.
- **Notify-on-reply (2026-09-13):** when a manager replies from the inbox, the OTHER managers get an in-app
  notification "<Replier> a répondu à <sender>" (so two people don't answer the same message); the replier is
  excluded. Added an optional `excludeMemberId` to `INotificationService.NotifyGroupManagersAsync` (placed before
  `ct`, so the 2 existing positional callers now pass `ct:` named). `ReplyContactMessageCommandHandler` looks up the
  replier's member name and calls it after the commit (best-effort). The reply itself was ALREADY saved on the
  `ContactMessage` (ReplySubject/ReplyBody/RepliedAt/RepliedByUserId) and shown in the detail dialog — a second
  reply overwrites the stored one (single-reply model; no thread). Verified live: 13 managers → 12 notified, replier
  (admin) 0, body "Admin Système a répondu à Test Reply Notif". Backend-only, DEV until deploy.

### QOL batch: contact-message claim + notification preferences (2026-09-13)
Items 5–6 of the QOL list. DEV until deploy (2 migrations apply on prod startup).
- **Contact-message claim** ("En cours de traitement par X"): `ContactMessage` gained `ClaimedByUserId`/
  `ClaimedByName`(denormalized)/`ClaimedAt` (migration `AddContactMessageClaim`). `ClaimContactMessageCommand(Id,
  Claim)` + `POST /contact-messages/{id}/claim` (content.manage): claim assigns to the caller (resolves their
  member name), release clears. DTO carries the claim fields. Inbox UI: an amber "En cours de traitement par …"
  chip on the row + a banner in the detail (with **Libérer**), and a **"Je m'en occupe"** footer button when
  unclaimed. Verified live: claim 204 → claimedByName="Admin Système" → release 204.
- **Notification preferences (mute categories)**: `Member.NotificationMutesJson` (JSON array of muted type
  strings; migration `AddMemberNotificationMutes`). `NotificationPrefs.MutedTypesAsync` filters the bell list +
  unread count (`.Where(n => !muted.Contains(n.Type))`). `GetNotificationPreferencesQuery` +
  `UpdateNotificationPreferencesCommand` (validates against the known category set) + `GET|PUT
  /notifications/preferences` (auth-only, own). Bell dropdown got a ⚙ opening a `NotificationPreferencesDialog`
  (checkbox per category = receive; unchecked = muted). Verified live: default [] → PUT ["info","hold"] persisted
  → reset []. dotnet + tsc + eslint + vite clean.

### SMTP passwords externalized to config (2026-09-20, DEV until deploy)
Closed the `project_smtp_credentials` item. SMTP provider passwords were stored **plaintext** in `smtp_servers.password`
— never exposed via the API (`SmtpServerDto` omits it, update keeps the stored value when blank), BUT the nightly
`pg_dump` carries it, and those dumps rclone off-server → the provider creds sat in cloud backups. Now the app prefers
the password from **config** so it can live in `appsettings.Production.json` (gitignored, server-only, never dumped),
mirroring how `ErrorAlerts:Smtp` is already handled.
- **`Application/Common/SmtpPassword.Resolve(config, name, host, dbPassword)`** — looks up `Smtp:Passwords:<key>` where
  the key matches the SMTP server's **Name OR Host** (case- + whitespace-insensitive); a matching non-empty config value
  WINS, else falls back to the DB value (backward compatible — nothing breaks until config is set, existing rows keep
  working). Used by BOTH the real send (`EmailService.ResolveTemplateAsync`) and the admin **Test** button
  (`TestSmtpCommandHandler`, now injects `IConfiguration`).
- Config shape (documented in base `appsettings.json`, empty `Passwords:{}` = safe no-op → DB fallback):
  `"Smtp": { "Passwords": { "SMTP2GO": "…", "SendPulse": "…", "Mailgun": "…" } }`.
- Added `Microsoft.Extensions.Configuration.Abstractions` (10.0.0) to `GNDJ.Application.csproj` (it only had it
  transitively-absent; `IConfiguration` didn't resolve there).
- **PROD rollout (manual, after deploy):** add the three passwords to `appsettings.Production.json` under
  `Smtp:Passwords` (keyed by each server's Name/Host), recycle the pool, verify a Test send, THEN purge the DB column:
  `UPDATE smtp_servers SET password='';` (the admin UI can't blank it — update keeps the stored value when the field is
  empty). After that the secret is only in the gitignored server file, not the DB or backups. Build 0/0, 102 tests pass.

### PWA — installable app + "installée (détectée)" tracking (2026-09-20, DEV until deploy)
Made the app an installable PWA + a best-effort per-member install flag. Chosen because browsers give NO reliable
installed/not-installed registry: we can only detect a STANDALONE launch (works iOS + Android) or the
`appinstalled` event (Android/desktop) — there's no "who didn't install" signal, and installs aren't visible
across devices. Icons generated with PIL (navy gradient + white compass, no SVG rasterizer available).
- **Installable:** `public/manifest.webmanifest` (name/icons 192+512+maskable/standalone/theme #1c2b4a) +
  `public/sw.js` (minimal network-passthrough service worker — required for installability, NO caching, this is a
  live app) + `public/icons/*` + `public/apple-touch-icon.png` + `index.html` (manifest/apple-touch/apple-mobile
  meta + `viewport-fit=cover`). CSP already allows it (`default-src 'self'` covers manifest/worker; all
  same-origin). `lib/pwa.ts` (`initPwa` in main.tsx) captures `beforeinstallprompt`, registers the SW (PROD only),
  and reports on `appinstalled` + standalone launch.
- **Discovery (3 paths, all device/browser-aware via `getInstallGuide()` in lib/pwa.ts + `useInstallGuide` hook):**
  (1) a dismissible **`PwaInstallBanner`** (bottom, mounted in AppLayout) shown to non-installed users — native
  "Installer" button on Android/desktop, "Voir comment" → instructions dialog on iOS; dismissal remembered per
  device (`bannerDismissed`/`dismissBanner`, re-shows after 14 days). (2) an **install slide** in the member
  welcome tour (`member-welcome-tour.tsx`, INSTALL_STEP, only when supported + not standalone). (3) the
  **`PwaInstallMenuItem`** in the account menu. `getInstallGuide()` returns tailored steps per platform: iOS Safari
  (Partager → Sur l'écran d'accueil), iOS non-Safari (open in Safari first), Android Chrome/Samsung/Firefox,
  desktop Chrome/Edge (address-bar icon) — else `supported:false` (Firefox/Safari desktop) → nothing offered.
  Shared `PwaInstallGuide` component renders the steps + a native button when `canPrompt`.
- **Tracking:** `Member.AppInstalledAt` (migration `AddMemberAppInstalled`). `POST /my-profile/app-installed`
  (`MarkAppInstalledCommand`, auth-only, own member resolved server-side, idempotent — sets once) called by
  `AppLayout` on a standalone launch (skipped while impersonating) + on `appinstalled`. Surfaced to the CG:
  `MemberDetailDto.AppInstalledAt` → a panel badge ("App installée (détectée le …)" / "App non détectée", only for
  account holders), and a members-list **filter** `?appInstalled=true|false` (GetMembersQuery + the "App : tous /
  installée / non détectée" dropdown) so the CG pulls the two lists + counts. NO list column (keeps the dense list
  clean; the range indicator gives the count).
- **Verified live** (temp passwords, restored): member POST → 204 + flag set; 2nd POST idempotent; filter
  `appInstalled=true` → the flagged member; detail returns the date; dev restored (flag + hashes). The browser bits
  (`beforeinstallprompt`/`appinstalled`/standalone detection + the install button) need a real device to see —
  backend + build verified. Migration applies on prod startup. See [[project-pwa-install]].
- **"Already installed" detection from a browser tab (2026-09-20, frontend-only, DEV until deploy):** a plain tab
  can't see `isStandalone()` (that only fires when opened FROM the installed icon), so the install UI used to keep
  offering install to someone who already had the app. Added `navigator.getInstalledRelatedApps()` as an EXTRA
  best-effort signal — manifest now lists the PWA itself under `related_applications` (`{platform:"webapp", url:
  "https://gndj.org/manifest.webmanifest"}`) + `prefer_related_applications:false`, and `lib/pwa.ts`
  `checkInstalledRelatedApps()` (run in `initPwa`) sets `relatedAppInstalled` on a `webapp` hit → `notify()`
  re-renders the install UI + flags the member via `reportPwaInstall()`. New `isInstalled()` = `isStandalone() ||
  relatedAppInstalled`; `InstallGuide` gained `installed` (via a `buildInstallGuide()` wrapper) and the banner/card/
  menu/tour now hide on `guide.installed` instead of `isStandalone()`. **Chromium-only** (Android + desktop
  Chrome/Edge); a NO-OP on iOS/Safari/Firefox and on non-matching origins (dev localhost, new.gndj.org) — never a
  reliable negative, only an extra positive. `appinstalled` also sets `relatedAppInstalled` now. tsc+eslint+vite clean.

### Push notifications (Web Push) — targeted + auto, durable outbox (2026-09-20, DEV until deploy)
The *point* of the PWA: notify members on their devices even when the app is closed. Built on the durable-outbox
pattern (like email). **PILOT: gated to the maîtrise** (`usePwaEnabled` = `!useIsRegularMember`) — flip that hook
to roll out to everyone. Migration `AddPushNotifications` applies on prod startup.
- **Platform reality:** works on Android/desktop (Chrome/Edge/Firefox), and on **iOS 16.4+ ONLY for the installed
  PWA** opened from the home screen (Safari tabs can't receive push) — which is *why* the install work matters.
  Requires HTTPS + the user granting Notification permission. Needs **VAPID keys** (dev keys in `appsettings.json`
  `WebPush:*`; PROD MUST override with its own pair in `appsettings.Production.json` — `npx web-push
  generate-vapid-keys`; never change once members subscribe).
- **Infra (mirrors the email outbox):** `PushSubscription` (one row per device, unique Endpoint, upsert-by-endpoint
  so a shared browser re-owns) + `PushOutbox` (Pending→Sent/Failed, backoff retry) entities + configs + DbSets.
  `IPushQueue`/`PushOutboxQueue` (singleton, durable enqueue + signal), `IPushSignal`/`PushSignal`,
  `IWebPushSender`/`WebPushSender` (WebPush NuGet + VAPID; 404/410 → prune the dead subscription),
  `PushSenderBackgroundService` (leases due rows, fans out to the member's subs, records outcome). Registered in
  DI + Program.cs. **`WebPush 1.0.12` pulls a vulnerable `Newtonsoft.Json 10.0.3` (GHSA-5crp-9r3c-p9vr) → pinned
  13.0.4 directly in Infrastructure to override it.**
- **Auto-push:** `NotificationService` now injects `IPushQueue` and enqueues a push per member AFTER writing each
  in-app notification row (all paths: NotifyMember(s)/GroupManagers/MemberLeaders). So every existing notification
  (doc decision, change-request, demande, on-hold…) also pushes. Best-effort (never masks the in-app row).
- **Targeted send (CG):** `SendPushNotificationCommand` (`POST /notifications/send`, maitrise.manage +
  IsGroupManager) → recipients = UNION of explicit memberIds ∪ a unit's active members ∪ a member-group roster →
  `NotifyMembers` (writes rows + pushes). Page `/admin/send-notification` "Envoyer une notification" (audience
  toggle unité/groupe/membres + title/body/link), sidebar "Envoyer une notification" (Unités & maîtrise,
  maitrise.manage).
- **Client:** SW `push` + `notificationclick` handlers (public/sw.js; SW now registered in dev too — no caching);
  `lib/push.ts` (subscribe/unsubscribe via `pushManager` + `POST /my-profile/push/subscribe|unsubscribe`, VAPID key
  from `GET /my-profile/push/vapid-key`); `PushToggleMenuItem` ("Activer/Désactiver les notifications") in the
  account menu. `SubscribePushCommand`/`UnsubscribePushCommand` (auth-only, own member, upsert by endpoint).
- **Verified live** (temp passwords, restored): vapid-key returns the key+enabled; subscribe→204+row; targeted
  send→count 1 + in-app notification row + push_outbox row that the sender picked up and attempted (failed only
  because the endpoint was FAKE — a real browser subscription delivers). Build 0/0 + tsc/eslint/vite clean.
- **PENDING = real-device test** (only a real browser/phone can complete the subscribe→deliver loop). PROD: set
  `WebPush:*` VAPID keys in appsettings.Production.json before go-live. See [[project-pwa-install]].

### Installed-app back button (2026-09-25, DEV until deploy)
In the installed PWA the phone's back button walked through EVERY screen visited (each menu tap pushed a history
entry; the app also opened on the public home page), so it never seemed to close.
- `manifest.webmanifest` `start_url` "/" → **"/dashboard"** (signed out → login, which then REPLACES itself).
- Sign-in / sign-out / account switch / applicant login-register-invitation now `navigate(..., { replace: true })`.
- `hooks/use-menu-replace.ts` (installed app only, `isStandalone()`): **`useMenuClick`** — a menu tap made away from
  the dashboard REPLACES the current entry (decided at tap time, so fast taps can't use a stale choice), keeping the
  history at [dashboard, section]; **`useGoHomeClick`** + `components/layout/home-link.tsx` (logo / "Accueil" /
  "Mon unité") step BACK to the dashboard at the bottom of the history (tracked by `rememberRootEntry` in AppLayout)
  instead of stacking a second copy. Drill-downs inside a section still push. Browser tabs unchanged.
- Verified in Edge with standalone emulated: 9/9 (3 menu taps → idx 1, back → dashboard idx 0, logo → idx 0,
  browser keeps normal history).
- **Member file on a phone (same day):** `hooks/use-mobile-detail.ts` (`useMobileDetail`) — on a small screen
  (< md) opening a member adds ONE history step (same URL, `mobileDetail` marker in the router state), so the phone's
  back button closes the member and returns to the list; the on-screen "Retour" arrow goes through the same step.
  Used by the Membres page and "Mon unité" (CU). Desktop (side-by-side) adds nothing. Verified 9/9 (phone CU +
  Membres, desktop unchanged).

### Email templates cleanup + new-chef welcome (2026-09-26, DEV until deploy)
Every member got their access in 2026, and new chefs are existing members, so the activation-link mass sends are retired.
- **Removed the bulk "Envoyer les accès"** (page `send-access.tsx`, `GetAccessCandidatesQuery`, unit / all-members modes,
  template choice). `SendAccessEmailsCommand(MemberIds)` now only sends `account_activation` to one or a few members
  (member file → Actions → Envoyer l'accès; `CanAccessMemberAsync` per member) — used for a member accepted without a
  demande (created by hand) or a lost email. "Communications & accès" → **"Emails aux chefs"** (same path
  `/admin/communications-acces`, now maitrise.manage); the "Nouveaux chefs uniquement" (never logged in) switch removed.
  Rentrée task "Relancer les accès non activés" + action `goto-send-access` removed.
- **"Bienvenue dans la maîtrise"** (`leader_welcome`, automatic): `Member.LeaderWelcomeSentAt` (migration
  `AddMemberLeaderWelcome`, back-filled for everyone who ever held an IsMaitrise role) + `LeaderWelcome.RunAsync` run
  hourly by `LeaderWelcomeBackgroundService` (job "Bienvenue aux nouveaux chefs"): a member with an active maîtrise
  assignment and no marker gets the email once (most senior post → roleName/unitName, + loginUrl/aideUrl/rentreeUrl);
  marker + outbox row in one save; stamped even when skipped (no email / template inactive). Periodic on purpose: a
  leadership role can be given from many places. Turn it off by deactivating the template.
- **Patch 029**: soft-deletes `reinscription_access` + `cu_rentree_nouveau`; strips the "Votre accès" activation block
  from `cu_rentree` (renamed "Rentrée — chefs", other CG edits kept); `reinscription_returning` → "Mise à jour de la
  fiche et des documents (membres)" (no username line), sent from Groupes → Envoyer un message.
- **Group send**: a saved template now goes out one email PER MEMBER (siblings sharing a parent email each get theirs);
  free text still one per address. Adds `loginUrl` + `scoutYear` variables.
- **Templates page grouped by category** (`lib/email-template-catalog.ts`: category + Automatique/Envoi manuel + when it
  is sent; unknown codes → "Autres"). Keep the catalog in sync when adding a template.

### New app icon — group logo colours (2026-09-27, DEV until deploy)
- One design (compass "médaillon": violet-blue compass on a white disc, orange north, light-blue diagonals, beige
  woggle knot in the centre — colours from the group's foulard logo) generated by **`tools/app-icon/build.mjs`**
  (renders the SVG with headless Edge via tests/e2e's playwright-core) into `client/public`: `favicon.svg`,
  `icons/app-192.png` + `app-512.png` (rounded tile), `icons/app-maskable-512.png` (full-bleed, 82 % safe zone),
  `apple-touch-icon.png` (180, full-bleed), and `icons/badge-96.png` — a WHITE silhouette on transparent for the
  Android notification badge (sw.js used the full-colour icon, which Android shows as a white square).
- Old `icons/icon-*.png` / `maskable-512.png` deleted; manifest, sw.js (gndj-v3) and index.html (`?v=3`) point at
  the new names — icons are cached by URL (browser, phone, Cloudflare 4 h), so a design change = new file names.
  Manifest `background_color` (install splash) → `#241b82`. The in-app brand mark (lucide Compass tile) is unchanged.

### Email templates opened to the Chef de Groupe (2026-10-04, DEV until deploy)
- `SettingsAccess.CanEditEmailTemplates` = admin OR maitrise.manage. Template list / read / update + the template
  check (`/system/email-templates-check`) use it (handler checks; the controller attributes were removed on those 3).
  A non-admin's update keeps the stored Code, Module and SmtpServerId (text, name, attachments, active flag only).
  Create / delete / SMTP servers / outbox stay associations.manage.
- Frontend: Paramètres tab "Modèles d'email" gated maitrise.manage; the page hides Nouveau/Supprimer for a CG, code +
  module read-only, SMTP shown as the bound server name (no SMTP list fetch). "Emails aux chefs" shows the "Modifier
  le texte du modèle" link to the CG. Live-tested: CG list/read/update 200 (code/module/SMTP unchanged), create/delete/
  SMTP 403, CU 403.


### 2026-10-10 — Year variables in every email template
- `EmailService.WithYearVariablesAsync`: when a template uses them, fills {{scoutYear}} (2026-2027),
  {{previousScoutYear}}, {{nextScoutYear}}, {{year}} (first year) and `ReplaceVariables` resolves {{year+N}} /
  {{year-N}}. Base = the sender's `scoutYear` variable (the demande send passes its campaign year), else
  `demande.scout_year` for `demande*` templates (the campaign is for NEXT year) or `passage.scout_year`.
  Composer lists them under the demande variables. Reason: the refusal letter had 2025-2026 / 2026-2027 / 2027 /
  2028 typed in. Reminder: an unknown {{x}} is NOT removed — it reaches the family as literal text.
- Système → configuration check (`ConfigurationChecks.EmailTemplatesAsync`) accepts the year variables for every
  template and `{{year±N}}` as a well-formed placeholder (it flagged the new refusal letter as an error — caught
  by the smoke suite before deploy).

### 2026-10-10 — Email template « Aperçu »
- `POST /email/templates/preview` (`Email/EmailTemplatePreview.cs`, CG/admin via `SettingsAccess.CanEditEmailTemplates`):
  renders the posted (unsaved) subject/body through `IEmailService.RenderAsync` — the same year variables +
  HTML-encoding as a real send — with example values for each DECLARED variable (fictitious Khoury family; unknown
  ones = « [label] »; year keys left to the server) and returns the leftover `{{…}}` (= would reach the recipient).
- Client: eye button per template + « Aperçu » in the editor (`components/admin/email-preview-dialog.tsx`, white
  card via RichContent/DOMPurify). The variable chips/insert menu now use the template's own declared list (+ the
  year variables) instead of the whole module's list — inserting another email's variable left raw {{…}}.
- Run over all 26 templates on prod data: 0 leftovers.
