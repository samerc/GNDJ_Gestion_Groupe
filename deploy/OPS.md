# GNDJ — Operations: off-server backups + health monitoring

Windows scheduled tasks keep the site safe while unattended:

- **GNDJ-Backup** — nightly `pg_dump` → local file **+ off-server copy** (OneDrive/Google Drive via
  rclone), pruned to a retention window, with an email summary.
- **GNDJ-HealthCheck** — pings the **public** `/health` every few minutes and emails you **only when the
  site goes down or recovers** (no spam). This is the *notifier*.
- **GNDJ-Watchdog** — the *self-healer*. Probes the **local** `/health`; if it's down after a few retries,
  it automatically **restarts PostgreSQL (if needed) then the IIS app pool** — which also re-enables a pool
  that IIS disabled via rapid-fail protection (the 2026-08-16 failure mode) — then emails whether it healed
  or still needs a human. Skips while a deploy is in progress (`app_offline.htm`).

Plus **PostgreSQL service recovery** (Windows auto-restarts the DB service if it crashes) and, from
`tune-apppool.ps1`, the app pool runs **AlwaysRunning** with **overlapping rotation disabled** so a recycle
can never run two workers (and two concurrent startup seeders) at once.

Everything is driven by one gitignored secrets file: **`deploy\ops-alert.config.json`**. The watchdog reuses
it; an optional `"watchdog": { "localUrl": "...", "poolName": "gndj", "pgService": "postgresql-x64-18" }`
block overrides its defaults (all have sane fallbacks, so it works with no config changes).

---

## 1. One-time setup on the PROD server (elevated PowerShell)

### a. Create the config
```powershell
cd C:\path\to\GNDJ_Gestion_Groupe\deploy
Copy-Item ops-alert.config.example.json ops-alert.config.json
notepad ops-alert.config.json     # fill in SMTP password, DB password, alertTo, health.url
```
- **smtp** — an SMTP account used ONLY for ops alerts (separate from the app's mail). Use **SMTP2GO**
  (an SMTP user from Sending → SMTP Users), host `mail.smtp2go.com`, **port 587** (STARTTLS, not 465).
  `from` must be a **@gndj.org** address (verified sender → DKIM/SPF align). All group sending goes via
  SMTP2GO/SendGrid; **Zoho is receiving-only** (mailboxes/MX), never used for sending.
- **database.password** — the `gndj_admin` password.
- **alertTo** — **admin + chef(s) de groupe** addresses. These receive the backup status AND the yearly
  audit-archive off-server sync notice.
- **health.url** — `https://new.gndj.org/health` (public URL; the probe uses a browser UA so
  Cloudflare doesn't block it).
- **backup.auditArchiveDir** — the folder the APP writes the yearly audit-log CSV archives to (when a new
  scout year is created the audit trail is exported there, then cleared). MUST match the app's
  **`AuditArchive:Directory`** in `appsettings.Production.json` — set BOTH to a folder OUTSIDE the site
  (e.g. `C:\gndj-backups\audit`) so a deploy never wipes it. `backup-db.ps1` rclone-syncs it to
  `<rcloneRemote>/audit` (kept forever, not pruned). Leave empty to skip the off-server audit sync (the
  archive is still emailed to admin + CG by the app).
- **backup.documentArchiveDir** — the folder the APP writes the new-year document archives to (the zip of every document made by "Nettoyage de nouvelle année", once per scout year). Must match **`DocumentArchive:Directory`** in `appsettings.Production.json` (outside the site, e.g. `C:\gndj-backups\documents`). Synced to `<remote>/documents`, never pruned — it is the only copy of the deleted documents.

### b. Install rclone + connect your cloud (for off-server backups)
```powershell
winget install Rclone.Rclone      # or download from rclone.org
rclone config
#   n) new remote  →  name it e.g. "gndj-onedrive"
#   Storage: onedrive  (or: drive  for Google Drive)
#   follow the browser OAuth prompt, accept defaults
```
Then, so the **SYSTEM** scheduled task can use the token you just created under your own user,
copy your rclone.conf to the shared path referenced by the config:
```powershell
New-Item -ItemType Directory C:\ProgramData\rclone -Force
Copy-Item "$env:APPDATA\rclone\rclone.conf" C:\ProgramData\rclone\rclone.conf
```
Set `backup.rcloneRemote` in the config to `gndj-cloud:GNDJ-Backups` (remote:folder) and
`backup.rcloneConfig` to `C:\ProgramData\rclone\rclone.conf`.

Also set **`backup.rcloneExe`** to the FULL path of `rclone.exe`. `winget` often installs rclone into a
user-scoped folder that the **SYSTEM** scheduled task's PATH doesn't include, so the nightly 03:00 run fails
to find `rclone` even when a manual run works. Find the path and paste it into the config:
```powershell
(Get-Command rclone).Source     # e.g. C:\Users\<you>\AppData\Local\Microsoft\WinGet\Links\rclone.exe
```
```json
"rcloneExe": "C:\\Users\\<you>\\AppData\\Local\\Microsoft\\WinGet\\Links\\rclone.exe"
```
> To keep backups local only (NOT recommended), leave `rcloneRemote` empty.

### c. Register the tasks
```powershell
.\install-ops-tasks.ps1                          # backup 03:00, health every 5 min
# or:  .\install-ops-tasks.ps1 -BackupTime 02:30 -HealthEveryMinutes 10
```

### d. Test both immediately
```powershell
Start-ScheduledTask -TaskName GNDJ-Backup       # check your inbox + C:\gndj-backups\database + the cloud folder (database/)
Start-ScheduledTask -TaskName GNDJ-HealthCheck  # first run emails once (unknown→up is silent; a real outage alerts)
```
Or run directly to see output:  `.\backup-db.ps1`  /  `.\healthcheck.ps1`

### e. End-to-end alert test — a REAL (brief) outage
To prove the whole chain works — a genuine site failure detected by the monitoring, which then emails you —
use `simulate-outage.ps1`. It stops the IIS app pool (the site really goes down), lets the health check
detect it and send "[GNDJ DOWN]", then restarts and lets it send "[GNDJ recovered]". The alert comes from
the monitoring reacting to a real failure — nothing is faked.
```powershell
# Fast: take it down, trigger the real health check now (DOWN email), bring it back, check again (recovered).
.\simulate-outage.ps1 -PoolName gndj -SiteName GNDJ

# Autonomous: take it down and LEAVE it down long enough for the SCHEDULED task to catch it on its own,
# then bring it back (the next scheduled run emails recovery). Proves the cron actually alerts unattended.
.\simulate-outage.ps1 -DownSeconds 360 -Wait
```
> Only run this when it's OK for the site to be briefly unreachable (pre-launch, or a quiet window).
> Behind Cloudflare, visitors during the window see a Cloudflare 502/error page.

---

## 2. Restoring a backup
```powershell
# custom-format dumps restore with pg_restore (create the empty DB first if needed)
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -h localhost -U gndj_admin -d gndj --clean --if-exists "C:\gndj-backups\database\gndj_YYYYMMDD_HHMM.dump"
```

---

## 3. Notes
- **These scripts are committed; the config file is NOT** (`deploy/ops-alert.config.json` is
  gitignored). Create it on each server.
- The health probe hits the public URL through Cloudflare — so it also catches Cloudflare/TLS/DNS
  problems, not just a dead app process.
- Backup emails are sent on every run when `notifyOnSuccess: true` (a daily "it ran" reassurance).
  Set it to `false` to be emailed only on failure.
- Retention prunes BOTH local and cloud copies older than `retentionDays`.

## Email bounce webhooks (set once per provider)

The app records addresses the providers could not deliver to (or that marked our mail as spam), lists them on
**Suivi → Qualité des données**, and stops sending to them until a CG clicks « Réactiver ».

1. In `appsettings.Production.json` add (then recycle the app pool):
   ```json
   "EmailBounces": {
     "MailgunSigningKey": "<Mailgun → Sending → Webhooks → HTTP webhook signing key>",
     "WebhookToken": "<a long random string, e.g. [guid]::NewGuid().ToString('N') twice>"
   }
   ```
2. **Mailgun** (Sending → Webhooks, domain gndj.org): add `https://gndj.org/api/v1/email/webhooks/mailgun` for
   *Permanent failure*, *Temporary failure* and *Spam complaints*.
3. **SMTP2GO** (Settings → Webhooks): URL `https://gndj.org/api/v1/email/webhooks/smtp2go/<WebhookToken>`, events
   *Bounce* and *Spam*.
4. **SendPulse** (SMTP → Settings → Webhooks): URL `https://gndj.org/api/v1/email/webhooks/sendpulse/<WebhookToken>`,
   events *hard bounce*, *soft bounce*, *spam*.

A soft bounce (mailbox full…) only blocks the address after 3 reports; a hard bounce or a spam complaint blocks it
at once.

## Backup restore test (every 4 weeks)

`restore-test.ps1` proves the nightly backup can actually be restored: it restores the newest `gndj_*.dump` into a
scratch database (`gndj_restore_test`), checks the key tables against the live database (non-empty, within 10 %),
compares the latest migration, drops the scratch database and emails **[GNDJ Restore test OK / FAILED]** to
`alertTo`. `install-ops-tasks.ps1` registers it as **GNDJ-RestoreTest** (every 4 weeks, Sunday 04:00).

- Run it once by hand after installing: `Start-ScheduledTask -TaskName GNDJ-RestoreTest` (or
  `powershell -ExecutionPolicy Bypass -File deploy\restore-test.ps1 -NoEmail` to see the output directly).
- The database user needs the right to create a database. If the run fails with "permission denied to create
  database", either `ALTER ROLE <db user> CREATEDB;` or fill `restoreTest.user/password` (e.g. postgres).
- A FAILED email means: no recent dump (the nightly backup stopped), the dump doesn't restore, or it is missing
  data. Look at the details in the email before the next backup overwrites anything.

