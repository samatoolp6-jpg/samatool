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

## API du drone (type de drone choisi plus tard : structure générique)
En-tête obligatoire : `x-api-key: <clé du drone>` (affichée une seule fois à la création du drone).

- `POST /api/drone/telemetrie` toutes les 2 à 5 s : `{ lat, lng, batterie (0-100), etat: "au_sol" | "en_vol" | "en_charge" }`.
  Réponse : `{ ordre: "aucune" | "mission" | "retour" | "arret_urgence", motif?, mission?: { volId, type, plan: [[lat, lng], ...], altitudeM } }`.
  Le drone doit exécuter l'ordre reçu. Le serveur ordonne un retour si le drone sort du contour de la parcelle ou si la batterie passe sous le seuil.
- `POST /api/drone/alertes` : mêmes champs que `/api/device/alertes`.

## Champs supplémentaires des alertes (caméras et drone)
`position: { lat, lng }` (GPS de la détection), `suiviId` (identifiant DeepSORT : même identifiant dans les 10 minutes = une seule alerte),
`dureeS` (durée de présence), `nbPersonnes`, `zone`. Un drone et une caméra qui voient un intrus sur la même parcelle à moins de 5 minutes
d'écart fusionnent : niveau relevé à « élevé ».

## Autres fonctions du serveur
- **Plage horaire de surveillance** (par parcelle) : hors plage, les détections sont ignorées. La réponse de `/api/device/heartbeat`
  contient `surveillance: true|false` pour que le Pi sache s'il doit analyser.
- **Zone d'intérêt** : une détection avec `position` en dehors du contour de la parcelle est ignorée (réponse 202 `{ ignoree: true, raison }`).
- **Supervision** : `/api/device/heartbeat` accepte `{ temperature, signal }` ; `/api/drone/telemetrie` aussi. Alerte Telegram au-delà de 75 °C.
- **Mode hors ligne du Pi** : `POST /api/device/alertes/lot` avec `{ alertes: [...] }`. Les alertes de plus de 15 minutes sont enregistrées sans message.
- **Rapports PDF** : `GET /api/alertes/rapport.pdf?jours=7|30`, envoi automatique sur Telegram (réglage dans Paramètres).
- **SMS et WhatsApp** (niveau élevé) via Twilio, variables facultatives : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM`.
- **Notifications push** : clés VAPID créées automatiquement dans MongoDB, rien à configurer.
