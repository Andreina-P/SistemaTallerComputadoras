// Aplicación Express: configuración, rutas y manejo de errores.
// No arranca el servidor; eso lo hace servidor.js (así las pruebas pueden importar la app).
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const expressLayouts = require('express-ejs-layouts');

const { ROLES, ROLE_LABELS, STATUS_LABELS, DEVICE_LABELS } = require('./compartido/constantes');
const { health } = require('./compartido/salud');
const { notFoundHandler, errorHandler } = require('./compartido/middlewares/errores');

const authRoutes = require('./modulos/autenticacion/autenticacion.rutas');
const orderRoutes = require('./modulos/ordenes/ordenes.rutas');
const chatRoutes = require('./modulos/chat/chat.rutas');

const root = path.join(__dirname, '..');
const app = express();

app.disable('x-powered-by');
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

// Variables disponibles en todas las vistas.
// currentUser lo completará el módulo de autenticación (HU-02) al leer la sesión.
app.use((req, res, next) => {
  res.locals.currentUser = req.session?.user ?? null;
  res.locals.ROLES = ROLES;
  res.locals.roleLabels = ROLE_LABELS;
  res.locals.statusLabels = STATUS_LABELS;
  res.locals.deviceLabels = DEVICE_LABELS;
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
