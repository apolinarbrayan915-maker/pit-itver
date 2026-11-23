'use strict';

/**
 * Recomendador semántico de tutores (port en Node del clasificador de recomendador/).
 *
 *  1. Cada texto del perfil del tutor (áreas, especialidad, enfoque, presentación y
 *     materias del catálogo) se convierte en un embedding de 384 dimensiones con
 *     Sentence-BERT (paraphrase-multilingual-MiniLM-L12-v2) vía Hugging Face.
 *  2. La duda del alumno se vectoriza igual y se compara con similitud coseno.
 *  3. Puntaje por tutor, igual que paso3_classifier.py sin CV de proyectos:
 *       sem  = promedio de los 3 fragmentos más afines
 *       proj = sem_cv · 0.7   ·   cert = sem_cv · 0.6   (sem_cv excluye materias)
 *     cada uno normalizado con COS_MIN/COS_MAX y ponderado 45 / 35 / 20.
 *  4. Modo 'ranking' si alguien supera τ = 0.40; si no, 'fallback'.
 *
 * Los vectores de los perfiles se guardan en la tabla embeddings_cache.
 */
const crypto = require('crypto');
const db = require('../db');
const { semantico } = require('../config');

const PESOS = { sem: 0.45, proj: 0.35, cert: 0.20 };
const COS_MIN = 0.10;
const COS_MAX = 0.75;
const UMBRAL = 0.40;
const LOTE = 32;

const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const memoria = new Map(); // hash → Float32Array (por instancia)

function normalizarVector(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Float32Array.from(v, (x) => x / n);
}

// La API puede devolver el vector de la oración o uno por token: se promedia.
function aVector(salida) {
  if (typeof salida[0] === 'number') return salida;
  const filas = typeof salida[0][0] === 'number' ? salida : salida[0];
  const d = filas[0].length;
  const prom = new Array(d).fill(0);
  for (const f of filas) for (let i = 0; i < d; i++) prom[i] += f[i] / filas.length;
  return prom;
}

async function vectorizar(textos, { limiteMs = 8000 } = {}) {
  const r = await fetch(`${semantico.url}/${semantico.modelo}/pipeline/feature-extraction`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${semantico.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: textos, options: { wait_for_model: true } }),
    signal: AbortSignal.timeout(limiteMs),
    redirect: 'error',
  });
  if (!r.ok) throw new Error(`Hugging Face respondió ${r.status}`);
  const datos = await r.json();
  if (!Array.isArray(datos) || datos.length !== textos.length) throw new Error('Respuesta inesperada del modelo');
  return datos.map((d) => normalizarVector(aVector(d)));
}

/** Devuelve los vectores de `textos`, usando la caché y pidiendo solo lo que falta. */
async function vectoresDe(textos, { maxNuevos = Infinity, limiteMs = 8000 } = {}) {
  const unicos = [...new Set(textos)];
  const faltan = unicos.filter((t) => !memoria.has(hash(t)));
  if (faltan.length) {
    const { rows } = await db.query(
      'SELECT hash, vector FROM embeddings_cache WHERE modelo = $1 AND hash = ANY($2)',
      [semantico.modelo, faltan.map(hash)]);
    for (const r of rows) memoria.set(r.hash, Float32Array.from(r.vector));
  }
  const nuevos = unicos.filter((t) => !memoria.has(hash(t))).slice(0, maxNuevos);
  for (let i = 0; i < nuevos.length; i += LOTE) {
    const lote = nuevos.slice(i, i + LOTE);
    const vecs = await vectorizar(lote, { limiteMs });
    const hs = lote.map(hash);
    hs.forEach((h, j) => memoria.set(h, vecs[j]));
    await db.query(
      `INSERT INTO embeddings_cache (modelo, hash, vector)
       SELECT $1, h, v::real[] FROM unnest($2::text[], $3::text[]) AS x(h, v)
       ON CONFLICT DO NOTHING`,
      [semantico.modelo, hs, vecs.map((v) => `{${Array.from(v).join(',')}}`)]);
  }
  return new Map(unicos.filter((t) => memoria.has(hash(t))).map((t) => [t, memoria.get(hash(t))]));
}

/** Fragmentos (sección, texto) del perfil, como las viñetas del CV en el recomendador. */
function fragmentosDe(tutor, materias = []) {
  const limpiar = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const cv = [...(tutor.areas_apoyo || []), tutor.especialidad, ...(tutor.enfoque || [])]
    .map(limpiar).filter((t) => t.length >= 3);
  const presentacion = limpiar(tutor.presentacion).slice(0, 500);
  if (presentacion.length >= 20) cv.push(presentacion);
  return [
    ...[...new Set(cv)].map((t) => ['cv', t]),
    ...[...new Set(materias.map(limpiar).filter((t) => t.length >= 3))].map((t) => ['materias', t]),
  ];
}

const normalizarCoseno = (c) => Math.min(1, Math.max(0, (c - COS_MIN) / (COS_MAX - COS_MIN)));
const top = (arr, k) => (arr.length ? [...arr].sort((a, b) => b - a).slice(0, k) : []);
const promedio = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function coseno(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // vectores ya normalizados
}

/**
 * Ordena a los tutores por afinidad semántica con la duda.
 * @param {string} duda
 * @param {Array<{tutor, materias}>} perfiles
 */
async function recomendarSemantico(duda, perfiles, { topK = 3 } = {}) {
  const porTutor = perfiles.map(({ tutor, materias }) => ({ tutor, frag: fragmentosDe(tutor, materias) }));
  const textos = porTutor.flatMap((p) => p.frag.map(([, t]) => t));
  const [[vq], vecs] = await Promise.all([
    vectorizar([duda]),
    vectoresDe(textos, { maxNuevos: 256 }),
  ]);
  const candidatos = [];
  for (const { tutor, frag } of porTutor) {
    const sims = frag.filter(([, t]) => vecs.has(t)).map(([sec, t]) => [sec, coseno(vq, vecs.get(t))]);
    if (!sims.length) continue;
    const sem = promedio(top(sims.map(([, s]) => s), 3));
    const semCv = promedio(top(sims.filter(([sec]) => sec === 'cv').map(([, s]) => s), 3));
    const s = { sem: normalizarCoseno(sem), proj: normalizarCoseno(semCv * 0.7), cert: normalizarCoseno(semCv * 0.6) };
    const score = PESOS.sem * s.sem + PESOS.proj * s.proj + PESOS.cert * s.cert;
    const mejores = sims.map(([sec, c], i) => ({ sec, c, t: frag.filter(([, t]) => vecs.has(t))[i][1] }))
      .sort((a, b) => b.c - a.c).map((e) => e.t).filter((t, i, a) => a.indexOf(t) === i).slice(0, 2);
    candidatos.push({ tutor_id: tutor.tutor_id, nombre: tutor.nombre, correo: tutor.correo,
      score: +score.toFixed(3), sem: +s.sem.toFixed(3), proj: +s.proj.toFixed(3), cert: +s.cert.toFixed(3),
      evidencias: mejores });
  }
  candidatos.sort((a, b) => b.score - a.score);
  const aprobados = candidatos.filter((c) => c.score >= UMBRAL);
  return aprobados.length
    ? { modo: 'ranking', candidatos: aprobados.slice(0, topK) }
    : { modo: 'fallback', candidatos: [], cercano: candidatos[0] || null };
}

/** Llena la caché con los textos de todos los perfiles (para Coordinación). */
async function indexar(perfiles) {
  const textos = perfiles.flatMap(({ tutor, materias }) => fragmentosDe(tutor, materias).map(([, t]) => t));
  const vecs = await vectoresDe(textos, { limiteMs: 20000 });
  return { textos: new Set(textos).size, indexados: vecs.size };
}

module.exports = { recomendarSemantico, indexar, fragmentosDe, _interno: { normalizarCoseno, aVector } };
