// HU-16: perfil del cliente. Cada cliente solo trabaja con su propio perfil: siempre se busca
// por el identificador de la sesión, nunca por un identificador que llegue en la petición.
const sequelize = require('../../configuracion/baseDeDatos');
// Igual que el registro (HU-01), el perfil toca usuario y cliente a la vez; por eso pide Customer al registro central.
const { User, Customer } = require('../../configuracion/modelos');

// Datos del perfil del usuario, o null si no tiene perfil de cliente.
async function getProfile(userId) {
  const user = await User.findByPk(userId, { attributes: ['id', 'name', 'email'] });
  const customer = await Customer.findOne({ where: { userId } });
  if (!user || !customer) return null;

  return {
    name: user.name,
    email: user.email,
    nationalId: customer.nationalId,
    phone: customer.phone,
    address: customer.address ?? '',
  };
}

// Actualiza SOLO nombre, teléfono y dirección, en una sola transacción. El rol, la cédula y el
// correo no se tocan aunque lleguen en la petición. Devuelve el perfil actualizado o null.
async function updateProfile(userId, { name, phone, address }) {
  return sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(userId, { transaction });
    const customer = await Customer.findOne({ where: { userId }, transaction });
    if (!user || !customer) return null;

    await user.update({ name }, { transaction });
    await customer.update({ phone, address: address || null }, { transaction });
    return {
      name: user.name,
      email: user.email,
      nationalId: customer.nationalId,
      phone: customer.phone,
      address: customer.address ?? '',
    };
  });
}

module.exports = { getProfile, updateProfile };
