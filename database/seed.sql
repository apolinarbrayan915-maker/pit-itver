-- =============================================================================
--  DATOS DE PRUEBA – PIT ITVER · Ingeniería en Sistemas Computacionales
--  Periodo escolar vigente: 2026-2 (agosto–diciembre 2026)
--
--  Ejecutar DESPUÉS de schema.sql:
--      psql -U postgres -d pit_itver -f database/seed.sql
--
--  Contraseña de TODAS las cuentas de prueba:  Tutorias2026!
--  (hash bcrypt generado con pgcrypto, compatible con bcryptjs en Node)
--
--  Los nombres, números de control y RFC son FICTICIOS, con formato realista.
--  Las fechas de las citas son relativas a la semana en que se ejecute el
--  script, para que el KPI "citas de la semana" siempre tenga datos.
-- =============================================================================

BEGIN;

TRUNCATE fichas_identificacion_historial, fichas_identificacion, perfiles_tutorado, tutor_horarios, avisos, evaluaciones_alumno, evaluaciones_tutor, reportes_pit, canalizaciones, citas_tutorias, asignaciones_tutoria,
         tutores, tutorados, usuarios RESTART IDENTITY CASCADE;

-- -----------------------------------------------------------------------------
-- USUARIOS
-- -----------------------------------------------------------------------------
INSERT INTO usuarios (no_control_o_rfc, nombre, apellidos, correo_institucional, password_hash, rol) VALUES
-- Coordinación PIT
('RIML780214KJ2', 'Laura Elena',        'Rivas Montiel',        'coordinacion.tutorias@veracruz.tecnm.mx', crypt('Tutorias2026!', gen_salt('bf', 10)), 'coordinador'),
-- Docentes tutores (Depto. de Sistemas y Computación)
('TEPN720815XX1', 'Noemí del Carmen',   'Tenorio Prieto',       'noemi.tp@veracruz.tecnm.mx',              crypt('Tutorias2026!', gen_salt('bf', 10)), 'tutor'),
('PEMK800312XX4', 'Karla Gabriela',     'Peralta Madrigal',     'karla.pm@veracruz.tecnm.mx',              crypt('Tutorias2026!', gen_salt('bf', 10)), 'tutor'),
('GOFR751102XX9', 'Roberto',            'Gómez Fernández',      'roberto.gf@veracruz.tecnm.mx',            crypt('Tutorias2026!', gen_salt('bf', 10)), 'tutor'),
-- Alumnos ISC
('25020112', 'Carlos',          'García Hernández',  'l25020112@veracruz.tecnm.mx', crypt('Tutorias2026!', gen_salt('bf', 10)), 'alumno'),
('25020204', 'Andrea',          'Martínez López',    'l25020204@veracruz.tecnm.mx', crypt('Tutorias2026!', gen_salt('bf', 10)), 'alumno'),
('25020345', 'Juan',            'Pérez Sánchez',     'l25020345@veracruz.tecnm.mx', crypt('Tutorias2026!', gen_salt('bf', 10)), 'alumno'),
('25020431', 'Ximena',          'Morales Vázquez',   'l25020431@veracruz.tecnm.mx', crypt('Tutorias2026!', gen_salt('bf', 10)), 'alumno'),
('24020418', 'Luis Fernando',   'Ramírez Ortiz',     'l24020418@veracruz.tecnm.mx', crypt('Tutorias2026!', gen_salt('bf', 10)), 'alumno'),
('24020527', 'Sofía',           'Cruz Domínguez',    'l24020527@veracruz.tecnm.mx', crypt('Tutorias2026!', gen_salt('bf', 10)), 'alumno'),
('26020133', 'Valeria',         'Torres Méndez',     'l26020133@veracruz.tecnm.mx', crypt('Tutorias2026!', gen_salt('bf', 10)), 'alumno'),
('26020210', 'Diego',           'Hernández Aguilar', 'l26020210@veracruz.tecnm.mx', crypt('Tutorias2026!', gen_salt('bf', 10)), 'alumno');

-- -----------------------------------------------------------------------------
-- TUTORES
-- -----------------------------------------------------------------------------
INSERT INTO tutores (usuario_id, departamento, cubiculo, max_tutorados, formacion_tutorial)
SELECT u.id, 'Sistemas y Computación', v.cubiculo, v.max_t, v.formacion
FROM (VALUES
    ('TEPN720815XX1', 'Cubículo 12, Edificio U', 40, 'Diplomado Cumplido'),
    ('PEMK800312XX4', 'Cubículo 7, Edificio U',  40, 'Diplomado Cumplido'),
    ('GOFR751102XX9', 'Cubículo 3, Edificio U',  40, 'Cursos Básicos')
) AS v(rfc, cubiculo, max_t, formacion)
JOIN usuarios u ON u.no_control_o_rfc = v.rfc;

-- -----------------------------------------------------------------------------
-- TUTORADOS  (nivel_riesgo y estatus_academico los calcula el trigger)
--   3+ reprobadas -> CRÍTICO · 2 -> ALTO · 1 -> MEDIO · 0 -> BAJO
--   Ximena: 1 reprobada + rezago reticular severo -> se eleva a ALTO
-- -----------------------------------------------------------------------------
INSERT INTO tutorados (usuario_id, semestre, periodo_ingreso, materias_reprobadas, avance_reticular_pct, promedio, telefono)
SELECT u.id, v.sem, v.ingreso, v.reprob, v.avance, v.prom, v.tel
FROM (VALUES
    ('25020112', 4, '2025-1', 3, 19.00, 68.50, '2291234501'),  -- CRÍTICO
    ('25020204', 4, '2025-1', 2, 26.00, 74.20, '2291234502'),  -- ALTO
    ('25020345', 4, '2025-1', 0, 42.30, 92.40, '2295551234'),  -- BAJO
    ('25020431', 4, '2025-1', 1, 14.00, 77.80, '2291234504'),  -- ALTO (por rezago)
    ('24020418', 6, '2024-1', 4, 31.00, 66.00, '2291234505'),  -- CRÍTICO
    ('24020527', 6, '2024-1', 1, 52.00, 81.30, '2291234506'),  -- MEDIO
    ('26020133', 2, '2026-1', 2,  6.00, 71.90, '2291234507'),  -- ALTO
    ('26020210', 2, '2026-1', 0, 11.00, 88.70, '2291234508')   -- BAJO
) AS v(ctrl, sem, ingreso, reprob, avance, prom, tel)
JOIN usuarios u ON u.no_control_o_rfc = v.ctrl;

-- -----------------------------------------------------------------------------
-- ASIGNACIONES 2026-2
-- -----------------------------------------------------------------------------
INSERT INTO asignaciones_tutoria (tutor_id, tutorado_id, periodo_escolar, grupo, fecha_asignacion)
SELECT tu.id, t.id, '2026-2', v.grupo, DATE '2026-08-24'
FROM (VALUES
    ('25020112', 'TEPN720815XX1', '4°B ISC'),
    ('25020204', 'TEPN720815XX1', '4°B ISC'),
    ('25020345', 'TEPN720815XX1', '4°B ISC'),
    ('25020431', 'TEPN720815XX1', '4°B ISC'),
    ('24020418', 'PEMK800312XX4', '6°A ISC'),
    ('24020527', 'PEMK800312XX4', '6°A ISC'),
    ('26020133', 'PEMK800312XX4', '2°A ISC'),
    ('26020210', 'PEMK800312XX4', '2°A ISC')
) AS v(ctrl, rfc, grupo)
JOIN usuarios ua ON ua.no_control_o_rfc = v.ctrl
JOIN tutorados t ON t.usuario_id = ua.id
JOIN usuarios ut ON ut.no_control_o_rfc = v.rfc
JOIN tutores tu  ON tu.usuario_id = ut.id;

-- Asignación del periodo anterior (histórico, ya finalizada)
INSERT INTO asignaciones_tutoria (tutor_id, tutorado_id, periodo_escolar, grupo, estatus_asignacion, fecha_asignacion)
SELECT tu.id, t.id, '2026-1', '3°B ISC', 'Finalizada', DATE '2026-01-26'
FROM usuarios ua
JOIN tutorados t ON t.usuario_id = ua.id
JOIN usuarios ut ON ut.no_control_o_rfc = 'TEPN720815XX1'
JOIN tutores tu  ON tu.usuario_id = ut.id
WHERE ua.no_control_o_rfc IN ('25020112', '25020204', '25020345');

-- -----------------------------------------------------------------------------
-- CITAS  (fechas relativas al lunes de la semana actual, hora de Veracruz)
-- -----------------------------------------------------------------------------
WITH lunes AS (
    SELECT date_trunc('week', now() AT TIME ZONE 'America/Mexico_City') AS d
)
INSERT INTO citas_tutorias (tutor_id, tutorado_id, fecha_hora, tipo, modalidad, grupo, motivo, estatus, notas_tutor, creado_por)
SELECT tu.id,
       t.id,
       ((SELECT d FROM lunes) + v.desfase) AT TIME ZONE 'America/Mexico_City',
       v.tipo::tipo_cita,
       v.modalidad::modalidad_cita,
       v.grupo,
       v.motivo,
       v.estatus::estatus_cita,
       v.notas,
       COALESCE(ua.id, ut.id)
FROM (VALUES
    -- Semana actual
    ('25020112', 'TEPN720815XX1', INTERVAL '1 day 10 hours',  'Individual', 'Presencial', NULL,
        'Estrategia de recuperación en Estructura de Datos y acuerdo de tutoría.', 'Pendiente', NULL),
    ('24020418', 'PEMK800312XX4', INTERVAL '1 day 13 hours',  'Individual', 'Presencial', NULL,
        'Seguimiento de bajo rendimiento: 4 asignaturas reprobadas, revisión de carga académica.', 'Pendiente', NULL),
    ('25020204', 'TEPN720815XX1', INTERVAL '3 days 11 hours', 'Individual', 'Línea',      NULL,
        'Orientación sobre retícula y carga de materias para 5° semestre.', 'Confirmada', NULL),
    ('25020345', 'TEPN720815XX1', INTERVAL '4 days 10 hours', 'Individual', 'Presencial', NULL,
        'Revisión de avance reticular.', 'Confirmada', NULL),
    ('25020431', 'TEPN720815XX1', INTERVAL '2 days 16 hours', 'Individual', 'Presencial', NULL,
        'Rezago reticular: plan para recuperar Cálculo Diferencial.', 'Pendiente', NULL),
    -- Semana siguiente
    ('26020133', 'PEMK800312XX4', INTERVAL '9 days 16 hours', 'Individual', 'Línea',      NULL,
        'Hábitos de estudio y adaptación al segundo semestre.', 'Pendiente', NULL),
    -- Historial (semanas anteriores)
    (NULL,       'TEPN720815XX1', INTERVAL '-3 days 12 hours', 'Grupal',    'Presencial', '4°B ISC',
        'Inducción a Comunidades de Apoyo Académico (PALPROG y CIS).', 'Completada',
        'Asistieron 31 de 35 tutorados. Se compartieron horarios de PALPROG.'),
    ('25020345', 'TEPN720815XX1', INTERVAL '-21 days 10 hours', 'Individual', 'Presencial', NULL,
        'Diagnóstico de primer parcial.', 'Completada',
        'Desempeño sobresaliente. Se recomienda integrarse a CEPC.'),
    ('24020527', 'PEMK800312XX4', INTERVAL '-5 days 11 hours', 'Individual', 'Línea',      NULL,
        'Revisión de opciones de residencia profesional.', 'Cancelada',
        'Cancelada por la alumna; se reprogramará.')
) AS v(ctrl, rfc, desfase, tipo, modalidad, grupo, motivo, estatus, notas)
LEFT JOIN usuarios ua ON ua.no_control_o_rfc = v.ctrl
LEFT JOIN tutorados t ON t.usuario_id = ua.id
JOIN usuarios ut      ON ut.no_control_o_rfc = v.rfc
JOIN tutores tu       ON tu.usuario_id = ut.id;

-- -----------------------------------------------------------------------------
-- CANALIZACIONES
-- -----------------------------------------------------------------------------
INSERT INTO canalizaciones (tutorado_id, tutor_id, area_destino, diagnostico_inicial, estatus_canalizacion, seguimiento, fecha_registro, fecha_cierre)
SELECT t.id, a.tutor_id, v.area::area_canalizacion, v.diag, v.estatus::estatus_canalizacion, v.seg,
       now() - v.hace, CASE WHEN v.estatus IN ('Atendido', 'Cerrado') THEN now() - INTERVAL '2 days' END
FROM (VALUES
    ('25020112', 'PALPROG',          'Deficiencia severa en punteros y arreglos dinámicos (Estructura de Datos).',
        'En Proceso', 'Asiste martes y jueves a asesoría PALPROG.', INTERVAL '10 days'),
    ('25020204', 'CEPC',             'Interés en lógica matemática; reforzamiento de Matemáticas Discretas mediante problemas competitivos.',
        'Aceptado',   NULL, INTERVAL '14 days'),
    ('24020418', 'PALPROG',          'Rezago en Programación Orientada a Objetos y Tópicos Avanzados de Programación.',
        'Pendiente',  NULL, INTERVAL '3 days'),
    ('24020418', 'Psicología/Salud', 'Reporta estrés y ansiedad ante evaluaciones; se sugiere orientación psicopedagógica.',
        'En Proceso', 'Primera entrevista realizada en Desarrollo Académico.', INTERVAL '6 days'),
    ('26020133', 'PAPAs',            'Dificultad en Cálculo Diferencial; se asigna asesor par de 6° semestre.',
        'Pendiente',  NULL, INTERVAL '1 day'),
    ('24020527', 'CIS',              'Busca integrarse a proyectos de la comunidad para fortalecer su perfil de residencia.',
        'Atendido',   'Integrada al proyecto de la app de servicio social de la CIS.', INTERVAL '30 days')
) AS v(ctrl, area, diag, estatus, seg, hace)
JOIN usuarios u ON u.no_control_o_rfc = v.ctrl
JOIN tutorados t ON t.usuario_id = u.id
JOIN asignaciones_tutoria a ON a.tutorado_id = t.id
                           AND a.periodo_escolar = '2026-2'
                           AND a.estatus_asignacion = 'Activa';

-- -----------------------------------------------------------------------------
-- REPORTES / FORMATOS PIT
-- -----------------------------------------------------------------------------
INSERT INTO reportes_pit (tutorado_id, periodo, tipo_formato, archivo_url, contenido_json)
SELECT t.id, v.periodo, v.tipo::tipo_formato_pit, v.url, v.json::jsonb
FROM (VALUES
    ('25020112', '2026-2', 'FichaIdentificacion', NULL,
        '{"vive_con":"Padres","trabaja":true,"horas_trabajo_semana":20,"beca":"Benito Juárez","intereses":["Desarrollo web"]}'),
    ('25020112', '2026-2', 'PlanTrabajo', NULL,
        '{"objetivo":"Acreditar Estructura de Datos en recursamiento","acciones":["PALPROG 2 veces por semana","Entrega de prácticas en tiempo"],"compromiso_firmado":true}'),
    ('25020345', '2026-2', 'FichaIdentificacion', NULL,
        '{"vive_con":"Padres","trabaja":false,"intereses":["Desarrollo Web","Tecnologías Emergentes"]}'),
    ('25020345', '2026-1', 'ReporteSemestral', '/uploads/reportes/2026-1/25020345-reporte-semestral.pdf', NULL),
    ('24020418', '2026-2', 'FichaIdentificacion', NULL,
        '{"vive_con":"Solo","trabaja":true,"horas_trabajo_semana":30,"beca":null,"intereses":["Redes"]}')
) AS v(ctrl, periodo, tipo, url, json)
JOIN usuarios u ON u.no_control_o_rfc = v.ctrl
JOIN tutorados t ON t.usuario_id = u.id;

-- -----------------------------------------------------------------------------
-- EVALUACIÓN DEL TUTOR HACIA EL PIT (1=Siempre … 5=Nunca)
--   Karla ya respondió; Noemí y Roberto quedan pendientes.
-- -----------------------------------------------------------------------------
INSERT INTO evaluaciones_tutor (tutor_id, periodo, p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11, comentarios, fecha_envio)
SELECT tu.id, '2026-2', 2,3,1,2,4,1,1,3,4,2,3,
       'Se requiere un cubículo con mejor ventilación y horarios de PALPROG compatibles con 6° semestre.',
       now() - INTERVAL '3 days'
  FROM tutores tu
  JOIN usuarios u ON u.id = tu.usuario_id
 WHERE u.correo_institucional = 'karla.pm@veracruz.tecnm.mx';

-- Histórico del periodo anterior para comparar
INSERT INTO evaluaciones_tutor (tutor_id, periodo, p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11, comentarios, fecha_envio)
SELECT tu.id, '2026-1', 1,2,1,2,3,1,1,2,3,1,2, NULL, TIMESTAMPTZ '2026-06-05 12:00-06'
  FROM tutores tu
  JOIN usuarios u ON u.id = tu.usuario_id
 WHERE u.correo_institucional = 'noemi.tp@veracruz.tecnm.mx';

COMMIT;

-- Resumen rápido
SELECT nivel_riesgo, count(*) AS tutorados FROM tutorados GROUP BY nivel_riesgo ORDER BY nivel_riesgo;

-- Evaluaciones de tutorados (secciones 4 y 5) – mismos datos de ejemplo que la migración 002
\ir migracion_002_evaluacion_alumnos.sql

-- Avisos de ejemplo + 3 alumnos de nuevo ingreso sin tutor (migración 003)
\ir migracion_003_avisos_asignaciones.sql

-- Perfiles de tutor, horarios de atención y perfiles de tutorado (migración 004)
\ir migracion_004_eleccion_tutor_perfiles.sql

-- En el modelo actual los tutorados ELIGEN a su tutor: las asignaciones vigentes
-- de ejemplo se marcan como elección del tutorado.
UPDATE asignaciones_tutoria SET origen = 'Elección del tutorado'
 WHERE periodo_escolar = '2026-2' AND estatus_asignacion = 'Activa';

-- Perfil "persona" de los tutores de ejemplo (migración 005)
\ir migracion_005_perfil_tutor.sql

-- Fichas de identificación (Anexo 6) de ejemplo (migración 007)
\ir migracion_007_ficha_identificacion.sql
