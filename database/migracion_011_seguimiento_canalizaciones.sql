-- 008: Bitácora de seguimiento de canalizaciones y fecha de próxima revisión

ALTER TABLE canalizaciones ADD COLUMN IF NOT EXISTS proxima_revision date;
COMMENT ON COLUMN canalizaciones.proxima_revision IS 'Fecha en que el tutor planea revisar de nuevo el avance de la canalización.';

CREATE TABLE IF NOT EXISTS canalizacion_seguimientos (
    id serial PRIMARY KEY,
    canalizacion_id integer NOT NULL REFERENCES canalizaciones(id) ON DELETE CASCADE,
    usuario_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
    estatus_anterior estatus_canalizacion,
    estatus_nuevo estatus_canalizacion,
    nota text NOT NULL,
    fecha timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_canal_seg_nota CHECK (length(trim(nota)) >= 3)
);
CREATE INDEX IF NOT EXISTS ix_canal_seg_canalizacion ON canalizacion_seguimientos (canalizacion_id, fecha);
COMMENT ON TABLE canalizacion_seguimientos IS 'Bitácora de cada canalización: notas del tutor o la coordinación y cambios de estatus.';

-- Canalizaciones ya registradas: su alta (y la nota de seguimiento previa, si había) entran a la bitácora
INSERT INTO canalizacion_seguimientos (canalizacion_id, usuario_id, estatus_anterior, estatus_nuevo, nota, fecha)
SELECT c.id, tu.usuario_id, NULL, 'Pendiente', 'Canalización registrada. ' || c.diagnostico_inicial, c.fecha_registro
  FROM canalizaciones c JOIN tutores tu ON tu.id = c.tutor_id
 WHERE NOT EXISTS (SELECT 1 FROM canalizacion_seguimientos s WHERE s.canalizacion_id = c.id);

INSERT INTO canalizacion_seguimientos (canalizacion_id, usuario_id, estatus_anterior, estatus_nuevo, nota, fecha)
SELECT c.id, tu.usuario_id, 'Pendiente', c.estatus_canalizacion,
       COALESCE(NULLIF(trim(c.seguimiento), ''), 'Estatus actualizado a ' || c.estatus_canalizacion || '.'), c.updated_at
  FROM canalizaciones c JOIN tutores tu ON tu.id = c.tutor_id
 WHERE (c.estatus_canalizacion <> 'Pendiente' OR NULLIF(trim(c.seguimiento), '') IS NOT NULL)
   AND (SELECT count(*) FROM canalizacion_seguimientos s WHERE s.canalizacion_id = c.id) = 1;
