SET search_path = pit;

ALTER TABLE tutores ADD COLUMN IF NOT EXISTS catalogo_materias_id text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_tutores_catalogo_materias
    ON tutores (catalogo_materias_id) WHERE catalogo_materias_id IS NOT NULL;
