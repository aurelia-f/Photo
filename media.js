/* =========================================================
   media.js — Traitement des fichiers à l'import
   Vérification, miniatures, aperçus, empreintes, couleurs.
   ========================================================= */

const TAILLE_MINIATURE = 320;
const TAILLE_APERCU = 1280;
const POIDS_MAX = 120 * 1024 * 1024; // 120 Mo par fichier

/** Signatures réelles des fichiers : on ne fait pas confiance à l'extension. */
const SIGNATURES = [
  { mime: 'image/jpeg', octets: [0xff, 0xd8, 0xff] },
  { mime: 'image/png',  octets: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif',  octets: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', octets: [0x52, 0x49, 0x46, 0x46] }
];

async function typeReel(fichier) {
  const tete = new Uint8Array(await fichier.slice(0, 12).arrayBuffer());
  for (const s of SIGNATURES) {
    if (s.octets.every((o, i) => tete[i] === o)) return s.mime;
  }
  if (fichier.type.startsWith('video/')) return fichier.type;
  return null;
}

/** Empreinte exacte : deux fichiers identiques donnent la même. */
async function empreinte(fichier) {
  const tampon = await fichier.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', tampon);
  return [...new Uint8Array(digest)].map(o => o.toString(16).padStart(2, '0')).join('');
}

/**
 * Empreinte perceptuelle (dHash 64 bits) : deux photos visuellement
 * proches donnent des empreintes proches. Sert aux quasi-doublons.
 */
function empreintePerceptuelle(canvas) {
  const petit = document.createElement('canvas');
  petit.width = 9;
  petit.height = 8;
  const ctx = petit.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, 9, 8);
  const pixels = ctx.getImageData(0, 0, 9, 8).data;

  const gris = [];
  for (let i = 0; i < pixels.length; i += 4) {
    gris.push(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
  }

  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += gris[y * 9 + x] > gris[y * 9 + x + 1] ? '1' : '0';
    }
  }
  return bits;
}

/** Distance de Hamming entre deux empreintes perceptuelles. */
function distance(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/** Couleurs dominantes, par regroupement simple. Aucun modèle requis. */
function couleursDominantes(canvas, combien = 5) {
  const petit = document.createElement('canvas');
  petit.width = 48;
  petit.height = 48;
  const ctx = petit.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, 48, 48);
  const pixels = ctx.getImageData(0, 0, 48, 48).data;

  const paniers = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = Math.round(pixels[i] / 32) * 32;
    const v = Math.round(pixels[i + 1] / 32) * 32;
    const b = Math.round(pixels[i + 2] / 32) * 32;
    const cle = `${r},${v},${b}`;
    paniers.set(cle, (paniers.get(cle) || 0) + 1);
  }

  return [...paniers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, combien)
    .map(([cle]) => {
      const [r, v, b] = cle.split(',').map(Number);
      return '#' + [r, v, b].map(c => Math.min(255, c).toString(16).padStart(2, '0')).join('');
    });
}

/** Ambiance lisible, déduite des couleurs. Sert aux propositions de posts. */
function ambiance(couleurs) {
  if (!couleurs?.length) return 'neutre';
  let luminosite = 0, saturation = 0, chaleur = 0;

  for (const hex of couleurs) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const v = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, v, b), min = Math.min(r, v, b);
    luminosite += (max + min) / 2;
    saturation += max === min ? 0 : (max - min) / (1 - Math.abs(max + min - 1) || 1);
    chaleur += r - b;
  }

  const n = couleurs.length;
  luminosite /= n; saturation /= n; chaleur /= n;

  if (luminosite < 0.3) return 'sombre';
  if (luminosite > 0.75 && saturation < 0.25) return 'clair et doux';
  if (chaleur > 0.12) return 'chaud';
  if (chaleur < -0.12) return 'froid';
  if (saturation > 0.45) return 'coloré';
  return 'neutre';
}

/** Date de prise de vue depuis l'EXIF JPEG, sans bibliothèque externe. */
async function dateExif(fichier) {
  if (!fichier.type.includes('jpeg')) return null;
  try {
    const vue = new DataView(await fichier.slice(0, 131072).arrayBuffer());
    for (let i = 0; i < vue.byteLength - 20; i++) {
      // Cherche la chaîne "DateTimeOriginal" encodée dans le bloc EXIF :
      // on repère plutôt le motif de date "AAAA:MM:JJ HH:MM:SS".
      if (vue.getUint8(i) === 0x3a && vue.getUint8(i + 3) === 0x3a) {
        const texte = new TextDecoder('latin1')
          .decode(new Uint8Array(vue.buffer, Math.max(0, i - 4), 19));
        const m = texte.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
        if (m) {
          const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
          if (!isNaN(d) && d.getFullYear() > 1990) return d.getTime();
        }
      }
    }
  } catch { /* pas d'EXIF lisible */ }
  return null;
}

function redimensionner(source, largeurSource, hauteurSource, cote) {
  const ratio = Math.min(cote / largeurSource, cote / hauteurSource, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(largeurSource * ratio);
  canvas.height = Math.round(hauteurSource * ratio);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const versBlob = (canvas, qualite = 0.82) =>
  new Promise(r => canvas.toBlob(r, 'image/jpeg', qualite));

/** Première image exploitable d'une vidéo, pour la vignette. */
function imageDeVideo(fichier) {
  return new Promise((resoudre, rejeter) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(fichier);

    const nettoyer = () => URL.revokeObjectURL(video.src);
    video.onloadeddata = () => { video.currentTime = Math.min(0.5, (video.duration || 1) / 3); };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      nettoyer();
      resoudre({ canvas, duree: video.duration * 1000 });
    };
    video.onerror = () => { nettoyer(); rejeter(new Error('Vidéo illisible')); };
  });
}

/**
 * Transforme un fichier en média complet : vérification, dérivés, métadonnées.
 * Renvoie l'objet prêt à écrire en base, sans l'écrire.
 */
async function preparer(fichier) {
  if (fichier.size > POIDS_MAX) {
    throw new Error(`Fichier trop lourd (${Math.round(fichier.size / 1048576)} Mo)`);
  }

  const mime = await typeReel(fichier);
  if (!mime) throw new Error('Format non reconnu');

  const estVideo = mime.startsWith('video/');
  const id = identifiant();

  let canvas, largeur, hauteur, duree = null;

  if (estVideo) {
    const resultat = await imageDeVideo(fichier);
    canvas = resultat.canvas;
    duree = resultat.duree;
    largeur = canvas.width;
    hauteur = canvas.height;
  } else {
    const bitmap = await createImageBitmap(fichier);
    largeur = bitmap.width;
    hauteur = bitmap.height;
    canvas = redimensionner(bitmap, largeur, hauteur, Math.max(largeur, hauteur));
    bitmap.close?.();
  }

  const miniature = redimensionner(canvas, canvas.width, canvas.height, TAILLE_MINIATURE);
  const apercu = redimensionner(canvas, canvas.width, canvas.height, TAILLE_APERCU);

  const [cleOriginal, cleMiniature, cleApercu] = await Promise.all([
    poser(`${id}-o`, fichier),
    poser(`${id}-t`, await versBlob(miniature, 0.78)),
    poser(`${id}-p`, await versBlob(apercu, 0.88))
  ]);

  return {
    id,
    type: estVideo ? 'video' : 'image',
    name: fichier.name,
    provenance: { kind: 'local' },
    availability: 'stored',
    fileRef: cleOriginal,
    thumbRef: cleMiniature,
    previewRef: cleApercu,
    mimeType: mime,
    bytes: fichier.size,
    width: largeur,
    height: hauteur,
    durationMs: duree,
    capturedAt: (await dateExif(fichier)) || fichier.lastModified || null,
    importedAt: Date.now(),
    favorite: false,
    contentHash: await empreinte(fichier),
    perceptualHash: empreintePerceptuelle(miniature),
    dominantColors: couleursDominantes(miniature),
    categories: estVideo ? [{ id: 'videos', origin: 'user' }] : [],
    usedInPosts: [],
    aiState: 'pending'
  };
}

/* ---------- Formats lisibles ---------- */

function poidsLisible(octets) {
  if (!octets) return '0 o';
  const unites = ['o', 'ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(octets) / Math.log(1024));
  return `${(octets / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${unites[i]}`;
}

function dateLisible(horodatage) {
  if (!horodatage) return 'Date inconnue';
  return new Date(horodatage).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

function dureeLisible(ms) {
  if (!ms) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
