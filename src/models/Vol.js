const mongoose = require('mongoose');

const volSchema = new mongoose.Schema(
  {
    drone: { type: mongoose.Schema.Types.ObjectId, ref: 'Drone', required: true, index: true },
    proprietaire: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parcelle: { type: mongoose.Schema.Types.ObjectId, ref: 'Parcelle', required: true },
    type: { type: String, enum: ['couverture', 'verification'], required: true },
    declencheur: { type: String, enum: ['manuel', 'patrouille', 'alerte'], default: 'manuel' },
    statut: { type: String, enum: ['planifie', 'en_cours', 'termine', 'interrompu'], default: 'planifie' },
    plan: { type: [[Number]], default: [] },   // points [latitude, longitude] à survoler
    trajet: { type: [[Number]], default: [] }, // positions réellement parcourues
    debut: Date,
    fin: Date,
    dureeS: Number,
    surfaceHa: { type: Number, default: 0 },
    nbAlertes: { type: Number, default: 0 },
    motif: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Vol', volSchema);
