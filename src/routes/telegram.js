const router = require('express').Router();
const User = require('../models/User');
const { envoyerTelegram, secretWebhook } = require('../utils/telegram');

// Telegram appelle cette route à chaque message envoyé au bot
router.post('/webhook', async (req, res) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== secretWebhook()) return res.sendStatus(401);
  res.sendStatus(200);
  try {
    const m = req.body && req.body.message;
    if (!m || !m.text || !m.text.startsWith('/start')) return;
    const chatId = String(m.chat.id);
    const code = m.text.split(' ')[1];

    if (!code)
      return envoyerTelegram(chatId, 'Bienvenue sur SamaTool 🌱\nPour relier ce Telegram à votre compte, ouvrez la page « Notifications » du site et appuyez sur « Relier mon Telegram ».');

    const user = await User.findOneAndUpdate(
      { telegramLinkCode: code, telegramLinkExpire: { $gt: new Date() } },
      { telegramChatId: chatId, $unset: { telegramLinkCode: 1, telegramLinkExpire: 1 } },
      { new: true }
    );
    await envoyerTelegram(chatId, user
      ? `✅ Telegram relié au compte de ${user.nom}.\nVous recevrez ici les alertes de niveau élevé et vous pourrez récupérer votre mot de passe via Telegram.`
      : 'Lien invalide ou expiré. Générez-en un nouveau depuis la page « Notifications » du site.');
  } catch (e) {
    console.error('Webhook Telegram :', e.message);
  }
});

module.exports = router;
