// Avisos en tiempo real en pantalla (sin recargar la página). Usa la conexión de tiempo-real.js.
//
// order:status-changed  { orderId, orderNumber, previousStatus, newStatus, newStatusLabel, at }
//   -> muestra un aviso con enlace a la orden y actualiza las insignias de estado visibles de esa orden.
// message:unread        { orderId, orderNumber, from, at }   (HU-15)
//   -> muestra un aviso y marca la orden con "Mensaje nuevo" en el menú y en el listado. La marca se
//      guarda en el navegador (localStorage, por usuario) y se quita al abrir el chat de esa orden.
(function () {
  var socket = window.reparusSocket;
  var contenedor = document.getElementById('avisos');
  if (!socket || !contenedor) return;

  // Cambia el color y el texto de las insignias de esa orden que estén en la página (listado o detalle).
  function actualizarInsignias(datos) {
    document
      .querySelectorAll('[data-orden-estado="' + datos.orderId + '"]')
      .forEach(function (insignia) {
        Array.from(insignia.classList).forEach(function (clase) {
          if (clase.indexOf('estado-') === 0) insignia.classList.remove(clase);
        });
        insignia.classList.add('estado-' + datos.newStatus);
        insignia.textContent = datos.newStatusLabel;
      });
  }

  // Crea un aviso de Bootstrap. El texto se inserta con textContent (nunca como HTML) para evitar XSS.
  // llenarCuerpo recibe el elemento del cuerpo y agrega su contenido.
  function mostrarToast(tituloTexto, llenarCuerpo) {
    var aviso = document.createElement('div');
    aviso.className = 'toast';
    aviso.setAttribute('role', 'alert');

    var cabecera = document.createElement('div');
    cabecera.className = 'toast-header';
    var titulo = document.createElement('strong');
    titulo.className = 'me-auto';
    titulo.textContent = tituloTexto;
    var cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'btn-close';
    cerrar.setAttribute('data-bs-dismiss', 'toast');
    cerrar.setAttribute('aria-label', 'Cerrar');
    cabecera.appendChild(titulo);
    cabecera.appendChild(cerrar);

    var cuerpo = document.createElement('div');
    cuerpo.className = 'toast-body';
    llenarCuerpo(cuerpo);

    aviso.appendChild(cabecera);
    aviso.appendChild(cuerpo);
    contenedor.appendChild(aviso);

    aviso.addEventListener('hidden.bs.toast', function () {
      aviso.remove();
    });
    new bootstrap.Toast(aviso, { delay: 8000 }).show();
  }

  function enlaceDeOrden(datos) {
    var enlace = document.createElement('a');
    enlace.href = '/ordenes/' + encodeURIComponent(datos.orderId);
    enlace.className = 'fw-semibold';
    enlace.textContent = datos.orderNumber;
    return enlace;
  }

  function mostrarAvisoEstado(datos) {
    mostrarToast('Cambio de estado', function (cuerpo) {
      cuerpo.appendChild(enlaceDeOrden(datos));
      cuerpo.appendChild(document.createTextNode(' ahora está en estado '));
      var estado = document.createElement('span');
      estado.className = 'badge estado estado-' + datos.newStatus;
      estado.textContent = datos.newStatusLabel;
      cuerpo.appendChild(estado);
    });
  }

  // ---- HU-15: mensajes sin leer ----
  var usuario = contenedor.dataset.usuario;
  var CLAVE = 'reparus:sin-leer:' + usuario;

  // localStorage puede no estar disponible o estar vacío: nunca debe romper la página.
  function leerSinLeer() {
    try {
      var lista = JSON.parse(localStorage.getItem(CLAVE) || '[]');
      return Array.isArray(lista) ? lista.map(Number) : [];
    } catch (error) {
      return [];
    }
  }

  function guardarSinLeer(lista) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(lista));
    } catch (error) {
      /* sin almacenamiento: la marca solo dura hasta recargar */
    }
  }

  // Muestra u oculta el contador del menú y la marca de cada orden del listado.
  function pintarSinLeer() {
    var lista = leerSinLeer();
    var contador = document.getElementById('menu-sin-leer');
    if (contador) {
      contador.textContent = String(lista.length);
      contador.classList.toggle('d-none', lista.length === 0);
    }
    document.querySelectorAll('[data-sin-leer]').forEach(function (marca) {
      marca.classList.toggle('d-none', lista.indexOf(Number(marca.dataset.sinLeer)) === -1);
    });
  }

  function marcarSinLeer(orderId) {
    var lista = leerSinLeer();
    if (lista.indexOf(orderId) === -1) lista.push(orderId);
    guardarSinLeer(lista);
    pintarSinLeer();
  }

  function marcarLeida(orderId) {
    guardarSinLeer(
      leerSinLeer().filter(function (id) {
        return id !== orderId;
      }),
    );
    pintarSinLeer();
  }

  // Orden cuyo chat está abierto en esta página (0 si no hay).
  function ordenAbierta() {
    var panel = document.getElementById('chat');
    return panel && panel.dataset.chatScope === 'order' ? Number(panel.dataset.chatOrderId) : 0;
  }

  function mostrarAvisoMensaje(datos) {
    mostrarToast('Mensaje nuevo', function (cuerpo) {
      cuerpo.appendChild(document.createTextNode(datos.from + ' escribió en '));
      cuerpo.appendChild(enlaceDeOrden(datos));
    });
  }

  socket.on('message:unread', function (datos) {
    var orderId = Number(datos && datos.orderId);
    if (!orderId || orderId === ordenAbierta()) return; // el chat de esa orden ya está a la vista
    marcarSinLeer(orderId);
    mostrarAvisoMensaje(datos);
  });

  // Al abrir el chat de una orden, su marca desaparece. Si se cambia en otra pestaña, esta se actualiza.
  if (ordenAbierta()) marcarLeida(ordenAbierta());
  else pintarSinLeer();
  window.addEventListener('storage', function (evento) {
    if (evento.key === CLAVE) pintarSinLeer();
  });

  socket.on('order:status-changed', function (datos) {
    actualizarInsignias(datos);
    mostrarAvisoEstado(datos);
  });
})();
