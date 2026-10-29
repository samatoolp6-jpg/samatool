const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Camera = require('../models/Camera');
const Parcelle = require('../models/Parcelle');
const auth = require('../middleware/auth');
const wrap = require('../utils/wrap');

router.use(auth);

router.get('/', wrap(async (req, res) => {
  const cameras = await Camera.find({ proprietaire: req.user._id }).populate('parcelle', 'nom').sort('-createdAt');
  res.json({ cameras });
}));

// Associe une caméra à une parcelle et génère sa clé d'API (affichée une seule fois)
router.post('/', wrap(async (req, res) => {
  const { parcelle, nom } = req.body;
  if (!nom || !parcelle || !mongoose.isValidObjectId(parcelle)) return res.status(400).json({ message: 'Nom et parcelle requis' });
  if (!(await Parcelle.exists({ _id: parcelle, proprietaire: req.user._id })))
    return res.status(404).json({ message: 'Parcelle introuvable' });

  const apiKey = 'cam_' + crypto.randomBytes(24).toString('hex');
  const camera = await Camera.create({
    nom, parcelle, proprietaire: req.user._id,
    apiKeyHash: crypto.createHash('sha256').update(apiKey).digest('hex'),
    apiKeyPrefix: apiKey.slice(0, 8),
  });
  res.status(201).json({ camera, apiKey });
}));

router.delete('/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Caméra introuvable' });
  const c = await Camera.findOneAndDelete({ _id: req.params.id, proprietaire: req.user._id });
  if (!c) return res.status(404).json({ message: 'Caméra introuvable' });
  res.json({ message: 'Caméra supprimée' });
}));

module.exports = router;
