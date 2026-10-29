require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { configurerWebhook } = require('./utils/telegram');

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`API démarrée sur le port ${PORT}`);
      configurerWebhook();
      // Render gratuit endort le site après 15 min sans visite : il s'appelle lui-même toutes les 10 min
      if (process.env.RENDER_EXTERNAL_URL)
        setInterval(() => fetch(process.env.RENDER_EXTERNAL_URL + '/api/health').catch(() => {}), 10 * 60 * 1000);
    });
  } catch (err) {
    console.error('Échec du démarrage :', err.message);
    process.exit(1);
  }
})();
