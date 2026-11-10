-- Confirmación de asistencia: el tutor indica si el tutorado asistió y cuánto duró la sesión.
SET search_path = pit;
ALTER TABLE citas_tutorias ADD COLUMN IF NOT EXISTS asistio boolean;
ALTER TABLE citas_tutorias ADD COLUMN IF NOT EXISTS duracion_real_min smallint;
ALTER TABLE citas_tutorias ADD COLUMN IF NOT EXISTS atendida_en timestamptz;
ALTER TABLE citas_tutorias DROP CONSTRAINT IF EXISTS chk_citas_duracion_real;
ALTER TABLE citas_tutorias ADD CONSTRAINT chk_citas_duracion_real
  CHECK (duracion_real_min IS NULL OR duracion_real_min IN (15, 30, 45, 60));
-- Citas atendidas antes de este cambio: se asume asistencia por el tiempo agendado
UPDATE citas_tutorias
   SET asistio = true,
       duracion_real_min = CASE WHEN duracion_min >= 60 THEN 60 WHEN duracion_min >= 45 THEN 45 WHEN duracion_min >= 30 THEN 30 ELSE 15 END
 WHERE estatus = 'Completada' AND asistio IS NULL;
COMMENT ON COLUMN citas_tutorias.asistio IS 'true = el tutorado asistió (cita Completada); false = no asistió (cita Cancelada por inasistencia).';
COMMENT ON COLUMN citas_tutorias.duracion_real_min IS 'Duración real de la sesión confirmada por el tutor: 15, 30, 45 o 60 minutos.';
