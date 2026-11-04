'use strict';

/**
 * Catálogo de entidades federativas y municipios de México (Marco Geoestadístico
 * del INEGI, 32 entidades). Se usa para el lugar de nacimiento / ciudad natal,
 * que se guarda como "Municipio, Entidad". Quien nació fuera de México escribe
 * "Ciudad, País".
 */
const MUNICIPIOS = require('../data/municipios-mx.json');

const FUERA = 'Fuera de México';

/** Valida "Municipio, Entidad" (o "Ciudad, País"). Devuelve { valor } o { error }. */
function validarLugar(crudo) {
  const t = String(crudo ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return { valor: '' };
  if (t.length > 100) return { error: 'máximo 100 caracteres' };
  const i = t.lastIndexOf(',');
  if (i <= 0) return { error: 'elige el estado y el municipio' };
  const lugar = t.slice(0, i).trim();
  const region = t.slice(i + 1).trim();
  if (!lugar || !region) return { error: 'elige el estado y el municipio' };
  if (MUNICIPIOS[region]) {
    if (!MUNICIPIOS[region].includes(lugar)) return { error: `"${lugar}" no es un municipio de ${region}` };
    return { valor: `${lugar}, ${region}` };
  }
  // Fuera de México: ciudad y país escritos por el alumno
  if (!/^[\p{L} .'-]{2,}$/u.test(lugar) || !/^[\p{L} .'-]{2,}$/u.test(region)) return { error: 'escribe la ciudad y el país' };
  return { valor: `${lugar}, ${region}` };
}

module.exports = { MUNICIPIOS, FUERA, validarLugar };
