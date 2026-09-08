namespace GNDJ.Application.DocumentTypes;

// The catalog of member placeholders a CG can insert into an in-app document template. ONE source of truth:
// the doc-type editor's "Insérer un champ" dropdown fetches this list (so keys never drift), the per-member
// PDF resolver fills each key from the member's data, and the CG "Aperçu PDF" uses the sample values.
// Placeholders are written as {{key}} in the template HTML (same token syntax as the email templates).
public record DocumentTemplateField(string Key, string Label, string Sample);

public static class DocumentTemplateFields
{
    // Order = how they appear in the editor dropdown (grouped roughly: identity → scolarité → scoutisme → parents → dates).
    public static readonly IReadOnlyList<DocumentTemplateField> All =
    [
        new("prenom", "Prénom", "Jean"),
        new("nom", "Nom", "DUPONT"),
        new("nomComplet", "Nom complet", "Jean DUPONT"),
        new("dateNaissance", "Date de naissance", "15/03/2014"),
        new("genre", "Genre", "Masculin"),
        new("groupeSanguin", "Groupe sanguin", "O+"),
        new("nationalite", "Nationalité", "Libanaise"),
        new("ecole", "École", "Collège Notre-Dame de Jamhour"),
        new("classe", "Classe", "6ème"),
        new("section", "Section", "B"),
        new("matricule", "Matricule", "M-0123"),
        new("numeroCarte", "Numéro de carte", "GDL-4567"),
        new("unite", "Unité", "Meute 2ème Beyrouth"),
        new("equipe", "Équipe / sizaine", "Étalons"),
        new("fonction", "Fonction", "Louveteau"),
        new("prenomPere", "Prénom du père", "Georges"),
        new("nomPere", "Nom du père", "DUPONT"),
        new("telephonePere", "Téléphone du père", "+961 3 111 111"),
        new("prenomMere", "Prénom de la mère", "Marie"),
        new("nomMere", "Nom de la mère", "DUPONT"),
        new("telephoneMere", "Téléphone de la mère", "+961 3 222 222"),
        new("anneeScoute", "Année scoute", "2026-2027"),
        new("dateDuJour", "Date du jour", "08/09/2026"),
    ];

    // Sample values for the CG "Aperçu PDF" (no member selected) — every key resolves to a realistic placeholder.
    public static Dictionary<string, string?> SampleValues() =>
        All.ToDictionary(f => f.Key, f => (string?)f.Sample);
}
