const mongoose = require('mongoose');

const parcelleSchema = new mongoose.Schema(
  {
    proprietaire: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    nom: { type: String, required: true, trim: true, maxlength: 100 },
    localisation: { type: String, required: true, trim: true }, // ex. "Kaolack, village de ..."
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    culture: { type: String, required: true, trim: true }, // arachide, mil, maïs...
    contour: { type: [[Number]], default: undefined }, // points [latitude, longitude] tracés sur la carte
    superficieHa: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Parcelle', parcelleSchema);
