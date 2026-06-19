using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Infrastructure.Persistence;

public static class SeedData
{
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
            Permissions.PassageView, Permissions.PassagePropose
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

        context.SecurityProfiles.AddRange(superAdminProfile, assocAdminProfile, chefUniteProfile, chefEquipeProfile, readOnlyProfile);

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
                Permissions.PassageView, Permissions.PassagePropose
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
            new() { Key = "member.classes", Value = "[\"EB1\",\"EB2\",\"EB3\",\"EB4\",\"EB5\",\"EB6\",\"EB7\",\"EB8\",\"EB9\",\"Seconde\",\"Première\",\"Terminale\"]", Category = "members", Label = "Classes", Description = "Liste des classes disponibles dans le formulaire membre", ValueType = "json_array" },
            new() { Key = "passage.enabled", Value = "false", Category = "passage", Label = "Passage annuel actif", Description = "Active ou désactive le processus de passage annuel", ValueType = "boolean" },
            new() { Key = "passage.scout_year", Value = "2026-2027", Category = "passage", Label = "Année scoute du passage", Description = "Année scoute cible pour le passage en cours", ValueType = "string" },
            new() { Key = "card.config", Value = "{\"orgName\":\"GNDJ Scout\",\"fields\":{\"photo\":true,\"name\":true,\"cardNumber\":true,\"unit\":true,\"team\":true,\"role\":true,\"dateOfBirth\":true,\"bloodType\":true,\"emergencyContact\":true,\"customFields\":true}}", Category = "reports", Label = "Configuration de la carte membre", Description = "Champs affichés sur la carte membre", ValueType = "json" },
            new() { Key = "app.base_url", Value = "http://localhost:5173", Category = "general", Label = "URL de l'application", Description = "URL de base utilisée pour les liens dans les emails (ex: https://app.gndj.org)", ValueType = "string" },
            new() { Key = "demande.enabled", Value = "false", Category = "demande", Label = "Inscriptions ouvertes", Description = "Ouvre ou ferme le portail public de demande d'inscription", ValueType = "boolean" },
            new() { Key = "demande.scout_year", Value = "2026-2027", Category = "demande", Label = "Année scoute des inscriptions", Description = "Année scoute cible pour les nouvelles inscriptions", ValueType = "string" },
            new() { Key = "demande.max_per_account", Value = "3", Category = "demande", Label = "Nombre max de demandes par compte", Description = "Nombre maximum d'enfants qu'un compte peut inscrire", ValueType = "number" },
            new() { Key = "demande.max_scout_relations", Value = "3", Category = "demande", Label = "Nombre max de proches scouts", Description = "Nombre maximum de proches déjà scouts qu'un compte peut déclarer", ValueType = "number" },
            new() { Key = "demande.notes_max_length", Value = "500", Category = "demande", Label = "Longueur max des notes parents", Description = "Nombre maximum de caractères pour les notes des parents", ValueType = "number" },
            new() { Key = "demande.require_email_verification", Value = "true", Category = "demande", Label = "Vérification email requise", Description = "Exige la vérification de l'email avant de soumettre une demande", ValueType = "boolean" },
            new() { Key = "demande.decide_siblings_together", Value = "true", Category = "demande", Label = "Décider les fratries ensemble", Description = "Affiche le statut des frères/sœurs lors de la revue", ValueType = "boolean" },
            new() { Key = "demande.intro_text", Value = "Bienvenue ! Créez un compte pour présenter une demande d'inscription au mouvement scout. Vous pourrez inscrire un ou plusieurs enfants.", Category = "demande", Label = "Texte d'accueil du portail", Description = "Message affiché sur la page d'accueil du portail d'inscription", ValueType = "string" },
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

    // One-time bootstrap of functional-role ranks (lowest rank = base youth role used on demande approval).
    // Runs only while every role is still rank 0 (unconfigured); once a CG sets any rank, it never overrides.
    public static async Task SeedFunctionalRoleRanksAsync(GndjDbContext context)
    {
        if (await context.FunctionalRoles.AnyAsync(r => r.Rank != 0)) return;

        static string Norm(string s) => s.ToLowerInvariant()
            .Replace('é', 'e').Replace('è', 'e').Replace('ê', 'e').Replace('ë', 'e')
            .Replace('à', 'a').Replace('â', 'a').Replace('î', 'i').Replace('ï', 'i')
            .Replace('ô', 'o').Replace('û', 'u').Replace('ù', 'u').Replace('ç', 'c');

        // Adult leaders / group staff (high rank, never auto-assigned to a new member).
        var leaderKeywords = new[] { "chef", "cheftaine", "responsable", "maitrise", "maitre", "assistant", "akela",
            "commissaire", "aumonier", "animat", "intendant", "secretaire", "tresorier", "cadre" };
        // Youth sub-leaders within an équipe/sizaine (mid rank).
        var subLeaderKeywords = new[] { "sizenier", "sizeniere", "second", "troisi", "chef d'equipe", "meneur" };

        var roles = await context.FunctionalRoles.ToListAsync();
        foreach (var r in roles)
        {
            var n = Norm(r.Name);
            if (leaderKeywords.Any(k => n.Contains(k))) r.Rank = 100;
            else if (subLeaderKeywords.Any(k => n.Contains(k))) r.Rank = 50;
            else r.Rank = 10; // base youth member (lowest = chosen on demande approval)
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
