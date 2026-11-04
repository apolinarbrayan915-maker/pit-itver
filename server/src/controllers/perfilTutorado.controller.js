'use strict';

/**
 * Perfil tipo "persona" del tutorado (foto, datos personales, frase,
 * objetivos, frustraciones y descripción).
 * - Alumno: consulta y edita el suyo.
 * - Tutor: consulta el de sus tutorados.
 * - Coordinador: consulta cualquiera.
 */
const db = require('../db');
const config = require('../config');
const { badRequest, forbidden, notFound } = require('../utils/errores');
const v = require('../utils/validaciones');
const { esTutorDe } = require('./tutores.controller');
const { CAMPOS_FICHA, normalizar, diferencias } = require('../utils/fichaIdentificacion');

const TOPE_FOTO = 400000; // caracteres del data URL (~290 KB de imagen)

async function cargar(tutoradoId) {
  const { rows } = await db.query(
    `SELECT t.id AS tutorado_id, u.nombre, u.apellidos, u.no_control_o_rfc AS no_control,
            u.correo_institucional AS correo, t.carrera, t.semestre, t.periodo_ingreso,
            t.estatus_academico, t.nivel_riesgo, t.materias_reprobadas, t.avance_reticular_pct,
            t.promedio, t.telefono,
            p.foto, to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
            date_part('year', age(p.fecha_nacimiento))::int AS edad,
            p.ciudad_natal, p.familia, p.ocupacion, p.frase,
            COALESCE(p.objetivos, '{}') AS objetivos, COALESCE(p.frustraciones, '{}') AS frustraciones,
            p.biografia, p.updated_at AS perfil_actualizado,
            ut.nombre || ' ' || ut.apellidos AS tutor_nombre,
            EXISTS (SELECT 1 FROM fichas_identificacion f WHERE f.tutorado_id = t.id) AS tiene_ficha
       FROM tutorados t
       JOIN usuarios u ON u.id = t.usuario_id
  LEFT JOIN perfiles_tutorado p ON p.tutorado_id = t.id
  LEFT JOIN asignaciones_tutoria a ON a.tutorado_id = t.id AND a.periodo_escolar = $2
                                  AND a.estatus_asignacion = 'Activa'
  LEFT JOIN tutores tu ON tu.id = a.tutor_id
  LEFT JOIN usuarios ut ON ut.id = tu.usuario_id
      WHERE t.id = $1`,
    [tutoradoId, config.periodoActual]
  );
  if (!rows[0]) throw notFound('Tutorado no encontrado');
  return rows[0];
}

/** GET /api/perfil-tutorado/mio   (alumno) */
async function miPerfil(req, res) {
  res.json({
    ok: true,
    perfil: await cargar(req.user.tutoradoId),
    opciones: { familia: FAMILIA, tope_frase: TOPE_FRASE, tope_elemento: TOPE_ELEMENTO, tope_lista: TOPE_LISTA },
  });
}

/** GET /api/perfil-tutorado/:id   (tutor de ese alumno, coordinador) */
async function verPerfil(req, res) {
  const id = v.idPositivo(req.params.id, 'id');
  if (req.user.rol === 'tutor' && !(await esTutorDe(req.user.tutorId, id))) {
    throw forbidden('Solo puedes consultar el perfil de tus tutorados.');
  }
  res.json({ ok: true, perfil: await cargar(id) });
}

const opcional = (valor, campo, max) =>
  valor === undefined || valor === null || String(valor).trim() === '' ? null : v.texto(String(valor), campo, { min: 1, max });

/** Integrantes de la familia que el tutorado puede marcar (se guardan como "Padre, Madre, …"). */
const FAMILIA = ['Padre', 'Madre', 'Hermano(s)', 'Hermana(s)', 'Abuelo(s)', 'Pareja', 'Hijo(s)', 'Otros familiares'];
const TOPE_FRASE = 100;
const TOPE_ELEMENTO = 120;
const TOPE_LISTA = 6;

function lista(valor, campo) {
  const items = (Array.isArray(valor) ? valor : []).map((x) => String(x).trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (items.length > TOPE_LISTA) throw badRequest(`Máximo ${TOPE_LISTA} ${campo}.`);
  if (items.some((x) => x.length > TOPE_ELEMENTO)) throw badRequest(`Cada uno de tus ${campo} debe tener máximo ${TOPE_ELEMENTO} caracteres.`);
  return items;
}

function familia(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const arr = Array.isArray(valor) ? valor.map(String) : String(valor).split(',').map((x) => x.trim());
  const invalidos = arr.filter((x) => x && !FAMILIA.includes(x));
  if (invalidos.length) throw badRequest(`Familia: opción no válida (${invalidos.join(', ')}).`);
  const elegidos = FAMILIA.filter((o) => arr.includes(o));
  return elegidos.length ? elegidos.join(', ') : null;
}

/** Campos que comparten el perfil y la Ficha de Identificación. */
const COMPARTIDOS = [
  { ficha: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento' },
  { ficha: 'lugar_nacimiento', etiqueta: 'Ciudad natal' },
  { ficha: 'celular1', etiqueta: 'Teléfono' },
];

function campoFicha(clave) {
  return CAMPOS_FICHA.find((c) => c.clave === clave);
}

/** Valida un dato compartido con la misma regla que la ficha. '' si viene vacío. */
function compartido(clave, crudo, etiqueta) {
  if (crudo === undefined || crudo === null || String(crudo).trim() === '') return '';
  const r = normalizar(campoFicha(clave), crudo);
  if (r.error) throw badRequest(`${etiqueta}: ${r.error}.`);
  return r.valor;
}

/**
 * PUT /api/perfil-tutorado/mio   (alumno)
 * Body: { foto?: dataURL|null, fecha_nacimiento?, ciudad_natal?, familia?: [..], ocupacion?,
 *         frase?, objetivos?: [..], frustraciones?: [..], biografia?, telefono? }
 * foto: undefined = no cambiar · null = quitar · "data:image/…" = reemplazar
 * Fecha de nacimiento, ciudad natal y teléfono son los mismos datos de la Ficha de
 * Identificación: si el tutorado ya la envió, también se actualizan ahí.
 */
async function guardar(req, res) {
  const b = req.body || {};
  const tutoradoId = req.user.tutoradoId;
  let foto;
  if (b.foto === null) foto = null;
  else if (typeof b.foto === 'string') {
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.foto)) throw badRequest('La foto debe ser una imagen JPG, PNG o WEBP.');
    if (b.foto.length > TOPE_FOTO) throw badRequest('La foto es demasiado grande; usa una imagen más pequeña.');
    foto = b.foto;
  }
  const nacimiento = compartido('fecha_nacimiento', b.fecha_nacimiento, 'Fecha de nacimiento');
  const ciudad = compartido('lugar_nacimiento', b.ciudad_natal, 'Ciudad natal');
  const telefono = compartido('celular1', b.telefono, 'Teléfono');
  const frase = opcional(b.frase, 'frase', TOPE_FRASE);

  const valores = [
    tutoradoId,
    nacimiento || null,
    ciudad || null,
    familia(b.familia),
    opcional(b.ocupacion, 'ocupacion', 120),
    frase,
    lista(b.objetivos, 'objetivos'),
    lista(b.frustraciones, 'frustraciones'),
    opcional(b.biografia, 'biografia', 1500),
  ];

  let fichaActualizada = false;
  await db.withTransaction(async (client) => {
    // Si ya hay ficha, los datos compartidos deben seguir siendo válidos ahí
    const { rows: fichas } = await client.query(
      'SELECT datos, estado FROM fichas_identificacion WHERE tutorado_id = $1 FOR UPDATE', [tutoradoId]);
    const ficha = fichas[0];
    if (ficha) {
      const nuevos = { fecha_nacimiento: nacimiento, lugar_nacimiento: ciudad, celular1: telefono };
      for (const c of COMPARTIDOS) {
        if (!nuevos[c.ficha]) throw badRequest(`${c.etiqueta}: es obligatorio porque forma parte de tu Ficha de Identificación.`);
      }
      const d = ficha.datos || {};
      if (d.celular2 && d.celular2 === telefono) throw badRequest('Teléfono: es igual al Celular 2 de tu ficha.');
      if (d.emergencia_telefono && d.emergencia_telefono === telefono) {
        throw badRequest('Teléfono: es el mismo que tu contacto de emergencia; escribe tu propio celular.');
      }
      const despues = { ...d, ...nuevos };
      const cambios = diferencias(d, despues);
      if (Object.keys(cambios).length) {
        fichaActualizada = true;
        await client.query(
          `UPDATE fichas_identificacion
              SET datos = $2::jsonb, actualizado_por = $3, actualizado_por_rol = 'alumno',
                  estado = CASE WHEN estado = 'Revisada' THEN 'Enviada' ELSE estado END
            WHERE tutorado_id = $1 RETURNING id`,
          [tutoradoId, JSON.stringify(despues), req.user.id]
        );
        await client.query(
          `INSERT INTO fichas_identificacion_historial (tutorado_id, usuario_id, rol, accion, cambios, nota)
           VALUES ($1, $2, 'alumno', 'Actualización desde perfil', $3::jsonb, NULL)`,
          [tutoradoId, req.user.id, JSON.stringify(cambios)]
        );
      }
    }
    await client.query(
      `INSERT INTO perfiles_tutorado
              (tutorado_id, fecha_nacimiento, ciudad_natal, familia, ocupacion, frase, objetivos, frustraciones, biografia)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7::text[], $8::text[], $9)
       ON CONFLICT (tutorado_id) DO UPDATE SET
              fecha_nacimiento = EXCLUDED.fecha_nacimiento, ciudad_natal = EXCLUDED.ciudad_natal,
              familia = EXCLUDED.familia, ocupacion = EXCLUDED.ocupacion, frase = EXCLUDED.frase,
              objetivos = EXCLUDED.objetivos, frustraciones = EXCLUDED.frustraciones,
              biografia = EXCLUDED.biografia
       RETURNING tutorado_id`,
      valores
    );
    if (foto !== undefined) {
      await client.query('UPDATE perfiles_tutorado SET foto = $2 WHERE tutorado_id = $1 RETURNING tutorado_id',
        [tutoradoId, foto]);
    }
    if (b.telefono !== undefined) {
      await client.query('UPDATE tutorados SET telefono = $2 WHERE id = $1 RETURNING id', [tutoradoId, telefono || null]);
    }
  });
  res.json({
    ok: true,
    mensaje: fichaActualizada
      ? 'Tu perfil se guardó y tu Ficha de Identificación se actualizó con los mismos datos.'
      : 'Tu perfil se guardó. Tu tutor podrá conocerte mejor.',
    perfil: await cargar(tutoradoId),
  });
}

/**
 * Copia a perfil y registro escolar los datos que comparten con la ficha
 * (se llama dentro de la transacción que guarda la ficha).
 */
async function sincronizarDesdeFicha(client, tutoradoId, datos) {
  await client.query(
    `INSERT INTO perfiles_tutorado (tutorado_id, fecha_nacimiento, ciudad_natal)
     VALUES ($1, NULLIF($2, '')::date, NULLIF($3, ''))
     ON CONFLICT (tutorado_id) DO UPDATE
        SET fecha_nacimiento = EXCLUDED.fecha_nacimiento, ciudad_natal = EXCLUDED.ciudad_natal
     RETURNING tutorado_id`,
    [tutoradoId, datos.fecha_nacimiento || '', datos.lugar_nacimiento || '']
  );
  if (datos.celular1) {
    await client.query('UPDATE tutorados SET telefono = $2 WHERE id = $1 RETURNING id', [tutoradoId, datos.celular1]);
  }
}

module.exports = { miPerfil, verPerfil, guardar, sincronizarDesdeFicha, FAMILIA, TOPE_FRASE, TOPE_ELEMENTO };
