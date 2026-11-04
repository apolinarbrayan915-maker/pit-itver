-- =============================================================================
--  MIGRACIÓN 003 · Avisos de la Coordinación + alumnos de nuevo ingreso
--  Agrega la tabla avisos SIN borrar datos.
--
--  Ejecutar (PowerShell, desde la carpeta pit-itver):
--      $env:PGCLIENTENCODING="UTF8"
--      psql -U pit_app -d pit_itver -h localhost -f database/migracion_003_avisos_asignaciones.sql
--
--  Es seguro ejecutarla más de una vez.
-- =============================================================================
SET client_min_messages = warning;

BEGIN;

-- -----------------------------------------------------------------------------
-- AVISOS: los redacta la Coordinación y solo los ven los tutores.
--   Borrador  → solo visible para la Coordinación
--   Publicado → visible para los tutores
--   Archivado → retirado (se conserva el histórico)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS avisos (
    id                 SERIAL PRIMARY KEY,
    titulo             VARCHAR(150) NOT NULL CHECK (length(trim(titulo)) >= 5),
    categoria          VARCHAR(40)  NOT NULL DEFAULT 'Coordinación de Tutorías',
    contenido          TEXT         NOT NULL CHECK (length(trim(contenido)) >= 10 AND length(contenido) <= 4000),
    importante         BOOLEAN      NOT NULL DEFAULT false,
    estado             VARCHAR(10)  NOT NULL DEFAULT 'Borrador'
                           CHECK (estado IN ('Borrador', 'Publicado', 'Archivado')),
    autor_id           INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
    fecha_publicacion  TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_avisos_publicacion CHECK (estado = 'Borrador' OR fecha_publicacion IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_avisos_estado ON avisos (estado, fecha_publicacion DESC);

DROP TRIGGER IF EXISTS trg_avisos_updated ON avisos;
CREATE TRIGGER trg_avisos_updated BEFORE UPDATE ON avisos
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE avisos IS 'Avisos de la Coordinación de Tutorías dirigidos a los tutores.';

-- Avisos de ejemplo (solo si la tabla está vacía)
INSERT INTO avisos (titulo, categoria, contenido, importante, estado, autor_id, fecha_publicacion)
SELECT v.titulo, v.categoria, v.contenido, v.importante, v.estado, u.id,
       CASE WHEN v.estado = 'Borrador' THEN NULL ELSE now() - v.hace END
  FROM (VALUES
        ('Periodo de Evaluaciones Parciales y Reporte de Tutorados en Riesgo', 'Coordinación de Tutorías',
         'Se recuerda a los tutores realizar sus sesiones obligatorias y reportar a los tutorados en riesgo antes del cierre del segundo corte evaluativo.',
         true, 'Publicado', INTERVAL '2 days'),
        ('Talleres de Reforzamiento en Estructuras de Datos y Matemáticas Discretas', 'Canalización Académica',
         'Inscripciones abiertas en el cubículo de tutorías del Departamento de Sistemas. Canalicen a los tutorados con 2 o más asignaturas reprobadas.',
         false, 'Publicado', INTERVAL '5 days'),
        ('Entrega del Reporte Semestral del Tutor', 'Coordinación de Tutorías',
         'La fecha límite para entregar el reporte semestral y las actas de acreditación es el 12 de diciembre de 2026.',
         false, 'Borrador', INTERVAL '0 days')
       ) AS v(titulo, categoria, contenido, importante, estado, hace)
  LEFT JOIN usuarios u ON u.rol = 'coordinador'
 WHERE NOT EXISTS (SELECT 1 FROM avisos)
 ORDER BY v.hace DESC;

-- -----------------------------------------------------------------------------
-- Alumnos de nuevo ingreso SIN tutor asignado, para probar el módulo de
-- asignación de grupos (contraseña: Tutorias2026!)
-- -----------------------------------------------------------------------------
INSERT INTO usuarios (no_control_o_rfc, nombre, apellidos, correo_institucional, password_hash, rol)
VALUES
  ('26020301', 'Mariana', 'López Rivera',  'l26020301@veracruz.tecnm.mx', crypt('Tutorias2026!', gen_salt('bf', 10)), 'alumno'),
  ('26020318', 'Emiliano', 'Castro Ruiz',  'l26020318@veracruz.tecnm.mx', crypt('Tutorias2026!', gen_salt('bf', 10)), 'alumno'),
  ('25020477', 'Fernanda', 'Ortega Lara',  'l25020477@veracruz.tecnm.mx', crypt('Tutorias2026!', gen_salt('bf', 10)), 'alumno')
ON CONFLICT (no_control_o_rfc) DO NOTHING;

INSERT INTO tutorados (usuario_id, semestre, periodo_ingreso, materias_reprobadas, avance_reticular_pct, promedio, telefono)
SELECT u.id, v.sem, v.ingreso, v.reprob, v.avance, v.prom, v.tel
  FROM (VALUES
        ('26020301', 1, '2026-2', 0,  0.00, NULL::numeric, '2291234511'),
        ('26020318', 1, '2026-2', 0,  0.00, NULL::numeric, '2291234512'),
        ('25020477', 3, '2025-2', 1, 20.00, 79.40,         '2291234513')
       ) AS v(ctrl, sem, ingreso, reprob, avance, prom, tel)
  JOIN usuarios u ON u.no_control_o_rfc = v.ctrl
 WHERE NOT EXISTS (SELECT 1 FROM tutorados t WHERE t.usuario_id = u.id);

COMMIT;

SELECT (SELECT count(*) FROM avisos) AS avisos,
       (SELECT count(*) FROM tutorados t
         WHERE NOT EXISTS (SELECT 1 FROM asignaciones_tutoria a
                            WHERE a.tutorado_id = t.id AND a.estatus_asignacion = 'Activa')) AS tutorados_sin_tutor;
