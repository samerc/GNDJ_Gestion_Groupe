# GNDJ — Deployment & Installation Guide (Windows Server + IIS)

This is the **single source of truth** for deploying GNDJ. It has two halves:

- **Part I — First-time install (Parts 1–8):** a copy‑paste, click‑by‑click walkthrough that takes a blank
  Windows Server to a live site at **https://new.gndj.org**. No prior IIS/PostgreSQL knowledge needed.
- **Part II — Operations & reference (Parts 9+):** updating the app, building the package, the domain
  switch, backups, performance tuning, Cloudflare, and the technical rationale.

Production today: **Windows Server 2025**, **PostgreSQL 18** on the box, **IIS** in‑process, **behind
Cloudflare**, TLS via **win‑acme**. If something goes wrong during install, jump to **Appendix —
Troubleshooting** at the bottom.

> Throughout, values you must supply are shown like `<THIS>` — replace the whole thing including the `< >`.
> **PowerShell as Administrator:** Start → type `powershell` → right‑click *Windows PowerShell* → *Run as
> administrator*.

---

## How it's wired (read first)

- **Backend**: ASP.NET Core 10 (`src/GNDJ.Api`) under IIS in‑process. Talks to PostgreSQL and runs EF
  migrations + seed **automatically on startup**.
- **Frontend**: React + Vite (`client/`). `npm run build` → static files; the API serves them from its
  `wwwroot/`. The SPA calls the API at the **relative** path `/api/v1`, so the SPA and API **must be the
  same origin** — then there's **no CORS** and the domain can change without rebuilding the client.
- **Uploads** (member docs/photos, CMS images) live in an `uploads/` folder next to the API and are served
  **by the API**. It must persist across deploys and be writable.
- **Logs**: rolling files in `logs/` next to the API **and** an `application_logs` table in PostgreSQL.

```
Browser ──HTTPS──► Cloudflare ──► IIS (new.gndj.org:443, TLS)
                                     │  ASP.NET Core Hosting Bundle (in-process)
                                     ▼
                                  GNDJ.Api  ──►  PostgreSQL 18 (localhost:5432)
                                  serves:  /api/v1/*   (controllers)
                                           /          (React build from wwwroot, SPA fallback)
```

One IIS site = one ASP.NET Core process serving both the API and the React build. Simplest and most robust:
same origin, no CORS, no reverse proxy, correct client IPs for rate limiting, TLS at the edge + IIS.

---

# PART I — First-time install

## What you are installing

- A **website** (the GNDJ app) served by **IIS** (the Windows web server).
- Its **database** in **PostgreSQL** (already installed on the server).
- A free **HTTPS certificate** from Let's Encrypt (so the site is `https://`).

When you're done, people open `https://new.gndj.org` and use the app.

## Before you start — gather these

| You need | Notes |
|----------|-------|
| The **`gndj-staging` folder** | The deployment package. Contains `publish\`, the database file `gndj_data_*.dump`, and config samples. Copy it onto the server (e.g. the Desktop). To build it yourself, see **Part 10**. |
| The **`postgres` password** | The PostgreSQL superuser password. |
| A new **database password** | You invent one for the app's DB user `gndj_admin`. Write it down. |
| The **domain** `new.gndj.org` | Its DNS **A record must point to this server's public IP** before the certificate step. |
| **Administrator** access | You'll open PowerShell and IIS Manager "as Administrator". |

---

## 1. Install the prerequisites

### 1.1 .NET 10 Hosting Bundle (runs the app under IIS)

1. On the server, browse **https://dotnet.microsoft.com/download/dotnet/10.0**.
2. Under **ASP.NET Core Runtime 10.x**, download the **Hosting Bundle** (the link says "Hosting Bundle").
   *Not* the SDK, *not* the plain runtime.
3. Run the installer → **Install** → **Close**.
4. In **PowerShell as Administrator**:
   ```powershell
   iisreset
   dotnet --list-runtimes
   ```
   You should see a line containing **`Microsoft.AspNetCore.App 10.`**. The bundle also installs IIS's
   "ASP.NET Core Module" (ANCM) which lets IIS run the app.

### 1.2 Make sure IIS is installed

1. Start → type **Internet Information Services (IIS) Manager** → Enter. If it opens, skip to 1.3.
2. If not found, install it (PowerShell as Administrator), then re‑run the Hosting Bundle (1.1) and `iisreset`:
   ```powershell
   Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole, IIS-WebServer, IIS-StaticContent, IIS-DefaultDocument, IIS-HttpCompressionStatic, IIS-ApplicationInit -All
   ```

### 1.3 PostgreSQL

PostgreSQL 18 is already installed. Nothing to do here — we use it in Part 3.

> **Node.js** is only needed to *build* the package, and only on the build machine (Part 10). The server
> doesn't need it if you deploy a pre‑built `gndj-staging`/`publish` folder.

---

## 2. Put the app files on the server

The site files live in **`C:\inetpub\www\gndj`** (the standard place).

1. Get the **`gndj-staging`** folder onto the server (RDP drive sharing, USB, or a file share).
2. **PowerShell as Administrator** — edit the first line to where your folder actually is:
   ```powershell
   $pkg = "C:\Users\Samer\Desktop\gndj-staging"     # <-- where you put the gndj-staging folder
   New-Item -ItemType Directory -Force "C:\inetpub\www\gndj" | Out-Null
   Copy-Item "$pkg\publish\*" "C:\inetpub\www\gndj\" -Recurse -Force
   New-Item -ItemType Directory -Force "C:\inetpub\www\gndj\uploads", "C:\inetpub\www\gndj\logs" | Out-Null
   ```
3. Confirm:
   ```powershell
   Test-Path "C:\inetpub\www\gndj\GNDJ.Api.dll"      # must print True
   ```

Keep `gndj-staging` — you still need the **database file** inside it for Part 3.

---

## 3. Set up the database (with the real data)

Create the app's login + database, enable one extension, then load the data file. **PowerShell as
Administrator** — edit the two passwords on the first lines:

```powershell
$bin = "C:\Program Files\PostgreSQL\18\bin"
$env:PGPASSWORD = "<POSTGRES-SUPERUSER-PASSWORD>"      # the 'postgres' password
$AppDbPassword  = "<INVENT-A-STRONG-APP-DB-PASSWORD>"  # NEW password for the app DB user — write it down

# 1. Create the app login + empty database
& "$bin\psql.exe" -U postgres -h 127.0.0.1 -d postgres -c "CREATE USER gndj_admin WITH PASSWORD '$AppDbPassword';"
& "$bin\psql.exe" -U postgres -h 127.0.0.1 -d postgres -c "CREATE DATABASE gndj OWNER gndj_admin;"

# 2. Enable the 'unaccent' extension the app needs (must be done by the superuser)
& "$bin\psql.exe" -U postgres -h 127.0.0.1 -d gndj -c "CREATE EXTENSION IF NOT EXISTS unaccent;"

# 3. Load the data — edit the path to your .dump file inside gndj-staging
& "$bin\pg_restore.exe" --no-owner --no-privileges --role=gndj_admin -h 127.0.0.1 -U postgres -d gndj `
  "C:\Users\Samer\Desktop\gndj-staging\gndj_data_20260626_2002.dump"

# 4. Check it loaded (expect ~2490 members, ~21 units)
& "$bin\psql.exe" -U postgres -h 127.0.0.1 -d gndj -c "SELECT (SELECT count(*) FROM members) AS members, (SELECT count(*) FROM units) AS units;"
Remove-Item Env:\PGPASSWORD
```

**Expected:** step 4 prints something like `members 2493 · units 21`.

> **One harmless error is normal:** during step 3 you may see `ERROR: must be owner of extension unaccent …
> COMMENT ON EXTENSION` and `errors ignored on restore: 1`. Ignore it — only a cosmetic description line.
> As long as step 4 shows the member count, the data loaded.

- Keep PostgreSQL bound to **localhost only** (`listen_addresses = 'localhost'`).
- **Fresh install with no data instead?** Skip the dump: create an empty `gndj` DB + the `unaccent`
  extension and let the API build the schema + seed on first start. (The migration tool in `tools/Migration`
  imports real data into an empty schema if you ever need that path.)

---

## 4. Configure the app (passwords & secret)

The app reads its DB connection and security key from **`appsettings.Production.json`** next to the app.

### 4.1 Generate a JWT secret — run once and copy the line it prints
```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 4.2 Create `appsettings.Production.json` — replace the two `<...>` values
```powershell
$dbpw   = "<THE-APP-DB-PASSWORD-FROM-PART-3>"
$secret = "<THE-KEY-YOU-JUST-COPIED>"
@"
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=gndj;Username=gndj_admin;Password=$dbpw;Pooling=true;Minimum Pool Size=10;Maximum Pool Size=50;Connection Idle Lifetime=300"
  },
  "Jwt": {
    "Secret": "$secret",
    "Issuer": "GNDJ",
    "Audience": "GNDJ",
    "AccessTokenExpirationMinutes": 15,
    "RefreshTokenExpirationDays": 7
  },
  "SuperAdmin": { "Email": "admin@gndj.local", "Password": "unused-because-data-was-restored" },
  "AllowedHosts": "new.gndj.org",
  "Cloudflare": { "Enabled": false }
}
"@ | Set-Content "C:\inetpub\www\gndj\appsettings.Production.json" -Encoding utf8
```

Critical notes:
- **`Jwt:Secret`** — long random value (≥ 32 chars, 64 recommended). Changing it later logs everyone out.
- **`SuperAdmin:Password`** — only used to seed a **new empty** DB. With restored data, `admin@gndj.local`
  already exists — log in with its current password.
- The **pool size (50)** stays well under PostgreSQL `max_connections` (100) — leaves headroom for backups
  and tooling.
- **`Cloudflare:Enabled`** — leave `false` for now; flip to `true` once traffic is proxied (see **Part 17**).
- **Keep this file safe** — it has the DB password, stays only on the server (never in source control), and
  is **never overwritten** by future deploys.

---

## 5. Quick test before IIS (recommended)

Run the app directly for a minute to confirm DB + config before involving IIS:
```powershell
cd C:\inetpub\www\gndj
$env:ASPNETCORE_ENVIRONMENT = "Production"
$env:ASPNETCORE_URLS = "http://localhost:5000"
dotnet GNDJ.Api.dll
```
- **Good sign:** console prints startup lines ending with **`GNDJ API listening on:`** and waits.
- Browse `http://localhost:5000` **on the server** → the GNDJ login page loads. Log in as
  `admin@gndj.local` → real data.
- **Bad sign:** it errors and exits → read `C:\inetpub\www\gndj\logs\gndj-*.log` (usually a wrong DB
  password). Fix Part 4 and retry.

Press **Ctrl+C** to stop, then continue to IIS.

---

## 6. Set up IIS (the real web server)

Open **IIS Manager** (Start → "IIS").

### 6.1 Application Pool
1. Left panel → **Application Pools** → right **Actions** → **Add Application Pool…**.
2. **Name:** `gndj` · **.NET CLR version:** **No Managed Code** · **Managed pipeline mode:** **Integrated** → **OK**.

### 6.2 Site
1. Left panel → right‑click **Sites** → **Add Website…**.
2. **Site name:** `GNDJ` · **Application pool:** **Select…** → **gndj** · **Physical path:**
   `C:\inetpub\www\gndj` · **Binding:** http, All Unassigned, port **80**, **Host name:** `new.gndj.org` → **OK**.

### 6.3 Mark it Production
1. Click the **GNDJ** site → **Configuration Editor**.
2. **Section** dropdown → paste `system.webServer/aspNetCore` → Enter.
3. **environmentVariables** row → **`…`** button → **Add** → Name `ASPNETCORE_ENVIRONMENT`, Value
   `Production` → OK → **Apply**.

### 6.4 Allow large uploads (member docs up to 20 MB)
GNDJ site → **Request Filtering** → Actions → **Edit Feature Settings…** → **Maximum allowed content length**
= `20971520` → OK.

### 6.5 Grant write permission for uploads & logs
```powershell
icacls "C:\inetpub\www\gndj\uploads" /grant "IIS AppPool\gndj:(OI)(CI)M" /T
icacls "C:\inetpub\www\gndj\logs"    /grant "IIS AppPool\gndj:(OI)(CI)M" /T
```

### 6.6 Restart and test over HTTP
```powershell
iisreset
```
Browse `http://new.gndj.org` (or `http://localhost` if DNS isn't pointing here yet) → login page loads.

> **Compression:** the app already gzip/brotli‑compresses API responses, so turn **IIS *dynamic*
> compression OFF** for the site and leave **static** compression on (IIS Manager → site → *Compression*).

---

## 7. Get the HTTPS certificate (Let's Encrypt via win-acme)

Makes the site `https://` with a free cert that **auto‑renews**.

> **First:** (a) `new.gndj.org` DNS **points to this server**, and (b) the site is reachable on **port 80
> from the internet** (open the firewall for 80 and 443).

1. Download **win‑acme** from **https://www.win-acme.com/**, unzip on the server (e.g. `C:\win-acme`).
2. **PowerShell as Administrator**:
   ```powershell
   cd C:\win-acme
   .\wacs.exe
   ```
3. Type **`N`** → **Create certificate (default settings)**.
4. Choose the **GNDJ** site (type its number).
5. Choose **new.gndj.org** (or "all bindings").
6. Accept the Let's Encrypt terms + enter an **email** (expiry warnings).
7. win‑acme validates the domain, downloads the cert, **adds the HTTPS (443) binding**, and **schedules
   auto‑renewal**. Type **`Q`** to quit.

Test: **https://new.gndj.org** → padlock + login page.

> The app is already built to answer Let's Encrypt's HTTP‑01 check (it serves
> `.well-known/acme-challenge` before the SPA fallback), so issuance **and every auto‑renewal** work with no
> extra config. If validation fails it's almost always DNS not pointing here yet or port 80 blocked — fix
> and re‑run `.\wacs.exe`.

### 7.1 Redirect http → https (optional)
Install the free **URL Rewrite** module and add a rule to `https://new.gndj.org`, or keep both bindings and
add the redirect when convenient.

---

## 8. Final checks (first login)

1. **https://new.gndj.org** → log in as `admin@gndj.local`.
2. **Admin → Paramètres** → set **`app.base_url`** to `https://new.gndj.org` (used in email links).
3. Check **Email / SMTP** if you'll send mail; send yourself a password‑reset test.
4. Look at `logs\gndj-*.log` — no repeated errors.

You're live. 🎉 → Now apply the **performance tuning** in **Part 15** (app‑pool warm‑up + PostgreSQL).

---

# PART II — Operations & reference

## 9. Deploying updates (the easy way)

When there's a new version, you **don't** redo any of the above. From the source folder on a machine with
the .NET **SDK** + **Node.js**:
```powershell
.\deploy\update.ps1 -Target C:\inetpub\www\gndj    # first time — target is then remembered
.\deploy\update.ps1                            # every time after
.\deploy\update.ps1 -Pull                      # git pull --ff-only first, then build + ship
```
`update.ps1` chains **build** (`publish.ps1`) → **ship** (`deploy.ps1`) and remembers the target in
`deploy\target.txt` (git‑ignored). **No IIS reconfiguration** — Part 6 is done once.

`deploy.ps1` does a near‑zero‑downtime swap:
1. drops `app_offline.htm` so ANCM stops the app gracefully and releases DLL locks (no manual app‑pool stop),
2. `robocopy`s the new files over — **preserving `uploads\`, `logs\`, and `appsettings.Production.json`**
   (never copied or purged),
3. removes `app_offline.htm`; the app restarts and **re‑runs any new EF migrations automatically** on the
   first request.

> **If you build on a *separate* machine from the server:** build with `publish.ps1`, copy `publish\` over,
> then run `deploy.ps1 -Source <copied publish> -Target C:\inetpub\www\gndj` on the server (or
> `-Target \\SERVER\gndj$` against an SMB share). See **Part 10**.

Roll‑forward only; to **roll back**, keep the previous `publish\` folder and re‑run `deploy.ps1` with it.
If a release adds a migration, take a `pg_dump` first (Part 13) for anything risky.

---

## 10. Build the deployable package ("staging files")

The whole app ships as **one folder** — the published API with the React build inside its `wwwroot/`. Build
it on any machine with the **.NET SDK + Node.js**:

```powershell
./deploy/publish.ps1                                   # → .\publish
# …or straight into your staging folder:
./deploy/publish.ps1 -OutDir "C:\Users\Administrator\Desktop\gndj-staging\publish"
```

It runs a **full** build (backend DLLs **and** the frontend, so it's correct even when only the React app
changed):
```powershell
dotnet publish src/GNDJ.Api/GNDJ.Api.csproj -c Release -o publish   # also generates web.config (ANCM)
cd client; npm ci; npm run build; cd ..                            # → client/dist
New-Item -ItemType Directory -Force publish/wwwroot | Out-Null
Copy-Item client/dist/* publish/wwwroot/ -Recurse -Force
```

> ⚠️ Always do a **full `publish.ps1`** (not a DLL‑only copy) whenever the frontend changed — the React
> build is content‑hash‑split into many chunk files, so a stale `wwwroot/` serves a broken/old UI.

**Ship it** — pick the path that matches where you built:

- **Build ON the server** → one command (Part 9): `./deploy/update.ps1 -Target C:\inetpub\www\gndj`.
- **Build on a different machine** → build, copy `publish\` to the server (RDP/zip/share), then on the
  server: `./deploy/deploy.ps1 -Source <copied publish> -Target C:\inetpub\www\gndj`.
- **UNC share reachable from the build box** → skip the copy:
  `./deploy/deploy.ps1 -Source .\publish -Target \\SERVER\gndj$`.

On the first request after a deploy the app **auto‑runs any new EF migrations** — no manual EF step.

---

## 11. Switching the domain to gndj.org (later)

`new.gndj.org` → `gndj.org` needs **no client rebuild** (relative `/api/v1`):
1. Point `gndj.org`'s **DNS A record** at this server.
2. IIS → **GNDJ** → **Bindings…** → **Add** `http:80` host `gndj.org` (and the eventual https).
3. Get a cert for the new name: `cd C:\win-acme; .\wacs.exe` → certificate for **gndj.org** (adds https +
   auto‑renew). Or add it to the existing cert so it covers both during cut‑over.
4. Edit `appsettings.Production.json` → `"AllowedHosts"` = `gndj.org` (or `new.gndj.org;gndj.org` during
   overlap) → `iisreset`.
5. App → **Paramètres** → set **`app.base_url`** to `https://gndj.org`.
6. `Jwt:Issuer/Audience` are the constant `"GNDJ"` — no change. Remove the old `new.gndj.org` bindings once
   traffic is cut over.

---

## 12. Reset the data back to the import (testing only)

While **testing** (before real users), you can wipe changes and reset the DB to the clean imported snapshot.

> ⚠️ **Destructive — ONLY before go‑live.** It replaces *everything* in the DB with the snapshot. Once the
> group enters real data, never use this — restore from a recent backup instead.

Keep the snapshot somewhere stable, then run the bundled script with the path to it:
```powershell
New-Item -ItemType Directory -Force C:\gndj-backups | Out-Null
Copy-Item "C:\Users\Samer\Desktop\gndj-staging\gndj_data_20260626_2002.dump" C:\gndj-backups\ -Force

cd C:\Users\Samer\Desktop\gndj-staging
.\reset-to-import.ps1 -Dump C:\gndj-backups\gndj_data_20260626_2002.dump
```
- Asks for the **postgres** password, then makes you type **`RESET`**.
- Stops IIS, reloads the snapshot (~10 s), starts IIS. The harmless `unaccent COMMENT` error appears —
  ignore it. Prints `members = …` when done.
- Add **`-ClearUploads`** to also empty `uploads\` for a fully clean slate.

**Make a fresh baseline** any time (e.g. after configuring SMTP/settings you want to keep):
```powershell
$bin = "C:\Program Files\PostgreSQL\18\bin"
$env:PGPASSWORD = "<postgres-password>"
& "$bin\pg_dump.exe" -h localhost -U gndj_admin -d gndj --no-owner --no-privileges --exclude-table='_bak_*' -Fc -f "C:\gndj-backups\gndj_baseline_$(Get-Date -Format yyyyMMdd_HHmm).dump"
Remove-Item Env:\PGPASSWORD
```
Then pass that newer file to `-Dump`.

---

## 13. Backups, logs, monitoring

- **Database**: schedule `pg_dump` nightly (Task Scheduler) →
  `pg_dump -U gndj_admin -F c -f gndj_YYYYMMDD.dump gndj`. Keep off‑box copies. **This is the real safety
  net** once live — not the import snapshot.
- **Uploads**: back up `C:\inetpub\www\gndj\uploads` (the only file state outside the DB).
- **Logs**: `logs\gndj-*.log` (30‑day rolling) + `application_logs` table (Warning+). Watch after go‑live.
- **Health**: the app exposes `GET /health` (liveness) for uptime monitoring and IIS warm‑up.

---

## 14. Test / staging from a data snapshot

To stand up a **separate test instance with the current real data**, ship a `pg_dump` snapshot alongside the
package. The dump carries the EF migration history, so the API starts without re‑migrating.

**On the dev box:** `publish.ps1` (code, no data) + a snapshot (remove test docs/cotisations/passages/camps
first), excluding `_bak_*`:
```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h localhost -U gndj_admin -d gndj `
  --no-owner --no-privileges --exclude-table='_bak_*' -Fc -f gndj_data.dump
```
**On the staging server:** create the DB as a superuser (`CREATE USER`/`CREATE DATABASE` +
`CREATE EXTENSION unaccent`), `pg_restore` the dump (Part 3), fill in `appsettings.Production.json` with a
**fresh `Jwt:Secret`**, then run via IIS (Part 6) or a quick Kestrel smoke test
(`$env:ASPNETCORE_URLS="http://0.0.0.0:5000"; dotnet GNDJ.Api.dll`).

---

# PART III — Reference & advanced

## 15. Performance tuning (run on the server) ⚡

Three high‑impact steps the app can't set for you. All scripts are in `deploy/`.

### 15.1 IIS app pool — stop cold starts (`deploy/tune-apppool.ps1`)
IIS defaults kill the worker after **20 min idle** and recycle it every **29 h**; each shutdown forces a full
cold start (process relaunch + JIT + EF model build + startup seeding), so the next visitor waits seconds.
```powershell
./deploy/tune-apppool.ps1               # defaults: pool "gndj", site "GNDJ", 03:00 recycle
```
Disables the idle time‑out, replaces the clock recycle with one 3 AM recycle, sets **AlwaysRunning** + site
**preload** (warms via `GET /health`). Idempotent. **The single biggest user‑perceived‑latency fix.**

### 15.2 PostgreSQL — seasonal High/Low profile (`deploy/pg-profile.ps1`)
The box is **shared** with other sites and GNDJ's load is seasonal (Sept–Oct = passage/demandes/rentrée):
```powershell
./deploy/pg-profile.ps1 -Profile High   # before September: more cache (shared_buffers 4GB / eff_cache 12GB)
./deploy/pg-profile.ps1 -Profile Low    # after the rush: conservative (1GB / 4GB), frees RAM for other sites
```
Writes settings via `ALTER SYSTEM` (your `postgresql.conf` stays untouched) and restarts PostgreSQL (asks
first — a restart blips every DB on the instance). Stock PG18 ships `shared_buffers=128MB`, so even Low is a
real upgrade. Verify: `psql -U postgres -c "SHOW shared_buffers;"`.

### 15.3 Connection pool + IIS compression (manual, once)
- **Npgsql pool** — the prod connection string should pin the pool so a stray tool can't exhaust PostgreSQL:
  `;Pooling=true;Minimum Pool Size=10;Maximum Pool Size=50;Connection Idle Lifetime=300` (Part 4 already
  includes it). App max 50 stays under PG `max_connections=100`.
- **IIS dynamic compression OFF** for the site (the app already compresses API responses); leave **static**
  compression on.

---

## 16. Caching — what's built in

Already handled by the app (no action): **response compression** (gzip+brotli), **output caching** on
read‑heavy public endpoints (`ShortCache` 2 min / `LookupData` 10 min; authenticated responses never
cached), and **static‑asset cache headers** — `Program.cs` sends `/assets/*` (Vite content‑hashed)
`max-age=31536000, immutable` and `index.html` `no-cache`, so browsers and Cloudflare skip revalidation and
new deploys appear immediately. No `web.config` static‑cache block needed.

---

## 17. Cloudflare (in front of the public site)

Cloudflare gives edge TLS, DDoS protection, a global cache for anonymous pages, and a WAF. The app is
same‑origin, so it sits cleanly in front of `new.gndj.org`.

**Setup:** add the zone + switch nameservers; DNS `A new → <server IP>` **Proxied** (orange cloud); keep a
valid origin cert on IIS (a free **Cloudflare Origin Certificate** is ideal) and set **SSL/TLS = Full
(strict)**; turn on **Always Use HTTPS** + **HSTS** at the edge; set **SSL/TLS → Edge Certificates →
Minimum TLS Version = 1.2** (removes the deprecated‑TLS / weak‑cipher scan findings — see §18.5).

**Cache rules:** add a rule `URI path starts with /api/ → Bypass cache` (never cache dynamic/authenticated
traffic). The origin's headers already make `/assets/*` edge‑cacheable and keep `index.html` uncached.

**Restore the real client IP (REQUIRED if proxied) ⚠** — when proxied, every request reaches the origin from
a Cloudflare IP, which would collapse all visitors into one rate‑limit bucket. The fix is **already
implemented**: set **`"Cloudflare": { "Enabled": true }`** in `appsettings.Production.json` and restart the
app pool. The app then reads the true client IP from `CF-Connecting-IP`, but **only trusts it from
Cloudflare's own IP ranges** (pre‑seeded in `appsettings.json` `Cloudflare:IpRanges`). Verify in
`logs\gndj-*.log` that request `RemoteIP` is the **visitor's** IP, not a `104.x/172.x` Cloudflare address.
**Defense‑in‑depth:** also restrict the Windows firewall so 80/443 accept only Cloudflare's ranges.

What Cloudflare does **not** change: the relative `/api` same‑origin model, `app.base_url`, or the app's own
compression/output‑cache/rate‑limit (belt and braces at the origin).

---

## 18. Code changes that make single‑site hosting work (already applied)

These are already in `src/GNDJ.Api/Program.cs` — listed so you know what makes the topology work:
1. **Serves the React build + SPA fallback** — `UseDefaultFiles()` + `UseStaticFiles()` (serves `wwwroot/`)
   and `MapFallbackToFile("index.html")` after `MapControllers()` (API routes match first; other paths →
   the SPA shell).
2. **ACME challenge** — serves `.well-known/acme-challenge` before the SPA fallback so win‑acme HTTP‑01
   issuance/renewal works on the single in‑process site.
3. **1 MB body limit under IIS in‑process** — `Configure<IISServerOptions>` (Kestrel's is ignored
   in‑process); 20 MB upload endpoints override per‑action (allow it in IIS, Part 6.4).
4. **Security response headers** — a middleware sets `X-Content-Type-Options`, `X-Frame-Options: DENY`,
   `Referrer-Policy`, `X-Permitted-Cross-Domain-Policies`, `Permissions-Policy` (only `camera=(self)` for the
   photo session; all other features denied), `Cross-Origin-Opener-Policy` + `Cross-Origin-Resource-Policy`
   = `same-origin`, and — **in production only** — a `Content-Security-Policy` (dev is exempt because the
   dev‑only Swagger UI needs inline scripts). `AddHsts` sets `max-age = 1 year`; `app.UseHsts()` runs when not
   Development. **COEP is deliberately not set** (`require-corp` would block CMS‑embedded external images).

The only deploy‑time config (not code): `"AllowedHosts"` and `"Cloudflare:Enabled"` in
`appsettings.Production.json`.

---

## 18.5 Security‑scan remediation (external pen‑test / Nuclei findings)

A periodic external scan hits `new.gndj.org` **through Cloudflare** (the origin IP is never exposed — good).
Almost every finding is edge config or informational. The real, actionable ones:

**A. TLS 1.0/1.1 + weak cipher suites (Cloudflare edge).** The weak `…AES_128_CBC_SHA` cipher only exists on
TLS 1.0/1.1. Fix once in the dashboard: **SSL/TLS → Edge Certificates → Minimum TLS Version**.
- **1.2** = the recommended baseline — clears all TLS/cipher findings and keeps broad device compatibility.
- **1.3** = stricter (also clears them) but can reject older clients (older Android, Win7/8 browsers, some
  corporate TLS proxies). If some users report they can't reach the site, dial back to 1.2.

**B. Security response headers (origin).** Already in code (§18 item 4) — CSP, 1‑year HSTS, Permissions‑Policy,
COOP, CORP. They reach the scanner through Cloudflare on port 443 after a deploy. (Cloudflare's own responses
on ports 80/8443 will still show "missing headers" — those are edge redirect/error pages, not the app.)

**C. IIS 8.3 short‑name (tilde `~`) enumeration (origin, Windows Server).** Low risk here (the SPA uses
content‑hashed asset names and there are no secret files to disclose), but easy to remove. **Shared‑server
note:** this box hosts other sites, so understand the two levels before running anything:

- **Disabling *future* 8.3 creation is per‑volume** (affects every site on that drive, new files only). It is
  Microsoft‑recommended and safe for modern web apps; only ancient 16‑bit apps/installers could care.
- **Stripping *existing* short names is per‑path** — it only touches the folder you point it at, so it does
  **not** affect the other sites unless you run it against their folders too.

Run in an **elevated** PowerShell/cmd on the server:
```powershell
fsutil 8dot3name query C:                                  # see current state
fsutil 8dot3name set C: 1                                  # disable FUTURE 8.3 creation on C: (this volume only)
fsutil 8dot3name scan /s "C:\inetpub\www\gndj"             # dry-run report of what a strip would change
fsutil 8dot3name strip /t /s /v "C:\inetpub\www\gndj"      # TEST strip (reports, changes nothing)
fsutil 8dot3name strip /s /v "C:\inetpub\www\gndj"         # actually strip existing short names for THIS site
```
No reboot needed (strip is immediate; `set` affects newly created files). To remediate the other sites too,
repeat the two `strip` lines against each of their content folders. If you'd rather not touch the filesystem,
an alternative is an IIS **Request Filtering** rule that denies URLs containing `~` — but the `fsutil` strip is
the cleaner fix. Re‑scan afterwards to confirm the finding is gone.

**D. Informational / no action:** WAF Detection (that IS Cloudflare — expected), tech‑detect, OPTIONS
`GET,HEAD`, AAAA/CAA/SSL‑issuer/DNS‑names/wildcard‑cert. All benign discovery output.

---

## 19. Pre‑production hardening backlog (track separately)

- [ ] Secrets out of source → `appsettings.Production.json` / env vars (done above). **Keep it that way.**
- [ ] httpOnly‑cookie refresh tokens — today the JWT lives in `localStorage` (XSS exposure). Acceptable over
      HTTPS for launch; moving the refresh token to an httpOnly cookie is a future hardening.
- [ ] Encrypt/externalize SMTP credentials stored in the DB.
- [ ] A dedicated PostgreSQL backup/retention policy + a restore drill.

---

## 20. Alternative topology — IIS static + reverse proxy (no code change)

If you'd rather not have the API serve the SPA:
1. **Site 1** `new.gndj.org` → physical path = `client/dist` (static SPA) with a `web.config`: URL Rewrite +
   **ARR** rule `^api/(.*)` → `http://localhost:5000/api/{R:1}`; SPA fallback → `/index.html`.
2. **Site 2** (API) → published `GNDJ.Api`, ANCM, bound to **localhost:5000** only.
3. Install **ARR** + **URL Rewrite** modules.
4. Add **`UseForwardedHeaders`** to the API (behind ARR, `RemoteIpAddress` is `127.0.0.1`, which breaks
   per‑IP rate limiting) reading `X-Forwarded-For`.

Trade‑off: no code change, but more IIS moving parts. The single‑site topology (the rest of this guide) is
simpler and preferred.

---

## Appendix — Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| **HTTP 500.30 / 500.31** | App failed to start. Read `logs\gndj-*.log`. Usually a wrong DB password in `appsettings.Production.json` (Part 4) or the .NET 10 Hosting Bundle missing (Part 1.1). |
| **HTTP 502.5** | ANCM can't launch the app — Hosting Bundle missing, or app pool isn't **No Managed Code**. Re‑check Parts 1.1 and 6.1. |
| **Login page blank / 404 for `/assets/...`** | The React files didn't copy. Re‑do Part 2 (`publish\*` must include a `wwwroot\` with `index.html`). |
| **`pg_restore` "must be owner of extension unaccent"** | Harmless — ignore (Part 3). |
| **Can't connect to DB / password error in logs** | `gndj_admin` password in `appsettings.Production.json` ≠ what you set in Part 3. Fix the file, `iisreset`. |
| **win‑acme "validation failed"** | DNS for `new.gndj.org` not pointing here yet, or port 80 blocked. Fix DNS/firewall, re‑run `.\wacs.exe`. |
| **Uploads fail / "access denied" in logs** | App pool can't write `uploads\`/`logs\`. Re‑run the `icacls` commands (Part 6.5). |
| **Large document upload rejected** | Set Request Filtering max length to `20971520` (Part 6.4). |
| **All clients hit the rate limit (429) at once** | Behind Cloudflare without `Cloudflare:Enabled=true` — every request looks like one IP. Set it (Part 17) and restart. |

To **restart the app** any time: `iisreset`, or IIS Manager → site → **Restart**.
