// Routes utilisées par le Raspberry Pi. Authentification : en-tête  x-api-key: <clé de la caméra>
const router = require('express').Router();
const crypto = require('crypto');
const Camera = require('../models/Camera');
const Parcelle = require('../models/Parcelle');
const { creerAlerte, dansPlage } = require('../utils/alertes');
const { controlerTemperature } = require('../utils/drones');
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

const nombre = (v) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? undefined : Number(v));

// Signal de vie, à envoyer régulièrement (ex. chaque minute). Corps facultatif : { temperature (°C), signal (dBm) }
// Réponse : { ok, surveillance } : surveillance = false hors de la plage horaire choisie pour la parcelle
router.post('/heartbeat', wrap(async (req, res) => {
  const temperature = nombre(req.body.temperature), signal = nombre(req.body.signal);
  await Camera.updateOne({ _id: req.camera._id }, { lastSeenAt: new Date(), supervision: { temperature, signal, vuLe: new Date() } });
  await controlerTemperature(Camera, req.camera, temperature, 'Caméra');
  const parcelle = await Parcelle.findById(req.camera.parcelle).select('surveillance');
  res.json({ ok: true, surveillance: dansPlage(parcelle, new Date()) });
}));

// Corps JSON : { imageBase64, detecteLe?, typeIntrus, confiance (0-1), niveau (faible|moyen|eleve),
//   boites: [{ classe, confiance, x, y, largeur, hauteur }], position?: { lat, lng }, suiviId?, dureeS?, nbPersonnes?, zone? }
router.post('/alertes', wrap(async (req, res) => {
  const a = await creerAlerte(req.camera, req.body);
  if (a.ignoree) return res.status(202).json({ ignoree: true, raison: a.ignoree });
  res.status(201).json({ id: a._id, regroupee: !!a.$locals.regroupee });
}));

// Mode hors ligne : le Pi garde ses alertes puis les envoie par lot { alertes: [ ... ] } au retour du réseau
// (1 à 20 alertes, 5 Mo maximum par requête). Les alertes de plus de 15 minutes sont enregistrées sans message.
router.post('/alertes/lot', wrap(async (req, res) => {
  const lot = Array.isArray(req.body.alertes) ? req.body.alertes.slice(0, 20) : [];
  if (!lot.length) return res.status(400).json({ message: 'alertes requis (liste de 1 à 20 alertes)' });
  const resultats = [];
  for (const d of lot) {
    try {
      const a = await creerAlerte(req.camera, d);
      resultats.push(a.ignoree ? { ignoree: a.ignoree } : { id: a._id, regroupee: !!a.$locals.regroupee });
    } catch (e) { resultats.push({ erreur: e.message }); }
  }
  res.status(207).json({ resultats });
}));

module.exports = router;
