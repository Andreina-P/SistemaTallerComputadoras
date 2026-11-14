// Middlewares reutilizables de sesión y rol. Todos los módulos los usan para proteger sus rutas:
//
//   const { requireAuth, requireRole } = require('../../compartido/middlewares/sesion');
//   router.get('/ordenes', requireAuth, controlador.listar);
//   router.get('/clientes', requireAuth, requireRole(ROLES.ADMIN), controlador.listar);
const { ROLES } = require('../constantes');

// Exige haber iniciado sesión. Si no, manda al login y recuerda la página pedida (solo en GET).
function requireAuth(req, res, next) {
  if (req.session?.user) return next();

  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  req.session.flash = { type: 'error', text: 'Inicia sesión para continuar.' };
  return res.redirect('/login');
}

// Exige que el rol del usuario sea uno de los indicados; si no, responde 403.
// Debe ir después de requireAuth.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.session?.user?.role;
    if (role && allowedRoles.includes(role)) return next();

    return res.status(403).render('error', {
      titulo: 'Acceso denegado',
      status: 403,
      mensaje: 'No tienes permiso para ver esta página.',
    });
  };
}

// Para login y registro: si ya hay sesión, no tiene sentido mostrarlos.
function requireGuest(req, res, next) {
  if (!req.session?.user) return next();
  return res.redirect('/ordenes');
}

// Atajos para los roles más usados.
const requireStaff = requireRole(ROLES.ADMIN, ROLES.TECHNICIAN);
const requireAdmin = requireRole(ROLES.ADMIN);

module.exports = { requireAuth, requireRole, requireGuest, requireStaff, requireAdmin };
