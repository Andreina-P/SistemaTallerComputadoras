// Controlador de autenticación: recibe la petición, llama al servicio y responde (HU-01 a HU-05).
// No pongas aquí la lógica de negocio; va en autenticacion.servicio.js.
const authService = require('./autenticacion.servicio');
const { SESSION_COOKIE_NAME } = require('../../configuracion/sesion');
const { collectErrors, matchedData } = require('./autenticacion.validaciones');

// Solo se acepta una ruta interna como destino posterior al login (evita redirecciones a otros sitios).
function safeReturnPath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : null;
}

function showRegister(req, res) {
  res.render('autenticacion/registro', { titulo: 'Crear cuenta', errors: {}, values: {} });
}

async function register(req, res) {
  const { errors, values, hasErrors } = collectErrors(req);
  if (hasErrors) {
    return res
      .status(400)
      .render('autenticacion/registro', { titulo: 'Crear cuenta', errors, values });
  }

  const data = matchedData(req);
  try {
    await authService.registerCustomer({
      name: data.name,
      email: data.email,
      password: data.password,
      nationalId: data.national_id,
      phone: data.phone,
    });
  } catch (error) {
    // Dos registros al mismo tiempo con el mismo correo o cédula: lo detecta la base de datos.
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors?.[0]?.path === 'national_id' ? 'national_id' : 'email';
      return res.status(400).render('autenticacion/registro', {
        titulo: 'Crear cuenta',
        errors: { [field]: 'Este dato ya está registrado.' },
        values,
      });
    }
    throw error;
  }

  req.session.flash = { type: 'success', text: 'Cuenta creada. Ya puedes iniciar sesión.' };
  return res.redirect('/login');
}

function showLogin(req, res) {
  res.render('autenticacion/login', { titulo: 'Iniciar sesión', errors: {}, values: {} });
}

async function login(req, res) {
  const { errors, values, hasErrors } = collectErrors(req);
  if (hasErrors) {
    return res
      .status(400)
      .render('autenticacion/login', { titulo: 'Iniciar sesión', errors, values });
  }

  const user = await authService.authenticate(req.body.email, req.body.password);
  if (!user) {
    // Mensaje genérico: no revela si el correo existe, si la clave es incorrecta o si la cuenta está inactiva.
    return res.status(401).render('autenticacion/login', {
      titulo: 'Iniciar sesión',
      errors: {},
      values: { email: values.email },
      mensajeError: 'Correo o contraseña incorrectos.',
    });
  }

  const returnTo = safeReturnPath(req.session.returnTo);

  // Se crea una sesión nueva al iniciar sesión (evita la fijación de sesión).
  await new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
  req.session.user = user;
  await new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });

  return res.redirect(returnTo || authService.homePathForRole(user.role));
}

// HU-04: destruye la sesión en el servidor y borra las cookies.
function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie(SESSION_COOKIE_NAME);
    res.clearCookie('reparus.csrf');
    return res.redirect('/');
  });
}

// HU-05: pantalla del administrador para crear técnicos y administradores.
async function renderStaff(res, { status = 200, errors = {}, values = {} } = {}) {
  const staff = await authService.listStaff();
  return res.status(status).render('autenticacion/usuarios-personal', {
    titulo: 'Personal',
    staff,
    errors,
    values,
  });
}

function showStaff(req, res) {
  return renderStaff(res);
}

async function createStaff(req, res) {
  const { errors, values, hasErrors } = collectErrors(req);
  if (hasErrors) return renderStaff(res, { status: 400, errors, values });

  const data = matchedData(req);
  try {
    await authService.createStaffUser(data);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return renderStaff(res, {
        status: 400,
        errors: { email: 'Este correo ya está registrado.' },
        values,
      });
    }
    throw error;
  }

  req.session.flash = { type: 'success', text: 'Usuario del personal creado.' };
  return res.redirect('/admin/usuarios');
}

// HU-03: pedir el enlace de recuperación. La respuesta es la misma exista o no el correo.
function showRecover(req, res) {
  res.render('autenticacion/recuperar', { titulo: 'Recuperar clave', errors: {}, values: {} });
}

async function recover(req, res) {
  const { errors, values, hasErrors } = collectErrors(req);
  if (hasErrors) {
    return res
      .status(400)
      .render('autenticacion/recuperar', { titulo: 'Recuperar clave', errors, values });
  }

  await authService.requestPasswordReset(req.body.email);

  req.session.flash = {
    type: 'success',
    text: 'Si el correo está registrado, te enviamos un enlace para elegir una clave nueva. Vale 30 minutos.',
  };
  return res.redirect('/login');
}

function renderInvalidToken(res) {
  return res.status(400).render('autenticacion/restablecer', {
    titulo: 'Enlace no válido',
    token: null,
    errors: {},
  });
}

async function showReset(req, res) {
  const row = await authService.findValidRecoveryToken(req.query.token);
  if (!row) return renderInvalidToken(res);

  return res.render('autenticacion/restablecer', {
    titulo: 'Nueva clave',
    token: req.query.token,
    errors: {},
  });
}

async function reset(req, res) {
  const { errors, hasErrors } = collectErrors(req);
  const token = req.body.token;

  if (hasErrors) {
    return res
      .status(400)
      .render('autenticacion/restablecer', { titulo: 'Nueva clave', token, errors });
  }

  const done = await authService.resetPassword(token, req.body.password);
  if (!done) return renderInvalidToken(res);

  req.session.flash = { type: 'success', text: 'Tu clave se cambió. Ya puedes iniciar sesión.' };
  return res.redirect('/login');
}

module.exports = {
  showRegister,
  register,
  showLogin,
  login,
  logout,
  showStaff,
  createStaff,
  showRecover,
  recover,
  showReset,
  reset,
};
