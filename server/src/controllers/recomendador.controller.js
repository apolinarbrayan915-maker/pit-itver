'use strict';

const { badRequest, conflict, notFound } = require('../utils/errores');
const v = require('../utils/validaciones');
const db = require('../db');
const { tutoresDisponibles } = require('./tutores.controller');
const { recomendador } = require('../config');
const catalogo = require('../catalogoMaterias');

const { url, token, habilitado } = recomendador;
const materiasPorCorreo = new Map(catalogo.perfiles.filter(p => p.correo_pit).map(p => [p.correo_pit, p]));
const materiasPorId = new Map(catalogo.perfiles.map(p => [p.id, p]));
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
    const referencia = materiasPorId.get(tutor.catalogo_materias_id) ?? materiasPorCorreo.get(tutor.correo.toLowerCase());
    const materias = (referencia?.materias ?? []).filter(materia => palabras(materia).some(p => consulta.has(p)));
    if (coincidencias.length || materias.length) candidatos.push({
      tutor_id: tutor.tutor_id, nombre: tutor.nombre, areas: coincidencias,
      materias_reportadas: materias, ficha_materias: materias.length ? referencia.fichas[0] : null,
    });
  }
  candidatos.sort((a, b) => b.areas.length - a.areas.length ||
    b.materias_reportadas.length - a.materias_reportadas.length || a.nombre.localeCompare(b.nombre, 'es'));
  return { ok: true, modo: candidatos.length ? 'directorio' : 'sin_coincidencias', candidatos: candidatos.slice(0, 3) };
}

function buscarPerfilesAcademicos(duda, perfilesVinculados) {
  const consulta = new Set(palabras(duda));
  return catalogo.perfiles.filter(p => !p.correo_pit && !perfilesVinculados.has(p.id)).map(({ correo_pit, ...perfil }) => {
    const materias = perfil.materias.filter(m => palabras(m).some(p => consulta.has(p)));
    const temas = perfil.temas.filter(t => palabras(t).some(p => consulta.has(p)));
    return { ...perfil, coincidencias: materias.length ? materias : temas };
  }).filter(p => p.coincidencias.length)
    .sort((a, b) => b.coincidencias.length - a.coincidencias.length || a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, 5);
}

async function recomendar(req, res) {
  res.set('Cache-Control', 'no-store');
  const duda = typeof req.body?.duda === 'string' ? req.body.duda.trim() : '';
  if (duda.length < 10 || duda.length > 500) {
    throw badRequest('Escribe una duda de entre 10 y 500 caracteres.');
  }
  const [disponibles, vinculados] = await Promise.all([
    tutoresDisponibles(),
    db.query('SELECT catalogo_materias_id FROM tutores WHERE catalogo_materias_id IS NOT NULL'),
  ]);
  const perfiles_academicos = buscarPerfilesAcademicos(duda, new Set(vinculados.rows.map(t => t.catalogo_materias_id)));
  const porCorreo = new Map(disponibles.map(t => [t.correo.toLowerCase(), t]));
  if (!porCorreo.size) return res.json({ ok: true, modo: 'sin_cupo', candidatos: [], perfiles_academicos });
  const directorio = () => res.json({ ...buscarEnDirectorio(duda, disponibles), perfiles_academicos });
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
    candidatos: modo === 'ranking' ? recomendados : [], perfiles_academicos });
}

async function listarCatalogoMaterias(req, res) {
  res.set('Cache-Control', 'no-store');
  const { rows } = await db.query('SELECT catalogo_materias_id FROM tutores WHERE catalogo_materias_id IS NOT NULL');
  const vinculados = new Set(rows.map(t => t.catalogo_materias_id));
  res.json({ ok: true, fuente: catalogo.fuente, fecha: catalogo.fecha,
    perfiles: catalogo.perfiles.map(({ correo_pit, ...perfil }) => ({
      ...perfil, vinculado: Boolean(correo_pit) || vinculados.has(perfil.id),
    })),
  });
}

function identidad(nombre) {
  return (nombre.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[a-z]+/g) || [])
    .sort().join(' ');
}

async function vincularPerfil(req, res) {
  const perfil = materiasPorId.get(req.params.perfilId);
  if (!perfil) throw notFound('No se encontró el perfil académico.');
  const correo = v.texto(req.body?.correo, 'correo', { max: 180 }).toLowerCase();
  if (!v.esCorreoInstitucional(correo)) throw badRequest('Usa el correo institucional del docente.');
  if (perfil.correo_pit && perfil.correo_pit !== correo) throw conflict('El perfil ya tiene una cuenta institucional vinculada.');
  const cupo = v.idPositivo(req.body?.cupo, 'cupo');
  if (cupo > 60) throw badRequest('El cupo máximo es de 60 tutorados.');
  const cubiculo = req.body?.cubiculo ? v.texto(req.body.cubiculo, 'cubículo', { max: 40 }) : null;

  const tutorId = await db.withTransaction(async client => {
    const { rows: usuarios } = await client.query(
      `SELECT id, nombre || ' ' || apellidos AS nombre FROM usuarios
        WHERE lower(correo_institucional) = $1 AND rol = 'tutor' AND estado = 'activo'
        FOR UPDATE`, [correo]);
    const usuario = usuarios[0];
    if (!usuario) throw notFound('Ese correo debe corresponder a una cuenta activa con rol tutor.');
    if (identidad(usuario.nombre) !== identidad(perfil.nombre)) {
      throw conflict('El nombre del perfil académico no coincide con la cuenta institucional.');
    }
    const { rows: existentes } = await client.query(
      'SELECT id FROM tutores WHERE usuario_id = $1', [usuario.id]);
    const { rows } = await client.query(
      `INSERT INTO tutores (usuario_id, catalogo_materias_id, cubiculo, max_tutorados, acepta_tutorados)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (usuario_id) DO UPDATE SET catalogo_materias_id = EXCLUDED.catalogo_materias_id
       WHERE tutores.catalogo_materias_id IS NULL OR tutores.catalogo_materias_id = EXCLUDED.catalogo_materias_id
       RETURNING id`, [usuario.id, perfil.id, cubiculo, cupo]);
    if (!rows[0]) throw conflict('La cuenta ya tiene otro perfil académico.');
    if (!existentes.length && req.body.usar_horario_catalogo === true) {
      await client.query(
        `INSERT INTO tutor_horarios (tutor_id, dia_semana, hora_inicio, hora_fin)
         SELECT $1, h.dia, h.inicio, h.fin
           FROM altas_catalogo_pit p
           CROSS JOIN LATERAL (VALUES (p.dia_1, p.inicio_1, p.fin_1),
                                     (p.dia_2, p.inicio_2, p.fin_2)) AS h(dia, inicio, fin)
          WHERE p.perfil_id = $2`, [rows[0].id, perfil.id]);
    }
    return rows[0].id;
  });
  res.json({ ok: true, tutor_id: tutorId });
}

module.exports = { recomendar, listarCatalogoMaterias, vincularPerfil };
