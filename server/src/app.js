'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config');
const routes = require('./routes');
const { manejadorErrores } = require('./utils/errores');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // detrás del proxy de Vercel o de Nginx/Apache institucional

// Cabeceras de seguridad. La CSP permite los CDN que usan los prototipos
// (Tailwind, Font Awesome, Google Fonts) y los manejadores onclick en línea.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com'],
        'script-src-attr': ["'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
        'connect-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'frame-src': ["'self'", 'blob:'], // vista previa del PDF del Anexo 6
        'upgrade-insecure-requests': config.isProduction ? [] : null,
      },
    },
  })
);

// CORS solo si el frontend se sirve desde otro origen (p.ej. Live Server)
if (config.corsOrigins.length) {
  app.use('/api', cors({ origin: config.corsOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }));
}

app.use(express.json({ limit: '600kb' })); // incluye la foto del perfil del tutorado

// API REST
app.use('/api', routes);
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Ruta no encontrada' }));

// Frontend estático (carpeta /public del proyecto)
app.use(express.static(path.join(__dirname, '..', '..', 'public'), { extensions: ['html'] }));

app.use(manejadorErrores);

module.exports = app;
