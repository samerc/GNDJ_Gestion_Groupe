-- Fiche médicale (FM): the « Groupe sanguin » member pill becomes a blank linked to the fiche's blood type
-- (a list of the 8 groups when filled online, pre-filled with the fiche's value; the paper PDF still prints the
-- fiche's value), and the fiche médicale is fillable online by default. Runs once (DataPatchRunner).
UPDATE document_types
SET template_html = regexp_replace(template_html,
        '<span data-field="groupeSanguin"[^>]*>[^<]*</span>',
        '<span data-w="80" data-save="bloodType" data-fill="1" class="gndj-fill" style="min-width: 80px;">&nbsp;</span>')
WHERE code = 'FM' AND template_html LIKE '%data-field="groupeSanguin"%';

UPDATE document_types SET online_fillable = true
WHERE code = 'FM' AND template_html IS NOT NULL AND template_html <> '';
