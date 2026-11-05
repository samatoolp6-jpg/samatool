const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Drone = require('../models/Drone');
const Vol = require('../models/Vol');
const Parcelle = require('../models/Parcelle');
const Alerte = require('../models/Alerte');
const auth = require('../middleware/auth');
const wrap = require('../utils/wrap');
const { planDeVol } = require('../utils/geo');
const { raisonRefus, creerMission } = require('../utils/drones');

router.use(auth);

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const introuvable = (res) => res.status(404).json({ message: 'Drone introuvable' });
const trouver = (req) =>
  mongoose.isValidObjectId(req.params.id) ? Drone.findOne({ _id: req.params.id, proprietaire: req.user._id }).populate('parcelle') : null;

// Tout ce qu'il faut pour la carte en direct : drones, contours des parcelles, alertes géolocalisées (7 jours)
router.get('/live', wrap(async (req, res) => {
  const proprietaire = req.user._id;
  const il7 = new Date(Date.now() - 7 * 864e5);
  const [drones, parcelles, alertes] = await Promise.all([
    Drone.find({ proprietaire }).populate('parcelle', 'nom').populate('volCourant', 'plan trajet type statut').sort('createdAt'),
    Parcelle.find({ proprietaire }).select('nom contour'),
    Alerte.find({ proprietaire, 'position.lat': { $exists: true }, detecteLe: { $gte: il7 } })
      .select('position niveau typeIntrus detecteLe source').sort('-detecteLe').limit(200),
  ]);
  res.json({ drones, parcelles, alertes });
}));

// Historique des vols
router.get('/vols/liste', wrap(async (req, res) => {
  const vols = await Vol.find({ proprietaire: req.user._id }).select('-plan -trajet').populate('drone', 'nom').sort('-createdAt').limit(20);
  res.json({ vols });
}));
router.get('/vols/:volId', wrap(async (req, res) => {
  const vol = mongoose.isValidObjectId(req.params.volId) && (await Vol.findOne({ _id: req.params.volId, proprietaire: req.user._id }));
  if (!vol) return res.status(404).json({ message: 'Vol introuvable' });
  res.json({ vol });
}));

router.post('/', wrap(async (req, res) => {
  const { nom, parcelle } = req.body;
  if (!nom || !parcelle || !mongoose.isValidObjectId(parcelle)) return res.status(400).json({ message: 'Nom et parcelle requis' });
  if (!(await Parcelle.exists({ _id: parcelle, proprietaire: req.user._id }))) return res.status(404).json({ message: 'Parcelle introuvable' });
  const apiKey = 'drn_' + crypto.randomBytes(24).toString('hex');
  const drone = await Drone.create({ nom, parcelle, proprietaire: req.user._id, apiKeyHash: sha(apiKey), apiKeyPrefix: apiKey.slice(0, 8) });
  res.status(201).json({ drone, apiKey });
}));

// Réglages : seuil de batterie, patrouilles (HH:MM), vérification automatique sur alerte
router.put('/:id', wrap(async (req, res) => {
  const d = await trouver(req);
  if (!d) return introuvable(res);
  const { seuilBatterie, patrouilles, verifierSurAlerte } = req.body;
  if (seuilBatterie !== undefined) {
    if (!(Number(seuilBatterie) >= 10 && Number(seuilBatterie) <= 60)) return res.status(400).json({ message: 'Seuil de batterie : entre 10 et 60 %' });
    d.seuilBatterie = Number(seuilBatterie);
  }
  if (patrouilles !== undefined) {
    const liste = (Array.isArray(patrouilles) ? patrouilles : []).map((h) => String(h).trim());
    if (liste.length > 6 || !liste.every((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h))) return res.status(400).json({ message: 'Heures de patrouille invalides (format 06:30, six au maximum)' });
    d.patrouilles = [...new Set(liste)];
  }
  if (verifierSurAlerte !== undefined) d.verifierSurAlerte = !!verifierSurAlerte;
  await d.save();
  res.json({ drone: d });
}));

// Vol de couverture : plan généré automatiquement à partir du contour de la parcelle
router.post('/:id/mission', wrap(async (req, res) => {
  const d = await trouver(req);
  if (!d) return introuvable(res);
  const c = d.parcelle.contour;
  if (!c || c.length < 3) return res.status(400).json({ message: 'Tracez d’abord le contour de la parcelle (page Parcelles)' });
  const refus = raisonRefus(d);
  if (refus) return res.status(409).json({ message: refus });
  const vol = await creerMission(d, d.parcelle, 'couverture', planDeVol(c));
  res.status(201).json({ vol: { _id: vol._id, points: vol.plan.length }, message: `Mission envoyée (${vol.plan.length} points). Le drone la recevra à son prochain signal.` });
}));

// Retour à la base et arrêt d'urgence : toujours possibles
async function ordre(req, res, nature, motif, message) {
  const d = await trouver(req);
  if (!d) return introuvable(res);
  if (d.volCourant) await Vol.updateOne({ _id: d.volCourant, statut: 'planifie' }, { statut: 'interrompu', motif: 'Annulé avant le décollage' });
  const volPlanifie = d.volCourant && (await Vol.exists({ _id: d.volCourant, statut: { $in: ['en_cours'] } }));
  await Drone.updateOne({ _id: d._id }, { ordre: { nature, motif }, ...(volPlanifie ? {} : { volCourant: null }) });
  res.json({ message });
}
router.post('/:id/retour', wrap((req, res) => ordre(req, res, 'retour', 'Demandé par le propriétaire', 'Ordre de retour à la base envoyé.')));
router.post('/:id/urgence', wrap((req, res) => ordre(req, res, 'arret_urgence', 'Arrêt d’urgence demandé par le propriétaire', 'Arrêt d’urgence envoyé : le drone doit atterrir immédiatement.')));

router.post('/:id/cle', wrap(async (req, res) => {
  const d = await trouver(req);
  if (!d) return introuvable(res);
  const apiKey = 'drn_' + crypto.randomBytes(24).toString('hex');
  await Drone.updateOne({ _id: d._id }, { apiKeyHash: sha(apiKey), apiKeyPrefix: apiKey.slice(0, 8) });
  res.json({ apiKey });
}));

router.delete('/:id', wrap(async (req, res) => {
  const d = await trouver(req);
  if (!d) return introuvable(res);
  await Vol.deleteMany({ drone: d._id });
  await Drone.deleteOne({ _id: d._id });
  res.json({ message: 'Drone supprimé' });
}));

module.exports = router;
