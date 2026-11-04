-- =============================================================================
--  MIGRACIÓN 002 · Evaluación del Acompañamiento Tutorial por el TUTORADO
--  (Secciones 4 y 5: 34 ítems Likert). Agrega la tabla SIN borrar datos.
--
--  Ejecutar (PowerShell, desde la carpeta pit-itver):
--      $env:PGCLIENTENCODING="UTF8"
--      psql -U pit_app -d pit_itver -h localhost -f database/migracion_002_evaluacion_alumnos.sql
--
--  Es seguro ejecutarla más de una vez.
--  CONFIDENCIAL: solo la Coordinación de Tutorías consulta estas respuestas;
--  la API no expone ningún endpoint de esta tabla al rol "tutor".
-- =============================================================================
SET client_min_messages = warning;

BEGIN;

/*
 * respuestas: objeto JSON con las claves s4a…s4p y s5a…s5r
 *             y valores 1 = Siempre · 2 = Casi siempre · 3 = A veces · 4 = Casi nunca · 5 = Nunca
 * tutor_id:   tutor evaluado (el asignado al alumno en ese periodo, se guarda
 *             para conservar el histórico aunque después cambie la asignación)
 */
CREATE TABLE IF NOT EXISTS evaluaciones_alumno (
    id            SERIAL PRIMARY KEY,
    tutorado_id   INTEGER    NOT NULL REFERENCES tutorados (id) ON DELETE CASCADE,
    tutor_id      INTEGER    NOT NULL REFERENCES tutores   (id) ON DELETE CASCADE,
    periodo       VARCHAR(6) NOT NULL,
    respuestas    JSONB      NOT NULL,
    comentarios   TEXT CHECK (comentarios IS NULL OR length(comentarios) <= 2000),
    fecha_envio   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_evalal_periodo CHECK (periodo ~ '^[0-9]{4}-[12]$'),
    CONSTRAINT chk_evalal_objeto  CHECK (jsonb_typeof(respuestas) = 'object'),
    -- Todos los valores deben ser enteros del 1 al 5
    CONSTRAINT chk_evalal_rango   CHECK (NOT jsonb_path_exists(
        respuestas, '$.* ? (@.type() != "number" || @ < 1 || @ > 5 || @.floor() != @)')),
    CONSTRAINT ux_evalal_alumno_periodo UNIQUE (tutorado_id, periodo)
);

CREATE INDEX IF NOT EXISTS ix_evalal_tutor_periodo ON evaluaciones_alumno (tutor_id, periodo);

DROP TRIGGER IF EXISTS trg_evalal_updated ON evaluaciones_alumno;
CREATE TRIGGER trg_evalal_updated BEFORE UPDATE ON evaluaciones_alumno
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE evaluaciones_alumno IS
  'Evaluación del acompañamiento tutorial hecha por el tutorado (secciones 4 y 5, 34 ítems Likert 1-5). Confidencial: solo coordinación.';

-- -----------------------------------------------------------------------------
-- Datos de ejemplo (2026-2): Juan y Andrea evalúan a la Mtra. Noemí,
-- Sofía evalúa a la Dra. Karla. Carlos queda pendiente para probar el formulario.
-- -----------------------------------------------------------------------------
WITH claves AS (
    SELECT 's4' || chr(96 + i) AS clave, i FROM generate_series(1, 16) AS i
    UNION ALL
    SELECT 's5' || chr(96 + i), 16 + i  FROM generate_series(1, 18) AS i
),
ejemplos (no_control, patron, comentario, hace) AS (
    VALUES ('25020345', 1, 'Mi tutora siempre está disponible y me recomendó integrarme a CEPC.', INTERVAL '4 days'),
           ('25020204', 2, 'Me gustaría que las sesiones grupales fueran más frecuentes.',        INTERVAL '2 days'),
           ('24020527', 3, NULL,                                                                  INTERVAL '1 day')
)
INSERT INTO evaluaciones_alumno (tutorado_id, tutor_id, periodo, respuestas, comentarios, fecha_envio)
SELECT t.id, a.tutor_id, '2026-2',
       (SELECT jsonb_object_agg(c.clave,
                 CASE e.patron
                      WHEN 1 THEN 1 + (c.i % 2)                 -- muy favorable
                      WHEN 2 THEN 1 + (c.i % 3)                 -- favorable
                      ELSE LEAST(5, 2 + (c.i % 4))              -- regular
                 END) FROM claves c),
       e.comentario, now() - e.hace
  FROM ejemplos e
  JOIN usuarios u ON u.no_control_o_rfc = e.no_control
  JOIN tutorados t ON t.usuario_id = u.id
  JOIN asignaciones_tutoria a ON a.tutorado_id = t.id
                             AND a.periodo_escolar = '2026-2'
                             AND a.estatus_asignacion = 'Activa'
ON CONFLICT (tutorado_id, periodo) DO NOTHING;

COMMIT;

SELECT count(*) AS evaluaciones_de_alumnos FROM evaluaciones_alumno;
