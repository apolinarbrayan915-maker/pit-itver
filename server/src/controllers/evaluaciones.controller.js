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

/** Mínimo de respuestas para mostrar resultados: con menos se podría deducir quién respondió qué. */
const MIN_RESPUESTAS = 3;

/** Mezcla los comentarios para que su orden no delate quién los escribió. */
const anonimizar = (textos) => textos.filter(Boolean).map((t) => String(t).trim()).filter(Boolean).sort(() => Math.random() - 0.5);

/**
 * GET /api/evaluaciones/resumen?periodo=2026-2   (coordinador)
 * Resultados ANÓNIMOS: concentrado por pregunta y participación. La coordinación
 * no puede ver las respuestas de un tutor en particular; los resultados solo se
 * muestran cuando hay al menos MIN_RESPUESTAS evaluaciones en el periodo.
 */
async function resumen(req, res) {
  const periodo = periodoDe(req);

  const { rows: tutores } = await db.query(
    `SELECT tu.id AS tutor_id,
            u.nombre || ' ' || u.apellidos AS nombre,
            (e.id IS NOT NULL) AS respondio
       FROM tutores tu
       JOIN usuarios u ON u.id = tu.usuario_id AND u.estado = 'activo'
  LEFT JOIN evaluaciones_tutor e ON e.tutor_id = tu.id AND e.periodo = $1
   ORDER BY u.apellidos`,
    [periodo]
  );
  const { rows: respuestas } = await db.query(
    `SELECT ${COLUMNAS}, comentarios FROM evaluaciones_tutor WHERE periodo = $1`,
    [periodo]
  );
  const n = respuestas.length;
  const suficiente = n >= MIN_RESPUESTAS;

  const porPregunta = PREGUNTAS.map((p) => {
    if (!suficiente) return { ...p, respuestas: n, promedio: null, distribucion: null, pct_favorable: null };
    const valores = respuestas.map((t) => Number(t[p.clave]));
    const distribucion = Object.fromEntries(ESCALA.map((e) => [e.valor, valores.filter((x) => x === e.valor).length]));
    return {
      ...p,
      respuestas: n,
      promedio: Math.round((valores.reduce((s, x) => s + x, 0) / n) * 100) / 100,
      distribucion,
      // % de tutores que respondió "Siempre" o "Casi siempre"
      pct_favorable: Math.round(((distribucion[1] + distribucion[2]) / n) * 1000) / 10,
    };
  });

  const conPromedio = porPregunta.filter((p) => p.promedio !== null);
  const total = (k) => porPregunta.reduce((s, p) => s + (p.distribucion ? p.distribucion[k] : 0), 0);
  const totalRespuestas = n * PREGUNTAS.length;

  res.json({
    ok: true,
    periodo,
    anonimo: true,
    minimo_respuestas: MIN_RESPUESTAS,
    suficiente,
    escala: ESCALA,
    total_tutores: tutores.length,
    respondidas: n,
    pct_participacion: tutores.length ? Math.round((n / tutores.length) * 1000) / 10 : 0,
    promedio_general: conPromedio.length
      ? Math.round((conPromedio.reduce((s, p) => s + p.promedio, 0) / conPromedio.length) * 100) / 100
      : null,
    pct_favorable_general: suficiente ? Math.round(((total(1) + total(2)) / totalRespuestas) * 1000) / 10 : null,
    distribucion_general: suficiente ? Object.fromEntries(ESCALA.map((e) => [e.valor, total(e.valor)])) : null,
    preguntas: porPregunta,
    comentarios: suficiente ? anonimizar(respuestas.map((r) => r.comentarios)) : [],
    // Solo participación (para recordar a quien falta), nunca sus respuestas
    tutores: tutores.map((t) => ({ tutor_id: t.tutor_id, nombre: t.nombre, estatus: t.respondio ? 'Enviada' : 'Pendiente' })),
  });
}

module.exports = { miEvaluacion, guardar, resumen };
