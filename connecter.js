/* =========================================================
   connecter.js — Page « Connecter mes photos »
   Deux voies réelles : autoriser un dossier entier
   (File System Access) ou choisir des photos à la main.
   ========================================================= */

const $ = s => document.querySelector(s);

const EXTENSIONS = /\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|m4v|webm)$/i;
const CLE_DOSSIER = 'dossier-photos';

let poigneeDossier = null;
let interrompu = false;

monterNavigation();
demarrer();

async function demarrer() {
  brancherEvenements();

  if (!window.showDirectoryPicker) {
    // Safari et les navigateurs mobiles ne proposent pas encore cette API.
    $('#btn-dossier').disabled = true;
    $('#dossier-indispo').hidden = false;
    $('#dossier-indispo').textContent =
      'Ton navigateur ne permet pas encore d\'autoriser un dossier entier. ' +
      'Sur ordinateur, Chrome et Edge le font. Sur iPhone, utilise « Choisir des photos ».';
    return;
  }

  // Un dossier déjà autorisé lors d'une visite précédente ?
  const enregistre = await lire('meta', CLE_DOSSIER);
  if (enregistre) {
    poigneeDossier = enregistre;
    await rafraichirEtatDossier();
  }
}

/* ---------- Dossier autorisé ---------- */

async function rafraichirEtatDossier() {
  const etat = $('#dossier-etat');
  etat.hidden = false;

  const permission = await poigneeDossier.queryPermission({ mode: 'read' });

  if (permission === 'granted') {
    etat.textContent = `Dossier autorisé : ${poigneeDossier.name}`;
    $('#btn-resync').hidden = false;
  } else {
    etat.textContent =
      `Dossier « ${poigneeDossier.name} » enregistré, mais l'autorisation doit être ` +
      'reconfirmée — les navigateurs la redemandent après fermeture.';
    $('#btn-resync').hidden = false;
  }

  $('#btn-oublier').hidden = false;
  $('#btn-dossier').textContent = 'Changer de dossier';
}

async function choisirDossier() {
  try {
    poigneeDossier = await window.showDirectoryPicker({ mode: 'read', id: 'photos' });
  } catch {
    return; // l'utilisatrice a annulé
  }

  // La poignée est stockable telle quelle : l'autorisation survit à la fermeture.
  await ecrire('meta', poigneeDossier, CLE_DOSSIER);
  await rafraichirEtatDossier();
  await importerDepuisDossier();
}

async function verifierPermission() {
  if (await poigneeDossier.queryPermission({ mode: 'read' }) === 'granted') return true;
  return (await poigneeDossier.requestPermission({ mode: 'read' })) === 'granted';
}

/** Parcourt le dossier et tous ses sous-dossiers. */
async function* parcourir(dossier, profondeur = 0) {
  if (profondeur > 6) return; // garde-fou contre les arborescences infinies
  for await (const entree of dossier.values()) {
    if (entree.kind === 'file') {
      if (EXTENSIONS.test(entree.name)) yield entree;
    } else {
      yield* parcourir(entree, profondeur + 1);
    }
  }
}

async function importerDepuisDossier() {
  if (!poigneeDossier) return;

  if (!(await verifierPermission())) {
    return notifier('Autorisation refusée', 'erreur');
  }

  const texte = $('#progression-texte');
  texte.textContent = 'Lecture du dossier…';
  $('#progression').hidden = false;
  interrompu = false;

  const poignees = [];
  try {
    for await (const fichier of parcourir(poigneeDossier)) {
      poignees.push(fichier);
      if (poignees.length % 50 === 0) {
        texte.textContent = `${poignees.length} fichiers repérés…`;
        await new Promise(r => setTimeout(r, 0));
      }
      if (interrompu) break;
    }
  } catch (erreur) {
    $('#progression').hidden = true;
    return notifier('Lecture impossible : ' + erreur.message, 'erreur');
  }

  if (!poignees.length) {
    $('#progression').hidden = true;
    return notifier('Aucune photo trouvée dans ce dossier', 'erreur');
  }

  const fichiers = [];
  for (const poignee of poignees) {
    try { fichiers.push(await poignee.getFile()); } catch { /* fichier illisible */ }
  }

  await importerFichiers(fichiers);
}

/* ---------- Import commun ---------- */

async function importerFichiers(fichiers) {
  if (!fichiers.length) return;

  await demanderPersistance();

  const barre = $('#progression-barre');
  const texte = $('#progression-texte');
  $('#progression').hidden = false;
  interrompu = false;

  const connues = new Set((await assets()).map(m => m.contentHash));
  const nouveaux = [];
  let ignores = 0, echecs = 0;

  for (let i = 0; i < fichiers.length; i++) {
    if (interrompu) break;

    texte.textContent = `Import ${i + 1} / ${fichiers.length}`;
    barre.style.width = `${((i + 1) / fichiers.length) * 100}%`;

    try {
      const media = await preparer(fichiers[i]);
      if (connues.has(media.contentHash)) { ignores++; continue; }
      connues.add(media.contentHash);
      nouveaux.push(media);

      // Écriture par paquets de 20 : rien n'est perdu si tu fermes l'onglet.
      if (nouveaux.length % 20 === 0) {
        await ecrireLot('assets', nouveaux.splice(0, nouveaux.length));
      }
    } catch {
      echecs++;
    }

    await new Promise(r => setTimeout(r, 0));
  }

  if (nouveaux.length) await ecrireLot('assets', nouveaux);

  $('#progression').hidden = true;

  const total = (await assets()).length;
  const morceaux = [];
  if (ignores) morceaux.push(`${ignores} déjà présente${ignores > 1 ? 's' : ''}`);
  if (echecs) morceaux.push(`${echecs} illisible${echecs > 1 ? 's' : ''}`);

  notifier(
    `Photothèque : ${total} média${total > 1 ? 's' : ''}` +
    (morceaux.length ? ` — ${morceaux.join(', ')}` : ''),
    echecs ? 'erreur' : 'succes'
  );

  const etat = $('#dossier-etat');
  if (!etat.hidden) {
    etat.textContent += ` — ${total} média(s) dans ta photothèque.`;
  }
}

/* ---------- Événements ---------- */

function brancherEvenements() {
  $('#btn-dossier').onclick = choisirDossier;
  $('#btn-resync').onclick = importerDepuisDossier;

  $('#btn-oublier').onclick = async () => {
    const ok = await confirmer(
      'Oublier ce dossier ?',
      'Photo Studio ne le relira plus. Les photos déjà importées restent dans ta photothèque.',
      'Oublier'
    );
    if (!ok) return;
    await supprimer('meta', CLE_DOSSIER);
    poigneeDossier = null;
    $('#dossier-etat').hidden = true;
    $('#btn-resync').hidden = true;
    $('#btn-oublier').hidden = true;
    $('#btn-dossier').textContent = 'Choisir un dossier';
    notifier('Dossier oublié', 'succes');
  };

  $('#btn-choisir').onclick = () => $('#fichiers').click();
  $('#fichiers').onchange = async e => {
    const fichiers = [...e.target.files];
    e.target.value = '';
    await importerFichiers(fichiers);
  };

  $('#btn-stop').onclick = () => { interrompu = true; };
}
