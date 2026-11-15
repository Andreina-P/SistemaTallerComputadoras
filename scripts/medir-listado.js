'use strict';

// T-02: mide el tiempo de las consultas del listado de órdenes SIN índices y CON índices.
//
//   npm run medir:listado              (100 000 órdenes de prueba)
//   npm run medir:listado -- 300000    (otra cantidad)
//
// Cómo funciona: crea un esquema temporal (medicion_listado) con una copia de la tabla orders y
// datos ficticios. NO toca las tablas reales ni sus datos, y el esquema se borra al terminar.
// Cada consulta se ejecuta con EXPLAIN ANALYZE y se toma la mediana de varias repeticiones.
// El resultado se guarda en docs/rendimiento/listado-indices.md.
const fs = require('fs');
const path = require('path');
const sequelize = require('../src/configuracion/baseDeDatos');

const SCHEMA = 'medicion_listado';
const ROWS = Number.parseInt(process.argv[2], 10) || 100000;
const WARMUP = 2;
const RUNS = 9;
const PAGE = 10;
const OUTPUT = path.join(__dirname, '..', 'docs', 'rendimiento', 'listado-indices.md');

const COLUMNS =
  'id, order_number, customer_id, technician_id, device_type, brand, model, status, estimated_cost, created_at';

// Mismas consultas que genera el listado (HU-08): filtro, orden por fecha y paginación de 10.
const QUERIES = [
  {
    name: 'Administrador: filtrar por estado (Listo)',
    page: `SELECT ${COLUMNS} FROM ${SCHEMA}.orders WHERE status = 'ready' ORDER BY created_at DESC, id DESC LIMIT ${PAGE} OFFSET 0`,
    count: `SELECT count(*) FROM ${SCHEMA}.orders WHERE status = 'ready'`,
  },
  {
    name: 'Cliente: sus propias órdenes',
    page: `SELECT ${COLUMNS} FROM ${SCHEMA}.orders WHERE customer_id = 777 ORDER BY created_at DESC, id DESC LIMIT ${PAGE} OFFSET 0`,
    count: `SELECT count(*) FROM ${SCHEMA}.orders WHERE customer_id = 777`,
  },
  {
    name: 'Técnico: órdenes asignadas a él',
    page: `SELECT ${COLUMNS} FROM ${SCHEMA}.orders WHERE technician_id = 3 ORDER BY created_at DESC, id DESC LIMIT ${PAGE} OFFSET 0`,
    count: `SELECT count(*) FROM ${SCHEMA}.orders WHERE technician_id = 3`,
  },
  {
    name: 'Administrador: listado sin filtros',
    page: `SELECT ${COLUMNS} FROM ${SCHEMA}.orders ORDER BY created_at DESC, id DESC LIMIT ${PAGE} OFFSET 0`,
    count: `SELECT count(*) FROM ${SCHEMA}.orders`,
  },
  {
    name: 'Búsqueda exacta por número de orden',
    page: `SELECT ${COLUMNS} FROM ${SCHEMA}.orders WHERE order_number = 'OR-${String(Math.floor(ROWS / 2)).padStart(9, '0')}' LIMIT ${PAGE}`,
    count: null,
  },
  {
    name: 'Búsqueda parcial por número de orden (ILIKE %…%)',
    page: `SELECT ${COLUMNS} FROM ${SCHEMA}.orders WHERE order_number ILIKE '%${String(Math.floor(ROWS / 2)).slice(0, 4)}%' ORDER BY created_at DESC, id DESC LIMIT ${PAGE} OFFSET 0`,
    count: null,
  },
];

// Conjuntos de índices a comparar
const VARIANTS = [
  {
    key: 'sin',
    title: 'Sin índices (solo la clave primaria)',
    indexes: [],
  },
  {
    key: 'actuales',
    title: 'Con los índices actuales de la migración',
    indexes: [
      `CREATE UNIQUE INDEX orders_order_number_key ON ${SCHEMA}.orders (order_number)`,
      `CREATE INDEX orders_status_idx ON ${SCHEMA}.orders (status)`,
      `CREATE INDEX orders_customer_id_idx ON ${SCHEMA}.orders (customer_id)`,
      `CREATE INDEX orders_technician_id_idx ON ${SCHEMA}.orders (technician_id)`,
    ],
  },
  {
    key: 'compuestos',
    title: 'Con índices compuestos propuestos (referencia, no aplicados al proyecto)',
    indexes: [
      `CREATE UNIQUE INDEX orders_order_number_key ON ${SCHEMA}.orders (order_number)`,
      `CREATE INDEX orders_status_created_idx ON ${SCHEMA}.orders (status, created_at DESC, id DESC)`,
      `CREATE INDEX orders_customer_created_idx ON ${SCHEMA}.orders (customer_id, created_at DESC, id DESC)`,
      `CREATE INDEX orders_technician_created_idx ON ${SCHEMA}.orders (technician_id, created_at DESC, id DESC)`,
      `CREATE INDEX orders_created_idx ON ${SCHEMA}.orders (created_at DESC, id DESC)`,
    ],
  },
];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

async function explain(sql) {
  const [rows] = await sequelize.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`);
  const plan = rows[0]['QUERY PLAN'][0];
  return { ms: plan['Execution Time'] + plan['Planning Time'], plan: plan.Plan };
}

// Nombre corto del tipo de recorrido principal (Seq Scan, Index Scan…)
function scanKind(node) {
  const kinds = new Set();
  const walk = (current) => {
    if (/Scan$/.test(current['Node Type'])) kinds.add(current['Node Type']);
    (current.Plans || []).forEach(walk);
  };
  walk(node);
  return [...kinds].join(' + ') || node['Node Type'];
}

async function measure(sql) {
  for (let i = 0; i < WARMUP; i += 1) await explain(sql);
  const times = [];
  let last;
  for (let i = 0; i < RUNS; i += 1) {
    last = await explain(sql);
    times.push(last.ms);
  }
  return { ms: median(times), scan: scanKind(last.plan) };
}

async function prepareData() {
  await sequelize.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await sequelize.query(`CREATE SCHEMA ${SCHEMA}`);
  // Copia solo las columnas y valores por defecto; sin claves foráneas ni índices.
  await sequelize.query(
    `CREATE TABLE ${SCHEMA}.orders (LIKE public.orders INCLUDING DEFAULTS, PRIMARY KEY (id))`,
  );
  await sequelize.query(
    `INSERT INTO ${SCHEMA}.orders
       (id, order_number, customer_id, technician_id, device_type, brand, model, serial_number,
        reported_issue, received_at, status, estimated_cost, created_at, updated_at)
     SELECT g,
            'OR-' || lpad(g::text, 9, '0'),
            1 + (g * 7919) % 2000,
            CASE WHEN g % 10 = 0 THEN NULL ELSE 1 + (g * 31) % 8 END,
            (ARRAY['laptop','desktop','all_in_one','other'])[1 + g % 4]::enum_orders_device_type,
            'Marca ' || (g % 30), 'Modelo ' || (g % 90), NULL,
            'Equipo con falla de prueba', CURRENT_DATE - (g % 700),
            (CASE WHEN g % 100 < 60 THEN 'delivered'
                  WHEN g % 100 < 70 THEN 'cancelled'
                  WHEN g % 100 < 78 THEN 'received'
                  WHEN g % 100 < 86 THEN 'diagnosing'
                  WHEN g % 100 < 94 THEN 'repairing'
                  ELSE 'ready' END)::enum_orders_status,
            (g % 400)::numeric,
            now() - (g * interval '7 minutes'), now()
       FROM generate_series(1, ${ROWS}) AS g`,
  );
}

const fmt = (ms) => (ms < 1 ? ms.toFixed(3) : ms.toFixed(2));

async function main() {
  console.log(`Creando ${ROWS} órdenes de prueba en el esquema temporal ${SCHEMA}…`);
  await prepareData();

  const [{ version }] = (await sequelize.query('SELECT version()', { type: 'SELECT' })) || [{}];
  const results = {};

  for (const variant of VARIANTS) {
    console.log(`\n== ${variant.title}`);
    await sequelize.query(`DROP INDEX IF EXISTS ${SCHEMA}.orders_order_number_key`);
    for (const name of [
      'orders_status_idx',
      'orders_customer_id_idx',
      'orders_technician_id_idx',
      'orders_status_created_idx',
      'orders_customer_created_idx',
      'orders_technician_created_idx',
      'orders_created_idx',
    ]) {
      await sequelize.query(`DROP INDEX IF EXISTS ${SCHEMA}.${name}`);
    }
    for (const statement of variant.indexes) await sequelize.query(statement);
    await sequelize.query(`ANALYZE ${SCHEMA}.orders`);

    results[variant.key] = [];
    for (const query of QUERIES) {
      const page = await measure(query.page);
      const count = query.count ? await measure(query.count) : null;
      results[variant.key].push({ page, count });
      console.log(
        `  ${query.name}: página ${fmt(page.ms)} ms (${page.scan})` +
        (count ? ` · conteo ${fmt(count.ms)} ms (${count.scan})` : ''),
      );
    }
  }

  await sequelize.query(`DROP SCHEMA ${SCHEMA} CASCADE`);

  // ---- Informe en Markdown ----
  const lines = [];
  lines.push('# Medición del listado de órdenes: con y sin índices (T-02)', '');
  lines.push(
    `- **Datos:** ${ROWS.toLocaleString('es-EC')} órdenes ficticias en un esquema temporal (no se tocan las tablas reales).`,
    `- **Método:** \`EXPLAIN ANALYZE\` de las consultas que genera el listado (filtro + orden por fecha + página de ${PAGE}); se toma la **mediana de ${RUNS} ejecuciones** tras ${WARMUP} de calentamiento. Tiempo = planificación + ejecución.`,
    `- **Servidor:** ${String(version || 'PostgreSQL').split(',')[0]}`,
    `- **Fecha de la medición:** ${new Date().toISOString().slice(0, 10)}`,
    '- **Cómo repetirla:** `npm run medir:listado` (genera de nuevo este archivo con los tiempos de tu equipo).',
    '',
    'Reparto de los datos: 60 % entregadas, 10 % canceladas, 8 % recibidas, 8 % en diagnóstico, 8 % en reparación y 6 % listas; 2 000 clientes y 8 técnicos (10 % sin asignar).',
    '',
  );

  lines.push('## Resultados (milisegundos, menos es mejor)', '');
  lines.push(
    '| Consulta | Sin índices (página) | Índices actuales (página) | Compuestos propuestos (página) | Sin índices (conteo) | Índices actuales (conteo) |',
    '|---|---:|---:|---:|---:|---:|',
  );
  QUERIES.forEach((query, i) => {
    const s = results.sin[i];
    const a = results.actuales[i];
    const c = results.compuestos[i];
    lines.push(
      `| ${query.name} | ${fmt(s.page.ms)} | ${fmt(a.page.ms)} | ${fmt(c.page.ms)} | ${s.count ? fmt(s.count.ms) : '—'} | ${a.count ? fmt(a.count.ms) : '—'} |`,
    );
  });
  lines.push('');

  lines.push('## Tipo de recorrido que eligió PostgreSQL (consulta de la página)', '');
  lines.push(
    '| Consulta | Sin índices | Índices actuales | Compuestos propuestos |',
    '|---|---|---|---|',
  );
  QUERIES.forEach((query, i) => {
    lines.push(
      `| ${query.name} | ${results.sin[i].page.scan} | ${results.actuales[i].page.scan} | ${results.compuestos[i].page.scan} |`,
    );
  });
  lines.push('');

  lines.push(
    '## Cómo leerlo',
    '',
    '- **Seq Scan** es leer toda la tabla; **Index Scan / Bitmap Scan** es usar un índice. Con más órdenes, la diferencia crece.',
    '- Los índices actuales (`status`, `customer_id`, `technician_id` y el único de `order_number`) aceleran los filtros por estado, por cliente, por técnico y la búsqueda exacta por número.',
    '- La búsqueda parcial (`ILIKE %texto%`) **no puede usar un índice normal**: seguirá recorriendo la tabla. Si fuera un problema con muchos datos, se resolvería con una extensión de PostgreSQL (`pg_trgm`); queda fuera de este bimestre.',
    '- El listado sin filtros ordena por fecha: un índice por `created_at` evita ordenar toda la tabla (columna «compuestos propuestos»). Son una referencia y no se aplicaron a las migraciones del proyecto.',
    '',
  );

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, lines.join('\n'));
  console.log(`\nInforme guardado en ${path.relative(process.cwd(), OUTPUT)}`);
}

main()
  .catch(async (error) => {
    console.error('No se pudo completar la medición:', error.message);
    await sequelize.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => { });
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
