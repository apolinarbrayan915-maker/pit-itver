'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorized, forbidden } = require('../utils/errores');

/**
 * Verifica el JWT enviado en  Authorization: Bearer <token>
 * y deja en req.user: { id, rol, correo, nombre, tutorId, tutoradoId }
 */
function verificarToken(req, res, next) {
  const header = req.get('Authorization') || '';
  const [tipo, token] = header.split(' ');
  if (tipo !== 'Bearer' || !token) {
    return next(unauthorized('Falta el token de acceso. Inicia sesión.'));
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.user = {
      id: Number(payload.sub),
      rol: payload.rol,
      correo: payload.correo,
      nombre: payload.nombre,
      tutorId: payload.tutorId ?? null,
      tutoradoId: payload.tutoradoId ?? null,
    };
    return next();
  } catch (err) {
    const msg =
      err.name === 'TokenExpiredError'
        ? 'Tu sesión expiró. Inicia sesión nuevamente.'
        : 'Token inválido.';
    return next(unauthorized(msg));
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

function firmarToken(usuario) {
  return jwt.sign(
    {
      rol: usuario.rol,
      correo: usuario.correo_institucional,
      nombre: `${usuario.nombre} ${usuario.apellidos}`,
      tutorId: usuario.tutor_id,
      tutoradoId: usuario.tutorado_id,
    },
    config.jwtSecret,
    { subject: String(usuario.id), expiresIn: config.jwtExpiresIn, algorithm: 'HS256' }
  );
}

module.exports = { verificarToken, requiereRol, firmarToken };
