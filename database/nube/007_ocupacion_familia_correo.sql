-- 007: Ocupación de una lista, Familia solo Padre/Madre/Hermanos y correo de la ficha = institucional
SET search_path = pit;

UPDATE perfiles_tutorado SET familia = NULLIF(concat_ws(', ',
         CASE WHEN familia ILIKE '%Padre%' THEN 'Padre' END,
         CASE WHEN familia ILIKE '%Madre%' THEN 'Madre' END,
         CASE WHEN familia ILIKE '%Herman%' THEN 'Hermanos' END), '')
 WHERE familia IS NOT NULL;

UPDATE perfiles_tutorado SET ocupacion = CASE
         WHEN ocupacion IN ('Solo estudiante', 'Estudiante y trabajo de medio tiempo', 'Estudiante y trabajo de tiempo completo',
                            'Estudiante y trabajo por mi cuenta', 'Estudiante y apoyo en el negocio familiar',
                            'Estudiante y cuido a familiares u hogar', 'Estudiante y deportista de alto rendimiento') THEN ocupacion
         WHEN ocupacion ILIKE '%tiempo completo%' THEN 'Estudiante y trabajo de tiempo completo'
         WHEN ocupacion ILIKE '%trabaj%' THEN 'Estudiante y trabajo de medio tiempo'
         ELSE 'Solo estudiante' END
 WHERE ocupacion IS NOT NULL AND ocupacion <> '';

UPDATE fichas_identificacion f
   SET datos = jsonb_set(f.datos, '{correo}', to_jsonb(u.correo_institucional))
  FROM tutorados t JOIN usuarios u ON u.id = t.usuario_id
 WHERE t.id = f.tutorado_id AND COALESCE(f.datos->>'correo', '') <> u.correo_institucional;
