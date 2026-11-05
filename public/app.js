(function () {
  const root = document.getElementById("app");
  const $ = (id) => document.getElementById(id);

  // --- Chargement : logo rond qui tourne ------------------------------------
  document.body.insertAdjacentHTML("beforeend",
    '<div id="loader" role="status" aria-label="Chargement"><img src="logo-icon.png" alt=""></div>');
  let enCours = 0, loaderTimer = null;
  function loading(on) {
    enCours += on ? 1 : -1;
    if (on && enCours === 1) loaderTimer = setTimeout(() => $("loader").classList.add("show"), 250);
    if (enCours <= 0) { enCours = 0; clearTimeout(loaderTimer); $("loader").classList.remove("show"); }
  }

  // --- Utilitaires ---------------------------------------------------------
  const store = {
    get() { try { return localStorage.getItem("token"); } catch (e) { return null; } },
    set(t) { try { localStorage.setItem("token", t); } catch (e) {} },
    del() { try { localStorage.removeItem("token"); } catch (e) {} },
  };

  // silent = true : pas de logo de chargement (rafraîchissements automatiques)
  async function api(path, method, body, silent) {
    const headers = { "Content-Type": "application/json" };
    const t = store.get();
    if (t) headers.Authorization = "Bearer " + t;
    if (!silent) loading(true);
    try {
      const res = await fetch("/api" + path, { method: method || "GET", headers, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Une erreur est survenue");
      return data;
    } finally { if (!silent) loading(false); }
  }

  const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; };
  const go = (hash) => { location.hash = hash; };
  const fmt = (d) => new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  const NIV = { faible: "Faible", moyen: "Moyen", eleve: "Élevé" };
  const STAT = { nouvelle: "Nouvelle", vue: "Vue", traitee: "Traitée" };
  const badge = (cls, txt) => `<span class="badge ${cls}">${txt}</span>`;
  const fld = (n, l, t, x) => `<label for="${n}">${l}</label><input id="${n}" name="${n}" type="${t || "text"}" ${x || ""}>`;
  const opts = (obj, vide) => `<option value="">${vide}</option>` + Object.keys(obj).map((k) => `<option value="${k}">${obj[k]}</option>`).join("");

  function say(text, type, id) {
    const m = $(id || "msg");
    if (m) { m.textContent = text; m.className = "msg " + (type || ""); }
  }

  function onSubmit(form, handler, msgId) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      const data = Object.fromEntries(new FormData(form));
      btn.disabled = true; say("", "", msgId);
      try { await handler(data); } catch (err) { say(err.message, "error", msgId); }
      btn.disabled = false;
    });
  }

  // Bouton « Afficher / Masquer » sous chaque champ mot de passe
  function addEyes(scope) {
    scope.querySelectorAll("input[type=password]").forEach((inp) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "link eye"; b.textContent = "Afficher";
      b.onclick = () => { const v = inp.type === "password"; inp.type = v ? "text" : "password"; b.textContent = v ? "Masquer" : "Afficher"; };
      inp.after(b);
    });
  }

  // Rafraîchissement automatique de la page affichée (toutes les 30 s)
  let auto = null;
  const stopAuto = () => { clearInterval(auto); auto = null; };
  const setAuto = (fn, ms) => { stopAuto(); auto = setInterval(() => { if (!document.hidden) Promise.resolve().then(fn).catch(() => {}); }, ms || 30000); };

  // --- Pages publiques -----------------------------------------------------
  function authPage(titre, sousTitre, champs, bouton, liens) {
    const inputs = champs.map((c) => c.options
      ? `<label for="${c.name}">${c.label}</label><select id="${c.name}" name="${c.name}">${c.options}</select>`
      : fld(c.name, c.label, c.type, (c.extra || "") + " required")).join("");
    root.innerHTML = `
      <div class="auth">
        <aside class="auth-side">
          <img src="logo.jpg" alt="SamaTool">
          <h2>Mon champ, ma tranquillité.</h2>
          <ul><li>Détection automatique des intrus dans vos parcelles</li>
              <li>Alerte immédiate sur Telegram</li>
              <li>Pensé pour l’agriculture du Sine-Saloum</li></ul>
        </aside>
        <div class="auth-main"><div class="card">
          <img class="logo" src="logo.jpg" alt="SamaTool : mon champ, ma tranquillité">
          <h1>${titre}</h1><p class="sub">${sousTitre}</p>
          <form novalidate>${inputs}<button type="submit">${bouton}</button></form>
          <p id="msg" class="msg" role="status"></p>
          <div class="links">${liens}</div>
        </div></div>
      </div>`;
    addEyes(root);
    return root.querySelector("form");
  }

  function pageConnexion() {
    const f = authPage("Connexion", "Accédez à la surveillance de vos parcelles.",
      [{ name: "email", label: "Email", type: "email", extra: 'autocomplete="email"' },
       { name: "motDePasse", label: "Mot de passe", type: "password", extra: 'autocomplete="current-password"' }],
      "Se connecter",
      '<a href="#/inscription">Créer un compte</a><a href="#/mot-de-passe-oublie">Mot de passe oublié ?</a>');
    onSubmit(f, async (d) => { const r = await api("/auth/login", "POST", d); store.set(r.token); go("#/tableau-de-bord"); });
  }

  function pageInscription() {
    const f = authPage("Créer un compte", "Quelques secondes suffisent.",
      [{ name: "nom", label: "Nom complet", extra: 'autocomplete="name"' },
       { name: "email", label: "Email", type: "email", extra: 'autocomplete="email"' },
       { name: "motDePasse", label: "Mot de passe (8 caractères minimum)", type: "password", extra: 'autocomplete="new-password" minlength="8"' }],
      "S’inscrire", '<a href="#/connexion">J’ai déjà un compte</a><span></span>');
    onSubmit(f, async (d) => { const r = await api("/auth/register", "POST", d); store.set(r.token); go("#/tableau-de-bord"); });
  }

  function pageOubli() {
    const f = authPage("Mot de passe oublié", "Nous vous envoyons un lien de réinitialisation.",
      [{ name: "email", label: "Email", type: "email", extra: 'autocomplete="email"' },
       { name: "canal", label: "Recevoir le lien par", options: '<option value="email">Email</option><option value="telegram">Telegram (si votre compte est relié)</option>' }],
      "Envoyer le lien", '<a href="#/connexion">Retour à la connexion</a><span></span>');
    onSubmit(f, async (d) => say((await api("/auth/forgot-password", "POST", d)).message, "ok"));
  }

  function pageReinit(token) {
    const f = authPage("Nouveau mot de passe", "Choisissez un nouveau mot de passe.",
      [{ name: "motDePasse", label: "Nouveau mot de passe (8 caractères minimum)", type: "password", extra: 'autocomplete="new-password" minlength="8"' }],
      "Enregistrer", '<a href="#/connexion">Retour à la connexion</a><span></span>');
    onSubmit(f, async (d) => {
      say((await api("/auth/reset-password", "POST", { token, motDePasse: d.motDePasse })).message, "ok");
      setTimeout(() => go("#/connexion"), 1800);
    });
  }

  // --- Pages connectées : menu ---------------------------------------------
  let me = null;
  const ICONS = {
    dash: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    map: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/>',
    cam: '<path d="M3 8h3l2-3h8l2 3h3v11H3z"/><circle cx="12" cy="13" r="3.5"/>',
    bell: '<path d="M6 17v-6a6 6 0 1 1 12 0v6l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  };
  const ic = (n) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

  async function majBadge() {
    try {
      const { nouvelles } = await api("/alertes/stats/nouvelles", "GET", null, true);
      const b = $("nb");
      if (b) { b.textContent = nouvelles > 99 ? "99+" : nouvelles; b.hidden = !nouvelles; }
    } catch (e) {}
  }
  setInterval(() => { if (!document.hidden && store.get() && $("nb")) majBadge(); }, 30000);

  function layout(active, html) {
    const nav = [["tableau-de-bord", "Accueil", "dash"], ["parcelles", "Parcelles", "map"], ["cameras", "Matériel", "cam"],
                 ["alertes", "Alertes", "bell"], ["stats", "Stats", "chart"], ["parametres", "Paramètres", "gear"]]
      .map(([h, t, i]) => `<a href="#/${h}" class="${active === h || (h === "cameras" && active === "drones") ? "on" : ""}">${ic(i)}<span>${t}</span>${h === "alertes" ? '<b class="nb" id="nb" hidden></b>' : ""}</a>`).join("");
    root.innerHTML = `<div class="shell">
      <aside class="side">
        <div class="brand"><img src="logo-icon.png" alt="">SamaTool</div>
        <nav>${nav}</nav>
        <div class="user"><span>${esc(me.nom)}</span><button class="link" id="logout">Déconnexion</button></div>
      </aside>
      <main class="main"><div class="wrap">${html}</div></main></div>`;
    $("logout").onclick = async () => {
      try { await api("/auth/logout", "POST"); } catch (e) {}
      store.del(); go("#/connexion");
    };
    majBadge();
  }

  function tableAlertes(list) {
    if (!list.length) return `<div class="empty">${ic("bell")}<p>Aucune alerte pour le moment.</p></div>`;
    return `<div class="scroll"><table><thead><tr><th>Date</th><th>Parcelle</th><th>Intrus</th><th>Niveau</th><th>Statut</th><th></th></tr></thead><tbody>` +
      list.map((a) => `<tr><td>${fmt(a.detecteLe)}</td><td>${esc(a.parcelle ? a.parcelle.nom : "—")}</td>
        <td>${esc(a.typeIntrus)} (${Math.round(a.confiance * 100)} %)</td><td>${badge(a.niveau, NIV[a.niveau])}</td>
        <td>${badge("st-" + a.statut, STAT[a.statut])}</td><td><a href="#/alertes/${a._id}">Voir</a></td></tr>`).join("") + "</tbody></table></div>";
  }

  const bars = (vals, labs) => {
    const m = Math.max(1, ...vals);
    return `<div class="bars">${vals.map((v, i) => `<div class="bar" title="${esc(labs[i] || "")} : ${v}"><em>${v || ""}</em><i style="height:${Math.round(v / m * 100)}%"></i><span>${esc(labs[i] || "")}</span></div>`).join("")}</div>`;
  };

  const tempTxt = (o) => (o && o.temperature != null ? Math.round(o.temperature) + " °C" : "–");
  const sigTxt = (o) => {
    if (!o || o.signal == null) return "–";
    const q = o.signal > -60 ? "excellent" : o.signal > -70 ? "bon" : o.signal > -80 ? "moyen" : "faible";
    return Math.round(o.signal) + " dBm (" + q + ")";
  };

  async function telecharger(path, nom) {
    const r = await fetch("/api" + path, { headers: { Authorization: "Bearer " + store.get() } });
    if (!r.ok) throw new Error("Téléchargement impossible");
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url; a.download = nom; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportCsv() {
    const r = await fetch("/api/alertes/export", { headers: { Authorization: "Bearer " + store.get() } });
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url; a.download = "alertes-samatool.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // --- Tableau de bord ------------------------------------------------------
  async function pDash(silent) {
    const s = await api("/alertes/stats/resume", "GET", null, silent);
    const prenom = (me.nom || "").split(" ")[0];
    const etapes = [[s.nbParcelles > 0, "Dessinez votre première parcelle sur la carte", "#/parcelles"],
                    [s.camerasTotal > 0, "Associez une caméra à une parcelle", "#/cameras"],
                    [!!me.telegramChatId, "Reliez votre Telegram pour recevoir les alertes", "#/parametres"]];
    const depart = etapes.every((e) => e[0]) ? "" : `<section class="panel"><strong>Pour commencer</strong>
      <ul class="steps">${etapes.map(([ok, t, h]) => `<li class="${ok ? "ok" : ""}"><a href="${h}">${t}</a></li>`).join("")}</ul></section>`;
    const hors = s.horsLigne.length ? `<div class="warn">Caméra${s.horsLigne.length > 1 ? "s" : ""} hors ligne : <strong>${s.horsLigne.map(esc).join(", ")}</strong></div>` : "";
    const jours = s.parJour.map((j) => new Date(j.date).toLocaleDateString("fr-FR", { weekday: "short" }));
    layout("tableau-de-bord", `
      <section class="band">
        <h1>Bonjour, ${esc(prenom)}</h1>
        <p class="sub">${s.alertesAujourdhui ? "Des mouvements ont été détectés aujourd’hui." : "Rien à signaler aujourd’hui sur vos parcelles."}</p>
        <div class="stats">
          <div class="stat ${s.alertesAujourdhui ? "hot" : ""}"><div class="n">${s.alertesAujourdhui}</div><div class="t">Alertes du jour</div></div>
          <div class="stat"><div class="n">${s.parcellesActives}</div><div class="t">Parcelles actives</div></div>
          <div class="stat"><div class="n">${s.camerasEnLigne}/${s.camerasTotal}</div><div class="t">Caméras en ligne</div></div>
        </div>
      </section>${hors}${depart}
      <section class="panel"><strong>Alertes des 7 derniers jours</strong>${bars(s.parJour.map((j) => j.n), jours)}</section>
      <section class="panel"><strong>Dernières alertes</strong>${tableAlertes(s.dernieres)}</section>`);
    setAuto(() => pDash(true));
  }

  // --- Parcelles : carte, Sentinel-2 récent, tracé -------------------------
  function areaHa(pts) {
    const R = 6371008.8, lat0 = (pts.reduce((s, p) => s + p[0], 0) / pts.length) * Math.PI / 180;
    const xy = pts.map(([la, lo]) => [R * Math.cos(lat0) * lo * Math.PI / 180, R * la * Math.PI / 180]);
    let a = 0;
    for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; a += x1 * y2 - x2 * y1; }
    return Math.abs(a) / 2 / 10000;
  }

  // Sentinel-2 : mosaïque des scènes récentes (Microsoft Planetary Computer, sans clé), en couleurs naturelles ou en NDVI.
  // Sans date : les 90 derniers jours. Avec une date : +/- 20 jours autour de cette date (comparaison dans le temps).
  const PC = "https://planetarycomputer.microsoft.com/api";
  let pcSearchId = null;
  async function sentinelRecent(layer, info, opts) {
    opts = opts || {};
    try {
      const j = 864e5, centre = opts.date ? new Date(opts.date) : null;
      const debut = new Date((centre ? centre.getTime() - 20 * j : Date.now() - 90 * j)).toISOString().slice(0, 10) + "T00:00:00Z";
      const fin = centre ? new Date(centre.getTime() + 20 * j).toISOString().slice(0, 10) + "T23:59:59Z" : "..";
      const recherche = { collections: ["sentinel-2-l2a"], bbox: [-18, 12, -11, 17], datetime: debut + "/" + fin,
        query: { "eo:cloud_cover": { lt: 30 } }, sortby: [{ field: "datetime", direction: "desc" }] };
      const post = (u, b) => fetch(PC + u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })
        .then((r) => { if (!r.ok) throw new Error("PC " + r.status); return r.json(); });
      if (!pcSearchId) pcSearchId = (await post("/data/v1/mosaic/register", recherche)).searchid;
      const rendu = opts.ndvi
        ? "assets=B08&assets=B04&expression=(B08-B04)/(B08%2BB04)&asset_as_band=true&rescale=-1,1&colormap_name=rdylgn&nodata=0"
        : "assets=visual&asset_bidx=visual%7C1%2C2%2C3&nodata=0";
      layer.setUrl(`${PC}/data/v1/mosaic/tiles/${pcSearchId}/WebMercatorQuad/{z}/{x}/{y}@1x?${rendu}&format=png&collection=sentinel-2-l2a`);
      const f = ((await post("/stac/v1/search", { ...recherche, limit: 1 })).features || [])[0];
      if (info) info.textContent = f
        ? (opts.date ? "Image Sentinel-2 la plus récente de la période : " : "Dernière image Sentinel-2 : ") + new Date(f.properties.datetime).toLocaleDateString("fr-FR") + (opts.date ? "" : " (mise à jour automatique)")
        : "Aucune image Sentinel-2 peu nuageuse à cette période : essayez une autre date.";
    } catch (e) {
      pcSearchId = null;
      if (info) info.textContent = "Images Sentinel-2 indisponibles pour le moment : la mosaïque 2018 est affichée.";
    }
  }

  async function pParcelles() {
    const { parcelles } = await api("/parcelles");
    const table = parcelles.length
      ? `<div class="scroll"><table><thead><tr><th>Nom</th><th>Localisation</th><th>Culture</th><th>Superficie</th><th></th></tr></thead><tbody>` +
        parcelles.map((p) => `<tr><td>${esc(p.nom)}</td><td>${esc(p.localisation)}</td><td>${esc(p.culture)}</td><td>${p.superficieHa} ha</td>
          <td><button class="link" data-edit="${p._id}">Modifier</button><button class="link" data-del="${p._id}">Supprimer</button></td></tr>`).join("") +
        "</tbody></table></div>"
      : '<p class="sub">Aucune parcelle pour le moment.</p>';
    layout("parcelles", `<h1>Parcelles</h1>
      <section class="panel"><strong>Carte</strong>
        <p class="sub">Cherchez votre village, puis cliquez sur les coins de votre parcelle pour tracer son contour. Vous pouvez ensuite
        déplacer chaque point. La superficie se calcule toute seule. Le bouton en haut à droite de la carte change le fond et affiche ou masque les noms de lieux.</p>
        <form id="sf" class="filters" novalidate><div>${fld("q", "Rechercher un village ou une ville")}</div><button type="submit">Chercher</button></form>
        <p id="msgs" class="msg"></p>
        <div class="filters"><div><label for="s2mode">Image satellite</label><select id="s2mode"><option value="rgb">Couleurs naturelles</option><option value="ndvi">Végétation (NDVI)</option></select></div>
          <div>${fld("s2date", "Image proche du (vide = la plus récente)", "date")}</div></div>
        <p class="sub" id="ndvileg" hidden>NDVI : rouge = sol nu ou plantes en mauvais état, jaune = végétation faible, vert foncé = végétation dense. Changez la date pour comparer la même parcelle à deux périodes.</p>
        <div id="map"></div>
        <div class="actions"><button class="link" id="undo">Annuler le dernier point</button>
          <button class="link" id="clear">Effacer le tracé</button><button class="link" id="loc">Ma position</button></div>
        <p id="s2info" class="sub"></p><p id="surf" class="sub"></p></section>
      ${table}
      <section class="panel"><strong id="ftitle">Ajouter une parcelle</strong>
        <form id="pf" novalidate><input type="hidden" name="pid">
          ${fld("nom", "Nom")}${fld("localisation", "Localisation (village, commune…)")}${fld("culture", "Culture (arachide, mil…)")}
          ${fld("superficieHa", "Superficie (hectares)", "number", 'step="0.01" min="0"')}
          <p class="sub" style="margin:.9rem 0 0">Plage horaire de surveillance (heure du Sénégal). Laissez vide pour surveiller toute la journée ; la plage peut passer minuit (ex. 19:00 à 06:00).</p>
          ${fld("survDebut", "Surveillance de", "time")}${fld("survFin", "à", "time")}
          <button type="submit">Enregistrer</button></form><p id="msg" class="msg"></p></section>`);

    const f = $("pf");
    let pts = [], refresh = () => {}, fitTo = () => {}, map = null;
    if (window.L) {
      map = L.map("map").setView([14.15, -16.07], 10); // Kaolack, Sine-Saloum
      const mosaique = L.tileLayer("https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2018_3857/default/g/{z}/{y}/{x}.jpg",
        { maxNativeZoom: 13, maxZoom: 19, attribution: 'Mosaïque Sentinel-2 cloudless – <a href="https://s2maps.eu">s2maps.eu</a> par EOX IT Services GmbH (contient des données Copernicus Sentinel modifiées 2017-2018)' });
      const recent = L.tileLayer("data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
        { minZoom: 9, maxNativeZoom: 14, maxZoom: 19, attribution: "Sentinel-2 L2A récent : Copernicus / ESA, via Microsoft Planetary Computer" });
      const s2 = L.layerGroup([mosaique, recent]).addTo(map);
      const esri = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, attribution: "Esri World Imagery" });
      const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
      // Noms des lieux et routes : couches de référence Esri (sans clé), faites pour se superposer à l'imagerie satellite
      const esriRef = (nom, z) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Reference/${nom}/MapServer/tile/{z}/{y}/{x}`,
        { maxNativeZoom: 16, maxZoom: 19, zIndex: z, attribution: "Esri, HERE, Garmin, © OpenStreetMap" });
      const noms = esriRef("World_Boundaries_and_Places", 10).addTo(map);
      const routes = esriRef("World_Transportation", 9);
      L.control.layers({ "Sentinel-2 récent": s2, "Satellite haute résolution": esri, "Plan": osm },
        { "Noms des lieux et limites": noms, "Routes": routes }).addTo(map);
      sentinelRecent(recent, $("s2info"));
      const relancer = () => {
        pcSearchId = null;
        $("ndvileg").hidden = $("s2mode").value !== "ndvi";
        sentinelRecent(recent, $("s2info"), { ndvi: $("s2mode").value === "ndvi", date: $("s2date").value });
      };
      $("s2mode").onchange = relancer; $("s2date").onchange = relancer;

      const done = L.featureGroup().addTo(map), vertices = L.layerGroup().addTo(map);
      parcelles.filter((p) => p.contour && p.contour.length > 2).forEach((p) =>
        L.polygon(p.contour, { color: "#7be08f", weight: 2, fillOpacity: .2 }).bindTooltip(p.nom, { permanent: true, direction: "center" }).addTo(done));
      if (done.getLayers().length) map.fitBounds(done.getBounds(), { padding: [30, 30] });

      const draw = L.polygon([], { color: "#f4b81c", weight: 3, fillOpacity: .25 }).addTo(map);
      const maj = () => {
        if (pts.length > 2) {
          const ha = areaHa(pts);
          f.elements.superficieHa.value = ha.toFixed(2);
          $("surf").textContent = "Surface tracée : " + ha.toFixed(2) + " ha";
        } else $("surf").textContent = pts.length ? "Ajoutez au moins 3 points." : "";
      };
      refresh = () => {
        draw.setLatLngs(pts); vertices.clearLayers();
        pts.forEach((p, i) => L.marker(p, { draggable: true, icon: L.divIcon({ className: "vtx", iconSize: [16, 16] }) })
          .on("drag", (e) => { pts[i] = [e.latlng.lat, e.latlng.lng]; draw.setLatLngs(pts); maj(); })
          .addTo(vertices));
        maj();
      };
      fitTo = () => pts.length > 2 && map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
      map.on("click", (e) => { pts.push([e.latlng.lat, e.latlng.lng]); refresh(); });
      $("undo").onclick = () => { pts.pop(); refresh(); };
      $("clear").onclick = () => { pts = []; refresh(); };
      $("loc").onclick = () => map.locate({ setView: true, maxZoom: 16 });
    } else $("map").innerHTML = '<p class="sub" style="padding:1rem">La carte n’a pas pu se charger (vérifiez votre connexion).</p>';

    onSubmit($("sf"), async (d) => {
      if (!map) throw new Error("La carte n’est pas disponible");
      const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=sn&q=" + encodeURIComponent(d.q));
      const j = await r.json();
      if (!j.length) throw new Error("Lieu introuvable : essayez un autre nom");
      map.setView([+j[0].lat, +j[0].lon], 14);
      say(j[0].display_name, "ok", "msgs");
    }, "msgs");

    onSubmit(f, async (d) => {
      const body = { nom: d.nom, localisation: d.localisation, culture: d.culture, superficieHa: Number(d.superficieHa), surveillanceDebut: d.survDebut, surveillanceFin: d.survFin };
      if (pts.length > 2) body.contour = pts;
      if (d.pid) await api("/parcelles/" + d.pid, "PUT", body); else await api("/parcelles", "POST", body);
      pParcelles();
    });
    root.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => {
      const p = parcelles.find((x) => x._id === b.dataset.edit), e = f.elements;
      e.pid.value = p._id; e.nom.value = p.nom; e.localisation.value = p.localisation;
      e.culture.value = p.culture; e.superficieHa.value = p.superficieHa;
      e.survDebut.value = (p.surveillance && p.surveillance.debut) || ""; e.survFin.value = (p.surveillance && p.surveillance.fin) || "";
      pts = p.contour ? p.contour.map((x) => x.slice()) : []; refresh(); fitTo();
      $("ftitle").textContent = "Modifier la parcelle"; f.scrollIntoView();
    });
    root.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (!confirm("Supprimer cette parcelle, ses caméras et ses alertes ?")) return;
      await api("/parcelles/" + b.dataset.del, "DELETE"); pParcelles();
    });
  }

  // --- Caméras ---------------------------------------------------------------
  async function pCameras() {
    const [{ cameras }, { parcelles }] = await Promise.all([api("/cameras"), api("/parcelles")]);
    const table = cameras.length
      ? `<div class="scroll"><table><thead><tr><th>Caméra</th><th>Parcelle</th><th>État</th><th>Dernière activité</th><th>Température</th><th>Signal</th><th>Clé</th><th></th></tr></thead><tbody>` +
        cameras.map((c) => `<tr><td>${esc(c.nom)}</td><td>${esc(c.parcelle ? c.parcelle.nom : "—")}</td>
          <td>${c.enLigne ? badge("ok", "En ligne") : badge("off", "Hors ligne")}</td>
          <td>${c.lastSeenAt ? fmt(c.lastSeenAt) : "Jamais"}</td><td>${tempTxt(c.supervision)}</td><td>${sigTxt(c.supervision)}</td><td>${esc(c.apiKeyPrefix)}…</td>
          <td><button class="link" data-key="${c._id}" data-nom="${esc(c.nom)}">Nouvelle clé</button><button class="link" data-del="${c._id}">Supprimer</button></td></tr>`).join("") + "</tbody></table></div>"
      : '<p class="sub">Aucune caméra associée.</p>';
    const form = parcelles.length
      ? `<form id="cf" novalidate><label for="parcelle">Parcelle</label><select id="parcelle" name="parcelle">${parcelles.map((p) => `<option value="${p._id}">${esc(p.nom)}</option>`).join("")}</select>
          ${fld("nom", "Nom de la caméra (ex. ESP32-CAM Nord)")}<button type="submit">Associer la caméra</button></form>`
      : '<p class="sub">Créez d’abord une parcelle.</p>';
    layout("cameras", `<h1>Matériel</h1>${tabsMateriel("cameras")}<div id="keybox"></div>${table}
      <section class="panel"><strong>Associer une ESP32-CAM à une parcelle</strong>${form}<p id="msg" class="msg"></p>
        <p class="sub">Le Raspberry Pi envoie ses données à <code>${location.origin}/api/device/alertes</code> (alertes) et
        <code>/api/device/heartbeat</code> (signal de vie) avec l’en-tête <code>x-api-key</code>.</p></section>`);

    const showKey = (cle, nom) => {
      $("keybox").innerHTML = `<section class="panel keybox"><strong>Clé d’API de « ${esc(nom)} »</strong>
        <p class="sub">Copiez-la maintenant : elle ne sera plus affichée. Si vous la perdez, générez-en une nouvelle.</p>
        <code>${esc(cle)}</code><div class="actions"><button class="link" id="copy">Copier la clé</button></div></section>`;
      $("copy").onclick = () => navigator.clipboard.writeText(cle).then(() => { $("copy").textContent = "Copiée ✓"; }, () => { $("copy").textContent = "Sélectionnez et copiez la clé ci-dessus"; });
      $("keybox").scrollIntoView();
    };
    if ($("cf")) onSubmit($("cf"), async (d) => {
      const r = await api("/cameras", "POST", d);
      await pCameras();
      showKey(r.apiKey, r.camera.nom);
    });
    root.querySelectorAll("[data-key]").forEach((b) => b.onclick = async () => {
      if (!confirm("L’ancienne clé ne fonctionnera plus. Générer une nouvelle clé ?")) return;
      const r = await api("/cameras/" + b.dataset.key + "/cle", "POST");
      showKey(r.apiKey, b.dataset.nom);
    });
    root.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (!confirm("Supprimer cette caméra ?")) return;
      await api("/cameras/" + b.dataset.del, "DELETE"); pCameras();
    });
  }

  // --- Alertes : liste filtrée, pagination, mise à jour automatique ---------
  async function pAlertes() {
    const { parcelles } = await api("/parcelles");
    layout("alertes", `<h1>Alertes</h1>
      <section class="panel"><form id="ff" class="filters" novalidate>
        <div><label for="parcelle">Parcelle</label><select id="parcelle" name="parcelle"><option value="">Toutes</option>${parcelles.map((p) => `<option value="${p._id}">${esc(p.nom)}</option>`).join("")}</select></div>
        <div><label for="niveau">Niveau</label><select id="niveau" name="niveau">${opts(NIV, "Tous")}</select></div>
        <div><label for="statut">Statut</label><select id="statut" name="statut">${opts(STAT, "Tous")}</select></div>
        <div>${fld("du", "Du", "date")}</div><div>${fld("au", "Au", "date")}</div>
        <button type="submit">Filtrer</button></form>
        <div class="actions"><button class="link" id="test">Générer une alerte de test</button>
          <button class="link" id="csv">Exporter en CSV</button></div></section>
      <div id="list"></div><p id="msg" class="msg"></p>`);
    let page = 1, items = [];
    const charger = async (plus, silent) => {
      page = plus ? page + 1 : 1;
      const qs = new URLSearchParams(Object.entries(Object.fromEntries(new FormData($("ff")))).filter(([, v]) => v));
      qs.set("page", page);
      const r = await api("/alertes?" + qs, "GET", null, silent);
      items = plus ? items.concat(r.alertes) : r.alertes;
      $("list").innerHTML = tableAlertes(items) + (r.suite ? '<button class="link" id="more" style="margin-top:.8rem">Afficher plus d’alertes</button>' : "");
      if ($("more")) $("more").onclick = () => charger(true);
      majBadge();
    };
    onSubmit($("ff"), () => charger(false));
    $("test").onclick = async () => {
      try { await api("/alertes/test", "POST"); await charger(false); } catch (e) { say(e.message, "error"); }
    };
    $("csv").onclick = () => exportCsv().catch((e) => say(e.message, "error"));
    await charger(false);
    setAuto(() => (page === 1 && $("list") ? charger(false, true) : null));
  }

  // --- Détail d'une alerte -----------------------------------------------------
  async function pDetail(id) {
    const { alerte: a, explication } = await api("/alertes/" + id);
    if (a.statut === "nouvelle") { // ouverte = vue
      try { await api("/alertes/" + id, "PATCH", { statut: "vue" }, true); a.statut = "vue"; } catch (e) {}
    }
    const gps = a.position && a.position.lat != null;
    layout("alertes", `<p><a href="#/alertes">← Retour aux alertes</a></p><h1>Alerte : ${esc(a.typeIntrus)}</h1>
      <div class="imgbox" id="ib"><p class="sub">Chargement de l’image…</p></div>
      <section class="panel"><ul class="info">
        <li><strong>Parcelle :</strong> ${esc(a.parcelle ? a.parcelle.nom : "—")}</li>
        <li><strong>Source :</strong> ${a.source === "drone" ? "Drone " + esc(a.drone ? a.drone.nom : "") : "Caméra " + esc(a.camera ? a.camera.nom : "—")}${a.fusion ? " " + badge("eleve", "Confirmée drone + caméra") : ""}</li>
        <li><strong>Détectée le :</strong> ${fmt(a.detecteLe)}</li>
        <li><strong>Confiance :</strong> ${Math.round(a.confiance * 100)} %</li>
        <li><strong>Niveau :</strong> ${badge(a.niveau, NIV[a.niveau])}</li>
        <li><strong>Statut :</strong> ${STAT[a.statut]}</li></ul>
        <div class="actions"><button class="link" data-s="traitee">Marquer comme traitée</button>
        <button class="link" id="tg">Envoyer sur Telegram</button>
        <button class="link" id="supp" style="color:var(--red)">Supprimer</button></div><p id="msg" class="msg"></p></section>
      <section class="panel"><strong>Pourquoi ce niveau ?</strong>
        <ul class="info">${explication.map((t, i) => `<li${i ? "" : ' class="sub"'}>${esc(t)}</li>`).join("")}</ul></section>
      <section class="panel"><strong>Cette alerte était-elle réelle ?</strong>
        <p class="sub">Votre réponse permet de mesurer les fausses alertes et d’améliorer le modèle.</p>
        <p>${a.verdict ? badge(a.verdict === "vraie" ? "ok" : "off", a.verdict === "vraie" ? "Vraie alerte" : "Fausse alerte") : ""}</p>
        <div class="actions"><button class="link" data-v="vraie">Vraie alerte</button><button class="link" data-v="fausse">Fausse alerte</button></div></section>
      ${gps ? '<section class="panel"><strong>Position de la détection</strong><div id="mapd"></div></section>' : ""}`);
    root.querySelectorAll("[data-s]").forEach((b) => b.onclick = async () => {
      await api("/alertes/" + id, "PATCH", { statut: b.dataset.s }); pDetail(id);
    });
    root.querySelectorAll("[data-v]").forEach((b) => b.onclick = async () => {
      await api("/alertes/" + id + "/verdict", "PATCH", { verdict: b.dataset.v }); pDetail(id);
    });
    $("tg").onclick = async () => {
      try { say((await api("/alertes/" + id + "/telegram", "POST")).message, "ok"); } catch (e) { say(e.message, "error"); }
    };
    $("supp").onclick = async () => {
      if (!confirm("Supprimer définitivement cette alerte ?")) return;
      await api("/alertes/" + id, "DELETE"); go("#/alertes");
    };
    if (gps && window.L) { // la détection comme un point sur la carte de la parcelle
      const m = L.map("mapd").setView([a.position.lat, a.position.lng], 16);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxNativeZoom: 17, maxZoom: 19, attribution: "Esri World Imagery" }).addTo(m);
      if (a.parcelle && a.parcelle.contour && a.parcelle.contour.length > 2)
        L.polygon(a.parcelle.contour, { color: "#7be08f", weight: 2, fillOpacity: .15 }).addTo(m);
      L.circleMarker([a.position.lat, a.position.lng], { radius: 9, color: "#fff", weight: 2, fillColor: "#d9272e", fillOpacity: 1 }).addTo(m);
    }
    try {
      const r = await fetch("/api/alertes/" + id + "/image", { headers: { Authorization: "Bearer " + store.get() } });
      if (!r.ok) throw new Error();
      const url = URL.createObjectURL(await r.blob());
      $("ib").innerHTML = `<img src="${url}" alt="Image de l’alerte">` + a.boites.map((b) =>
        `<div class="box" style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.largeur * 100}%;height:${b.hauteur * 100}%">
         <span>${esc(b.classe)} ${Math.round(b.confiance * 100)} %</span></div>`).join("");
    } catch (e) { $("ib").innerHTML = '<p class="sub">Image indisponible.</p>'; }
  }

  // --- Statistiques ---------------------------------------------------------------
  async function pStats() {
    const s = await api("/alertes/stats/detail");
    const heures = s.parHeure.map((_, h) => (h % 3 === 0 ? h + "h" : ""));
    const max = Math.max(1, ...s.parType.map((t) => t.n));
    layout("stats", `<h1>Statistiques</h1><p class="sub">${s.total} alerte${s.total > 1 ? "s" : ""} enregistrée${s.total > 1 ? "s" : ""} (conservées 60 jours).</p>
      <section class="panel"><strong>Alertes par heure de la journée</strong>${bars(s.parHeure, heures)}</section>
      <section class="panel"><strong>Par type d’intrus</strong>${s.parType.length
        ? s.parType.map((t) => `<div class="hrow"><span>${esc(t.type)}</span><div><i style="width:${t.n / max * 100}%"></i></div><b>${t.n}</b></div>`).join("")
        : '<p class="sub">Pas encore de données.</p>'}</section>
      <section class="panel"><strong>Qualité de la détection</strong>${(() => { const e = s.verdicts.vraie + s.verdicts.fausse;
        return e ? `<p>${e} alerte${e > 1 ? "s" : ""} évaluée${e > 1 ? "s" : ""} : <strong>${s.verdicts.vraie}</strong> vraie${s.verdicts.vraie > 1 ? "s" : ""}, <strong>${s.verdicts.fausse}</strong> fausse${s.verdicts.fausse > 1 ? "s" : ""}.<br>Taux de fausses alertes : <strong>${Math.round(s.verdicts.fausse / e * 100)} %</strong></p>`
          : '<p class="sub">Marquez vos alertes « vraie » ou « fausse » sur leur page de détail pour mesurer les faux positifs du modèle.</p>'; })()}</section>
      <section class="panel"><strong>Par niveau</strong><p>${s.parNiveau.map((n) => badge(n.niveau, NIV[n.niveau]) + " " + n.n).join(" &nbsp; ") || '<span class="sub">Pas encore de données.</span>'}</p>
        <div class="actions"><button class="link" id="csv">Exporter toutes les alertes (CSV)</button></div></section>
      <section class="panel"><strong>Carte de chaleur des intrusions</strong>
        <p class="sub">Là où les intrus sont détectés le plus souvent (détections avec position GPS). Choisissez une plage horaire pour voir où et quand.</p>
        <div class="filters"><div><label for="hmin">De</label><select id="hmin">${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${h} h</option>`).join("")}</select></div>
          <div><label for="hmax">à</label><select id="hmax">${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${h} h</option>`).join("")}</select></div></div>
        <div id="maph"></div><p id="msgh" class="sub"></p></section>
      <section class="panel"><strong>Rapports PDF</strong>
        <p class="sub">Alertes, niveaux, types d’intrus, vols de drone et qualité de la détection. Le rapport automatique se règle dans Paramètres.</p>
        <div class="actions"><button class="link" id="pdf7">Télécharger : 7 jours</button><button class="link" id="pdf30">Télécharger : 30 jours</button>
          <button class="link" id="rtg">Envoyer sur Telegram</button></div><p id="msgr" class="msg"></p></section>`);
    $("csv").onclick = () => exportCsv();
    const pdf = (j) => telecharger("/alertes/rapport.pdf?jours=" + j, "rapport-samatool-" + j + "j.pdf").catch((e) => say(e.message, "error", "msgr"));
    $("pdf7").onclick = () => pdf(7); $("pdf30").onclick = () => pdf(30);
    $("rtg").onclick = async () => { try { say((await api("/alertes/rapport/telegram", "POST", { jours: 7 })).message, "ok", "msgr"); } catch (e) { say(e.message, "error", "msgr"); } };
    $("hmax").value = "23";
    if (window.L) {
      const mh = L.map("maph").setView([14.15, -16.07], 11);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxNativeZoom: 17, maxZoom: 19, attribution: "Esri World Imagery" }).addTo(mh);
      const { parcelles } = await api("/parcelles", "GET", null, true);
      const g = L.featureGroup(parcelles.filter((p) => p.contour && p.contour.length > 2)
        .map((p) => L.polygon(p.contour, { color: "#7be08f", weight: 2, fillOpacity: .08 }))).addTo(mh);
      if (g.getLayers().length) mh.fitBounds(g.getBounds(), { padding: [20, 20] });
      let couche = null;
      const heat = async () => {
        const { points } = await api(`/alertes/chaleur?hmin=${$("hmin").value}&hmax=${$("hmax").value}`, "GET", null, true);
        if (couche) mh.removeLayer(couche);
        couche = L.heatLayer
          ? L.heatLayer(points.map((p) => [p[0], p[1], 1]), { radius: 25, blur: 20, maxZoom: 17 })
          : L.layerGroup(points.map((p) => L.circleMarker(p, { radius: 14, stroke: false, fillColor: "#d9272e", fillOpacity: .2 })));
        couche.addTo(mh);
        $("msgh").textContent = points.length ? points.length + " détection" + (points.length > 1 ? "s" : "") + " géolocalisée" + (points.length > 1 ? "s" : "") + " sur cette plage horaire." : "Aucune détection géolocalisée sur cette plage horaire.";
      };
      $("hmin").onchange = heat; $("hmax").onchange = heat;
      heat();
    } else $("maph").innerHTML = '<p class="sub" style="padding:1rem">La carte n’a pas pu se charger.</p>';
  }

  // --- Paramètres : profil, mot de passe, Telegram, suppression du compte ---
  async function pParams() {
    const relie = !!me.telegramChatId;
    layout("parametres", `<h1>Paramètres</h1>
      <section class="panel"><strong>Mon profil</strong>
        <form id="prof" novalidate>${fld("nom", "Nom complet", "text", `value="${esc(me.nom)}" autocomplete="name"`)}
          ${fld("email", "Email", "email", `value="${esc(me.email)}" autocomplete="email"`)}
          <button type="submit">Enregistrer</button></form><p id="msg1" class="msg"></p></section>
      <section class="panel"><strong>Mot de passe</strong>
        <form id="pwd" novalidate>${fld("ancien", "Mot de passe actuel", "password", 'autocomplete="current-password"')}
          ${fld("nouveau", "Nouveau mot de passe (8 caractères minimum)", "password", 'autocomplete="new-password"')}
          ${fld("confirm", "Confirmer le nouveau mot de passe", "password", 'autocomplete="new-password"')}
          <button type="submit">Changer le mot de passe</button></form><p id="msg2" class="msg"></p></section>
      <section class="panel"><strong>Telegram</strong>
        <p class="sub">Recevez vos alertes avec la photo sur Telegram, et récupérez votre mot de passe par Telegram.</p>
        ${relie
          ? `<p>${badge("ok", "Telegram relié")}</p>
             <label for="niveauTg">Envoyer automatiquement les alertes de niveau</label>
             <select id="niveauTg"><option value="eleve">Élevé seulement</option><option value="moyen">Moyen et élevé</option><option value="faible">Toutes les alertes</option></select>
             <div class="actions"><button class="link" id="unlink">Délier mon Telegram</button></div>`
          : `<p>${badge("off", "Non relié")}</p><button type="button" id="link">Relier mon Telegram</button><div id="steps"></div>`}
        <p id="msg3" class="msg"></p></section>
      <section class="panel"><strong>SMS et WhatsApp</strong>
        <p class="sub">Un message pour chaque alerte de niveau élevé. Service payant (Twilio) à activer sur le serveur ; sans lui, rien n’est envoyé.</p>
        <form id="ct" novalidate>${fld("telephone", "Numéro de téléphone (format international, ex. +221770000000)", "tel", `value="${esc(me.telephone || "")}" autocomplete="tel"`)}
          <label class="chk"><input type="checkbox" id="sms" ${me.smsAlertes ? "checked" : ""}> Recevoir par SMS</label>
          <label class="chk"><input type="checkbox" id="wa" ${me.whatsappAlertes ? "checked" : ""}> Recevoir sur WhatsApp</label>
          <button type="submit">Enregistrer</button></form><p id="msg5" class="msg"></p></section>
      <section class="panel"><strong>Rapport automatique sur Telegram</strong>
        <p class="sub">Un PDF résumant vos alertes : chaque lundi (hebdomadaire) ou le 1er du mois (mensuel), à 07 h. Nécessite Telegram relié.</p>
        <select id="rapportAuto"><option value="aucun">Aucun</option><option value="hebdo">Hebdomadaire</option><option value="mensuel">Mensuel</option></select>
        <p id="msg6" class="msg"></p></section>
      <section class="panel"><strong>Notifications sur cet appareil</strong>
        <p class="sub" id="pushinfo">Vérification…</p><button type="button" id="push" hidden>Activer sur cet appareil</button><p id="msg7" class="msg"></p></section>
      <section class="panel danger"><strong>Supprimer mon compte</strong>
        <p class="sub">Efface définitivement votre compte, vos parcelles, vos caméras et vos alertes.</p>
        <form id="del" novalidate>${fld("motDePasse", "Votre mot de passe", "password", 'autocomplete="current-password"')}
          <button type="submit" style="background:var(--red);color:#fff">Supprimer définitivement mon compte</button></form><p id="msg4" class="msg"></p></section>`);
    addEyes(root);

    onSubmit($("prof"), async (d) => {
      me = (await api("/auth/profil", "PUT", d)).user;
      await pParams();
      say("Profil mis à jour.", "ok", "msg1");
    }, "msg1");
    onSubmit($("pwd"), async (d) => {
      if (d.nouveau !== d.confirm) throw new Error("Les deux nouveaux mots de passe ne sont pas identiques");
      const r = await api("/auth/mot-de-passe", "PUT", { ancien: d.ancien, nouveau: d.nouveau });
      $("pwd").reset();
      say(r.message, "ok", "msg2");
    }, "msg2");

    if (relie) {
      $("niveauTg").value = me.telegramNiveauMin || "eleve";
      $("niveauTg").onchange = async () => {
        try { me = (await api("/auth/telegram/niveau", "PUT", { niveau: $("niveauTg").value })).user; say("Enregistré.", "ok", "msg3"); }
        catch (e) { say(e.message, "error", "msg3"); }
      };
      $("unlink").onclick = async () => { me = (await api("/auth/telegram", "DELETE")).user; pParams(); };
    } else {
      $("link").onclick = async () => {
        try {
          const { lien } = await api("/auth/telegram/lien", "POST");
          $("steps").innerHTML = `<p>1. Ouvrez Telegram avec ce lien : <a href="${esc(lien)}" target="_blank" rel="noopener">${esc(lien)}</a><br>
            2. Appuyez sur <strong>Démarrer</strong> (Start).<br>3. Revenez ici et cliquez sur le bouton ci-dessous.</p>
            <button type="button" id="check">C’est fait, vérifier</button>`;
          $("check").onclick = () => guard(pParams);
        } catch (e) { say(e.message, "error", "msg3"); }
      };
    }

    onSubmit($("ct"), async (d) => {
      me = (await api("/auth/contact", "PUT", { telephone: d.telephone, sms: $("sms").checked, whatsapp: $("wa").checked })).user;
      say("Enregistré.", "ok", "msg5");
    }, "msg5");
    $("rapportAuto").value = me.rapportAuto || "aucun";
    $("rapportAuto").onchange = async () => {
      try { me = (await api("/auth/rapport-auto", "PUT", { rapport: $("rapportAuto").value })).user; say("Enregistré.", "ok", "msg6"); }
      catch (e) { say(e.message, "error", "msg6"); }
    };
    const urlB64 = (b) => { const t = (b + "=".repeat((4 - b.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(t), (c) => c.charCodeAt(0)); };
    if (!("serviceWorker" in navigator && "PushManager" in window && "Notification" in window)) {
      $("pushinfo").textContent = "Ce navigateur ne gère pas les notifications. Sur iPhone, ajoutez d’abord SamaTool à l’écran d’accueil.";
    } else {
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 3000))]);
      if (!reg) $("pushinfo").textContent = "Notifications indisponibles pour le moment : rechargez la page.";
      else {
        let sub = await reg.pushManager.getSubscription();
        const maj = () => {
          $("push").hidden = false;
          $("push").textContent = sub ? "Désactiver sur cet appareil" : "Activer sur cet appareil";
          $("pushinfo").textContent = sub ? "Notifications actives sur cet appareil." : "Recevez les alertes comme une notification du téléphone (au niveau choisi pour Telegram).";
        };
        maj();
        $("push").onclick = async () => {
          try {
            if (sub) { await api("/push/abonner", "DELETE", { endpoint: sub.endpoint }); await sub.unsubscribe(); sub = null; }
            else {
              if ((await Notification.requestPermission()) !== "granted") throw new Error("Autorisation refusée dans le navigateur");
              const { cle } = await api("/push/cle");
              sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(cle) });
              await api("/push/abonner", "POST", sub.toJSON());
            }
            maj(); say("Enregistré.", "ok", "msg7");
          } catch (e) { say(e.message, "error", "msg7"); }
        };
      }
    }

    onSubmit($("del"), async (d) => {
      if (!confirm("Cette action est définitive. Supprimer votre compte et toutes vos données ?")) return;
      await api("/auth/compte", "DELETE", { motDePasse: d.motDePasse });
      store.del(); go("#/connexion");
    }, "msg4");
  }

  // --- Matériel : onglets Caméras / Drones -----------------------------------------
  const tabsMateriel = (cur) => `<div class="tabs"><a href="#/cameras" class="${cur === "cameras" ? "on" : ""}">Caméras fixes</a><a href="#/drones" class="${cur === "drones" ? "on" : ""}">Drones</a></div>`;
  const ETAT = { au_sol: "Au sol", en_vol: "En vol", en_charge: "En charge", hors_ligne: "Hors ligne" };
  const ORDRE = { mission: "mission de vol", retour: "retour à la base", arret_urgence: "arrêt d’urgence" };
  const duree = (s) => (s == null ? "–" : Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") + " s");

  function carteDrone(d) {
    const etat = d.enLigne ? d.etat : "hors_ligne";
    const ordre = d.ordre && d.ordre.nature !== "aucune"
      ? `<p class="sub">Ordre en attente : ${ORDRE[d.ordre.nature]}${d.ordre.motif ? " (" + esc(d.ordre.motif) + ")" : ""}</p>` : "";
    const b = d.batterie == null ? null : Math.round(d.batterie);
    return `<section class="panel drone"><div class="dh"><strong>${esc(d.nom)}</strong>
        ${badge(etat === "en_vol" ? "ok" : etat === "hors_ligne" ? "off" : "moyen", ETAT[etat])}</div>
      <p class="sub">Parcelle : ${esc(d.parcelle ? d.parcelle.nom : "—")}. Dernier signal : ${d.lastSeenAt ? fmt(d.lastSeenAt) : "jamais"}.</p>
      <div class="batt ${b != null && b <= d.seuilBatterie ? "low" : ""}" title="Batterie"><i style="width:${b || 0}%"></i><span>${b == null ? "–" : b + " %"}</span></div><p class="sub">Température : ${tempTxt(d)} — Signal : ${sigTxt(d)}</p>${ordre}
      <div class="actions">
        <button class="link" data-act="mission" data-id="${d._id}">Vol de couverture</button>
        <button class="link" data-act="retour" data-id="${d._id}">Retour à la base</button>
        <button class="stop" data-act="urgence" data-id="${d._id}">Arrêt d’urgence</button>
        <button class="link" data-act="reg" data-id="${d._id}">Réglages</button>
        <button class="link" data-act="cle" data-id="${d._id}" data-nom="${esc(d.nom)}">Nouvelle clé</button>
        <button class="link" data-act="supp" data-id="${d._id}">Supprimer</button></div></section>`;
  }

  async function pDrones() {
    const { parcelles } = await api("/parcelles");
    const form = parcelles.length
      ? `<form id="df" novalidate><label for="parcelle">Parcelle surveillée</label><select id="parcelle" name="parcelle">${parcelles.map((p) => `<option value="${p._id}">${esc(p.nom)}</option>`).join("")}</select>
          ${fld("nom", "Nom du drone")}<button type="submit">Ajouter le drone</button></form>`
      : '<p class="sub">Créez d’abord une parcelle et tracez son contour.</p>';
    layout("drones", `<h1>Matériel</h1>${tabsMateriel("drones")}<div id="keybox"></div>
      <section class="panel"><strong>Suivi en direct</strong><p class="sub" id="liveinfo">Chargement…</p><div id="map"></div></section>
      <p id="msgd" class="msg"></p><div id="liste"></div><div id="reglages"></div>
      <section class="panel"><strong>Ajouter un drone</strong>${form}<p id="msg" class="msg"></p>
        <p class="sub">Le type de drone sera choisi plus tard : le drone envoie sa position et sa batterie à <code>/api/drone/telemetrie</code>
        avec l’en-tête <code>x-api-key</code> et reçoit en réponse l’ordre à exécuter (mission, retour, arrêt d’urgence).</p></section>
      <section class="panel"><strong>Historique des vols</strong><div id="vols"></div></section>`);

    let drones = [], map = null, premiere = true, couches = {};
    if (window.L) {
      map = L.map("map").setView([14.15, -16.07], 11);
      const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxNativeZoom: 17, maxZoom: 19, attribution: "Esri World Imagery" }).addTo(map);
      const noms = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxNativeZoom: 16, maxZoom: 19, zIndex: 10, attribution: "Esri, HERE, Garmin, © OpenStreetMap" }).addTo(map);
      couches = { contours: L.layerGroup().addTo(map), alertes: L.layerGroup().addTo(map), drones: L.layerGroup().addTo(map), vol: L.layerGroup().addTo(map) };
      L.control.layers({ "Satellite": sat }, { "Noms des lieux": noms, "Contours des parcelles": couches.contours,
        "Alertes (GPS)": couches.alertes, "Drones et trajets": couches.drones, "Vol sélectionné": couches.vol }).addTo(map);
    } else $("map").innerHTML = '<p class="sub" style="padding:1rem">La carte n’a pas pu se charger (vérifiez votre connexion).</p>';

    const COUL = { faible: "#2e8b3d", moyen: "#f4b81c", eleve: "#d9272e" };
    function dessiner(live) {
      if (!map) return;
      Object.values(couches).forEach((g) => { if (g !== couches.vol) g.clearLayers(); });
      const tout = [];
      live.parcelles.filter((p) => p.contour && p.contour.length > 2).forEach((p) => {
        L.polygon(p.contour, { color: "#7be08f", weight: 2, fillOpacity: .12 }).bindTooltip(p.nom).addTo(couches.contours);
        tout.push(...p.contour);
      });
      live.alertes.forEach((a) => L.circleMarker([a.position.lat, a.position.lng], { radius: 6, color: "#fff", weight: 1.5, fillColor: COUL[a.niveau], fillOpacity: .95 })
        .bindTooltip(`${a.typeIntrus} (${NIV[a.niveau]}), ${fmt(a.detecteLe)}`).addTo(couches.alertes));
      live.drones.forEach((d) => {
        const v = d.volCourant;
        if (v && v.plan && v.plan.length > 1) L.polyline(v.plan, { color: "#fff", weight: 2, opacity: .7, dashArray: "6 6" }).addTo(couches.drones);
        if (v && v.trajet && v.trajet.length > 1) L.polyline(v.trajet, { color: "#f4b81c", weight: 4 }).addTo(couches.drones);
        if (d.position && d.position.lat != null) {
          L.marker([d.position.lat, d.position.lng], { icon: L.divIcon({ className: "dr" + (d.enLigne ? "" : " off"), html: "✈", iconSize: [30, 30] }) })
            .bindTooltip(`${d.nom} : ${ETAT[d.enLigne ? d.etat : "hors_ligne"]}, batterie ${d.batterie == null ? "–" : Math.round(d.batterie) + " %"}`).addTo(couches.drones);
          tout.push([d.position.lat, d.position.lng]);
        }
      });
      if (premiere && tout.length) { map.fitBounds(L.latLngBounds(tout), { padding: [30, 30], maxZoom: 17 }); premiere = false; }
    }

    const tableVols = (vols) => !vols.length ? '<p class="sub">Aucun vol pour le moment.</p>'
      : `<div class="scroll"><table><thead><tr><th>Date</th><th>Drone</th><th>Type</th><th>Statut</th><th>Durée</th><th>Surface</th><th>Alertes</th><th></th></tr></thead><tbody>` +
        vols.map((v) => `<tr><td>${fmt(v.debut || v.createdAt)}</td><td>${esc(v.drone ? v.drone.nom : "—")}</td>
          <td>${v.type === "couverture" ? "Couverture" : "Vérification"} (${{ manuel: "manuel", patrouille: "patrouille", alerte: "sur alerte" }[v.declencheur]})</td>
          <td>${badge({ planifie: "off", en_cours: "moyen", termine: "ok", interrompu: "eleve" }[v.statut], { planifie: "Planifié", en_cours: "En cours", termine: "Terminé", interrompu: "Interrompu" }[v.statut])}</td>
          <td>${duree(v.dureeS)}</td><td>${v.type === "couverture" ? v.surfaceHa + " ha" : "–"}</td><td>${v.nbAlertes}</td>
          <td><button class="link" data-vol="${v._id}">Voir le trajet</button></td></tr>`).join("") + "</tbody></table></div>";

    async function rafraichir(silent) {
      const [live, { vols }] = await Promise.all([api("/drones/live", "GET", null, silent), api("/drones/vols/liste", "GET", null, silent)]);
      drones = live.drones;
      $("liste").innerHTML = drones.length ? drones.map(carteDrone).join("") : '<section class="panel"><p class="sub">Aucun drone enregistré.</p></section>';
      $("vols").innerHTML = tableVols(vols);
      const enLigne = drones.filter((d) => d.enLigne).length;
      $("liveinfo").textContent = drones.length ? `${enLigne} drone${enLigne > 1 ? "s" : ""} en ligne sur ${drones.length}. La carte se met à jour toutes les 6 secondes.` : "Aucun drone pour le moment.";
      dessiner(live);
    }

    const montrerCle = (cle, nom) => {
      $("keybox").innerHTML = `<section class="panel keybox"><strong>Clé d’API de « ${esc(nom)} »</strong>
        <p class="sub">Copiez-la maintenant : elle ne sera plus affichée.</p><code>${esc(cle)}</code>
        <div class="actions"><button class="link" id="copy">Copier la clé</button></div></section>`;
      $("copy").onclick = () => navigator.clipboard.writeText(cle).then(() => { $("copy").textContent = "Copiée ✓"; }, () => { $("copy").textContent = "Copiez la clé ci-dessus"; });
      $("keybox").scrollIntoView();
    };

    $("liste").onclick = async (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      const id = b.dataset.id, d = drones.find((x) => x._id === id);
      try {
        if (b.dataset.act === "mission") say((await api("/drones/" + id + "/mission", "POST")).message, "ok", "msgd");
        else if (b.dataset.act === "retour") say((await api("/drones/" + id + "/retour", "POST")).message, "ok", "msgd");
        else if (b.dataset.act === "urgence") {
          if (!confirm("Arrêt d’urgence : le drone doit atterrir immédiatement. Confirmer ?")) return;
          say((await api("/drones/" + id + "/urgence", "POST")).message, "ok", "msgd");
        } else if (b.dataset.act === "cle") {
          if (!confirm("L’ancienne clé ne fonctionnera plus. Générer une nouvelle clé ?")) return;
          montrerCle((await api("/drones/" + id + "/cle", "POST")).apiKey, b.dataset.nom);
        } else if (b.dataset.act === "supp") {
          if (!confirm("Supprimer ce drone et son historique de vols ?")) return;
          await api("/drones/" + id, "DELETE");
        } else if (b.dataset.act === "reg") {
          $("reglages").innerHTML = `<section class="panel"><strong>Réglages de « ${esc(d.nom)} »</strong>
            <form id="rf" novalidate>${fld("seuilBatterie", "Retour automatique si la batterie passe sous (%)", "number", `min="10" max="60" value="${d.seuilBatterie}"`)}
              ${fld("patrouilles", "Patrouilles chaque jour à (heures séparées par des virgules, ex. 06:30, 17:00)", "text", `value="${esc((d.patrouilles || []).join(", "))}"`)}
              <label for="verifierSurAlerte">Décoller pour vérifier une alerte d’une caméra fixe</label>
              <select id="verifierSurAlerte" name="verifierSurAlerte"><option value="oui">Oui</option><option value="non">Non</option></select>
              <button type="submit">Enregistrer les réglages</button></form><p id="msgr" class="msg"></p></section>`;
          $("verifierSurAlerte").value = d.verifierSurAlerte ? "oui" : "non";
          onSubmit($("rf"), async (f) => {
            await api("/drones/" + id, "PUT", { seuilBatterie: Number(f.seuilBatterie),
              patrouilles: f.patrouilles.split(",").map((h) => h.trim()).filter(Boolean), verifierSurAlerte: f.verifierSurAlerte === "oui" });
            say("Réglages enregistrés.", "ok", "msgr"); rafraichir(true);
          }, "msgr");
          $("reglages").scrollIntoView();
          return;
        }
        rafraichir(true);
      } catch (err) { say(err.message, "error", "msgd"); }
    };

    $("vols").onclick = async (e) => {
      const b = e.target.closest("button[data-vol]");
      if (!b || !map) return;
      const { vol } = await api("/drones/vols/" + b.dataset.vol);
      couches.vol.clearLayers();
      if (vol.plan.length > 1) L.polyline(vol.plan, { color: "#fff", weight: 2, opacity: .7, dashArray: "6 6" }).addTo(couches.vol);
      const pts = vol.trajet.length ? vol.trajet : vol.plan;
      if (vol.trajet.length > 1) L.polyline(vol.trajet, { color: "#7be08f", weight: 4 }).addTo(couches.vol);
      if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 17 });
      $("map").scrollIntoView();
    };

    if ($("df")) onSubmit($("df"), async (d) => {
      const r = await api("/drones", "POST", d);
      await pDrones();
      $("keybox").innerHTML = ""; // le panneau a été recréé
      document.getElementById("keybox").innerHTML = `<section class="panel keybox"><strong>Clé d’API de « ${esc(r.drone.nom)} »</strong>
        <p class="sub">Copiez-la maintenant : elle ne sera plus affichée.</p><code>${esc(r.apiKey)}</code>
        <div class="actions"><button class="link" id="copy">Copier la clé</button></div></section>`;
      $("copy").onclick = () => navigator.clipboard.writeText(r.apiKey).then(() => { $("copy").textContent = "Copiée ✓"; }, () => { $("copy").textContent = "Copiez la clé ci-dessus"; });
    });

    await rafraichir(false);
    setAuto(() => rafraichir(true), 6000);
  }

  // --- Routeur -----------------------------------------------------------------------
  async function guard(fn, arg) {
    if (!store.get()) return go("#/connexion");
    try { me = (await api("/auth/me")).user; } catch (e) { store.del(); return go("#/connexion"); }
    try { await fn(arg); } catch (e) {
      root.innerHTML = `<div class="center"><div class="card"><h1>Erreur</h1><p>${esc(e.message)}</p><a href="#/tableau-de-bord">Retour au tableau de bord</a></div></div>`;
    }
  }

  function route() {
    stopAuto();
    const p = (location.hash || "#/connexion").split("/");
    switch (p[1]) {
      case "inscription": return pageInscription();
      case "mot-de-passe-oublie": return pageOubli();
      case "reinitialiser": return pageReinit(decodeURIComponent(p[2] || ""));
      case "tableau-de-bord": return guard(pDash);
      case "parcelles": return guard(pParcelles);
      case "cameras": return guard(pCameras);
      case "stats": return guard(pStats);
      case "drones": return guard(pDrones);
      case "parametres": return guard(pParams);
      case "notifications": return go("#/parametres");
      case "alertes": return p[2] ? guard(pDetail, p[2]) : guard(pAlertes);
      default: return store.get() ? go("#/tableau-de-bord") : pageConnexion();
    }
  }

  window.addEventListener("hashchange", route);
  route();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
