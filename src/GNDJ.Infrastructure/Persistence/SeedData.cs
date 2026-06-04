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
        var animateurProfile = CreateProfile("Animateur", "animateur", "Membre actif avec accès en lecture",
        [
            Permissions.MembersView,
            Permissions.UnitsView,
            Permissions.TeamsView,
            Permissions.AssignmentsView
        ]);
        var readOnlyProfile = CreateProfile("Lecture seule", "read-only", "Accès en lecture uniquement",
            Permissions.All.Where(p => p.EndsWith(".view")).ToArray());

        context.SecurityProfiles.AddRange(superAdminProfile, assocAdminProfile, chefUniteProfile, chefEquipeProfile, animateurProfile, readOnlyProfile);

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
        var roleAnimateur = new FunctionalRole
        {
            Name = "Animateur", Code = "animateur",
            Description = "Membre actif",
            SecurityProfileId = animateurProfile.Id, UnitTypeId = null
        };

        context.FunctionalRoles.AddRange(roleSuperAdmin, roleAssocAdmin, roleChefUnite, roleChefEquipe, roleAnimateur);

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
            new() { Key = "cotisation.current_school_year", Value = "2025-2026", Category = "cotisations", Label = "Année scoute en cours", Description = "Année scoute utilisée par défaut pour les nouvelles cotisations", ValueType = "string" },
            new() { Key = "member.schools", Value = "[\"Collège Notre-Dame de Jamhour\",\"Collège Saint-Joseph Antoura\"]", Category = "members", Label = "Écoles", Description = "Liste des écoles disponibles dans le formulaire membre", ValueType = "json_array" },
            new() { Key = "member.default_school", Value = "Collège Notre-Dame de Jamhour", Category = "members", Label = "École par défaut", Description = "École sélectionnée par défaut lors de la création d'un membre", ValueType = "string" },
            new() { Key = "member.classes", Value = "[\"EB1\",\"EB2\",\"EB3\",\"EB4\",\"EB5\",\"EB6\",\"EB7\",\"EB8\",\"EB9\",\"Seconde\",\"Première\",\"Terminale\"]", Category = "members", Label = "Classes", Description = "Liste des classes disponibles dans le formulaire membre", ValueType = "json_array" },
            new() { Key = "passage.enabled", Value = "false", Category = "passage", Label = "Passage annuel actif", Description = "Active ou désactive le processus de passage annuel", ValueType = "boolean" },
            new() { Key = "passage.school_year", Value = "2026-2027", Category = "passage", Label = "Année scoute du passage", Description = "Année scoute cible pour le passage en cours", ValueType = "string" },
            new() { Key = "card.config", Value = "{\"orgName\":\"GNDJ Scout\",\"fields\":{\"photo\":true,\"name\":true,\"cardNumber\":true,\"unit\":true,\"team\":true,\"role\":true,\"dateOfBirth\":true,\"bloodType\":true,\"emergencyContact\":true,\"customFields\":true}}", Category = "reports", Label = "Configuration de la carte membre", Description = "Champs affichés sur la carte membre", ValueType = "json" },
        };

        var missing = allSettings.Where(s => !existingKeys.Contains(s.Key)).ToList();
        if (missing.Count > 0)
        {
            context.Settings.AddRange(missing);
            await context.SaveChangesAsync();
        }
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
