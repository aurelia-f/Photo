/* =========================================================
   studio.js — Studio créatif
   Le studio modifie un objet « projet », jamais des pixels.
   Konva ne fait que dessiner cet objet. L'undo/redo, la
   sauvegarde et l'export ne sont que des opérations dessus.
   ========================================================= */

const $ = s => document.querySelector(s);

let p = null;                 // le projet courant
let indexSlide = 0;
let idSelectionne = null;
let scene, couche, transformateur;
let echelle = 1;

const historique = [];
let positionHistorique = -1;
const MAX_HISTORIQUE = 50;

const cacheImages = new Map(); // assetId -> HTMLImageElement (aperçu 1280 px)
let mediasDisponibles = [];
let minuteurSauvegarde = null;

/* ---------- Démarrage ---------- */

monterNavigation();
demarrer();

async function demarrer() {
  mediasDisponibles = await assets();

  const idDemande = new URLSearchParams(location.search).get('projet');
  if (idDemande) p = await projet(idDemande);

  if (!p) {
    p = nouveauProjet('Nouveau post');
    const selection = recupererSelectionStudio();
    if (selection.length) await remplirAvec(selection);
    await ecrire('projects', p);
    history.replaceState(null, '', `studio.html?projet=${p.id}`);
  }

  $('#titre-projet').value = p.title;
  $('#format').value = `${p.canvas.width}x${p.canvas.height}`;
  $('#mode-panorama').checked = !!p.panorama?.enabled;

  await prechargerImages();
  construireScene();
  enregistrerHistorique();
  toutRedessiner();
  brancherEvenements();
}

/** Place une sélection de photos : une par slide, cadrée pour remplir. */
async function remplirAvec(ids) {
  p.slides = [];
  for (const id of ids) {
    const media = mediasDisponibles.find(m => m.id === id);
    if (!media) continue;
    p.slides.push({
      id: 'sl-' + identifiant(),
      index: p.slides.length,
      background: media.dominantColors?.[0] || '#ffffff',
      elements: [elementImagePleinCadre(media)]
    });
  }
  if (!p.slides.length) {
    p.slides = [{ id: 'sl-' + identifiant(), index: 0, background: '#ffffff', elements: [] }];
  }
}

function elementImagePleinCadre(media) {
  const { width: L, height: H } = p.canvas;
  const ratio = Math.max(L / media.width, H / media.height);
  const largeur = media.width * ratio;
  const hauteur = media.height * ratio;
  return {
    id: 'el-' + identifiant(),
    kind: 'image',
    assetId: media.id,
    x: (L - largeur) / 2,
    y: (H - hauteur) / 2,
    width: largeur,
    height: hauteur,
    rotation: 0,
    opacity: 1,
    locked: false
  };
}

/* ---------- Images ---------- */

async function prechargerImages() {
  const ids = new Set();
  for (const slide of p.slides) {
    for (const el of slide.elements) if (el.kind === 'image') ids.add(el.assetId);
  }
  await Promise.all([...ids].map(chargerImage));
}

async function chargerImage(idAsset) {
  if (cacheImages.has(idAsset)) return cacheImages.get(idAsset);
  const media = await asset(idAsset);
  if (!media) return null;
  // Dans l'éditeur on travaille sur l'aperçu 1280 px, pas sur l'original :
  // c'est ce qui permet de tenir vingt photos dans une slide.
  const url = await urlPour(media.previewRef) || await urlPour(media.thumbRef);
  if (!url) return null;
  const img = await new Promise(r => {
    const i = new Image();
    i.onload = () => r(i);
    i.onerror = () => r(null);
    i.src = url;
  });
  if (img) cacheImages.set(idAsset, img);
  return img;
}

/* ---------- Scène Konva ---------- */

function dimensionsToile() {
  const panorama = p.panorama?.enabled;
  return {
    largeur: p.canvas.width * (panorama ? p.slides.length : 1),
    hauteur: p.canvas.height
  };
}

function construireScene() {
  const { largeur, hauteur } = dimensionsToile();
  const hote = $('#scene-hote');
  const dispoL = hote.clientWidth - 48;
  const dispoH = hote.clientHeight - 48;
  echelle = Math.min(dispoL / largeur, dispoH / hauteur, 1);

  if (scene) scene.destroy();

  scene = new Konva.Stage({
    container: 'scene',
    width: largeur * echelle,
    height: hauteur * echelle,
    scaleX: echelle,
    scaleY: echelle
  });

  couche = new Konva.Layer();
  scene.add(couche);

  transformateur = new Konva.Transformer({
    rotateAnchorOffset: 26,
    anchorSize: 9,
    anchorCornerRadius: 4,
    borderStroke: '#9775d8',
    anchorStroke: '#9775d8',
    anchorFill: '#ffffff',
    padding: 2
  });
  couche.add(transformateur);

  scene.on('click tap', e => {
    if (e.target === scene) selectionner(null);
  });
}

function slideCourante() {
  return p.slides[indexSlide];
}

/** En panorama, tous les éléments vivent dans la toile unique. */
function elementsAffiches() {
  return p.panorama?.enabled
    ? p.slides.flatMap(s => s.elements)
    : slideCourante().elements;
}

function trouverElement(id) {
  for (const slide of p.slides) {
    const el = slide.elements.find(e => e.id === id);
    if (el) return el;
  }
  return null;
}

/* ---------- Dessin ---------- */

function toutRedessiner() {
  dessinerScene();
  dessinerSlides();
  dessinerCalques();
  dessinerProprietes();
  $('#fond-couleur').value = slideCourante()?.background || '#ffffff';
}

function dessinerScene() {
  if (!couche) return;

  couche.getChildren(n => n !== transformateur).forEach(n => n.destroy());

  const { largeur, hauteur } = dimensionsToile();
  const panorama = p.panorama?.enabled;

  // Fonds
  if (panorama) {
    p.slides.forEach((slide, i) => {
      couche.add(new Konva.Rect({
        x: i * p.canvas.width, y: 0,
        width: p.canvas.width, height: hauteur,
        fill: slide.background || '#ffffff', listening: false
      }));
    });
  } else {
    couche.add(new Konva.Rect({
      x: 0, y: 0, width: largeur, height: hauteur,
      fill: slideCourante().background || '#ffffff', listening: false
    }));
  }

  // Éléments
  for (const el of elementsAffiches()) couche.add(creerNoeud(el));

  // Frontières de slides en panorama
  if (panorama) {
    for (let i = 1; i < p.slides.length; i++) {
      couche.add(new Konva.Line({
        points: [i * p.canvas.width, 0, i * p.canvas.width, hauteur],
        stroke: '#9775d8', strokeWidth: 2 / echelle,
        dash: [12 / echelle, 10 / echelle], listening: false
      }));
    }
  }

  transformateur.moveToTop();
  appliquerSelection();
  couche.draw();
}

function creerNoeud(el) {
  const commun = {
    id: el.id,
    x: el.x, y: el.y,
    rotation: el.rotation || 0,
    opacity: el.opacity ?? 1,
    draggable: !el.locked
  };

  let noeud;

  if (el.kind === 'image') {
    const img = cacheImages.get(el.assetId);
    noeud = new Konva.Image({
      ...commun, image: img, width: el.width, height: el.height
    });
    if (!img) {
      // Média devenu indisponible : on le signale, on ne casse pas le projet.
      noeud = new Konva.Rect({
        ...commun, width: el.width, height: el.height,
        fill: '#f5f1fb', stroke: '#cc7b86', strokeWidth: 3, dash: [10, 8]
      });
    }
  } else if (el.kind === 'text') {
    noeud = new Konva.Text({
      ...commun,
      text: el.text, fontSize: el.size, fontFamily: el.font,
      fill: el.color, align: el.align, width: el.width,
      lineHeight: el.lineHeight || 1.3, letterSpacing: el.letterSpacing || 0
    });
  } else {
    noeud = new Konva.Rect({
      ...commun, width: el.width, height: el.height,
      fill: el.color, cornerRadius: el.radius || 0
    });
  }

  noeud.on('click tap', () => selectionner(el.id));

  noeud.on('dragmove', () => magnetiser(noeud));

  noeud.on('dragend transformend', () => {
    const cible = trouverElement(el.id);
    if (!cible) return;
    cible.x = noeud.x();
    cible.y = noeud.y();
    cible.rotation = noeud.rotation();

    if (cible.kind === 'text') {
      cible.width = noeud.width() * noeud.scaleX();
      cible.size = Math.max(8, Math.round(cible.size * noeud.scaleY()));
    } else {
      cible.width = Math.max(10, noeud.width() * noeud.scaleX());
      cible.height = Math.max(10, noeud.height() * noeud.scaleY());
    }
    noeud.scaleX(1); noeud.scaleY(1);

    enregistrerHistorique();
    planifierSauvegarde();
    dessinerScene();
    dessinerProprietes();
  });

  if (el.kind === 'text') {
    noeud.on('dblclick dbltap', () => editerTexte(el.id));
  }

  return noeud;
}

/** Magnétisme : sous 6 px réels, on aligne sur les bords et le centre de la toile. */
function magnetiser(noeud) {
  const seuil = 6 / echelle;
  const { largeur, hauteur } = dimensionsToile();
  const l = noeud.width() * noeud.scaleX();
  const h = noeud.height() * noeud.scaleY();

  const cibleX = [0, (largeur - l) / 2, largeur - l];
  const cibleY = [0, (hauteur - h) / 2, hauteur - h];

  for (const c of cibleX) if (Math.abs(noeud.x() - c) < seuil) noeud.x(c);
  for (const c of cibleY) if (Math.abs(noeud.y() - c) < seuil) noeud.y(c);
}

function selectionner(id) {
  idSelectionne = id;
  appliquerSelection();
  dessinerCalques();
  dessinerProprietes();
}

function appliquerSelection() {
  if (!transformateur) return;
  const el = idSelectionne ? trouverElement(idSelectionne) : null;
  const noeud = idSelectionne ? couche.findOne('#' + idSelectionne) : null;
  transformateur.nodes(noeud && el && !el.locked ? [noeud] : []);
  couche.batchDraw();
}

/* ---------- Panneau des slides ---------- */

function dessinerSlides() {
  const boite = $('#liste-slides');
  boite.innerHTML = '';

  p.slides.forEach((slide, i) => {
    const vue = document.createElement('div');
    vue.className = 'diapo' + (i === indexSlide ? ' actif' : '');
    vue.style.background = slide.background || 'var(--surface-2)';

    const premiereImage = slide.elements.find(e => e.kind === 'image');
    if (premiereImage && cacheImages.has(premiereImage.assetId)) {
      const img = document.createElement('img');
      img.src = cacheImages.get(premiereImage.assetId).src;
      img.alt = '';
      vue.appendChild(img);
    } else if (!slide.elements.length) {
      vue.appendChild(document.createTextNode('vide'));
    }

    vue.insertAdjacentHTML('beforeend', `<span class="diapo-numero">${i + 1}</span>`);
    vue.onclick = () => { indexSlide = i; idSelectionne = null; toutRedessiner(); };

    // Réordonnancement par glisser-déposer
    vue.draggable = true;
    vue.ondragstart = e => e.dataTransfer.setData('text/plain', String(i));
    vue.ondragover = e => e.preventDefault();
    vue.ondrop = e => {
      e.preventDefault();
      const depuis = Number(e.dataTransfer.getData('text/plain'));
      if (depuis === i) return;
      const [deplacee] = p.slides.splice(depuis, 1);
      p.slides.splice(i, 0, deplacee);
      p.slides.forEach((s, n) => { s.index = n; });
      indexSlide = i;
      enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
    };

    boite.appendChild(vue);
  });

  const actions = document.createElement('div');
  actions.className = 'rangee';
  actions.style.gap = '4px';
  actions.innerHTML = `
    <button class="btn btn-petit btn-fantome" id="dup-slide" title="Dupliquer">⧉</button>
    <button class="btn btn-petit btn-fantome" id="sup-slide" title="Supprimer">🗑</button>
  `;
  boite.appendChild(actions);

  actions.querySelector('#dup-slide').onclick = () => {
    const copie = structuredClone(slideCourante());
    copie.id = 'sl-' + identifiant();
    copie.elements.forEach(e => { e.id = 'el-' + identifiant(); });
    p.slides.splice(indexSlide + 1, 0, copie);
    indexSlide++;
    enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
  };

  actions.querySelector('#sup-slide').onclick = async () => {
    if (p.slides.length === 1) return notifier('Un projet garde au moins une slide', 'erreur');
    const ok = await confirmer('Supprimer cette slide ?', 'Les photos restent dans ta photothèque.', 'Supprimer', true);
    if (!ok) return;
    p.slides.splice(indexSlide, 1);
    indexSlide = Math.max(0, indexSlide - 1);
    enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
  };
}

/* ---------- Calques ---------- */

function dessinerCalques() {
  const boite = $('#liste-calques');
  boite.innerHTML = '';

  const elements = elementsAffiches();
  if (!elements.length) {
    boite.innerHTML = '<p class="pale">Aucun élément sur cette slide.</p>';
    return;
  }

  [...elements].reverse().forEach(el => {
    const ligne = document.createElement('div');
    ligne.className = 'calque' + (el.id === idSelectionne ? ' actif' : '');

    const nom = el.kind === 'image' ? '🖼️ Photo'
      : el.kind === 'text' ? `🅣 ${el.text.slice(0, 16)}`
      : '⬛ Forme';

    ligne.innerHTML = `
      <span class="calque-nom">${echapper(nom)}</span>
      <button class="puce-fermer" data-verrou title="Verrouiller">${el.locked ? '🔒' : '🔓'}</button>
      <button class="puce-fermer" data-monter title="Monter">▲</button>
      <button class="puce-fermer" data-supprimer title="Supprimer">✕</button>
    `;

    ligne.onclick = e => { if (e.target === ligne || e.target.classList.contains('calque-nom')) selectionner(el.id); };

    ligne.querySelector('[data-verrou]').onclick = e => {
      e.stopPropagation();
      el.locked = !el.locked;
      enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
    };

    ligne.querySelector('[data-monter]').onclick = e => {
      e.stopPropagation();
      const tableau = p.panorama?.enabled
        ? p.slides.find(s => s.elements.includes(el)).elements
        : slideCourante().elements;
      const i = tableau.indexOf(el);
      if (i < tableau.length - 1) {
        tableau.splice(i, 1);
        tableau.splice(i + 1, 0, el);
        enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
      }
    };

    ligne.querySelector('[data-supprimer]').onclick = e => {
      e.stopPropagation();
      supprimerElement(el.id);
    };

    boite.appendChild(ligne);
  });
}

function supprimerElement(id) {
  for (const slide of p.slides) {
    const i = slide.elements.findIndex(e => e.id === id);
    if (i >= 0) { slide.elements.splice(i, 1); break; }
  }
  if (idSelectionne === id) idSelectionne = null;
  enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
}

/* ---------- Propriétés ---------- */

function dessinerProprietes() {
  const boite = $('#proprietes');
  const el = idSelectionne ? trouverElement(idSelectionne) : null;

  if (!el) { boite.innerHTML = ''; return; }

  let specifique = '';

  if (el.kind === 'text') {
    specifique = `
      <div class="reglage">
        <label class="etiquette">Texte</label>
        <textarea class="champ" id="pr-texte" rows="3">${echapper(el.text)}</textarea>
      </div>
      <div class="reglage">
        <label class="etiquette">Police</label>
        <select class="champ" id="pr-police">
          ${['Georgia', 'Segoe UI', 'Courier New', 'Trebuchet MS', 'Palatino Linotype']
            .map(f => `<option ${el.font === f ? 'selected' : ''}>${f}</option>`).join('')}
        </select>
      </div>
      <div class="reglage">
        <label class="etiquette">Taille — <span id="pr-taille-valeur">${el.size}</span> px</label>
        <input type="range" id="pr-taille" min="12" max="220" value="${el.size}">
      </div>
      <div class="reglage">
        <label class="etiquette">Interlignage — <span id="pr-inter-valeur">${el.lineHeight || 1.3}</span></label>
        <input type="range" id="pr-inter" min="0.9" max="2.2" step="0.05" value="${el.lineHeight || 1.3}">
      </div>
      <div class="reglage">
        <label class="etiquette">Interlettrage — <span id="pr-lettre-valeur">${el.letterSpacing || 0}</span></label>
        <input type="range" id="pr-lettre" min="-5" max="30" value="${el.letterSpacing || 0}">
      </div>
      <div class="reglage">
        <label class="etiquette">Alignement</label>
        <select class="champ" id="pr-align">
          <option value="left" ${el.align === 'left' ? 'selected' : ''}>Gauche</option>
          <option value="center" ${el.align === 'center' ? 'selected' : ''}>Centré</option>
          <option value="right" ${el.align === 'right' ? 'selected' : ''}>Droite</option>
        </select>
      </div>
      <div class="reglage">
        <label class="etiquette">Couleur</label>
        <input type="color" id="pr-couleur" value="${el.color}">
      </div>`;
  }

  if (el.kind === 'shape') {
    specifique = `
      <div class="reglage">
        <label class="etiquette">Couleur</label>
        <input type="color" id="pr-couleur" value="${el.color}">
      </div>
      <div class="reglage">
        <label class="etiquette">Arrondi — <span id="pr-radius-valeur">${el.radius || 0}</span> px</label>
        <input type="range" id="pr-radius" min="0" max="300" value="${el.radius || 0}">
      </div>`;
  }

  if (el.kind === 'image') {
    specifique = `
      <div class="reglage">
        <button class="btn btn-petit" style="width:100%" id="pr-remplir">Remplir la slide</button>
      </div>`;
  }

  boite.innerHTML = `
    <div class="reglage">
      <label class="etiquette">Opacité — <span id="pr-opacite-valeur">${Math.round((el.opacity ?? 1) * 100)}</span> %</label>
      <input type="range" id="pr-opacite" min="0" max="100" value="${Math.round((el.opacity ?? 1) * 100)}">
    </div>
    ${specifique}
    <button class="btn btn-petit btn-danger" style="width:100%" id="pr-supprimer">Supprimer l'élément</button>
  `;

  const appliquer = (modifications, redessiner = true) => {
    Object.assign(el, modifications);
    planifierSauvegarde();
    if (redessiner) dessinerScene();
  };

  $('#pr-opacite').oninput = e => {
    $('#pr-opacite-valeur').textContent = e.target.value;
    appliquer({ opacity: e.target.value / 100 });
  };
  $('#pr-opacite').onchange = enregistrerHistorique;

  $('#pr-supprimer').onclick = () => supprimerElement(el.id);

  if (el.kind === 'text') {
    $('#pr-texte').oninput = e => appliquer({ text: e.target.value });
    $('#pr-texte').onchange = () => { enregistrerHistorique(); dessinerCalques(); };
    $('#pr-police').onchange = e => { appliquer({ font: e.target.value }); enregistrerHistorique(); };
    $('#pr-align').onchange = e => { appliquer({ align: e.target.value }); enregistrerHistorique(); };
    $('#pr-couleur').oninput = e => appliquer({ color: e.target.value });
    $('#pr-taille').oninput = e => {
      $('#pr-taille-valeur').textContent = e.target.value;
      appliquer({ size: Number(e.target.value) });
    };
    $('#pr-inter').oninput = e => {
      $('#pr-inter-valeur').textContent = e.target.value;
      appliquer({ lineHeight: Number(e.target.value) });
    };
    $('#pr-lettre').oninput = e => {
      $('#pr-lettre-valeur').textContent = e.target.value;
      appliquer({ letterSpacing: Number(e.target.value) });
    };
  }

  if (el.kind === 'shape') {
    $('#pr-couleur').oninput = e => appliquer({ color: e.target.value });
    $('#pr-radius').oninput = e => {
      $('#pr-radius-valeur').textContent = e.target.value;
      appliquer({ radius: Number(e.target.value) });
    };
  }

  if (el.kind === 'image') {
    $('#pr-remplir').onclick = async () => {
      const media = await asset(el.assetId);
      if (!media) return;
      const remplace = elementImagePleinCadre(media);
      appliquer({ x: remplace.x, y: remplace.y, width: remplace.width, height: remplace.height, rotation: 0 });
      enregistrerHistorique();
    };
  }
}

function editerTexte(id) {
  const el = trouverElement(id);
  if (!el) return;
  const valeur = prompt('Texte', el.text);
  if (valeur === null) return;
  el.text = valeur;
  enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
}

/* ---------- Ajout d'éléments ---------- */

async function ouvrirChoixPhotos() {
  const dlg = document.createElement('dialog');
  dlg.style.maxWidth = 'min(820px, calc(100vw - 32px))';
  dlg.innerHTML = `
    <div class="dialogue-entete">
      <h2>Ajouter des photos</h2>
      <button class="btn btn-icone btn-fantome" data-fermer aria-label="Fermer">✕</button>
    </div>
    <div class="dialogue-corps">
      <div class="rangee" style="margin-bottom:14px">
        <label class="rangee" style="gap:6px;font-size:13.5px;cursor:pointer">
          <input type="checkbox" id="une-par-slide" checked> Une photo par slide
        </label>
        <span class="espace"></span>
        <span class="pale" id="compte-choix">0 sélectionnée</span>
      </div>
      <div class="grille" id="choix" style="max-height:50vh;overflow:auto;
           grid-template-columns:repeat(auto-fill,minmax(104px,1fr))"></div>
    </div>
    <div class="dialogue-pied">
      <button class="btn" data-fermer>Annuler</button>
      <button class="btn btn-primaire" data-valider>Ajouter</button>
    </div>
  `;
  document.body.appendChild(dlg);
  dlg.showModal();

  const choisies = [];
  const boite = dlg.querySelector('#choix');

  if (!mediasDisponibles.length) {
    boite.innerHTML = `<p class="pale">Ta photothèque est vide.
      <a href="index.html">Importe des photos</a> d'abord.</p>`;
  }

  for (const media of mediasDisponibles) {
    const vignette = document.createElement('div');
    vignette.className = 'vignette';
    const img = document.createElement('img');
    img.alt = '';
    urlPour(media.thumbRef).then(u => { if (u) { img.src = u; img.classList.add('chargee'); } });
    vignette.appendChild(img);
    vignette.insertAdjacentHTML('beforeend', '<span class="vignette-coche">✓</span>');
    vignette.onclick = () => {
      const i = choisies.indexOf(media.id);
      i >= 0 ? choisies.splice(i, 1) : choisies.push(media.id);
      vignette.classList.toggle('selection', i < 0);
      dlg.querySelector('#compte-choix').textContent =
        `${choisies.length} sélectionnée${choisies.length > 1 ? 's' : ''}`;
    };
    boite.appendChild(vignette);
  }

  dlg.querySelector('[data-valider]').onclick = async () => {
    const unePourChaque = dlg.querySelector('#une-par-slide').checked;
    dlg.close(); dlg.remove();
    if (!choisies.length) return;

    for (const id of choisies) await chargerImage(id);

    if (unePourChaque) {
      for (const id of choisies) {
        const media = mediasDisponibles.find(m => m.id === id);
        const estPremiere = choisies.indexOf(id) === 0 && !slideCourante().elements.length;
        const cible = estPremiere ? slideCourante() : {
          id: 'sl-' + identifiant(),
          index: p.slides.length,
          background: media.dominantColors?.[0] || '#ffffff',
          elements: []
        };
        cible.elements.push(elementImagePleinCadre(media));
        if (!estPremiere) p.slides.push(cible);
      }
    } else {
      // Plusieurs photos sur une slide : mise en page en grille automatique.
      disposerEnGrille(choisies);
    }

    enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
    notifier(`${choisies.length} photo(s) ajoutée(s)`, 'succes');
  };

  dlg.querySelectorAll('[data-fermer]').forEach(b => b.onclick = () => { dlg.close(); dlg.remove(); });
  dlg.addEventListener('cancel', () => dlg.remove());
}

/** Beaucoup de photos sur peu de slides : grille carrée automatique. */
function disposerEnGrille(ids) {
  const slide = slideCourante();
  const colonnes = Math.ceil(Math.sqrt(ids.length));
  const lignes = Math.ceil(ids.length / colonnes);
  const marge = 16;
  const largeurCase = (p.canvas.width - marge * (colonnes + 1)) / colonnes;
  const hauteurCase = (p.canvas.height - marge * (lignes + 1)) / lignes;

  ids.forEach((id, i) => {
    const media = mediasDisponibles.find(m => m.id === id);
    if (!media) return;
    const colonne = i % colonnes;
    const ligne = Math.floor(i / colonnes);
    const ratio = Math.max(largeurCase / media.width, hauteurCase / media.height);

    slide.elements.push({
      id: 'el-' + identifiant(),
      kind: 'image',
      assetId: id,
      x: marge + colonne * (largeurCase + marge),
      y: marge + ligne * (hauteurCase + marge),
      width: Math.min(media.width * ratio, largeurCase * 1.6),
      height: Math.min(media.height * ratio, hauteurCase * 1.6),
      rotation: 0, opacity: 1, locked: false
    });
  });
}

function ajouterTexte() {
  slideCourante().elements.push({
    id: 'el-' + identifiant(),
    kind: 'text',
    text: 'Ton texte ici',
    x: p.canvas.width * 0.1,
    y: p.canvas.height * 0.42,
    width: p.canvas.width * 0.8,
    height: 100,
    size: 64,
    font: 'Georgia',
    color: '#3a3350',
    align: 'center',
    lineHeight: 1.3,
    letterSpacing: 0,
    rotation: 0, opacity: 1, locked: false
  });
  enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
}

function ajouterForme() {
  slideCourante().elements.push({
    id: 'el-' + identifiant(),
    kind: 'shape',
    x: p.canvas.width * 0.2,
    y: p.canvas.height * 0.35,
    width: p.canvas.width * 0.6,
    height: p.canvas.height * 0.3,
    color: '#ece7fa',
    radius: 24,
    rotation: 0, opacity: 1, locked: false
  });
  enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
}

/* ---------- Modèles ---------- */

const MODELES = {
  minimaliste: { fond: '#fdfbf8', texte: null },
  photojournal: { fond: '#ffffff', texte: { contenu: 'Jour 1', taille: 52, align: 'left', y: 0.06 } },
  voyage:      { fond: '#e4efe5', texte: { contenu: 'Carnet de voyage', taille: 68, align: 'center', y: 0.08 } },
  esthetique:  { fond: '#f8e9f1', texte: null },
  tenues:      { fond: '#ece7fa', texte: { contenu: 'Look du jour', taille: 60, align: 'center', y: 0.84 } },
  souvenirs:   { fond: '#fbf0dd', texte: { contenu: 'Souvenirs', taille: 72, align: 'center', y: 0.08 } },
  collage:     { fond: '#ffffff', texte: null, collage: true },
  panorama:    { fond: '#ffffff', texte: null, panorama: true }
};

function appliquerModele(nom) {
  const modele = MODELES[nom];
  if (!modele) return;

  if (modele.panorama) {
    p.panorama = { enabled: true, spanSlides: p.slides.map((_, i) => i) };
    $('#mode-panorama').checked = true;
  }

  for (const slide of p.slides) {
    slide.background = modele.fond;
    slide.elements = slide.elements.filter(e => e.kind === 'image');
  }

  if (modele.texte) {
    const t = modele.texte;
    slideCourante().elements.push({
      id: 'el-' + identifiant(),
      kind: 'text',
      text: t.contenu,
      x: p.canvas.width * 0.08,
      y: p.canvas.height * t.y,
      width: p.canvas.width * 0.84,
      height: 100,
      size: t.taille,
      font: 'Georgia',
      color: '#3a3350',
      align: t.align,
      lineHeight: 1.25,
      letterSpacing: 1,
      rotation: 0, opacity: 1, locked: false
    });
  }

  if (modele.collage) {
    const ids = slideCourante().elements.filter(e => e.kind === 'image').map(e => e.assetId);
    slideCourante().elements = [];
    disposerEnGrille(ids);
  }

  construireScene();
  enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
  notifier('Modèle appliqué — tu peux tout ajuster', 'succes');
}

/* ---------- Historique ---------- */

function enregistrerHistorique() {
  historique.splice(positionHistorique + 1);
  historique.push(JSON.stringify({ slides: p.slides, canvas: p.canvas, panorama: p.panorama }));
  if (historique.length > MAX_HISTORIQUE) historique.shift();
  positionHistorique = historique.length - 1;
  majBoutonsHistorique();
}

function restaurer(delta) {
  const cible = positionHistorique + delta;
  if (cible < 0 || cible >= historique.length) return;
  positionHistorique = cible;
  const etat = JSON.parse(historique[cible]);
  p.slides = etat.slides;
  p.canvas = etat.canvas;
  p.panorama = etat.panorama;
  indexSlide = Math.min(indexSlide, p.slides.length - 1);
  idSelectionne = null;
  majBoutonsHistorique();
  prechargerImages().then(() => { construireScene(); toutRedessiner(); });
  planifierSauvegarde();
}

function majBoutonsHistorique() {
  $('#btn-annuler').disabled = positionHistorique <= 0;
  $('#btn-retablir').disabled = positionHistorique >= historique.length - 1;
}

/* ---------- Sauvegarde automatique ---------- */

function planifierSauvegarde() {
  $('#etat-sauvegarde').textContent = 'Modifications non enregistrées';
  clearTimeout(minuteurSauvegarde);
  minuteurSauvegarde = setTimeout(async () => {
    $('#etat-sauvegarde').textContent = 'Enregistrement…';
    if (p.status === 'to-prepare') p.status = 'in-progress';
    await sauverProjet(p);
    $('#etat-sauvegarde').textContent = 'Enregistré';
  }, 800);
}

/* ---------- Export ---------- */

/**
 * Rend une slide à sa taille réelle, à partir des octets originaux.
 * Chaque scène est détruite après usage : la mémoire reste plate,
 * quel que soit le nombre de slides.
 */
async function rendreSlide(i, qualite, format) {
  const panorama = p.panorama?.enabled;
  const { width: L, height: H } = p.canvas;

  const hote = document.createElement('div');
  hote.style.cssText = 'position:fixed;left:-99999px;top:0';
  document.body.appendChild(hote);

  const sceneExport = new Konva.Stage({
    container: hote,
    width: panorama ? L * p.slides.length : L,
    height: H
  });
  const coucheExport = new Konva.Layer();
  sceneExport.add(coucheExport);

  const slides = panorama ? p.slides : [p.slides[i]];

  slides.forEach((slide, n) => {
    coucheExport.add(new Konva.Rect({
      x: panorama ? n * L : 0, y: 0, width: L, height: H,
      fill: slide.background || '#ffffff'
    }));
  });

  for (const slide of slides) {
    for (const el of slide.elements) {
      if (el.kind === 'image') {
        const media = await asset(el.assetId);
        const blob = media ? await prendre(media.fileRef) : null;
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        const img = await new Promise(r => {
          const image = new Image();
          image.onload = () => r(image);
          image.onerror = () => r(null);
          image.src = url;
        });
        if (img) {
          coucheExport.add(new Konva.Image({
            image: img, x: el.x, y: el.y,
            width: el.width, height: el.height,
            rotation: el.rotation || 0, opacity: el.opacity ?? 1
          }));
        }
        URL.revokeObjectURL(url);
      } else if (el.kind === 'text') {
        coucheExport.add(new Konva.Text({
          text: el.text, x: el.x, y: el.y, width: el.width,
          fontSize: el.size, fontFamily: el.font, fill: el.color,
          align: el.align, lineHeight: el.lineHeight || 1.3,
          letterSpacing: el.letterSpacing || 0,
          rotation: el.rotation || 0, opacity: el.opacity ?? 1
        }));
      } else {
        coucheExport.add(new Konva.Rect({
          x: el.x, y: el.y, width: el.width, height: el.height,
          fill: el.color, cornerRadius: el.radius || 0,
          rotation: el.rotation || 0, opacity: el.opacity ?? 1
        }));
      }
    }
  }

  coucheExport.draw();

  // En panorama, on découpe la grande toile : les raccords sont exacts au pixel.
  const canvas = sceneExport.toCanvas(
    panorama ? { x: i * L, y: 0, width: L, height: H } : undefined
  );

  const blob = await new Promise(r =>
    canvas.toBlob(r, format === 'png' ? 'image/png' : 'image/jpeg', qualite)
  );

  sceneExport.destroy();
  hote.remove();
  return blob;
}

async function ouvrirExport() {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `
    <div class="dialogue-entete">
      <h2>Exporter le carrousel</h2>
      <button class="btn btn-icone btn-fantome" data-fermer aria-label="Fermer">✕</button>
    </div>
    <div class="dialogue-corps">
      <p class="doux">
        ${p.slides.length} slide${p.slides.length > 1 ? 's' : ''}
        en ${p.canvas.width} × ${p.canvas.height} px.
        Les métadonnées EXIF, géolocalisation comprise, ne sont jamais reportées
        dans les images exportées.
      </p>

      <div class="reglage">
        <label class="etiquette">Format</label>
        <select class="champ" id="ex-format">
          <option value="jpeg">JPEG — plus léger, idéal pour Instagram</option>
          <option value="png">PNG — sans perte, fichiers plus gros</option>
        </select>
      </div>

      <div class="reglage" id="bloc-qualite">
        <label class="etiquette">Qualité — <span id="ex-qualite-valeur">92</span> %</label>
        <input type="range" id="ex-qualite" min="60" max="100" value="92">
      </div>

      <div class="reglage">
        <label class="etiquette">Portée</label>
        <select class="champ" id="ex-portee">
          <option value="toutes">Toutes les slides, dans l'ordre (ZIP)</option>
          <option value="courante">Seulement la slide affichée</option>
        </select>
      </div>

      <div class="encart">
        Pense à exporter, puis à publier toi-même sur Instagram.
        Reviens ensuite dans My Posts pour confirmer la publication.
      </div>
    </div>
    <div class="dialogue-pied">
      <button class="btn" data-fermer>Annuler</button>
      <button class="btn btn-primaire" data-exporter>Exporter</button>
    </div>
  `;
  document.body.appendChild(dlg);
  dlg.showModal();

  dlg.querySelector('#ex-qualite').oninput = e =>
    dlg.querySelector('#ex-qualite-valeur').textContent = e.target.value;

  dlg.querySelector('#ex-format').onchange = e =>
    dlg.querySelector('#bloc-qualite').hidden = e.target.value === 'png';

  dlg.querySelector('[data-exporter]').onclick = async () => {
    const format = dlg.querySelector('#ex-format').value;
    const qualite = Number(dlg.querySelector('#ex-qualite').value) / 100;
    const toutes = dlg.querySelector('#ex-portee').value === 'toutes';
    const bouton = dlg.querySelector('[data-exporter]');

    bouton.disabled = true;
    bouton.textContent = 'Rendu…';

    try {
      const extension = format === 'png' ? 'png' : 'jpg';

      if (!toutes) {
        const blob = await rendreSlide(indexSlide, qualite, format);
        telecharger(blob, `${nomFichier(p.title)}-${String(indexSlide + 1).padStart(2, '0')}.${extension}`);
      } else {
        const fichiers = {};
        for (let i = 0; i < p.slides.length; i++) {
          bouton.textContent = `Rendu ${i + 1}/${p.slides.length}…`;
          const blob = await rendreSlide(i, qualite, format);
          // Numérotation à deux chiffres : l'ordre est préservé au téléversement.
          fichiers[`${String(i + 1).padStart(2, '0')}.${extension}`] =
            new Uint8Array(await blob.arrayBuffer());
        }
        const zip = fflate.zipSync(fichiers, { level: 0 }); // images déjà compressées
        telecharger(new Blob([zip], { type: 'application/zip' }), `${nomFichier(p.title)}.zip`);
      }

      if (p.status !== 'published') {
        p.status = 'ready';
        await sauverProjet(p);
      }

      dlg.close(); dlg.remove();
      notifier('Export terminé — à toi de publier sur Instagram', 'succes');
    } catch (erreur) {
      console.error(erreur);
      notifier("L'export a échoué : " + erreur.message, 'erreur');
      bouton.disabled = false;
      bouton.textContent = 'Exporter';
    }
  };

  dlg.querySelectorAll('[data-fermer]').forEach(b => b.onclick = () => { dlg.close(); dlg.remove(); });
  dlg.addEventListener('cancel', () => dlg.remove());
}

function nomFichier(titre) {
  return (titre || 'post').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'post';
}

function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Aperçu ---------- */

async function ouvrirApercu() {
  const dlg = document.createElement('dialog');
  dlg.style.maxWidth = 'min(520px, calc(100vw - 32px))';
  dlg.innerHTML = `
    <div class="dialogue-entete">
      <h2>Aperçu du carrousel</h2>
      <button class="btn btn-icone btn-fantome" data-fermer aria-label="Fermer">✕</button>
    </div>
    <div class="dialogue-corps">
      <div id="apercu-image" style="border-radius:12px;overflow:hidden;background:var(--surface-2);
           display:grid;place-items:center;min-height:300px">
        <span class="pale">Rendu en cours…</span>
      </div>
      <div class="rangee" style="justify-content:center;margin-top:14px">
        <button class="btn btn-petit" data-prec>←</button>
        <span id="apercu-pos" class="doux"></span>
        <button class="btn btn-petit" data-suiv>→</button>
      </div>
    </div>
  `;
  document.body.appendChild(dlg);
  dlg.showModal();

  let i = indexSlide;

  const afficher = async () => {
    dlg.querySelector('#apercu-pos').textContent = `${i + 1} / ${p.slides.length}`;
    const blob = await rendreSlide(i, 0.8, 'jpeg');
    const url = URL.createObjectURL(blob);
    dlg.querySelector('#apercu-image').innerHTML =
      `<img src="${url}" alt="" style="max-width:100%;max-height:56vh;display:block">`;
  };

  dlg.querySelector('[data-prec]').onclick = () => { i = (i - 1 + p.slides.length) % p.slides.length; afficher(); };
  dlg.querySelector('[data-suiv]').onclick = () => { i = (i + 1) % p.slides.length; afficher(); };
  dlg.querySelector('[data-fermer]').onclick = () => { dlg.close(); dlg.remove(); };
  dlg.addEventListener('cancel', () => dlg.remove());

  await afficher();
}

/* ---------- Événements ---------- */

function brancherEvenements() {
  $('#btn-photos').onclick = ouvrirChoixPhotos;
  $('#btn-texte').onclick = ajouterTexte;
  $('#btn-forme').onclick = ajouterForme;
  $('#btn-annuler').onclick = () => restaurer(-1);
  $('#btn-retablir').onclick = () => restaurer(1);
  $('#btn-apercu').onclick = ouvrirApercu;
  $('#btn-exporter').onclick = ouvrirExport;

  $('#btn-ajouter-slide').onclick = () => {
    p.slides.push({
      id: 'sl-' + identifiant(),
      index: p.slides.length,
      background: '#ffffff',
      elements: []
    });
    indexSlide = p.slides.length - 1;
    if (p.panorama?.enabled) construireScene();
    enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
  };

  $('#titre-projet').oninput = e => { p.title = e.target.value; planifierSauvegarde(); };

  $('#format').onchange = e => {
    const [L, H] = e.target.value.split('x').map(Number);
    p.canvas = { width: L, height: H };
    construireScene();
    enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
  };

  $('#mode-panorama').onchange = e => {
    p.panorama = e.target.checked
      ? { enabled: true, spanSlides: p.slides.map((_, i) => i) }
      : null;
    idSelectionne = null;
    construireScene();
    enregistrerHistorique(); planifierSauvegarde(); toutRedessiner();
  };

  $('#fond-couleur').oninput = e => {
    slideCourante().background = e.target.value;
    planifierSauvegarde();
    dessinerScene();
    dessinerSlides();
  };
  $('#fond-couleur').onchange = enregistrerHistorique;

  $('#btn-fond-palette').onclick = async () => {
    const premiere = slideCourante().elements.find(el => el.kind === 'image');
    if (!premiere) return notifier('Ajoute d\'abord une photo sur cette slide', 'erreur');
    const media = await asset(premiere.assetId);
    const couleur = media?.dominantColors?.[0];
    if (!couleur) return;
    slideCourante().background = couleur;
    $('#fond-couleur').value = couleur;
    enregistrerHistorique(); planifierSauvegarde();
    dessinerScene(); dessinerSlides();
  };

  $('#templates').onchange = e => {
    if (!e.target.value) return;
    appliquerModele(e.target.value);
    e.target.value = '';
  };

  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select')) return;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      restaurer(e.shiftKey ? 1 : -1);
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && idSelectionne) {
      e.preventDefault();
      supprimerElement(idSelectionne);
    }
    if (e.key === 'Escape') selectionner(null);
  });

  let minuteurRedimension;
  window.addEventListener('resize', () => {
    clearTimeout(minuteurRedimension);
    minuteurRedimension = setTimeout(() => { construireScene(); toutRedessiner(); }, 180);
  });

  window.addEventListener('beforeunload', e => {
    if ($('#etat-sauvegarde').textContent !== 'Enregistré') {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
