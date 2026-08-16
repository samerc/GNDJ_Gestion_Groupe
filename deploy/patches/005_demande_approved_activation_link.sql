-- 005_demande_approved_activation_link.sql
-- Date: 2026-08-16
-- What: Update the seeded "demande_approved" (acceptance) email template body/variables from the old
--       TEMP-PASSWORD model to the SET-PASSWORD (activation) link model. The acceptance flow now emails
--       {{activationLink}} (a /reset-password?...&setup=1 link, 30-day) + onboarding steps instead of
--       {{tempPassword}}, matching SendDemandeResponses which no longer generates a temp password.
-- Why:  Templates are seeded create-if-missing (idempotent) and never overwritten, so an existing DB still
--       carries the old {{tempPassword}} body — which would render blank now that no temp password is passed.
-- Guarded: only rewrites the template while it STILL references the old {{tempPassword}} placeholder, so a
--          CG's customized/edited template is left untouched. Idempotent: a second run matches nothing.
-- NOTE: no BEGIN/COMMIT here — DataPatchRunner wraps each patch in its own transaction.

UPDATE email_templates
SET body_html = '<h2>Bonjour {{contactName}},</h2><p>Nous avons le plaisir de vous informer que la demande d''inscription de <strong>{{childName}}</strong> a été acceptée.</p><p><strong>Unité :</strong> {{unitName}}</p><p>Un compte a été créé pour le nouveau membre. Voici les étapes pour accéder à l''espace membre :</p><ol><li>Cliquez sur le bouton ci-dessous pour <strong>définir votre mot de passe</strong>.</li><li>Connectez-vous à l''espace membre avec votre identifiant : <strong>{{username}}</strong>.</li><li>Téléversez les documents requis depuis « Mes documents ».</li></ol><p><a href="{{activationLink}}" style="background-color:#1e3a5f;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Définir mon mot de passe</a></p><p>Ce lien est valable 30 jours. Vous pourrez ensuite vous connecter sur <a href="{{loginUrl}}">{{loginUrl}}</a>.</p><p>Bienvenue dans le mouvement !</p><p>— L''équipe GNDJ</p>',
    variables = '[{"key":"contactName","label":"Nom du contact"},{"key":"childName","label":"Nom de l''enfant"},{"key":"unitName","label":"Unité"},{"key":"username","label":"Identifiant"},{"key":"activationLink","label":"Lien pour définir le mot de passe"},{"key":"loginUrl","label":"Lien de connexion"}]'
WHERE code = 'demande_approved' AND body_html LIKE '%{{tempPassword}}%';
