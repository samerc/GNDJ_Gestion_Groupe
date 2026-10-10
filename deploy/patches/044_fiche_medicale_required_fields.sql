-- Fiche médicale (document type FM), signed online: three blanks become mandatory — the family doctor, the person
-- to contact in an emergency, and the signer's « Nom / Prénom ». data-required="1" is added to the blank that
-- follows each label (same label matching as patch 037, tolerant to the editor's wrapper <span>s); the online form
-- and the server then refuse to sign while one is empty. Editable afterwards in the builder (« Obligatoire »).
-- Runs once (DataPatchRunner); skipped if the template already has a required blank.
UPDATE document_types SET template_html = regexp_replace(regexp_replace(regexp_replace(template_html,
    '(du médecin de famille\s*:\s*(?:&nbsp;|\s)*(?:</[a-z0-9]+>\s*)*(?:<span[^>]*>\s*)*<span )(data-)', '\1data-required="1" \2'),
    '(de la personne à contacter en cas d''urgence\s*:\s*(?:&nbsp;|\s)*(?:</[a-z0-9]+>\s*)*(?:<span[^>]*>\s*)*<span )(data-)', '\1data-required="1" \2'),
    '(Nom / Prénom\s*:\s*(?:&nbsp;|\s)*(?:</[a-z0-9]+>\s*)*(?:<span[^>]*>\s*)*<span )(data-)', '\1data-required="1" \2')
WHERE code = 'FM' AND template_html IS NOT NULL AND template_html NOT LIKE '%data-required%';
