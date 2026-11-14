// HU-08 y HU-09: listado con filtros, paginación, acceso por rol y detalle. Necesita PostgreSQL.
const request = require('supertest');
const app = require('../../src/app');
const { Order, StatusHistory } = require('../../src/configuracion/modelos');
const orderService = require('../../src/modulos/ordenes/ordenes.servicio');
const { todayIso } = require('../../src/compartido/utilidades/formato');
const { createTestUser, loginAgent, cleanTestUsers, closeConnections } = require('../ayudas');

let admin;
let technician;
let otherTechnician;
let ana; // cliente con 12 órdenes
let beto; // cliente con 1 orden
let anaOrders = [];
let betoOrder;

async function makeOrder(customerRow, overrides = {}) {
  const number = `OR-9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`.slice(0, 12);
  const order = await Order.create({
    orderNumber: number,
    customerId: customerRow.id,
    deviceType: 'laptop',
    brand: 'Dell',
    model: 'Inspiron',
    reportedIssue: 'No enciende y hace un ruido extraño.',
    receivedAt: todayIso(),
    estimatedCost: 10,
    ...overrides,
  });
  await StatusHistory.create({
    orderId: order.id,
    previousStatus: null,
    newStatus: 'received',
    comment: 'Orden creada.',
    customerVisible: true,
    userId: admin.user.id,
  });
  return order;
}

beforeAll(async () => {
  admin = await createTestUser({ role: 'admin' });
  technician = await createTestUser({ role: 'technician' });
  otherTechnician = await createTestUser({ role: 'technician' });
  ana = await createTestUser({ role: 'customer' });
  beto = await createTestUser({ role: 'customer' });
  await ana.user.update({ name: 'Ana Zambrano Prueba' });

  for (let i = 0; i < 12; i += 1) {
    anaOrders.push(
      await makeOrder(ana.customer, {
        status: i < 3 ? 'ready' : 'received',
        technicianId: i < 5 ? technician.user.id : null,
      }),
    );
  }
  betoOrder = await makeOrder(beto.customer, { technicianId: otherTechnician.user.id });
});

afterAll(async () => {
  await cleanTestUsers();
  await closeConnections();
});

describe('HU-08 Listado de órdenes', () => {
  test('el cliente ve solo las suyas, con 10 por página y navegación', async () => {
    const agent = await loginAgent(app, ana.user.email);
    const first = await agent.get('/ordenes');
    expect(first.status).toBe(200);
    expect(first.text).toContain('Mis órdenes');
    expect((first.text.match(/href="\/ordenes\/\d+"/g) || []).length).toBe(10);
    expect(first.text).toContain('pagina=2');
    expect(first.text).not.toContain(betoOrder.orderNumber);

    const second = await agent.get('/ordenes?pagina=2');
    expect((second.text.match(/href="\/ordenes\/\d+"/g) || []).length).toBe(2);
  });

  test('el técnico ve solo las asignadas a él', async () => {
    const result = await orderService.listOrders(
      { id: technician.user.id, role: 'technician' },
      {},
    );
    expect(result.total).toBe(5);
    result.orders.forEach((order) => expect(order.technicianId).toBe(technician.user.id));
  });

  test('el administrador ve todas, incluidas las de otros clientes', async () => {
    const result = await orderService.listOrders(
      { id: admin.user.id, role: 'admin' },
      { q: 'OR-9' },
    );
    const ids = result.orders.map((order) => order.id);
    expect(result.total).toBeGreaterThanOrEqual(13);
    expect(result.pageSize).toBe(10);
    expect(ids.length).toBeLessThanOrEqual(10);
  });

  test('filtra por estado', async () => {
    const agent = await loginAgent(app, ana.user.email);
    const res = await agent.get('/ordenes?estado=ready');
    expect((res.text.match(/href="\/ordenes\/\d+"/g) || []).length).toBe(3);
    expect(res.text).not.toContain('pagina=2');
  });

  test('un estado inventado se ignora y no rompe la consulta', async () => {
    const agent = await loginAgent(app, ana.user.email);
    const res = await agent.get("/ordenes?estado=x'; DROP TABLE orders;--");
    expect(res.status).toBe(200);
  });

  test('busca por número de orden', async () => {
    const admin_ = { id: admin.user.id, role: 'admin' };
    const result = await orderService.listOrders(admin_, { q: betoOrder.orderNumber });
    expect(result.orders.map((o) => o.id)).toEqual([betoOrder.id]);
  });

  test('busca por nombre y por cédula del cliente', async () => {
    const admin_ = { id: admin.user.id, role: 'admin' };

    const byName = await orderService.listOrders(admin_, { q: 'zambrano' });
    expect(byName.total).toBe(12);
    expect(byName.orders[0].customerName).toBe('Ana Zambrano Prueba');

    const byNationalId = await orderService.listOrders(admin_, { q: beto.customer.nationalId });
    expect(byNationalId.orders.map((o) => o.id)).toEqual([betoOrder.id]);
  });

  test('la búsqueda trata % y _ como texto, no como comodines', async () => {
    const result = await orderService.listOrders({ id: admin.user.id, role: 'admin' }, { q: '%' });
    expect(result.total).toBe(0);
  });

  test('una página fuera de rango se ajusta a la última', async () => {
    const result = await orderService.listOrders(
      { id: ana.user.id, role: 'customer' },
      { page: '99' },
    );
    expect(result.page).toBe(2);
  });

  test('sin sesión redirige al inicio de sesión', async () => {
    const res = await request(app).get('/ordenes');
    expect(res.headers.location).toBe('/login');
  });
});

describe('HU-09 Detalle de orden', () => {
  test('muestra los datos y el historial de la orden al administrador', async () => {
    const agent = await loginAgent(app, admin.user.email);
    const res = await agent.get(`/ordenes/${betoOrder.id}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(betoOrder.orderNumber);
    expect(res.text).toContain('Historial de estados');
    expect(res.text).toContain('Orden creada.');
    expect(res.text).toContain(beto.customer.nationalId);
  });

  test('el cliente ve su orden pero no ve cédula ni teléfono del cliente', async () => {
    const agent = await loginAgent(app, beto.user.email);
    const res = await agent.get(`/ordenes/${betoOrder.id}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Cédula');
  });

  test('el cliente solo ve los comentarios marcados como visibles', async () => {
    await StatusHistory.create({
      orderId: betoOrder.id,
      previousStatus: 'received',
      newStatus: 'diagnosing',
      comment: 'NOTA-INTERNA-SECRETA',
      customerVisible: false,
      userId: admin.user.id,
    });
    await StatusHistory.create({
      orderId: betoOrder.id,
      previousStatus: 'diagnosing',
      newStatus: 'repairing',
      comment: 'COMENTARIO-PUBLICO',
      customerVisible: true,
      userId: admin.user.id,
    });

    const customerPage = await (
      await loginAgent(app, beto.user.email)
    ).get(`/ordenes/${betoOrder.id}`);
    expect(customerPage.text).toContain('COMENTARIO-PUBLICO');
    expect(customerPage.text).not.toContain('NOTA-INTERNA-SECRETA');

    const adminPage = await (
      await loginAgent(app, admin.user.email)
    ).get(`/ordenes/${betoOrder.id}`);
    expect(adminPage.text).toContain('NOTA-INTERNA-SECRETA');
    expect(adminPage.text).toContain('Nota interna');
  });

  test('una orden ajena responde 404 al cliente (igual que una que no existe)', async () => {
    const agent = await loginAgent(app, ana.user.email);
    expect((await agent.get(`/ordenes/${betoOrder.id}`)).status).toBe(404);
    expect((await agent.get('/ordenes/99999999')).status).toBe(404);
    expect((await agent.get('/ordenes/abc')).status).toBe(404);
  });

  test('el técnico solo ve las órdenes asignadas a él', async () => {
    const agent = await loginAgent(app, technician.user.email);
    expect((await agent.get(`/ordenes/${anaOrders[0].id}`)).status).toBe(200); // asignada
    expect((await agent.get(`/ordenes/${anaOrders[11].id}`)).status).toBe(404); // sin asignar
    expect((await agent.get(`/ordenes/${betoOrder.id}`)).status).toBe(404); // de otro técnico
  });
});

describe('canUserAccessOrder (la usará el chat)', () => {
  test('aplica la misma regla de acceso por rol', async () => {
    const as = (row, role) => ({ id: row.user.id, role });

    expect(await orderService.canUserAccessOrder(as(admin, 'admin'), betoOrder.id)).toBe(true);
    expect(await orderService.canUserAccessOrder(as(beto, 'customer'), betoOrder.id)).toBe(true);
    expect(await orderService.canUserAccessOrder(as(ana, 'customer'), betoOrder.id)).toBe(false);
    expect(
      await orderService.canUserAccessOrder(as(otherTechnician, 'technician'), betoOrder.id),
    ).toBe(true);
    expect(await orderService.canUserAccessOrder(as(technician, 'technician'), betoOrder.id)).toBe(
      false,
    );
  });

  test('devuelve false con datos inválidos', async () => {
    expect(await orderService.canUserAccessOrder(null, 1)).toBe(false);
    expect(await orderService.canUserAccessOrder({ id: 1, role: 'admin' }, 'abc')).toBe(false);
    expect(await orderService.canUserAccessOrder({ id: 1, role: 'admin' }, 99999999)).toBe(false);
  });
});
