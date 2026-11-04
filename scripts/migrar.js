'use strict';

/**
 * Aplica en la base de datos de la nube las migraciones de database/nube/
 * que aún no se han ejecutado. Corre en cada despliegue de Vercel (buildCommand),
 * así que un cambio de esquema se publica solo al subirlo a GitHub.
 *
 * Reglas:
 *  - Los archivos se aplican en orden alfabético (001_..., 002_..., ...).
 *  - Cada archivo corre dentro de una transacción: si falla, no queda a medias
 *    y el despliegue se detiene (la versión anterior sigue en línea).
 *  - Nunca edites un archivo ya aplicado; crea uno nuevo con el siguiente número.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('[migrar] Sin DATABASE_URL: no se aplican migraciones.');
    return;
  }
  const url = process.env.DATABASE_MIGRATIONS_URL || process.env.DATABASE_URL;
  const client = new Client({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migraciones (
      nombre text PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query('SELECT nombre FROM schema_migraciones');
    const hechas = new Set(rows.map((r) => r.nombre));
    const dir = path.join(__dirname, '..', 'database', 'nube');
    const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    let aplicadas = 0;
    for (const archivo of archivos) {
      if (hechas.has(archivo)) continue;
      const sql = fs.readFileSync(path.join(dir, archivo), 'utf8');
      console.log(`[migrar] Aplicando ${archivo}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migraciones (nombre) VALUES ($1)', [archivo]);
        await client.query('COMMIT');
        aplicadas++;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`${archivo}: ${err.message}`);
      }
    }
    console.log(`[migrar] Listo. Migraciones nuevas: ${aplicadas}. Total: ${archivos.length}.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[migrar] ERROR', err.message);
  process.exit(1);
});
