-- 025_remove_relationships_permissions.sql
-- Remove the four relationships.* permissions. They were enforced NOWHERE (0 [HasPermission], 0 .Contains, 0
-- frontend usage): the MemberRelationship feature they gated was removed on 2026-07-29 (entity + table dropped),
-- but the permission strings lingered on the chef-unite / chef-equipe seed lists. Removing them from
-- Permissions.All means the permission editor + UpdateSecurityProfilePermissions no longer offer/accept them;
-- this patch strips any existing rows so the DB matches the code.
--
-- NOTE: this touches ONLY the permission strings. The guardian-link RelationshipType column ("Père"/"Mère" on a
-- guardian↔member link) is a completely separate, live field and is NOT affected.
--
-- Idempotent (no-op once the rows are gone). No BEGIN/COMMIT — the DataPatchRunner owns the transaction.

DELETE FROM security_profile_permissions
WHERE permission IN ('relationships.view', 'relationships.create', 'relationships.edit', 'relationships.delete');
