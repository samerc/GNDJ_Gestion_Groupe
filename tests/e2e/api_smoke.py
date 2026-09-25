"""
GNDJ end-to-end API smoke tests - run against the LOCAL dev API before every deploy.

Covers what breaks users first: sign-in (password, lockout), one session per device, access control between
roles, the main pages' endpoints, data quality + bounce webhooks, and the public site. Every check cleans up
after itself through the API (sessions signed out, test bounces removed), so it can be run again and again.

Standard library only.  Usage:  python tests/e2e/api_smoke.py
Settings (environment variables, defaults = the dev database after deploy/dev-sync-from-prod.ps1):
  GNDJ_API        http://localhost:5000/api/v1
  GNDJ_PASSWORD   Gndj2026!            (every dev login)
  GNDJ_ADMIN      admin@gndj.local     (super-admin)
  GNDJ_CG         giorgio.rizk@scouts.gndj   (chef de groupe)
  GNDJ_CU         wissam.azouri@scouts.gndj  (chef d'unite)
  GNDJ_YOUTH      fayez.a.boudaher@scouts.gndj (plain member)
  GNDJ_WEBHOOK_TOKEN   dev-webhook-token (EmailBounces:WebhookToken in appsettings.Development.json)
Refuses to run against anything but localhost (it signs in/out and records test bounces).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

API = os.environ.get("GNDJ_API", "http://localhost:5000/api/v1").rstrip("/")
PWD = os.environ.get("GNDJ_PASSWORD", "Gndj2026!")
ADMIN = os.environ.get("GNDJ_ADMIN", "admin@gndj.local")
CG = os.environ.get("GNDJ_CG", "giorgio.rizk@scouts.gndj")
CU = os.environ.get("GNDJ_CU", "wissam.azouri@scouts.gndj")
YOUTH = os.environ.get("GNDJ_YOUTH", "fayez.a.boudaher@scouts.gndj")
WEBHOOK_TOKEN = os.environ.get("GNDJ_WEBHOOK_TOKEN", "dev-webhook-token")

if "localhost" not in API and "127.0.0.1" not in API:
    sys.exit(f"Refusing to run against {API}: these tests are for the local dev API only.")

PHONE_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/153.0 Mobile Safari/537.36"
PC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0 Safari/537.36"

results: list[tuple[str, bool]] = []


def check(name: str, ok: bool, detail="") -> None:
    ok = bool(ok)
    results.append((name, ok))
    print(("  PASS " if ok else "  FAIL ") + name + ("" if ok or detail == "" else f"   [{detail}]"))


def section(title: str) -> None:
    print(f"\n== {title}")


def call(method: str, path: str, body=None, token: str | None = None, ua: str = "gndj-e2e"):
    """Returns (status, parsed JSON or raw bytes or None)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", ua)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            try:
                return r.status, (json.loads(raw) if raw else None)
            except ValueError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw


def login(email: str, ua: str = "gndj-e2e", remember: bool = True) -> dict:
    s, b = call("POST", "/auth/login", {"email": email, "password": PWD, "rememberMe": remember}, ua=ua)
    if s != 200:
        sys.exit(f"Cannot sign in as {email} ({s} {b}). Is the dev API running with the dev data?")
    return b


def text(b) -> str:
    return json.dumps(b, ensure_ascii=False) if not isinstance(b, bytes) else b.decode("utf-8", "replace")


def main() -> int:
    try:
        with urllib.request.urlopen(API.replace("/api/v1", "") + "/health", timeout=15) as r:
            healthy = r.status == 200
    except Exception as e:  # noqa: BLE001
        sys.exit(f"The API is not reachable ({e}). Start it first (see tests/e2e/README.md).")
    section("Health")
    check("GET /health", healthy)

    admin = login(ADMIN)["accessToken"]
    cg = login(CG)["accessToken"]
    cu_auth = login(CU)
    cu = cu_auth["accessToken"]
    youth_auth = login(YOUTH)
    youth = youth_auth["accessToken"]
    to_sign_out = [admin, cg, cu, youth]

    try:
        # ---------------------------------------------------------------- sign-in
        section("Sign-in")
        s, b = call("POST", "/auth/login", {"email": CU, "password": "wrong-password"})
        check("wrong password refused with a generic message", s == 401 and "incorrect" in text(b).lower(), (s, b))
        s, b = call("POST", "/auth/login", {"email": "  " + CU.upper() + " ", "password": PWD})
        check("login ignores case and spaces", s == 200, s)
        if s == 200:
            to_sign_out.append(b["accessToken"])
        s, me = call("GET", "/auth/me", token=cu)
        check("/auth/me returns the member", s == 200 and me.get("memberId"), s)
        s, boot = call("GET", "/auth/bootstrap", token=cu)
        check("/auth/bootstrap (first paint in one call)", s == 200 and "me" in boot, s)

        ghost = f"e2e-{uuid.uuid4().hex[:8]}@scouts.gndj"
        for i in range(5):
            call("POST", "/auth/login", {"email": ghost, "password": f"x{i}"})
        s, b = call("POST", "/auth/login", {"email": ghost, "password": "x"})
        check("5 failures lock the email (unknown emails too)", s == 401 and "Trop de tentatives" in text(b), (s, b))

        # ---------------------------------------------------------------- sessions per device
        section("One session per device")
        phone = login(CU, PHONE_UA)
        pc = login(CU, PC_UA)
        s, p2 = call("POST", "/auth/refresh", {"refreshToken": phone["refreshToken"], "rememberMe": True}, ua=PHONE_UA)
        check("phone stays signed in after signing in on the PC", s == 200, s)
        s, _ = call("POST", "/auth/refresh", {"refreshToken": phone["refreshToken"], "rememberMe": True}, ua=PHONE_UA)
        check("lost refresh response: old token accepted once more (grace)", s == 200, s)
        s, pc2 = call("POST", "/auth/refresh", {"refreshToken": pc["refreshToken"], "rememberMe": True}, ua=PC_UA)
        check("PC refreshes too", s == 200, s)
        s, devices = call("GET", "/auth/devices", token=pc2["accessToken"], ua=PC_UA)
        check("Mes appareils lists the devices, this one first", s == 200 and len(devices) >= 2 and devices[0]["isCurrent"], s)
        s, _ = call("POST", "/auth/logout", token=pc2["accessToken"], ua=PC_UA)
        s2, _ = call("POST", "/auth/refresh", {"refreshToken": pc2["refreshToken"]}, ua=PC_UA)
        check("logout signs out this device only", s == 204 and s2 == 401, (s, s2))
        to_sign_out.append(p2["accessToken"])

        # ---------------------------------------------------------------- access control
        section("Access control")
        youth_member = youth_auth["memberId"]
        cu_member = cu_auth["memberId"]
        s, _ = call("GET", f"/members/{youth_member}", token=youth)
        check("member reads their own file", s == 200, s)
        s, _ = call("GET", f"/members/{cu_member}", token=youth)
        check("member cannot read someone else's file", s in (400, 403, 404), s)
        s, lst = call("GET", "/members?pageSize=5", token=youth)
        check("member gets no member list", s in (403, 200) and (s == 403 or lst.get("totalCount", 0) == 0), (s, lst if s != 200 else lst.get("totalCount")))
        for path in ["/audit-logs", "/sessions", "/data-quality", "/settings", "/demandes?scoutYear=2026-2027"]:
            s, _ = call("GET", path, token=cu)
            check(f"CU refused on {path}", s == 403, s)
        s, _ = call("GET", "/sessions", token=admin)
        check("super-admin reads Sessions actives", s == 200, s)

        # ---------------------------------------------------------------- main screens
        section("Main screens")
        s, dash = call("GET", "/dashboard/overview", token=cg)
        check("CG dashboard overview", s == 200, s)
        s, m = call("GET", "/members?pageSize=5", token=cg)
        check("CG members list", s == 200 and m.get("totalCount", 0) > 0, s)
        s, _ = call("GET", f"/members/{youth_member}", token=cg)
        check("CG opens a member file", s == 200, s)
        s, _ = call("GET", "/rentree/tasks?scoutYear=2026-2027", token=cg)
        check("CG rentree checklist", s == 200, s)
        units = (me.get("unitAccess") or []) if isinstance(me, dict) else []
        if units:
            s, _ = call("GET", f"/dashboard/unit/{units[0]['unitId']}", token=cu)
            check("CU unit roster", s == 200, s)
        s, _ = call("GET", "/cotisations/summary?scoutYear=2026-2027", token=cg)
        check("cotisation summary", s == 200, s)
        s, _ = call("GET", "/notifications/unread-count", token=youth)
        check("notification count", s == 200, s)

        # ---------------------------------------------------------------- data quality + bounces
        section("Data quality + bounce webhooks")
        s, rep = call("GET", "/data-quality", token=cg)
        check("Qualite des donnees report", s == 200 and rep["activeMembers"] > 0, s)
        s, _ = call("POST", "/email/webhooks/smtp2go/not-the-token", {"event": "bounce", "rcpt": "x@example.com"})
        check("webhook with a wrong token refused", s == 401, s)
        addr = f"e2e-bounce-{uuid.uuid4().hex[:8]}@example.com"
        s, _ = call("POST", f"/email/webhooks/smtp2go/{WEBHOOK_TOKEN}", {"event": "bounce", "rcpt": addr, "bounce": "hard"})
        s2, rep = call("GET", "/data-quality", token=cg)
        bounced = next((i for sec in rep["sections"] if sec["key"] == "bounced-email" for i in sec["items"] if addr in i["detail"]), None)
        check("a reported bounce appears on the report", s == 200 and bounced is not None, (s, s2))
        if bounced:
            s, _ = call("DELETE", f"/data-quality/bounces/{bounced['bounceId']}", token=cg)
            check("Reactiver removes it", s == 204, s)

        # ---------------------------------------------------------------- system health + configuration
        section("System health + configuration")
        s, st = call("GET", "/system/status", token=admin)
        check("super-admin reads the Systeme page", s == 200 and isinstance(st.get("problems"), list), s)
        if s == 200:
            job_keys = {j["key"] for j in st["jobs"]}
            check("every background job reports in", {"email-outbox", "push-outbox", "member-purge", "document-campaign",
                                                      "rentree-reminders", "log-maintenance", "ops-alert"} <= job_keys, sorted(job_keys))
            failing = [j["label"] for j in st["jobs"] if j["failing"]]
            check("no background job failing", not failing, failing)
            check("no email stuck in the outbox", st["email"]["stuck"] == 0, st["email"]["stuck"])
        s, _ = call("GET", "/system/status", token=cg)
        check("CG refused on the Systeme page", s == 403, s)
        s, tpl = call("GET", "/system/email-templates-check", token=admin)
        check("every email template's {{variables}} are known", s == 200 and not [i for i in tpl if i["severity"] == "error"],
              [i["message"] for i in tpl][:3] if s == 200 else s)
        s, cfg = call("GET", "/system/settings-check", token=admin)
        check("settings are consistent (no error)", s == 200 and not [i for i in cfg if i["severity"] == "error"],
              [i["message"] for i in cfg][:3] if s == 200 else s)
        s, _ = call("GET", "/system/settings-check", token=cg)
        check("CG sees the settings check", s == 200, s)
        s, _ = call("GET", "/system/settings-check", token=cu)
        check("CU refused on the settings check", s == 403, s)
        s, orph = call("GET", "/system/orphan-files", token=admin)
        check("stray-file scan runs", s == 200 and "count" in orph, s)

        # ---------------------------------------------------------------- in-app guides (Aide)
        section("Guides (Aide) access")
        def slugs(tok):
            st, b = call("GET", "/help", token=tok)
            return st, {d["slug"] for d in (b or [])} if st == 200 else set()
        st, anon = slugs(None)
        check("anonymous: only the public enrolment guide", st == 200 and anon == {"guide-inscription"}, anon)
        st, y = slugs(youth)
        check("member: member guide, no leader guide", "guide-membre" in y and "guide-chef-unite" not in y, y)
        st, c = slugs(cu)
        check("CU: CU guide, no CG / admin guide", "guide-chef-unite" in c and not c & {"guide-chef-groupe", "guide-administration"}, c)
        st, g = slugs(cg)
        check("CG: CG guide, no admin / technical guide", "guide-chef-groupe" in g and not g & {"guide-administration", "documentation-technique"}, g)
        st, a = slugs(admin)
        check("super-admin: every guide", {"guide-administration", "documentation-technique", "guide-chef-groupe"} <= a, a)
        st, _ = call("GET", "/help/documentation-technique", token=cu)
        check("CU refused on the technical documentation", st == 404, st)
        st, _ = call("GET", "/help/img/cu-passage.png")
        check("leader screenshots not served anonymously", st == 404, st)

        # ---------------------------------------------------------------- public site + portal
        section("Public site + enrolment portal")
        for path in ["/public/site-config", "/public/units", "/public/news", "/public/events", "/public/maintenance", "/applicant/config"]:
            s, _ = call("GET", path)
            check(f"anonymous GET {path}", s == 200, s)
        s, _ = call("GET", "/members?pageSize=1")
        check("anonymous refused on member data", s == 401, s)
    finally:
        for t in to_sign_out:
            call("POST", "/auth/logout", token=t)

    passed = sum(1 for _, ok in results if ok)
    print(f"\n{passed}/{len(results)} API checks passed")
    for name, ok in results:
        if not ok:
            print(f"  FAILED: {name}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
