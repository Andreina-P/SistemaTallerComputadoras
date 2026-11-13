// Configuración que usa sequelize-cli para las migraciones y las semillas.
const { db } = require('./entorno');

const base = {
  username: db.user,
  password: db.password,
  database: db.name,
  host: db.host,
  port: db.port,
  dialect: 'postgres',
};

module.exports = {
  development: base,
  test: { ...base, database: `${db.name}_test` },
  production: base,
};
