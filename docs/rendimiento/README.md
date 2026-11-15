# Rendimiento (T-02)

Dos mediciones simples, ambas reproducibles con un comando:

| Medición                                             | Comando                 | Resultado                                                                                                                       |
| ---------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Tiempo de la consulta del listado, con y sin índices | `npm run medir:listado` | [listado-indices.md](./listado-indices.md)                                                                                      |
| Lighthouse de la pantalla principal (`/ordenes`)     | `npm run lighthouse`    | [lighthouse-ordenes-mobile.md](./lighthouse-ordenes-mobile.md) y su [informe completo](./lighthouse-ordenes-mobile.report.html) |

Para repetir Lighthouse: aplicación en marcha (`docker compose up -d`), datos de prueba cargados (`npm run db:seed`) y Google Chrome instalado (si no lo encuentra, define `CHROME_PATH`). Con `LH_PRESET=desktop` se mide la versión de escritorio.

## Hallazgos del informe de Lighthouse

Dos puntos que Lighthouse marca en la pantalla principal y que se pueden corregir fácilmente:

- **Contraste de color** (accesibilidad): algún texto no alcanza el contraste mínimo. El informe HTML indica qué elementos.
- **Meta descripción** (SEO): falta `<meta name="description">` en el diseño base.
