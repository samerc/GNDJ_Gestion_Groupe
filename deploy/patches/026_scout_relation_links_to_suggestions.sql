-- 026: proche-scout links → suggestions (CG must confirm).
-- Until now the app AUTO-LINKED a "current member" proche to an existing member by NAME alone (or trusted a member
-- id sent by the portal). A link makes the demande conversion share the family's parents with that member and
-- declare a fratrie — dangerous when the name points at a stranger. From this version the app only SUGGESTS the
-- match (suggested_member_id) and the CG confirms it ("Lier", brothers/sisters only).
--
-- Every existing link on an account that still has a NOT-yet-converted demande was made automatically (there was no
-- confirm action before), so demote it to a suggestion. Accounts whose demandes are all converted are left alone
-- (the conversion already happened; the link is now just history). Idempotent: only rows with a link are touched.
UPDATE applicant_scout_relations r
SET suggested_member_id = r.related_member_id,
    related_member_id   = NULL
WHERE r.related_member_id IS NOT NULL
  AND NOT r.is_deleted
  AND EXISTS (
      SELECT 1 FROM demandes d
      WHERE d.applicant_account_id = r.applicant_account_id
        AND NOT d.is_deleted
        AND d.created_member_id IS NULL
  );
