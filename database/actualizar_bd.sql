-- =============================================================================
--  ACTUALIZAR BASE DE DATOS EXISTENTE (sin borrar datos)
--  Aplica, en orden, todas las migraciones 001 → 008 (la 006 se retiró). Cada una es segura de
--  repetir: si ya estaba aplicada, simplemente no cambia nada.
--
--  Ejecutar (PowerShell, desde la carpeta pit-itver):
--      $env:PGCLIENTENCODING="UTF8"
--      psql -U pit_app -d pit_itver -h localhost -f database/actualizar_bd.sql
--
--  ¿Base de datos nueva y vacía? Usa en su lugar schema.sql y luego seed.sql.
-- =============================================================================
\echo '== 001 · Evaluación del tutor hacia el programa'
\ir migracion_001_evaluaciones.sql
\echo '== 002 · Evaluación del acompañamiento por el tutorado'
\ir migracion_002_evaluacion_alumnos.sql
\echo '== 003 · Avisos de coordinación'
\ir migracion_003_avisos_asignaciones.sql
\echo '== 004 · Elección de tutor, horarios y perfil del tutorado'
\ir migracion_004_eleccion_tutor_perfiles.sql
\echo '== 005 · Perfil del tutor'
\ir migracion_005_perfil_tutor.sql
\echo '== 007 · Ficha de identificación del tutorado (Anexo 6)'
\ir migracion_007_ficha_identificacion.sql
\echo '== 008 · Retiro de la evaluación de satisfacción UX'
\ir migracion_008_quitar_evaluacion_ux.sql

\echo ''
\echo '== Verificación: deben aparecer las 7 tablas con "ok"'
SELECT t AS tabla, CASE WHEN to_regclass(t) IS NULL THEN 'FALTA' ELSE 'ok' END AS estado
  FROM unnest(ARRAY['evaluaciones_tutor','evaluaciones_alumno','avisos','tutor_horarios',
                    'perfiles_tutorado','fichas_identificacion','tutorados']) AS t;
