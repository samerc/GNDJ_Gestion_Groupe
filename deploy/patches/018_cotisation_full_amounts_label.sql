-- 018: Rename the cotisation.full_amounts setting label/description on existing DBs.
-- The separate "Montant de cotisation par défaut" (cotisation.default_amount) field was merged into this one
-- (its USD row IS the cotisation amount and now drives the payment-form prefill), so the label is clarified from
-- "Montants pleins (par devise)" to "Montant de la cotisation (par devise)". SeedMissingSettings only ADDS rows,
-- so it never refreshes an existing row's label/description — hence this patch. Idempotent (guarded on the old
-- label). NO BEGIN/COMMIT (the DataPatchRunner owns the transaction).
UPDATE settings
SET label = 'Montant de la cotisation (par devise)',
    description = 'Montant de la cotisation dans chaque devise (ex. 30 USD et 2 500 000 LBP). Sert à distinguer « payé en entier » de « partiel » (chaque paiement compte comme une fraction du plein de sa devise) et pré-remplit le formulaire de paiement. Laisser vide pour ne pas suivre le plein (tout paiement compte comme payé).'
WHERE key = 'cotisation.full_amounts'
  AND label = 'Montants pleins (par devise)';
