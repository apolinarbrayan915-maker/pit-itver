'use strict';

const db = require('../db');
const config = require('../config');
const { badRequest, forbidden, notFound, conflict } = require('../utils/errores');
const v = require('../utils/validaciones');
const { dentroDeHorario } = require('./tutores.controller');
const { diaDeClases } = require('../utils/calendarioEscolar');

// Horario de atención tutorial (hora local del ITVER)
const HORA_INICIO = 7;   // 07:00
const HORA_FIN = 20;     // la cita debe terminar a más tardar a las 20:00
const ANTICIPACION_MIN_HORAS = 2;

const SELECT_CITA = `
  SELECT c.id, c.tutor_id, c.tutorado_id, c.fecha_hora, c.duracion_min, c.tipo, c.modalidad,
         c.grupo, c.motivo, c.estatus, c.notas_tutor, c.created_at,
         to_char(c.fecha_hora AT TIME ZONE $TZ, 'YYYY-MM-DD"T"HH24:MI') AS fecha_hora_local,
         ua.no_control_o_rfc AS no_control,
         ua.apellidos || ' ' || ua.nombre AS tutorado_nombre,
         ut.nombre || ' ' || ut.apellidos AS tutor_nombre,
         tu.cubiculo AS tutor_cubiculo
    FROM citas_tutorias c
    JOIN tutores   tu ON tu.id = c.tutor_id
    JOIN usuarios  ut ON ut.id = tu.usuario_id
LEFT JOIN tutorados t ON t.id = c.tutorado_id
LEFT JOIN usuarios ua ON ua.id = t.usuario_id`;

/** Busca la asignación activa del tutorado en el periodo vigente. */
async function asignacionActiva(client, tutoradoId) {
  const { rows } = await client.query(
    `SELECT tutor_id, grupo FROM asignaciones_tutoria
      WHERE tutorado_id = $1 AND periodo_escolar = $2 AND estatus_asignacion = 'Activa'`,
    [tutoradoId, config.periodoActual]
  );
  return rows[0] || null;
}

/**
 * POST /api/citas/reservar
 * Body: {
 *   fecha_hora: "2026-10-15T10:00"   (o fecha + hora por separado),
 *   modalidad: "Presencial" | "Línea",
 *   motivo: "texto",
 *   tipo?: "Individual" | "Grupal"        (Grupal solo tutor),
 *   tutorado_id?: number                  (requerido si reserva un tutor/coordinador),
 *   grupo?: "4°B ISC"                     (para sesiones grupales),
 *   duracion_min?: 60
 * }
 */
async function reservar(req, res) {
  const { rol } = req.user;
  const body = req.body || {};

  const tipo = v.catalogo(body.tipo, 'tipo', v.TIPOS_CITA) || 'Individual';
  const modalidad = v.catalogo(body.modalidad, 'modalidad', v.MODALIDADES, v.ALIAS_MODALIDAD) || 'Presencial';
  const motivo = v.texto(body.motivo, 'motivo', { min: 5, max: 1000 });
  const duracion = body.duracion_min ? Number(body.duracion_min) : 60;
  if (!Number.isInteger(duracion) || duracion < 15 || duracion > 240) {
    throw badRequest('La duración debe estar entre 15 y 240 minutos.');
  }
  const { valor: fechaTexto, esLocal } = v.fechaHora(body);

  // Por acuerdo de la Coordinación, ya no se programan sesiones grupales (las anteriores se conservan)
  if (tipo === 'Grupal') {
    throw badRequest('Solo se pueden programar citas individuales.');
  }

  const cita = await db.withTransaction(async (client) => {
    // 1. Resolver tutor y tutorado según el rol de quien reserva
    let tutorId;
    let tutoradoId = null;
    let grupo = null;

    if (rol === 'alumno') {
      tutoradoId = req.user.tutoradoId;
      const asig = await asignacionActiva(client, tutoradoId);
      if (!asig) throw conflict('Primero elige a tu tutor en la sección "Elegir Tutor".');
      tutorId = asig.tutor_id;
    } else if (rol === 'tutor') {
      tutorId = req.user.tutorId;
      if (tipo === 'Individual') {
        tutoradoId = v.idPositivo(body.tutorado_id, 'tutorado_id');
        const asig = await asignacionActiva(client, tutoradoId);
        if (!asig || asig.tutor_id !== tutorId) {
          throw forbidden('El tutorado no está asignado a tu grupo de tutoría.');
        }
      } else {
        grupo = v.texto(body.grupo, 'grupo', { min: 2, max: 20 });
      }
    } else {
      // coordinador: agenda en nombre del tutor asignado
      tutoradoId = v.idPositivo(body.tutorado_id, 'tutorado_id');
      const asig = await asignacionActiva(client, tutoradoId);
      if (!asig) throw conflict('El tutorado no tiene tutor asignado en este periodo.');
      tutorId = asig.tutor_id;
    }

    // 2. Serializar reservas del mismo tutor para evitar carreras
    await client.query('SELECT pg_advisory_xact_lock(42, $1)', [tutorId]);

    // 3. Normalizar fecha y validar día/horario hábil en hora local
    const { rows: f } = await client.query(
      `SELECT ts,
              extract(isodow FROM ts AT TIME ZONE $2)::int AS dia,
              to_char(ts AT TIME ZONE $2, 'YYYY-MM-DD') AS ymd,
              (extract(hour FROM ts AT TIME ZONE $2) * 60
                 + extract(minute FROM ts AT TIME ZONE $2))::int AS minuto,
              ts > now() + make_interval(hours => $3) AS con_anticipacion
         FROM (SELECT CASE WHEN $4 THEN ($1::timestamp AT TIME ZONE $2)
                           ELSE $1::timestamptz END AS ts) x`,
      [fechaTexto, config.tz, ANTICIPACION_MIN_HORAS, esLocal]
    );
    const { ts, dia, ymd, minuto, con_anticipacion: conAnticipacion } = f[0];

    if (!conAnticipacion) {
      throw badRequest(`La cita debe reservarse con al menos ${ANTICIPACION_MIN_HORAS} horas de anticipación.`);
    }
    if (dia > 5) {
      throw badRequest('Las tutorías se agendan de lunes a viernes.');
    }
    // Solo días con clases según el Calendario Académico del TecNM
    const clases = diaDeClases(ymd);
    if (!clases.ok) throw badRequest(clases.motivo);
    if (minuto < HORA_INICIO * 60 || minuto + duracion > HORA_FIN * 60) {
      throw badRequest(`El horario de tutorías es de ${HORA_INICIO}:00 a ${HORA_FIN}:00 h.`);
    }
    // El alumno solo puede reservar dentro del horario de atención publicado por su tutor
    if (rol === 'alumno' && !(await dentroDeHorario(client, tutorId, ts, duracion))) {
      throw badRequest('Tu tutor no atiende en ese horario. Elige uno de los horarios disponibles.');
    }

    // 4. Verificar traslapes del tutor y del alumno
    const { rows: choque } = await client.query(
      `SELECT c.id, (c.tutor_id = $1) AS del_tutor
         FROM citas_tutorias c
        WHERE c.estatus IN ('Pendiente','Confirmada')
          AND (c.tutor_id = $1 OR ($2::int IS NOT NULL AND c.tutorado_id = $2))
          AND tstzrange(c.fecha_hora, c.fecha_hora + make_interval(mins => c.duracion_min))
              && tstzrange($3::timestamptz, $3::timestamptz + make_interval(mins => $4))
        LIMIT 1`,
      [tutorId, tutoradoId, ts, duracion]
    );
    if (choque[0]) {
      throw conflict(
        choque[0].del_tutor
          ? 'El tutor ya tiene una cita en ese horario. Elige otro.'
          : 'Ya tienes otra cita registrada en ese horario.'
      );
    }

    // 5. Registrar
    const { rows } = await client.query(
      `INSERT INTO citas_tutorias
              (tutor_id, tutorado_id, fecha_hora, duracion_min, tipo, modalidad, grupo, motivo, estatus, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        tutorId, tutoradoId, ts, duracion, tipo, modalidad, grupo, motivo,
        // Si la agenda el propio tutor queda confirmada; si la solicita el alumno, pendiente
        rol === 'tutor' ? 'Confirmada' : 'Pendiente',
        req.user.id,
      ]
    );
    const { rows: completa } = await client.query(
      `${SELECT_CITA.replaceAll('$TZ', '$2')} WHERE c.id = $1`,
      [rows[0].id, config.tz]
    );
    return completa[0];
  });

  res.status(201).json({ ok: true, mensaje: 'Cita registrada correctamente.', cita });
}

/**
 * GET /api/citas/tutor/:tutorId?desde=2026-10-01&hasta=2026-10-31&estatus=Pendiente,Confirmada
 * Agenda de un tutor. El tutor solo puede ver la suya; el coordinador, cualquiera.
 */
async function agendaTutor(req, res) {
  const tutorId = v.idPositivo(req.params.tutorId, 'tutorId');
  if (req.user.rol === 'tutor' && req.user.tutorId !== tutorId) {
    throw forbidden('Solo puedes consultar tu propia agenda.');
  }

  const fechaOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const desde = fechaOk(req.query.desde) ? req.query.desde : null;
  const hasta = fechaOk(req.query.hasta) ? req.query.hasta : null;
  const estatus = req.query.estatus
    ? String(req.query.estatus).split(',').map((e) => v.catalogo(e, 'estatus', v.ESTATUS_CITA))
    : null;

  const { rows: tutor } = await db.query(
    `SELECT tu.id, u.nombre || ' ' || u.apellidos AS nombre, tu.cubiculo
       FROM tutores tu JOIN usuarios u ON u.id = tu.usuario_id WHERE tu.id = $1`,
    [tutorId]
  );
  if (!tutor[0]) throw notFound('Tutor no encontrado');

  // Por omisión: 30 días atrás y 60 hacia adelante
  const { rows } = await db.query(
    `${SELECT_CITA.replaceAll('$TZ', '$5')}
      WHERE c.tutor_id = $1
        AND c.fecha_hora >= COALESCE(($2::date)::timestamp AT TIME ZONE $5, now() - INTERVAL '30 days')
        AND c.fecha_hora <  COALESCE((($3::date) + 1)::timestamp AT TIME ZONE $5, now() + INTERVAL '60 days')
        AND ($4::estatus_cita[] IS NULL OR c.estatus = ANY ($4::estatus_cita[]))
   ORDER BY c.fecha_hora`,
    [tutorId, desde, hasta, estatus, config.tz]
  );

  res.json({ ok: true, tutor: tutor[0], total: rows.length, citas: rows });
}

/**
 * GET /api/citas/mias  (alumno) – sus citas, próximas primero.
 */
async function misCitas(req, res) {
  const { rows } = await db.query(
    `${SELECT_CITA.replaceAll('$TZ', '$2')}
      WHERE c.tutorado_id = $1
   ORDER BY (c.estatus IN ('Pendiente','Confirmada') AND c.fecha_hora >= now()) DESC,
            CASE WHEN c.fecha_hora >= now() THEN c.fecha_hora END ASC,
            c.fecha_hora DESC
      LIMIT 20`,
    [req.user.tutoradoId, config.tz]
  );
  res.json({ ok: true, total: rows.length, citas: rows });
}

// Transiciones válidas de estatus
const TRANSICIONES = {
  Pendiente: ['Confirmada', 'Cancelada', 'Completada'],
  Confirmada: ['Completada', 'Cancelada'],
  Completada: [],
  Cancelada: [],
};

/**
 * PATCH /api/citas/:id/estatus   Body: { estatus, notas_tutor? }
 * Tutor (propias) y coordinador: cualquier transición válida.
 * Alumno: solo puede cancelar sus citas.
 */
async function cambiarEstatus(req, res) {
  const id = v.idPositivo(req.params.id, 'id');
  const nuevo = v.catalogo(req.body.estatus, 'estatus', v.ESTATUS_CITA);
  if (!nuevo) throw badRequest('Indica el nuevo estatus.');
  const notas = req.body.notas_tutor ? v.texto(req.body.notas_tutor, 'notas_tutor', { max: 2000 }) : null;

  const { rows } = await db.query('SELECT id, tutor_id, tutorado_id, estatus FROM citas_tutorias WHERE id = $1', [id]);
  const cita = rows[0];
  if (!cita) throw notFound('Cita no encontrada');

  const { rol, tutorId, tutoradoId } = req.user;
  if (rol === 'tutor' && cita.tutor_id !== tutorId) throw forbidden('La cita no pertenece a tu agenda.');
  if (rol === 'alumno') {
    if (cita.tutorado_id !== tutoradoId) throw forbidden('La cita no es tuya.');
    if (nuevo !== 'Cancelada') throw forbidden('Solo puedes cancelar tus citas.');
    if (notas) throw forbidden('Las notas solo las registra el tutor.');
  }
  if (!TRANSICIONES[cita.estatus].includes(nuevo)) {
    throw conflict(`No se puede cambiar una cita "${cita.estatus}" a "${nuevo}".`);
  }

  const { rows: act } = await db.query(
    `UPDATE citas_tutorias
        SET estatus = $2, notas_tutor = COALESCE($3, notas_tutor)
      WHERE id = $1
  RETURNING id, estatus, notas_tutor, updated_at`,
    [id, nuevo, notas]
  );
  res.json({ ok: true, mensaje: `Cita ${nuevo.toLowerCase()}.`, cita: act[0] });
}

module.exports = { reservar, agendaTutor, misCitas, cambiarEstatus };
