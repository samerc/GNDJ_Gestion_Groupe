-- 024_remove_dead_permissions.sql
-- Remove two permissions that were never enforced anywhere (0 [HasPermission] sites, 0 .Contains checks, 0
-- frontend usage): 'documents.edit' and 'admin.hard_delete'. They lingered on some seeded profiles (chef-unite
-- held documents.edit; super-admin/association-admin held admin.hard_delete) but did nothing. Removing them from
-- Permissions.All means the permission editor + UpdateSecurityProfilePermissions no longer offer/accept them; this
-- patch strips any existing rows so the DB matches the code.
--
-- NOTE: 'documents.create' is deliberately KEPT — it is not dead: the frontend uses it as the gate for the leader
-- "upload a document" button (member-documents / unit-documents). Only the two truly-dead strings are removed.
--
-- Idempotent (no-op once the rows are gone). No BEGIN/COMMIT — the DataPatchRunner owns the transaction.

DELETE FROM security_profile_permissions
WHERE permission IN ('documents.edit', 'admin.hard_delete');
