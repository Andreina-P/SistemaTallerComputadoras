// Limitador de intentos por IP (express-rate-limit). Se usa en login y recuperación de clave.
const rateLimit = require('express-rate-limit');

function createLimiter({ windowMs, limit, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).render('error', {
        titulo: 'Demasiados intentos',
        status: 429,
        mensaje: 'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.',
      }),
  });
}

module.exports = { createLimiter };
