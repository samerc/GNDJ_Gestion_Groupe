# Document templates — dev → prod

Exports the in-app document templates (**Autorisation des Parents** `AUT`, **Fiche Médicale** `FM`)
authored in dev so they can be applied on prod without redoing them in the builder.

Contents:
- `document-templates.sql` — idempotent `UPDATE document_types SET template_html = … WHERE code IN ('AUT','FM')`.
- `content/*.jpg` — the header images the templates reference (by GUID filename).

## Prerequisite
The document-template feature must already be deployed on prod, i.e. the migration
`AddDocumentTypeTemplateHtml` has run (the `document_types.template_html` column exists) and the
current renderer is live. Apply this package **after** that deploy.

## Apply on prod (run on the prod server)
1. Copy the header images into the site's uploads folder (create it if missing):
   ```powershell
   Copy-Item deploy\templates\content\*.jpg C:\inetpub\www\gndj\uploads\content\
   ```
2. Run the SQL against the prod database (UTF-8):
   ```powershell
   $env:PGPASSWORD='<prod gndj password>'; $env:PGCLIENTENCODING='UTF8'
   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U gndj_admin -d gndj -f deploy\templates\document-templates.sql
   ```
   Expected: `UPDATE 1` twice.

Matched by `code`, so `AUT` and `FM` must exist on prod (they are the standard doc types). Re-runnable.
