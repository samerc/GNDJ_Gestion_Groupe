-- 008_team_colours.sql
-- Date: 2026-08-26
-- What: Set équipe/sizaine foulard colours (color1/color2) recovered from the WEBDEV PatEqSiz palette indices.
-- Why:  The original migration skipped COULEUR1/COULEUR2 because they were WEBDEV palette indices (0-16), not
--       hex, and we lacked the index->colour legend. The legend was reverse-engineered from the colour-named
--       Meute/Ronde sizaines (validated against Troupe 2 by the CU) + the old site's "Couleurs du scalp" for
--       the 3 remaining indices. The colour-using branches (Meute/Ronde/Compagnie/Troupe) get their real
--       foulard colours; teams that don't use colours (Noyau/JEM/Feu/Groupe/Clan sizaines + all maîtrises +
--       numbered équipes) are set to WHITE. CUs adjust any leftover in-app.
-- Data only. Idempotent: matches by unit code + totem and only sets rows where color1 IS NULL (won't clobber
-- a colour a CU already set). NO BEGIN/COMMIT (the patch runner wraps this in one transaction).
-- 113 teams coloured.

UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C' AND t.totem='Equipe 1' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C' AND t.totem='Equipe 2' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C' AND t.totem='Equipe 3' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C' AND t.totem='Equipe 4' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C' AND t.totem='Equipe Charges' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C' AND t.totem='Equipe Formation' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C' AND t.totem='Equipe Pilote' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C1' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C1' AND t.totem='Cerfs' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#F97316', color2='#FFFFFF' FROM units u WHERE t.unit_id=u.id AND u.code='C1' AND t.totem='Couguars' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#808080', color2='#2563EB' FROM units u WHERE t.unit_id=u.id AND u.code='C1' AND t.totem='Dauphins' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#6B3A0F', color2='#C8A165' FROM units u WHERE t.unit_id=u.id AND u.code='C1' AND t.totem='Goélands' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#DC2626', color2='#1A1A1A' FROM units u WHERE t.unit_id=u.id AND u.code='C1' AND t.totem='Koalas' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#1A1A1A', color2='#16A34A' FROM units u WHERE t.unit_id=u.id AND u.code='C1' AND t.totem='Ouistitis' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C2' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C2' AND t.totem='Chacals' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#6B3A0F', color2='#F5C518' FROM units u WHERE t.unit_id=u.id AND u.code='C2' AND t.totem='Gazelles' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#16A34A', color2='#FFFFFF' FROM units u WHERE t.unit_id=u.id AND u.code='C2' AND t.totem='Juments' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#2563EB', color2='#808080' FROM units u WHERE t.unit_id=u.id AND u.code='C2' AND t.totem='Marmousets' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#2563EB', color2='#16A34A' FROM units u WHERE t.unit_id=u.id AND u.code='C2' AND t.totem='Toucans' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C2' AND t.totem='Wallaby' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C3' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2='#2563EB' FROM units u WHERE t.unit_id=u.id AND u.code='C3' AND t.totem='Aquila' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#DC2626', color2='#2563EB' FROM units u WHERE t.unit_id=u.id AND u.code='C3' AND t.totem='Beluga' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C3' AND t.totem='Corsac' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='C3' AND t.totem='Irbis' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#8B5A2B', color2='#808080' FROM units u WHERE t.unit_id=u.id AND u.code='C3' AND t.totem='Péléa' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#C8A165', color2='#16A34A' FROM units u WHERE t.unit_id=u.id AND u.code='C3' AND t.totem='Serval' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='F' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='F' AND t.totem='Equipe Service' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='F' AND t.totem='JEM' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='F' AND t.totem='Noyau' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='G' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='G' AND t.totem='EDC' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='JEM' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='JEM' AND t.totem='Equipe' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M10' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#C8A165', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M10' AND t.totem='Beige' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M10' AND t.totem='Blanche' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#8B5A2B', color2='#2563EB' FROM units u WHERE t.unit_id=u.id AND u.code='M10' AND t.totem='Brune' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#C8A165', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M10' AND t.totem='Fauve' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#808080', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M10' AND t.totem='Grise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#6B3A0F', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M10' AND t.totem='Marron' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#1A1A1A', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M10' AND t.totem='Noire' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#DC2626', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M10' AND t.totem='Rousse' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M2' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M2' AND t.totem='Blanche' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#8B5A2B', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M2' AND t.totem='Brune' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#C8A165', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M2' AND t.totem='Fauve' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#808080', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M2' AND t.totem='Grise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#6B3A0F', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M2' AND t.totem='Marron' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#1A1A1A', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M2' AND t.totem='Noire' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#DC2626', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M2' AND t.totem='Rousse' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M3' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M3' AND t.totem='Blanche' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#8B5A2B', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M3' AND t.totem='Brune' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#C8A165', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M3' AND t.totem='Fauve' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#808080', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M3' AND t.totem='Grise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#6B3A0F', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M3' AND t.totem='Marron' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#1A1A1A', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M3' AND t.totem='Noire' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#DC2626', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='M3' AND t.totem='Rousse' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='N' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='N' AND t.totem='Noyau' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R1' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R1' AND t.totem='Blanche' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#2563EB', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R1' AND t.totem='Bleue' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#4B0082', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R1' AND t.totem='Indigo' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#F5C518', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R1' AND t.totem='Jaune' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#9C6ADE', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R1' AND t.totem='Mauve' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#F97316', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R1' AND t.totem='Orange' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#DC2626', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R1' AND t.totem='Rouge' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#16A34A', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R1' AND t.totem='Verte' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R2' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R2' AND t.totem='Blanche' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#2563EB', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R2' AND t.totem='Bleue' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#F5C518', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R2' AND t.totem='Jaune' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#9C6ADE', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R2' AND t.totem='Mauve' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#F97316', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R2' AND t.totem='Orange' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#DC2626', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R2' AND t.totem='Rouge' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#16A34A', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R2' AND t.totem='Verte' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R3' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R3' AND t.totem='Blanche' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#2563EB', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R3' AND t.totem='Bleue' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#F5C518', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R3' AND t.totem='Jaune' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#9C6ADE', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R3' AND t.totem='Mauve' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#F97316', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R3' AND t.totem='Orange' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#DC2626', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R3' AND t.totem='Rouge' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#16A34A', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='R3' AND t.totem='Verte' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='T10' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#16A34A', color2='#1A1A1A' FROM units u WHERE t.unit_id=u.id AND u.code='T10' AND t.totem='Aigles' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#16A34A', color2='#DC2626' FROM units u WHERE t.unit_id=u.id AND u.code='T10' AND t.totem='Chamois' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='T10' AND t.totem='Dingo' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#2563EB', color2='#1A1A1A' FROM units u WHERE t.unit_id=u.id AND u.code='T10' AND t.totem='Espadons' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#DC2626', color2='#808080' FROM units u WHERE t.unit_id=u.id AND u.code='T10' AND t.totem='Faucons' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#6B3A0F', color2='#1A1A1A' FROM units u WHERE t.unit_id=u.id AND u.code='T10' AND t.totem='Ours' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#F97316', color2='#F5C518' FROM units u WHERE t.unit_id=u.id AND u.code='T10' AND t.totem='Panthères' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='T2' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#DC2626', color2='#FFFFFF' FROM units u WHERE t.unit_id=u.id AND u.code='T2' AND t.totem='Bisons' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2='#808080' FROM units u WHERE t.unit_id=u.id AND u.code='T2' AND t.totem='Condors' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#F97316', color2='#2563EB' FROM units u WHERE t.unit_id=u.id AND u.code='T2' AND t.totem='Eperviers' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#8B5A2B', color2='#FFFFFF' FROM units u WHERE t.unit_id=u.id AND u.code='T2' AND t.totem='Etalons' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#1A1A1A', color2='#F5C518' FROM units u WHERE t.unit_id=u.id AND u.code='T2' AND t.totem='Léopards' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='T2' AND t.totem='Requin' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#F97316', color2='#1A1A1A' FROM units u WHERE t.unit_id=u.id AND u.code='T2' AND t.totem='Tigres' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='T3' AND t.totem='.Maitrise' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#F5C518', color2='#808080' FROM units u WHERE t.unit_id=u.id AND u.code='T3' AND t.totem='Abeilles' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#2563EB', color2='#6B3A0F' FROM units u WHERE t.unit_id=u.id AND u.code='T3' AND t.totem='Alouettes' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#DC2626', color2='#1A1A1A' FROM units u WHERE t.unit_id=u.id AND u.code='T3' AND t.totem='Béliers' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#F5C518', color2='#2563EB' FROM units u WHERE t.unit_id=u.id AND u.code='T3' AND t.totem='Castors' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#FFFFFF', color2=NULL FROM units u WHERE t.unit_id=u.id AND u.code='T3' AND t.totem='Elans' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#DC2626', color2='#2563EB' FROM units u WHERE t.unit_id=u.id AND u.code='T3' AND t.totem='Mouettes' AND t.color1 IS NULL AND t.is_deleted=false;
UPDATE teams t SET color1='#1A1A1A', color2='#6B3A0F' FROM units u WHERE t.unit_id=u.id AND u.code='T3' AND t.totem='Renards' AND t.color1 IS NULL AND t.is_deleted=false;
