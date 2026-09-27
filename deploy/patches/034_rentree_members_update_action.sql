-- Rentrée: "Les chefs mettent à jour les membres (badges, étapes…)" is a CU task (record progressions on their
-- members), so its button goes to "Mon unité" instead of the group's étapes/badges definitions page.
-- Template + already-generated tasks. Idempotent.
UPDATE rentree_task_templates SET action_key = 'goto-my-unit'
 WHERE title LIKE 'Les chefs mettent _ jour les membres%' AND action_key = 'goto-progression';
UPDATE rentree_tasks SET action_key = 'goto-my-unit'
 WHERE title LIKE 'Les chefs mettent _ jour les membres%' AND action_key = 'goto-progression';
