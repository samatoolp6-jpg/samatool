const router = require('express').Router();
const mongoose = require('mongoose');
const Alerte = require('../models/Alerte');
const Camera = require('../models/Camera');
const auth = require('../middleware/auth');
const wrap = require('../utils/wrap');
const { creerAlerte, texteAlerte } = require('../utils/alertes');
const { envoyerTelegramPhoto } = require('../utils/telegram');

router.use(auth);

const introuvable = (res) => res.status(404).json({ message: 'Alerte introuvable' });

// Tableau de bord : alertes du jour, parcelles actives, dernières alertes
router.get('/stats/resume', wrap(async (req, res) => {
  const debut = new Date(); debut.setHours(0, 0, 0, 0);
  const proprietaire = req.user._id;
  const [alertesAujourdhui, cameras, dernieres] = await Promise.all([
    Alerte.countDocuments({ proprietaire, detecteLe: { $gte: debut } }),
    Camera.find({ proprietaire }),
    Alerte.find({ proprietaire }).select('-image').sort('-detecteLe').limit(5).populate('parcelle', 'nom'),
  ]);
  const enLigne = cameras.filter((c) => c.enLigne);
  res.json({
    alertesAujourdhui, dernieres,
    camerasEnLigne: enLigne.length, camerasTotal: cameras.length,
    parcellesActives: new Set(enLigne.map((c) => String(c.parcelle))).size,
  });
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
  });
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
  const alertes = await Alerte.find(q).select('-image -boites').sort('-detecteLe').limit(200).populate('parcelle', 'nom');
  res.json({ alertes });
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
    .select('-image').populate('parcelle', 'nom localisation').populate('camera', 'nom');
  if (!alerte) return introuvable(res);
  res.json({ alerte });
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

module.exports = router;
