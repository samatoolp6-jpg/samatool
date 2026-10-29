const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { envoyerMail } = require('../utils/mailer');
const { envoyerTelegram, nomDuBot } = require('../utils/telegram');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const signer = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { nom, email, motDePasse } = req.body;
    if (!nom || !email || !motDePasse) return res.status(400).json({ message: 'Nom, email et mot de passe requis' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Email invalide' });
    if (motDePasse.length < 8) return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères' });

    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(409).json({ message: 'Un compte existe déjà avec cet email' });

    const user = await User.create({ nom, email, motDePasse });
    res.status(201).json({ token: signer(user), user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, motDePasse } = req.body;
    if (!email || !motDePasse) return res.status(400).json({ message: 'Email et mot de passe requis' });

    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+motDePasse');
    if (!user || !(await user.verifierMotDePasse(motDePasse)))
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });

    res.json({ token: signer(user), user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
// Le jeton JWT est sans état : la déconnexion consiste à le supprimer côté client.
router.post('/logout', auth, (req, res) => res.json({ message: 'Déconnecté' }));

// GET /api/auth/me
router.get('/me', auth, (req, res) => res.json({ user: req.user }));

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    // Réponse identique que le compte existe ou non (évite de révéler quels emails sont inscrits)
    const reponse = { message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' };
    if (!email) return res.json(reponse);

    const user = await User.findOne({ email: String(email).toLowerCase() });
    const parTelegram = req.body.canal === 'telegram';
    if (!user || (parTelegram && !user.telegramChatId)) return res.json(reponse);

    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = sha256(token);
    user.resetTokenExpire = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    await user.save();

    const lien = `${process.env.CLIENT_URL || 'http://localhost:3000'}/#/reinitialiser/${token}`;
    if (parTelegram) {
      await envoyerTelegram(user.telegramChatId,
        `🔑 SamaTool : pour choisir un nouveau mot de passe, ouvrez ce lien (valable 30 minutes) :\n${lien}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.`);
    } else {
    await envoyerMail({
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe',
      text: `Bonjour ${user.nom},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 30 minutes) :\n${lien}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    });
    }

    res.json(reponse);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, motDePasse } = req.body;
    if (!token || !motDePasse) return res.status(400).json({ message: 'Jeton et nouveau mot de passe requis' });
    if (motDePasse.length < 8) return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères' });

    const user = await User.findOne({
      resetTokenHash: sha256(String(token)),
      resetTokenExpire: { $gt: new Date() },
    }).select('+resetTokenHash +resetTokenExpire');
    if (!user) return res.status(400).json({ message: 'Lien invalide ou expiré' });

    user.motDePasse = motDePasse; // sera haché par le hook pre('save')
    user.resetTokenHash = undefined;
    user.resetTokenExpire = undefined;
    await user.save();

    res.json({ message: 'Mot de passe modifié. Vous pouvez vous connecter.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/telegram/lien : génère un lien unique vers le bot (valable 15 minutes)
router.post('/telegram/lien', auth, async (req, res, next) => {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN)
      return res.status(400).json({ message: 'Telegram n’est pas encore configuré sur le serveur' });
    const username = await nomDuBot();
    if (!username) return res.status(502).json({ message: 'Impossible de joindre Telegram (vérifiez le jeton du bot)' });
    const code = crypto.randomBytes(8).toString('hex');
    await User.findByIdAndUpdate(req.user._id, {
      telegramLinkCode: code,
      telegramLinkExpire: new Date(Date.now() + 15 * 60 * 1000),
    });
    res.json({ lien: `https://t.me/${username}?start=${code}` });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/telegram : délie le compte de Telegram
router.delete('/telegram', auth, async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.user._id, { telegramChatId: null }, { new: true });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/profil : modifier le nom et l'email
router.put('/profil', auth, async (req, res, next) => {
  try {
    const nom = String(req.body.nom || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!nom || nom.length > 100) return res.status(400).json({ message: 'Nom invalide' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Email invalide' });
    if (email !== req.user.email && (await User.findOne({ email })))
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    const user = await User.findByIdAndUpdate(req.user._id, { nom, email }, { new: true });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/mot-de-passe : changer le mot de passe (l'ancien est exigé)
router.put('/mot-de-passe', auth, async (req, res, next) => {
  try {
    const { ancien, nouveau } = req.body;
    if (!ancien || !nouveau) return res.status(400).json({ message: 'Ancien et nouveau mot de passe requis' });
    if (String(nouveau).length < 8) return res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
    const user = await User.findById(req.user._id).select('+motDePasse');
    if (!(await user.verifierMotDePasse(String(ancien)))) return res.status(400).json({ message: 'Mot de passe actuel incorrect' });
    user.motDePasse = String(nouveau); // haché par le hook pre('save')
    await user.save();
    res.json({ message: 'Mot de passe modifié.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
