const mongoose = require('mongoose');

const boiteSchema = new mongoose.Schema(
  {
    classe: { type: String, required: true }, // ex. "personne", "bovin", "ovin"
    confiance: { type: Number, min: 0, max: 1, required: true },
    // Coordonnées normalisées (0 à 1) par rapport à la taille de l'image
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    largeur: { type: Number, required: true },
    hauteur: { type: Number, required: true },
  },
  { _id: false }
);

const alerteSchema = new mongoose.Schema(
  {
    proprietaire: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parcelle: { type: mongoose.Schema.Types.ObjectId, ref: 'Parcelle', required: true, index: true },
    camera: { type: mongoose.Schema.Types.ObjectId, ref: 'Camera' },
    drone: { type: mongoose.Schema.Types.ObjectId, ref: 'Drone' },
    source: { type: String, enum: ['camera', 'drone'], default: 'camera' },
    position: { lat: Number, lng: Number },        // position GPS de la détection
    suiviId: { type: String, index: true },        // identifiant de suivi DeepSORT (même intrus = même identifiant)
    detections: { type: Number, default: 1 },      // nombre de détections regroupées dans cette alerte
    dureeS: Number,                                // durée de présence de l'intrus (secondes)
    nbPersonnes: Number,
    zone: String,
    fusion: { type: Boolean, default: false },     // confirmée par le drone ET une caméra fixe
    verdict: { type: String, enum: ['vraie', 'fausse'] },
    imageUrl: { type: String }, // adresse de l'image, servie par l'API
    image: { type: String, select: false }, // image encodée (data URL), non renvoyée dans les listes
    detecteLe: { type: Date, required: true, index: true }, // date/heure de détection (envoyée par le Pi)
    typeIntrus: { type: String, required: true },
    confiance: { type: Number, min: 0, max: 1, required: true },
    niveau: { type: String, enum: ['faible', 'moyen', 'eleve'], required: true, index: true },
    statut: { type: String, enum: ['nouvelle', 'vue', 'traitee'], default: 'nouvelle', index: true },
    boites: { type: [boiteSchema], default: [] },
  },
  { timestamps: true }
);

alerteSchema.index({ proprietaire: 1, detecteLe: -1 });
// Les alertes sont supprimées automatiquement après RETENTION_JOURS jours (60 par défaut) pour ne pas remplir la base gratuite
alerteSchema.index({ createdAt: 1 }, { expireAfterSeconds: Number(process.env.RETENTION_JOURS || 60) * 86400 });

module.exports = mongoose.model('Alerte', alerteSchema);
