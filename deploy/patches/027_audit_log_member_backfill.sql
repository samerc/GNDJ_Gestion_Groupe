-- 027: backfill audit_logs.member_id for rows written before the column existed.
-- New rows get member_id from AuditService at write time; this fills the history so the member "Journal" tab
-- also shows past actions on the member's documents, assignments, cotisations, progressions, change requests,
-- passages and login.
-- Idempotent: only rows whose member_id is still NULL are touched. Joins ignore soft-delete on purpose (a deleted
-- document/assignment still belongs to its member).

UPDATE audit_logs a SET member_id = a.entity_id
WHERE a.member_id IS NULL AND a.entity_type = 'Member' AND a.entity_id IS NOT NULL;

UPDATE audit_logs a SET member_id = x.member_id
FROM member_assignments x
WHERE a.member_id IS NULL AND a.entity_type = 'MemberAssignment' AND a.entity_id = x.id;

UPDATE audit_logs a SET member_id = x.member_id
FROM member_cotisations x
WHERE a.member_id IS NULL AND a.entity_type = 'MemberCotisation' AND a.entity_id = x.id;

UPDATE audit_logs a SET member_id = x.member_id
FROM member_progressions x
WHERE a.member_id IS NULL AND a.entity_type = 'MemberProgression' AND a.entity_id = x.id;

UPDATE audit_logs a SET member_id = x.member_id
FROM member_change_requests x
WHERE a.member_id IS NULL AND a.entity_type = 'MemberChangeRequest' AND a.entity_id = x.id;

UPDATE audit_logs a SET member_id = x.member_id
FROM passages x
WHERE a.member_id IS NULL AND a.entity_type = 'Passage' AND a.entity_id = x.id;

UPDATE audit_logs a SET member_id = x.member_id
FROM users x
WHERE a.member_id IS NULL AND a.entity_type = 'User' AND a.entity_id = x.id;

-- Documents: the entity id is the document — or, for single-file downloads, the member itself.
UPDATE audit_logs a SET member_id = x.member_id
FROM member_documents x
WHERE a.member_id IS NULL AND a.entity_type = 'MemberDocument' AND a.entity_id = x.id;

UPDATE audit_logs a SET member_id = x.id
FROM members x
WHERE a.member_id IS NULL AND a.entity_type = 'MemberDocument' AND a.entity_id = x.id;
