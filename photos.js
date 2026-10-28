/* =========================================================
   photos.js — Page « My Photos »
   ========================================================= */

const $ = s => document.querySelector(s);

let tousLesMedias = [];
let listeCategories = [];
const selection = new Set();
let dernierIndexClique = null;
let importInterrompu = false;

const filtres = {
  recherche: '',
  type: '',
  categorie: '',
  periode: '',
  usage: '',
  favoris: false
};

/* ---------- Démarrage ---------- */

monterNavigation();
demarrer();

async function demarrer() {
  listeCategories = await categories();
  remplirFiltreCategories();
  brancherEvenements();
  await recharger();
}

async function recharger() {
  tousLesMedias = await assets();
  dessinerGrille();
  majResume();
}

/* ---------- Filtrage ---------- */

function mediasFiltres() {
  const maintenant = Date.now();

  return tousLesMedias.filter(m => {
    if (filtres.type && m.type !== filtres.type) return false;
    if (filtres.favoris && !m.favorite) return false;

    if (filtres.categorie && !(m.categories || []).some(c => c.id === filtres.categorie)) {
      return false;
    }

    if (filtres.periode) {
      const limite = maintenant - Number(filtres.periode) * 86400000;
      if ((m.capturedAt || m.importedAt) < limite) return false;
    }

    if (filtres.usage === 'jamais' && (m.usedInPosts || []).length) return false;
    if (filtres.usage === 'deja' && !(m.usedInPosts || []).length) return false;

    if (filtres.recherche) {
      const termes = filtres.recherche.toLowerCase();
      const libelles = (m.categories || [])
        .map(c => listeCategories.find(x => x.id === c.id)?.label || '')
        .join(' ');
      if (!`${m.name} ${libelles}`.toLowerCase().includes(termes)) return false;
    }

    return true;
  });
}

function filtreActif() {
  return Object.entries(filtres).some(([, v]) => v !== '' && v !== false);
}

/* ---------- Affichage de la grille ---------- */

function dessinerGrille() {
  const grille = $('#grille');
  const vide = $('#vide');
  const liste = mediasFiltres();

  grille.innerHTML = '';

  if (!liste.length) {
    grille.hidden = true;
    vide.hidden = false;
    vide.innerHTML = tousLesMedias.length
      ? `<span class="vide-emoji">🔍</span>
         <h3>Aucune photo ne correspond</h3>
         <p>Essaie d'assouplir les filtres, ou réinitialise-les.</p>
         <button class="btn" onclick="document.getElementById('btn-reinit').click()">
           Réinitialiser les filtres
         </button>`
      : `<span class="vide-emoji">🌸</span>
         <h3>Ta photothèque est vide</h3>
         <p>Autorise un dossier entier pour que tout arrive d'un coup,
            ou choisis tes photos une par une.</p>
         <div class="rangee" style="justify-content:center;margin-top:20px">
           <a class="btn btn-primaire" href="connecter.html">📂 Connecter mes photos</a>
           <button class="btn" onclick="document.getElementById('fichiers').click()">
             Choisir des photos
           </button>
         </div>`;
    return;
  }

  grille.hidden = false;
  vide.hidden = true;

  liste.forEach((m, index) => grille.appendChild(creerVignette(m, index)));
}

function creerVignette(media, index) {
  const vignette = document.createElement('div');
  vignette.className = 'vignette' + (selection.has(media.id) ? ' selection' : '');
  vignette.dataset.id = media.id;
  vignette.tabIndex = 0;
  vignette.setAttribute('role', 'button');
  vignette.setAttribute('aria-label', media.name);

  const img = document.createElement('img');
  img.alt = '';
  img.loading = 'lazy';
  vignette.appendChild(img);
  urlPour(media.thumbRef).then(url => { if (url) chargerQuandVisible(img, url); });

  const coche = document.createElement('span');
  coche.className = 'vignette-coche';
  coche.textContent = '✓';
  vignette.appendChild(coche);

  const favori = document.createElement('button');
  favori.className = 'vignette-favori' + (media.favorite ? ' actif' : '');
  favori.textContent = media.favorite ? '★' : '☆';
  favori.title = media.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris';
  favori.onclick = async e => {
    e.stopPropagation();
    const suivant = await majAsset(media.id, { favorite: !media.favorite });
    Object.assign(media, suivant);
    favori.textContent = media.favorite ? '★' : '☆';
    favori.classList.toggle('actif', media.favorite);
  };
  vignette.appendChild(favori);

  const marques = document.createElement('div');
  marques.className = 'vignette-marque';
  if (media.type === 'video') {
    marques.innerHTML = `<span class="vignette-etiq">▶ ${dureeLisible(media.durationMs)}</span>`;
  }
  if ((media.usedInPosts || []).length) {
    marques.innerHTML += '<span class="vignette-etiq">publiée</span>';
  }
  vignette.appendChild(marques);

  vignette.onclick = e => {
    if (e.shiftKey && dernierIndexClique !== null) {
      etendreSelection(index);
    } else if (e.metaKey || e.ctrlKey || selection.size) {
      basculerSelection(media.id);
      dernierIndexClique = index;
    } else {
      ouvrirDetail(media.id);
      return;
    }
    majBarreSelection();
    dessinerEtatsSelection();
  };

  // Mobile : appui long pour entrer en sélection
  let minuteurAppui;
  vignette.addEventListener('touchstart', () => {
    minuteurAppui = setTimeout(() => {
      basculerSelection(media.id);
      dernierIndexClique = index;
      majBarreSelection();
      dessinerEtatsSelection();
    }, 420);
  }, { passive: true });
  ['touchend', 'touchmove'].forEach(evt =>
    vignette.addEventListener(evt, () => clearTimeout(minuteurAppui), { passive: true })
  );

  vignette.onkeydown = e => {
    if (e.key === 'Enter') ouvrirDetail(media.id);
    if (e.key === ' ') { e.preventDefault(); vignette.click(); }
  };

  return vignette;
}

function dessinerEtatsSelection() {
  document.querySelectorAll('.vignette').forEach(v => {
    v.classList.toggle('selection', selection.has(v.dataset.id));
  });
}

/* ---------- Sélection ---------- */

function basculerSelection(id) {
  selection.has(id) ? selection.delete(id) : selection.add(id);
}

function etendreSelection(index) {
  const liste = mediasFiltres();
  const [debut, fin] = [dernierIndexClique, index].sort((a, b) => a - b);
  for (let i = debut; i <= fin; i++) selection.add(liste[i].id);
}

function viderSelection() {
  selection.clear();
  majBarreSelection();
  dessinerEtatsSelection();
}

function majBarreSelection() {
  const barre = $('#barre-selection');
  barre.classList.toggle('visible', selection.size > 0);
  $('#compte-selection').textContent =
    `${selection.size} sélectionnée${selection.size > 1 ? 's' : ''}`;
}

/* ---------- Import ---------- */

async function importer(fichiers) {
  if (!fichiers.length) return;

  await demanderPersistance();

  const progression = $('#progression');
  const barre = $('#progression-barre');
  const texte = $('#progression-texte');
  progression.hidden = false;
  importInterrompu = false;

  const empreintesConnues = new Set(tousLesMedias.map(m => m.contentHash));
  const nouveaux = [];
  let ignores = 0, echecs = 0;

  for (let i = 0; i < fichiers.length; i++) {
    if (importInterrompu) break;

    texte.textContent = `Import ${i + 1} / ${fichiers.length}`;
    barre.style.width = `${((i + 1) / fichiers.length) * 100}%`;

    try {
      const media = await preparer(fichiers[i]);
      if (empreintesConnues.has(media.contentHash)) { ignores++; continue; }
      empreintesConnues.add(media.contentHash);
      nouveaux.push(media);
    } catch (erreur) {
      echecs++;
      console.warn(`Import impossible : ${fichiers[i].name}`, erreur);
    }

    // Laisse respirer l'interface entre deux fichiers.
    await new Promise(r => setTimeout(r, 0));
  }

  if (nouveaux.length) await ecrireLot('assets', nouveaux);

  progression.hidden = true;
  await recharger();

  const morceaux = [`${nouveaux.length} média${nouveaux.length > 1 ? 's' : ''} importé${nouveaux.length > 1 ? 's' : ''}`];
  if (ignores) morceaux.push(`${ignores} doublon${ignores > 1 ? 's' : ''} ignoré${ignores > 1 ? 's' : ''}`);
  if (echecs) morceaux.push(`${echecs} échec${echecs > 1 ? 's' : ''}`);
  notifier(morceaux.join(', '), echecs ? 'erreur' : 'succes');
}

/* ---------- Détail d'une photo ---------- */

async function ouvrirDetail(id) {
  const media = await asset(id);
  if (!media) return;

  const url = await urlPour(media.previewRef) || await urlPour(media.thumbRef);

  const dlg = document.createElement('dialog');
  dlg.style.maxWidth = 'min(760px, calc(100vw - 32px))';
  dlg.innerHTML = `
    <div class="dialogue-entete">
      <h2>${echapper(media.name)}</h2>
      <button class="btn btn-icone btn-fantome" data-fermer aria-label="Fermer">✕</button>
    </div>
    <div class="dialogue-corps">
      <div style="border-radius:12px;overflow:hidden;background:var(--surface-2);
                  display:grid;place-items:center;max-height:46vh;margin-bottom:16px">
        <img src="${url || ''}" alt="" style="max-width:100%;max-height:46vh;display:block">
      </div>

      <table class="tableau" style="margin-bottom:16px">
        <tr><td class="doux" style="width:36%">Prise le</td><td>${dateLisible(media.capturedAt)}</td></tr>
        <tr><td class="doux">Importée le</td><td>${dateLisible(media.importedAt)}</td></tr>
        <tr><td class="doux">Dimensions</td><td>${media.width} × ${media.height} px</td></tr>
        <tr><td class="doux">Format</td><td>${echapper(media.mimeType)} — ${poidsLisible(media.bytes)}</td></tr>
        <tr><td class="doux">Ambiance</td><td>${ambiance(media.dominantColors)}</td></tr>
        <tr>
          <td class="doux">Couleurs</td>
          <td>${(media.dominantColors || []).map(c =>
            `<span style="display:inline-block;width:19px;height:19px;border-radius:5px;
                          background:${c};margin-right:5px;vertical-align:middle;
                          border:1px solid var(--bordure)"></span>`).join('')}</td>
        </tr>
        <tr>
          <td class="doux">Utilisée dans</td>
          <td>${(media.usedInPosts || []).length
            ? `${media.usedInPosts.length} post publié(s)`
            : '<span class="pale">Jamais publiée</span>'}</td>
        </tr>
      </table>

      <label class="etiquette">Catégories</label>
      <div class="rangee" id="detail-categories" style="gap:6px"></div>
    </div>
    <div class="dialogue-pied">
      <button class="btn btn-danger" data-supprimer>Supprimer</button>
      <button class="btn btn-primaire" data-studio>Ouvrir dans le studio</button>
    </div>
  `;

  document.body.appendChild(dlg);
  dlg.showModal();

  const dessinerCategories = async () => {
    const actuel = await asset(id);
    const boite = dlg.querySelector('#detail-categories');
    boite.innerHTML = '';

    for (const posee of (actuel.categories || [])) {
      const categorie = listeCategories.find(c => c.id === posee.id);
      if (!categorie) continue;
      const puce = document.createElement('span');
      // Une prédiction de l'IA reste en pointillés jusqu'à confirmation.
      puce.className = 'puce' + (posee.origin === 'ai' ? ' ia' : '');
      puce.innerHTML = `${categorie.emoji} ${echapper(categorie.label)}
        <button class="puce-fermer" aria-label="Retirer">✕</button>`;
      puce.title = posee.origin === 'ai'
        ? 'Proposée automatiquement — clique pour confirmer'
        : 'Catégorie que tu as confirmée';
      puce.onclick = async e => {
        if (e.target.classList.contains('puce-fermer')) {
          await retirerCategorie(id, categorie.id);
        } else if (posee.origin === 'ai') {
          await poserCategorie(id, categorie.id, 'user');
        }
        await dessinerCategories();
      };
      boite.appendChild(puce);
    }

    const ajout = document.createElement('select');
    ajout.className = 'champ';
    ajout.style.width = 'auto';
    const posees = new Set((actuel.categories || []).map(c => c.id));
    ajout.innerHTML = '<option value="">+ Ajouter une catégorie</option>' +
      listeCategories.filter(c => !posees.has(c.id))
        .map(c => `<option value="${c.id}">${c.emoji} ${echapper(c.label)}</option>`).join('');
    ajout.onchange = async () => {
      if (!ajout.value) return;
      await poserCategorie(id, ajout.value, 'user');
      await dessinerCategories();
    };
    boite.appendChild(ajout);
  };

  await dessinerCategories();

  dlg.querySelector('[data-fermer]').onclick = () => fermer();
  dlg.querySelector('[data-studio]').onclick = () => envoyerAuStudio([id]);
  dlg.querySelector('[data-supprimer]').onclick = async () => {
    const ok = await confirmer(
      'Supprimer cette photo ?',
      'Elle sera retirée de la photothèque et de toutes tes collections. Les posts déjà exportés ne changent pas.',
      'Supprimer', true
    );
    if (!ok) return;
    await supprimerAsset(id);
    fermer();
    await recharger();
    notifier('Photo supprimée', 'succes');
  };

  function fermer() {
    dlg.close();
    dlg.remove();
    recharger();
  }
  dlg.addEventListener('cancel', () => dlg.remove());
}

/* ---------- Doublons ---------- */

async function ouvrirDoublons() {
  // Deux photos sont « probablement les mêmes » si leurs empreintes
  // perceptuelles diffèrent de 8 bits ou moins sur 64.
  const groupes = [];
  const vus = new Set();

  for (const a of tousLesMedias) {
    if (vus.has(a.id) || !a.perceptualHash) continue;
    const groupe = [a];
    for (const b of tousLesMedias) {
      if (b.id === a.id || vus.has(b.id) || !b.perceptualHash) continue;
      if (distance(a.perceptualHash, b.perceptualHash) <= 8) {
        groupe.push(b);
        vus.add(b.id);
      }
    }
    if (groupe.length > 1) { groupes.push(groupe); vus.add(a.id); }
  }

  const dlg = document.createElement('dialog');
  dlg.style.maxWidth = 'min(820px, calc(100vw - 32px))';
  dlg.innerHTML = `
    <div class="dialogue-entete">
      <h2>Doublons probables</h2>
      <button class="btn btn-icone btn-fantome" data-fermer aria-label="Fermer">✕</button>
    </div>
    <div class="dialogue-corps" id="corps-doublons" style="max-height:62vh;overflow:auto"></div>
    <div class="dialogue-pied"><button class="btn" data-fermer>Fermer</button></div>
  `;
  document.body.appendChild(dlg);
  dlg.showModal();

  const corps = dlg.querySelector('#corps-doublons');

  if (!groupes.length) {
    corps.innerHTML = `<div class="vide" style="padding:28px">
      <span class="vide-emoji">✨</span>
      <h3>Aucun doublon repéré</h3>
      <p>Les photos visuellement très proches apparaîtraient ici, regroupées.</p>
    </div>`;
  } else {
    corps.innerHTML = `<p class="doux">
      ${groupes.length} groupe${groupes.length > 1 ? 's' : ''} de photos très proches.
      Rien n'est supprimé automatiquement : tu choisis.
    </p>`;

    for (const groupe of groupes) {
      const bloc = document.createElement('div');
      bloc.className = 'carte';
      bloc.style.marginBottom = '14px';
      bloc.innerHTML = `<div class="doux" style="margin-bottom:10px">
        ${groupe.length} photos proches</div>`;

      const ligne = document.createElement('div');
      ligne.className = 'grille';
      ligne.style.gridTemplateColumns = 'repeat(auto-fill,minmax(110px,1fr))';

      for (const media of groupe) {
        const cellule = document.createElement('div');
        cellule.innerHTML = `
          <div class="vignette" style="cursor:default"><img alt=""></div>
          <div class="pale" style="margin-top:5px;text-align:center">
            ${poidsLisible(media.bytes)}<br>${media.width}×${media.height}
          </div>
          <button class="btn btn-petit btn-danger" style="width:100%;margin-top:5px">Supprimer</button>
        `;
        const img = cellule.querySelector('img');
        urlPour(media.thumbRef).then(u => { if (u) { img.src = u; img.classList.add('chargee'); } });
        cellule.querySelector('button').onclick = async () => {
          await supprimerAsset(media.id);
          cellule.remove();
          await recharger();
          notifier('Photo supprimée', 'succes');
        };
        ligne.appendChild(cellule);
      }

      bloc.appendChild(ligne);
      corps.appendChild(bloc);
    }
  }

  dlg.querySelectorAll('[data-fermer]').forEach(b => b.onclick = () => { dlg.close(); dlg.remove(); });
  dlg.addEventListener('cancel', () => dlg.remove());
}

/* ---------- Actions groupées ---------- */

async function categoriserSelection() {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `
    <div class="dialogue-entete"><h2>Catégoriser ${selection.size} photo(s)</h2></div>
    <div class="dialogue-corps">
      <div class="rangee" id="choix-categories" style="gap:6px"></div>
      <button class="btn btn-petit btn-fantome" id="btn-nouvelle-cat" style="margin-top:14px">
        + Nouvelle catégorie
      </button>
    </div>
    <div class="dialogue-pied"><button class="btn" data-fermer>Terminé</button></div>
  `;
  document.body.appendChild(dlg);
  dlg.showModal();

  const dessiner = () => {
    const boite = dlg.querySelector('#choix-categories');
    boite.innerHTML = '';
    for (const categorie of listeCategories) {
      const puce = document.createElement('button');
      puce.className = 'puce';
      puce.textContent = `${categorie.emoji} ${categorie.label}`;
      puce.onclick = async () => {
        for (const id of selection) await poserCategorie(id, categorie.id, 'user');
        notifier(`${selection.size} photo(s) dans « ${categorie.label} »`, 'succes');
        await recharger();
      };
      boite.appendChild(puce);
    }
  };
  dessiner();

  dlg.querySelector('#btn-nouvelle-cat').onclick = async () => {
    const nom = await demander('Nouvelle catégorie', '', 'Par exemple : Cape Town');
    if (!nom) return;
    listeCategories.push(await ajouterCategorie(nom));
    remplirFiltreCategories();
    dessiner();
  };

  dlg.querySelector('[data-fermer]').onclick = () => { dlg.close(); dlg.remove(); };
  dlg.addEventListener('cancel', () => dlg.remove());
}

async function ajouterACollection() {
  const existantes = await collections();
  const ids = [...selection];

  const dlg = document.createElement('dialog');
  dlg.innerHTML = `
    <div class="dialogue-entete"><h2>Ajouter à une collection</h2></div>
    <div class="dialogue-corps">
      <div class="pile" id="liste-collections"></div>
      <button class="btn btn-petit btn-fantome" id="btn-nouvelle-col" style="margin-top:14px">
        + Nouvelle collection
      </button>
    </div>
    <div class="dialogue-pied"><button class="btn" data-fermer>Fermer</button></div>
  `;
  document.body.appendChild(dlg);
  dlg.showModal();

  const liste = dlg.querySelector('#liste-collections');
  if (!existantes.length) {
    liste.innerHTML = '<p class="pale">Aucune collection pour l\'instant.</p>';
  }
  for (const collection of existantes) {
    const bouton = document.createElement('button');
    bouton.className = 'btn';
    bouton.style.justifyContent = 'space-between';
    bouton.innerHTML = `<span>${echapper(collection.name)}</span>
                        <span class="pale">${collection.assetIds.length}</span>`;
    bouton.onclick = async () => {
      // Une photo peut vivre dans plusieurs collections sans être dupliquée.
      const fusion = new Set([...collection.assetIds, ...ids]);
      collection.assetIds = [...fusion];
      collection.coverAssetId ||= collection.assetIds[0];
      collection.updatedAt = Date.now();
      await ecrire('collections', collection);
      notifier(`Ajoutées à « ${collection.name} »`, 'succes');
      dlg.close(); dlg.remove();
      viderSelection();
    };
    liste.appendChild(bouton);
  }

  dlg.querySelector('#btn-nouvelle-col').onclick = async () => {
    const nom = await demander('Nouvelle collection', '', 'Par exemple : Safari décembre');
    if (!nom) return;
    await creerCollection(nom, ids);
    notifier(`Collection « ${nom} » créée`, 'succes');
    dlg.close(); dlg.remove();
    viderSelection();
  };

  dlg.querySelector('[data-fermer]').onclick = () => { dlg.close(); dlg.remove(); };
  dlg.addEventListener('cancel', () => dlg.remove());
}

/* ---------- Résumé et filtres ---------- */

function majResume() {
  const photos = tousLesMedias.filter(m => m.type === 'image').length;
  const videos = tousLesMedias.length - photos;
  const jamais = tousLesMedias.filter(m => !(m.usedInPosts || []).length).length;

  $('#resume').textContent = tousLesMedias.length
    ? `${photos} photo${photos > 1 ? 's' : ''}${videos ? `, ${videos} vidéo${videos > 1 ? 's' : ''}` : ''} — ${jamais} jamais publiée${jamais > 1 ? 's' : ''}`
    : 'Aucun média pour l\'instant';

  $('#btn-reinit').hidden = !filtreActif();
}

function remplirFiltreCategories() {
  const select = $('#filtre-categorie');
  const valeur = select.value;
  select.innerHTML = '<option value="">Toutes les catégories</option>' +
    listeCategories.map(c => `<option value="${c.id}">${c.emoji} ${echapper(c.label)}</option>`).join('');
  select.value = valeur;
}

/* ---------- Événements ---------- */

function brancherEvenements() {
  $('#btn-importer').onclick = () => $('#fichiers').click();
  $('#fichiers').onchange = async e => {
    const fichiers = [...e.target.files];
    e.target.value = '';
    await importer(fichiers);
  };

  $('#btn-stop-import').onclick = () => { importInterrompu = true; };
  $('#btn-doublons').onclick = ouvrirDoublons;

  $('#recherche').oninput = differer(e => {
    filtres.recherche = e.target.value.trim();
    dessinerGrille(); majResume();
  });

  for (const [id, cle] of [
    ['#filtre-type', 'type'], ['#filtre-categorie', 'categorie'],
    ['#filtre-periode', 'periode'], ['#filtre-usage', 'usage']
  ]) {
    $(id).onchange = e => { filtres[cle] = e.target.value; dessinerGrille(); majResume(); };
  }

  $('#filtre-favoris').onclick = e => {
    filtres.favoris = !filtres.favoris;
    e.currentTarget.classList.toggle('actif', filtres.favoris);
    dessinerGrille(); majResume();
  };

  $('#btn-reinit').onclick = () => {
    Object.assign(filtres, { recherche: '', type: '', categorie: '', periode: '', usage: '', favoris: false });
    $('#recherche').value = '';
    ['#filtre-type', '#filtre-categorie', '#filtre-periode', '#filtre-usage']
      .forEach(s => { $(s).value = ''; });
    $('#filtre-favoris').classList.remove('actif');
    dessinerGrille(); majResume();
  };

  $('#sel-annuler').onclick = viderSelection;
  $('#sel-categorie').onclick = categoriserSelection;
  $('#sel-collection').onclick = ajouterACollection;
  $('#sel-studio').onclick = () => envoyerAuStudio([...selection]);

  $('#sel-favori').onclick = async () => {
    for (const id of selection) {
      const m = tousLesMedias.find(x => x.id === id);
      await majAsset(id, { favorite: !m?.favorite });
    }
    await recharger();
    notifier('Favoris mis à jour', 'succes');
  };

  $('#sel-supprimer').onclick = async () => {
    const ok = await confirmer(
      `Supprimer ${selection.size} photo(s) ?`,
      'Elles seront retirées de la photothèque et de tes collections. Cette action est définitive.',
      'Supprimer', true
    );
    if (!ok) return;
    for (const id of selection) await supprimerAsset(id);
    viderSelection();
    await recharger();
    notifier('Photos supprimées', 'succes');
  };

  // Glisser-déposer sur toute la page
  document.addEventListener('dragover', e => { e.preventDefault(); });
  document.addEventListener('drop', async e => {
    e.preventDefault();
    const fichiers = [...e.dataTransfer.files]
      .filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (fichiers.length) await importer(fichiers);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && selection.size) viderSelection();
    if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !e.target.matches('input,textarea')) {
      e.preventDefault();
      mediasFiltres().forEach(m => selection.add(m.id));
      majBarreSelection();
      dessinerEtatsSelection();
    }
  });
}
