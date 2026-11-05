-- Minuta de la sesión de tutoría: asuntos tratados, acuerdos/compromisos y fecha de
-- seguimiento que el tutor registra en la cita (se imprime en la hoja membretada).
SET search_path = pit;
ALTER TABLE citas_tutorias ADD COLUMN IF NOT EXISTS minuta jsonb;
ALTER TABLE citas_tutorias DROP CONSTRAINT IF EXISTS chk_citas_minuta;
ALTER TABLE citas_tutorias ADD CONSTRAINT chk_citas_minuta
  CHECK (minuta IS NULL OR jsonb_typeof(minuta) = 'object');
COMMENT ON COLUMN citas_tutorias.minuta IS 'Minuta de la sesión: {asuntos, acuerdos, seguimiento (YYYY-MM-DD), actualizada}.';
