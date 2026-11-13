// Conexión única a PostgreSQL con Sequelize. Todos los modelos usan esta instancia.
const { Sequelize } = require('sequelize');
const { db } = require('./entorno');

const sequelize = new Sequelize(db.name, db.user, db.password, {
  host: db.host,
  port: db.port,
  dialect: 'postgres',
  logging: process.env.DB_LOGGING === 'true' ? console.log : false,
});

module.exports = sequelize;
