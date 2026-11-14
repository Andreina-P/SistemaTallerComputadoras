// Punto de entrada: conecta con la base de datos, crea el servidor HTTP
// y le agrega el servidor de tiempo real (Socket.IO) en el mismo proyecto.
const http = require('http');

const app = require('./app');
const sequelize = require('./configuracion/baseDeDatos');
require('./configuracion/modelos');
const { port } = require('./configuracion/entorno');
const { createSocketServer } = require('./configuracion/tiempoReal');

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Base de datos conectada');
  } catch (error) {
    console.error('No se pudo conectar con la base de datos:', error.message);
    process.exit(1);
  }

  const server = http.createServer(app);
  createSocketServer(server, app);

  server.listen(port, () => {
    console.log(`Reparus Tec escuchando en http://localhost:${port}`);
  });
}

start();
