-- 030: remove the one-off 2026 "Couleurs des équipes" item from the chefs' rentrée email (cu_rentree).
-- The team foulard colours were recovered from the old data in 2026 and checked by the CUs that year; the item must
-- not appear in next year's email. Removes only that <li> (the rest of the CG's text is kept). Idempotent.
UPDATE email_templates
SET body_html = regexp_replace(body_html, '<li>(<p>)?<strong>Couleurs des équipes</strong>.*?</li>', '')
WHERE code = 'cu_rentree' AND body_html LIKE '%Couleurs des équipes%';
