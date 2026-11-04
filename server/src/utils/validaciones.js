'use strict';

const config = require('../config');
const { badRequest } = require('./errores');

const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const REGEX_CORREO = new RegExp(`^[a-z0-9._%+-]+@${escaparRegex(config.dominio)}$`, 'i');

function esCorreoInstitucional(correo) {
  return typeof correo === 'string' && REGEX_CORREO.test(correo.trim());
}

/** Texto obligatorio con longitud mínima/máxima. */
function texto(valor, campo, { min = 1, max = 2000 } = {}) {
  if (typeof valor !== 'string' || valor.trim().length < min) {
    throw badRequest(`El campo "${campo}" es obligatorio (mínimo ${min} caracteres).`);
  }
  const limpio = valor.trim();
  if (limpio.length > max) {
    throw badRequest(`El campo "${campo}" excede ${max} caracteres.`);
  }
  return limpio;
}

/** Entero positivo obligatorio. */
function idPositivo(valor, campo) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) {
    throw badRequest(`El campo "${campo}" debe ser un identificador numérico válido.`);
  }
  return n;
}

/** Valor dentro de un catálogo; acepta alias (sin acento, mayúsculas, etc.). */
function catalogo(valor, campo, opciones, alias = {}) {
  if (valor === undefined || valor === null || valor === '') return null;
  const crudo = String(valor).trim();
  const clave = crudo.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (alias[clave]) return alias[clave];
  const encontrado = opciones.find(
    (o) => o.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === clave
  );
  if (!encontrado) {
    throw badRequest(`Valor inválido para "${campo}". Opciones: ${opciones.join(', ')}`);
  }
  return encontrado;
}

const NIVELES_RIESGO = ['BAJO', 'MEDIO', 'ALTO', 'CRÍTICO'];
const TIPOS_CITA = ['Individual', 'Grupal'];
const MODALIDADES = ['Presencial', 'Línea'];
const ESTATUS_CITA = ['Pendiente', 'Confirmada', 'Completada', 'Cancelada'];
const AREAS = ['PALPROG', 'CIS', 'CEPC', 'PAPAs', 'Psicología/Salud'];
const ESTATUS_CANAL = ['Pendiente', 'En Proceso', 'Aceptado', 'Atendido', 'Cerrado'];

const ALIAS_MODALIDAD = {
  'EN LINEA': 'Línea',
  LINEA: 'Línea',
  ONLINE: 'Línea',
  VIRTUAL: 'Línea',
};
const ALIAS_AREA = {
  PAPAS: 'PAPAs',
  "PAPA'S": 'PAPAs',
  PSICOLOGIA: 'Psicología/Salud',
  SALUD: 'Psicología/Salud',
  'PSICOLOGIA/SALUD': 'Psicología/Salud',
};

/**
 * Normaliza la fecha/hora recibida y devuelve { valor, esLocal }.
 *  - "2026-10-15T10:00" o "2026-10-15 10:00"  → hora local del ITVER
 *  - "2026-10-15T16:00:00Z" / "...-06:00"      → instante absoluto
 *  - { fecha: "2026-10-15", hora: "10:00" }    → hora local del ITVER
 */
function fechaHora(body) {
  let valor = body.fecha_hora;
  if (!valor && body.fecha && body.hora) {
    valor = `${body.fecha}T${String(body.hora).slice(0, 5)}`;
  }
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(valor)) {
    throw badRequest('Fecha y hora inválidas. Usa el formato AAAA-MM-DDTHH:MM.');
  }
  const esLocal = !/(Z|[+-]\d{2}:?\d{2})$/i.test(valor);
  return { valor: valor.replace(' ', 'T'), esLocal };
}

module.exports = {
  esCorreoInstitucional,
  texto,
  idPositivo,
  catalogo,
  fechaHora,
  NIVELES_RIESGO,
  TIPOS_CITA,
  MODALIDADES,
  ESTATUS_CITA,
  AREAS,
  ESTATUS_CANAL,
  ALIAS_MODALIDAD,
  ALIAS_AREA,
};
