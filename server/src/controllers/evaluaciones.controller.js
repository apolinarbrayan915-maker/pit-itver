'use strict';

const db = require('../db');
const config = require('../config');
const { badRequest, notFound } = require('../utils/errores');
const v = require('../utils/validaciones');
const { PREGUNTAS, ESCALA, CLAVES } = require('../utils/cuestionario');

const periodoDe = (req) =>
  /^\d{4}-[12]$/.test(req.query.periodo || '') ? req.query.periodo : config.periodoActual;

const COLUMNAS = CLAVES.join(', ');

/** Convierte una fila de BD en { respuestas: {p1..p11}, promedio, ... } */
function formatear(fila) {
  if (!fila) return null;
  const respuestas = Object.fromEntries(CLAVES.map((k) => [k, Number(fila[k])]));
  const promedio = CLAVES.reduce((s, k) => s + respuestas[k], 0) / CLAVES.length;
  return {
    id: fila.id,
    tutor_id: fila.tutor_id,
    periodo: fila.periodo,
    respuestas,
    promedio: Math.round(promedio * 100) / 100,
    comentarios: fila.comentarios,
    fecha_envio: fila.fecha_envio,
    updated_at: fila.updated_at,
  };
}

/**
 * GET /api/evaluaciones/mia?periodo=2026-2   (tutor)
 * Devuelve el instrumento y, si ya respondió, sus respuestas.
 */
async function miEvaluacion(req, res) {
  const periodo = periodoDe(req);
  const { rows } = await db.query(
    `SELECT id, tutor_id, periodo, ${COLUMNAS}, comentarios, fecha_envio, updated_at
       FROM evaluaciones_tutor WHERE tutor_id = $1 AND periodo = $2`,
    [req.user.tutorId, periodo]
  );
  res.json({ ok: true, periodo, preguntas: PREGUNTAS, escala: ESCALA, evaluacion: formatear(rows[0]) });
}

/**
 * POST /api/evaluaciones   (tutor)
 * Body: { respuestas: { p1: 1..5, …, p11: 1..5 }, comentarios? }
 * Guarda la evaluación del periodo vigente; si ya existía, la actualiza.
 */
async function guardar(req, res) {
  const respuestas = req.body.respuestas || {};
  const faltantes = [];
  const valores = CLAVES.map((k) => {
    const n = Number(respuestas[k]);
    if (!Number.isInteger(n) || n < 1 || n > 5) faltantes.push(k.toUpperCase());
    return n;
  });
  if (faltantes.length) {
    throw badRequest(`Responde todas las preguntas con un valor del 1 al 5. Faltan: ${faltantes.join(', ')}`);
  }
  const comentarios = req.body.comentarios
    ? v.texto(req.body.comentarios, 'comentarios', { min: 1, max: 2000 })
    : null;

  const params = [req.user.tutorId, config.periodoActual, ...valores, comentarios];
  const marcadores = CLAVES.map((_, i) => `$${i + 3}`).join(', ');
  const actualizar = CLAVES.map((k) => `${k} = EXCLUDED.${k}`).join(', ');

  const { rows } = await db.query(
    `INSERT INTO evaluaciones_tutor (tutor_id, periodo, ${COLUMNAS}, comentarios)
     VALUES ($1, $2, ${marcadores}, $${CLAVES.length + 3})
     ON CONFLICT (tutor_id, periodo)
     DO UPDATE SET ${actualizar}, comentarios = EXCLUDED.comentarios
     RETURNING id, tutor_id, periodo, ${COLUMNAS}, comentarios, fecha_envio, updated_at,
               (xmax <> 0) AS actualizada`,
    params
  );

  const actualizada = rows[0].actualizada;
  res.status(actualizada ? 200 : 201).json({
    ok: true,
    mensaje: actualizada ? 'Tu evaluación se actualizó correctamente.' : 'Evaluación enviada a la Coordinación de Tutorías.',
    evaluacion: formatear(rows[0]),
  });
}

/**
 * GET /api/evaluaciones/resumen?periodo=2026-2   (coordinador)
 * Concentrado por pregunta (promedio, distribución, % favorable) y estatus por tutor.
 */
async function resumen(req, res) {
  const periodo = periodoDe(req);

  const { rows: tutores } = await db.query(
    `SELECT tu.id AS tutor_id,
            u.nombre || ' ' || u.apellidos AS nombre,
            u.no_control_o_rfc AS rfc,
            (SELECT array_remove(array_agg(DISTINCT a.grupo), NULL)
               FROM asignaciones_tutoria a
              WHERE a.tutor_id = tu.id AND a.periodo_escolar = $1 AND a.estatus_asignacion = 'Activa') AS grupos,
            e.id AS evaluacion_id, e.fecha_envio, e.updated_at, e.comentarios,
            ${CLAVES.map((k) => `e.${k}`).join(', ')}
       FROM tutores tu
       JOIN usuarios u ON u.id = tu.usuario_id AND u.estado = 'activo'
  LEFT JOIN evaluaciones_tutor e ON e.tutor_id = tu.id AND e.periodo = $1
   ORDER BY (e.id IS NULL), u.apellidos`,
    [periodo]
  );

  const respondidas = tutores.filter((t) => t.evaluacion_id);

  const porPregunta = PREGUNTAS.map((p) => {
    const valores = respondidas.map((t) => Number(t[p.clave]));
    const distribucion = Object.fromEntries(ESCALA.map((e) => [e.valor, valores.filter((x) => x === e.valor).length]));
    const n = valores.length;
    const promedio = n ? valores.reduce((s, x) => s + x, 0) / n : null;
    return {
      ...p,
      respuestas: n,
      promedio: promedio === null ? null : Math.round(promedio * 100) / 100,
      distribucion,
      // % de tutores que respondió "Siempre" o "Casi siempre"
      pct_favorable: n ? Math.round(((distribucion[1] + distribucion[2]) / n) * 1000) / 10 : null,
    };
  });

  const conPromedio = porPregunta.filter((p) => p.promedio !== null);
  const promedioGeneral = conPromedio.length
    ? Math.round((conPromedio.reduce((s, p) => s + p.promedio, 0) / conPromedio.length) * 100) / 100
    : null;

  res.json({
    ok: true,
    periodo,
    escala: ESCALA,
    total_tutores: tutores.length,
    respondidas: respondidas.length,
    pct_participacion: tutores.length ? Math.round((respondidas.length / tutores.length) * 1000) / 10 : 0,
    promedio_general: promedioGeneral,
    preguntas: porPregunta,
    tutores: tutores.map((t) => ({
      tutor_id: t.tutor_id,
      nombre: t.nombre,
      rfc: t.rfc,
      grupos: t.grupos,
      estatus: t.evaluacion_id ? 'Enviada' : 'Pendiente',
      fecha_envio: t.fecha_envio,
      promedio: t.evaluacion_id
        ? Math.round((CLAVES.reduce((s, k) => s + Number(t[k]), 0) / CLAVES.length) * 100) / 100
        : null,
      tiene_comentarios: Boolean(t.comentarios),
    })),
  });
}

/**
 * GET /api/evaluaciones/tutor/:tutorId?periodo=2026-2   (coordinador)
 * Respuestas individuales de un tutor.
 */
async function detalleTutor(req, res) {
  const tutorId = v.idPositivo(req.params.tutorId, 'tutorId');
  const periodo = periodoDe(req);
  const { rows } = await db.query(
    `SELECT e.id, e.tutor_id, e.periodo, ${CLAVES.map((k) => `e.${k}`).join(', ')},
            e.comentarios, e.fecha_envio, e.updated_at,
            u.nombre || ' ' || u.apellidos AS tutor_nombre
       FROM evaluaciones_tutor e
       JOIN tutores tu ON tu.id = e.tutor_id
       JOIN usuarios u ON u.id = tu.usuario_id
      WHERE e.tutor_id = $1 AND e.periodo = $2`,
    [tutorId, periodo]
  );
  if (!rows[0]) throw notFound('Este tutor aún no ha enviado su evaluación en el periodo.');
  res.json({
    ok: true,
    periodo,
    preguntas: PREGUNTAS,
    escala: ESCALA,
    tutor_nombre: rows[0].tutor_nombre,
    evaluacion: formatear(rows[0]),
  });
}

module.exports = { miEvaluacion, guardar, resumen, detalleTutor };
