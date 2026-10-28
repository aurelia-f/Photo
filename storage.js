/* =========================================================
   storage.js — Adaptateur de stockage des fichiers
   Une seule interface : put / get / del / usage.
   OPFS quand le navigateur le propose, IndexedDB sinon.
   Le jour où un backend arrive, il suffit d'écrire un
   troisième adaptateur avec les quatre mêmes méthodes.
   ========================================================= */

let dossierOpfs = null;
let opfsTeste = false;

async function opfs() {
  if (opfsTeste) return dossierOpfs;
  opfsTeste = true;
  try {
    if (!navigator.storage?.getDirectory) return (dossierOpfs = null);
    const racine = await navigator.storage.getDirectory();
    dossierOpfs = await racine.getDirectoryHandle('medias', { create: true });
    // Vérifie que l'écriture fonctionne vraiment (Safari a longtemps menti là-dessus).
    const test = await dossierOpfs.getFileHandle('.test', { create: true });
    const flux = await test.createWritable();
    await flux.write(new Blob(['ok']));
    await flux.close();
    await dossierOpfs.removeEntry('.test');
  } catch {
    dossierOpfs = null;
  }
  return dossierOpfs;
}

/** Enregistre des octets sous une clé et renvoie cette clé. */
async function poser(cle, blob) {
  const dossier = await opfs();
  if (dossier) {
    const fichier = await dossier.getFileHandle(cle, { create: true });
    const flux = await fichier.createWritable();
    await flux.write(blob);
    await flux.close();
  } else {
    await ecrire('blobs', blob, cle);
  }
  return cle;
}

/** Relit des octets. Renvoie null si la clé n'existe plus. */
async function prendre(cle) {
  if (!cle) return null;
  const dossier = await opfs();
  if (dossier) {
    try {
      const fichier = await dossier.getFileHandle(cle);
      return await fichier.getFile();
    } catch {
      return null;
    }
  }
  return (await lire('blobs', cle)) || null;
}

async function retirer(cle) {
  if (!cle) return;
  const dossier = await opfs();
  if (dossier) {
    try { await dossier.removeEntry(cle); } catch { /* déjà absent */ }
  } else {
    await supprimer('blobs', cle).catch(() => {});
  }
}

/** Espace utilisé et quota disponible, en octets. */
async function occupation() {
  if (!navigator.storage?.estimate) return { used: 0, quota: 0, connu: false };
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { used: usage, quota, connu: true };
}

/**
 * Demande au navigateur de ne pas évincer automatiquement les données.
 * À appeler au premier import, pas au chargement de la page.
 */
async function demanderPersistance() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

/** Les URLs d'objet doivent être révoquées : on tient le compte ici. */
const urlsVivantes = new Map();

async function urlPour(cle) {
  if (!cle) return null;
  if (urlsVivantes.has(cle)) return urlsVivantes.get(cle);
  const blob = await prendre(cle);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlsVivantes.set(cle, url);
  return url;
}

function libererUrls() {
  for (const url of urlsVivantes.values()) URL.revokeObjectURL(url);
  urlsVivantes.clear();
}
