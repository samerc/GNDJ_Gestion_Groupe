// Ready-made document templates for the in-app builder, so a CG edits a real document instead of a blank page.
// Each is HTML built from the form-builder nodes' serialisation: <span data-field="…"> (auto-filled member pill),
// <span data-fill data-w="…"> (write-on underline), <span data-checkbox> (checkbox), <div data-box data-h="…">
// (bordered answer box). The editor parses these back into its form nodes; the PDF renderer resolves the pills
// and draws the lines/boxes/checkboxes. The CG picks a starter, then adapts the text and saves.
//
// "Autorisation des parents" and "Certificat médical" reproduce the Group's real 2026-2027 Word forms
// (Document_Complet_Reinscription), with the fields we can auto-fill turned into pills and the rest kept as
// clean blanks the family completes by hand.

export interface DocumentStarter {
  key: string
  label: string
  description: string
  html: string
}

// A member-field pill (auto-filled). Helper keeps the starter HTML readable.
const f = (key: string, label: string) => `<span data-field="${key}" data-label="${label}" class="gndj-field">${label}</span>`
// A write-on underline of width w (px). No dotted lines.
const line = (w: number) => `<span data-fill="1" data-w="${w}" class="gndj-fill"> </span>`
// A bordered answer area of height h (px).
const area = (h: number) => `<div data-box="1" data-h="${h}" class="gndj-box"></div>`

export const DOCUMENT_STARTERS: DocumentStarter[] = [
  {
    key: 'blank',
    label: 'Document vierge',
    description: 'Partir d\'une page blanche.',
    html: '',
  },
  {
    key: 'autorisation',
    label: 'Autorisation des parents',
    description: 'Autorisation parentale (formulaire du Groupe).',
    html:
      `<h1 style="text-align:center">Autorisation des parents (${f('anneeScoute', 'Année scoute')})</h1>` +
      '<p>Au Chef de Groupe &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; À la Cheftaine de Groupe</p>' +
      `<p>Nous, soussignés (nom &amp; prénom du père) ${f('prenomPere', 'Prénom du père')} ${f('nomPere', 'Nom du père')} et (nom de jeune fille et prénom de la mère) ${f('prenomMere', 'Prénom de la mère')} ${f('nomMere', 'Nom de la mère')} désirons que notre enfant (nom &amp; prénom) <strong>${f('nomComplet', 'Nom complet')}</strong> poursuive son parcours scout / guide au sein du Groupe Notre-Dame Jamhour.</p>` +
      `<p>Notre enfant étant actuellement à l'unité : ${f('unite', 'Unité')}</p>` +
      '<p>Nous nous engageons à lui permettre de participer à toutes les activités organisées par son unité et par le Groupe Notre-Dame Jamhour durant cette année scoute.</p>' +
      '<p>Une absence non justifiée à l\'avance remettra en question sa participation au mouvement scout du collège.</p>' +
      '<p></p>' +
      `<p>Signature du père : ${line(200)} &nbsp;&nbsp;&nbsp; Signature de la mère : ${line(200)}</p>` +
      `<p>Date : ${line(160)}</p>`,
  },
  {
    key: 'certificat-medical',
    label: 'Certificat médical',
    description: 'Fiche / certificat médical du membre (formulaire du Groupe).',
    html:
      `<h1 style="text-align:center">Certificat médical (${f('anneeScoute', 'Année scoute')})</h1>` +
      `<p>Prénom ${f('prenom', 'Prénom')} &nbsp;&nbsp; Nom ${f('nom', 'Nom')} &nbsp;&nbsp; Unité ${f('unite', 'Unité')}</p>` +
      `<p>Date de naissance ${f('dateNaissance', 'Date de naissance')} &nbsp;&nbsp; Groupe sanguin ${f('groupeSanguin', 'Groupe sanguin')}</p>` +
      `<p>Prénom du père ${f('prenomPere', 'Prénom du père')} &nbsp;&nbsp; Prénom de la mère ${f('prenomMere', 'Prénom de la mère')}</p>` +
      '<h3>Vaccinations (date du dernier rappel)</h3>' +
      '<ul>' +
      `<li>Anti diphtérique, tétanos et polio : ${line(160)}</li>` +
      `<li>Anti hépatite A : ${line(160)}</li>` +
      `<li>Anti typhoïdique Vi : ${line(160)}</li>` +
      `<li>Anti ROR (rougeole, oreillons, rubéole) : ${line(160)}</li>` +
      '</ul>' +
      '<h3>Antécédents médicaux et chirurgicaux</h3>' +
      area(60) +
      '<h3>Maladie chronique ou traitement à long terme actuellement suivi</h3>' +
      area(60) +
      '<h3>Allergies connues</h3>' +
      `<p>Aliments (lactose, gluten…) : ${line(300)}</p>` +
      `<p>Médicaments : ${line(320)}</p>` +
      `<p>Autre : ${line(340)}</p>` +
      '<p>Si oui, veuillez nous informer :</p>' +
      `<p>— du traitement en cas de crise : ${line(280)}</p>` +
      `<p>— du régime alimentaire spécifique : ${line(260)}</p>` +
      '<h3>Noms, prénoms et coordonnées</h3>' +
      `<p>— du médecin de famille : ${line(300)}</p>` +
      `<p>— de la personne à contacter en cas d'urgence : ${line(230)}</p>` +
      '<p>Je certifie que les informations fournies dans ce certificat médical sont exactes et j\'assume l\'entière responsabilité en cas d\'information médicale non communiquée.</p>' +
      '<p></p>' +
      `<p>Nom / Prénom : ${line(220)} &nbsp;&nbsp; Date : ${line(140)} &nbsp;&nbsp; Signature : ${line(200)}</p>`,
  },
  {
    key: 'decharge-sortie',
    label: 'Autorisation de sortie / camp',
    description: 'Autorisation ponctuelle pour une sortie ou un camp.',
    html:
      '<h1 style="text-align:center">Autorisation de sortie</h1>' +
      `<p>Je soussigné(e) ${line(280)}, parent de <strong>${f('nomComplet', 'Nom complet')}</strong> (unité ${f('unite', 'Unité')}), autorise mon enfant à participer à la sortie suivante :</p>` +
      `<p>Sortie / camp : ${line(320)}</p>` +
      `<p>Dates : du ${line(120)} au ${line(120)}</p>` +
      `<p>Lieu : ${line(320)}</p>` +
      `<p>Personne à contacter : ${line(220)} &nbsp; Tél. : ${line(160)}</p>` +
      `<p>Fait le ${f('dateDuJour', 'Date du jour')}. &nbsp; Signature : ${line(250)}</p>`,
  },
]
