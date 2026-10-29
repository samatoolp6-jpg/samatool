(function () {
  const root = document.getElementById("app");

  // --- Utilitaires ---------------------------------------------------------
  const store = {
    get() { try { return localStorage.getItem("token"); } catch (e) { return null; } },
    set(t) { try { localStorage.setItem("token", t); } catch (e) {} },
    del() { try { localStorage.removeItem("token"); } catch (e) {} },
  };

  async function api(path, method, body) {
    const headers = { "Content-Type": "application/json" };
    const t = store.get();
    if (t) headers.Authorization = "Bearer " + t;
    const res = await fetch("/api" + path, {
      method: method || "GET", headers, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Une erreur est survenue");
    return data;
  }

  const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; };
  const go = (hash) => { location.hash = hash; };
  const fmt = (d) => new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  const $ = (id) => document.getElementById(id);
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

  // --- Pages publiques (connexion, inscription, mot de passe) ---------------
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

  // --- Pages connectées ----------------------------------------------------
  let me = null;

  const ICONS = {
    dash: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    map: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/>',
    cam: '<path d="M3 8h3l2-3h8l2 3h3v11H3z"/><circle cx="12" cy="13" r="3.5"/>',
    bell: '<path d="M6 17v-6a6 6 0 1 1 12 0v6l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    send: '<path d="M21 3L3 11l7 2 2 7z"/><path d="M10 13L21 3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  };
  const ic = (n) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

  function layout(active, html) {
    const nav = [["tableau-de-bord", "Accueil", "dash"], ["parcelles", "Parcelles", "map"], ["cameras", "Caméras", "cam"],
                 ["alertes", "Alertes", "bell"], ["notifications", "Telegram", "send"], ["parametres", "Paramètres", "gear"]]
      .map(([h, t, i]) => `<a href="#/${h}" class="${active === h ? "on" : ""}">${ic(i)}<span>${t}</span></a>`).join("");
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
  }

  function tableAlertes(list) {
    if (!list.length) return `<div class="empty">${ic("bell")}<p>Aucune alerte pour le moment.</p></div>`;
    return `<div class="scroll"><table><thead><tr><th>Date</th><th>Parcelle</th><th>Intrus</th><th>Niveau</th><th>Statut</th><th></th></tr></thead><tbody>` +
      list.map((a) => `<tr><td>${fmt(a.detecteLe)}</td><td>${esc(a.parcelle ? a.parcelle.nom : "—")}</td>
        <td>${esc(a.typeIntrus)} (${Math.round(a.confiance * 100)} %)</td><td>${badge(a.niveau, NIV[a.niveau])}</td>
        <td>${badge("st-" + a.statut, STAT[a.statut])}</td><td><a href="#/alertes/${a._id}">Voir</a></td></tr>`).join("") + "</tbody></table></div>";
  }

  // 8. Tableau de bord
  async function pDash() {
    const s = await api("/alertes/stats/resume");
    const prenom = (me.nom || "").split(" ")[0];
    layout("tableau-de-bord", `
      <section class="band">
        <h1>Bonjour, ${esc(prenom)}</h1>
        <p class="sub">${s.alertesAujourdhui ? "Des mouvements ont été détectés aujourd’hui." : "Rien à signaler aujourd’hui sur vos parcelles."}</p>
        <div class="stats">
          <div class="stat ${s.alertesAujourdhui ? "hot" : ""}"><div class="n">${s.alertesAujourdhui}</div><div class="t">Alertes du jour</div></div>
          <div class="stat"><div class="n">${s.parcellesActives}</div><div class="t">Parcelles actives</div></div>
          <div class="stat"><div class="n">${s.camerasEnLigne}/${s.camerasTotal}</div><div class="t">Caméras en ligne</div></div>
        </div>
      </section>
      <section class="panel"><strong>Dernières alertes</strong>${tableAlertes(s.dernieres)}</section>`);
  }

  // 2. Parcelles : carte Sentinel-2 pour tracer le contour
  function areaHa(pts) {
    const R = 6371008.8, lat0 = (pts.reduce((s, p) => s + p[0], 0) / pts.length) * Math.PI / 180;
    const xy = pts.map(([la, lo]) => [R * Math.cos(lat0) * lo * Math.PI / 180, R * la * Math.PI / 180]);
    let a = 0;
    for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; a += x1 * y2 - x2 * y1; }
    return Math.abs(a) / 2 / 10000;
  }

  // Sentinel-2 récent : mosaïque des scènes des 90 derniers jours (Microsoft Planetary Computer, sans clé)
  const PC = "https://planetarycomputer.microsoft.com/api";
  let pcSearchId = null;
  async function sentinelRecent(layer, info) {
    try {
      const debut = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10) + "T00:00:00Z";
      const recherche = { collections: ["sentinel-2-l2a"], bbox: [-18, 12, -11, 17], datetime: debut + "/..",
        query: { "eo:cloud_cover": { lt: 30 } }, sortby: [{ field: "datetime", direction: "desc" }] };
      const post = (u, b) => fetch(PC + u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })
        .then((r) => { if (!r.ok) throw new Error("PC " + r.status); return r.json(); });
      if (!pcSearchId) pcSearchId = (await post("/data/v1/mosaic/register", recherche)).searchid;
      layer.setUrl(`${PC}/data/v1/mosaic/tiles/${pcSearchId}/WebMercatorQuad/{z}/{x}/{y}@1x?assets=visual&asset_bidx=visual%7C1%2C2%2C3&nodata=0&format=png&collection=sentinel-2-l2a`);
      const f = ((await post("/stac/v1/search", { ...recherche, limit: 1 })).features || [])[0];
      if (f && info) info.textContent = "Dernière image Sentinel-2 : " + new Date(f.properties.datetime).toLocaleDateString("fr-FR") + " (mise à jour automatique)";
    } catch (e) {
      pcSearchId = null;
      if (info) info.textContent = "Images Sentinel-2 récentes indisponibles pour le moment : la mosaïque 2018 est affichée.";
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
        <p class="sub">Cliquez sur les coins de votre parcelle pour tracer son contour. La superficie se calcule toute seule.
        Le bouton en haut à droite de la carte change le fond et affiche ou masque les noms de villes et villages.</p>
        <div id="map"></div>
        <div class="actions"><button class="link" id="undo">Annuler le dernier point</button>
          <button class="link" id="clear">Effacer le tracé</button><button class="link" id="loc">Ma position</button></div>
        <p id="s2info" class="sub"></p><p id="surf" class="sub"></p></section>
      ${table}
      <section class="panel"><strong id="ftitle">Ajouter une parcelle</strong>
        <form id="pf" novalidate><input type="hidden" name="pid">
          ${fld("nom", "Nom")}${fld("localisation", "Localisation (village, commune…)")}${fld("culture", "Culture (arachide, mil…)")}
          ${fld("superficieHa", "Superficie (hectares)", "number", 'step="0.01" min="0"')}
          <button type="submit">Enregistrer</button></form><p id="msg" class="msg"></p></section>`);

    const f = $("pf");
    let pts = [], refresh = () => {}, fitTo = () => {};
    if (window.L) {
      const map = L.map("map").setView([14.15, -16.07], 10); // Kaolack, Sine-Saloum
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

      const done = L.featureGroup().addTo(map), vertices = L.layerGroup().addTo(map);
      parcelles.filter((p) => p.contour && p.contour.length > 2).forEach((p) =>
        L.polygon(p.contour, { color: "#7be08f", weight: 2, fillOpacity: .2 }).bindTooltip(p.nom, { permanent: true, direction: "center" }).addTo(done));
      if (done.getLayers().length) map.fitBounds(done.getBounds(), { padding: [30, 30] });

      const draw = L.polygon([], { color: "#f4b81c", weight: 3, fillOpacity: .25 }).addTo(map);
      refresh = () => {
        draw.setLatLngs(pts); vertices.clearLayers();
        pts.forEach((p) => L.circleMarker(p, { radius: 5, color: "#fff", weight: 2, fillColor: "#f4b81c", fillOpacity: 1 }).addTo(vertices));
        if (pts.length > 2) {
          const ha = areaHa(pts);
          f.elements.superficieHa.value = ha.toFixed(2);
          $("surf").textContent = "Surface tracée : " + ha.toFixed(2) + " ha";
        } else $("surf").textContent = pts.length ? "Ajoutez au moins 3 points." : "";
      };
      fitTo = () => pts.length > 2 && map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
      map.on("click", (e) => { pts.push([e.latlng.lat, e.latlng.lng]); refresh(); });
      $("undo").onclick = () => { pts.pop(); refresh(); };
      $("clear").onclick = () => { pts = []; refresh(); };
      $("loc").onclick = () => map.locate({ setView: true, maxZoom: 16 });
    } else $("map").innerHTML = '<p class="sub" style="padding:1rem">La carte n’a pas pu se charger (vérifiez votre connexion).</p>';

    onSubmit(f, async (d) => {
      const body = { nom: d.nom, localisation: d.localisation, culture: d.culture, superficieHa: Number(d.superficieHa) };
      if (pts.length > 2) body.contour = pts;
      if (d.pid) await api("/parcelles/" + d.pid, "PUT", body); else await api("/parcelles", "POST", body);
      pParcelles();
    });
    root.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => {
      const p = parcelles.find((x) => x._id === b.dataset.edit), e = f.elements;
      e.pid.value = p._id; e.nom.value = p.nom; e.localisation.value = p.localisation;
      e.culture.value = p.culture; e.superficieHa.value = p.superficieHa;
      pts = p.contour ? p.contour.map((x) => x.slice()) : []; refresh(); fitTo();
      $("ftitle").textContent = "Modifier la parcelle"; f.scrollIntoView();
    });
    root.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (!confirm("Supprimer cette parcelle, ses caméras et ses alertes ?")) return;
      await api("/parcelles/" + b.dataset.del, "DELETE"); pParcelles();
    });
  }

  // 3. Caméras
  async function pCameras() {
    const [{ cameras }, { parcelles }] = await Promise.all([api("/cameras"), api("/parcelles")]);
    const table = cameras.length
      ? `<div class="scroll"><table><thead><tr><th>Caméra</th><th>Parcelle</th><th>État</th><th>Dernière activité</th><th>Clé</th><th></th></tr></thead><tbody>` +
        cameras.map((c) => `<tr><td>${esc(c.nom)}</td><td>${esc(c.parcelle ? c.parcelle.nom : "—")}</td>
          <td>${c.enLigne ? badge("ok", "En ligne") : badge("off", "Hors ligne")}</td>
          <td>${c.lastSeenAt ? fmt(c.lastSeenAt) : "Jamais"}</td><td>${esc(c.apiKeyPrefix)}…</td>
          <td><button class="link" data-del="${c._id}">Supprimer</button></td></tr>`).join("") + "</tbody></table></div>"
      : '<p class="sub">Aucune caméra associée.</p>';
    const form = parcelles.length
      ? `<form id="cf" novalidate><label for="parcelle">Parcelle</label><select id="parcelle" name="parcelle">${parcelles.map((p) => `<option value="${p._id}">${esc(p.nom)}</option>`).join("")}</select>
          ${fld("nom", "Nom de la caméra (ex. ESP32-CAM Nord)")}<button type="submit">Associer la caméra</button></form>`
      : '<p class="sub">Créez d’abord une parcelle.</p>';
    layout("cameras", `<h1>Caméras</h1>${table}
      <section class="panel"><strong>Associer une ESP32-CAM à une parcelle</strong>${form}<p id="msg" class="msg"></p>
        <p class="sub">Le Raspberry Pi envoie ses données à <code>${location.origin}/api/device/alertes</code> (alertes) et
        <code>/api/device/heartbeat</code> (signal de vie) avec l’en-tête <code>x-api-key</code>.</p></section>`);
    if ($("cf")) onSubmit($("cf"), async (d) => {
      const r = await api("/cameras", "POST", d);
      await pCameras();
      say("Caméra créée. Copiez sa clé d’API maintenant, elle ne sera plus affichée : " + r.apiKey, "ok");
    });
    root.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (!confirm("Supprimer cette caméra ?")) return;
      await api("/cameras/" + b.dataset.del, "DELETE"); pCameras();
    });
  }

  // 5. Liste des alertes (filtres : parcelle, date, niveau, statut)
  async function pAlertes() {
    const { parcelles } = await api("/parcelles");
    layout("alertes", `<h1>Alertes</h1>
      <section class="panel"><form id="ff" class="filters" novalidate>
        <div><label for="parcelle">Parcelle</label><select id="parcelle" name="parcelle"><option value="">Toutes</option>${parcelles.map((p) => `<option value="${p._id}">${esc(p.nom)}</option>`).join("")}</select></div>
        <div><label for="niveau">Niveau</label><select id="niveau" name="niveau">${opts(NIV, "Tous")}</select></div>
        <div><label for="statut">Statut</label><select id="statut" name="statut">${opts(STAT, "Tous")}</select></div>
        ${"<div>" + fld("du", "Du", "date") + "</div><div>" + fld("au", "Au", "date") + "</div>"}
        <button type="submit">Filtrer</button></form>
        <button class="link" id="test" style="margin-top:.8rem">Générer une alerte de test</button></section>
      <div id="list"></div><p id="msg" class="msg"></p>`);
    const load = async () => {
      const qs = new URLSearchParams(Object.entries(Object.fromEntries(new FormData($("ff")))).filter(([, v]) => v));
      $("list").innerHTML = tableAlertes((await api("/alertes?" + qs)).alertes);
    };
    onSubmit($("ff"), load);
    $("test").onclick = async () => {
      try { await api("/alertes/test", "POST"); await load(); } catch (e) { say(e.message, "error"); }
    };
    load();
  }

  // 6. Détail d'une alerte : image annotée
  async function pDetail(id) {
    const { alerte: a } = await api("/alertes/" + id);
    layout("alertes", `<p><a href="#/alertes">← Retour aux alertes</a></p><h1>Alerte : ${esc(a.typeIntrus)}</h1>
      <div class="imgbox" id="ib"><p class="sub">Chargement de l’image…</p></div>
      <section class="panel"><ul class="info">
        <li><strong>Parcelle :</strong> ${esc(a.parcelle ? a.parcelle.nom : "—")}</li>
        <li><strong>Caméra :</strong> ${esc(a.camera ? a.camera.nom : "—")}</li>
        <li><strong>Détectée le :</strong> ${fmt(a.detecteLe)}</li>
        <li><strong>Confiance :</strong> ${Math.round(a.confiance * 100)} %</li>
        <li><strong>Niveau :</strong> ${badge(a.niveau, NIV[a.niveau])}</li>
        <li><strong>Statut :</strong> ${STAT[a.statut]}</li></ul>
        <div class="actions"><button class="link" data-s="vue">Marquer comme vue</button>
        <button class="link" data-s="traitee">Marquer comme traitée</button>
        <button class="link" id="tg">Envoyer sur Telegram</button></div><p id="msg" class="msg"></p></section>`);
    root.querySelectorAll("[data-s]").forEach((b) => b.onclick = async () => {
      await api("/alertes/" + id, "PATCH", { statut: b.dataset.s }); pDetail(id);
    });
    $("tg").onclick = async () => {
      try { say((await api("/alertes/" + id + "/telegram", "POST")).message, "ok"); } catch (e) { say(e.message, "error"); }
    };
    try {
      const r = await fetch("/api/alertes/" + id + "/image", { headers: { Authorization: "Bearer " + store.get() } });
      if (!r.ok) throw new Error();
      const url = URL.createObjectURL(await r.blob());
      $("ib").innerHTML = `<img src="${url}" alt="Image de l’alerte">` + a.boites.map((b) =>
        `<div class="box" style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.largeur * 100}%;height:${b.hauteur * 100}%">
         <span>${esc(b.classe)} ${Math.round(b.confiance * 100)} %</span></div>`).join("");
    } catch (e) { $("ib").innerHTML = '<p class="sub">Image indisponible.</p>'; }
  }

  // 7. Notifications Telegram (liaison automatique via le bot)
  async function pNotif() {
    const relie = !!me.telegramChatId;
    layout("notifications", `<h1>Notifications Telegram</h1>
      <p class="sub">Telegram vous envoie une alerte pour chaque intrusion de niveau élevé, et vous permet de récupérer votre mot de passe.</p>
      <section class="panel">${relie
        ? `<p>${badge("ok", "Telegram relié")}</p><button class="link" id="unlink">Délier mon Telegram</button>`
        : `<p>${badge("off", "Non relié")}</p><button type="button" id="link">Relier mon Telegram</button><div id="steps"></div>`}
        <p id="msg" class="msg"></p></section>`);
    if (relie) $("unlink").onclick = async () => { me = (await api("/auth/telegram", "DELETE")).user; pNotif(); };
    else $("link").onclick = async () => {
      try {
        const { lien } = await api("/auth/telegram/lien", "POST");
        $("steps").innerHTML = `<p>1. Ouvrez Telegram avec ce lien : <a href="${esc(lien)}" target="_blank" rel="noopener">${esc(lien)}</a><br>
          2. Appuyez sur <strong>Démarrer</strong> (Start).<br>3. Revenez ici et cliquez sur le bouton ci-dessous.</p>
          <button type="button" id="check">C’est fait, vérifier</button>`;
        $("check").onclick = () => guard(pNotif);
      } catch (e) { say(e.message, "error"); }
    };
  }

  // Paramètres : nom, email, mot de passe
  async function pParams() {
    layout("parametres", `<h1>Paramètres</h1>
      <section class="panel"><strong>Mon profil</strong>
        <form id="prof" novalidate>${fld("nom", "Nom complet", "text", `value="${esc(me.nom)}" autocomplete="name"`)}
          ${fld("email", "Email", "email", `value="${esc(me.email)}" autocomplete="email"`)}
          <button type="submit">Enregistrer</button></form><p id="msg1" class="msg"></p></section>
      <section class="panel"><strong>Mot de passe</strong>
        <form id="pwd" novalidate>${fld("ancien", "Mot de passe actuel", "password", 'autocomplete="current-password"')}
          ${fld("nouveau", "Nouveau mot de passe (8 caractères minimum)", "password", 'autocomplete="new-password"')}
          ${fld("confirm", "Confirmer le nouveau mot de passe", "password", 'autocomplete="new-password"')}
          <button type="submit">Changer le mot de passe</button></form><p id="msg2" class="msg"></p></section>`);
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
  }

  // --- Routeur -------------------------------------------------------------
  async function guard(fn, arg) {
    if (!store.get()) return go("#/connexion");
    try { me = (await api("/auth/me")).user; } catch (e) { store.del(); return go("#/connexion"); }
    try { await fn(arg); } catch (e) {
      root.innerHTML = `<div class="center"><div class="card"><h1>Erreur</h1><p>${esc(e.message)}</p><a href="#/tableau-de-bord">Retour au tableau de bord</a></div></div>`;
    }
  }

  function route() {
    const p = (location.hash || "#/connexion").split("/");
    switch (p[1]) {
      case "inscription": return pageInscription();
      case "mot-de-passe-oublie": return pageOubli();
      case "reinitialiser": return pageReinit(decodeURIComponent(p[2] || ""));
      case "tableau-de-bord": return guard(pDash);
      case "parcelles": return guard(pParcelles);
      case "cameras": return guard(pCameras);
      case "notifications": return guard(pNotif);
      case "parametres": return guard(pParams);
      case "alertes": return p[2] ? guard(pDetail, p[2]) : guard(pAlertes);
      default: return store.get() ? go("#/tableau-de-bord") : pageConnexion();
    }
  }

  window.addEventListener("hashchange", route);
  route();
})();
