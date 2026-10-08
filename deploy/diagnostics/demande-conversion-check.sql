-- Demande → member conversion check (READ-ONLY: nothing is changed).
-- For every demande of the year that was accepted and answered, compares the member it created with what the
-- family filled in. Each section lists only the PROBLEMS (an empty section = all good).
--
-- Run on the server (scout year in the first line):
--   $env:PGCLIENTENCODING='UTF8'
--   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U gndj_admin -d gndj -v year="'2026-2027'" -f deploy\diagnostics\demande-conversion-check.sql > C:\gndj-backups\conversion-check.txt
\pset pager off
\pset footer on

-- The accepted + answered demandes of the year and the member each created.
CREATE TEMP TABLE conv AS
SELECT d.*, m.id AS m_id, m.is_deleted AS m_deleted
FROM demandes d
LEFT JOIN members m ON m.id = d.created_member_id
WHERE NOT d.is_deleted AND d.scout_year = :year AND d.status = 'Approved' AND d.response_sent_at IS NOT NULL;

\echo
\echo '== 0. Summary'
SELECT count(*) AS accepted_and_answered,
       count(m_id) FILTER (WHERE NOT m_deleted) AS with_member,
       count(*) FILTER (WHERE m_id IS NULL OR m_deleted) AS without_member
FROM conv;

\echo
\echo '== 1. Accepted and answered but no member (or member deleted)'
SELECT serial_number, first_name, last_name, created_member_id, m_deleted FROM conv WHERE m_id IS NULL OR m_deleted;

\echo
\echo '== 2. Member file differs from the demande (name, birth date, gender, school, classe, nationality, blood type)'
SELECT c.serial_number, c.first_name || ' ' || c.last_name AS demande, m.card_number,
       concat_ws(' | ',
         CASE WHEN m.first_name IS DISTINCT FROM c.first_name OR m.last_name IS DISTINCT FROM c.last_name THEN 'nom: ' || m.first_name || ' ' || m.last_name END,
         CASE WHEN m.date_of_birth IS DISTINCT FROM c.date_of_birth THEN 'naissance: ' || coalesce(m.date_of_birth::text,'-') || ' vs ' || coalesce(c.date_of_birth::text,'-') END,
         CASE WHEN m.gender IS DISTINCT FROM c.gender THEN 'genre: ' || coalesce(m.gender,'-') || ' vs ' || coalesce(c.gender,'-') END,
         CASE WHEN coalesce(m.school,'') <> coalesce(c.school,'') THEN 'école: ' || coalesce(m.school,'-') || ' vs ' || coalesce(c.school,'-') END,
         CASE WHEN coalesce(m.classe,'') <> coalesce(c.classe,'') THEN 'classe: ' || coalesce(m.classe,'-') || ' vs ' || coalesce(c.classe,'-') END,
         CASE WHEN coalesce(m.nationality,'') <> coalesce(c.nationality,'') THEN 'nationalité: ' || coalesce(m.nationality,'-') || ' vs ' || coalesce(c.nationality,'-') END,
         CASE WHEN coalesce(m.blood_type,'') <> coalesce(c.blood_type,'') THEN 'groupe sanguin: ' || coalesce(m.blood_type,'-') || ' vs ' || coalesce(c.blood_type,'-') END
       ) AS differences
FROM conv c JOIN members m ON m.id = c.m_id
WHERE m.first_name IS DISTINCT FROM c.first_name OR m.last_name IS DISTINCT FROM c.last_name
   OR m.date_of_birth IS DISTINCT FROM c.date_of_birth OR m.gender IS DISTINCT FROM c.gender
   OR coalesce(m.school,'') <> coalesce(c.school,'') OR coalesce(m.classe,'') <> coalesce(c.classe,'')
   OR coalesce(m.nationality,'') <> coalesce(c.nationality,'') OR coalesce(m.blood_type,'') <> coalesce(c.blood_type,'');
-- (A difference here is normal if a chef corrected the fiche since the conversion.)

\echo
\echo '== 3. Medical information from the demande not on the member'
SELECT c.serial_number, c.first_name || ' ' || c.last_name AS member,
       CASE WHEN coalesce(c.allergies,'') <> '' AND coalesce(m.allergies,'') = '' THEN 'allergies manquantes' END AS allergies,
       CASE WHEN coalesce(c.medical_notes,'') <> '' AND coalesce(m.medical_notes,'') = '' THEN 'remarques médicales manquantes' END AS medical
FROM conv c JOIN members m ON m.id = c.m_id
WHERE (coalesce(c.allergies,'') <> '' AND coalesce(m.allergies,'') = '')
   OR (coalesce(c.medical_notes,'') <> '' AND coalesce(m.medical_notes,'') = '');

\echo
\echo '== 4. Login account missing or disabled'
SELECT c.serial_number, c.first_name || ' ' || c.last_name AS member, u.email AS identifiant, u.is_active
FROM conv c LEFT JOIN users u ON u.member_id = c.m_id AND NOT u.is_deleted
WHERE c.m_id IS NOT NULL AND (u.id IS NULL OR NOT u.is_active);

\echo
\echo '== 5. Not placed in the decided unit (no active post there)'
SELECT c.serial_number, c.first_name || ' ' || c.last_name AS member, un.name AS decided_unit,
       (SELECT string_agg(u2.name, ', ') FROM member_assignments a2 JOIN units u2 ON u2.id = a2.unit_id
         WHERE a2.member_id = c.m_id AND a2.end_date IS NULL AND NOT a2.is_deleted) AS active_posts
FROM conv c LEFT JOIN units un ON un.id = c.decided_unit_id
WHERE c.m_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM member_assignments a WHERE a.member_id = c.m_id AND a.unit_id = c.decided_unit_id AND a.end_date IS NULL AND NOT a.is_deleted);

\echo
\echo '== 6. No « Entrée » progression for the unit'
SELECT c.serial_number, c.first_name || ' ' || c.last_name AS member, un.name AS unit
FROM conv c JOIN units un ON un.id = c.decided_unit_id
WHERE c.m_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM member_progressions p JOIN scout_stages s ON s.id = p.scout_stage_id
  WHERE p.member_id = c.m_id AND NOT p.is_deleted AND lower(s.name) LIKE 'entr%');

\echo
\echo '== 7. A parent of the demande is not linked to the member'
SELECT c.serial_number, c.first_name || ' ' || c.last_name AS member, ag.relationship, ag.first_name || ' ' || ag.last_name AS parent_in_demande
FROM conv c JOIN applicant_guardians ag ON ag.applicant_account_id = c.applicant_account_id AND NOT ag.is_deleted
WHERE c.m_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM guardian_links l JOIN guardians g ON g.id = l.guardian_id
  WHERE l.member_id = c.m_id AND NOT l.is_deleted AND NOT g.is_deleted
    AND lower(f_unaccent(trim(g.first_name))) = lower(f_unaccent(trim(ag.first_name))));

\echo
\echo '== 8. Linked to an EXISTING parent record whose other children have a different family name (check it is the right person)'
SELECT c.serial_number, c.first_name || ' ' || c.last_name AS member, g.first_name || ' ' || g.last_name AS parent,
       string_agg(DISTINCT o.first_name || ' ' || o.last_name, ', ') AS parent_s_other_children
FROM conv c
JOIN guardian_links l ON l.member_id = c.m_id AND NOT l.is_deleted
JOIN guardians g ON g.id = l.guardian_id AND NOT g.is_deleted
JOIN guardian_links l2 ON l2.guardian_id = g.id AND l2.member_id <> c.m_id AND NOT l2.is_deleted
JOIN members o ON o.id = l2.member_id AND NOT o.is_deleted
WHERE g.created_at < c.response_sent_at - interval '1 minute'
GROUP BY c.serial_number, c.first_name, c.last_name, g.first_name, g.last_name
-- Family names compared on letters only, and one containing the other counts as the same (EL-HADDAD / EL HADDAD,
-- NICOLAS-ASSAF / ASSAF).
HAVING bool_and(
  position(regexp_replace(lower(f_unaccent(o.last_name)), '[^a-z]', '', 'g') in regexp_replace(lower(f_unaccent(c.last_name)), '[^a-z]', '', 'g')) = 0
  AND position(regexp_replace(lower(f_unaccent(c.last_name)), '[^a-z]', '', 'g') in regexp_replace(lower(f_unaccent(o.last_name)), '[^a-z]', '', 'g')) = 0);

\echo
\echo '== 9. A parent phone / email from the demande is not on the linked parent (same number written differently is fine)'
SELECT c.serial_number, c.first_name || ' ' || c.last_name AS member, ag.first_name AS parent,
       CASE WHEN coalesce(ag.phone_number,'') <> '' AND NOT EXISTS (
              SELECT 1 FROM guardian_links l JOIN guardian_phones gp ON gp.guardian_id = l.guardian_id AND NOT gp.is_deleted
              WHERE l.member_id = c.m_id AND NOT l.is_deleted
                AND right(regexp_replace(gp.number, '\D', '', 'g'), 7) = right(regexp_replace(ag.phone_number, '\D', '', 'g'), 7))
            THEN 'téléphone ' || ag.phone_number END AS missing_phone,
       CASE WHEN coalesce(ag.email,'') <> '' AND NOT EXISTS (
              SELECT 1 FROM guardian_links l JOIN guardian_emails ge ON ge.guardian_id = l.guardian_id AND NOT ge.is_deleted
              WHERE l.member_id = c.m_id AND NOT l.is_deleted AND lower(trim(ge.address)) = lower(trim(ag.email)))
            THEN 'email ' || ag.email END AS missing_email
FROM conv c JOIN applicant_guardians ag ON ag.applicant_account_id = c.applicant_account_id AND NOT ag.is_deleted
WHERE c.m_id IS NOT NULL AND (
  (coalesce(ag.phone_number,'') <> '' AND NOT EXISTS (
     SELECT 1 FROM guardian_links l JOIN guardian_phones gp ON gp.guardian_id = l.guardian_id AND NOT gp.is_deleted
     WHERE l.member_id = c.m_id AND NOT l.is_deleted
       AND right(regexp_replace(gp.number, '\D', '', 'g'), 7) = right(regexp_replace(ag.phone_number, '\D', '', 'g'), 7)))
  OR (coalesce(ag.email,'') <> '' AND NOT EXISTS (
     SELECT 1 FROM guardian_links l JOIN guardian_emails ge ON ge.guardian_id = l.guardian_id AND NOT ge.is_deleted
     WHERE l.member_id = c.m_id AND NOT l.is_deleted AND lower(trim(ge.address)) = lower(trim(ag.email)))));

\echo
\echo '== 10. Household data not copied (address, main contact email, parents situation)'
SELECT c.serial_number, c.first_name || ' ' || c.last_name AS member,
       concat_ws(' | ',
         CASE WHEN (coalesce(a.address_city,'') <> '' OR coalesce(a.address_details,'') <> '')
                   AND NOT EXISTS (SELECT 1 FROM member_addresses ma WHERE ma.member_id = c.m_id AND NOT ma.is_deleted) THEN 'adresse' END,
         CASE WHEN coalesce(a.primary_contact_email,'') <> '' AND coalesce(m.primary_contact_email,'') = '' THEN 'email principal' END,
         CASE WHEN coalesce(a.parents_situation,'') <> '' AND coalesce(m.parents_situation,'') = '' THEN 'situation des parents' END
       ) AS missing
FROM conv c JOIN members m ON m.id = c.m_id JOIN applicant_accounts a ON a.id = c.applicant_account_id
WHERE ((coalesce(a.address_city,'') <> '' OR coalesce(a.address_details,'') <> '')
        AND NOT EXISTS (SELECT 1 FROM member_addresses ma WHERE ma.member_id = c.m_id AND NOT ma.is_deleted))
   OR (coalesce(a.primary_contact_email,'') <> '' AND coalesce(m.primary_contact_email,'') = '')
   OR (coalesce(a.parents_situation,'') <> '' AND coalesce(m.parents_situation,'') = '');

\echo
\echo '== 11. Possible duplicate: another member with the same name and birth date (child already in the group?)'
SELECT c.serial_number, c.first_name || ' ' || c.last_name AS new_member, nm.card_number AS new_card,
       o.card_number AS other_card, o.first_name || ' ' || o.last_name AS other_member,
       (SELECT string_agg(u.name, ', ') FROM member_assignments a JOIN units u ON u.id = a.unit_id
         WHERE a.member_id = o.id AND NOT a.is_deleted) AS other_units
FROM conv c JOIN members nm ON nm.id = c.m_id
JOIN members o ON o.id <> c.m_id AND NOT o.is_deleted
  AND o.date_of_birth = c.date_of_birth
  AND lower(f_unaccent(o.first_name)) = lower(f_unaccent(c.first_name))
  AND lower(f_unaccent(o.last_name)) = lower(f_unaccent(c.last_name));

\echo
\echo '== 12. Children of the same family account not linked as brothers/sisters (fixed by patch 039)'
SELECT a.contact_name AS family, string_agg(c.first_name || ' ' || c.last_name, ', ') AS children,
       count(DISTINCT m.sibling_group_id) AS sibling_groups, count(*) FILTER (WHERE m.sibling_group_id IS NULL) AS not_linked
FROM conv c JOIN members m ON m.id = c.m_id JOIN applicant_accounts a ON a.id = c.applicant_account_id
GROUP BY a.id, a.contact_name
HAVING count(*) >= 2 AND (count(DISTINCT m.sibling_group_id) <> 1 OR count(*) FILTER (WHERE m.sibling_group_id IS NULL) > 0);

\echo
\echo '== 13. A brother/sister already in the group (confirmed by the CG) not linked to the new member'
SELECT c.serial_number, c.first_name || ' ' || c.last_name AS new_member, o.first_name || ' ' || o.last_name AS declared_sibling
FROM conv c JOIN members m ON m.id = c.m_id
JOIN applicant_scout_relations r ON r.applicant_account_id = c.applicant_account_id AND NOT r.is_deleted AND r.related_member_id IS NOT NULL
  AND lower(f_unaccent(r.relationship)) SIMILAR TO '%(frere|soeur|sœur)%'
JOIN members o ON o.id = r.related_member_id AND NOT o.is_deleted
WHERE m.sibling_group_id IS NULL OR m.sibling_group_id IS DISTINCT FROM o.sibling_group_id;

\echo
\echo '== 14. Card number (matricule) missing or shared'
SELECT c.serial_number, c.first_name || ' ' || c.last_name AS member, m.card_number,
       (SELECT count(*) FROM members x WHERE x.card_number = m.card_number AND NOT x.is_deleted) AS members_with_this_number
FROM conv c JOIN members m ON m.id = c.m_id
WHERE coalesce(m.card_number,'') = '' OR (SELECT count(*) FROM members x WHERE x.card_number = m.card_number AND NOT x.is_deleted) > 1;

DROP TABLE conv;
