# Pruebas automatizadas (T-02)

## Cómo ejecutarlas

Con la base de datos de pruebas arriba (`docker compose up -d db`, migraciones aplicadas y `DB_PORT=5433` en `.env` si corres desde tu computador):

```
npm test
```

Un solo comando ejecuta todas las suites (Jest + Supertest + socket.io-client). El script usa `--runInBand` para no agotar las conexiones de PostgreSQL. Los usuarios que crean las pruebas usan correos `test-…@reparus.test` y se borran al terminar.

## Criterios del ticket y la prueba que los cubre

| Criterio                                                                                 | Archivo                                      | Prueba                                                                                                                                                     |
| ---------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El registro rechaza un correo inválido y una contraseña débil                            | `pruebas/autenticacion/registro.test.js`     | `rechaza correo inválido`, `rechaza clave corta`, `rechaza clave sin número`, `rechaza clave sin letra`                                                    |
| El registro siempre crea el usuario con rol cliente                                      | `pruebas/autenticacion/registro.test.js`     | `el rol es siempre cliente aunque el formulario envíe otro`                                                                                                |
| El inicio de sesión abre sesión con credenciales correctas y las rechaza con incorrectas | `pruebas/autenticacion/login.test.js`        | `con credenciales correctas abre sesión y redirige a las órdenes`, `clave incorrecta, correo inexistente y usuario inactivo dan el mismo mensaje genérico` |
| Un token de recuperación usado o vencido se rechaza                                      | `pruebas/autenticacion/recuperacion.test.js` | `un token ya usado se rechaza`, `un token vencido se rechaza`                                                                                              |
| Una ruta protegida redirige al inicio de sesión sin sesión                               | `pruebas/autenticacion/sesion.test.js`       | `sin sesión, una ruta protegida redirige al inicio de sesión`                                                                                              |
| Crear una orden valida tipos, longitudes y fecha no futura                               | `pruebas/ordenes/crear.test.js`              | `rechaza tipo de equipo inventado`, `rechaza marca de una letra`, `rechaza fecha futura`, `rechaza fecha inválida`, `rechaza costo negativo`               |
| Un cliente no puede consultar una orden ajena                                            | `pruebas/ordenes/listado-detalle.test.js`    | `una orden ajena responde 404 al cliente (igual que una que no existe)`                                                                                    |
| Una transición de estado no permitida es rechazada                                       | `pruebas/ordenes/cambiar-estado.test.js`     | `el servidor rechaza todas las transiciones que no son del flujo`, `una transición no permitida por HTTP responde 409 y no cambia nada`                    |
| Una conexión WebSocket sin sesión es rechazada                                           | `pruebas/chat/socket-base.test.js`           | `sin sesión la conexión se rechaza`, `con una cookie de sesión falsa la conexión se rechaza`                                                               |
| Un usuario sin acceso no puede unirse al chat de una orden                               | `pruebas/chat/chat-orden.test.js`            | `un usuario sin acceso es rechazado y no recibe los mensajes de la sala`                                                                                   |
| Un mensaje con HTML se guarda saneado                                                    | `pruebas/chat/chat-orden.test.js`            | `un mensaje con HTML se guarda saneado`, `el saneamiento no se deja engañar por etiquetas anidadas`                                                        |
| Las pruebas corren con un solo comando                                                   | `package.json`                               | `npm test`                                                                                                                                                 |
| Informe de Lighthouse de la pantalla principal en el repositorio                         | `docs/rendimiento/`                          | `lighthouse-ordenes-mobile.report.html` y su resumen `.md`                                                                                                 |
| Tiempo de la consulta del listado con y sin índice                                       | `docs/rendimiento/`                          | `listado-indices.md`                                                                                                                                       |

El resto de las suites (cambiar estado, avisos en tiempo real, sala general, clientes, edición y eliminación de órdenes) cubren las demás historias de usuario; el ticket pide un mínimo de 10 pruebas y el proyecto tiene muchas más.
