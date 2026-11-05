const nodemailer = require('nodemailer');

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function envoyerMail({ to, subject, text }) {
  if (!transporter) {
    // Mode développement : pas de SMTP configuré, on affiche le message dans la console
    console.log(`\n[MAIL simulé] À : ${to}\nObjet : ${subject}\n${text}\n`);
    return;
  }
  await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
}

module.exports = { envoyerMail };
