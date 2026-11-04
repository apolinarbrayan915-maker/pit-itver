'use strict';

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { verificarToken, requiereRol } = require('./middleware/auth');

const auth = require('./controllers/auth.controller');
const dashboard = require('./controllers/dashboard.controller');
const tutorados = require('./controllers/tutorados.controller');
const citas = require('./controllers/citas.controller');
const canalizaciones = require('./controllers/canalizaciones.controller');
const evaluaciones = require('./controllers/evaluaciones.controller');
const evaluacionesAlumno = require('./controllers/evaluacionesAlumno.controller');
const avisos = require('./controllers/avisos.controller');
const asignaciones = require('./controllers/asignaciones.controller');
const tutores = require('./controllers/tutores.controller');
const perfilTutorado = require('./controllers/perfilTutorado.controller');
const fichas = require('./controllers/fichas.controller');

const router = Router();

// Freno a ataques de fuerza bruta en el login: 10 intentos / 15 min por IP
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' },
});

// ---- Público -----------------------------------------------------------------
router.get('/health', async (req, res) => {
  await db.query('SELECT 1');
  res.json({ ok: true, servicio: 'PIT ITVER API', bd: 'conectada' });
});
router.post('/auth/login', limiteLogin, auth.login);

// ---- Requiere sesión ---------------------------------------------------------
router.use(verificarToken);

router.get('/auth/me', auth.perfil);

// Calendario Académico del TecNM (días con clases para agendar tutorías)
router.get('/calendario-escolar', (req, res) => {
  res.json({ ok: true, ...require('./utils/calendarioEscolar').CALENDARIO });
});

router.get('/dashboard/stats', requiereRol('coordinador', 'tutor'), dashboard.stats);

router.get('/tutorados/riesgo', requiereRol('coordinador', 'tutor'), tutorados.listarPorRiesgo);

router.post('/citas/reservar', requiereRol('alumno', 'tutor', 'coordinador'), citas.reservar);
router.get('/citas/mias', requiereRol('alumno'), citas.misCitas);
router.get('/citas/tutor/:tutorId', requiereRol('tutor', 'coordinador'), citas.agendaTutor);
router.patch('/citas/:id/estatus', citas.cambiarEstatus);

router.post('/canalizaciones/crear', requiereRol('tutor', 'coordinador'), canalizaciones.crear);
router.get('/canalizaciones', canalizaciones.listar);

// Evaluación del Tutor hacia el Programa de Tutorías (11 reactivos Likert)
router.get('/evaluaciones/mia', requiereRol('tutor'), evaluaciones.miEvaluacion);
router.post('/evaluaciones', requiereRol('tutor'), evaluaciones.guardar);
router.get('/evaluaciones/resumen', requiereRol('coordinador'), evaluaciones.resumen);
router.get('/evaluaciones/tutor/:tutorId', requiereRol('coordinador'), evaluaciones.detalleTutor);

// Evaluación del acompañamiento tutorial hecha por el tutorado (secciones 4 y 5).
// CONFIDENCIAL: ninguna de estas rutas admite el rol "tutor".
router.get('/evaluaciones/alumno/mia', requiereRol('alumno'), evaluacionesAlumno.miEvaluacion);
router.post('/evaluaciones/alumno', requiereRol('alumno'), evaluacionesAlumno.guardar);
router.get('/evaluaciones/alumnos/resumen', requiereRol('coordinador'), evaluacionesAlumno.resumen);
router.get('/evaluaciones/alumnos/:id', requiereRol('coordinador'), evaluacionesAlumno.detalle);

// Avisos: la coordinación los administra; solo los tutores los leen (los alumnos no)
router.get('/avisos', requiereRol('tutor', 'coordinador'), avisos.listar);
router.post('/avisos', requiereRol('coordinador'), avisos.crear);
router.patch('/avisos/:id', requiereRol('coordinador'), avisos.actualizar);
router.delete('/avisos/:id', requiereRol('coordinador'), avisos.eliminar);

// Supervisión de tutor–tutorado (coordinación). Los tutorados eligen a su tutor.
router.get('/asignaciones', requiereRol('coordinador'), asignaciones.panorama);
router.patch('/asignaciones/:id/finalizar', requiereRol('coordinador'), asignaciones.quitar);

// Tutores: directorio y elección por el tutorado, horario de atención y cupo
router.get('/tutores/disponibles', requiereRol('alumno', 'coordinador'), tutores.directorio);
router.post('/tutores/elegir', requiereRol('alumno'), tutores.elegir);
router.get('/tutores/mi-perfil', requiereRol('tutor'), tutores.miPerfil);
router.put('/tutores/mi-perfil', requiereRol('tutor'), tutores.guardarMiPerfil);
router.get('/tutores/:id/disponibilidad', tutores.disponibilidad);
router.patch('/tutores/:id', requiereRol('coordinador'), tutores.actualizarCupo);

// Perfil "persona" del tutorado
router.get('/perfil-tutorado/mio', requiereRol('alumno'), perfilTutorado.miPerfil);
router.put('/perfil-tutorado/mio', requiereRol('alumno'), perfilTutorado.guardar);
router.get('/perfil-tutorado/:id', requiereRol('tutor', 'coordinador'), perfilTutorado.verPerfil);

// Ficha de Identificación del tutorado (Anexo 6). Confidencial: tutores sin acceso.
router.get('/fichas/mia', requiereRol('alumno'), fichas.miFicha);
router.put('/fichas/mia', requiereRol('alumno'), fichas.guardarMiFicha);
router.get('/fichas', requiereRol('coordinador'), fichas.listar);
router.get('/fichas/exportar', requiereRol('coordinador'), fichas.exportar);
router.get('/fichas/tutorado/:id', requiereRol('coordinador'), fichas.verFicha);
router.put('/fichas/tutorado/:id', requiereRol('coordinador'), fichas.guardarFichaCoord);
router.patch('/fichas/tutorado/:id/estado', requiereRol('coordinador'), fichas.cambiarEstado);
router.delete('/fichas/tutorado/:id', requiereRol('coordinador'), fichas.eliminar);

module.exports = router;
