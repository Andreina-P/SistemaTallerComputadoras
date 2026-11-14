// Avisos en tiempo real en pantalla (sin recargar la página). Usa la conexión de tiempo-real.js.
//
// order:status-changed  { orderId, orderNumber, previousStatus, newStatus, newStatusLabel, at }
//   -> muestra un aviso con enlace a la orden y actualiza las insignias de estado visibles de esa orden.
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

  // El texto se inserta con textContent (nunca como HTML) para evitar XSS.
  function mostrarAviso(datos) {
    var aviso = document.createElement('div');
    aviso.className = 'toast';
    aviso.setAttribute('role', 'alert');

    var cabecera = document.createElement('div');
    cabecera.className = 'toast-header';
    var titulo = document.createElement('strong');
    titulo.className = 'me-auto';
    titulo.textContent = 'Cambio de estado';
    var cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'btn-close';
    cerrar.setAttribute('data-bs-dismiss', 'toast');
    cerrar.setAttribute('aria-label', 'Cerrar');
    cabecera.appendChild(titulo);
    cabecera.appendChild(cerrar);

    var cuerpo = document.createElement('div');
    cuerpo.className = 'toast-body';
    var enlace = document.createElement('a');
    enlace.href = '/ordenes/' + encodeURIComponent(datos.orderId);
    enlace.className = 'fw-semibold';
    enlace.textContent = datos.orderNumber;
    cuerpo.appendChild(enlace);
    cuerpo.appendChild(document.createTextNode(' ahora está en estado '));
    var estado = document.createElement('span');
    estado.className = 'badge estado estado-' + datos.newStatus;
    estado.textContent = datos.newStatusLabel;
    cuerpo.appendChild(estado);

    aviso.appendChild(cabecera);
    aviso.appendChild(cuerpo);
    contenedor.appendChild(aviso);

    aviso.addEventListener('hidden.bs.toast', function () {
      aviso.remove();
    });
    new bootstrap.Toast(aviso, { delay: 8000 }).show();
  }

  socket.on('order:status-changed', function (datos) {
    actualizarInsignias(datos);
    mostrarAviso(datos);
  });
})();
