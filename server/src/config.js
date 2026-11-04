'use strict';

require('dotenv').config();

const env = process.env;

const config = {
  port: Number(env.PORT) || 3000,
  isProduction: env.NODE_ENV === 'production',
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
  dominio: (env.DOMINIO_INSTITUCIONAL || 'veracruz.tecnm.mx').toLowerCase(),
  periodoActual: env.PERIODO_ACTUAL || '2026-2',
  tz: env.TZ_INSTITUCIONAL || 'America/Mexico_City',
  corsOrigins: (env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

if (!config.jwtSecret || config.jwtSecret.length < 32) {
  // Sin un secreto fuerte cualquiera podría firmar tokens válidos.
  console.error('[config] JWT_SECRET no definido o menor a 32 caracteres. Revisa tu archivo .env');
  process.exit(1);
}

if (!/^\d{4}-[12]$/.test(config.periodoActual)) {
  console.error('[config] PERIODO_ACTUAL debe tener formato AAAA-1 o AAAA-2');
  process.exit(1);
}

module.exports = config;
