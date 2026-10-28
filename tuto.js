/* ============================================
   PETSITTING — tuto.js
   Visite guidée de l'accueil : se lance seule la première fois,
   et peut être relancée depuis « Compte » > « Revoir le tuto ».
   ============================================ */
(function () {
  var STEPS = [
    { title: "Bienvenue sur Pet Sitting !", text: "Petite visite de l'appli en 1 minute. Tu pourras la revoir quand tu veux depuis ton compte." },
    { sel: "#reminders", title: "À ne pas oublier", text: "Ici s'affichent les rappels du jour et du lendemain : débuts et fins de garde, clés à récupérer ou à rendre." },
    { sel: "#newProfileBtn", title: "Créer une fiche", text: "Une fiche par client : ses coordonnées, ses animaux (avec photo et caractère) et ses prestations." },
    { sel: "#importMissionBtn", title: "Importer un mail de mission", text: "Colle le mail reçu de ta plateforme : l'appli remplit la fiche et la prestation toute seule." },
    { sel: "#homeTabs", title: "Fiches et prestations", text: "Ces onglets rangent tous tes clients et toutes tes missions." },
    { sel: "#siteBar .site-tabs", title: "Tes sites", text: "Si tu travailles pour plusieurs plateformes, chaque site a son onglet. « Tous » regroupe tout." },
    { sel: "#calBtn", title: "Le calendrier", text: "Toutes tes gardes du mois, une couleur par animal, et les rendez-vous de clés." },
    { sel: "#ajourBtn", title: "À jour", text: "Les paiements en attente et les clés pas encore rendues. Coche dès que c'est réglé." },
    { sel: "#statTotalBox", title: "Ton budget", text: "Touche ton total pour voir ton chiffre d'affaires par mois, par client et par formule." },
    { sel: "#mapClientsBtn", parent: true, title: "Carte et itinéraire", text: "Tes clients sur une carte, et l'ordre de passage le plus rapide pour ta tournée du jour." },
    { sel: "#accountBtn", title: "Ton compte", text: "Tes préférences, tes sites, les rappels sur le téléphone… et le bouton pour revoir ce tuto." },
    { sel: ".app-footer-links", title: "Aide et bug", text: "Un souci ou une question ? Tout en bas de chaque page, envoie-nous un message." },
    { title: "C'est parti !", text: "Commence par créer ta première fiche client. Bonnes gardes !" }
  ];

  var css = "" +
    ".tuto-back{position:fixed;inset:0;z-index:9998;background:transparent}" +
    ".tuto-hole{position:fixed;z-index:9999;border-radius:16px;box-shadow:0 0 0 9999px rgba(43,43,43,.58);transition:all .3s ease;pointer-events:none}" +
    ".tuto-hole.center{left:50%;top:40%;width:0;height:0}" +
    ".tuto-card{position:fixed;z-index:10000;left:16px;right:16px;max-width:420px;margin:0 auto;background:#fff;border-radius:18px;padding:16px 18px;box-shadow:0 10px 30px rgba(43,43,43,.25);transition:top .3s ease;font-family:inherit;color:#2B2B2B}" +
    ".tuto-card h3{margin:0 0 6px;font-size:18px;color:var(--accent-dk,#954A51)}" +
    ".tuto-card p{margin:0 0 12px;font-size:15px;line-height:1.45}" +
    ".tuto-nav{display:flex;align-items:center;gap:8px}" +
    ".tuto-dots{flex:1;font-size:12px;color:var(--text-lt,#5B4B4D)}" +
    ".tuto-nav button{border:none;border-radius:12px;padding:9px 14px;font:inherit;font-weight:700;font-size:14px;cursor:pointer}" +
    ".tuto-skip{background:transparent;color:var(--text-lt,#5B4B4D)}" +
    ".tuto-prev{background:var(--accent-lt,#FCD8CC);color:var(--accent-dk,#954A51)}" +
    ".tuto-next{background:var(--accent,#EF878B);color:#fff}";

  var idx = 0, steps = [], hole, card, back;

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }
  function target(s) {
    if (!s.sel) return null;
    var el = document.querySelector(s.sel);
    if (el && s.parent) el = el.parentElement;
    return visible(el) ? el : null;
  }

  function place() {
    var s = steps[idx], el = target(s);
    if (!el) {
      hole.classList.add("center");
      hole.style.cssText = "";
      card.style.top = Math.max(16, window.innerHeight * 0.3) + "px";
      return;
    }
    hole.classList.remove("center");
    var r = el.getBoundingClientRect(), pad = 6;
    hole.style.left = (r.left - pad) + "px";
    hole.style.top = (r.top - pad) + "px";
    hole.style.width = (r.width + pad * 2) + "px";
    hole.style.height = (r.height + pad * 2) + "px";
    var ch = card.offsetHeight || 170;
    var below = r.bottom + 14, above = r.top - ch - 14;
    card.style.top = (below + ch < window.innerHeight - 8 ? below : Math.max(8, above)) + "px";
  }

  function show() {
    var s = steps[idx];
    card.innerHTML =
      "<h3>" + s.title + "</h3><p>" + s.text + "</p>" +
      '<div class="tuto-nav"><span class="tuto-dots">' + (idx + 1) + " / " + steps.length + "</span>" +
      (idx < steps.length - 1 ? '<button class="tuto-skip">Passer</button>' : "") +
      (idx > 0 ? '<button class="tuto-prev">Précédent</button>' : "") +
      '<button class="tuto-next">' + (idx === steps.length - 1 ? "Terminer" : "Suivant") + "</button></div>";
    card.querySelector(".tuto-next").onclick = function () { idx < steps.length - 1 ? (idx++, show()) : end(); };
    var p = card.querySelector(".tuto-prev"); if (p) p.onclick = function () { idx--; show(); };
    var k = card.querySelector(".tuto-skip"); if (k) k.onclick = end;
    var el = target(s);
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 200) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(place, 450);
      }
    }
    place();
  }

  function markDone() {
    try {
      var p = typeof getPrefs === "function" ? getPrefs() : {};
      if (!p.tuto_done) { p.tuto_done = true; if (typeof savePrefs === "function") savePrefs(p); }
      localStorage.setItem(userKeySafe(), "1");
    } catch (e) {}
  }
  function userKeySafe() { return "cs-" + (localStorage.getItem("cs-current-user") || "guest") + "-tuto"; }

  function end() {
    markDone();
    [hole, card, back].forEach(function (n) { if (n) n.remove(); });
    hole = card = back = null;
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  window.startTuto = function () {
    if (card) return;
    document.querySelectorAll(".modal-overlay.open").forEach(function (m) { m.classList.remove("open"); });
    if (typeof window.showHomeTab === "function") window.showHomeTab("home");
    else { var h = document.querySelector('[data-hometab="home"]'); if (h) h.click(); }
    if (!document.getElementById("tutoCss")) {
      var st = document.createElement("style"); st.id = "tutoCss"; st.textContent = css; document.head.appendChild(st);
    }
    steps = STEPS.filter(function (s) { return !s.sel || target(s); });
    idx = 0;
    back = document.createElement("div"); back.className = "tuto-back";
    hole = document.createElement("div"); hole.className = "tuto-hole center";
    card = document.createElement("div"); card.className = "tuto-card";
    document.body.append(back, hole, card);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.scrollTo({ top: 0 });
    show();
  };

  /* Lancement automatique la première fois (après la fenêtre « D'où viens-tu ? » éventuelle) */
  window.maybeStartTuto = function () {
    try {
      var p = typeof getPrefs === "function" ? getPrefs() : {};
      if (p.tuto_done || localStorage.getItem(userKeySafe()) === "1") return;
    } catch (e) { return; }
    var tries = 0;
    (function wait() {
      if (document.querySelector(".modal-overlay.open")) { if (++tries < 600) setTimeout(wait, 500); return; }
      setTimeout(window.startTuto, 400);
    })();
  };
})();
