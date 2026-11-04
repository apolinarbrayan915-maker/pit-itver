-- =============================================================================
--  MIGRACIÓN 001 · Evaluación del Tutor hacia el Programa de Tutorías (PIT)
--  Agrega la tabla evaluaciones_tutor SIN borrar los datos existentes.
--
--  Ejecutar (PowerShell, desde la carpeta pit-itver):
--      $env:PGCLIENTENCODING="UTF8"
--      psql -U pit_app -d pit_itver -h localhost -f database/migracion_001_evaluaciones.sql
--
--  Es seguro ejecutarla más de una vez.
-- =============================================================================
SET client_min_messages = warning;

BEGIN;

/*
 * Escala Likert del instrumento oficial:
 *   1 = Siempre · 2 = Casi siempre · 3 = A veces · 4 = Casi nunca · 5 = Nunca
 * (valores BAJOS = percepción MÁS favorable del programa)
 * Una evaluación por tutor y periodo; el tutor puede actualizarla.
 */
CREATE TABLE IF NOT EXISTS evaluaciones_tutor (
    id            SERIAL PRIMARY KEY,
    tutor_id      INTEGER    NOT NULL REFERENCES tutores (id) ON DELETE CASCADE,
    periodo       VARCHAR(6) NOT NULL,
    p1  SMALLINT NOT NULL CHECK (p1  BETWEEN 1 AND 5),
    p2  SMALLINT NOT NULL CHECK (p2  BETWEEN 1 AND 5),
    p3  SMALLINT NOT NULL CHECK (p3  BETWEEN 1 AND 5),
    p4  SMALLINT NOT NULL CHECK (p4  BETWEEN 1 AND 5),
    p5  SMALLINT NOT NULL CHECK (p5  BETWEEN 1 AND 5),
    p6  SMALLINT NOT NULL CHECK (p6  BETWEEN 1 AND 5),
    p7  SMALLINT NOT NULL CHECK (p7  BETWEEN 1 AND 5),
    p8  SMALLINT NOT NULL CHECK (p8  BETWEEN 1 AND 5),
    p9  SMALLINT NOT NULL CHECK (p9  BETWEEN 1 AND 5),
    p10 SMALLINT NOT NULL CHECK (p10 BETWEEN 1 AND 5),
    p11 SMALLINT NOT NULL CHECK (p11 BETWEEN 1 AND 5),
    comentarios   TEXT CHECK (comentarios IS NULL OR length(comentarios) <= 2000),
    fecha_envio   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_eval_periodo CHECK (periodo ~ '^[0-9]{4}-[12]$'),
    CONSTRAINT ux_eval_tutor_periodo UNIQUE (tutor_id, periodo)
);

CREATE INDEX IF NOT EXISTS ix_eval_periodo ON evaluaciones_tutor (periodo);

DROP TRIGGER IF EXISTS trg_eval_updated ON evaluaciones_tutor;
CREATE TRIGGER trg_eval_updated BEFORE UPDATE ON evaluaciones_tutor
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE evaluaciones_tutor IS
  'Cuestionario "Evaluación del Tutor hacia el Programa de Tutorías (PIT)": 11 reactivos Likert 1-5 (1=Siempre … 5=Nunca).';

-- Dato de ejemplo: la Dra. Karla Peralta ya respondió en 2026-2
-- (la Mtra. Noemí queda pendiente para que puedas probar el formulario)
INSERT INTO evaluaciones_tutor (tutor_id, periodo, p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11, comentarios, fecha_envio)
SELECT tu.id, '2026-2', 2,3,1,2,4,1,1,3,4,2,3,
       'Se requiere un cubículo con mejor ventilación y horarios de PALPROG compatibles con 6° semestre.',
       now() - INTERVAL '3 days'
  FROM tutores tu
  JOIN usuarios u ON u.id = tu.usuario_id
 WHERE u.correo_institucional = 'karla.pm@veracruz.tecnm.mx'
ON CONFLICT (tutor_id, periodo) DO NOTHING;

COMMIT;

SELECT count(*) AS evaluaciones_registradas FROM evaluaciones_tutor;
