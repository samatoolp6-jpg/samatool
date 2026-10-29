const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'upgrade-insecure-requests': null,
        'script-src': ["'self'", 'https://cdnjs.cloudflare.com'],
        'connect-src': ["'self'", 'https://planetarycomputer.microsoft.com'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      },
    },
  })
);
app.use(cors({ origin: process.env.CLIENT_URL || true }));
app.use(express.json({ limit: '5mb' })); // les images des alertes arrivent en base64

// Limite les tentatives sur les routes d'authentification (anti force brute)
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, date: new Date() }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/parcelles', require('./routes/parcelles'));
app.use('/api/cameras', require('./routes/cameras'));
app.use('/api/alertes', require('./routes/alertes'));
app.use('/api/device', require('./routes/device'));
app.use('/api/telegram', require('./routes/telegram'));

app.use('/api', (req, res) => res.status(404).json({ message: 'Route introuvable' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (['ValidationError', 'CastError'].includes(err.name) ? 400 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ message: status === 500 ? 'Erreur interne du serveur' : err.message });
});

module.exports = app;
