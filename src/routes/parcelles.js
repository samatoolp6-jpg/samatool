const router = require('express').Router();
const mongoose = require('mongoose');
const Parcelle = require('../models/Parcelle');
const Camera = require('../models/Camera');
const Alerte = require('../models/Alerte');
const auth = require('../middleware/auth');
const wrap = require('../utils/wrap');

router.use(auth);

// Contour valide : 3 à 500 points [latitude, longitude]
const contour = (c) =>
  Array.isArray(c) && c.length >= 3 && c.length <= 500 &&
  c.every((p) => Array.isArray(p) && p.length === 2 && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180) ? c : undefined;

const champs = (b) => {
  const c = contour(b.contour);
  const moy = (i) => (c ? c.reduce((t, p) => t + p[i], 0) / c.length : undefined);
  return Object.fromEntries(
    Object.entries({ nom: b.nom, localisation: b.localisation, culture: b.culture, superficieHa: b.superficieHa,
      contour: c, latitude: c ? moy(0) : b.latitude, longitude: c ? moy(1) : b.longitude })
      .filter(([, v]) => v !== undefined && v !== '')
  );
};
const introuvable = (res) => res.status(404).json({ message: 'Parcelle introuvable' });

router.get('/', wrap(async (req, res) => {
  res.json({ parcelles: await Parcelle.find({ proprietaire: req.user._id }).sort('-createdAt') });
}));

router.post('/', wrap(async (req, res) => {
  const parcelle = await Parcelle.create({ ...champs(req.body), proprietaire: req.user._id });
  res.status(201).json({ parcelle });
}));

router.put('/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return introuvable(res);
  const parcelle = await Parcelle.findOneAndUpdate(
    { _id: req.params.id, proprietaire: req.user._id }, champs(req.body), { new: true, runValidators: true });
  if (!parcelle) return introuvable(res);
  res.json({ parcelle });
}));

router.delete('/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return introuvable(res);
  const parcelle = await Parcelle.findOneAndDelete({ _id: req.params.id, proprietaire: req.user._id });
  if (!parcelle) return introuvable(res);
  await Camera.deleteMany({ parcelle: parcelle._id });
  await Alerte.deleteMany({ parcelle: parcelle._id });
  res.json({ message: 'Parcelle supprimée' });
}));

module.exports = router;
