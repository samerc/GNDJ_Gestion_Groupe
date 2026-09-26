-- Camp names are now automatic: "Camp BP <second year of the scout year>" (2026-2027 -> "Camp BP 2027").
-- Align existing camps whose scout year has the usual YYYY-YYYY shape. Idempotent.
UPDATE camps
SET name = 'Camp BP ' || trim(split_part(scout_year, '-', 2))
WHERE scout_year ~ '^\s*[0-9]{4}\s*-\s*[0-9]{4}\s*$'
  AND name <> 'Camp BP ' || trim(split_part(scout_year, '-', 2));
