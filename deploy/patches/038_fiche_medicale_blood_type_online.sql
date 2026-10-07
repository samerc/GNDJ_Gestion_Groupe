-- Fiche médicale (FM): the « Groupe sanguin » member pill becomes a blank linked to the fiche's blood type
-- (a list of the 8 groups when filled online, pre-filled with the fiche's value; the paper PDF still prints the
-- fiche's value). Online filling stays OFF this year (paper only); it is switched on per document type in
-- Paramètres → Documents. Runs once (DataPatchRunner).
UPDATE document_types
SET template_html = regexp_replace(template_html,
        '<span data-field="groupeSanguin"[^>]*>[^<]*</span>',
        '<span data-w="80" data-save="bloodType" data-fill="1" class="gndj-fill" style="min-width: 80px;">&nbsp;</span>')
WHERE code = 'FM' AND template_html LIKE '%data-field="groupeSanguin"%';
