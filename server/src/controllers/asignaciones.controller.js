'use strict';

/**
 * Supervisión de la relación tutor–tutorado (solo Coordinación).
 * Los tutorados ELIGEN a su tutor (ver tutores.controller.js → elegir);
 * la coordinación consulta el panorama, ajusta cupos y puede retirar a un
 * tutorado de un tutor en casos excepcionales.
 */
const db = require('../db');
const config = require('../config');
const { notFound } = require('../utils/errores');
const v = require('../utils/validaciones');

const periodoDe = (req) =>
  /^\d{4}-[12]$/.test(req.query.periodo || '') ? req.query.periodo : config.periodoActual;

/**
 * GET /api/asignaciones?periodo=2026-2
 * Tutores con sus grupos y cupo + todos los tutorados con su asignación actual.
 */
async function panorama(req, res) {
  const periodo = periodoDe(req);

  const { rows: tutores } = await db.query(
    `SELECT tu.id AS tutor_id,
            u.nombre || ' ' || u.apellidos AS nombre,
            u.no_control_o_rfc AS rfc,
            u.correo_institucional AS correo,
            tu.cubiculo, tu.formacion_tutorial, tu.max_tutorados, tu.acepta_tutorados,
            (SELECT count(*) FROM tutor_horarios h WHERE h.tutor_id = tu.id)::int AS bloques_horario,
            COALESCE((SELECT json_agg(g ORDER BY g.grupo)
                        FROM (SELECT a.grupo, count(*)::int AS total
                                FROM asignaciones_tutoria a
                               WHERE a.tutor_id = tu.id AND a.periodo_escolar = $1
                                 AND a.estatus_asignacion = 'Activa'
                            GROUP BY a.grupo) g), '[]') AS grupos,
            (SELECT count(*) FROM asignaciones_tutoria a
              WHERE a.tutor_id = tu.id AND a.periodo_escolar = $1
                AND a.estatus_asignacion = 'Activa')::int AS total_tutorados
       FROM tutores tu
       JOIN usuarios u ON u.id = tu.usuario_id AND u.estado = 'activo'
   ORDER BY u.apellidos`,
    [periodo]
  );

  const { rows: tutorados } = await db.query(
    `SELECT t.id AS tutorado_id,
            u.no_control_o_rfc AS no_control,
            u.apellidos || ' ' || u.nombre AS nombre_completo,
            t.semestre, t.nivel_riesgo,
            a.id AS asignacion_id, a.grupo, a.tutor_id, a.origen, a.fecha_asignacion,
            ut.nombre || ' ' || ut.apellidos AS tutor_nombre
       FROM tutorados t
       JOIN usuarios u ON u.id = t.usuario_id AND u.estado = 'activo'
  LEFT JOIN asignaciones_tutoria a ON a.tutorado_id = t.id AND a.periodo_escolar = $1
                                  AND a.estatus_asignacion = 'Activa'
  LEFT JOIN tutores tu ON tu.id = a.tutor_id
  LEFT JOIN usuarios ut ON ut.id = tu.usuario_id
   ORDER BY (a.id IS NOT NULL), t.semestre, u.apellidos`,
    [periodo]
  );

  res.json({
    ok: true,
    periodo,
    tutores,
    tutorados,
    sin_tutor: tutorados.filter((t) => !t.asignacion_id).length,
    grupos_existentes: [...new Set(tutorados.map((t) => t.grupo).filter(Boolean))].sort(),
  });
}

/**
 * PATCH /api/asignaciones/:id/finalizar
 * Retira a un tutorado de su grupo (queda sin tutor en el periodo).
 */
async function quitar(req, res) {
  const id = v.idPositivo(req.params.id, 'id');
  const { rows } = await db.query(
    `UPDATE asignaciones_tutoria SET estatus_asignacion = 'Finalizada'
      WHERE id = $1 AND estatus_asignacion = 'Activa'
  RETURNING id`,
    [id]
  );
  if (!rows[0]) throw notFound('Asignación no encontrada o ya finalizada.');
  res.json({ ok: true, mensaje: 'Tutorado retirado del grupo. Queda pendiente de asignar.' });
}

module.exports = { panorama, quitar };
