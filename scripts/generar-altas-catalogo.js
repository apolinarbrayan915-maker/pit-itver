'use strict';

/**
 * Genera database/nube/014_alta_docentes_catalogo.sql: crea las cuentas de tutor
 * de los docentes del catálogo de Sistemas (recomendador/catalogo_materias.json)
 * que la migración 012 dejó pendientes porque no tenían cuenta en usuarios.
 *
 * - Correo: el de la tabla altas_catalogo_pit (pit.evaluacion.mp-…@veracruz.tecnm.mx),
 *   provisional hasta tener el institucional real de cada docente.
 * - Contraseña: la misma de las cuentas demo (se copia el hash, no se escribe aquí).
 * - Áreas de apoyo: los temas del catálogo (máx. 8, ≤ 40 caracteres) para que la lupa
 *   calcule la afinidad; las materias se leen del catálogo por catalogo_materias_id.
 *
 * Uso: node scripts/generar-altas-catalogo.js
 */
const fs = require('fs');
const path = require('path');

const catalogo = require('../recomendador/catalogo_materias.json');
const lote = fs.readFileSync(path.join(__dirname, '..', 'database', 'nube', '012_altas_catalogo_pit.sql'), 'utf8');
const altas = [...lote.matchAll(/\('(mp-\d+)', '([^']+)', '([^']+)'/g)].map(([, id, nombre, correo]) => ({ id, nombre, correo }));

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (a) => `ARRAY[${a.map(q).join(', ')}]::text[]`;
const corto = (t) => t.replace('Arquitectura, hardware y sistemas embebidos', 'Arquitectura, hardware y embebidos').slice(0, 40).trim();

const filas = altas.map((a) => {
  const perfil = catalogo.perfiles.find((p) => p.id === a.id);
  if (!perfil) throw new Error(`Perfil ${a.id} no está en el catálogo`);
  const partes = a.nombre.trim().split(/\s+/);
  const corte = partes.length >= 3 ? partes.length - 2 : partes.length - 1;
  const nombre = partes.slice(0, corte).join(' ');
  const apellidos = partes.slice(corte).join(' ');
  const rfc = 'MPRO' + a.id.slice(3).padStart(6, '0') + 'PT';
  let areas = [...new Set(perfil.temas.map(corto))];
  if (!areas.length) areas = [...new Set(perfil.materias.map(corto))];
  areas = areas.slice(0, 8);
  return `(${q(a.id)}, ${q(nombre)}, ${q(apellidos)}, ${q(rfc)}, ${q(a.correo)}, ${arr(areas)}, ${q(areas[0])})`;
});

const sql = `-- =============================================================================
--  014 · Alta como tutores de los ${altas.length} docentes del catálogo de Sistemas
--  Generado por scripts/generar-altas-catalogo.js · no editar a mano.
--  Correos provisionales (pit.evaluacion.mp-…): cámbialos por los institucionales
--  reales antes del piloto. Contraseña: la misma de las cuentas demo.
-- =============================================================================
SET search_path = pit;

CREATE TEMP TABLE _pw ON COMMIT DROP AS
  SELECT password_hash FROM usuarios WHERE lower(correo_institucional) = 'noemi.tp@veracruz.tecnm.mx';

CREATE TEMP TABLE _docentes (perfil_id text, nombre text, apellidos text, rfc text, correo text, areas text[], especialidad text) ON COMMIT DROP;
INSERT INTO _docentes VALUES
${filas.join(',\n')};

-- 1. Cuentas de usuario con rol tutor (si el correo o el RFC ya existen, no se tocan)
INSERT INTO usuarios (no_control_o_rfc, nombre, apellidos, correo_institucional, password_hash, rol)
SELECT d.rfc, d.nombre, d.apellidos, d.correo, p.password_hash, 'tutor'
  FROM _docentes d CROSS JOIN _pw p
ON CONFLICT DO NOTHING;

-- 2. Perfil de tutor, cupo, cubículo y dos bloques semanales (función de la migración 013)
SELECT confirmar_altas_catalogo_pit();

-- 3. Áreas de apoyo para la lupa (solo si el tutor aún no captura las suyas)
UPDATE tutores t
   SET areas_apoyo = d.areas,
       especialidad = COALESCE(t.especialidad, d.especialidad),
       formacion_tutorial = COALESCE(t.formacion_tutorial, 'En formación')
  FROM _docentes d
 WHERE t.catalogo_materias_id = d.perfil_id
   AND cardinality(t.areas_apoyo) = 0;
`;
const destino = path.join(__dirname, '..', 'database', 'nube', '014_alta_docentes_catalogo.sql');
fs.writeFileSync(destino, sql);
console.log(`Escrito ${path.relative(process.cwd(), destino)} con ${altas.length} docentes.`);
