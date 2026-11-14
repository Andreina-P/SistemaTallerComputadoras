// Validación en el navegador. Usa los atributos HTML (required, pattern, minlength...)
// y muestra el texto de data-mensaje cuando el campo no cumple. El servidor valida lo mismo.
(function () {
  // Revisa un campo: reglas HTML, y si tiene data-coincide, que sea igual al campo indicado.
  function validar(form, campo) {
    campo.setCustomValidity('');
    var original = campo.dataset.coincide && form.elements[campo.dataset.coincide];
    var noCoincide = original && campo.value !== original.value;
    if ((!campo.checkValidity() || noCoincide) && campo.dataset.mensaje) {
      campo.setCustomValidity(campo.dataset.mensaje);
    }
    var aviso = campo.parentElement.querySelector('.invalid-feedback');
    if (aviso && campo.validationMessage) aviso.textContent = campo.validationMessage;
  }

  document.querySelectorAll('form.needs-validation').forEach(function (form) {
    form.noValidate = true;

    form.querySelectorAll('input, select').forEach(function (campo) {
      campo.addEventListener('input', function () {
        validar(form, campo);
        // Si cambia la contraseña, se vuelve a revisar el campo que la repite.
        form.querySelectorAll('[data-coincide="' + campo.name + '"]').forEach(function (otro) {
          validar(form, otro);
        });
      });
    });

    form.addEventListener('submit', function (evento) {
      form.querySelectorAll('input, select').forEach(function (campo) {
        validar(form, campo);
      });
      if (!form.checkValidity()) {
        evento.preventDefault();
        evento.stopPropagation();
      }
      form.classList.add('was-validated');
    });
  });
})();
