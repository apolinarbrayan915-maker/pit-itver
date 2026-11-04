'use strict';

const db = require('../db');
const config = require('../config');

const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 10000) / 100 : 0);

/**
 * GET /api/dashboard/stats?periodo=2026-2
 * - Coordinador: indicadores globales de ISC.
 * - Tutor: los mismos indicadores, limitados a sus tutorados.
 */
async function stats(req, res) {
  const periodo = /^\d{4}-[12]$/.test(req.query.periodo || '') ? req.query.periodo : config.periodoActual;
  const tutorId = req.user.rol === 'tutor' ? req.user.tutorId : null;

  const { rows } = await db.query(
    `WITH base AS (
        SELECT t.id, t.nivel_riesgo
          FROM tutorados t
          JOIN usuarios u ON u.id = t.usuario_id AND u.estado = 'activo'
          JOIN asignaciones_tutoria a ON a.tutorado_id = t.id
                                     AND a.periodo_escolar = $1
                                     AND a.estatus_asignacion = 'Activa'
         WHERE ($2::int IS NULL OR a.tutor_id = $2)
     ),
     semana AS (
        SELECT date_trunc('week', now() AT TIME ZONE $3) AT TIME ZONE $3 AS ini
     ),
     citas AS (
        SELECT c.estatus
          FROM citas_tutorias c, semana s
         WHERE c.fecha_hora >= s.ini
           AND c.fecha_hora <  s.ini + INTERVAL '7 days'
           AND c.estatus <> 'Cancelada'
           AND ($2::int IS NULL OR c.tutor_id = $2)
     ),
     canal AS (
        SELECT c.area_destino, c.estatus_canalizacion
          FROM canalizaciones c
         WHERE ($2::int IS NULL OR c.tutor_id = $2)
     )
     SELECT
        (SELECT count(*) FROM base)::int                                               AS total_tutorados,
        (SELECT count(*) FROM base WHERE nivel_riesgo IN ('ALTO','CRÍTICO'))::int      AS en_riesgo,
        (SELECT count(*) FROM base WHERE nivel_riesgo = 'CRÍTICO')::int                AS en_riesgo_critico,
        (SELECT COALESCE(json_object_agg(n.nivel, COALESCE(x.total, 0)), '{}')
           FROM unnest(enum_range(NULL::nivel_riesgo)) AS n(nivel)
      LEFT JOIN (SELECT nivel_riesgo, count(*)::int AS total FROM base GROUP BY 1) x
             ON x.nivel_riesgo = n.nivel)                                              AS por_nivel,
        (SELECT count(*) FROM citas)::int                                              AS citas_semana,
        (SELECT count(*) FROM citas WHERE estatus = 'Pendiente')::int                  AS citas_semana_pendientes,
        (SELECT count(*) FROM canal
          WHERE estatus_canalizacion IN ('Pendiente','En Proceso','Aceptado'))::int    AS canalizaciones_activas,
        (SELECT COALESCE(json_object_agg(ar.area, json_build_object(
                    'activas', COALESCE(x.activas, 0), 'total', COALESCE(x.total, 0))), '{}')
           FROM unnest(enum_range(NULL::area_canalizacion)) AS ar(area)
      LEFT JOIN (SELECT area_destino,
                        count(*) FILTER (WHERE estatus_canalizacion IN ('Pendiente','En Proceso','Aceptado'))::int AS activas,
                        count(*)::int AS total
                   FROM canal GROUP BY 1) x
             ON x.area_destino = ar.area)                                              AS canalizaciones_por_area,
        (SELECT count(DISTINCT a.tutor_id) FROM asignaciones_tutoria a
          WHERE a.periodo_escolar = $1 AND a.estatus_asignacion = 'Activa')::int        AS tutores_con_grupo,
        (SELECT count(*) FROM tutores tu JOIN usuarios u ON u.id = tu.usuario_id
          WHERE u.estado = 'activo')::int                                              AS tutores_totales`,
    [periodo, tutorId, config.tz]
  );

  const r = rows[0];
  res.json({
    ok: true,
    periodo,
    alcance: tutorId ? 'tutor' : 'global',
    total_tutorados: r.total_tutorados,
    en_riesgo: r.en_riesgo,
    pct_en_riesgo: pct(r.en_riesgo, r.total_tutorados),
    en_riesgo_critico: r.en_riesgo_critico,
    pct_riesgo_critico: pct(r.en_riesgo_critico, r.total_tutorados),
    por_nivel: r.por_nivel,
    citas_semana: r.citas_semana,
    citas_semana_pendientes: r.citas_semana_pendientes,
    canalizaciones_activas: r.canalizaciones_activas,
    canalizaciones_por_area: r.canalizaciones_por_area,
    tutores_con_grupo: r.tutores_con_grupo,
    tutores_totales: r.tutores_totales,
  });
}

module.exports = { stats };
