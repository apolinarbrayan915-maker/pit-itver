-- 017: Tutorados, sesiones y evaluaciones para los tutores del catálogo docente,
-- para que en Coordinación ningún tutor aparezca vacío.  DATOS FICTICIOS DE DEMOSTRACIÓN.
--  * 2 a 8 tutorados nuevos por tutor (según su cupo), con perfil y Ficha de Identificación.
--  * Sesiones atendidas con minuta, alguna inasistencia y próximas citas.
--  * Evaluación del PIT del tutor, evaluaciones de sus tutorados y canalizaciones.
--  * Formación tutorial variada.
-- Contraseña de las cuentas nuevas: la misma de las cuentas demo. Es idempotente.
SET search_path = pit;

CREATE OR REPLACE FUNCTION pg_temp.h(t text, sal text, n int) RETURNS int LANGUAGE sql IMMUTABLE AS
$$ SELECT ((('x' || substr(md5(t || sal), 1, 8))::bit(32)::bigint % n) + 1)::int $$;
CREATE OR REPLACE FUNCTION pg_temp.pick(t text, sal text, arr text[]) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT arr[pg_temp.h(t, sal, array_length(arr, 1))] $$;

CREATE TEMP TABLE _pw2 ON COMMIT DROP AS
  SELECT password_hash FROM usuarios WHERE lower(correo_institucional) = 'noemi.tp@veracruz.tecnm.mx';

-- Tutores del catálogo, numerados de forma estable
CREATE TEMP TABLE _tc ON COMMIT DROP AS
SELECT tu.id AS tutor_id, tu.max_tutorados AS cupo, COALESCE(tu.catalogo_materias_id, 'tutor-' || tu.id) AS clave,
       row_number() OVER (ORDER BY tu.catalogo_materias_id IS NULL, tu.catalogo_materias_id, tu.id) AS k
  FROM tutores tu
 WHERE tu.catalogo_materias_id IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM asignaciones_tutoria a WHERE a.tutor_id = tu.id AND a.estatus_asignacion = 'Activa');

-- Formación tutorial variada
UPDATE tutores tu SET formacion_tutorial = pg_temp.pick(c.clave, 'form', ARRAY['Diplomado Cumplido','Diplomado Cumplido',
       'Diplomado Cumplido','Cursos Básicos','Cursos Básicos','En formación'])
  FROM _tc c WHERE c.tutor_id = tu.id AND tu.formacion_tutorial = 'En formación';

-- ---- Tutorados nuevos --------------------------------------------------------------------
CREATE TEMP TABLE _nv ON COMMIT DROP AS
SELECT c.tutor_id, c.clave, j, s.sem,
       (26 - (s.sem - 1) / 2)::text || '02' || lpad((5000 + (c.k - 1) * 10 + j)::text, 4, '0') AS nc
  FROM _tc c
 CROSS JOIN LATERAL generate_series(1, GREATEST(2, c.cupo - pg_temp.h(c.clave, 'n', 3) + 1)) j
 CROSS JOIN LATERAL (SELECT (ARRAY[1,1,3,3,5,5,7,7,9,2,4,6])[pg_temp.h(c.clave || j, 'sem', 12)] AS sem) s
 WHERE GREATEST(2, c.cupo - pg_temp.h(c.clave, 'n', 3) + 1) <= c.cupo OR j <= c.cupo;

ALTER TABLE _nv ADD COLUMN mujer boolean, ADD COLUMN nombre text, ADD COLUMN apellidos text, ADD COLUMN mr int;
UPDATE _nv SET mujer = pg_temp.h(nc, 'sx', 2) = 1;
UPDATE _nv SET
  nombre = CASE WHEN mujer THEN pg_temp.pick(nc, 'nom', ARRAY['Ana Paula','Daniela','Mariana','Valeria','Fernanda','Andrea',
             'Jimena','Renata','Paola','Abril','Monserrat','Alondra','Michelle','Diana','Karla','Isabel','Nayeli','Ariadna',
             'Citlali','Frida','Samantha','Leslie','Arely','Vanessa'])
           ELSE pg_temp.pick(nc, 'nom', ARRAY['Alejandro','Emiliano','Rodrigo','Sebastián','Mateo','Ángel','Brandon','Jonathan',
             'Ricardo','Eduardo','Fernando','Óscar','Raúl','Héctor','Gustavo','Iván','Alan','Bryan','Christian','Uriel',
             'Joel','Erick','Isaac','Gerardo']) END,
  apellidos = pg_temp.pick(nc, 'ap1', ARRAY['Hernández','García','Martínez','López','González','Pérez','Rodríguez','Sánchez',
             'Ramírez','Cruz','Flores','Gómez','Morales','Vázquez','Jiménez','Reyes','Díaz','Torres','Gutiérrez','Ruiz',
             'Mendoza','Aguilar','Ortiz','Castillo','Rosas','Domínguez','Carmona','Lagunes','Barradas','Utrera'])
             || ' ' || pg_temp.pick(nc, 'ap2', ARRAY['Hernández','García','Martínez','López','González','Pérez','Romero','Sánchez',
             'Ramírez','Cruz','Fuentes','Gómez','Morales','Vázquez','Chávez','Reyes','Díaz','Rivera','Méndez','Ruiz',
             'Contreras','Aguilar','Ortega','Castro','Rosales','Delgado','Zamora','Landa','Cabrera','Mora']),
  mr = (ARRAY[0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,2,2,3,4,0])[pg_temp.h(nc, 'mr', 20)];
UPDATE _nv SET mr = 0 WHERE sem = 1 AND mr > 2;

INSERT INTO usuarios (no_control_o_rfc, nombre, apellidos, correo_institucional, password_hash, rol)
SELECT n.nc, n.nombre, n.apellidos, 'l' || n.nc || '@veracruz.tecnm.mx', p.password_hash, 'alumno'
  FROM _nv n CROSS JOIN _pw2 p
ON CONFLICT DO NOTHING;

INSERT INTO tutorados (usuario_id, semestre, periodo_ingreso, materias_reprobadas, avance_reticular_pct, promedio, telefono)
SELECT u.id, n.sem, '20' || (26 - (n.sem - 1) / 2) || '-2', n.mr,
       GREATEST(2, LEAST(100, round(((n.sem - 1) / 9.0 * 100 + pg_temp.h(n.nc, 'av', 9) - 5 - n.mr * 3)::numeric, 2))),
       CASE WHEN n.mr = 0 THEN 82 + pg_temp.h(n.nc, 'pr', 15) ELSE 68 + pg_temp.h(n.nc, 'pr', 12) END,
       '229' || lpad(pg_temp.h(n.nc, 'tel', 9999999)::text, 7, '0')
  FROM _nv n JOIN usuarios u ON u.no_control_o_rfc = n.nc
 WHERE NOT EXISTS (SELECT 1 FROM tutorados t WHERE t.usuario_id = u.id);
UPDATE tutorados SET avance_reticular_pct = GREATEST(0, avance_reticular_pct) WHERE avance_reticular_pct < 0;

INSERT INTO asignaciones_tutoria (tutor_id, tutorado_id, periodo_escolar, grupo, origen, fecha_asignacion)
SELECT n.tutor_id, t.id, '2026-2', n.sem || '°' || CASE WHEN pg_temp.h(n.nc, 'grp', 2) = 1 THEN 'A' ELSE 'B' END || ' ISC',
       'Elección del tutorado', DATE '2026-08-24' + pg_temp.h(n.nc, 'fa', 12)
  FROM _nv n JOIN usuarios u ON u.no_control_o_rfc = n.nc JOIN tutorados t ON t.usuario_id = u.id
 WHERE NOT EXISTS (SELECT 1 FROM asignaciones_tutoria a WHERE a.tutorado_id = t.id AND a.periodo_escolar = '2026-2' AND a.estatus_asignacion = 'Activa');

-- ---- Sesiones -----------------------------------------------------------------------------
-- Cada tutorado: 2 a 3 sesiones en los bloques de horario de su tutor (semanas distintas),
-- y la mitad con una próxima cita en diciembre.
CREATE TEMP TABLE _hs ON COMMIT DROP AS
SELECT h.tutor_id, h.dia_semana, h.hora_inicio, row_number() OVER (PARTITION BY h.tutor_id ORDER BY h.dia_semana, h.hora_inicio) AS slot,
       count(*) OVER (PARTITION BY h.tutor_id) AS slots
  FROM tutor_horarios h JOIN _tc c ON c.tutor_id = h.tutor_id;

INSERT INTO citas_tutorias (tutor_id, tutorado_id, fecha_hora, duracion_min, tipo, modalidad, motivo, estatus, asistio, duracion_real_min, atendida_en, creado_por)
SELECT n.tutor_id, t.id,
       (DATE '2026-08-31' + (x.semana * 7) + (hs.dia_semana - 1) + hs.hora_inicio) AT TIME ZONE 'America/Mexico_City',
       60, 'Individual',
       CASE WHEN pg_temp.h(n.nc || x.i, 'mod', 4) = 1 THEN 'Línea' ELSE 'Presencial' END::modalidad_cita,
       pg_temp.pick(n.nc || x.i, 'mot', ARRAY['Plan de trabajo del semestre','Revisión de calificaciones del primer parcial',
         'Organización de tiempos de estudio','Planeación de carga de materias','Seguimiento de avance académico',
         'Orientación sobre becas','Dudas sobre servicio social','Materia en repetición','Problemas de adaptación',
         'Asesoría para residencia profesional']),
       CASE WHEN x.i = 2 AND pg_temp.h(n.nc, 'falta', 7) = 1 THEN 'Cancelada' ELSE 'Completada' END::estatus_cita,
       CASE WHEN x.i = 2 AND pg_temp.h(n.nc, 'falta', 7) = 1 THEN false ELSE true END,
       CASE WHEN x.i = 2 AND pg_temp.h(n.nc, 'falta', 7) = 1 THEN NULL ELSE (ARRAY[30,45,45,60])[pg_temp.h(n.nc || x.i, 'dur', 4)] END,
       CASE WHEN x.i = 2 AND pg_temp.h(n.nc, 'falta', 7) = 1 THEN NULL
            ELSE (DATE '2026-08-31' + (x.semana * 7) + (hs.dia_semana - 1) + hs.hora_inicio + interval '55 minutes') AT TIME ZONE 'America/Mexico_City' END,
       u.id
  FROM _nv n
  JOIN usuarios u ON u.no_control_o_rfc = n.nc JOIN tutorados t ON t.usuario_id = u.id
 CROSS JOIN LATERAL (
   SELECT i, ((n.j - 1) + (i - 1) * 4) % 12 AS semana  -- semanas 0..11 (31 ago – 20 nov)
     FROM generate_series(1, 2 + (pg_temp.h(n.nc, 'ns', 2) - 1)) i) x
  JOIN _hs hs ON hs.tutor_id = n.tutor_id AND hs.slot = ((n.j + x.i) % hs.slots) + 1
 WHERE NOT EXISTS (SELECT 1 FROM citas_tutorias c WHERE c.tutorado_id = t.id)
ON CONFLICT DO NOTHING;

-- Próximas citas (1 a 4 de diciembre; distinto día por tutorado para no chocar)
INSERT INTO citas_tutorias (tutor_id, tutorado_id, fecha_hora, duracion_min, tipo, modalidad, motivo, estatus, creado_por)
SELECT n.tutor_id, t.id,
       (DATE '2026-11-30' + (hs.dia_semana - 1) + (CASE WHEN n.j > hs.slots THEN 7 ELSE 0 END) + hs.hora_inicio) AT TIME ZONE 'America/Mexico_City',
       60, 'Individual', 'Presencial',
       pg_temp.pick(n.nc, 'mot2', ARRAY['Seguimiento de avance académico','Planeación de carga de materias','Revisión de calificaciones finales','Dudas de reinscripción']),
       CASE WHEN pg_temp.h(n.nc, 'conf', 2) = 1 THEN 'Confirmada' ELSE 'Pendiente' END::estatus_cita, u.id
  FROM _nv n
  JOIN usuarios u ON u.no_control_o_rfc = n.nc JOIN tutorados t ON t.usuario_id = u.id
  JOIN _hs hs ON hs.tutor_id = n.tutor_id AND hs.slot = ((n.j - 1) % hs.slots) + 1
 WHERE n.j <= hs.slots * 2 AND pg_temp.h(n.nc, 'prox', 2) = 1
   AND NOT EXISTS (SELECT 1 FROM citas_tutorias c WHERE c.tutorado_id = t.id AND c.fecha_hora > now())
ON CONFLICT DO NOTHING;

-- ---- Evaluación del PIT por el tutor (la mayoría ya la envió) -----------------------------
INSERT INTO evaluaciones_tutor (tutor_id, periodo, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, comentarios, fecha_envio)
SELECT c.tutor_id, '2026-2',
       (ARRAY[1,1,2,2,3])[pg_temp.h(c.clave,'p1',5)], (ARRAY[1,2,2,3,3])[pg_temp.h(c.clave,'p2',5)], (ARRAY[1,1,2,2,3])[pg_temp.h(c.clave,'p3',5)],
       (ARRAY[1,2,2,3,4])[pg_temp.h(c.clave,'p4',5)], (ARRAY[2,2,3,3,4])[pg_temp.h(c.clave,'p5',5)], (ARRAY[1,1,1,2,2])[pg_temp.h(c.clave,'p6',5)],
       (ARRAY[1,1,2,2,2])[pg_temp.h(c.clave,'p7',5)], (ARRAY[2,3,3,3,4])[pg_temp.h(c.clave,'p8',5)], (ARRAY[2,2,3,3,4])[pg_temp.h(c.clave,'p9',5)],
       (ARRAY[1,2,2,3,3])[pg_temp.h(c.clave,'p10',5)], (ARRAY[2,2,3,3,4])[pg_temp.h(c.clave,'p11',5)],
       pg_temp.pick(c.clave, 'com', ARRAY['Sería útil contar con un espacio fijo para las sesiones individuales.',
         'Me gustaría más capacitación sobre canalización a servicios de apoyo.',
         'El tiempo para preparar las sesiones es limitado por la carga docente.',
         'La plataforma facilita llevar el registro de las sesiones.',
         'Propongo reuniones de seguimiento entre tutores cada mes.']),
       TIMESTAMPTZ '2026-11-09 12:00-06' + make_interval(days => pg_temp.h(c.clave, 'fe', 15), hours => pg_temp.h(c.clave, 'hr', 8))
  FROM _tc c
ON CONFLICT (tutor_id, periodo) DO NOTHING;

-- ---- Evaluaciones de los tutorados (anónimas para la Coordinación) -----------------------
INSERT INTO evaluaciones_alumno (tutorado_id, tutor_id, periodo, respuestas, comentarios, fecha_envio)
SELECT t.id, n.tutor_id, '2026-2',
       (SELECT jsonb_object_agg(k, (ARRAY[1,1,1,2,2,2,3,1,2,4])[pg_temp.h(n.nc || k, 'r', 10)])
          FROM unnest(ARRAY['s4a','s4b','s4c','s4d','s4e','s4f','s4g','s4h','s4i','s4j','s4k','s4l','s4m','s4n','s4o','s4p',
                            's5a','s5b','s5c','s5d','s5e','s5f','s5g','s5h','s5i','s5j','s5k','s5l','s5m','s5n','s5o','s5p','s5q','s5r']) k),
       CASE WHEN pg_temp.h(n.nc, 'cm', 3) = 1 THEN pg_temp.pick(n.nc, 'cmt', ARRAY[
         'Las sesiones me ayudaron a organizar mejor mi semestre.', 'Me gustaría tener más sesiones en línea.',
         'Siempre me orientó cuando tuve dudas con mis materias.', 'Me ayudó a conocer los servicios de apoyo del Tec.',
         'Sería bueno tener horarios por la tarde.', 'Gracias a la tutoría regularicé una materia.']) END,
       TIMESTAMPTZ '2026-11-12 10:00-06' + make_interval(days => pg_temp.h(n.nc, 'fe', 12), hours => pg_temp.h(n.nc, 'hr', 9))
  FROM _nv n JOIN usuarios u ON u.no_control_o_rfc = n.nc JOIN tutorados t ON t.usuario_id = u.id
 WHERE pg_temp.h(n.nc, 'evalal', 10) <= 7
ON CONFLICT DO NOTHING;

-- ---- Canalizaciones de los tutorados en riesgo -------------------------------------------
INSERT INTO canalizaciones (tutorado_id, tutor_id, area_destino, diagnostico_inicial, estatus_canalizacion, fecha_registro, fecha_cierre)
SELECT t.id, n.tutor_id, x.area::area_canalizacion, x.diag, x.est::estatus_canalizacion,
       TIMESTAMPTZ '2026-09-15 11:00-06' + make_interval(days => pg_temp.h(n.nc, 'fc', 50)),
       CASE WHEN x.est IN ('Atendido','Cerrado') THEN TIMESTAMPTZ '2026-09-15 11:00-06' + make_interval(days => pg_temp.h(n.nc, 'fc', 50) + 20) END
  FROM _nv n JOIN usuarios u ON u.no_control_o_rfc = n.nc JOIN tutorados t ON t.usuario_id = u.id
 CROSS JOIN LATERAL (SELECT
     CASE pg_temp.h(n.nc, 'ar', 4) WHEN 1 THEN 'PALPROG' WHEN 2 THEN 'PAPAs' WHEN 3 THEN 'Psicología/Salud' ELSE 'CIS' END AS area,
     CASE pg_temp.h(n.nc, 'ar', 4)
       WHEN 1 THEN 'Rezago en programación; se canaliza a asesorías de pares en PALPROG.'
       WHEN 2 THEN 'Dificultades en Cálculo; se canaliza al programa de asesorías académicas.'
       WHEN 3 THEN 'Manifiesta estrés por la carga académica; se sugiere orientación psicológica.'
       ELSE 'Requiere apoyo para organizar su tiempo de estudio; se canaliza a CIS.' END AS diag,
     pg_temp.pick(n.nc, 'est', ARRAY['Pendiente','En Proceso','Aceptado','Atendido','Cerrado']) AS est) x
 WHERE n.mr >= 2
   AND NOT EXISTS (SELECT 1 FROM canalizaciones k WHERE k.tutorado_id = t.id);

INSERT INTO canalizacion_seguimientos (canalizacion_id, usuario_id, estatus_anterior, estatus_nuevo, nota, fecha)
SELECT k.id, tu.usuario_id, NULL, 'Pendiente'::estatus_canalizacion, 'Canalización registrada. ' || k.diagnostico_inicial, k.fecha_registro
  FROM canalizaciones k JOIN tutores tu ON tu.id = k.tutor_id
 WHERE tu.catalogo_materias_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM canalizacion_seguimientos s WHERE s.canalizacion_id = k.id);
INSERT INTO canalizacion_seguimientos (canalizacion_id, usuario_id, estatus_anterior, estatus_nuevo, nota, fecha)
SELECT k.id, tu.usuario_id, 'Pendiente'::estatus_canalizacion, k.estatus_canalizacion,
       CASE k.estatus_canalizacion WHEN 'En Proceso' THEN 'El área confirmó la primera sesión; asiste con regularidad.'
            WHEN 'Aceptado' THEN 'El área aceptó la canalización y asignó horario.'
            WHEN 'Atendido' THEN 'Concluyó las sesiones; se observa mejora en sus entregas.'
            ELSE 'Se cierra la canalización: objetivo cumplido.' END,
       k.fecha_registro + interval '6 days'
  FROM canalizaciones k JOIN tutores tu ON tu.id = k.tutor_id
 WHERE tu.catalogo_materias_id IS NOT NULL AND k.estatus_canalizacion <> 'Pendiente'
   AND (SELECT count(*) FROM canalizacion_seguimientos s WHERE s.canalizacion_id = k.id) = 1;

-- Texto basura que quedó de pruebas
UPDATE citas_tutorias SET motivo = 'Seguimiento de avance académico' WHERE motivo ~ '^(.)\1{3,}$';

-- =============================================================================
-- Completar perfiles, fichas, minutas y seguimiento de los registros nuevos
-- (mismas reglas que la migración 016)
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
