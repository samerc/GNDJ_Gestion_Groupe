# GNDJ — Deployment Guide (Windows Server 2025 + IIS)

Target: **Windows Server 2025**, IIS installed, **PostgreSQL 18** on the box, public domain
**`new.gndj.org`** (temporary — see [Changing the domain](#10-changing-the-domain-later)).

## 0. How the app is wired (read first)

- **Backend**: ASP.NET Core 10 (`src/GNDJ.Api`) → Kestrel/IIS. Talks to PostgreSQL.
  Runs EF migrations + seed **automatically on startup**.
- **Frontend**: React + Vite (`client/`). `npm run build` → static files in `client/dist/`.
  It calls the API at the **relative** path `/api/v1` (`client/src/lib/constants.ts`). So the
  SPA and the API **must be served from the same origin** (same scheme+host+port) — then there is
  **no CORS** and the domain can change without rebuilding the client.
- **Uploads** (member docs/photos, CMS images) are written to an `uploads/` folder next to the API
  and **served by the API** (not IIS). This folder must persist across deploys and be writable.
- **Logs**: rolling files in `logs/` next to the API **and** a `application_logs` table in PostgreSQL.

### Recommended topology — one site, same origin

```
Browser ──HTTPS──► IIS (new.gndj.org:443, TLS)
                      │  ASP.NET Core Hosting Bundle (in-process)
                      ▼
                   GNDJ.Api  ──►  PostgreSQL 18 (localhost:5432)
                   serves:  /api/v1/*  (controllers)
                            /         (React build from wwwroot, SPA fallback)
                            uploads via /api/... endpoints
```

One IIS site hosts **one ASP.NET Core process** that serves both the API and the React build.
This is the simplest, most robust option: same origin (relative `/api` just works), no CORS, no ARR
reverse-proxy, correct client IPs for rate limiting, TLS terminated at IIS.

> It requires a **small code change** (the API doesn't serve the SPA yet) — see
> [§2 Required code changes](#2-required-code-changes-one-time). If you'd rather not touch code, see
> [Appendix A](#appendix-a-alternative-iis-static--reverse-proxy-no-code-change).

---

## 1. Server prerequisites (install once)

1. **.NET 10 Hosting Bundle** — installs the .NET runtime + the **ASP.NET Core Module v2 (ANCM)** for IIS.
   Download "ASP.NET Core Runtime 10.x — Hosting Bundle", install, then `iisreset`.
   Verify: `dotnet --list-runtimes` shows `Microsoft.AspNetCore.App 10.x`.
2. **PostgreSQL 18** — already installed. You'll create the DB + login in §4.
3. **IIS features**: Web Server role with *Static Content*, *Application Initialization* (optional, keeps
   the app warm), and *Dynamic/Static Compression* (we let the app compress API responses; see §9).
4. **A TLS certificate** for `new.gndj.org`:
   - Public domain → use **win-acme** (`wacs.exe`) for a free Let's Encrypt cert with auto-renewal, **or**
   - an internal/commercial cert imported into the server's certificate store.
5. (Build machine only) **Node.js 20+** to run `npm run build`. You can build the frontend on the dev
   box and copy `dist/` to the server — Node is **not** required on the server.

---

## 2. Code changes for hosting (already applied)

These are **already in `src/GNDJ.Api/Program.cs`** — listed here so you know what makes the single-site
topology work:

1. **Serves the React build + SPA fallback** — `UseDefaultFiles()` + `UseStaticFiles()` (serves `wwwroot/`,
   the Vite build) and `MapFallbackToFile("index.html")` after `MapControllers()` (SPA client routes →
   `index.html`; API routes match first).
2. **Re-asserts the 1 MB body limit under IIS in-process** —
   `Configure<IISServerOptions>(o => o.MaxRequestBodySize = 1 MB)` (Kestrel's limit is ignored in-process).
   The 20 MB upload endpoints still override per-action with `[RequestSizeLimit]`; make sure IIS allows it
   (see §6).
3. **HSTS in production** — `app.UseHsts()` when not Development (TLS terminates at IIS; binding is HTTPS).

Still **your** call at deploy time (config, not code): set `"AllowedHosts": "new.gndj.org"` in
`appsettings.Production.json` (see §5).

---

## 3. Build & publish

**Easiest:** run the bundled script on a machine with the .NET SDK + Node.js — it does all the steps below
and leaves a ready package in `publish/`:

```powershell
./deploy/publish.ps1
```

What it does (equivalent manual steps):

```powershell
# 1. Backend — framework-dependent publish
dotnet publish src/GNDJ.Api/GNDJ.Api.csproj -c Release -o publish

# 2. Frontend — production build
cd client; npm ci; npm run build; cd ..    # → client/dist

# 3. Put the SPA inside the API's wwwroot
New-Item -ItemType Directory -Force publish/wwwroot | Out-Null
Copy-Item client/dist/* publish/wwwroot/ -Recurse -Force
```

> For **updates** to an already-running site, use the one-command redeploy in **§13** instead of doing
> the IIS setup again.

`dotnet publish` generates a `web.config` with the ANCM handler. Copy the whole **`publish/`** folder to
the server, e.g. `C:\inetpub\gndj`.

---

## 4. Database

PostgreSQL 18 is already on the box. Create the database + login (psql as a superuser):

```sql
CREATE USER gndj_admin WITH PASSWORD '<STRONG-DB-PASSWORD>';
CREATE DATABASE gndj OWNER gndj_admin;
```

- Keep PostgreSQL bound to **localhost only** (`listen_addresses = 'localhost'`) — the API connects locally.
- **Migrations + seed run automatically** the first time the API starts (`Database.MigrateAsync()` +
  `SeedData.*`). No manual EF step needed.
- **Going live with real data**: after your pre-import data cleanup, run the migration tool against the
  prod DB (`tools/Migration`) — point its connection string at the server and run it once. (It expects an
  empty schema; let the API create the schema on first start, then import.)

---

## 4b. Test / staging deployment with a data snapshot

To stand up a **test** instance on a separate server **with the current real data** (instead of a fresh
empty DB), ship a `pg_dump` snapshot alongside the published package. The dump carries the **EF migration
history**, so the API starts against it without re-migrating.

**On the source (dev) box — produce the two artifacts:**

1. **Code package** — `./deploy/publish.ps1` → the `publish/` folder (API + React build in `wwwroot/`).
   Contains **no data**.
2. **Data snapshot** — first remove anything you don't want on staging (e.g. test documents, cotisations,
   passages, camps), then dump, excluding the `_bak_*` helper/backup tables:
   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h localhost -U gndj_admin -d gndj `
     --no-owner --no-privileges --exclude-table='_bak_*' -Fc -f gndj_data.dump
   ```

Copy `publish/`, `gndj_data.dump`, and your filled-in `appsettings.Production.json` to the staging server.

**On the staging server — restore + run:**

1. **Prereqs** — §1 (.NET 10 runtime for a Kestrel test, or the Hosting Bundle for IIS; PostgreSQL 18).
2. **Create the DB as a Postgres superuser** — the dump needs the `unaccent` extension, which a normal
   user cannot create:
   ```sql
   CREATE USER gndj_admin WITH PASSWORD '<STRONG-DB-PASSWORD>';
   CREATE DATABASE gndj OWNER gndj_admin;
   \c gndj
   CREATE EXTENSION IF NOT EXISTS unaccent;
   ```
3. **Restore** (still as superuser):
   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --no-owner --no-privileges `
     --role=gndj_admin -d gndj -h localhost -U postgres gndj_data.dump
   ```
   Sanity: `SELECT count(*) FROM members;`.
4. **Config** — §5 (`appsettings.Production.json`: staging connection string, a **fresh** `Jwt:Secret`,
   `AllowedHosts`). With restored data the existing `admin@gndj.local` account is already present — log in
   with its current password (`SuperAdmin:Password` only seeds a *new* empty DB).
5. **Run** — IIS per §6, **or** a quick Kestrel smoke test (no IIS):
   ```powershell
   cd <publish>; $env:ASPNETCORE_ENVIRONMENT="Production"; $env:ASPNETCORE_URLS="http://0.0.0.0:5000"
   dotnet GNDJ.Api.dll
   ```
   Browse `http://<staging-host>:5000` (open the firewall for the port if remote).

> **Fresh-install variant (no data):** skip the dump/restore — create an empty `gndj` DB + the `unaccent`
> extension and let the API build the schema + seed on first start (§4). Useful for testing a true
> first-time install.

> **Re-deploying code to staging later:** rebuild with `publish.ps1` and ship with
> `deploy/deploy.ps1 -Source publish -Target <site path>` (§13) — it preserves `uploads/`, `logs/`, and
> `appsettings.Production.json`.

---

## 5. Configuration & secrets (do NOT commit real secrets)

The app reads `ConnectionStrings:DefaultConnection`, `Jwt:*`, and `SuperAdmin:*`. Override the
placeholders from `appsettings.json` with a server-only **`appsettings.Production.json`** placed next to
the API in `C:\inetpub\gndj` (this file is git-ignored / created only on the server):

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=gndj;Username=gndj_admin;Password=<STRONG-DB-PASSWORD>;Pooling=true;Minimum Pool Size=5;Maximum Pool Size=50;Connection Idle Lifetime=300"
  },
  "Jwt": {
    "Secret": "<RANDOM-64-CHAR-SECRET>",
    "Issuer": "GNDJ",
    "Audience": "GNDJ",
    "AccessTokenExpirationMinutes": 15,
    "RefreshTokenExpirationDays": 7
  },
  "SuperAdmin": {
    "Email": "admin@gndj.org",
    "Password": "<STRONG-ADMIN-PASSWORD>"
  },
  "AllowedHosts": "new.gndj.org"
}
```

Critical:
- **`Jwt:Secret`** — replace the placeholder with a long random value (≥ 32 chars; 64 recommended).
  If it ever changes, all existing tokens are invalidated (everyone re-logs-in).
- **`SuperAdmin:Password`** — set this **before the first start**; the seed creates the super-admin with
  it. Otherwise the default `Admin123!` is created (then change it immediately in-app).
- Environment is selected by `ASPNETCORE_ENVIRONMENT=Production` (set on the IIS site, §7) so
  `appsettings.Production.json` is loaded.
- Alternatively, secrets can be set as **environment variables** with `__` for nesting, e.g.
  `ConnectionStrings__DefaultConnection`, `Jwt__Secret`, `SuperAdmin__Password`.
- **SMTP passwords** live in the database (configured in-app under Email / SMTP). Treat the DB as
  sensitive; restrict the `application_logs`/DB access accordingly.
- After first start, set the **`app.base_url`** setting in-app (Admin → Paramètres) to
  `https://new.gndj.org` — it's used for links in emails (password reset, applicant verification).

---

## 6. IIS site setup

1. **App pool**: create `gndj` → **.NET CLR version = "No Managed Code"** (ANCM hosts the runtime),
   Pipeline = Integrated. Identity = `ApplicationPoolIdentity` (default).
2. **Site**: create `GNDJ` → physical path `C:\inetpub\gndj` → app pool `gndj`.
3. **Bindings**:
   - `https` : port 443 : host `new.gndj.org` : select the TLS cert.
   - `http` : port 80 : host `new.gndj.org` (for the HTTP→HTTPS redirect / ACME challenges).
4. **Environment variable**: site → Configuration Editor →
   `system.webServer/aspNetCore` → `environmentVariables` → add `ASPNETCORE_ENVIRONMENT = Production`.
   (Or set it in `web.config`'s `<aspNetCore><environmentVariables>`.)
5. **HTTP→HTTPS redirect**: add a URL Rewrite rule (or the "HTTP Redirect"/HSTS) so port-80 traffic
   goes to `https://new.gndj.org`.
6. **Request limits for uploads**: the 20 MB upload endpoints need IIS to allow large bodies. IIS default
   `maxAllowedContentLength` is ~28.6 MB, which covers 20 MB — but set it explicitly if you change it:
   site → Request Filtering → Edit Feature Settings → Maximum allowed content length = `20971520`.
7. **Folder permissions**: grant the app pool identity (`IIS AppPool\gndj`) **Modify** on:
   - `C:\inetpub\gndj\uploads`  (created on first upload — pre-create it)
   - `C:\inetpub\gndj\logs`

Browse to `https://new.gndj.org` — the React app loads; log in with the super-admin credentials.

---

## 7. First-run checklist

- [ ] `appsettings.Production.json` present with real DB connection, strong `Jwt:Secret`, strong
      `SuperAdmin:Password`.
- [ ] `ASPNETCORE_ENVIRONMENT=Production` set on the site/app pool.
- [ ] App pool identity has Modify on `uploads\` and `logs\`.
- [ ] HTTPS binding + valid cert; HTTP→HTTPS redirect works.
- [ ] App starts (check `logs\gndj-*.log`); migrations applied (tables exist); super-admin can log in.
- [ ] `app.base_url` setting = `https://new.gndj.org`; send a test email (password reset) to confirm SMTP.
- [ ] `demande.enabled` and `demande.scout_year` set as desired for the public enrollment portal.

---

## 8. Firewall & network

- Inbound **80 + 443** open to the internet (or your network).
- **5432 (PostgreSQL) bound to localhost only** — never expose it publicly.
- DNS: `new.gndj.org` **A record → server public IP**.

---

## 9. Caching — what to consider

The app **already** does the server-side caching that matters at this scale; the main thing *you* add at
deploy time is **static-asset cache headers**.

**Already built in (no action needed):**
- **Response compression** (gzip + brotli) for API responses — `UseResponseCompression`.
- **Output caching** on read-heavy public endpoints — `ShortCache` (2 min) / `LookupData` (10 min).
  The base policy is **no-cache**, so authenticated API responses are never cached. (In-memory, per
  process — fine for a single server.)
- **Settings cache** (5-min refresh) and a general memory cache.

**You should configure at deploy time:**
1. **SPA static assets** — Vite emits content-hashed filenames (`index-AbC123.js`), so they're immutable
   and can be cached **forever**, while `index.html` must be revalidated so new deploys are picked up.
   Add to `client/dist`'s served folder (via a `web.config` in `wwwroot`, or static-file middleware):
   - `/assets/*` (hashed) → `Cache-Control: public, max-age=31536000, immutable`
   - `index.html` → `Cache-Control: no-cache` (must-revalidate)
   This is the single most important caching setting — it makes the app fast **and** avoids users getting
   a stale shell after an update.
2. **Avoid double compression** — since ASP.NET Core compresses API responses, **disable IIS *dynamic*
   compression** for the app (leave **static** compression on for the SPA's `.js/.css`). Otherwise IIS
   re-compresses already-compressed responses (wasted CPU).

**Optional / later:**
- A CDN or **Cloudflare** in front of `new.gndj.org` can cache the public site (units/news/pages — all
  `ShortCache`-friendly and anonymous) and serve TLS/edge. Not needed for a single-org server, but easy to
  add later since the public pages are anonymous and cache-friendly.
- If you ever run **multiple app instances** (scale-out), the in-memory output/settings caches would need
  to become distributed (Redis). Single server → not applicable.

**Net answer:** yes, but it's mostly already handled — just set the static-asset cache headers (immutable
hashed assets + no-cache `index.html`) and turn off IIS dynamic compression. Everything else is in place.

---

## 10. Changing the domain later

Because the client uses the **relative** `/api/v1`, switching `new.gndj.org` → the final domain needs
**no client rebuild**. Steps when you switch:
1. DNS A record for the new host → server IP.
2. IIS: add the new **HTTPS binding** + cert (and the new host on the :80 binding); remove the old once
   cut over.
3. Update `AllowedHosts` (if restricted) and the in-app **`app.base_url`** setting to the new
   `https://...` (so email links use it).
4. `Jwt:Issuer/Audience` are the constant `"GNDJ"` (not host-based) — **no change needed**.
5. No CORS to update (same-origin).

---

## 11. Backups, logs, monitoring

- **Database**: schedule `pg_dump` (e.g. nightly via Task Scheduler) →
  `pg_dump -U gndj_admin -F c -f gndj_YYYYMMDD.dump gndj`. Keep off-box copies.
- **Uploads**: back up `C:\inetpub\gndj\uploads` (the only file state outside the DB).
- **Logs**: `logs\gndj-*.log` (30-day rolling) + `application_logs` table (Warning+). Watch these after
  go-live.
- **Updates/redeploy**: stop the site (or app pool) → copy new `publish/` over → start. The app
  re-runs migrations on start. Consider IIS *Application Initialization* to avoid first-hit cold start.

---

## 12. Pre-production hardening backlog (track separately)

- [ ] Secrets out of source → `appsettings.Production.json`/env vars (covered above). **Do this.**
- [ ] httpOnly-cookie refresh tokens — today the JWT lives in `localStorage` (XSS exposure). Over HTTPS
      it's acceptable for launch; moving the refresh token to an httpOnly cookie is a future hardening.
- [ ] Encrypt/externalize SMTP credentials stored in the DB.
- [ ] Consider a dedicated PostgreSQL backup/retention policy + restore drill.

---

## 13. Updating the app (redeploy) — the easy way

**One command** (run on the server, which needs the .NET SDK + Node.js to build):
```powershell
./deploy/update.ps1 -Target C:\inetpub\gndj    # first time — the target is then remembered
./deploy/update.ps1                            # every time after
./deploy/update.ps1 -Pull                      # git pull --ff-only first, then build + ship
```
`update.ps1` just chains the two scripts below (build → ship) and remembers the target in
`deploy\target.txt` (git-ignored). **No IIS reconfiguration** — you only do §6 once.

Under the hood it runs the two stages, which you can also call separately:

**Build** (dev box or the server, with .NET SDK + Node.js):
```powershell
./deploy/publish.ps1          # → builds API + client into .\publish
```

**Ship** (on the server, or pointing `-Target` at a UNC share of the site folder):
```powershell
./deploy/deploy.ps1 -Source .\publish -Target C:\inetpub\gndj
```

`deploy.ps1` does a near-zero-downtime swap:
1. drops `app_offline.htm` so ANCM stops the app gracefully and releases the DLL locks (no manual app-pool
   stop, no file-lock errors),
2. `robocopy`s the new files over — **preserving `uploads\`, `logs\`, and `appsettings.Production.json`**
   (they're never copied or purged),
3. removes `app_offline.htm`; the app restarts and re-runs EF migrations automatically on the first request.

**Getting `publish/` to the server** — pick whatever fits:
- Build **on the server** (install the .NET SDK + Node there) → run both scripts locally. Simplest.
- Build on the dev box → copy `publish/` to the server via RDP drive redirection / a file share, then run
  `deploy.ps1` there.
- Build on the dev box → run `deploy.ps1 -Target \\SERVER\gndj$` against an SMB share of the site folder.
- **Automated remote push** (optional): enable PowerShell Remoting (WinRM) and wrap it, or use **IIS Web
  Deploy** (`msdeploy`) for a single-command push from CI. Overkill for now, but available.

Roll-forward only; to **roll back**, keep the previous `publish/` folder and re-run `deploy.ps1` with it.

Tip: a DB migration ships automatically with the code (runs on startup). If a release adds a migration,
the first request after deploy applies it — take a `pg_dump` first (see §11) for anything risky.

---

## 14. Cloudflare (optional, recommended for the public site)

Cloudflare gives free edge TLS, DDoS protection, a global cache for the anonymous public pages, and a WAF.
Because the app is same-origin, it sits cleanly in front of `new.gndj.org`.

### Setup
1. **Add the zone**: add `gndj.org` to Cloudflare and switch the registrar's **nameservers** to the two
   Cloudflare assigns. (This moves DNS for the whole domain — coordinate it.)
2. **DNS record**: `A  new  →  <server public IP>`, **Proxied** (orange cloud).
3. **Origin TLS**: keep a valid cert on IIS so Cloudflare can talk to the origin securely. Best option:
   create a **Cloudflare Origin Certificate** (free, 15-year) and bind it in IIS for `new.gndj.org`
   (replaces, or coexists with, the Let's Encrypt cert). Then set **SSL/TLS mode = Full (strict)**.
4. **SSL/TLS → Edge Certificates**: turn on **Always Use HTTPS** and **Automatic HTTPS Rewrites**; enable
   **HSTS** at the edge (the app also sends HSTS).

### Caching rules (important — don't cache the API)
The origin already sends the right cache headers (immutable hashed assets, `no-cache` `index.html`), and
Cloudflare respects them. Add one safety rule so dynamic/authenticated traffic is never cached:
- **Cache Rule**: if URI path starts with `/api/` → **Bypass cache**.
- Leave the default on for `/assets/*` (Cloudflare caches them at the edge per the origin's
  `max-age=1y, immutable`). `index.html` stays uncached because the origin says `no-cache`.
- Optional: a Cache Rule for `/assets/*` → "Eligible for cache, respect origin TTL" to be explicit.

### Restore the real client IP (REQUIRED if proxied) ⚠
When Cloudflare proxies, every request reaches the origin from a **Cloudflare IP**. The app partitions
**rate limiting by client IP** (`ctx.Connection.RemoteIpAddress`), so without a fix all visitors collapse
into one bucket — a start-of-year login/registration burst could trip the 429 limiter globally. The fix is
**already implemented**: when enabled, the app reads the true client IP from Cloudflare's `CF-Connecting-IP`
header, but **only trusts it for connections coming from Cloudflare's own IP ranges** (otherwise the header
is spoofable and the per-IP limiter could be bypassed). It is **off by default**.

**Flip the switch** — on the server only, once traffic is actually proxied through Cloudflare. In
`appsettings.Production.json` (next to the API), set:

```json
{
  "Cloudflare": { "Enabled": true }
}
```

That's the only change needed. The Cloudflare IP ranges are pre-seeded in `appsettings.json`
(`Cloudflare:IpRanges`) — you normally don't touch them; update that list only if Cloudflare ever changes
its published ranges (https://www.cloudflare.com/ips/). Restart the app pool (or redeploy) after flipping it.

- **Do NOT enable it** unless Cloudflare proxying is on — if the origin is reachable directly, a spoofed
  `CF-Connecting-IP` would only be honoured from a real Cloudflare peer anyway (the range check protects
  you), but leaving it off avoids any ambiguity.
- **Defense-in-depth**: also restrict the Windows firewall so 80/443 accept connections **only from
  Cloudflare's ranges**, so the origin can't be reached directly at all.
- Verify after enabling: hit the site and check `logs\gndj-*.log` — the `RemoteIP` on request lines should
  be the **visitor's** IP, not a Cloudflare `104.x/172.x` address.

### What Cloudflare does NOT change
- The relative `/api` SPA calls and same-origin model are unaffected.
- `app.base_url` stays `https://new.gndj.org`.
- The app's own compression/output-cache/rate-limit still run at the origin (belt and braces).

---

## Appendix A — Alternative: IIS static + reverse proxy (no code change)

If you prefer not to add SPA hosting to the API:
1. **Site 1** `new.gndj.org` → physical path = `client/dist` (static SPA). Add a `web.config` with:
   - URL Rewrite + **ARR** rule: `^api/(.*)` → reverse-proxy to `http://localhost:5000/api/{R:1}`.
   - SPA fallback rule: non-file requests → `/index.html`.
2. **Site 2** (API) → the published `GNDJ.Api`, ANCM, bound to **localhost:5000** only.
3. Install **ARR (Application Request Routing)** + **URL Rewrite** modules.
4. **Add `UseForwardedHeaders`** to the API — behind the ARR proxy, `RemoteIpAddress` would otherwise be
   `127.0.0.1`, which **breaks per-IP rate limiting** (all clients share one bucket). Configure it to
   read `X-Forwarded-For` from the proxy.

Trade-off: no code change to the API, but more IIS moving parts (ARR), and you must wire forwarded headers
correctly. The single-site topology (§0–§6) is simpler and preferred.
