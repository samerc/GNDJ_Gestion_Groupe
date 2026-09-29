"""Stage demande decisions from the CG's working Excel (no Réf. column).

Layout expected (the CG's file):
  * one sheet per ACCEPTED unit, named with the unit code (M2, M3, M10, T3, T10…) — the kids accepted into it;
  * the main sheet "Demandes" — every demande; any kid NOT found in a unit sheet is DECLINED with the default
    rejection reason (Paramètres → Inscriptions → Motifs de refus, "faute de place").
Other sheets (Codes, stats…) are ignored: a sheet counts as a unit only if its name is an active unit code.

Rows are matched to demandes by first + last name (accents/case/spaces ignored, swapped first/last accepted),
narrowed by date of birth when several demandes share a name. Nothing is guessed: unmatched / ambiguous rows are
listed and skipped. Decisions are only STAGED (same as the review page) — nothing reaches families until the CG
clicks "Envoyer les réponses".

Usage (dry run first, then --apply):
  python apply_decisions.py "Demandes_2026-2027.xlsx" --gender Masculin --email you@… [--apply]
  (then again with --gender Féminin once the girls' unit sheets are ready)
"""
import argparse, getpass, json, re, sys, unicodedata, urllib.request, urllib.error
from datetime import date, datetime

import openpyxl

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GNDJ-demande-decisions"  # Cloudflare blocks the default urllib UA
MAIN_SHEET = "Demandes"


def key(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s.lower())


def parse_dob(v):
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    m = re.match(r"^\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*$", str(v or ""))
    return f"{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}" if m else None


class Api:
    def __init__(self, base):
        self.base, self.token = base.rstrip("/") + "/api/v1", None

    def call(self, method, path, body=None):
        req = urllib.request.Request(self.base + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Content-Type": "application/json", "User-Agent": UA,
                                              **({"Authorization": "Bearer " + self.token} if self.token else {})})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{method} {path} → {e.code} {e.read().decode(errors='replace')[:300]}")


def read_rows(ws, skip_gender=None):
    """(first, last, dob) for every non-empty row; skips a header row whose first cell is 'Prénom', and rows whose
    Genre column (D) is skip_gender."""
    out = []
    for r in ws.iter_rows(values_only=True):
        if not r or not (r[0] or (len(r) > 1 and r[1])):
            continue
        if key(r[0]) == "prenom":
            continue
        if skip_gender and len(r) > 3 and key(r[3]) == skip_gender:
            continue
        out.append((str(r[0] or "").strip(), str(r[1] or "").strip(), parse_dob(r[2] if len(r) > 2 else None)))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--base-url", default="https://gndj.org")
    ap.add_argument("--email", required=True)
    ap.add_argument("--password")
    ap.add_argument("--year", default="2026-2027")
    ap.add_argument("--gender", required=True, choices=["Masculin", "Féminin"],
                    help="only decide demandes of this gender (the CG does boys and girls separately)")
    ap.add_argument("--apply", action="store_true", help="actually stage the decisions (default: dry run)")
    a = ap.parse_args()

    api = Api(a.base_url)
    login = api.call("POST", "/auth/login", {"email": a.email, "password": a.password or getpass.getpass("Mot de passe : "), "rememberMe": False})
    api.token = login["accessToken"]

    units = {u["unitCode"].upper(): u for u in api.call("GET", f"/demandes/occupancy?scoutYear={a.year}")}
    reasons = api.call("GET", "/demandes/rejection-reasons")
    default = next((r for r in reasons if r.get("isDefault")), None)
    if not default:
        sys.exit("Aucun motif de refus par défaut (Paramètres → Inscriptions → Motifs de refus).")
    decline_text = default["text"]

    # Only this gender: the other one is decided in a separate run (its kids may still sit in the main sheet).
    demandes = [d for d in api.call("GET", f"/demandes?scoutYear={a.year}")
                if d["status"] != "Draft" and key(d.get("gender")) == key(a.gender)]
    by_name = {}
    for d in demandes:
        by_name.setdefault((key(d["firstName"]), key(d["lastName"])), []).append(d)

    def find(first, last, dob):
        c = by_name.get((key(first), key(last))) or by_name.get((key(last), key(first))) or []
        if len(c) > 1 and dob:
            c = [d for d in c if d.get("dateOfBirth") == dob] or c
        return c

    wb = openpyxl.load_workbook(a.file, data_only=True)
    decisions = {}   # demande id -> (status, unitCode|None)
    problems = []

    # 1. Accepted: every sheet named after an active unit.
    for ws in wb.worksheets:
        code = ws.title.strip().upper()
        if code not in units:
            continue
        for first, last, dob in read_rows(ws):
            c = find(first, last, dob)
            label = f"{first} {last} ({dob or 'sans date'}) [{code}]"
            if len(c) != 1:
                problems.append(("INTROUVABLE" if not c else "AMBIGU", label)); continue
            prev = decisions.get(c[0]["id"])
            if prev and prev[1] != code:
                problems.append(("DEUX UNITÉS", f"{label} — déjà dans {prev[1]}")); continue
            decisions[c[0]["id"]] = ("Approved", code)

    # 2. Declined: every kid of the main sheet not accepted above.
    other = key("Féminin" if a.gender == "Masculin" else "Masculin")
    for first, last, dob in read_rows(wb[MAIN_SHEET], skip_gender=other):
        c = find(first, last, dob)
        label = f"{first} {last} ({dob or 'sans date'}) [refus]"
        if len(c) != 1:
            problems.append(("INTROUVABLE" if not c else "AMBIGU", label)); continue
        decisions.setdefault(c[0]["id"], ("Declined", None))

    by_id = {d["id"]: d for d in demandes}
    untouched = [d for d in demandes if d["id"] not in decisions]

    todo, same, locked = [], 0, []
    for did, (status, code) in decisions.items():
        d = by_id[did]
        name = f"{d['firstName']} {d['lastName']}"
        if d.get("createdMemberId") or d.get("responseSentAt"):
            locked.append(f"{name} (réponse déjà envoyée)"); continue
        unit_id = units[code]["unitId"] if code else None
        if d["status"] == status and (d.get("decidedUnitId") == unit_id if code else True):
            same += 1; continue
        todo.append((did, status, unit_id, code, name, d["status"]))

    acc = sum(1 for t in todo if t[1] == "Approved"); dec = len(todo) - acc
    print(f"Demandes {a.year} — {a.gender} (hors brouillons) : {len(demandes)}")
    print(f"À accepter : {acc}   À refuser : {dec}   Déjà ainsi : {same}")
    for code in sorted({t[3] for t in todo if t[3]}):
        print(f"  {code} : {sum(1 for t in todo if t[3] == code)}")
    for kind, label in problems:
        print(f"  ! {kind} : {label}")
    for x in locked:
        print(f"  ! VERROUILLÉE : {x}")
    for d in untouched:
        print(f"  ? PAS DANS LE FICHIER (non touchée) : {d['firstName']} {d['lastName']} — {d['status']}")

    if not a.apply:
        print("\nSimulation uniquement. Relancez avec --apply pour enregistrer ces décisions.")
        return
    ok = 0
    for did, status, unit_id, code, name, _ in todo:
        try:
            api.call("PUT", f"/demandes/{did}/decide", {"status": status, "decidedUnitId": unit_id,
                                                        "decisionNotes": None if status == "Approved" else decline_text})
            ok += 1
        except RuntimeError as e:
            print(f"  ✗ {name} : {e}")
    print(f"\n{ok}/{len(todo)} décisions enregistrées. Rien n'est envoyé aux familles avant « Envoyer les réponses ».")


if __name__ == "__main__":
    main()
