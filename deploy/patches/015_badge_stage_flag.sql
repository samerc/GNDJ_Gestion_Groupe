-- 015: Mark the "Badge" scout stages as BADGE STAGES (is_badge_stage = true).
-- The migration imported every stage with is_badge_stage = false, so the stage literally named "Badge"
-- (Troupe / Compagnie) never triggered the badge picker — a member/chef could record a "Badge" progression
-- WITHOUT saying WHICH badge, so the review + fiche just showed a generic "Badge". Flagging it as a badge stage
-- makes the badge picker appear (and required) when recording/proposing that stage, so the specific badge is
-- captured and shown ("Progression : Badge · <nom du badge>"). The is_badge_stage flag is preserved when a stage
-- is edited in the admin UI, so this sticks. Existing "Badge" progressions with no badge are left as-is.
-- Idempotent (the guard skips already-flagged rows). NO BEGIN/COMMIT (the DataPatchRunner owns the transaction).
UPDATE scout_stages SET is_badge_stage = true
WHERE lower(trim(name)) = 'badge' AND is_badge_stage = false AND is_deleted = false;
