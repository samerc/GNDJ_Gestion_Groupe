"""Stage demande decisions from the CG's working Excel.

Layout expected (the CG's file):
  * one sheet per ACCEPTED unit, named with the unit code or name (M2, R1, C3, NOYAU…) — the kids accepted into it;
  * the main sheet "Demandes" — any kid of it NOT found in a unit sheet is DECLINED with the default rejection
    reason (Paramètres → Inscriptions → Motifs de refus, "faute de place").
Other sheets (Codes, stats…) are ignored: a sheet counts as a unit only if its name is an active unit code/name.
Columns are found from the header row (Réf., Prénom, Nom, Naissance, Genre, Décision); a sheet without a header
uses the export order (with or without the Réf. column in A).

Rows are matched by Réf. (demande id) when present, else by first + last name (accents/case/spaces ignored, swapped
first/last accepted), narrowed by date of birth when several demandes share a name. Nothing is guessed: unmatched /
ambiguous rows are listed and skipped, side notes written next to a row (e.g. "r2 r3 ???") are shown, and demandes
of that gender absent from the file are listed (left untouched). Decisions are only STAGED (same as the review
page) — nothing reaches families until the CG clicks "Envoyer les réponses".

Usage (dry run first, then --apply):
  python apply_decisions.py "Demandes_2026-2027.xlsx" --gender Masculin --email you@… [--apply]
  (boys and girls are separate runs: a run never touches the other gender)
The password is asked, or read from GNDJ_PASSWORD.
"""
import argparse, difflib, getpass, os, json, re, sys, unicodedata, urllib.request, urllib.error
from datetime import date, datetime

import openpyxl

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GNDJ-demande-decisions"  # Cloudflare blocks the default urllib UA
MAIN_SHEET = "Demandes"
GUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
# Header text (normalised) → field. Matched with startswith, so "Réf. (ne pas modifier)" and
# "Décision (code unité ou motif)" are found too.
HEADERS = {"ref": ("ref",), "first": ("prenom",), "last": ("nom",), "dob": ("naissance", "datedenaissance"),
           "gender": ("genre",), "decision": ("decision",)}


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


def read_rows(ws):
    """One dict per child row: id (Réf. if any), first, last, dob, gender, decision cell, notes (anything written
    after the Décision column). Columns come from the header row when there is one."""
    rows = [r for r in ws.iter_rows(values_only=True) if r and any(c not in (None, "") for c in r)]
    cols, start = None, 0
    for n, r in enumerate(rows[:5]):
        ks = [key(c) for c in r]
        if "prenom" in ks and "nom" in ks:
            cols = {}
            for name, starts in HEADERS.items():
                idx = next((x for x, k in enumerate(ks) if k and any(k.startswith(h) for h in starts)), None)
                if idx is not None:
                    cols[name] = idx
            start = n + 1
            break
    out = []
    for r in rows[start:]:
        c = cols
        if c is None:  # no header: export order, shifted by one when column A holds the Réf.
            o = 1 if GUID.match(str(r[0] or "").strip()) else 0
            c = {"first": o, "last": o + 1, "dob": o + 2, "gender": o + 3, "decision": o + 10}
            if o:
                c["ref"] = 0

        def get(name):
            return r[c[name]] if name in c and c[name] < len(r) else None

        first, last = str(get("first") or "").strip(), str(get("last") or "").strip()
        has_ref = GUID.match(str(get("ref") or "").strip())
        if not first and not last and not has_ref:  # a row with only a Réf. is still a demande (name erased)
            continue
        if not last and not get("dob") and not get("gender") and not has_ref:
            out.append({"heading": first})  # a section title the CG typed ("7ème", "Caravelles en plus")
            continue
        ref = str(get("ref") or "").strip()
        dec = c.get("decision")
        notes = [str(v).strip() for v in (r[dec + 1:] if dec is not None else []) if v not in (None, "")]
        out.append({"id": ref.lower() if GUID.match(ref) else None, "first": first, "last": last,
                    "dob": parse_dob(get("dob")), "gender": key(get("gender")),
                    "decision": str(get("decision") or "").strip(), "notes": notes})
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
    login = api.call("POST", "/auth/login", {"email": a.email, "password": a.password or os.environ.get("GNDJ_PASSWORD") or getpass.getpass("Mot de passe : "), "rememberMe": False})
    api.token = login["accessToken"]

    occupancy = api.call("GET", f"/demandes/occupancy?scoutYear={a.year}")
    units = {u["unitCode"].upper(): u for u in occupancy}
    # A sheet may be named with the unit code (R1) or its name (NOYAU → the "Noyau" unit).
    unit_by_sheet = {key(u["unitCode"]): u["unitCode"].upper() for u in occupancy}
    for u in occupancy:
        unit_by_sheet.setdefault(key(u["unitName"]), u["unitCode"].upper())
    reasons = api.call("GET", "/demandes/rejection-reasons")
    default = next((r for r in reasons if r.get("isDefault")), None)
    if not default:
        sys.exit("Aucun motif de refus par défaut (Paramètres → Inscriptions → Motifs de refus).")
    decline_text = default["text"]

    # Only this gender: the other one is decided in a separate run (its kids may still sit in the main sheet).
    everyone = [d for d in api.call("GET", f"/demandes?scoutYear={a.year}") if d["status"] != "Draft"]
    demandes = [d for d in everyone if key(d.get("gender")) == key(a.gender)]
    mine = {d["id"]: d for d in demandes}
    other_ids = {d["id"] for d in everyone} - set(mine)
    other = key("Féminin" if a.gender == "Masculin" else "Masculin")
    by_name = {}
    for d in demandes:
        by_name.setdefault((key(d["firstName"]), key(d["lastName"])), []).append(d)

    def find(row):
        """[demande] (1 = match, 0 = none, 2+ = ambiguous), or None when the row is the other gender's."""
        if row["id"]:
            if row["id"] in mine:
                return [mine[row["id"]]]
            if row["id"] in other_ids:
                return None
        c = (by_name.get((key(row["first"]), key(row["last"])))
             or by_name.get((key(row["last"]), key(row["first"]))) or [])
        if len(c) > 1 and row["dob"]:
            c = [d for d in c if d.get("dateOfBirth") == row["dob"]] or c
        if not c and row["gender"] == other:
            return None
        return c

    def label_of(row, where):
        return f"{row['first']} {row['last']} ({row['dob'] or 'sans date'}) [{where}]"

    wb = openpyxl.load_workbook(a.file, data_only=True)
    decisions = {}   # demande id -> (status, unitCode|None)
    problems, notes, headings = [], [], []
    main_codes = []  # (row, label, code written in the main sheet) — checked once placements are known

    def suggest(row):
        """Closest demande (not yet placed by the file) to an unmatched row, to spot a spelling difference."""
        names = {f"{d['firstName']} {d['lastName']}": d for d in demandes}
        hit = difflib.get_close_matches(f"{row['first']} {row['last']}", list(names), n=1, cutoff=0.75)
        if not hit:
            return ""
        d = names[hit[0]]
        return f" — sur le site : {hit[0]} ({d.get('dateOfBirth') or 'sans date'}) ?"

    # 1. Accepted: every sheet named after an active unit.
    for ws in wb.worksheets:
        code = unit_by_sheet.get(key(ws.title))
        if not code or ws.title == MAIN_SHEET:
            continue
        for row in read_rows(ws):
            if "heading" in row:
                headings.append(f"« {row['heading']} » [{ws.title.strip()}]"); continue
            c = find(row)
            if c is None:
                continue
            label = label_of(row, ws.title.strip())
            # Anything written beside the child that isn't just this unit's code is shown for a human look.
            extra = [n for n in row["notes"] + ([row["decision"]] if row["decision"] else []) if key(n) != key(code)]
            if extra:
                notes.append(f"{label} : « {' | '.join(extra)} »")
            if len(c) != 1:
                problems.append(("INTROUVABLE" if not c else "AMBIGU", label + (suggest(row) if not c else ""))); continue
            prev = decisions.get(c[0]["id"])
            if prev and prev[1] != code:
                problems.append(("DEUX UNITÉS", f"{label} — déjà dans {prev[1]}")); continue
            decisions[c[0]["id"]] = ("Approved", code)

    # 2. Declined: every kid of the main sheet not accepted above.
    for row in read_rows(wb[MAIN_SHEET]):
        if "heading" in row:
            headings.append(f"« {row['heading']} » [{MAIN_SHEET}]"); continue
        if row["gender"] == other:
            continue
        c = find(row)
        if c is None:
            continue
        label = label_of(row, "refus")
        if len(c) != 1:
            problems.append(("INTROUVABLE" if not c else "AMBIGU", label + (suggest(row) if not c else ""))); continue
        decisions.setdefault(c[0]["id"], ("Declined", None))
        extra = row["notes"] + ([row["decision"]] if row["decision"] else [])
        if extra:
            main_codes.append((c[0]["id"], row, extra))

    # A note in the main sheet is only worth a look when it disagrees with the placement (the CG often repeats
    # the unit code there for the kids he copied into that unit's sheet).
    for did, row, extra in main_codes:
        placed = decisions[did][1]
        odd = [n for n in extra if not placed or key(n) != key(placed)]
        if odd:
            where = f"accepté(e) en {placed}" if placed else "refusé(e)"
            notes.append(f"{row['first']} {row['last']} [feuille {MAIN_SHEET}, {where}] : « {' | '.join(odd)} »")

    untouched = [d for d in demandes if d["id"] not in decisions]

    todo, same, locked = [], 0, []
    for did, (status, code) in decisions.items():
        d = mine[did]
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
    for n in notes:
        print(f"  ✎ NOTE À VÉRIFIER : {n}")
    for h in headings:
        print(f"  · ligne de titre ignorée : {h}")
    for d in untouched:
        print(f"  ? PAS DANS LE FICHIER (non touchée) : {d['firstName']} {d['lastName']} ({d.get('dateOfBirth') or 'sans date'}) — {d['status']}")

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
