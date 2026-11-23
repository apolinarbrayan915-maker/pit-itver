CREATE OR REPLACE FUNCTION alta_catalogo_identidad(valor text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT string_agg(token, ' ' ORDER BY token)
  FROM regexp_split_to_table(
    translate(lower(valor), 'áéíóúüñ', 'aeiouun'), '[^a-z]+'
  ) AS token
  WHERE token <> '';
$$;

-- Reaplica el lote y devuelve el estado real de las 67 filas.
CREATE OR REPLACE FUNCTION confirmar_altas_catalogo_pit()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE resultado jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(1268, 67);
WITH elegibles AS (
  SELECT p.*, u.id AS usuario_id
  FROM altas_catalogo_pit p JOIN usuarios u
    ON lower(u.correo_institucional) = p.correo
   AND alta_catalogo_identidad(u.nombre || ' ' || u.apellidos) = alta_catalogo_identidad(p.nombre)
   AND u.rol = 'tutor' AND u.estado = 'activo'
  WHERE NOT EXISTS (
    SELECT 1 FROM tutores t WHERE t.catalogo_materias_id = p.perfil_id AND t.usuario_id <> u.id
  )
), vinculados AS (
  UPDATE tutores t SET catalogo_materias_id = e.perfil_id
  FROM elegibles e WHERE t.usuario_id = e.usuario_id AND t.catalogo_materias_id IS NULL
  RETURNING t.id
), nuevos AS (
  INSERT INTO tutores (usuario_id, catalogo_materias_id, cubiculo, max_tutorados, acepta_tutorados)
  SELECT e.usuario_id, e.perfil_id, e.cubiculo, e.cupo, true FROM elegibles e
  WHERE NOT EXISTS (SELECT 1 FROM tutores t WHERE t.usuario_id = e.usuario_id)
  ON CONFLICT DO NOTHING
  RETURNING id, catalogo_materias_id
)
INSERT INTO tutor_horarios (tutor_id, dia_semana, hora_inicio, hora_fin)
SELECT t.id, h.dia, h.inicio, h.fin
FROM nuevos t JOIN altas_catalogo_pit p ON p.perfil_id = t.catalogo_materias_id
CROSS JOIN LATERAL (VALUES (p.dia_1, p.inicio_1, p.fin_1), (p.dia_2, p.inicio_2, p.fin_2)) AS h(dia, inicio, fin)
ON CONFLICT (tutor_id, dia_semana, hora_inicio) DO NOTHING;
  SELECT jsonb_build_object(
    'total', count(*),
    'inscritos', count(u.id),
    'pendientes', count(*) - count(u.id)
  ) INTO resultado
  FROM altas_catalogo_pit p
  LEFT JOIN tutores t ON t.catalogo_materias_id = p.perfil_id
  LEFT JOIN usuarios u ON u.id = t.usuario_id AND u.rol = 'tutor' AND u.estado = 'activo';
  RETURN resultado;
END;
$$;

SELECT confirmar_altas_catalogo_pit();
