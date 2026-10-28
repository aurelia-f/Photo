/* =========================================================
   posts.js — Page « My Posts »
   Cycle de vie des projets de post. Rien n'est jamais
   supprimé quand un post passe en « publié ».
   ========================================================= */

const $ = s => document.querySelector(s);

const STATUTS = {
  'to-prepare':  { libelle: 'À préparer',     classe: 'badge-a-preparer' },
  'in-progress': { libelle: 'En cours',       classe: 'badge-en-cours' },
  'ready':       { libelle: 'Prêt à publier', classe: 'badge-pret' },
  'published':   { libelle: 'Publié',         classe: 'badge-publie' }
};

let mesProjets = [];
let tousLesMedias = [];
let filtreStatut = '';

monterNavigation();
demarrer();

async function demarrer() {
  tousLesMedias = await assets();
  await recharger();
  brancherEvenements();
}

async function recharger() {
  mesProjets = (await projets()).sort((a, b) => b.updatedAt - a.updatedAt);
  dessiner();
}

/* ---------- Affichage ---------- */

function dessiner() {
  const liste = filtreStatut
    ? mesProjets.filter(p => p.status === filtreStatut)
    : mesProjets;

  const boite = $('#cartes');
  boite.innerHTML = '';
  $('#vide').hidden = liste.length > 0;
  boite.hidden = liste.length === 0;

  for (const p of liste) boite.appendChild(carteProjet(p));

  const prets = mesProjets.filter(p => p.status === 'ready').length;
  const publies = mesProjets.filter(p => p.status === 'published').length;
  $('#resume').textContent = mesProjets.length
    ? `${mesProjets.length} projet${mesProjets.length > 1 ? 's' : ''} — ${prets} prêt${prets > 1 ? 's' : ''} à publier, ${publies} publié${publies > 1 ? 's' : ''}`
    : 'Aucun projet pour l\'instant';
}

function carteProjet(p) {
  const carte = document.createElement('article');
  carte.className = 'carte-visuelle';

  const ids = assetsDuProjet(p);
  const couverture = document.createElement('div');
  couverture.className = 'carte-couverture';
  couverture.style.aspectRatio = '4 / 5';

  const premier = tousLesMedias.find(m => m.id === ids[0]);
  if (premier) {
    const img = document.createElement('img');
    img.alt = '';
    urlPour(premier.thumbRef).then(u => { if (u) img.src = u; });
    couverture.appendChild(img);
  } else {
    couverture.innerHTML = '<span>🎨</span>';
  }
  carte.appendChild(couverture);

  const statut = STATUTS[p.status];
  carte.insertAdjacentHTML('beforeend', `
    <div class="carte-corps">
      <div class="rangee" style="justify-content:space-between;margin-bottom:5px">
        <span class="badge ${statut.classe}">${statut.libelle}</span>
        <span class="pale">${p.slides.length} slide${p.slides.length > 1 ? 's' : ''}</span>
      </div>
      <div class="carte-titre">${echapper(p.title)}</div>
      <div class="carte-meta">
        ${ids.length} photo${ids.length > 1 ? 's' : ''}
        · ${p.canvas.width}×${p.canvas.height}
        <br>${p.publishedAt
          ? `publié le ${dateLisible(p.publishedAt)}`
          : `modifié le ${dateLisible(p.updatedAt)}`}
      </div>
    </div>
  `);

  const pied = document.createElement('div');
  pied.className = 'carte-pied';

  pied.appendChild(bouton('Ouvrir', 'btn-primaire', () => {
    location.href = `studio.html?projet=${p.id}`;
  }));

  if (p.status !== 'published') {
    pied.appendChild(bouton('Prêt', '', async () => {
      p.status = 'ready';
      await sauverProjet(p);
      await recharger();
      notifier('Marqué comme prêt à publier', 'succes');
    }));
    pied.appendChild(bouton("J'ai publié ce post", 'btn-doux', () => declarerPublication(p)));
  } else {
    pied.appendChild(bouton('Annuler la publication', '', async () => {
      const ok = await confirmer(
        'Annuler la publication ?',
        'Le post repasse en « prêt à publier ». Le projet et les photos sont conservés.',
        'Annuler la publication'
      );
      if (!ok) return;
      await annulerPublication(p.id);
      await recharger();
      notifier('Statut corrigé', 'succes');
    }));
  }

  pied.appendChild(bouton('Renommer', 'btn-fantome', async () => {
    const titre = await demander('Renommer le post', p.title);
    if (!titre) return;
    p.title = titre;
    await sauverProjet(p);
    await recharger();
  }));

  pied.appendChild(bouton('Supprimer', 'btn-fantome', async () => {
    const ok = await confirmer(
      'Supprimer ce projet ?',
      'Le projet de post est supprimé. Tes photos restent intactes dans la photothèque.',
      'Supprimer', true
    );
    if (!ok) return;
    await supprimer('projects', p.id);
    await recharger();
    notifier('Projet supprimé', 'succes');
  }));

  carte.appendChild(pied);
  return carte;
}

function bouton(libelle, classe, action) {
  const b = document.createElement('button');
  b.className = `btn btn-petit ${classe}`;
  b.textContent = libelle;
  b.onclick = e => { e.stopPropagation(); action(); };
  return b;
}

/* ---------- Déclaration de publication ---------- */

async function declarerPublication(p) {
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const dlg = document.createElement('dialog');
  dlg.innerHTML = `
    <form method="dialog">
      <div class="dialogue-entete"><h2>Tu as publié ce post ?</h2></div>
      <div class="dialogue-corps">
        <p class="doux">
          L'application ne vérifie pas Instagram : cette confirmation est déclarative.
          Le projet et les photos sont conservés, et tu pourras corriger si tu te trompes.
        </p>
        <label class="etiquette" for="date-publication">Date de publication</label>
        <input type="date" class="champ" id="date-publication" value="${aujourdhui}" max="${aujourdhui}">
      </div>
      <div class="dialogue-pied">
        <button class="btn" value="annuler" type="submit">Annuler</button>
        <button class="btn btn-primaire" value="ok" type="submit">Oui, c'est publié</button>
      </div>
    </form>
  `;
  document.body.appendChild(dlg);
  dlg.showModal();

  dlg.addEventListener('close', async () => {
    const valeur = dlg.querySelector('#date-publication').value;
    const accepte = dlg.returnValue === 'ok';
    dlg.remove();
    if (!accepte) return;

    await marquerPublie(p.id, valeur ? new Date(valeur).getTime() : Date.now());
    tousLesMedias = await assets();
    await recharger();
    notifier('Post marqué comme publié — les photos utilisées sont signalées', 'succes');
  });
}

/* ---------- Événements ---------- */

function brancherEvenements() {
  $('#btn-nouveau').onclick = async () => {
    const titre = await demander('Nouveau post', 'Nouveau post');
    if (!titre) return;
    const p = nouveauProjet(titre);
    await ecrire('projects', p);
    location.href = `studio.html?projet=${p.id}`;
  };

  document.querySelectorAll('[data-statut]').forEach(puce => {
    puce.onclick = () => {
      document.querySelectorAll('[data-statut]').forEach(p => p.classList.remove('actif'));
      puce.classList.add('actif');
      filtreStatut = puce.dataset.statut;
      dessiner();
    };
  });
}
