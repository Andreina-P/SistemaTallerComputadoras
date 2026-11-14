// Muestra el nombre del cliente al escribir su cédula en "Nueva orden" (HU-07).
(function () {
  var campo = document.getElementById('national_id');
  var resultado = document.getElementById('resultado-cliente');
  if (!campo || !resultado) return;

  function buscar() {
    var cedula = campo.value.trim();
    if (!/^\d{10}$/.test(cedula)) {
      resultado.textContent = '';
      return;
    }
    fetch('/ordenes/clientes/buscar?cedula=' + encodeURIComponent(cedula), {
      credentials: 'same-origin',
    })
      .then(function (respuesta) {
        return respuesta.json();
      })
      .then(function (datos) {
        resultado.className = 'mb-0 small ' + (datos.found ? 'text-success' : 'text-danger');
        resultado.textContent = datos.found
          ? 'Cliente: ' + datos.name
          : 'No hay un cliente registrado con esa cédula.';
      })
      .catch(function () {
        resultado.textContent = '';
      });
  }

  campo.addEventListener('input', buscar);
  buscar();
})();
