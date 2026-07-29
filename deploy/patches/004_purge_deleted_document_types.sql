-- 004_purge_deleted_document_types.sql
-- Date: 2026-07-29
-- What: Permanently remove soft-deleted document types that no document references (junk cleanup — e.g. the
--       empty-name leftover and "Test Doc Type"). There is no auto-purge for document types (only members),
--       so these otherwise sit soft-deleted forever.
-- Why:  One-off housekeeping. Safe because the app blocks deleting a type that has documents, so soft-deleted
--       types have none — but we still guard with NOT EXISTS (checks ALL rows, incl. soft-deleted, since the
--       FK cares about physical rows) so this can never hit a foreign-key violation.
-- Data only. Hard delete (rows leave the table).
-- Idempotent: a second run finds nothing to delete.
-- NOTE: no BEGIN/COMMIT here — DataPatchRunner wraps each patch in its own transaction.

DELETE FROM document_types dt
WHERE dt.is_deleted = true
  AND NOT EXISTS (SELECT 1 FROM member_documents md WHERE md.document_type_id = dt.id);
