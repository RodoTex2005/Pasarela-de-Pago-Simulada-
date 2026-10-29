
require('dotenv').config();

const { app, initializeDatabase } = require('./app');

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Orders ejecutándose en el puerto ${PORT}`);
    });
  } catch (error) {
    console.error('[Orders] No se pudo iniciar el servicio:', error.message);
    process.exit(1);
  }
}

startServer();
