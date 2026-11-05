const PDFDocument = require('pdfkit');
const Alerte = require('../models/Alerte');
const Camera = require('../models/Camera');
const Parcelle = require('../models/Parcelle');
const Vol = require('../models/Vol');
const User = require('../models/User');
const { envoyerTelegramDocument } = require('./telegram');

const NIV = { faible: 'Faible', moyen: 'Moyen', eleve: 'Élevé' };
const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Africa/Dakar' });

// Rapport PDF des `jours` derniers jours pour un utilisateur
async function genererRapport(user, jours) {
  const fin = new Date(), debut = new Date(fin.getTime() - jours * 864e5);
  const proprietaire = user._id, periode = { $gte: debut, $lte: fin };
  const [alertes, vols, nbParcelles, cameras] = await Promise.all([
    Alerte.find({ proprietaire, detecteLe: periode }).select('detecteLe niveau typeIntrus verdict source'),
    Vol.find({ proprietaire, createdAt: periode, statut: { $in: ['termine', 'interrompu'] } }).select('surfaceHa nbAlertes type'),
    Parcelle.countDocuments({ proprietaire }),
    Camera.find({ proprietaire }),
  ]);
  const compter = (cle) => alertes.reduce((m, a) => { const k = cle(a); m[k] = (m[k] || 0) + 1; return m; }, {});
  const parJour = Array.from({ length: jours }, (_, i) => {
    const d = new Date(debut.getTime() + (i + 1) * 864e5);
    return { d, n: alertes.filter((a) => jour(a.detecteLe) === jour(d)).length };
  });
  const parType = Object.entries(compter((a) => a.typeIntrus)).sort((a, b) => b[1] - a[1]);
  const parNiveau = compter((a) => a.niveau);
  const vraies = alertes.filter((a) => a.verdict === 'vraie').length, fausses = alertes.filter((a) => a.verdict === 'fausse').length;

  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const morceaux = [];
    doc.on('data', (b) => morceaux.push(b));
    doc.on('end', () => resolve(Buffer.concat(morceaux)));

    doc.rect(0, 0, 595, 80).fill('#123f26');
    doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold').text('SamaTool', 50, 24);
    doc.fontSize(11).font('Helvetica').text('Mon champ, ma tranquillité.', 50, 54);
    doc.fillColor('#17261c').font('Helvetica-Bold').fontSize(16).text(`Rapport ${jours === 7 ? 'hebdomadaire' : 'mensuel'}`, 50, 105);
    doc.font('Helvetica').fontSize(11).fillColor('#5f6f63').text(`Du ${jour(debut)} au ${jour(fin)} — ${user.nom}`, 50, 128);

    doc.fillColor('#17261c').fontSize(12).font('Helvetica-Bold').text('Résumé', 50, 165);
    doc.font('Helvetica').fontSize(11).text(
      `${alertes.length} alerte${alertes.length > 1 ? 's' : ''} sur la période (élevé : ${parNiveau.eleve || 0}, moyen : ${parNiveau.moyen || 0}, faible : ${parNiveau.faible || 0}).\n` +
      `${nbParcelles} parcelle${nbParcelles > 1 ? 's' : ''}, ${cameras.length} caméra${cameras.length > 1 ? 's' : ''} (${cameras.filter((c) => c.enLigne).length} en ligne).\n` +
      `${vols.length} vol${vols.length > 1 ? 's' : ''} de drone, ${Math.round(vols.reduce((t, v) => t + (v.surfaceHa || 0), 0) * 100) / 100} ha couverts.\n` +
      (vraies + fausses ? `Qualité de la détection : ${vraies} vraie${vraies > 1 ? 's' : ''}, ${fausses} fausse${fausses > 1 ? 's' : ''} (${Math.round((fausses / (vraies + fausses)) * 100)} % de fausses alertes).` : 'Aucune alerte évaluée (vraie ou fausse) sur la période.'),
      50, 185, { width: 495, lineGap: 3 });

    doc.font('Helvetica-Bold').fontSize(12).text('Alertes par jour', 50, 285);
    const base = 400, haut = 90, max = Math.max(1, ...parJour.map((p) => p.n)), l = 495 / jours;
    parJour.forEach((p, i) => {
      const h = (p.n / max) * haut;
      doc.rect(50 + i * l + 1, base - h, Math.max(2, l - 2), h).fill('#2e8b3d');
      if (jours === 7 || i % 5 === 0) doc.fillColor('#5f6f63').fontSize(8).font('Helvetica').text(String(p.d.getDate()), 50 + i * l, base + 4, { width: l, align: 'center' });
      if (p.n) doc.fillColor('#17261c').fontSize(8).text(String(p.n), 50 + i * l, base - h - 11, { width: l, align: 'center' });
    });

    doc.fillColor('#17261c').font('Helvetica-Bold').fontSize(12).text('Par type d’intrus', 50, 440);
    doc.font('Helvetica').fontSize(11);
    if (parType.length) parType.slice(0, 8).forEach(([t, n], i) => doc.text(`${t} : ${n}`, 50, 460 + i * 16));
    else doc.text('Aucune alerte sur la période.', 50, 460);

    doc.font('Helvetica-Bold').fontSize(12).text('Par niveau', 300, 440);
    doc.font('Helvetica').fontSize(11);
    Object.keys(NIV).forEach((k, i) => doc.text(`${NIV[k]} : ${parNiveau[k] || 0}`, 300, 460 + i * 16));

    doc.fillColor('#5f6f63').fontSize(9).text(`Rapport généré le ${fin.toLocaleString('fr-FR', { timeZone: 'Africa/Dakar' })}`, 50, 780);
    doc.end();
  });
}

async function envoyerRapport(user, jours) {
  const pdf = await genererRapport(user, jours);
  return envoyerTelegramDocument(user.telegramChatId, pdf, `rapport-samatool-${jours}j.pdf`,
    `📄 SamaTool : votre rapport ${jours === 7 ? 'de la semaine' : 'du mois'}.`);
}

// Rapports automatiques : le lundi (hebdo) ou le 1er du mois (mensuel) à 07:00 (heure du Sénégal = UTC). Appelé chaque minute.
async function rapportsAuto() {
  const n = new Date();
  if (n.getUTCHours() !== 7 || n.getUTCMinutes() !== 0) return;
  const types = [];
  if (n.getUTCDay() === 1) types.push(['hebdo', 7]);
  if (n.getUTCDate() === 1) types.push(['mensuel', 30]);
  for (const [pref, jours] of types)
    for (const u of await User.find({ rapportAuto: pref, telegramChatId: { $ne: null } })) await envoyerRapport(u, jours);
}

module.exports = { genererRapport, envoyerRapport, rapportsAuto };
