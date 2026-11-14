// HU-16: controlador del perfil del cliente.
const profileService = require('./perfil.servicio');
const { collectErrors } = require('./autenticacion.validaciones');

function renderProfile(res, { status = 200, profile, errors = {}, values }) {
  return res.status(status).render('autenticacion/perfil', {
    titulo: 'Mi perfil',
    profile,
    errors,
    values: values ?? { name: profile.name, phone: profile.phone, address: profile.address },
  });
}

async function showProfile(req, res, next) {
  const profile = await profileService.getProfile(req.session.user.id);
  if (!profile) return next();
  return renderProfile(res, { profile });
}

async function updateProfile(req, res, next) {
  const userId = req.session.user.id;
  const profile = await profileService.getProfile(userId);
  if (!profile) return next();

  const { errors, values, hasErrors } = collectErrors(req);
  if (hasErrors) return renderProfile(res, { status: 400, profile, errors, values });

  const updated = await profileService.updateProfile(userId, {
    name: req.body.name,
    phone: req.body.phone,
    address: req.body.address,
  });
  // El menú muestra el nombre guardado en la sesión: se actualiza para verlo sin volver a iniciar sesión.
  req.session.user = { ...req.session.user, name: updated.name };

  req.session.flash = { type: 'success', text: 'Tu perfil se actualizó.' };
  return res.redirect('/perfil');
}

module.exports = { showProfile, updateProfile };
