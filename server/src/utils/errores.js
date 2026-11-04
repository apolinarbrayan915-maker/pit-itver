'use strict';

/** Error controlado que se responde al cliente con su código HTTP. */
class HttpError extends Error {
  constructor(status, mensaje, detalles) {
    super(mensaje);
    this.status = status;
    this.detalles = detalles;
  }
}

const badRequest = (msg, det) => new HttpError(400, msg, det);
const unauthorized = (msg = 'No autenticado') => new HttpError(401, msg);
const forbidden = (msg = 'No tienes permiso para esta acción') => new HttpError(403, msg);
const notFound = (msg = 'Recurso no encontrado') => new HttpError(404, msg);
const conflict = (msg) => new HttpError(409, msg);

/** Traduce errores de PostgreSQL a respuestas HTTP comprensibles. */
function traducirErrorPg(err) {
  switch (err.code) {
    case '23505': // unique_violation
      if (err.constraint === 'ux_citas_tutor_horario_vigente') {
        return conflict('El tutor ya tiene una cita en ese horario. Elige otro.');
      }
      if (err.constraint === 'ux_canal_abierta_por_area') {
        return conflict('El tutorado ya tiene una canalización abierta en esa área.');
      }
      return conflict('El registro ya existe.');
    case '23503': // foreign_key_violation
      return badRequest('Referencia inválida a otro registro.');
    case '23514': // check_violation (incluye RAISE de los triggers)
      return badRequest(err.message);
    case '22P02': // invalid_text_representation (enum/entero inválido)
    case '22007': // invalid_datetime_format
    case '22008': // datetime_field_overflow
      return badRequest('Formato de dato inválido.');
    default:
      return null;
  }
}

/** Middleware final de Express. */
// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  const traducido = err instanceof HttpError ? err : traducirErrorPg(err);
  if (traducido) {
    return res.status(traducido.status).json({
      ok: false,
      error: traducido.message,
      ...(traducido.detalles ? { detalles: traducido.detalles } : {}),
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'JSON mal formado' });
  }
  console.error('[error]', err);
  return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
}

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  manejadorErrores,
};
