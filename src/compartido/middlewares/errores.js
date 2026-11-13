// Manejo de rutas inexistentes (404) y de errores no controlados (500).
const { nodeEnv } = require('../../configuracion/entorno');

function notFoundHandler(req, res) {
  res.status(404).render('error', {
    titulo: 'Página no encontrada',
    status: 404,
    mensaje: 'La página que buscas no existe o no tienes acceso a ella.',
  });
}

// Express reconoce un manejador de errores por sus 4 parámetros.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  const mensaje =
    status >= 500 && nodeEnv === 'production'
      ? 'Ocurrió un error inesperado. Intenta de nuevo más tarde.'
      : err.message || 'Ocurrió un error inesperado.';

  return res.status(status).render('error', { titulo: 'Error', status, mensaje });
}

module.exports = { notFoundHandler, errorHandler };
