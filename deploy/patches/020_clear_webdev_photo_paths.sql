-- 020: Clear the dead WEBDEV photo references from members.
-- Migrated members carry photo_path = 'photos/NNNN.jpg' (NNNN = the old WEBDEV member id), imported from the old
-- system. These are non-functional in the new app: the actual image files were never migrated, and the path format
-- is rejected by the photo endpoint anyway (it serves 'uploads/photos/{memberId}.ext' and blocks anything outside
-- uploads/). So these members already show initials, and the stale value only clutters the UI (e.g. the duplicate-
-- merge dialog offering a meaningless "photo" choice). Null them out; new photos will be taken this year and stored
-- in the new-system format. New-system photos ('uploads/photos/...') are NOT touched.
-- Idempotent (after the first run no members match 'photos/%'). NO BEGIN/COMMIT (the runner owns the transaction).

UPDATE members SET photo_path = NULL WHERE photo_path LIKE 'photos/%';
