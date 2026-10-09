-- Passage 2026-2027: youth lines that the maîtrise plan had set to « rejoint la maîtrise » but that were proposed again
-- afterwards (by someone with Chef de Groupe rights on the passage page), so they are no longer « leaving ». Left as is,
-- « Publier le passage » gives those members their new chef post TWICE (once from the youth line, once from the plan).
-- This puts each line back to what the plan expects: the youth post ends, the plan creates the chef post.
-- Run BEFORE publishing. Safe to run twice (only touches lines not leaving, not yet published).
-- On 2026-10-09 it matches 2 lines: Alain JABBOUR and Oliver RIZK (Clan, Assistant chef de clan).
BEGIN;

SELECT m.first_name || ' ' || m.last_name AS member, p.status
FROM maitrise_plan_lines x
JOIN passages p ON p.id = x.youth_passage_id
JOIN members m ON m.id = x.member_id
WHERE x.scout_year = '2026-2027' AND x.kind = 'Start' AND x.applied_at IS NULL
  AND NOT p.is_deleted AND p.status <> 'Finalized'
  AND NOT COALESCE(p.final_is_leaving, p.is_leaving);

UPDATE passages p
SET final_unit_id = NULL, final_team_id = NULL, final_role_id = NULL,
    final_is_leaving = CASE WHEN p.is_leaving THEN NULL ELSE TRUE END,
    cg_modified = TRUE,
    cg_notes = 'Rejoint la maîtrise l''an prochain : ' || u.name || ' — ' || r.name || ' (décision du CG).',
    status = 'Approved',
    updated_at = now()
FROM maitrise_plan_lines x
JOIN units u ON u.id = x.unit_id
JOIN functional_roles r ON r.id = x.functional_role_id
WHERE p.id = x.youth_passage_id
  AND x.scout_year = '2026-2027' AND x.kind = 'Start' AND x.applied_at IS NULL
  AND NOT p.is_deleted AND p.status <> 'Finalized'
  AND NOT COALESCE(p.final_is_leaving, p.is_leaving);

COMMIT;
