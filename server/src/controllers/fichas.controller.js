'use strict';

/**
 * Ficha de Identificación del tutorado (Anexo 6, 2026).
 * - Alumno: la llena y la actualiza (siempre puede corregir sus datos).
 * - Coordinación: lista, consulta, corrige, captura en nombre del alumno,
 *   marca como revisada o solicita corrección, elimina y exporta a CSV.
 * - Tutores: sin acceso (documento confidencial de la coordinación).
 * Cada cambio se registra en fichas_identificacion_historial.
 */
const db = require('../db');
const config = require('../config');
const { badRequest, notFound } = require('../utils/errores');
const v = require('../utils/validaciones');
const {
  ESTADOS_FICHA, SECCIONES_FICHA, CAMPOS_FICHA, validarFicha, diferencias, valorTexto,
} = require('../utils/fichaIdentificacion');

const hoyIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: config.tz }).format(new Date());

/** Datos del tutorado (encabezado de la ficha) y su ficha, si existe. */
async function cargar(tutoradoId, cliente = db) {
  const { rows } = await cliente.query(
    `SELECT t.id AS tutorado_id, u.no_control_o_rfc AS no_control, u.nombre, u.apellidos,
            u.correo_institucional, t.carrera, t.semestre, t.telefono,
            f.id AS ficha_id, f.datos, f.estado, f.observaciones, f.fecha_envio, f.updated_at,
            f.actualizado_por_rol, f.fecha_revision,
            ua.nombre || ' ' || ua.apellidos AS actualizado_por_nombre,
            ur.nombre || ' ' || ur.apellidos AS revisada_por_nombre
       FROM tutorados t
       JOIN usuarios u ON u.id = t.usuario_id
  LEFT JOIN fichas_identificacion f ON f.tutorado_id = t.id
  LEFT JOIN usuarios ua ON ua.id = f.actualizado_por
  LEFT JOIN usuarios ur ON ur.id = f.revisada_por
      WHERE t.id = $1`,
    [tutoradoId]
  );
  if (!rows[0]) throw notFound('Tutorado no encontrado');
  return rows[0];
}

/**
 * Separa "apellidos" en paterno y materno respetando partículas:
 *   "García Hernández"  → García | Hernández
 *   "De la Cruz Pérez"  → De la Cruz | Pérez
 */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'san', 'santa', 'van', 'von', 'da', 'di', 'mc', 'mac']);
function partirApellidos(apellidos) {
  const t = String(apellidos || '').trim().split(/\s+/).filter(Boolean);
  const paterno = [];
  while (t.length) {
    const w = t.shift();
    paterno.push(w);
    if (!PARTICULAS.has(w.toLowerCase())) break;
  }
  return { apellido_paterno: paterno.join(' '), apellido_materno: t.join(' ') };
}

/**
 * Campos fijos de la ficha: salen del registro escolar y no se pueden editar
 * (ni el tutorado ni la coordinación). La fecha es la del primer envío.
 */
function camposFijos(r) {
  return {
    fecha: r.datos?.fecha || hoyIso(),
    carrera: r.carrera,
    semestre: r.semestre,
    ...partirApellidos(r.apellidos),
    nombres: r.nombre,
  };
}

/** Valores sugeridos para una ficha nueva, tomados del registro escolar. */
function prellenado(r) {
  return {
    correo: r.correo_institucional,
    celular1: r.telefono || '',
    num_hijos: 0,
    ...camposFijos(r),
  };
}

function respuesta(r, extra = {}) {
  return {
    ok: true,
    secciones: SECCIONES_FICHA,
    estados: ESTADOS_FICHA,
    alumno: {
      tutorado_id: r.tutorado_id,
      no_control: r.no_control,
      nombre: `${r.nombre} ${r.apellidos}`,
      correo_institucional: r.correo_institucional,
    },
    prellenado: prellenado(r),
    ficha: r.ficha_id
      ? {
          id: r.ficha_id,
          datos: { ...r.datos, ...camposFijos(r) },
          estado: r.estado,
          observaciones: r.observaciones,
          fecha_envio: r.fecha_envio,
          updated_at: r.updated_at,
          actualizado_por_rol: r.actualizado_por_rol,
          actualizado_por_nombre: r.actualizado_por_nombre,
          fecha_revision: r.fecha_revision,
          revisada_por_nombre: r.revisada_por_nombre,
        }
      : null,
    ...extra,
  };
}

async function historial(tutoradoId) {
  const { rows } = await db.query(
    `SELECT h.id, h.accion, h.rol, h.cambios, h.nota, h.fecha,
            u.nombre || ' ' || u.apellidos AS usuario
       FROM fichas_identificacion_historial h
  LEFT JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.tutorado_id = $1
   ORDER BY h.fecha DESC, h.id DESC
      LIMIT 100`,
    [tutoradoId]
  );
  return rows;
}

function validarOFallar(entrada, fijos) {
  const { datos, errores } = validarFicha(entrada || {}, fijos);
  if (errores.length) {
    const lista = errores.slice(0, 6).map((e) => `${e.etiqueta} (${e.mensaje})`).join('; ');
    throw badRequest(
      `Revisa ${errores.length === 1 ? 'este campo' : `estos ${errores.length} campos`}: ${lista}${errores.length > 6 ? '…' : ''}`,
      errores
    );
  }
  return datos;
}

const textoObs = (valor) =>
  valor === undefined || valor === null || String(valor).trim() === ''
    ? null
    : v.texto(String(valor), 'observaciones', { min: 1, max: 1000 });

/**
 * Guarda (inserta o actualiza) la ficha y registra el historial.
 * opciones: { estado, observaciones, revisar } — revisar=true marca quién revisó.
 */
async function guardarFicha(tutoradoId, datos, usuario, accionNueva, accionCambio, opciones) {
  return db.withTransaction(async (cli) => {
    const { rows: previa } = await cli.query(
      'SELECT datos, estado, observaciones FROM fichas_identificacion WHERE tutorado_id = $1 FOR UPDATE',
      [tutoradoId]
    );
    const antes = previa[0];
    const cambios = antes ? diferencias(antes.datos, datos) : null;
    const estado = opciones.estado || 'Enviada';
    const observaciones = opciones.observaciones === undefined ? (antes?.observaciones ?? null) : opciones.observaciones;

    await cli.query(
      `INSERT INTO fichas_identificacion (tutorado_id, datos, estado, observaciones, actualizado_por, actualizado_por_rol,
                                          revisada_por, fecha_revision)
       VALUES ($1, $2::jsonb, $3::varchar, $4::text, $5::int, $6::rol_usuario,
               CASE WHEN $7::boolean THEN $5::int END, CASE WHEN $7::boolean THEN now() END)
       ON CONFLICT (tutorado_id) DO UPDATE
          SET datos = EXCLUDED.datos, estado = EXCLUDED.estado, observaciones = EXCLUDED.observaciones,
              actualizado_por = EXCLUDED.actualizado_por, actualizado_por_rol = EXCLUDED.actualizado_por_rol,
              revisada_por   = CASE WHEN $7::boolean THEN EXCLUDED.revisada_por ELSE fichas_identificacion.revisada_por END,
              fecha_revision = CASE WHEN $7::boolean THEN now() ELSE fichas_identificacion.fecha_revision END`,
      [tutoradoId, JSON.stringify(datos), estado, observaciones, usuario.id, usuario.rol, Boolean(opciones.revisar)]
    );

    const huboCambios = !antes || Object.keys(cambios).length > 0 || antes.estado !== estado
      || (antes.observaciones ?? null) !== (observaciones ?? null);
    if (huboCambios) {
      await cli.query(
        `INSERT INTO fichas_identificacion_historial (tutorado_id, usuario_id, rol, accion, cambios, nota)
         VALUES ($1, $2, $3::rol_usuario, $4, $5::jsonb, $6::text)`,
        [tutoradoId, usuario.id, usuario.rol, antes ? accionCambio : accionNueva,
          cambios && Object.keys(cambios).length ? JSON.stringify(cambios) : null,
          opciones.nota ?? null]
      );
    }
    return { nueva: !antes, cambios: cambios ? Object.keys(cambios).length : CAMPOS_FICHA.length, huboCambios };
  });
}

/* ------------------------------------------------------------------ alumno */

/** GET /api/fichas/mia */
async function miFicha(req, res) {
  const r = await cargar(req.user.tutoradoId);
  res.json(respuesta(r));
}

/** PUT /api/fichas/mia   Body: { datos: {...} } */
async function guardarMiFicha(req, res) {
  const tutoradoId = req.user.tutoradoId;
  const r0 = await cargar(tutoradoId);
  const datos = validarOFallar(req.body.datos, camposFijos(r0));
  // Al actualizar, la ficha vuelve a "Enviada" para que la coordinación la revise de nuevo
  const resultado = await guardarFicha(tutoradoId, datos, req.user, 'Envío', 'Actualización', {
    estado: 'Enviada',
    observaciones: r0.estado === 'Requiere corrección' ? null : undefined,
  });
  const r = await cargar(tutoradoId);
  res.status(resultado.nueva ? 201 : 200).json(respuesta(r, {
    mensaje: resultado.nueva
      ? '¡Listo! Tu ficha de identificación se envió a la Coordinación de Tutorías.'
      : resultado.huboCambios
        ? 'Tu ficha se actualizó y se envió de nuevo a la Coordinación de Tutorías.'
        : 'No hubo cambios en tu ficha.',
  }));
}

/* ------------------------------------------------------------ coordinación */

/** GET /api/fichas?q=&estado=   estado: Pendiente | Enviada | Revisada | Requiere corrección */
async function listar(req, res) {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const estado = req.query.estado ? v.catalogo(req.query.estado, 'estado', ['Pendiente', ...ESTADOS_FICHA]) : null;

  const { rows } = await db.query(
    `SELECT t.id AS tutorado_id, u.no_control_o_rfc AS no_control, u.nombre || ' ' || u.apellidos AS nombre,
            t.semestre, t.nivel_riesgo,
            COALESCE(f.estado, 'Pendiente') AS estado, f.updated_at, f.fecha_envio, f.actualizado_por_rol,
            f.datos->>'celular1' AS celular, f.observaciones,
            ut.nombre || ' ' || ut.apellidos AS tutor
       FROM tutorados t
       JOIN usuarios u ON u.id = t.usuario_id AND u.estado = 'activo'
  LEFT JOIN fichas_identificacion f ON f.tutorado_id = t.id
  LEFT JOIN asignaciones_tutoria a ON a.tutorado_id = t.id AND a.periodo_escolar = $1 AND a.estatus_asignacion = 'Activa'
  LEFT JOIN tutores tu ON tu.id = a.tutor_id
  LEFT JOIN usuarios ut ON ut.id = tu.usuario_id
   ORDER BY CASE COALESCE(f.estado, 'Pendiente') WHEN 'Enviada' THEN 0 WHEN 'Requiere corrección' THEN 1
                                                  WHEN 'Pendiente' THEN 2 ELSE 3 END,
            f.updated_at DESC NULLS LAST, t.semestre, u.apellidos`,
    [config.periodoActual]
  );

  const resumen = { total: rows.length, Pendiente: 0, Enviada: 0, Revisada: 0, 'Requiere corrección': 0 };
  rows.forEach((r) => { resumen[r.estado] += 1; });

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filtradas = rows.filter((r) =>
    (!estado || r.estado === estado) && (!q || norm(`${r.no_control} ${r.nombre}`).includes(norm(q))));

  res.json({ ok: true, resumen, fichas: filtradas });
}

/** GET /api/fichas/tutorado/:id */
async function verFicha(req, res) {
  const id = v.idPositivo(req.params.id, 'id');
  const r = await cargar(id);
  res.json(respuesta(r, { historial: await historial(id) }));
}

/** PUT /api/fichas/tutorado/:id   Body: { datos, estado?, observaciones? } */
async function guardarFichaCoord(req, res) {
  const id = v.idPositivo(req.params.id, 'id');
  const r0 = await cargar(id);
  const datos = validarOFallar(req.body.datos, camposFijos(r0));
  const estado = req.body.estado ? v.catalogo(req.body.estado, 'estado', ESTADOS_FICHA) : (r0.estado || 'Revisada');
  const resultado = await guardarFicha(id, datos, req.user, 'Captura por coordinación', 'Corrección por coordinación', {
    estado,
    observaciones: req.body.observaciones === undefined ? undefined : textoObs(req.body.observaciones),
    revisar: estado !== 'Enviada',
  });
  const r = await cargar(id);
  res.status(resultado.nueva ? 201 : 200).json(respuesta(r, {
    historial: await historial(id),
    mensaje: resultado.nueva
      ? 'Ficha capturada por la coordinación.'
      : resultado.huboCambios ? `Ficha actualizada (${resultado.cambios} campo(s) modificado(s)).` : 'No hubo cambios.',
  }));
}

/** PATCH /api/fichas/tutorado/:id/estado   Body: { estado, observaciones? } */
async function cambiarEstado(req, res) {
  const id = v.idPositivo(req.params.id, 'id');
  const estado = v.catalogo(req.body.estado, 'estado', ESTADOS_FICHA);
  if (!estado) throw badRequest('Indica el estado de la ficha.');
  const observaciones = textoObs(req.body.observaciones);
  if (estado === 'Requiere corrección' && !observaciones) {
    throw badRequest('Escribe qué debe corregir el tutorado.');
  }
  const { rows } = await db.query(
    `UPDATE fichas_identificacion
        SET estado = $2::varchar, observaciones = $3::text, revisada_por = $4::int, fecha_revision = now()
      WHERE tutorado_id = $1
  RETURNING id`,
    [id, estado, estado === 'Revisada' ? null : observaciones, req.user.id]
  );
  if (!rows[0]) throw notFound('Este tutorado aún no tiene ficha registrada.');
  await db.query(
    `INSERT INTO fichas_identificacion_historial (tutorado_id, usuario_id, rol, accion, nota)
     VALUES ($1, $2, 'coordinador', $3, $4::text)`,
    [id, req.user.id, estado === 'Revisada' ? 'Revisión' : estado === 'Requiere corrección' ? 'Solicitud de corrección' : 'Reabierta', observaciones]
  );
  const r = await cargar(id);
  res.json(respuesta(r, {
    historial: await historial(id),
    mensaje: estado === 'Revisada' ? 'Ficha marcada como revisada.'
      : estado === 'Requiere corrección' ? 'Se pidió al tutorado corregir su ficha.' : 'Ficha marcada como enviada (pendiente de revisión).',
  }));
}

/** DELETE /api/fichas/tutorado/:id — el tutorado deberá llenarla de nuevo */
async function eliminar(req, res) {
  const id = v.idPositivo(req.params.id, 'id');
  const { rows } = await db.query('DELETE FROM fichas_identificacion WHERE tutorado_id = $1 RETURNING id', [id]);
  if (!rows[0]) throw notFound('Este tutorado no tiene ficha registrada.');
  await db.query(
    `INSERT INTO fichas_identificacion_historial (tutorado_id, usuario_id, rol, accion, nota)
     VALUES ($1, $2, 'coordinador', 'Eliminación', 'La ficha se eliminó; el tutorado deberá llenarla de nuevo.')`,
    [id, req.user.id]
  );
  res.json({ ok: true, mensaje: 'Ficha eliminada. El tutorado podrá llenarla de nuevo.' });
}

/** GET /api/fichas/exportar   CSV (UTF-8 con BOM para que Excel respete los acentos) */
async function exportar(req, res) {
  const { rows } = await db.query(
    `SELECT u.no_control_o_rfc AS no_control, f.estado, f.updated_at, f.datos
       FROM fichas_identificacion f
       JOIN tutorados t ON t.id = f.tutorado_id
       JOIN usuarios u ON u.id = t.usuario_id
   ORDER BY t.semestre, u.apellidos`
  );
  const celda = (x) => {
    let s = String(x ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita inyección de fórmulas en Excel
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const encabezado = ['No. de control', 'Estado', 'Última actualización', ...CAMPOS_FICHA.map((c) => c.etiqueta)];
  const lineas = [encabezado.map(celda).join(',')];
  rows.forEach((r) => {
    lineas.push([
      r.no_control, r.estado, new Date(r.updated_at).toISOString().slice(0, 16).replace('T', ' '),
      ...CAMPOS_FICHA.map((c) => valorTexto(c, r.datos[c.clave])),
    ].map(celda).join(','));
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fichas_identificacion_${hoyIso()}.csv"`);
  res.status(200).end(`﻿${lineas.join('\r\n')}\r\n`);
}

module.exports = {
  miFicha, guardarMiFicha, listar, verFicha, guardarFichaCoord, cambiarEstado, eliminar, exportar,
};
