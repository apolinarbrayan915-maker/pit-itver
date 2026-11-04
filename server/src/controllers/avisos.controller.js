'use strict';

/**
 * Avisos de la Coordinación de Tutorías.
 * - Coordinador: crea, edita, publica, archiva y elimina.
 * - Tutor: solo lee los avisos PUBLICADOS.
 * - Alumno: sin acceso (ver routes.js).
 */
const db = require('../db');
const { badRequest, notFound } = require('../utils/errores');
const v = require('../utils/validaciones');

const ESTADOS = ['Borrador', 'Publicado', 'Archivado'];

const SELECT = `
  SELECT a.id, a.titulo, a.categoria, a.contenido, a.importante, a.estado,
         a.fecha_publicacion, a.created_at, a.updated_at,
         u.nombre || ' ' || u.apellidos AS autor
    FROM avisos a
LEFT JOIN usuarios u ON u.id = a.autor_id`;

function leerCuerpo(body, parcial = false) {
  const datos = {};
  if (!parcial || body.titulo !== undefined) datos.titulo = v.texto(body.titulo, 'titulo', { min: 5, max: 150 });
  if (!parcial || body.contenido !== undefined) datos.contenido = v.texto(body.contenido, 'contenido', { min: 10, max: 4000 });
  if (body.categoria !== undefined && body.categoria !== '') datos.categoria = v.texto(body.categoria, 'categoria', { min: 2, max: 40 });
  if (body.importante !== undefined) datos.importante = Boolean(body.importante);
  if (body.estado !== undefined) {
    datos.estado = v.catalogo(body.estado, 'estado', ESTADOS);
    if (!datos.estado) throw badRequest('Estado inválido.');
  }
  return datos;
}

/**
 * GET /api/avisos
 * Tutor: publicados (importantes primero). Coordinador: todos, o ?estado=Publicado
 */
async function listar(req, res) {
  const esCoord = req.user.rol === 'coordinador';
  const estado = esCoord ? v.catalogo(req.query.estado, 'estado', ESTADOS) : 'Publicado';
  const { rows } = await db.query(
    `${SELECT}
      WHERE ($1::text IS NULL OR a.estado = $1)
   ORDER BY CASE a.estado WHEN 'Borrador' THEN 0 WHEN 'Publicado' THEN 1 ELSE 2 END,
            ${esCoord ? '' : 'a.importante DESC,'}
            COALESCE(a.fecha_publicacion, a.updated_at) DESC`,
    [estado]
  );
  res.json({ ok: true, total: rows.length, avisos: rows });
}

/**
 * POST /api/avisos   (coordinador)
 * Body: { titulo, contenido, categoria?, importante?, estado?: 'Borrador'|'Publicado' }
 */
async function crear(req, res) {
  const d = leerCuerpo(req.body);
  const estado = d.estado || 'Borrador';
  const { rows } = await db.query(
    `INSERT INTO avisos (titulo, categoria, contenido, importante, estado, autor_id, fecha_publicacion)
     VALUES ($1, COALESCE($2::varchar, 'Coordinación de Tutorías'), $3, COALESCE($4::boolean, false), $5::varchar, $6,
             CASE WHEN $5::varchar = 'Borrador' THEN NULL ELSE now() END)
     RETURNING id`,
    [d.titulo, d.categoria ?? null, d.contenido, d.importante ?? null, estado, req.user.id]
  );
  const { rows: aviso } = await db.query(`${SELECT} WHERE a.id = $1`, [rows[0].id]);
  res.status(201).json({
    ok: true,
    mensaje: estado === 'Publicado' ? 'Aviso publicado: ya lo pueden ver los tutores.' : 'Aviso guardado como borrador.',
    aviso: aviso[0],
  });
}

/**
 * PATCH /api/avisos/:id   (coordinador)
 * Edita campos y/o cambia el estado (publicar, archivar, regresar a borrador).
 */
async function actualizar(req, res) {
  const id = v.idPositivo(req.params.id, 'id');
  const d = leerCuerpo(req.body, true);
  if (!Object.keys(d).length) throw badRequest('No hay cambios que guardar.');

  const { rows } = await db.query(
    `UPDATE avisos SET
        titulo     = COALESCE($2::varchar, titulo),
        categoria  = COALESCE($3::varchar, categoria),
        contenido  = COALESCE($4::text, contenido),
        importante = COALESCE($5::boolean, importante),
        estado     = COALESCE($6::varchar, estado),
        -- Al publicar por primera vez (o republicar desde borrador) se fecha la publicación
        fecha_publicacion = CASE
            WHEN $6::varchar = 'Publicado' AND estado <> 'Publicado' THEN now()
            WHEN $6::varchar = 'Borrador' THEN NULL
            ELSE fecha_publicacion END
      WHERE id = $1
  RETURNING id`,
    [id, d.titulo ?? null, d.categoria ?? null, d.contenido ?? null, d.importante ?? null, d.estado ?? null]
  );
  if (!rows[0]) throw notFound('Aviso no encontrado');
  const { rows: aviso } = await db.query(`${SELECT} WHERE a.id = $1`, [id]);
  const mensajes = { Publicado: 'Aviso publicado.', Archivado: 'Aviso archivado: ya no lo verán los tutores.', Borrador: 'Aviso regresado a borrador.' };
  res.json({ ok: true, mensaje: mensajes[d.estado] || 'Aviso actualizado.', aviso: aviso[0] });
}

/** DELETE /api/avisos/:id   (coordinador) */
async function eliminar(req, res) {
  const id = v.idPositivo(req.params.id, 'id');
  const { rows } = await db.query('DELETE FROM avisos WHERE id = $1 RETURNING id', [id]);
  if (!rows[0]) throw notFound('Aviso no encontrado');
  res.json({ ok: true, mensaje: 'Aviso eliminado.' });
}

module.exports = { listar, crear, actualizar, eliminar };
