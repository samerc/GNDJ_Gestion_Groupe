-- ============================================================================
-- Failed MEMBER-login diagnostics (run on the PROD DB, read-only).
--
-- Purpose: the "Échec connexion" rows in the audit log record the attempted
-- email + a reason. This query pulls the failing emails over the last few days
-- and classifies each one so you can tell an attack from people fumbling:
--
--   • "Bon identifiant — mot de passe oublié/incorrect"
--        → the email IS a valid member login; they just got the password wrong
--          → tell them to use "Mot de passe oublié ?" (or reset it from the fiche).
--   • "Compte INSCRIPTION — mauvaise page"
--        → they have a PARENT/inscription account with this email but are on the
--          MEMBER login (/login). They must use the inscription portal
--          (/inscription/login) with the SAME email + password.
--   • "Membre — email personnel au lieu de l'identifiant"
--        → this email belongs to a member (their own or a parent's), but member
--          logins are the synthetic prenom.nom@scouts.gndj. They typed their real
--          email → tell them their username (or send them the access link).
--   • "Email inconnu (faute de frappe / non enregistré)"
--        → no account, no member on file with this email = a typo or a stranger.
--
-- Adjust the interval below if you want a wider window.
-- ============================================================================

WITH fails AS (
    SELECT lower(trim(new_values->>'Email')) AS email,
           count(*)                          AS tentatives,
           count(DISTINCT ip_address)        AS ips,
           max(timestamp)                    AS derniere
    FROM audit_logs
    WHERE action = 'LoginFailed'
      AND timestamp > now() - interval '3 days'
      AND new_values->>'Email' IS NOT NULL
      AND trim(new_values->>'Email') <> ''
    GROUP BY 1
)
SELECT
    f.email,
    f.tentatives,
    f.ips,
    to_char(f.derniere, 'YYYY-MM-DD HH24:MI') AS derniere_tentative,
    CASE
        WHEN EXISTS (SELECT 1 FROM users u
                     WHERE lower(u.email) = f.email AND u.is_active AND u.is_deleted = false)
            THEN 'Bon identifiant — mot de passe oublié/incorrect'
        WHEN EXISTS (SELECT 1 FROM applicant_accounts a
                     WHERE lower(a.email) = f.email)
            THEN 'Compte INSCRIPTION — mauvaise page (doit utiliser /inscription/login)'
        WHEN EXISTS (SELECT 1 FROM member_emails me
                     WHERE lower(me.address) = f.email AND me.is_deleted = false)
          OR EXISTS (SELECT 1 FROM members m
                     WHERE lower(m.primary_contact_email) = f.email AND m.is_deleted = false)
          OR EXISTS (SELECT 1 FROM guardian_emails ge
                     JOIN guardian_links gl ON gl.guardian_id = ge.guardian_id
                     JOIN members m2 ON m2.id = gl.member_id AND m2.is_deleted = false
                     WHERE lower(ge.address) = f.email AND ge.is_deleted = false)
            THEN 'Membre — email personnel au lieu de l''identifiant prenom.nom@scouts.gndj'
        ELSE 'Email inconnu (faute de frappe / non enregistré)'
    END AS diagnostic
FROM fails f
ORDER BY f.tentatives DESC, f.derniere DESC;

-- ---------------------------------------------------------------------------
-- Quick one-line summary (counts per diagnostic category):
-- ---------------------------------------------------------------------------
-- Wrap the SELECT above in `WITH classified AS (…) SELECT diagnostic, count(*)
-- FROM classified GROUP BY 1 ORDER BY 2 DESC;` if you only want the totals.
