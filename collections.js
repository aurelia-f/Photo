/* =========================================================
   collections.js — Page « Collections »
   ========================================================= */

const $ = s => document.querySelector(s);

let mesCollections = [];
let tousLesMedias = [];
let collectionOuverte = null;
const selection = new Set();

monterNavigation();
demarrer();

async function demarrer() {
  tousLesMedias = await assets();
  await recharger();
  brancherEvenements();
}

async function recharger() {
  mesCollections = (await collections()).sort((a, b) => b.updatedAt - a.updatedAt);
  collectionOuverte ? dessinerDetail() : dessinerListe();
}

/* ---------- Liste ---------- */

function dessinerListe() {
  $('#vue-liste').hidden = false;
  $('#vue-detail').hidden = true;

  const boite = $('#cartes');
  boite.innerHTML = '';
  $('#vide').hidden = mesCollections.length > 0;
  boite.hidden = mesCollections.length === 0;

  for (const collection of mesCollections) {
    const carte = document.createElement('article');
    carte.className = 'carte-visuelle';

    const couverture = document.createElement('div');
    couverture.className = 'carte-couverture';

    // Mosaïque des quatre premières photos, ou dégradé si la collection est vide.
    const apercus = collection.assetIds
      .slice(0, 4)
      .map(id => tousLesMedias.find(m => m.id === id))
      .filter(Boolean);

    if (apercus.length) {
      const mosaique = document.createElement('div');
      mosaique.className = 'carte-mosaique';
      if (apercus.length === 1) mosaique.style.gridTemplateColumns = '1fr';
      for (const media of apercus) {
        const img = document.createElement('img');
        img.alt = '';
        urlPour(media.thumbRef).then(u => { if (u) img.src = u; });
        mosaique.appendChild(img);
      }
      couverture.appendChild(mosaique);
    } else {
      couverture.innerHTML = '<span>🗂️</span>';
    }

    carte.appendChild(couverture);
    carte.insertAdjacentHTML('beforeend', `
      <div class="carte-corps">
        <div class="carte-titre">${echapper(collection.name)}</div>
        <div class="carte-meta">
          ${collection.assetIds.length} photo${collection.assetIds.length > 1 ? 's' : ''}
          · modifiée le ${dateLisible(collection.updatedAt)}
        </div>
      </div>
    `);

    carte.onclick = () => ouvrirCollection(collection.id);
    boite.appendChild(carte);
  }
}

/* ---------- Détail ---------- */

function ouvrirCollection(id) {
  collectionOuverte = mesCollections.find(c => c.id === id);
  selection.clear();
  dessinerDetail();
}

function dessinerDetail() {
  const collection = collectionOuverte;
  if (!collection) return dessinerListe();

  $('#vue-liste').hidden = true;
  $('#vue-detail').hidden = false;

  $('#detail-titre').textContent = collection.name;
  $('#detail-meta').textContent =
    `${collection.assetIds.length} photo${collection.assetIds.length > 1 ? 's' : ''} · créée le ${dateLisible(collection.createdAt)}`;

  const grille = $('#detail-grille');
  grille.innerHTML = '';

  const medias = collection.assetIds
    .map(id => tousLesMedias.find(m => m.id === id))
    .filter(Boolean);

  $('#detail-vide').hidden = medias.length > 0;
  grille.hidden = medias.length === 0;

  for (const media of medias) {
    const vignette = document.createElement('div');
    vignette.className = 'vignette' + (selection.has(media.id) ? ' selection' : '');

    const img = document.createElement('img');
    img.alt = '';
    urlPour(media.thumbRef).then(u => { if (u) { img.src = u; img.classList.add('chargee'); } });
    vignette.appendChild(img);

    vignette.insertAdjacentHTML('beforeend', '<span class="vignette-coche">✓</span>');

    const retirer = document.createElement('button');
    retirer.className = 'vignette-favori';
    retirer.textContent = '✕';
    retirer.title = 'Retirer de la collection';
    retirer.onclick = async e => {
      e.stopPropagation();
      collection.assetIds = collection.assetIds.filter(x => x !== media.id);
      if (collection.coverAssetId === media.id) collection.coverAssetId = collection.assetIds[0] || null;
      collection.updatedAt = Date.now();
      await ecrire('collections', collection);
      await recharger();
    };
    vignette.appendChild(retirer);

    vignette.onclick = () => {
      selection.has(media.id) ? selection.delete(media.id) : selection.add(media.id);
      vignette.classList.toggle('selection', selection.has(media.id));
    };

    grille.appendChild(vignette);
  }
}

/* ---------- Ajout de photos ---------- */

async function choisirDesPhotos() {
  const collection = collectionOuverte;
  const dejaDedans = new Set(collection.assetIds);
  const candidats = tousLesMedias.filter(m => !dejaDedans.has(m.id));

  const dlg = document.createElement('dialog');
  dlg.style.maxWidth = 'min(820px, calc(100vw - 32px))';
  dlg.innerHTML = `
    <div class="dialogue-entete">
      <h2>Ajouter à « ${echapper(collection.name)} »</h2>
      <button class="btn btn-icone btn-fantome" data-fermer aria-label="Fermer">✕</button>
    </div>
    <div class="dialogue-corps">
      <div class="grille" id="choix" style="max-height:52vh;overflow:auto;
           grid-template-columns:repeat(auto-fill,minmax(104px,1fr))"></div>
    </div>
    <div class="dialogue-pied">
      <span class="pale" id="choix-compte" style="margin-right:auto">0 sélectionnée</span>
      <button class="btn" data-fermer>Annuler</button>
      <button class="btn btn-primaire" data-valider>Ajouter</button>
    </div>
  `;
  document.body.appendChild(dlg);
  dlg.showModal();

  const choisies = new Set();
  const boite = dlg.querySelector('#choix');

  if (!candidats.length) {
    boite.innerHTML = '<p class="pale">Toutes tes photos sont déjà dans cette collection.</p>';
  }

  for (const media of candidats) {
    const vignette = document.createElement('div');
    vignette.className = 'vignette';
    const img = document.createElement('img');
    img.alt = '';
    urlPour(media.thumbRef).then(u => { if (u) { img.src = u; img.classList.add('chargee'); } });
    vignette.appendChild(img);
    vignette.insertAdjacentHTML('beforeend', '<span class="vignette-coche">✓</span>');
    vignette.onclick = () => {
      choisies.has(media.id) ? choisies.delete(media.id) : choisies.add(media.id);
      vignette.classList.toggle('selection', choisies.has(media.id));
      dlg.querySelector('#choix-compte').textContent =
        `${choisies.size} sélectionnée${choisies.size > 1 ? 's' : ''}`;
    };
    boite.appendChild(vignette);
  }

  dlg.querySelector('[data-valider]').onclick = async () => {
    collection.assetIds = [...new Set([...collection.assetIds, ...choisies])];
    collection.coverAssetId ||= collection.assetIds[0];
    collection.updatedAt = Date.now();
    await ecrire('collections', collection);
    dlg.close(); dlg.remove();
    await recharger();
    notifier(`${choisies.size} photo(s) ajoutée(s)`, 'succes');
  };

  dlg.querySelectorAll('[data-fermer]').forEach(b => b.onclick = () => { dlg.close(); dlg.remove(); });
  dlg.addEventListener('cancel', () => dlg.remove());
}

/* ---------- Événements ---------- */

function brancherEvenements() {
  $('#btn-nouvelle').onclick = async () => {
    const nom = await demander('Nouvelle collection', '', 'Par exemple : Safari décembre');
    if (!nom) return;
    const collection = await creerCollection(nom);
    await recharger();
    ouvrirCollection(collection.id);
    notifier(`Collection « ${nom} » créée`, 'succes');
  };

  $('#btn-retour').onclick = () => { collectionOuverte = null; selection.clear(); dessinerListe(); };

  $('#btn-renommer').onclick = async () => {
    const nom = await demander('Renommer la collection', collectionOuverte.name);
    if (!nom) return;
    collectionOuverte.name = nom;
    collectionOuverte.updatedAt = Date.now();
    await ecrire('collections', collectionOuverte);
    await recharger();
  };

  $('#btn-ajouter-photos').onclick = choisirDesPhotos;

  $('#btn-vers-studio').onclick = () => {
    const ids = selection.size ? [...selection] : collectionOuverte.assetIds;
    if (!ids.length) return notifier('Cette collection est vide', 'erreur');
    envoyerAuStudio(ids);
  };

  $('#btn-supprimer-col').onclick = async () => {
    const ok = await confirmer(
      'Supprimer cette collection ?',
      'Les photos ne sont pas supprimées : elles restent dans ta photothèque.',
      'Supprimer', true
    );
    if (!ok) return;
    await supprimer('collections', collectionOuverte.id);
    collectionOuverte = null;
    await recharger();
    notifier('Collection supprimée', 'succes');
  };
}
