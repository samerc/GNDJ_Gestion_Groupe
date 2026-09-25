-- 029: email templates cleanup after the 2026 launch.
-- New chefs are existing members (they already have their account), and every member received their access in
-- 2026, so the activation-link emails aimed at them are retired:
--   * "Réinscription — nouveau système (avec lien)" (reinscription_access) and "Rentrée — nouveau chef"
--     (cu_rentree_nouveau) are soft-deleted (the new automatic "Bienvenue dans la maîtrise" = leader_welcome,
--     created by the seeder, replaces the latter).
--   * "Rentrée — chef" (cu_rentree) loses its activation block (edits made by the CG elsewhere in the text are kept).
--   * "Réinscription — membre déjà inscrit" (reinscription_returning) becomes the optional yearly
--     "Mise à jour de la fiche et des documents" letter (sent to a member group), without the username line.
--   * The rentrée task "Relancer les accès non activés" (bulk "Envoyer les accès" page, removed) is dropped.
-- Idempotent: every statement is guarded on the old content.

UPDATE email_templates SET is_deleted = true, deleted_at = now(), is_active = false
WHERE code IN ('reinscription_access', 'cu_rentree_nouveau') AND NOT is_deleted;

-- cu_rentree: replace the "Votre accès" section (up to the next <h3>) with a plain sign-in sentence.
UPDATE email_templates SET
    name = 'Rentrée — chefs',
    subject = replace(subject, 'votre accès et les étapes', 'les étapes pour votre unité'),
    body_html = regexp_replace(
        regexp_replace(
            replace(body_html, 'Voici comment accéder à la plateforme GNDJ et ce qui vous attend', 'Voici ce qui vous attend'),
            '<h3>Votre accès</h3>.*?(<h3>)',
            '<p>Connectez-vous sur <a href="{{loginUrl}}">{{loginUrl}}</a> avec votre compte habituel (identifiant : {{username}}). Mot de passe oublié ? « Mot de passe oublié ? » ou « Se connecter avec un code » sur la page de connexion.</p>\1'),
        '<p>Vous vous connecterez ensuite sur .*?</p>', ''),
    variables = '[{"key":"leaderName","label":"Nom du chef"},{"key":"unitName","label":"Unité"},{"key":"scoutYear","label":"Année scoute"},{"key":"username","label":"Identifiant"},{"key":"loginUrl","label":"Lien de connexion"}]'
WHERE code = 'cu_rentree' AND body_html LIKE '%{{activationLink}}%';

-- reinscription_returning: drop the username line (a group send has no per-member username) + new name/module.
UPDATE email_templates SET
    name = 'Mise à jour de la fiche et des documents (membres)',
    module = 'general',
    subject = replace(subject, 'Réinscription scoute {{scoutYear}} — GNDJ', 'Année scoute {{scoutYear}} — mettez à jour la fiche et les documents'),
    body_html = replace(
        regexp_replace(body_html, '<ul><li>(<p>)?<strong>Votre identifiant :</strong> \{\{username\}\}(</p>)?</li></ul>', ''),
        'Connectez-vous avec votre identifiant et le mot de passe que vous avez déjà défini',
        'Connectez-vous avec votre identifiant et votre mot de passe habituels'),
    variables = '[{"key":"memberName","label":"Nom du membre"},{"key":"unitName","label":"Unité"},{"key":"loginUrl","label":"Lien de connexion"},{"key":"scoutYear","label":"Année scoute"}]'
WHERE code = 'reinscription_returning' AND name <> 'Mise à jour de la fiche et des documents (membres)';

-- Rentrée: remove the "Relancer les accès non activés" task (template + generated copies) and any dependency on it.
UPDATE rentree_task_templates SET depends_on_template_ids = array_remove(depends_on_template_ids, t.id)
FROM (SELECT id FROM rentree_task_templates WHERE action_key = 'goto-send-access') t
WHERE t.id = ANY(rentree_task_templates.depends_on_template_ids);

UPDATE rentree_tasks SET depends_on_task_ids = array_remove(depends_on_task_ids, t.id)
FROM (SELECT id FROM rentree_tasks WHERE action_key = 'goto-send-access') t
WHERE t.id = ANY(rentree_tasks.depends_on_task_ids);

UPDATE rentree_task_templates SET is_deleted = true, deleted_at = now()
WHERE action_key = 'goto-send-access' AND NOT is_deleted;

UPDATE rentree_tasks SET is_deleted = true, deleted_at = now()
WHERE action_key = 'goto-send-access' AND NOT is_deleted;
