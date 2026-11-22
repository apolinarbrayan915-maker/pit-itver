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
  const rows = await db.withTransaction(async (client) => {
    const r = await client.query(
      `INSERT INTO canalizaciones (tutorado_id, tutor_id, area_destino, diagnostico_inicial)
       VALUES ($1, $2, $3, $4)
    RETURNING id, tutorado_id, tutor_id, area_destino, diagnostico_inicial,
              estatus_canalizacion, fecha_registro`,
      [tutoradoId, tutorId, area, diagnostico]
    );
    await client.query(
      `INSERT INTO canalizacion_seguimientos (canalizacion_id, usuario_id, estatus_nuevo, nota)
       VALUES ($1, $2, 'Pendiente', $3)`,
      [r.rows[0].id, req.user.id, `Canalización registrada. ${diagnostico}`]
    );
    return r.rows;
  });

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
            to_char(c.proxima_revision, 'YYYY-MM-DD') AS proxima_revision,
            (SELECT max(s.fecha) FROM canalizacion_seguimientos s WHERE s.canalizacion_id = c.id) AS ultima_actualizacion,
            (SELECT count(*) FROM canalizacion_seguimientos s WHERE s.canalizacion_id = c.id)::int AS movimientos,
            ua.no_control_o_rfc AS no_control, t.semestre,
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


/** Canalización con datos del tutorado, verificando que quien consulta tenga acceso. */
async function canalizacionVisible(req, id, client = db) {
  const { rows } = await client.query(
    `SELECT c.id, c.tutorado_id, c.tutor_id, c.area_destino, c.diagnostico_inicial,
            c.estatus_canalizacion, c.seguimiento, c.fecha_registro, c.fecha_cierre,
            to_char(c.proxima_revision, 'YYYY-MM-DD') AS proxima_revision,
            ua.no_control_o_rfc AS no_control, t.semestre,
            ua.apellidos || ' ' || ua.nombre AS tutorado_nombre,
            ut.nombre || ' ' || ut.apellidos AS tutor_nombre
       FROM canalizaciones c
       JOIN tutorados t  ON t.id = c.tutorado_id
       JOIN usuarios  ua ON ua.id = t.usuario_id
       JOIN tutores   tu ON tu.id = c.tutor_id
       JOIN usuarios  ut ON ut.id = tu.usuario_id
      WHERE c.id = $1`,
    [id]
  );
  const c = rows[0];
  if (!c) throw notFound('Canalización no encontrada');
  const { rol, tutorId, tutoradoId } = req.user;
  if ((rol === 'tutor' && c.tutor_id !== tutorId) || (rol === 'alumno' && c.tutorado_id !== tutoradoId)) {
    throw forbidden('No tienes acceso a esta canalización.');
  }
  return c;
}

/**
 * GET /api/canalizaciones/:id
 * Detalle con su bitácora de seguimiento (más reciente primero).
 */
async function detalle(req, res) {
  const id = v.idPositivo(req.params.id, 'id');
  const canalizacion = await canalizacionVisible(req, id);
  const { rows } = await db.query(
    `SELECT s.id, s.estatus_anterior, s.estatus_nuevo, s.nota, s.fecha,
            u.nombre || ' ' || u.apellidos AS autor, u.rol AS autor_rol
       FROM canalizacion_seguimientos s
  LEFT JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.canalizacion_id = $1
   ORDER BY s.fecha DESC, s.id DESC`,
    [id]
  );
  res.json({ ok: true, canalizacion, seguimientos: rows });
}

const CERRADOS = ['Atendido', 'Cerrado'];

/**
 * POST /api/canalizaciones/:id/seguimiento   (tutor de la canalización o coordinador)
 * Body: { nota, estatus?, proxima_revision? ('YYYY-MM-DD' | null) }
 * Agrega una nota a la bitácora y, si se indica, cambia el estatus.
 * Atendido / Cerrado fijan la fecha de cierre; reabrir la borra.
 */
async function agregarSeguimiento(req, res) {
  const id = v.idPositivo(req.params.id, 'id');
  const nota = v.texto(req.body.nota, 'nota', { min: 3, max: 2000 });
  const estatus = req.body.estatus ? v.catalogo(req.body.estatus, 'estatus', v.ESTATUS_CANAL) : null;
  let revision;
  if (req.body.proxima_revision === undefined) revision = undefined;
  else if (!req.body.proxima_revision) revision = null;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.proxima_revision))) revision = String(req.body.proxima_revision);
  else throw badRequest('La fecha de próxima revisión no es válida.');

  const resultado = await db.withTransaction(async (client) => {
    const c = await canalizacionVisible(req, id, client);
    const anterior = c.estatus_canalizacion;
    const nuevo = estatus || anterior;
    const cierra = CERRADOS.includes(nuevo);
    if (cierra && revision) revision = null;
    const { rows } = await client.query(
      `UPDATE canalizaciones
          SET estatus_canalizacion = $2,
              seguimiento = $3,
              fecha_cierre = CASE WHEN $4 THEN COALESCE(fecha_cierre, now()) ELSE NULL END,
              proxima_revision = CASE WHEN $4 THEN NULL WHEN $5 THEN $6::date ELSE proxima_revision END
        WHERE id = $1
    RETURNING id, estatus_canalizacion, fecha_cierre, to_char(proxima_revision, 'YYYY-MM-DD') AS proxima_revision`,
      [id, nuevo, nota, cierra, revision !== undefined, revision ?? null]
    );
    await client.query(
      `INSERT INTO canalizacion_seguimientos (canalizacion_id, usuario_id, estatus_anterior, estatus_nuevo, nota)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, req.user.id, nuevo !== anterior ? anterior : null, nuevo !== anterior ? nuevo : null, nota]
    );
    return { fila: rows[0], cambio: nuevo !== anterior, nuevo };
  });

  res.status(201).json({
    ok: true,
    mensaje: resultado.cambio ? `Seguimiento guardado. Estatus: ${resultado.nuevo}.` : 'Nota de seguimiento guardada.',
    canalizacion: resultado.fila,
  });
}

module.exports = { crear, listar, detalle, agregarSeguimiento };
