'use strict';

const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const { firmarToken } = require('../middleware/auth');
const { badRequest, unauthorized, forbidden, notFound } = require('../utils/errores');
const { esCorreoInstitucional } = require('../utils/validaciones');

// Hash ficticio para igualar el tiempo de respuesta cuando el correo no existe
const HASH_DUMMY = '$2a$10$eGW2.xyBXx3bD02P6YRwwe9L1jirDGTw7PXk2bjimp0EbWTe/cstK';

// El selector del portal envía 'coordinacion'; en BD el rol es 'coordinador'
const ALIAS_ROL = { coordinacion: 'coordinador', tutorado: 'alumno', maestro: 'tutor' };

/**
 * POST /api/auth/login
 * Body: { correo, password, rol? }
 */
async function login(req, res) {
  const correo = String(req.body.correo || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const rolSolicitado = req.body.rol ? ALIAS_ROL[req.body.rol] || req.body.rol : null;

  if (!esCorreoInstitucional(correo)) {
    throw badRequest(`Acceso denegado: se requiere un correo institucional @${config.dominio}`);
  }
  if (password.length < 8) {
    throw badRequest('La contraseña debe tener al menos 8 caracteres.');
  }

  const { rows } = await db.query(
    `SELECT u.id, u.no_control_o_rfc, u.nombre, u.apellidos, u.correo_institucional,
            u.password_hash, u.rol, u.estado,
            tu.id AS tutor_id, t.id AS tutorado_id
       FROM usuarios u
  LEFT JOIN tutores   tu ON tu.usuario_id = u.id
  LEFT JOIN tutorados t  ON t.usuario_id  = u.id
      WHERE lower(u.correo_institucional) = $1`,
    [correo]
  );
  const usuario = rows[0];

  const passwordOk = await bcrypt.compare(password, usuario ? usuario.password_hash : HASH_DUMMY);
  if (!usuario || !passwordOk) {
    throw unauthorized('Correo o contraseña incorrectos.');
  }
  if (usuario.estado !== 'activo') {
    throw forbidden('Tu cuenta está inactiva o bloqueada. Contacta a la Coordinación de Tutorías.');
  }
  if (rolSolicitado && rolSolicitado !== usuario.rol) {
    throw forbidden('Esta cuenta no corresponde al perfil seleccionado en el portal.');
  }

  await db.query('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [usuario.id]);

  res.json({
    ok: true,
    token: firmarToken(usuario),
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      apellidos: usuario.apellidos,
      correo: usuario.correo_institucional,
      no_control_o_rfc: usuario.no_control_o_rfc,
      rol: usuario.rol,
      tutorId: usuario.tutor_id,
      tutoradoId: usuario.tutorado_id,
    },
  });
}

/**
 * GET /api/auth/me
 * Perfil del usuario autenticado (incluye datos académicos o docentes).
 */
async function perfil(req, res) {
  const { rows } = await db.query(
    `SELECT u.id, u.no_control_o_rfc, u.nombre, u.apellidos, u.correo_institucional, u.rol,
            u.ultimo_acceso
       FROM usuarios u WHERE u.id = $1`,
    [req.user.id]
  );
  if (!rows[0]) throw notFound('Usuario no encontrado');
  const usuario = rows[0];

  if (usuario.rol === 'alumno') {
    const { rows: det } = await db.query(
      `SELECT t.id AS tutorado_id, t.carrera, t.semestre, t.periodo_ingreso, t.estatus_academico,
              t.nivel_riesgo, t.materias_reprobadas, t.avance_reticular_pct, t.promedio, t.telefono,
              a.grupo, a.periodo_escolar,
              tu.id AS tutor_id, tu.cubiculo AS tutor_cubiculo,
              ut.nombre || ' ' || ut.apellidos AS tutor_nombre,
              ut.correo_institucional AS tutor_correo,
              (SELECT count(*) FROM citas_tutorias c
                WHERE c.tutorado_id = t.id AND c.estatus = 'Completada')::int AS sesiones_completadas,
              (SELECT count(*) FROM reportes_pit r
                WHERE r.tutorado_id = t.id AND r.periodo = $2)::int AS formatos_entregados
         FROM tutorados t
    LEFT JOIN asignaciones_tutoria a ON a.tutorado_id = t.id
                                    AND a.periodo_escolar = $2
                                    AND a.estatus_asignacion = 'Activa'
    LEFT JOIN tutores  tu ON tu.id = a.tutor_id
    LEFT JOIN usuarios ut ON ut.id = tu.usuario_id
        WHERE t.usuario_id = $1`,
      [usuario.id, config.periodoActual]
    );
    usuario.tutorado = det[0] || null;
  } else if (usuario.rol === 'tutor') {
    const { rows: det } = await db.query(
      `SELECT tu.id AS tutor_id, tu.departamento, tu.cubiculo, tu.max_tutorados, tu.formacion_tutorial,
              array_remove(array_agg(DISTINCT a.grupo), NULL) AS grupos,
              count(a.id)::int AS total_tutorados
         FROM tutores tu
    LEFT JOIN asignaciones_tutoria a ON a.tutor_id = tu.id
                                    AND a.periodo_escolar = $2
                                    AND a.estatus_asignacion = 'Activa'
        WHERE tu.usuario_id = $1
     GROUP BY tu.id`,
      [usuario.id, config.periodoActual]
    );
    usuario.tutor = det[0] || null;
  }

  res.json({ ok: true, periodo: config.periodoActual, usuario });
}

module.exports = { login, perfil };
