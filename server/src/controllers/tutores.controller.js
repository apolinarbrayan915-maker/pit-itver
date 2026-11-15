'use strict';

/**
 * Tutores: directorio para que el tutorado ELIJA a su tutor, disponibilidad de
 * horarios para reservar, perfil público del tutor y control de cupo (coordinación).
 */
const db = require('../db');
const config = require('../config');
const { badRequest, notFound, conflict } = require('../utils/errores');
const v = require('../utils/validaciones');
const { diaDeClases, ventanaCambioTutor } = require('../utils/calendarioEscolar');

const hoyYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: config.tz }).format(new Date());
/** Ventana de cambio de tutor; CAMBIO_TUTOR_ABIERTO=1 la abre siempre (pruebas). */
const ventanaActual = () => {
  const w = ventanaCambioTutor(hoyYmd());
  return process.env.CAMBIO_TUTOR_ABIERTO === '1' ? { ...w, abierta: true } : w;
};

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const SELECT_TUTORES = `
  SELECT tu.id AS tutor_id,
         u.nombre || ' ' || u.apellidos AS nombre,
         u.correo_institucional AS correo,
         tu.departamento, tu.cubiculo, tu.formacion_tutorial,
         tu.presentacion, tu.areas_apoyo, tu.max_tutorados, tu.acepta_tutorados,
         tu.foto, tu.grado_academico, tu.especialidad, tu.anios_experiencia, tu.frase, tu.enfoque,
         (SELECT count(*) FROM asignaciones_tutoria a
           WHERE a.tutor_id = tu.id AND a.periodo_escolar = $1 AND a.estatus_asignacion = 'Activa')::int AS tutorados,
         COALESCE((SELECT json_agg(json_build_object(
                     'dia_semana', h.dia_semana,
                     'hora_inicio', to_char(h.hora_inicio, 'HH24:MI'),
                     'hora_fin', to_char(h.hora_fin, 'HH24:MI'))
                   ORDER BY h.dia_semana, h.hora_inicio)
                     FROM tutor_horarios h WHERE h.tutor_id = tu.id), '[]') AS horarios
    FROM tutores tu
    JOIN usuarios u ON u.id = tu.usuario_id AND u.estado = 'activo'`;

function completar(t, miTutorId) {
  const lugares = Math.max(0, t.max_tutorados - t.tutorados);
  return {
    ...t,
    lugares_disponibles: lugares,
    disponible: t.acepta_tutorados && lugares > 0,
    es_mi_tutor: miTutorId === t.tutor_id,
    horarios: t.horarios.map((h) => ({ ...h, dia: DIAS[h.dia_semana] })),
  };
}

async function tutorActualDe(client, tutoradoId) {
  const { rows } = await client.query(
    `SELECT id, tutor_id FROM asignaciones_tutoria
      WHERE tutorado_id = $1 AND periodo_escolar = $2 AND estatus_asignacion = 'Activa'`,
    [tutoradoId, config.periodoActual]
  );
  return rows[0] || null;
}

/**
 * GET /api/tutores/disponibles   (alumno, coordinador)
 * Directorio de tutores con presentación, áreas, horario y lugares libres.
 */
async function directorio(req, res) {
  const { rows } = await db.query(`${SELECT_TUTORES} ORDER BY u.apellidos`, [config.periodoActual]);
  const actual = req.user.rol === 'alumno' ? await tutorActualDe(db, req.user.tutoradoId) : null;
  const tutores = rows.map((t) => completar(t, actual?.tutor_id));
  // El tutor actual primero, luego los que tienen lugar
  tutores.sort((a, b) => (b.es_mi_tutor - a.es_mi_tutor) || (b.disponible - a.disponible));
  res.json({ ok: true, periodo: config.periodoActual, mi_tutor_id: actual?.tutor_id || null, ventana_cambio: ventanaActual(), tutores });
}

/**
 * POST /api/tutores/elegir   (alumno)   Body: { tutor_id }
 * El tutorado elige (o cambia) a su tutor en el periodo vigente.
 */
async function elegir(req, res) {
  const tutorId = v.idPositivo(req.body.tutor_id, 'tutor_id');
  const tutoradoId = req.user.tutoradoId;
  const periodo = config.periodoActual;

  const resultado = await db.withTransaction(async (client) => {
    // Bloquea al tutor elegido para evitar que dos alumnos tomen el último lugar
    const { rows: t } = await client.query(
      `SELECT tu.id, tu.max_tutorados, tu.acepta_tutorados, u.nombre || ' ' || u.apellidos AS nombre
         FROM tutores tu JOIN usuarios u ON u.id = tu.usuario_id AND u.estado = 'activo'
        WHERE tu.id = $1 FOR UPDATE OF tu`,
      [tutorId]
    );
    if (!t[0]) throw notFound('Tutor no encontrado.');
    if (!t[0].acepta_tutorados) throw conflict(`${t[0].nombre} no está recibiendo nuevos tutorados en este periodo.`);

    const actual = await tutorActualDe(client, tutoradoId);
    if (actual?.tutor_id === tutorId) throw conflict(`${t[0].nombre} ya es tu tutor(a).`);
    // Con tutor asignado, el cambio se solicita y lo aprueba la coordinación
    if (actual) throw conflict('Ya tienes tutor. Para cambiarlo envía una solicitud de cambio a la coordinación.');

    const { rows: ocupados } = await client.query(
      `SELECT count(*)::int AS n FROM asignaciones_tutoria
        WHERE tutor_id = $1 AND periodo_escolar = $2 AND estatus_asignacion = 'Activa'`,
      [tutorId, periodo]
    );
    if (ocupados[0].n >= t[0].max_tutorados) {
      throw conflict(`${t[0].nombre} ya no tiene lugares disponibles. Elige otro tutor.`);
    }

    if (actual) {
      const { rows: vigentes } = await client.query(
        `SELECT count(*)::int AS n FROM citas_tutorias
          WHERE tutorado_id = $1 AND tutor_id = $2
            AND estatus IN ('Pendiente','Confirmada') AND fecha_hora >= now()`,
        [tutoradoId, actual.tutor_id]
      );
      if (vigentes[0].n > 0) {
        throw conflict(`Tienes ${vigentes[0].n} cita(s) vigente(s) con tu tutor actual. Cancélalas antes de cambiar de tutor.`);
      }
      await client.query(`UPDATE asignaciones_tutoria SET estatus_asignacion = 'Reasignada' WHERE id = $1`, [actual.id]);
    }

    await client.query(
      `INSERT INTO asignaciones_tutoria (tutor_id, tutorado_id, periodo_escolar, origen)
       VALUES ($1, $2, $3, 'Elección del tutorado')`,
      [tutorId, tutoradoId, periodo]
    );
    return { nombre: t[0].nombre, cambio: Boolean(actual) };
  });

  res.status(201).json({
    ok: true,
    mensaje: resultado.cambio
      ? `Cambiaste de tutor. Ahora tu tutor(a) es ${resultado.nombre}.`
      : `¡Listo! ${resultado.nombre} es ahora tu tutor(a). Ya puedes agendar una cita.`,
    tutor_id: tutorId,
  });
}

/**
 * GET /api/tutores/:id/disponibilidad?fecha=2026-10-19
 * Bloques de 60 min dentro del horario del tutor, marcando los ocupados.
 */
async function disponibilidad(req, res) {
  const tutorId = v.idPositivo(req.params.id, 'id');
  const fecha = String(req.query.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw badRequest('Indica la fecha con formato AAAA-MM-DD.');
  const clases = diaDeClases(fecha);
  if (!clases.ok) {
    return res.json({ ok: true, fecha, tiene_horario: true, sin_clases: true, motivo: clases.motivo, bloques: [] });
  }

  const { rows: horario } = await db.query('SELECT count(*)::int AS n FROM tutor_horarios WHERE tutor_id = $1', [tutorId]);
  // El propio tutor puede ver toda la jornada (07:00–20:00) para programar citas fuera de su horario publicado
  const completo = req.query.completo === '1' && req.user?.rol === 'tutor' && req.user.tutorId === tutorId;
  const { rows } = await db.query(
    `WITH h AS (
        SELECT hora_inicio, hora_fin FROM tutor_horarios
         WHERE tutor_id = $1 AND dia_semana = extract(isodow FROM $2::date)
     ),
     bloques AS (
        SELECT s AS local
          FROM h, generate_series($2::date + h.hora_inicio,
                                  $2::date + h.hora_fin - INTERVAL '60 minutes',
                                  INTERVAL '60 minutes') AS s
         WHERE NOT $4
        UNION
        SELECT s FROM generate_series($2::date + TIME '07:00', $2::date + TIME '19:00', INTERVAL '60 minutes') AS s
         WHERE $4
     )
     SELECT to_char(b.local, 'HH24:MI') AS hora,
            NOT EXISTS (
              SELECT 1 FROM citas_tutorias c
               WHERE c.tutor_id = $1 AND c.estatus IN ('Pendiente','Confirmada')
                 AND tstzrange(c.fecha_hora, c.fecha_hora + make_interval(mins => c.duracion_min))
                     && tstzrange(b.local AT TIME ZONE $3, (b.local + INTERVAL '60 minutes') AT TIME ZONE $3)
            ) AS libre,
            (b.local AT TIME ZONE $3) > now() + INTERVAL '2 hours' AS a_tiempo,
            EXISTS (SELECT 1 FROM h WHERE b.local::time >= h.hora_inicio AND b.local::time + INTERVAL '60 minutes' <= h.hora_fin) AS en_horario
       FROM bloques b
   ORDER BY b.local`,
    [tutorId, fecha, config.tz, completo]
  );
  res.json({
    ok: true,
    fecha,
    tiene_horario: horario[0].n > 0,
    bloques: rows.map((r) => ({
      hora: r.hora,
      disponible: r.libre && r.a_tiempo,
      en_horario: r.en_horario,
      motivo: !r.a_tiempo ? 'pasado' : !r.libre ? 'ocupado' : null,
    })),
  });
}

/** Periodo de clases vigente (o el último que ya inició) según el calendario escolar. */
function periodoDeClases(hoy) {
  const { CALENDARIO } = require('../utils/calendarioEscolar');
  const iniciados = CALENDARIO.periodos.filter((p) => p.inicio <= hoy);
  return iniciados[iniciados.length - 1] || CALENDARIO.periodos[0];
}

/**
 * GET /api/tutores/mi-reporte   (tutor)
 * Resumen del semestre para el Reporte Semestral del Tutor.
 */
async function miReporte(req, res) {
  const tutorId = req.user.tutorId;
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: config.tz }).format(new Date());
  const periodo = periodoDeClases(hoy);
  const params = [tutorId, periodo.inicio, periodo.fin, config.tz, config.periodoActual];
  const { rows: r } = await db.query(
    `WITH c AS (
        SELECT * FROM citas_tutorias
         WHERE tutor_id = $1
           AND (fecha_hora AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
     ),
     asig AS (
        SELECT t.nivel_riesgo FROM asignaciones_tutoria a JOIN tutorados t ON t.id = a.tutorado_id
         WHERE a.tutor_id = $1 AND a.periodo_escolar = $5 AND a.estatus_asignacion = 'Activa'
     )
     SELECT (SELECT count(*) FROM asig)::int AS tutorados,
            (SELECT COALESCE(sum(duracion_real_min), 0) FROM c WHERE estatus = 'Completada')::int AS minutos,
            (SELECT count(*) FROM asig WHERE nivel_riesgo IN ('ALTO','CRÍTICO'))::int AS en_riesgo,
            (SELECT count(*) FROM c WHERE estatus = 'Completada')::int AS atendidas,
            (SELECT count(*) FROM c WHERE estatus = 'Completada' AND tipo = 'Individual')::int AS individuales,
            (SELECT count(*) FROM c WHERE estatus = 'Completada' AND tipo = 'Grupal')::int AS grupales,
            (SELECT count(*) FROM c WHERE estatus IN ('Pendiente','Confirmada'))::int AS programadas,
            (SELECT count(*) FROM c WHERE estatus = 'Cancelada')::int AS canceladas,
            (SELECT count(*) FROM c WHERE minuta IS NOT NULL)::int AS minutas,
            (SELECT count(DISTINCT tutorado_id) FROM c WHERE estatus = 'Completada' AND tutorado_id IS NOT NULL)::int AS tutorados_atendidos,
            (SELECT count(*) FROM canalizaciones k WHERE k.tutor_id = $1
               AND (k.fecha_registro AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date)::int AS canalizaciones`,
    params
  );
  const { rows: sesiones } = await db.query(
    `SELECT c.id, to_char(c.fecha_hora AT TIME ZONE $4, 'YYYY-MM-DD"T"HH24:MI') AS fecha_hora_local,
            c.tipo, c.modalidad, c.motivo, c.grupo, (c.minuta IS NOT NULL) AS con_minuta, c.duracion_real_min,
            ua.apellidos || ' ' || ua.nombre AS tutorado_nombre, ua.no_control_o_rfc AS no_control
       FROM citas_tutorias c
  LEFT JOIN tutorados t ON t.id = c.tutorado_id
  LEFT JOIN usuarios ua ON ua.id = t.usuario_id
      WHERE c.tutor_id = $1 AND c.estatus = 'Completada'
        AND (c.fecha_hora AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
   ORDER BY c.fecha_hora DESC`,
    params.slice(0, 4)
  );
  const { rows: canal } = await db.query(
    `SELECT area_destino AS area, count(*)::int AS total FROM canalizaciones
      WHERE tutor_id = $1 AND (fecha_registro AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
   GROUP BY 1 ORDER BY 2 DESC`,
    params.slice(0, 4)
  );
  const { rows: t } = await db.query(
    `SELECT u.nombre || ' ' || u.apellidos AS nombre, tu.departamento FROM tutores tu JOIN usuarios u ON u.id = tu.usuario_id WHERE tu.id = $1`,
    [tutorId]
  );
  // Informe del periodo para la Coordinación
  const { rows: inf } = await db.query(
    `WITH c AS (
        SELECT * FROM citas_tutorias
         WHERE tutor_id = $1 AND (fecha_hora AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
     )
     SELECT
       (SELECT count(*) FROM c)::int AS total,
       (SELECT count(*) FROM c WHERE estatus = 'Pendiente')::int AS pendientes,
       (SELECT count(*) FROM c WHERE estatus = 'Confirmada')::int AS confirmadas,
       (SELECT count(*) FROM c WHERE estatus = 'Completada')::int AS atendidas,
       (SELECT count(*) FROM c WHERE asistio = false)::int AS inasistencias,
       (SELECT count(*) FROM c WHERE estatus = 'Cancelada' AND asistio IS NULL)::int AS canceladas,
       (SELECT count(*) FROM c WHERE estatus = 'Confirmada' AND fecha_hora < now())::int AS sin_confirmar,
       (SELECT COALESCE(sum(duracion_real_min), 0) FROM c WHERE estatus = 'Completada')::int AS minutos,
       (SELECT count(*) FROM c WHERE estatus = 'Completada' AND modalidad = 'Presencial')::int AS presenciales,
       (SELECT count(*) FROM c WHERE estatus = 'Completada' AND modalidad = 'Línea')::int AS en_linea,
       (SELECT count(*) FROM c WHERE minuta IS NOT NULL)::int AS minutas,
       (SELECT count(*) FROM c WHERE estatus = 'Completada' AND minuta IS NULL AND tipo = 'Individual')::int AS sin_minuta,
       (SELECT count(*) FROM c WHERE (minuta->>'seguimiento') IS NOT NULL)::int AS con_seguimiento,
       (SELECT count(*) FROM c WHERE creado_por IN (SELECT usuario_id FROM tutores WHERE id = $1))::int AS agendadas_tutor`,
    params.slice(0, 4)
  );
  const { rows: porTutorado } = await db.query(
    `SELECT t.id, ua.apellidos || ' ' || ua.nombre AS nombre, ua.no_control_o_rfc AS no_control, t.semestre,
            t.nivel_riesgo, t.promedio, t.materias_reprobadas,
            (SELECT count(*) FROM citas_tutorias c WHERE c.tutorado_id = t.id AND c.tutor_id = $1 AND c.estatus = 'Completada'
               AND (c.fecha_hora AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date)::int AS sesiones,
            (SELECT COALESCE(sum(c.duracion_real_min), 0) FROM citas_tutorias c WHERE c.tutorado_id = t.id AND c.tutor_id = $1 AND c.estatus = 'Completada'
               AND (c.fecha_hora AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date)::int AS minutos,
            (SELECT count(*) FROM citas_tutorias c WHERE c.tutorado_id = t.id AND c.tutor_id = $1 AND c.asistio = false
               AND (c.fecha_hora AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date)::int AS inasistencias,
            (SELECT to_char(max(c.fecha_hora) AT TIME ZONE $4, 'YYYY-MM-DD') FROM citas_tutorias c
              WHERE c.tutorado_id = t.id AND c.tutor_id = $1 AND c.estatus = 'Completada') AS ultima_sesion,
            (SELECT count(*) FROM canalizaciones k WHERE k.tutorado_id = t.id AND k.tutor_id = $1)::int AS canalizaciones,
            EXISTS (SELECT 1 FROM fichas_identificacion f WHERE f.tutorado_id = t.id) AS con_ficha
       FROM asignaciones_tutoria a
       JOIN tutorados t ON t.id = a.tutorado_id
       JOIN usuarios ua ON ua.id = t.usuario_id
      WHERE a.tutor_id = $1 AND a.periodo_escolar = $5 AND a.estatus_asignacion = 'Activa'
   ORDER BY array_position(ARRAY['CRÍTICO','ALTO','MEDIO','BAJO']::nivel_riesgo[], t.nivel_riesgo), nombre`,
    params
  );
  const { rows: canalEstatus } = await db.query(
    `SELECT estatus_canalizacion AS estatus, count(*)::int AS total FROM canalizaciones
      WHERE tutor_id = $1 AND (fecha_registro AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
   GROUP BY 1 ORDER BY 1`,
    params.slice(0, 4)
  );
  const { rows: ev } = await db.query(
    'SELECT fecha_envio FROM evaluaciones_tutor WHERE tutor_id = $1 AND periodo = $2', [tutorId, config.periodoActual]);
  const riesgo = { BAJO: 0, MEDIO: 0, ALTO: 0, 'CRÍTICO': 0 };
  porTutorado.forEach((x) => { riesgo[x.nivel_riesgo] += 1; });
  res.json({
    ok: true, periodo, periodo_escolar: config.periodoActual, tutor: t[0], resumen: r[0], sesiones,
    canalizaciones_por_area: canal,
    informe: {
      citas: inf[0],
      tutorados: porTutorado,
      riesgo,
      canalizaciones_por_estatus: canalEstatus,
      evaluacion_pit: ev[0] ? { enviada: true, fecha: ev[0].fecha_envio } : { enviada: false },
    },
  });
}

/** GET /api/tutores/mi-perfil   (tutor) */
async function miPerfil(req, res) {
  const { rows } = await db.query(`${SELECT_TUTORES} WHERE tu.id = $2`, [config.periodoActual, req.user.tutorId]);
  if (!rows[0]) throw notFound('Perfil de tutor no encontrado');
  res.json({ ok: true, tutor: completar(rows[0], null) });
}

const opcional = (valor, campo, max) =>
  valor === undefined || valor === null || String(valor).trim() === '' ? null : v.texto(String(valor), campo, { min: 1, max });

/**
 * PUT /api/tutores/mi-perfil   (tutor)
 * Body: { presentacion, areas_apoyo: [..], horarios: [{dia_semana, hora_inicio, hora_fin}],
 *         foto?: dataURL|null, grado_academico?, especialidad?, anios_experiencia?, frase?, enfoque?: [..] }
 * foto: undefined = no cambiar · null = quitar · "data:image/…" = reemplazar
 */
async function guardarMiPerfil(req, res) {
  const presentacion = req.body.presentacion ? v.texto(req.body.presentacion, 'presentacion', { min: 1, max: 1500 }) : null;
  const grado = opcional(req.body.grado_academico, 'grado_academico', 120);
  const especialidad = opcional(req.body.especialidad, 'especialidad', 120);
  const frase = opcional(req.body.frase, 'frase', 160);
  let anios = null;
  if (req.body.anios_experiencia !== undefined && req.body.anios_experiencia !== null && req.body.anios_experiencia !== '') {
    anios = Number(req.body.anios_experiencia);
    if (!Number.isInteger(anios) || anios < 0 || anios > 60) throw badRequest('Los años de experiencia deben ser un entero entre 0 y 60.');
  }
  const enfoque = (Array.isArray(req.body.enfoque) ? req.body.enfoque : []).map((x) => String(x).trim()).filter(Boolean);
  if (enfoque.length > 6 || enfoque.some((x) => x.length > 160)) throw badRequest('Máximo 6 elementos en "¿En qué puedo apoyarte?" (160 caracteres c/u).');
  let foto;
  if (req.body.foto === null) foto = null;
  else if (typeof req.body.foto === 'string') {
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(req.body.foto)) throw badRequest('La foto debe ser una imagen JPG, PNG o WEBP.');
    if (req.body.foto.length > 400000) throw badRequest('La foto es demasiado grande; usa una imagen más pequeña.');
    foto = req.body.foto;
  }
  const areas = [...new Set((Array.isArray(req.body.areas_apoyo) ? req.body.areas_apoyo : [])
    .map((a) => String(a).trim()).filter(Boolean))];
  if (areas.length > 8 || areas.some((a) => a.length > 40)) throw badRequest('Máximo 8 áreas de apoyo de hasta 40 caracteres.');

  const horarios = Array.isArray(req.body.horarios) ? req.body.horarios : [];
  if (horarios.length > 65) throw badRequest('Demasiados bloques de horario.');
  const limpios = horarios.map((h, i) => {
    const dia = Number(h.dia_semana);
    if (!Number.isInteger(dia) || dia < 1 || dia > 5) throw badRequest(`Bloque ${i + 1}: el día debe ser de lunes a viernes.`);
    if (!HORA.test(h.hora_inicio) || !HORA.test(h.hora_fin) || h.hora_fin <= h.hora_inicio) {
      throw badRequest(`Bloque ${i + 1}: la hora final debe ser posterior a la inicial.`);
    }
    if (h.hora_inicio < '07:00' || h.hora_fin > '20:00') throw badRequest(`Bloque ${i + 1}: el horario debe estar entre 07:00 y 20:00.`);
    return { dia, ini: h.hora_inicio, fin: h.hora_fin };
  });
  // Sin traslapes dentro del mismo día
  limpios.forEach((a, i) => limpios.forEach((b, j) => {
    if (i < j && a.dia === b.dia && a.ini < b.fin && b.ini < a.fin) {
      throw badRequest(`Los bloques del ${DIAS[a.dia]} ${a.ini}–${a.fin} y ${b.ini}–${b.fin} se traslapan.`);
    }
  }));

  await db.withTransaction(async (client) => {
    await client.query(
      `UPDATE tutores SET presentacion = $2, areas_apoyo = $3, grado_academico = $4, especialidad = $5,
              anios_experiencia = $6::smallint, frase = $7, enfoque = $8::text[]
        WHERE id = $1 RETURNING id`,
      [req.user.tutorId, presentacion, areas, grado, especialidad, anios, frase, enfoque]);
    if (foto !== undefined) {
      await client.query('UPDATE tutores SET foto = $2 WHERE id = $1 RETURNING id', [req.user.tutorId, foto]);
    }
    await client.query('DELETE FROM tutor_horarios WHERE tutor_id = $1', [req.user.tutorId]);
    for (const h of limpios) {
      await client.query(
        'INSERT INTO tutor_horarios (tutor_id, dia_semana, hora_inicio, hora_fin) VALUES ($1, $2, $3, $4)',
        [req.user.tutorId, h.dia, h.ini, h.fin]
      );
    }
  });
  const { rows } = await db.query(`${SELECT_TUTORES} WHERE tu.id = $2`, [config.periodoActual, req.user.tutorId]);
  res.json({ ok: true, mensaje: 'Tu perfil y horario de atención se actualizaron. Los tutorados ya los pueden consultar.', tutor: completar(rows[0], null) });
}

/**
 * PATCH /api/tutores/:id   (coordinador)
 * Body: { max_tutorados?, acepta_tutorados? }
 */
async function actualizarCupo(req, res) {
  const tutorId = v.idPositivo(req.params.id, 'id');
  const { rows: t } = await db.query(
    `SELECT (SELECT count(*) FROM asignaciones_tutoria a
              WHERE a.tutor_id = tu.id AND a.periodo_escolar = $2 AND a.estatus_asignacion = 'Activa')::int AS n
       FROM tutores tu WHERE tu.id = $1`,
    [tutorId, config.periodoActual]
  );
  if (!t[0]) throw notFound('Tutor no encontrado');

  let max = null;
  if (req.body.max_tutorados !== undefined) {
    max = Number(req.body.max_tutorados);
    if (!Number.isInteger(max) || max < 1 || max > 60) throw badRequest('El cupo debe ser un entero entre 1 y 60.');
    if (max < t[0].n) throw conflict(`El tutor ya tiene ${t[0].n} tutorados; el cupo no puede ser menor.`);
  }
  const acepta = req.body.acepta_tutorados === undefined ? null : Boolean(req.body.acepta_tutorados);
  if (max === null && acepta === null) throw badRequest('No hay cambios que guardar.');

  await db.query(
    `UPDATE tutores SET max_tutorados = COALESCE($2::smallint, max_tutorados),
                        acepta_tutorados = COALESCE($3::boolean, acepta_tutorados)
      WHERE id = $1`,
    [tutorId, max, acepta]
  );
  res.json({ ok: true, mensaje: 'Disponibilidad del tutor actualizada.' });
}

/**
 * Valida (para reservas del alumno) que la cita caiga dentro del horario del tutor.
 * Si el tutor no ha registrado horario, no se restringe.
 */
async function dentroDeHorario(client, tutorId, ts, duracionMin) {
  const { rows } = await client.query(
    `SELECT NOT EXISTS (SELECT 1 FROM tutor_horarios WHERE tutor_id = $1)
            OR EXISTS (
              SELECT 1 FROM tutor_horarios h
               WHERE h.tutor_id = $1
                 AND h.dia_semana = extract(isodow FROM $2::timestamptz AT TIME ZONE $4)
                 AND ($2::timestamptz AT TIME ZONE $4)::time >= h.hora_inicio
                 AND (($2::timestamptz AT TIME ZONE $4) + make_interval(mins => $3))::time <= h.hora_fin
            ) AS ok`,
    [tutorId, ts, duracionMin, config.tz]
  );
  return rows[0].ok;
}

/** Permite al tutor ver solo a sus tutorados (para perfiles). */
async function esTutorDe(tutorId, tutoradoId) {
  const { rows } = await db.query(
    `SELECT 1 FROM asignaciones_tutoria
      WHERE tutor_id = $1 AND tutorado_id = $2 AND periodo_escolar = $3 AND estatus_asignacion = 'Activa'`,
    [tutorId, tutoradoId, config.periodoActual]
  );
  return Boolean(rows[0]);
}

/* ---------- Cambio de tutor: solicitud del tutorado y resolución de la coordinación ---- */
const SELECT_SOLICITUD = `
  SELECT s.id, s.tutorado_id, s.tutor_actual_id, s.tutor_nuevo_id, s.periodo, s.motivo, s.estatus, s.respuesta,
         s.creada_en, s.resuelta_en,
         ua.nombre || ' ' || ua.apellidos AS tutorado_nombre, ua.no_control_o_rfc AS no_control, t.semestre, t.nivel_riesgo,
         u1.nombre || ' ' || u1.apellidos AS tutor_actual, u2.nombre || ' ' || u2.apellidos AS tutor_nuevo,
         (SELECT count(*) FROM asignaciones_tutoria a WHERE a.tutor_id = s.tutor_nuevo_id
             AND a.periodo_escolar = s.periodo AND a.estatus_asignacion = 'Activa')::int AS nuevo_ocupados,
         tn.max_tutorados AS nuevo_cupo
    FROM solicitudes_cambio_tutor s
    JOIN tutorados t ON t.id = s.tutorado_id JOIN usuarios ua ON ua.id = t.usuario_id
    JOIN tutores ta ON ta.id = s.tutor_actual_id JOIN usuarios u1 ON u1.id = ta.usuario_id
    JOIN tutores tn ON tn.id = s.tutor_nuevo_id JOIN usuarios u2 ON u2.id = tn.usuario_id`;

/** GET /api/tutores/mi-solicitud   (alumno) — última solicitud del periodo y ventana de cambio. */
async function miSolicitud(req, res) {
  const { rows } = await db.query(
    `${SELECT_SOLICITUD} WHERE s.tutorado_id = $1 AND s.periodo = $2 ORDER BY s.creada_en DESC LIMIT 1`,
    [req.user.tutoradoId, config.periodoActual]
  );
  res.json({ ok: true, ventana: ventanaActual(), solicitud: rows[0] || null });
}

/** POST /api/tutores/solicitar-cambio   (alumno)   Body: { tutor_id, motivo } */
async function solicitarCambio(req, res) {
  const tutorId = v.idPositivo(req.body.tutor_id, 'tutor_id');
  const motivo = v.texto(req.body.motivo, 'motivo', { min: 10, max: 600 });
  const ventana = ventanaActual();
  if (!ventana.abierta) {
    throw conflict(`El cambio de tutor solo se solicita en las primeras ${ventana.semanas} semanas del semestre (del ${ventana.inicio} al ${ventana.fin}).`);
  }
  const tutoradoId = req.user.tutoradoId;
  const actual = await tutorActualDe(db, tutoradoId);
  if (!actual) throw conflict('Aún no tienes tutor: elígelo directamente.');
  if (actual.tutor_id === tutorId) throw conflict('Ese docente ya es tu tutor(a).');
  const { rows: t } = await db.query(
    `${SELECT_TUTORES} WHERE tu.id = $2`, [config.periodoActual, tutorId]);
  if (!t[0]) throw notFound('Tutor no encontrado.');
  if (!t[0].acepta_tutorados || t[0].tutorados >= t[0].max_tutorados) throw conflict(`${t[0].nombre} no tiene lugares disponibles.`);
  try {
    await db.query(
      `INSERT INTO solicitudes_cambio_tutor (tutorado_id, tutor_actual_id, tutor_nuevo_id, periodo, motivo)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tutoradoId, actual.tutor_id, tutorId, config.periodoActual, motivo]
    );
  } catch (err) {
    if (err.code === '23505') throw conflict('Ya tienes una solicitud de cambio pendiente. Espera la respuesta de la coordinación o cancélala.');
    throw err;
  }
  res.status(201).json({ ok: true, mensaje: `Solicitud enviada. La coordinación revisará tu cambio a ${t[0].nombre}.` });
}

/** PATCH /api/tutores/mi-solicitud/cancelar   (alumno) */
async function cancelarSolicitud(req, res) {
  const { rowCount } = await db.query(
    `UPDATE solicitudes_cambio_tutor SET estatus = 'Cancelada', resuelta_en = now()
      WHERE tutorado_id = $1 AND estatus = 'Pendiente'`, [req.user.tutoradoId]);
  if (!rowCount) throw notFound('No tienes una solicitud pendiente.');
  res.json({ ok: true, mensaje: 'Cancelaste tu solicitud de cambio de tutor.' });
}

/** GET /api/tutores/solicitudes?estatus=Pendiente   (coordinador) */
async function listarSolicitudes(req, res) {
  const estatus = ['Pendiente', 'Aprobada', 'Rechazada', 'Cancelada'].includes(req.query.estatus) ? req.query.estatus : 'Pendiente';
  const { rows } = await db.query(
    `${SELECT_SOLICITUD} WHERE s.periodo = $1 AND s.estatus = $2 ORDER BY s.creada_en`, [config.periodoActual, estatus]);
  res.json({ ok: true, ventana: ventanaActual(), solicitudes: rows });
}

/** PATCH /api/tutores/solicitudes/:id   (coordinador)   Body: { accion: 'aprobar'|'rechazar', respuesta? } */
async function resolverSolicitud(req, res) {
  const id = v.idPositivo(req.params.id, 'id');
  const accion = req.body.accion;
  if (!['aprobar', 'rechazar'].includes(accion)) throw badRequest('Indica si apruebas o rechazas la solicitud.');
  const respuesta = req.body.respuesta ? v.texto(req.body.respuesta, 'respuesta', { min: 1, max: 600 }) : null;
  if (accion === 'rechazar' && !respuesta) throw badRequest('Escribe el motivo del rechazo para el tutorado.');

  const r = await db.withTransaction(async (client) => {
    const { rows: s } = await client.query(
      `SELECT * FROM solicitudes_cambio_tutor WHERE id = $1 FOR UPDATE`, [id]);
    if (!s[0]) throw notFound('Solicitud no encontrada.');
    if (s[0].estatus !== 'Pendiente') throw conflict(`La solicitud ya está ${s[0].estatus.toLowerCase()}.`);
    let canceladas = 0;
    if (accion === 'aprobar') {
      const { rows: t } = await client.query(
        `SELECT tu.max_tutorados, u.nombre || ' ' || u.apellidos AS nombre FROM tutores tu JOIN usuarios u ON u.id = tu.usuario_id
          WHERE tu.id = $1 FOR UPDATE OF tu`, [s[0].tutor_nuevo_id]);
      const { rows: oc } = await client.query(
        `SELECT count(*)::int AS n FROM asignaciones_tutoria WHERE tutor_id = $1 AND periodo_escolar = $2 AND estatus_asignacion = 'Activa'`,
        [s[0].tutor_nuevo_id, s[0].periodo]);
      if (oc[0].n >= t[0].max_tutorados) throw conflict(`${t[0].nombre} ya no tiene lugares. Amplía su cupo o rechaza la solicitud.`);
      const actual = await tutorActualDe(client, s[0].tutorado_id);
      if (actual) {
        const c = await client.query(
          `UPDATE citas_tutorias SET estatus = 'Cancelada'
            WHERE tutorado_id = $1 AND tutor_id = $2 AND estatus IN ('Pendiente','Confirmada') AND fecha_hora >= now()`,
          [s[0].tutorado_id, actual.tutor_id]);
        canceladas = c.rowCount;
        await client.query(`UPDATE asignaciones_tutoria SET estatus_asignacion = 'Reasignada' WHERE id = $1`, [actual.id]);
      }
      await client.query(
        `INSERT INTO asignaciones_tutoria (tutor_id, tutorado_id, periodo_escolar, origen) VALUES ($1, $2, $3, 'Coordinación')`,
        [s[0].tutor_nuevo_id, s[0].tutorado_id, s[0].periodo]);
    }
    await client.query(
      `UPDATE solicitudes_cambio_tutor SET estatus = $2, respuesta = $3, resuelta_en = now(), resuelta_por = $4 WHERE id = $1`,
      [id, accion === 'aprobar' ? 'Aprobada' : 'Rechazada', respuesta, req.user.id]);
    return { canceladas };
  });
  res.json({
    ok: true,
    mensaje: accion === 'aprobar'
      ? `Cambio aprobado.${r.canceladas ? ` Se cancelaron ${r.canceladas} cita(s) vigente(s) con el tutor anterior.` : ''}`
      : 'Solicitud rechazada. El tutorado verá tu respuesta.',
  });
}

module.exports = {
  miSolicitud, solicitarCambio, cancelarSolicitud, listarSolicitudes, resolverSolicitud,
  miReporte,
  directorio, elegir, disponibilidad, miPerfil, guardarMiPerfil, actualizarCupo,
  dentroDeHorario, esTutorDe,
};
