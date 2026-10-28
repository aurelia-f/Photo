/* =========================================================
   db.js — Base de données locale (IndexedDB)
   Module partagé par toutes les pages.
   ========================================================= */

const NOM_BASE = 'photo-studio';
const VERSION = 1;

/** Catégories créées au premier lancement. */
export const CATEGORIES_INITIALES = [
  { id: 'selfies',    label: 'Selfies',               emoji: '🙂' },
  { id: 'paysages',   label: 'Paysages',              emoji: '🏞️' },
  { id: 'amis',       label: 'Amis et groupes',       emoji: '👥' },
  { id: 'tenues',     label: 'Tenues',                emoji: '👗' },
  { id: 'voyages',    label: 'Voyages',               emoji: '✈️' },
  { id: 'esthetique', label: 'Photos esthétiques',    emoji: '✨' },
  { id: 'food',       label: 'Restaurants et nourriture', emoji: '🍽️' },
  { id: 'animaux',    label: 'Animaux',               emoji: '🐾' },
  { id: 'couchers',   label: 'Couchers de soleil',    emoji: '🌅' },
  { id: 'videos',     label: 'Vidéos',                emoji: '🎬' },
  { id: 'autres',     label: 'Autres',                emoji: '📁' }
];

let promesseBase = null;

function ouvrir() {
  return new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(NOM_BASE, VERSION);

    requete.onupgradeneeded = () => {
      const base = requete.result;

      if (!base.objectStoreNames.contains('assets')) {
        const magasin = base.createObjectStore('assets', { keyPath: 'id' });
        magasin.createIndex('importedAt', 'importedAt');
        magasin.createIndex('capturedAt', 'capturedAt');
        magasin.createIndex('contentHash', 'contentHash');
      }
      // Les octets (originaux, miniatures, aperçus) vivent à part des métadonnées.
      if (!base.objectStoreNames.contains('blobs'))       base.createObjectStore('blobs');
      if (!base.objectStoreNames.contains('collections')) base.createObjectStore('collections', { keyPath: 'id' });
      if (!base.objectStoreNames.contains('projects'))    base.createObjectStore('projects', { keyPath: 'id' });
      if (!base.objectStoreNames.contains('categories'))  base.createObjectStore('categories', { keyPath: 'id' });
      if (!base.objectStoreNames.contains('meta'))        base.createObjectStore('meta');
    };

    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
}

export function base() {
  if (!promesseBase) promesseBase = ouvrir();
  return promesseBase;
}

/** Enveloppe une requête IndexedDB dans une promesse. */
function attendre(requete) {
  return new Promise((resoudre, rejeter) => {
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
}

export async function lire(magasin, cle) {
  const b = await base();
  return attendre(b.transaction(magasin, 'readonly').objectStore(magasin).get(cle));
}

export async function lireTout(magasin) {
  const b = await base();
  return attendre(b.transaction(magasin, 'readonly').objectStore(magasin).getAll());
}

export async function ecrire(magasin, valeur, cle) {
  const b = await base();
  const tx = b.transaction(magasin, 'readwrite');
  const resultat = attendre(
    cle === undefined
      ? tx.objectStore(magasin).put(valeur)
      : tx.objectStore(magasin).put(valeur, cle)
  );
  await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
  return resultat;
}

export async function ecrireLot(magasin, valeurs) {
  const b = await base();
  const tx = b.transaction(magasin, 'readwrite');
  const m = tx.objectStore(magasin);
  for (const v of valeurs) m.put(v);
  return new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
}

export async function supprimer(magasin, cle) {
  const b = await base();
  const tx = b.transaction(magasin, 'readwrite');
  attendre(tx.objectStore(magasin).delete(cle));
  return new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
}

export async function viderMagasin(magasin) {
  const b = await base();
  const tx = b.transaction(magasin, 'readwrite');
  tx.objectStore(magasin).clear();
  return new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
}

/* ---------- Catégories ---------- */

export async function categories() {
  let liste = await lireTout('categories');
  if (!liste.length) {
    liste = CATEGORIES_INITIALES.map(c => ({ ...c, builtIn: true }));
    await ecrireLot('categories', liste);
  }
  return liste;
}

export async function ajouterCategorie(label, emoji = '🏷️') {
  const id = 'cat-' + identifiant();
  const categorie = { id, label, emoji, builtIn: false };
  await ecrire('categories', categorie);
  return categorie;
}

/* ---------- Médias ---------- */

export async function assets() {
  const liste = await lireTout('assets');
  return liste.sort((a, b) => (b.capturedAt || b.importedAt) - (a.capturedAt || a.importedAt));
}

export const asset = id => lire('assets', id);

export async function majAsset(id, modifications) {
  const actuel = await lire('assets', id);
  if (!actuel) return null;
  const suivant = { ...actuel, ...modifications };
  await ecrire('assets', suivant);
  return suivant;
}

/**
 * Pose une catégorie sur une photo.
 * origine : 'user' (décision) ou 'ai' (prédiction, affichée en pointillés).
 * Une décision de l'utilisateur n'est jamais écrasée par une prédiction.
 */
export async function poserCategorie(idAsset, idCategorie, origine = 'user') {
  const a = await lire('assets', idAsset);
  if (!a) return null;
  const existantes = a.categories || [];
  const dejaPosee = existantes.find(c => c.id === idCategorie);
  if (dejaPosee) {
    if (origine === 'user') dejaPosee.origin = 'user';
    else return a; // une prédiction ne remplace pas ce qui est déjà là
  } else {
    existantes.push({ id: idCategorie, origin: origine });
  }
  return majAsset(idAsset, { categories: existantes });
}

export async function retirerCategorie(idAsset, idCategorie) {
  const a = await lire('assets', idAsset);
  if (!a) return null;
  return majAsset(idAsset, {
    categories: (a.categories || []).filter(c => c.id !== idCategorie)
  });
}

export async function supprimerAsset(id) {
  const a = await lire('assets', id);
  if (a) {
    for (const cle of [a.fileRef, a.thumbRef, a.previewRef]) {
      if (cle) await supprimer('blobs', cle).catch(() => {});
    }
  }
  await supprimer('assets', id);

  // Retirer la photo des collections qui la référencent.
  const cols = await lireTout('collections');
  for (const c of cols) {
    if (c.assetIds.includes(id)) {
      c.assetIds = c.assetIds.filter(x => x !== id);
      await ecrire('collections', c);
    }
  }
}

/* ---------- Collections ---------- */

export const collections = () => lireTout('collections');

export async function creerCollection(nom, assetIds = []) {
  const collection = {
    id: 'col-' + identifiant(),
    name: nom,
    assetIds,
    coverAssetId: assetIds[0] || null,
    kind: 'personal',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await ecrire('collections', collection);
  return collection;
}

/* ---------- Projets de posts ---------- */

export const projets = () => lireTout('projects');
export const projet = id => lire('projects', id);

export function nouveauProjet(titre = 'Nouveau post') {
  return {
    id: 'post-' + identifiant(),
    title: titre,
    status: 'to-prepare',
    canvas: { width: 1080, height: 1350 },
    slides: [{ id: 'sl-' + identifiant(), index: 0, background: '#ffffff', elements: [] }],
    panorama: null,
    fromProposalId: null,
    publishedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export async function sauverProjet(p) {
  p.updatedAt = Date.now();
  await ecrire('projects', p);
  return p;
}

/**
 * Marque un post comme publié. Ne supprime jamais le projet ni les photos :
 * les photos utilisées sont seulement signalées comme déjà publiées.
 */
export async function marquerPublie(idProjet, datePublication = Date.now()) {
  const p = await projet(idProjet);
  if (!p) return null;
  p.status = 'published';
  p.publishedAt = datePublication;
  await sauverProjet(p);

  for (const id of assetsDuProjet(p)) {
    const a = await lire('assets', id);
    if (a && !(a.usedInPosts || []).includes(p.id)) {
      await majAsset(id, { usedInPosts: [...(a.usedInPosts || []), p.id] });
    }
  }
  return p;
}

/** Annule la publication déclarée : le projet repasse en « prêt à publier ». */
export async function annulerPublication(idProjet) {
  const p = await projet(idProjet);
  if (!p) return null;
  p.status = 'ready';
  p.publishedAt = null;
  await sauverProjet(p);

  for (const id of assetsDuProjet(p)) {
    const a = await lire('assets', id);
    if (a) await majAsset(id, { usedInPosts: (a.usedInPosts || []).filter(x => x !== p.id) });
  }
  return p;
}

export function assetsDuProjet(p) {
  const ids = new Set();
  for (const diapo of p.slides) {
    for (const el of diapo.elements) if (el.kind === 'image' && el.assetId) ids.add(el.assetId);
  }
  return [...ids];
}

/* ---------- Préférences ---------- */

export const prefs = async () => (await lire('meta', 'prefs')) || {};

export async function majPrefs(modifications) {
  const suivantes = { ...(await prefs()), ...modifications };
  await ecrire('meta', suivantes, 'prefs');
  return suivantes;
}

/* ---------- Utilitaires ---------- */

/** Identifiant court, trié chronologiquement. */
export function identifiant() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
