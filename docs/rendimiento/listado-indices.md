# Medición del listado de órdenes: con y sin índices (T-02)

- **Datos:** 100.000 órdenes ficticias en un esquema temporal (no se tocan las tablas reales).
- **Método:** `EXPLAIN ANALYZE` de las consultas que genera el listado (filtro + orden por fecha + página de 10); se toma la **mediana de 9 ejecuciones** tras 2 de calentamiento. Tiempo = planificación + ejecución.
- **Servidor:** PostgreSQL 16.16 on x86_64-pc-linux-musl
- **Fecha de la medición:** 2026-11-15
- **Cómo repetirla:** `npm run medir:listado` (genera de nuevo este archivo con los tiempos de tu equipo).

Reparto de los datos: 60 % entregadas, 10 % canceladas, 8 % recibidas, 8 % en diagnóstico, 8 % en reparación y 6 % listas; 2 000 clientes y 8 técnicos (10 % sin asignar).

## Resultados (milisegundos, menos es mejor)

| Consulta | Sin índices (página) | Índices actuales (página) | Compuestos propuestos (página) | Sin índices (conteo) | Índices actuales (conteo) |
|---|---:|---:|---:|---:|---:|
| Administrador: filtrar por estado (Listo) | 10.47 | 5.20 | 0.106 | 8.61 | 3.73 |
| Cliente: sus propias órdenes | 5.69 | 0.465 | 0.160 | 5.70 | 0.337 |
| Técnico: órdenes asignadas a él | 15.06 | 5.97 | 0.273 | 7.80 | 3.15 |
| Administrador: listado sin filtros | 21.74 | 21.69 | 0.174 | 9.88 | 10.34 |
| Búsqueda exacta por número de orden | 7.17 | 0.116 | 0.145 | — | — |
| Búsqueda parcial por número de orden (ILIKE %…%) | 37.87 | 40.76 | 37.71 | — | — |

## Tipo de recorrido que eligió PostgreSQL (consulta de la página)

| Consulta | Sin índices | Índices actuales | Compuestos propuestos |
|---|---|---|---|
| Administrador: filtrar por estado (Listo) | Seq Scan | Bitmap Heap Scan + Bitmap Index Scan | Index Scan |
| Cliente: sus propias órdenes | Seq Scan | Bitmap Heap Scan + Bitmap Index Scan | Index Scan |
| Técnico: órdenes asignadas a él | Seq Scan | Bitmap Heap Scan + Bitmap Index Scan | Index Scan |
| Administrador: listado sin filtros | Seq Scan | Seq Scan | Index Scan |
| Búsqueda exacta por número de orden | Seq Scan | Index Scan | Index Scan |
| Búsqueda parcial por número de orden (ILIKE %…%) | Seq Scan | Seq Scan | Seq Scan |

## Cómo leerlo

- **Seq Scan** es leer toda la tabla; **Index Scan / Bitmap Scan** es usar un índice. Con más órdenes, la diferencia crece.
- Los índices actuales (`status`, `customer_id`, `technician_id` y el único de `order_number`) aceleran los filtros por estado, por cliente, por técnico y la búsqueda exacta por número.
- La búsqueda parcial (`ILIKE %texto%`) **no puede usar un índice normal**: seguirá recorriendo la tabla. Si fuera un problema con muchos datos, se resolvería con una extensión de PostgreSQL (`pg_trgm`); queda fuera de este bimestre.
- El listado sin filtros ordena por fecha: un índice por `created_at` evita ordenar toda la tabla (columna «compuestos propuestos»). Son una referencia y no se aplicaron a las migraciones del proyecto.
