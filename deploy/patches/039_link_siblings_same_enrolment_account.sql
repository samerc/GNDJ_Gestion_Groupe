-- Children accepted from the SAME enrolment (demande) account are brothers/sisters, but the conversion only
-- declared a fratrie when the family named a child already in the group. Link them now: per account, every member
-- created from its demandes joins one confirmed sibling group (an existing group of one of them is reused; if they
-- are spread over several groups, the others are merged into it). Idempotent: an account whose children already
-- share one group is left alone. The conversion itself is fixed in SendDemandeResponses (2026-10-08).
DO $$
DECLARE
  acc RECORD;
  target uuid;
  others uuid[];
BEGIN
  FOR acc IN
    SELECT d.applicant_account_id AS account_id, array_agg(DISTINCT m.id) AS members
    FROM demandes d
    JOIN members m ON m.id = d.created_member_id AND NOT m.is_deleted
    WHERE NOT d.is_deleted AND d.created_member_id IS NOT NULL
    GROUP BY d.applicant_account_id
    HAVING count(DISTINCT m.id) >= 2
       AND (count(DISTINCT m.sibling_group_id) <> 1 OR bool_or(m.sibling_group_id IS NULL))
  LOOP
    SELECT min(sibling_group_id::text)::uuid INTO target FROM members WHERE id = ANY(acc.members) AND sibling_group_id IS NOT NULL;
    IF target IS NULL THEN
      target := gen_random_uuid();
      INSERT INTO sibling_groups (id, notes, created_at, updated_at, is_deleted)
      VALUES (target, 'Fratrie inscrite ensemble (même compte d''inscription)', now(), now(), false);
    END IF;

    -- Other groups the children were in: their members move to the target, the emptied groups are deleted.
    SELECT array_agg(DISTINCT sibling_group_id) INTO others
    FROM members WHERE id = ANY(acc.members) AND sibling_group_id IS NOT NULL AND sibling_group_id <> target;
    IF others IS NOT NULL THEN
      UPDATE members SET sibling_group_id = target WHERE sibling_group_id = ANY(others);
      DELETE FROM sibling_groups WHERE id = ANY(others);
    END IF;

    UPDATE members SET sibling_group_id = target WHERE id = ANY(acc.members);

    -- They are confirmed siblings now: drop any « not siblings » mark between them.
    DELETE FROM sibling_rejections WHERE member_a_id = ANY(acc.members) AND member_b_id = ANY(acc.members);
  END LOOP;
END $$;
