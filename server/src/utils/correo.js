'use strict';

/**
 * Envío de correos (notificaciones al tutor).
 *
 * Variables de entorno (en Vercel → Settings → Environment Variables):
 *   SMTP_USER       cuenta que envía (p. ej. una cuenta de Gmail)
 *   SMTP_PASS       contraseña de aplicación de esa cuenta (no la contraseña normal)
 *   SMTP_HOST       opcional, por defecto smtp.gmail.com
 *   SMTP_PORT       opcional, por defecto 465 (SSL)
 *   CORREO_PRUEBAS  opcional: si se define, TODOS los correos se mandan a esta dirección
 *                   (para pruebas y demostraciones) y el correo indica a quién iba dirigido.
 *   APP_URL         opcional: dirección pública de la plataforma para el botón del correo.
 *
 * Si no hay SMTP configurado, no se envía nada y la cita se registra igual.
 */

const nodemailer = require('nodemailer');

const env = process.env;
let transporte = null;

function configurado() {
  return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

function obtenerTransporte() {
  if (!transporte) {
    const puerto = Number(env.SMTP_PORT) || 465;
    transporte = nodemailer.createTransport({
      host: env.SMTP_HOST || 'smtp.gmail.com',
      port: puerto,
      secure: puerto === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
  }
  return transporte;
}

/**
 * Envía un correo. Nunca lanza error: devuelve { enviado, destinatario, error? }.
 * @param {{ para: string, asunto: string, html: string, texto: string }} msg
 */
async function enviarCorreo({ para, asunto, html, texto }) {
  if (!configurado()) return { enviado: false, motivo: 'sin_configurar' };
  const destino = env.CORREO_PRUEBAS || para;
  if (!destino) return { enviado: false, motivo: 'sin_destinatario' };
  try {
    await obtenerTransporte().sendMail({
      from: { name: 'Tutorías ITVER (PIT)', address: env.SMTP_USER },
      to: destino,
      subject: asunto,
      html,
      text: texto,
    });
    return { enviado: true, destinatario: destino, prueba: Boolean(env.CORREO_PRUEBAS) };
  } catch (err) {
    console.error('[correo] No se pudo enviar:', err.message);
    return { enviado: false, motivo: 'error' };
  }
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-11-25T10:00" + 60 → { fecha: "Miércoles 25 de noviembre de 2026", hora: "10:00 a 11:00 h" } */
function fechaLegible(local, duracionMin = 60) {
  const [f, h] = String(local).split('T');
  const [y, m, d] = f.split('-').map(Number);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  const [hh, mm] = h.split(':').map(Number);
  const fin = hh * 60 + mm + duracionMin;
  const hora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  return {
    fecha: `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${d} de ${MESES[m - 1]} de ${y}`,
    hora: `${hora(hh * 60 + mm)} a ${hora(fin)} h`,
  };
}

/**
 * Correo para el tutor: "Tienes una nueva cita de tutoría".
 * @param {object} c  cita con datos del tutor y del tutorado
 * @param {string} urlApp  dirección pública de la plataforma
 */
function correoNuevaCita(c, urlApp) {
  const { fecha, hora } = fechaLegible(c.fecha_hora_local, c.duracion_min);
  const lugar = c.modalidad === 'Línea' ? 'En línea (envía el enlace al tutorado)' : `Presencial${c.tutor_cubiculo ? ` · ${c.tutor_cubiculo}` : ''}`;
  const agenda = `${urlApp.replace(/\/$/, '')}/tutor.html`;
  const prueba = env.CORREO_PRUEBAS
    ? `<tr><td style="padding:10px 32px;background:#fff7e0;color:#7a5600;font-size:12px;border-bottom:1px solid #f1e2b3;">
         <strong>Modo de prueba:</strong> este correo iba dirigido a ${esc(c.tutor_correo)}.</td></tr>`
    : '';
  const fila = (etq, val) => `<tr>
      <td style="padding:9px 0;color:#6b7280;font-size:13px;width:120px;vertical-align:top;">${etq}</td>
      <td style="padding:9px 0;color:#111827;font-size:14px;font-weight:600;vertical-align:top;">${val}</td></tr>`;

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nueva cita de tutoría</title></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${esc(c.tutorado_nombre_corto)} agendó una tutoría el ${esc(fecha)}, ${esc(hora)}.</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dde3ec;">
        <tr><td style="background:#1b396a;padding:22px 32px;">
          <p style="margin:0;color:#c9d6ea;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">TecNM · Instituto Tecnológico de Veracruz</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:16px;font-weight:bold;">Programa Institucional de Tutorías</p>
        </td></tr>
        ${prueba}
        <tr><td style="padding:30px 32px 8px;">
          <p style="margin:0 0 6px;display:inline-block;background:#e3ecfa;color:#1b396a;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:999px;">NUEVA CITA</p>
          <h1 style="margin:10px 0 8px;color:#111827;font-size:22px;line-height:1.3;">Tienes una cita de tutoría</h1>
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">Hola, ${esc(c.tutor_nombre)}.<br>
            <strong>${esc(c.tutorado_nombre_corto)}</strong> agendó una sesión de tutoría contigo. Estos son los datos:</p>
        </td></tr>
        <tr><td style="padding:16px 32px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border:1px solid #e3e8f0;border-radius:12px;">
            <tr><td style="padding:18px 20px 6px;">
              <p style="margin:0;color:#1b396a;font-size:18px;font-weight:bold;">${esc(fecha)}</p>
              <p style="margin:2px 0 0;color:#374151;font-size:15px;">${esc(hora)}</p>
            </td></tr>
            <tr><td style="padding:6px 20px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e3e8f0;">
                ${fila('Tutorado', `${esc(c.tutorado_nombre_corto)}<br><span style="font-weight:400;color:#6b7280;font-size:13px;">No. de control ${esc(c.no_control)} · ${esc(c.carrera || '')}${c.semestre ? `, ${esc(c.semestre)}° semestre` : ''}</span>`)}
                ${fila('Modalidad', esc(lugar))}
                ${fila('Tipo', esc(c.tipo))}
                ${fila('Motivo', `<span style="font-weight:400;">${esc(c.motivo)}</span>`)}
                ${c.tutorado_correo ? fila('Contacto', `<a href="mailto:${esc(c.tutorado_correo)}" style="color:#1b396a;">${esc(c.tutorado_correo)}</a>`) : ''}
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:22px 32px 8px;" align="left">
          <a href="${esc(agenda)}" style="display:inline-block;background:#1b396a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 22px;border-radius:999px;">Ver en mi agenda</a>
        </td></tr>
        <tr><td style="padding:8px 32px 28px;">
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">La cita queda <strong>pendiente</strong> hasta que la confirmes en la plataforma. Si no puedes atenderla, cancélala desde tu agenda para que el tutorado elija otro horario.</p>
        </td></tr>
        <tr><td style="background:#611232;padding:16px 32px;">
          <p style="margin:0;color:#f3dbe3;font-size:11px;line-height:1.6;">Correo automático de la Plataforma de Tutorías del ITVER. No respondas a este mensaje.<br>Calz. Miguel Ángel de Quevedo 2779, Formando Hogar, Veracruz, Ver.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const texto = [
    'Tienes una nueva cita de tutoría',
    '',
    `Hola, ${c.tutor_nombre}.`,
    `${c.tutorado_nombre_corto} (No. de control ${c.no_control}) agendó una sesión contigo.`,
    '',
    `Fecha: ${fecha}`,
    `Hora: ${hora}`,
    `Modalidad: ${lugar}`,
    `Tipo: ${c.tipo}`,
    `Motivo: ${c.motivo}`,
    c.tutorado_correo ? `Contacto: ${c.tutorado_correo}` : '',
    '',
    `Ver en mi agenda: ${agenda}`,
    env.CORREO_PRUEBAS ? `\n(Modo de prueba: este correo iba dirigido a ${c.tutor_correo}.)` : '',
  ].filter((l) => l !== null).join('\n');

  return { asunto: `Nueva cita de tutoría: ${fecha}, ${hora}`, html, texto };
}

module.exports = { enviarCorreo, correoNuevaCita, configurado, fechaLegible };
