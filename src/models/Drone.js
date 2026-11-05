const mongoose = require('mongoose');

// Fiche drone générique : le type de drone sera choisi plus tard.
// Le drone (ou son ordinateur de bord) envoie sa télémétrie à /api/drone/telemetrie et reçoit l'ordre à exécuter.
const droneSchema = new mongoose.Schema(
  {
    proprietaire: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parcelle: { type: mongoose.Schema.Types.ObjectId, ref: 'Parcelle', required: true, index: true },
    nom: { type: String, required: true, trim: true, maxlength: 100 },
    apiKeyHash: { type: String, required: true, unique: true, select: false },
    apiKeyPrefix: { type: String, required: true },
    etat: { type: String, enum: ['au_sol', 'en_vol', 'en_charge'], default: 'au_sol' },
    batterie: { type: Number, min: 0, max: 100 },
    position: { lat: Number, lng: Number },
    lastSeenAt: { type: Date, default: null },
    // Ordre en attente, renvoyé au drone à chaque télémétrie
    ordre: {
      nature: { type: String, enum: ['aucune', 'mission', 'retour', 'arret_urgence'], default: 'aucune' },
      volId: { type: mongoose.Schema.Types.ObjectId },
      motif: String,
    },
    volCourant: { type: mongoose.Schema.Types.ObjectId, ref: 'Vol', default: null },
    seuilBatterie: { type: Number, default: 25, min: 10, max: 60 }, // retour automatique en dessous
    altitudeM: { type: Number, default: 30 },
    patrouilles: { type: [String], default: [] }, // heures "HH:MM" (heure du Sénégal = UTC)
    verifierSurAlerte: { type: Boolean, default: true },
    derniereRonde: Date,
    temperature: Number,
    signal: Number, // force du signal en dBm
    surchauffeNotifiee: { type: Boolean, default: false },
    horsLigneNotifie: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

droneSchema.virtual('enLigne').get(function () {
  if (!this.lastSeenAt) return false;
  return Date.now() - this.lastSeenAt.getTime() < Number(process.env.DRONE_OFFLINE_SECONDS || 120) * 1000;
});

module.exports = mongoose.model('Drone', droneSchema);
