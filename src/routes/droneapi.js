// Routes utilisées par le drone (ou son ordinateur de bord). Authentification : en-tête  x-api-key: <clé du drone>
const router = require('express').Router();
const crypto = require('crypto');
const Drone = require('../models/Drone');
const Vol = require('../models/Vol');
const Parcelle = require('../models/Parcelle');
const Alerte = require('../models/Alerte');
const wrap = require('../utils/wrap');
const { creerAlerte } = require('../utils/alertes');
const { pointDansContour, longueurM } = require('../utils/geo');
const { prevenirProprietaire, controlerTemperature } = require('../utils/drones');

router.use(wrap(async (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ message: 'Clé d’API manquante' });
  const drone = await Drone.findOne({ apiKeyHash: crypto.createHash('sha256').update(String(key)).digest('hex') });
  if (!drone) return res.status(401).json({ message: 'Clé d’API invalide' });
  req.drone = drone;
  next();
}));

// À envoyer toutes les 2 à 5 secondes : { lat, lng, batterie (0-100), etat: au_sol | en_vol | en_charge, temperature?, signal? }
// Réponse : { ordre: aucune | mission | retour | arret_urgence, mission?: { volId, plan, altitudeM }, motif? }
router.post('/telemetrie', wrap(async (req, res) => {
  const d = req.drone;
  const lat = Number(req.body.lat), lng = Number(req.body.lng), batterie = Number(req.body.batterie), etat = req.body.etat;
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) || !(batterie >= 0 && batterie <= 100) || !['au_sol', 'en_vol', 'en_charge'].includes(etat))
    return res.status(400).json({ message: 'Télémétrie invalide (lat, lng, batterie 0-100, etat)' });

  const nb = (v) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? undefined : Number(v));
  d.temperature = nb(req.body.temperature); d.signal = nb(req.body.signal);
  const ancienEtat = d.etat;
  d.position = { lat, lng }; d.batterie = batterie; d.etat = etat; d.lastSeenAt = new Date();
  const vol = d.volCourant ? await Vol.findById(d.volCourant) : null;
  const parcelle = await Parcelle.findById(d.parcelle).select('contour superficieHa');
  const retourOuUrgence = () => ['retour', 'arret_urgence'].includes(d.ordre.nature);

  if (etat === 'en_vol') {
    if (vol && vol.statut === 'planifie') { vol.statut = 'en_cours'; vol.debut = new Date(); }
    if (vol && vol.statut === 'en_cours') { vol.trajet.push([lat, lng]); if (vol.trajet.length > 3000) vol.trajet.shift(); }
    // Limites de vol : le drone ne doit pas sortir du contour de la parcelle
    const c = parcelle && parcelle.contour;
    if (c && c.length > 2 && !pointDansContour([lat, lng], c) && !retourOuUrgence()) {
      d.ordre = { nature: 'retour', motif: 'Sortie du contour de la parcelle' };
      await prevenirProprietaire(d.proprietaire, `⚠️ « ${d.nom} » est sorti du contour de la parcelle : retour à la base ordonné.`);
    } else if (batterie <= d.seuilBatterie && !retourOuUrgence()) {
      d.ordre = { nature: 'retour', motif: `Batterie faible (${Math.round(batterie)} %)` };
      await prevenirProprietaire(d.proprietaire, `🔋 Batterie faible (${Math.round(batterie)} %) : « ${d.nom} » retourne à la base.`);
    }
  }

  // Fin de vol : le drone était en l'air et se pose
  if (ancienEtat === 'en_vol' && etat !== 'en_vol' && vol && vol.statut === 'en_cours') {
    vol.statut = retourOuUrgence() ? 'interrompu' : 'termine';
    vol.motif = retourOuUrgence() ? d.ordre.motif : undefined;
    vol.fin = new Date();
    vol.dureeS = Math.round((vol.fin - vol.debut) / 1000);
    if (vol.type === 'couverture') {
      const ha = (longueurM(vol.trajet) * 20) / 10000; // bande de 20 m
      vol.surfaceHa = Math.round(Math.min(ha, (parcelle && parcelle.superficieHa) || ha) * 100) / 100;
    }
    vol.nbAlertes = await Alerte.countDocuments({ parcelle: d.parcelle, source: 'drone', detecteLe: { $gte: vol.debut, $lte: vol.fin } });
    d.volCourant = null;
  }

  // Accusé de réception : mission commencée (en vol) ou drone posé après un retour / arrêt d'urgence
  if (d.ordre.nature === 'mission' && etat === 'en_vol') d.ordre = { nature: 'aucune' };
  if (retourOuUrgence() && etat !== 'en_vol') d.ordre = { nature: 'aucune' };

  await d.save();
  await controlerTemperature(Drone, d, d.temperature, 'Drone');
  if (vol) await vol.save();

  const rep = { ordre: d.ordre.nature };
  if (d.ordre.motif) rep.motif = d.ordre.motif;
  if (d.ordre.nature === 'mission') {
    const v = vol || (await Vol.findById(d.ordre.volId));
    if (v) rep.mission = { volId: v._id, type: v.type, plan: v.plan, altitudeM: d.altitudeM };
  }
  res.json(rep);
}));

// Alerte détectée par le drone (mêmes champs que pour une caméra fixe, avec position GPS)
router.post('/alertes', wrap(async (req, res) => {
  const a = await creerAlerte(req.drone, req.body);
  if (a.ignoree) return res.status(202).json({ ignoree: true, raison: a.ignoree });
  res.status(201).json({ id: a._id, regroupee: !!a.$locals.regroupee });
}));

module.exports = router;
