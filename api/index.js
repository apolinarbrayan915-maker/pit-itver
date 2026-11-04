'use strict';

// Punto de entrada en Vercel: todas las rutas /api/* llegan a esta función,
// que reutiliza la misma app de Express que se usa en local.
module.exports = require('../server/src/app');
