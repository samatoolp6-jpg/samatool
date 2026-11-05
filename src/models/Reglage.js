const mongoose = require('mongoose');

// Réglages internes du serveur (ex. clés VAPID des notifications push, créées automatiquement)
const reglageSchema = new mongoose.Schema({
  cle: { type: String, required: true, unique: true },
  valeur: mongoose.Schema.Types.Mixed,
});

module.exports = mongoose.model('Reglage', reglageSchema);
