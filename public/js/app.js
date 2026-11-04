/* =============================================================================
 *  PIT ITVER – Integración Frontend ⇄ API REST (PostgreSQL)
 *  Un solo script para las 4 vistas. Cada página declara <body data-page="...">:
 *    login | alumno | tutor | coordinacion
 *
 *  Funciones principales solicitadas:
 *    - cargarMetricasDashboard()  → tarjetas KPI (tutor y coordinación)
 *    - enviarReservaCita(event)   → formulario de reserva vía fetch, sin recargar
 *    - poblarTablaRiesgo(nivel)   → tabla de riesgo con badges de color
 * ============================================================================= */
'use strict';

// Si abres el HTML con Live Server (:5500) la API vive en :3000; si lo sirve
// Express, comparten origen. Puedes forzarla con window.PIT_API_BASE.
const API_BASE =
  window.PIT_API_BASE ||
  (location.port && location.port !== '3000' ? `${location.protocol}//${location.hostname}:3000/api` : '/api');

const TZ = 'America/Mexico_City';
const DOMINIO = '@veracruz.tecnm.mx';
const PAGINA = document.body.dataset.page;
const RUTA_POR_ROL = { alumno: 'alumno.html', tutor: 'tutor.html', coordinador: 'coordinacion.html' };

/* -----------------------------------------------------------------------------
 * Sesión (JWT en localStorage)
 * --------------------------------------------------------------------------- */
const Sesion = {
  get token() {
    return localStorage.getItem('pit_token');
  },
  get usuario() {
    try {
      return JSON.parse(localStorage.getItem('pit_usuario') || 'null');
    } catch {
      return null;
    }
  },
  guardar(token, usuario) {
    localStorage.setItem('pit_token', token);
    localStorage.setItem('pit_usuario', JSON.stringify(usuario));
  },
  cerrar() {
    localStorage.removeItem('pit_token');
    localStorage.removeItem('pit_usuario');
  },
};

function cerrarSesion() {
  Sesion.cerrar();
  location.href = 'index.html';
}

/** Redirige al login si no hay sesión o el rol no corresponde a la página. */
function requiereSesion(rol) {
  const u = Sesion.usuario;
  if (!Sesion.token || !u) {
    location.replace('index.html');
    return false;
  }
  if (u.rol !== rol) {
    location.replace(RUTA_POR_ROL[u.rol] || 'index.html');
    return false;
  }
  return true;
}

/* -----------------------------------------------------------------------------
 * Cliente HTTP
 * --------------------------------------------------------------------------- */
async function api(ruta, { method = 'GET', body, query } = {}) {
  const url = new URL(API_BASE + ruta, location.href);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (Sesion.token) headers.Authorization = `Bearer ${Sesion.token}`;

  let resp;
  try {
    resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Verifica que la API esté en ejecución.');
  }

  const data = await resp.json().catch(() => ({}));
  if (resp.status === 401 && PAGINA !== 'login') {
    Sesion.cerrar();
    location.replace('index.html?expirada=1');
    throw new Error(data.error || 'Sesión expirada');
  }
  if (!resp.ok) {
    const error = new Error(data.error || `Error ${resp.status}`);
    error.detalles = data.detalles; // p. ej. campos inválidos de un formulario
    throw error;
  }
  return data;
}

/* -----------------------------------------------------------------------------
 * Utilidades de interfaz
 * --------------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function setText(id, valor) {
  const el = $(id);
  if (el) el.textContent = valor;
}

function iniciales(nombre = '') {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function fmtFechaHora(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

const num = (v, dec = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(dec));

/** Notificación flotante (sustituye alert()). */
function toast(mensaje, tipo = 'ok') {
  let cont = $('pit-toasts');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'pit-toasts';
    cont.className = 'fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm';
    cont.setAttribute('aria-live', 'polite');
    document.body.appendChild(cont);
  }
  const estilos = {
    ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    error: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-sky-50 text-sky-800 border-sky-200',
  };
  const icono = { ok: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
  const el = document.createElement('div');
  el.className = `p-3 rounded-xl border shadow-lg text-xs font-semibold flex items-start gap-2 ${estilos[tipo]}`;
  el.innerHTML = `<i class="fa-solid ${icono[tipo]} mt-0.5"></i><span>${escapeHtml(mensaje)}</span>`;
  cont.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function mostrarEstadoTabla(tbody, columnas, mensaje, tipo = 'info') {
  const color = tipo === 'error' ? 'text-rose-600' : 'text-slate-400';
  tbody.innerHTML = `<tr><td colspan="${columnas}" class="p-6 text-center ${color}">${escapeHtml(mensaje)}</td></tr>`;
}

function conBotonOcupado(boton, textoOcupado, fn) {
  const original = boton.innerHTML;
  boton.disabled = true;
  boton.classList.add('opacity-60', 'cursor-wait');
  boton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>${textoOcupado}</span>`;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      boton.disabled = false;
      boton.classList.remove('opacity-60', 'cursor-wait');
      boton.innerHTML = original;
    });
}

/* ---- Secciones plegables y modales --------------------------------------- */
function abrirPanel(id) {
  const panel = $(id);
  if (!panel) return;
  // Paneles del mismo grupo (p. ej. Ficha y Evaluación): solo uno abierto a la vez
  const grupo = panel.dataset.grupoPanel;
  if (grupo) {
    document.querySelectorAll(`[data-grupo-panel="${grupo}"]`).forEach((otro) => {
      if (otro === panel || otro.classList.contains('hidden')) return;
      otro.classList.add('hidden');
      document.querySelectorAll(`[aria-controls="${otro.id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'false'));
    });
  }
  panel.classList.remove('hidden');
  document.querySelectorAll(`[aria-controls="${id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'true'));
  setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}
function cerrarPanel(id) {
  const panel = $(id);
  if (!panel) return;
  panel.classList.add('hidden');
  const boton = document.querySelector(`[aria-controls="${id}"]`);
  boton?.setAttribute('aria-expanded', 'false');
  boton?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function alternarPanel(id) {
  if ($(id).classList.contains('hidden')) abrirPanel(id);
  else cerrarPanel(id);
}
function cerrarModal(id) {
  $(id)?.classList.add('hidden');
}

/* -----------------------------------------------------------------------------
 * Semáforo de riesgo: badges dinámicos
 *   BAJO → verde · MEDIO → amarillo · ALTO → ámbar · CRÍTICO → rojo
 * --------------------------------------------------------------------------- */
const BADGE_RIESGO = {
  BAJO: { pill: 'bg-emerald-100 text-emerald-800', punto: 'text-emerald-600', texto: 'text-emerald-600', avance: 'Regular' },
  MEDIO: { pill: 'bg-yellow-100 text-yellow-800', punto: 'text-yellow-500', texto: 'text-yellow-600', avance: 'Seguimiento' },
  ALTO: { pill: 'bg-amber-100 text-amber-800', punto: 'text-amber-600', texto: 'text-amber-600', avance: 'Rezago Moderado' },
  'CRÍTICO': { pill: 'bg-rose-100 text-rose-800', punto: 'text-rose-600', texto: 'text-rose-600', avance: 'Rezago Crítico' },
};

// Cada nivel lleva un ícono distinto además del color (no depende solo del color)
const ICONO_RIESGO = {
  BAJO: 'fa-circle-check',
  MEDIO: 'fa-circle-minus',
  ALTO: 'fa-triangle-exclamation',
  'CRÍTICO': 'fa-circle-exclamation',
};

function badgeRiesgo(nivel) {
  const b = BADGE_RIESGO[nivel] || BADGE_RIESGO.BAJO;
  return `<span class="${b.pill} px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center w-max">
            <i class="fa-solid ${ICONO_RIESGO[nivel] || 'fa-circle'} text-[10px] mr-1 ${b.punto}" aria-hidden="true"></i> ${escapeHtml(nivel)}</span>`;
}

function badgeReprobadas(t) {
  const n = Number(t.materias_reprobadas);
  if (n === 0) return '<span class="text-slate-400">0 (Regular)</span>';
  const b = BADGE_RIESGO[t.nivel_riesgo];
  return `<span class="${b.pill} px-2 py-0.5 rounded font-bold">${n} ${n === 1 ? 'Materia' : 'Materias'}</span>`;
}

const AREA_ESTILO = {
  PALPROG: 'bg-emerald-100 text-emerald-800',
  CIS: 'bg-sky-100 text-sky-800',
  CEPC: 'bg-purple-100 text-purple-800',
  PAPAs: 'bg-rose-100 text-rose-800',
  'Psicología/Salud': 'bg-rose-100 text-rose-800',
};
const ESTATUS_CANAL_ESTILO = {
  Pendiente: 'bg-slate-200 text-slate-700',
  'En Proceso': 'bg-amber-100 text-amber-800',
  Aceptado: 'bg-emerald-100 text-emerald-800',
  Atendido: 'bg-sky-100 text-sky-800',
  Cerrado: 'bg-slate-100 text-slate-500',
};
const ESTATUS_CITA_ESTILO = {
  Pendiente: 'bg-amber-100 text-amber-800',
  Confirmada: 'bg-sky-100 text-sky-800',
  Completada: 'bg-emerald-100 text-emerald-800',
  Cancelada: 'bg-slate-200 text-slate-500',
};

const chip = (texto, clases) =>
  `<span class="${clases} px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap">${escapeHtml(texto)}</span>`;

// Programa sugerido según el nivel de riesgo (el tutor puede cambiarlo en el modal)
const AREA_SUGERIDA = { 'CRÍTICO': 'PALPROG', ALTO: 'PALPROG', MEDIO: 'PAPAs', BAJO: 'CIS' };

/* =============================================================================
 * 1) MÉTRICAS DEL DASHBOARD  (GET /api/dashboard/stats)
 * ============================================================================= */
async function cargarMetricasDashboard() {
  try {
    const s = await api('/dashboard/stats');

    // Tarjetas comunes (tutor y coordinación)
    setText('kpi-total-tutorados', `${s.total_tutorados} Alumnos`);
    setText('kpi-en-riesgo', `${s.en_riesgo} (${s.pct_en_riesgo}%)`);
    setText('kpi-riesgo-sub', `${s.pct_riesgo_critico}% en riesgo crítico (${s.en_riesgo_critico})`);
    setText('kpi-citas-semana', `${s.citas_semana} Programadas`);
    setText('kpi-citas-sub', `${s.citas_semana_pendientes} pendientes de confirmar`);
    setText('kpi-canalizaciones', `${s.canalizaciones_activas} Casos`);

    // Exclusivas de coordinación
    setText('kpi-total-sub', `Periodo ${s.periodo} · ISC`);
    setText('kpi-tutores', `${s.tutores_con_grupo} / ${s.tutores_totales}`);
    setText('kpi-tutores-sub', 'Tutores con tutorados en el periodo');
    setText('kpi-canal-sub', `${s.canalizaciones_activas} canalizaciones activas`);

    let totalCanal = 0;
    Object.entries(s.canalizaciones_por_area || {}).forEach(([area, v]) => {
      const clave = area === 'Psicología/Salud' ? 'PSICO' : area;
      totalCanal += v.total;
      setText(`canal-${clave}`, `${v.total} Alumnos`);
      setText(`canal-activas-${clave}`, `${v.activas} activas`);
    });
    // PAPA's y Psicología comparten tarjeta en el prototipo
    const papas = s.canalizaciones_por_area?.PAPAs?.total || 0;
    const psico = s.canalizaciones_por_area?.['Psicología/Salud']?.total || 0;
    setText('canal-PAPAS-PSICO', `${papas + psico} Alumnos`);
    setText('canal-total', `Total: ${totalCanal} Casos`);
    return s;
  } catch (err) {
    toast(`No se pudieron cargar los indicadores: ${err.message}`, 'error');
    return null;
  }
}

/* =============================================================================
 * 3) TABLA DE RIESGO ACADÉMICO  (GET /api/tutorados/riesgo?nivel=...)
 * ============================================================================= */
let cacheTutorados = [];

async function poblarTablaRiesgo(nivel = 'TODOS', busqueda = '') {
  const tbody = $('tbody-riesgo');
  if (!tbody) return;
  const columnas = tbody.closest('table').querySelectorAll('thead th').length;
  mostrarEstadoTabla(tbody, columnas, 'Cargando tutorados…');

  try {
    const data = await api('/tutorados/riesgo', { query: { nivel, q: busqueda } });
    if (nivel === 'TODOS' && !busqueda) cacheTutorados = data.tutorados;

    if (!data.tutorados.length) {
      mostrarEstadoTabla(tbody, columnas, 'No hay tutorados con ese criterio.');
      return;
    }
    tbody.innerHTML = data.tutorados.map(PAGINA === 'tutor' ? filaTutor : filaCoordinacion).join('');
    setText('riesgo-contador', `${data.total} tutorados`);
  } catch (err) {
    mostrarEstadoTabla(tbody, columnas, err.message, 'error');
  }
}

function celdasComunes(t) {
  return `
    <td class="p-3 font-bold text-slate-800">${escapeHtml(t.no_control)}</td>
    <td class="p-3 font-bold text-slate-800">${escapeHtml(t.nombre_completo)}
      ${t.canalizaciones_activas.length
        ? `<div class="mt-1 flex flex-wrap gap-1">${t.canalizaciones_activas.map((a) => chip(a, AREA_ESTILO[a])).join('')}</div>`
        : ''}
    </td>
    <td class="p-3">${t.semestre}° Semestre</td>`;
}

function botonesAccion(t, { conCita }) {
  const nombre = escapeHtml(JSON.stringify(t.nombre_completo));
  const area = AREA_SUGERIDA[t.nivel_riesgo];
  const enRiesgo = t.nivel_riesgo !== 'BAJO';
  return `
    <button onclick="mostrarPerfilTutorado(${t.tutorado_id})" title="Ver perfil del tutorado" class="bg-sky-50 text-sky-800 hover:bg-sky-100 px-2.5 py-1 rounded-lg text-[11px] font-bold transition"><i class="fa-solid fa-id-badge"></i> Perfil</button>
    ${conCita ? `<button onclick='openModalCita(${nombre}, ${t.tutorado_id})' class="${enRiesgo ? 'bg-tecnmGreen text-white hover:bg-tecnmDark' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'} px-2.5 py-1 rounded-lg text-[11px] font-bold transition"><i class="fa-solid fa-calendar-plus"></i> Cita</button>` : ''}
    ${enRiesgo || conCita
      ? `<button onclick='openModalCanalizacion(${nombre}, "${area}", ${t.tutorado_id})' class="${enRiesgo ? 'bg-tecnmGold text-slate-900 hover:bg-tecnmGoldDark' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} px-2.5 py-1 rounded-lg text-[11px] font-bold transition"><i class="fa-solid fa-share"></i> Canalizar</button>`
      : '<span class="text-slate-400 text-[11px]">Acompañamiento Regular</span>'}`;
}

function filaCoordinacion(t) {
  const b = BADGE_RIESGO[t.nivel_riesgo];
  return `<tr class="hover:bg-slate-50 row-riesgo" data-riesgo="${t.nivel_riesgo}">
    ${celdasComunes(t)}
    <td class="p-3">${badgeReprobadas(t)}</td>
    <td class="p-3 font-bold ${b.texto}">${num(t.avance_reticular_pct)}% (${b.avance})</td>
    <td class="p-3">${badgeRiesgo(t.nivel_riesgo)}</td>
    <td class="p-3 text-[11px] text-slate-500">${escapeHtml(t.tutor_nombre || 'Sin asignar')}</td>
    <td class="p-3 text-center space-x-1 whitespace-nowrap">${botonesAccion(t, { conCita: false })}</td>
  </tr>`;
}

function filaTutor(t) {
  const b = BADGE_RIESGO[t.nivel_riesgo];
  return `<tr class="hover:bg-slate-50">
    ${celdasComunes(t)}
    <td class="p-3 font-bold ${b.texto}">${num(t.promedio)}</td>
    <td class="p-3">${badgeReprobadas(t)}</td>
    <td class="p-3">${badgeRiesgo(t.nivel_riesgo)}</td>
    <td class="p-3 text-center space-x-1 whitespace-nowrap">${botonesAccion(t, { conCita: true })}</td>
  </tr>`;
}

/* =============================================================================
 * 2) RESERVA DE CITA DESDE EL PERFIL DEL ALUMNO  (POST /api/citas/reservar)
 * ============================================================================= */
async function enviarReservaCita(event) {
  event.preventDefault();
  const form = event.target;
  const ok = $('cita-success');
  const error = $('cita-error');
  ok.classList.add('hidden');
  error.classList.add('hidden');

  const fecha = $('cita-fecha').value;
  const hora = $('cita-horario').value;
  if (!fecha || !hora) {
    error.querySelector('span').textContent = 'Elige una fecha y uno de los horarios disponibles de tu tutor.';
    error.classList.remove('hidden');
    return;
  }
  const dia = new Date(`${fecha}T12:00:00`).getDay();
  if (dia === 0 || dia === 6) {
    error.querySelector('span').textContent = 'Las tutorías se agendan de lunes a viernes.';
    error.classList.remove('hidden');
    return;
  }

  const detalle = $('cita-motivo').value.trim();
  const payload = {
    fecha,
    hora,
    modalidad: $('cita-modalidad').value,
    motivo: `${$('cita-categoria').value}${detalle ? `: ${detalle}` : ''}`,
  };

  await conBotonOcupado(form.querySelector('button[type="submit"]'), 'Registrando…', async () => {
    try {
      const { cita } = await api('/citas/reservar', { method: 'POST', body: payload });
      ok.querySelector('span').textContent =
        `¡Cita agendada para el ${fmtFechaHora(cita.fecha_hora)}! Queda pendiente de confirmación por ${cita.tutor_nombre}.`;
      ok.classList.remove('hidden');
      form.reset();
      calendarioCita?.clear();
      $('cita-horario').innerHTML = '<option value="">Primero elige una fecha</option>';
      await cargarMisCitas();
      setTimeout(() => ok.classList.add('hidden'), 6000);
    } catch (err) {
      error.querySelector('span').textContent = err.message;
      error.classList.remove('hidden');
    }
  });
}

/* =============================================================================
 * VISTA: LOGIN
 * ============================================================================= */
function iniciarLogin() {
  if (Sesion.token && Sesion.usuario) {
    location.replace(RUTA_POR_ROL[Sesion.usuario.rol]);
    return;
  }
  if (new URLSearchParams(location.search).has('expirada')) {
    $('error-text').textContent = 'Tu sesión expiró. Inicia sesión nuevamente.';
    $('error-message').classList.remove('hidden');
  }

  window.handleLoginSubmit = async function handleLoginSubmit(event) {
    event.preventDefault();
    const correo = $('userInput').value.trim().toLowerCase();
    const password = $('passwordInput').value;
    const errorBox = $('error-message');
    const successBox = $('success-message');
    errorBox.classList.add('hidden');
    successBox.classList.add('hidden');

    if (!correo.endsWith(DOMINIO)) {
      $('error-text').textContent = `Acceso denegado: se requiere un correo institucional con dominio ${DOMINIO}`;
      errorBox.classList.remove('hidden');
      return;
    }

    const boton = event.target.querySelector('button[type="submit"]');
    await conBotonOcupado(boton, 'Verificando…', async () => {
      try {
        // selectedRole lo define el script del prototipo (alumno | tutor | coordinacion)
        const rol = typeof selectedRole !== 'undefined' ? selectedRole : undefined;
        const { token, usuario } = await api('/auth/login', { method: 'POST', body: { correo, password, rol } });
        Sesion.guardar(token, usuario);
        successBox.classList.remove('hidden');
        setTimeout(() => location.replace(RUTA_POR_ROL[usuario.rol]), 700);
      } catch (err) {
        $('error-text').textContent = err.message;
        errorBox.classList.remove('hidden');
      }
    });
  };

  window.showForgotPassword = function showForgotPassword() {
    toast('Para restablecer tu contraseña acude a la Coordinación de Tutorías o escribe a soporte.tutorias@veracruz.tecnm.mx', 'info');
  };
}

/* =============================================================================
 * VISTA: ALUMNO (TUTORADO)
 * ============================================================================= */
async function cargarPerfilAlumno() {
  try {
    const { usuario: u, periodo } = await api('/auth/me');
    const t = u.tutorado || {};
    const nombre = `${u.nombre} ${u.apellidos}`;

    setText('nav-nombre', nombre);
    setText('nav-iniciales', iniciales(nombre));
    setText('perfil-iniciales', iniciales(nombre));
    setText('perfil-nombre', nombre);
    setText('perfil-control', u.no_control_o_rfc);
    setText('perfil-carrera', `${t.carrera} (${t.semestre}° Semestre)`);
    setText('perfil-correo', u.correo_institucional);
    setText('perfil-telefono', t.telefono ? formatearTelefono(t.telefono) : 'No registrado');
    setText('perfil-grupo', t.grupo ? `${t.grupo} · Periodo ${periodo}` : 'Sin grupo asignado');
    setText('perfil-promedio', num(t.promedio));
    setText('perfil-avance', `${num(t.avance_reticular_pct)}%`);
    setText('perfil-sesiones', `${t.sesiones_completadas ?? 0}`);
    setText('perfil-badge-texto', t.estatus_academico === 'Regular' ? 'Alumno Regular' : `Alumno ${t.estatus_academico}`);

    const b = BADGE_RIESGO[t.nivel_riesgo] || BADGE_RIESGO.BAJO;
    const kpiRiesgo = $('kpi-riesgo');
    if (kpiRiesgo) {
      kpiRiesgo.textContent = t.nivel_riesgo === 'BAJO' ? 'Bajo (Óptimo)' : t.nivel_riesgo;
      kpiRiesgo.className = `text-lg font-bold ${b.texto}`;
    }
    setText('hist-reprobadas', t.materias_reprobadas ?? '—');
    setText('hist-avance', `${num(t.avance_reticular_pct)}%`);
    const histNivel = $('hist-nivel');
    if (histNivel) histNivel.innerHTML = badgeRiesgo(t.nivel_riesgo);
    setText('kpi-formatos', `${t.formatos_entregados ?? 0} entregados`);
    setText('kpi-estado', t.tutor_nombre ? 'Acompañamiento Activo' : 'Elige a tu tutor');

    // Tarjeta del tutor + formulario
    window.PIT_MI_TUTOR = t.tutor_id || null;
    $('cita-sin-tutor')?.classList.toggle('hidden', Boolean(t.tutor_nombre));
    setText('tutor-badge', t.tutor_nombre ? 'Elegido por ti' : 'Pendiente de elegir');
    if ($('tutor-badge')) $('tutor-badge').className = `inline-block mt-1 text-[9px] px-2 py-0.5 rounded font-medium ${t.tutor_nombre ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`;
    setText('btn-cambiar-tutor', t.tutor_nombre ? 'Cambiar de tutor' : 'Elegir tutor');
    const formCita = $('cita-form');
    if (formCita) formCita.querySelector('button[type="submit"]').disabled = !t.tutor_nombre;
    if (t.tutor_nombre) {
      setText('tutor-iniciales', iniciales(t.tutor_nombre));
      setText('tutor-nombre', t.tutor_nombre);
      setText('tutor-correo', t.tutor_correo);
      setText('tutor-cubiculo', t.tutor_cubiculo || 'Depto. de Sistemas');
      setText('perfil-tutor', t.tutor_nombre);
      const input = $('cita-tutor');
      if (input) input.value = input.defaultValue = t.tutor_nombre; // defaultValue: sobrevive a form.reset()
    } else {
      setText('perfil-tutor', 'Aún no eliges tutor');
      setText('tutor-nombre', 'Aún no eliges tutor');
      setText('tutor-iniciales', '--');
      setText('tutor-correo', '—');
      setText('tutor-cubiculo', '—');
      const input = $('cita-tutor');
      if (input) input.value = input.defaultValue = 'Primero elige a tu tutor';
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function cargarMisCitas() {
  const cont = $('lista-citas-alumno');
  if (!cont) return;
  try {
    const { citas } = await api('/citas/mias');
    const proxima = citas.find((c) => ['Pendiente', 'Confirmada'].includes(c.estatus) && new Date(c.fecha_hora) > new Date());
    setText('kpi-proxima-cita', proxima ? fmtFechaHora(proxima.fecha_hora) : 'Sin citas próximas');

    if (!citas.length) {
      cont.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Aún no tienes citas registradas.</p>';
      return;
    }
    cont.innerHTML = citas
      .slice(0, 6)
      .map((c) => {
        const vigente = ['Pendiente', 'Confirmada'].includes(c.estatus) && new Date(c.fecha_hora) > new Date();
        return `<div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs ${vigente ? '' : 'opacity-75'}">
          <div class="flex justify-between items-center mb-1">
            <span class="font-bold ${vigente ? 'text-tecnmGreen' : 'text-slate-600'}">${escapeHtml(c.tipo)} · ${escapeHtml(c.modalidad)}</span>
            ${chip(c.estatus, ESTATUS_CITA_ESTILO[c.estatus])}
          </div>
          <p class="text-slate-700 font-medium">${escapeHtml(c.motivo)}</p>
          <div class="flex justify-between items-center mt-1">
            <p class="text-slate-400 text-[10px]"><i class="fa-regular fa-calendar mr-1"></i>${fmtFechaHora(c.fecha_hora)}</p>
            ${vigente ? `<button onclick="cancelarCitaAlumno(${c.id})" class="text-[10px] text-rose-600 font-bold hover:underline">Cancelar</button>` : ''}
          </div>
        </div>`;
      })
      .join('');
  } catch (err) {
    cont.innerHTML = `<p class="text-xs text-rose-600 text-center py-6">${escapeHtml(err.message)}</p>`;
  }
}

async function cancelarCitaAlumno(id) {
  if (!confirm('¿Deseas cancelar esta cita de tutoría?')) return;
  try {
    await api(`/citas/${id}/estatus`, { method: 'PATCH', body: { estatus: 'Cancelada' } });
    toast('Cita cancelada.');
    cargarMisCitas();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function cargarCanalizacionesAlumno() {
  const tbody = $('tbody-canalizaciones');
  if (!tbody) return;
  try {
    const { canalizaciones } = await api('/canalizaciones');
    if (!canalizaciones.length) {
      mostrarEstadoTabla(tbody, 4, 'No tienes canalizaciones registradas. ¡Sigue así!');
      return;
    }
    tbody.innerHTML = canalizaciones
      .map((c) => `<tr>
        <td class="p-3">${chip(c.area_destino, AREA_ESTILO[c.area_destino])}</td>
        <td class="p-3 text-slate-600">${escapeHtml(c.diagnostico_inicial)}</td>
        <td class="p-3 text-slate-400">${fmtFecha(c.fecha_registro)}</td>
        <td class="p-3">${chip(c.estatus_canalizacion, ESTATUS_CANAL_ESTILO[c.estatus_canalizacion])}</td>
      </tr>`)
      .join('');
  } catch (err) {
    mostrarEstadoTabla(tbody, 4, err.message, 'error');
  }
}

/**
 * Calendario de la fecha de la cita: desde mañana y solo días con clases según
 * el Calendario Académico del TecNM (GET /api/calendario-escolar): de lunes a
 * viernes, dentro de los periodos de clases, sin vacaciones ni días inhábiles.
 * Usa flatpickr (public/vendor/flatpickr); si no cargara, queda el
 * <input type="date"> nativo y el servidor sigue rechazando los días sin clases.
 */
let calendarioCita = null;
function esDiaDeClases(ymd, cal) {
  const dia = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  if (dia === 0 || dia === 6) return false;
  if (!cal) return true;
  const dentro = (r) => ymd >= r.inicio && ymd <= r.fin;
  if (cal.inhabiles.some((d) => d.fecha === ymd)) return false;
  if (cal.vacaciones.some(dentro)) return false;
  return cal.periodos.some(dentro);
}

async function iniciarCalendarioCita() {
  const input = $('cita-fecha');
  if (!input) return;
  const manana = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() + 864e5));
  input.min = manana;
  if (!window.flatpickr) return;
  let cal = null;
  try {
    cal = await api('/calendario-escolar');
  } catch {
    cal = null; // sin calendario: al menos se bloquean sábados y domingos
  }
  const ultimoDia = cal?.periodos?.length ? cal.periodos[cal.periodos.length - 1].fin : null;
  const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  calendarioCita = window.flatpickr(input, {
    locale: window.flatpickr.l10ns?.es || 'default',
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'l j \\d\\e F \\d\\e Y',
    altInputClass: input.className,
    minDate: manana,
    maxDate: ultimoDia || new Date(Date.now() + 120 * 864e5),
    disable: [(d) => !esDiaDeClases(ymdLocal(d), cal)],
    disableMobile: true,
    onChange: () => cargarHorariosCita(),
  });
}

function iniciarAlumno() {
  if (!requiereSesion('alumno')) return;
  iniciarCalendarioCita();
  window.handleCitaSubmit = enviarReservaCita;
  window.handleEvalAlumnoSubmit = enviarEvaluacionAlumno;
  $('cita-fecha')?.addEventListener('change', cargarHorariosCita);
  $('perfil-foto-input')?.addEventListener('change', leerFotoPerfil);
  cargarEvaluacionAlumno();
  cargarFichaAlumno();
  cargarPersonaAlumno();
  cargarDirectorioTutores();
  cargarPerfilAlumno();
  cargarMisCitas();
  cargarCanalizacionesAlumno();
}

/* =============================================================================
 * VISTA: MAESTRO TUTOR
 * ============================================================================= */
async function cargarAgendaTutor() {
  const cont = $('lista-agenda');
  const u = Sesion.usuario;
  if (!cont || !u?.tutorId) return;
  try {
    const { citas } = await api(`/citas/tutor/${u.tutorId}`);
    if (!citas.length) {
      cont.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">No hay citas en el periodo consultado.</p>';
      return;
    }
    // Próximas primero (ascendente), después el historial (descendente)
    const ahora = new Date();
    const proximas = citas.filter((c) => new Date(c.fecha_hora) >= ahora);
    const pasadas = citas.filter((c) => new Date(c.fecha_hora) < ahora).reverse();
    cont.innerHTML = [...proximas, ...pasadas].map(tarjetaCitaTutor).join('');
  } catch (err) {
    cont.innerHTML = `<p class="text-xs text-rose-600 text-center py-6">${escapeHtml(err.message)}</p>`;
  }
}

function tarjetaCitaTutor(c) {
  const titulo = c.tipo === 'Grupal'
    ? `Grupo ${escapeHtml(c.grupo || '')} (sesión grupal)`
    : `${escapeHtml(c.tutorado_nombre)} (${escapeHtml(c.no_control)})`;
  const fondo = c.estatus === 'Pendiente' ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-200';
  let acciones = chip(c.estatus, ESTATUS_CITA_ESTILO[c.estatus]);
  if (c.estatus === 'Pendiente') {
    acciones = `
      <button onclick="cambiarEstatusCita(${c.id}, 'Confirmada', this)" class="bg-tecnmGreen text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-tecnmDark transition"><i class="fa-solid fa-check mr-1"></i> Confirmar</button>
      <button onclick="cambiarEstatusCita(${c.id}, 'Cancelada', this)" class="bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-300 transition">Cancelar</button>`;
  } else if (c.estatus === 'Confirmada') {
    acciones = `
      <button onclick="cambiarEstatusCita(${c.id}, 'Completada', this)" class="bg-tecnmGreen text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-tecnmDark transition"><i class="fa-solid fa-circle-check mr-1"></i> Marcar atendida</button>
      <button onclick="window.print()" class="bg-tecnmGold text-slate-900 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-tecnmGoldDark transition"><i class="fa-solid fa-print mr-1"></i> Comprobante</button>`;
  }
  return `<div class="p-4 rounded-xl border ${fondo} flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <div>
      <div class="flex items-center space-x-2">
        <span class="bg-white border border-slate-200 text-slate-700 text-[9px] font-bold px-2 py-0.5 rounded uppercase">${escapeHtml(c.tipo)} · ${escapeHtml(c.modalidad)}</span>
        <span class="text-xs text-slate-400 font-medium"><i class="fa-regular fa-clock mr-1"></i>${fmtFechaHora(c.fecha_hora)}</span>
      </div>
      <h4 class="text-xs font-bold text-slate-800 mt-1">${titulo}</h4>
      <p class="text-xs text-slate-600 mt-0.5">Motivo: ${escapeHtml(c.motivo)}</p>
      ${c.notas_tutor ? `<p class="text-[11px] text-slate-500 mt-0.5 italic">Notas: ${escapeHtml(c.notas_tutor)}</p>` : ''}
    </div>
    <div class="flex gap-2 w-full md:w-auto flex-wrap">${acciones}</div>
  </div>`;
}

async function cambiarEstatusCita(id, estatus, boton) {
  let notas;
  if (estatus === 'Completada') {
    notas = prompt('Notas de la sesión (opcional):') || undefined;
  } else if (estatus === 'Cancelada' && !confirm('¿Cancelar esta cita?')) {
    return;
  }
  await conBotonOcupado(boton, '…', async () => {
    try {
      const r = await api(`/citas/${id}/estatus`, { method: 'PATCH', body: { estatus, notas_tutor: notas } });
      toast(r.mensaje);
      await Promise.all([cargarAgendaTutor(), cargarMetricasDashboard()]);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function cargarTablaCanalizaciones() {
  const tbody = $('tbody-canalizaciones');
  if (!tbody) return;
  const columnas = tbody.closest('table').querySelectorAll('thead th').length;
  try {
    const { canalizaciones, total } = await api('/canalizaciones');
    setText('canal-registrados', `${total} Casos Registrados`);
    if (!canalizaciones.length) {
      mostrarEstadoTabla(tbody, columnas, 'Sin canalizaciones registradas.');
      return;
    }
    tbody.innerHTML = canalizaciones
      .map((c) => `<tr>
        <td class="p-3 font-bold text-slate-800">${escapeHtml(c.tutorado_nombre)}<div class="text-[10px] text-slate-400">${escapeHtml(c.no_control)}</div></td>
        <td class="p-3">${chip(c.area_destino, AREA_ESTILO[c.area_destino])}</td>
        <td class="p-3 text-slate-600">${escapeHtml(c.diagnostico_inicial)}</td>
        ${PAGINA === 'coordinacion' ? `<td class="p-3 text-slate-500 text-[11px]">${escapeHtml(c.tutor_nombre)}</td>` : ''}
        <td class="p-3 text-slate-400">${fmtFecha(c.fecha_registro)}</td>
        <td class="p-3">${chip(c.estatus_canalizacion, ESTATUS_CANAL_ESTILO[c.estatus_canalizacion])}</td>
      </tr>`)
      .join('');
  } catch (err) {
    mostrarEstadoTabla(tbody, columnas, err.message, 'error');
  }
}

/* ---- Modal de cita (tutor) ------------------------------------------------ */
function abrirModalCitaTutor(nombreAlumno, tutoradoId) {
  const select = $('modal-cita-select');
  const input = $('modal-cita-alumno');
  $('modal-cita-form').reset();
  $('modal-cita-tipo').value = 'Individual';
  alternarTipoCita();

  if (tutoradoId) {
    input.value = nombreAlumno;
    input.dataset.id = tutoradoId;
    input.classList.remove('hidden');
    select.classList.add('hidden');
  } else {
    // "Nueva Cita" genérica: el tutor elige al tutorado
    select.innerHTML = cacheTutorados
      .map((t) => `<option value="${t.tutorado_id}">${escapeHtml(t.nombre_completo)} (${escapeHtml(t.no_control)})</option>`)
      .join('');
    input.classList.add('hidden');
    select.classList.remove('hidden');
  }
  $('modal-cita').classList.remove('hidden');
}

function alternarTipoCita() {
  const grupal = $('modal-cita-tipo').value === 'Grupal';
  $('modal-cita-bloque-alumno').classList.toggle('hidden', grupal);
  $('modal-cita-bloque-grupo').classList.toggle('hidden', !grupal);
}

async function enviarCitaTutor(event) {
  event.preventDefault();
  const tipo = $('modal-cita-tipo').value;
  const input = $('modal-cita-alumno');
  const select = $('modal-cita-select');
  const body = {
    tipo,
    modalidad: $('modal-cita-modalidad').value,
    fecha_hora: $('modal-cita-fecha').value,
    motivo: $('modal-cita-motivo').value.trim() || 'Sesión de tutoría',
  };
  if (tipo === 'Grupal') body.grupo = $('modal-cita-grupo').value.trim();
  else body.tutorado_id = Number(input.classList.contains('hidden') ? select.value : input.dataset.id);

  await conBotonOcupado(event.target.querySelector('button[type="submit"]'), 'Guardando…', async () => {
    try {
      await api('/citas/reservar', { method: 'POST', body });
      window.closeModalCita();
      toast('Cita registrada y confirmada en tu agenda.');
      await Promise.all([cargarAgendaTutor(), cargarMetricasDashboard()]);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ---- Modal de canalización (tutor y coordinación) ------------------------ */
function abrirModalCanalizacion(nombreAlumno, areaSugerida, tutoradoId) {
  $('modal-canalizar-form').reset();
  const input = $('modal-canalizar-alumno');
  input.value = nombreAlumno;
  input.dataset.id = tutoradoId;
  if (areaSugerida) $('modal-canalizar-area').value = areaSugerida;
  $('modal-canalizacion').classList.remove('hidden');
}

async function enviarCanalizacion(event) {
  event.preventDefault();
  const body = {
    tutorado_id: Number($('modal-canalizar-alumno').dataset.id),
    area_destino: $('modal-canalizar-area').value,
    diagnostico_inicial: $('modal-canalizar-diagnostico').value.trim(),
  };
  await conBotonOcupado(event.target.querySelector('button[type="submit"]'), 'Enviando…', async () => {
    try {
      const r = await api('/canalizaciones/crear', { method: 'POST', body });
      window.closeModalCanalizacion();
      toast(r.mensaje);
      await Promise.all([
        cargarTablaCanalizaciones(),
        cargarMetricasDashboard(),
        poblarTablaRiesgo($('filter-riesgo')?.value || 'TODOS', $('buscar-tutorado')?.value || ''),
      ]);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function conectarModales() {
  window.openModalCanalizacion = abrirModalCanalizacion;
  window.closeModalCanalizacion = () => $('modal-canalizacion').classList.add('hidden');
  window.handleModalCanalizacionSubmit = enviarCanalizacion;
  if ($('modal-cita')) {
    window.openModalCita = abrirModalCitaTutor;
    window.closeModalCita = () => $('modal-cita').classList.add('hidden');
    window.handleModalCitaSubmit = enviarCitaTutor;
  }
}

function conectarFiltrosRiesgo() {
  const filtro = $('filter-riesgo');
  const buscador = $('buscar-tutorado');
  let espera;
  const recargar = () => poblarTablaRiesgo(filtro?.value || 'TODOS', buscador?.value.trim() || '');
  window.filterRiesgoTable = recargar;
  filtro?.addEventListener('change', recargar);
  buscador?.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(recargar, 350);
  });
}

function pintarEncabezadoUsuario() {
  const u = Sesion.usuario;
  if (!u) return;
  const nombre = `${u.nombre} ${u.apellidos}`;
  setText('nav-nombre', nombre);
  setText('nav-iniciales', iniciales(nombre));
  setText('banner-nombre', nombre);
}

async function iniciarTutor() {
  if (!requiereSesion('tutor')) return;
  pintarEncabezadoUsuario();
  conectarModales();
  conectarFiltrosRiesgo();
  window.handleLikertSubmit = enviarEvaluacionTutor;
  cargarEvaluacionTutor();
  cargarAvisosTutor();
  cargarMiPerfilTutor();
  $('tutor-foto-input')?.addEventListener('change', leerFotoTutor);

  api('/auth/me')
    .then(({ usuario, periodo }) => {
      const t = usuario.tutor || {};
      setText('banner-grupo', `${t.total_tutorados ?? 0} de ${t.max_tutorados ?? '—'} lugares ocupados`);
      setText('banner-periodo', `Ciclo ${periodo}`);
      setText('banner-total', `${t.total_tutorados ?? 0} tutorados que te eligieron`);
    })
    .catch((err) => toast(err.message, 'error'));

  cargarMetricasDashboard();
  await poblarTablaRiesgo('TODOS');
  // El formulario de acuerdos usa la misma lista de tutorados
  const selAcuerdo = $('acuerdo-tutorado');
  if (selAcuerdo) {
    selAcuerdo.innerHTML = cacheTutorados
      .map((t) => `<option value="${t.tutorado_id}">${escapeHtml(t.nombre_completo)} (${escapeHtml(t.no_control)})</option>`)
      .join('');
  }
  cargarAgendaTutor();
  cargarTablaCanalizaciones();
}

/* =============================================================================
 * EVALUACIÓN DEL TUTOR HACIA EL PIT (11 reactivos Likert)
 *   Tutor:       GET /api/evaluaciones/mia · POST /api/evaluaciones
 *   Coordinador: GET /api/evaluaciones/resumen · GET /api/evaluaciones/tutor/:id
 * ============================================================================= */
// 1 = Siempre (más favorable) … 5 = Nunca
const COLOR_LIKERT = {
  1: { barra: 'bg-emerald-600', chip: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  2: { barra: 'bg-emerald-400', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  3: { barra: 'bg-yellow-400', chip: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
  4: { barra: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800 border-amber-300' },
  5: { barra: 'bg-rose-500', chip: 'bg-rose-100 text-rose-800 border-rose-300' },
};
let ESCALA_LIKERT = [
  { valor: 1, etiqueta: 'Siempre' }, { valor: 2, etiqueta: 'Casi siempre' }, { valor: 3, etiqueta: 'A veces' },
  { valor: 4, etiqueta: 'Casi nunca' }, { valor: 5, etiqueta: 'Nunca' },
];
const etiquetaLikert = (valor) => ESCALA_LIKERT.find((e) => e.valor === Math.round(valor))?.etiqueta || '—';
const colorPromedio = (p) => (p === null ? 'text-slate-400' : p <= 2 ? 'text-emerald-700' : p <= 3 ? 'text-yellow-700' : 'text-rose-600');

/* ---- Tutor: formulario ---------------------------------------------------- */
function actualizarProgresoLikert() {
  const form = $('form-likert');
  if (!form) return;
  const total = form.querySelectorAll('[data-pregunta]').length;
  const respondidas = new Set([...form.querySelectorAll('input[type=radio]:checked')].map((i) => i.name)).size;
  const chipProgreso = $('eval-progreso');
  chipProgreso.textContent = `${respondidas} / ${total} respondidas`;
  chipProgreso.className = `shrink-0 text-[11px] font-bold px-3 py-1 rounded-full ${
    respondidas === total ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`;
  form.querySelectorAll('[data-pregunta]').forEach((bloque) => {
    const ok = bloque.querySelector('input:checked');
    bloque.classList.toggle('border-emerald-200', Boolean(ok));
    bloque.classList.toggle('border-transparent', !ok);
  });
}

function pintarEstadoEvaluacion(evaluacion, periodo) {
  const estado = $('eval-estado');
  const btnPanel = $('btn-panel-eval-tutor');
  if (btnPanel) btnPanel.querySelector('span').textContent = evaluacion ? 'Ver o actualizar mi evaluación' : 'Responder evaluación';
  if (evaluacion) {
    estado.className = 'mb-4 p-3 rounded-xl border text-xs font-semibold bg-emerald-50 border-emerald-200 text-emerald-800';
    estado.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> Evaluación del periodo ${escapeHtml(periodo)} enviada el
      ${fmtFechaHora(evaluacion.fecha_envio)}${evaluacion.updated_at && evaluacion.updated_at !== evaluacion.fecha_envio
        ? ` · última actualización ${fmtFechaHora(evaluacion.updated_at)}` : ''}.
      Puedes modificar tus respuestas y volver a enviarla.`;
    $('eval-boton').textContent = 'Actualizar mi Evaluación';
  } else {
    estado.className = 'mb-4 p-3 rounded-xl border text-xs font-semibold bg-amber-50 border-amber-200 text-amber-800';
    estado.innerHTML = `<i class="fa-solid fa-hourglass-half mr-1"></i> Pendiente: aún no has enviado tu evaluación del periodo ${escapeHtml(periodo)}.`;
    $('eval-boton').textContent = 'Enviar Cuestionario Institucional de Evaluación';
  }
}

async function cargarEvaluacionTutor() {
  const cont = $('likert-preguntas');
  if (!cont) return;
  try {
    const { preguntas, escala, evaluacion, periodo } = await api('/evaluaciones/mia');
    ESCALA_LIKERT = escala;
    cont.innerHTML = preguntas
      .map((p, i) => `
        <fieldset data-pregunta="${p.clave}" class="p-3 bg-slate-50 rounded-xl space-y-2 border border-transparent transition">
          <legend class="sr-only">Pregunta ${i + 1}</legend>
          <p class="font-bold text-slate-800">P${i + 1}. ${escapeHtml(p.texto)}</p>
          <div class="flex flex-wrap gap-2 text-slate-600">
            ${escala.map((e) => `
              <label class="cursor-pointer">
                <input type="radio" name="${p.clave}" value="${e.valor}" required class="peer sr-only"
                  ${evaluacion && evaluacion.respuestas[p.clave] === e.valor ? 'checked' : ''}>
                <span class="inline-block px-3 py-1.5 rounded-lg border border-slate-300 bg-white
                  peer-checked:bg-tecnmGreen peer-checked:text-white peer-checked:border-tecnmGreen
                  peer-focus-visible:ring-2 peer-focus-visible:ring-tecnmGold hover:border-tecnmGreen transition">
                  ${e.valor === 0 ? escapeHtml(e.etiqueta) : `${e.valor}: ${escapeHtml(e.etiqueta)}`}</span>
              </label>`).join('')}
          </div>
        </fieldset>`)
      .join('');
    $('eval-comentarios').value = evaluacion?.comentarios || '';
    cont.addEventListener('change', actualizarProgresoLikert);
    pintarEstadoEvaluacion(evaluacion, periodo);
    actualizarProgresoLikert();
  } catch (err) {
    cont.innerHTML = `<p class="text-rose-600 text-center py-6">${escapeHtml(err.message)}</p>`;
  }
}

async function enviarEvaluacionTutor(event) {
  event.preventDefault();
  const form = event.target;
  const ok = $('likert-success');
  const error = $('likert-error');
  ok.classList.add('hidden');
  error.classList.add('hidden');

  const bloques = [...form.querySelectorAll('[data-pregunta]')];
  const sinResponder = bloques.filter((b) => !b.querySelector('input:checked'));
  if (sinResponder.length) {
    error.querySelector('span').textContent =
      `Te faltan ${sinResponder.length} pregunta(s): ${sinResponder.map((b) => b.dataset.pregunta.toUpperCase()).join(', ')}.`;
    error.classList.remove('hidden');
    sinResponder[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const respuestas = Object.fromEntries(
    bloques.map((b) => [b.dataset.pregunta, Number(b.querySelector('input:checked').value)])
  );
  const comentarios = $('eval-comentarios').value.trim() || undefined;

  let guardada = null;
  await conBotonOcupado($('eval-boton'), 'Enviando…', async () => {
    try {
      const r = await api('/evaluaciones', { method: 'POST', body: { respuestas, comentarios } });
      ok.querySelector('span').textContent = `${r.mensaje} Promedio de tus respuestas: ${num(r.evaluacion.promedio, 2)}.`;
      ok.classList.remove('hidden');
      guardada = r.evaluacion;
    } catch (err) {
      error.querySelector('span').textContent = err.message;
      error.classList.remove('hidden');
    }
  });
  // Después de restaurar el botón, para que conserve el texto "Actualizar…"
  if (guardada) pintarEstadoEvaluacion(guardada, guardada.periodo);
}

/* ---- Coordinador: concentrado ------------------------------------------- */
function barraDistribucion(dist, total) {
  if (!total) return '<span class="text-slate-400 text-[10px]">Sin respuestas</span>';
  return `<div class="flex h-3 w-full rounded-full overflow-hidden bg-slate-100" role="img"
      aria-label="${ESCALA_LIKERT.map((e) => `${e.etiqueta}: ${dist[e.valor] || 0}`).join(', ')}">
    ${ESCALA_LIKERT.map((e) => {
      const n = dist[e.valor] || 0;
      return n ? `<div class="${COLOR_LIKERT[e.valor].barra}" style="width:${(n / total) * 100}%" title="${e.etiqueta}: ${n}"></div>` : '';
    }).join('')}
  </div>`;
}

async function cargarResumenEvaluaciones(periodo) {
  const tbodyP = $('tbody-eval-preguntas');
  const tbodyT = $('tbody-eval-tutores');
  if (!tbodyP) return;
  mostrarEstadoTabla(tbodyP, 5, 'Cargando…');
  mostrarEstadoTabla(tbodyT, 6, 'Cargando…');
  try {
    const r = await api('/evaluaciones/resumen', { query: { periodo } });
    ESCALA_LIKERT = r.escala;

    // Selector de periodo: vigente y los dos anteriores
    const sel = $('eval-periodo');
    if (!sel.options.length) {
      const [anio, sem] = r.periodo.split('-').map(Number);
      const periodos = [r.periodo, sem === 2 ? `${anio}-1` : `${anio - 1}-2`, sem === 2 ? `${anio - 1}-2` : `${anio - 1}-1`];
      sel.innerHTML = periodos.map((p) => `<option value="${p}">Periodo ${p}</option>`).join('');
      sel.addEventListener('change', () => cargarResumenEvaluaciones(sel.value));
    }

    $('eval-leyenda').innerHTML = ESCALA_LIKERT.map((e) =>
      `<span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm ${COLOR_LIKERT[e.valor].barra}"></span>${e.valor} ${escapeHtml(e.etiqueta)}</span>`).join('');

    setText('eval-participacion', `${r.respondidas} / ${r.total_tutores}`);
    setText('eval-participacion-sub', `${r.pct_participacion}% de los tutores respondió`);
    const prom = $('eval-promedio');
    prom.textContent = r.promedio_general === null ? '—' : num(r.promedio_general, 2);
    prom.className = `text-xl font-extrabold mt-1 ${colorPromedio(r.promedio_general)}`;
    setText('eval-promedio-sub', r.promedio_general === null ? 'Sin respuestas en el periodo' : `Equivale a "${etiquetaLikert(r.promedio_general)}"`);

    const conDatos = r.preguntas.filter((p) => p.promedio !== null);
    if (conDatos.length) {
      const orden = [...conDatos].sort((a, b) => a.promedio - b.promedio);
      const mejor = orden[0];
      const peor = orden[orden.length - 1];
      setText('eval-mejor', `${mejor.clave.toUpperCase()} · ${num(mejor.promedio, 2)}`);
      setText('eval-mejor-sub', mejor.texto);
      setText('eval-peor', `${peor.clave.toUpperCase()} · ${num(peor.promedio, 2)}`);
      setText('eval-peor-sub', peor.texto);
    } else {
      ['eval-mejor', 'eval-peor'].forEach((id) => setText(id, '—'));
      ['eval-mejor-sub', 'eval-peor-sub'].forEach((id) => setText(id, ''));
    }

    tbodyP.innerHTML = r.preguntas
      .map((p, i) => `<tr class="hover:bg-slate-50">
        <td class="p-3 font-bold text-slate-500">P${i + 1}</td>
        <td class="p-3 text-slate-800">${escapeHtml(p.texto)}</td>
        <td class="p-3">${barraDistribucion(p.distribucion, p.respuestas)}</td>
        <td class="p-3 text-center font-extrabold ${colorPromedio(p.promedio)}">${p.promedio === null ? '—' : num(p.promedio, 2)}
          ${p.promedio === null ? '' : `<div class="text-[9px] font-semibold text-slate-400">${escapeHtml(etiquetaLikert(p.promedio))}</div>`}</td>
        <td class="p-3 text-center font-bold">${p.pct_favorable === null ? '—' : `${p.pct_favorable}%`}</td>
      </tr>`)
      .join('');

    tbodyT.innerHTML = r.tutores
      .map((t) => {
        const enviada = t.estatus === 'Enviada';
        const nombre = escapeHtml(JSON.stringify(t.nombre));
        return `<tr class="hover:bg-slate-50">
          <td class="p-3 font-bold text-slate-800">${escapeHtml(t.nombre)}<div class="text-[10px] text-slate-400 font-medium">${escapeHtml(t.rfc)}</div></td>
          <td class="p-3">${(t.grupos || []).map((g) => chip(g, 'bg-slate-200 text-slate-700')).join(' ') || '<span class="text-slate-400">Sin grupo</span>'}</td>
          <td class="p-3">${chip(t.estatus, enviada ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}</td>
          <td class="p-3 text-slate-500">${enviada ? fmtFechaHora(t.fecha_envio) : '—'}</td>
          <td class="p-3 text-center font-extrabold ${colorPromedio(t.promedio)}">${t.promedio === null ? '—' : num(t.promedio, 2)}</td>
          <td class="p-3 text-center">${enviada
            ? `<button onclick='verEvaluacionTutor(${t.tutor_id}, ${nombre})' class="bg-tecnmGreen text-white px-2.5 py-1 rounded-lg text-[11px] font-bold hover:bg-tecnmDark transition"><i class="fa-solid fa-eye mr-1"></i> Ver respuestas</button>`
            : '<span class="text-slate-400 text-[11px]">Esperando respuesta</span>'}</td>
        </tr>`;
      })
      .join('');
  } catch (err) {
    mostrarEstadoTabla(tbodyP, 5, err.message, 'error');
    mostrarEstadoTabla(tbodyT, 6, err.message, 'error');
  }
}

async function verEvaluacionTutor(tutorId, nombre) {
  const modal = $('modal-evaluacion');
  const cuerpo = $('modal-eval-cuerpo');
  const periodo = $('eval-periodo')?.value;
  setText('modal-eval-titulo', `Evaluación de ${nombre}`);
  setText('modal-eval-sub', '');
  cuerpo.innerHTML = '<p class="text-slate-400 text-center py-6">Cargando…</p>';
  modal.classList.remove('hidden');
  try {
    const { preguntas, evaluacion: e } = await api(`/evaluaciones/tutor/${tutorId}`, { query: { periodo } });
    setText('modal-eval-sub', `Periodo ${e.periodo} · enviada el ${fmtFechaHora(e.fecha_envio)} · promedio ${num(e.promedio, 2)} (${etiquetaLikert(e.promedio)})`);
    cuerpo.innerHTML = preguntas
      .map((p, i) => {
        const val = e.respuestas[p.clave];
        return `<div class="flex items-start justify-between gap-3 p-3 bg-slate-50 rounded-xl">
          <p class="text-slate-700"><strong class="text-slate-500">P${i + 1}.</strong> ${escapeHtml(p.texto)}</p>
          <span class="shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${COLOR_LIKERT[val].chip}">${val} · ${escapeHtml(etiquetaLikert(val))}</span>
        </div>`;
      })
      .join('') + `<div class="p-3 rounded-xl border border-slate-200 mt-3">
        <p class="text-[10px] font-extrabold uppercase text-slate-500 mb-1">Comentarios del tutor</p>
        <p class="text-slate-700">${e.comentarios ? escapeHtml(e.comentarios) : '<span class="text-slate-400">Sin comentarios.</span>'}</p>
      </div>`;
  } catch (err) {
    cuerpo.innerHTML = `<p class="text-rose-600 text-center py-6">${escapeHtml(err.message)}</p>`;
  }
}

/* =============================================================================
 * EVALUACIÓN DEL ACOMPAÑAMIENTO TUTORIAL POR EL TUTORADO (secciones 4 y 5)
 *   Alumno:      GET /api/evaluaciones/alumno/mia · POST /api/evaluaciones/alumno
 *   Coordinador: GET /api/evaluaciones/alumnos/resumen · GET /api/evaluaciones/alumnos/:id
 *   (confidencial: el tutor no tiene acceso)
 * ============================================================================= */
function reactivoLikertHtml(clave, etiqueta, texto, escala, valorActual) {
  return `
    <fieldset data-reactivo="${clave}" data-numero="${escapeHtml(etiqueta)}" class="p-3 bg-slate-50 rounded-xl space-y-2 border border-transparent transition">
      <legend class="sr-only">Ítem ${escapeHtml(etiqueta)}</legend>
      <p class="font-bold text-slate-800">${escapeHtml(etiqueta)}${/^\d+$/.test(etiqueta) ? '.' : ''} ${escapeHtml(texto)}</p>
      <div class="flex flex-wrap gap-2 text-slate-600">
        ${escala.map((e) => `
          <label class="cursor-pointer">
            <input type="radio" name="${clave}" value="${e.valor}" class="peer sr-only" ${valorActual === e.valor ? 'checked' : ''}>
            <span class="inline-block px-3 py-1.5 rounded-lg border border-slate-300 bg-white
              peer-checked:bg-tecnmGreen peer-checked:text-white peer-checked:border-tecnmGreen
              peer-focus-visible:ring-2 peer-focus-visible:ring-tecnmGold hover:border-tecnmGreen transition">
              ${e.valor === 0 ? escapeHtml(e.etiqueta) : `${e.valor}: ${escapeHtml(e.etiqueta)}`}</span>
          </label>`).join('')}
      </div>
    </fieldset>`;
}

function actualizarProgresoEvalAlumno() {
  const form = $('form-evalal');
  const bloques = form.querySelectorAll('[data-reactivo]');
  const hechas = [...bloques].filter((b) => b.querySelector('input:checked'));
  const chipP = $('evalal-progreso');
  chipP.textContent = `${hechas.length} / ${bloques.length} respondidas`;
  chipP.className = `shrink-0 text-[11px] font-bold px-3 py-1 rounded-full ${
    hechas.length === bloques.length ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`;
  bloques.forEach((b) => {
    const ok = Boolean(b.querySelector('input:checked'));
    b.classList.toggle('border-emerald-200', ok);
    b.classList.toggle('border-transparent', !ok);
  });
  form.querySelectorAll('[data-seccion-contador]').forEach((c) => {
    const sec = c.closest('section').querySelectorAll('[data-reactivo]');
    c.textContent = `${[...sec].filter((b) => b.querySelector('input:checked')).length} / ${sec.length}`;
  });
}

function pintarEstadoEvalAlumno(evaluacion, periodo) {
  const estado = $('evalal-estado');
  const chipE = $('evalal-chip');
  const btnPanel = $('btn-panel-evalal');
  if (chipE) {
    chipE.textContent = evaluacion ? 'Enviada' : 'Pendiente';
    chipE.className = `text-[9px] font-bold px-2 py-0.5 rounded uppercase ${evaluacion ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`;
  }
  if (btnPanel) btnPanel.querySelector('span').textContent = evaluacion ? 'Ver o actualizar' : 'Responder evaluación';
  setText('acceso-evalal-estado', evaluacion ? 'Ya la enviaste. Puedes actualizarla.' : 'Pendiente: evalúa el acompañamiento de tu tutor.');
  if (evaluacion) {
    estado.className = 'mb-4 p-3 rounded-xl border text-xs font-semibold bg-emerald-50 border-emerald-200 text-emerald-800';
    estado.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> Ya enviaste tu evaluación del periodo ${escapeHtml(periodo)}
      (${fmtFechaHora(evaluacion.updated_at || evaluacion.fecha_envio)}). Puedes modificarla y volver a enviarla.`;
    $('evalal-boton').textContent = 'Actualizar mi Evaluación';
  } else {
    estado.className = 'mb-4 p-3 rounded-xl border text-xs font-semibold bg-amber-50 border-amber-200 text-amber-800';
    estado.innerHTML = `<i class="fa-solid fa-hourglass-half mr-1"></i> Pendiente: aún no has evaluado a tu tutor en el periodo ${escapeHtml(periodo)}.`;
    $('evalal-boton').textContent = 'Enviar Evaluación';
  }
}

async function cargarEvaluacionAlumno() {
  const cont = $('evalal-secciones');
  if (!cont) return;
  try {
    const { secciones, escala, evaluacion, periodo, tutor_nombre: tutor } = await api('/evaluaciones/alumno/mia');
    setText('evalal-tutor', tutor || 'Sin tutor asignado');
    setText('evalal-periodo', periodo);
    if (!tutor) {
      cont.innerHTML = '<p class="text-slate-500 text-center py-6">Cuando elijas a tu tutor podrás evaluarlo aquí.</p>';
      $('evalal-boton').disabled = true;
      $('evalal-estado').classList.add('hidden');
      return;
    }
    cont.innerHTML = secciones
      .map((s) => `
        <section class="space-y-3 mb-6">
          ${s.titulo ? `<div class="flex items-center justify-between border-b border-slate-200 pb-2">
            <h4 class="text-sm font-extrabold text-tecnmGreen">${escapeHtml(s.titulo)}</h4>
            <span data-seccion-contador class="text-[10px] font-bold text-slate-500"></span>
          </div>` : ''}
          ${s.preguntas.map((p) => reactivoLikertHtml(p.clave, p.numero, p.texto, escala, evaluacion?.respuestas[p.clave])).join('')}
        </section>`)
      .join('');
    $('evalal-comentarios').value = evaluacion?.comentarios || '';
    cont.addEventListener('change', actualizarProgresoEvalAlumno);
    pintarEstadoEvalAlumno(evaluacion, periodo);
    actualizarProgresoEvalAlumno();
  } catch (err) {
    cont.innerHTML = `<p class="text-rose-600 text-center py-6">${escapeHtml(err.message)}</p>`;
  }
}

async function enviarEvaluacionAlumno(event) {
  event.preventDefault();
  const ok = $('evalal-success');
  const error = $('evalal-error');
  ok.classList.add('hidden');
  error.classList.add('hidden');

  const bloques = [...event.target.querySelectorAll('[data-reactivo]')];
  const faltan = bloques.filter((b) => !b.querySelector('input:checked'));
  if (faltan.length) {
    error.querySelector('span').textContent =
      `Te faltan ${faltan.length} ítem(s): ${faltan.map((b) => b.dataset.numero).join(', ')}.`;
    error.classList.remove('hidden');
    faltan[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const respuestas = Object.fromEntries(bloques.map((b) => [b.dataset.reactivo, Number(b.querySelector('input:checked').value)]));
  const comentarios = $('evalal-comentarios').value.trim() || undefined;

  let guardada = null;
  await conBotonOcupado($('evalal-boton'), 'Enviando…', async () => {
    try {
      const r = await api('/evaluaciones/alumno', { method: 'POST', body: { respuestas, comentarios } });
      ok.querySelector('span').textContent = r.mensaje;
      ok.classList.remove('hidden');
      guardada = r;
    } catch (err) {
      error.querySelector('span').textContent = err.message;
      error.classList.remove('hidden');
    }
  });
  if (guardada) pintarEstadoEvalAlumno(guardada.evaluacion, guardada.periodo);
}

/* ---- Coordinador --------------------------------------------------------- */
let vistaAlumnosCargada = false;

function cambiarVistaEvaluacion(vista) {
  ['tutores', 'alumnos'].forEach((v) => {
    $(`eval-vista-${v}`).classList.toggle('hidden', v !== vista);
    const b = $(`evalbtn-${v}`);
    b.classList.toggle('bg-tecnmGreen', v === vista);
    b.classList.toggle('text-white', v === vista);
    b.classList.toggle('text-slate-600', v !== vista);
    b.classList.toggle('hover:bg-slate-100', v !== vista);
  });
  if (vista === 'alumnos' && !vistaAlumnosCargada) {
    vistaAlumnosCargada = true;
    cargarResumenEvalAlumnos();
  }
}

function filaItemLikert(etiqueta, texto, item) {
  return `<tr class="hover:bg-slate-50">
    <td class="p-3 font-bold text-slate-500 whitespace-nowrap">${escapeHtml(etiqueta)}</td>
    <td class="p-3 text-slate-800">${escapeHtml(texto)}</td>
    <td class="p-3">${barraDistribucion(item.distribucion, item.respuestas)}</td>
    <td class="p-3 text-center font-extrabold ${colorPromedio(item.promedio)}">${item.promedio === null ? '—' : num(item.promedio, 2)}
      ${item.promedio === null ? '' : `<div class="text-[9px] font-semibold text-slate-400">${escapeHtml(etiquetaLikert(item.promedio))}</div>`}</td>
    <td class="p-3 text-center font-bold">${item.pct_favorable === null ? '—' : `${item.pct_favorable}%`}</td>
  </tr>`;
}

async function cargarResumenEvalAlumnos() {
  const selTutor = $('evalal-filtro-tutor');
  const selPeriodo = $('evalal-filtro-periodo');
  const tbodyItems = $('tbody-evalal-items');
  const tbodyTut = $('tbody-evalal-tutores');
  const tbodyResp = $('tbody-evalal-respuestas');
  mostrarEstadoTabla(tbodyItems, 5, 'Cargando…');
  mostrarEstadoTabla(tbodyResp, 6, 'Cargando…');
  try {
    const r = await api('/evaluaciones/alumnos/resumen', { query: { periodo: selPeriodo.value, tutor_id: selTutor.value } });
    ESCALA_LIKERT = r.escala;

    if (!selPeriodo.options.length) {
      const [anio, sem] = r.periodo.split('-').map(Number);
      const periodos = [r.periodo, sem === 2 ? `${anio}-1` : `${anio - 1}-2`, sem === 2 ? `${anio - 1}-2` : `${anio - 1}-1`];
      selPeriodo.innerHTML = periodos.map((p) => `<option value="${p}">Periodo ${p}</option>`).join('');
      selPeriodo.addEventListener('change', cargarResumenEvalAlumnos);
      selTutor.addEventListener('change', cargarResumenEvalAlumnos);
    }
    const elegido = selTutor.value;
    selTutor.innerHTML = '<option value="">Todos los tutores</option>' +
      r.por_tutor.map((t) => `<option value="${t.tutor_id}">${escapeHtml(t.nombre)}</option>`).join('');
    selTutor.value = elegido;

    $('evalal-leyenda').innerHTML = ESCALA_LIKERT.map((e) =>
      `<span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm ${COLOR_LIKERT[e.valor].barra}"></span>${e.valor} ${escapeHtml(e.etiqueta)}</span>`).join('');

    setText('evalal-kpi-resp', `${r.respondidas} / ${r.total_tutorados}`);
    setText('evalal-kpi-resp-sub', `${r.pct_participacion}% de los tutorados${elegido ? ' de este tutor' : ''} respondió`);
    const prom = $('evalal-kpi-prom');
    prom.textContent = r.promedio_general === null ? '—' : num(r.promedio_general, 2);
    prom.className = `text-xl font-extrabold mt-1 ${colorPromedio(r.promedio_general)}`;
    setText('evalal-kpi-prom-sub', r.promedio_general === null ? 'Sin respuestas' : `Equivale a "${etiquetaLikert(r.promedio_general)}"`);

    const conDatos = r.items.filter((i) => i.promedio !== null).sort((a, b) => a.promedio - b.promedio);
    if (conDatos.length) {
      const [mejor, peor] = [conDatos[0], conDatos[conDatos.length - 1]];
      setText('evalal-kpi-mejor', `${mejor.numero} · ${num(mejor.promedio, 2)}`);
      setText('evalal-kpi-mejor-sub', mejor.texto);
      setText('evalal-kpi-peor', `${peor.numero} · ${num(peor.promedio, 2)}`);
      setText('evalal-kpi-peor-sub', peor.texto);
    } else {
      ['evalal-kpi-mejor', 'evalal-kpi-peor'].forEach((id) => setText(id, '—'));
      ['evalal-kpi-mejor-sub', 'evalal-kpi-peor-sub'].forEach((id) => setText(id, ''));
    }

    tbodyTut.innerHTML = r.por_tutor.length
      ? r.por_tutor.map((t) => `<tr class="hover:bg-slate-50 ${String(t.tutor_id) === elegido ? 'bg-emerald-50/60' : ''}">
          <td class="p-3 font-bold text-slate-800">${escapeHtml(t.nombre)}</td>
          <td class="p-3">${(t.grupos || []).map((g) => chip(g, 'bg-slate-200 text-slate-700')).join(' ') || '—'}</td>
          <td class="p-3 text-center">${t.respondidas} / ${t.tutorados} <span class="text-slate-400">(${t.pct_participacion}%)</span></td>
          <td class="p-3 text-center font-extrabold ${colorPromedio(t.promedio)}">${t.promedio === null ? '—' : num(t.promedio, 2)}</td>
          <td class="p-3 text-center"><button onclick="filtrarEvalAlumnosPorTutor(${t.tutor_id})" class="bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-bold hover:bg-slate-300 transition"><i class="fa-solid fa-filter mr-1"></i> Ver detalle</button></td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="p-6 text-center text-slate-400">Sin tutores con grupo en el periodo.</td></tr>';

    // Ítems agrupados por sección
    tbodyItems.innerHTML = r.secciones
      .map((s) => (s.titulo ? `<tr><td colspan="5" class="p-2 pt-4 text-[11px] font-extrabold text-tecnmGreen uppercase">${escapeHtml(s.titulo)}</td></tr>` : '') +
        r.items.filter((i) => i.seccion === s.id).map((i) => filaItemLikert(i.numero, i.texto, i)).join(''))
      .join('');

    setText('evalal-lista-sub', elegido
      ? `Evaluaciones de los tutorados de ${r.por_tutor.find((t) => String(t.tutor_id) === elegido)?.nombre || 'este tutor'}.`
      : 'Evaluaciones enviadas por los tutorados en el periodo.');
    tbodyResp.innerHTML = r.respuestas.length
      ? r.respuestas.map((e) => `<tr class="hover:bg-slate-50">
          <td class="p-3 font-bold text-slate-800">${escapeHtml(e.alumno_nombre)}<div class="text-[10px] text-slate-400 font-medium">${escapeHtml(e.no_control)} · ${e.semestre}° sem.</div></td>
          <td class="p-3">${e.grupo ? chip(e.grupo, 'bg-slate-200 text-slate-700') : '—'}</td>
          <td class="p-3 text-slate-600">${escapeHtml(e.tutor_nombre)}</td>
          <td class="p-3 text-slate-500">${fmtFechaHora(e.fecha_envio)}</td>
          <td class="p-3 text-center font-extrabold ${colorPromedio(e.promedio)}">${e.promedio === null ? '—' : num(e.promedio, 2)}</td>
          <td class="p-3 text-center"><button onclick="verEvaluacionAlumno(${e.id})" class="bg-tecnmGreen text-white px-2.5 py-1 rounded-lg text-[11px] font-bold hover:bg-tecnmDark transition"><i class="fa-solid fa-eye mr-1"></i> Ver respuestas</button>
            ${e.tiene_comentarios ? '<i class="fa-solid fa-comment-dots text-tecnmBlue ml-1" title="Incluye comentarios"></i>' : ''}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="p-6 text-center text-slate-400">Aún no hay evaluaciones de tutorados en este periodo.</td></tr>';
  } catch (err) {
    mostrarEstadoTabla(tbodyItems, 5, err.message, 'error');
    mostrarEstadoTabla(tbodyResp, 6, err.message, 'error');
  }
}

function filtrarEvalAlumnosPorTutor(tutorId) {
  $('evalal-filtro-tutor').value = String(tutorId);
  cargarResumenEvalAlumnos();
}

async function verEvaluacionAlumno(id) {
  const modal = $('modal-evaluacion');
  const cuerpo = $('modal-eval-cuerpo');
  setText('modal-eval-titulo', 'Evaluación del tutorado');
  setText('modal-eval-sub', '');
  cuerpo.innerHTML = '<p class="text-slate-400 text-center py-6">Cargando…</p>';
  modal.classList.remove('hidden');
  try {
    const { secciones, evaluacion: e } = await api(`/evaluaciones/alumnos/${id}`);
    setText('modal-eval-titulo', `${e.alumno_nombre} (${e.no_control}) evalúa a ${e.tutor_nombre}`);
    setText('modal-eval-sub', `Periodo ${e.periodo} · enviada el ${fmtFechaHora(e.fecha_envio)} · ${e.promedio === null ? 'sin promedio (todo "No aplica")' : `promedio ${num(e.promedio, 2)} (${etiquetaLikert(e.promedio)})`} · Confidencial`);
    cuerpo.innerHTML = secciones
      .map((s) => (s.titulo ? `<p class="text-[11px] font-extrabold text-tecnmGreen uppercase pt-2">${escapeHtml(s.titulo)}</p>` : '') +
        s.preguntas.map((p) => {
          const val = e.respuestas[p.clave];
          return `<div class="flex items-start justify-between gap-3 p-3 bg-slate-50 rounded-xl">
            <p class="text-slate-700"><strong class="text-slate-500">${escapeHtml(p.numero)}</strong> ${escapeHtml(p.texto)}</p>
            ${val === 0
              ? '<span class="shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-bold bg-slate-100 text-slate-500 border-slate-200">No aplica</span>'
              : COLOR_LIKERT[val]
                ? `<span class="shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${COLOR_LIKERT[val].chip}">${val} · ${escapeHtml(etiquetaLikert(val))}</span>`
                : '<span class="shrink-0 text-[11px] text-slate-400">Sin respuesta</span>'}
          </div>`;
        }).join(''))
      .join('') + `<div class="p-3 rounded-xl border border-slate-200 mt-3">
        <p class="text-[10px] font-extrabold uppercase text-slate-500 mb-1">Comentarios del tutorado</p>
        <p class="text-slate-700">${e.comentarios ? escapeHtml(e.comentarios) : '<span class="text-slate-400">Sin comentarios.</span>'}</p>
      </div>`;
  } catch (err) {
    cuerpo.innerHTML = `<p class="text-rose-600 text-center py-6">${escapeHtml(err.message)}</p>`;
  }
}

/* =============================================================================
 * AVISOS DE LA COORDINACIÓN  (tutores leen · coordinación administra)
 * ============================================================================= */
const ESTADO_AVISO_ESTILO = {
  Publicado: 'bg-emerald-100 text-emerald-800',
  Borrador: 'bg-slate-200 text-slate-700',
  Archivado: 'bg-slate-100 text-slate-400',
};
let cacheAvisos = [];

function tarjetaAviso(a, { admin }) {
  const borde = a.importante ? 'border-amber-500' : 'border-tecnmGreen';
  const fecha = a.fecha_publicacion ? `Publicado ${fmtFechaHora(a.fecha_publicacion)}` : `Editado ${fmtFechaHora(a.updated_at)}`;
  const acciones = !admin ? '' : `
    <div class="flex flex-wrap gap-1.5 mt-3">
      <button onclick="editarAviso(${a.id})" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-bold"><i class="fa-solid fa-pen mr-1"></i>Editar</button>
      ${a.estado !== 'Publicado' ? `<button onclick="cambiarEstadoAviso(${a.id}, 'Publicado')" class="bg-tecnmGreen hover:bg-tecnmDark text-white px-2.5 py-1 rounded-lg text-[11px] font-bold"><i class="fa-solid fa-paper-plane mr-1"></i>Publicar</button>` : ''}
      ${a.estado === 'Publicado' ? `<button onclick="cambiarEstadoAviso(${a.id}, 'Archivado')" class="bg-amber-100 hover:bg-amber-200 text-amber-800 px-2.5 py-1 rounded-lg text-[11px] font-bold"><i class="fa-solid fa-box-archive mr-1"></i>Archivar</button>` : ''}
      <button onclick="eliminarAviso(${a.id})" class="bg-rose-50 hover:bg-rose-100 text-rose-700 px-2.5 py-1 rounded-lg text-[11px] font-bold"><i class="fa-solid fa-trash mr-1"></i>Eliminar</button>
    </div>`;
  return `<div class="p-4 bg-slate-50 rounded-xl border-l-4 ${borde} ${a.estado === 'Archivado' ? 'opacity-60' : ''}">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-[10px] font-bold ${a.importante ? 'text-amber-700' : 'text-tecnmGreen'} uppercase">${escapeHtml(a.categoria)}</span>
      ${a.importante ? '<span class="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"><i class="fa-solid fa-star mr-0.5"></i>Importante</span>' : ''}
      ${admin ? chip(a.estado, ESTADO_AVISO_ESTILO[a.estado]) : ''}
    </div>
    <h4 class="text-xs font-bold text-slate-800 mt-1">${escapeHtml(a.titulo)}</h4>
    <p class="text-xs text-slate-600 mt-1 whitespace-pre-line">${escapeHtml(a.contenido)}</p>
    <p class="text-[10px] text-slate-400 mt-2">${fecha}${a.autor ? ` · ${escapeHtml(a.autor)}` : ''}</p>
    ${acciones}
  </div>`;
}

async function cargarAvisosTutor() {
  const cont = $('lista-avisos-tutor');
  if (!cont) return;
  try {
    const { avisos } = await api('/avisos');
    setText('avisos-contador', `${avisos.length} vigente${avisos.length === 1 ? '' : 's'}`);
    cont.innerHTML = avisos.length
      ? avisos.map((a) => tarjetaAviso(a, { admin: false })).join('')
      : '<p class="text-xs text-slate-400 text-center py-4">No hay avisos publicados por la Coordinación.</p>';
  } catch (err) {
    cont.innerHTML = `<p class="text-xs text-rose-600 text-center py-4">${escapeHtml(err.message)}</p>`;
  }
}

async function cargarAvisosCoord() {
  const cont = $('lista-avisos-coord');
  if (!cont) return;
  try {
    const { avisos } = await api('/avisos', { query: { estado: $('aviso-filtro').value } });
    cacheAvisos = avisos;
    cont.innerHTML = avisos.length
      ? avisos.map((a) => tarjetaAviso(a, { admin: true })).join('')
      : '<p class="text-xs text-slate-400 text-center py-6">No hay avisos con ese filtro.</p>';
  } catch (err) {
    cont.innerHTML = `<p class="text-xs text-rose-600 text-center py-6">${escapeHtml(err.message)}</p>`;
  }
}

function limpiarFormAviso() {
  $('form-aviso').reset();
  $('aviso-id').value = '';
  setText('aviso-form-titulo', 'Nuevo Aviso');
  $('aviso-cancelar').classList.add('hidden');
}

function editarAviso(id) {
  const a = cacheAvisos.find((x) => x.id === id);
  if (!a) return;
  $('aviso-id').value = a.id;
  $('aviso-titulo').value = a.titulo;
  $('aviso-categoria').value = a.categoria;
  $('aviso-contenido').value = a.contenido;
  $('aviso-importante').checked = a.importante;
  setText('aviso-form-titulo', 'Editar Aviso');
  $('aviso-cancelar').classList.remove('hidden');
  $('form-aviso').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('aviso-titulo').focus();
}

async function guardarAviso(estado) {
  const form = $('form-aviso');
  if (!form.reportValidity()) return;
  const id = $('aviso-id').value;
  const body = {
    titulo: $('aviso-titulo').value.trim(),
    categoria: $('aviso-categoria').value.trim() || 'Coordinación de Tutorías',
    contenido: $('aviso-contenido').value.trim(),
    importante: $('aviso-importante').checked,
    estado,
  };
  try {
    const r = id
      ? await api(`/avisos/${id}`, { method: 'PATCH', body })
      : await api('/avisos', { method: 'POST', body });
    toast(r.mensaje);
    limpiarFormAviso();
    cargarAvisosCoord();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function cambiarEstadoAviso(id, estado) {
  try {
    const r = await api(`/avisos/${id}`, { method: 'PATCH', body: { estado } });
    toast(r.mensaje);
    cargarAvisosCoord();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function eliminarAviso(id) {
  if (!confirm('¿Eliminar definitivamente este aviso? Si solo quieres retirarlo, usa "Archivar".')) return;
  try {
    const r = await api(`/avisos/${id}`, { method: 'DELETE' });
    toast(r.mensaje);
    if ($('aviso-id').value === String(id)) limpiarFormAviso();
    cargarAvisosCoord();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* =============================================================================
 * PERFIL "PERSONA" DEL TUTORADO
 *   Alumno: GET/PUT /api/perfil-tutorado/mio · Tutor/Coord: GET /api/perfil-tutorado/:id
 * ============================================================================= */
let personaActual = null;
let opcionesPerfil = { familia: ['Padre', 'Madre', 'Hermano(s)', 'Hermana(s)', 'Abuelo(s)', 'Pareja', 'Hijo(s)', 'Otros familiares'], tope_frase: 100, tope_elemento: 80, tope_lista: 6, tope_palabra: 25 };
let fotoPendiente; // undefined = sin cambios · null = quitar · dataURL = nueva

function personaCardHtml(p) {
  const nombre = `${p.nombre} ${p.apellidos}`;
  const foto = p.foto
    ? `<img src="${escapeHtml(p.foto)}" alt="Fotografía de ${escapeHtml(nombre)}" class="w-full h-full object-cover">`
    : `<span class="text-4xl font-extrabold text-tecnmGreen">${escapeHtml(iniciales(nombre))}</span>`;
  const dato = (etq, val) => `<div class="flex gap-2"><dt class="font-bold text-slate-700 w-24 shrink-0 text-right">${etq}:</dt><dd class="text-slate-600">${val ? escapeHtml(val) : '<span class="text-slate-300">—</span>'}</dd></div>`;
  const lista = (items, vacio) => items.length
    ? `<ul class="space-y-1.5">${items.map((x) => `<li class="flex gap-2"><i class="fa-solid fa-circle text-[6px] mt-1.5 text-slate-700"></i><span class="min-w-0" style="overflow-wrap:anywhere">${escapeHtml(x)}</span></li>`).join('')}</ul>`
    : `<p class="text-slate-400 italic">${vacio}</p>`;
  const sinDatos = !p.frase && !p.biografia && !p.objetivos.length && !p.frustraciones.length && !p.ciudad_natal;
  return `
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 rounded-2xl border-2 border-slate-300 bg-white text-xs">
    <div class="flex flex-col items-center">
      <div class="w-36 h-44 rounded-xl border-2 border-slate-400 bg-slate-100 overflow-hidden flex items-center justify-center">${foto}</div>
      <p class="font-extrabold text-slate-800 mt-3 text-center">${escapeHtml(nombre)}</p>
      <p class="text-[10px] text-slate-400">${escapeHtml(p.no_control)}</p>
      <dl class="mt-3 space-y-1 w-full">
        ${dato('Edad', p.edad !== null && p.edad !== undefined ? `${p.edad} años` : '')}
        ${dato('Educación', `Superior · ${p.carrera ? 'ISC' : ''} ${p.semestre}° sem.`)}
        ${dato('Ciudad natal', p.ciudad_natal)}
        ${dato('Familia', p.familia)}
        ${dato('Ocupación', p.ocupacion)}
      </dl>
    </div>
    <div class="md:col-span-2 flex flex-col gap-4">
      <p class="text-center text-base font-semibold italic text-slate-800" style="overflow-wrap:anywhere">${p.frase ? `“${escapeHtml(p.frase)}”` : '<span class="text-slate-300 not-italic text-xs">Sin frase personal</span>'}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><h4 class="text-sm font-extrabold text-slate-800 mb-2">Objetivos</h4>${lista(p.objetivos, 'Sin objetivos registrados')}</div>
        <div><h4 class="text-sm font-extrabold text-slate-800 mb-2">Frustraciones</h4>${lista(p.frustraciones, 'Sin frustraciones registradas')}</div>
      </div>
      <div class="p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 leading-relaxed" style="overflow-wrap:anywhere">${p.biografia ? escapeHtml(p.biografia) : '<span class="text-slate-400">Sin descripción.</span>'}</div>
      ${sinDatos ? '<p class="text-[11px] text-amber-700 font-semibold"><i class="fa-solid fa-circle-info mr-1"></i>Este perfil aún no tiene información personal.</p>' : ''}
      <p class="text-[10px] text-slate-400 text-right">Riesgo: ${escapeHtml(p.nivel_riesgo)} · Promedio ${num(p.promedio)} · Tutor(a): ${escapeHtml(p.tutor_nombre || 'sin elegir')}</p>
    </div>
  </div>`;
}

async function cargarPersonaAlumno() {
  const cont = $('persona-card');
  if (!cont) return;
  try {
    const { perfil, opciones } = await api('/perfil-tutorado/mio');
    personaActual = perfil;
    if (opciones) opcionesPerfil = opciones;
    cont.innerHTML = personaCardHtml(perfil);
    setText('perfil-telefono', perfil.telefono ? formatearTelefono(perfil.telefono) : 'No registrado');
  } catch (err) {
    cont.innerHTML = `<p class="text-xs text-rose-600 text-center py-6">${escapeHtml(err.message)}</p>`;
  }
}

function pintarPreviewFoto(src) {
  $('perfil-foto-preview').innerHTML = src
    ? `<img src="${escapeHtml(src)}" alt="Vista previa" class="w-full h-full object-cover">`
    : '<i class="fa-solid fa-user text-4xl"></i>';
}

/** Lista editable (objetivos / frustraciones): un renglón por elemento, con agregar y quitar. */
function listaEditableHtml(cont, items) {
  const tope = opcionesPerfil.tope_lista;
  const max = opcionesPerfil.tope_elemento;
  const nombre = cont.dataset.lista;
  const base = 'flex-1 min-w-0 p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-tecnmGreen outline-none bg-white';
  const filas = items.length ? items : [''];
  cont.innerHTML = `
    <ol class="space-y-2" data-filas>${filas.map((x, i) => `
      <li class="flex items-center gap-2">
        <span class="w-5 text-right font-bold text-slate-400 shrink-0">${i + 1}.</span>
        <input type="text" maxlength="${max}" value="${escapeHtml(x)}" placeholder="Escribe un${nombre === 'objetivo' ? ' objetivo' : 'a frustración'}" aria-label="${nombre} ${i + 1}" class="${base}">
        <button type="button" data-quitar class="w-8 h-8 shrink-0 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" aria-label="Quitar ${nombre} ${i + 1}" title="Quitar"><i class="fa-solid fa-xmark"></i></button>
      </li>`).join('')}
    </ol>
    <div class="flex items-center justify-between mt-3">
      <button type="button" data-agregar class="font-bold text-tecnmBlue hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed" ${filas.length >= tope ? 'disabled' : ''}>
        <i class="fa-solid fa-plus mr-1"></i>Agregar ${nombre}</button>
      <span class="text-[10px] text-slate-400">${filas.length} / ${tope} · máx. ${max} caracteres c/u</span>
    </div>`;
}

function leerListaEditable(cont) {
  return [...cont.querySelectorAll('[data-filas] input')].map((i) => i.value.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

function conectarListaEditable(cont) {
  if (cont.dataset.conectada) return;
  cont.dataset.conectada = '1';
  const valores = () => [...cont.querySelectorAll('[data-filas] input')].map((i) => i.value);
  const enfocarUltimo = () => { const ins = cont.querySelectorAll('[data-filas] input'); ins[ins.length - 1]?.focus(); };
  cont.addEventListener('click', (e) => {
    if (e.target.closest('[data-agregar]')) {
      const v = valores();
      if (v.length >= opcionesPerfil.tope_lista) return;
      listaEditableHtml(cont, [...v, '']);
      enfocarUltimo();
    } else if (e.target.closest('[data-quitar]')) {
      const fila = e.target.closest('li');
      const idx = [...fila.parentNode.children].indexOf(fila);
      const v = valores();
      v.splice(idx, 1);
      listaEditableHtml(cont, v);
    }
  });
  // Enter agrega un renglón nuevo en lugar de enviar el formulario
  cont.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    const v = valores();
    if (v.length < opcionesPerfil.tope_lista && e.target.value.trim()) {
      listaEditableHtml(cont, [...v, '']);
      enfocarUltimo();
    }
  });
}

function contadorCaracteres(idCampo, idCuenta) {
  const el = $(idCampo);
  const cuenta = $(idCuenta);
  const pintar = () => {
    const max = Number(el.getAttribute('maxlength'));
    cuenta.textContent = `${el.value.length} / ${max}`;
    cuenta.classList.toggle('text-amber-600', el.value.length >= max * 0.9);
  };
  if (!el.dataset.contador) {
    el.dataset.contador = '1';
    el.addEventListener('input', pintar);
  }
  pintar();
}

function revisarTelefonoPerfil({ obligatorio } = {}) {
  const r = validarTelefonoMx($('pf-telefono').value);
  const err = $('pf-telefono-error');
  const mensaje = r.error ? `Teléfono: ${r.error}.` : r.vacio && obligatorio ? 'Teléfono: es obligatorio porque forma parte de tu Ficha de Identificación.' : '';
  err.textContent = mensaje;
  err.classList.toggle('hidden', !mensaje);
  $('pf-telefono').classList.toggle('border-rose-400', Boolean(mensaje));
  return !mensaje;
}

function abrirEditorPerfil() {
  const p = personaActual || {};
  fotoPendiente = undefined;
  $('pf-nacimiento').value = p.fecha_nacimiento || '';
  $('pf-nacimiento').max = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  $('pf-ciudad-cont').innerHTML = lugarHtml('pf-ciudad', p.ciudad_natal || '');
  prepararLugares($('pf-ciudad-cont'));
  const fam = String(p.familia || '').split(',').map((x) => x.trim());
  $('pf-familia').innerHTML = opcionesPerfil.familia.map((o, i) => `
    <label class="ficha-opcion"><input type="checkbox" name="pf-familia" id="pf-familia-${i}" value="${escapeHtml(o)}" ${fam.includes(o) ? 'checked' : ''}><span>${escapeHtml(o)}</span></label>`).join('');
  $('pf-ocupacion').value = p.ocupacion || '';
  $('pf-telefono').value = formatearTelefono(p.telefono || '');
  revisarTelefonoPerfil();
  if (!$('pf-telefono').dataset.conectado) {
    $('pf-telefono').dataset.conectado = '1';
    $('pf-telefono').addEventListener('input', (e) => {
      let d = e.target.value.replace(/\D/g, '');
      if (d.length > 10 && d.startsWith('52')) d = d.slice(2);
      e.target.value = formatearTelefono(d.slice(0, 10));
    });
    $('pf-telefono').addEventListener('blur', () => revisarTelefonoPerfil({ obligatorio: personaActual?.tiene_ficha }));
  }
  $('pf-frase').maxLength = opcionesPerfil.tope_frase;
  $('pf-frase').value = (p.frase || '').slice(0, opcionesPerfil.tope_frase);
  $('pf-bio').value = p.biografia || '';
  contadorCaracteres('pf-frase', 'pf-frase-cuenta');
  contadorCaracteres('pf-bio', 'pf-bio-cuenta');
  ['pf-objetivos', 'pf-frustraciones'].forEach((id) => {
    listaEditableHtml($(id), id === 'pf-objetivos' ? (p.objetivos || []) : (p.frustraciones || []));
    conectarListaEditable($(id));
  });
  pintarPreviewFoto(p.foto);
  // La tarjeta y el editor no se muestran juntos
  $('persona-card').classList.add('hidden');
  $('btn-panel-perfil').classList.add('hidden');
  $('btn-panel-perfil').setAttribute('aria-expanded', 'true');
  $('panel-perfil-editar').classList.remove('hidden');
  $('tab-perfil').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cerrarEditorPerfil() {
  $('panel-perfil-editar').classList.add('hidden');
  $('persona-card').classList.remove('hidden');
  $('btn-panel-perfil').classList.remove('hidden');
  $('btn-panel-perfil').setAttribute('aria-expanded', 'false');
  $('tab-perfil').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Reduce la imagen en el navegador (máx. 360×450, JPEG) antes de enviarla. */
function leerFotoPerfil(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return toast('Usa una imagen JPG, PNG o WEBP.', 'error');
  const lector = new FileReader();
  lector.onload = () => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, 360 / img.width, 450 / img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      fotoPendiente = canvas.toDataURL('image/jpeg', 0.82);
      pintarPreviewFoto(fotoPendiente);
    };
    img.onerror = () => toast('No se pudo leer la imagen.', 'error');
    img.src = lector.result;
  };
  lector.readAsDataURL(archivo);
  e.target.value = '';
}

function quitarFotoPerfil() {
  fotoPendiente = null;
  pintarPreviewFoto(null);
}

async function guardarPerfilTutorado(event) {
  event.preventDefault();
  const conFicha = Boolean(personaActual?.tiene_ficha);
  const body = {
    fecha_nacimiento: $('pf-nacimiento').value || null,
    ciudad_natal: $('pf-ciudad')?.value || '',
    familia: [...document.querySelectorAll('input[name="pf-familia"]:checked')].map((i) => i.value),
    ocupacion: $('pf-ocupacion').value,
    telefono: $('pf-telefono').value.replace(/\D/g, ''),
    frase: $('pf-frase').value,
    objetivos: leerListaEditable($('pf-objetivos')),
    frustraciones: leerListaEditable($('pf-frustraciones')),
    biografia: $('pf-bio').value,
  };
  if (!revisarTelefonoPerfil({ obligatorio: conFicha })) return $('pf-telefono').focus();
  const tope = opcionesPerfil.tope_palabra || 25;
  const larga = (t) => String(t || '').split(/\s+/).some((w) => w.length > tope);
  if ([...body.objetivos, ...body.frustraciones].some(larga)) return toast(`Revisa tus objetivos y frustraciones: hay una palabra de más de ${tope} letras sin espacios.`, 'error');
  if (larga(body.frase)) return toast(`Revisa tu frase: hay una palabra de más de ${tope} letras sin espacios.`, 'error');
  if (conFicha && !body.fecha_nacimiento) return toast('La fecha de nacimiento es obligatoria porque forma parte de tu Ficha de Identificación.', 'error');
  if (conFicha && !body.ciudad_natal) return toast('Elige el estado y el municipio de tu ciudad natal.', 'error');
  if (!conFicha && $('pf-ciudad-estado')?.value && !body.ciudad_natal) return toast('Termina de elegir tu ciudad natal (estado y municipio).', 'error');
  if (fotoPendiente !== undefined) body.foto = fotoPendiente;
  await conBotonOcupado(event.target.querySelector('button[type="submit"]'), 'Guardando…', async () => {
    try {
      const r = await api('/perfil-tutorado/mio', { method: 'PUT', body });
      personaActual = r.perfil;
      $('persona-card').innerHTML = personaCardHtml(r.perfil);
      setText('perfil-telefono', r.perfil.telefono ? formatearTelefono(r.perfil.telefono) : 'No registrado');
      fotoPendiente = undefined;
      toast(r.mensaje);
      cerrarEditorPerfil();
      if ($('panel-ficha')) cargarFichaAlumno(); // la ficha comparte fecha, ciudad natal y teléfono
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/** Modal con el perfil del tutorado (vista del tutor y de la coordinación). */
async function mostrarPerfilTutorado(tutoradoId) {
  let modal = $('modal-perfil-tutorado');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-perfil-tutorado';
    modal.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `<div class="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-sm font-bold text-slate-800">Perfil del Tutorado</h3>
          <button type="button" onclick="cerrarModal('modal-perfil-tutorado')" class="text-slate-400 hover:text-slate-600" aria-label="Cerrar"><i class="fa-solid fa-xmark text-lg"></i></button>
        </div>
        <div id="modal-perfil-cuerpo"></div>
      </div>`;
    modal.addEventListener('click', (e) => { if (e.target === modal) cerrarModal('modal-perfil-tutorado'); });
    document.body.appendChild(modal);
  }
  $('modal-perfil-cuerpo').innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Cargando…</p>';
  modal.classList.remove('hidden');
  try {
    const { perfil } = await api(`/perfil-tutorado/${tutoradoId}`);
    $('modal-perfil-cuerpo').innerHTML = personaCardHtml(perfil) +
      `<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-xs">
        <div class="p-3 bg-slate-50 rounded-lg"><span class="text-slate-400 block">Correo</span><strong>${escapeHtml(perfil.correo)}</strong></div>
        <div class="p-3 bg-slate-50 rounded-lg"><span class="text-slate-400 block">Teléfono</span><strong>${escapeHtml(perfil.telefono || 'No registrado')}</strong></div>
        <div class="p-3 bg-slate-50 rounded-lg"><span class="text-slate-400 block">Avance reticular</span><strong>${num(perfil.avance_reticular_pct)}% · ${perfil.materias_reprobadas} reprobada(s)</strong></div>
      </div>`;
  } catch (err) {
    $('modal-perfil-cuerpo').innerHTML = `<p class="text-xs text-rose-600 text-center py-8">${escapeHtml(err.message)}</p>`;
  }
}

/* =============================================================================
 * TUTORES: directorio, elección, horario y disponibilidad
 * ============================================================================= */
const DIAS_CORTOS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

function horarioResumenHtml(horarios) {
  if (!horarios.length) return '<p class="text-slate-400 italic">Sin horario publicado</p>';
  return `<div class="space-y-1">${[1, 2, 3, 4, 5].map((d) => {
    const del = horarios.filter((h) => h.dia_semana === d);
    return `<div class="flex gap-2"><span class="w-9 font-bold text-slate-500">${DIAS_CORTOS[d]}</span><span class="${del.length ? 'text-slate-700' : 'text-slate-300'}">${del.length ? del.map((h) => `${h.hora_inicio}–${h.hora_fin}`).join(', ') : '—'}</span></div>`;
  }).join('')}</div>`;
}

function tarjetaTutorHtml(t, { conBoton = true } = {}) {
  const pct = t.max_tutorados ? Math.min(100, Math.round((t.tutorados / t.max_tutorados) * 100)) : 100;
  let boton = '';
  if (conBoton) {
    if (t.es_mi_tutor) boton = '<span class="block text-center bg-emerald-100 text-emerald-800 font-bold py-2 rounded-lg"><i class="fa-solid fa-circle-check mr-1"></i>Es tu tutor(a)</span>';
    else if (!t.acepta_tutorados) boton = '<span class="block text-center bg-slate-100 text-slate-500 font-bold py-2 rounded-lg">No recibe tutorados</span>';
    else if (!t.lugares_disponibles) boton = '<span class="block text-center bg-slate-100 text-slate-500 font-bold py-2 rounded-lg">Sin lugares disponibles</span>';
    else boton = `<button onclick='elegirTutor(${t.tutor_id}, ${escapeHtml(JSON.stringify(t.nombre))})' class="w-full bg-tecnmGreen hover:bg-tecnmDark text-white font-bold py-2 rounded-lg transition"><i class="fa-solid fa-user-check mr-1"></i>Elegir como mi tutor(a)</button>`;
  }
  return `<div class="p-4 rounded-2xl border ${t.es_mi_tutor ? 'border-tecnmGreen ring-2 ring-emerald-100' : 'border-slate-200'} bg-slate-50 flex flex-col gap-3 text-xs">
    <div class="flex items-center gap-3">
      ${avatarTutor(t, 'w-14 h-14')}
      <div>
        <h4 class="font-bold text-slate-800">${escapeHtml(t.nombre)}</h4>
        <p class="text-[10px] text-slate-500">${escapeHtml(t.cubiculo || 'Depto. de Sistemas')} · ${escapeHtml(t.correo)}</p>
        ${t.formacion_tutorial ? chip(t.formacion_tutorial, /Diplomado/i.test(t.formacion_tutorial) ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800') : ''}
      </div>
    </div>
    <p class="text-slate-600 leading-relaxed">${t.presentacion ? escapeHtml(t.presentacion) : '<span class="text-slate-400 italic">Sin presentación.</span>'}</p>
    <div class="flex flex-wrap gap-1">${(t.areas_apoyo || []).map((a) => chip(a, 'bg-sky-100 text-sky-800')).join('')}</div>
    <div class="p-2.5 bg-white rounded-xl border border-slate-200">
      <p class="text-[10px] font-extrabold uppercase text-slate-500 mb-1"><i class="fa-regular fa-clock mr-1"></i>Horario de atención</p>
      ${horarioResumenHtml(t.horarios)}
    </div>
    <div>
      <div class="flex justify-between text-[10px] font-semibold text-slate-500 mb-1"><span>${t.tutorados} de ${t.max_tutorados} lugares ocupados</span><span class="${t.lugares_disponibles ? 'text-emerald-700' : 'text-rose-600'}">${t.lugares_disponibles} disponibles</span></div>
      <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden"><div class="${pct >= 100 ? 'bg-rose-500' : 'bg-tecnmGreen'} h-full" style="width:${pct}%"></div></div>
    </div>
    <div class="mt-auto space-y-2">
      ${conBoton ? `<button onclick="verPerfilTutor(${t.tutor_id})" class="w-full bg-white border border-slate-300 hover:border-tecnmGreen text-slate-700 font-bold py-2 rounded-lg transition"><i class="fa-solid fa-id-card mr-1"></i>Ver perfil completo</button>` : ''}
      ${boton}
    </div>
  </div>`;
}

function avatarTutor(t, tam = 'w-14 h-14') {
  return t.foto
    ? `<img src="${escapeHtml(t.foto)}" alt="Foto de ${escapeHtml(t.nombre)}" class="${tam} rounded-full object-cover border-2 border-white shadow">`
    : `<div class="${tam} rounded-full bg-tecnmGreen text-white flex items-center justify-center font-bold shrink-0">${escapeHtml(iniciales(t.nombre))}</div>`;
}

/** Cuadrícula semanal (Lun–Vie) con los bloques de atención del tutor. */
function horarioSemanaHtml(horarios) {
  if (!horarios.length) return '<p class="text-slate-400 italic text-xs">Este tutor aún no publica su horario de atención.</p>';
  const aMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const ini = Math.floor(Math.min(...horarios.map((h) => aMin(h.hora_inicio))) / 60);
  const fin = Math.ceil(Math.max(...horarios.map((h) => aMin(h.hora_fin))) / 60);
  const filas = [];
  for (let hora = ini; hora < fin; hora += 1) {
    const celdas = [1, 2, 3, 4, 5].map((d) => {
      const activo = horarios.some((h) => h.dia_semana === d && aMin(h.hora_inicio) < (hora + 1) * 60 && aMin(h.hora_fin) > hora * 60);
      return `<td class="p-0.5"><div class="h-6 rounded ${activo ? 'bg-tecnmGreen' : 'bg-slate-100'}" title="${activo ? 'Atiende' : 'Sin atención'}"></div></td>`;
    }).join('');
    filas.push(`<tr><th scope="row" class="pr-2 text-right text-[10px] font-semibold text-slate-400 whitespace-nowrap">${String(hora).padStart(2, '0')}:00</th>${celdas}</tr>`);
  }
  const total = horarios.reduce((sum, h) => sum + Math.floor((aMin(h.hora_fin) - aMin(h.hora_inicio)) / 60), 0);
  return `<table class="sin-tarjetas w-full table-fixed text-xs" aria-label="Horario semanal de atención">
      <thead><tr><th class="w-12"></th>${DIAS_CORTOS.slice(1).map((d) => `<th class="text-[10px] font-extrabold text-slate-600 pb-1">${d}</th>`).join('')}</tr></thead>
      <tbody>${filas.join('')}</tbody>
    </table>
    <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
      <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-tecnmGreen"></span>Atiende tutorados</span>
      <span>${total} cita(s) de 60 min por semana</span>
    </div>
    <div class="mt-2">${horarioResumenHtml(horarios)}</div>`;
}

/** Tarjeta tipo "persona" del tutor (perfil completo). */
function tutorPersonaHtml(t) {
  const foto = t.foto
    ? `<img src="${escapeHtml(t.foto)}" alt="Fotografía de ${escapeHtml(t.nombre)}" class="w-full h-full object-cover">`
    : `<span class="text-4xl font-extrabold text-tecnmGreen">${escapeHtml(iniciales(t.nombre))}</span>`;
  const dato = (etq, val) => `<div class="flex gap-2"><dt class="font-bold text-slate-700 w-24 shrink-0 text-right">${etq}:</dt><dd class="text-slate-600">${val ? escapeHtml(val) : '<span class="text-slate-300">—</span>'}</dd></div>`;
  const lista = (items) => items.length
    ? `<ul class="space-y-1.5">${items.map((x) => `<li class="flex gap-2"><i class="fa-solid fa-circle-check mt-0.5 text-tecnmGreen"></i><span>${escapeHtml(x)}</span></li>`).join('')}</ul>`
    : '<p class="text-slate-400 italic">Sin registrar</p>';
  return `
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 rounded-2xl border-2 border-slate-300 bg-white text-xs">
    <div class="flex flex-col items-center">
      <div class="w-36 h-44 rounded-xl border-2 border-slate-400 bg-slate-100 overflow-hidden flex items-center justify-center">${foto}</div>
      <p class="font-extrabold text-slate-800 mt-3 text-center">${escapeHtml(t.nombre)}</p>
      <p class="text-[10px] text-slate-400">${escapeHtml(t.correo || '')}</p>
      ${t.formacion_tutorial ? `<div class="mt-1">${chip(t.formacion_tutorial, /Diplomado/i.test(t.formacion_tutorial) ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}</div>` : ''}
      <dl class="mt-3 space-y-1 w-full">
        ${dato('Grado', t.grado_academico)}
        ${dato('Especialidad', t.especialidad)}
        ${dato('Experiencia', t.anios_experiencia !== null && t.anios_experiencia !== undefined ? `${t.anios_experiencia} años` : '')}
        ${dato('Departamento', t.departamento)}
        ${dato('Cubículo', t.cubiculo)}
      </dl>
    </div>
    <div class="md:col-span-2 flex flex-col gap-4">
      <p class="text-center text-base font-semibold italic text-slate-800" style="overflow-wrap:anywhere">${t.frase ? `“${escapeHtml(t.frase)}”` : '<span class="text-slate-300 not-italic text-xs">Sin frase personal</span>'}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><h4 class="text-sm font-extrabold text-slate-800 mb-2">¿En qué puedo apoyarte?</h4>${lista(t.enfoque || [])}</div>
        <div><h4 class="text-sm font-extrabold text-slate-800 mb-2">Áreas de apoyo</h4>
          <div class="flex flex-wrap gap-1">${(t.areas_apoyo || []).map((a) => chip(a, 'bg-sky-100 text-sky-800')).join('') || '<p class="text-slate-400 italic">Sin registrar</p>'}</div>
          <p class="text-[10px] text-slate-500 mt-3">${t.tutorados} de ${t.max_tutorados} lugares ocupados · <strong class="${t.lugares_disponibles ? 'text-emerald-700' : 'text-rose-600'}">${t.lugares_disponibles} disponibles</strong>${t.acepta_tutorados ? '' : ' · <span class="text-rose-600 font-bold">no recibe tutorados</span>'}</p>
        </div>
      </div>
      <div class="p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 leading-relaxed">${t.presentacion ? escapeHtml(t.presentacion) : '<span class="text-slate-400">Sin presentación.</span>'}</div>
      <div class="p-3 rounded-xl border border-slate-200">
        <h4 class="text-sm font-extrabold text-slate-800 mb-2"><i class="fa-regular fa-clock mr-1"></i>Bloques de horario para atender tutorados</h4>
        ${horarioSemanaHtml(t.horarios || [])}
      </div>
    </div>
  </div>`;
}

function modalSimple(id, titulo, html) {
  let modal = $(id);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = id;
    modal.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `<div class="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-sm font-bold text-slate-800" data-titulo></h3>
          <button type="button" onclick="cerrarModal('${id}')" class="text-slate-400 hover:text-slate-600" aria-label="Cerrar"><i class="fa-solid fa-xmark text-lg"></i></button>
        </div>
        <div data-cuerpo></div>
      </div>`;
    modal.addEventListener('click', (e) => { if (e.target === modal) cerrarModal(id); });
    document.body.appendChild(modal);
  }
  modal.querySelector('[data-titulo]').textContent = titulo;
  modal.querySelector('[data-cuerpo]').innerHTML = html;
  modal.classList.remove('hidden');
  return modal;
}

/** Perfil completo de un tutor (alumno desde el directorio; coordinación desde Tutores). */
async function verPerfilTutor(tutorId) {
  if (!directorioTutores.length) {
    try { directorioTutores = (await api('/tutores/disponibles')).tutores; } catch (err) { return toast(err.message, 'error'); }
  }
  const t = directorioTutores.find((x) => x.tutor_id === tutorId);
  if (!t) return toast('Tutor no encontrado.', 'error');
  let pie = '';
  if (PAGINA === 'alumno') {
    pie = t.es_mi_tutor
      ? '<p class="mt-4 text-center text-xs font-bold text-tecnmGreen"><i class="fa-solid fa-circle-check mr-1"></i>Es tu tutor(a)</p>'
      : t.disponible
        ? `<button onclick='cerrarModal("modal-perfil-tutor"); elegirTutor(${t.tutor_id}, ${escapeHtml(JSON.stringify(t.nombre))})' class="mt-4 w-full bg-tecnmGreen hover:bg-tecnmDark text-white font-bold py-2.5 rounded-xl text-xs"><i class="fa-solid fa-user-check mr-1"></i>Elegir como mi tutor(a)</button>`
        : '<p class="mt-4 text-center text-xs font-bold text-slate-500">Este tutor no tiene lugares disponibles.</p>';
  }
  modalSimple('modal-perfil-tutor', 'Perfil del Tutor', tutorPersonaHtml(t) + pie);
}

let directorioTutores = [];

async function cargarDirectorioTutores() {
  const cont = $('lista-tutores');
  if (!cont) return;
  try {
    const { tutores } = await api('/tutores/disponibles');
    directorioTutores = tutores;
    const mio = tutores.find((t) => t.es_mi_tutor);
    $('tutores-mi-tutor').innerHTML = mio
      ? `<div class="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold"><i class="fa-solid fa-circle-check mr-1"></i> Tu tutor(a) actual es <strong>${escapeHtml(mio.nombre)}</strong>. Puedes cambiarlo eligiendo a otro docente.</div>`
      : '<div class="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold"><i class="fa-solid fa-hand-pointer mr-1"></i> Aún no eliges tutor. Elige al que mejor se adapte a tus necesidades y horario.</div>';
    cont.innerHTML = tutores.length ? tutores.map((t) => tarjetaTutorHtml(t)).join('')
      : '<p class="text-xs text-slate-400 text-center py-8 col-span-full">No hay tutores registrados.</p>';
    pintarHorarioTutorEnCita();
  } catch (err) {
    cont.innerHTML = `<p class="text-xs text-rose-600 text-center py-8 col-span-full">${escapeHtml(err.message)}</p>`;
  }
}

async function elegirTutor(tutorId, nombre) {
  const actual = directorioTutores.find((t) => t.es_mi_tutor);
  const texto = actual
    ? `¿Cambiar a tu tutor(a) ${actual.nombre} por ${nombre}?`
    : `¿Elegir a ${nombre} como tu tutor(a) para este periodo?`;
  if (!confirm(texto)) return;
  try {
    const r = await api('/tutores/elegir', { method: 'POST', body: { tutor_id: tutorId } });
    toast(r.mensaje);
    await Promise.all([cargarDirectorioTutores(), cargarPerfilAlumno(), cargarPersonaAlumno(), cargarEvaluacionAlumno()]);
    $('cita-horario').innerHTML = '<option value="">Primero elige una fecha</option>';
  } catch (err) {
    toast(err.message, 'error');
  }
}

function pintarHorarioTutorEnCita() {
  const caja = $('cita-horario-tutor');
  if (!caja) return;
  const mio = directorioTutores.find((t) => t.es_mi_tutor);
  caja.classList.toggle('hidden', !mio);
  if (mio) {
    caja.innerHTML = `<p class="font-bold text-slate-700 mb-1"><i class="fa-regular fa-clock mr-1"></i>Horario de atención de ${escapeHtml(mio.nombre)}</p>${horarioResumenHtml(mio.horarios)}`;
  }
}

/** Al elegir fecha, carga los bloques libres del tutor para ese día. */
async function cargarHorariosCita() {
  const sel = $('cita-horario');
  const fecha = $('cita-fecha').value;
  const ayuda = $('cita-horario-ayuda');
  const tutorId = window.PIT_MI_TUTOR;
  if (!fecha || !tutorId) {
    sel.innerHTML = `<option value="">${tutorId ? 'Primero elige una fecha' : 'Primero elige a tu tutor'}</option>`;
    return;
  }
  sel.innerHTML = '<option value="">Cargando horarios…</option>';
  try {
    const r = await api(`/tutores/${tutorId}/disponibilidad`, { query: { fecha } });
    if (r.sin_clases) {
      sel.innerHTML = '<option value="">Ese día no hay clases</option>';
      ayuda.textContent = r.motivo;
      return;
    }
    if (!r.tiene_horario) {
      // Tutor sin horario publicado: se ofrecen bloques generales
      sel.innerHTML = ['10:00', '11:00', '13:00', '16:00'].map((h) => `<option value="${h}">${h} h</option>`).join('');
      ayuda.textContent = 'Tu tutor aún no publica horario; confirma por correo que puede atenderte.';
      return;
    }
    const libres = r.bloques.filter((b) => b.disponible);
    if (!r.bloques.length) {
      sel.innerHTML = '<option value="">Tu tutor no atiende ese día</option>';
      ayuda.textContent = 'Elige otro día según el horario de atención.';
      return;
    }
    sel.innerHTML = (libres.length ? '<option value="">Elige un horario</option>' : '<option value="">Sin horarios libres ese día</option>') +
      r.bloques.map((b) => `<option value="${b.hora}" ${b.disponible ? '' : 'disabled'}>${b.hora} – ${String(Number(b.hora.slice(0, 2)) + 1).padStart(2, '0')}:00${b.disponible ? '' : b.motivo === 'ocupado' ? ' (ocupado)' : ' (no disponible)'}</option>`).join('');
    ayuda.textContent = `${libres.length} horario(s) libre(s) ese día.`;
  } catch (err) {
    sel.innerHTML = '<option value="">No se pudo cargar</option>';
    ayuda.textContent = err.message;
  }
}

/* ---- Tutor: mi perfil y horario ------------------------------------------ */
function filaBloqueHorario(b = { dia_semana: 1, hora_inicio: '10:00', hora_fin: '12:00' }) {
  const div = document.createElement('div');
  div.className = 'flex flex-wrap items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200';
  div.dataset.bloque = '1';
  div.innerHTML = `
    <select class="b-dia p-2 rounded-lg border border-slate-300 bg-white" aria-label="Día">
      ${[1, 2, 3, 4, 5].map((d) => `<option value="${d}" ${b.dia_semana === d ? 'selected' : ''}>${['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'][d]}</option>`).join('')}
    </select>
    <input type="time" class="b-ini p-2 rounded-lg border border-slate-300" min="07:00" max="20:00" step="1800" value="${b.hora_inicio}" aria-label="Hora de inicio">
    <span class="text-slate-400">a</span>
    <input type="time" class="b-fin p-2 rounded-lg border border-slate-300" min="07:00" max="20:00" step="1800" value="${b.hora_fin}" aria-label="Hora de fin">
    <button type="button" class="ml-auto text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg" aria-label="Eliminar bloque"><i class="fa-solid fa-trash"></i></button>`;
  div.querySelector('button').addEventListener('click', () => div.remove());
  return div;
}

function agregarBloqueHorario() {
  $('horario-bloques').appendChild(filaBloqueHorario());
}

let perfilTutorActual = null;
let fotoTutorPendiente; // undefined = sin cambios · null = quitar · dataURL = nueva

async function cargarMiPerfilTutor() {
  if (!$('form-miperfil')) return;
  try {
    const { tutor } = await api('/tutores/mi-perfil');
    perfilTutorActual = tutor;
    $('tutor-persona-card').innerHTML = tutorPersonaHtml(tutor);
    const cont = $('horario-bloques');
    cont.innerHTML = '';
    tutor.horarios.forEach((h) => cont.appendChild(filaBloqueHorario(h)));
  } catch (err) {
    toast(err.message, 'error');
  }
}

function pintarPreviewFotoTutor(src) {
  $('tutor-foto-preview').innerHTML = src
    ? `<img src="${escapeHtml(src)}" alt="Vista previa" class="w-full h-full object-cover">`
    : '<i class="fa-solid fa-user-tie text-4xl"></i>';
}

function abrirEditorPerfilTutor() {
  const t = perfilTutorActual || {};
  fotoTutorPendiente = undefined;
  $('mp-grado').value = t.grado_academico || '';
  $('mp-especialidad').value = t.especialidad || '';
  $('mp-anios').value = t.anios_experiencia ?? '';
  $('mp-frase').value = t.frase || '';
  $('mp-presentacion').value = t.presentacion || '';
  $('mp-enfoque').value = (t.enfoque || []).join('\n');
  $('mp-areas').value = (t.areas_apoyo || []).join(', ');
  const cont = $('horario-bloques');
  cont.innerHTML = '';
  (t.horarios || []).forEach((h) => cont.appendChild(filaBloqueHorario(h)));
  pintarPreviewFotoTutor(t.foto);
  abrirPanel('panel-tutor-editar');
}

/** Reduce una imagen a máx. 360×450 JPEG y devuelve el data URL. */
function reducirImagen(archivo) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return reject(new Error('Usa una imagen JPG, PNG o WEBP.'));
    const lector = new FileReader();
    lector.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, 360 / img.width, 450 / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

async function leerFotoTutor(e) {
  const archivo = e.target.files[0];
  e.target.value = '';
  if (!archivo) return;
  try {
    fotoTutorPendiente = await reducirImagen(archivo);
    pintarPreviewFotoTutor(fotoTutorPendiente);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function quitarFotoTutor() {
  fotoTutorPendiente = null;
  pintarPreviewFotoTutor(null);
}

async function guardarPerfilTutor(event) {
  event.preventDefault();
  const horarios = [...$('horario-bloques').querySelectorAll('[data-bloque]')].map((d) => ({
    dia_semana: Number(d.querySelector('.b-dia').value),
    hora_inicio: d.querySelector('.b-ini').value,
    hora_fin: d.querySelector('.b-fin').value,
  }));
  const enfoque = $('mp-enfoque').value.split('\n').map((x) => x.trim()).filter(Boolean);
  if (enfoque.length > 6) return toast('Máximo 6 elementos en "¿En qué puedo apoyarte?".', 'error');
  const body = {
    presentacion: $('mp-presentacion').value.trim(),
    areas_apoyo: $('mp-areas').value.split(',').map((a) => a.trim()).filter(Boolean),
    grado_academico: $('mp-grado').value,
    especialidad: $('mp-especialidad').value,
    anios_experiencia: $('mp-anios').value === '' ? null : Number($('mp-anios').value),
    frase: $('mp-frase').value,
    enfoque,
    horarios,
  };
  if (fotoTutorPendiente !== undefined) body.foto = fotoTutorPendiente;
  await conBotonOcupado(event.target.querySelector('button[type="submit"]'), 'Guardando…', async () => {
    try {
      const r = await api('/tutores/mi-perfil', { method: 'PUT', body });
      toast(r.mensaje);
      perfilTutorActual = r.tutor;
      fotoTutorPendiente = undefined;
      $('tutor-persona-card').innerHTML = tutorPersonaHtml(r.tutor);
      cerrarPanel('panel-tutor-editar');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* =============================================================================
 * COORDINACIÓN: supervisión de tutores y de la elección de tutor
 * ============================================================================= */
let datosAsig = null;

async function cargarAsignaciones() {
  const tbody = $('tbody-asig-tutores');
  if (!tbody) return;
  mostrarEstadoTabla(tbody, 7, 'Cargando…');
  try {
    datosAsig = await api('/asignaciones');
    directorioTutores = []; // se recarga al abrir un perfil, con los cambios de cupo
    const { tutores, sin_tutor: sinTutor, periodo } = datosAsig;
    setText('asig-periodo', periodo);
    $('asig-alerta').classList.toggle('hidden', sinTutor === 0);
    setText('asig-alerta-texto', `${sinTutor} tutorado(s) aún no eligen tutor en ${periodo}.`);

    tbody.innerHTML = tutores.map((t) => {
      const pct = t.max_tutorados ? Math.round((t.total_tutorados / t.max_tutorados) * 100) : 0;
      return `<tr class="hover:bg-slate-50">
        <td class="p-3 font-bold text-slate-800">${escapeHtml(t.nombre)}<div class="text-[10px] text-slate-400 font-medium">${escapeHtml(t.rfc)} · ${escapeHtml(t.cubiculo || '')}</div></td>
        <td class="p-3">${t.formacion_tutorial ? chip(t.formacion_tutorial, /Diplomado/i.test(t.formacion_tutorial) ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800') : '—'}</td>
        <td class="p-3 text-center">${t.bloques_horario ? `${t.bloques_horario} bloque(s)` : '<span class="text-amber-700 font-bold">Sin publicar</span>'}</td>
        <td class="p-3 text-center">
          <span class="font-bold ${pct >= 100 ? 'text-rose-600' : 'text-tecnmGreen'}">${t.total_tutorados}</span>
          <div class="w-16 mx-auto bg-slate-100 h-1.5 rounded-full mt-1 overflow-hidden"><div class="${pct >= 90 ? 'bg-rose-500' : 'bg-tecnmGreen'} h-full" style="width:${Math.min(pct, 100)}%"></div></div>
        </td>
        <td class="p-3 text-center whitespace-nowrap">
          <input type="number" id="cupo-${t.tutor_id}" min="${Math.max(1, t.total_tutorados)}" max="60" value="${t.max_tutorados}" aria-label="Cupo de ${escapeHtml(t.nombre)}" class="w-16 p-1.5 rounded-lg border border-slate-300 text-center">
          <button onclick="guardarCupoTutor(${t.tutor_id})" class="ml-1 bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded-lg text-[11px] font-bold" title="Guardar cupo"><i class="fa-solid fa-floppy-disk"></i></button>
        </td>
        <td class="p-3 text-center">
          <label class="inline-flex items-center gap-1.5 cursor-pointer font-semibold ${t.acepta_tutorados ? 'text-emerald-700' : 'text-slate-500'}">
            <input type="checkbox" ${t.acepta_tutorados ? 'checked' : ''} onchange="cambiarAceptaTutor(${t.tutor_id}, this.checked)"> ${t.acepta_tutorados ? 'Sí' : 'No'}
          </label>
        </td>
        <td class="p-3 text-center whitespace-nowrap">
          <button onclick="verPerfilTutor(${t.tutor_id})" class="bg-sky-50 text-sky-800 hover:bg-sky-100 px-2.5 py-1 rounded-lg text-[11px] font-bold"><i class="fa-solid fa-id-card mr-1"></i>Perfil</button>
          <button onclick="verTutoradosDe(${t.tutor_id})" class="bg-tecnmGreen text-white px-2.5 py-1 rounded-lg text-[11px] font-bold hover:bg-tecnmDark"><i class="fa-solid fa-users mr-1"></i>Tutorados</button>
        </td>
      </tr>`;
    }).join('');

    const sel = $('asig-ver-grupo');
    const previo = sel.value;
    sel.innerHTML = '<option value="__sin">Aún sin tutor</option><option value="">Todos los tutorados</option>' +
      tutores.map((t) => `<option value="t${t.tutor_id}">Tutorados de ${escapeHtml(t.nombre)}</option>`).join('');
    sel.value = previo && [...sel.options].some((o) => o.value === previo) ? previo : (sinTutor ? '__sin' : '');
    if (!sel.dataset.listo) {
      sel.addEventListener('change', pintarIntegrantes);
      sel.dataset.listo = '1';
    }
    pintarIntegrantes();
  } catch (err) {
    mostrarEstadoTabla(tbody, 7, err.message, 'error');
  }
}

function verTutoradosDe(tutorId) {
  $('asig-ver-grupo').value = `t${tutorId}`;
  pintarIntegrantes();
  $('tbody-asig-integrantes').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function pintarIntegrantes() {
  const tbody = $('tbody-asig-integrantes');
  const filtro = $('asig-ver-grupo').value;
  const lista = datosAsig.tutorados.filter((t) =>
    filtro === '__sin' ? !t.asignacion_id : filtro ? `t${t.tutor_id}` === filtro : true);
  tbody.innerHTML = lista.length
    ? lista.map((t) => `<tr class="hover:bg-slate-50">
        <td class="p-3 font-bold text-slate-800">${escapeHtml(t.no_control)}</td>
        <td class="p-3 font-semibold text-slate-800">${escapeHtml(t.nombre_completo)}</td>
        <td class="p-3">${t.semestre}°</td>
        <td class="p-3">${badgeRiesgo(t.nivel_riesgo)}</td>
        <td class="p-3 text-slate-600">${t.tutor_nombre ? escapeHtml(t.tutor_nombre) : '<span class="text-amber-700 font-bold">Sin elegir</span>'}
          ${t.origen ? `<div class="text-[10px] text-slate-400">${escapeHtml(t.origen)}</div>` : ''}</td>
        <td class="p-3 text-slate-500">${t.fecha_asignacion ? fmtFecha(t.fecha_asignacion) : '—'}</td>
        <td class="p-3 text-center whitespace-nowrap">
          <button onclick="mostrarPerfilTutorado(${t.tutorado_id})" class="bg-sky-50 text-sky-800 hover:bg-sky-100 px-2.5 py-1 rounded-lg text-[11px] font-bold"><i class="fa-solid fa-id-badge mr-1"></i>Perfil</button>
          ${t.asignacion_id ? `<button onclick='quitarDeGrupo(${t.asignacion_id}, ${escapeHtml(JSON.stringify(t.nombre_completo))})' class="bg-rose-50 hover:bg-rose-100 text-rose-700 px-2.5 py-1 rounded-lg text-[11px] font-bold"><i class="fa-solid fa-user-minus mr-1"></i>Retirar</button>` : ''}
        </td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="p-6 text-center text-slate-400">Sin tutorados en esta vista.</td></tr>';
}

async function guardarCupoTutor(tutorId) {
  const valor = Number($(`cupo-${tutorId}`).value);
  try {
    const r = await api(`/tutores/${tutorId}`, { method: 'PATCH', body: { max_tutorados: valor } });
    toast(r.mensaje);
    cargarAsignaciones();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function cambiarAceptaTutor(tutorId, acepta) {
  try {
    await api(`/tutores/${tutorId}`, { method: 'PATCH', body: { acepta_tutorados: acepta } });
    toast(acepta ? 'El tutor vuelve a aparecer disponible para los tutorados.' : 'El tutor ya no recibirá nuevos tutorados.');
    cargarAsignaciones();
  } catch (err) {
    toast(err.message, 'error');
    cargarAsignaciones();
  }
}

async function quitarDeGrupo(asignacionId, nombre) {
  if (!confirm(`¿Retirar a ${nombre} de su tutor? Tendrá que elegir uno nuevo desde su portal.`)) return;
  try {
    const r = await api(`/asignaciones/${asignacionId}/finalizar`, { method: 'PATCH' });
    toast('Tutorado retirado. Deberá elegir un nuevo tutor desde su portal.');
    await Promise.all([cargarAsignaciones(), cargarMetricasDashboard(), poblarTablaRiesgo($('filter-riesgo')?.value || 'TODOS')]);
    return r;
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* =============================================================================
 * VISTA: COORDINACIÓN
 * ============================================================================= */
function iniciarCoordinacion() {
  if (!requiereSesion('coordinador')) return;
  pintarEncabezadoUsuario();
  conectarModales();
  conectarFiltrosRiesgo();
  // Botones del prototipo original
  window.canalizarDirecto = (nombre, area, id) => abrirModalCanalizacion(nombre, area, id);

  cargarMetricasDashboard();
  poblarTablaRiesgo('TODOS');
  cargarTablaCanalizaciones();
  cargarResumenEvaluaciones();
  cargarAsignaciones();
  cargarAvisosCoord();
  cargarFichasCoord();
  conectarFiltrosFichas();
  $('aviso-filtro')?.addEventListener('change', cargarAvisosCoord);
}

/* =============================================================================
 * FICHA DE IDENTIFICACIÓN DEL TUTORADO (ANEXO 6)
 *  - Alumno: Formatos PIT → la llena / actualiza (PUT /api/fichas/mia)
 *  - Coordinación: pestaña Fichas → consulta, corrige, captura, revisa, imprime, exporta
 *  El formulario se genera con la definición de campos que envía la API.
 * ============================================================================= */
const FICHA = { secciones: [], alumno: null, ficha: null, prellenado: {}, historial: [], tutoradoId: null };
const FICHA_LISTA = { filas: [], temporizador: null };

const ESTILO_FICHA = {
  Pendiente: { chip: 'bg-slate-200 text-slate-600', icono: 'fa-hourglass-start', texto: 'Pendiente' },
  Enviada: { chip: 'bg-sky-100 text-sky-800', icono: 'fa-paper-plane', texto: 'Enviada' },
  Revisada: { chip: 'bg-emerald-100 text-emerald-800', icono: 'fa-circle-check', texto: 'Revisada' },
  'Requiere corrección': { chip: 'bg-amber-100 text-amber-800', icono: 'fa-pen', texto: 'Requiere corrección' },
};

function chipFicha(estado, extra = '') {
  const e = ESTILO_FICHA[estado] || ESTILO_FICHA.Pendiente;
  return `<span class="inline-flex items-center gap-1 ${e.chip} text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${extra}"><i class="fa-solid ${e.icono}"></i>${escapeHtml(e.texto)}</span>`;
}

const ANCHO_FICHA = { completo: 'md:col-span-6', medio: 'md:col-span-3', tercio: 'md:col-span-2' };
const camposFicha = () => FICHA.secciones.flatMap((s) => s.campos);

/** HTML de un campo según su tipo. */
/** dd/mm/aaaa a partir de 'AAAA-MM-DD' */
function fechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

/** Misma regla que el servidor: 10 dígitos de México, sin iniciar con 0/1, sin repetidos ni secuencias. */
function validarTelefonoMx(texto) {
  let d = String(texto || '').replace(/\D/g, '');
  if (!d) return { vacio: true };
  if (d.length === 12 && d.startsWith('52')) d = d.slice(2);
  if (d.length !== 10) return { error: `debe tener exactamente 10 dígitos (llevas ${d.length})` };
  if (/^[01]/.test(d)) return { error: 'la lada no puede iniciar con 0 ni con 1' };
  if (/^(\d)\1{9}$/.test(d)) return { error: 'número no válido (todos los dígitos son iguales)' };
  if ('01234567890123456789'.includes(d) || '98765432109876543210'.includes(d)) return { error: 'número no válido (secuencia)' };
  if (/(\d)\1{6,}/.test(d)) return { error: 'número no válido (demasiados dígitos repetidos)' };
  return { valor: d };
}

/** 2291234567 → "229 123 4567" (solo para mostrar). */
function formatearTelefono(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(' ');
}

/** Marca o limpia el error de un campo del formulario de ficha. */
function errorCampoFicha(cont, mensaje) {
  if (!cont) return;
  const p = cont.querySelector('.ficha-error');
  cont.classList.toggle('ficha-invalido', Boolean(mensaje));
  if (p) { p.textContent = mensaje || ''; p.classList.toggle('hidden', !mensaje); }
}

/** Revisa los teléfonos del formulario (formato y que no se repitan). Devuelve true si están bien. */
function revisarTelefonosFicha(form, pre, { soloTocados = false } = {}) {
  let ok = true;
  const valores = {};
  form.querySelectorAll('input[data-tel]').forEach((el) => {
    const cont = el.closest('[data-campo]');
    if (el.disabled) return;
    const r = validarTelefonoMx(el.value);
    if (r.valor) valores[cont.dataset.campo] = r.valor; // sirve para comparar aunque no se haya tocado
    if (soloTocados && !el.dataset.tocado) return;
    const etiqueta = cont.querySelector('label').textContent.replace('*', '').trim();
    if (r.error) { errorCampoFicha(cont, `${etiqueta}: ${r.error}.`); ok = false; } else errorCampoFicha(cont, '');
  });
  const iguales = (a, b) => valores[a] && valores[a] === valores[b];
  if (iguales('celular2', 'celular1')) { errorCampoFicha(form.querySelector('[data-campo="celular2"]'), 'Celular 2: es igual al Celular 1.'); ok = false; }
  if (iguales('emergencia_telefono', 'celular1') || iguales('emergencia_telefono', 'celular2')) {
    errorCampoFicha(form.querySelector('[data-campo="emergencia_telefono"]'), 'Teléfono de emergencia: debe ser de la persona de contacto, no tu propio celular.');
    ok = false;
  }
  return ok;
}

/* ---------------------------------------------- Estado y municipio (catálogo INEGI) */
const FUERA_MX = 'Fuera de México';
let catalogoMunicipiosPromesa = null;
function catalogoMunicipios() {
  if (!catalogoMunicipiosPromesa) {
    catalogoMunicipiosPromesa = api('/catalogos/municipios').then((r) => r.estados)
      .catch((err) => { catalogoMunicipiosPromesa = null; throw err; });
  }
  return catalogoMunicipiosPromesa;
}

/** "Municipio, Estado" → { estado, municipio } · "Ciudad, País" → { estado: FUERA_MX, ciudad, pais } */
function partirLugar(valor, estados) {
  const t = String(valor || '').trim();
  const i = t.lastIndexOf(',');
  if (i <= 0) return { estado: '' };
  const lugar = t.slice(0, i).trim();
  const region = t.slice(i + 1).trim();
  if (estados[region]) return { estado: region, municipio: estados[region].includes(lugar) ? lugar : '' };
  return { estado: FUERA_MX, ciudad: lugar, pais: region };
}

/** Dos listas (estado → municipio). El valor final queda en el input oculto #id. */
function lugarHtml(id, valor) {
  const base = 'w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-tecnmGreen outline-none bg-white';
  return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2" data-lugar>
      <input type="hidden" id="${id}" value="${escapeHtml(valor || '')}">
      <select id="${id}-estado" class="${base}" aria-label="Estado"><option value="">Cargando estados…</option></select>
      <select id="${id}-municipio" class="${base}" aria-label="Municipio" disabled><option value="">Primero elige el estado</option></select>
      <input type="text" id="${id}-ciudad" maxlength="50" placeholder="Ciudad" aria-label="Ciudad" class="${base} hidden">
      <input type="text" id="${id}-pais" maxlength="40" placeholder="País" aria-label="País" class="${base} hidden sm:col-span-2">
    </div>`;
}

/** Llena las listas de estado/municipio dentro de `raiz` y las mantiene sincronizadas. */
async function prepararLugares(raiz) {
  const grupos = [...raiz.querySelectorAll('[data-lugar]:not([data-listo])')];
  if (!grupos.length) return;
  let estados;
  try {
    estados = await catalogoMunicipios();
  } catch (err) {
    grupos.forEach((g) => { g.querySelector('select').innerHTML = '<option value="">No se pudo cargar el catálogo</option>'; });
    return;
  }
  grupos.forEach((g) => {
    g.dataset.listo = '1';
    const oculto = g.querySelector('input[type=hidden]');
    const [selEstado, selMun] = g.querySelectorAll('select');
    const [ciudad, pais] = g.querySelectorAll('input[type=text]');
    const opcion = (v, t = v) => `<option value="${escapeHtml(v)}">${escapeHtml(t)}</option>`;
    selEstado.innerHTML = opcion('', 'Elige el estado…') + Object.keys(estados).map((e) => opcion(e)).join('') + opcion(FUERA_MX, 'Nací fuera de México');
    const mostrar = () => {
      const fuera = selEstado.value === FUERA_MX;
      selMun.classList.toggle('hidden', fuera);
      ciudad.classList.toggle('hidden', !fuera);
      pais.classList.toggle('hidden', !fuera);
      if (!fuera) {
        const lista = estados[selEstado.value] || [];
        const previo = selMun.value;
        selMun.innerHTML = opcion('', selEstado.value ? 'Elige el municipio…' : 'Primero elige el estado') + lista.map((m) => opcion(m)).join('');
        selMun.disabled = !lista.length;
        if (lista.includes(previo)) selMun.value = previo;
      }
    };
    const componer = () => {
      const e = selEstado.value;
      if (e === FUERA_MX) {
        const c = ciudad.value.trim();
        const p = pais.value.trim();
        oculto.value = c && p ? `${c}, ${p}` : '';
      } else oculto.value = e && selMun.value ? `${selMun.value}, ${e}` : '';
    };
    const ini = partirLugar(oculto.value, estados);
    selEstado.value = ini.estado || '';
    mostrar();
    if (ini.municipio) selMun.value = ini.municipio;
    if (ini.estado === FUERA_MX) { ciudad.value = ini.ciudad || ''; pais.value = ini.pais || ''; }
    componer();
    // Se escucha en el contenedor para que el valor oculto esté listo antes que los oyentes del formulario
    g.addEventListener('change', (ev) => { if (ev.target === selEstado) mostrar(); componer(); });
    g.addEventListener('input', componer);
  });
  raiz.dispatchEvent(new Event('change', { bubbles: true }));
}

function campoFichaHtml(c, valor, pre) {
  const id = `${pre}-${c.clave}`;
  const req = c.requerido ? '<span class="text-rose-500" aria-hidden="true">*</span>' : '';
  const cond = c.si ? ` data-si='${escapeHtml(JSON.stringify(c.si))}'` : c.no ? ` data-no='${escapeHtml(JSON.stringify(c.no))}'` : '';
  const base = 'w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-tecnmGreen outline-none bg-white';
  const v = valor ?? '';
  let control;
  if (c.fijo) {
    // Dato del registro escolar: se muestra pero no se puede editar
    const mostrado = c.tipo === 'fecha' && v ? fechaCorta(v) : c.clave === 'semestre' && v ? `${v}°` : v;
    control = `<div class="relative">
        <input type="text" id="${id}" value="${escapeHtml(mostrado || '—')}" readonly aria-readonly="true" tabindex="-1" class="ficha-fijo w-full p-2.5 pr-9 rounded-xl border">
        <i class="fa-solid fa-lock absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[11px]" aria-hidden="true"></i>
      </div>`;
  } else if (c.tipo === 'opcion' || c.tipo === 'multiple') {
    const tipo = c.tipo === 'opcion' ? 'radio' : 'checkbox';
    const sel = Array.isArray(v) ? v : [v];
    control = `<div class="flex flex-wrap gap-2" role="${tipo === 'radio' ? 'radiogroup' : 'group'}" aria-labelledby="${id}-lbl">${c.opciones.map((o, i) => `
        <label class="ficha-opcion"><input type="${tipo}" name="${pre}-${c.clave}" id="${i === 0 ? id : `${id}-${i}`}" value="${escapeHtml(o)}" ${sel.includes(o) ? 'checked' : ''}><span>${escapeHtml(o)}</span></label>`).join('')}
      </div>`;
  } else if (c.tipo === 'lugar') {
    control = lugarHtml(id, v);
  } else if (c.tipo === 'textarea') {
    control = `<textarea id="${id}" name="${c.clave}" rows="2" maxlength="${c.max || 250}" placeholder="${escapeHtml(c.placeholder || '')}" class="${base}">${escapeHtml(v)}</textarea>`;
  } else {
    const tipos = { texto: 'text', correo: 'email', tel: 'tel', fecha: 'date', entero: 'number' };
    const extra = [
      c.max && c.tipo !== 'entero' ? `maxlength="${c.max}"` : '',
      c.tipo === 'entero' ? `min="${c.min ?? 0}" max="${c.max ?? 99}" step="1" inputmode="numeric"` : '',
      c.tipo === 'tel' ? 'inputmode="numeric" autocomplete="tel-national" maxlength="18" placeholder="Ej. 229 123 4567" data-tel="1"' : '',
      c.tipo === 'fecha' ? `max="${new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())}"` : '',
      c.placeholder ? `placeholder="${escapeHtml(c.placeholder)}"` : '',
      c.tipo === 'correo' ? 'autocomplete="email"' : '',
    ].join(' ');
    const valorCampo = c.tipo === 'tel' ? formatearTelefono(v) : v;
    control = `<input type="${tipos[c.tipo] || 'text'}" id="${id}" name="${c.clave}" value="${escapeHtml(valorCampo)}" ${extra} class="${base}">`;
  }
  return `<div class="${ANCHO_FICHA[c.ancho] || 'md:col-span-3'}" data-campo="${c.clave}"${cond}>
      <label for="${c.tipo === 'lugar' && !c.fijo ? `${id}-estado` : id}" id="${id}-lbl" class="block font-bold text-slate-700 mb-1">${escapeHtml(c.etiqueta)} ${c.fijo ? '' : req}</label>
      ${control}
      ${c.ayuda ? `<p class="text-[10px] text-slate-400 mt-1">${escapeHtml(c.ayuda)}</p>` : ''}
      <p class="ficha-error hidden text-[11px] text-rose-600 font-semibold mt-1" role="alert"></p>
    </div>`;
}

function formularioFichaHtml(datos, pre) {
  return FICHA.secciones.map((s, i) => `
    <fieldset class="ficha-seccion border border-slate-200 rounded-2xl p-4 md:p-5">
      <legend class="px-2 text-xs font-bold text-tecnmGreen flex items-center gap-2">
        <span class="w-6 h-6 rounded-full bg-tecnmGreen/10 flex items-center justify-center text-[10px]">${i + 1}</span>
        <i class="fa-solid ${s.icono || 'fa-circle'}"></i> ${escapeHtml(s.titulo)}
      </legend>
      <div class="grid grid-cols-1 md:grid-cols-6 gap-4 text-xs">
        ${s.campos.map((c) => campoFichaHtml(c, datos[c.clave], pre)).join('')}
      </div>
    </fieldset>`).join('');
}

/** Lee los valores del formulario como objeto { clave: valor }. */
function leerFormularioFicha(form, pre) {
  const datos = {};
  camposFicha().forEach((c) => {
    if (c.fijo) return; // los pone el servidor desde el registro escolar
    if (c.tipo === 'tel') {
      datos[c.clave] = (form.querySelector(`#${pre}-${c.clave}`)?.value || '').replace(/\D/g, '');
    } else if (c.tipo === 'opcion') {
      datos[c.clave] = form.querySelector(`input[name="${pre}-${c.clave}"]:checked`)?.value || '';
    } else if (c.tipo === 'multiple') {
      datos[c.clave] = [...form.querySelectorAll(`input[name="${pre}-${c.clave}"]:checked`)].map((i) => i.value);
    } else {
      const el = form.querySelector(`#${pre}-${c.clave}`);
      const val = el ? el.value.trim() : '';
      datos[c.clave] = c.tipo === 'entero' && val !== '' ? Number(val) : val;
    }
  });
  return datos;
}

/** Muestra u oculta campos condicionales (beca, trabajo, estado civil "Otro"…). */
function aplicarCondicionesFicha(form, pre) {
  const datos = leerFormularioFicha(form, pre);
  form.querySelectorAll('[data-si],[data-no]').forEach((cont) => {
    const si = cont.dataset.si ? JSON.parse(cont.dataset.si) : null;
    const no = cont.dataset.no ? JSON.parse(cont.dataset.no) : null;
    const activo = si ? datos[si.campo] === si.valor : datos[no.campo] !== no.valor;
    cont.classList.toggle('hidden', !activo);
    cont.querySelectorAll('input,textarea,select').forEach((el) => { el.disabled = !activo; });
  });
}

/** Cuenta los campos obligatorios que aplican y cuántos están llenos. */
function progresoFicha(form, pre) {
  const datos = leerFormularioFicha(form, pre);
  let total = 0;
  let llenos = 0;
  camposFicha().forEach((c) => {
    if (!c.requerido || c.fijo) return;
    if (c.si && datos[c.si.campo] !== c.si.valor) return;
    if (c.no && datos[c.no.campo] === c.no.valor) return;
    total += 1;
    const v = datos[c.clave];
    if (Array.isArray(v) ? v.length : v !== '' && v !== null && v !== undefined) llenos += 1;
  });
  return { total, llenos };
}

function limpiarErroresFicha(form) {
  form.querySelectorAll('.ficha-error').forEach((p) => { p.classList.add('hidden'); p.textContent = ''; });
  form.querySelectorAll('.ficha-invalido').forEach((el) => el.classList.remove('ficha-invalido'));
}

function mostrarErroresFicha(form, detalles = []) {
  limpiarErroresFicha(form);
  let primero = null;
  detalles.forEach((e) => {
    const cont = form.querySelector(`[data-campo="${e.clave}"]`);
    if (!cont) return;
    cont.classList.add('ficha-invalido');
    const p = cont.querySelector('.ficha-error');
    p.textContent = `${e.etiqueta}: ${e.mensaje}.`;
    p.classList.remove('hidden');
    primero = primero || cont;
  });
  primero?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Conecta eventos de un formulario de ficha (condiciones, progreso, limpieza de errores). */
function conectarFormularioFicha(form, pre, idProgreso) {
  const actualizar = () => {
    aplicarCondicionesFicha(form, pre);
    if (idProgreso && $(idProgreso)) {
      const { total, llenos } = progresoFicha(form, pre);
      const el = $(idProgreso);
      el.textContent = `${llenos} / ${total} obligatorios`;
      el.className = `shrink-0 text-[11px] font-bold px-3 py-1 rounded-full ${llenos === total ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`;
    }
  };
  form.addEventListener('input', (e) => {
    const cont = e.target.closest('[data-campo]');
    if (cont?.classList.contains('ficha-invalido')) {
      cont.classList.remove('ficha-invalido');
      cont.querySelector('.ficha-error')?.classList.add('hidden');
    }
    actualizar();
  });
  form.addEventListener('change', actualizar);
  prepararLugares(form);
  // Teléfonos: solo números (máx. 10), se agrupan como 229 123 4567 y se validan al salir del campo
  form.querySelectorAll('input[data-tel]').forEach((el) => {
    el.addEventListener('input', () => {
      let d = el.value.replace(/\D/g, '');
      if (d.length > 10 && d.startsWith('52')) d = d.slice(2); // escribieron o pegaron +52…
      el.value = formatearTelefono(d.slice(0, 10));
    });
    el.addEventListener('blur', () => { el.dataset.tocado = '1'; revisarTelefonosFicha(form, pre, { soloTocados: true }); });
  });
  actualizar();
}

/** Texto legible de un valor para vistas de solo lectura. */
function valorFichaTexto(c, v) {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (v === '' || v === null || v === undefined) return '—';
  if (c.tipo === 'fecha') return fmtFecha(`${v}T12:00:00`);
  if (c.tipo === 'tel') return formatearTelefono(v);
  return String(v);
}

function lineaEstadoFicha(f) {
  if (!f) return '';
  const quien = f.actualizado_por_rol === 'coordinador' ? 'la Coordinación' : 'el tutorado';
  return `Enviada el ${fmtFecha(f.fecha_envio)} · última actualización ${fmtFechaHora(f.updated_at)} por ${quien}${f.revisada_por_nombre && f.fecha_revision ? ` · revisada por ${escapeHtml(f.revisada_por_nombre)} el ${fmtFecha(f.fecha_revision)}` : ''}`;
}

/* ------------------------------------------------------------ PDF Anexo 6 */
/*
 * El PDF se genera sobre la plantilla oficial (formatos/anexo6_ficha_identificacion.pdf),
 * que es el documento "Anexo 6 2026 Ficha de Identificación" tal cual: mismos logos,
 * encabezado, pie, tablas y textos. Aquí solo se escriben los datos del tutorado y las
 * "X" dentro de cada ( ). Coordenadas en puntos PDF medidas desde la esquina superior
 * izquierda de la hoja carta (612 × 792).
 *   caja: [x0, arriba, x1, abajo]   marca: [página, centroX, abajoDelParéntesis]
 */
const ANEXO6 = {
  plantilla: 'formatos/anexo6_ficha_identificacion.pdf',
  // Datos sobre las líneas "______" del encabezado
  lineas: {
    fecha: { pag: 0, x0: 106, x1: 183, abajo: 268.1 },
    carrera: { pag: 0, x0: 209, x1: 363, abajo: 292.3 },
    no_control: { pag: 0, x0: 441, x1: 536, abajo: 292.3 },
    semestre: { pag: 0, x0: 122, x1: 212, abajo: 316.5 },
    estado_civil_otro: { pag: 0, x0: 452, x1: 549, abajo: 512.4, tam: 7 },
    beca_institucion: { pag: 0, x0: 337, x1: 549, abajo: 627.6, tam: 8 },
  },
  // Datos dentro de celdas vacías de las tablas
  cajas: {
    apellido_paterno: { pag: 0, caja: [71, 353, 192, 381] },
    apellido_materno: { pag: 0, caja: [199, 353, 376, 381] },
    nombres: { pag: 0, caja: [376, 353, 551, 381] },
    tel_domicilio: { pag: 0, caja: [192, 400, 300, 434] },
    celular1: { pag: 0, caja: [300, 400, 434, 434] },
    celular2: { pag: 0, caja: [434, 400, 551, 434] },
    correo: { pag: 0, caja: [192, 434, 551, 457] },
    fecha_nacimiento: { pag: 0, caja: [71, 479, 192, 524] },
    lugar_nacimiento: { pag: 0, caja: [199, 479, 376, 524] },
    domicilio: { pag: 0, caja: [199, 524, 551, 546] },
    institucion_procedencia: { pag: 0, caja: [199, 569, 551, 595] },
    empresa: { pag: 1, caja: [199, 204, 375, 226] },
    horario_trabajo: { pag: 1, caja: [375, 204, 550, 226] },
    trabajo_padre: { pag: 1, caja: [199, 362, 375, 406] },
    trabajo_madre: { pag: 1, caja: [375, 362, 550, 406] },
    emergencia_nombre: { pag: 1, caja: [199, 418, 375, 450] },
    emergencia_telefono: { pag: 1, caja: [375, 418, 550, 450] },
  },
  // Número de hijos: dentro de su ( )
  num_hijos: [0, 442.5, 523.3],
  // Opciones → posición de su ( )
  marcas: {
    sexo: { Hombre: [0, 115.5, 422.7], Mujer: [0, 147.9, 422.7] },
    estado_civil: { 'Casado(a)': [0, 441.5, 490.6], 'Soltero(a)': [0, 439.9, 501.5], Otro: [0, 441.4, 512.4] },
    escolaridad: { Preparatoria: [0, 322.5, 562.9], 'Bachillerato técnico': [0, 518.8, 562.9] },
    becado: { 'Sí': [0, 120.2, 627.6], No: [0, 158.1, 627.6] },
    tipos_beca: { 'Gobierno federal': [0, 307.6, 605.8], 'Gobierno estatal': [0, 429.0, 605.8], 'Esfuerzos de bachillerato': [0, 356.3, 616.7] },
    vivira_con: {
      'Con mi familia': [1, 243.0, 178.6],
      'Con familiares cercanos': [1, 331.6, 184.0],
      'Con otros estudiantes': [1, 426.2, 178.6],
      'Solo(a)': [0, 513.7, 671.2],
    },
    trabaja: { 'Sí': [1, 118.9, 213.5], No: [1, 158.0, 213.5] },
    escolaridad_padre: {
      Primaria: [1, 250.3, 284.5], Secundaria: [1, 294.9, 284.5], Preparatoria: [1, 341.9, 284.5],
      'Técnico': [1, 240.0, 295.4], Licenciatura: [1, 278.3, 295.4], Posgrado: [1, 353.0, 295.4], 'Sin estudios': [1, 316.5, 306.3],
    },
    escolaridad_madre: {
      Primaria: [1, 426.4, 284.5], Secundaria: [1, 471.0, 284.5], Preparatoria: [1, 518.0, 284.5],
      'Técnico': [1, 416.1, 295.4], Licenciatura: [1, 454.5, 295.4], Posgrado: [1, 529.2, 295.4], 'Sin estudios': [1, 492.6, 306.3],
    },
    padre_vive: { Vive: [1, 302.8, 339.5], Finado: [1, 304.7, 350.4] },
    madre_vive: { Vive: [1, 479.0, 339.5], Finado: [1, 480.8, 350.4] },
  },
};

let promesaPdfLib = null;
function cargarPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (!promesaPdfLib) {
    promesaPdfLib = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'vendor/pdf-lib.min.js';
      sc.onload = () => resolve(window.PDFLib);
      sc.onerror = () => { promesaPdfLib = null; reject(new Error('No se pudo cargar el generador de PDF.')); };
      document.head.appendChild(sc);
    });
  }
  return promesaPdfLib;
}

/** Texto apto para las fuentes estándar del PDF (WinAnsi): quita caracteres que no existen en ellas. */
const textoPdf = (v) => String(v ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[^\x20-\x7E -ÿ]/g, '').trim();

/** Genera el PDF del Anexo 6 con los datos y devuelve sus bytes. */
async function generarPdfFicha(alumno, datos) {
  const { PDFDocument, StandardFonts, rgb } = await cargarPdfLib();
  const resp = await fetch(ANEXO6.plantilla);
  if (!resp.ok) throw new Error('No se encontró la plantilla del Anexo 6.');
  const pdf = await PDFDocument.load(await resp.arrayBuffer());
  const paginas = pdf.getPages();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const tinta = rgb(0.05, 0.1, 0.25); // azul muy oscuro: se distingue del formato impreso
  const alto = (p) => paginas[p].getHeight();

  // Una línea que cabe en [x0, x1]: reduce el tamaño si hace falta
  const enLinea = (pag, texto, x0, x1, abajo, tam = 9) => {
    const t = textoPdf(texto);
    if (!t) return;
    let size = tam;
    while (size > 5 && fuente.widthOfTextAtSize(t, size) > x1 - x0) size -= 0.25;
    paginas[pag].drawText(t, { x: x0 + 1, y: alto(pag) - (abajo - 3.2), size, font: fuente, color: tinta });
  };

  // Texto dentro de una celda: varias líneas si no cabe, centrado verticalmente
  const enCaja = (pag, texto, [x0, arriba, x1, abajo]) => {
    const t = textoPdf(texto);
    if (!t) return;
    const ancho = x1 - x0 - 12; // 4 pt de margen a la izquierda y 8 a la derecha
    const altoCaja = abajo - arriba - 4;
    for (let size = 9; size >= 5; size -= 0.25) {
      const interlineado = size * 1.18;
      const maxLineas = Math.max(1, Math.floor(altoCaja / interlineado));
      const lineas = [];
      let actual = '';
      t.split(/\s+/).forEach((palabra) => {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (fuente.widthOfTextAtSize(prueba, size) <= ancho) actual = prueba;
        else { if (actual) lineas.push(actual); actual = palabra; }
      });
      if (actual) lineas.push(actual);
      const anchoMax = Math.max(...lineas.map((l) => fuente.widthOfTextAtSize(l, size)));
      if ((lineas.length <= maxLineas && anchoMax <= ancho) || size <= 5) {
        const bloque = lineas.length * interlineado;
        let base = arriba + 2 + (altoCaja - bloque) / 2 + size * 0.85;
        lineas.slice(0, maxLineas).forEach((l) => {
          paginas[pag].drawText(l, { x: x0 + 4, y: alto(pag) - base, size, font: fuente, color: tinta });
          base += interlineado;
        });
        return;
      }
    }
  };

  const marcaX = ([pag, cx, abajo]) => {
    const size = 8.5;
    const w = negrita.widthOfTextAtSize('X', size);
    paginas[pag].drawText('X', { x: cx - w / 2, y: alto(pag) - (abajo - 2.4), size, font: negrita, color: tinta });
  };

  // Encabezado
  const L = ANEXO6.lineas;
  enLinea(L.fecha.pag, fechaCorta(datos.fecha), L.fecha.x0, L.fecha.x1, L.fecha.abajo);
  enLinea(L.carrera.pag, datos.carrera, L.carrera.x0, L.carrera.x1, L.carrera.abajo);
  enLinea(L.no_control.pag, alumno.no_control, L.no_control.x0, L.no_control.x1, L.no_control.abajo);
  enLinea(L.semestre.pag, datos.semestre ? `${datos.semestre}°` : '', L.semestre.x0, L.semestre.x1, L.semestre.abajo);
  if (datos.estado_civil === 'Otro') {
    enLinea(L.estado_civil_otro.pag, datos.estado_civil_otro, L.estado_civil_otro.x0, L.estado_civil_otro.x1, L.estado_civil_otro.abajo, L.estado_civil_otro.tam);
  }
  if (datos.becado === 'Sí') {
    enLinea(L.beca_institucion.pag, datos.beca_institucion, L.beca_institucion.x0, L.beca_institucion.x1, L.beca_institucion.abajo, L.beca_institucion.tam);
  }

  // Celdas
  Object.entries(ANEXO6.cajas).forEach(([clave, { pag, caja }]) => {
    let v = datos[clave];
    if (['tel_domicilio', 'celular1', 'celular2', 'emergencia_telefono'].includes(clave)) v = formatearTelefono(v);
    if (clave === 'fecha_nacimiento') v = fechaCorta(v);
    enCaja(pag, v, caja);
  });

  // No. de hijos dentro de su ( )
  if (datos.num_hijos !== '' && datos.num_hijos !== null && datos.num_hijos !== undefined) {
    const [pag, cx, abajo] = ANEXO6.num_hijos;
    const t = String(datos.num_hijos);
    const size = t.length > 1 ? 6.5 : 8;
    paginas[pag].drawText(t, { x: cx - fuente.widthOfTextAtSize(t, size) / 2, y: alto(pag) - (abajo - 2.4), size, font: negrita, color: tinta });
  }

  // Opciones marcadas con X
  Object.entries(ANEXO6.marcas).forEach(([clave, opciones]) => {
    const v = datos[clave];
    (Array.isArray(v) ? v : [v]).forEach((op) => { if (opciones[op]) marcaX(opciones[op]); });
  });

  pdf.setTitle(`Anexo 6 · Ficha de Identificación · ${alumno.no_control}`);
  pdf.setAuthor('Coordinación Institucional de Tutorías · ITVER');
  pdf.setSubject('Ficha de Identificación del tutorado');
  return pdf.save();
}

/** Abre una vista previa del PDF con botones para descargar e imprimir. */
async function verPdfFicha(boton) {
  if (!FICHA.ficha) return toast('Primero envía la ficha.', 'info');
  await conBotonOcupado(boton, 'Generando PDF…', async () => {
    try {
      const bytes = await generarPdfFicha(FICHA.alumno, FICHA.ficha.datos);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const nombre = `Anexo6_Ficha_Identificacion_${FICHA.alumno.no_control}.pdf`;
      const modal = modalSimple('modal-pdf-ficha', 'Anexo 6 · Ficha de Identificación (PDF)', `
        <div class="flex flex-wrap gap-2 mb-3 text-xs">
          <a href="${url}" download="${escapeHtml(nombre)}" class="bg-tecnmGreen hover:bg-tecnmDark text-white px-4 py-2 rounded-xl font-bold"><i class="fa-solid fa-download mr-1"></i> Descargar PDF</a>
          <button type="button" id="btn-imprimir-pdf-ficha" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold"><i class="fa-solid fa-print mr-1"></i> Imprimir</button>
          <span class="self-center text-slate-400">Formato oficial del Anexo 6 con tus datos.</span>
        </div>
        <iframe id="iframe-pdf-ficha" src="${url}" title="Vista previa del Anexo 6" class="w-full h-[70vh] rounded-xl border border-slate-200 bg-slate-100"></iframe>`);
      $('btn-imprimir-pdf-ficha').onclick = () => {
        try { $('iframe-pdf-ficha').contentWindow.print(); } catch { window.open(url, '_blank'); }
      };
      // Liberar la memoria del PDF al cerrar
      const liberar = new MutationObserver(() => {
        if (modal.classList.contains('hidden')) { URL.revokeObjectURL(url); liberar.disconnect(); }
      });
      liberar.observe(modal, { attributes: true, attributeFilter: ['class'] });
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ------------------------------------------------------------------- alumno */
async function cargarFichaAlumno() {
  try {
    const data = await api('/fichas/mia');
    Object.assign(FICHA, { secciones: data.secciones, alumno: data.alumno, ficha: data.ficha, prellenado: data.prellenado });
    pintarTarjetaFicha();
    pintarPanelFichaAlumno();
  } catch (err) {
    setText('ficha-chip', 'Error');
    if ($('panel-ficha')) $('panel-ficha').innerHTML = `<p class="text-xs text-rose-600 text-center py-6">${escapeHtml(err.message)}</p>`;
  }
}

function pintarTarjetaFicha() {
  const estado = FICHA.ficha?.estado || 'Pendiente';
  const chipEl = $('ficha-chip');
  if (chipEl) {
    chipEl.className = `${ESTILO_FICHA[estado].chip} text-[9px] font-bold px-2 py-0.5 rounded uppercase`;
    chipEl.textContent = estado;
  }
  const btn = $('btn-panel-ficha');
  if (btn) btn.querySelector('span').textContent = FICHA.ficha ? (estado === 'Requiere corrección' ? 'Corregir ficha' : 'Ver / actualizar ficha') : 'Llenar ficha';

  // Recordatorio en Inicio cuando falta o hay que corregir
  const aviso = $('ficha-aviso-inicio');
  if (!aviso) return;
  if (estado === 'Pendiente' || estado === 'Requiere corrección') {
    const corr = estado === 'Requiere corrección';
    aviso.innerHTML = `<div class="p-4 rounded-2xl border ${corr ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-sky-50 border-sky-200 text-sky-900'} flex flex-col sm:flex-row sm:items-center gap-3 text-xs">
        <i class="fa-solid ${corr ? 'fa-pen-to-square' : 'fa-address-card'} text-lg"></i>
        <div class="flex-1"><p class="font-bold">${corr ? 'La Coordinación te pidió corregir tu Ficha de Identificación' : 'Falta tu Ficha de Identificación (Anexo 6)'}</p>
        <p class="mt-0.5 opacity-90">${corr ? escapeHtml(FICHA.ficha.observaciones || '') : 'Llénala en línea en Formatos PIT; solo toma unos minutos.'}</p></div>
        <button type="button" onclick="irAFichaAlumno()" class="shrink-0 bg-tecnmGreen hover:bg-tecnmDark text-white px-4 py-2 rounded-xl font-bold">${corr ? 'Corregir ahora' : 'Llenar ahora'}</button>
      </div>`;
  } else aviso.innerHTML = '';
}

function irAFichaAlumno() {
  switchTab('documentos');
  setTimeout(() => abrirPanel('panel-ficha'), 100);
}

function pintarPanelFichaAlumno() {
  const panel = $('panel-ficha');
  if (!panel) return;
  const f = FICHA.ficha;
  const estado = f?.estado || 'Pendiente';
  const datos = f ? f.datos : FICHA.prellenado;
  const banners = {
    Pendiente: ['bg-sky-50 border-sky-200 text-sky-900', 'fa-circle-info', 'Aún no has enviado tu ficha. Revisa los datos que ya llenamos con tu registro escolar y completa el resto.'],
    Enviada: ['bg-sky-50 border-sky-200 text-sky-900', 'fa-paper-plane', `Tu ficha está en revisión por la Coordinación de Tutorías. ${lineaEstadoFicha(f)}.`],
    Revisada: ['bg-emerald-50 border-emerald-200 text-emerald-800', 'fa-circle-check', `La Coordinación revisó tu ficha. ${lineaEstadoFicha(f)}. Si algún dato cambia (domicilio, teléfono…), actualízalo aquí.`],
    'Requiere corrección': ['bg-amber-50 border-amber-200 text-amber-900', 'fa-pen-to-square', `<strong>La Coordinación te pide corregir:</strong> ${escapeHtml(f?.observaciones || '')}`],
  };
  const [cls, icono, texto] = banners[estado];
  panel.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-4">
      <div>
        <h3 class="text-base font-bold text-slate-800 mb-1">Ficha de Identificación del Tutorado <span class="text-slate-400 font-semibold">· Anexo 6</span></h3>
        <p class="text-xs text-slate-500">${escapeHtml(FICHA.alumno.nombre)} · No. de control <strong>${escapeHtml(FICHA.alumno.no_control)}</strong></p>
      </div>
      <span id="ficha-progreso" class="shrink-0 bg-slate-100 text-slate-600 text-[11px] font-bold px-3 py-1 rounded-full">…</span>
    </div>
    <div class="mb-4 p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-xs flex items-start gap-2">
      <i class="fa-solid fa-user-shield mt-0.5 text-tecnmGreen"></i>
      <span><strong>Confidencial.</strong> Tus respuestas serán utilizadas para mejorar el servicio que puede brindar la Institución; contesta con la mayor sinceridad. Solo la Coordinación de Tutorías puede consultarlas.</span>
    </div>
    <div class="mb-5 p-3 rounded-xl border text-xs font-medium flex items-start gap-2 ${cls}"><i class="fa-solid ${icono} mt-0.5"></i><span>${texto}</span></div>
    <form id="form-ficha" novalidate class="space-y-5">
      ${formularioFichaHtml(datos, 'fa')}
      <p class="text-[11px] text-slate-400"><span class="text-rose-500">*</span> Campos obligatorios.</p>
      <div class="flex flex-col sm:flex-row gap-3">
        <button type="submit" id="ficha-boton" class="flex-1 bg-tecnmGreen hover:bg-tecnmDark text-white font-bold py-3 rounded-xl shadow transition text-xs flex items-center justify-center gap-2"><i class="fa-solid fa-paper-plane"></i> <span>${f ? 'Guardar cambios y enviar' : 'Enviar ficha a la Coordinación'}</span></button>
        ${f ? '<button type="button" onclick="verPdfFicha(this)" class="sm:w-56 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-xs transition flex items-center justify-center gap-2"><i class="fa-solid fa-file-pdf"></i> <span>Ver / descargar PDF (Anexo 6)</span></button>' : ''}
      </div>
    </form>
    <div id="ficha-error" class="hidden mt-4 p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200 font-bold" role="alert"></div>
    <button type="button" onclick="cerrarPanel('panel-ficha')" class="mt-4 w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition"><i class="fa-solid fa-chevron-up mr-1"></i> Cerrar ficha</button>`;
  const form = $('form-ficha');
  conectarFormularioFicha(form, 'fa', 'ficha-progreso');
  form.addEventListener('submit', enviarFichaAlumno);
}

async function enviarFichaAlumno(event) {
  event.preventDefault();
  const form = event.target;
  const errorBox = $('ficha-error');
  errorBox.classList.add('hidden');
  limpiarErroresFicha(form);
  if (!revisarTelefonosFicha(form, 'fa')) {
    errorBox.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1"></i> Revisa los números de teléfono marcados en rojo.';
    errorBox.classList.remove('hidden');
    form.querySelector('.ficha-invalido')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  await conBotonOcupado($('ficha-boton'), 'Enviando…', async () => {
    try {
      const data = await api('/fichas/mia', { method: 'PUT', body: { datos: leerFormularioFicha(form, 'fa') } });
      Object.assign(FICHA, { ficha: data.ficha });
      toast(data.mensaje, 'ok');
      pintarTarjetaFicha();
      cargarPersonaAlumno(); // fecha, ciudad natal y teléfono se comparten con el perfil
      cargarPerfilAlumno();
      setTimeout(() => { pintarPanelFichaAlumno(); $('panel-ficha')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0);
    } catch (err) {
      errorBox.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i> ${escapeHtml(err.message)}`;
      errorBox.classList.remove('hidden');
      if (err.detalles) mostrarErroresFicha(form, err.detalles);
    }
  });
}

/* ------------------------------------------------------------- coordinación */
async function cargarFichasCoord() {
  const tbody = $('tbody-fichas');
  if (!tbody) return;
  mostrarEstadoTabla(tbody, 7, 'Cargando fichas…');
  try {
    const data = await api('/fichas', { query: { q: $('fichas-buscar')?.value.trim(), estado: $('fichas-estado')?.value } });
    FICHA_LISTA.filas = data.fichas;
    pintarResumenFichas(data.resumen);
    if (!data.fichas.length) return mostrarEstadoTabla(tbody, 7, 'No hay tutorados con ese filtro.');
    tbody.innerHTML = data.fichas.map((f) => `
      <tr class="hover:bg-slate-50/60">
        <td class="p-3 font-mono text-slate-600">${escapeHtml(f.no_control)}</td>
        <td class="p-3"><p class="font-bold text-slate-800">${escapeHtml(f.nombre)}</p>${f.celular ? `<p class="text-[10px] text-slate-400"><i class="fa-solid fa-mobile-screen mr-1"></i>${escapeHtml(f.celular)}</p>` : ''}</td>
        <td class="p-3 text-center">${f.semestre}°</td>
        <td class="p-3 text-slate-600">${f.tutor ? escapeHtml(f.tutor) : '<span class="text-slate-400">Sin tutor</span>'}</td>
        <td class="p-3">${chipFicha(f.estado)}${f.estado === 'Requiere corrección' && f.observaciones ? `<p class="text-[10px] text-amber-700 mt-1 max-w-[14rem] truncate" title="${escapeHtml(f.observaciones)}">${escapeHtml(f.observaciones)}</p>` : ''}</td>
        <td class="p-3 text-slate-500">${f.updated_at ? `${fmtFechaHora(f.updated_at)}<p class="text-[10px] text-slate-400">por ${f.actualizado_por_rol === 'coordinador' ? 'coordinación' : 'el tutorado'}</p>` : '—'}</td>
        <td class="p-3 text-center whitespace-nowrap">
          ${f.estado === 'Pendiente'
            ? `<button onclick="abrirFichaCoord(${f.tutorado_id}, 'editar')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-bold"><i class="fa-solid fa-keyboard mr-1"></i>Capturar</button>`
            : `<button onclick="abrirFichaCoord(${f.tutorado_id})" class="bg-tecnmGreen hover:bg-tecnmDark text-white px-2.5 py-1 rounded-lg text-[11px] font-bold"><i class="fa-solid fa-eye mr-1"></i>Ver</button>
               <button onclick="abrirFichaCoord(${f.tutorado_id}, 'editar')" class="ml-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-bold" title="Editar"><i class="fa-solid fa-pen"></i></button>`}
        </td>
      </tr>`).join('');
  } catch (err) {
    mostrarEstadoTabla(tbody, 7, err.message, 'error');
  }
}

function pintarResumenFichas(r) {
  const cont = $('fichas-resumen');
  if (!cont) return;
  const actual = $('fichas-estado')?.value || '';
  const tarjetas = [
    ['', 'Tutorados', r.total, 'fa-users', 'text-tecnmGreen'],
    ['Enviada', 'Por revisar', r.Enviada, 'fa-paper-plane', 'text-sky-700'],
    ['Requiere corrección', 'En corrección', r['Requiere corrección'], 'fa-pen', 'text-amber-700'],
    ['Revisada', 'Revisadas', r.Revisada, 'fa-circle-check', 'text-emerald-700'],
    ['Pendiente', 'Sin ficha', r.Pendiente, 'fa-hourglass-start', 'text-slate-500'],
  ];
  cont.innerHTML = tarjetas.map(([estado, etiqueta, n, icono, color]) => `
    <button type="button" onclick="filtrarFichas('${estado}')" class="tarjeta-suave text-left p-3 rounded-xl border ${actual === estado ? 'border-tecnmGreen ring-2 ring-tecnmGreen/20' : 'border-slate-200'} bg-white hover:border-tecnmGreen/50 transition">
      <p class="text-[10px] uppercase tracking-wider font-bold text-slate-400"><i class="fa-solid ${icono} mr-1 ${color}"></i>${etiqueta}</p>
      <p class="text-2xl font-extrabold ${color} mt-1">${n}</p>
    </button>`).join('');
}

function filtrarFichas(estado) {
  if ($('fichas-estado')) $('fichas-estado').value = estado;
  cargarFichasCoord();
}

async function abrirFichaCoord(tutoradoId, modo = 'ver') {
  modalSimple('modal-ficha', 'Ficha de Identificación', '<p class="text-xs text-slate-400 text-center py-10"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Cargando…</p>');
  try {
    const data = await api(`/fichas/tutorado/${tutoradoId}`);
    Object.assign(FICHA, {
      secciones: data.secciones, alumno: data.alumno, ficha: data.ficha, prellenado: data.prellenado,
      historial: data.historial || [], tutoradoId,
    });
    if (!data.ficha && modo === 'ver') modo = 'vacia';
    pintarModalFicha(modo);
  } catch (err) {
    modalSimple('modal-ficha', 'Ficha de Identificación', `<p class="text-xs text-rose-600 text-center py-10">${escapeHtml(err.message)}</p>`);
  }
}

function historialFichaHtml() {
  if (!FICHA.historial.length) return '<p class="text-[11px] text-slate-400">Sin movimientos.</p>';
  const C = Object.fromEntries(camposFicha().map((c) => [c.clave, c]));
  return `<ol class="space-y-2">${FICHA.historial.map((h) => {
    const cambios = Object.entries(h.cambios || {});
    return `<li class="p-2.5 rounded-xl border border-slate-200 bg-white">
      <div class="flex flex-wrap justify-between gap-2 text-[11px]">
        <span class="font-bold text-slate-700">${escapeHtml(h.accion)}</span>
        <span class="text-slate-400">${fmtFechaHora(h.fecha)} · ${escapeHtml(h.usuario || '—')} (${h.rol === 'coordinador' ? 'coordinación' : 'tutorado'})</span>
      </div>
      ${h.nota ? `<p class="text-[11px] text-slate-600 mt-1">${escapeHtml(h.nota)}</p>` : ''}
      ${cambios.length ? `<ul class="mt-1 space-y-0.5 text-[11px] text-slate-500">${cambios.map(([k, d]) => `<li><strong class="text-slate-600">${escapeHtml(C[k]?.etiqueta || k)}:</strong> <span class="line-through decoration-rose-400/70">${escapeHtml(valorFichaTexto(C[k] || {}, d.antes))}</span> → <span class="text-slate-700">${escapeHtml(valorFichaTexto(C[k] || {}, d.despues))}</span></li>`).join('')}</ul>` : ''}
    </li>`;
  }).join('')}</ol>`;
}

function pintarModalFicha(modo) {
  const f = FICHA.ficha;
  const a = FICHA.alumno;
  const encabezado = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-4 border-b border-slate-200">
      <div>
        <p class="text-sm font-bold text-slate-800">${escapeHtml(a.nombre)}</p>
        <p class="text-[11px] text-slate-500">No. de control ${escapeHtml(a.no_control)} · ${escapeHtml(a.correo_institucional)}</p>
        ${f ? `<p class="text-[10px] text-slate-400 mt-1">${lineaEstadoFicha(f)}</p>` : ''}
      </div>
      ${chipFicha(f?.estado || 'Pendiente', 'text-[11px] px-3 py-1')}
    </div>`;

  if (modo === 'vacia') {
    modalSimple('modal-ficha', 'Ficha de Identificación · Anexo 6', `${encabezado}
      <div class="text-center py-8 text-xs text-slate-500">
        <i class="fa-solid fa-hourglass-start text-3xl text-slate-300 mb-3"></i>
        <p class="font-bold text-slate-700">Este tutorado aún no ha llenado su ficha.</p>
        <p class="mt-1">Si la entregó en papel, puedes capturarla tú.</p>
        <button type="button" onclick="pintarModalFicha('editar')" class="mt-4 bg-tecnmGreen hover:bg-tecnmDark text-white px-4 py-2 rounded-xl font-bold"><i class="fa-solid fa-keyboard mr-1"></i> Capturar ficha</button>
      </div>
      ${FICHA.historial.length ? `<details class="mt-2"><summary class="text-xs font-bold text-slate-600 cursor-pointer">Historial</summary><div class="mt-2">${historialFichaHtml()}</div></details>` : ''}`);
    return;
  }

  if (modo === 'editar') {
    const datos = f ? f.datos : FICHA.prellenado;
    modalSimple('modal-ficha', f ? 'Editar Ficha de Identificación' : 'Capturar Ficha de Identificación', `${encabezado}
      <form id="form-ficha-coord" novalidate class="space-y-5">
        ${formularioFichaHtml(datos, 'fc')}
        <fieldset class="border border-tecnmGreen/30 bg-blue-50/40 rounded-2xl p-4 md:p-5">
          <legend class="px-2 text-xs font-bold text-tecnmGreen"><i class="fa-solid fa-clipboard-check mr-1"></i> Revisión de la coordinación</legend>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label for="fc-estado" class="block font-bold text-slate-700 mb-1">Estado de la ficha</label>
              <select id="fc-estado" class="w-full p-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-tecnmGreen outline-none">
                ${['Revisada', 'Enviada', 'Requiere corrección'].map((e) => `<option value="${e}" ${(f?.estado || 'Revisada') === e ? 'selected' : ''}>${e === 'Enviada' ? 'Enviada (pendiente de revisión)' : e}</option>`).join('')}
              </select>
            </div>
            <div class="md:col-span-2">
              <label for="fc-observaciones" class="block font-bold text-slate-700 mb-1">Observaciones para el tutorado <span class="font-normal text-slate-400">(se le muestran si requiere corrección)</span></label>
              <textarea id="fc-observaciones" rows="2" maxlength="1000" class="w-full p-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-tecnmGreen outline-none" placeholder="Ej. Verifica tu número de celular">${escapeHtml(f?.observaciones || '')}</textarea>
            </div>
          </div>
        </fieldset>
        <div id="fc-error" class="hidden p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200 font-bold" role="alert"></div>
        <div class="flex flex-col sm:flex-row gap-3 sticky bottom-0 bg-white pt-3 pb-1 border-t border-slate-100">
          <span id="fc-progreso" class="self-center text-[11px] font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600">…</span>
          <span class="flex-1"></span>
          <button type="button" onclick="${f ? 'pintarModalFicha(\'ver\')' : 'cerrarModal(\'modal-ficha\')'}" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-xl text-xs">Cancelar</button>
          <button type="submit" id="fc-boton" class="bg-tecnmGreen hover:bg-tecnmDark text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2"><i class="fa-solid fa-floppy-disk"></i> <span>Guardar ficha</span></button>
        </div>
      </form>`);
    const form = $('form-ficha-coord');
    conectarFormularioFicha(form, 'fc', 'fc-progreso');
    form.addEventListener('submit', guardarFichaCoord);
    return;
  }

  // modo ver
  const seccionesHtml = FICHA.secciones.map((s) => `
    <section class="ficha-seccion border border-slate-200 rounded-2xl p-4">
      <h4 class="text-xs font-bold text-tecnmGreen mb-3"><i class="fa-solid ${s.icono} mr-1"></i> ${escapeHtml(s.titulo)}</h4>
      <dl class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2.5 text-xs">
        ${s.campos.filter((c) => !(c.si && f.datos[c.si.campo] !== c.si.valor) && !(c.no && f.datos[c.no.campo] === c.no.valor)).map((c) => `
          <div class="${c.ancho === 'completo' ? 'sm:col-span-2 md:col-span-3' : ''}">
            <dt class="text-[10px] uppercase tracking-wide font-bold text-slate-400">${escapeHtml(c.etiqueta)}</dt>
            <dd class="text-slate-800 font-semibold break-words">${escapeHtml(valorFichaTexto(c, f.datos[c.clave]))}</dd>
          </div>`).join('')}
      </dl>
    </section>`).join('');
  modalSimple('modal-ficha', 'Ficha de Identificación · Anexo 6', `${encabezado}
    ${f.estado === 'Requiere corrección' && f.observaciones ? `<div class="mb-4 p-3 rounded-xl border bg-amber-50 border-amber-200 text-amber-900 text-xs"><strong>Corrección solicitada:</strong> ${escapeHtml(f.observaciones)}</div>` : ''}
    <div class="flex flex-wrap gap-2 mb-4 text-xs">
      <button type="button" onclick="pintarModalFicha('editar')" class="bg-tecnmGreen hover:bg-tecnmDark text-white px-3 py-2 rounded-xl font-bold"><i class="fa-solid fa-pen mr-1"></i> Editar datos</button>
      ${f.estado !== 'Revisada' ? '<button type="button" onclick="cambiarEstadoFicha(\'Revisada\', this)" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-2 rounded-xl font-bold"><i class="fa-solid fa-circle-check mr-1"></i> Marcar como revisada</button>' : ''}
      <button type="button" onclick="$(\'ficha-correccion\').classList.toggle(\'hidden\'); $(\'ficha-obs\').focus()" class="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-3 py-2 rounded-xl font-bold"><i class="fa-solid fa-pen-to-square mr-1"></i> Solicitar corrección</button>
      <button type="button" onclick="verPdfFicha(this)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl font-bold"><i class="fa-solid fa-file-pdf mr-1"></i> PDF Anexo 6</button>
      <button type="button" onclick="eliminarFichaCoord(this)" class="sm:ml-auto bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 px-3 py-2 rounded-xl font-bold"><i class="fa-solid fa-trash mr-1"></i> Eliminar</button>
    </div>
    <div id="ficha-correccion" class="hidden mb-4 p-4 rounded-2xl border border-amber-200 bg-amber-50/60 text-xs">
      <label for="ficha-obs" class="block font-bold text-amber-900 mb-1">¿Qué debe corregir el tutorado?</label>
      <textarea id="ficha-obs" rows="2" maxlength="1000" class="w-full p-2.5 rounded-xl border border-amber-300 bg-white focus:ring-2 focus:ring-amber-400 outline-none" placeholder="Ej. El teléfono de emergencia está incompleto"></textarea>
      <button type="button" onclick="cambiarEstadoFicha('Requiere corrección', this)" class="mt-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl font-bold"><i class="fa-solid fa-paper-plane mr-1"></i> Enviar solicitud</button>
    </div>
    <div class="space-y-4">${seccionesHtml}</div>
    <details class="mt-4">
      <summary class="text-xs font-bold text-slate-600 cursor-pointer"><i class="fa-solid fa-clock-rotate-left mr-1"></i> Historial de cambios (${FICHA.historial.length})</summary>
      <div class="mt-2">${historialFichaHtml()}</div>
    </details>`);
}

async function guardarFichaCoord(event) {
  event.preventDefault();
  const form = event.target;
  const errorBox = $('fc-error');
  errorBox.classList.add('hidden');
  limpiarErroresFicha(form);
  if (!revisarTelefonosFicha(form, 'fc')) {
    errorBox.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1"></i> Revisa los números de teléfono marcados en rojo.';
    errorBox.classList.remove('hidden');
    form.querySelector('.ficha-invalido')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  await conBotonOcupado($('fc-boton'), 'Guardando…', async () => {
    try {
      const data = await api(`/fichas/tutorado/${FICHA.tutoradoId}`, {
        method: 'PUT',
        body: { datos: leerFormularioFicha(form, 'fc'), estado: $('fc-estado').value, observaciones: $('fc-observaciones').value },
      });
      Object.assign(FICHA, { ficha: data.ficha, historial: data.historial || [] });
      toast(data.mensaje, 'ok');
      pintarModalFicha('ver');
      cargarFichasCoord();
    } catch (err) {
      errorBox.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i> ${escapeHtml(err.message)}`;
      errorBox.classList.remove('hidden');
      if (err.detalles) mostrarErroresFicha(form, err.detalles);
    }
  });
}

async function cambiarEstadoFicha(estado, boton) {
  const observaciones = estado === 'Requiere corrección' ? $('ficha-obs')?.value.trim() : undefined;
  if (estado === 'Requiere corrección' && !observaciones) {
    toast('Escribe qué debe corregir el tutorado.', 'error');
    $('ficha-obs')?.focus();
    return;
  }
  await conBotonOcupado(boton, 'Guardando…', async () => {
    try {
      const data = await api(`/fichas/tutorado/${FICHA.tutoradoId}/estado`, { method: 'PATCH', body: { estado, observaciones } });
      Object.assign(FICHA, { ficha: data.ficha, historial: data.historial || [] });
      toast(data.mensaje, 'ok');
      pintarModalFicha('ver');
      cargarFichasCoord();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function eliminarFichaCoord(boton) {
  if (!confirm(`¿Eliminar la ficha de ${FICHA.alumno.nombre}? El tutorado tendrá que llenarla de nuevo. El historial se conserva.`)) return;
  await conBotonOcupado(boton, 'Eliminando…', async () => {
    try {
      const data = await api(`/fichas/tutorado/${FICHA.tutoradoId}`, { method: 'DELETE' });
      toast(data.mensaje, 'ok');
      cerrarModal('modal-ficha');
      cargarFichasCoord();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function exportarFichasCsv(boton) {
  await conBotonOcupado(boton, 'Generando…', async () => {
    try {
      const resp = await fetch(new URL(`${API_BASE}/fichas/exportar`, location.href), { headers: { Authorization: `Bearer ${Sesion.token}` } });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `Error ${resp.status}`);
      const blob = await resp.blob();
      const nombre = /filename="([^"]+)"/.exec(resp.headers.get('Content-Disposition') || '')?.[1] || 'fichas_identificacion.csv';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast('Archivo CSV descargado. Ábrelo con Excel.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function conectarFiltrosFichas() {
  $('fichas-estado')?.addEventListener('change', cargarFichasCoord);
  $('fichas-buscar')?.addEventListener('input', () => {
    clearTimeout(FICHA_LISTA.temporizador);
    FICHA_LISTA.temporizador = setTimeout(cargarFichasCoord, 300);
  });
}

/* -----------------------------------------------------------------------------
 * Arranque
 * --------------------------------------------------------------------------- */
/* -----------------------------------------------------------------------------
 * Accesibilidad: modo oscuro (preferencia guardada por navegador)
 * --------------------------------------------------------------------------- */
function leerA11y() {
  try {
    return JSON.parse(localStorage.getItem('pit_a11y') || '{}');
  } catch {
    return {};
  }
}

function guardarA11y(pref) {
  try {
    localStorage.setItem('pit_a11y', JSON.stringify(pref));
  } catch {
    /* sin almacenamiento disponible: el modo dura mientras la página esté abierta */
  }
}

/**
 * En celular las tablas se muestran como tarjetas (CSS .tabla-tarjetas):
 * cada celda recibe la etiqueta de su columna en data-label.
 */
function etiquetarTablas(raiz = document) {
  raiz.querySelectorAll('main table:not(.sin-tarjetas)').forEach((tabla) => {
    const encabezados = [...tabla.querySelectorAll('thead th')].map((th) => th.textContent.replace(/\s+/g, ' ').trim());
    if (!encabezados.length) return;
    tabla.classList.add('tabla-tarjetas');
    tabla.querySelectorAll('tbody tr').forEach((tr) => {
      let col = 0;
      [...tr.children].forEach((td) => {
        if (!td.hasAttribute('data-label')) td.setAttribute('data-label', encabezados[col] || '');
        col += Number(td.getAttribute('colspan') || 1);
      });
    });
  });
}

function vigilarTablas() {
  let pendiente = null;
  const correr = () => { pendiente = null; etiquetarTablas(); };
  etiquetarTablas();
  new MutationObserver(() => { if (!pendiente) pendiente = requestAnimationFrame(correr); })
    .observe(document.body, { childList: true, subtree: true });
}

function montarBotonesAccesibilidad() {
  if ($('pit-a11y')) return;
  const raiz = document.documentElement;
  const cont = document.createElement('div');
  cont.id = 'pit-a11y';
  cont.className = 'pit-a11y';
  cont.setAttribute('role', 'group');
  cont.setAttribute('aria-label', 'Modo de color');
  cont.innerHTML = `
    <button type="button" id="btn-modo-oscuro" title="Modo oscuro" aria-label="Modo oscuro"><i class="fa-solid fa-moon" aria-hidden="true"></i></button>`;
  document.body.appendChild(cont);

  const pintar = () => {
    const oscuro = raiz.classList.contains('dark');
    const bO = $('btn-modo-oscuro');
    bO.setAttribute('aria-pressed', String(oscuro));
    bO.title = oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    bO.setAttribute('aria-label', bO.title);
    bO.innerHTML = `<i class="fa-solid ${oscuro ? 'fa-sun' : 'fa-moon'}" aria-hidden="true"></i>`;
  };
  $('btn-modo-oscuro').addEventListener('click', () => {
    const pref = leerA11y();
    pref.oscuro = !raiz.classList.contains('dark');
    raiz.classList.toggle('dark', pref.oscuro);
    guardarA11y(pref);
    pintar();
    toast(pref.oscuro ? 'Modo oscuro activado.' : 'Modo claro activado.', 'info');
  });
  pintar();
}

/** Desvanece el borde de la barra de pestañas solo cuando hay pestañas ocultas */
function vigilarPestanas() {
  const tabs = document.querySelector('.pit-tabs');
  if (!tabs) return;
  const revisar = () => {
    const max = tabs.scrollWidth - tabs.clientWidth;
    tabs.classList.toggle('desborda-izq', tabs.scrollLeft > 2);
    tabs.classList.toggle('desborda-der', max - tabs.scrollLeft > 2);
  };
  tabs.addEventListener('scroll', revisar, { passive: true });
  window.addEventListener('resize', revisar);
  // La rueda vertical del ratón también desplaza las pestañas cuando no caben
  tabs.addEventListener('wheel', (e) => {
    if (tabs.scrollWidth <= tabs.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    tabs.scrollLeft += e.deltaY;
  }, { passive: false });
  revisar();
  const activa = tabs.querySelector('.nav-btn.activo');
  if (activa) activa.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

document.addEventListener('DOMContentLoaded', () => {
  montarBotonesAccesibilidad();
  vigilarPestanas();
  vigilarTablas();
  $('btn-logout')?.addEventListener('click', cerrarSesion);
  ({ login: iniciarLogin, alumno: iniciarAlumno, tutor: iniciarTutor, coordinacion: iniciarCoordinacion }[PAGINA] || (() => {}))();
});

// Exponer para los atributos onclick del HTML y para pruebas desde consola
Object.assign(window, {
  PIT: { api, Sesion, cargarMetricasDashboard, poblarTablaRiesgo, enviarReservaCita },
  cargarMetricasDashboard,
  poblarTablaRiesgo,
  enviarReservaCita,
  cancelarCitaAlumno,
  cambiarEstatusCita,
  alternarTipoCita,
  verEvaluacionTutor,
  cambiarVistaEvaluacion,
  filtrarEvalAlumnosPorTutor,
  verEvaluacionAlumno,
  abrirPanel,
  cerrarPanel,
  alternarPanel,
  cerrarModal,
  editarAviso,
  guardarAviso,
  limpiarFormAviso,
  cambiarEstadoAviso,
  eliminarAviso,
  quitarDeGrupo,
  mostrarPerfilTutorado,
  abrirEditorPerfil,
  guardarPerfilTutorado,
  quitarFotoPerfil,
  elegirTutor,
  agregarBloqueHorario,
  guardarPerfilTutor,
  guardarCupoTutor,
  cambiarAceptaTutor,
  verTutoradosDe,
  verPerfilTutor,
  abrirEditorPerfilTutor,
  quitarFotoTutor,
  cerrarSesion,
});
