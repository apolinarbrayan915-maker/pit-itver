-- =============================================================================
--  MIGRACIÓN 005 · Perfil tipo "persona" del tutor
--  Foto, grado académico, especialidad, experiencia, frase y enfoque de apoyo.
--  (El horario de atención ya vive en tutor_horarios, migración 004.)
--  No borra datos. Es seguro ejecutarla más de una vez.
--
--  Ejecutar (PowerShell, desde la carpeta pit-itver):
--      $env:PGCLIENTENCODING="UTF8"
--      psql -U pit_app -d pit_itver -h localhost -f database/migracion_005_perfil_tutor.sql
-- =============================================================================
SET client_min_messages = warning;

BEGIN;

ALTER TABLE tutores ADD COLUMN IF NOT EXISTS foto              TEXT;
ALTER TABLE tutores ADD COLUMN IF NOT EXISTS grado_academico   VARCHAR(120);  -- "Maestría en Tecnologías de la Información"
ALTER TABLE tutores ADD COLUMN IF NOT EXISTS especialidad      VARCHAR(120);  -- "Desarrollo de software"
ALTER TABLE tutores ADD COLUMN IF NOT EXISTS anios_experiencia SMALLINT;
ALTER TABLE tutores ADD COLUMN IF NOT EXISTS frase             VARCHAR(160);
ALTER TABLE tutores ADD COLUMN IF NOT EXISTS enfoque           TEXT[] NOT NULL DEFAULT '{}';  -- "¿En qué puedo apoyarte?"

DO $$ BEGIN
    ALTER TABLE tutores ADD CONSTRAINT chk_tutores_foto
        CHECK (foto IS NULL OR (foto LIKE 'data:image/%' AND length(foto) <= 400000));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE tutores ADD CONSTRAINT chk_tutores_experiencia
        CHECK (anios_experiencia IS NULL OR anios_experiencia BETWEEN 0 AND 60);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE tutores ADD CONSTRAINT chk_tutores_enfoque CHECK (cardinality(enfoque) <= 6);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Datos de ejemplo (solo si el tutor aún no los tiene)
UPDATE tutores tu SET
    grado_academico   = v.grado,
    especialidad      = v.especialidad,
    anios_experiencia = v.anios,
    frase             = v.frase,
    enfoque           = v.enfoque
  FROM (VALUES
    ('noemi.tp@veracruz.tecnm.mx', 'Maestría en Tecnologías de la Información', 'Desarrollo web', 15,
     'Cada estudiante avanza a su ritmo; mi trabajo es que no avance solo',
     ARRAY['Planear tu carga académica y retícula', 'Recuperar asignaturas reprobadas', 'Mejorar hábitos de estudio']),
    ('karla.pm@veracruz.tecnm.mx', 'Doctorado en Ciencias de la Computación', 'Algoritmos y programación', 12,
     'Programar se aprende programando',
     ARRAY['Reforzar lógica y programación', 'Preparar tu residencia profesional', 'Iniciarte en investigación']),
    ('roberto.gf@veracruz.tecnm.mx', 'Maestría en Redes y Sistemas Operativos', 'Redes de computadoras', 8,
     'La universidad es más fácil cuando sabes a quién acudir',
     ARRAY['Adaptarte al primer semestre', 'Trámites, becas y servicio social', 'Orientarte sobre áreas de especialidad'])
  ) AS v(correo, grado, especialidad, anios, frase, enfoque)
  JOIN usuarios u ON u.correo_institucional = v.correo
 WHERE tu.usuario_id = u.id AND tu.grado_academico IS NULL;

COMMIT;

SELECT count(*) FILTER (WHERE grado_academico IS NOT NULL) AS tutores_con_perfil FROM tutores;
