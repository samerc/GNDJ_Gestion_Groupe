-- Normalize guardian_links relationship types to their accented French forms.
UPDATE guardian_links SET relationship_type = 'Père' WHERE relationship_type = 'Pere';
UPDATE guardian_links SET relationship_type = 'Mère' WHERE relationship_type = 'Mere';
SELECT relationship_type, count(*) FROM guardian_links WHERE NOT is_deleted GROUP BY relationship_type ORDER BY count(*) DESC;
