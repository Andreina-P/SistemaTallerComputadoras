// Envío de correos. En desarrollo se usa Mailpit (bandeja en http://localhost:8025).
// Si el servidor de correo no responde, el mensaje se muestra en la consola para no bloquear el flujo.
const nodemailer = require('nodemailer');
const { mail } = require('../../configuracion/entorno');

const transporter = nodemailer.createTransport({
  host: mail.host,
  port: mail.port,
  secure: false,
  ignoreTLS: true,
});

async function sendMail({ to, subject, text }) {
  try {
    await transporter.sendMail({ from: mail.from, to, subject, text });
  } catch (error) {
    console.warn(`No se pudo enviar el correo (${error.message}). Contenido:`);
    console.warn(`Para: ${to}\nAsunto: ${subject}\n${text}`);
  }
}

module.exports = { sendMail };
