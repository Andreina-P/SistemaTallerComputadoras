// Funciones para mostrar fechas y dinero en pantalla (las vistas las reciben desde el controlador).
const TIME_ZONE = 'America/Guayaquil';

// '2026-11-13' (fecha sin hora) -> '13/11/2026'
function formatDate(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = String(isoDate).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

// Date -> '13/11/2026 14:30' en hora de Ecuador
function formatDateTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('es-EC', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatMoney(amount) {
  return `$${Number(amount ?? 0).toFixed(2)}`;
}

// Fecha de hoy como 'YYYY-MM-DD' (hora del servidor), para validar que una fecha no sea futura.
function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

module.exports = { formatDate, formatDateTime, formatMoney, todayIso };
