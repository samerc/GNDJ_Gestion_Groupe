-- READ-ONLY. Finds passage lines that may have been damaged by the old bulk "Pas de changement" bug
-- (before 2026-09-27 it gave every selected member the FIRST member's équipe + fonction).
-- Lists same-unit, not-leaving, not-yet-published lines whose proposed équipe or fonction differs from the member's
-- current one, when several lines of the same unit were saved in the same second (= one bulk click).
-- Real équipe/fonction changes also appear here: check each line with the CU, then fix it on the passage page.
WITH cur AS (
  SELECT DISTINCT ON (member_id) member_id, team_id, functional_role_id
  FROM member_assignments WHERE end_date IS NULL AND NOT is_deleted
  ORDER BY member_id, start_date DESC),
lines AS (
  SELECT p.*, date_trunc('second', p.created_at) AS batch
  FROM passages p
  WHERE NOT p.is_deleted AND p.status <> 'Finalized' AND NOT p.is_leaving
    AND p.proposed_unit_id = p.current_unit_id),
batches AS (SELECT current_unit_id, batch FROM lines GROUP BY 1, 2 HAVING count(*) >= 3)
SELECT u.code AS unite, l.batch AS enregistre_le, m.last_name || ' ' || m.first_name AS membre,
       ct.name AS equipe_actuelle, pt.name AS equipe_proposee,
       cr.name AS fonction_actuelle, pr.name AS fonction_proposee
FROM lines l
JOIN batches b ON b.current_unit_id = l.current_unit_id AND b.batch = l.batch
JOIN cur c ON c.member_id = l.member_id
JOIN members m ON m.id = l.member_id
JOIN units u ON u.id = l.current_unit_id
LEFT JOIN teams ct ON ct.id = c.team_id
LEFT JOIN teams pt ON pt.id = l.proposed_team_id
LEFT JOIN functional_roles cr ON cr.id = c.functional_role_id
LEFT JOIN functional_roles pr ON pr.id = l.proposed_role_id
WHERE l.proposed_team_id IS DISTINCT FROM c.team_id OR l.proposed_role_id <> c.functional_role_id
ORDER BY u.code, l.batch, membre;
