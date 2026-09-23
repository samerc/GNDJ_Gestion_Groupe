-- 023_delete_dead_profiles.sql
-- Retire three dead / vestigial security profiles so they stop cluttering the profile list + delegation picker:
--   • super-admin        — never attached to a fonction; super-admin is the account FLAG (User.IsSuperAdmin),
--                          managed via the "Super administrateurs" section, not this profile.
--   • association-admin   — unused legacy profile (0 fonctions).
--   • chef-equipe         — dead: team leaders (Chef de Patrouille, Sizenier…) use the "read-only" profile
--                          plus the FunctionalRole.IsTeamLeader flag, not this profile (0 fonctions).
-- Soft-delete (is_deleted=true) rather than hard-delete: reversible, keeps the row, and the global query filter
-- hides it everywhere. SAFE by construction — the guard only retires a profile that NO active fonction uses and
-- NO active delegation references, so it can never strip permissions from anyone actually holding it (verified 0
-- of each on dev/prod). Idempotent (WHERE is_deleted=false → re-runs are a no-op). No BEGIN/COMMIT (the runner
-- owns the txn). Applies on dev at next startup / prod at next deploy (DataPatchRunner, once per DB).
UPDATE security_profiles sp
SET is_deleted = true, deleted_at = now()
WHERE sp.code IN ('super-admin', 'association-admin', 'chef-equipe')
  AND sp.is_deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM functional_roles fr
    WHERE fr.security_profile_id = sp.id AND fr.is_deleted = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM members m WHERE m.delegated_profile_id = sp.id AND m.is_deleted = false
  );
