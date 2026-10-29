const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protège une route : exige l'en-tête  Authorization: Bearer <token>
module.exports = async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Authentification requise' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: 'Utilisateur introuvable' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Session invalide ou expirée' });
  }
};
