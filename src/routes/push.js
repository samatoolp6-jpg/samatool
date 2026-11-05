const router = require('express').Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const wrap = require('../utils/wrap');
const { cleVapid } = require('../utils/push');

router.use(auth);

router.get('/cle', wrap(async (req, res) => res.json({ cle: (await cleVapid()).public })));

router.post('/abonner', wrap(async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) return res.status(400).json({ message: 'Abonnement invalide' });
  await User.updateOne({ _id: req.user._id }, { $pull: { pushAbonnements: { endpoint } } });
  await User.updateOne({ _id: req.user._id }, { $push: { pushAbonnements: { $each: [{ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }], $slice: -10 } } });
  res.json({ ok: true });
}));

router.delete('/abonner', wrap(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $pull: { pushAbonnements: { endpoint: req.body.endpoint } } });
  res.json({ ok: true });
}));

module.exports = router;
