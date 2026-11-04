'use strict';

/**
 * Instrumento oficial: "Evaluación del Tutor hacia el Programa de Tutorías (PIT)".
 * Fuente única de las preguntas: la API las envía al frontend para que el
 * formulario del tutor y el reporte de coordinación siempre coincidan.
 */
const PREGUNTAS = [
  { clave: 'p1', texto: '¿Considera que cuenta con la información necesaria sobre el programa de tutorías del plantel?' },
  { clave: 'p2', texto: '¿Cuenta con todas las facilidades del departamento para ejercer el programa de tutorías?' },
  { clave: 'p3', texto: 'Si no entiende algún problema de sus tutorados, ¿los canaliza a la instancia correspondiente fácilmente?' },
  { clave: 'p4', texto: '¿Tiene a la mano los instrumentos necesarios para identificar las necesidades de tutoría?' },
  { clave: 'p5', texto: '¿La programación de las asignaturas en la carrera de sus tutorados les permite asistir a las actividades de apoyo y/o cursos de mejora programadas?' },
  { clave: 'p6', texto: '¿Mantiene buena comunicación y relaciones interpersonales con sus tutorados?' },
  { clave: 'p7', texto: '¿Tiene buena comunicación con la coordinadora de tutoría?' },
  { clave: 'p8', texto: '¿El tiempo que tiene para preparar sus actividades tutoriales es suficiente?' },
  { clave: 'p9', texto: '¿El espacio donde lleva a cabo la actividad tutorial es agradable y posee todos los requerimientos necesarios?' },
  { clave: 'p10', texto: '¿Ha recibido la capacitación necesaria para ejercer la tutoría?' },
  { clave: 'p11', texto: 'En el plantel, ¿existe la actualización permanente en cuanto al programa de tutoría?' },
];

// 1 = respuesta más favorable
const ESCALA = [
  { valor: 1, etiqueta: 'Siempre' },
  { valor: 2, etiqueta: 'Casi siempre' },
  { valor: 3, etiqueta: 'A veces' },
  { valor: 4, etiqueta: 'Casi nunca' },
  { valor: 5, etiqueta: 'Nunca' },
];

const CLAVES = PREGUNTAS.map((p) => p.clave);

/**
 * Instrumento del TUTORADO: evaluación del acompañamiento tutorial.
 * Una sola lista numerada 1, 2, 3… con la escala Likert (1 = Siempre … 5 = Nunca)
 * más la opción 0 = "No aplica", que no cuenta en los promedios.
 * Las claves internas (s4a, s5b, …) se conservan del instrumento original para
 * que las respuestas ya guardadas sigan coincidiendo.
 */
const ITEMS_ALUMNO = [
  ['s4a', 'El tutor muestra interés en los problemas académicos que afectan el rendimiento.'],
  ['s4b', 'El tutor muestra disposición a mantener una comunicación permanente.'],
  ['s4d', 'El tutor posee capacidad para resolver las dudas académicas del tutorado.'],
  ['s4e', 'El tutor brinda orientación profesional y realiza las acciones pertinentes para resolver dudas.'],
  ['s4f', 'El tutor conoce la normatividad institucional para aconsejar opciones adecuadas a mis problemas escolares.'],
  ['s4i', 'El tutor desarrolla estrategias para detectar el alto o bajo rendimiento académico del grupo.'],
  ['s4k', 'El tutor resalta la importancia de participar en eventos, talleres y congresos profesionales.'],
  ['s4n', 'El tutor ha contribuido para visualizar las perspectivas laborales en el campo profesional.'],
  ['s4p', 'Participar en el programa de tutoría ha mejorado mi desempeño académico.'],
  ['s5b', 'El tutor dio a conocer su horario y el tiempo disponible para el proceso de tutoría.'],
  ['s5e', 'Contribuye a crear un clima de confianza que motiva a plantear dificultades académicas y personales.'],
  ['s5f', 'Participar en tutorías ha mejorado mi problemática personal.'],
  ['s5g', 'Mi integración a la universidad ha mejorado con el programa de tutoría.'],
  ['s5h', 'Es satisfactorio el programa de tutoría recibido.'],
  ['s5i', 'El tutor tiene capacidad para canalizarme al área adecuada (pedagógica, psicológica, médica, etc.).'],
  ['s5j', 'El tutor me motiva a desarrollar estrategias de autoaprendizaje.'],
  ['s5k', 'El tutor con sus estrategias ha favorecido mi autonomía.'],
  ['s5l', 'El tutor ha sido un factor positivo en mi capacidad de socializar.'],
  ['s5m', 'El tutor con su labor ha influido positivamente en mis calificaciones.'],
  ['s5n', 'El tutor atiende las quejas e inconformidades que le presento.'],
  ['s5o', 'En caso necesario se cuenta con un espacio digno y privado para la atención individual.'],
  ['s5p', 'El tutor me orienta para establecer un plan de trabajo acorde a mis necesidades académicas.'],
  ['s5q', 'El tutor me orienta para mejorar mis hábitos de estudio y técnicas de aprendizaje.'],
];

const SECCIONES_ALUMNO = [
  {
    id: 1,
    titulo: null,
    preguntas: ITEMS_ALUMNO.map(([clave, texto], i) => ({ clave, numero: String(i + 1), texto })),
  },
];

// Escala del tutorado: la Likert de siempre + "No aplica" (valor 0)
const NO_APLICA = 0;
const ESCALA_ALUMNO = [...ESCALA, { valor: NO_APLICA, etiqueta: 'No aplica' }];

const PREGUNTAS_ALUMNO = SECCIONES_ALUMNO.flatMap((s) => s.preguntas.map((p) => ({ ...p, seccion: s.id })));
const CLAVES_ALUMNO = PREGUNTAS_ALUMNO.map((p) => p.clave);

module.exports = {
  PREGUNTAS, ESCALA, CLAVES, SECCIONES_ALUMNO, PREGUNTAS_ALUMNO, CLAVES_ALUMNO, ESCALA_ALUMNO, NO_APLICA,
};
