// Controlador de autenticación: recibe la petición, llama al servicio y responde (HU-01 a HU-05).
// No pongas aquí la lógica de negocio; va en autenticacion.servicio.js.
const authService = require('./autenticacion.servicio');
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

module.exports = { showRegister, register, showLogin, login };
