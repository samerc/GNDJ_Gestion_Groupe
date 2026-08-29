-- ============================================================================
-- Provision missing maitrise logins so they can receive the onboarding / access
-- activation email (which needs an active account to build the activation link).
-- Safe + idempotent (re-runs skip anyone who now has an active account).
--   1) Reactivates any INACTIVE account of an active maitrise member.
--   2) Creates a login for any active maitrise member with NO account:
--      email = prenom.nom@scouts.gndj (app format; numeric suffix on collision),
--      a random temp password (bcrypt via pgcrypto), must_change_password = true,
--      is_active = true. They set their own password via the emailed activation link.
-- Prints each created account + its temp password (fallback if the email fails).
-- Requires pgcrypto (crypt/gen_salt) — present on this DB.
-- ============================================================================
DO $$
DECLARE r RECORD; v_email text; v_base text; v_suffix int; v_pw text; n_react int; n_new int := 0;
BEGIN
  -- 1) reactivate inactive maitrise accounts
  WITH maitrise AS (
    SELECT DISTINCT m.id FROM members m
    JOIN member_assignments ma ON ma.member_id=m.id AND ma.end_date IS NULL AND ma.is_deleted=false
    LEFT JOIN teams t ON t.id=ma.team_id
    LEFT JOIN functional_roles fr ON fr.id=ma.functional_role_id
    WHERE m.is_deleted=false AND (coalesce(t.is_maitrise,false) OR coalesce(fr.is_maitrise,false))
  )
  UPDATE users u SET is_active=true, updated_at=now()
  WHERE NOT u.is_active AND u.member_id IN (SELECT id FROM maitrise);
  GET DIAGNOSTICS n_react = ROW_COUNT;
  RAISE NOTICE 'Comptes réactivés : %', n_react;

  -- 2) create logins for accountless maitrise members
  FOR r IN
    SELECT DISTINCT m.id, m.first_name, m.last_name, m.card_number
    FROM members m
    JOIN member_assignments ma ON ma.member_id=m.id AND ma.end_date IS NULL AND ma.is_deleted=false
    LEFT JOIN teams t ON t.id=ma.team_id
    LEFT JOIN functional_roles fr ON fr.id=ma.functional_role_id
    WHERE m.is_deleted=false AND (coalesce(t.is_maitrise,false) OR coalesce(fr.is_maitrise,false))
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.member_id=m.id)
  LOOP
    v_base := replace(replace(translate(lower(trim(r.first_name)),'éèêëàâäùûüôöîïç','eeeeaaauuuooiic'),' ','.'),'''','')
           || '.' ||
              replace(replace(translate(lower(trim(r.last_name)),'éèêëàâäùûüôöîïç','eeeeaaauuuooiic'),' ','.'),'''','');
    v_email := v_base || '@scouts.gndj';
    v_suffix := 2;
    WHILE EXISTS (SELECT 1 FROM users WHERE email = v_email) LOOP
      v_email := v_base || v_suffix || '@scouts.gndj'; v_suffix := v_suffix + 1;
    END LOOP;
    v_pw := 'Scout2026!' || (100 + floor(random()*900))::int;
    INSERT INTO users (id, member_id, email, password_hash, is_active, is_super_admin, must_change_password, created_at, updated_at, is_deleted)
    VALUES (gen_random_uuid(), r.id, v_email, crypt(v_pw, gen_salt('bf',10)), true, false, true, now(), now(), false);
    n_new := n_new + 1;
    RAISE NOTICE 'Compte créé : %  (mdp temp: %)  [% %]', v_email, v_pw, r.card_number, r.first_name||' '||r.last_name;
  END LOOP;
  RAISE NOTICE 'Comptes créés : %', n_new;
END $$;
