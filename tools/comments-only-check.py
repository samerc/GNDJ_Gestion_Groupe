"""Checks that a diff only touches COMMENTS (used after a "documentation pass" so no code slips in by accident).

    python tools/comments-only-check.py [git diff range, default: the working tree vs HEAD]

For every .cs / .ts / .tsx / .mjs file in the diff, each added or removed line must be blank or a comment line
(// …, /// …, /* … */ block lines, * …, {/* … */} in JSX). Prints the offending lines and exits 1 if any.
A line that mixes code and a trailing comment counts as CODE (and is reported) — rewrite such edits by hand.
"""
import re
import subprocess
import sys

COMMENT = re.compile(r"^\s*(//.*|/\*.*|\*.*|\*/.*|\{/\*.*\*/\}\s*)$")
EXTS = (".cs", ".ts", ".tsx", ".mjs")


def main() -> int:
    rng = sys.argv[1:] or []
    diff = subprocess.run(["git", "diff", "-U0", *rng], capture_output=True, text=True, encoding="utf-8").stdout
    bad, file, checked = [], None, 0
    for line in diff.splitlines():
        if line.startswith("+++ "):
            file = line[6:] if line.startswith("+++ b/") else None
            continue
        if line.startswith("--- ") or line.startswith("@@"):
            continue
        if not file or not file.endswith(EXTS):
            continue
        if line[:1] in "+-":
            body = line[1:]
            checked += 1
            if body.strip() and not COMMENT.match(body):
                bad.append(f"{file}: {line}")
    for b in bad:
        print(b)
    print(f"{checked} changed line(s) checked, {len(bad)} non-comment line(s).")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
