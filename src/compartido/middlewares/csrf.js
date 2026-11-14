// Protección CSRF (token doble). Se aplica a todo POST/PUT/PATCH/DELETE de la aplicación.
// En cada formulario HTML se incluye:  <input type="hidden" name="_csrf" value="<%= csrfToken() %>">
// Para fetch/AJAX se envía el mismo token en la cabecera "x-csrf-token".
const { doubleCsrf } = require('csrf-csrf');
const { sessionSecret, nodeEnv } = require('../../configuracion/entorno');

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => sessionSecret,
  getSessionIdentifier: (req) => req.session.id,
  cookieName: 'reparus.csrf',
  cookieOptions: { httpOnly: true, sameSite: 'lax', secure: nodeEnv === 'production', path: '/' },
  getCsrfTokenFromRequest: (req) => req.body?._csrf || req.headers['x-csrf-token'],
  errorConfig: {
    statusCode: 403,
    message: 'El formulario venció o no es válido. Recarga la página e intenta de nuevo.',
    code: 'EBADCSRFTOKEN',
  },
});

// Pone en las vistas la función csrfToken(). Se genera solo si la vista la llama,
// y en ese momento se asegura de que la sesión se guarde (el token está ligado a ella).
function csrfLocals(req, res, next) {
  res.locals.csrfToken = () => {
    req.session.csrfStarted = true;
    return generateCsrfToken(req, res, { validateOnReuse: false });
  };
  next();
}

module.exports = { csrfLocals, csrfProtection: doubleCsrfProtection };
