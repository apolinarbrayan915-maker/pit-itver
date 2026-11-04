'use strict';

// Arranque local (npm start). En Vercel la app se carga desde /api/index.js.
const config = require('./config');
const { pool } = require('./db');
const app = require('./app');

const server = app.listen(config.port, () => {
  console.log(`PIT ITVER escuchando en http://localhost:${config.port}`);
  console.log(`Periodo escolar vigente: ${config.periodoActual}`);
});
// Cierre ordenado (Ctrl+C / reinicio del servicio)
function apagar() {
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);

