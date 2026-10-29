const crypto = require('crypto');

// Secret partagé avec Telegram pour vérifier que les requêtes du webhook viennent bien de lui
const secretWebhook = () =>
  crypto.createHash('sha256').update('tg:' + process.env.JWT_SECRET).digest('hex').slice(0, 32);

const url = (method) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

async function appelTelegram(method, body) {
  const r = await fetch(url(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return r.json();
}

// Envoie un message. Renvoie true si Telegram l'a accepté. Sans TELEGRAM_BOT_TOKEN : écrit dans les logs.
async function envoyerTelegram(chatId, text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) { console.log('[Telegram simulé]', text); return false; }
  try {
    return !!(await appelTelegram('sendMessage', { chat_id: chatId, text })).ok;
  } catch (e) {
    console.error('Telegram :', e.message);
    return false;
  }
}

// Envoie la photo de l'alerte avec son texte (retombe sur le texte seul si la photo est refusée)
async function envoyerTelegramPhoto(chatId, caption, dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId || !m) return envoyerTelegram(chatId, caption);
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', caption);
    form.append('photo', new Blob([Buffer.from(m[2], 'base64')], { type: m[1] }), 'alerte.jpg');
    const r = await (await fetch(url('sendPhoto'), { method: 'POST', body: form })).json();
    if (!r.ok) throw new Error(r.description);
    return true;
  } catch (e) {
    console.error('Telegram photo :', e.message);
    return envoyerTelegram(chatId, caption);
  }
}

async function nomDuBot() {
  try {
    const r = await appelTelegram('getMe');
    return r.ok ? r.result.username : null;
  } catch (e) {
    return null;
  }
}

// Enregistre l'adresse du webhook chez Telegram (appelé au démarrage du serveur)
async function configurerWebhook() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !/^https:\/\//.test(process.env.CLIENT_URL || ''))
    return console.log('Webhook Telegram non configuré (TELEGRAM_BOT_TOKEN ou CLIENT_URL en https manquant)');
  try {
    const r = await appelTelegram('setWebhook', {
      url: `${process.env.CLIENT_URL}/api/telegram/webhook`,
      secret_token: secretWebhook(),
      allowed_updates: ['message'],
    });
    console.log('Webhook Telegram :', r.ok ? 'actif' : JSON.stringify(r));
  } catch (e) {
    console.error('Webhook Telegram :', e.message);
  }
}

module.exports = { envoyerTelegram, envoyerTelegramPhoto, nomDuBot, configurerWebhook, secretWebhook };
