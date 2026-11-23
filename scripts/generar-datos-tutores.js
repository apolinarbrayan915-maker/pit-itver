'use strict';

/**
 * Genera database/nube/009_tutores_programa.sql: completa la plantilla de
 * 18 tutores del programa (los 3 de demostración + 15 nuevos) con perfil,
 * horario, tutorados, citas del semestre, evaluaciones y canalizaciones.
 *
 * Los datos son FICTICIOS y deterministas (misma semilla = mismo archivo).
 * Todas las cuentas usan la contraseña de las cuentas de demostración.
 *
 *   node scripts/generar-datos-tutores.js
 */
const fs = require('fs');
const path = require('path');
const { diaDeClases } = require('../server/src/utils/calendarioEscolar');
const { CLAVES_ALUMNO } = require('../server/src/utils/cuestionario');

// ---- PRNG determinista -------------------------------------------------------
let semilla = 20261123;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const ent = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const elegir = (arr) => arr[Math.floor(rnd() * arr.length)];
const mezclar = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const q = (s) => (s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const arr = (xs) => `ARRAY[${xs.map(q).join(', ')}]::text[]`;

const PERIODO = '2026-2';
const HOY = '2026-11-23';
const INICIO = '2026-08-24';
const CORREO_DEMO = 'noemi.tp@veracruz.tecnm.mx';

// ---- 15 tutores nuevos -------------------------------------------------------
const TUTORES = [
  ['Héctor Manuel', 'Alarcón Vega', 'ALVH790418', 'hector.av', 'Maestría en Ciencias de la Computación', 'Inteligencia artificial', 14, 'Diplomado Cumplido', 8, 'Cubículo 1, Edificio U', ['Programación', 'Investigación', 'Titulación'], ['Inteligencia artificial', 'Proyectos de investigación', 'Opciones de titulación']],
  ['Patricia', 'Bautista Ochoa', 'BAOP810927', 'patricia.bo', 'Maestría en Educación', 'Bases de datos', 16, 'Diplomado Cumplido', 8, 'Cubículo 2, Edificio U', ['Bases de datos', 'Hábitos de estudio', 'Nuevo ingreso'], ['Organización del tiempo', 'Bases de datos', 'Adaptación al Tec']],
  ['Ricardo', 'Cházaro Luna', 'CALR760305', 'ricardo.cl', 'Maestría en Redes y Telecomunicaciones', 'Redes de computadoras', 19, 'Diplomado Cumplido', 6, 'Cubículo 4, Edificio U', ['Redes', 'Certificaciones', 'Residencia profesional'], ['Certificaciones CCNA', 'Residencia profesional']],
  ['Adriana', 'Domínguez Sosa', 'DOSA850612', 'adriana.ds', 'Maestría en Ingeniería de Software', 'Ingeniería de software', 11, 'Cursos Básicos', 8, 'Cubículo 5, Edificio U', ['Desarrollo web', 'Proyectos', 'Servicio social'], ['Desarrollo de software', 'Trabajo en equipo', 'Servicio social']],
  ['Fernando', 'Escobar Ruiz', 'ESRF740821', 'fernando.er', 'Doctorado en Ciencias de la Computación', 'Sistemas distribuidos', 22, 'Diplomado Cumplido', 6, 'Cubículo 6, Edificio U', ['Investigación', 'Posgrado', 'Programación'], ['Posgrado', 'Publicación de artículos', 'Programación avanzada']],
  ['Guadalupe', 'Fuentes Marín', 'FUMG830214', 'guadalupe.fm', 'Maestría en Matemáticas Aplicadas', 'Matemáticas discretas', 13, 'Diplomado Cumplido', 8, 'Cubículo 8, Edificio U', ['Matemáticas', 'Rezago académico', 'Hábitos de estudio'], ['Cálculo y matemáticas', 'Materias en repetición', 'Técnicas de estudio']],
  ['Jorge Luis', 'García Pale', 'GAPJ780930', 'jorge.gp', 'Maestría en Tecnologías de la Información', 'Seguridad informática', 15, 'Cursos Básicos', 6, 'Cubículo 9, Edificio U', ['Ciberseguridad', 'Redes', 'Becas'], ['Seguridad informática', 'Becas y movilidad']],
  ['Claudia Ivette', 'Hernández Cid', 'HECC870503', 'claudia.hc', 'Maestría en Administración de TI', 'Gestión de proyectos', 9, 'Diplomado Cumplido', 8, 'Cubículo 10, Edificio U', ['Gestión de proyectos', 'Emprendimiento', 'Nuevo ingreso'], ['Emprendimiento', 'Gestión de proyectos', 'Primer semestre']],
  ['Arturo', 'Lagunes Ríos', 'LARA730117', 'arturo.lr', 'Maestría en Sistemas Computacionales', 'Arquitectura de computadoras', 24, 'Diplomado Cumplido', 6, 'Cubículo 11, Edificio U', ['Hardware', 'Sistemas operativos', 'Residencia profesional'], ['Sistemas operativos', 'Residencia profesional']],
  ['Mónica', 'Mendoza Arenas', 'MEAM860728', 'monica.ma', 'Maestría en Psicopedagogía', 'Formación docente', 10, 'Diplomado Cumplido', 10, 'Cubículo 13, Edificio U', ['Orientación personal', 'Hábitos de estudio', 'Nuevo ingreso'], ['Manejo del estrés', 'Hábitos de estudio', 'Adaptación al Tec']],
  ['Óscar', 'Navarrete Cruz', 'NACO800409', 'oscar.nc', 'Maestría en Ciencias de Datos', 'Ciencia de datos', 12, 'Cursos Básicos', 8, 'Cubículo 14, Edificio U', ['Ciencia de datos', 'Programación', 'Certificaciones'], ['Python y ciencia de datos', 'Certificaciones']],
  ['Rosa María', 'Palacios Uscanga', 'PAUR770815', 'rosa.pu', 'Maestría en Educación Superior', 'Programación orientada a objetos', 20, 'Diplomado Cumplido', 8, 'Cubículo 15, Edificio U', ['Programación', 'Rezago académico', 'Trámites y becas'], ['Lógica de programación', 'Materias reprobadas', 'Trámites escolares']],
  ['Sergio', 'Quiroz Bello', 'QUBS840126', 'sergio.qb', 'Maestría en Ingeniería', 'Desarrollo móvil', 8, 'Cursos Básicos', 6, 'Cubículo 16, Edificio U', ['Desarrollo móvil', 'Proyectos', 'Emprendimiento'], ['Apps móviles', 'Concursos de innovación']],
  ['Verónica', 'Salas Montero', 'SAMV820902', 'veronica.sm', 'Maestría en Tecnología Educativa', 'Sistemas de información', 14, 'Diplomado Cumplido', 8, 'Cubículo 17, Edificio U', ['Servicio social', 'Residencia profesional', 'Titulación'], ['Servicio social', 'Residencia', 'Titulación']],
  ['Alejandro', 'Zamudio Herrera', 'ZAHA750630', 'alejandro.zh', 'Maestría en Ciencias de la Computación', 'Compiladores y autómatas', 21, 'Diplomado Cumplido', 6, 'Cubículo 18, Edificio U', ['Teoría de la computación', 'Programación competitiva', 'Posgrado'], ['Programación competitiva', 'Autómatas y compiladores']],
];

const PRESENTACION = (t) => `${t[4]} con ${t[6]} años de experiencia docente en el Departamento de Sistemas y Computación. Acompaño a mis tutorados en ${t[11].slice(0, 2).join(' y ').toLowerCase()}, y les ayudo a planear su avance en la carrera.`;
const FRASES = ['Cada semestre es una oportunidad para mejorar.', 'Pregunta sin miedo: para eso estamos.', 'La constancia vence al talento cuando el talento no es constante.', 'Tu avance importa más que tu velocidad.', 'Organiza tu tiempo y el tiempo trabajará para ti.'];

// ---- Nombres de tutorados ----------------------------------------------------
const NOMBRES = ['Alejandra', 'Brenda', 'Camila', 'Daniela', 'Elena', 'Fátima', 'Gabriela', 'Itzel', 'Jimena', 'Karen', 'Lucía', 'Melissa', 'Natalia', 'Paola', 'Regina', 'Sara', 'Tania', 'Ximena', 'Yaretzi', 'Zoe',
  'Adrián', 'Bruno', 'César', 'David', 'Eduardo', 'Gerardo', 'Hugo', 'Iván', 'Jesús', 'Kevin', 'Leonardo', 'Mauricio', 'Néstor', 'Omar', 'Pablo', 'Rodrigo', 'Santiago', 'Tomás', 'Uriel', 'Víctor', 'Axel', 'Ángel', 'Diego Alberto', 'José Manuel', 'Luis Ángel'];
const APELLIDOS = ['Acosta', 'Barradas', 'Cabrera', 'Contreras', 'Delgado', 'Espinoza', 'Figueroa', 'Galván', 'Guzmán', 'Ibarra', 'Juárez', 'Lara', 'Medina', 'Molina', 'Montes', 'Núñez', 'Olmos', 'Pineda', 'Quintero', 'Reyes', 'Rosales', 'Salazar', 'Solís', 'Trujillo', 'Valdez', 'Velasco', 'Villa', 'Zárate', 'Utrera', 'Landa'];

const MOTIVOS = ['Seguimiento de avance académico', 'Planeación de carga de materias', 'Dudas sobre servicio social', 'Bajo rendimiento en Cálculo', 'Asesoría para residencia profesional',
  'Organización de tiempos de estudio', 'Revisión de calificaciones del primer parcial', 'Orientación sobre becas', 'Problemas de adaptación', 'Materia en repetición', 'Plan de trabajo del semestre', 'Dudas de reinscripción'];
const ASUNTOS = ['Se revisó el avance en las materias del semestre.', 'Se analizaron las calificaciones del parcial y las materias con dificultad.', 'Se conversó sobre la organización del tiempo de estudio.', 'Se revisaron opciones de asesoría académica.', 'Se identificaron factores personales que afectan su rendimiento.'];
const ACUERDOS = ['El estudiante asistirá a asesorías de PALPROG dos veces por semana.', 'Entregará su horario de estudio en la próxima sesión.', 'Se reunirá con su profesor de la materia para revisar dudas.', 'Revisará la convocatoria de becas antes del cierre.', 'Mantendrá contacto semanal por correo con su tutor(a).'];
const DIAGNOSTICOS = {
  PALPROG: 'Presenta dificultades en lógica de programación y estructuras de control; reprobó el primer parcial de Fundamentos de Programación.',
  CIS: 'Muestra interés en proyectos extracurriculares; se recomienda integrarlo a la comunidad para fortalecer su sentido de pertenencia.',
  CEPC: 'Tiene buen desempeño en programación y quiere prepararse para concursos; se canaliza para entrenamiento competitivo.',
  PAPAs: 'Reprobó Cálculo Diferencial y necesita apoyo par a par para nivelarse antes del segundo parcial.',
  'Psicología/Salud': 'Manifiesta estrés y ansiedad por la carga académica y situación familiar; se sugiere orientación psicológica.',
};
const COMENTARIOS_TUTOR = ['Sería útil contar con un espacio fijo para las sesiones individuales.', 'La capacitación del semestre fue muy útil.', 'Falta tiempo en la carga docente para dar seguimiento a todos los tutorados.', null, null, 'Me gustaría recibir antes la lista de tutorados en riesgo.'];
const COMENTARIOS_ALUMNO = ['Siempre está al pendiente de cómo voy en mis materias.', 'Me ayudó mucho a organizar mi carga del semestre.', 'Me gustaría tener más sesiones durante el semestre.',
  'Muy buena atención y orientación.', 'A veces es difícil coincidir en horario.', 'Gracias a las asesorías que me recomendó pude pasar Cálculo.', 'Explica con paciencia y da buenos consejos.',
  'Las sesiones en línea me facilitaron mucho asistir.', 'Me hubiera gustado conocer antes las opciones de beca.', 'Me sentí escuchado cuando tuve problemas personales.', 'Me orientó bien sobre el servicio social.',
  'Sería bueno contar con un espacio más privado para las sesiones.', 'Las sesiones son cortas, a veces no alcanza el tiempo.', 'Me motivó a no darme de baja.'];

// ---- Construcción --------------------------------------------------------------
const L = [];
L.push(`-- =============================================================================
--  009 · Plantilla completa de tutores del programa (18) con datos del semestre
--  Generado por scripts/generar-datos-tutores.js · DATOS FICTICIOS DE DEMOSTRACIÓN
--  Contraseña de todas las cuentas nuevas: la misma de las cuentas demo.
-- =============================================================================
SET search_path = pit;

CREATE TEMP TABLE _pw ON COMMIT DROP AS
  SELECT password_hash FROM usuarios WHERE lower(correo_institucional) = ${q(CORREO_DEMO)};
`);

// tutores nuevos
const tutorRef = (correo) => `(SELECT tu.id FROM tutores tu JOIN usuarios u ON u.id = tu.usuario_id WHERE lower(u.correo_institucional) = ${q(correo)})`;
const usuarioRef = (correo) => `(SELECT id FROM usuarios WHERE lower(correo_institucional) = ${q(correo)})`;
const tutoradoRef = (nc) => `(SELECT t.id FROM tutorados t JOIN usuarios u ON u.id = t.usuario_id WHERE u.no_control_o_rfc = ${q(nc)})`;

const plantilla = [];
TUTORES.forEach((t, i) => {
  const [nombre, apellidos, rfc10, usuario, grado, esp, anios, formacion, cupo, cubiculo, areas, enfoque] = t;
  const rfc = `${rfc10}${String.fromCharCode(65 + (i % 26))}${ent(1, 9)}${String.fromCharCode(75 + (i % 10))}`;
  const correo = `${usuario}@veracruz.tecnm.mx`;
  plantilla.push({ correo, nombre: `${nombre} ${apellidos}`, cupo });
  L.push(`INSERT INTO usuarios (no_control_o_rfc, nombre, apellidos, correo_institucional, password_hash, rol)
  SELECT ${q(rfc)}, ${q(nombre)}, ${q(apellidos)}, ${q(correo)}, password_hash, 'tutor' FROM _pw
  ON CONFLICT DO NOTHING;
INSERT INTO tutores (usuario_id, departamento, cubiculo, max_tutorados, formacion_tutorial, presentacion, areas_apoyo, grado_academico, especialidad, anios_experiencia, frase, enfoque, acepta_tutorados)
  SELECT ${usuarioRef(correo)}, 'Sistemas y Computación', ${q(cubiculo)}, ${cupo}, ${q(formacion)}, ${q(PRESENTACION(t))}, ${arr(areas)}, ${q(grado)}, ${q(esp)}, ${anios}, ${q(elegir(FRASES))}, ${arr(enfoque)}, ${i === 12 ? 'false' : 'true'}
  WHERE NOT EXISTS (SELECT 1 FROM tutores WHERE usuario_id = ${usuarioRef(correo)});`);
  // horario: 2 a 4 bloques de 2 h en días distintos
  const dias = mezclar([1, 2, 3, 4, 5]).slice(0, ent(2, 4)).sort();
  dias.forEach((d) => {
    const h = elegir([8, 9, 10, 11, 12, 13, 15, 16, 17]);
    L.push(`INSERT INTO tutor_horarios (tutor_id, dia_semana, hora_inicio, hora_fin) SELECT ${tutorRef(correo)}, ${d}, '${String(h).padStart(2, '0')}:00', '${String(h + 2).padStart(2, '0')}:00' ON CONFLICT DO NOTHING;`);
  });
  plantilla[plantilla.length - 1].horario = dias.map((d) => ({ d, h: null }));
});

// Roberto (demo) también recibe algunos tutorados para no quedar vacío
const CUPOS = plantilla.map((p) => ({ ...p, n: Math.max(2, p.cupo - ent(1, 4)) }));
CUPOS.push({ correo: 'roberto.gf@veracruz.tecnm.mx', nombre: 'Roberto Gómez Fernández', n: 4 });
// Uno de los nuevos queda sin tutorados para que se vea el caso
CUPOS[12].n = 0;

// ---- tutorados ------------------------------------------------------------------
const usados = new Set();
let consecutivo = 0;
const grupoLetra = {};
const tutorados = [];
CUPOS.forEach((tut) => {
  for (let k = 0; k < tut.n; k++) {
    const semestre = elegir([1, 1, 3, 3, 3, 5, 5, 7, 7, 9]);
    const anioIng = 2026 - Math.floor((semestre - 1) / 2);
    const periodoIng = `${anioIng}-2`;
    let nombre; let ap1; let ap2;
    do { nombre = elegir(NOMBRES); ap1 = elegir(APELLIDOS); ap2 = elegir(APELLIDOS); } while (ap1 === ap2 || usados.has(`${nombre}${ap1}${ap2}`));
    usados.add(`${nombre}${ap1}${ap2}`);
    consecutivo += 1;
    const nc = `${String(anioIng).slice(2)}02${String(1000 + consecutivo * 7).padStart(4, '0')}`;
    const reprob = elegir([0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 4]);
    const esperado = ((semestre - 1) / 9) * 100;
    const avance = Math.max(0, Math.min(100, Math.round((esperado - reprob * 3 + ent(-4, 6)) * 100) / 100));
    const promedio = Math.round((reprob ? ent(68, 82) : ent(80, 97)) + rnd() * 0.9);
    const letra = grupoLetra[tut.correo] || (grupoLetra[tut.correo] = elegir(['A', 'B']));
    const grupo = `${semestre}°${letra} ISC`;
    tutorados.push({ nc, nombre, apellidos: `${ap1} ${ap2}`, semestre, tutor: tut, reprob, grupo });
    L.push(`INSERT INTO usuarios (no_control_o_rfc, nombre, apellidos, correo_institucional, password_hash, rol)
  SELECT ${q(nc)}, ${q(nombre)}, ${q(`${ap1} ${ap2}`)}, ${q(`l${nc}@veracruz.tecnm.mx`)}, password_hash, 'alumno' FROM _pw ON CONFLICT DO NOTHING;
INSERT INTO tutorados (usuario_id, semestre, periodo_ingreso, materias_reprobadas, avance_reticular_pct, promedio, telefono)
  SELECT ${usuarioRef(`l${nc}@veracruz.tecnm.mx`)}, ${semestre}, '${periodoIng}', ${reprob}, ${avance}, ${promedio}, '229${ent(1000000, 9999999)}'
  WHERE NOT EXISTS (SELECT 1 FROM tutorados WHERE usuario_id = ${usuarioRef(`l${nc}@veracruz.tecnm.mx`)});
INSERT INTO asignaciones_tutoria (tutor_id, tutorado_id, periodo_escolar, grupo, origen, fecha_asignacion)
  SELECT ${tutorRef(tut.correo)}, ${tutoradoRef(nc)}, '${PERIODO}', ${q(grupo)}, 'Elección del tutorado', DATE '2026-08-${ent(24, 31)}'
  WHERE NOT EXISTS (SELECT 1 FROM asignaciones_tutoria WHERE tutorado_id = ${tutoradoRef(nc)} AND periodo_escolar = '${PERIODO}' AND estatus_asignacion = 'Activa');`);
  }
});

// ---- citas del semestre ------------------------------------------------------------
const diasClase = [];
for (let d = new Date(`${INICIO}T12:00:00Z`); d <= new Date('2026-12-04T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
  const ymd = d.toISOString().slice(0, 10);
  const dow = d.getUTCDay();
  if (dow >= 1 && dow <= 5 && diaDeClases(ymd)) diasClase.push(ymd);
}
const ocupado = new Set();
const citaSql = (tut, nc, ymd, hora, campos) => {
  const clave = `${tut.correo}|${ymd}|${hora}`;
  if (ocupado.has(clave)) return null;
  ocupado.add(clave);
  return `INSERT INTO citas_tutorias (tutor_id, tutorado_id, fecha_hora, duracion_min, tipo, modalidad, motivo, estatus, asistio, duracion_real_min, atendida_en, minuta, creado_por)
  SELECT ${tutorRef(tut.correo)}, ${tutoradoRef(nc)}, TIMESTAMPTZ '${ymd} ${hora}:00-06', 60, 'Individual', ${q(campos.modalidad)}, ${q(campos.motivo)}, ${q(campos.estatus)}, ${campos.asistio === null ? 'NULL' : campos.asistio}, ${campos.duracion || 'NULL'}, ${campos.estatus === 'Completada' || campos.asistio === false ? `TIMESTAMPTZ '${ymd} ${hora}:00-06' + interval '70 minutes'` : 'NULL'}, ${campos.minuta ? `${q(JSON.stringify(campos.minuta))}::jsonb` : 'NULL'}, ${usuarioRef(`l${nc}@veracruz.tecnm.mx`)}
  ON CONFLICT DO NOTHING;`;
};
const pasados = diasClase.filter((d) => d < HOY);
const futuros = diasClase.filter((d) => d >= HOY);
tutorados.forEach((a) => {
  const n = a.reprob >= 2 ? ent(3, 5) : ent(1, 3);
  const fechas = mezclar(pasados).slice(0, n).sort();
  fechas.forEach((ymd) => {
    const hora = `${String(elegir([8, 9, 10, 11, 12, 13, 15, 16, 17])).padStart(2, '0')}:00`;
    const r = rnd();
    let campos;
    if (r < 0.8) {
      campos = { estatus: 'Completada', asistio: true, duracion: elegir([30, 30, 45, 45, 60]), modalidad: rnd() < 0.8 ? 'Presencial' : 'Línea', motivo: elegir(MOTIVOS),
        minuta: rnd() < 0.75 ? { asuntos: elegir(ASUNTOS), acuerdos: elegir(ACUERDOS), actualizada: `${ymd}T20:00:00.000Z` } : null };
    } else if (r < 0.9) {
      campos = { estatus: 'Cancelada', asistio: false, modalidad: 'Presencial', motivo: elegir(MOTIVOS) };
    } else {
      campos = { estatus: 'Cancelada', asistio: null, modalidad: 'Presencial', motivo: elegir(MOTIVOS) };
    }
    const s = citaSql(a.tutor, a.nc, ymd, hora, campos);
    if (s) L.push(s);
  });
  // próxima cita para la mitad de los tutorados
  if (rnd() < 0.5) {
    const ymd = elegir(futuros.slice(0, 8));
    const hora = `${String(elegir([9, 10, 11, 12, 13, 16, 17])).padStart(2, '0')}:00`;
    const s = citaSql(a.tutor, a.nc, ymd, hora, { estatus: rnd() < 0.7 ? 'Confirmada' : 'Pendiente', asistio: null, modalidad: rnd() < 0.8 ? 'Presencial' : 'Línea', motivo: elegir(MOTIVOS) });
    if (s) L.push(s);
  }
});

// ---- evaluación del tutor al programa (14 de 15 nuevos) -------------------------------
plantilla.forEach((t, i) => {
  if (i === 6) return; // uno pendiente
  const base = elegir([1, 2, 2, 2, 3]);
  const v = Array.from({ length: 11 }, (_, k) => Math.min(5, Math.max(1, base + (k === 8 || k === 7 ? 1 : 0) + ent(-1, 1))));
  const dia = elegir(pasados.filter((d) => d >= '2026-11-09'));
  L.push(`INSERT INTO evaluaciones_tutor (tutor_id, periodo, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, comentarios, fecha_envio)
  SELECT ${tutorRef(t.correo)}, '${PERIODO}', ${v.join(', ')}, ${q(elegir(COMENTARIOS_TUTOR))}, TIMESTAMPTZ '${dia} 1${ent(0, 8)}:${ent(10, 59)}:00-06'
  ON CONFLICT (tutor_id, periodo) DO NOTHING;`);
});

// ---- evaluación del tutorado a su tutor (≈65 %) ------------------------------------
tutorados.forEach((a) => {
  if (rnd() > 0.65) return;
  const base = elegir([1, 1, 2, 2, 2, 3]);
  const resp = Object.fromEntries(CLAVES_ALUMNO.map((k) => [k, Math.min(5, Math.max(1, base + ent(-1, 1)))]));
  const dia = elegir(pasados.filter((d) => d >= '2026-11-09'));
  L.push(`INSERT INTO evaluaciones_alumno (tutorado_id, tutor_id, periodo, respuestas, comentarios, fecha_envio)
  SELECT ${tutoradoRef(a.nc)}, ${tutorRef(a.tutor.correo)}, '${PERIODO}', ${q(JSON.stringify(resp))}::jsonb, ${rnd() < 0.4 ? q(elegir(COMENTARIOS_ALUMNO)) : 'NULL'}, TIMESTAMPTZ '${dia} 1${ent(0, 9)}:${ent(10, 59)}:00-06'
  ON CONFLICT DO NOTHING;`);
});

// ---- canalizaciones con bitácora ------------------------------------------------------
const AREAS = ['PALPROG', 'PAPAs', 'Psicología/Salud', 'CIS', 'CEPC'];
const candidatos = mezclar(tutorados.filter((a) => a.reprob >= 1)).slice(0, 18);
candidatos.forEach((a) => {
  const area = a.reprob >= 2 ? elegir(['PALPROG', 'PAPAs', 'Psicología/Salud']) : elegir(AREAS);
  const estatus = elegir(['Pendiente', 'En Proceso', 'En Proceso', 'Aceptado', 'Atendido', 'Atendido', 'Cerrado']);
  const ymd = elegir(pasados.filter((d) => d < '2026-11-10'));
  const cerrada = estatus === 'Atendido' || estatus === 'Cerrado';
  const tutorU = `(SELECT usuario_id FROM tutores WHERE id = ${tutorRef(a.tutor.correo)})`;
  L.push(`WITH k AS (
  INSERT INTO canalizaciones (tutorado_id, tutor_id, area_destino, diagnostico_inicial, estatus_canalizacion, fecha_registro, fecha_cierre)
  SELECT ${tutoradoRef(a.nc)}, ${tutorRef(a.tutor.correo)}, ${q(area)}, ${q(DIAGNOSTICOS[area])}, ${q(estatus)}, TIMESTAMPTZ '${ymd} 12:00:00-06', ${cerrada ? `TIMESTAMPTZ '${ymd} 12:00:00-06' + interval '${ent(8, 20)} days'` : 'NULL'}
  WHERE NOT EXISTS (SELECT 1 FROM canalizaciones WHERE tutorado_id = ${tutoradoRef(a.nc)} AND area_destino = ${q(area)})
  RETURNING id, estatus_canalizacion, fecha_registro, fecha_cierre
)
INSERT INTO canalizacion_seguimientos (canalizacion_id, usuario_id, estatus_anterior, estatus_nuevo, nota, fecha)
  SELECT id, ${tutorU}, NULL::estatus_canalizacion, 'Pendiente'::estatus_canalizacion, 'Canalización registrada. ' || ${q(DIAGNOSTICOS[area])}, fecha_registro FROM k
  UNION ALL
  SELECT id, ${tutorU}, 'Pendiente'::estatus_canalizacion, estatus_canalizacion, ${q(cerrada ? 'El área confirmó que el tutorado concluyó la atención.' : 'El área recibió al tutorado y dio inicio a la atención.')}, COALESCE(fecha_cierre, fecha_registro + interval '5 days') FROM k WHERE estatus_canalizacion <> 'Pendiente';`);
});


const destino = path.join(__dirname, '..', 'database', 'nube', '009_tutores_programa.sql');
fs.writeFileSync(destino, `${L.join('\n')}\n`);
fs.writeFileSync(path.join(__dirname, '..', 'database', 'datos_012_tutores_programa.sql'),
  `${L.join('\n').replace('SET search_path = pit;\n', '')}\n`);
console.log(`Escrito ${destino}: ${plantilla.length} tutores nuevos, ${tutorados.length} tutorados, ${ocupado.size} citas.`);
