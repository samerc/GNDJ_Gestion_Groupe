-- 006_demande_approved_expiry_days_var.sql
-- Date: 2026-08-16
-- What: Make the "Ce lien est valable 30 jours" line of the acceptance email use the {{expiryDays}} variable,
--       now that the activation-link validity is configurable (member.activation_link_days, default 30).
-- Why:  Patch 005 (and older seeds) hardcoded "30 jours" in the body; the send now passes an {{expiryDays}}
--       variable so the email reflects the configured window. This upgrades an existing template in place.
-- Guarded: only touches a template still on the hardcoded "30 jours" body (a CG-edited body is left alone).
--          Idempotent: a second run matches nothing. Runs after 005 (filename order).
-- NOTE: no BEGIN/COMMIT here — DataPatchRunner wraps each patch in its own transaction.

UPDATE email_templates
SET body_html = REPLACE(body_html, 'Ce lien est valable 30 jours', 'Ce lien est valable {{expiryDays}} jours'),
    variables = '[{"key":"contactName","label":"Nom du contact"},{"key":"childName","label":"Nom de l''enfant"},{"key":"unitName","label":"Unité"},{"key":"username","label":"Identifiant"},{"key":"activationLink","label":"Lien pour définir le mot de passe"},{"key":"loginUrl","label":"Lien de connexion"},{"key":"expiryDays","label":"Validité (jours)"}]'
WHERE code = 'demande_approved' AND body_html LIKE '%Ce lien est valable 30 jours%';
