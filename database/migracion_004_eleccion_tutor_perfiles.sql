-- =============================================================================
--  MIGRACIÓN 004 · El tutorado elige a su tutor + perfiles
--   - Perfil "persona" del tutorado (foto, datos personales, objetivos, frustraciones)
--   - Perfil público del tutor (presentación, áreas de apoyo) y horario de atención
--   - Disponibilidad del tutor para recibir tutorados (la controla la coordinación)
--   - Origen de cada asignación: elección del tutorado o coordinación
--  No borra datos. Es seguro ejecutarla más de una vez.
--
--  Ejecutar (PowerShell, desde la carpeta pit-itver):
--      $env:PGCLIENTENCODING="UTF8"
--      psql -U pit_app -d pit_itver -h localhost -f database/migracion_004_eleccion_tutor_perfiles.sql
-- =============================================================================
SET client_min_messages = warning;

BEGIN;

-- -----------------------------------------------------------------------------
-- Tutores: perfil público y disponibilidad
-- -----------------------------------------------------------------------------
ALTER TABLE tutores ADD COLUMN IF NOT EXISTS presentacion     TEXT;
ALTER TABLE tutores ADD COLUMN IF NOT EXISTS areas_apoyo      TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE tutores ADD COLUMN IF NOT EXISTS acepta_tutorados BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN
    ALTER TABLE tutores ADD CONSTRAINT chk_tutores_presentacion
        CHECK (presentacion IS NULL OR length(presentacion) <= 1500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Horario semanal de atención tutorial (lunes=1 … viernes=5)
CREATE TABLE IF NOT EXISTS tutor_horarios (
    id           SERIAL PRIMARY KEY,
    tutor_id     INTEGER  NOT NULL REFERENCES tutores (id) ON DELETE CASCADE,
    dia_semana   SMALLINT NOT NULL CHECK (dia_semana BETWEEN 1 AND 5),
    hora_inicio  TIME     NOT NULL,
    hora_fin     TIME     NOT NULL,
    CONSTRAINT chk_horario_rango CHECK (hora_fin > hora_inicio
                                        AND hora_inicio >= TIME '07:00' AND hora_fin <= TIME '20:00'),
    CONSTRAINT ux_horario_bloque UNIQUE (tutor_id, dia_semana, hora_inicio)
);
CREATE INDEX IF NOT EXISTS ix_horarios_tutor ON tutor_horarios (tutor_id, dia_semana);

-- -----------------------------------------------------------------------------
-- Asignaciones: quién originó la relación tutor–tutorado
-- -----------------------------------------------------------------------------
ALTER TABLE asignaciones_tutoria ADD COLUMN IF NOT EXISTS origen VARCHAR(25) NOT NULL DEFAULT 'Coordinación';
DO $$ BEGIN
    ALTER TABLE asignaciones_tutoria ADD CONSTRAINT chk_asig_origen
        CHECK (origen IN ('Coordinación', 'Elección del tutorado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- Perfil "persona" del tutorado (lo llena el alumno; lo ven su tutor y la coordinación)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS perfiles_tutorado (
    tutorado_id       INTEGER PRIMARY KEY REFERENCES tutorados (id) ON DELETE CASCADE,
    foto              TEXT,           -- imagen JPEG/PNG en data URL (reducida en el navegador)
    fecha_nacimiento  DATE,
    ciudad_natal      VARCHAR(80),
    familia           VARCHAR(120),   -- p.ej. "Vive con sus padres, 2 hermanos"
    ocupacion         VARCHAR(120),   -- p.ej. "Estudiante ISC y trabaja medio tiempo"
    frase             VARCHAR(160),   -- frase que lo describe
    objetivos         TEXT[] NOT NULL DEFAULT '{}',
    frustraciones     TEXT[] NOT NULL DEFAULT '{}',
    biografia         TEXT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_perfil_foto CHECK (foto IS NULL OR (foto LIKE 'data:image/%' AND length(foto) <= 400000)),
    CONSTRAINT chk_perfil_nacimiento CHECK (fecha_nacimiento IS NULL
        OR fecha_nacimiento BETWEEN DATE '1950-01-01' AND DATE '2015-12-31'),
    CONSTRAINT chk_perfil_listas CHECK (cardinality(objetivos) <= 6 AND cardinality(frustraciones) <= 6),
    CONSTRAINT chk_perfil_bio CHECK (biografia IS NULL OR length(biografia) <= 1500)
);

DROP TRIGGER IF EXISTS trg_perfil_tutorado_updated ON perfiles_tutorado;
CREATE TRIGGER trg_perfil_tutorado_updated BEFORE UPDATE ON perfiles_tutorado
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE perfiles_tutorado IS 'Perfil tipo "persona" (UX) del tutorado: contexto personal, objetivos y frustraciones.';

-- -----------------------------------------------------------------------------
-- Datos de ejemplo (solo se aplican si aún no existen)
-- -----------------------------------------------------------------------------
UPDATE tutores tu SET
    presentacion = v.presentacion,
    areas_apoyo  = v.areas,
    max_tutorados = v.cupo
  FROM (VALUES
    ('noemi.tp@veracruz.tecnm.mx',
     'Ingeniera en Sistemas con maestría en Tecnologías de la Información. Acompaño a mis tutorados en la planeación de su carga académica y en el desarrollo de proyectos web.',
     ARRAY['Desarrollo web', 'Planeación de retícula', 'Hábitos de estudio'], 6),
    ('karla.pm@veracruz.tecnm.mx',
     'Doctora en Ciencias de la Computación. Me enfoco en estudiantes con rezago en programación y en la preparación para residencias profesionales.',
     ARRAY['Programación', 'Residencia profesional', 'Investigación'], 6),
    ('roberto.gf@veracruz.tecnm.mx',
     'Maestro en Redes y Sistemas Operativos. Apoyo la integración de alumnos de primeros semestres y la orientación sobre servicio social y becas.',
     ARRAY['Redes', 'Nuevo ingreso', 'Trámites y becas'], 8)
  ) AS v(correo, presentacion, areas, cupo)
  JOIN usuarios u ON u.correo_institucional = v.correo
 WHERE tu.usuario_id = u.id AND tu.presentacion IS NULL;

INSERT INTO tutor_horarios (tutor_id, dia_semana, hora_inicio, hora_fin)
SELECT tu.id, v.dia, v.ini::time, v.fin::time
  FROM (VALUES
    ('noemi.tp@veracruz.tecnm.mx', 1, '10:00', '12:00'),
    ('noemi.tp@veracruz.tecnm.mx', 2, '10:00', '12:00'),
    ('noemi.tp@veracruz.tecnm.mx', 3, '16:00', '18:00'),
    ('noemi.tp@veracruz.tecnm.mx', 4, '11:00', '13:00'),
    ('noemi.tp@veracruz.tecnm.mx', 5, '10:00', '12:00'),
    ('karla.pm@veracruz.tecnm.mx', 2, '13:00', '15:00'),
    ('karla.pm@veracruz.tecnm.mx', 3, '16:00', '18:00'),
    ('karla.pm@veracruz.tecnm.mx', 4, '11:00', '13:00'),
    ('roberto.gf@veracruz.tecnm.mx', 1, '13:00', '15:00'),
    ('roberto.gf@veracruz.tecnm.mx', 2, '13:00', '15:00'),
    ('roberto.gf@veracruz.tecnm.mx', 3, '13:00', '15:00'),
    ('roberto.gf@veracruz.tecnm.mx', 4, '13:00', '15:00'),
    ('roberto.gf@veracruz.tecnm.mx', 5, '13:00', '15:00')
  ) AS v(correo, dia, ini, fin)
  JOIN usuarios u ON u.correo_institucional = v.correo
  JOIN tutores tu ON tu.usuario_id = u.id
 WHERE NOT EXISTS (SELECT 1 FROM tutor_horarios h WHERE h.tutor_id = tu.id)
ON CONFLICT DO NOTHING;

INSERT INTO perfiles_tutorado (tutorado_id, fecha_nacimiento, ciudad_natal, familia, ocupacion, frase, objetivos, frustraciones, biografia)
SELECT t.id, v.nac::date, v.ciudad, v.familia, v.ocupacion, v.frase, v.objetivos, v.frustraciones, v.bio
  FROM (VALUES
    ('25020112', '2005-03-14', 'Boca del Río, Ver.', 'Vive con sus padres y una hermana menor',
     'Estudiante ISC; trabaja 20 h por semana en una tienda',
     'Quiero terminar la carrera aunque me cueste más tiempo',
     ARRAY['Acreditar Estructura de Datos en recursamiento', 'Organizar mejor su tiempo entre trabajo y escuela', 'No volver a reprobar asignaturas'],
     ARRAY['El horario de trabajo choca con las asesorías', 'Siente que se atrasa respecto a su generación'],
     'Carlos cursa 4.° semestre. Trabaja por las tardes para apoyar en casa y eso le ha dificultado asistir a asesorías. Busca un tutor con horario de mañana que le ayude a planear su retícula.'),
    ('25020345', '2005-09-02', 'Veracruz, Ver.', 'Vive con sus padres',
     'Estudiante ISC',
     'La constancia vale más que el talento',
     ARRAY['Mantener su promedio arriba de 90', 'Participar en concursos de programación', 'Conseguir una beca de movilidad'],
     ARRAY['Pocas opciones de actividades extracurriculares en su horario'],
     'Juan es alumno regular de 4.° semestre con interés en desarrollo web y tecnologías emergentes.')
  ) AS v(ctrl, nac, ciudad, familia, ocupacion, frase, objetivos, frustraciones, bio)
  JOIN usuarios u ON u.no_control_o_rfc = v.ctrl
  JOIN tutorados t ON t.usuario_id = u.id
ON CONFLICT (tutorado_id) DO NOTHING;

COMMIT;

SELECT (SELECT count(*) FROM tutor_horarios)    AS bloques_de_horario,
       (SELECT count(*) FROM perfiles_tutorado) AS perfiles_de_tutorado;
