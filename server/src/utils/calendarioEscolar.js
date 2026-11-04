'use strict';

/**
 * Calendario Académico 2026-2027 del Tecnológico Nacional de México.
 * Fuente única para saber qué días hay clases: el servidor rechaza citas
 * fuera de estos días y el frontend lo usa para deshabilitarlos en el calendario.
 *
 * Para el siguiente ciclo escolar basta con agregar sus periodos e inhábiles aquí.
 */
const CALENDARIO = {
  ciclo: '2026-2027',
  // Periodos de clases (inicio y fin de clases, inclusive)
  periodos: [
    { nombre: 'Agosto - Diciembre 2026', inicio: '2026-08-24', fin: '2026-12-11' },
    { nombre: 'Enero - Junio 2027', inicio: '2027-01-25', fin: '2027-05-28' },
  ],
  // Vacaciones dentro de un periodo de clases
  vacaciones: [
    { nombre: 'Periodo vacacional de primavera', inicio: '2027-03-22', fin: '2027-04-02' },
  ],
  // Días de descanso obligatorio (inhábiles)
  inhabiles: [
    { fecha: '2026-09-16', motivo: 'Día de la Independencia' },
    { fecha: '2026-11-02', motivo: 'Día de Muertos' },
    { fecha: '2026-11-16', motivo: 'Aniversario de la Revolución Mexicana' },
    { fecha: '2026-12-25', motivo: 'Navidad' },
    { fecha: '2027-01-01', motivo: 'Año Nuevo' },
    { fecha: '2027-02-01', motivo: 'Día de la Constitución' },
    { fecha: '2027-03-15', motivo: 'Natalicio de Benito Juárez' },
    { fecha: '2027-05-01', motivo: 'Día del Trabajo' },
    { fecha: '2027-05-05', motivo: 'Batalla de Puebla' },
    { fecha: '2027-05-15', motivo: 'Día del Maestro' },
  ],
};

const dentro = (ymd, r) => ymd >= r.inicio && ymd <= r.fin;

/**
 * ¿Hay clases ese día? ymd = 'AAAA-MM-DD' (fecha local de Veracruz).
 * Devuelve { ok: true } o { ok: false, motivo }.
 */
function diaDeClases(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return { ok: false, motivo: 'Fecha no válida.' };
  const dia = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  if (dia === 0 || dia === 6) return { ok: false, motivo: 'Las tutorías se agendan de lunes a viernes.' };
  const inhabil = CALENDARIO.inhabiles.find((d) => d.fecha === ymd);
  if (inhabil) return { ok: false, motivo: `Ese día es inhábil (${inhabil.motivo}).` };
  const vac = CALENDARIO.vacaciones.find((r) => dentro(ymd, r));
  if (vac) return { ok: false, motivo: `Ese día es ${vac.nombre.toLowerCase()}; no hay clases.` };
  if (!CALENDARIO.periodos.some((r) => dentro(ymd, r))) {
    return { ok: false, motivo: 'Ese día no hay clases según el Calendario Académico del TecNM.' };
  }
  return { ok: true };
}

module.exports = { CALENDARIO, diaDeClases };
