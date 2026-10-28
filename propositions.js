/* =========================================================
   propositions.js — Onglet « Ma proposition de post »
   Moteur local : aucun appel réseau, aucun modèle à charger.
   Il combine dates, catégories, couleurs, favoris et historique.
   ========================================================= */

const $ = s => document.querySelector(s);

let tousLesMedias = [];
let listeCategories = [];
let propositions = [];
const dejaMontrees = new Set();   // évite de reproposer la même chose dans la session

monterNavigation();
demarrer();

async function demarrer() {
  tousLesMedias = await assets();
  listeCategories = await categories();

  if (tousLesMedias.length < 3) {
    $('#vide').hidden = false;
    return;
  }

  $('#btn-regenerer').onclick = () => { construire(); dessiner(); };
  $('#nombre-photos').onchange = () => { construire(); dessiner(); };

  construire();
  dessiner();
}

/* ---------- Construction des idées ---------- */

function construire() {
  const combien = Number($('#nombre-photos').value);
  const candidates = [
    parPeriode(combien),
    parCategorie(combien),
    parCouleur(combien),
    favorisInedits(combien),
    recentes(combien)
  ].filter(Boolean);

  // Une proposition déjà vue dans cette session passe en fin de file.
  propositions = candidates
    .map(p => ({ ...p, vue: dejaMontrees.has(p.signature) }))
    .sort((a, b) => (a.vue === b.vue ? b.score - a.score : a.vue ? 1 : -1))
    .slice(0, 4);

  for (const p of propositions) dejaMontrees.add(p.signature);
}

/**
 * Score d'une photo. Les photos déjà publiées sont fortement pénalisées :
 * c'est le principal garde-fou contre les propositions répétitives.
 */
function score(media) {
  let valeur = 1;
  if (media.favorite) valeur += 1.6;
  if ((media.usedInPosts || []).length) valeur -= 2.2;
  if (media.type === 'video') valeur -= 0.6;
  const age = (Date.now() - (media.capturedAt || media.importedAt)) / 86400000;
  if (age < 30) valeur += 0.5;
  return valeur + Math.random() * 0.45;   // un peu de variété d'une fois à l'autre
}

const trier = liste => [...liste].sort((a, b) => score(b) - score(a));

function parPeriode(combien) {
  // Regroupe les photos séparées de moins de trois jours : souvent un même voyage.
  const datees = tousLesMedias
    .filter(m => m.capturedAt)
    .sort((a, b) => a.capturedAt - b.capturedAt);
  if (datees.length < 4) return null;

  const grappes = [];
  let courante = [datees[0]];

  for (let i = 1; i < datees.length; i++) {
    const ecart = datees[i].capturedAt - datees[i - 1].capturedAt;
    if (ecart < 3 * 86400000) {
      courante.push(datees[i]);
    } else {
      grappes.push(courante);
      courante = [datees[i]];
    }
  }
  grappes.push(courante);

  const meilleure = grappes
    .filter(g => g.length >= 3)
    .sort((a, b) => b.length - a.length)[0];
  if (!meilleure) return null;

  // Ordre chronologique : c'est ce qui raconte un voyage.
  const choisies = trier(meilleure).slice(0, combien)
    .sort((a, b) => a.capturedAt - b.capturedAt);

  const debut = dateLisible(meilleure[0].capturedAt);
  const fin = dateLisible(meilleure.at(-1).capturedAt);

  return {
    signature: 'periode-' + meilleure[0].id,
    titre: debut === fin ? `Ta journée du ${debut}` : 'Carrousel de ton dernier séjour',
    explication: `Ces ${choisies.length} photos ont été prises entre le ${debut} et le ${fin}. Elles semblent appartenir au même moment, ce qui donne un carrousel cohérent dans l'ordre chronologique.`,
    medias: choisies,
    format: '4:5',
    composition: 'Un carrousel chronologique, une photo par slide.',
    score: meilleure.length + 2
  };
}

function parCategorie(combien) {
  const comptes = new Map();
  for (const m of tousLesMedias) {
    for (const c of (m.categories || [])) {
      comptes.set(c.id, (comptes.get(c.id) || 0) + 1);
    }
  }

  const meilleure = [...comptes.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])[0];
  if (!meilleure) return null;

  const categorie = listeCategories.find(c => c.id === meilleure[0]);
  if (!categorie) return null;

  const choisies = trier(
    tousLesMedias.filter(m => (m.categories || []).some(c => c.id === categorie.id))
  ).slice(0, combien);

  return {
    signature: 'cat-' + categorie.id,
    titre: `${categorie.emoji} Sélection « ${categorie.label} »`,
    explication: `Tu as ${meilleure[1]} photos dans cette catégorie. J'ai retenu celles que tu n'as pas encore publiées, en mettant tes favoris en premier.`,
    medias: choisies,
    format: categorie.id === 'tenues' ? '4:5' : '1:1',
    composition: 'Une photo par slide, ou deux par slide pour un rythme plus serré.',
    score: meilleure[1]
  };
}

function parCouleur(combien) {
  const parAmbiance = new Map();
  for (const m of tousLesMedias) {
    const cle = ambiance(m.dominantColors);
    if (!parAmbiance.has(cle)) parAmbiance.set(cle, []);
    parAmbiance.get(cle).push(m);
  }

  const meilleure = [...parAmbiance.entries()]
    .filter(([cle, liste]) => cle !== 'neutre' && liste.length >= 4)
    .sort((a, b) => b[1].length - a[1].length)[0];
  if (!meilleure) return null;

  const [nomAmbiance, liste] = meilleure;
  // Ordre par teinte : la transition d'une slide à l'autre reste douce.
  const choisies = trier(liste).slice(0, combien).sort((a, b) =>
    (a.dominantColors?.[0] || '').localeCompare(b.dominantColors?.[0] || '')
  );

  return {
    signature: 'couleur-' + nomAmbiance,
    titre: `Sélection esthétique — ambiance ${nomAmbiance}`,
    explication: `Ces photos partagent une dominante ${nomAmbiance}. Mises côte à côte dans cet ordre, les transitions de couleur restent douces d'une slide à l'autre.`,
    medias: choisies,
    format: '1:1',
    composition: 'Idéal en composition panoramique continue.',
    score: liste.length
  };
}

function favorisInedits(combien) {
  const liste = tousLesMedias.filter(m => m.favorite && !(m.usedInPosts || []).length);
  if (liste.length < 3) return null;

  return {
    signature: 'favoris-inedits',
    titre: 'Tes favoris jamais publiés',
    explication: `${liste.length} photos que tu as mises en favori et qui ne sont jamais sorties. Celles-là méritent sans doute un post.`,
    medias: trier(liste).slice(0, combien),
    format: '4:5',
    composition: 'Une photo par slide, sans texte.',
    score: liste.length + 1
  };
}

function recentes(combien) {
  const liste = tousLesMedias
    .filter(m => !(m.usedInPosts || []).length)
    .sort((a, b) => b.importedAt - a.importedAt)
    .slice(0, combien * 2);
  if (liste.length < 3) return null;

  return {
    signature: 'recentes-' + (liste[0]?.id || ''),
    titre: 'Tes imports récents',
    explication: 'Les photos arrivées en dernier dans ta photothèque, sans celles déjà publiées.',
    medias: trier(liste).slice(0, combien),
    format: '4:5',
    composition: 'Un carrousel simple pour écouler les nouveautés.',
    score: 2
  };
}

/* ---------- Affichage ---------- */

function dessiner() {
  const boite = $('#propositions');
  boite.innerHTML = '';

  if (!propositions.length) {
    boite.innerHTML = `<div class="vide">
      <span class="vide-emoji">🤔</span>
      <h3>Rien de convaincant pour l'instant</h3>
      <p>Catégorise quelques photos ou mets-en en favori : les idées deviendront plus pertinentes.</p>
    </div>`;
    return;
  }

  for (const proposition of propositions) boite.appendChild(carte(proposition));
}

function carte(proposition) {
  const bloc = document.createElement('article');
  bloc.className = 'carte';

  bloc.innerHTML = `
    <div class="rangee" style="justify-content:space-between;align-items:flex-start">
      <div>
        <h2>${echapper(proposition.titre)}</h2>
        <p class="doux" style="margin-top:6px;max-width:62ch">${echapper(proposition.explication)}</p>
      </div>
      <span class="badge badge-en-cours">${proposition.medias.length} photos · ${proposition.format}</span>
    </div>
    <div class="grille" style="margin:16px 0;grid-template-columns:repeat(auto-fill,minmax(96px,1fr))"></div>
    <p class="pale" style="margin-bottom:14px">${echapper(proposition.composition)}</p>
    <div class="rangee"></div>
  `;

  const grille = bloc.querySelector('.grille');
  const retirees = new Set();

  proposition.medias.forEach((media, position) => {
    const vignette = document.createElement('div');
    vignette.className = 'vignette';

    const img = document.createElement('img');
    img.alt = '';
    urlPour(media.thumbRef).then(u => { if (u) { img.src = u; img.classList.add('chargee'); } });
    vignette.appendChild(img);

    vignette.insertAdjacentHTML('beforeend',
      `<div class="vignette-marque"><span class="vignette-etiq">${position + 1}</span></div>`);

    const retirer = document.createElement('button');
    retirer.className = 'vignette-favori';
    retirer.textContent = '✕';
    retirer.title = 'Retirer de la proposition';
    retirer.onclick = () => {
      retirees.add(media.id);
      vignette.style.opacity = '0.28';
      vignette.style.pointerEvents = 'none';
    };
    vignette.appendChild(retirer);

    grille.appendChild(vignette);
  });

  const actions = bloc.querySelector('.rangee:last-child');

  const ouvrir = document.createElement('button');
  ouvrir.className = 'btn btn-primaire';
  ouvrir.textContent = 'Ouvrir dans le studio';
  ouvrir.onclick = () => {
    const ids = proposition.medias.filter(m => !retirees.has(m.id)).map(m => m.id);
    if (!ids.length) return notifier('Aucune photo retenue', 'erreur');
    envoyerAuStudio(ids);
  };
  actions.appendChild(ouvrir);

  const enregistrer = document.createElement('button');
  enregistrer.className = 'btn';
  enregistrer.textContent = 'Enregistrer comme projet';
  enregistrer.onclick = async () => {
    const ids = proposition.medias.filter(m => !retirees.has(m.id)).map(m => m.id);
    if (!ids.length) return notifier('Aucune photo retenue', 'erreur');

    const projet = nouveauProjet(proposition.titre);
    projet.status = 'to-prepare';
    projet.fromProposalId = proposition.signature;
    projet.canvas = proposition.format === '1:1'
      ? { width: 1080, height: 1080 }
      : { width: 1080, height: 1350 };
    // Le projet garde l'ordre proposé ; les photos seront placées à l'ouverture.
    projet.slides = ids.map((id, i) => ({
      id: `sl-${i}-${Date.now().toString(36)}`,
      index: i,
      background: '#ffffff',
      elements: [{
        id: `el-${i}-${Date.now().toString(36)}`,
        kind: 'image', assetId: id,
        x: 0, y: 0, width: projet.canvas.width, height: projet.canvas.height,
        rotation: 0, opacity: 1, locked: false
      }]
    }));

    await ecrire('projects', projet);
    notifier('Enregistré dans My Posts, à préparer', 'succes');
  };
  actions.appendChild(enregistrer);

  const ignorer = document.createElement('button');
  ignorer.className = 'btn btn-fantome';
  ignorer.textContent = 'Ignorer';
  ignorer.onclick = () => {
    propositions = propositions.filter(x => x !== proposition);
    dessiner();
  };
  actions.appendChild(ignorer);

  return bloc;
}
