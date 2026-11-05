const webpush = require('web-push');
const Reglage = require('../models/Reglage');
const User = require('../models/User');

let cles = null;

// Les clés VAPID sont créées automatiquement au premier usage et gardées dans MongoDB : rien à configurer
async function cleVapid() {
  if (!cles) {
    let r = await Reglage.findOne({ cle: 'vapid' });
    if (!r) {
      try { r = await Reglage.create({ cle: 'vapid', valeur: webpush.generateVAPIDKeys() }); }
      catch (e) { r = await Reglage.findOne({ cle: 'vapid' }); }
    }
    cles = r.valeur;
    const sujet = /^https:/.test(process.env.CLIENT_URL || '') ? process.env.CLIENT_URL : 'mailto:contact@samatool.app';
    webpush.setVapidDetails(sujet, cles.publicKey, cles.privateKey);
  }
  return { public: cles.publicKey };
}

async function envoyerPush(user, payload) {
  if (!user.pushAbonnements || !user.pushAbonnements.length) return;
  await cleVapid();
  const corps = JSON.stringify(payload);
  for (const sub of user.pushAbonnements) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, corps);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await User.updateOne({ _id: user._id }, { $pull: { pushAbonnements: { endpoint: sub.endpoint } } });
      else console.error('Push :', e.message);
    }
  }
}
module.exports = { cleVapid, envoyerPush };
