-- 016: Completa los datos de demostración para que ninguna pantalla muestre campos vacíos.
--  * Tutores del catálogo docente: presentación, "¿en qué puedo apoyarte?" y áreas limpias
--    (solo con lo que reporta el catálogo; no se inventan grado, años ni frases de personas reales).
--  * Tutorados (ficticios): perfil completo y Ficha de Identificación para los 80.
--  * Citas, canalizaciones y asignaciones: minutas, asistencia, grupos y seguimiento.
--  * Limpieza de textos de prueba ("asdf…", "Prueba del aviso…").
-- Es idempotente: solo llena lo que está vacío.
SET search_path = pit;

-- Número pseudoaleatorio estable a partir de un texto (mismo resultado en cada instalación).
CREATE OR REPLACE FUNCTION pg_temp.h(t text, sal text, n int) RETURNS int LANGUAGE sql IMMUTABLE AS
$$ SELECT ((('x' || substr(md5(t || sal), 1, 8))::bit(32)::bigint % n) + 1)::int $$;
CREATE OR REPLACE FUNCTION pg_temp.pick(t text, sal text, arr text[]) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT arr[pg_temp.h(t, sal, array_length(arr, 1))] $$;

-- =============================================================================
-- 1. TUTORES DEL CATÁLOGO DOCENTE
-- =============================================================================
-- Etiquetas con errores de captura en el catálogo de origen
UPDATE tutores SET especialidad = 'Orientación académica', areas_apoyo = ARRAY['Orientación académica', 'Hábitos de estudio']
 WHERE especialidad ILIKE 'sexo%' OR 'Sexo' = ANY (areas_apoyo);
UPDATE tutores SET especialidad = 'Matemáticas y simulación', areas_apoyo = ARRAY['Matemáticas y simulación'] WHERE especialidad = 'Matematias';
UPDATE tutores SET especialidad = 'Física', areas_apoyo = ARRAY['Física'] WHERE especialidad = 'Fisica';
UPDATE tutores SET especialidad = 'Física', areas_apoyo = ARRAY['Física', 'Lenguajes de interfaz'] WHERE especialidad = 'Fisica moderna';
UPDATE tutores SET especialidad = 'Fundamentos de telecomunicaciones', areas_apoyo = ARRAY['Fundamentos de telecomunicaciones', 'Sistemas de información'] WHERE especialidad = 'Fund.Telecom';
UPDATE tutores SET especialidad = 'Ingeniería de sistemas', areas_apoyo = ARRAY['Ingeniería de sistemas'] WHERE especialidad = 'Ing. De sistemas';
UPDATE tutores SET especialidad = 'Orientación académica', areas_apoyo = ARRAY['Orientación académica'] WHERE especialidad = 'DESI';

-- "¿En qué puedo apoyarte?" a partir de las áreas del catálogo
WITH mapa(area, frase) AS (VALUES
  ('Programación y algoritmos', 'Reforzar lógica y programación'),
  ('Bases de datos', 'Diseño y consultas de bases de datos'),
  ('Matemáticas y simulación', 'Cálculo y matemáticas para ingeniería'),
  ('Redes y servicios', 'Redes y configuración de servicios'),
  ('Desarrollo web y móvil', 'Proyectos web y móviles'),
  ('Ingeniería de software y proyectos', 'Planear y documentar proyectos de software'),
  ('Investigación y formación transversal', 'Redacción y proyectos de investigación'),
  ('Lenguajes y compiladores', 'Lenguajes, autómatas y compiladores'),
  ('Cómputo paralelo y distribuido', 'Cómputo paralelo y distribuido'),
  ('Arquitectura, hardware y embebidos', 'Arquitectura de computadoras y hardware'),
  ('Arquitectura, hardware y sistemas embebidos', 'Arquitectura de computadoras y hardware'),
  ('Sistemas operativos e infraestructura', 'Sistemas operativos e infraestructura'),
  ('IA y análisis de datos', 'Inteligencia artificial y análisis de datos'),
  ('Gráficos, interacción y UX', 'Interfaces, graficación y experiencia de usuario'),
  ('Física', 'Física para ingeniería'),
  ('Lenguajes de interfaz', 'Lenguajes de interfaz'),
  ('Fundamentos de telecomunicaciones', 'Fundamentos de telecomunicaciones'),
  ('Sistemas de información', 'Sistemas de información'),
  ('Ingeniería de sistemas', 'Pensamiento sistémico y modelado'),
  ('Orientación académica', 'Orientación académica general'),
  ('Hábitos de estudio', 'Mejorar hábitos de estudio')
)
UPDATE tutores tu SET enfoque = sub.enfoque
  FROM (
    SELECT t.id, (array_agg(DISTINCT m.frase))[1:3] || ARRAY['Planear tu carga académica y retícula'] AS enfoque
      FROM tutores t CROSS JOIN LATERAL unnest(t.areas_apoyo) a(area)
      JOIN mapa m ON m.area = a.area
     WHERE t.catalogo_materias_id IS NOT NULL
  GROUP BY t.id
  ) sub
 WHERE tu.id = sub.id AND coalesce(cardinality(tu.enfoque), 0) = 0;

-- Presentación: departamento y áreas en las que acompaña (datos del catálogo)
UPDATE tutores tu
   SET presentacion = 'Docente del Departamento de Sistemas y Computación del Instituto Tecnológico de Veracruz. '
       || 'En la tutoría acompaña a los estudiantes de Ingeniería en Sistemas Computacionales en '
       || lower(array_to_string(tu.areas_apoyo[1:3], ', '))
       || ', además de orientarlos para organizar su carga académica y avanzar en su retícula.'
 WHERE tu.catalogo_materias_id IS NOT NULL AND (tu.presentacion IS NULL OR trim(tu.presentacion) = '');

-- =============================================================================
-- 2. TUTORADOS
-- =============================================================================
CREATE TEMP TABLE _al ON COMMIT DROP AS
SELECT t.id, u.id AS usuario_id, u.no_control_o_rfc AS nc, u.nombre, u.apellidos, u.correo_institucional AS correo,
       t.semestre, t.nivel_riesgo::text AS riesgo, t.materias_reprobadas AS mr, t.telefono,
       split_part(u.apellidos, ' ', 1) AS ap_pat,
       coalesce(nullif(substr(u.apellidos, length(split_part(u.apellidos, ' ', 1)) + 2), ''), 'Hernández') AS ap_mat,
       split_part(u.nombre, ' ', 1) = ANY (ARRAY['Elena','Sara','Melissa','Itzel','Natalia','Lucía','Camila','Ximena','Alejandra',
         'Sofía','Gabriela','Karen','Andrea','Fernanda','Regina','Fátima','Valeria','Mariana','Brenda','Yaretzi']) AS mujer
  FROM tutorados t JOIN usuarios u ON u.id = t.usuario_id;

ALTER TABLE _al ADD COLUMN ciudad text, ADD COLUMN nacimiento date, ADD COLUMN ocupacion text, ADD COLUMN trabaja boolean;
UPDATE _al SET
  ciudad = pg_temp.pick(nc, 'ciudad', ARRAY['Veracruz','Veracruz','Veracruz','Boca del Río','Boca del Río','Xalapa','Córdoba','Orizaba',
           'Alvarado','Medellín de Bravo','La Antigua','Tierra Blanca','Poza Rica de Hidalgo','Coatzacoalcos','Papantla',
           'Martínez de la Torre','Paso de Ovejas','Cosamaloapan de Carpio']) || ', Veracruz',
  nacimiento = make_date(2025 - 17 - (semestre + 1) / 2, pg_temp.h(nc, 'mes', 12), pg_temp.h(nc, 'dia', 28)),
  ocupacion = pg_temp.pick(nc, 'ocup', ARRAY['Solo estudiante','Solo estudiante','Solo estudiante','Solo estudiante','Solo estudiante',
           'Estudiante y trabajo de medio tiempo','Estudiante y trabajo de medio tiempo','Estudiante y apoyo en el negocio familiar',
           'Estudiante y trabajo por mi cuenta','Estudiante y cuido a familiares u hogar','Estudiante y deportista de alto rendimiento']);
UPDATE _al SET trabaja = ocupacion LIKE 'Estudiante y trabajo%' OR ocupacion = 'Estudiante y apoyo en el negocio familiar';

-- Promedio de quienes aún no tenían (nuevo ingreso: promedio parcial del semestre)
UPDATE tutorados t SET promedio = 80 + pg_temp.h(a.nc, 'prom', 15)
  FROM _al a WHERE a.id = t.id AND t.promedio IS NULL;

-- ---- Perfil "persona" del tutorado -----------------------------------------------------
INSERT INTO perfiles_tutorado (tutorado_id) SELECT id FROM _al ON CONFLICT (tutorado_id) DO NOTHING;

UPDATE perfiles_tutorado p SET
  ciudad_natal = coalesce(nullif(p.ciudad_natal, ''), a.ciudad),
  fecha_nacimiento = coalesce(p.fecha_nacimiento, a.nacimiento),
  ocupacion = coalesce(nullif(p.ocupacion, ''), a.ocupacion),
  familia = coalesce(nullif(p.familia, ''), pg_temp.pick(a.nc, 'fam', ARRAY['Padre, Madre, Hermanos','Padre, Madre, Hermanos',
            'Padre, Madre, Hermanos','Madre, Hermanos','Padre, Madre','Madre'])),
  frase = coalesce(nullif(p.frase, ''), pg_temp.pick(a.nc, 'frase', ARRAY[
            'Paso a paso también se llega lejos','Quiero ser la primera persona de mi familia en titularse',
            'Aprender algo nuevo cada día','La constancia vale más que el talento','Si no sé algo, lo investigo',
            'Me gusta entender cómo funcionan las cosas','Disciplina hoy, libertad mañana','Cada error es una lección',
            'Quiero crear tecnología que ayude a mi comunidad','Organizarme es mi meta de este semestre',
            'Lo difícil no es imposible','Programar me enseñó a tener paciencia'])),
  intereses = CASE WHEN coalesce(cardinality(p.intereses), 0) = 0 THEN ARRAY(
            SELECT DISTINCT x FROM unnest(ARRAY[
              pg_temp.pick(a.nc, 'i1', ARRAY['Programación','Bases de datos','Redes','Matemáticas']),
              pg_temp.pick(a.nc, 'i2', ARRAY['Hábitos de estudio','Inglés','Retícula y carga académica','Manejo del estrés']),
              CASE WHEN a.semestre >= 7 THEN pg_temp.pick(a.nc, 'i3', ARRAY['Servicio social y residencias','Titulación'])
                   WHEN a.semestre <= 2 THEN pg_temp.pick(a.nc, 'i3', ARRAY['Orientación vocacional','Becas y trámites'])
                   ELSE pg_temp.pick(a.nc, 'i3', ARRAY['Becas y trámites','Orientación vocacional','Inglés']) END]) x)
            ELSE p.intereses END,
  objetivos = CASE WHEN coalesce(cardinality(p.objetivos), 0) = 0 THEN CASE
            WHEN a.riesgo IN ('ALTO','CRÍTICO') THEN ARRAY['Acreditar las asignaturas que lleva en recursamiento',
                 'Organizar un horario de estudio semanal', 'No dar de baja más materias este semestre']
            WHEN a.riesgo = 'MEDIO' THEN ARRAY['Regularizar la asignatura que tiene pendiente',
                 'Subir su promedio al cierre del semestre', 'Asistir a asesorías de forma constante']
            WHEN a.semestre >= 7 THEN ARRAY['Concluir su servicio social', 'Elegir un buen proyecto de residencia profesional',
                 'Mantener su promedio arriba de 85']
            ELSE ARRAY['Mantener su promedio arriba de 85', 'Mejorar su nivel de inglés',
                 'Participar en un proyecto o concurso de programación'] END
            ELSE p.objetivos END,
  frustraciones = CASE WHEN coalesce(cardinality(p.frustraciones), 0) = 0 THEN CASE
            WHEN a.trabaja THEN ARRAY['Su horario de trabajo choca con algunas asesorías', 'Le cuesta tener tiempo para estudiar entre semana']
            WHEN a.riesgo IN ('ALTO','CRÍTICO') THEN ARRAY['Siente que se atrasa respecto a su generación', 'No sabe a quién acudir cuando no entiende un tema']
            WHEN a.semestre <= 2 THEN ARRAY['Todavía se está adaptando al ritmo del Tecnológico', 'Le cuesta organizar las tareas de varias materias']
            ELSE ARRAY['Pocos espacios de práctica fuera del horario de clases', 'Le gustaría más orientación sobre su especialidad'] END
            ELSE p.frustraciones END,
  biografia = coalesce(nullif(p.biografia, ''),
            a.nombre || ' cursa ' || a.semestre || '.° semestre de Ingeniería en Sistemas Computacionales. '
            || CASE WHEN a.riesgo IN ('ALTO','CRÍTICO') THEN 'Tiene ' || a.mr || ' asignaturas pendientes y busca apoyo para organizar su carga académica. '
                    WHEN a.riesgo = 'MEDIO' THEN 'Lleva una asignatura en recursamiento y quiere ponerse al corriente este semestre. '
                    ELSE 'Mantiene un buen promedio y entrega sus actividades a tiempo. ' END
            || CASE WHEN a.trabaja THEN 'Combina la escuela con el trabajo, por lo que prefiere asesorías por la mañana.'
                    WHEN a.semestre <= 2 THEN 'Es de nuevo ingreso y está conociendo los servicios del Tecnológico.'
                    WHEN a.semestre >= 7 THEN 'Se prepara para el servicio social y la residencia profesional.'
                    ELSE 'Le interesa participar en proyectos y actividades extracurriculares.' END),
  updated_at = now()
  FROM _al a WHERE a.id = p.tutorado_id;

-- ---- Ficha de Identificación (Anexo 6) ------------------------------------------------
INSERT INTO fichas_identificacion (tutorado_id, datos, estado, fecha_envio, fecha_revision, revisada_por, actualizado_por, actualizado_por_rol, observaciones, updated_at)
SELECT a.id,
  jsonb_build_object(
    'nombres', a.nombre, 'apellido_paterno', a.ap_pat, 'apellido_materno', a.ap_mat,
    'sexo', CASE WHEN a.mujer THEN 'Mujer' ELSE 'Hombre' END,
    'fecha', to_char(date '2026-08-24' + pg_temp.h(a.nc, 'fen', 40), 'YYYY-MM-DD'),
    'carrera', 'Ingeniería en Sistemas Computacionales', 'semestre', a.semestre, 'correo', a.correo,
    'fecha_nacimiento', to_char(coalesce(p.fecha_nacimiento, a.nacimiento), 'YYYY-MM-DD'),
    'lugar_nacimiento', coalesce(nullif(p.ciudad_natal, ''), a.ciudad),
    'estado_civil', 'Soltero(a)', 'estado_civil_otro', '', 'num_hijos', 0,
    'domicilio', pg_temp.pick(a.nc, 'calle', ARRAY['Av. Díaz Mirón','Calle Independencia','Av. Cuauhtémoc','Calle Juan Soto',
                 'Av. Salvador Díaz Mirón','Calle Lerdo','Av. Ruiz Cortines','Calle Mario Molina','Av. Miguel Alemán','Calle Arista'])
                 || ' ' || (100 + pg_temp.h(a.nc, 'num', 1800)) || ', Col. '
                 || pg_temp.pick(a.nc, 'col', ARRAY['Centro','Formando Hogar','Reforma','Ricardo Flores Magón','Virginia','Floresta',
                 'Zaragoza','Playa Linda','Dos Caminos','Coyol']) || ', ' || coalesce(nullif(p.ciudad_natal, ''), a.ciudad),
    'celular1', a.telefono, 'celular2', '229' || lpad(pg_temp.h(a.nc, 'cel2', 9999999)::text, 7, '0'),
    'tel_domicilio', '229' || lpad(pg_temp.h(a.nc, 'tel', 9999999)::text, 7, '0'),
    'institucion_procedencia', pg_temp.pick(a.nc, 'bach', ARRAY['CBTIS 79','CETMAR 07','COBAEV 35','Bachillerato Veracruz',
                 'CBTIS 190','Preparatoria Juan Jacobo Torres','COBAEV 64','CONALEP Veracruz II']),
    'escolaridad', pg_temp.pick(a.nc, 'esc', ARRAY['Preparatoria','Bachillerato técnico']),
    'becado', CASE WHEN pg_temp.h(a.nc, 'beca', 3) = 1 THEN 'No' ELSE 'Sí' END,
    'tipos_beca', CASE WHEN pg_temp.h(a.nc, 'beca', 3) = 1 THEN '[]'::jsonb ELSE jsonb_build_array(pg_temp.pick(a.nc, 'tbeca', ARRAY['Gobierno federal','Gobierno estatal','Esfuerzos de bachillerato'])) END,
    'beca_institucion', CASE WHEN pg_temp.h(a.nc, 'beca', 3) = 1 THEN '' ELSE pg_temp.pick(a.nc, 'ibeca', ARRAY['Beca Benito Juárez','Beca de Manutención','Beca Jóvenes Escribiendo el Futuro']) END,
    'vivira_con', pg_temp.pick(a.nc, 'viv', ARRAY['Con mi familia','Con mi familia','Con mi familia','Con familiares cercanos','Con otros estudiantes']),
    'trabaja', CASE WHEN a.trabaja THEN 'Sí' ELSE 'No' END,
    'empresa', CASE WHEN a.trabaja THEN pg_temp.pick(a.nc, 'emp', ARRAY['Tienda de abarrotes familiar','Cafetería del centro','Ciber y papelería','Soporte técnico por mi cuenta','Plaza comercial (ventas)']) ELSE '' END,
    'horario_trabajo', CASE WHEN a.trabaja THEN pg_temp.pick(a.nc, 'hor', ARRAY['Lun–Vie 16:00–21:00','Sáb–Dom 9:00–17:00','Lun–Sáb 17:00–21:00']) ELSE '' END,
    'padre_vive', CASE WHEN pg_temp.h(a.nc, 'pv', 12) = 1 THEN 'Finado' ELSE 'Vive' END, 'madre_vive', 'Vive',
    'trabajo_padre', pg_temp.pick(a.nc, 'tp', ARRAY['Comerciante','Empleado en el puerto','Chofer','Maestro de primaria','Técnico electricista','Empleado de gobierno','Pescador']),
    'trabajo_madre', pg_temp.pick(a.nc, 'tm', ARRAY['Hogar','Comerciante','Enfermera','Maestra','Empleada administrativa','Estilista']),
    'escolaridad_padre', pg_temp.pick(a.nc, 'ep', ARRAY['Primaria','Secundaria','Preparatoria','Técnico','Licenciatura']),
    'escolaridad_madre', pg_temp.pick(a.nc, 'em', ARRAY['Secundaria','Preparatoria','Técnico','Licenciatura']),
    'emergencia_nombre', pg_temp.pick(a.nc, 'emn', ARRAY['María','Rosa','Guadalupe','Patricia','Leticia','Silvia']) || ' ' || a.ap_mat || ' ' || pg_temp.pick(a.nc, 'emn2', ARRAY['García','Hernández','Cruz','Ramírez','Torres']),
    'emergencia_telefono', '229' || lpad(pg_temp.h(a.nc, 'eme', 9999999)::text, 7, '0')
  ),
  CASE pg_temp.h(a.nc, 'edo', 20) WHEN 1 THEN 'Requiere corrección' WHEN 2 THEN 'Enviada' WHEN 3 THEN 'Enviada' WHEN 4 THEN 'Enviada' WHEN 5 THEN 'Enviada' ELSE 'Revisada' END,
  timestamptz '2026-08-24 10:00-06' + make_interval(days => pg_temp.h(a.nc, 'fen', 40)),
  timestamptz '2026-08-24 10:00-06' + make_interval(days => pg_temp.h(a.nc, 'fen', 40) + 2),
  (SELECT id FROM usuarios WHERE rol = 'coordinador' ORDER BY id LIMIT 1),
  a.usuario_id, 'alumno',
  CASE pg_temp.h(a.nc, 'edo', 20)
    WHEN 1 THEN 'Revisa el teléfono de emergencia: debe tener 10 dígitos.'
    WHEN 2 THEN 'Pendiente de revisión por la Coordinación.' WHEN 3 THEN 'Pendiente de revisión por la Coordinación.'
    WHEN 4 THEN 'Pendiente de revisión por la Coordinación.' WHEN 5 THEN 'Pendiente de revisión por la Coordinación.'
    ELSE 'Información completa y verificada.' END,
  timestamptz '2026-08-24 10:00-06' + make_interval(days => pg_temp.h(a.nc, 'fen', 40) + CASE WHEN pg_temp.h(a.nc, 'edo', 20) BETWEEN 2 AND 5 THEN 0 ELSE 2 END)
  FROM _al a LEFT JOIN perfiles_tutorado p ON p.tutorado_id = a.id
ON CONFLICT (tutorado_id) DO NOTHING;

UPDATE fichas_identificacion SET observaciones = CASE estado
    WHEN 'Revisada' THEN 'Información completa y verificada.'
    WHEN 'Enviada' THEN 'Pendiente de revisión por la Coordinación.'
    ELSE 'Revisa los datos marcados y vuelve a enviarla.' END
 WHERE observaciones IS NULL OR trim(observaciones) = '';

-- Bitácora de la ficha (envío y, si aplica, revisión)
INSERT INTO fichas_identificacion_historial (tutorado_id, usuario_id, rol, accion, fecha)
SELECT f.tutorado_id, f.actualizado_por, 'alumno', 'Envío', f.fecha_envio
  FROM fichas_identificacion f
 WHERE NOT EXISTS (SELECT 1 FROM fichas_identificacion_historial h WHERE h.tutorado_id = f.tutorado_id);
INSERT INTO fichas_identificacion_historial (tutorado_id, usuario_id, rol, accion, nota, fecha)
SELECT f.tutorado_id, f.revisada_por, 'coordinador',
       CASE f.estado WHEN 'Revisada' THEN 'Revisión' ELSE 'Solicitud de corrección' END,
       CASE f.estado WHEN 'Revisada' THEN NULL ELSE f.observaciones END, f.fecha_revision
  FROM fichas_identificacion f
 WHERE f.estado IN ('Revisada', 'Requiere corrección')
   AND NOT EXISTS (SELECT 1 FROM fichas_identificacion_historial h WHERE h.tutorado_id = f.tutorado_id AND h.rol = 'coordinador');

-- Grupo de las asignaciones que no lo tenían
UPDATE asignaciones_tutoria x SET grupo = a.semestre || '°' || CASE WHEN pg_temp.h(a.nc, 'grp', 2) = 1 THEN 'A' ELSE 'B' END || ' ISC'
  FROM _al a WHERE a.id = x.tutorado_id AND (x.grupo IS NULL OR x.grupo = '');

-- =============================================================================
-- 3. CITAS
-- =============================================================================
-- Textos que quedaron de pruebas
UPDATE citas_tutorias SET motivo = 'Dudas sobre la carga de materias del próximo semestre'
 WHERE motivo ILIKE 'Prueba del%';
UPDATE citas_tutorias SET minuta = NULL
 WHERE minuta IS NOT NULL AND (coalesce(minuta->>'acuerdos', '') ~* '^(asd|qwe|sdf|xxx|aaa)' OR coalesce(minuta->>'asuntos', '') ~* '^(asd|qwe|sdf|xxx|aaa)');

-- Citas pasadas que quedaron sin registrar: se registran como atendidas
UPDATE citas_tutorias SET estatus = 'Completada', asistio = true,
       duracion_real_min = (ARRAY[30, 45, 45, 60])[pg_temp.h(id::text, 'dur', 4)],
       atendida_en = fecha_hora + interval '50 minutes'
 WHERE estatus IN ('Pendiente', 'Confirmada') AND fecha_hora < date_trunc('day', now());

UPDATE citas_tutorias SET asistio = true WHERE estatus = 'Completada' AND asistio IS NULL;
UPDATE citas_tutorias SET duracion_real_min = (ARRAY[30, 45, 45, 60])[pg_temp.h(id::text, 'dur', 4)]
 WHERE estatus = 'Completada' AND asistio AND duracion_real_min IS NULL;
UPDATE citas_tutorias SET atendida_en = fecha_hora + interval '50 minutes' WHERE estatus = 'Completada' AND atendida_en IS NULL;

-- Minuta para cada sesión atendida
UPDATE citas_tutorias SET minuta = jsonb_build_object(
    'asuntos', pg_temp.pick(id::text, 'as', ARRAY[
      'Se revisó el avance en las asignaturas del semestre y las calificaciones del primer parcial.',
      'Se conversó sobre la organización del tiempo de estudio y la carga de tareas.',
      'Se revisó la retícula y las materias que conviene cursar el siguiente semestre.',
      'Se identificaron las dificultades en programación y se definieron temas a reforzar.',
      'Se platicó sobre la adaptación al Tecnológico y los servicios de apoyo disponibles.',
      'Se dio seguimiento a la asignatura en recursamiento y a las asesorías de PALPROG.',
      'Se orientó sobre servicio social, residencia profesional y opciones de titulación.']),
    'acuerdos', pg_temp.pick(id::text, 'ac', ARRAY[
      'Asistirá a dos asesorías por semana y enviará su avance por correo.',
      'Elaborará un horario semanal de estudio y lo revisarán en la próxima sesión.',
      'Se inscribirá al taller de reforzamiento y llevará sus dudas resueltas.',
      'Hablará con el docente de la asignatura para regularizar sus entregas.',
      'Revisará la convocatoria de becas y entregará documentos a tiempo.',
      'Mantendrá contacto semanal por correo con su tutor(a).']),
    'seguimiento', pg_temp.pick(id::text, 'sg', ARRAY['Revisar avance en dos semanas.', 'Confirmar asistencia a asesorías.',
      'Revisar calificaciones del siguiente parcial.', 'Sin pendientes adicionales.']),
    'actualizada', to_char((fecha_hora + interval '1 hour') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.000"Z"'))
 WHERE estatus = 'Completada' AND minuta IS NULL;

UPDATE citas_tutorias SET notas_tutor = 'Sesión atendida; ver minuta.' WHERE estatus = 'Completada' AND (notas_tutor IS NULL OR notas_tutor = '');

-- =============================================================================
-- 4. CANALIZACIONES
-- =============================================================================
UPDATE canalizaciones c SET seguimiento = s.nota
  FROM (SELECT DISTINCT ON (canalizacion_id) canalizacion_id, nota FROM canalizacion_seguimientos ORDER BY canalizacion_id, fecha DESC) s
 WHERE s.canalizacion_id = c.id AND (c.seguimiento IS NULL OR c.seguimiento = '');
UPDATE canalizaciones SET seguimiento = 'Canalización registrada; en espera de respuesta del área.'
 WHERE seguimiento IS NULL OR seguimiento = '';
UPDATE canalizaciones SET proxima_revision = (now() AT TIME ZONE 'America/Mexico_City')::date + pg_temp.h(id::text, 'rev', 14) + 1
 WHERE proxima_revision IS NULL AND estatus_canalizacion IN ('Pendiente', 'En Proceso', 'Aceptado');
