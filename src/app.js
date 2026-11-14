// Aplicación Express: configuración, rutas y manejo de errores.
// No arranca el servidor; eso lo hace servidor.js (así las pruebas pueden importar la app).
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const expressLayouts = require('express-ejs-layouts');
const cookieParser = require('cookie-parser');

const { ROLES, ROLE_LABELS, STATUS_LABELS, DEVICE_LABELS } = require('./compartido/constantes');
const { health } = require('./compartido/salud');
const { notFoundHandler, errorHandler } = require('./compartido/middlewares/errores');

const { sessionMiddleware } = require('./configuracion/sesion');
const { csrfLocals, csrfProtection } = require('./compartido/middlewares/csrf');
const { nodeEnv } = require('./configuracion/entorno');

const authRoutes = require('./modulos/autenticacion/autenticacion.rutas');
const orderRoutes = require('./modulos/ordenes/ordenes.rutas');
const chatRoutes = require('./modulos/chat/chat.rutas');

const root = path.join(__dirname, '..');
const app = express();

app.disable('x-powered-by');
if (nodeEnv === 'production') app.set('trust proxy', 1); // detrás de un proxy HTTPS, para la cookie secure
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'vistas'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(helmet());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Archivos estáticos. Bootstrap y la fuente se sirven desde node_modules
// para no depender de internet ni de CDNs (compatible con la política de seguridad de helmet).
app.use(express.static(path.join(root, 'publico')));
app.use('/vendor/bootstrap', express.static(path.join(root, 'node_modules', 'bootstrap', 'dist')));
app.use(
  '/vendor/poppins',
  express.static(path.join(root, 'node_modules', '@fontsource', 'poppins')),
);

// Sesión (PostgreSQL) y protección CSRF. Van después de los archivos estáticos para no crear sesiones por cada imagen.
app.use(cookieParser());
app.use(sessionMiddleware);
app.use(csrfLocals);
app.use(csrfProtection);

// Variables disponibles en todas las vistas.
app.use((req, res, next) => {
  res.locals.currentUser = req.session?.user ?? null;
  res.locals.ROLES = ROLES;
  res.locals.roleLabels = ROLE_LABELS;
  res.locals.statusLabels = STATUS_LABELS;
  res.locals.deviceLabels = DEVICE_LABELS;

  // Mensaje de una sola vez (por ejemplo "Cuenta creada") guardado antes de una redirección.
  const flash = req.session?.flash;
  if (flash) {
    res.locals[flash.type === 'error' ? 'mensajeError' : 'mensajeExito'] = flash.text;
    delete req.session.flash;
  }
  next();
});

// Cada módulo exporta un Router y se monta aquí. Cada integrante agrega sus rutas
// dentro de su propio archivo *.rutas.js, sin tocar este archivo.
app.use(authRoutes);
app.use(orderRoutes);
app.use(chatRoutes);

app.get('/', (req, res) => res.render('inicio', { titulo: 'Inicio' }));
app.get('/salud', health);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
