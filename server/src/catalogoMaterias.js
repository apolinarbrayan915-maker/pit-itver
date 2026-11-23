'use strict';

const catalogo = require('../../recomendador/catalogo_materias.json');

const perfiles = catalogo.perfiles.map(({ correo_pit, ...p }, i) => ({
  ...p,
  correo_pit,
  cubiculo_demo: correo_pit ? null : `E-D${String(i + 1).padStart(2, '0')}`,
}));

module.exports = { ...catalogo, perfiles };
