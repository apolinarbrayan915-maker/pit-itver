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
            ut.nombre || ' ' || ut.apellidos AS tutor_nombre
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
  res.json({ ok: true, perfil: await cargar(req.user.tutoradoId) });
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

function lista(valor, campo) {
  const items = (Array.isArray(valor) ? valor : []).map((x) => String(x).trim()).filter(Boolean);
  if (items.length > 6) throw badRequest(`Máximo 6 elementos en "${campo}".`);
  if (items.some((x) => x.length > 160)) throw badRequest(`Cada elemento de "${campo}" debe tener máximo 160 caracteres.`);
  return items;
}

/**
 * PUT /api/perfil-tutorado/mio   (alumno)
 * Body: { foto?: dataURL|null, fecha_nacimiento?, ciudad_natal?, familia?, ocupacion?,
 *         frase?, objetivos?: [..], frustraciones?: [..], biografia?, telefono? }
 * foto: undefined = no cambiar · null = quitar · "data:image/…" = reemplazar
 */
async function guardar(req, res) {
  const b = req.body || {};
  let foto;
  if (b.foto === null) foto = null;
  else if (typeof b.foto === 'string') {
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.foto)) throw badRequest('La foto debe ser una imagen JPG, PNG o WEBP.');
    if (b.foto.length > TOPE_FOTO) throw badRequest('La foto es demasiado grande; usa una imagen más pequeña.');
    foto = b.foto;
  }
  let nacimiento = null;
  if (b.fecha_nacimiento) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha_nacimiento)) throw badRequest('Fecha de nacimiento inválida.');
    nacimiento = b.fecha_nacimiento;
  }
  const telefono = b.telefono ? String(b.telefono).replace(/\D/g, '') : null;
  if (telefono && (telefono.length < 10 || telefono.length > 15)) throw badRequest('El teléfono debe tener al menos 10 dígitos.');

  const valores = [
    req.user.tutoradoId,
    nacimiento,
    opcional(b.ciudad_natal, 'ciudad_natal', 80),
    opcional(b.familia, 'familia', 120),
    opcional(b.ocupacion, 'ocupacion', 120),
    opcional(b.frase, 'frase', 160),
    lista(b.objetivos, 'objetivos'),
    lista(b.frustraciones, 'frustraciones'),
    opcional(b.biografia, 'biografia', 1500),
  ];

  await db.withTransaction(async (client) => {
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
        [req.user.tutoradoId, foto]);
    }
    if (b.telefono !== undefined) {
      await client.query('UPDATE tutorados SET telefono = $2 WHERE id = $1 RETURNING id', [req.user.tutoradoId, telefono]);
    }
  });
  res.json({ ok: true, mensaje: 'Tu perfil se guardó. Tu tutor podrá conocerte mejor.', perfil: await cargar(req.user.tutoradoId) });
}

module.exports = { miPerfil, verPerfil, guardar };
