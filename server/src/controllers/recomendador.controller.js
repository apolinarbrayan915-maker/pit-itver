'use strict';

const { badRequest, HttpError } = require('../utils/errores');
const { tutoresDisponibles } = require('./tutores.controller');
const { recomendador } = require('../config');

const { url, token, habilitado } = recomendador;
const sinServicio = () => new HttpError(503, 'El recomendador no está disponible en este momento.');

async function recomendar(req, res) {
  res.set('Cache-Control', 'no-store');
  const duda = typeof req.body?.duda === 'string' ? req.body.duda.trim() : '';
  if (duda.length < 10 || duda.length > 500) {
    throw badRequest('Escribe una duda de entre 10 y 500 caracteres.');
  }
  if (!habilitado) throw sinServicio();

  const disponibles = await tutoresDisponibles();
  const porCorreo = new Map(disponibles.map(t => [t.correo.toLowerCase(), t]));
  if (!porCorreo.size) return res.json({ ok: true, modo: 'sin_cupo', candidatos: [] });

  let resultado;
  try {
    const respuesta = await fetch(new URL('/recomendar', url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ duda, tutores: [...porCorreo.keys()] }),
      signal: AbortSignal.timeout(7500),
      redirect: 'error',
    });
    if (!respuesta.ok) throw sinServicio();
    resultado = await respuesta.json();
  } catch {
    throw sinServicio();
  }

  const { modo, candidatos } = resultado ?? {};
  if (!['ranking', 'fallback', 'sin_catalogo'].includes(modo) || !Array.isArray(candidatos)) {
    throw sinServicio();
  }

  const vistos = new Set();
  const recomendados = [];
  for (const c of candidatos) {
    const tutor = porCorreo.get(c?.id);
    if (!tutor || vistos.has(tutor.tutor_id)) continue;
    if (![c.score, c.sem, c.proj, c.cert].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) continue;
    vistos.add(tutor.tutor_id);
    recomendados.push({ tutor_id: tutor.tutor_id, nombre: tutor.nombre,
      score: c.score, sem: c.sem, proj: c.proj, cert: c.cert });
    if (recomendados.length === 3) break;
  }
  res.json({ ok: true, modo: modo === 'ranking' && !recomendados.length ? 'sin_catalogo' : modo,
    candidatos: modo === 'ranking' ? recomendados : [] });
}

module.exports = { recomendar };
