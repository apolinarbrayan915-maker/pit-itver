'use strict';

/**
 * Instalación local de la Plataforma PIT ITVER (un solo paso).
 *
 *   node scripts/instalar-local.js            → crea la BD y carga los datos
 *   node scripts/instalar-local.js --reiniciar → borra la BD local y la crea de nuevo
 *
 * Requiere PostgreSQL 13+ instalado. Pide la contraseña del superusuario
 * "postgres" (la que se eligió al instalar PostgreSQL) y entonces:
 *   1. Crea el usuario pit_app y la base de datos pit_itver.
 *   2. Crea el esquema "pit" y lo deja como esquema por defecto de pit_app.
 *   3. Genera el archivo .env (con una clave JWT aleatoria) si no existe.
 *   4. Aplica las migraciones de database/nube/ (las mismas de la versión en línea).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const RAIZ = path.join(__dirname, '..');
const BD = 'pit_itver';
const USUARIO = 'pit_app';
const CLAVE_APP = 'pit_app_2026';
const reiniciar = process.argv.includes('--reiniciar');

function preguntar(texto, oculto = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (oculto) {
    rl._writeToOutput = (s) => { if (s.includes(texto)) rl.output.write(s); else rl.output.write('*'); };
  }
  return new Promise((ok) => rl.question(texto, (r) => { rl.close(); if (oculto) process.stdout.write('\n'); ok(r.trim()); }));
}

const paso = (n, txt) => console.log(`\n[${n}/4] ${txt}`);

async function main() {
  const [mayor] = process.versions.node.split('.').map(Number);
  if (mayor < 18) throw new Error(`Se necesita Node.js 18 o superior (tienes ${process.versions.node}).`);

  console.log('=== Instalación local · Plataforma PIT ITVER ===');
  const host = process.env.PGHOST || (await preguntar('Servidor de PostgreSQL [localhost]: ')) || 'localhost';
  const puerto = Number(process.env.PGPORT || (await preguntar('Puerto [5432]: ')) || 5432);
  const admin = process.env.PG_ADMIN_USER || (await preguntar('Superusuario [postgres]: ')) || 'postgres';
  const claveAdmin = process.env.PG_ADMIN_PASSWORD ?? (await preguntar(`Contraseña de "${admin}": `, true));

  const conectar = (database, user = admin, password = claveAdmin) =>
    new Client({ host, port: puerto, user, password, database });

  paso(1, `Usuario ${USUARIO} y base de datos ${BD}`);
  const c = conectar('postgres');
  try {
    await c.connect();
  } catch (err) {
    throw new Error(`No se pudo conectar a PostgreSQL en ${host}:${puerto} como "${admin}".\n` +
      `  Revisa que el servicio de PostgreSQL esté iniciado y que la contraseña sea correcta.\n  Detalle: ${err.message}`);
  }
  try {
    const { rows: rol } = await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [USUARIO]);
    if (rol.length) {
      await c.query(`ALTER ROLE ${USUARIO} WITH LOGIN PASSWORD '${CLAVE_APP}'`);
    } else {
      await c.query(`CREATE ROLE ${USUARIO} WITH LOGIN PASSWORD '${CLAVE_APP}'`);
    }
    const { rows: bd } = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [BD]);
    if (bd.length && reiniciar) {
      console.log('  Borrando la base de datos anterior…');
      await c.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [BD]);
      await c.query(`DROP DATABASE ${BD}`);
    }
    if (!bd.length || reiniciar) {
      await c.query(`CREATE DATABASE ${BD} OWNER ${USUARIO} ENCODING 'UTF8' TEMPLATE template0`);
      console.log('  Base de datos creada.');
    } else {
      console.log('  La base de datos ya existía: se conservan sus datos (usa --reiniciar para empezar de cero).');
    }
  } finally {
    await c.end();
  }

  paso(2, 'Esquema "pit"');
  const c2 = conectar(BD);
  await c2.connect();
  try {
    await c2.query(`CREATE SCHEMA IF NOT EXISTS pit AUTHORIZATION ${USUARIO}`);
    await c2.query(`ALTER ROLE ${USUARIO} IN DATABASE ${BD} SET search_path = pit`);
    await c2.query(`ALTER DATABASE ${BD} SET timezone = 'America/Mexico_City'`);
  } finally {
    await c2.end();
  }

  paso(3, 'Archivo de configuración .env');
  const archivoEnv = path.join(RAIZ, '.env');
  const urlBd = `postgresql://${USUARIO}:${CLAVE_APP}@${host}:${puerto}/${BD}`;
  if (fs.existsSync(archivoEnv)) {
    console.log('  Ya existe un .env: no se modifica.');
  } else {
    fs.writeFileSync(archivoEnv, [
      '# Generado por scripts/instalar-local.js',
      'PORT=3000',
      'NODE_ENV=development',
      `DATABASE_URL=${urlBd}`,
      `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`,
      'JWT_EXPIRES_IN=8h',
      'MINUTOS_INACTIVIDAD=30',
      'DOMINIO_INSTITUCIONAL=veracruz.tecnm.mx',
      'PERIODO_ACTUAL=2026-2',
      'TZ_INSTITUCIONAL=America/Mexico_City',
      '',
      '# Modo demostración: abre las ventanas de "cambio de tutor" y "evaluación tutoral"',
      '# aunque la fecha no corresponda. Bórralas (o pon 0) para usar el calendario real.',
      'CAMBIO_TUTOR_ABIERTO=1',
      'EVALUACION_ABIERTA=1',
      '',
      '# Correos (opcional). Sin estos datos la plataforma funciona igual, solo no envía avisos.',
      '# SMTP_USER=tu_cuenta@gmail.com',
      '# SMTP_PASS=contraseña_de_aplicación_de_google',
      '',
    ].join('\n'));
    console.log('  .env creado con una clave JWT nueva.');
  }

  paso(4, 'Tablas y datos de demostración');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'migrar.js')], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: urlBd, DATABASE_SSL: 'false' },
  });
  if (r.status !== 0) {
    throw new Error('Falló la carga de las tablas (ver el mensaje de arriba).\n' +
      '  Si ya existía una base de datos de una versión anterior, ejecuta: npm run instalar -- --reiniciar');
  }

  console.log('\n✔ Instalación terminada.');
  console.log('  Inicia la plataforma con:  npm start   (o doble clic en INICIAR.bat en Windows)');
  console.log('  y abre en el navegador:    http://localhost:3000');
  console.log('  Cuentas de prueba: ver INSTRUCCIONES.md (contraseña: Tutorias2026!)');
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
});
