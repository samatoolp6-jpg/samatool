# SamaTool

Système de surveillance intelligente des parcelles agricoles (mémoire L3 AgroTIC, USSEIN).
Node.js, Express, MongoDB Atlas. Déployé sur Render (le site et l'API sont servis par le même service).

## Variables d'environnement à définir sur Render
`MONGODB_URI`, `JWT_SECRET`, `NODE_ENV=production`, `CLIENT_URL` (adresse du site), et en option
`TELEGRAM_BOT_TOKEN`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM`.
Render : Build Command `npm install`, Start Command `npm start`.

## API pour le Raspberry Pi
En-tête obligatoire : `x-api-key: <clé de la caméra>` (affichée une seule fois à la création de la caméra).

- `POST /api/device/heartbeat` : signal de vie
- `POST /api/device/alertes` : corps JSON `{ imageBase64, detecteLe, typeIntrus, confiance, niveau, boites }`
  (`niveau` : faible, moyen ou eleve ; `boites` : `[{ classe, confiance, x, y, largeur, hauteur }]`, valeurs de 0 à 1)

## Telegram
Créer un bot avec @BotFather, puis définir `TELEGRAM_BOT_TOKEN` sur Render. Au démarrage, le serveur enregistre
tout seul le webhook (il faut que `CLIENT_URL` soit l'adresse https du site). Chaque utilisateur relie son compte
depuis la page « Notifications » ; le lien Telegram sert aux alertes de niveau élevé et au mot de passe oublié.
