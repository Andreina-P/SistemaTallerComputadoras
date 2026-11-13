'use strict';

// Datos FICTICIOS para desarrollo y demostración. No uses datos reales de nadie.
// Todos los usuarios tienen la misma clave de prueba: Reparus2026
// Ejecutar:  npm run db:seed      Reiniciar todo:  npm run db:reset

const bcrypt = require('bcryptjs');

const PASSWORD = 'Reparus2026';

// Fecha y hora de Ecuador (UTC-5) a partir de un día y una hora
const at = (day, hour) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00-05:00`);

module.exports = {
  async up(queryInterface, Sequelize) {
    const { QueryTypes } = Sequelize;
    const passwordHash = bcrypt.hashSync(PASSWORD, 10);

    const idsBy = async (table, column) => {
      const rows = await queryInterface.sequelize.query(
        `SELECT id, ${column} AS key FROM ${table}`,
        {
          type: QueryTypes.SELECT,
        },
      );
      return Object.fromEntries(rows.map((row) => [row.key, row.id]));
    };

    // Usuarios: 1 administrador, 2 técnicos y 3 clientes
    const users = [
      ['Admin Reparus', 'admin@reparus.test', 'admin'],
      ['Carlos Mendoza', 'carlos@reparus.test', 'technician'],
      ['Sofía Andrade', 'sofia@reparus.test', 'technician'],
      ['Lucía Torres', 'lucia@reparus.test', 'customer'],
      ['Marco Villacís', 'marco@reparus.test', 'customer'],
      ['Elena Paredes', 'elena@reparus.test', 'customer'],
    ];
    await queryInterface.bulkInsert(
      'users',
      users.map(([name, email, role]) => ({
        name,
        email,
        password_hash: passwordHash,
        role,
        active: true,
        created_at: at('2026-11-01', 9),
      })),
    );
    const userId = await idsBy('users', 'email');

    // Perfiles de los clientes
    await queryInterface.bulkInsert('customers', [
      {
        user_id: userId['lucia@reparus.test'],
        national_id: '1700000011',
        phone: '0990000011',
        address: 'Av. Ficticia 123 y Calle Uno',
      },
      {
        user_id: userId['marco@reparus.test'],
        national_id: '1700000022',
        phone: '0990000022',
        address: 'Calle Dos N45-67',
      },
      {
        user_id: userId['elena@reparus.test'],
        national_id: '1700000033',
        phone: '0990000033',
        address: null,
      },
    ]);
    const customerId = await idsBy('customers', 'national_id');

    const admin = userId['admin@reparus.test'];
    const carlos = userId['carlos@reparus.test'];
    const sofia = userId['sofia@reparus.test'];
    const lucia = customerId['1700000011'];
    const marco = customerId['1700000022'];
    const elena = customerId['1700000033'];

    // Órdenes en distintos estados
    const orders = [
      [
        'OR-2026-0001',
        lucia,
        null,
        'laptop',
        'HP',
        'Pavilion 15-eg',
        'HP15EG0001',
        'La laptop no enciende después de una caída de voltaje.',
        '2026-11-09',
        'received',
        0,
      ],
      [
        'OR-2026-0002',
        marco,
        carlos,
        'desktop',
        'Dell',
        'OptiPlex 3080',
        'DL3080002',
        'El computador se reinicia solo y hace un ruido fuerte al encender.',
        '2026-11-05',
        'diagnosing',
        0,
      ],
      [
        'OR-2026-0003',
        elena,
        carlos,
        'laptop',
        'Lenovo',
        'IdeaPad 3',
        'LN0IP3003',
        'Pantalla rota y teclado con varias teclas que no responden.',
        '2026-11-03',
        'repairing',
        85,
      ],
      [
        'OR-2026-0004',
        lucia,
        sofia,
        'all_in_one',
        'HP',
        '24-df',
        'HP24DF004',
        'No carga el sistema operativo y se queda en pantalla negra.',
        '2026-11-02',
        'ready',
        60,
      ],
      [
        'OR-2026-0005',
        marco,
        sofia,
        'laptop',
        'Asus',
        'VivoBook 14',
        'AS14VB005',
        'La batería dura menos de 20 minutos.',
        '2026-10-27',
        'delivered',
        45,
      ],
      [
        'OR-2026-0006',
        elena,
        carlos,
        'other',
        'Intel',
        'NUC Mini PC',
        null,
        'El equipo se apaga cuando se conecta el monitor.',
        '2026-10-30',
        'cancelled',
        0,
      ],
    ];
    await queryInterface.bulkInsert(
      'orders',
      orders.map(
        ([
          order_number,
          customer_id,
          technician_id,
          device_type,
          brand,
          model,
          serial_number,
          reported_issue,
          received_at,
          status,
          estimated_cost,
        ]) => ({
          order_number,
          customer_id,
          technician_id,
          device_type,
          brand,
          model,
          serial_number,
          reported_issue,
          received_at,
          status,
          estimated_cost,
          created_at: at(received_at, 10),
          updated_at: at(received_at, 10),
        }),
      ),
    );
    const orderId = await idsBy('orders', 'order_number');

    // Historial de cada orden: [orden, estado anterior, estado nuevo, comentario, visible, usuario, día, hora]
    const history = [
      [
        'OR-2026-0001',
        null,
        'received',
        'Equipo recibido en el taller',
        true,
        admin,
        '2026-11-09',
        10,
      ],

      [
        'OR-2026-0002',
        null,
        'received',
        'Equipo recibido en el taller',
        true,
        admin,
        '2026-11-05',
        10,
      ],
      [
        'OR-2026-0002',
        'received',
        'diagnosing',
        'Se inicia la revisión de la fuente y los ventiladores',
        true,
        carlos,
        '2026-11-06',
        9,
      ],

      [
        'OR-2026-0003',
        null,
        'received',
        'Equipo recibido en el taller',
        true,
        admin,
        '2026-11-03',
        10,
      ],
      [
        'OR-2026-0003',
        'received',
        'diagnosing',
        'Se confirma daño en la pantalla y en el teclado',
        true,
        carlos,
        '2026-11-04',
        9,
      ],
      [
        'OR-2026-0003',
        'diagnosing',
        'repairing',
        'Costo del repuesto negociado con el proveedor (nota interna)',
        false,
        carlos,
        '2026-11-05',
        15,
      ],

      [
        'OR-2026-0004',
        null,
        'received',
        'Equipo recibido en el taller',
        true,
        admin,
        '2026-11-02',
        10,
      ],
      [
        'OR-2026-0004',
        'received',
        'diagnosing',
        'Se revisa el disco y el sistema operativo',
        true,
        sofia,
        '2026-11-03',
        9,
      ],
      [
        'OR-2026-0004',
        'diagnosing',
        'repairing',
        'Se reinstala el sistema operativo',
        true,
        sofia,
        '2026-11-04',
        11,
      ],
      [
        'OR-2026-0004',
        'repairing',
        'ready',
        'Equipo reparado y listo para retirar',
        true,
        sofia,
        '2026-11-06',
        16,
      ],

      [
        'OR-2026-0005',
        null,
        'received',
        'Equipo recibido en el taller',
        true,
        admin,
        '2026-10-27',
        10,
      ],
      [
        'OR-2026-0005',
        'received',
        'diagnosing',
        'Se mide el desgaste de la batería',
        true,
        sofia,
        '2026-10-28',
        9,
      ],
      [
        'OR-2026-0005',
        'diagnosing',
        'repairing',
        'Se cambia la batería',
        true,
        sofia,
        '2026-10-29',
        11,
      ],
      [
        'OR-2026-0005',
        'repairing',
        'ready',
        'Batería cambiada y equipo probado',
        true,
        sofia,
        '2026-10-30',
        15,
      ],
      ['OR-2026-0005', 'ready', 'delivered', 'Entregado al cliente', true, admin, '2026-10-31', 12],

      [
        'OR-2026-0006',
        null,
        'received',
        'Equipo recibido en el taller',
        true,
        admin,
        '2026-10-30',
        10,
      ],
      [
        'OR-2026-0006',
        'received',
        'diagnosing',
        'Se revisa el equipo',
        true,
        carlos,
        '2026-10-31',
        9,
      ],
      [
        'OR-2026-0006',
        'diagnosing',
        'cancelled',
        'El cliente decidió no continuar con la reparación',
        true,
        admin,
        '2026-11-02',
        10,
      ],
    ];
    await queryInterface.bulkInsert(
      'status_history',
      history.map(
        ([order, previous_status, new_status, comment, customer_visible, user_id, day, hour]) => ({
          order_id: orderId[order],
          previous_status,
          new_status,
          comment,
          customer_visible,
          user_id,
          created_at: at(day, hour),
        }),
      ),
    );

    // Mensajes: sala general (order_id nulo) y chat de la orden OR-2026-0003
    const elenaUser = userId['elena@reparus.test'];
    const messages = [
      [
        null,
        admin,
        'Buenos días equipo, recuerden actualizar el estado de sus órdenes al terminar cada revisión.',
        '2026-11-09',
        8,
      ],
      [null, carlos, 'Listo, ya actualicé la orden OR-2026-0002.', '2026-11-09', 9],
      [
        'OR-2026-0003',
        elenaUser,
        'Buenas tardes, ¿cuándo estará lista mi laptop?',
        '2026-11-06',
        14,
      ],
      [
        'OR-2026-0003',
        carlos,
        'Estamos esperando el repuesto de la pantalla. Te avisamos apenas esté listo.',
        '2026-11-06',
        15,
      ],
    ];
    await queryInterface.bulkInsert(
      'messages',
      messages.map(([order, user_id, text, day, hour]) => ({
        order_id: order ? orderId[order] : null,
        user_id,
        text,
        created_at: at(day, hour),
      })),
    );
  },

  async down(queryInterface) {
    // Borra todos los datos de las tablas, en orden inverso a las dependencias
    await queryInterface.bulkDelete('messages', null, {});
    await queryInterface.bulkDelete('status_history', null, {});
    await queryInterface.bulkDelete('orders', null, {});
    await queryInterface.bulkDelete('customers', null, {});
    await queryInterface.bulkDelete('recovery_tokens', null, {});
    await queryInterface.bulkDelete('users', null, {});
  },
};
