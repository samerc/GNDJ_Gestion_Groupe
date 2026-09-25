-- The {{demandeNumber}} variable (INS-YYYY-NNNN) is supplied by the code for the demande emails but was never
-- added to those templates' declared variable list. The email-template check (Système page / smoke suite)
-- flags a used-but-undeclared variable, so declare it. Idempotent: only appends when missing; leaves a template
-- whose variables column isn't a JSON array alone.
UPDATE email_templates
SET variables = (variables::jsonb || '[{"key":"demandeNumber","label":"N° de demande"}]'::jsonb)::text
WHERE code IN ('demande_submitted', 'demande_approved', 'demande_declined')
  AND variables IS NOT NULL AND variables <> ''
  AND jsonb_typeof(variables::jsonb) = 'array'
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(variables::jsonb) e WHERE e->>'key' = 'demandeNumber');
