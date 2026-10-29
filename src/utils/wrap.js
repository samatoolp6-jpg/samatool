// Évite un try/catch dans chaque route : toute erreur part vers le gestionnaire d'erreurs
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
