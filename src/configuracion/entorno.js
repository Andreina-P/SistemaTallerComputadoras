// Lee las variables de entorno (.env) y las expone en un solo objeto.
// Ningún otro archivo debe leer process.env directamente.
require('dotenv').config({ quiet: true });

const read = (name, fallback) => process.env[name] ?? fallback;

const nodeEnv = read('NODE_ENV', 'development');
const sessionSecret = read('SESSION_SECRET', 'secreto-solo-para-desarrollo');

if (nodeEnv === 'production' && sessionSecret === 'secreto-solo-para-desarrollo') {
  throw new Error('Define SESSION_SECRET en producción');
}

module.exports = {
  nodeEnv,
  port: Number(read('PORT', '3000')),
  sessionSecret,
  db: {
    host: read('DB_HOST', 'localhost'),
    port: Number(read('DB_PORT', '5432')),
    name: read('DB_NAME', 'reparus'),
    user: read('DB_USER', 'reparus'),
    password: read('DB_PASSWORD', 'reparus'),
  },
  mail: {
    host: read('SMTP_HOST', 'localhost'),
    port: Number(read('SMTP_PORT', '1025')),
    from: read('MAIL_FROM', 'Reparus Tec <no-responder@reparus.test>'),
  },
};
