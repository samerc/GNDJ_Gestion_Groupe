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

    // ".view" permissions that must NOT be granted to the read-only (youth/member) profile even though they
    // end in ".view": they gate leader/CG-only AGGREGATE views over the whole group. The read-only profile is
    // "all .view" for convenience, but these expose data a member must never see — audit trail (audit.view),
    // the entire enrollment queue incl. children's medical/PII (demande.view), the authorization model +
    // who holds each profile (roles.view), and the group passage plan (passage.view). A youth's own data is
    // served by /my-profile & /auth/me (no .view perm needed), so removing these breaks nothing for them.
    public static readonly string[] ReadOnlyExcludedViews =
    [
        Permissions.AuditView, Permissions.DemandeView, Permissions.RolesView, Permissions.PassageView,
    ];

    // The permission set for the read-only profile: every ".view" EXCEPT the sensitive aggregate ones above.
    public static string[] ReadOnlyPermissions() =>
        Permissions.All.Where(p => p.EndsWith(".view") && !ReadOnlyExcludedViews.Contains(p)).ToArray();

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
            // NOTE: no MembersCreate — only a Chef de Groupe / super-admin creates new members; a CU manages
            // existing ones (edit, reset password, etc.).
            Permissions.MembersView, Permissions.MembersEdit, Permissions.MembersDelete, Permissions.MembersResetPassword,
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
            ReadOnlyPermissions());
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
                Permissions.MembersResetPassword,
                Permissions.DocumentsView, Permissions.DocumentsCreate, Permissions.DocumentsEdit, Permissions.DocumentsDelete, Permissions.DocumentsApprove,
                Permissions.CotisationsView, Permissions.CotisationsCreate, Permissions.CotisationsEdit, Permissions.CotisationsDelete,
                Permissions.DocumentTypesView,
                Permissions.ProgressionView, Permissions.ProgressionManage,
                Permissions.PassageView, Permissions.PassagePropose,
                Permissions.CampGrade
            ],
            ["chef-equipe"] = [Permissions.DocumentsView, Permissions.CotisationsView, Permissions.ProgressionView, Permissions.PassageView],
            ["read-only"] = ReadOnlyPermissions(),
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

        // Permissions to REVOKE from a profile if present (grants that were later restricted). Chef d'unité
        // can no longer CREATE members — only a Chef de Groupe / super-admin does; a CU manages existing ones.
        // Idempotent: no-op once the row is gone. Only patches these named profiles (custom profiles untouched).
        var profileRevocations = new Dictionary<string, string[]>
        {
            ["chef-unite"] = [Permissions.MembersCreate],
            // The read-only (youth/member) profile previously got ALL ".view" perms, which included the
            // sensitive aggregate ones (audit/demande/roles/passage) — a member could read the audit trail,
            // the whole enrollment queue (children's medical/PII), the authz model, and the passage plan.
            // Revoke them from existing DBs so the [HasPermission] attributes now deny a youth automatically.
            ["read-only"] = ReadOnlyExcludedViews,
        };
        foreach (var (code, revoke) in profileRevocations)
        {
            var profile = await context.SecurityProfiles
                .Include(p => p.Permissions)
                .FirstOrDefaultAsync(p => p.Code == code);
            if (profile is null) continue;

            var toRemove = profile.Permissions.Where(p => revoke.Contains(p.Permission)).ToList();
            context.SecurityProfilePermissions.RemoveRange(toRemove);
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

    // Assistant baseline = a Chef de Groupe can do everything an ACG can; the ACG differs on exactly the two
    // capabilities the CG APPOINTS per assistant — Demandes (demande.*) and Camp BP (camp.*) — plus
    // roles.manage_group (the "Accès maîtrise" appointment tool itself), which stays CG-only so only the CG
    // appoints. Everything else, incl. maitrise.manage, is shared. The CG then grants Demandes/Camp to a
    // specific ACG via Accès maîtrise (which forks that function's profile — others untouched).
    public static readonly string[] AssistantDeGroupePermissions = ChefDeGroupePermissions
        .Where(p => p != Permissions.DemandeView && p != Permissions.DemandeManage
                 && p != Permissions.CampGrade && p != Permissions.CampManage
                 && p != Permissions.RolesManageGroup).ToArray();

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
                "Comme le Chef de Groupe, sauf Demandes et Camp BP (accordés par le CG)", AssistantDeGroupePermissions);
            assistant.IsGroupLevel = true;
            context.SecurityProfiles.Add(assistant);
            await context.SaveChangesAsync();
        }
        else
        {
            if (!assistant.IsGroupLevel) assistant.IsGroupLevel = true;
            // Bring the BASE assistant profile in line with the baseline WITHOUT nuking unrelated admin edits:
            //  • ADD any missing baseline perm (e.g. maitrise.manage/rentree.manage added after it was seeded);
            //  • REVOKE only the CG-only capabilities that must never sit on the base ACG (Demandes, Camp BP and
            //    the appointment tool) — those are delegated per-function via Accès maîtrise, not held here.
            // Any OTHER permission an admin added to this profile via the editor is left intact. Per-function
            // FORKED profiles (different codes, created when the CG appoints someone) are never touched here.
            var baseline = AssistantDeGroupePermissions.ToHashSet();
            var current = assistant.Permissions.Select(p => p.Permission).ToHashSet();
            foreach (var p in baseline.Where(p => !current.Contains(p)))
                context.SecurityProfilePermissions.Add(new SecurityProfilePermission { SecurityProfileId = assistant.Id, Permission = p });
            // CG-only-relative-to-ACG = what a CG has that the ACG baseline deliberately drops (demande.*, camp.*, roles.manage_group).
            var cgOnlyForAcg = ChefDeGroupePermissions.Except(AssistantDeGroupePermissions).ToHashSet();
            var revoke = assistant.Permissions.Where(p => cgOnlyForAcg.Contains(p.Permission)).ToList();
            context.SecurityProfilePermissions.RemoveRange(revoke);
            await context.SaveChangesAsync();
        }

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

        // Strip the CG-only APPOINTMENT tool (roles.manage_group) from every group-level profile except
        // chef-de-groupe (incl. forked ones) — only the CG appoints. maitrise.manage is NOT stripped anymore:
        // it's now shared with assistants. (demande.*/camp.* are left alone here — they're legitimately
        // present on a forked profile the CG appointed; they're kept off the base profile by the sync above.)
        var cgOnly = new[] { Permissions.RolesManageGroup };
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
        // actionKey attaches a built-in action from the catalog (RentreeActions): "open-*" run from the list,
        // "goto-*" are page shortcuts, null = no action (a physical/manual task, just a checkbox).
        RentreeTaskTemplate Add(string title, string phase, string role, bool fanOut, string? deadline, string? actionKey, params RentreeTaskTemplate[] deps)
        {
            var t = new RentreeTaskTemplate
            {
                Title = title, Phase = phase, DisplayOrder = order++, AssigneeType = "role", AssigneeRole = role,
                FanOutPerUnit = fanOut, DefaultDeadlineLabel = deadline, ActionKey = actionKey,
                DependsOnTemplateIds = deps.Select(d => d.Id).ToArray()
            };
            tasks.Add(t);
            return t;
        }

        // ① Configuration
        var cfgYear = Add("Définir la nouvelle année scoute et les dates", "Configuration", CG, false, "4ᵉ sem. septembre", "goto-settings");
        var cfgUnits = Add("Vérifier les unités, types et équipes (créer les nouvelles sizaines)", "Configuration", CG, false, "4ᵉ sem. septembre", "goto-units");
        var cfgMaitrises = Add("Confirmer les maîtrises (CU/ACU de chaque unité)", "Configuration", CG, false, "4ᵉ sem. septembre", "goto-maitrises");
        Add("Envoyer l'email d'accueil aux chefs", "Configuration", CG, false, "4ᵉ sem. septembre", "goto-communications", cfgMaitrises);
        var cfgQuotas = Add("Définir les quotas d'accueil par unité", "Configuration", CG, false, "4ᵉ sem. septembre", "goto-demandes", cfgUnits);
        // ② Passage
        var pasOpen = Add("Ouvrir le passage", "Passage", CG, false, "1ʳᵉ sem. octobre", "open-passage", cfgYear);
        var pasPropose = Add("Proposer les passages de chaque membre (ou « Pas de changement »)", "Passage", CU, true, "1ʳᵉ sem. octobre", "goto-passage", pasOpen);
        var pasReview = Add("Réviser et approuver les propositions de passage", "Passage", CG, false, "2ᵉ sem. octobre", "goto-passage-review", pasPropose);
        var pasFinalize = Add("Finaliser les passages (création des nouvelles affectations)", "Passage", CG, false, "2ᵉ sem. octobre", "goto-passage-review", pasReview);
        // ③ Demandes
        var demTerms = Add("Mettre à jour les conditions d'inscription (texte d'acceptation des demandes)", "Demandes", CG, false, "septembre", "goto-settings", cfgYear);
        var demOpen = Add("Ouvrir les inscriptions", "Demandes", CG, false, "septembre", "open-demandes", cfgYear, cfgQuotas, demTerms);
        var demReview = Add("Réviser les demandes d'inscription (accepter/refuser + unité)", "Demandes", CG, false, "octobre", "goto-demandes", demOpen);
        Add("Envoyer les réponses aux demandes (conversion en membres)", "Demandes", CG, false, "octobre", "goto-demandes", demReview);
        // ④ Dossiers membres
        var docVerify = Add("Vérifier et approuver les documents des membres", "Dossiers membres", CU, true, "octobre – novembre", "goto-documents", pasFinalize);
        Add("Suivre et enregistrer les cotisations", "Dossiers membres", CU, true, "octobre – novembre", "goto-documents", pasFinalize);
        // CG follow-up once the CUs have reviewed: email the families whose dossier is still incomplete.
        Add("Relancer les familles avec des documents manquants", "Dossiers membres", CG, false, "novembre", "goto-document-reminders", docVerify);
        var photo = Add("Organiser la séance photo", "Dossiers membres", CU, true, "octobre", "goto-photo", pasFinalize);
        // ⑤ Organisation
        var orgTeams = Add("Répartir les membres en sizaines / équipes", "Organisation", CU, true, "octobre", "goto-my-unit", pasFinalize);
        Add("Vérifier le trombinoscope / la liste", "Organisation", CU, true, "octobre", "goto-my-unit", orgTeams);
        Add("Imprimer les cartes membres", "Organisation", CU, true, "octobre", "goto-my-unit", photo, orgTeams);
        Add("Confirmer les étapes et badges de l'année", "Progression", CG, false, "octobre", "goto-progression");

        context.RentreeTaskTemplates.AddRange(tasks);
        await context.SaveChangesAsync();
    }

    // Backfill ActionKey on the default templates for DBs seeded before the action feature existed.
    // Matches by exact title and only fills templates that have no action yet (idempotent; never overwrites
    // a CG's choice). Wired in Program.cs after SeedRentreeTemplateAsync.
    public static async Task SeedRentreeActionKeysAsync(GndjDbContext context)
    {
        var byTitle = new Dictionary<string, string>
        {
            ["Définir la nouvelle année scoute et les dates"] = "goto-settings",
            ["Vérifier les unités, types et équipes (créer les nouvelles sizaines)"] = "goto-units",
            ["Confirmer les maîtrises (CU/ACU de chaque unité)"] = "goto-maitrises",
            ["Définir les quotas d'accueil par unité"] = "goto-demandes",
            ["Ouvrir le passage"] = "open-passage",
            ["Proposer les passages de chaque membre (ou « Pas de changement »)"] = "goto-passage",
            ["Réviser et approuver les propositions de passage"] = "goto-passage-review",
            ["Finaliser les passages (création des nouvelles affectations)"] = "goto-passage-review",
            ["Mettre à jour les conditions d'inscription (texte d'acceptation des demandes)"] = "goto-settings",
            ["Ouvrir les inscriptions"] = "open-demandes",
            ["Réviser les demandes d'inscription (accepter/refuser + unité)"] = "goto-demandes",
            ["Envoyer les réponses aux demandes (conversion en membres)"] = "goto-demandes",
            ["Vérifier et approuver les documents des membres"] = "goto-documents",
            ["Suivre et enregistrer les cotisations"] = "goto-documents",
            ["Organiser la séance photo"] = "goto-photo",
            ["Répartir les membres en sizaines / équipes"] = "goto-my-unit",
            ["Vérifier le trombinoscope / la liste"] = "goto-my-unit",
            ["Imprimer les cartes membres"] = "goto-my-unit",
            ["Confirmer les étapes et badges de l'année"] = "goto-progression",
        };

        var changed = false;
        var templates = await context.RentreeTaskTemplates.Where(t => t.ActionKey == null).ToListAsync();
        foreach (var t in templates)
            if (byTitle.TryGetValue(t.Title, out var key)) { t.ActionKey = key; changed = true; }

        // Also backfill already-generated task instances (by title) so existing year checklists get their
        // actions without a full regenerate (which would wipe progress). Only fills null (never overwrites).
        var tasks = await context.RentreeTasks.Where(t => t.ActionKey == null).ToListAsync();
        foreach (var t in tasks)
            if (byTitle.TryGetValue(t.Title, out var key)) { t.ActionKey = key; changed = true; }

        if (changed) await context.SaveChangesAsync();
    }

    // Inserts the CG "Relancer les familles avec des documents manquants" template task into DBs whose rentrée
    // template was seeded before this feature existed (SeedRentreeTemplateAsync is skipped once any template
    // exists, so it can't add it). Idempotent: only inserts when a template with that title is absent, and only
    // when a template already exists (a fresh DB gets it from the full seed instead). Wired in Program.cs after
    // SeedRentreeActionKeysAsync. The generated-year checklists pick it up via "Ajouter les nouvelles tâches".
    public static async Task SeedRentreeReminderTaskAsync(GndjDbContext context)
    {
        const string title = "Relancer les familles avec des documents manquants";
        var anyTemplates = await context.RentreeTaskTemplates.AnyAsync();
        if (!anyTemplates) return; // fresh DB → the full template seed already includes this task
        if (await context.RentreeTaskTemplates.AnyAsync(t => t.Title == title)) return; // already present

        // Depend on the CU document-verification task if it's there, so the relance stays blocked until review.
        var docVerifyId = await context.RentreeTaskTemplates
            .Where(t => t.Title == "Vérifier et approuver les documents des membres")
            .Select(t => (Guid?)t.Id).FirstOrDefaultAsync();
        var maxOrder = await context.RentreeTaskTemplates.MaxAsync(t => (int?)t.DisplayOrder) ?? 0;

        context.RentreeTaskTemplates.Add(new RentreeTaskTemplate
        {
            Title = title, Phase = "Dossiers membres", DisplayOrder = maxOrder + 1,
            AssigneeType = "role", AssigneeRole = "chef-de-groupe", FanOutPerUnit = false,
            DefaultDeadlineLabel = "novembre", ActionKey = "goto-document-reminders",
            DependsOnTemplateIds = docVerifyId is Guid dv ? [dv] : []
        });
        await context.SaveChangesAsync();
    }

    // Idempotent per-title backfill for the demande "fine-tuning" rentrée tasks (attachments refresh, refusal
    // letter, submission/activation reminders). Inserts each only if absent; requires the base template to exist
    // (a fresh DB gets the base set from SeedRentreeTemplateAsync first, then these extras). Wired in Program.cs.
    public static async Task SeedRentreeExtraTasksAsync(GndjDbContext context)
    {
        if (!await context.RentreeTaskTemplates.AnyAsync()) return; // fresh DB: base seed runs first, then this

        // title → (phase, deadline label, actionKey)
        var extras = new (string Title, string Phase, string Deadline, string Action)[]
        {
            ("Mettre à jour les pièces jointes des modèles d'email", "Configuration", "4ᵉ sem. septembre", "goto-email"),
            ("Rédiger la lettre de refus (pièce jointe du modèle « demande refusée »)", "Demandes", "septembre", "goto-email"),
            ("Relancer les familles qui n'ont pas soumis leur demande", "Demandes", "octobre", "goto-demandes"),
            ("Relancer les accès non activés", "Dossiers membres", "novembre", "goto-send-access"),
        };

        var existing = await context.RentreeTaskTemplates.Select(t => t.Title).ToListAsync();
        var maxOrder = await context.RentreeTaskTemplates.MaxAsync(t => (int?)t.DisplayOrder) ?? 0;
        var changed = false;
        foreach (var e in extras)
        {
            if (existing.Contains(e.Title)) continue;
            context.RentreeTaskTemplates.Add(new RentreeTaskTemplate
            {
                Title = e.Title, Phase = e.Phase, DisplayOrder = ++maxOrder,
                AssigneeType = "role", AssigneeRole = "chef-de-groupe", FanOutPerUnit = false,
                DefaultDeadlineLabel = e.Deadline, ActionKey = e.Action, DependsOnTemplateIds = []
            });
            changed = true;
        }
        if (changed) await context.SaveChangesAsync();
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
            // NOTE: the cotisation "année scoute en cours" now follows passage.scout_year (single source of
            // truth — the year the CG opens). The old cotisation.current_scout_year setting was retired.
            new() { Key = "cotisation.default_currency", Value = "USD", Category = "cotisations", Label = "Devise par défaut", Description = "Devise par défaut pour les cotisations et le calcul du total", ValueType = "string" },
            new() { Key = "cotisation.exchange_rates", Value = "{\"LBP\":89500,\"EUR\":0.92}", Category = "cotisations", Label = "Taux de change", Description = "Taux de change par rapport à la devise par défaut (ex: 1 USD = 89500 LBP)", ValueType = "json" },
            new() { Key = "member.schools", Value = "[\"Collège Notre-Dame de Jamhour\",\"Collège Saint-Joseph Antoura\"]", Category = "members", Label = "Écoles", Description = "Liste des écoles disponibles dans le formulaire membre", ValueType = "json_array" },
            new() { Key = "member.school_codes", Value = "{\"Collège Notre-Dame de Jamhour\":\"CNDJ\",\"Collège Saint-Joseph Antoura\":\"CSJA\",\"Collège Saint-Grégoire\":\"CSG\"}", Category = "members", Label = "Codes des écoles", Description = "Code court par école (affiché dans les tableaux). Insensible aux accents/majuscules.", ValueType = "json" },
            new() { Key = "member.default_school", Value = "Collège Notre-Dame de Jamhour", Category = "members", Label = "École par défaut", Description = "École sélectionnée par défaut lors de la création d'un membre", ValueType = "string" },
            new() { Key = "member.classes", Value = "[\"8ème\",\"7ème\",\"6ème\",\"5ème\",\"4ème\",\"3ème\",\"2nde\",\"1ère\",\"Term\",\"Université\"]", Category = "members", Label = "Classes", Description = "Liste des classes disponibles dans le formulaire membre", ValueType = "json_array" },
            new() { Key = "member.cities", Value = CuratedCitiesJson, Category = "members", Label = "Villes", Description = "Liste des villes disponibles dans les formulaires d'adresse (gérable par le Chef de Groupe)", ValueType = "json_array" },
            new() { Key = "member.profession_domains", Value = ProfessionDomainsJson, Category = "members", Label = "Domaines de profession", Description = "Catégories d'activité proposées pour la profession des parents (le titre reste en texte libre)", ValueType = "json_array" },
            new() { Key = "member.purge_after_days", Value = "30", Category = "members", Label = "Suppression définitive après (jours)", Description = "Délai après lequel un membre supprimé (corbeille) est définitivement effacé, avec son compte et toutes ses données. Avant ce délai, la suppression est réversible.", ValueType = "number" },
            new() { Key = "member.activation_link_days", Value = "30", Category = "members", Label = "Validité du lien d'activation (jours)", Description = "Nombre de jours pendant lesquels un nouveau membre (ou un membre à qui on envoie ses accès) peut utiliser le lien reçu par email pour définir son mot de passe et activer son compte. Passé ce délai, il faut renvoyer un nouveau lien.", ValueType = "number" },
            new() { Key = "camp.familles_count", Value = "12", Category = "camp", Label = "Nombre de familles (Camp BP)", Description = "Nombre de familles par défaut lors de la création d'un camp BP", ValueType = "number" },
            new() { Key = "passage.enabled", Value = "false", Category = "passage", Label = "Passage annuel actif", Description = "Active ou désactive le processus de passage annuel", ValueType = "boolean" },
            new() { Key = "passage.scout_year", Value = "2026-2027", Category = "passage", Label = "Année scoute en cours", Description = "Année scoute active, ouverte par le CG pour le passage. Sert aussi de référence aux cotisations, tableaux de bord, trombinoscope, listes et exports.", ValueType = "string" },
            new() { Key = "passage.date", Value = "", Category = "passage", Label = "Date du passage", Description = "Date d'effet du passage : date de début des nouvelles affectations des anciens membres (et de fin des anciennes). À définir chaque année ; vide = date du jour.", ValueType = "date" },
            new() { Key = "card.config", Value = "{\"orgName\":\"GNDJ Scout\",\"fields\":{\"photo\":true,\"name\":true,\"cardNumber\":true,\"unit\":true,\"team\":true,\"role\":true,\"dateOfBirth\":true,\"bloodType\":true,\"emergencyContact\":true,\"customFields\":true}}", Category = "reports", Label = "Configuration de la carte membre", Description = "Champs affichés sur la carte membre", ValueType = "json" },
            new() { Key = "app.base_url", Value = "http://localhost:5173", Category = "general", Label = "URL de l'application", Description = "URL de base utilisée pour les liens dans les emails (ex: https://app.gndj.org)", ValueType = "string" },
            new() { Key = "demande.enabled", Value = "false", Category = "demande", Label = "Inscriptions ouvertes", Description = "Ouvre ou ferme le portail public de demande d'inscription", ValueType = "boolean" },
            new() { Key = "demande.submissions_open", Value = "true", Category = "demande", Label = "Soumissions ouvertes", Description = "Période (à l'intérieur des inscriptions) où les parents peuvent créer/modifier/soumettre leurs demandes. Une fois fermée, le portail reste ouvert en consultation mais plus aucune modification n'est possible (phase de revue par la Maîtrise de Groupe).", ValueType = "boolean" },
            new() { Key = "demande.scout_year", Value = "2026-2027", Category = "demande", Label = "Année scoute des inscriptions", Description = "Année scoute cible pour les nouvelles inscriptions", ValueType = "string" },
            // Submission window dates: the portal OPENS on the start date and submissions CLOSE after the deadline,
            // automatically (computed from the date each time the config is read — no scheduled job). Both empty =
            // no date gate (the manual "Inscriptions ouvertes" / "Soumissions ouvertes" switches govern alone).
            new() { Key = "demande.submission_start", Value = "", Category = "demande", Label = "Date d'ouverture des inscriptions", Description = "Le portail d'inscription s'ouvre automatiquement à cette date. Laisser vide pour ouvrir manuellement via « Inscriptions ouvertes ».", ValueType = "date" },
            new() { Key = "demande.submission_deadline", Value = "", Category = "demande", Label = "Date limite de soumission", Description = "Après cette date, les parents ne peuvent plus créer/modifier/soumettre (le portail reste consultable). Les demandes non soumises (brouillons) sont considérées comme expirées. Laisser vide pour fermer manuellement via « Soumissions ouvertes ».", ValueType = "date" },
            // Editable copy shown on the applicant's RESULT page (after the CG sends the response). The functional
            // parts (identifiant, boutons, unité, motif) stay in place; these settings are the surrounding wording.
            new() { Key = "demande.result_text_accepted", Value = "Un compte a été créé pour le nouveau membre. Voici les étapes pour accéder à l'espace membre et téléverser les documents. Ces mêmes informations vous ont été envoyées par email.", Category = "demande", Label = "Message — demande acceptée", Description = "Texte affiché au parent sur la page de résultat quand la demande est acceptée (au-dessus des étapes de connexion).", ValueType = "string" },
            new() { Key = "demande.result_text_declined", Value = "Nous sommes au regret de ne pas pouvoir donner une suite favorable à votre demande d'inscription cette année. Nous vous remercions de votre intérêt et restons à votre disposition.", Category = "demande", Label = "Message — demande refusée", Description = "Texte affiché au parent sur la page de résultat quand la demande est refusée (le motif éventuel de la Maîtrise s'affiche en plus).", ValueType = "string" },
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
            new() { Key = "email.override_recipient", Value = "", Category = "email", Label = "Redirection de tous les emails (test)", Description = "Si renseigné, TOUS les emails sortants sont envoyés à cette adresse au lieu du vrai destinataire (l'adresse prévue est indiquée dans l'objet). À utiliser pendant les tests ; laisser vide en production pour envoyer aux vrais destinataires.", ValueType = "string" },
            new() { Key = "error.notify_email", Value = "", Category = "email", Label = "Email d'alerte des erreurs", Description = "Adresse qui reçoit une alerte quand une erreur inattendue survient dans l'application (côté serveur ou navigateur), avec une référence pour la retrouver. Si vide, l'alerte va au super administrateur. Les alertes sont regroupées (une par type d'erreur toutes les 30 min) pour éviter le flot.", ValueType = "string" },
            // Maintenance / kill-switches — turn off the whole site or a single module. A user hitting a module
            // in maintenance sees a "Sous maintenance" page (API returns 503). Super-admin is ALWAYS exempt (so
            // they can toggle it back off). Separate from demande.enabled (that's "inscriptions open", a business
            // state; this is "the module is down for maintenance").
            new() { Key = "maintenance.site", Value = "false", Category = "maintenance", Label = "Maintenance — tout le site", Description = "Met TOUT le site en maintenance (public, inscriptions et espace membres). Le super administrateur garde l'accès.", ValueType = "boolean" },
            new() { Key = "maintenance.public", Value = "false", Category = "maintenance", Label = "Maintenance — site public", Description = "Met le site public (pages, actualités, unités…) en maintenance.", ValueType = "boolean" },
            new() { Key = "maintenance.demande", Value = "false", Category = "maintenance", Label = "Maintenance — demandes d'inscription", Description = "Met le portail public de demande d'inscription en maintenance.", ValueType = "boolean" },
            new() { Key = "maintenance.membres", Value = "false", Category = "maintenance", Label = "Maintenance — espace membres", Description = "Met l'espace membres et chefs (application connectée) en maintenance. Le super administrateur garde l'accès pour intervenir.", ValueType = "boolean" },
            new() { Key = "maintenance.message", Value = "Cette partie du site est momentanément en maintenance. Merci de réessayer dans quelques instants.", Category = "maintenance", Label = "Message de maintenance", Description = "Message affiché aux utilisateurs pendant la maintenance.", ValueType = "string" },
            // Password-complexity policy — enforced server-side (all password-setting paths) AND shown on the
            // set/change-password screens (GET /auth/password-policy). Changing these takes effect within ~30s.
            new() { Key = "security.password_min_length", Value = "8", Category = "security", Label = "Longueur minimale du mot de passe", Description = "Nombre minimum de caractères requis pour un mot de passe (min 4, max 128).", ValueType = "number" },
            new() { Key = "security.password_require_uppercase", Value = "true", Category = "security", Label = "Exiger une majuscule", Description = "Le mot de passe doit contenir au moins une lettre majuscule.", ValueType = "boolean" },
            new() { Key = "security.password_require_lowercase", Value = "true", Category = "security", Label = "Exiger une minuscule", Description = "Le mot de passe doit contenir au moins une lettre minuscule.", ValueType = "boolean" },
            new() { Key = "security.password_require_digit", Value = "true", Category = "security", Label = "Exiger un chiffre", Description = "Le mot de passe doit contenir au moins un chiffre.", ValueType = "boolean" },
            new() { Key = "security.password_require_special", Value = "false", Category = "security", Label = "Exiger un caractère spécial", Description = "Le mot de passe doit contenir au moins un caractère spécial (ni lettre ni chiffre).", ValueType = "boolean" },
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
                Name = "Réinitialisation du mot de passe (inscription)", Code = "demande_password_reset", Module = "demande",
                Subject = "Réinitialisation de votre mot de passe — GNDJ Scout",
                BodyHtml = "<h2>Bonjour {{contactName}},</h2><p>Vous avez demandé la réinitialisation du mot de passe de votre compte d'inscription au groupe scout GNDJ.</p><p>Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe :</p><p><a href=\"{{resetLink}}\" style=\"background-color:#1e3a5f;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;\">Réinitialiser mon mot de passe</a></p><p>Ce lien expire dans {{expiryHours}} heure(s). Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.</p><p>— L'équipe GNDJ</p>",
                Variables = "[{\"key\":\"contactName\",\"label\":\"Nom du contact\"},{\"key\":\"resetLink\",\"label\":\"Lien de réinitialisation\"},{\"key\":\"expiryHours\",\"label\":\"Validité (heures)\"}]",
                IsActive = true
            },
            new EmailTemplate
            {
                Name = "Demande reçue (confirmation)", Code = "demande_submitted", Module = "demande",
                Subject = "Nous avons bien reçu votre demande — GNDJ Scout",
                BodyHtml = "<h2>Bonjour {{contactName}},</h2><p>Nous avons bien reçu la demande d'inscription de <strong>{{childName}}</strong> pour l'année {{scoutYear}}.</p><p>La Maîtrise de Groupe étudiera votre demande et vous communiquera sa réponse. Vous pouvez suivre l'état de votre demande à tout moment depuis votre espace.</p><p>— L'équipe GNDJ</p>",
                Variables = "[{\"key\":\"contactName\",\"label\":\"Nom du contact\"},{\"key\":\"childName\",\"label\":\"Nom de l'enfant\"},{\"key\":\"scoutYear\",\"label\":\"Année scoute\"}]",
                IsActive = true
            },
            new EmailTemplate
            {
                Name = "Demande acceptée", Code = "demande_approved", Module = "demande",
                Subject = "Votre demande d'inscription a été acceptée — GNDJ Scout",
                BodyHtml = "<h2>Bonjour {{contactName}},</h2><p>Nous avons le plaisir de vous informer que la demande d'inscription de <strong>{{childName}}</strong> a été acceptée.</p><p><strong>Unité :</strong> {{unitName}}</p><p>Un compte a été créé pour le nouveau membre. Voici les étapes pour accéder à l'espace membre :</p><ol><li>Cliquez sur le bouton ci-dessous pour <strong>définir votre mot de passe</strong>.</li><li>Connectez-vous à l'espace membre avec votre identifiant : <strong>{{username}}</strong>.</li><li>Téléversez les documents requis depuis « Mes documents ».</li></ol><p><a href=\"{{activationLink}}\" style=\"background-color:#1e3a5f;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;\">Définir mon mot de passe</a></p><p>Ce lien est valable {{expiryDays}} jours. Vous pourrez ensuite vous connecter sur <a href=\"{{loginUrl}}\">{{loginUrl}}</a>.</p><p>Bienvenue dans le mouvement !</p><p>— L'équipe GNDJ</p>",
                Variables = "[{\"key\":\"contactName\",\"label\":\"Nom du contact\"},{\"key\":\"childName\",\"label\":\"Nom de l'enfant\"},{\"key\":\"unitName\",\"label\":\"Unité\"},{\"key\":\"username\",\"label\":\"Identifiant\"},{\"key\":\"activationLink\",\"label\":\"Lien pour définir le mot de passe\"},{\"key\":\"loginUrl\",\"label\":\"Lien de connexion\"},{\"key\":\"expiryDays\",\"label\":\"Validité (jours)\"}]",
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
            new EmailTemplate
            {
                Name = "Rappel — demande non soumise", Code = "demande_submission_reminder", Module = "demande",
                Subject = "N'oubliez pas de soumettre votre demande — GNDJ Scout",
                BodyHtml = "<h2>Bonjour {{contactName}},</h2><p>Vous avez créé un compte pour inscrire un enfant au groupe scout GNDJ ({{scoutYear}}), mais votre demande n'a pas encore été <strong>soumise</strong>.</p><p>Merci de la compléter et de la soumettre avant le <strong>{{deadline}}</strong> : <a href=\"{{portalUrl}}\">{{portalUrl}}</a></p><p>Passé ce délai, les demandes non soumises ne pourront plus être traitées.</p><p>— L'équipe GNDJ</p>",
                Variables = "[{\"key\":\"contactName\",\"label\":\"Nom du contact\"},{\"key\":\"deadline\",\"label\":\"Date limite\"},{\"key\":\"scoutYear\",\"label\":\"Année scoute\"},{\"key\":\"portalUrl\",\"label\":\"Lien du portail\"}]",
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

    // Idempotent-per-code email templates added after the initial seed (member password reset + household-lookup code).
    public static async Task SeedMemberEmailTemplatesAsync(GndjDbContext context)
    {
        var toAdd = new List<EmailTemplate>();

        if (!await context.EmailTemplates.IgnoreQueryFilters().AnyAsync(t => t.Code == "member_password_reset"))
            toAdd.Add(new EmailTemplate
            {
                Name = "Mot de passe réinitialisé (membre)", Code = "member_password_reset", Module = "auth",
                Subject = "Votre mot de passe GNDJ a été réinitialisé",
                BodyHtml = "<h2>Bonjour {{memberName}},</h2><p>Le mot de passe de votre compte GNDJ a été réinitialisé par un responsable.</p><ul><li><strong>Identifiant :</strong> {{username}}</li><li><strong>Mot de passe temporaire :</strong> {{tempPassword}}</li></ul><p>Connectez-vous sur <a href=\"{{loginUrl}}\">{{loginUrl}}</a> et <strong>changez ce mot de passe dès votre première connexion</strong>.</p><p>Si vous n'êtes pas à l'origine de cette demande, contactez votre maîtrise.</p><p>— L'équipe GNDJ</p>",
                Variables = "[{\"key\":\"memberName\",\"label\":\"Nom du membre\"},{\"key\":\"username\",\"label\":\"Identifiant\"},{\"key\":\"tempPassword\",\"label\":\"Mot de passe temporaire\"},{\"key\":\"loginUrl\",\"label\":\"Lien de connexion\"}]",
                IsActive = true
            });

        if (!await context.EmailTemplates.IgnoreQueryFilters().AnyAsync(t => t.Code == "household_lookup_code"))
            toAdd.Add(new EmailTemplate
            {
                Name = "Code de vérification (retrouver mes informations)", Code = "household_lookup_code", Module = "demande",
                Subject = "Votre code de vérification — GNDJ Scout",
                BodyHtml = "<h2>Bonjour,</h2><p>Voici votre code pour retrouver les informations de votre famille lors de votre demande d'inscription :</p><p style=\"font-size:28px;font-weight:bold;letter-spacing:3px;\">{{code}}</p><p>Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p><p>— L'équipe GNDJ</p>",
                Variables = "[{\"key\":\"code\",\"label\":\"Code de vérification\"}]",
                IsActive = true
            });

        // Launch access rollout: a member's login username + a one-click link to set their own password.
        if (!await context.EmailTemplates.IgnoreQueryFilters().AnyAsync(t => t.Code == "account_activation"))
            toAdd.Add(new EmailTemplate
            {
                Name = "Activation du compte (accès)", Code = "account_activation", Module = "auth",
                Subject = "Votre accès à l'espace GNDJ",
                BodyHtml = "<h2>Bonjour {{memberName}},</h2><p>Votre espace personnel GNDJ est prêt. Voici comment y accéder :</p><ul><li><strong>Votre identifiant :</strong> {{username}}</li></ul><p>Cliquez sur le bouton ci-dessous pour choisir votre mot de passe et activer votre compte :</p><p><a href=\"{{activationLink}}\" style=\"background-color:#1e3a5f;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;\">Activer mon compte</a></p><p>Ce lien est valable {{expiryDays}} jours. Conservez bien votre identifiant : il vous servira à chaque connexion.</p><p>Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style=\"font-size:12px;color:#555;\">{{activationLink}}</span></p><p>— L'équipe GNDJ</p>",
                Variables = "[{\"key\":\"memberName\",\"label\":\"Nom du membre\"},{\"key\":\"username\",\"label\":\"Identifiant\"},{\"key\":\"activationLink\",\"label\":\"Lien d'activation\"},{\"key\":\"expiryDays\",\"label\":\"Validité (jours)\"}]",
                IsActive = true
            });

        // Admin error alert: sent to the super-admin (or error.notify_email) when an unexpected error occurs,
        // with the reference the user was shown so it can be tied to the logs.
        if (!await context.EmailTemplates.IgnoreQueryFilters().AnyAsync(t => t.Code == "error_alert"))
            toAdd.Add(new EmailTemplate
            {
                Name = "Alerte erreur (administrateur)", Code = "error_alert", Module = "auth",
                Subject = "[GNDJ Erreur {{source}}] réf. {{errorId}}",
                BodyHtml = "<h2>Une erreur est survenue</h2><p>Une erreur inattendue a été détectée dans l'application GNDJ. Voici les détails pour la diagnostiquer :</p><table cellpadding=\"6\" style=\"border-collapse:collapse;font-family:monospace;font-size:13px;\"><tr><td><strong>Référence</strong></td><td>{{errorId}}</td></tr><tr><td><strong>Origine</strong></td><td>{{source}}</td></tr><tr><td><strong>Date (UTC)</strong></td><td>{{timestamp}}</td></tr><tr><td><strong>Utilisateur</strong></td><td>{{user}}</td></tr><tr><td><strong>Requête</strong></td><td>{{method}} {{path}}</td></tr><tr><td><strong>Message</strong></td><td>{{message}}</td></tr></table><p><strong>Détail :</strong></p><pre style=\"background:#f4f4f4;padding:10px;border-radius:5px;font-size:12px;white-space:pre-wrap;\">{{detail}}</pre><p style=\"color:#888;font-size:12px;\">Les erreurs identiques sont regroupées (une alerte toutes les 30 minutes). Retrouvez la référence dans les journaux (application_logs).</p>",
                Variables = "[{\"key\":\"errorId\",\"label\":\"Référence\"},{\"key\":\"source\",\"label\":\"Origine\"},{\"key\":\"timestamp\",\"label\":\"Date\"},{\"key\":\"user\",\"label\":\"Utilisateur\"},{\"key\":\"method\",\"label\":\"Méthode HTTP\"},{\"key\":\"path\",\"label\":\"Chemin\"},{\"key\":\"message\",\"label\":\"Message\"},{\"key\":\"detail\",\"label\":\"Détail / trace\"}]",
                IsActive = true
            });

        // Yearly rentrée onboarding emails sent to the leaders (chefs) via the Communications tool. Two audiences:
        // a RETURNING chef gets the seasonal reminder; a NEW chef gets the same + a "prise en main" (how to log in
        // and navigate). Editable each year in Admin → Email. Variables resolved per recipient at send time.
        if (!await context.EmailTemplates.IgnoreQueryFilters().AnyAsync(t => t.Code == "cu_rentree"))
            toAdd.Add(new EmailTemplate
            {
                Name = "Rentrée — chef (déjà en poste)", Code = "cu_rentree", Module = "general",
                Subject = "Rentrée scoute {{scoutYear}} — informations pour les chefs",
                BodyHtml = "<h2>Bonjour {{leaderName}},</h2><p>La rentrée scoute <strong>{{scoutYear}}</strong> est lancée. Voici ce qui vous attend pour votre unité <strong>{{unitName}}</strong> sur la plateforme GNDJ.</p><h3>À faire</h3><ol><li><strong>Vérifiez votre unité</strong> — la liste de vos membres (présents / partis) et leurs données.</li><li><strong>Réalisez le passage</strong> — pour chaque membre : pas de changement, proposer une montée, ou quitte le groupe.</li><li><strong>Vérifiez les documents</strong> — approuvez/refusez les documents que les familles téléversent, suivez les cotisations.</li></ol><p>Connectez-vous sur <a href=\"{{loginUrl}}\">{{loginUrl}}</a> avec votre identifiant habituel.</p><p>Merci pour votre engagement et bonne rentrée scoute !</p><p>— La Maîtrise de Groupe</p>",
                Variables = "[{\"key\":\"leaderName\",\"label\":\"Nom du chef\"},{\"key\":\"unitName\",\"label\":\"Unité\"},{\"key\":\"scoutYear\",\"label\":\"Année scoute\"},{\"key\":\"loginUrl\",\"label\":\"Lien de connexion\"}]",
                IsActive = true
            });

        if (!await context.EmailTemplates.IgnoreQueryFilters().AnyAsync(t => t.Code == "cu_rentree_nouveau"))
            toAdd.Add(new EmailTemplate
            {
                Name = "Rentrée — nouveau chef", Code = "cu_rentree_nouveau", Module = "general",
                Subject = "Bienvenue — votre accès et la rentrée scoute {{scoutYear}}",
                BodyHtml = "<h2>Bonjour {{leaderName}},</h2><p>Bienvenue dans l'équipe de maîtrise ! Cette année, le Groupe utilise une plateforme en ligne pour gérer les membres, le passage, les documents et les inscriptions. Voici comment démarrer pour votre unité <strong>{{unitName}}</strong>.</p><h3>1. Prise en main</h3><ul><li>Connectez-vous sur <a href=\"{{loginUrl}}\">{{loginUrl}}</a> avec l'identifiant qui vous a été communiqué (vous choisirez votre mot de passe à la première connexion).</li><li>Vous arrivez sur le tableau de bord de votre unité : <em>Mon unité</em> (vos membres), <em>Passage des membres</em>, <em>Documents</em>.</li><li>En cas de souci de connexion : lien « Identifiant oublié ? » sur la page de connexion.</li></ul><h3>2. À faire pour la rentrée {{scoutYear}}</h3><ol><li><strong>Vérifiez votre unité</strong> — la liste de vos membres et leurs données.</li><li><strong>Réalisez le passage</strong> — une ligne par membre (pas de changement / montée / quitte le groupe).</li><li><strong>Vérifiez les documents</strong> — approuvez/refusez les documents des familles, suivez les cotisations.</li></ol><p>Une question ? Contactez votre chef de groupe. Bonne rentrée scoute !</p><p>— La Maîtrise de Groupe</p>",
                Variables = "[{\"key\":\"leaderName\",\"label\":\"Nom du chef\"},{\"key\":\"unitName\",\"label\":\"Unité\"},{\"key\":\"scoutYear\",\"label\":\"Année scoute\"},{\"key\":\"loginUrl\",\"label\":\"Lien de connexion\"}]",
                IsActive = true
            });

        // "Relance documents": a member's list of missing / to-correct / to-renew documents, sent from the CU
        // "Relance documents" page after the verification window. {{documentsList}} is a plain-text bulleted
        // list (one gap per line) rendered in a white-space:pre-line block — the newlines survive EmailService's
        // HTML-encoding of substituted values (XSS defense at the sink), so the list shows line-by-line.
        if (!await context.EmailTemplates.IgnoreQueryFilters().AnyAsync(t => t.Code == "document_reminder"))
            toAdd.Add(new EmailTemplate
            {
                Name = "Relance documents (membre)", Code = "document_reminder", Module = "documents",
                Subject = "Documents à compléter — {{memberName}}",
                BodyHtml = "<h2>Bonjour,</h2><p>Il manque un ou plusieurs documents dans le dossier scout de <strong>{{memberName}}</strong> (unité {{unitName}}). Merci de les compléter dès que possible :</p><div style=\"white-space:pre-line;background:#f6f8fa;border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;margin:12px 0;\">{{documentsList}}</div><p>Vous pouvez téléverser les documents manquants ou corrigés depuis votre espace personnel, rubrique « Mes documents » :</p><p><a href=\"{{documentsUrl}}\" style=\"background-color:#1e3a5f;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;\">Mes documents</a></p><p>Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style=\"font-size:12px;color:#555;\">{{documentsUrl}}</span></p><p>Merci pour votre réactivité !<br>— La Maîtrise GNDJ</p>",
                Variables = "[{\"key\":\"memberName\",\"label\":\"Nom du membre\"},{\"key\":\"unitName\",\"label\":\"Unité\"},{\"key\":\"documentsList\",\"label\":\"Liste des documents\"},{\"key\":\"documentsUrl\",\"label\":\"Lien Mes documents\"}]",
                IsActive = true
            });

        if (toAdd.Count > 0) { context.EmailTemplates.AddRange(toAdd); await context.SaveChangesAsync(); }
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
