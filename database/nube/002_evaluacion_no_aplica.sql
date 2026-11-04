-- Evaluación del acompañamiento por el tutorado: se agrega la opción "No aplica" (valor 0).
-- Los valores válidos pasan de 1..5 a 0..5.
SET search_path = pit;
ALTER TABLE evaluaciones_alumno DROP CONSTRAINT IF EXISTS chk_evalal_rango;
ALTER TABLE evaluaciones_alumno ADD CONSTRAINT chk_evalal_rango CHECK (
  NOT jsonb_path_exists(respuestas, '$.*?(@.type() != "number" || @ < 0 || @ > 5 || @.floor() != @)')
);
COMMENT ON TABLE evaluaciones_alumno IS 'Evaluación del acompañamiento tutorial hecha por el tutorado (23 ítems Likert 1-5, 0 = No aplica). Confidencial: solo coordinación.';
