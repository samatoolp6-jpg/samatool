const mongoose = require('mongoose');
const Alerte = require('../models/Alerte');
const Camera = require('../models/Camera');
const Drone = require('../models/Drone');
const Parcelle = require('../models/Parcelle');
const User = require('../models/User');
const { envoyerTelegramPhoto } = require('./telegram');
const { declencherVerification } = require('./drones');
const { pointDansContour } = require('./geo');
const { envoyerSms, envoyerWhatsapp } = require('./sms');
const { envoyerPush } = require('./push');

const NIVEAUX = ['faible', 'moyen', 'eleve'];
const RANG = { faible: 0, moyen: 1, eleve: 2 };
const LIBELLE = { faible: 'faible', moyen: 'moyen', eleve: 'élevé' };
const err = (status, message) => Object.assign(new Error(message), { status });
const num = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));

// Texte envoyé sur Telegram (automatiquement ou depuis le bouton de la page de détail)
function texteAlerte(a, parcelleNom) {
  const date = new Date(a.detecteLe).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', dateStyle: 'short', timeStyle: 'short' });
  const gps = a.position && a.position.lat != null ? `\nPosition : https://maps.google.com/?q=${a.position.lat},${a.position.lng}` : '';
  const fusion = a.fusion ? ' (confirmée par le drone et la caméra)' : '';
  return `🚨 SamaTool : alerte de niveau ${LIBELLE[a.niveau]}${fusion}\nIntrus : ${a.typeIntrus} (${Math.round(a.confiance * 100)} %)\nParcelle : ${parcelleNom || '—'}\n${date}${gps}\n${process.env.CLIENT_URL || ''}/#/alertes/${a._id}`;
}

// Explique les éléments qui ont conduit à ce niveau d'alerte
function expliquer(a) {
  const pct = Math.round(a.confiance * 100);
  const h = new Date(a.detecteLe).getUTCHours(); // heure du Sénégal = UTC
  const l = ['Le niveau est calculé par le modèle d’apprentissage automatique à partir des éléments suivants :',
    `Confiance de la détection : ${pct} % (${pct >= 80 ? 'élevée' : pct >= 60 ? 'moyenne' : 'faible'})`];
  if (a.dureeS) l.push(`Présence de l’intrus : ${a.dureeS} secondes`);
  if (a.detections > 1) l.push(`Vu ${a.detections} fois pendant le même passage (un seul message envoyé)`);
  l.push(h < 6 || h >= 19 ? `Détection de nuit (${String(h).padStart(2, '0')} h)` : `Détection de jour (${String(h).padStart(2, '0')} h)`);
  if (a.nbPersonnes) l.push(`${a.nbPersonnes} personne${a.nbPersonnes > 1 ? 's' : ''} détectée${a.nbPersonnes > 1 ? 's' : ''}`);
  if (a.zone) l.push(`Zone : ${a.zone}`);
  l.push(a.source === 'drone' ? 'Source : drone' : 'Source : caméra fixe');
  if (a.fusion) l.push('Confirmée par le drone et une caméra fixe : niveau relevé à « élevé »');
  return l;
}

// La détection tombe-t-elle dans la plage horaire de surveillance de la parcelle ? (heure du Sénégal = UTC)
function dansPlage(parcelle, date) {
  const s = parcelle && parcelle.surveillance;
  if (!s || !s.debut || !s.fin) return true;
  const min = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  const t = date.getUTCHours() * 60 + date.getUTCMinutes(), d = min(s.debut), f = min(s.fin);
  return d <= f ? t >= d && t <= f : t >= d || t <= f; // la plage peut passer minuit (ex. 19:00 à 06:00)
}

async function notifier(alerte, image) {
  const u = await User.findById(alerte.proprietaire);
  if (!u) return;
  const p = await Parcelle.findById(alerte.parcelle).select('nom');
  const nom = p && p.nom;
  if (RANG[alerte.niveau] >= RANG[u.telegramNiveauMin || 'eleve']) {
    if (u.telegramChatId) await envoyerTelegramPhoto(u.telegramChatId, texteAlerte(alerte, nom), image);
    await envoyerPush(u, { titre: `Alerte ${LIBELLE[alerte.niveau]} : ${alerte.typeIntrus}`, texte: `Parcelle ${nom || '—'} (${Math.round(alerte.confiance * 100)} %)`, url: `/#/alertes/${alerte._id}` });
  }
  if (alerte.niveau === 'eleve' && u.telephone) { // SMS et WhatsApp : niveau élevé seulement (service payant)
    const court = `SamaTool : alerte élevée, ${alerte.typeIntrus} (${Math.round(alerte.confiance * 100)} %) sur ${nom || 'votre parcelle'}. ${process.env.CLIENT_URL || ''}/#/alertes/${alerte._id}`;
    if (u.smsAlertes) await envoyerSms(u.telephone, court);
    if (u.whatsappAlertes) await envoyerWhatsapp(u.telephone, court);
  }
}

// Crée une alerte pour une caméra ou un drone (source = document Camera ou Drone)
// opts.forcer : ignore la plage horaire et le contrôle de zone (alerte de test)
async function creerAlerte(source, d, opts = {}) {
  const estDrone = source.constructor.modelName === 'Drone';
  const origine = estDrone ? 'drone' : 'camera';
  if (!d.typeIntrus || typeof d.typeIntrus !== 'string') throw err(400, 'typeIntrus requis');
  const confiance = Number(d.confiance);
  if (!(confiance >= 0 && confiance <= 1)) throw err(400, 'confiance doit être entre 0 et 1');
  if (!NIVEAUX.includes(d.niveau)) throw err(400, 'niveau invalide (faible, moyen ou eleve)');
  if (!d.imageBase64) throw err(400, 'imageBase64 requis');
  if (d.imageBase64.length > 2000000) throw err(413, 'Image trop lourde (environ 1,5 Mo maximum) : compressez-la en JPEG avant l’envoi');
  const detecteLe = d.detecteLe ? new Date(d.detecteLe) : new Date();
  if (isNaN(detecteLe)) throw err(400, 'detecteLe invalide');

  const lat = d.position ? num(d.position.lat) : undefined, lng = d.position ? num(d.position.lng) : undefined;
  const position = Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : undefined;
  const image = d.imageBase64.startsWith('data:') ? d.imageBase64 : 'data:image/jpeg;base64,' + d.imageBase64;
  const boites = Array.isArray(d.boites) ? d.boites : [];
  const modele = estDrone ? Drone : Camera;
  await modele.updateOne({ _id: source._id }, { lastSeenAt: new Date() });

  // Plage horaire de surveillance et zone d'intérêt : on ignore ce qui est hors plage ou hors de la parcelle
  const recente = Date.now() - detecteLe.getTime() < 15 * 60000; // les alertes en retard (mode hors ligne du Pi) ne déclenchent ni message ni drone
  if (!opts.forcer) {
    const parcelle = await Parcelle.findById(source.parcelle).select('contour surveillance');
    if (!dansPlage(parcelle, detecteLe)) return { ignoree: 'hors de la plage horaire de surveillance' };
    const c = parcelle && parcelle.contour;
    if (position && c && c.length > 2 && !pointDansContour([position.lat, position.lng], c)) return { ignoree: 'détection hors de la parcelle' };
  }

  // Regroupement : même identifiant de suivi (DeepSORT) dans les 10 dernières minutes = même passage, pas de nouvelle alerte
  if (d.suiviId !== undefined && d.suiviId !== null && d.suiviId !== '') {
    const ex = await Alerte.findOne({
      proprietaire: source.proprietaire, parcelle: source.parcelle, source: origine, suiviId: String(d.suiviId),
      detecteLe: { $gte: new Date(detecteLe.getTime() - 10 * 60000) },
    }).select('+image');
    if (ex) {
      const montee = RANG[d.niveau] > RANG[ex.niveau];
      ex.detections += 1;
      ex.dureeS = Math.max(ex.dureeS || 0, Number(d.dureeS) || 0, Math.round((detecteLe - ex.detecteLe) / 1000));
      if (confiance > ex.confiance) { ex.confiance = confiance; ex.image = image; ex.boites = boites; if (position) ex.position = position; }
      if (montee) ex.niveau = d.niveau;
      await ex.save();
      if (montee && recente) await notifier(ex, ex.image); // on ne prévient à nouveau que si le niveau monte
      ex.$locals.regroupee = true;
      return ex;
    }
  }

  // Fusion drone + caméra fixe : même parcelle, autre source, moins de 5 minutes d'écart
  let niveau = d.niveau, fusion = false;
  const autre = await Alerte.findOne({
    proprietaire: source.proprietaire, parcelle: source.parcelle, source: { $ne: origine },
    detecteLe: { $gte: new Date(detecteLe.getTime() - 5 * 60000) },
  });
  if (autre) {
    niveau = 'eleve'; fusion = true;
    await Alerte.updateOne({ _id: autre._id }, { fusion: true, niveau: 'eleve' });
  }

  const _id = new mongoose.Types.ObjectId();
  const alerte = await Alerte.create({
    _id, image, detecteLe, confiance, niveau, fusion, position, boites,
    imageUrl: `/api/alertes/${_id}/image`,
    proprietaire: source.proprietaire, parcelle: source.parcelle,
    camera: estDrone ? undefined : source._id, drone: estDrone ? source._id : undefined, source: origine,
    typeIntrus: d.typeIntrus,
    suiviId: d.suiviId !== undefined && d.suiviId !== null && d.suiviId !== '' ? String(d.suiviId) : undefined,
    dureeS: num(d.dureeS), nbPersonnes: num(d.nbPersonnes), zone: d.zone ? String(d.zone).slice(0, 80) : undefined,
  });
  if (recente) {
    await notifier(alerte, image);
    await declencherVerification(alerte).catch((e) => console.error('Vérification drone :', e.message));
  }
  return alerte;
}
module.exports = { creerAlerte, texteAlerte, expliquer, dansPlage };
