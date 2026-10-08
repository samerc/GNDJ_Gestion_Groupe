-- When a demande was converted and one of its parents already existed in the group (matched by email/phone +
-- first name), the phone / email typed in the demande was NOT added to that parent — the member file kept only
-- the old contacts. Copy them now: for each converted member, each demande parent → the linked parent with the same
-- first name gets the demande's phone (unless the same number is already there, compared on the last 7 digits) and
-- email (unless already there, case-insensitive). Idempotent. The conversion itself is fixed (2026-10-08).
INSERT INTO guardian_phones (id, guardian_id, country_code, number, type, is_primary, created_at, updated_at, is_deleted)
SELECT gen_random_uuid(), x.guardian_id, coalesce(x.cc, ''), x.number, 'Mobile', false, now(), now(), false
FROM (
  SELECT DISTINCT ON (g.id, right(regexp_replace(ag.phone_number, '\D', '', 'g'), 7))
         g.id AS guardian_id, ag.phone_country_code AS cc, ag.phone_number AS number
  FROM demandes d
  JOIN members m ON m.id = d.created_member_id AND NOT m.is_deleted
  JOIN applicant_guardians ag ON ag.applicant_account_id = d.applicant_account_id AND NOT ag.is_deleted
  JOIN guardian_links l ON l.member_id = m.id AND NOT l.is_deleted
  JOIN guardians g ON g.id = l.guardian_id AND NOT g.is_deleted
   AND lower(f_unaccent(trim(g.first_name))) = lower(f_unaccent(trim(ag.first_name)))
  WHERE NOT d.is_deleted AND d.created_member_id IS NOT NULL
    AND length(regexp_replace(coalesce(ag.phone_number, ''), '\D', '', 'g')) >= 6
    AND NOT EXISTS (SELECT 1 FROM guardian_phones gp WHERE gp.guardian_id = g.id AND NOT gp.is_deleted
                    AND right(regexp_replace(gp.number, '\D', '', 'g'), 7) = right(regexp_replace(ag.phone_number, '\D', '', 'g'), 7))
) x;

INSERT INTO guardian_emails (id, guardian_id, address, type, is_primary, created_at, updated_at, is_deleted)
SELECT gen_random_uuid(), x.guardian_id, x.address, 'Personnel', false, now(), now(), false
FROM (
  SELECT DISTINCT ON (g.id, lower(trim(ag.email))) g.id AS guardian_id, trim(ag.email) AS address
  FROM demandes d
  JOIN members m ON m.id = d.created_member_id AND NOT m.is_deleted
  JOIN applicant_guardians ag ON ag.applicant_account_id = d.applicant_account_id AND NOT ag.is_deleted
  JOIN guardian_links l ON l.member_id = m.id AND NOT l.is_deleted
  JOIN guardians g ON g.id = l.guardian_id AND NOT g.is_deleted
   AND lower(f_unaccent(trim(g.first_name))) = lower(f_unaccent(trim(ag.first_name)))
  WHERE NOT d.is_deleted AND d.created_member_id IS NOT NULL
    AND coalesce(trim(ag.email), '') <> ''
    AND NOT EXISTS (SELECT 1 FROM guardian_emails ge WHERE ge.guardian_id = g.id AND NOT ge.is_deleted
                    AND lower(trim(ge.address)) = lower(trim(ag.email)))
) x;
