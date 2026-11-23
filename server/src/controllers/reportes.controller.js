'use strict';

/**
 * Reportes del programa para la Coordinación (todos los tutores).
 * GET /api/reportes/programa?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Sin rango, cubre el semestre de clases en curso.
 */
const db = require('../db');
const config = require('../config');
const { badRequest } = require('../utils/errores');
const { CALENDARIO } = require('../utils/calendarioEscolar');

const ymd = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? String(x) : null);

function semestreDe(hoy) {
  const iniciados = CALENDARIO.periodos.filter((p) => p.inicio <= hoy);
  return iniciados[iniciados.length - 1] || CALENDARIO.periodos[0];
}

async function programa(req, res) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: config.tz }).format(new Date());
  const semestre = semestreDe(hoy);
  const desde = ymd(req.query.desde) || semestre.inicio;
  const hasta = ymd(req.query.hasta) || semestre.fin;
  if (desde > hasta) throw badRequest('La fecha inicial debe ser anterior o igual a la final.');
  const periodo = { ...semestre, inicio: desde, fin: hasta, personalizado: Boolean(req.query.desde || req.query.hasta) };
  const params = [desde, hasta, config.tz, config.periodoActual];
  const enRango = (col) => `(${col} AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date`;

  const { rows: porTutor } = await db.query(
    `WITH c AS (SELECT * FROM citas_tutorias WHERE ${enRango('fecha_hora')}),
          a AS (SELECT * FROM asignaciones_tutoria WHERE periodo_escolar = $4 AND estatus_asignacion = 'Activa')
     SELECT tu.id AS tutor_id, u.nombre || ' ' || u.apellidos AS nombre, tu.cubiculo, tu.max_tutorados,
            (SELECT count(*) FROM a WHERE a.tutor_id = tu.id)::int AS tutorados,
            (SELECT count(*) FROM a JOIN tutorados t ON t.id = a.tutorado_id
              WHERE a.tutor_id = tu.id AND t.nivel_riesgo IN ('ALTO','CRÍTICO'))::int AS en_riesgo,
            (SELECT count(DISTINCT c.tutorado_id) FROM c JOIN a ON a.tutorado_id = c.tutorado_id AND a.tutor_id = tu.id
              WHERE c.tutor_id = tu.id AND c.estatus = 'Completada')::int AS atendidos,
            (SELECT count(*) FROM c WHERE c.tutor_id = tu.id AND c.estatus = 'Completada')::int AS sesiones,
            (SELECT COALESCE(sum(c.duracion_real_min), 0) FROM c WHERE c.tutor_id = tu.id AND c.estatus = 'Completada')::int AS minutos,
            (SELECT count(*) FROM c WHERE c.tutor_id = tu.id AND c.asistio = false)::int AS inasistencias,
            (SELECT count(*) FROM c WHERE c.tutor_id = tu.id AND c.estatus = 'Completada' AND c.minuta IS NOT NULL)::int AS minutas,
            (SELECT count(*) FROM c WHERE c.tutor_id = tu.id AND c.estatus IN ('Pendiente','Confirmada') AND c.fecha_hora >= now())::int AS programadas,
            (SELECT count(*) FROM canalizaciones k WHERE k.tutor_id = tu.id AND ${enRango('k.fecha_registro')})::int AS canalizaciones,
            EXISTS (SELECT 1 FROM evaluaciones_tutor e WHERE e.tutor_id = tu.id AND e.periodo = $4) AS evaluacion_pit,
            (SELECT to_char(max(c.fecha_hora) AT TIME ZONE $3, 'YYYY-MM-DD') FROM c WHERE c.tutor_id = tu.id AND c.estatus = 'Completada') AS ultima_sesion
       FROM tutores tu
       JOIN usuarios u ON u.id = tu.usuario_id AND u.estado = 'activo'
   ORDER BY u.apellidos`,
    params
  );

  const { rows: porMes } = await db.query(
    `SELECT to_char(fecha_hora AT TIME ZONE $3, 'YYYY-MM') AS mes,
            count(*) FILTER (WHERE estatus = 'Completada')::int AS sesiones,
            COALESCE(sum(duracion_real_min) FILTER (WHERE estatus = 'Completada'), 0)::int AS minutos,
            count(*) FILTER (WHERE asistio = false)::int AS inasistencias
       FROM citas_tutorias WHERE ${enRango('fecha_hora')}
   GROUP BY 1 ORDER BY 1`,
    params.slice(0, 3)
  );

  const { rows: canal } = await db.query(
    `SELECT area_destino AS area, estatus_canalizacion AS estatus, count(*)::int AS total
       FROM canalizaciones WHERE ${enRango('fecha_registro')} GROUP BY 1, 2`,
    params.slice(0, 3)
  );

  const { rows: riesgo } = await db.query(
    `SELECT t.nivel_riesgo, count(*)::int AS total
       FROM asignaciones_tutoria a JOIN tutorados t ON t.id = a.tutorado_id
      WHERE a.periodo_escolar = $1 AND a.estatus_asignacion = 'Activa' GROUP BY 1`,
    [config.periodoActual]
  );

  const { rows: modalidad } = await db.query(
    `SELECT modalidad, count(*)::int AS total FROM citas_tutorias
      WHERE estatus = 'Completada' AND ${enRango('fecha_hora')} GROUP BY 1`,
    params.slice(0, 3)
  );

  const suma = (k) => porTutor.reduce((s, t) => s + t[k], 0);
  const totales = {
    tutores: porTutor.length,
    tutores_activos: porTutor.filter((t) => t.sesiones > 0).length,
    tutores_con_tutorados: porTutor.filter((t) => t.tutorados > 0).length,
    tutorados: suma('tutorados'),
    atendidos: suma('atendidos'),
    en_riesgo: suma('en_riesgo'),
    sesiones: suma('sesiones'),
    minutos: suma('minutos'),
    inasistencias: suma('inasistencias'),
    minutas: suma('minutas'),
    programadas: suma('programadas'),
    canalizaciones: suma('canalizaciones'),
    evaluaciones_pit: porTutor.filter((t) => t.evaluacion_pit).length,
  };
  const porArea = {};
  canal.forEach((c) => {
    porArea[c.area] = porArea[c.area] || { total: 0, cerradas: 0 };
    porArea[c.area].total += c.total;
    if (c.estatus === 'Atendido' || c.estatus === 'Cerrado') porArea[c.area].cerradas += c.total;
  });

  res.json({
    ok: true,
    periodo,
    semestre,
    periodo_escolar: config.periodoActual,
    totales,
    por_tutor: porTutor,
    por_mes: porMes,
    canalizaciones_por_area: porArea,
    canalizaciones_por_estatus: canal.reduce((o, c) => ({ ...o, [c.estatus]: (o[c.estatus] || 0) + c.total }), {}),
    riesgo: Object.fromEntries(riesgo.map((r) => [r.nivel_riesgo, r.total])),
    modalidad: Object.fromEntries(modalidad.map((m) => [m.modalidad, m.total])),
  });
}

module.exports = { programa };
