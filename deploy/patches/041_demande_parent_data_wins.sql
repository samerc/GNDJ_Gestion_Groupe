-- « The demande wins »: when a demande was converted and one of its parents already existed in the group, the
-- existing parent record kept its old family name / profession / field of work. The family's demande is the latest
-- information, so it replaces them (only when the demande gives a value). Matched like the conversion: the parent
-- linked to the created member with the same first name. Idempotent. The conversion itself is fixed (2026-10-08).
UPDATE guardians g
SET last_name = coalesce(nullif(trim(x.last_name), ''), g.last_name),
    profession = coalesce(nullif(trim(x.profession), ''), g.profession),
    profession_domain = coalesce(nullif(trim(x.profession_domain), ''), g.profession_domain),
    updated_at = now()
FROM (
  SELECT DISTINCT ON (g2.id) g2.id AS guardian_id, ag.last_name, ag.profession, ag.profession_domain
  FROM demandes d
  JOIN members m ON m.id = d.created_member_id AND NOT m.is_deleted
  JOIN applicant_guardians ag ON ag.applicant_account_id = d.applicant_account_id AND NOT ag.is_deleted
  JOIN guardian_links l ON l.member_id = m.id AND NOT l.is_deleted
  JOIN guardians g2 ON g2.id = l.guardian_id AND NOT g2.is_deleted
   AND lower(f_unaccent(trim(g2.first_name))) = lower(f_unaccent(trim(ag.first_name)))
  WHERE NOT d.is_deleted AND d.created_member_id IS NOT NULL
  ORDER BY g2.id, d.response_sent_at DESC
) x
WHERE g.id = x.guardian_id
  AND (   (nullif(trim(x.last_name), '') IS NOT NULL AND g.last_name IS DISTINCT FROM trim(x.last_name))
       OR (nullif(trim(x.profession), '') IS NOT NULL AND g.profession IS DISTINCT FROM trim(x.profession))
       OR (nullif(trim(x.profession_domain), '') IS NOT NULL AND g.profession_domain IS DISTINCT FROM trim(x.profession_domain)));
