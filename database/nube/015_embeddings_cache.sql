-- =============================================================================
--  015 · Caché de embeddings (Sentence-BERT) para la lupa de tutorías
--  Guarda el vector de cada texto de perfil (área, materia, enfoque…) para no
--  volver a pedirlo al modelo. Se llena solo; borrar filas solo obliga a recalcular.
-- =============================================================================
SET search_path = pit;

CREATE TABLE IF NOT EXISTS embeddings_cache (
  modelo     text        NOT NULL,
  hash       text        NOT NULL,
  vector     real[]      NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (modelo, hash)
);
