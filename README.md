# Reparus Tec

Sistema web de gestión de órdenes de reparación para **Reparus Tec**, una PYME ficticia: un taller de reparación de computadoras. 

Proyecto de **Aplicaciones Web Avanzadas** (EPN), primer bimestre: aplicación **monolítica** con chat en tiempo real mediante WebSocket.

> Versión de esta entrega: `v1.0-b1`.

## 1. La PYME y el problema

Reparus Tec recibe laptops, computadoras de escritorio y todo en uno. Hoy el taller registra los equipos en papel, el cliente se entera del avance por llamadas telefónicas y no queda constancia de lo que se habló. Esto produce:

- órdenes que se pierden o se duplican y búsquedas lentas por cliente o por equipo;
- clientes que llaman para preguntar «¿ya está mi equipo?» y personal interrumpido;
- sin historial de estados ni de conversaciones, por lo que no se puede aclarar un reclamo.

**Solución:** Reparus Tec centraliza las **órdenes de reparación** con su historial de estados, ofrece un **chat por orden** entre el cliente y el taller, una **sala general** solo para el personal y **avisos en tiempo real** cuando cambia el estado de una orden o llega un mensaje.

Todos los datos del repositorio son ficticios.

### Roles

| Rol | Qué puede hacer |
| --- | --- |
| Cliente (`customer`) | Registrarse, ver solo sus órdenes (sin notas internas), chatear en el chat de cada una y editar su perfil. |
| Técnico (`technician`) | Ver las órdenes asignadas a él, cambiar su estado, chatear con el cliente y usar la sala general. |
| Administrador (`admin`) | Todo lo anterior sobre todas las órdenes; además crea, edita, asigna técnico y elimina órdenes, gestiona clientes y crea al personal. |

## 2. Objetivos

**Objetivo general.** Desarrollar una aplicación web monolítica para Reparus Tec que centralice las órdenes de reparación y la comunicación entre clientes y personal en tiempo real, cumpliendo los requisitos de seguridad, pruebas y rendimiento del primer bimestre.

**Objetivos específicos (medibles).**

1. Implementar el registro, el inicio de sesión y la recuperación de clave con token de un solo uso que caduca a los **30 minutos**, con validación en el navegador y en el servidor, y con la clave guardada como hash con sal (bcrypt).
2. Construir el CRUD de órdenes con listado **paginado de 10 por página**, búsqueda y filtro por estado, eliminación con confirmación y un flujo de **6 estados** con transiciones controladas por el servidor.
3. Implementar un servidor WebSocket propio (Socket.IO, en el mismo proyecto) autenticado con la sesión, con **chat por orden**, **sala general del personal**, historial persistido, usuarios conectados y **2 notificaciones en tiempo real** (cambio de estado y mensaje nuevo).
4. Persistir los datos en PostgreSQL con **6 tablas** relacionadas e índices en los campos de búsqueda.
5. Verificar el sistema con pruebas automatizadas ejecutables con **un solo comando** (`npm test`; más de 200 pruebas, muy por encima del mínimo de 5) y **2 mediciones de rendimiento** (Lighthouse y tiempo de consulta con y sin índices).
6. Completar las **16 historias de usuario** definidas, con **todos los integrantes** aportando commits mediante ramas y pull requests.

## 3. Stack

| Capa | Tecnología |
| --- | --- |
| Servidor | Node.js 22 · Express 5 |
| Vistas | EJS (renderizado en el servidor) con `express-ejs-layouts` · Bootstrap 5 · JavaScript sin frameworks en el navegador |
| Tiempo real | Socket.IO (servidor propio, mismo proceso que la aplicación) |
| Base de datos | PostgreSQL 16 · Sequelize (modelos y migraciones) |
| Sesión | `express-session` con almacén en PostgreSQL (`connect-pg-simple`) |
| Seguridad | `bcryptjs`, `helmet`, `csrf-csrf`, `express-validator`, `express-rate-limit` |
| Correo (simulado) | Nodemailer + Mailpit |
| Pruebas | Jest · Supertest · socket.io-client |
| Entorno | Docker Compose |

## 4. Cómo ejecutar el proyecto

### Con Docker (recomendado)

```bash
cp .env.example .env
docker compose up --build
docker compose exec app npm run db:seed   # datos de prueba (opcional)
```

- Aplicación: <http://localhost:3000>
- Estado del sistema: <http://localhost:3000/salud>
- Bandeja de correos simulados (Mailpit): <http://localhost:8025>

### Sin Docker

Requiere Node.js 22 y PostgreSQL 16.

```bash
cp .env.example .env     # ajusta DB_HOST, DB_PORT y DB_PASSWORD
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

### Ejecutar las pruebas

Las pruebas usan la base de datos real, así que primero deben estar levantadas la base y las migraciones.

```bash
docker compose up -d db
npm run db:migrate
npm test
```

Más detalle en [docs/pruebas.md](docs/pruebas.md) y [docs/rendimiento/README.md](docs/rendimiento/README.md).

### Credenciales de prueba (datos ficticios)

Clave para todos: `Reparus2026`

| Rol | Correo |
| --- | --- |
| Administrador | `admin@reparus.test` |
| Técnicos | `carlos@reparus.test`, `sofia@reparus.test` |
| Clientes | `lucia@reparus.test`, `marco@reparus.test`, `elena@reparus.test` |

Los correos de recuperación de clave llegan a Mailpit (<http://localhost:8025>), no a una bandeja real.

## 5. Variables de entorno

Copia `.env.example` como `.env`.

| Variable | Descripción |
| --- | --- |
| `NODE_ENV` | `development` |
| `PORT` | Puerto de la aplicación (3000) |
| `SESSION_SECRET` | Secreto para firmar la sesión. |
| `APP_URL` | Dirección con la que se abre la aplicación (va en los enlaces de los correos) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión a PostgreSQL |
| `DB_PORT_EXTERNAL` | Puerto con el que se ve la base desde tu computador cuando usas Docker (5433) |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | Servidor de correo (Mailpit en desarrollo) |

## 6. Arquitectura y diagramas

- [Arquitectura del monolito](docs/diagramas/arquitectura.md): capas, base de datos y servidor WebSocket.
- [Chat y tiempo real](docs/diagramas/chat-websocket.md): conexión autenticada, salas y eventos.
- [Modelo de datos](docs/diagramas/modelo-entidad-relacion.md): 6 tablas, enums, índices y restricciones.
- [Historias de usuario](docs/historias-de-usuario.md): las 16 historias con lo que se implementó y la prueba que las cubre.

Resumen: un solo proyecto desplegable. Express recibe las peticiones, los **módulos** (`autenticacion`, `ordenes`, `chat`) las resuelven con rutas → controlador → servicio → modelo y las vistas EJS se renderizan en el servidor. Socket.IO vive en el mismo servidor HTTP y reutiliza la sesión de Express, de modo que no hay un segundo inicio de sesión para el WebSocket.

## 7. Seguridad

| Medida | Dónde |
| --- | --- |
| Clave guardada con **hash y sal** (bcrypt); nunca en texto plano | `autenticacion.servicio.js` |
| Validación en el navegador **y** en el servidor (`express-validator`) | `*.validaciones.js`, `publico/js/validacion-formularios.js` |
| Mensaje de error idéntico para correo inexistente y clave incorrecta | `autenticacion.servicio.js` |
| Límite de intentos en inicio de sesión y recuperación | `limitador.js` |
| Token de recuperación: aleatorio, guardado como hash, de un solo uso y con caducidad de 30 min | `autenticacion.servicio.js` |
| Sesión en cookie `httpOnly`, `sameSite=lax` y `secure` en producción | `configuracion/sesion.js` |
| Protección CSRF en formularios y peticiones `fetch` | `compartido/middlewares/csrf.js` |
| Cabeceras de seguridad y política CSP (`helmet`); sin scripts incrustados ni CDN | `app.js` |
| Rutas protegidas por rol; una orden ajena responde 404 | `compartido/middlewares/sesion.js` |
| **WebSocket autenticado:** sin sesión, la conexión se rechaza | `sockets/index.js` |
| Mensajes del chat saneados (sin HTML) antes de guardarse y mostrarse | `chat.servicio.js` |

## 8. Despliegue con HTTPS (wss)

El cliente de Socket.IO se conecta al mismo origen desde donde se cargó la página. Por eso, **en el despliegue la aplicación debe servirse detrás de HTTPS** (por ejemplo con un proxy inverso como Nginx o Caddy con certificado): así el navegador usa `https` y el chat se conecta por **`wss://`** cifrado. En desarrollo local se usa `http` y `ws` sin cifrar.

## 9. Diseño del chat

- **Sala por orden** (`order:<id>`): participan el cliente dueño de la orden, el técnico asignado y los administradores. Mantiene la conversación junto a la orden que se está reparando y deja el historial guardado.
- **Sala general** (`staff:general`): **solo para el personal** (administradores y técnicos). Sirve para coordinar el trabajo del taller. **Los clientes no entran**: ya tienen su sala por orden con los técnicos de sus equipos, y no deben ver conversaciones internas ni de otros clientes.
- **Quién entra lo decide el servidor.** El navegador solo pide unirse; el servidor consulta la base de datos según el rol y la orden. Un usuario sin acceso recibe un rechazo y no recibe los mensajes.
- Cada mensaje se **guarda antes** de reenviarse; al entrar se carga el historial (últimos 50) y la lista de usuarios conectados.
- **Avisos personales** por una sala privada de cada usuario (`user:<id>`): cambio de estado de una orden y mensaje nuevo cuando el chat de esa orden no está abierto.

## 10. Cronograma y reparto de roles

| Num | Actividades | Responsables |
| --- | --- | --- |
| 1 | Base del proyecto: estructura, Docker Compose, base de datos, migraciones y semillas (T-01) | Integrante 1 |
| 2 | Registro (HU-01), inicio de sesión (HU-02), cerrar sesión y rutas protegidas (HU-04), usuarios del personal (HU-05) | Integrantes 1 |
| 3 | Recuperación de clave (HU-03), crear orden (HU-07), listado, detalle y edición de órdenes (HU-08, HU-09, HU-10), conexión base de Socket.IO | Integrantes 1, 2 y 3 |
| 4 | Cambiar estado (HU-11), aviso del cambio de estado (HU-12), chat por orden (HU-13) y sala general (HU-14) | Integrantes 3 y 4 |
| 5 | Clientes (HU-06), aviso de mensaje nuevo (HU-15), perfil del cliente (HU-16), pruebas y rendimiento (T-02) | Integrantes 4 y 5 |
| 6 | README, diagramas, presentación, ensayo de la demostración y etiqueta `v1.0-b1` (T-03) | Todos, coordina el Integrante 1 |

## 11. Integrantes

| Integrante | Nombre | Rol | Responsabilidad |
| --- | --- | --- | --- |
| 1 | _Andreina Pallo_ | Autenticación | Registro, inicio de sesión, recuperación de clave, rutas protegidas y usuarios del personal |
| 2 | _Belén Cholango_ | Órdenes | CRUD de órdenes, listado, detalle, asignación de técnico |
| 3 | _Javier Quilumba_ | Chat | Servidor Socket.IO, chat por orden, sala general |
| 4 | _Jotcelyn Godoy_ | Estados y portal del cliente | Cambio de estado, clientes |
| 5 | _Nahomy Llumiquinga_ | Avisos, cliente y pruebas | Avisos en tiempo real, perfil de cliente, Pruebas y rendimiento |

## 12. Pruebas y rendimiento

- **Pruebas automatizadas:** `npm test` ejecuta todas las suites (Jest, Supertest y socket.io-client). Mapa de criterios en [docs/pruebas.md](docs/pruebas.md).
- **Lighthouse** de la pantalla principal (`/ordenes`): [resumen](docs/rendimiento/lighthouse-ordenes-mobile.md) e [informe completo](docs/rendimiento/lighthouse-ordenes-mobile.report.html).
- **Tiempo de consulta del listado con y sin índices:** [docs/rendimiento/listado-indices.md](docs/rendimiento/listado-indices.md).

## 13. Estructura del proyecto

```
src/
  configuracion/   entorno, base de datos, sesión, Socket.IO, modelos
  compartido/      constantes, middlewares, utilidades
  modulos/
    autenticacion/ rutas, controlador, servicio, validaciones, modelos
    ordenes/       ídem (órdenes, clientes, historial de estados)
    chat/          ídem + sockets/
  vistas/          EJS (layout, parciales, por módulo)
publico/           css, js, img
base-de-datos/     migraciones y semillas
pruebas/           pruebas por módulo
scripts/           mediciones de rendimiento
docs/              diagramas, historias de usuario, pruebas y rendimiento
```

Regla: un módulo **no importa modelos de otro módulo**; solo usa identificadores y funciones de servicio (por ejemplo `canUserAccessOrder`).

## 14. Convenciones

- Carpetas y archivos en español con el formato `modulo.tipo.js`; identificadores de código, base de datos y eventos en inglés; interfaz, commits, tickets y documentación en español.
- Commits: `tipo[ticket]: descripción`
- Ramas: `feat/<ticket>-descripcion`, con pull request antes de unir a `main`.

## 15. Uso de IA

- **Herramienta:** Claude (Anthropic).
- **Para qué se usó:** apoyo en el diseño y la generación de código base y de pruebas, redacción de la documentación (diagramas en Mermaid e historias de usuario), revisión de errores y explicación de conceptos.
- **Qué hizo el equipo:** cada cambio se integró con rama y pull request; el equipo ejecutó las pruebas (`npm test`), revisó lo generado y puede **explicarlo y modificarlo**
- **Qué no se hizo:** no se copiaron repositorios de otros grupos ni se usó código externo sin citarlo. Las dependencias están declaradas en `package.json`.

