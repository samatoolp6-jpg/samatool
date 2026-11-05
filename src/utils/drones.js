const Drone = require('../models/Drone');
const Vol = require('../models/Vol');
const Camera = require('../models/Camera');
const User = require('../models/User');
const { envoyerTelegram } = require('./telegram');
const { planDeVol, pointDansContour } = require('./geo');

const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { timeZone: 'Africa/Dakar', hour: '2-digit', minute: '2-digit' });

async function prevenirProprietaire(proprietaireId, texte) {
  const u = await User.findById(proprietaireId).select('telegramChatId');
  if (u && u.telegramChatId) await envoyerTelegram(u.telegramChatId, texte);
}

// Pourquoi le drone ne peut pas décoller maintenant (null = il peut)
function raisonRefus(d) {
  if (!d.enLigne) return 'Le drone est hors ligne';
  if (d.etat === 'en_vol') return 'Le drone est déjà en vol';
  if (d.ordre && d.ordre.nature !== 'aucune') return 'Un ordre est déjà en attente pour ce drone';
  if (d.batterie == null || d.batterie <= d.seuilBatterie + 15) return 'Batterie trop faible pour décoller';
  return null;
}

// Crée un vol et met l'ordre « mission » en attente : le drone le recevra à sa prochaine télémétrie
async function creerMission(drone, parcelle, type, plan, declencheur = 'manuel') {
  const vol = await Vol.create({ drone: drone._id, proprietaire: drone.proprietaire, parcelle: parcelle._id, type, declencheur, plan });
  await Drone.updateOne({ _id: drone._id }, { volCourant: vol._id, ordre: { nature: 'mission', volId: vol._id } });
  return vol;
}

// Décollage sur alerte : une caméra fixe voit un intrus, le drone de la parcelle va vérifier
async function declencherVerification(alerte) {
  if (alerte.source !== 'camera' || !alerte.position || alerte.position.lat == null || alerte.niveau === 'faible') return;
  const drones = await Drone.find({ parcelle: alerte.parcelle, verifierSurAlerte: true }).populate('parcelle');
  const d = drones.find((x) => !raisonRefus(x));
  if (!d) return;
  const pos = [alerte.position.lat, alerte.position.lng];
  const c = d.parcelle.contour;
  if (c && c.length > 2 && !pointDansContour(pos, c)) return; // jamais en dehors de la parcelle
  await creerMission(d, d.parcelle, 'verification', [pos], 'alerte');
  await prevenirProprietaire(d.proprietaire, `🚁 Le drone « ${d.nom} » décolle pour vérifier l’alerte (${alerte.typeIntrus}).`);
}

// Patrouilles planifiées : appelé chaque minute
async function lancerRondes() {
  const now = new Date(), hhmm = now.toISOString().slice(11, 16);
  const drones = await Drone.find({ patrouilles: hhmm }).populate('parcelle');
  for (const d of drones) {
    if (d.derniereRonde && now - d.derniereRonde < 5 * 60000) continue;
    const c = d.parcelle && d.parcelle.contour;
    const refus = !c || c.length < 3 ? 'le contour de la parcelle n’est pas tracé' : raisonRefus(d);
    await Drone.updateOne({ _id: d._id }, { derniereRonde: now });
    if (refus) { await prevenirProprietaire(d.proprietaire, `⚠️ Patrouille de « ${d.nom} » à ${hhmm} impossible : ${refus.toLowerCase()}.`); continue; }
    await creerMission(d, d.parcelle, 'couverture', planDeVol(c), 'patrouille');
  }
}

// Prévient sur Telegram quand une caméra ou un drone passe hors ligne, puis revient : appelé chaque minute
async function surveillerMateriel() {
  const chats = new Map((await User.find({ telegramChatId: { $ne: null } }).select('telegramChatId')).map((u) => [String(u._id), u.telegramChatId]));
  for (const [Modele, label] of [[Camera, 'Caméra'], [Drone, 'Drone']]) {
    for (const m of await Modele.find({ lastSeenAt: { $ne: null } })) {
      const chat = chats.get(String(m.proprietaire));
      if (!m.enLigne && !m.horsLigneNotifie) {
        await Modele.updateOne({ _id: m._id }, { horsLigneNotifie: true });
        if (chat) await envoyerTelegram(chat, `⚠️ ${label} « ${m.nom} » hors ligne (dernier signal à ${heure(m.lastSeenAt)}).`);
      } else if (m.enLigne && m.horsLigneNotifie) {
        await Modele.updateOne({ _id: m._id }, { horsLigneNotifie: false });
        if (chat) await envoyerTelegram(chat, `✅ ${label} « ${m.nom} » est de nouveau en ligne.`);
      }
    }
  }
}

// Alerte Telegram quand la température du matériel dépasse 75 °C (une seule fois, jusqu'au retour sous 70 °C)
async function controlerTemperature(Modele, doc, temp, label) {
  if (temp == null || isNaN(temp)) return;
  if (temp >= 75 && !doc.surchauffeNotifiee) {
    await Modele.updateOne({ _id: doc._id }, { surchauffeNotifiee: true });
    await prevenirProprietaire(doc.proprietaire, `🌡️ ${label} « ${doc.nom} » : température élevée (${Math.round(temp)} °C).`);
  } else if (temp < 70 && doc.surchauffeNotifiee) await Modele.updateOne({ _id: doc._id }, { surchauffeNotifiee: false });
}

module.exports = { controlerTemperature, raisonRefus, creerMission, declencherVerification, lancerRondes, surveillerMateriel, prevenirProprietaire };
