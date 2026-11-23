'use strict';

const { badRequest } = require('../utils/errores');
const { tutoresDisponibles } = require('./tutores.controller');
const { recomendador } = require('../config');

const { url, token, habilitado } = recomendador;
const palabrasGenerales = new Set('como cual duda ayuda ayudar necesito quiero para sobre tengo puedo buscar porque donde alguien usar hacer del los las una uno por con mis nos que'.split(' '));

function palabras(texto) {
  return (texto.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[a-z0-9]+/g) || [])
    .filter(p => (p.length >= 3 || p === 'ux' || p === 'ia') && !palabrasGenerales.has(p));
}

function buscarEnDirectorio(duda, tutores) {
  const consulta = new Set(palabras(duda));
  const candidatos = [];
  for (const tutor of tutores) {
    const areas = [...new Set([...(tutor.areas_apoyo || []), tutor.especialidad].filter(Boolean))];
    const coincidencias = areas.filter(area => palabras(area).some(p => consulta.has(p)));
    if (coincidencias.length) candidatos.push({
      tutor_id: tutor.tutor_id, nombre: tutor.nombre, areas: coincidencias,
    });
  }
  candidatos.sort((a, b) => b.areas.length - a.areas.length || a.nombre.localeCompare(b.nombre, 'es'));
  return { ok: true, modo: candidatos.length ? 'directorio' : 'sin_coincidencias', candidatos: candidatos.slice(0, 3) };
}

async function recomendar(req, res) {
  res.set('Cache-Control', 'no-store');
  const duda = typeof req.body?.duda === 'string' ? req.body.duda.trim() : '';
  if (duda.length < 10 || duda.length > 500) {
    throw badRequest('Escribe una duda de entre 10 y 500 caracteres.');
  }
  const disponibles = await tutoresDisponibles();
  const porCorreo = new Map(disponibles.map(t => [t.correo.toLowerCase(), t]));
  if (!porCorreo.size) return res.json({ ok: true, modo: 'sin_cupo', candidatos: [] });
  const directorio = () => res.json(buscarEnDirectorio(duda, disponibles));
  if (!habilitado) return directorio();

  let resultado;
  try {
    const respuesta = await fetch(new URL('/recomendar', url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ duda, tutores: [...porCorreo.keys()] }),
      signal: AbortSignal.timeout(7500),
      redirect: 'error',
    });
    if (!respuesta.ok) return directorio();
    resultado = await respuesta.json();
  } catch {
    return directorio();
  }

  const { modo, candidatos } = resultado ?? {};
  if (!['ranking', 'fallback', 'sin_catalogo'].includes(modo) || !Array.isArray(candidatos)) {
    return directorio();
  }
  if (modo === 'sin_catalogo') return directorio();

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
  if (modo === 'ranking' && !recomendados.length) return directorio();
  res.json({ ok: true, modo,
    candidatos: modo === 'ranking' ? recomendados : [] });
}

module.exports = { recomendar };
