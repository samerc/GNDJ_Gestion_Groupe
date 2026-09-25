# End-to-end smoke tests

Quick checks of the flows people use every day, run against the **local dev app** before each deploy.
They complement the .NET unit tests (`dotnet test GNDJ.slnx`), which test logic in isolation.

| Script | What it checks | Needs |
|---|---|---|
| `api_smoke.py` | sign-in + lockout, one session per device, access control between roles (youth / CU / CG / super-admin), main screens' endpoints, data quality + bounce webhooks, public site + parent portal | API on :5000 |
| `ui_smoke.mjs` | login pages, CU roster + member file, phone back button, installed-app back button, offline screen, admin pages, no JavaScript errors | API + frontend on :5173 + Microsoft Edge |

## Run

```powershell
# once
cd tests/e2e; npm install

# before each deploy (from the repo root)
powershell -ExecutionPolicy Bypass -File tests/e2e/run.ps1          # API + browser
powershell -ExecutionPolicy Bypass -File tests/e2e/run.ps1 -ApiOnly # API only (no frontend needed)
```

Expected: `ALL SMOKE TESTS PASSED - OK to deploy.` Anything else: read the `FAILED:` lines.

## Data

Written for the dev database produced by `deploy/dev-sync-from-prod.ps1` (every login's password is `Gndj2026!`).
The test accounts can be changed with environment variables (see the top of each script): `GNDJ_ADMIN`, `GNDJ_CG`,
`GNDJ_CU`, `GNDJ_YOUTH`, `GNDJ_PASSWORD`, `GNDJ_API`, `GNDJ_APP`, `GNDJ_BROWSER`, `GNDJ_WEBHOOK_TOKEN`.

The scripts **refuse to run against anything but localhost**: they sign in and out and record a test email bounce
(removed again at the end). Never point them at prod.

## Adding a check

Add it to the matching section with `check("what it proves", condition)`. Keep checks independent and undo any
change you make (sign sessions out, delete what you created) so the suite can be run again and again.
