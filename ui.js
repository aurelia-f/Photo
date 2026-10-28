/* =========================================================
   ui.js — Navigation, notifications et petits utilitaires
   partagés par toutes les pages.
   ========================================================= */

const PAGES = [
  { href: 'index.html',        icone: '🖼️', libelle: 'My Photos' },
  { href: 'connecter.html',    icone: '📂', libelle: 'Connecter' },
  { href: 'collections.html',  icone: '🗂️', libelle: 'Collections' },
  { href: 'studio.html',       icone: '🎨', libelle: 'Studio' },
  { href: 'propositions.html', icone: '💡', libelle: 'Propositions' },
  { href: 'posts.html',        icone: '📮', libelle: 'My Posts' },
  { href: 'parametres.html',   icone: '⚙️', libelle: 'Paramètres' }
];

/** Insère la barre de navigation dans l'élément <nav class="nav"> de la page. */
function monterNavigation() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  const courante = location.pathname.split('/').pop() || 'index.html';

  nav.innerHTML = `
    <div class="nav-marque">
      <span class="nav-pastille">🌸</span>
      <span>Photo Studio</span>
    </div>
    ${PAGES.map(p => `
      <a href="${p.href}" class="${p.href === courante ? 'actif' : ''}">
        <span class="nav-icone" aria-hidden="true">${p.icone}</span>
        <span>${p.libelle}</span>
      </a>
    `).join('')}
    <div class="nav-pied">
      Tes photos restent sur cet appareil.
    </div>
  `;
}

/* ---------- Notifications ---------- */

function conteneurToasts() {
  let boite = document.querySelector('.toasts');
  if (!boite) {
    boite = document.createElement('div');
    boite.className = 'toasts';
    boite.setAttribute('role', 'status');
    boite.setAttribute('aria-live', 'polite');
    document.body.appendChild(boite);
  }
  return boite;
}

function notifier(message, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  conteneurToasts().appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 200ms';
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

/* ---------- Dialogues ---------- */

/** Confirmation. Renvoie une promesse qui vaut true si l'utilisateur accepte. */
function confirmer(titre, texte, libelleAction = 'Confirmer', dangereux = false) {
  return new Promise(resoudre => {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <div class="dialogue-entete"><h2>${echapper(titre)}</h2></div>
      <div class="dialogue-corps"><p class="doux">${echapper(texte)}</p></div>
      <div class="dialogue-pied">
        <button class="btn" data-non>Annuler</button>
        <button class="btn ${dangereux ? 'btn-danger' : 'btn-primaire'}" data-oui>
          ${echapper(libelleAction)}
        </button>
      </div>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();

    const fermer = reponse => { dlg.close(); dlg.remove(); resoudre(reponse); };
    dlg.querySelector('[data-oui]').onclick = () => fermer(true);
    dlg.querySelector('[data-non]').onclick = () => fermer(false);
    dlg.addEventListener('cancel', e => { e.preventDefault(); fermer(false); });
  });
}

/** Petite saisie de texte. Renvoie la valeur, ou null si annulé. */
function demander(titre, valeurInitiale = '', placeholder = '') {
  return new Promise(resoudre => {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog">
        <div class="dialogue-entete"><h2>${echapper(titre)}</h2></div>
        <div class="dialogue-corps">
          <input class="champ" id="saisie-dialogue"
                 value="${echapper(valeurInitiale)}"
                 placeholder="${echapper(placeholder)}" autocomplete="off">
        </div>
        <div class="dialogue-pied">
          <button class="btn" value="annuler" type="submit">Annuler</button>
          <button class="btn btn-primaire" value="ok" type="submit">Valider</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();

    const champ = dlg.querySelector('#saisie-dialogue');
    champ.focus();
    champ.select();

    dlg.addEventListener('close', () => {
      const valeur = dlg.returnValue === 'ok' ? champ.value.trim() : null;
      dlg.remove();
      resoudre(valeur || null);
    });
  });
}

/* ---------- Utilitaires ---------- */

function echapper(texte) {
  const d = document.createElement('div');
  d.textContent = texte ?? '';
  return d.innerHTML;
}

/** Retarde l'exécution : utile pour la recherche au clavier. */
function differer(fonction, delai = 220) {
  let minuteur;
  return (...args) => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => fonction(...args), delai);
  };
}

/** Chargement progressif des miniatures : rien n'est décodé avant d'être visible. */
const observateur = new IntersectionObserver(entrees => {
  for (const entree of entrees) {
    if (!entree.isIntersecting) continue;
    const img = entree.target;
    observateur.unobserve(img);
    const source = img.dataset.src;
    if (!source) continue;
    img.src = source;
    img.addEventListener('load', () => img.classList.add('chargee'), { once: true });
  }
}, { rootMargin: '280px' });

function chargerQuandVisible(img, url) {
  img.dataset.src = url;
  observateur.observe(img);
}

/** Passe une sélection au studio via le stockage de session. */
function envoyerAuStudio(assetIds) {
  sessionStorage.setItem('studio-selection', JSON.stringify(assetIds));
  location.href = 'studio.html';
}

function recupererSelectionStudio() {
  const brut = sessionStorage.getItem('studio-selection');
  sessionStorage.removeItem('studio-selection');
  try { return brut ? JSON.parse(brut) : []; } catch { return []; }
}
