# Photo Studio — installation dans Visual Studio Code

## Arborescence à recréer

Tous les fichiers dans un seul dossier, aucun sous-dossier.

```
photo-studio/
├── index.html          → My Photos
├── photos.js
├── collections.html    → Collections
├── collections.js
├── studio.html         → Studio créatif
├── studio.js
├── propositions.html   → Ma proposition de post
├── propositions.js
├── posts.html          → My Posts
├── posts.js
├── parametres.html     → Paramètres
├── parametres.js
├── style.css           → la seule feuille de style, partagée
├── manifest.json       → pour installer l'app sur ton écran d'accueil
├── db.js               ┐
├── storage.js          │ modules communs à toutes les pages
├── media.js            │
└── ui.js               ┘
```

## Important : il faut un serveur local

Les pages utilisent les modules ES (`<script type="module">`). Si tu ouvres
`index.html` par un double-clic, le navigateur bloque les imports et rien ne
s'affiche. Ce n'est pas un bug du code.

Dans VS Code, installe l'extension **Live Server**, puis clic droit sur
`index.html` → **Open with Live Server**. L'adresse devient
`http://127.0.0.1:5500/index.html` et tout fonctionne.

Sans extension, depuis le terminal dans le dossier du projet :

```bash
python -m http.server 5500
```

## Deux bibliothèques chargées depuis un CDN

- **Konva** (canvas du studio) — dans `studio.html`
- **fflate** (fichiers ZIP) — dans `studio.html` et `parametres.html`

Il faut donc être connectée au premier chargement. Pour travailler hors ligne,
télécharge les deux fichiers dans un dossier `lib/` et remplace les URLs.

## Ce qui marche dès maintenant

- Import de photos et vidéos (le sélecteur natif s'ouvre sur mobile)
- Miniatures, aperçus, couleurs dominantes, date EXIF
- Grille, recherche, filtres, favoris, sélection multiple
- Détection des doublons exacts et des quasi-doublons
- Catégories, avec la distinction visuelle entre proposition et décision
- Collections
- Studio : slides, calques, texte, formes, undo/redo, magnétisme, panorama continu
- Export PNG/JPEG, une slide ou toutes en ZIP numéroté
- My Posts avec les quatre statuts et le bouton « J'ai publié ce post »
- Propositions de posts calculées localement
- Sauvegarde exportable complète et restauration

## Ce qui n'est pas là

- **Google Photos** : demande un projet Google Cloud et une vérification OAuth.
  Le dossier `js/sources/` est prévu pour ça.
- **Classification par IA** : phase 3. Les couleurs et l'ambiance, elles, sont
  déjà calculées à l'import, sans modèle.
- **Comptes et synchronisation** : phase 4.

## Le point à ne pas oublier

Les données vivent dans IndexedDB, dans ce navigateur, sur cet appareil.
Vider les données du site les efface. Exporte une archive depuis les
Paramètres de temps en temps — c'est la seule vraie sauvegarde.
