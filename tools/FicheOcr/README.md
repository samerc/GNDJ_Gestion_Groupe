# FicheOcr — lecture hors ligne des fiches médicales scannées

Lit les fiches médicales **papier** envoyées cette année (scans PDF et photos) et produit un **Excel** à vérifier
à la main. Le but : pré-remplir la fiche médicale **en ligne** de l'an prochain.

Tout reste sur le serveur : les scans sont lus dans le dossier du site, le modèle de vision tourne dans un
**Ollama local** (`127.0.0.1:11434`, jamais exposé au réseau), l'Excel est écrit dans `C:\gndj-ocr` (hors du site,
accessible aux administrateurs seulement). Rien n'est envoyé à un service externe.

## Ce qu'il produit

`C:\gndj-ocr\fiches-medicales.xlsx` (ou `C:\gndj-ocr\essai\…` en mode essai) :

- **Fiches** : une ligne par membre actif (sa fiche acceptée, sinon la plus récente) — unité, nom, matricule, puis
  les 16 champs de la fiche (groupe sanguin, 4 vaccins, antécédents, maladie chronique, allergies aliments /
  médicaments / autre, traitement de crise, régime, médecin, contact d'urgence, signataire, date), « Signée »,
  **À vérifier** + **Raisons**, un lien vers le scan et vers la fiche dans l'app.
- Une case **`ILLISIBLE`** (orange) = quelque chose est écrit mais n'a pas pu être lu.
- **À vérifier** signale aussi : date incomplète / impossible / future, groupe sanguin non reconnu ou **différent de
  celui de la fiche du membre**, document qui n'est pas une fiche médicale, fiche vide, pas de signature.
- **Erreurs** : fichier introuvable, PDF abîmé…
- Les libellés des colonnes sont ceux du formulaire en ligne : une fois vérifié, l'Excel pourra être importé pour
  pré-remplir le formulaire (import à construire).

Le programme reprend où il s'est arrêté (`resultats.jsonl`) : chaque nuit il continue avec les fiches suivantes.

## Installation sur le serveur (une fois)

Dans un PowerShell **administrateur**, depuis le clone du dépôt :

```powershell
powershell -ExecutionPolicy Bypass -File deploy\ocr\setup-ocr.ps1
```

Le script :
1. télécharge **Ollama** (zip, sans installateur) dans `C:\ollama` ;
2. télécharge le modèle **`qwen2.5vl:7b`** (~6 Go, reprend si coupé) dans `C:\ollama\models` ;
3. compile le programme dans `C:\gndj-ocr\tool` (le SDK .NET est déjà sur le serveur) ;
4. réserve `C:\gndj-ocr` aux administrateurs et à SYSTEM (données médicales) ;
5. crée une tâche de nuit **GNDJ-FicheOcr** (23:00–06:00), **désactivée** : par défaut on lance à la demande.

Si le téléchargement d'Ollama est bloqué, téléchargez `ollama-windows-amd64.zip` à la main depuis
<https://github.com/ollama/ollama/releases> et passez `-OllamaZip C:\chemin\ollama-windows-amd64.zip`.

## Lancer à la demande

Dans un PowerShell administrateur, depuis le clone du dépôt (`$r` = le script) :

```powershell
$r = 'deploy\ocr\run-ocr.ps1'
powershell -ExecutionPolicy Bypass -File $r -ListUnits        # unités : fiches, traitées, restantes
powershell -ExecutionPolicy Bypass -File $r -Unit C1          # une unité (plusieurs : -Unit C1,T3)
powershell -ExecutionPolicy Bypass -File $r -Trial 20         # essai : 20 fiches au hasard, dans C:\gndj-ocr\essai
powershell -ExecutionPolicy Bypass -File $r                   # tout ce qui reste
powershell -ExecutionPolicy Bypass -File $r -Unit C1 -Until 18:00   # s'arrête avant 18:00
```

- Les fiches déjà lues sont sautées : les passages s'additionnent dans **un seul Excel**
  (`C:\gndj-ocr\fiches-medicales.xlsx`, toutes les unités lues jusque-là). Le journal est dans `C:\gndj-ocr\logs`.
- **Ctrl+C** arrête proprement : la fiche en cours se termine et l'Excel est écrit.
- Ollama démarre (priorité basse, 1 modèle, 1 fiche à la fois, 4 cœurs sur 8 avec `-Threads`) puis **s'arrête** à la
  fin (libère ~8 Go de mémoire). Le site reste prioritaire, mais évitez les heures de pointe.
- Compter **quelques minutes par fiche** (processeur, pas de carte graphique) : une unité de ~70 fiches ≈ quelques
  heures. Le « Temps moyen par fiche » est affiché à la fin de chaque passage.
- Relire les fiches en erreur : ajoutez `-RetryErrors`.

## Option : la nuit

`Enable-ScheduledTask -TaskName GNDJ-FicheOcr` lance tout ce qui reste chaque nuit de 23:00 à 06:00. Pause (inscriptions,
rentrée…) : créez le fichier `C:\gndj-ocr\PAUSE` (la tâche de nuit le respecte ; les lancements à la demande non).
Une fois tout lu : `Disable-ScheduledTask -TaskName GNDJ-FicheOcr`, puis supprimez le modèle si besoin
(`C:\ollama\ollama.exe rm qwen2.5vl:7b`, avec `OLLAMA_MODELS=C:\ollama\models`).

## Sur un autre PC (portable)

Sur le serveur : `C:\gndj-ocr\tool\FicheOcr.exe --site C:\inetpub\www\gndj --export D:\fiches` (copie les scans
+ `manifest.json`). Sur le portable (Ollama + modèle installés, .NET 10 runtime) :
`FicheOcr.exe --manifest D:\fiches\manifest.json --out D:\resultats`. ⚠️ Données médicales : clé chiffrée,
effacez la copie après usage.

## Options

`FicheOcr.exe --help` — `--check` vérifie la base, les fichiers et Ollama sans rien lire ; `--limit N`,
`--threads N`, `--model`, `--all-members` (inclut les anciens membres), `--max-pages` (3), `--max-px` (1600),
`--dpi` (150).

## Si la lecture est trop lente ou pas assez bonne

- Plus rapide, moins précis : `qwen2.5vl:3b` (`ollama pull qwen2.5vl:3b`, puis `-Model qwen2.5vl:3b`).
- Plus de cœurs la nuit : `-Threads 6`.
- Le prompt et les vérifications sont dans `FicheFields.cs`.
