// Validación en el navegador. Usa los atributos HTML (required, pattern, minlength...)
// y muestra el texto de data-mensaje cuando el campo no cumple. El servidor valida lo mismo.
(function () {
  document.querySelectorAll('form.needs-validation').forEach(function (form) {
    form.noValidate = true;

    form.querySelectorAll('input, select').forEach(function (campo) {
      campo.addEventListener('input', function () {
        campo.setCustomValidity('');
        if (!campo.checkValidity() && campo.dataset.mensaje) {
          campo.setCustomValidity(campo.dataset.mensaje);
        }
        var aviso = campo.parentElement.querySelector('.invalid-feedback');
        if (aviso && campo.validationMessage) aviso.textContent = campo.validationMessage;
      });
    });

    form.addEventListener('submit', function (evento) {
      form.querySelectorAll('input, select').forEach(function (campo) {
        campo.setCustomValidity('');
        if (!campo.checkValidity() && campo.dataset.mensaje) {
          campo.setCustomValidity(campo.dataset.mensaje);
        }
        var aviso = campo.parentElement.querySelector('.invalid-feedback');
        if (aviso && campo.validationMessage) aviso.textContent = campo.validationMessage;
      });
      if (!form.checkValidity()) {
        evento.preventDefault();
        evento.stopPropagation();
      }
      form.classList.add('was-validated');
    });
  });
})();
