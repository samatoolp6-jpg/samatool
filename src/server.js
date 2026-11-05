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
      // Patrouilles planifiées et surveillance du matériel (hors ligne / de retour), chaque minute
      const { lancerRondes, surveillerMateriel } = require('./utils/drones');
      setInterval(() => {
        lancerRondes().catch((e) => console.error('Rondes :', e.message));
        surveillerMateriel().catch((e) => console.error('Surveillance :', e.message));
        require('./utils/rapport').rapportsAuto().catch((e) => console.error('Rapports :', e.message));
      }, 60000);
      // Render gratuit endort le site après 15 min sans visite : il s'appelle lui-même toutes les 10 min
      if (process.env.RENDER_EXTERNAL_URL)
        setInterval(() => fetch(process.env.RENDER_EXTERNAL_URL + '/api/health').catch(() => {}), 10 * 60 * 1000);
    });
  } catch (err) {
    console.error('Échec du démarrage :', err.message);
    process.exit(1);
  }
})();
