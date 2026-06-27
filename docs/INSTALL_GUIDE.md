# GNDJ — Step‑by‑Step Installation Guide

This guide takes you from a blank Windows Server to a live GNDJ site at **https://new.gndj.org**.
Follow it **top to bottom**. Every command is meant to be **copy‑pasted exactly** into a PowerShell
window. Where you must type your own value (a password, a path), it is shown like `<THIS>` — replace the
whole thing including the `< >`.

> **Audience:** someone comfortable using Windows but not necessarily IIS or PostgreSQL. You do not need to
> understand the app — just do each step in order.

If something goes wrong, jump to **Appendix A — Troubleshooting** at the bottom.

---

## What you are installing

- A **website** (the GNDJ app) served by **IIS** (the Windows web server).
- Its **database** in **PostgreSQL** (already installed on the server).
- A free **HTTPS certificate** from Let's Encrypt (so the site is `https://`).

When you're done, people open `https://new.gndj.org` in a browser and use the app.

---

## Before you start — gather these

| You need | Notes |
|----------|-------|
| The **`gndj-staging` folder** | The deployment package. Contains `publish\`, the database file `gndj_data_*.dump`, and config samples. Copy it onto the server (e.g. to the Desktop). |
| The **`postgres` password** | The PostgreSQL superuser password (set during install / reset earlier). |
| A new **database password** | You will invent one for the app's DB user `gndj_admin`. Write it down. |
| The **domain** `new.gndj.org` | Its DNS **A record must point to this server's public IP** before the certificate step. |
| **Administrator** access | You'll open PowerShell and IIS Manager "as Administrator". |

How to open **PowerShell as Administrator**: click **Start**, type `powershell`, **right‑click** *Windows
PowerShell*, choose **Run as administrator**. Click **Yes** if Windows asks.

---

## Part 1 — Install the prerequisites

### 1.1 Install the .NET 10 Hosting Bundle (runs the app under IIS)

1. On the server, open a browser and go to **https://dotnet.microsoft.com/download/dotnet/10.0**.
2. Under **ASP.NET Core Runtime 10.x**, download the **Hosting Bundle** (the link literally says
   "Hosting Bundle"). *Not* the SDK, *not* the plain runtime — the **Hosting Bundle**.
3. Run the downloaded installer → **Install** → **Close**.
4. Open **PowerShell as Administrator** and run:
   ```powershell
   iisreset
   dotnet --list-runtimes
   ```
   You should see a line containing **`Microsoft.AspNetCore.App 10.`**. If you do, this step is done.

> The Hosting Bundle also installs IIS's "ASP.NET Core Module", which lets IIS run the app.

### 1.2 Make sure IIS is installed

1. Click **Start**, type **Internet Information Services (IIS) Manager**, press Enter.
2. If it opens, IIS is installed — skip to Part 2.
3. If it's **not** found, install it: open **PowerShell as Administrator** and run:
   ```powershell
   Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole, IIS-WebServer, IIS-StaticContent, IIS-DefaultDocument, IIS-HttpCompressionStatic, IIS-ApplicationInit -All
   ```
   Then re‑run the Hosting Bundle installer from 1.1 (so it can register its IIS module), and `iisreset`.

### 1.3 PostgreSQL

PostgreSQL 18 is already installed on the server. Nothing to install. (We use it in Part 3.)

---

## Part 2 — Put the app files on the server

We'll keep the website files in **`C:\inetpub\www\gndj`** (the standard place).

1. Make sure the **`gndj-staging`** folder is on the server (copy it via Remote Desktop drive sharing, a
   USB drive, or a file share).
2. Open **PowerShell as Administrator** and copy the app into place — **edit the first line** to where your
   `gndj-staging` folder actually is:
   ```powershell
   $pkg = "C:\Users\Samer\Desktop\gndj-staging"     # <-- where you put the gndj-staging folder
   New-Item -ItemType Directory -Force "C:\inetpub\www\gndj" | Out-Null
   Copy-Item "$pkg\publish\*" "C:\inetpub\www\gndj\" -Recurse -Force
   New-Item -ItemType Directory -Force "C:\inetpub\www\gndj\uploads", "C:\inetpub\www\gndj\logs" | Out-Null
   ```
3. Confirm the app is there:
   ```powershell
   Test-Path "C:\inetpub\www\gndj\GNDJ.Api.dll"      # must print True
   ```

Keep your `gndj-staging` folder — you still need the **database file** inside it for Part 3.

---

## Part 3 — Set up the database (with the real data)

You'll create the app's database user and database, turn on one extension, then load the data file.

Open **PowerShell as Administrator** and run the block below. **Edit the two passwords** on the first two
lines first:

```powershell
$bin = "C:\Program Files\PostgreSQL\18\bin"
$env:PGPASSWORD = "<POSTGRES-SUPERUSER-PASSWORD>"   # the 'postgres' password
$AppDbPassword  = "<INVENT-A-STRONG-APP-DB-PASSWORD>"  # NEW password for the app's DB user — write it down

# 1. Create the app's login + empty database
& "$bin\psql.exe" -U postgres -h 127.0.0.1 -d postgres -c "CREATE USER gndj_admin WITH PASSWORD '$AppDbPassword';"
& "$bin\psql.exe" -U postgres -h 127.0.0.1 -d postgres -c "CREATE DATABASE gndj OWNER gndj_admin;"

# 2. Turn on the 'unaccent' extension the app needs (must be done by the superuser)
& "$bin\psql.exe" -U postgres -h 127.0.0.1 -d gndj -c "CREATE EXTENSION IF NOT EXISTS unaccent;"

# 3. Load the data — edit the path to your .dump file inside gndj-staging
& "$bin\pg_restore.exe" --no-owner --no-privileges --role=gndj_admin -h 127.0.0.1 -U postgres -d gndj `
  "C:\Users\Samer\Desktop\gndj-staging\gndj_data_20260626_2002.dump"

# 4. Check it loaded (expect ~2490 members, ~21 units)
& "$bin\psql.exe" -U postgres -h 127.0.0.1 -d gndj -c "SELECT (SELECT count(*) FROM members) AS members, (SELECT count(*) FROM units) AS units;"
Remove-Item Env:\PGPASSWORD
```

**Expected:** step 4 prints something like `members 2493 · units 21`.

> **One harmless error is normal:** during step 3 you may see
> `ERROR: must be owner of extension unaccent ... COMMENT ON EXTENSION` and `errors ignored on restore: 1`.
> Ignore it — it's only a cosmetic description line. As long as step 4 shows the member count, the data is
> loaded.

---

## Part 4 — Configure the app (passwords & secret)

The app reads its database connection and a security key from a file called **`appsettings.Production.json`**
that lives next to the app. We'll create it.

### 4.1 Generate a security key (JWT secret)

In **PowerShell**, run this once and **copy the line it prints**:
```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 4.2 Create `appsettings.Production.json`

Run this — **replace the two `<...>` values** (the app DB password from Part 3, and the key you just
copied):
```powershell
$dbpw   = "<THE-APP-DB-PASSWORD-FROM-PART-3>"
$secret = "<THE-KEY-YOU-JUST-COPIED>"
@"
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=gndj;Username=gndj_admin;Password=$dbpw;Pooling=true;Minimum Pool Size=5;Maximum Pool Size=50;Connection Idle Lifetime=300"
  },
  "Jwt": {
    "Secret": "$secret",
    "Issuer": "GNDJ",
    "Audience": "GNDJ",
    "AccessTokenExpirationMinutes": 15,
    "RefreshTokenExpirationDays": 7
  },
  "SuperAdmin": { "Email": "admin@gndj.local", "Password": "unused-because-data-was-restored" },
  "AllowedHosts": "new.gndj.org"
}
"@ | Set-Content "C:\inetpub\www\gndj\appsettings.Production.json" -Encoding utf8
```

> **Keep this file safe** — it contains the database password. It stays only on the server (never in
> source control). When you deploy updates later, this file is **never overwritten**.

---

## Part 5 — Quick test before IIS (recommended)

This runs the app directly for 1 minute to confirm the database + config are correct, before we involve IIS.

```powershell
cd C:\inetpub\www\gndj
$env:ASPNETCORE_ENVIRONMENT = "Production"
$env:ASPNETCORE_URLS = "http://localhost:5000"
dotnet GNDJ.Api.dll
```
- **Good sign:** the console prints startup lines ending with **`GNDJ API listening on:`** and then sits
  there waiting.
- Open a browser **on the server** and go to `http://localhost:5000` → the GNDJ **login page** should load.
  Log in as **`admin@gndj.local`** (its existing password) → you should see real data.
- **Bad sign:** the program prints an error and exits. Open `C:\inetpub\www\gndj\logs\gndj-*.log` and read the
  last lines (usually a wrong DB password). Fix Part 4 and retry.

Press **Ctrl+C** in the PowerShell window to stop the test. Then continue to IIS.

---

## Part 6 — Set up IIS (the real web server)

Open **Internet Information Services (IIS) Manager** (Start → type "IIS").

### 6.1 Create the Application Pool

1. In the left panel, expand the server, click **Application Pools**.
2. In the right **Actions** panel, click **Add Application Pool…**.
3. Fill in:
   - **Name:** `gndj`
   - **.NET CLR version:** select **No Managed Code**
   - **Managed pipeline mode:** **Integrated**
4. Click **OK**.

### 6.2 Create the Site

1. In the left panel, right‑click **Sites** → **Add Website…**.
2. Fill in:
   - **Site name:** `GNDJ`
   - **Application pool:** click **Select…** and choose **gndj**.
   - **Physical path:** `C:\inetpub\www\gndj`
   - **Binding:** Type **http**, IP **All Unassigned**, Port **80**, **Host name:** `new.gndj.org`
3. Click **OK**. (We add HTTPS in Part 7.)

### 6.3 Tell the site it's "Production"

1. Click the **GNDJ** site in the left panel.
2. Double‑click **Configuration Editor** (in the middle panel; under "Management").
3. At the top, in the **Section** dropdown, paste: `system.webServer/aspNetCore` and press Enter.
4. Find the row **environmentVariables** → click it → click the **`…`** button on the right.
5. In the dialog, click **Add**, set **Name** = `ASPNETCORE_ENVIRONMENT`, **Value** = `Production`, click
   **OK** / close the dialog.
6. Back in Configuration Editor, click **Apply** (top‑right Actions).

### 6.4 Allow large uploads (member documents up to 20 MB)

1. Click the **GNDJ** site → double‑click **Request Filtering** → tab **(leave it)** → in the right
   **Actions** panel click **Edit Feature Settings…**.
2. Set **Maximum allowed content length (Bytes)** = `20971520` → **OK**.

### 6.5 Give the app permission to write uploads & logs

In **PowerShell as Administrator**:
```powershell
icacls "C:\inetpub\www\gndj\uploads" /grant "IIS AppPool\gndj:(OI)(CI)M" /T
icacls "C:\inetpub\www\gndj\logs"    /grant "IIS AppPool\gndj:(OI)(CI)M" /T
```

### 6.6 Restart and test over HTTP

```powershell
iisreset
```
On the server, browse `http://new.gndj.org` (or `http://localhost`) → the login page should load.
(If your DNS isn't pointing here yet, test with `http://localhost` for now.)

---

## Part 7 — Get the HTTPS certificate (Let's Encrypt via win-acme)

This makes the site `https://` with a free certificate that **renews itself automatically**.

> **Two things must be true first:** (a) `new.gndj.org` DNS **points to this server**, and (b) the site is
> **running** and reachable on **port 80 from the internet** (open the firewall for 80 and 443).

1. Download **win-acme** from **https://www.win-acme.com/** (the "Download" button), and unzip it on the
   server (e.g. to `C:\win-acme`).
2. Open **PowerShell as Administrator**, go to that folder, and run it:
   ```powershell
   cd C:\win-acme
   .\wacs.exe
   ```
3. In the menu it shows, type **`N`** and press Enter → **Create certificate (default settings)**.
4. It lists your IIS sites. Choose **GNDJ** (type its number).
5. If it asks which host names, choose **new.gndj.org** (or "all bindings").
6. If prompted, **accept the Let's Encrypt terms** and enter an **email** (for expiry warnings).
7. win-acme will: validate the domain, download the certificate, **add the HTTPS (443) binding to your
   site**, and **create a scheduled task to renew it automatically**. When it finishes, type **`Q`** to
   quit.

Test: browse **https://new.gndj.org** → you should see a **padlock** and the login page.

> **If validation fails:** the most common cause is DNS not pointing at the server yet, or port 80 blocked
> by the firewall. Fix that and re‑run `.\wacs.exe`. (The app is already built to answer Let's Encrypt's
> check, so you don't need to configure anything else.)

### 7.1 Redirect http → https (optional but recommended)

So visitors who type `http://` are sent to `https://`:
1. IIS Manager → click the **GNDJ** site → double‑click **HTTP Redirect** *(if present)*, **or** install
   the free **URL Rewrite** module and add a redirect rule to `https://new.gndj.org`.
2. Simplest: in IIS, select the site → **Bindings** → keep both **http:80** and **https:443** for
   `new.gndj.org`; add the redirect when convenient.

---

## Part 8 — Final checks (first login)

1. Browse **https://new.gndj.org** → log in as **`admin@gndj.local`** with its existing password.
2. Go to **Admin → Paramètres** and set **`app.base_url`** to `https://new.gndj.org` (used in email links
   like password resets).
3. Check **Email / SMTP** settings if you'll send mail; send yourself a test (password reset) to confirm.
4. Look at `C:\inetpub\www\gndj\logs\gndj-*.log` — no repeated errors.

You're live. 🎉

---

## Part 9 — Deploying updates later (the easy way)

When there's a new version of the app, you don't redo any of the above. On the server (which needs the
.NET **SDK** + **Node.js** to rebuild — install those once if you'll build here), from the source code
folder run:
```powershell
.\deploy\update.ps1 -Target C:\inetpub\www\gndj    # first time
.\deploy\update.ps1                            # every time after (target is remembered)
.\deploy\update.ps1 -Pull                      # also pull the latest code first
```
It rebuilds and swaps the files **without losing** your `uploads\`, `logs\`, or `appsettings.Production.json`,
with near‑zero downtime. Database changes in a release apply automatically on the first page load.

> Prefer not to install build tools on the server? Build the package on another machine
> (`.\deploy\publish.ps1`), copy the `publish\` folder over, then run
> `.\deploy\deploy.ps1 -Source .\publish -Target C:\inetpub\www\gndj`.

---

## Part 10 — Switching the domain to gndj.org (later)

When you move from `new.gndj.org` to the final `gndj.org`:
1. Point `gndj.org`'s **DNS A record** at this server.
2. IIS Manager → **GNDJ** site → **Bindings…** → **Add** an `http:80` binding with host `gndj.org` (and one
   for the eventual https).
3. Get a certificate for the new name: run `cd C:\win-acme; .\wacs.exe` again and create a certificate for
   **gndj.org** (it adds the https binding + auto‑renew).
4. Edit `C:\inetpub\www\gndj\appsettings.Production.json`: change `"AllowedHosts"` to `gndj.org` (or
   `new.gndj.org;gndj.org` during the overlap), then `iisreset`.
5. In the app, update **`app.base_url`** (Admin → Paramètres) to `https://gndj.org`.
6. Once everyone uses the new address, remove the old `new.gndj.org` bindings.

No code rebuild is needed — the app uses relative URLs.

---

## Part 11 — Reset the data back to the import (testing only)

While you're **testing** (before real users start), you can wipe whatever you changed and reset the
database back to the clean imported snapshot — the `gndj_data_*.dump` file from the package. A ready
script does it safely.

> ⚠️ **Destructive — use ONLY before go-live.** It deletes *everything* in the database and replaces it
> with the snapshot. Once the group is entering real data, do **not** use this — you'd lose their work
> (use a recent backup instead, see the note at the end).

**Keep the snapshot somewhere stable**, e.g.:
```powershell
New-Item -ItemType Directory -Force C:\gndj-backups | Out-Null
Copy-Item "C:\Users\Samer\Desktop\gndj-staging\gndj_data_20260626_2002.dump" C:\gndj-backups\ -Force
```

**To reset**, open **PowerShell as Administrator**, go to the package folder, and run the script with the
path to the snapshot:
```powershell
cd C:\Users\Samer\Desktop\gndj-staging
.\reset-to-import.ps1 -Dump C:\gndj-backups\gndj_data_20260626_2002.dump
```
- It asks for the **postgres** password, then makes you type **`RESET`** to confirm.
- It stops IIS, reloads the snapshot (~10 seconds), and starts IIS again. The harmless `unaccent COMMENT`
  error appears - ignore it. It prints `members = …` when done.
- Add **`-ClearUploads`** to also empty `C:\inetpub\www\gndj\uploads` (uploaded docs/photos) for a fully
  clean slate:
  ```powershell
  .\reset-to-import.ps1 -Dump C:\gndj-backups\gndj_data_20260626_2002.dump -ClearUploads
  ```

**Make a fresh baseline any time** (e.g. after you set up SMTP/settings you want to keep) so future resets
restore *that* state instead:
```powershell
$bin = "C:\Program Files\PostgreSQL\18\bin"
$env:PGPASSWORD = "<postgres-password>"
& "$bin\pg_dump.exe" -h localhost -U gndj_admin -d gndj --no-owner --no-privileges --exclude-table='_bak_*' -Fc -f "C:\gndj-backups\gndj_baseline_$(Get-Date -Format yyyyMMdd_HHmm).dump"
Remove-Item Env:\PGPASSWORD
```
Then pass that newer file to `-Dump`. **Once you go live, schedule this `pg_dump` (e.g. nightly via Task
Scheduler)** so you always have a recent backup to restore from — that's the real safety net, not the
import snapshot.

---

## Appendix A — Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| **HTTP 500.30 / 500.31** on the page | The app failed to start. Read `C:\inetpub\www\gndj\logs\gndj-*.log`. Usually a wrong DB password in `appsettings.Production.json` (Part 4) or `.NET 10 Hosting Bundle` missing (Part 1.1). |
| **HTTP 502.5** | ASP.NET Core Module can't launch the app — Hosting Bundle not installed, or app pool isn't **No Managed Code**. Re‑check Parts 1.1 and 6.1. |
| **Login page blank / 404 for `/assets/...`** | The React files didn't copy. Re‑do Part 2 (copy `publish\*`, which must include a `wwwroot\` folder with `index.html`). |
| **`pg_restore` "must be owner of extension unaccent"** | Harmless — ignore (see note in Part 3). |
| **Can't connect to DB / password error in logs** | The `gndj_admin` password in `appsettings.Production.json` doesn't match what you set in Part 3. Fix the file, `iisreset`. |
| **win-acme "validation failed"** | DNS for `new.gndj.org` isn't pointing here yet, or port 80 is blocked. Fix DNS/firewall, re‑run `.\wacs.exe`. |
| **Uploads fail / "access denied" in logs** | The app pool can't write `uploads\` or `logs\`. Re‑run the `icacls` commands in Part 6.5. |
| **Large document upload rejected** | Set Request Filtering max length to `20971520` (Part 6.4). |

To **restart the app** any time: `iisreset` (restarts all of IIS), or in IIS Manager select the site →
**Restart** (Actions panel).

---

*This guide installs the version in the `gndj-staging` package. The deeper technical reference (rationale,
caching, backups, alternatives) is in `docs/DEPLOYMENT.md`.*
