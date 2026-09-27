-- Public-site page title typo: "Notre methode" -> "Notre méthode" (menu + page heading).
-- Only the exact misspelling is touched, so a title a chef has since edited is left alone. Slug unchanged.
UPDATE pages SET title = 'Notre méthode' WHERE title = 'Notre methode' AND NOT is_deleted;
