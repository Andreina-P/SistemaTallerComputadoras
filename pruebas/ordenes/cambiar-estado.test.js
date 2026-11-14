// HU-11: cambiar el estado de una orden. Necesita PostgreSQL con las migraciones aplicadas.
const app = require('../../src/app');
const { Order, StatusHistory } = require('../../src/configuracion/modelos');
const orderService = require('../../src/modulos/ordenes/ordenes.servicio');
const { ALLOWED_TRANSITIONS } = require('../../src/compartido/constantes');
const { todayIso } = require('../../src/compartido/utilidades/formato');
const {
  csrfFrom,
  createTestUser,
  loginAgent,
  cleanTestUsers,
  closeConnections,
} = require('../ayudas');

let admin;
let technician;
let otherTechnician;
let customer;

async function makeOrder(overrides = {}) {
  const order = await Order.create({
    orderNumber: `OR-7${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`.slice(0, 12),
    customerId: customer.customer.id,
    technicianId: technician.user.id,
    deviceType: 'laptop',
    brand: 'Dell',
    model: 'Inspiron',
    reportedIssue: 'No enciende y hace un ruido extraño.',
    receivedAt: todayIso(),
    estimatedCost: 50,
    ...overrides,
  });
  await StatusHistory.create({
    orderId: order.id,
    previousStatus: null,
    newStatus: order.status,
    comment: 'Orden creada.',
    customerVisible: true,
    userId: admin.user.id,
  });
  return order;
}

async function postStatus(agent, orderId, data) {
  const token = await csrfFrom(agent, `/ordenes/${orderId}`);
  return agent
    .post(`/ordenes/${orderId}/estado`)
    .type('form')
    .send({ ...data, _csrf: token });
}

const as = (row) => ({ id: row.user.id, role: row.user.role });

beforeAll(async () => {
  admin = await createTestUser({ role: 'admin' });
  technician = await createTestUser({ role: 'technician' });
  otherTechnician = await createTestUser({ role: 'technician' });
  customer = await createTestUser({ role: 'customer' });
});

afterAll(async () => {
  await cleanTestUsers();
  await closeConnections();
});

describe('HU-11 Cambiar estado', () => {
  test('el técnico asignado avanza la orden y queda el historial con usuario, fecha y comentario', async () => {
    const order = await makeOrder();
    const agent = await loginAgent(app, technician.user.email);

    const res = await postStatus(agent, order.id, {
      new_status: 'diagnosing',
      comment: 'Se revisa la fuente.',
      customer_visible: 'true',
    });
    expect(res.status).toBe(302);

    await order.reload();
    expect(order.status).toBe('diagnosing');

    const entries = await StatusHistory.findAll({
      where: { orderId: order.id },
      order: [['id', 'ASC']],
    });
    const last = entries[entries.length - 1];
    expect(entries).toHaveLength(2);
    expect(last.previousStatus).toBe('received');
    expect(last.newStatus).toBe('diagnosing');
    expect(last.comment).toBe('Se revisa la fuente.');
    expect(last.userId).toBe(technician.user.id);
    expect(last.customerVisible).toBe(true);
    expect(last.createdAt).toBeInstanceOf(Date);
  });

  test('recorre todo el flujo hasta Entregado', async () => {
    const order = await makeOrder();
    const techAgent = await loginAgent(app, technician.user.email);
    const adminAgent = await loginAgent(app, admin.user.email);

    await postStatus(techAgent, order.id, { new_status: 'diagnosing' });
    await postStatus(techAgent, order.id, { new_status: 'repairing' });
    await postStatus(techAgent, order.id, { new_status: 'ready', comment: 'Equipo reparado.' });
    const delivered = await postStatus(adminAgent, order.id, { new_status: 'delivered' });
    expect(delivered.status).toBe(302);

    await order.reload();
    expect(order.status).toBe('delivered');
    expect(await StatusHistory.count({ where: { orderId: order.id } })).toBe(5);
  });

  test('el servidor rechaza todas las transiciones que no son del flujo', async () => {
    const statuses = Object.keys(ALLOWED_TRANSITIONS);
    for (const from of statuses) {
      for (const to of statuses) {
        if (ALLOWED_TRANSITIONS[from].includes(to)) continue;
        const order = await makeOrder({ status: from });
        await expect(
          orderService.changeOrderStatus(as(admin), order.id, {
            newStatus: to,
            comment: 'x',
            customerVisible: true,
          }),
        ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
        await order.reload();
        expect(order.status).toBe(from);
      }
    }
  });

  test('una transición no permitida por HTTP responde 409 y no cambia nada', async () => {
    const order = await makeOrder();
    const agent = await loginAgent(app, admin.user.email);
    const res = await postStatus(agent, order.id, { new_status: 'ready', comment: 'Salto' });

    expect(res.status).toBe(409);
    expect(res.text).toContain('no está permitido');
    await order.reload();
    expect(order.status).toBe('received');
  });

  test('Recibido a En diagnóstico exige técnico asignado', async () => {
    const order = await makeOrder({ technicianId: null });
    const agent = await loginAgent(app, admin.user.email);

    const res = await postStatus(agent, order.id, { new_status: 'diagnosing' });
    expect(res.status).toBe(400);
    expect(res.text).toContain('Asigna un técnico');

    await order.update({ technicianId: technician.user.id });
    expect((await postStatus(agent, order.id, { new_status: 'diagnosing' })).status).toBe(302);
  });

  test('En diagnóstico a En reparación exige costo estimado registrado', async () => {
    const order = await makeOrder({ status: 'diagnosing', estimatedCost: 0 });
    const agent = await loginAgent(app, admin.user.email);

    const res = await postStatus(agent, order.id, { new_status: 'repairing' });
    expect(res.status).toBe(400);
    expect(res.text).toContain('costo estimado');

    await order.update({ estimatedCost: 35 });
    expect((await postStatus(agent, order.id, { new_status: 'repairing' })).status).toBe(302);
  });

  test.each([
    ['ready', 'repairing'],
    ['cancelled', 'received'],
  ])('%s exige comentario', async (target, from) => {
    const order = await makeOrder({ status: from });
    const agent = await loginAgent(app, admin.user.email);

    for (const blank of [undefined, '', '    ']) {
      const res = await postStatus(agent, order.id, { new_status: target, comment: blank });
      expect(res.status).toBe(400);
    }
    await order.reload();
    expect(order.status).toBe(from);

    const ok = await postStatus(agent, order.id, {
      new_status: target,
      comment: 'Motivo del cambio',
    });
    expect(ok.status).toBe(302);
  });

  test('el comentario puede ser interno o visible para el cliente', async () => {
    const order = await makeOrder();
    const agent = await loginAgent(app, technician.user.email);

    await postStatus(agent, order.id, {
      new_status: 'diagnosing',
      comment: 'Nota solo del taller',
    });
    const entries = await StatusHistory.findAll({
      where: { orderId: order.id },
      order: [['id', 'DESC']],
    });
    expect(entries[0].customerVisible).toBe(false);

    await postStatus(agent, order.id, {
      new_status: 'repairing',
      comment: 'Cambiamos la pantalla',
      customer_visible: 'true',
    });
    const after = await StatusHistory.findAll({
      where: { orderId: order.id },
      order: [['id', 'DESC']],
    });
    expect(after[0].customerVisible).toBe(true);
  });

  test('de Listo a Entregado solo lo hace el administrador', async () => {
    const order = await makeOrder({ status: 'ready' });
    const techAgent = await loginAgent(app, technician.user.email);

    const denied = await postStatus(techAgent, order.id, { new_status: 'delivered' });
    expect(denied.status).toBe(403);
    await order.reload();
    expect(order.status).toBe('ready');

    // el técnico ni siquiera ve la opción Entregado
    const page = await techAgent.get(`/ordenes/${order.id}`);
    expect(page.text).not.toContain('value="delivered"');

    const adminAgent = await loginAgent(app, admin.user.email);
    expect((await postStatus(adminAgent, order.id, { new_status: 'delivered' })).status).toBe(302);
  });

  test('un técnico solo cambia las órdenes que tiene asignadas', async () => {
    const order = await makeOrder({ technicianId: otherTechnician.user.id });
    const agent = await loginAgent(app, technician.user.email);

    const token = await csrfFrom(agent, '/ordenes');
    const res = await agent
      .post(`/ordenes/${order.id}/estado`)
      .type('form')
      .send({ new_status: 'diagnosing', _csrf: token });

    expect(res.status).toBe(404);
    await order.reload();
    expect(order.status).toBe('received');
  });

  test('un cliente no puede cambiar el estado de su orden (403)', async () => {
    const order = await makeOrder();
    const agent = await loginAgent(app, customer.user.email);
    const token = await csrfFrom(agent, `/ordenes/${order.id}`);
    const res = await agent
      .post(`/ordenes/${order.id}/estado`)
      .type('form')
      .send({ new_status: 'diagnosing', _csrf: token });

    expect(res.status).toBe(403);
    await order.reload();
    expect(order.status).toBe('received');
  });

  test('sin token CSRF se rechaza, y un estado inventado también', async () => {
    const order = await makeOrder();
    const agent = await loginAgent(app, admin.user.email);

    const noToken = await agent
      .post(`/ordenes/${order.id}/estado`)
      .type('form')
      .send({ new_status: 'diagnosing' });
    expect(noToken.status).toBe(403);

    const invented = await postStatus(agent, order.id, { new_status: 'volando' });
    expect(invented.status).toBe(400);
  });

  test('un comentario de más de 300 caracteres se rechaza', async () => {
    const order = await makeOrder();
    const agent = await loginAgent(app, admin.user.email);
    const res = await postStatus(agent, order.id, {
      new_status: 'diagnosing',
      comment: 'a'.repeat(301),
    });
    expect(res.status).toBe(400);
  });

  test('dos cambios simultáneos: solo uno se aplica', async () => {
    const order = await makeOrder();
    const run = () =>
      orderService.changeOrderStatus(as(admin), order.id, {
        newStatus: 'diagnosing',
        customerVisible: true,
      });
    const results = await Promise.allSettled([run(), run()]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.code).toBe('INVALID_TRANSITION');
    expect(await StatusHistory.count({ where: { orderId: order.id } })).toBe(2);
  });

  test('si falla el historial el estado de la orden no cambia (transacción)', async () => {
    const order = await makeOrder();
    const spy = jest
      .spyOn(StatusHistory, 'create')
      .mockRejectedValueOnce(new Error('falla simulada'));

    await expect(
      orderService.changeOrderStatus(as(admin), order.id, {
        newStatus: 'diagnosing',
        customerVisible: true,
      }),
    ).rejects.toThrow('falla simulada');
    spy.mockRestore();

    await order.reload();
    expect(order.status).toBe('received');
  });

  test('el formulario solo ofrece los estados siguientes que corresponden', async () => {
    const order = await makeOrder({ status: 'repairing' });
    const agent = await loginAgent(app, admin.user.email);
    const page = await agent.get(`/ordenes/${order.id}`);

    expect(page.text).toContain('value="ready"');
    expect(page.text).toContain('value="cancelled"');
    expect(page.text).not.toContain('value="diagnosing"');

    const customerPage = await (
      await loginAgent(app, customer.user.email)
    ).get(`/ordenes/${order.id}`);
    expect(customerPage.text).not.toContain('Cambiar estado');
  });

  test('una orden entregada o cancelada ya no muestra el formulario', async () => {
    const order = await makeOrder({ status: 'delivered' });
    const agent = await loginAgent(app, admin.user.email);
    const page = await agent.get(`/ordenes/${order.id}`);
    expect(page.text).not.toContain('Cambiar estado');
  });
});
