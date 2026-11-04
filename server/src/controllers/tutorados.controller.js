'use strict';

const db = require('../db');
const config = require('../config');
const { catalogo, NIVELES_RIESGO } = require('../utils/validaciones');

const ALIAS_NIVEL = { CRITICO: 'CRÍTICO' };

/**
 * GET /api/tutorados/riesgo?nivel=ALTO,CRITICO&q=garcia&periodo=2026-2
 * - nivel: uno o varios niveles separados por coma (acepta "CRITICO" sin acento).
 *          Vacío o "TODOS" = todos los niveles.
 * - q:     búsqueda por nombre o número de control.
 * Coordinador ve todos los tutorados; el tutor solo los asignados a él.
 */
async function listarPorRiesgo(req, res) {
  const periodo = /^\d{4}-[12]$/.test(req.query.periodo || '') ? req.query.periodo : config.periodoActual;
  const tutorId = req.user.rol === 'tutor' ? req.user.tutorId : null;

  const crudo = String(req.query.nivel || '').trim();
  const niveles =
    !crudo || crudo.toUpperCase() === 'TODOS'
      ? null
      : crudo.split(',').map((n) => catalogo(n, 'nivel', NIVELES_RIESGO, ALIAS_NIVEL));

  // Se escapan los comodines de LIKE para que la búsqueda sea literal
  const q = String(req.query.q || '').trim().slice(0, 60).replace(/[\\%_]/g, '\\$&');

  const { rows } = await db.query(
    `SELECT t.id AS tutorado_id,
            u.no_control_o_rfc AS no_control,
            u.apellidos || ' ' || u.nombre AS nombre_completo,
            u.correo_institucional AS correo,
            t.carrera, t.semestre, t.estatus_academico,
            t.materias_reprobadas, t.avance_reticular_pct, t.promedio, t.nivel_riesgo,
            a.grupo, a.tutor_id,
            ut.nombre || ' ' || ut.apellidos AS tutor_nombre,
            COALESCE((SELECT array_agg(c.area_destino::text ORDER BY c.fecha_registro)
                        FROM canalizaciones c
                       WHERE c.tutorado_id = t.id
                         AND c.estatus_canalizacion IN ('Pendiente','En Proceso','Aceptado')),
                     '{}') AS canalizaciones_activas,
            (SELECT min(c.fecha_hora) FROM citas_tutorias c
              WHERE c.tutorado_id = t.id
                AND c.estatus IN ('Pendiente','Confirmada')
                AND c.fecha_hora >= now()) AS proxima_cita
       FROM tutorados t
       JOIN usuarios u ON u.id = t.usuario_id AND u.estado = 'activo'
  LEFT JOIN asignaciones_tutoria a ON a.tutorado_id = t.id
                                  AND a.periodo_escolar = $1
                                  AND a.estatus_asignacion = 'Activa'
  LEFT JOIN tutores  tu ON tu.id = a.tutor_id
  LEFT JOIN usuarios ut ON ut.id = tu.usuario_id
      WHERE ($2::int IS NULL OR a.tutor_id = $2)
        AND ($3::nivel_riesgo[] IS NULL OR t.nivel_riesgo = ANY ($3::nivel_riesgo[]))
        AND ($4 = '' OR u.no_control_o_rfc ILIKE $4 || '%'
                     OR (u.nombre || ' ' || u.apellidos) ILIKE '%' || $4 || '%'
                     OR (u.apellidos || ' ' || u.nombre) ILIKE '%' || $4 || '%')
   ORDER BY t.nivel_riesgo DESC, t.materias_reprobadas DESC, u.apellidos`,
    [periodo, tutorId, niveles, q]
  );

  const resumen = NIVELES_RIESGO.reduce((acc, n) => ({ ...acc, [n]: 0 }), {});
  rows.forEach((r) => {
    resumen[r.nivel_riesgo] += 1;
  });

  res.json({ ok: true, periodo, total: rows.length, resumen, tutorados: rows });
}

module.exports = { listarPorRiesgo };
