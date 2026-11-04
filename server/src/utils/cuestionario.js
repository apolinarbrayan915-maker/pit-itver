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
 * Secciones 4 y 5 · misma escala Likert (1 = Siempre … 5 = Nunca).
 * Clave interna: s4a…s4p, s5a…s5r  ·  número visible: "4.a", "5.r", etc.
 */
const reactivos = (seccion, textos) =>
  textos.map((texto, i) => {
    const letra = String.fromCharCode(97 + i);
    return { clave: `s${seccion}${letra}`, numero: `${seccion}.${letra}`, texto };
  });

const SECCIONES_ALUMNO = [
  {
    id: 4,
    titulo: 'Sección 4: Ítems de Rezago y Evaluación del Acompañamiento Tutorial',
    preguntas: reactivos(4, [
      'El tutor muestra interés en los problemas académicos que afectan el rendimiento.',
      'El tutor muestra disposición a mantener una comunicación permanente.',
      'El tutor proporcionó información en el primer semestre sobre la aprobación de asignaturas.',
      'El tutor posee capacidad para resolver dudas académicas del alumno.',
      'El tutor brinda orientación profesional y realiza las acciones pertinentes para resolver dudas.',
      'El tutor conoce la normatividad institucional para aconsejar opciones adecuadas a mis problemas escolares.',
      'El tutor lleva a cabo estrategias para la supervisión del desempeño individual.',
      'El tutor lleva a cabo estrategias para la supervisión del desempeño grupal.',
      'El tutor desarrolla estrategias para detectar el alto o bajo rendimiento académico del grupo.',
      'El tutor procura el diálogo con todos los miembros del grupo para la solución de conflictos.',
      'El tutor resalta la importancia de participar en eventos, talleres y congresos profesionales.',
      'El tutor ha contribuido a ampliar mis perspectivas académicas.',
      'El tutor aclara dudas acerca de trámites administrativos (becas, seguro médico, servicio social, etc.).',
      'El tutor ha contribuido para visualizar las perspectivas laborales en el campo profesional.',
      'El tutor me ayuda a valorar el sentido profesional de mi carrera.',
      'Participar en el programa de tutoría ha mejorado mi desempeño académico.',
    ]),
  },
  {
    id: 5,
    titulo: 'Sección 5',
    preguntas: reactivos(5, [
      'El tutor se presentó en los primeros días del semestre.',
      'El tutor dio a conocer su horario y el tiempo disponible para el proceso de tutoría.',
      'Explicó detalladamente el modelo educativo del TecNM en el primer semestre.',
      'Presentó los formatos e instrumentos de tutoría durante el semestre.',
      'Contribuye a crear un clima de confianza que motiva a plantear dificultades académicas y personales.',
      'Participar en tutorías ha mejorado mi problemática personal.',
      'Mi integración a la universidad ha mejorado con el programa de tutoría.',
      'Es satisfactorio el programa de tutoría recibido.',
      'El tutor tiene capacidad para canalizarme al área adecuada (pedagógica, psicológica, médica, etc.).',
      'El tutor me motiva a desarrollar estrategias de autoaprendizaje.',
      'El tutor con sus estrategias ha favorecido mi autonomía.',
      'El tutor ha sido un factor positivo en mi capacidad de socializar.',
      'El tutor con su labor ha influido positivamente en mis calificaciones.',
      'El tutor atiende las quejas e inconformidades que le presento.',
      'En caso necesario se cuenta con un espacio digno y privado para la atención individual.',
      'El tutor me orienta para establecer un plan de trabajo acorde a mis necesidades académicas.',
      'El tutor me orienta para mejorar mis hábitos de estudio y técnicas de aprendizaje.',
      'El tutor atiende y da seguimiento a los casos de baja o deserción en el grupo.',
    ]),
  },
];

const PREGUNTAS_ALUMNO = SECCIONES_ALUMNO.flatMap((s) => s.preguntas.map((p) => ({ ...p, seccion: s.id })));
const CLAVES_ALUMNO = PREGUNTAS_ALUMNO.map((p) => p.clave);

module.exports = {
  PREGUNTAS, ESCALA, CLAVES, SECCIONES_ALUMNO, PREGUNTAS_ALUMNO, CLAVES_ALUMNO,
};
