using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Infrastructure.Persistence;

// Database seeding + idempotent self-healing migrations run on app startup. SeedAsync does the initial
// bootstrap (security profiles, functional roles, the super-admin user/member, default settings) ONLY on
// a fresh DB; the other Seed* methods patch existing databases per-item (missing permissions/settings/
// templates, new profiles, role ranks) so each is safe to run on every startup without duplicating rows.
public static class SeedData
{
    // Chef de Groupe = group-wide management WITHOUT system administration. Everything except:
    // associations management (which also gates settings/SMTP/email/API keys), unit create/edit/delete,
    // unit-type management, roles & permissions management, and hard delete.
    public static readonly string[] ChefDeGroupePermissions = Permissions.All.Where(p =>
        p != Permissions.AssociationsManage &&
        p != Permissions.UnitsCreate && p != Permissions.UnitsEdit && p != Permissions.UnitsDelete &&
        p != Permissions.UnitTypesManage &&
        p != Permissions.RolesManage &&
        p != Permissions.AdminHardDelete).ToArray();

    // Curated starter list of Lebanese towns (Beirut + Mount Lebanon focus, where the group's families
    // live, plus major cities). CG/super-admin curate it afterwards via the "Villes" admin page.
    public static readonly string CuratedCitiesJson = System.Text.Json.JsonSerializer.Serialize(new[]
    {
        "Abadieh", "Achkout", "Achrafieh", "Adma", "Ain Aalak", "Ain Ekrin", "Ain el Remmaneh", "Ain Saade",
        "Aley", "Amchit", "Antelias", "Araya", "Aramoun", "Awkar", "Baabda", "Baabdat", "Baalbek", "Baalchmay",
        "Badaro", "Batroun", "Bayada", "Bdadoun", "Beit el Chaar",
        "Beit Mery", "Betchay", "Beyrouth", "Bhamdoun", "Bickfaya", "Bkennaya", "Bleibel", "Brazilia", "Broumana",
        "Bsaba", "Bsalim", "Bsous", "Byblos (Jbeil)", "Chiyah", "Cornet Chehwan", "Dahr el Sawan", "Daroun-Harissa",
        "Daychounieh", "Dbayeh", "Dekwaneh", "Der Mimas", "Dik el Mehdi", "Elyssar", "Falougha", "Fanar",
        "Fayadieh", "Furn el Chebbak", "Gemmayze", "Ghazir", "Ghedras", "Hadath", "Haret el Set", "Haret Sakher", "Hazmieh",
        "Horch Tabet", "Houmal", "Jal el Dib", "Jamhour", "Jdeideh", "Jezzine", "Jisr el Bacha", "Jounieh",
        "Kahale", "Kaslik", "Kfarchima", "Kleiat", "Kobayat", "Kornet el Hamra", "Louaize", "Mar Roukoz",
        "Mar Takla", "Mansourieh", "Mazraat Yachouh", "Mkalles", "Monteverde", "Mtayleb", "Nabatieh",
        "Nabay", "Naccache", "New Rawda", "Qannabet Broumana", "Rabieh", "Rabweh", "Rihaniyeh", "Rmeil",
        "Roumieh", "Sabtieh", "Saida", "Sed el Bauchrieh", "Sin el Fil", "Sioufi", "Sour (Tyr)", "Sursock",
        "Tilal Ain Saade", "Tripoli", "Wadi Chahrour", "Yarze", "Zahle", "Zalka", "Zekrit", "Zouk Mikael", "Zouk Mosbeh"
    });

    // Activity domains (catégories) for the guardian "Domaine" picker. The free-text profession holds the title.
    public static readonly string ProfessionDomainsJson = System.Text.Json.JsonSerializer.Serialize(new[]
    {
        "Administration publique", "Agriculture / Agroalimentaire", "Architecture", "Armée/Secteur militaire",
        "Art, Design", "Audiovisuel, Spectacle, Cinéma", "Audit, Conseil, Expertise", "Automobile",
        "Banque, Assurance", "Bâtiment", "Chimie, pharmacie", "Commerce, distribution, e-commerce",
        "Culture, Artisanat d'art", "Direction, Entreprise", "Droit, justice", "Edition, Journalisme",
        "Electronique, Electrotechnique", "Energie", "Enseignement", "Environnement", "Habillement, Mode",
        "Hôtellerie, Restauration, Tourisme", "Humanitaire", "Immobilier", "Informatique, Numérique et Réseaux",
        "Ingénierie", "Logistique, transport", "Maintenance, entretien", "Marketing, publicité, Communication",
        "Matériaux, Transformations", "Mécanique", "Politique", "Santé, médical", "Sciences Physique – Maths - Data",
        "Secrétariat/Administration", "Sécurité - Secours", "Social, Services à la personne",
        "Soins - Esthétique - Coiffure", "Sport et loisirs", "Sans profession / Au foyer", "Autre"
    });

    // Fresh-DB bootstrap only — guarded by "any security profile exists" (IgnoreQueryFilters so a
    // soft-deleted profile still counts), so it never re-runs / never duplicates on an existing DB.
    public static async Task SeedAsync(GndjDbContext context, string superAdminEmail, string superAdminPasswordHash)
    {
        if (await context.SecurityProfiles.IgnoreQueryFilters().AnyAsync())
            return;

        // Security Profiles
        var superAdminProfile = CreateProfile("Super Admin", "super-admin", "Accès total au système", Permissions.All);
        var assocAdminProfile = CreateProfile("Admin Association", "association-admin", "Administration d'une association",
            Permissions.All.Where(p => p != Permissions.AdminHardDelete).ToArray());
        var chefUniteProfile = CreateProfile("Chef d'unité", "chef-unite", "Gestion d'une unité",
        [
            Permissions.MembersView, Permissions.MembersCreate, Permissions.MembersEdit, Permissions.MembersDelete,
            Permissions.UnitsView, Permissions.UnitsEdit,
            Permissions.TeamsView, Permissions.TeamsCreate, Permissions.TeamsEdit, Permissions.TeamsDelete,
            Permissions.AssignmentsView, Permissions.AssignmentsCreate, Permissions.AssignmentsEdit, Permissions.AssignmentsDelete,
            Permissions.RelationshipsView, Permissions.RelationshipsCreate, Permissions.RelationshipsEdit, Permissions.RelationshipsDelete,
            Permissions.RolesView,
            Permissions.DocumentsView, Permissions.DocumentsCreate, Permissions.DocumentsEdit, Permissions.DocumentsDelete, Permissions.DocumentsApprove,
            Permissions.CotisationsView, Permissions.CotisationsCreate, Permissions.CotisationsEdit, Permissions.CotisationsDelete,
            Permissions.PassageView, Permissions.PassagePropose,
            Permissions.CampGrade
        ]);
        var chefEquipeProfile = CreateProfile("Chef d'équipe", "chef-equipe", "Gestion d'une équipe",
        [
            Permissions.MembersView,
            Permissions.TeamsView,
            Permissions.AssignmentsView,
            Permissions.RelationshipsView,
            Permissions.DocumentsView,
            Permissions.CotisationsView
        ]);
        var readOnlyProfile = CreateProfile("Lecture seule", "read-only", "Accès en lecture uniquement (membre)",
            Permissions.All.Where(p => p.EndsWith(".view")).ToArray());
        var chefDeGroupeProfile = CreateProfile("Chef de Groupe", "chef-de-groupe",
            "Gestion du groupe entier (toutes les unités), sans administration système", ChefDeGroupePermissions);
        chefDeGroupeProfile.IsGroupLevel = true;

        context.SecurityProfiles.AddRange(superAdminProfile, assocAdminProfile, chefUniteProfile, chefEquipeProfile, readOnlyProfile, chefDeGroupeProfile);

        // Functional Roles (global — no unit type restriction)
        var roleSuperAdmin = new FunctionalRole
        {
            Name = "Super Admin", Code = "super-admin",
            Description = "Administrateur global du système",
            SecurityProfileId = superAdminProfile.Id, UnitTypeId = null
        };
        var roleAssocAdmin = new FunctionalRole
        {
            Name = "Admin Association", Code = "admin-association",
            Description = "Administrateur d'une association",
            SecurityProfileId = assocAdminProfile.Id, UnitTypeId = null
        };
        var roleChefUnite = new FunctionalRole
        {
            Name = "Chef d'unité", Code = "chef-unite",
            Description = "Responsable d'une unité",
            SecurityProfileId = chefUniteProfile.Id, UnitTypeId = null
        };
        var roleChefEquipe = new FunctionalRole
        {
            Name = "Chef d'équipe", Code = "chef-equipe",
            Description = "Responsable d'une équipe",
            SecurityProfileId = chefEquipeProfile.Id, UnitTypeId = null
        };
        context.FunctionalRoles.AddRange(roleSuperAdmin, roleAssocAdmin, roleChefUnite, roleChefEquipe);

        // Super Admin User + Member
        var adminMember = new Member
        {
            FirstName = "Admin",
            LastName = "Système",
        };
        context.Members.Add(adminMember);

        context.MemberEmails.Add(new MemberEmail
        {
            MemberId = adminMember.Id,
            Address = superAdminEmail,
            Type = "Personnel",
            IsPrimary = true
        });

        var adminUser = new User
        {
            MemberId = adminMember.Id,
            Email = superAdminEmail,
            PasswordHash = superAdminPasswordHash,
            IsSuperAdmin = true,
            IsActive = true
        };
        context.Users.Add(adminUser);

        // Default Settings
        context.Settings.AddRange(
            new Setting { Key = "pinned_nationalities", Value = "[\"Libanaise\",\"Française\",\"Syrienne\",\"Palestinienne\"]", Category = "members", Label = "Nationalités épinglées", Description = "Nationalités affichées en premier dans la liste de sélection", ValueType = "json_array" },
            new Setting { Key = "default_country_code", Value = "+961", Category = "members", Label = "Indicatif téléphonique par défaut", Description = "Indicatif pays utilisé par défaut pour les nouveaux téléphones", ValueType = "string" },
            new Setting { Key = "default_country", Value = "Liban", Category = "members", Label = "Pays par défaut", Description = "Pays utilisé par défaut pour les nouvelles adresses", ValueType = "string" },
            new Setting { Key = "pinned_professions", Value = "[\"Médecin\",\"Ingénieur\",\"Avocat\",\"Enseignant\",\"Commerçant\"]", Category = "famille", Label = "Professions épinglées", Description = "Professions affichées en premier dans la liste de sélection des parents", ValueType = "json_array" }
        );

        await context.SaveChangesAsync();
    }

    // Back-fills permissions added after a profile was first seeded (e.g. the document/cotisation/passage
    // features) onto the system profiles, adding only the ones each profile is still missing. Idempotent.
    public static async Task SeedMissingPermissionsAsync(GndjDbContext context)
    {
        // Define which permissions each profile should have for the new document/cotisation features
        var profilePermissions = new Dictionary<string, string[]>
        {
            ["super-admin"] = Permissions.All,
            ["association-admin"] = Permissions.All.Where(p => p != Permissions.AdminHardDelete).ToArray(),
            ["chef-unite"] =
            [
                Permissions.DocumentsView, Permissions.DocumentsCreate, Permissions.DocumentsEdit, Permissions.DocumentsDelete, Permissions.DocumentsApprove,
                Permissions.CotisationsView, Permissions.CotisationsCreate, Permissions.CotisationsEdit, Permissions.CotisationsDelete,
                Permissions.DocumentTypesView,
                Permissions.ProgressionView, Permissions.ProgressionManage,
                Permissions.PassageView, Permissions.PassagePropose,
                Permissions.CampGrade
            ],
            ["chef-equipe"] = [Permissions.DocumentsView, Permissions.CotisationsView, Permissions.ProgressionView, Permissions.PassageView],
            ["read-only"] = Permissions.All.Where(p => p.EndsWith(".view")).ToArray(),
        };

        foreach (var (code, permissions) in profilePermissions)
        {
            var profile = await context.SecurityProfiles
                .Include(p => p.Permissions)
                .FirstOrDefaultAsync(p => p.Code == code);
            if (profile is null) continue;

            var existingPerms = profile.Permissions.Select(p => p.Permission).ToHashSet();
            var missing = permissions.Where(p => !existingPerms.Contains(p)).ToList();

            foreach (var perm in missing)
            {
                context.SecurityProfilePermissions.Add(new SecurityProfilePermission
                {
                    SecurityProfileId = profile.Id,
                    Permission = perm
                });
            }
        }

        await context.SaveChangesAsync();
    }

    // Creates the Chef de Groupe profile on an existing DB if missing, and keeps its permissions +
    // group-level flag in sync. Idempotent.
    public static async Task SeedChefDeGroupeProfileAsync(GndjDbContext context)
    {
        var profile = await context.SecurityProfiles.Include(p => p.Permissions)
            .FirstOrDefaultAsync(p => p.Code == "chef-de-groupe");
        if (profile is null)
        {
            profile = CreateProfile("Chef de Groupe", "chef-de-groupe",
                "Gestion du groupe entier (toutes les unités), sans administration système", ChefDeGroupePermissions);
            profile.IsGroupLevel = true;
            context.SecurityProfiles.Add(profile);
            await context.SaveChangesAsync();
            return;
        }
        if (!profile.IsGroupLevel) profile.IsGroupLevel = true;
        var existing = profile.Permissions.Select(p => p.Permission).ToHashSet();
        foreach (var perm in ChefDeGroupePermissions.Where(p => !existing.Contains(p)))
            context.SecurityProfilePermissions.Add(new SecurityProfilePermission { SecurityProfileId = profile.Id, Permission = perm });
        await context.SaveChangesAsync();
    }

    // Assistant baseline = group-wide management WITHOUT the CG-only powers (maitrise.manage = managing
    // the maîtrise, roles.manage_group = setting staff access). The CG tunes each per area from there.
    public static readonly string[] AssistantDeGroupePermissions = ChefDeGroupePermissions
        .Where(p => p != Permissions.MaitriseManage && p != Permissions.RolesManageGroup).ToArray();

    // Ensures the assistant-de-groupe baseline exists, moves the non-CG group functions off chef-de-groupe
    // onto it (so only the CG keeps the CG-only pages), and strips CG-only powers from any forked group
    // profile. Idempotent — safe to run on every startup.
    public static async Task SeedAssistantDeGroupeProfileAsync(GndjDbContext context)
    {
        var assistant = await context.SecurityProfiles.Include(p => p.Permissions)
            .FirstOrDefaultAsync(p => p.Code == "assistant-de-groupe");
        if (assistant is null)
        {
            assistant = CreateProfile("Assistant(e) de Groupe", "assistant-de-groupe",
                "Gestion du groupe (sans gérer la maîtrise ni les accès)", AssistantDeGroupePermissions);
            assistant.IsGroupLevel = true;
            context.SecurityProfiles.Add(assistant);
            await context.SaveChangesAsync();
        }
        else if (!assistant.IsGroupLevel) { assistant.IsGroupLevel = true; await context.SaveChangesAsync(); }

        // Move non-CG group functions still sharing chef-de-groupe onto the assistant baseline.
        var cdg = await context.SecurityProfiles.FirstOrDefaultAsync(p => p.Code == "chef-de-groupe");
        if (cdg is not null)
        {
            var toMove = await context.FunctionalRoles
                .Where(r => !r.IsDeleted && r.SecurityProfileId == cdg.Id && r.Code != "CG"
                            && r.UnitType != null && r.UnitType.Code == "GRP")
                .ToListAsync();
            foreach (var r in toMove) r.SecurityProfileId = assistant.Id;
            if (toMove.Count > 0) await context.SaveChangesAsync();
        }

        // Strip CG-only powers from every group-level profile except chef-de-groupe (e.g. forked ones).
        var cgOnly = new[] { Permissions.MaitriseManage, Permissions.RolesManageGroup };
        var strays = await context.SecurityProfilePermissions
            .Where(spp => cgOnly.Contains(spp.Permission)
                && spp.SecurityProfile.IsGroupLevel && spp.SecurityProfile.Code != "chef-de-groupe")
            .ToListAsync();
        if (strays.Count > 0) { context.SecurityProfilePermissions.RemoveRange(strays); await context.SaveChangesAsync(); }
    }

    // Default "rentrée scoute" task template (scout-year startup checklist). Idempotent.
    public static async Task SeedRentreeTemplateAsync(GndjDbContext context)
    {
        if (await context.RentreeTaskTemplates.AnyAsync()) return;

        const string CG = "chef-de-groupe", CU = "chef-unite";
        int order = 0;
        var tasks = new List<RentreeTaskTemplate>();
        RentreeTaskTemplate Add(string title, string phase, string role, bool fanOut, string? deadline, params RentreeTaskTemplate[] deps)
        {
            var t = new RentreeTaskTemplate
            {
                Title = title, Phase = phase, DisplayOrder = order++, AssigneeType = "role", AssigneeRole = role,
                FanOutPerUnit = fanOut, DefaultDeadlineLabel = deadline,
                DependsOnTemplateIds = deps.Select(d => d.Id).ToArray()
            };
            tasks.Add(t);
            return t;
        }

        // ① Configuration
        var cfgYear = Add("Définir la nouvelle année scoute et les dates", "Configuration", CG, false, "4ᵉ sem. septembre");
        var cfgUnits = Add("Vérifier les unités, types et équipes (créer les nouvelles sizaines)", "Configuration", CG, false, "4ᵉ sem. septembre");
        Add("Confirmer les maîtrises (CU/ACU de chaque unité)", "Configuration", CG, false, "4ᵉ sem. septembre");
        var cfgQuotas = Add("Définir les quotas d'accueil par unité", "Configuration", CG, false, "4ᵉ sem. septembre", cfgUnits);
        // ② Passage
        var pasOpen = Add("Ouvrir le passage", "Passage", CG, false, "1ʳᵉ sem. octobre", cfgYear);
        var pasPropose = Add("Proposer les passages de chaque membre (ou « Pas de changement »)", "Passage", CU, true, "1ʳᵉ sem. octobre", pasOpen);
        var pasReview = Add("Réviser et approuver les propositions de passage", "Passage", CG, false, "2ᵉ sem. octobre", pasPropose);
        var pasFinalize = Add("Finaliser les passages (création des nouvelles affectations)", "Passage", CG, false, "2ᵉ sem. octobre", pasReview);
        // ③ Demandes
        var demTerms = Add("Mettre à jour les conditions d'inscription (texte d'acceptation des demandes)", "Demandes", CG, false, "septembre", cfgYear);
        var demOpen = Add("Ouvrir les inscriptions", "Demandes", CG, false, "septembre", cfgYear, cfgQuotas, demTerms);
        var demReview = Add("Réviser les demandes d'inscription (accepter/refuser + unité)", "Demandes", CG, false, "octobre", demOpen);
        Add("Envoyer les réponses aux demandes (conversion en membres)", "Demandes", CG, false, "octobre", demReview);
        // ④ Dossiers membres
        Add("Vérifier et approuver les documents des membres", "Dossiers membres", CU, true, "octobre – novembre", pasFinalize);
        Add("Suivre et enregistrer les cotisations", "Dossiers membres", CU, true, "octobre – novembre", pasFinalize);
        var photo = Add("Organiser la séance photo", "Dossiers membres", CU, true, "octobre", pasFinalize);
        // ⑤ Organisation
        var orgTeams = Add("Répartir les membres en sizaines / équipes", "Organisation", CU, true, "octobre", pasFinalize);
        Add("Vérifier le trombinoscope / la liste", "Organisation", CU, true, "octobre", orgTeams);
        Add("Imprimer les cartes membres", "Organisation", CU, true, "octobre", photo, orgTeams);
        Add("Confirmer les étapes et badges de l'année", "Progression", CG, false, "octobre");

        context.RentreeTaskTemplates.AddRange(tasks);
        await context.SaveChangesAsync();
    }

    public static async Task SeedMissingSettingsAsync(GndjDbContext context)
    {
        var existingKeys = await context.Settings.Select(s => s.Key).ToListAsync();

        var allSettings = new List<Setting>
        {
            new() { Key = "pinned_nationalities", Value = "[\"Libanaise\",\"Française\",\"Syrienne\",\"Palestinienne\"]", Category = "members", Label = "Nationalités épinglées", Description = "Nationalités affichées en premier dans la liste de sélection", ValueType = "json_array" },
            new() { Key = "default_country_code", Value = "+961", Category = "members", Label = "Indicatif téléphonique par défaut", Description = "Indicatif pays utilisé par défaut pour les nouveaux téléphones", ValueType = "string" },
            new() { Key = "default_country", Value = "Liban", Category = "members", Label = "Pays par défaut", Description = "Pays utilisé par défaut pour les nouvelles adresses", ValueType = "string" },
            new() { Key = "pinned_professions", Value = "[\"Médecin\",\"Ingénieur\",\"Avocat\",\"Enseignant\",\"Commerçant\"]", Category = "famille", Label = "Professions épinglées", Description = "Professions affichées en premier dans la liste de sélection des parents", ValueType = "json_array" },
            new() { Key = "user_domain", Value = "scouts.gndj", Category = "general", Label = "Domaine utilisateur", Description = "Domaine utilisé pour générer les noms d'utilisateur (ex: prenom.nom@domaine)", ValueType = "string" },
            new() { Key = "documents.max_file_size_mb", Value = "5", Category = "documents", Label = "Taille maximale de fichier (Mo)", Description = "Taille maximale autorisée pour les documents téléchargés, en mégaoctets", ValueType = "number" },
            new() { Key = "documents.allowed_file_types", Value = "[\"pdf\",\"jpg\",\"jpeg\",\"png\"]", Category = "documents", Label = "Types de fichiers autorisés", Description = "Extensions de fichiers autorisées pour les documents", ValueType = "json_array" },
            new() { Key = "cotisation.default_amount", Value = "100", Category = "cotisations", Label = "Montant de cotisation par défaut", Description = "Montant par défaut pour les nouvelles cotisations (en USD)", ValueType = "number" },
            new() { Key = "cotisation.current_scout_year", Value = "2025-2026", Category = "cotisations", Label = "Année scoute en cours", Description = "Année scoute utilisée par défaut pour les nouvelles cotisations", ValueType = "string" },
            new() { Key = "cotisation.default_currency", Value = "USD", Category = "cotisations", Label = "Devise par défaut", Description = "Devise par défaut pour les cotisations et le calcul du total", ValueType = "string" },
            new() { Key = "cotisation.exchange_rates", Value = "{\"LBP\":89500,\"EUR\":0.92}", Category = "cotisations", Label = "Taux de change", Description = "Taux de change par rapport à la devise par défaut (ex: 1 USD = 89500 LBP)", ValueType = "json" },
            new() { Key = "member.schools", Value = "[\"Collège Notre-Dame de Jamhour\",\"Collège Saint-Joseph Antoura\"]", Category = "members", Label = "Écoles", Description = "Liste des écoles disponibles dans le formulaire membre", ValueType = "json_array" },
            new() { Key = "member.school_codes", Value = "{\"Collège Notre-Dame de Jamhour\":\"CNDJ\",\"Collège Saint-Joseph Antoura\":\"CSJA\",\"Collège Saint-Grégoire\":\"CSG\"}", Category = "members", Label = "Codes des écoles", Description = "Code court par école (affiché dans les tableaux). Insensible aux accents/majuscules.", ValueType = "json" },
            new() { Key = "member.default_school", Value = "Collège Notre-Dame de Jamhour", Category = "members", Label = "École par défaut", Description = "École sélectionnée par défaut lors de la création d'un membre", ValueType = "string" },
            new() { Key = "member.classes", Value = "[\"8ème\",\"7ème\",\"6ème\",\"5ème\",\"4ème\",\"3ème\",\"2nde\",\"1ère\",\"Term\",\"Université\"]", Category = "members", Label = "Classes", Description = "Liste des classes disponibles dans le formulaire membre", ValueType = "json_array" },
            new() { Key = "member.cities", Value = CuratedCitiesJson, Category = "members", Label = "Villes", Description = "Liste des villes disponibles dans les formulaires d'adresse (gérable par le Chef de Groupe)", ValueType = "json_array" },
            new() { Key = "member.profession_domains", Value = ProfessionDomainsJson, Category = "members", Label = "Domaines de profession", Description = "Catégories d'activité proposées pour la profession des parents (le titre reste en texte libre)", ValueType = "json_array" },
            new() { Key = "camp.familles_count", Value = "12", Category = "camp", Label = "Nombre de familles (Camp BP)", Description = "Nombre de familles par défaut lors de la création d'un camp BP", ValueType = "number" },
            new() { Key = "passage.enabled", Value = "false", Category = "passage", Label = "Passage annuel actif", Description = "Active ou désactive le processus de passage annuel", ValueType = "boolean" },
            new() { Key = "passage.scout_year", Value = "2026-2027", Category = "passage", Label = "Année scoute du passage", Description = "Année scoute cible pour le passage en cours", ValueType = "string" },
            new() { Key = "passage.date", Value = "", Category = "passage", Label = "Date du passage", Description = "Date d'effet du passage : date de début des nouvelles affectations des anciens membres (et de fin des anciennes). À définir chaque année ; vide = date du jour.", ValueType = "date" },
            new() { Key = "card.config", Value = "{\"orgName\":\"GNDJ Scout\",\"fields\":{\"photo\":true,\"name\":true,\"cardNumber\":true,\"unit\":true,\"team\":true,\"role\":true,\"dateOfBirth\":true,\"bloodType\":true,\"emergencyContact\":true,\"customFields\":true}}", Category = "reports", Label = "Configuration de la carte membre", Description = "Champs affichés sur la carte membre", ValueType = "json" },
            new() { Key = "app.base_url", Value = "http://localhost:5173", Category = "general", Label = "URL de l'application", Description = "URL de base utilisée pour les liens dans les emails (ex: https://app.gndj.org)", ValueType = "string" },
            new() { Key = "demande.enabled", Value = "false", Category = "demande", Label = "Inscriptions ouvertes", Description = "Ouvre ou ferme le portail public de demande d'inscription", ValueType = "boolean" },
            new() { Key = "demande.scout_year", Value = "2026-2027", Category = "demande", Label = "Année scoute des inscriptions", Description = "Année scoute cible pour les nouvelles inscriptions", ValueType = "string" },
            new() { Key = "demande.member_start_date", Value = "", Category = "demande", Label = "Date de début des nouveaux membres", Description = "Date de début d'affectation des nouveaux membres admis lors de l'envoi des réponses. À définir chaque année ; vide = date du jour.", ValueType = "date" },
            new() { Key = "demande.max_per_account", Value = "3", Category = "demande", Label = "Nombre max de demandes par compte", Description = "Nombre maximum d'enfants qu'un compte peut inscrire", ValueType = "number" },
            new() { Key = "demande.max_scout_relations", Value = "3", Category = "demande", Label = "Nombre max de proches scouts", Description = "Nombre maximum de proches déjà scouts qu'un compte peut déclarer", ValueType = "number" },
            new() { Key = "demande.notes_max_length", Value = "500", Category = "demande", Label = "Longueur max des notes parents", Description = "Nombre maximum de caractères pour les notes des parents", ValueType = "number" },
            new() { Key = "demande.require_email_verification", Value = "true", Category = "demande", Label = "Vérification email requise", Description = "Exige la vérification de l'email avant de soumettre une demande", ValueType = "boolean" },
            new() { Key = "demande.decide_siblings_together", Value = "true", Category = "demande", Label = "Décider les fratries ensemble", Description = "Affiche le statut des frères/sœurs lors de la revue", ValueType = "boolean" },
            new() { Key = "demande.intro_text", Value = "Bienvenue ! Créez un compte pour présenter une demande d'inscription au mouvement scout. Vous pourrez inscrire un ou plusieurs enfants.", Category = "demande", Label = "Texte d'accueil du portail", Description = "Message affiché sur la page d'accueil du portail d'inscription", ValueType = "string" },
            new() { Key = "demande.terms", Value = "En soumettant cette demande, je certifie que les informations fournies sont exactes et j'autorise le Groupe à les utiliser dans le cadre de l'inscription scoute. (Texte à compléter par la Maîtrise de Groupe avant l'ouverture des inscriptions.)", Category = "demande", Label = "Conditions d'inscription (à accepter)", Description = "Conditions que le parent doit accepter avant de soumettre une demande. Laisser vide pour ne pas exiger d'acceptation.", ValueType = "string" },
            new() { Key = "demande.excluded_classe", Value = "6ème", Category = "demande", Label = "Classe non éligible (demande)", Description = "Classe exclue du formulaire de demande : un enfant dans cette classe ne peut pas s'inscrire (masquée du menu Classe + refusée à la soumission). Laisser vide pour ne pas exclure de classe.", ValueType = "string" },
            new() { Key = "contact.recipient_email", Value = "", Category = "contact", Label = "Email de contact", Description = "Adresse qui reçoit les messages du formulaire de contact public (si vide, les messages vont au super administrateur)", ValueType = "string" },
        };

        var missing = allSettings.Where(s => !existingKeys.Contains(s.Key)).ToList();
        if (missing.Count > 0)
        {
            context.Settings.AddRange(missing);
            await context.SaveChangesAsync();
        }

        // Rename old settings keys (school_year → scout_year)
        var renames = new Dictionary<string, string>
        {
            ["cotisation.current_school_year"] = "cotisation.current_scout_year",
            ["passage.school_year"] = "passage.scout_year",
        };
        foreach (var (oldKey, newKey) in renames)
        {
            var oldSetting = await context.Settings.FirstOrDefaultAsync(s => s.Key == oldKey);
            if (oldSetting is not null)
            {
                var newExists = await context.Settings.AnyAsync(s => s.Key == newKey);
                if (!newExists)
                {
                    context.Settings.Add(new Setting
                    {
                        Key = newKey, Value = oldSetting.Value,
                        Category = oldSetting.Category, Label = oldSetting.Label,
                        Description = oldSetting.Description, ValueType = oldSetting.ValueType
                    });
                }
                context.Settings.Remove(oldSetting);
            }
        }
        await context.SaveChangesAsync();
    }

    public static async Task SeedDefaultEmailTemplatesAsync(GndjDbContext context)
    {
        if (await context.EmailTemplates.IgnoreQueryFilters().AnyAsync())
            return;

        context.EmailTemplates.Add(new EmailTemplate
        {
            Name = "Réinitialisation de mot de passe",
            Code = "password_reset",
            Module = "auth",
            Subject = "Réinitialisation de votre mot de passe — GNDJ",
            BodyHtml = "<h2>Bonjour {{memberName}},</h2><p>Vous avez demandé la réinitialisation de votre mot de passe.</p><p>Cliquez sur le lien suivant pour choisir un nouveau mot de passe :</p><p><a href=\"{{resetLink}}\" style=\"background-color:#1e3a5f;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;\">Réinitialiser mon mot de passe</a></p><p>Ce lien expire dans {{expiryHours}} heure(s).</p><p>Si vous n'avez pas demandé cette réinitialisation, ignorez ce message.</p><p>— L'équipe GNDJ</p>",
            Variables = "[{\"key\":\"memberName\",\"label\":\"Nom du membre\"},{\"key\":\"resetLink\",\"label\":\"Lien de réinitialisation\"},{\"key\":\"expiryHours\",\"label\":\"Durée de validité (heures)\"}]",
            IsActive = true
        });

        await context.SaveChangesAsync();
    }

    // Adds demande email templates if missing (per-code, idempotent — unlike the all-or-nothing default seed).
    public static async Task SeedDemandeEmailTemplatesAsync(GndjDbContext context)
    {
        var templates = new[]
        {
            new EmailTemplate
            {
                Name = "Vérification email (inscription)", Code = "demande_email_verification", Module = "demande",
                Subject = "Vérifiez votre adresse email — GNDJ Scout",
                BodyHtml = "<h2>Bonjour {{contactName}},</h2><p>Merci de créer un compte pour la demande d'inscription au groupe scout GNDJ.</p><p>Veuillez confirmer votre adresse email en cliquant sur le lien ci-dessous :</p><p><a href=\"{{verifyLink}}\" style=\"background-color:#1e3a5f;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;\">Vérifier mon adresse email</a></p><p>Ce lien expire dans {{expiryDays}} jour(s). Vous devez vérifier votre email avant de pouvoir soumettre une demande.</p><p>— L'équipe GNDJ</p>",
                Variables = "[{\"key\":\"contactName\",\"label\":\"Nom du contact\"},{\"key\":\"verifyLink\",\"label\":\"Lien de vérification\"},{\"key\":\"expiryDays\",\"label\":\"Validité (jours)\"}]",
                IsActive = true
            },
            new EmailTemplate
            {
                Name = "Demande acceptée", Code = "demande_approved", Module = "demande",
                Subject = "Votre demande d'inscription a été acceptée — GNDJ Scout",
                BodyHtml = "<h2>Bonjour {{contactName}},</h2><p>Nous avons le plaisir de vous informer que la demande d'inscription de <strong>{{childName}}</strong> a été acceptée.</p><p><strong>Unité :</strong> {{unitName}}</p><p>Un compte a été créé pour le nouveau membre :</p><ul><li><strong>Identifiant :</strong> {{username}}</li><li><strong>Mot de passe temporaire :</strong> {{tempPassword}}</li></ul><p>Connectez-vous sur <a href=\"{{loginUrl}}\">{{loginUrl}}</a> et changez le mot de passe à la première connexion.</p><p>Bienvenue dans le mouvement !</p><p>— L'équipe GNDJ</p>",
                Variables = "[{\"key\":\"contactName\",\"label\":\"Nom du contact\"},{\"key\":\"childName\",\"label\":\"Nom de l'enfant\"},{\"key\":\"unitName\",\"label\":\"Unité\"},{\"key\":\"username\",\"label\":\"Identifiant\"},{\"key\":\"tempPassword\",\"label\":\"Mot de passe temporaire\"},{\"key\":\"loginUrl\",\"label\":\"Lien de connexion\"}]",
                IsActive = true
            },
            new EmailTemplate
            {
                Name = "Demande refusée", Code = "demande_declined", Module = "demande",
                Subject = "Réponse à votre demande d'inscription — GNDJ Scout",
                BodyHtml = "<h2>Bonjour {{contactName}},</h2><p>Concernant la demande d'inscription de <strong>{{childName}}</strong>, nous sommes au regret de ne pas pouvoir y donner une suite favorable cette année.</p><p>{{reason}}</p><p>Nous vous remercions de votre intérêt et restons à votre disposition.</p><p>— L'équipe GNDJ</p>",
                Variables = "[{\"key\":\"contactName\",\"label\":\"Nom du contact\"},{\"key\":\"childName\",\"label\":\"Nom de l'enfant\"},{\"key\":\"reason\",\"label\":\"Motif (optionnel)\"}]",
                IsActive = true
            },
        };

        var existingCodes = await context.EmailTemplates.IgnoreQueryFilters().Select(t => t.Code).ToListAsync();
        var missing = templates.Where(t => !existingCodes.Contains(t.Code)).ToList();
        if (missing.Count > 0)
        {
            context.EmailTemplates.AddRange(missing);
            await context.SaveChangesAsync();
        }
    }

    // Public contact-form notification template (idempotent per-code).
    public static async Task SeedContactEmailTemplateAsync(GndjDbContext context)
    {
        if (await context.EmailTemplates.IgnoreQueryFilters().AnyAsync(t => t.Code == "contact_form"))
            return;

        context.EmailTemplates.Add(new EmailTemplate
        {
            Name = "Message de contact (site public)", Code = "contact_form", Module = "general",
            Subject = "Nouveau message de contact — {{subject}}",
            BodyHtml = "<h2>Nouveau message du formulaire de contact</h2><p><strong>De :</strong> {{senderName}} ({{senderEmail}})</p><p><strong>Sujet :</strong> {{subject}}</p><hr /><p>{{message}}</p>",
            Variables = "[{\"key\":\"senderName\",\"label\":\"Nom de l'expéditeur\"},{\"key\":\"senderEmail\",\"label\":\"Email de l'expéditeur\"},{\"key\":\"subject\",\"label\":\"Sujet\"},{\"key\":\"message\",\"label\":\"Message\"}]",
            IsActive = true
        });
        await context.SaveChangesAsync();
    }

    // ─── Authoritative scout structure (unit types + fonctions) ──────────────────────────────────
    // Single source of truth for the standard GNDJ branches and their functional roles, derived from the
    // corrected live dev DB (2026-07-01). Ranks: higher = more senior (top of the ladder); one role per
    // unit type is the default for new members (★); IsMaitrise marks leadership. Feu is intentionally left
    // "tied" (all maîtrise = 100, youth = 10) per the group's request. Used by SeedScoutStructureAsync
    // (fresh-DB bootstrap) and SeedFunctionalRoleRanksAsync (post-import rank back-fill).
    public sealed record SeededRole(string Code, string Name, int Rank, bool IsMaitrise, bool IsDefault, string Profile);
    public sealed record SeededUnitType(string Code, string Name, int Years, int? AgeMin, int? AgeMax, string? Color, SeededRole[] Roles);

    private const string PfLeader = "chef-unite", PfYouth = "read-only", PfCG = "chef-de-groupe", PfAssistG = "assistant-de-groupe";

    public static readonly SeededUnitType[] ScoutStructure =
    [
        new("MEU", "Meute", 3, null, null, "#edcf35",
        [
            new("CM",   "Cheftaine de Meute",            5, true,  false, PfLeader),
            new("ACM",  "Assistante Cheftaine de Meute", 4, true,  false, PfLeader),
            new("MSZ",  "Sizenier",                      3, false, false, PfYouth),
            new("M2SZ", "Second de Sizaine",             2, false, false, PfYouth),
            new("M3SZ", "Troisième de Sizaine",          1, false, false, PfYouth),
            new("L",    "Louveteau",                     0, false, true,  PfYouth),
        ]),
        new("RON", "Ronde", 3, null, null, null,
        [
            new("CR",   "Cheftaine de Ronde",   5, true,  false, PfLeader),
            new("ACR",  "Assistante de Ronde",  4, true,  false, PfLeader),
            new("RSZ",  "Sizenière",            3, false, false, PfYouth),
            new("R2SZ", "Seconde de Sizaine",   2, false, false, PfYouth),
            new("R3SZ", "Troisième de Sizaine", 1, false, false, PfYouth),
            new("J",    "Jeannette",            0, false, true,  PfYouth),
        ]),
        new("TRO", "Troupe", 5, null, null, null,
        [
            new("CT",  "Chef de Troupe",           4, true,  false, PfLeader),
            new("ACT", "Assistant Chef de Troupe", 3, true,  false, PfLeader),
            new("CP",  "Chef de Patrouille",       2, false, false, PfYouth),
            new("SP",  "Second de Patrouille",     1, false, false, PfYouth),
            new("E",   "Eclaireur",                0, false, true,  PfYouth),
        ]),
        new("COM", "Compagnie", 4, null, null, null,
        [
            new("CCO", "Cheftaine de Compagnie",  5, true,  false, PfLeader),
            new("ACO", "Assistante de Compagnie", 4, true,  false, PfLeader),
            new("CCE", "Cheftaine d'Equipe",      3, false, false, PfYouth),
            new("CSE", "Seconde d'Equipe",        2, false, false, PfYouth),
            new("CTE", "Troisième d'Equipe",      1, false, false, PfYouth),
            new("G",   "Guide",                   0, false, true,  PfYouth),
        ]),
        new("NOY", "Noyau", 1, null, null, null,
        [
            new("CN",  "Cheftaine de Noyau",  2, true,  false, PfLeader),
            new("ACN", "Assistante de Noyau", 1, true,  false, PfLeader),
            new("CAR", "Caravelle",           0, false, true,  PfYouth),
        ]),
        new("JEM", "Jeunes en Marche", 3, null, null, null,
        [
            new("AJ",  "Animatrice JEM",                 2, true,  false, PfLeader),
            new("CAJ", "Co-Animatrice Jeunes En Marche", 1, true,  false, PfLeader),
            new("JEM", "Jeune En Marche",                0, false, true,  PfYouth),
        ]),
        new("CLAN", "Clan", 3, 17, 21, null,
        [
            new("CC",  "Chef de Clan",           4, true,  false, PfLeader),
            new("ACC", "Assistant chef de clan", 3, true,  false, PfLeader),
            new("CE",  "Chef d'Equipe",          2, false, false, PfYouth),
            new("SE",  "Second d'Equipe",        1, false, false, PfYouth),
            new("R",   "Routier",                0, false, true,  PfYouth),
        ]),
        // Feu — left "as is" (tied ranks): all maîtrise = 100, youth = 10.
        new("FEU", "Feu", 3, null, null, null,
        [
            new("CF",   "Cheftaine du Feu",               100, true,  false, PfLeader),
            new("ACF",  "Assistante Cheftaine du Feu",    100, true,  false, PfLeader),
            new("CJ",   "Animatrice Jeunes En Marche",    100, true,  false, PfLeader),
            new("ACJ",  "Co-Animatrice Jeunes En Marche", 100, true,  false, PfLeader),
            new("FCAR", "Caravelle",                       10, false, true,  PfYouth),
        ]),
        // Caravelles — no per-role fonctions defined (units use the branch without functional roles).
        new("CAR", "Caravelles", 4, null, null, "#5d9bfd", []),
        // Groupe — only the head CG + a unified assistant (ACHG). No youth → no default role.
        new("GRP", "Groupe", 1, null, null, null,
        [
            new("CG",   "Chef(taine) de Groupe",           2, true, false, PfCG),
            new("ACHG", "Assistant Chef(taine) de Groupe", 1, true, false, PfAssistG),
        ]),
    ];

    // Fresh-DB bootstrap of the standard branches + fonctions (see ScoutStructure). Guarded so it never
    // touches a migrated/already-populated DB (whose unit types come from the migration tool, possibly
    // under variant codes like CLA) — those get their ranks from SeedFunctionalRoleRanksAsync instead.
    // Requires the security profiles to already exist (SeedAsync + the group-profile seeders run first).
    public static async Task SeedScoutStructureAsync(GndjDbContext context)
    {
        if (await context.UnitTypes.IgnoreQueryFilters().AnyAsync()) return;

        var profileIds = await context.SecurityProfiles
            .Where(p => !p.IsDeleted)
            .ToDictionaryAsync(p => p.Code, p => p.Id);

        foreach (var ut in ScoutStructure)
        {
            var unitType = new UnitType
            {
                Name = ut.Name, Code = ut.Code, NumberOfYears = ut.Years,
                AgeMin = ut.AgeMin, AgeMax = ut.AgeMax, Color = ut.Color
            };
            context.UnitTypes.Add(unitType);
            foreach (var role in ut.Roles)
            {
                if (!profileIds.TryGetValue(role.Profile, out var profileId)) continue; // profile must exist
                context.FunctionalRoles.Add(new FunctionalRole
                {
                    Name = role.Name, Code = role.Code, UnitTypeId = unitType.Id,
                    Rank = role.Rank, IsMaitrise = role.IsMaitrise,
                    IsDefaultForNewMembers = role.IsDefault, SecurityProfileId = profileId
                });
            }
        }
        await context.SaveChangesAsync();
    }

    // Back-fills functional-role ranks/defaults/maîtrise after a migration import (the tool creates roles at
    // rank 0). Runs only while every role is still rank 0 (unconfigured); once a CG sets any rank, it never
    // overrides. Known codes get their authoritative values from ScoutStructure; anything else falls back to
    // a keyword heuristic (adult leaders high, youth sub-leaders mid, base youth low).
    public static async Task SeedFunctionalRoleRanksAsync(GndjDbContext context)
    {
        if (await context.FunctionalRoles.AnyAsync(r => r.Rank != 0)) return;

        // Authoritative per-code lookup (codes are unique across the structure).
        var byCode = ScoutStructure.SelectMany(ut => ut.Roles)
            .GroupBy(r => r.Code)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        static string Norm(string s) => s.ToLowerInvariant()
            .Replace('é', 'e').Replace('è', 'e').Replace('ê', 'e').Replace('ë', 'e')
            .Replace('à', 'a').Replace('â', 'a').Replace('î', 'i').Replace('ï', 'i')
            .Replace('ô', 'o').Replace('û', 'u').Replace('ù', 'u').Replace('ç', 'c');

        // Adult leaders / group staff (high rank, never auto-assigned to a new member).
        var leaderKeywords = new[] { "chef", "cheftaine", "responsable", "maitrise", "maitre", "assistant", "akela",
            "commissaire", "aumonier", "animat", "intendant", "secretaire", "tresorier", "cadre" };
        // Youth sub-leaders within an équipe/sizaine (mid rank).
        var subLeaderKeywords = new[] { "sizenier", "sizeniere", "second", "troisi", "chef d'equipe", "meneur" };

        // Only per-unit-type roles are ranked; the global admin roles keep rank 0.
        var roles = await context.FunctionalRoles.Where(r => r.UnitTypeId != null).ToListAsync();
        foreach (var r in roles)
        {
            if (!string.IsNullOrWhiteSpace(r.Code) && byCode.TryGetValue(r.Code, out var s))
            {
                r.Rank = s.Rank;
                r.IsMaitrise = s.IsMaitrise;
                r.IsDefaultForNewMembers = s.IsDefault;
                continue;
            }
            var n = Norm(r.Name);
            if (leaderKeywords.Any(k => n.Contains(k))) r.Rank = 100;
            else if (subLeaderKeywords.Any(k => n.Contains(k))) r.Rank = 50;
            else r.Rank = 10; // base youth member
        }
        await context.SaveChangesAsync();
    }

    private static SecurityProfile CreateProfile(string name, string code, string description, string[] permissions)
    {
        var profile = new SecurityProfile
        {
            Name = name,
            Code = code,
            Description = description,
            IsSystem = true
        };

        foreach (var perm in permissions)
        {
            profile.Permissions.Add(new SecurityProfilePermission
            {
                SecurityProfileId = profile.Id,
                Permission = perm
            });
        }

        return profile;
    }
}
