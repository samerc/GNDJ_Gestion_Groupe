-- ============================================================================
-- GO-LIVE STEP (MANUAL — run once, when you activate accounts for real users)
-- ============================================================================
-- Forces EVERY existing member login to set their own password on next login.
-- After this runs, a member logging in with the shared/imported temp password
-- (Gndj2026!) — or any leader-issued temp password — is shown a blocking
-- "Définissez votre mot de passe" screen before they can use the app.
--
-- Members who activate via the emailed activation link instead set their
-- password through that link (which already clears the flag), so they never
-- see the forced screen.
--
-- This is DELIBERATELY NOT in deploy/patches/ (which auto-runs on every deploy)
-- so it can't fire during a pre-go-live test deploy. Run it by hand as part of
-- the account-activation go-live step, e.g.:
--   psql "<prod connection>" -f deploy/golive/force-password-reset.sql
--
-- Idempotent: safe to run more than once. Super-admins are EXCLUDED so the
-- operator account isn't locked into a reset. New accounts created after the
-- code deploy already get must_change_password=true automatically.
-- ============================================================================

UPDATE users
SET    must_change_password = true
WHERE  is_super_admin = false
  AND  is_deleted = false;

-- Show how many accounts are now flagged (sanity check).
SELECT count(*) AS forced_reset_accounts
FROM   users
WHERE  must_change_password = true
  AND  is_deleted = false;
