'use strict';

// T-02: informe de Lighthouse de la pantalla principal (listado de órdenes, que exige sesión).
//
//   1) Levanta la aplicación con datos de prueba:  docker compose up -d   y   npm run db:seed
//   2) Ejecuta:                                    npm run lighthouse
//
// El script inicia sesión como administrador de prueba, pasa la cookie de sesión a Lighthouse y guarda
// el informe en docs/rendimiento/ (HTML para verlo y JSON con los puntajes). Necesita Google Chrome
// instalado; si no lo encuentra, define CHROME_PATH con la ruta del ejecutable.
//
// Variables opcionales: APP_URL (por defecto http://localhost:3000), LH_EMAIL, LH_PASSWORD,
// LH_PRESET (mobile | desktop; por defecto mobile).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.LH_EMAIL || 'admin@reparus.test';
const PASSWORD = process.env.LH_PASSWORD || 'Reparus2026';
const PRESET = process.env.LH_PRESET === 'desktop' ? 'desktop' : 'mobile';
const OUT_DIR = path.join(__dirname, '..', 'docs', 'rendimiento');
const NAME = `lighthouse-ordenes-${PRESET}`;

// Guarda las cookies que pone el servidor para reenviarlas en las siguientes peticiones.
function updateJar(jar, response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';');
    const [name, ...rest] = pair.split('=');
    jar.set(name.trim(), rest.join('='));
  }
}
const cookieHeader = (jar) => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');

async function login() {
  const jar = new Map();
  const page = await fetch(`${BASE}/login`);
  updateJar(jar, page);
  const token = (await page.text()).match(/name="_csrf" value="([^"]+)"/)?.[1];
  if (!token)
    throw new Error('No se encontró el token CSRF en /login. ¿Está corriendo la aplicación?');

  const response = await fetch(`${BASE}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader(jar) },
    body: new URLSearchParams({ email: EMAIL, password: PASSWORD, _csrf: token }),
  });
  updateJar(jar, response);
  if (response.status !== 302 || response.headers.get('location') === '/login') {
    throw new Error(`No se pudo iniciar sesión como ${EMAIL}. ¿Corriste npm run db:seed?`);
  }
  return cookieHeader(jar);
}

async function main() {
  console.log(`Iniciando sesión en ${BASE} como ${EMAIL}…`);
  const cookie = await login();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const headersFile = path.join(OUT_DIR, '.cabeceras-temporales.json');
  fs.writeFileSync(headersFile, JSON.stringify({ Cookie: cookie }));

  console.log(`Ejecutando Lighthouse (${PRESET}) sobre ${BASE}/ordenes …`);
  const args = [
    '--yes',
    'lighthouse@12',
    `${BASE}/ordenes`,
    `--extra-headers=${headersFile}`,
    '--output=html',
    '--output=json',
    `--output-path=${path.join(OUT_DIR, NAME)}`,
    '--chrome-flags=--headless=new --no-sandbox',
    '--only-categories=performance,accessibility,best-practices,seo',
    '--quiet',
  ];
  if (PRESET === 'desktop') args.push('--preset=desktop');

  const result = spawnSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  fs.rmSync(headersFile, { force: true });
  if (result.status !== 0)
    throw new Error('Lighthouse terminó con error (revisa que Chrome esté instalado).');

  const report = JSON.parse(fs.readFileSync(path.join(OUT_DIR, `${NAME}.report.json`), 'utf8'));
  if (report.finalDisplayedUrl && new URL(report.finalDisplayedUrl).pathname === '/login') {
    throw new Error(
      'Lighthouse terminó en /login: la sesión no se aplicó, el informe no es válido.',
    );
  }
  const score = (key) => Math.round(report.categories[key].score * 100);
  const audit = (key) => report.audits[key]?.displayValue ?? '—';

  const lines = [
    `# Informe de Lighthouse: pantalla principal (${PRESET === 'desktop' ? 'escritorio' : 'móvil'})`,
    '',
    `- **Página medida:** \`/ordenes\` (listado de órdenes, con sesión de administrador)`,
    `- **Versión de Lighthouse:** ${report.lighthouseVersion}`,
    `- **Fecha:** ${report.fetchTime.slice(0, 10)}`,
    `- **Informe completo:** [${NAME}.report.html](./${NAME}.report.html)`,
    '',
    '| Categoría | Puntaje (0–100) |',
    '|---|---:|',
    `| Rendimiento | ${score('performance')} |`,
    `| Accesibilidad | ${score('accessibility')} |`,
    `| Mejores prácticas | ${score('best-practices')} |`,
    `| SEO | ${score('seo')} |`,
    '',
    '| Métrica | Valor |',
    '|---|---:|',
    `| First Contentful Paint | ${audit('first-contentful-paint')} |`,
    `| Largest Contentful Paint | ${audit('largest-contentful-paint')} |`,
    `| Total Blocking Time | ${audit('total-blocking-time')} |`,
    `| Cumulative Layout Shift | ${audit('cumulative-layout-shift')} |`,
    `| Speed Index | ${audit('speed-index')} |`,
    '',
  ];
  fs.writeFileSync(path.join(OUT_DIR, `${NAME}.md`), lines.join('\n'));
  fs.rmSync(path.join(OUT_DIR, `${NAME}.report.json`), { force: true }); // pesa mucho; el HTML y el resumen bastan
  console.log(
    `\nListo. Puntajes -> rendimiento ${score('performance')}, accesibilidad ${score('accessibility')}, mejores prácticas ${score('best-practices')}, SEO ${score('seo')}`,
  );
  console.log(`Archivos en ${path.relative(process.cwd(), OUT_DIR)}/${NAME}.*`);
}

main().catch((error) => {
  console.error('No se pudo generar el informe:', error.message);
  process.exitCode = 1;
});
