// Sesiones de usuario guardadas en PostgreSQL (tabla "session", se crea sola si no existe).
// La cookie es httpOnly y sameSite; en producción además es secure (solo HTTPS).
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const { db, nodeEnv, sessionSecret } = require('./entorno');

const isProduction = nodeEnv === 'production';

// Conexión propia para las sesiones (el store de sesiones no usa Sequelize).
const sessionPool = new Pool({
  host: db.host,
  port: db.port,
  database: db.name,
  user: db.user,
  password: db.password,
});

const SESSION_COOKIE_NAME = 'reparus.sid';

const sessionMiddleware = session({
  name: SESSION_COOKIE_NAME,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false, // solo se crea la sesión cuando hay algo que guardar
  store: new PgStore({
    pool: sessionPool,
    createTableIfMissing: true,
    pruneSessionInterval: nodeEnv === 'test' ? false : 60 * 15, // limpia sesiones vencidas cada 15 min
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 8, // 8 horas
  },
});

module.exports = { sessionMiddleware, sessionPool, SESSION_COOKIE_NAME };
