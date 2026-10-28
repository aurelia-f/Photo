/* =========================================================
   parametres.js — Page « Paramètres »
   ========================================================= */

const $ = s => document.querySelector(s);

monterNavigation();
demarrer();

async function demarrer() {
  await majStockage();
  await dessinerCategories();

  const preferences = await prefs();
  if (preferences.modeIa) $('#mode-ia').value = preferences.modeIa;

  brancherEvenements();
}

/* ---------- Stockage ---------- */

async function majStockage() {
  const { used, quota, connu } = await occupation();
  const medias = await assets();
  const poidsMedias = medias.reduce((somme, m) => somme + (m.bytes || 0), 0);

  if (!connu || !quota) {
    $('#stockage-texte').textContent = 'Ton navigateur ne communique pas son quota.';
    $('#stockage-pourcent').textContent = '';
  } else {
    const pourcent = Math.min(100, Math.round((used / quota) * 100));
    $('#stockage-texte').textContent = `${poidsLisible(used)} utilisés sur ${poidsLisible(quota)}`;
    $('#stockage-pourcent').textContent = `${pourcent} %`;

    const barre = $('#stockage-barre');
    barre.style.width = `${pourcent}%`;
    barre.className = 'jauge-barre' + (pourcent >= 95 ? ' danger' : pourcent >= 80 ? ' alerte' : '');

    if (pourcent >= 80) {
      notifier('Ton espace de stockage se remplit — pense à exporter une archive', 'erreur');
    }
  }

  const [cols, posts] = await Promise.all([collections(), projets()]);
  $('#stockage-detail').textContent =
    `${medias.length} média(s) pour ${poidsLisible(poidsMedias)} d'originaux · ` +
    `${cols.length} collection(s) · ${posts.length} projet(s) de post`;

  if (navigator.storage?.persisted) {
    const protege = await navigator.storage.persisted();
    $('#btn-persister').textContent = protege
      ? '✓ Données protégées contre l\'effacement automatique'
      : 'Protéger contre l\'effacement automatique';
    $('#btn-persister').disabled = protege;
  }
}

/* ---------- Catégories ---------- */

async function dessinerCategories() {
  const liste = await categories();
  const medias = await assets();
  const boite = $('#liste-categories');
  boite.innerHTML = '';

  for (const categorie of liste) {
    const combien = medias.filter(m =>
      (m.categories || []).some(c => c.id === categorie.id)
    ).length;

    const puce = document.createElement('span');
    puce.className = 'puce';
    puce.style.cursor = 'default';
    puce.innerHTML = `${categorie.emoji} ${echapper(categorie.label)}
      <span class="pale" style="margin-left:4px">${combien}</span>`;

    if (!categorie.builtIn) {
      const fermer = document.createElement('button');
      fermer.className = 'puce-fermer';
      fermer.textContent = '✕';
      fermer.title = 'Supprimer cette catégorie';
      fermer.onclick = async () => {
        const ok = await confirmer(
          `Supprimer « ${categorie.label} » ?`,
          'Les photos ne sont pas supprimées : elles perdent seulement cette étiquette.',
          'Supprimer', true
        );
        if (!ok) return;

        for (const m of medias) {
          if ((m.categories || []).some(c => c.id === categorie.id)) {
            m.categories = m.categories.filter(c => c.id !== categorie.id);
            await ecrire('assets', m);
          }
        }
        await supprimer('categories', categorie.id);
        await dessinerCategories();
        notifier('Catégorie supprimée', 'succes');
      };
      puce.appendChild(fermer);
    }

    boite.appendChild(puce);
  }
}

/* ---------- Sauvegarde ---------- */

async function exporterArchive() {
  const etat = $('#sauvegarde-etat');
  etat.textContent = 'Préparation de l\'archive…';

  try {
    const [medias, cols, posts, cats] = await Promise.all([
      assets(), collections(), projets(), categories()
    ]);

    const fichiers = {};

    // Les métadonnées d'abord : c'est elles qui permettent de tout reconstruire.
    fichiers['metadonnees.json'] = fflate.strToU8(JSON.stringify({
      version: 1,
      exporteLe: new Date().toISOString(),
      assets: medias,
      collections: cols,
      projects: posts,
      categories: cats
    }, null, 2));

    for (let i = 0; i < medias.length; i++) {
      etat.textContent = `Archivage ${i + 1} / ${medias.length}…`;
      const media = medias[i];

      for (const [cle, dossier] of [
        [media.fileRef, 'originaux'],
        [media.thumbRef, 'miniatures'],
        [media.previewRef, 'apercus']
      ]) {
        if (!cle) continue;
        const blob = await prendre(cle);
        if (blob) fichiers[`${dossier}/${cle}`] = new Uint8Array(await blob.arrayBuffer());
      }

      await new Promise(r => setTimeout(r, 0));
    }

    etat.textContent = 'Compression…';
    const zip = fflate.zipSync(fichiers, { level: 0 });
    const nom = `photo-studio-${new Date().toISOString().slice(0, 10)}.zip`;

    const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nom;
    lien.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    etat.textContent = `Archive créée : ${nom}`;
    notifier('Archive exportée', 'succes');
  } catch (erreur) {
    console.error(erreur);
    etat.textContent = 'L\'export a échoué : ' + erreur.message;
    notifier('Export impossible', 'erreur');
  }
}

async function restaurerArchive(fichier) {
  const etat = $('#sauvegarde-etat');

  const ok = await confirmer(
    'Restaurer cette archive ?',
    'Les photos et projets de l\'archive seront ajoutés à ce qui existe déjà. Rien n\'est écrasé.',
    'Restaurer'
  );
  if (!ok) return;

  etat.textContent = 'Lecture de l\'archive…';

  try {
    const octets = new Uint8Array(await fichier.arrayBuffer());
    const contenu = fflate.unzipSync(octets);

    const brut = contenu['metadonnees.json'];
    if (!brut) throw new Error('Archive invalide : métadonnées absentes');
    const donnees = JSON.parse(fflate.strFromU8(brut));

    // Les fichiers d'abord, les métadonnées ensuite :
    // une photo sans octets vaut mieux qu'une métadonnée orpheline.
    const chemins = Object.keys(contenu).filter(c => c !== 'metadonnees.json');
    for (let i = 0; i < chemins.length; i++) {
      etat.textContent = `Restauration ${i + 1} / ${chemins.length}…`;
      const cle = chemins[i].split('/').pop();
      await poser(cle, new Blob([contenu[chemins[i]]]));
      if (i % 12 === 0) await new Promise(r => setTimeout(r, 0));
    }

    const existants = new Set((await assets()).map(m => m.id));
    const nouveaux = (donnees.assets || []).filter(m => !existants.has(m.id));
    if (nouveaux.length) await ecrireLot('assets', nouveaux);

    for (const c of (donnees.categories || [])) await ecrire('categories', c);
    for (const c of (donnees.collections || [])) await ecrire('collections', c);
    for (const p of (donnees.projects || [])) await ecrire('projects', p);

    etat.textContent = `${nouveaux.length} média(s) restauré(s).`;
    notifier('Archive restaurée', 'succes');
    await majStockage();
    await dessinerCategories();
  } catch (erreur) {
    console.error(erreur);
    etat.textContent = 'Restauration impossible : ' + erreur.message;
    notifier('Restauration impossible', 'erreur');
  }
}

/* ---------- Événements ---------- */

function brancherEvenements() {
  $('#btn-persister').onclick = async () => {
    const accorde = await demanderPersistance();
    notifier(
      accorde
        ? 'Tes données sont protégées contre l\'effacement automatique'
        : 'Le navigateur a refusé — installe l\'application sur ton écran d\'accueil pour réessayer',
      accorde ? 'succes' : 'erreur'
    );
    await majStockage();
  };

  $('#btn-exporter-tout').onclick = exporterArchive;

  $('#btn-importer-archive').onclick = () => $('#fichier-archive').click();
  $('#fichier-archive').onchange = async e => {
    const fichier = e.target.files[0];
    e.target.value = '';
    if (fichier) await restaurerArchive(fichier);
  };

  $('#btn-ajouter-categorie').onclick = async () => {
    const champ = $('#nouvelle-categorie');
    const nom = champ.value.trim();
    if (!nom) return;
    await ajouterCategorie(nom);
    champ.value = '';
    await dessinerCategories();
    notifier(`Catégorie « ${nom} » ajoutée`, 'succes');
  };

  $('#nouvelle-categorie').onkeydown = e => {
    if (e.key === 'Enter') $('#btn-ajouter-categorie').click();
  };

  $('#mode-ia').onchange = async e => {
    await majPrefs({ modeIa: e.target.value });
    notifier('Préférence enregistrée', 'succes');
  };

  $('#btn-tout-effacer').onclick = async () => {
    const ok = await confirmer(
      'Tout effacer ?',
      'Toutes tes photos, collections et projets seront définitivement supprimés de cet appareil. Cette action est irréversible.',
      'Tout effacer', true
    );
    if (!ok) return;

    const confirmation = await confirmer(
      'Vraiment sûre ?',
      'Dernière chance d\'exporter une archive avant.',
      'Oui, tout effacer', true
    );
    if (!confirmation) return;

    for (const magasin of ['assets', 'blobs', 'collections', 'projects', 'categories']) {
      await viderMagasin(magasin);
    }

    // Nettoie aussi OPFS si le navigateur l'utilise.
    try {
      const racine = await navigator.storage.getDirectory();
      await racine.removeEntry('medias', { recursive: true });
    } catch { /* OPFS non utilisé */ }

    notifier('Toutes les données ont été effacées', 'succes');
    setTimeout(() => location.reload(), 900);
  };
}
