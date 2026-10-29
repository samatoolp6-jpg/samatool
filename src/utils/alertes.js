const mongoose = require('mongoose');
const Alerte = require('../models/Alerte');
const Camera = require('../models/Camera');
const Parcelle = require('../models/Parcelle');
const User = require('../models/User');
const { envoyerTelegramPhoto } = require('./telegram');

const NIVEAUX = ['faible', 'moyen', 'eleve'];
const LIBELLE = { faible: 'faible', moyen: 'moyen', eleve: 'élevé' };
const err = (status, message) => Object.assign(new Error(message), { status });

// Texte envoyé sur Telegram (automatiquement ou depuis le bouton de la page de détail)
function texteAlerte(a, parcelleNom) {
  const date = new Date(a.detecteLe).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', dateStyle: 'short', timeStyle: 'short' });
  return `🚨 SamaTool : alerte de niveau ${LIBELLE[a.niveau]}\nIntrus : ${a.typeIntrus} (${Math.round(a.confiance * 100)} %)\nParcelle : ${parcelleNom || '—'}\n${date}\n${process.env.CLIENT_URL || ''}/#/alertes/${a._id}`;
}

// Crée une alerte pour une caméra (utilisée par le Raspberry Pi et par le bouton de test)
async function creerAlerte(camera, d) {
  if (!d.typeIntrus || typeof d.typeIntrus !== 'string') throw err(400, 'typeIntrus requis');
  const confiance = Number(d.confiance);
  if (!(confiance >= 0 && confiance <= 1)) throw err(400, 'confiance doit être entre 0 et 1');
  if (!NIVEAUX.includes(d.niveau)) throw err(400, 'niveau invalide (faible, moyen ou eleve)');
  if (!d.imageBase64) throw err(400, 'imageBase64 requis');
  const detecteLe = d.detecteLe ? new Date(d.detecteLe) : new Date();
  if (isNaN(detecteLe)) throw err(400, 'detecteLe invalide');

  const image = d.imageBase64.startsWith('data:') ? d.imageBase64 : 'data:image/jpeg;base64,' + d.imageBase64;
  const _id = new mongoose.Types.ObjectId();
  const alerte = await Alerte.create({
    _id, image, detecteLe, confiance,
    imageUrl: `/api/alertes/${_id}/image`,
    proprietaire: camera.proprietaire, parcelle: camera.parcelle, camera: camera._id,
    typeIntrus: d.typeIntrus, niveau: d.niveau,
    boites: Array.isArray(d.boites) ? d.boites : [],
  });
  await Camera.updateOne({ _id: camera._id }, { lastSeenAt: new Date() });

  if (d.niveau === 'eleve') {
    const u = await User.findById(camera.proprietaire);
    if (u && u.telegramChatId) {
      const p = await Parcelle.findById(camera.parcelle).select('nom');
      await envoyerTelegramPhoto(u.telegramChatId, texteAlerte(alerte, p && p.nom), image);
    }
  }
  return alerte;
}
module.exports = { creerAlerte, texteAlerte };
