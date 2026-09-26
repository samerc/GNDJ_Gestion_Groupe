-- Passage: lines that stay in the member's unit (équipe / fonction change) or leave the group are now
-- accepted automatically when the CU proposes them. Existing lines still "Pending" that match that rule are
-- accepted here, so the CG only sees moves to another unit. Idempotent (only touches Pending lines).
UPDATE passages
SET status = 'Approved'
WHERE status = 'Pending'
  AND is_deleted = false
  AND (is_leaving = true OR proposed_unit_id = current_unit_id);
