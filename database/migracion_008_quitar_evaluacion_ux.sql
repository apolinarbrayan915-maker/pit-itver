-- =============================================================================
--  MIGRACIÓN 008 · Retiro de la Evaluación de Satisfacción de la Plataforma (UX + SUS)
--  La evaluación UX ya no forma parte de la plataforma: se elimina su tabla y
--  las respuestas guardadas. Es seguro ejecutarla más de una vez.
--
--  Ejecutar (PowerShell, desde la carpeta pit-itver):
--      $env:PGCLIENTENCODING="UTF8"
--      psql -U pit_app -d pit_itver -h localhost -f database/migracion_008_quitar_evaluacion_ux.sql
-- =============================================================================
SET client_min_messages = warning;
DROP TABLE IF EXISTS evaluaciones_ux CASCADE;
SELECT CASE WHEN to_regclass('evaluaciones_ux') IS NULL THEN 'evaluaciones_ux eliminada' ELSE 'FALTA eliminar' END AS estado;
