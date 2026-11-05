const router = require('express').Router();
const mongoose = require('mongoose');
const Alerte = require('../models/Alerte');
const Camera = require('../models/Camera');
const Parcelle = require('../models/Parcelle');
const auth = require('../middleware/auth');
const wrap = require('../utils/wrap');
const { creerAlerte, texteAlerte, expliquer } = require('../utils/alertes');
const { envoyerTelegramPhoto } = require('../utils/telegram');
const { genererRapport, envoyerRapport } = require('../utils/rapport');

router.use(auth);

const introuvable = (res) => res.status(404).json({ message: 'Alerte introuvable' });

// Tableau de bord : chiffres du jour, 7 derniers jours, caméras hors ligne
router.get('/stats/resume', wrap(async (req, res) => {
  const proprietaire = req.user._id;
  const debut = new Date(); debut.setHours(0, 0, 0, 0);
  const il7 = new Date(debut.getTime() - 6 * 864e5);
  const [alertesAujourdhui, nouvelles, nbParcelles, cameras, dernieres, jours] = await Promise.all([
    Alerte.countDocuments({ proprietaire, detecteLe: { $gte: debut } }),
    Alerte.countDocuments({ proprietaire, statut: 'nouvelle' }),
    Parcelle.countDocuments({ proprietaire }),
    Camera.find({ proprietaire }),
    Alerte.find({ proprietaire }).select('-image').sort('-detecteLe').limit(5).populate('parcelle', 'nom'),
    Alerte.aggregate([
      { $match: { proprietaire, detecteLe: { $gte: il7 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$detecteLe' } }, n: { $sum: 1 } } },
    ]),
  ]);
  const enLigne = cameras.filter((c) => c.enLigne);
  const parJour = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(il7.getTime() + i * 864e5).toISOString().slice(0, 10);
    return { date, n: (jours.find((j) => j._id === date) || { n: 0 }).n };
  });
  res.json({
    alertesAujourdhui, nouvelles, nbParcelles, dernieres, parJour,
    camerasEnLigne: enLigne.length, camerasTotal: cameras.length,
    horsLigne: cameras.filter((c) => !c.enLigne).map((c) => c.nom),
    parcellesActives: new Set(enLigne.map((c) => String(c.parcelle))).size,
  });
}));

// Pastille « nouvelles alertes » du menu (appel léger)
router.get('/stats/nouvelles', wrap(async (req, res) => {
  res.json({ nouvelles: await Alerte.countDocuments({ proprietaire: req.user._id, statut: 'nouvelle' }) });
}));

// Statistiques détaillées : par heure, par type d'intrus, par niveau
router.get('/stats/detail', wrap(async (req, res) => {
  const proprietaire = req.user._id;
  const grouper = (cle, tri) => Alerte.aggregate([{ $match: { proprietaire } }, { $group: { _id: cle, n: { $sum: 1 } } }, ...(tri ? [{ $sort: { n: -1 } }] : [])]);
  const [h, t, n, v] = await Promise.all([grouper({ $hour: '$detecteLe' }), grouper('$typeIntrus', true), grouper('$niveau'), grouper('$verdict')]);
  const parHeure = Array.from({ length: 24 }, (_, i) => (h.find((x) => x._id === i) || { n: 0 }).n);
  res.json({
    total: parHeure.reduce((a, b) => a + b, 0), parHeure,
    parType: t.map((x) => ({ type: x._id, n: x.n })),
    parNiveau: n.map((x) => ({ niveau: x._id, n: x.n })),
    verdicts: { vraie: (v.find((x) => x._id === 'vraie') || { n: 0 }).n, fausse: (v.find((x) => x._id === 'fausse') || { n: 0 }).n },
  });
}));

// Rapport PDF (7 ou 30 jours)
router.get('/rapport.pdf', wrap(async (req, res) => {
  const jours = req.query.jours === '30' ? 30 : 7;
  res.type('application/pdf').set('Content-Disposition', `attachment; filename="rapport-samatool-${jours}j.pdf"`).send(await genererRapport(req.user, jours));
}));

// Envoie le rapport PDF tout de suite sur le Telegram de l'utilisateur
router.post('/rapport/telegram', wrap(async (req, res) => {
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(400).json({ message: 'Telegram n’est pas encore configuré sur le serveur' });
  if (!req.user.telegramChatId) return res.status(400).json({ message: 'Reliez d’abord votre Telegram (page Paramètres)' });
  const ok = await envoyerRapport(req.user, req.body.jours === 30 ? 30 : 7);
  if (!ok) return res.status(502).json({ message: 'Envoi impossible pour le moment, réessayez.' });
  res.json({ message: 'Rapport envoyé sur votre Telegram.' });
}));

// Carte de chaleur : positions GPS des détections, filtrables par plage horaire (heures du Sénégal = UTC)
router.get('/chaleur', wrap(async (req, res) => {
  const lire = (v, def) => (Number.isNaN(parseInt(v, 10)) ? def : Math.max(0, Math.min(23, parseInt(v, 10))));
  const hmin = lire(req.query.hmin, 0), hmax = lire(req.query.hmax, 23);
  const alertes = await Alerte.find({ proprietaire: req.user._id, 'position.lat': { $exists: true } }).select('position detecteLe').limit(5000);
  const points = alertes
    .filter((a) => { const h = a.detecteLe.getUTCHours(); return hmin <= hmax ? h >= hmin && h <= hmax : h >= hmin || h <= hmax; })
    .map((a) => [a.position.lat, a.position.lng]);
  res.json({ points });
}));

// Export CSV de toutes les alertes (s'ouvre dans Excel)
router.get('/export', wrap(async (req, res) => {
  const liste = await Alerte.find({ proprietaire: req.user._id }).select('-image -boites').sort('-detecteLe').populate('parcelle', 'nom');
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lignes = ['Date;Parcelle;Intrus;Confiance;Niveau;Statut',
    ...liste.map((a) => [a.detecteLe.toISOString(), a.parcelle ? a.parcelle.nom : '', a.typeIntrus,
      Math.round(a.confiance * 100) + ' %', a.niveau, a.statut].map(q).join(';'))];
  res.type('text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="alertes-samatool.csv"')
    .send('\ufeff' + lignes.join('\r\n'));
}));

// Alerte factice pour tester l'interface sans Raspberry Pi
router.post('/test', wrap(async (req, res) => {
  const camera = await Camera.findOne({ proprietaire: req.user._id });
  if (!camera) return res.status(400).json({ message: 'Ajoutez d’abord une caméra' });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#7a9a6a"/>' +
    '<rect x="230" y="120" width="160" height="300" fill="#4a3b2a"/><text x="20" y="40" font-size="24" fill="#fff">Image de test</text></svg>';
  const niveaux = ['faible', 'moyen', 'eleve'];
  const alerte = await creerAlerte(camera, {
    imageBase64: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
    typeIntrus: ['personne', 'bovin', 'ovin'][Math.floor(Math.random() * 3)],
    confiance: 0.6 + Math.random() * 0.39,
    niveau: niveaux[Math.floor(Math.random() * 3)],
    boites: [{ classe: 'intrus', confiance: 0.9, x: 0.36, y: 0.25, largeur: 0.25, hauteur: 0.62 }],
  }, { forcer: true });
  res.status(201).json({ id: alerte._id });
}));

// Liste filtrée : parcelle, niveau, statut, du, au
router.get('/', wrap(async (req, res) => {
  const { parcelle, niveau, statut, du, au } = req.query;
  const q = { proprietaire: req.user._id };
  if (parcelle && mongoose.isValidObjectId(parcelle)) q.parcelle = parcelle;
  if (['faible', 'moyen', 'eleve'].includes(niveau)) q.niveau = niveau;
  if (['nouvelle', 'vue', 'traitee'].includes(statut)) q.statut = statut;
  if (du || au) {
    q.detecteLe = {};
    if (du && !isNaN(new Date(du))) q.detecteLe.$gte = new Date(du);
    if (au && !isNaN(new Date(au))) { const f = new Date(au); f.setHours(23, 59, 59, 999); q.detecteLe.$lte = f; }
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1), taille = 25;
  const trouvees = await Alerte.find(q).select('-image -boites').sort('-detecteLe').skip((page - 1) * taille).limit(taille + 1).populate('parcelle', 'nom');
  res.json({ alertes: trouvees.slice(0, taille), suite: trouvees.length > taille });
}));

router.get('/:id/image', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return introuvable(res);
  const a = await Alerte.findOne({ _id: req.params.id, proprietaire: req.user._id }).select('+image');
  const m = a && a.image && a.image.match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!m) return introuvable(res);
  res.type(m[1]).send(Buffer.from(m[2], 'base64'));
}));

router.get('/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return introuvable(res);
  const alerte = await Alerte.findOne({ _id: req.params.id, proprietaire: req.user._id })
    .select('-image').populate('parcelle', 'nom localisation contour').populate('camera', 'nom').populate('drone', 'nom');
  if (!alerte) return introuvable(res);
  res.json({ alerte, explication: expliquer(alerte) });
}));

router.patch('/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !['nouvelle', 'vue', 'traitee'].includes(req.body.statut))
    return res.status(400).json({ message: 'Requête invalide' });
  const alerte = await Alerte.findOneAndUpdate(
    { _id: req.params.id, proprietaire: req.user._id }, { statut: req.body.statut }, { new: true }).select('-image');
  if (!alerte) return introuvable(res);
  res.json({ alerte });
}));

// Envoie cette alerte (photo + texte) sur le Telegram de l'utilisateur
router.post('/:id/telegram', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return introuvable(res);
  const a = await Alerte.findOne({ _id: req.params.id, proprietaire: req.user._id }).select('+image').populate('parcelle', 'nom');
  if (!a) return introuvable(res);
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(400).json({ message: 'Telegram n’est pas encore configuré sur le serveur' });
  if (!req.user.telegramChatId) return res.status(400).json({ message: 'Reliez d’abord votre Telegram (page Telegram)' });
  const ok = await envoyerTelegramPhoto(req.user.telegramChatId, texteAlerte(a, a.parcelle && a.parcelle.nom), a.image);
  if (!ok) return res.status(502).json({ message: 'Envoi impossible pour le moment, réessayez.' });
  res.json({ message: 'Alerte envoyée sur votre Telegram.' });
}));

// « Vraie alerte » / « fausse alerte » : sert à mesurer les faux positifs et à améliorer le modèle
router.patch('/:id/verdict', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !['vraie', 'fausse'].includes(req.body.verdict))
    return res.status(400).json({ message: 'Requête invalide' });
  const alerte = await Alerte.findOneAndUpdate({ _id: req.params.id, proprietaire: req.user._id },
    { verdict: req.body.verdict, statut: 'traitee' }, { new: true }).select('-image');
  if (!alerte) return introuvable(res);
  res.json({ alerte });
}));

router.delete('/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return introuvable(res);
  const a = await Alerte.findOneAndDelete({ _id: req.params.id, proprietaire: req.user._id });
  if (!a) return introuvable(res);
  res.json({ message: 'Alerte supprimée' });
}));

module.exports = router;
