# Reparus Tec

Sistema web de gestión de órdenes de reparación para una PYME ficticia (taller de reparación de computadoras). Proyecto de **Aplicaciones Web Avanzadas** (EPN) – 1.er bimestre: aplicación monolítica.

## Problema que resuelve

El taller registra los equipos en papel y avisa por llamadas. Reparus Tec centraliza las **órdenes de reparación**, su historial de estados, un **chat por orden** (cliente ↔ taller), una sala general del personal y **notificaciones en tiempo real** cuando cambia el estado.

Roles: `admin`, `technician`, `customer` (una sola URL, vistas según rol).

## Stack

Node.js 22 · Express 5 · EJS (+ express-ejs-layouts) · Socket.IO · PostgreSQL 16 · Sequelize · Bootstrap 5 · Jest + Supertest · Docker Compose + Mailpit.

## Requisitos

- Docker y Docker Compose **o** Node.js 22 + PostgreSQL 16 local.

## Ejecutar con Docker

```bash
cp .env.example .env
docker compose up --build
docker compose exec app npm run db:seed   # datos de prueba (opcional)
```

- Aplicación: http://localhost:3000
- Estado del sistema: http://localhost:3000/salud
- Correos de prueba (Mailpit): http://localhost:8025

## Ejecutar sin Docker

```bash
cp .env.example .env     # ajustar DB_HOST=localhost y DB_PORT
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

## Variables de entorno

| Variable                                                  | Descripción                                             |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `NODE_ENV`                                                | `development` / `production` / `test`                   |
| `PORT`                                                    | Puerto de la aplicación (3000)                          |
| `SESSION_SECRET`                                          | Secreto de sesión (obligatorio cambiarlo en producción) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión a PostgreSQL                                   |
| `DB_PORT_EXTERNAL`                                        | Puerto publicado en tu máquina (5433)                   |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`                     | Correo (Mailpit en desarrollo)                          |

Nunca subas el archivo `.env` al repositorio.

## Scripts

`npm run dev` · `npm start` · `npm test` · `npm run db:migrate` · `npm run db:migrate:undo` · `npm run db:seed` · `npm run db:reset` · `npm run format`

## Credenciales de prueba (datos ficticios)

Clave para todos: `Reparus2026`. Usuarios: `admin@`, `carlos@`, `sofia@`, `lucia@`, `marco@`, `elena@` + `reparus.test`.

## Estructura

```
src/
  configuracion/   entorno, base de datos, modelos
  compartido/      constantes, middlewares, utilidades
  autenticacion/   rutas, controlador, servicio, validaciones, modelos
  ordenes/         ídem
  chat/            ídem + sockets/
  vistas/          EJS (layout, parciales, por módulo)
publico/           css, js, img
base-de-datos/     migraciones y semillas
pruebas/           tests por módulo
docs/              diagramas y bocetos
```

Regla: un módulo **no importa modelos de otro módulo**; solo usa IDs y funciones de servicio (p. ej. `canUserAccessOrder`).

## Convenciones

- Carpetas/archivos en español (`modulo.tipo.js`); identificadores de código, BD y eventos en inglés; interfaz, commits, tickets y docs en español.
- Commits: `tipo[ticket]: descripción` (ej. `feat[85497]: Base del proyecto`).
- Ramas: `feat/<ticket>-descripcion`.

## Notas

- `npm audit` reporta 2 vulnerabilidades moderadas (`uuid` dentro de Sequelize). No ejecutar `npm audit fix --force` (degrada Sequelize a v3).
- Modelo de datos: `docs/diagramas/modelo-entidad-relacion.md`.

## Integrantes

| Integrante | Rol | Módulo |
| ---------- | --- | ------ |
|            |     |        |

## Uso de IA

(Completar según las reglas de la guía.)
