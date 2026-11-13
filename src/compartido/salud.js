// Endpoint de salud: lo usa Docker para saber si la aplicación y la base de datos responden.
const sequelize = require('../configuracion/baseDeDatos');

async function health(req, res) {
  try {
    await sequelize.authenticate();
    res.json({ estado: 'ok', baseDeDatos: 'ok' });
  } catch (error) {
    res.status(503).json({ estado: 'error', baseDeDatos: 'sin conexión' });
  }
}

module.exports = { health };
