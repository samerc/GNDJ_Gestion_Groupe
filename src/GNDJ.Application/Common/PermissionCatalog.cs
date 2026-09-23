using P = GNDJ.Domain.Enums.Permissions;

namespace GNDJ.Application.Common;

// Human-facing catalog of every permission, grouped by DOMAIN with a French label. One source of truth shared
// by the effective-access viewer (and, later, the unified permissions editor) so a permission is always
// presented the same way. `All` covers exactly Permissions.All — a permission missing here would be invisible
// in the viewer, so keep the two in sync.
public static class PermissionCatalog
{
    public record Domain(string Key, string Label);
    public record PermInfo(string Key, string DomainKey, string Label);

    // Domains in a sensible reading order (member-centric first, structure/system last).
    public static readonly Domain[] Domains =
    [
        new("membres", "Membres"),
        new("affectations", "Affectations"),
        new("documents", "Documents"),
        new("cotisations", "Cotisations"),
        new("progression", "Progression"),
        new("passages", "Passages"),
        new("demandes", "Demandes d'inscription"),
        new("reunions", "Réunions & absences"),
        new("camp", "Camp BP"),
        new("rentree", "Rentrée"),
        new("unites", "Unités & structure"),
        new("roles", "Rôles & accès"),
        new("site", "Site public"),
        new("systeme", "Journal & système"),
    ];

    public static readonly PermInfo[] All =
    [
        new(P.MembersView, "membres", "Voir les fiches"),
        new(P.MembersCreate, "membres", "Créer un membre"),
        new(P.MembersEdit, "membres", "Modifier une fiche"),
        new(P.MembersDelete, "membres", "Supprimer un membre"),
        new(P.MembersResetPassword, "membres", "Réinitialiser le mot de passe"),

        new(P.AssignmentsView, "affectations", "Voir les affectations"),
        new(P.AssignmentsCreate, "affectations", "Créer une affectation"),
        new(P.AssignmentsEdit, "affectations", "Modifier une affectation"),
        new(P.AssignmentsDelete, "affectations", "Supprimer une affectation"),

        // NOTE: relationships.* (the old "Famille" domain) is enforced by NO endpoint — family access rides on
        // members.view/edit (the "Membres" domaine). Dropped from the catalog 2026-09-23 so the editor/viewer
        // don't show unenforceable permissions. (The enum constants + any stored grants are left as harmless data.)

        new(P.DocumentsView, "documents", "Voir les documents"),
        new(P.DocumentsCreate, "documents", "Téléverser un document"),
        new(P.DocumentsEdit, "documents", "Modifier un document"),
        new(P.DocumentsDelete, "documents", "Supprimer un document"),
        new(P.DocumentsApprove, "documents", "Valider / refuser un document"),

        new(P.CotisationsView, "cotisations", "Voir les cotisations"),
        new(P.CotisationsCreate, "cotisations", "Enregistrer un paiement"),
        new(P.CotisationsEdit, "cotisations", "Modifier une cotisation"),
        new(P.CotisationsDelete, "cotisations", "Supprimer une cotisation"),

        new(P.ProgressionView, "progression", "Voir la progression"),
        new(P.ProgressionManage, "progression", "Gérer la progression"),

        new(P.PassageView, "passages", "Voir les passages"),
        new(P.PassagePropose, "passages", "Proposer un passage"),
        new(P.PassageManage, "passages", "Valider / finaliser les passages"),

        new(P.DemandeView, "demandes", "Voir les demandes"),
        new(P.DemandeManage, "demandes", "Décider / convertir les demandes"),

        new(P.AttendanceManage, "reunions", "Gérer les réunions et absences"),

        new(P.CampGrade, "camp", "Noter les membres (camp)"),
        new(P.CampManage, "camp", "Gérer le camp BP"),

        new(P.RentreeManage, "rentree", "Gérer la rentrée (modèle + tâches)"),

        new(P.UnitsView, "unites", "Voir les unités"),
        new(P.UnitsCreate, "unites", "Créer une unité"),
        new(P.UnitsEdit, "unites", "Modifier une unité"),
        new(P.UnitsDelete, "unites", "Supprimer une unité"),
        new(P.TeamsView, "unites", "Voir les équipes"),
        new(P.TeamsCreate, "unites", "Créer une équipe"),
        new(P.TeamsEdit, "unites", "Modifier une équipe"),
        new(P.TeamsDelete, "unites", "Supprimer une équipe"),
        new(P.UnitTypesView, "unites", "Voir les types d'unité"),
        new(P.UnitTypesManage, "unites", "Gérer les types d'unité"),
        new(P.AssociationsView, "unites", "Voir les associations"),
        new(P.AssociationsManage, "unites", "Gérer les associations (et paramètres système)"),
        new(P.DocumentTypesView, "unites", "Voir les types de documents"),
        new(P.DocumentTypesManage, "unites", "Gérer les types de documents"),

        new(P.RolesView, "roles", "Voir les profils de sécurité"),
        new(P.RolesManage, "roles", "Gérer les profils de sécurité"),
        new(P.RolesManageGroup, "roles", "Déléguer l'accès de la maîtrise de groupe"),
        new(P.MaitriseManage, "roles", "Gérer la maîtrise (vue hiérarchique, transferts)"),

        new(P.ContentManage, "site", "Gérer le site public (actualités, pages)"),

        new(P.AuditView, "systeme", "Voir le journal d'audit"),
        new(P.AdminHardDelete, "systeme", "Suppression définitive"),
    ];
}
