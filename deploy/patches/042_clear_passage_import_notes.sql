-- WEBDEV passage markers ("Passage20", "Passage21") were typed on the passage lines in 2020/2021. The import copied
-- each one onto every yearly copy of the function (one assignment per scout year), so it shows on many posts
-- (dev copy: 702 posts, ~300 members). They carry no information for anyone: cleared. Only the exact marker is
-- matched (any spacing / case), never a real note. Idempotent. The import tool drops them too (2026-10-08).
UPDATE member_assignments
SET notes = NULL, updated_at = now()
WHERE notes ~* '^\s*passage\s*[0-9]{2,4}\s*$';
