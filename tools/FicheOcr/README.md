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
5. crée la tâche de nuit **GNDJ-FicheOcr** (23:00) **désactivée**.

Si le téléchargement d'Ollama est bloqué, téléchargez `ollama-windows-amd64.zip` à la main depuis
<https://github.com/ollama/ollama/releases> et passez `-OllamaZip C:\chemin\ollama-windows-amd64.zip`.

## Essai (20 fiches)

```powershell
powershell -ExecutionPolicy Bypass -File deploy\ocr\run-ocr.ps1 -Trial 20 -Until ''
```

Résultat dans `C:\gndj-ocr\essai\fiches-medicales.xlsx` ; le journal dans `C:\gndj-ocr\logs`. Lancez-le un soir
(le serveur est partagé). Comparez quelques lignes avec les scans : si la qualité convient, activez la nuit :

```powershell
Enable-ScheduledTask -TaskName GNDJ-FicheOcr
```

## Fonctionnement de nuit

- 23:00 → démarre Ollama (priorité basse, 1 modèle, 1 fiche à la fois), lit les fiches **jusqu'à 06:00** (ne
  commence plus de fiche après), écrit l'Excel, **arrête Ollama** (libère ~8 Go de mémoire pour la journée).
- 4 cœurs sur 8 (`-Threads`), priorité basse : le site reste prioritaire.
- Compter **quelques minutes par fiche** sur le processeur (pas de carte graphique) : ~800 fiches ≈ 1 à 2 semaines
  de nuits. Le « Temps moyen par fiche » est affiché à la fin de chaque passage.
- **Pause** (inscriptions, rentrée…) : créez le fichier `C:\gndj-ocr\PAUSE` ; supprimez-le pour reprendre.
- Relire les fiches en erreur : `run-ocr.ps1 -RetryErrors`.
- Une fois tout lu : `Disable-ScheduledTask -TaskName GNDJ-FicheOcr`, puis supprimez le modèle si besoin
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
