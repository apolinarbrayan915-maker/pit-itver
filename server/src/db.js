'use strict';

const { Pool } = require('pg');

// pg toma DATABASE_URL o las variables PGHOST/PGUSER/... automáticamente
// En la nube (Supabase) la conexión va cifrada: DATABASE_SSL=true.
// En Vercel cada instancia usa pocas conexiones para no agotar el pooler.
const opciones = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {};
if (process.env.DATABASE_SSL === 'true') opciones.ssl = { rejectUnauthorized: false };
if (process.env.VERCEL) {
  opciones.max = 3;
  opciones.idleTimeoutMillis = 10000;
}
const pool = new Pool(opciones);

pool.on('error', (err) => {
  console.error('[db] Error inesperado en un cliente inactivo:', err.message);
});

/** Ejecuta una consulta parametrizada ($1, $2…). */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Ejecuta `fn(client)` dentro de una transacción.
 * Hace ROLLBACK automáticamente si `fn` lanza un error.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
