'use strict';

/**
 * Evaluación del acompañamiento tutorial hecha por el TUTORADO (23 ítems + "No aplica").
 * CONFIDENCIAL: el alumno solo ve la suya; la coordinación ve todas;
 * el tutor evaluado NO tiene ningún endpoint de consulta (ver routes.js).
 */
const db = require('../db');
const config = require('../config');
const { badRequest, conflict, notFound } = require('../utils/errores');
const v = require('../utils/validaciones');
const {
  ESCALA, ESCALA_ALUMNO, NO_APLICA, SECCIONES_ALUMNO, PREGUNTAS_ALUMNO, CLAVES_ALUMNO,
} = require('../utils/cuestionario');

const redondear = (x, d = 2) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);
// Promedio de los ítems vigentes con respuesta 1..5 ("No aplica" = 0 no cuenta)
const promedioDe = (respuestas) => {
  const vals = CLAVES_ALUMNO.map((k) => Number(respuestas[k])).filter((n) => n >= 1 && n <= 5);
  return vals.length ? redondear(vals.reduce((s, n) => s + n, 0) / vals.length) : null;
};
const periodoDe = (req) =>
  /^\d{4}-[12]$/.test(req.query.periodo || '') ? req.query.periodo : config.periodoActual;

/**
 * GET /api/evaluaciones/alumno/mia   (alumno)
 * Instrumento + tutor a evaluar + respuestas previas del propio alumno.
 */
async function miEvaluacion(req, res) {
  const periodo = config.periodoActual;
  const { rows: asig } = await db.query(
    `SELECT a.tutor_id, u.nombre || ' ' || u.apellidos AS tutor_nombre
       FROM asignaciones_tutoria a
       JOIN tutores tu ON tu.id = a.tutor_id
       JOIN usuarios u ON u.id = tu.usuario_id
      WHERE a.tutorado_id = $1 AND a.periodo_escolar = $2 AND a.estatus_asignacion = 'Activa'`,
    [req.user.tutoradoId, periodo]
  );
  const { rows } = await db.query(
    `SELECT id, respuestas, comentarios, fecha_envio, updated_at
       FROM evaluaciones_alumno WHERE tutorado_id = $1 AND periodo = $2`,
    [req.user.tutoradoId, periodo]
  );
  res.json({
    ok: true,
    periodo,
    tutor_nombre: asig[0]?.tutor_nombre || null,
    secciones: SECCIONES_ALUMNO,
    escala: ESCALA_ALUMNO,
    evaluacion: rows[0] ? { ...rows[0], promedio: promedioDe(rows[0].respuestas) } : null,
  });
}

/**
 * POST /api/evaluaciones/alumno   (alumno)
 * Body: { respuestas: { s4a: 0..5, … }, comentarios? }   (0 = No aplica)
 * Evalúa al tutor asignado en el periodo vigente. Se puede actualizar.
 */
async function guardar(req, res) {
  const entrada = req.body.respuestas || {};
  const faltantes = [];
  const respuestas = {};
  PREGUNTAS_ALUMNO.forEach((p) => {
    const crudo = entrada[p.clave];
    const n = crudo === null || crudo === undefined || crudo === '' ? NaN : Number(crudo);
    if (!Number.isInteger(n) || n < NO_APLICA || n > 5) faltantes.push(p.numero);
    else respuestas[p.clave] = n;
  });
  if (faltantes.length) {
    throw badRequest(`Responde todos los ítems (del 1 al 5 o "No aplica"). Faltan: ${faltantes.join(', ')}`);
  }
  const comentarios = req.body.comentarios
    ? v.texto(req.body.comentarios, 'comentarios', { min: 1, max: 2000 })
    : null;

  const { rows: asig } = await db.query(
    `SELECT tutor_id FROM asignaciones_tutoria
      WHERE tutorado_id = $1 AND periodo_escolar = $2 AND estatus_asignacion = 'Activa'`,
    [req.user.tutoradoId, config.periodoActual]
  );
  if (!asig[0]) throw conflict('No tienes un tutor asignado en este periodo; no hay a quién evaluar.');

  const { rows } = await db.query(
    `INSERT INTO evaluaciones_alumno (tutorado_id, tutor_id, periodo, respuestas, comentarios)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (tutorado_id, periodo)
     DO UPDATE SET respuestas = EXCLUDED.respuestas, comentarios = EXCLUDED.comentarios,
                   tutor_id = EXCLUDED.tutor_id
     RETURNING id, respuestas, comentarios, fecha_envio, updated_at, (xmax <> 0) AS actualizada`,
    [req.user.tutoradoId, asig[0].tutor_id, config.periodoActual, JSON.stringify(respuestas), comentarios]
  );
  const fila = rows[0];
  res.status(fila.actualizada ? 200 : 201).json({
    ok: true,
    mensaje: fila.actualizada
      ? 'Tu evaluación se actualizó correctamente.'
      : 'Gracias. Tu evaluación se envió de forma confidencial a la Coordinación de Tutorías.',
    periodo: config.periodoActual,
    evaluacion: { ...fila, promedio: promedioDe(fila.respuestas) },
  });
}

/**
 * GET /api/evaluaciones/alumnos/resumen?periodo=2026-2&tutor_id=1   (coordinador)
 * Resultados por tutor, por ítem y lista de respuestas individuales.
 */
async function resumen(req, res) {
  const periodo = periodoDe(req);
  const tutorId = req.query.tutor_id ? v.idPositivo(req.query.tutor_id, 'tutor_id') : null;

  // Tutores con cuántos tutorados tienen y cuántos los evaluaron
  const { rows: tutores } = await db.query(
    `SELECT tu.id AS tutor_id,
            u.nombre || ' ' || u.apellidos AS nombre,
            (SELECT array_remove(array_agg(DISTINCT a.grupo), NULL) FROM asignaciones_tutoria a
              WHERE a.tutor_id = tu.id AND a.periodo_escolar = $1 AND a.estatus_asignacion = 'Activa') AS grupos,
            (SELECT count(*) FROM asignaciones_tutoria a
              WHERE a.tutor_id = tu.id AND a.periodo_escolar = $1 AND a.estatus_asignacion = 'Activa')::int AS tutorados
       FROM tutores tu
       JOIN usuarios u ON u.id = tu.usuario_id AND u.estado = 'activo'
   ORDER BY u.apellidos`,
    [periodo]
  );

  const { rows: evals } = await db.query(
    `SELECT e.id, e.tutor_id, e.respuestas, e.comentarios, e.fecha_envio,
            ua.no_control_o_rfc AS no_control,
            ua.apellidos || ' ' || ua.nombre AS alumno_nombre,
            t.semestre, a.grupo,
            ut.nombre || ' ' || ut.apellidos AS tutor_nombre
       FROM evaluaciones_alumno e
       JOIN tutorados t  ON t.id = e.tutorado_id
       JOIN usuarios  ua ON ua.id = t.usuario_id
       JOIN tutores   tu ON tu.id = e.tutor_id
       JOIN usuarios  ut ON ut.id = tu.usuario_id
  LEFT JOIN asignaciones_tutoria a ON a.tutorado_id = t.id AND a.periodo_escolar = e.periodo
                                  AND a.tutor_id = e.tutor_id
      WHERE e.periodo = $1
   ORDER BY e.fecha_envio DESC`,
    [periodo]
  );

  // Resultados por tutor (siempre sobre todas las evaluaciones del periodo)
  const porTutor = tutores
    .filter((t) => t.tutorados > 0 || evals.some((e) => e.tutor_id === t.tutor_id))
    .map((t) => {
      const suyas = evals.filter((e) => e.tutor_id === t.tutor_id);
      const proms = suyas.map((e) => promedioDe(e.respuestas)).filter((x) => x !== null);
      const prom = proms.length ? proms.reduce((s, x) => s + x, 0) / proms.length : null;
      return {
        ...t,
        respondidas: suyas.length,
        pct_participacion: t.tutorados ? redondear((suyas.length / t.tutorados) * 100, 1) : 0,
        promedio: redondear(prom),
      };
    });

  // Ítems y lista individual (filtrables por tutor)
  const filtradas = tutorId ? evals.filter((e) => e.tutor_id === tutorId) : evals;
  const items = PREGUNTAS_ALUMNO.map((p) => {
    const crudos = filtradas.map((e) => e.respuestas[p.clave]);
    const noAplica = crudos.filter((x) => x !== undefined && x !== null && Number(x) === NO_APLICA).length;
    const valores = crudos.map(Number).filter((n) => n >= 1 && n <= 5);
    const distribucion = Object.fromEntries(ESCALA.map((e) => [e.valor, valores.filter((x) => x === e.valor).length]));
    const n = valores.length;
    return {
      ...p,
      respuestas: n,
      no_aplica: noAplica,
      promedio: n ? redondear(valores.reduce((s, x) => s + x, 0) / n) : null,
      distribucion,
      pct_favorable: n ? redondear(((distribucion[1] + distribucion[2]) / n) * 100, 1) : null,
    };
  });
  const conDatos = items.filter((i) => i.promedio !== null);
  const totalTutorados = tutorId
    ? porTutor.find((t) => t.tutor_id === tutorId)?.tutorados || 0
    : porTutor.reduce((s, t) => s + t.tutorados, 0);

  res.json({
    ok: true,
    periodo,
    tutor_id: tutorId,
    escala: ESCALA,
    secciones: SECCIONES_ALUMNO.map((s) => ({ id: s.id, titulo: s.titulo })),
    respondidas: filtradas.length,
    total_tutorados: totalTutorados,
    pct_participacion: totalTutorados ? redondear((filtradas.length / totalTutorados) * 100, 1) : 0,
    promedio_general: conDatos.length
      ? redondear(conDatos.reduce((s, i) => s + i.promedio, 0) / conDatos.length)
      : null,
    por_tutor: porTutor,
    items,
    respuestas: filtradas.map((e) => ({
      id: e.id,
      tutor_id: e.tutor_id,
      tutor_nombre: e.tutor_nombre,
      no_control: e.no_control,
      alumno_nombre: e.alumno_nombre,
      semestre: e.semestre,
      grupo: e.grupo,
      fecha_envio: e.fecha_envio,
      promedio: promedioDe(e.respuestas),
      tiene_comentarios: Boolean(e.comentarios),
    })),
  });
}

/**
 * GET /api/evaluaciones/alumnos/:id   (coordinador)
 * Respuestas completas de una evaluación.
 */
async function detalle(req, res) {
  const id = v.idPositivo(req.params.id, 'id');
  const { rows } = await db.query(
    `SELECT e.id, e.periodo, e.respuestas, e.comentarios, e.fecha_envio, e.updated_at,
            ua.no_control_o_rfc AS no_control,
            ua.apellidos || ' ' || ua.nombre AS alumno_nombre,
            ut.nombre || ' ' || ut.apellidos AS tutor_nombre
       FROM evaluaciones_alumno e
       JOIN tutorados t  ON t.id = e.tutorado_id
       JOIN usuarios  ua ON ua.id = t.usuario_id
       JOIN tutores   tu ON tu.id = e.tutor_id
       JOIN usuarios  ut ON ut.id = tu.usuario_id
      WHERE e.id = $1`,
    [id]
  );
  if (!rows[0]) throw notFound('Evaluación no encontrada');
  res.json({
    ok: true,
    secciones: SECCIONES_ALUMNO,
    escala: ESCALA_ALUMNO,
    evaluacion: { ...rows[0], promedio: promedioDe(rows[0].respuestas) },
  });
}

module.exports = { miEvaluacion, guardar, resumen, detalle };
