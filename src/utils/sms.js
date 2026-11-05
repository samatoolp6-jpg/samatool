// SMS et WhatsApp via Twilio (service payant). Sans identifiants Twilio, le message est seulement écrit dans les logs.
async function twilio(to, from, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !from) { console.log('[SMS/WhatsApp simulé]', to, body); return false; }
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!r.ok) console.error('Twilio :', r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) {
    console.error('Twilio :', e.message);
    return false;
  }
}
const envoyerSms = (num, texte) => twilio(num, process.env.TWILIO_SMS_FROM, texte);
const envoyerWhatsapp = (num, texte) =>
  twilio('whatsapp:' + num, process.env.TWILIO_WHATSAPP_FROM ? 'whatsapp:' + process.env.TWILIO_WHATSAPP_FROM : '', texte);

module.exports = { envoyerSms, envoyerWhatsapp };
