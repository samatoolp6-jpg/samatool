const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    motDePasse: { type: String, required: true, minlength: 8, select: false },
    telegramChatId: { type: String, default: null },
    // Niveau minimum d'une alerte pour être envoyée automatiquement sur Telegram
    telephone: { type: String, default: null }, // format international, ex. +221770000000
    smsAlertes: { type: Boolean, default: false },
    whatsappAlertes: { type: Boolean, default: false },
    rapportAuto: { type: String, enum: ['aucun', 'hebdo', 'mensuel'], default: 'aucun' },
    pushAbonnements: { type: [{ _id: false, endpoint: String, keys: { p256dh: String, auth: String } }], default: [] },
    telegramNiveauMin: { type: String, enum: ['faible', 'moyen', 'eleve'], default: 'eleve' },
    // Liaison Telegram : code à usage unique envoyé au bot (/start <code>)
    telegramLinkCode: { type: String, select: false },
    telegramLinkExpire: { type: Date, select: false },
    // Réinitialisation du mot de passe : on ne stocke que l'empreinte du jeton
    resetTokenHash: { type: String, select: false },
    resetTokenExpire: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('motDePasse')) return next();
  this.motDePasse = await bcrypt.hash(this.motDePasse, 12);
  next();
});

userSchema.methods.verifierMotDePasse = function (motDePasseClair) {
  return bcrypt.compare(motDePasseClair, this.motDePasse);
};

userSchema.methods.toJSON = function () {
  const o = this.toObject();
  delete o.motDePasse;
  delete o.resetTokenHash;
  delete o.resetTokenExpire;
  delete o.pushAbonnements;
  delete o.telegramLinkCode;
  delete o.telegramLinkExpire;
  delete o.__v;
  return o;
};

module.exports = mongoose.model('User', userSchema);
