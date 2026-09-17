-- 019: Reactivate login accounts of ACTIVE members that were wrongly created inactive.
-- A batch of members created 2026-06-24 (BP-roster reconciliation) got their User row with is_active=false and
-- were never activated, so they could log in with neither a password nor the activation link: the login lookup
-- filters `IsActive`, so an inactive account reads as "Utilisateur introuvable" even though the member exists and
-- is searchable. (The current app code is correct — User.IsActive defaults true and CreateMember sets true — so
-- this is a one-off data fix, not an ongoing bug.)
--
-- Scope (deliberately narrow + safe): reactivate ONLY an inactive, non-deleted login that has NEVER been used
-- (no last_login_at, no refresh token) and belongs to a NON-DELETED member with an ACTIVE assignment. A
-- deliberately-disabled account can only come from deleting the member (which soft-deletes the member, excluded
-- here) or a merge loser (also soft-deleted), so this never re-enables an account that was turned off on purpose.
-- Idempotent (only touches is_active=false rows). NO BEGIN/COMMIT (the DataPatchRunner owns the transaction).
UPDATE users u
SET is_active = true, updated_at = now()
WHERE u.is_active = false
  AND u.is_deleted = false
  AND u.last_login_at IS NULL
  AND u.refresh_token IS NULL
  AND EXISTS (SELECT 1 FROM members m WHERE m.id = u.member_id AND m.is_deleted = false)
  AND EXISTS (
    SELECT 1 FROM member_assignments a
    WHERE a.member_id = u.member_id AND a.end_date IS NULL AND a.is_deleted = false
  );
