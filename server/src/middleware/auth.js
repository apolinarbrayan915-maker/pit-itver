'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { unauthorized, forbidden } = require('../utils/errores');

/**
 * Verifica el JWT enviado en  Authorization: Bearer <token>
 * y deja en req.user: { id, rol, correo, nombre, tutorId, tutoradoId, sesionId }
 *
 * Además de la firma, el token debe pertenecer a una sesión abierta en la BD:
 * al cerrar sesión, o tras config.minutosInactividad sin uso, deja de servir
 * aunque alguien lo haya copiado. También se rechaza si la cuenta ya no está activa.
 */
async function verificarToken(req, res, next) {
  const header = req.get('Authorization') || '';
  const [tipo, token] = header.split(' ');
  if (tipo !== 'Bearer' || !token) {
    return next(unauthorized('Falta el token de acceso. Inicia sesión.'));
  }
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch (err) {
    const msg =
      err.name === 'TokenExpiredError'
        ? 'Tu sesión expiró. Inicia sesión nuevamente.'
        : 'Token inválido.';
    return next(unauthorized(msg));
  }
  if (!payload.jti || !/^[0-9a-f-]{36}$/i.test(payload.jti)) {
    return next(unauthorized('Tu sesión ya no es válida. Inicia sesión nuevamente.'));
  }
  try {
    const { rowCount } = await db.query(
      `UPDATE sesiones s SET ultimo_uso = now()
         FROM usuarios u
        WHERE s.id = $1 AND s.usuario_id = $2 AND u.id = s.usuario_id
          AND u.estado = 'activo' AND s.cerrada IS NULL
          AND s.ultimo_uso > now() - make_interval(mins => $3)`,
      [payload.jti, Number(payload.sub), config.minutosInactividad]
    );
    if (!rowCount) return next(unauthorized('Tu sesión se cerró o expiró por inactividad. Inicia sesión nuevamente.'));
    req.user = {
      id: Number(payload.sub),
      rol: payload.rol,
      correo: payload.correo,
      nombre: payload.nombre,
      tutorId: payload.tutorId ?? null,
      tutoradoId: payload.tutoradoId ?? null,
      sesionId: payload.jti,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Restringe la ruta a los roles indicados. */
function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return next(forbidden(`Acceso exclusivo para: ${roles.join(', ')}`));
    }
    return next();
  };
}

function firmarToken(usuario, sesionId) {
  return jwt.sign(
    {
      rol: usuario.rol,
      correo: usuario.correo_institucional,
      nombre: `${usuario.nombre} ${usuario.apellidos}`,
      tutorId: usuario.tutor_id,
      tutoradoId: usuario.tutorado_id,
    },
    config.jwtSecret,
    { subject: String(usuario.id), jwtid: sesionId, expiresIn: config.jwtExpiresIn, algorithm: 'HS256' }
  );
}

module.exports = { verificarToken, requiereRol, firmarToken };
