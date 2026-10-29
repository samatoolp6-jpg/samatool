// Routes utilisées par le Raspberry Pi. Authentification : en-tête  x-api-key: <clé de la caméra>
const router = require('express').Router();
const crypto = require('crypto');
const Camera = require('../models/Camera');
const { creerAlerte } = require('../utils/alertes');
const wrap = require('../utils/wrap');

router.use(wrap(async (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ message: 'Clé d’API manquante' });
  const hash = crypto.createHash('sha256').update(String(key)).digest('hex');
  const camera = await Camera.findOne({ apiKeyHash: hash });
  if (!camera) return res.status(401).json({ message: 'Clé d’API invalide' });
  req.camera = camera;
  next();
}));

// Signal de vie, à envoyer régulièrement (ex. chaque minute)
router.post('/heartbeat', wrap(async (req, res) => {
  await Camera.updateOne({ _id: req.camera._id }, { lastSeenAt: new Date() });
  res.json({ ok: true });
}));

// Corps JSON : { imageBase64, detecteLe?, typeIntrus, confiance (0-1), niveau (faible|moyen|eleve),
//   boites: [{ classe, confiance, x, y, largeur, hauteur }] }  (x, y = coin haut-gauche, valeurs entre 0 et 1)
router.post('/alertes', wrap(async (req, res) => {
  const alerte = await creerAlerte(req.camera, req.body);
  res.status(201).json({ id: alerte._id });
}));

module.exports = router;
