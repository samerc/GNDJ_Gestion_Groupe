-- Sample data for GNDJ Scout Management
-- Run with: PGPASSWORD="GndjDev2026!" psql -U gndj_admin -d gndj -f seed-sample-data.sql

-- Association
INSERT INTO associations (id, name, code, description, created_at, updated_at, is_deleted)
VALUES ('a1000000-0000-0000-0000-000000000001', 'GNDJ - Guides Nationales Du Jeune', 'GNDJ', 'Association principale', NOW(), NOW(), false);

-- Unit Types
INSERT INTO unit_types (id, name, code, description, number_of_years, created_at, updated_at, is_deleted) VALUES
('b1000000-0000-0000-0000-000000000001', 'Meute', 'MEU', 'Louveteaux et louvettes (7-11 ans)', 4, NOW(), NOW(), false),
('b1000000-0000-0000-0000-000000000002', 'Troupe', 'TRP', 'Éclaireurs et éclaireuses (12-16 ans)', 4, NOW(), NOW(), false),
('b1000000-0000-0000-0000-000000000003', 'Route', 'RTE', 'Routiers et routières (17-21 ans)', 4, NOW(), NOW(), false),
('b1000000-0000-0000-0000-000000000004', 'Maîtrise', 'MAI', 'Chefs et cheftaines', NULL, NOW(), NOW(), false);

-- Units
INSERT INTO units (id, association_id, unit_type_id, name, code, description, is_active, created_at, updated_at, is_deleted) VALUES
('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Meute 2ème Beyrouth', 'M2B', 'Meute des louveteaux', true, NOW(), NOW(), false),
('c1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'Troupe 2ème Beyrouth', 'T2B', 'Troupe des éclaireurs', true, NOW(), NOW(), false),
('c1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'Route 2ème Beyrouth', 'R2B', 'Clan routier', true, NOW(), NOW(), false),
('c1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'Maîtrise 2ème Beyrouth', 'X2B', 'Équipe de maîtrise', true, NOW(), NOW(), false);

-- Teams for Meute (Sizaines)
INSERT INTO teams (id, unit_id, name, description, totem, adjective, color1, color2, display_order, created_at, updated_at, is_deleted) VALUES
('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Sizaine Brune', NULL, 'Ours', 'Brun', '#8B4513', '#D2691E', 1, NOW(), NOW(), false),
('d1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'Sizaine Grise', NULL, 'Loup', 'Gris', '#808080', '#C0C0C0', 2, NOW(), NOW(), false),
('d1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'Sizaine Blanche', NULL, 'Renard', 'Blanc', '#FFFFFF', '#F5F5DC', 3, NOW(), NOW(), false);

-- Teams for Troupe (Patrouilles)
INSERT INTO teams (id, unit_id, name, description, totem, adjective, color1, color2, display_order, created_at, updated_at, is_deleted) VALUES
('d1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002', 'Patrouille des Aigles', NULL, 'Aigle', 'Royal', '#FFD700', '#000080', 1, NOW(), NOW(), false),
('d1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000002', 'Patrouille des Lions', NULL, 'Lion', 'Courageux', '#FF4500', '#8B0000', 2, NOW(), NOW(), false),
('d1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000002', 'Patrouille des Cerfs', NULL, 'Cerf', 'Agile', '#228B22', '#006400', 3, NOW(), NOW(), false);

-- Members (50 with realistic Lebanese names)
INSERT INTO members (id, first_name, last_name, date_of_birth, gender, card_number, blood_type, nationality, school, created_at, updated_at, is_deleted) VALUES
-- Meute members
('e1000000-0000-0000-0000-000000000001', 'Samer', 'Cheaib', '2015-03-12', 'Masculin', 'M001', 'A+', 'Libanaise', 'Collège Notre-Dame', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000002', 'Nabil', 'Haddad', '2014-07-22', 'Masculin', 'M002', 'O+', 'Libanaise', 'Collège Notre-Dame', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000003', 'Rami', 'Khoury', '2015-01-05', 'Masculin', 'M003', 'B+', 'Libanaise', 'Lycée Franco-Libanais', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000004', 'Maya', 'Nassar', '2014-11-18', 'Féminin', 'M004', 'A-', 'Libanaise', 'Collège Notre-Dame', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000005', 'Lara', 'Gemayel', '2015-06-30', 'Féminin', 'M005', 'O+', 'Libanaise', 'Collège des Sœurs', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000006', 'Georges', 'Abi Nader', '2014-09-14', 'Masculin', 'M006', 'AB+', 'Libanaise', 'Lycée Franco-Libanais', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000007', 'Charbel', 'Rizk', '2015-04-02', 'Masculin', 'M007', 'A+', 'Libanaise', 'Collège Notre-Dame', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000008', 'Rita', 'Mouawad', '2014-12-25', 'Féminin', 'M008', 'O-', 'Libanaise', 'Collège des Sœurs', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000009', 'Elie', 'Sassine', '2015-08-10', 'Masculin', 'M009', 'B+', 'Libanaise', 'Collège Notre-Dame', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000010', 'Mia', 'Daou', '2014-05-20', 'Féminin', 'M010', 'A+', 'Libanaise', 'Lycée Franco-Libanais', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000011', 'Tony', 'Frangié', '2015-02-14', 'Masculin', 'M011', 'O+', 'Libanaise', 'Collège Notre-Dame', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000012', 'Léa', 'Sfeir', '2014-10-08', 'Féminin', 'M012', 'A+', 'Libanaise', 'Collège des Sœurs', NOW(), NOW(), false),
-- Troupe members
('e1000000-0000-0000-0000-000000000013', 'Marc', 'Azar', '2011-01-15', 'Masculin', 'T001', 'A+', 'Libanaise', 'Collège Notre-Dame', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000014', 'Paul', 'Bechara', '2010-06-20', 'Masculin', 'T002', 'B+', 'Libanaise', 'Lycée Franco-Libanais', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000015', 'Antoine', 'Kanaan', '2011-03-08', 'Masculin', 'T003', 'O+', 'Libanaise', 'Collège Notre-Dame', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000016', 'Carla', 'Tabet', '2010-09-12', 'Féminin', 'T004', 'A-', 'Libanaise', 'Collège des Sœurs', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000017', 'Ralph', 'Frem', '2011-07-25', 'Masculin', 'T005', 'O+', 'Libanaise', 'Lycée Franco-Libanais', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000018', 'Joy', 'Saadé', '2010-04-30', 'Féminin', 'T006', 'AB+', 'Libanaise', 'Collège des Sœurs', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000019', 'Roy', 'Helou', '2011-11-03', 'Masculin', 'T007', 'A+', 'Libanaise', 'Collège Notre-Dame', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000020', 'Nour', 'Abdallah', '2010-02-17', 'Féminin', 'T008', 'B-', 'Libanaise', 'Lycée Franco-Libanais', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000021', 'Michel', 'Aoun', '2011-05-22', 'Masculin', 'T009', 'O+', 'Libanaise', 'Collège Notre-Dame', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000022', 'Sarah', 'Barakat', '2010-08-14', 'Féminin', 'T010', 'A+', 'Libanaise', 'Collège des Sœurs', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000023', 'Jad', 'Geagea', '2011-12-01', 'Masculin', 'T011', 'O-', 'Libanaise', 'Collège Notre-Dame', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000024', 'Céline', 'Makhlouf', '2010-10-19', 'Féminin', 'T012', 'A+', 'Libanaise', 'Lycée Franco-Libanais', NOW(), NOW(), false),
-- Route members
('e1000000-0000-0000-0000-000000000025', 'Pierre', 'Kallas', '2007-03-10', 'Masculin', 'R001', 'A+', 'Libanaise', 'Université Saint-Joseph', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000026', 'Cynthia', 'Rahal', '2007-09-05', 'Féminin', 'R002', 'O+', 'Libanaise', 'AUB', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000027', 'Fadi', 'Yammine', '2006-12-20', 'Masculin', 'R003', 'B+', 'Libanaise', 'LAU', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000028', 'Tania', 'Hanna', '2007-06-15', 'Féminin', 'R004', 'A-', 'Libanaise', 'Université Saint-Joseph', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000029', 'Youssef', 'Naim', '2006-08-28', 'Masculin', 'R005', 'O+', 'Libanaise', 'AUB', NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000030', 'Mireille', 'Abou Khalil', '2007-01-30', 'Féminin', 'R006', 'AB-', 'Libanaise', 'LAU', NOW(), NOW(), false),
-- Maîtrise (leaders)
('e1000000-0000-0000-0000-000000000031', 'Joseph', 'El Khoury', '1990-05-15', 'Masculin', 'X001', 'A+', 'Libanaise', NULL, NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000032', 'Marie', 'Assaf', '1992-08-22', 'Féminin', 'X002', 'O+', 'Libanaise', NULL, NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000033', 'Patrick', 'Doumit', '1988-11-10', 'Masculin', 'X003', 'B+', 'Libanaise', NULL, NOW(), NOW(), false),
('e1000000-0000-0000-0000-000000000034', 'Nadine', 'Boutros', '1991-03-18', 'Féminin', 'X004', 'A+', 'Libanaise', NULL, NOW(), NOW(), false);

-- User accounts created via app startup (see below)

-- Get the seeded functional role IDs
-- We need the actual IDs from the seeded roles. Let's use variables.
DO $$
DECLARE
    role_chef_unite UUID;
    role_chef_equipe UUID;
    role_animateur UUID;
BEGIN
    SELECT id INTO role_chef_unite FROM functional_roles WHERE code = 'chef-unite' LIMIT 1;
    SELECT id INTO role_chef_equipe FROM functional_roles WHERE code = 'chef-equipe' LIMIT 1;
    SELECT id INTO role_animateur FROM functional_roles WHERE code = 'animateur' LIMIT 1;

    -- Assignments: Leaders to their units
    -- Joseph = Chef d'unité Meute
    INSERT INTO member_assignments (id, member_id, unit_id, team_id, functional_role_id, start_date, end_date, created_at, updated_at, is_deleted) VALUES
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000031', 'c1000000-0000-0000-0000-000000000001', NULL, role_chef_unite, '2024-09-01', NULL, NOW(), NOW(), false);
    -- Marie = Chef d'unité Troupe
    INSERT INTO member_assignments (id, member_id, unit_id, team_id, functional_role_id, start_date, end_date, created_at, updated_at, is_deleted) VALUES
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000032', 'c1000000-0000-0000-0000-000000000002', NULL, role_chef_unite, '2024-09-01', NULL, NOW(), NOW(), false);
    -- Patrick = Chef d'unité Route
    INSERT INTO member_assignments (id, member_id, unit_id, team_id, functional_role_id, start_date, end_date, created_at, updated_at, is_deleted) VALUES
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000033', 'c1000000-0000-0000-0000-000000000003', NULL, role_chef_unite, '2024-09-01', NULL, NOW(), NOW(), false);
    -- Nadine = Chef d'unité Maîtrise
    INSERT INTO member_assignments (id, member_id, unit_id, team_id, functional_role_id, start_date, end_date, created_at, updated_at, is_deleted) VALUES
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000034', 'c1000000-0000-0000-0000-000000000004', NULL, role_chef_unite, '2024-09-01', NULL, NOW(), NOW(), false);

    -- Meute assignments (Sizaine Brune: 4, Sizaine Grise: 4, Sizaine Blanche: 4)
    INSERT INTO member_assignments (id, member_id, unit_id, team_id, functional_role_id, start_date, end_date, created_at, updated_at, is_deleted) VALUES
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', role_chef_equipe, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', role_chef_equipe, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000009', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003', role_chef_equipe, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000010', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000012', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false);

    -- Troupe assignments (Aigles: 4, Lions: 4, Cerfs: 4)
    INSERT INTO member_assignments (id, member_id, unit_id, team_id, functional_role_id, start_date, end_date, created_at, updated_at, is_deleted) VALUES
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000013', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000004', role_chef_equipe, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000014', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000004', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000015', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000004', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000016', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000004', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000017', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000005', role_chef_equipe, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000018', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000005', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000019', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000005', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000020', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000005', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000021', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000006', role_chef_equipe, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000022', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000006', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000023', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000006', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000024', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000006', role_animateur, '2024-09-01', NULL, NOW(), NOW(), false);

    -- Route assignments (no teams)
    INSERT INTO member_assignments (id, member_id, unit_id, team_id, functional_role_id, start_date, end_date, created_at, updated_at, is_deleted) VALUES
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000025', 'c1000000-0000-0000-0000-000000000003', NULL, role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000026', 'c1000000-0000-0000-0000-000000000003', NULL, role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000027', 'c1000000-0000-0000-0000-000000000003', NULL, role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000028', 'c1000000-0000-0000-0000-000000000003', NULL, role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000029', 'c1000000-0000-0000-0000-000000000003', NULL, role_animateur, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000030', 'c1000000-0000-0000-0000-000000000003', NULL, role_animateur, '2024-09-01', NULL, NOW(), NOW(), false);

    -- Maîtrise assignments
    INSERT INTO member_assignments (id, member_id, unit_id, team_id, functional_role_id, start_date, end_date, created_at, updated_at, is_deleted) VALUES
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000031', 'c1000000-0000-0000-0000-000000000004', NULL, role_chef_unite, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000032', 'c1000000-0000-0000-0000-000000000004', NULL, role_chef_unite, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000033', 'c1000000-0000-0000-0000-000000000004', NULL, role_chef_unite, '2024-09-01', NULL, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000034', 'c1000000-0000-0000-0000-000000000004', NULL, role_chef_unite, '2024-09-01', NULL, NOW(), NOW(), false);

    -- Some guardians
    INSERT INTO guardians (id, first_name, last_name, profession, is_deceased, created_at, updated_at, is_deleted) VALUES
    ('a7000000-0000-0000-0000-000000000001', 'Samir', 'Cheaib', 'Ingénieur', false, NOW(), NOW(), false),
    ('a7000000-0000-0000-0000-000000000002', 'Rania', 'Cheaib', 'Enseignant', false, NOW(), NOW(), false),
    ('a7000000-0000-0000-0000-000000000003', 'Walid', 'Haddad', 'Médecin', false, NOW(), NOW(), false),
    ('a7000000-0000-0000-0000-000000000004', 'Hala', 'Haddad', 'Avocat', false, NOW(), NOW(), false);

    -- Guardian links
    INSERT INTO guardian_links (id, guardian_id, member_id, relationship_type, is_primary_contact, is_emergency_contact, created_at, updated_at, is_deleted) VALUES
    (gen_random_uuid(), 'a7000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Père', true, true, NOW(), NOW(), false),
    (gen_random_uuid(), 'a7000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'Mère', false, true, NOW(), NOW(), false),
    (gen_random_uuid(), 'a7000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000002', 'Père', true, true, NOW(), NOW(), false),
    (gen_random_uuid(), 'a7000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000002', 'Mère', false, false, NOW(), NOW(), false);

    -- Guardian phones
    INSERT INTO guardian_phones (id, guardian_id, country_code, number, type, is_primary, created_at, updated_at, is_deleted) VALUES
    (gen_random_uuid(), 'a7000000-0000-0000-0000-000000000001', '+961', '3123456', 'Mobile', true, NOW(), NOW(), false),
    (gen_random_uuid(), 'a7000000-0000-0000-0000-000000000002', '+961', '3654321', 'Mobile', true, NOW(), NOW(), false),
    (gen_random_uuid(), 'a7000000-0000-0000-0000-000000000003', '+961', '71234567', 'Mobile', true, NOW(), NOW(), false);

    -- Guardian emails
    INSERT INTO guardian_emails (id, guardian_id, address, type, is_primary, created_at, updated_at, is_deleted) VALUES
    (gen_random_uuid(), 'a7000000-0000-0000-0000-000000000001', 'samir.cheaib@email.com', 'Personnel', true, NOW(), NOW(), false),
    (gen_random_uuid(), 'a7000000-0000-0000-0000-000000000003', 'walid.haddad@email.com', 'Personnel', true, NOW(), NOW(), false);

    -- Some member phones
    INSERT INTO member_phones (id, member_id, country_code, number, type, is_primary, is_emergency, created_at, updated_at, is_deleted) VALUES
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000031', '+961', '3111111', 'Mobile', true, false, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000032', '+961', '3222222', 'Mobile', true, false, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000033', '+961', '3333333', 'Mobile', true, false, NOW(), NOW(), false);

    -- Member emails
    INSERT INTO member_emails (id, member_id, address, type, is_primary, is_emergency, created_at, updated_at, is_deleted) VALUES
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000031', 'joseph.el.khoury@scouts.gndj', 'Personnel', true, false, NOW(), NOW(), false),
    (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000032', 'marie.assaf@scouts.gndj', 'Personnel', true, false, NOW(), NOW(), false);

END $$;
