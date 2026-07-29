-- 003_deactivate_deleted_document_types.sql
-- Date: 2026-07-29
-- What: Clear is_active on document types that are already soft-deleted, so a deleted type is never counted
--       as active. Matches the delete handler, which now also clears is_active on soft-delete.
-- Why:  A soft-deleted type (e.g. "Test Doc Type") kept is_active = true, making it look active in raw counts.
--       It was already hidden everywhere (soft-delete filter), so this is a coherence fix, not a behavior fix.
-- Data only. Does NOT purge the rows — they stay soft-deleted.
-- Idempotent: a second run matches nothing.
-- NOTE: no BEGIN/COMMIT here — DataPatchRunner wraps each patch in its own transaction.

UPDATE document_types SET is_active = false WHERE is_deleted = true AND is_active = true;
