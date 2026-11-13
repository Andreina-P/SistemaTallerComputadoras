// Pruebas de humo de la base del proyecto: la aplicación arranca, responde y maneja errores,
// y las reglas fijas del sistema (estados y transiciones) están bien definidas.
const request = require('supertest');
const app = require('../src/app');
const {
  ORDER_STATUS,
  STATUS_LABELS,
  ALLOWED_TRANSITIONS,
} = require('../src/compartido/constantes');

describe('Base del proyecto', () => {
  test('la página de inicio responde y muestra el nombre del sistema', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Reparus');
  });

  test('una ruta que no existe responde 404 con la página de error', async () => {
    const res = await request(app).get('/esta-ruta-no-existe');

    expect(res.status).toBe(404);
    expect(res.text).toContain('Página no encontrada');
  });

  test('las respuestas llevan las cabeceras de seguridad de helmet', async () => {
    const res = await request(app).get('/');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('cada estado de una orden tiene su texto en español', () => {
    Object.values(ORDER_STATUS).forEach((status) => {
      expect(typeof STATUS_LABELS[status]).toBe('string');
    });
  });

  test('una orden solo avanza hacia adelante y se cancela antes de la entrega', () => {
    expect(ALLOWED_TRANSITIONS.received).toEqual(['diagnosing', 'cancelled']);
    expect(ALLOWED_TRANSITIONS.ready).toContain('delivered');
    expect(ALLOWED_TRANSITIONS.received).not.toContain('delivered');
    expect(ALLOWED_TRANSITIONS.delivered).toEqual([]);
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]);
  });
});
