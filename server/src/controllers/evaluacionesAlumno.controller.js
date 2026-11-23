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
const { ventanaEvaluacion } = require('../utils/calendarioEscolar');

/** Ventana de la evaluación (último mes de clases); EVALUACION_ABIERTA=1 la abre siempre (presentaciones). */
function ventanaActual() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: config.tz }).format(new Date());
  const w = ventanaEvaluacion(hoy);
  return process.env.EVALUACION_ABIERTA === '1' ? { ...w, abierta: true } : w;
}
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
 * Tutor que el tutorado evalúa en el periodo: solo su tutor ACTUAL (asignación activa).
 * Aunque haya cambiado de tutor, la evaluación es una sola por alumno y periodo.
 */
async function tutoresAEvaluar(tutoradoId, periodo) {
  const { rows } = await db.query(
    `SELECT a.tutor_id, u.nombre || ' ' || u.apellidos AS tutor_nombre, true AS actual
       FROM asignaciones_tutoria a
       JOIN tutores tu ON tu.id = a.tutor_id
       JOIN usuarios u ON u.id = tu.usuario_id
      WHERE a.tutorado_id = $1 AND a.periodo_escolar = $2 AND a.estatus_asignacion = 'Activa'
      LIMIT 1`,
    [tutoradoId, periodo]
  );
  return rows;
}

/**
 * GET /api/evaluaciones/alumno/mia?tutor_id=   (alumno)
 * Instrumento, tutores por evaluar (con su estado) y respuestas previas del tutor elegido.
 */
async function miEvaluacion(req, res) {
  const periodo = config.periodoActual;
  const tutoradoId = req.user.tutoradoId;
  const tutores = await tutoresAEvaluar(tutoradoId, periodo);
  const { rows: hechas } = await db.query(
    `SELECT id, tutor_id, respuestas, comentarios, fecha_envio, updated_at
       FROM evaluaciones_alumno WHERE tutorado_id = $1 AND periodo = $2`,
    [tutoradoId, periodo]
  );
  const porTutor = new Map(hechas.map((e) => [e.tutor_id, e]));
  const pedido = Number(req.query.tutor_id) || null;
  const elegido = tutores.find((t) => t.tutor_id === pedido)
    || tutores.find((t) => !porTutor.has(t.tutor_id)) || tutores[0] || null;
  const ev = elegido ? porTutor.get(elegido.tutor_id) : null;
  res.json({
    ok: true,
    periodo,
    ventana: ventanaActual(),
    tutores: tutores.map((t) => ({ ...t, evaluado: porTutor.has(t.tutor_id) })),
    tutor_id: elegido?.tutor_id || null,
    tutor_nombre: elegido?.tutor_nombre || null,
    secciones: SECCIONES_ALUMNO,
    escala: ESCALA_ALUMNO,
    evaluacion: ev ? { ...ev, promedio: promedioDe(ev.respuestas) } : null,
  });
}

/**
 * POST /api/evaluaciones/alumno   (alumno)
 * Body: { tutor_id?, respuestas: { s4a: 1..5, … }, comentarios? }
 * Evalúa a su tutor actual (una evaluación por periodo). Se puede actualizar.
 */
async function guardar(req, res) {
  const ventana = ventanaActual();
  if (!ventana.abierta) {
    throw conflict(`La evaluación tutoral se habilita en el último mes del semestre (del ${ventana.inicio} al ${ventana.fin}).`);
  }
  const entrada = req.body.respuestas || {};
  const faltantes = [];
  const respuestas = {};
  PREGUNTAS_ALUMNO.forEach((p) => {
    const crudo = entrada[p.clave];
    const n = crudo === null || crudo === undefined || crudo === '' ? NaN : Number(crudo);
    if (!Number.isInteger(n) || n < 1 || n > 5) faltantes.push(p.numero);
    else respuestas[p.clave] = n;
  });
  if (faltantes.length) {
    throw badRequest(`Responde todos los ítems con un valor del 1 al 5. Faltan: ${faltantes.join(', ')}`);
  }
  const comentarios = req.body.comentarios
    ? v.texto(req.body.comentarios, 'comentarios', { min: 1, max: 2000 })
    : null;

  const tutores = await tutoresAEvaluar(req.user.tutoradoId, config.periodoActual);
  if (!tutores.length) throw conflict('No tienes un tutor asignado en este periodo; no hay a quién evaluar.');
  const tutor = req.body.tutor_id ? tutores.find((t) => t.tutor_id === Number(req.body.tutor_id)) : tutores[0];
  if (!tutor) throw badRequest('Solo puedes evaluar a tu tutor actual.');

  const { rows } = await db.query(
    `INSERT INTO evaluaciones_alumno (tutorado_id, tutor_id, periodo, respuestas, comentarios)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (tutorado_id, tutor_id, periodo)
     DO UPDATE SET respuestas = EXCLUDED.respuestas, comentarios = EXCLUDED.comentarios
     RETURNING id, tutor_id, respuestas, comentarios, fecha_envio, updated_at, (xmax <> 0) AS actualizada`,
    [req.user.tutoradoId, tutor.tutor_id, config.periodoActual, JSON.stringify(respuestas), comentarios]
  );
  const fila = rows[0];
  res.status(fila.actualizada ? 200 : 201).json({
    ok: true,
    mensaje: fila.actualizada
      ? `Tu evaluación de ${tutor.tutor_nombre} se actualizó correctamente.`
      : `Gracias. Tu evaluación de ${tutor.tutor_nombre} se envió de forma confidencial a la Coordinación de Tutorías.`,
    periodo: config.periodoActual,
    evaluacion: { ...fila, promedio: promedioDe(fila.respuestas) },
  });
}

/** Mínimo de respuestas para mostrar resultados de un tutor (protege el anonimato). */
const MIN_RESPUESTAS = 3;
const anonimizar = (textos) => textos.filter(Boolean).map((t) => String(t).trim()).filter(Boolean).sort(() => Math.random() - 0.5);

/** Concentrado de ítems Likert sobre un conjunto de evaluaciones. */
function concentrar(evals) {
  const items = PREGUNTAS_ALUMNO.map((p) => {
    const valores = evals.map((e) => Number(e.respuestas[p.clave])).filter((n) => n >= 1 && n <= 5);
    const distribucion = Object.fromEntries(ESCALA.map((e) => [e.valor, valores.filter((x) => x === e.valor).length]));
    const n = valores.length;
    return {
      ...p,
      respuestas: n,
      promedio: n ? redondear(valores.reduce((s, x) => s + x, 0) / n) : null,
      distribucion,
      pct_favorable: n ? redondear(((distribucion[1] + distribucion[2]) / n) * 100, 1) : null,
    };
  });
  const total = (k) => items.reduce((s, i) => s + i.distribucion[k], 0);
  const todas = items.reduce((s, i) => s + i.respuestas, 0);
  const conDatos = items.filter((i) => i.promedio !== null);
  return {
    items,
    promedio_general: conDatos.length ? redondear(conDatos.reduce((s, i) => s + i.promedio, 0) / conDatos.length) : null,
    pct_favorable_general: todas ? redondear(((total(1) + total(2)) / todas) * 100, 1) : null,
    distribucion_general: Object.fromEntries(ESCALA.map((e) => [e.valor, total(e.valor)])),
  };
}

/**
 * GET /api/evaluaciones/alumnos/resumen?periodo=2026-2&tutor_id=   (coordinador)
 * Resultados ANÓNIMOS: nunca se devuelve quién evaluó ni sus respuestas.
 * Los resultados de un tutor solo se muestran con al menos MIN_RESPUESTAS evaluaciones.
 */
async function resumen(req, res) {
  const periodo = periodoDe(req);
  const tutorId = req.query.tutor_id ? v.idPositivo(req.query.tutor_id, 'tutor_id') : null;

  const { rows: tutores } = await db.query(
    `SELECT tu.id AS tutor_id,
            u.nombre || ' ' || u.apellidos AS nombre,
            (SELECT count(*) FROM asignaciones_tutoria a
              WHERE a.tutor_id = tu.id AND a.periodo_escolar = $1 AND a.estatus_asignacion = 'Activa')::int AS tutorados
       FROM tutores tu
       JOIN usuarios u ON u.id = tu.usuario_id AND u.estado = 'activo'
   ORDER BY u.apellidos`,
    [periodo]
  );
  const { rows: evals } = await db.query(
    'SELECT tutor_id, respuestas, comentarios FROM evaluaciones_alumno WHERE periodo = $1',
    [periodo]
  );

  const porTutor = tutores
    .filter((t) => t.tutorados > 0 || evals.some((e) => e.tutor_id === t.tutor_id))
    .map((t) => {
      const suyas = evals.filter((e) => e.tutor_id === t.tutor_id);
      const suficiente = suyas.length >= MIN_RESPUESTAS;
      const c = suficiente ? concentrar(suyas) : null;
      return {
        ...t,
        respondidas: suyas.length,
        pct_participacion: t.tutorados ? redondear((suyas.length / t.tutorados) * 100, 1) : 0,
        suficiente,
        promedio: c ? c.promedio_general : null,
        pct_favorable: c ? c.pct_favorable_general : null,
      };
    });

  const filtradas = tutorId ? evals.filter((e) => e.tutor_id === tutorId) : evals;
  const suficiente = filtradas.length >= MIN_RESPUESTAS;
  const c = suficiente ? concentrar(filtradas) : null;
  const totalTutorados = tutorId
    ? porTutor.find((t) => t.tutor_id === tutorId)?.tutorados || 0
    : porTutor.reduce((s, t) => s + t.tutorados, 0);

  res.json({
    ok: true,
    periodo,
    anonimo: true,
    minimo_respuestas: MIN_RESPUESTAS,
    tutor_id: tutorId,
    escala: ESCALA,
    suficiente,
    respondidas: filtradas.length,
    total_tutorados: totalTutorados,
    pct_participacion: totalTutorados ? redondear((filtradas.length / totalTutorados) * 100, 1) : 0,
    promedio_general: c ? c.promedio_general : null,
    pct_favorable_general: c ? c.pct_favorable_general : null,
    distribucion_general: c ? c.distribucion_general : null,
    por_tutor: porTutor,
    items: c ? c.items : PREGUNTAS_ALUMNO.map((p) => ({ ...p, respuestas: 0, promedio: null, distribucion: null, pct_favorable: null })),
    comentarios: suficiente ? anonimizar(filtradas.map((e) => e.comentarios)) : [],
  });
}

module.exports = { miEvaluacion, guardar, resumen };
