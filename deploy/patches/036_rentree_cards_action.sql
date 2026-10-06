-- The rentrée task « Imprimer les cartes membres » gets its own action « goto-cards », so it can be hidden while
-- member cards are switched off (Paramètres → reports.cards_enabled). Idempotent: only rows still on the old action.
UPDATE rentree_task_templates SET action_key = 'goto-cards'
WHERE title = 'Imprimer les cartes membres' AND (action_key IS NULL OR action_key = 'goto-my-unit');
UPDATE rentree_tasks SET action_key = 'goto-cards'
WHERE title = 'Imprimer les cartes membres' AND (action_key IS NULL OR action_key = 'goto-my-unit');
