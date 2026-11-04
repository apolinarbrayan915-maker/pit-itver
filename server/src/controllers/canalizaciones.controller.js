'use strict';

const db = require('../db');
const config = require('../config');
const { badRequest, forbidden, conflict, notFound } = require('../utils/errores');
const v = require('../utils/validaciones');

/**
 * POST /api/canalizaciones/crear
 * Body: { tutorado_id, area_destino, diagnostico_inicial }
 *   area_destino: PALPROG | CIS | CEPC | PAPAs | Psicología/Salud
 *                 (acepta alias: "PSICOLOGIA", "PAPA's", "papas"…)
 * Tutor: solo para sus tutorados. Coordinador: queda a nombre del tutor asignado.
 */
async function crear(req, res) {
  const tutoradoId = v.idPositivo(req.body.tutorado_id, 'tutorado_id');
  const area = v.catalogo(req.body.area_destino, 'area_destino', v.AREAS, v.ALIAS_AREA);
  if (!area) throw badRequest('Indica el área de destino.');
  const diagnostico = v.texto(req.body.diagnostico_inicial, 'diagnostico_inicial', { min: 10, max: 2000 });

  const { rows: asig } = await db.query(
    `SELECT a.tutor_id, u.apellidos || ' ' || u.nombre AS tutorado_nombre
       FROM tutorados t
       JOIN usuarios u ON u.id = t.usuario_id
  LEFT JOIN asignaciones_tutoria a ON a.tutorado_id = t.id
                                  AND a.periodo_escolar = $2
                                  AND a.estatus_asignacion = 'Activa'
      WHERE t.id = $1`,
    [tutoradoId, config.periodoActual]
  );
  if (!asig[0]) throw notFound('Tutorado no encontrado');
  const { tutor_id: tutorAsignado, tutorado_nombre: nombre } = asig[0];

  let tutorId;
  if (req.user.rol === 'tutor') {
    if (tutorAsignado !== req.user.tutorId) {
      throw forbidden('Solo puedes canalizar a tutorados de tu grupo.');
    }
    tutorId = req.user.tutorId;
  } else {
    if (!tutorAsignado) throw conflict('El tutorado no tiene tutor asignado en este periodo.');
    tutorId = tutorAsignado;
  }

  // El índice parcial ux_canal_abierta_por_area evita duplicados abiertos (→ 409)
  const { rows } = await db.query(
    `INSERT INTO canalizaciones (tutorado_id, tutor_id, area_destino, diagnostico_inicial)
     VALUES ($1, $2, $3, $4)
  RETURNING id, tutorado_id, tutor_id, area_destino, diagnostico_inicial,
            estatus_canalizacion, fecha_registro`,
    [tutoradoId, tutorId, area, diagnostico]
  );

  res.status(201).json({
    ok: true,
    mensaje: `${nombre} fue canalizado(a) a ${area}.`,
    canalizacion: rows[0],
  });
}

/**
 * GET /api/canalizaciones?estatus=Pendiente,En Proceso&area=PALPROG
 * Coordinador: todas. Tutor: las de sus tutorados. Alumno: las propias.
 */
async function listar(req, res) {
  const { rol, tutorId, tutoradoId } = req.user;
  const estatus = req.query.estatus
    ? String(req.query.estatus).split(',').map((e) => v.catalogo(e, 'estatus', v.ESTATUS_CANAL))
    : null;
  const area = v.catalogo(req.query.area, 'area', v.AREAS, v.ALIAS_AREA);

  const { rows } = await db.query(
    `SELECT c.id, c.tutorado_id, c.tutor_id, c.area_destino, c.diagnostico_inicial,
            c.estatus_canalizacion, c.seguimiento, c.fecha_registro, c.fecha_cierre,
            ua.no_control_o_rfc AS no_control,
            ua.apellidos || ' ' || ua.nombre AS tutorado_nombre,
            ut.nombre || ' ' || ut.apellidos AS tutor_nombre
       FROM canalizaciones c
       JOIN tutorados t  ON t.id = c.tutorado_id
       JOIN usuarios  ua ON ua.id = t.usuario_id
       JOIN tutores   tu ON tu.id = c.tutor_id
       JOIN usuarios  ut ON ut.id = tu.usuario_id
      WHERE ($1::int IS NULL OR c.tutor_id = $1)
        AND ($2::int IS NULL OR c.tutorado_id = $2)
        AND ($3::estatus_canalizacion[] IS NULL OR c.estatus_canalizacion = ANY ($3::estatus_canalizacion[]))
        AND ($4::area_canalizacion IS NULL OR c.area_destino = $4)
   ORDER BY c.fecha_registro DESC`,
    [
      rol === 'tutor' ? tutorId : null,
      rol === 'alumno' ? tutoradoId : null,
      estatus,
      area,
    ]
  );
  res.json({ ok: true, total: rows.length, canalizaciones: rows });
}

module.exports = { crear, listar };
