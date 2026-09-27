-- Delegations: remove extra (per-area) permissions that the attached profile already grants.
-- Saving a delegation now does this automatically; this cleans the ones saved before (e.g. a member given
-- "Membres (complet)" etc. and later the whole Chef de Groupe profile). Idempotent.
UPDATE members m
SET delegated_permissions_json = CASE
      WHEN kept.perms IS NULL OR jsonb_array_length(kept.perms) = 0 THEN NULL
      ELSE kept.perms::text END
FROM (
    SELECT m2.id,
           (SELECT jsonb_agg(p ORDER BY p)
              FROM jsonb_array_elements_text(m2.delegated_permissions_json::jsonb) AS p
             WHERE p NOT IN (SELECT sp.permission FROM security_profile_permissions sp
                              WHERE sp.security_profile_id = m2.delegated_profile_id)) AS perms
      FROM members m2
     WHERE m2.delegated_profile_id IS NOT NULL
       AND m2.delegated_permissions_json IS NOT NULL
       AND m2.delegated_permissions_json <> ''
) kept
WHERE m.id = kept.id
  AND m.delegated_permissions_json IS DISTINCT FROM
      CASE WHEN kept.perms IS NULL OR jsonb_array_length(kept.perms) = 0 THEN NULL ELSE kept.perms::text END;
