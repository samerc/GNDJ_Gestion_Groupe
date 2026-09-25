-- 022_disable_orphan_logins.sql
-- Disable the login of "orphan" members: an ACTIVE login account whose member has NO assignment at all
-- (never placed, or all placements removed) AND who has NEVER signed in. These are dead accounts (they could
-- log in but would see nothing). Disabling sets users.is_active=false (a never-logged-in account has no session to clear); the member
-- record + all data stay intact, and any account is trivially re-enabled from the member panel
-- ("Réactiver la connexion"). SAFE by construction: only touches active, never-logged-in, non-super-admin
-- accounts with zero assignments — so it can never lock out someone who is actually using the app or holds a
-- placement. Idempotent (re-runs are a no-op once disabled). Applies on dev at next startup / prod at next
-- deploy (DataPatchRunner, once per DB). No BEGIN/COMMIT (the runner owns the txn).
UPDATE users u
SET is_active = false
FROM members m
WHERE u.member_id = m.id
  AND u.is_active = true
  AND u.is_deleted = false
  AND u.is_super_admin = false
  AND u.last_login_at IS NULL
  AND m.is_deleted = false
  AND NOT EXISTS (SELECT 1 FROM member_assignments a WHERE a.member_id = m.id AND a.is_deleted = false);
