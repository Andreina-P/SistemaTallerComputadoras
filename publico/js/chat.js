// Chat en tiempo real del navegador (panel-chat.ejs). Sirve para el chat de una orden y la sala general.
// Usa la conexión window.reparusSocket creada en tiempo-real.js. Los textos se insertan con textContent
// (nunca como HTML), así que un mensaje con etiquetas se ve como texto y no se ejecuta.
document.addEventListener('DOMContentLoaded', function () {
  var panel = document.getElementById('chat');
  var socket = window.reparusSocket;
  if (!panel || !socket) return;

  var scope = panel.dataset.chatScope;
  var orderId = Number(panel.dataset.chatOrderId);
  var myId = Number(panel.dataset.userId);
  var lista = document.getElementById('chat-lista');
  var estado = document.getElementById('chat-estado');
  var conectados = document.getElementById('chat-conectados');
  var formulario = document.getElementById('chat-formulario');
  var texto = document.getElementById('chat-texto');

  var ROLES = { admin: 'Administrador', technician: 'Técnico', customer: 'Cliente' };
  var ERRORES = {
    FORBIDDEN: 'No tienes acceso a este chat.',
    READ_ONLY: 'La orden está cerrada: el chat es de solo lectura.',
    EMPTY: 'Escribe un mensaje.',
    TOO_LONG: 'El mensaje no puede superar los 500 caracteres.',
    NOT_JOINED: 'Aún no estás conectado a este chat. Recarga la página.',
  };

  function mensajeDeError(codigo) {
    return ERRORES[codigo] || 'No se pudo completar la acción. Intenta de nuevo.';
  }

  // ¿El evento recibido es de este chat?
  function esDeEsteChat(datos) {
    if (!datos || datos.scope !== scope) return false;
    return scope === 'general' || Number(datos.orderId) === orderId;
  }

  function agregar(mensaje) {
    var item = document.createElement('li');
    item.className = 'chat-mensaje' + (mensaje.user.id === myId ? ' chat-propio' : '');

    var cabecera = document.createElement('div');
    cabecera.className = 'chat-cabecera';
    var autor = document.createElement('strong');
    autor.textContent = mensaje.user.name;
    var detalle = document.createElement('small');
    var rol = ROLES[mensaje.user.role] ? ROLES[mensaje.user.role] + ' · ' : '';
    detalle.textContent =
      ' ' +
      rol +
      new Date(mensaje.createdAt).toLocaleString('es-EC', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Guayaquil',
      });
    cabecera.appendChild(autor);
    cabecera.appendChild(detalle);

    var cuerpo = document.createElement('div');
    cuerpo.textContent = mensaje.text;

    item.appendChild(cabecera);
    item.appendChild(cuerpo);
    lista.appendChild(item);
    lista.scrollTop = lista.scrollHeight;
  }

  function mostrarConectados(usuarios) {
    conectados.textContent =
      'Conectados (' +
      usuarios.length +
      '): ' +
      usuarios
        .map(function (u) {
          return u.name;
        })
        .join(', ');
  }

  function soloLectura(activo) {
    texto.disabled = activo;
    formulario.querySelector('button').disabled = activo;
    if (activo) estado.textContent = mensajeDeError('READ_ONLY');
  }

  // Une al chat y carga el historial. Se repite en cada reconexión.
  function unirse() {
    var evento = scope === 'general' ? 'general:join' : 'order:join';
    var datos = scope === 'general' ? {} : { orderId: orderId };

    socket.emit(evento, datos, function (respuesta) {
      if (!respuesta || !respuesta.ok) {
        estado.textContent = mensajeDeError(respuesta && respuesta.error);
        formulario.hidden = true;
        return;
      }
      lista.textContent = '';
      respuesta.history.forEach(agregar);
      mostrarConectados(respuesta.users);
      estado.textContent = '';
      formulario.hidden = false;
      soloLectura(Boolean(respuesta.readOnly));
    });
  }

  socket.on('message:new', function (mensaje) {
    if (esDeEsteChat(mensaje)) agregar(mensaje);
  });
  socket.on('presence:update', function (datos) {
    if (esDeEsteChat(datos)) mostrarConectados(datos.users);
  });
  socket.on('connect', unirse);
  socket.on('disconnect', function () {
    estado.textContent = 'Conexión perdida. Reconectando...';
  });
  if (socket.connected) unirse();

  formulario.addEventListener('submit', function (evento) {
    evento.preventDefault();
    var mensaje = texto.value.trim();
    if (!mensaje) return;

    var datos = { scope: scope, text: mensaje };
    if (scope === 'order') datos.orderId = orderId;

    socket.emit('message:new', datos, function (respuesta) {
      if (respuesta && respuesta.ok) {
        texto.value = '';
        estado.textContent = '';
      } else {
        estado.textContent = mensajeDeError(respuesta && respuesta.error);
      }
    });
  });
});
