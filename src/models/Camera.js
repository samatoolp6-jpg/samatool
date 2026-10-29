const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema(
  {
    proprietaire: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parcelle: { type: mongoose.Schema.Types.ObjectId, ref: 'Parcelle', required: true, index: true },
    nom: { type: String, required: true, trim: true, maxlength: 100 }, // ex. "ESP32-CAM Nord"
    // Clé d'API utilisée par le Raspberry Pi : on stocke l'empreinte SHA-256, jamais la clé en clair
    apiKeyHash: { type: String, required: true, unique: true, select: false },
    apiKeyPrefix: { type: String, required: true }, // pour reconnaître la clé dans l'interface
    lastSeenAt: { type: Date, default: null }, // mis à jour par le heartbeat et à chaque alerte
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

// En ligne = signal reçu récemment
cameraSchema.virtual('enLigne').get(function () {
  if (!this.lastSeenAt) return false;
  const seuil = Number(process.env.CAMERA_OFFLINE_MINUTES || 3) * 60 * 1000;
  return Date.now() - this.lastSeenAt.getTime() < seuil;
});

module.exports = mongoose.model('Camera', cameraSchema);
