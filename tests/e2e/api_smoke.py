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
  GNDJ_CG         christian.asmar@scouts.gndj   (chef de groupe)
  GNDJ_CU         valerie.chedid.el.helou@scouts.gndj  (chef d'unite)
  GNDJ_YOUTH      fayez.a.boudaher@scouts.gndj (plain member)
  GNDJ_WEBHOOK_TOKEN   dev-webhook-token (EmailBounces:WebhookToken in appsettings.Development.json)
Refuses to run against anything but localhost (it signs in/out and records test bounces).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

API = os.environ.get("GNDJ_API", "http://localhost:5000/api/v1").rstrip("/")
PWD = os.environ.get("GNDJ_PASSWORD", "Gndj2026!")
ADMIN = os.environ.get("GNDJ_ADMIN", "admin@gndj.local")
CG = os.environ.get("GNDJ_CG", "christian.asmar@scouts.gndj")
CU = os.environ.get("GNDJ_CU", "valerie.chedid.el.helou@scouts.gndj")
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


def demandes_cg_tools(cg: str, cu: str) -> None:
    """CG tools on the demandes: guards (read-only, always safe), then one throwaway family end to end — invited
    late, a draft the CG submits for the family (accepted into a unit, answered at once when the year's answers went
    out), then « Annuler l'acceptation » without email. Everything it creates is removed in the finally block."""
    section("Demandes (CG tools)")
    s, cs = call("GET", "/demandes/campaign-status", token=cg)
    check("campaign status says if answers went out / submissions are open",
          s == 200 and "responsesSent" in cs and "inSubmissionPeriod" in cs, (s, cs))
    if s != 200:
        return
    year = cs["scoutYear"]
    responses_sent = bool(cs["responsesSent"])

    # Drafts are only listed on request, and never mixed into the normal list.
    s, drafts = call("GET", f"/demandes?scoutYear={year}&status=Draft", token=cg)
    check("Brouillons filter lists drafts only", s == 200 and all(d["status"] == "Draft" for d in drafts), s)
    drafts = drafts if s == 200 else []
    s, listed = call("GET", f"/demandes?scoutYear={year}", token=cg)
    check("normal demandes list never shows drafts", s == 200 and not [d for d in listed if d["status"] == "Draft"], s)
    listed = listed if s == 200 else []

    # « Listes des chefs d'unité »
    s, lists = call("GET", f"/demandes/unit-lists?scoutYear={year}", token=cg)
    check("CG reads the chefs d'unite new-member lists", s == 200 and isinstance(lists, list), s)
    if s == 200 and lists:
        s, xl = call("GET", f"/demandes/unit-lists/{lists[0]['unitId']}/xlsx?scoutYear={year}", token=cg)
        check("a unit's new-members Excel downloads (xlsx)", s == 200 and isinstance(xl, bytes) and xl[:2] == b"PK", s)
    else:
        print("  (no new members this year — Excel download skipped)")

    # Archives of earlier campaigns: by name and by a birth date.
    name = next((d["lastName"] for d in listed if d.get("lastName")), "Khoury")
    s, ar = call("GET", "/demandes/archives?search=" + urllib.parse.quote(name), token=cg)
    check("archives search by name", s == 200 and "items" in ar, s)
    s, ar = call("GET", "/demandes/archives?search=" + urllib.parse.quote("01/01/2015"), token=cg)
    check("archives search by birth date", s == 200 and "items" in ar, s)

    # A chef d'unité has none of these tools (random ids: the permission gate answers before any lookup).
    rid = str(uuid.uuid4())
    s, _ = call("GET", f"/demandes/unit-lists?scoutYear={year}", token=cu)
    check("CU refused on the new-member lists", s == 403, s)
    s, _ = call("POST", f"/demandes/{rid}/submit-for-family", {"decision": None}, token=cu)
    check("CU refused on Soumettre pour la famille", s == 403, s)
    s, _ = call("POST", f"/demandes/{rid}/send-response", token=cu)
    check("CU refused on Envoyer cette reponse", s == 403, s)
    s, _ = call("POST", f"/demandes/{rid}/undo-acceptance", {"decisionNotes": None, "sendRefusalNow": False}, token=cu)
    check("CU refused on Annuler l'acceptation", s == 403, s)

    # Guards on real demandes (each call is refused, so nothing changes).
    if drafts:
        s, b = call("PUT", f"/demandes/{drafts[0]['id']}/decide", {"status": "Declined", "decidedUnitId": None, "decisionNotes": None}, token=cg)
        check("a draft cannot be decided (submit it for the family first)", s == 400 and "brouillon" in text(b), (s, b))
    else:
        print("  (no draft this year — decide-on-draft guard skipped)")
    sent = next((d for d in listed if d.get("responseSentAt")), None)
    if sent:
        s, b = call("POST", f"/demandes/{sent['id']}/send-response", token=cg)
        check("an already answered demande is not sent twice", s == 400 and "déjà été envoyée" in text(b), (s, b))
        s, b = call("POST", f"/demandes/{sent['id']}/submit-for-family", {"decision": None}, token=cg)
        check("Soumettre pour la famille refused on a non-draft", s == 400 and "déjà été soumise" in text(b), (s, b))
    else:
        print("  (no answered demande this year — send-response guards skipped)")

    # ---- one throwaway family, end to end (late invite → draft → CG submits/accepts → undo) ----
    tag = uuid.uuid4().hex[:8]
    email = f"e2e-{tag}@example.com"
    invite_id = account_id = demande_id = None
    try:
        s, inv = call("POST", "/demandes/invites", {"label": f"E2E smoke {tag}", "email": email, "validDays": 1}, token=cg)
        check("CG creates a late-submission invite", s == 200 and inv.get("token"), (s, inv))
        if s != 200:
            return
        invite_id = inv["id"]
        # The invite pre-verifies the email and grants the late window (submissions are closed after the campaign).
        s, auth = call("POST", "/applicant/register", {"email": email, "password": PWD, "contactName": f"E2E Parent {tag}",
                                                        "inviteToken": inv["token"]})
        check("family registers through the invite (email pre-verified)", s == 200 and auth.get("emailVerified"), (s, auth))
        if s != 200:
            return
        account_id, fam = auth["accountId"], auth["accessToken"]
        s, _ = call("POST", "/applicant/accept-terms", token=fam)
        check("family accepts the terms", s == 200, s)

        # A youth unit to accept the child into, and a birth date inside its age range.
        s, occ = call("GET", f"/demandes/occupancy?scoutYear={year}", token=cg)
        youth_units = sorted([u for u in (occ or []) if u.get("gender") in ("Masculin", None) and u.get("ageMin") is not None
                              and u.get("ageMax") is not None and u["ageMax"] <= 17 and u["ageMax"] - u["ageMin"] >= 2],
                             key=lambda u: u["ageMin"]) if s == 200 else []
        check("occupancy lists the units (a youth unit to accept into)", s == 200 and youth_units, s)
        if not youth_units:
            return
        unit = youth_units[0]
        dob = f"{int(time.strftime('%Y')) - unit['ageMin'] - 1}-06-15"

        # Household: a parent with a phone + the parents' situation (both required to submit).
        s, b = call("PUT", "/applicant/household", {
            "contactName": f"E2E Parent {tag}", "addressCountry": "Liban", "addressCity": "Achrafieh", "addressDetails": None,
            "guardians": [{"id": None, "relationship": "Père", "firstName": "E2EPere", "lastName": f"Smoke{tag}", "profession": None,
                           "professionDomain": None, "phoneCountryCode": "+961", "phoneNumber": "03000000", "email": email,
                           "isDeceased": False, "isPrimaryContact": True, "isEmergencyContact": True}],
            "scoutRelations": [], "primaryContactEmail": email, "parentsSituation": "Unis"}, token=fam)
        check("family saves the household (late grant)", s == 200, (s, b))
        child = {"firstName": f"E2E{tag}", "lastName": f"Smoke{tag}", "dateOfBirth": dob, "gender": "Masculin",
                 "nationality": None, "school": "Collège Notre-Dame de Jamhour", "classe": "5ème", "section": None,
                 "bloodType": None, "medicalNotes": None, "allergies": None, "phoneCountryCode": None, "phoneNumber": None,
                 "email": None, "parentNotes": None}
        s, b = call("POST", "/applicant/demandes", {"data": child}, token=fam)
        check("family creates a draft demande (late grant)", s == 200 and b.get("id"), (s, b))
        if s != 200:
            return
        demande_id = b["id"]

        # Incomplete draft (no nationality) → refused with the missing fields; then complete it.
        s, b = call("POST", f"/demandes/{demande_id}/submit-for-family", {"decision": None}, token=cg)
        check("incomplete draft refused (Informations manquantes)", s == 400 and "Informations manquantes" in text(b), (s, b))
        s, _ = call("PUT", f"/applicant/demandes/{demande_id}", {**child, "nationality": "Libanaise"}, token=fam)
        check("family completes the draft", s == 200, s)
        s, drafts = call("GET", f"/demandes?scoutYear={year}&status=Draft", token=cg)
        check("the draft shows in the Brouillons list", s == 200 and any(d["id"] == demande_id for d in drafts), s)

        def review():
            st, rows = call("GET", f"/demandes?scoutYear={year}&accountId={account_id}", token=cg)
            return next((d for d in (rows or []) if d["id"] == demande_id), None) if st == 200 else None

        if not responses_sent:
            # Before the answers go out, a submit just queues it for the batch.
            s, b = call("POST", f"/demandes/{demande_id}/submit-for-family", {"decision": None}, token=cg)
            check("CG submits the draft for the family", s == 200 and b.get("status") == "Submitted" and b.get("serialNumber"), (s, b))
            return

        # Answers already out → accepted and answered at once (member created, emails to smtp4dev).
        s, b = call("POST", f"/demandes/{demande_id}/submit-for-family",
                    {"decision": "Approved", "decidedUnitId": unit["unitId"], "decisionNotes": None, "sendReceivedEmail": False}, token=cg)
        check(f"CG submits + accepts for the family into {unit['unitCode']} (answered at once)",
              s == 200 and b.get("status") == "Approved" and b.get("responseSent") and not b.get("sendError"), (s, b))
        d = review()
        member_id = d and d.get("createdMemberId")
        check("the accepted demande created a member", bool(member_id), d and {k: d.get(k) for k in ("status", "responseSentAt")})
        if not member_id:
            return
        s, _ = call("GET", f"/members/{member_id}", token=cg)
        check("CG opens the new member's file", s == 200, s)
        s, lists = call("GET", f"/demandes/unit-lists?scoutYear={year}", token=cg)
        check("the new member counts in the unit's list", s == 200 and any(x["unitId"] == unit["unitId"] and x["count"] > 0 for x in lists), s)
        s, xl = call("GET", f"/demandes/unit-lists/{unit['unitId']}/xlsx?scoutYear={year}", token=cg)
        check("that unit's Excel downloads", s == 200 and isinstance(xl, bytes) and xl[:2] == b"PK", s)
        s, b = call("POST", "/demandes/unit-lists/send", {"scoutYear": year, "unitIds": [unit["unitId"]]}, token=cg)
        check("CG emails that unit's list to its chefs", s == 200 and b.get("units") == 1, (s, b))
        s, b = call("POST", f"/demandes/{demande_id}/send-response", token=cg)
        check("answered demande: Envoyer cette reponse refused", s == 400, (s, b))

        # « Annuler l'acceptation » without email → refused, file purged, marked answered.
        s, pv = call("GET", f"/demandes/{demande_id}/undo-acceptance/preview", token=cg)
        check("undo preview names the member, nothing blocks", s == 200 and child["firstName"] in pv.get("memberName", "")
              and not pv.get("blocker"), (s, pv))
        s, b = call("POST", f"/demandes/{demande_id}/undo-acceptance", {"decisionNotes": "E2E smoke", "sendRefusalNow": False}, token=cg)
        check("Annuler l'acceptation (no email)", s == 200 and b.get("refusalSent") is False, (s, b))
        d = review()
        check("demande now refused, unlinked, answered silently",
              d is not None and d["status"] == "Declined" and not d.get("createdMemberId") and d.get("responseSentAt"), d and d.get("status"))
        s, _ = call("GET", f"/members/{member_id}", token=cg)
        check("the member file is gone", s in (400, 404), s)
    finally:
        # Undo a half-finished acceptance first (a demande with a member can't be deleted), then remove everything.
        if demande_id:
            st, rows = call("GET", f"/demandes?scoutYear={year}&accountId={account_id}", token=cg)
            left = next((d for d in (rows or []) if d["id"] == demande_id), None) if st == 200 else None
            if left and left.get("createdMemberId"):
                call("POST", f"/demandes/{demande_id}/undo-acceptance", {"decisionNotes": None, "sendRefusalNow": False}, token=cg)
            s, _ = call("DELETE", f"/demandes/{demande_id}", token=cg)
            check("cleanup: throwaway demande deleted", s in (200, 204), s)
        if account_id:
            s, _ = call("DELETE", f"/demandes/accounts/{account_id}", token=cg)
            check("cleanup: throwaway applicant account deleted", s == 200, s)
        if invite_id:
            call("DELETE", f"/demandes/invites/{invite_id}", token=cg)  # already claimed: kept in the trail either way


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
        s, _ = call("GET", f"/members/{cu_member}/emails-received", token=youth)
        check("member cannot read someone else's Emails reçus", s in (400, 403, 404), s)
        today = time.strftime("%Y-%m-%d")
        s, cal = call("GET", f"/calendar?from={today}&to={today}", token=youth)
        check("member reads the calendar", s == 200 and isinstance(cal, list), s)
        s, _ = call("POST", "/calendar/events", {"title": "Smoke", "startDate": today, "audience": "Group", "recurrence": "None",
                                                  "recurrenceInterval": 1, "publishOnSite": False}, token=youth)
        check("member cannot create a calendar event", s == 400, s)
        s, _ = call("GET", "/calendar/feed/doesnotexist.ics")
        check("unknown phone-calendar link refused", s == 404, s)
        s, _ = call("GET", f"/documents/online-form?memberId={cu_member}&documentTypeId={cu_member}", token=youth)
        check("member cannot open someone else's online form", s == 400, s)
        s, _ = call("POST", "/documents/online-form", {"memberId": youth_member, "documentTypeId": youth_member, "templateHash": "x",
                                                        "answers": {}, "signerName": "Smoke", "signerRelation": "Mère",
                                                        "signaturePng": "", "certified": False}, token=youth)
        check("online form without signature refused", s == 400, s)
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
        s, er = call("GET", f"/members/{youth_member}/emails-received", token=cg)
        check("CG reads a member's Emails reçus", s == 200 and "emails" in er, s)
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

        # ---------------------------------------------------------------- Camp BP grand jeu (read-only)
        section("Camp BP grand jeu")
        s, camps = call("GET", "/camps", token=cg)
        live = [c for c in (camps or []) if not c.get("isArchived")] if s == 200 else []
        if live:
            cid = live[0]["id"]
            s, rot = call("GET", f"/camps/{cid}/rotation", token=cg)
            check("CG reads the rotation", s == 200 and "slots" in rot, s)
            s, _ = call("GET", f"/camps/{cid}/lookup?q=ab", token=cu)
            check("CU may use the famille lookup", s == 200, s)
            s, _ = call("GET", f"/camps/{cid}/lookup?q=ab", token=youth)
            check("member refused on the famille lookup", s == 400, s)
            s, _ = call("GET", f"/camps/{cid}/matches", token=youth)
            check("member refused on the scores", s == 400, s)
            s, _ = call("GET", f"/camps/{cid}/ranking", token=cg)
            check("CG reads the ranking", s == 200, s)
        else:
            print("  (no active camp — grand jeu checks skipped)")

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

        # ---------------------------------------------------------------- demandes (CG tools)
        demandes_cg_tools(cg, cu)

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
