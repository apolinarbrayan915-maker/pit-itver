-- Perfil del tutorado: fecha de nacimiento, ciudad natal y teléfono son los
-- mismos datos de la Ficha de Identificación; ciudad natal sale del catálogo
-- de estados y municipios ("Municipio, Estado"); familia se elige de una lista.

ALTER TABLE pit.perfiles_tutorado ALTER COLUMN ciudad_natal TYPE varchar(100);
ALTER TABLE pit.perfiles_tutorado DROP CONSTRAINT IF EXISTS chk_perfil_nacimiento;
ALTER TABLE pit.perfiles_tutorado ADD CONSTRAINT chk_perfil_nacimiento
  CHECK (fecha_nacimiento IS NULL OR fecha_nacimiento BETWEEN DATE '1930-01-01' AND DATE '2020-12-31');

-- "Ciudad, Ver." → "Ciudad, Veracruz"
UPDATE pit.perfiles_tutorado
   SET ciudad_natal = regexp_replace(ciudad_natal, ',\s*Ver\.?\s*$', ', Veracruz')
 WHERE ciudad_natal ~ ',\s*Ver\.?\s*$';
UPDATE pit.fichas_identificacion
   SET datos = jsonb_set(datos, '{lugar_nacimiento}',
                         to_jsonb(regexp_replace(datos->>'lugar_nacimiento', ',\s*Ver\.?\s*$', ', Veracruz')))
 WHERE datos->>'lugar_nacimiento' ~ ',\s*Ver\.?\s*$';

-- La ficha manda: el perfil toma sus datos compartidos
INSERT INTO pit.perfiles_tutorado (tutorado_id, fecha_nacimiento, ciudad_natal)
SELECT f.tutorado_id, NULLIF(f.datos->>'fecha_nacimiento', '')::date, NULLIF(f.datos->>'lugar_nacimiento', '')
  FROM pit.fichas_identificacion f
ON CONFLICT (tutorado_id) DO UPDATE
   SET fecha_nacimiento = EXCLUDED.fecha_nacimiento, ciudad_natal = EXCLUDED.ciudad_natal;
UPDATE pit.tutorados t
   SET telefono = f.datos->>'celular1'
  FROM pit.fichas_identificacion f
 WHERE f.tutorado_id = t.id AND COALESCE(f.datos->>'celular1', '') <> '';

-- Familia: de texto libre a la lista de integrantes
UPDATE pit.perfiles_tutorado SET familia = CASE
         WHEN familia ILIKE '%padres%' AND familia ILIKE '%hermana%' THEN 'Padre, Madre, Hermana(s)'
         WHEN familia ILIKE '%padres%' AND familia ILIKE '%hermano%' THEN 'Padre, Madre, Hermano(s)'
         WHEN familia ILIKE '%padres%' THEN 'Padre, Madre'
         ELSE NULL END
 WHERE familia IS NOT NULL;

-- Frase de máximo 100 caracteres
UPDATE pit.perfiles_tutorado SET frase = left(frase, 100) WHERE length(frase) > 100;
