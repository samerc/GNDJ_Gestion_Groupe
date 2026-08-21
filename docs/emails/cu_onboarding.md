# Email d'accueil — Chefs d'unité (CU) et Chefs de groupe (CG)

> Brouillon modifiable. À envoyer aux chefs au lancement de la période de septembre.
> Placeholders entre `[...]` à compléter/ajuster. Une fois validé, on peut le transformer
> en modèle d'email dans l'app (Admin → Email / SMTP) ou l'envoyer tel quel.

---

**Objet :** Nouvelle plateforme GNDJ — vos accès et les étapes de la rentrée

**Destinataires :** Chefs d'unité et chefs de groupe

---

Bonjour [Prénom],

Le Groupe Notre-Dame de Jamhour se dote cette année d'une **nouvelle plateforme de gestion**
qui remplace l'ancien système. Elle regroupe au même endroit les membres, les unités, les
documents, les cotisations, le passage annuel et les demandes d'inscription.

Voici tout ce dont vous avez besoin pour démarrer.

## 1. Activez votre compte

Cet email contient **directement votre lien d'activation** (bouton « *Activer mon compte* ») —
cliquez dessus pour **choisir votre mot de passe**. Un seul email, pas d'envoi séparé.

- Votre identifiant de connexion est : **[prenom.nom@scouts.gndj]**
- Adresse du site : **https://new.gndj.org**
- Le lien d'activation est valable **30 jours**.
- Si vous ne trouvez pas cet email, vérifiez vos courriers indésirables (spam), ou utilisez le
  lien « **Identifiant oublié ?** » sur la page de connexion.

> Implémentation : la page **Message aux chefs** (Communications) envoie les modèles
> `cu_rentree` / `cu_rentree_nouveau`, qui incluent désormais le lien d'activation
> ({{activationLink}} + {{username}}). L'envoi tamponne un jeton de mot de passe par
> destinataire **uniquement si le corps du modèle contient `{{activationLink}}`** — donc ce
> seul email fait aussi office d'« Envoyer les accès ».
>
> **Années suivantes :** les chefs déjà en poste sont déjà membres avec un compte — ils n'ont
> PAS besoin d'activer. Il suffira alors de **retirer le bloc « Votre accès » (le
> `{{activationLink}}`) du modèle `cu_rentree`** : l'email redevient de simples instructions
> (aucun jeton tamponné), et l'on garde `cu_rentree_nouveau` (avec le lien) pour les chefs
> réellement nouveaux. Aucun changement de code : le comportement suit le contenu du modèle.

## 2. Vérifiez et ajustez votre unité

Une fois connecté, vous arrivez sur le tableau de bord de **votre unité**. Merci de :

- **Vérifier la liste de vos membres** (présents / partis) et corriger les données visibles
  (nom, date de naissance, école, classe, coordonnées).
- **Vérifier les équipes/sizaines** et l'affectation de chaque membre.
- Signaler toute anomalie (membre manquant, doublon, données erronées) à [contact CG].

## 3. Réalisez le passage annuel

La période de **passage** est ouverte. Pour chaque membre de votre unité, indiquez :

- **Pas de changement** — le membre reste dans la même unité,
- **Proposer un changement** — le membre monte dans une unité supérieure (le parcours vous
  propose les destinations),
- **Quitte le groupe** — le membre ne poursuit pas cette année.

Le chef de groupe validera ensuite les propositions puis finalisera le passage.
**Merci de compléter une ligne pour chaque membre actif avant le [date limite].**

## 4. Vérifiez les documents des membres

Les familles vont **téléverser les documents requis** (et vérifier leurs données) depuis leur
espace membre. De votre côté :

- Consultez la page **Documents** de votre unité (tableau membres × documents).
- **Approuvez ou refusez** chaque document (avec un motif en cas de refus).
- Suivez l'avancement des cotisations (payée / en attente / exemptée).

## 5. Demandes d'inscription (nouveaux membres)

Les **nouvelles familles** déposent leur demande en ligne. Le chef de groupe les examine et
répartit les enfants par unité. Vous verrez arriver les nouveaux membres dans votre unité une
fois les réponses envoyées. [À adapter selon le rôle du CU dans les demandes.]

## Calendrier

| Étape | Période |
|------|---------|
| Activation des comptes + vérification des unités | [dates] |
| Passage annuel | [dates] |
| Ouverture des demandes d'inscription | [dates] |
| Téléversement / vérification des documents | [dates] |

## Besoin d'aide ?

- Un souci de connexion : lien « Identifiant oublié ? » sur la page de connexion, ou contactez [contact].
- Une question sur la plateforme : [contact / responsable].

Merci pour votre engagement et bonne rentrée scoute !

[Signature — Chef de Groupe / Équipe GNDJ]
