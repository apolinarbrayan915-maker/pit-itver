'use strict';

/**
 * Anexo 6 (2026) · Ficha de Identificación del tutorado.
 * Una sola definición de campos alimenta:
 *   - la validación del servidor (este archivo),
 *   - el formulario del tutorado y el editor de la coordinación (app.js la recibe por la API),
 *   - la vista de impresión y la exportación CSV.
 *
 * Tipos: texto | textarea | fecha | entero | tel | correo | opcion | multiple
 * `si: { campo, valor }` → el campo solo aplica (y solo es obligatorio) cuando otro campo tiene ese valor.
 * `no: { campo, valor }` → el campo NO aplica cuando otro campo tiene ese valor.
 */

const ESTADOS_FICHA = ['Enviada', 'Revisada', 'Requiere corrección'];

const ESCOLARIDAD_PADRES = ['Primaria', 'Secundaria', 'Preparatoria', 'Técnico', 'Licenciatura', 'Posgrado', 'Sin estudios'];

const SECCIONES_FICHA = [
  {
    id: 'escolares',
    titulo: 'Datos escolares',
    icono: 'fa-school',
    campos: [
      { clave: 'fecha', etiqueta: 'Fecha de llenado', tipo: 'fecha', requerido: true, ancho: 'tercio', fijo: true,
        ayuda: 'Se registra automáticamente el día del primer envío.' },
      { clave: 'carrera', etiqueta: 'Carrera a la que perteneces', tipo: 'texto', requerido: true, max: 100, ancho: 'medio', fijo: true, ayuda: 'Dato del registro escolar; no se puede modificar.' },
      { clave: 'semestre', etiqueta: 'Semestre', tipo: 'entero', requerido: true, min: 1, max: 12, ancho: 'tercio', fijo: true, ayuda: 'Dato del registro escolar; no se puede modificar.' },
    ],
  },
  {
    id: 'generales',
    titulo: 'Datos generales',
    icono: 'fa-id-card',
    campos: [
      { clave: 'apellido_paterno', etiqueta: 'Apellido paterno', tipo: 'texto', requerido: true, max: 60, ancho: 'tercio', fijo: true },
      { clave: 'apellido_materno', etiqueta: 'Apellido materno', tipo: 'texto', requerido: false, max: 60, ancho: 'tercio', fijo: true },
      { clave: 'nombres', etiqueta: 'Nombre(s)', tipo: 'texto', requerido: true, max: 80, ancho: 'tercio', fijo: true },
      { clave: 'sexo', etiqueta: 'Sexo', tipo: 'opcion', opciones: ['Hombre', 'Mujer'], requerido: true, ancho: 'tercio' },
      { clave: 'tel_domicilio', etiqueta: 'Tel. domicilio', tipo: 'tel', requerido: false, ancho: 'tercio', ayuda: '10 dígitos con lada.' },
      { clave: 'celular1', etiqueta: 'Celular 1', tipo: 'tel', requerido: true, ancho: 'tercio', ayuda: '10 dígitos, sin +52.' },
      { clave: 'celular2', etiqueta: 'Celular 2', tipo: 'tel', requerido: false, ancho: 'tercio' },
      { clave: 'correo', etiqueta: 'Correo electrónico', tipo: 'correo', requerido: true, max: 120, ancho: 'medio',
        ayuda: 'Puede ser tu correo personal o el institucional.' },
      { clave: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'fecha', requerido: true, ancho: 'tercio' },
      { clave: 'lugar_nacimiento', etiqueta: 'Lugar de nacimiento', tipo: 'texto', requerido: true, max: 100, ancho: 'medio',
        placeholder: 'Ciudad, estado' },
      { clave: 'estado_civil', etiqueta: 'Estado civil', tipo: 'opcion', opciones: ['Soltero(a)', 'Casado(a)', 'Otro'], requerido: true, ancho: 'medio' },
      { clave: 'estado_civil_otro', etiqueta: 'Especifica tu estado civil', tipo: 'texto', requerido: true, max: 40, ancho: 'tercio',
        si: { campo: 'estado_civil', valor: 'Otro' } },
      { clave: 'num_hijos', etiqueta: 'No. de hijos', tipo: 'entero', requerido: true, min: 0, max: 20, ancho: 'tercio' },
      { clave: 'domicilio', etiqueta: 'Domicilio actual', tipo: 'textarea', requerido: true, max: 250, ancho: 'completo',
        placeholder: 'Calle, número, colonia, ciudad y C.P.' },
    ],
  },
  {
    id: 'procedencia',
    titulo: 'Escolaridad de procedencia y becas',
    icono: 'fa-graduation-cap',
    campos: [
      { clave: 'escolaridad', etiqueta: 'Escolaridad', tipo: 'opcion', opciones: ['Preparatoria', 'Bachillerato técnico'], requerido: true, ancho: 'medio' },
      { clave: 'institucion_procedencia', etiqueta: 'Nombre de la institución', tipo: 'texto', requerido: true, max: 120, ancho: 'medio' },
      { clave: 'becado', etiqueta: '¿Has estado becado(a)?', tipo: 'opcion', opciones: ['Sí', 'No'], requerido: true, ancho: 'tercio' },
      { clave: 'tipos_beca', etiqueta: 'Tipo de beca', tipo: 'multiple', opciones: ['Gobierno federal', 'Gobierno estatal', 'Esfuerzos de bachillerato'],
        requerido: true, ancho: 'completo', si: { campo: 'becado', valor: 'Sí' } },
      { clave: 'beca_institucion', etiqueta: 'Nombre de la institución (beca)', tipo: 'texto', requerido: false, max: 120, ancho: 'medio',
        si: { campo: 'becado', valor: 'Sí' } },
    ],
  },
  {
    id: 'vivienda',
    titulo: 'Vivienda y trabajo',
    icono: 'fa-house-user',
    campos: [
      { clave: 'vivira_con', etiqueta: 'En el transcurso de tus estudios vivirás', tipo: 'opcion',
        opciones: ['Con mi familia', 'Con familiares cercanos', 'Con otros estudiantes', 'Solo(a)'], requerido: true, ancho: 'completo' },
      { clave: 'trabaja', etiqueta: '¿Trabajas?', tipo: 'opcion', opciones: ['Sí', 'No'], requerido: true, ancho: 'tercio' },
      { clave: 'empresa', etiqueta: 'Nombre de la empresa', tipo: 'texto', requerido: true, max: 120, ancho: 'tercio',
        si: { campo: 'trabaja', valor: 'Sí' } },
      { clave: 'horario_trabajo', etiqueta: 'Horario', tipo: 'texto', requerido: true, max: 80, ancho: 'tercio',
        placeholder: 'p. ej. Lun–Vie 16:00–21:00', si: { campo: 'trabaja', valor: 'Sí' } },
    ],
  },
  {
    id: 'padres',
    titulo: 'Datos de padre y madre',
    icono: 'fa-people-roof',
    campos: [
      { clave: 'escolaridad_padre', etiqueta: 'Máximo grado de escolaridad del padre', tipo: 'opcion', opciones: ESCOLARIDAD_PADRES, requerido: true, ancho: 'completo' },
      { clave: 'escolaridad_madre', etiqueta: 'Máximo grado de escolaridad de la madre', tipo: 'opcion', opciones: ESCOLARIDAD_PADRES, requerido: true, ancho: 'completo' },
      { clave: 'padre_vive', etiqueta: 'Actualmente tu padre', tipo: 'opcion', opciones: ['Vive', 'Finado'], requerido: true, ancho: 'medio' },
      { clave: 'madre_vive', etiqueta: 'Actualmente tu madre', tipo: 'opcion', opciones: ['Vive', 'Finado'], requerido: true, ancho: 'medio' },
      { clave: 'trabajo_padre', etiqueta: 'Nombre del lugar de trabajo del padre', tipo: 'texto', requerido: false, max: 120, ancho: 'medio',
        no: { campo: 'padre_vive', valor: 'Finado' } },
      { clave: 'trabajo_madre', etiqueta: 'Nombre del lugar de trabajo de la madre', tipo: 'texto', requerido: false, max: 120, ancho: 'medio',
        no: { campo: 'madre_vive', valor: 'Finado' } },
    ],
  },
  {
    id: 'emergencia',
    titulo: 'En caso de accidente avisar a',
    icono: 'fa-truck-medical',
    campos: [
      { clave: 'emergencia_nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 120, ancho: 'medio' },
      { clave: 'emergencia_telefono', etiqueta: 'Teléfono', tipo: 'tel', requerido: true, ancho: 'medio',
        ayuda: 'Debe ser de la persona de contacto, no el tuyo.' },
    ],
  },
];


/**
 * Teléfono de México: exactamente 10 dígitos (lada + número), según el
 * Plan Nacional de Numeración vigente desde 2019. Acepta que lo escriban con
 * espacios, guiones, paréntesis o con +52 al inicio; se guarda solo con los 10 dígitos.
 * Rechaza números que no pueden existir (iniciar con 0 o 1, todos iguales, secuencias).
 */
function validarTelefono(crudo) {
  const texto = String(crudo ?? '').trim();
  if (!/^[0-9+()\s.-]+$/.test(texto)) return { error: 'solo se permiten números' };
  let d = texto.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('52')) d = d.slice(2);         // +52 XXX XXX XXXX
  else if (d.length === 13 && d.startsWith('521')) d = d.slice(3);  // formato anterior +52 1
  if (d.length !== 10) return { error: `debe tener exactamente 10 dígitos (escribiste ${d.length})` };
  if (/^[01]/.test(d)) return { error: 'la lada no puede iniciar con 0 ni con 1' };
  if (/^(\d)\1{9}$/.test(d)) return { error: 'número no válido (todos los dígitos son iguales)' };
  if ('01234567890123456789'.includes(d) || '98765432109876543210'.includes(d)) return { error: 'número no válido (secuencia)' };
  if (/(\d)\1{6,}/.test(d)) return { error: 'número no válido (demasiados dígitos repetidos)' };
  return { valor: d };
}

const CAMPOS_FICHA = SECCIONES_FICHA.flatMap((s) => s.campos.map((c) => ({ ...c, seccion: s.id })));

const vacio = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/** ¿El campo aplica según las respuestas actuales? */
function aplica(campo, datos) {
  if (campo.si && datos[campo.si.campo] !== campo.si.valor) return false;
  if (campo.no && datos[campo.no.campo] === campo.no.valor) return false;
  return true;
}

const hoyIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());

/** Normaliza un valor individual. Devuelve { valor } o { error }. */
function normalizar(campo, crudo) {
  switch (campo.tipo) {
    case 'texto':
    case 'textarea': {
      const t = campo.tipo === 'texto' ? String(crudo).trim().replace(/\s+/g, ' ') : String(crudo).trim();
      if (t.length > (campo.max || 250)) return { error: `máximo ${campo.max || 250} caracteres` };
      return { valor: t };
    }
    case 'entero': {
      const n = Number(crudo);
      if (!Number.isInteger(n)) return { error: 'debe ser un número entero' };
      if (campo.min !== undefined && n < campo.min) return { error: `mínimo ${campo.min}` };
      if (campo.max !== undefined && n > campo.max) return { error: `máximo ${campo.max}` };
      return { valor: n };
    }
    case 'fecha': {
      const t = String(crudo).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(`${t}T12:00:00Z`))) return { error: 'fecha inválida (AAAA-MM-DD)' };
      if (t > hoyIso()) return { error: 'no puede ser una fecha futura' };
      if (campo.clave === 'fecha_nacimiento') {
        const edad = (Date.now() - Date.parse(`${t}T12:00:00Z`)) / (365.25 * 864e5);
        if (edad < 14 || edad > 90) return { error: 'revisa el año de nacimiento' };
      } else if (t < '2000-01-01') return { error: 'fecha inválida' };
      return { valor: t };
    }
    case 'tel': {
      const r = validarTelefono(crudo);
      return r.error ? { error: r.error } : { valor: r.valor };
    }
    case 'correo': {
      const t = String(crudo).trim().toLowerCase();
      if (t.length > (campo.max || 120) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return { error: 'correo electrónico inválido' };
      return { valor: t };
    }
    case 'opcion': {
      const t = String(crudo).trim();
      if (!campo.opciones.includes(t)) return { error: `elige una opción: ${campo.opciones.join(', ')}` };
      return { valor: t };
    }
    case 'multiple': {
      const arr = Array.isArray(crudo) ? crudo.map((x) => String(x).trim()) : [String(crudo).trim()];
      const invalidos = arr.filter((x) => !campo.opciones.includes(x));
      if (invalidos.length) return { error: `opción no válida: ${invalidos.join(', ')}` };
      return { valor: campo.opciones.filter((o) => arr.includes(o)) }; // sin duplicados y en orden
    }
    default:
      return { error: 'tipo de campo desconocido' };
  }
}

/**
 * Valida y limpia la ficha completa.
 * Devuelve { datos, errores: [{ clave, etiqueta, mensaje }] }.
 * Los campos que no aplican (p. ej. empresa si no trabaja) se guardan vacíos.
 */
function validarFicha(entrada = {}, fijos = {}) {
  const errores = [];
  const datos = {};
  // Los campos fijos (fecha, carrera, semestre y nombre) vienen del registro escolar:
  // se ignora lo que mande el navegador.
  entrada = { ...entrada, ...fijos };
  // 1) primero las opciones, porque deciden qué campos condicionales aplican
  const ordenados = [...CAMPOS_FICHA].sort((a, b) => Number(Boolean(a.si || a.no)) - Number(Boolean(b.si || b.no)));
  for (const campo of ordenados) {
    const crudo = entrada[campo.clave];
    if (!aplica(campo, datos)) {
      datos[campo.clave] = campo.tipo === 'multiple' ? [] : '';
      continue;
    }
    if (vacio(crudo)) {
      if (campo.requerido) errores.push({ clave: campo.clave, etiqueta: campo.etiqueta, mensaje: 'es obligatorio' });
      datos[campo.clave] = campo.tipo === 'multiple' ? [] : '';
      continue;
    }
    const r = normalizar(campo, crudo);
    if (r.error) errores.push({ clave: campo.clave, etiqueta: campo.etiqueta, mensaje: r.error });
    else datos[campo.clave] = r.valor;
  }
  // Validaciones cruzadas de teléfonos
  const tels = (k) => datos[k] || '';
  const etiqueta = (k) => CAMPOS_FICHA.find((c) => c.clave === k).etiqueta;
  if (tels('celular2') && tels('celular2') === tels('celular1')) {
    errores.push({ clave: 'celular2', etiqueta: etiqueta('celular2'), mensaje: 'es igual al Celular 1' });
  }
  if (tels('emergencia_telefono') && [tels('celular1'), tels('celular2')].includes(tels('emergencia_telefono'))) {
    errores.push({ clave: 'emergencia_telefono', etiqueta: 'Teléfono de emergencia', mensaje: 'debe ser de la persona de contacto, no tu propio celular' });
  }
  // Orden estable según el formato
  const ordenado = Object.fromEntries(CAMPOS_FICHA.map((c) => [c.clave, datos[c.clave]]));
  return { datos: ordenado, errores };
}

/** Diferencias campo a campo entre dos versiones (para el historial). */
function diferencias(antes = {}, despues = {}) {
  const cambios = {};
  for (const c of CAMPOS_FICHA) {
    const a = antes[c.clave] ?? (c.tipo === 'multiple' ? [] : '');
    const d = despues[c.clave] ?? (c.tipo === 'multiple' ? [] : '');
    if (JSON.stringify(a) !== JSON.stringify(d)) cambios[c.clave] = { antes: a, despues: d };
  }
  return cambios;
}

/** Texto plano de un valor (CSV / impresión). */
function valorTexto(campo, valor) {
  if (Array.isArray(valor)) return valor.join('; ');
  return valor === undefined || valor === null ? '' : String(valor);
}

module.exports = {
  validarTelefono, ESTADOS_FICHA, SECCIONES_FICHA, CAMPOS_FICHA, validarFicha, diferencias, aplica, valorTexto,
};
