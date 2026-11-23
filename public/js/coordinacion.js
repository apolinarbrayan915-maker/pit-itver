/* =============================================================================
 * PIT ITVER · Módulo de Coordinación
 *   Se carga después de app.js (usa sus utilidades: $, api, escapeHtml, …).
 *   Tutores · Reportes (Periodo / Día / Semestral) · Evaluaciones anónimas · Avisos
 * ============================================================================= */
'use strict';

/* ---- Inicio: atajos ---------------------------------------------------------- */
function irAReporte(tipo) {
  switchTab('reportes');
  verInforme(tipo);
}

function nuevoAvisoDesdeInicio() {
  switchTab('avisos');
  nuevoAviso();
}

/* =============================================================================
 * TUTORES
 * ============================================================================= */
const TT = { filtro: 'todos' };

async function cargarAsignaciones() {
  const lista = $('tutores-lista');
  if (!lista) return;
  try {
    datosAsig = await api('/asignaciones');
    directorioTutores = []; // se recarga al abrir un perfil, con los cambios de cupo
    const { tutores, sin_tutor: sinTutor, periodo } = datosAsig;
    setText('asig-periodo', periodo);
    $('asig-alerta').classList.toggle('hidden', sinTutor === 0);
    setText('asig-alerta-texto', `${plural(sinTutor, 'tutorado aún no elige tutor', 'tutorados aún no eligen tutor')} en ${periodo}.`);
    pendientesCoord.sinTutor = sinTutor;
    pintarPendientesCoord();

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
    pintarTutores();
  } catch (err) {
    lista.innerHTML = `<li class="pt-cargando text-rose-600">${escapeHtml(err.message)}</li>`;
  }
}

const ocupacionDe = (t) => (t.max_tutorados ? t.total_tutorados / t.max_tutorados : 0);
const FILTROS_TUTOR = [
  ['todos', 'Todos', () => true],
  ['inscritos', 'Inscritos', () => true],
  ['referencia', 'Perfiles académicos', () => false],
  ['lugar', 'Con lugar', (t) => t.acepta_tutorados && t.total_tutorados < t.max_tutorados],
  ['llenos', 'Cupo lleno', (t) => t.total_tutorados >= t.max_tutorados],
  ['vacios', 'Sin tutorados', (t) => t.total_tutorados === 0],
  ['no', 'No reciben', (t) => !t.acepta_tutorados],
];

function filtrarTutores(f) {
  TT.filtro = f;
  pintarTutores();
}

function pintarTutores() {
  if (!datosAsig) return;
  const { tutores, sin_tutor: sinTutor, perfiles_materias: perfiles = [] } = datosAsig;
  const materiasPorTutor = new Map(perfiles.filter(p => p.tutor_id !== null).map(p => [p.tutor_id, p]));
  const referencias = perfiles.filter(p => p.tutor_id === null);
  const total = tutores.length + referencias.length;
  const asignados = tutores.reduce((s, t) => s + t.total_tutorados, 0);
  const cupo = tutores.reduce((s, t) => s + t.max_tutorados, 0);
  const reciben = tutores.filter((t) => t.acepta_tutorados);
  const libres = reciben.reduce((s, t) => s + Math.max(0, t.max_tutorados - t.total_tutorados), 0);
  const diplomado = tutores.filter((t) => /Diplomado/i.test(t.formacion_tutorial || '')).length;
  $('tt-resumen').innerHTML = [
    celdaResumen('Perfiles en el directorio', total, 'fa-chalkboard-user', 'tono-azul', `${tutores.length} inscritos · ${referencias.length} académicos`),
    celdaResumen('Tutorados asignados', asignados, 'fa-user-graduate', 'tono-verde', `${pct(asignados, cupo)}% del cupo total (${cupo})`),
    celdaResumen('Lugares disponibles', libres, 'fa-chair', libres ? 'tono-violeta' : 'tono-rojo', 'entre quienes reciben'),
    celdaResumen('Sin tutor', sinTutor, 'fa-user-clock', sinTutor ? 'tono-ambar' : 'tono-gris', sinTutor ? 'aún no eligen' : 'todos tienen tutor'),
    celdaResumen('Con diplomado', `${diplomado}/${tutores.length}`, 'fa-award', 'tono-azul', 'formación tutorial'),
  ].join('');

  $('tt-filtros').innerHTML = FILTROS_TUTOR.map(([k, etq, fn]) => {
    const n = k === 'todos' ? total : k === 'referencia' ? referencias.length : tutores.filter(fn).length;
    const on = TT.filtro === k;
    return `<button type="button" class="m3-chip ${on ? 'activo' : ''}" aria-pressed="${on}" onclick="filtrarTutores('${k}')"><i class="fa-solid fa-check"></i>${etq} <span class="cuenta">${n}</span></button>`;
  }).join('');

  const consulta = normalizarTexto($('tt-buscar').value.trim()).split(/\s+/).filter(Boolean);
  const coincide = (campos) => {
    const texto = normalizarTexto(campos.join(' '));
    return consulta.every(palabra => texto.includes(palabra));
  };
  const filtro = FILTROS_TUTOR.find(([k]) => k === TT.filtro)[2];
  const orden = $('tt-orden').value;
  const lista = tutores
    .filter(filtro)
    .filter((t) => {
      const perfil = materiasPorTutor.get(t.tutor_id);
      return coincide([t.nombre, t.cubiculo, t.rfc, ...(perfil?.materias ?? []), ...(perfil?.temas ?? [])]);
    })
    .sort((a, b) => (orden === 'ocupacion' ? ocupacionDe(b) - ocupacionDe(a)
      : orden === 'libres' ? (b.max_tutorados - b.total_tutorados) - (a.max_tutorados - a.total_tutorados) : 0));

  const filas = lista.map(t => filaTutorCoord(t, materiasPorTutor.get(t.tutor_id)));
  if (TT.filtro === 'todos' || TT.filtro === 'referencia') {
    filas.push(...referencias.filter(p => coincide([p.nombre, ...p.materias, ...p.temas])).map(filaReferenciaCoord));
  }
  $('tutores-lista').innerHTML = filas.length ? filas.join('')
    : '<li class="m3-vacio"><span class="m3-icono tono-gris"><i class="fa-solid fa-magnifying-glass"></i></span>Ningún perfil coincide con la búsqueda.</li>';
  paginar($('tutores-lista'), 5, 'tutores');
  if (TT.abierto) abrirTutoradosTutor(TT.abierto);
}

/* Tutorados de un tutor: se despliegan dentro de su fila, sin mover la página. */
function alternarTutoradosTutor(tutorId) {
  const previo = TT.abierto;
  cerrarTutoradosTutor();
  if (previo !== tutorId) abrirTutoradosTutor(tutorId);
}

function cerrarTutoradosTutor() {
  document.querySelectorAll('#tutores-lista .tt-detalle').forEach((d) => d.remove());
  document.querySelectorAll('#tutores-lista [aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  document.querySelectorAll('#tutores-lista .tt-fila.abierta').forEach((li) => li.classList.remove('abierta'));
  TT.abierto = null;
}

function abrirTutoradosTutor(tutorId) {
  const li = document.querySelector(`#tutores-lista .tt-fila[data-tutor="${tutorId}"]`);
  if (!li || !datosAsig) { TT.abierto = null; return; }
  TT.abierto = tutorId;
  li.classList.add('abierta');
  $(`tt-ver-${tutorId}`)?.setAttribute('aria-expanded', 'true');
  const suyos = datosAsig.tutorados.filter((x) => x.tutor_id === tutorId && x.asignacion_id)
    .sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo));
  const div = document.createElement('div');
  div.className = 'tt-detalle';
  div.innerHTML = suyos.length ? `<ul>${suyos.map((x) => `<li>
      <span class="m3-avatar chico">${escapeHtml(iniciales(x.nombre_completo))}</span>
      <span class="tt-det-nombre"><b>${escapeHtml(x.nombre_completo)}</b><small>${escapeHtml(x.no_control)} · ${x.semestre}° semestre</small></span>
      ${etiquetaRiesgo(x.nivel_riesgo)}
      <span class="tt-det-acc">
        <button type="button" class="m3-btn texto chico" onclick="mostrarPerfilTutorado(${x.tutorado_id})">Perfil</button>
        <button type="button" class="m3-btn texto chico" style="color:var(--t-rojo)" onclick='quitarDeGrupo(${x.asignacion_id}, ${escapeHtml(JSON.stringify(x.nombre_completo))})'>Retirar</button>
      </span></li>`).join('')}</ul>`
    : '<p class="tt-det-vacio">Este tutor aún no tiene tutorados.</p>';
  li.appendChild(div);
}

/* =============================================================================
 * PAGINACIÓN de listas y tablas largas (bloques de N con flechas y números).
 * Se reaplica sola cada vez que la lista se vuelve a pintar.
 * ============================================================================= */
const PAG = {};

function itemsPaginables(el) {
  const hijos = [...el.children].filter((h) => !h.classList.contains('pag-fija'));
  // Filas de "vacío" o "cargando" no se paginan.
  if (hijos.length === 1 && (hijos[0].querySelector('td[colspan]') || /m3-vacio|pt-cargando/.test(hijos[0].className))) return [];
  return hijos;
}

function paginar(el, tam, clave = el?.id) {
  if (!el) return;
  const st = PAG[clave] || (PAG[clave] = { pagina: 1, total: -1 });
  st.el = el; st.tam = tam;
  if (!st.observador) {
    st.observador = new MutationObserver(() => aplicarPagina(clave, true));
    st.observador.observe(el, { childList: true });
  }
  aplicarPagina(clave, true);
}

function aplicarPagina(clave, recalcular) {
  const st = PAG[clave];
  const items = itemsPaginables(st.el);
  if (recalcular && items.length !== st.total) st.pagina = 1; // otra búsqueda o filtro: volver al inicio
  st.total = items.length;
  const paginas = Math.max(1, Math.ceil(items.length / st.tam));
  st.pagina = Math.min(Math.max(1, st.pagina), paginas);
  const ini = (st.pagina - 1) * st.tam;
  items.forEach((it, i) => it.classList.toggle('pag-oculta', i < ini || i >= ini + st.tam));

  const ancla = st.el.closest('.overflow-x-auto') || st.el.closest('table') || st.el;
  let nav = ancla.nextElementSibling?.classList.contains('paginador') ? ancla.nextElementSibling : null;
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'paginador';
    nav.setAttribute('aria-label', 'Páginas');
    ancla.after(nav);
  }
  if (paginas <= 1) { nav.hidden = true; nav.innerHTML = ''; return; }
  nav.hidden = false;
  const p = st.pagina;
  const numeros = [];
  for (let n = 1; n <= paginas; n += 1) {
    if (paginas <= 7 || n === 1 || n === paginas || Math.abs(n - p) <= 1) numeros.push(n);
    else if (numeros[numeros.length - 1] !== '…') numeros.push('…');
  }
  nav.innerHTML = `<span class="pag-info">${ini + 1}–${Math.min(ini + st.tam, items.length)} de ${items.length}</span>
    <span class="pag-botones">
      <button type="button" class="pag-flecha" onclick="irPagina('${clave}', ${p - 1})" ${p === 1 ? 'disabled' : ''} aria-label="Página anterior"><i class="fa-solid fa-chevron-left"></i></button>
      ${numeros.map((n) => (n === '…' ? '<span class="pag-puntos">…</span>'
        : `<button type="button" class="pag-num${n === p ? ' activo' : ''}" onclick="irPagina('${clave}', ${n})" ${n === p ? 'aria-current="page"' : ''}>${n}</button>`)).join('')}
      <button type="button" class="pag-flecha" onclick="irPagina('${clave}', ${p + 1})" ${p === paginas ? 'disabled' : ''} aria-label="Página siguiente"><i class="fa-solid fa-chevron-right"></i></button>
    </span>`;
}

function irPagina(clave, n) {
  const st = PAG[clave];
  if (!st) return;
  st.pagina = n;
  aplicarPagina(clave, false);
  // Si el inicio de la lista quedó fuera de la vista, regresar a él (solo hacia arriba).
  const cab = (st.el.closest('table') || st.el).getBoundingClientRect();
  if (cab.top < 70) (st.el.closest('table') || st.el).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function detalleMateriasCoord(p) {
  const ficha = p.fichas.find(url => /^https:\/\/misprofesores\.com\/profesores\/_\d+$/.test(url));
  return `<details class="mt-1 text-xs">
    <summary class="cursor-pointer font-semibold">Materias reportadas por estudiantes</summary>
    <p class="mt-1">${escapeHtml(p.materias.join(' · '))}</p>
    ${p.temas.length ? `<p class="mt-1">Temas inferidos · ${escapeHtml(p.temas.join(' · '))}</p>` : ''}
    ${ficha ? `<a class="mt-1 block underline" href="${escapeHtml(ficha)}" target="_blank" rel="noopener noreferrer">Ficha en MisProfesores</a>` : ''}
  </details>`;
}

function filaReferenciaCoord(p) {
  return `<li class="tt-fila tt-referencia">
    <div class="tt-quien">
      <span class="m3-avatar tono-gris">${escapeHtml(iniciales(p.nombre))}</span>
      <div class="min-w-0">
        <b>${escapeHtml(p.nombre)}</b>
        <span class="tt-meta">Perfil académico · Sin alta como tutor</span>
        ${detalleMateriasCoord(p)}
        <button type="button" class="m3-btn texto chico" onclick="abrirAltaPerfil('${escapeHtml(p.id)}')">Dar de alta como tutor</button>
      </div>
    </div>
  </li>`;
}

function abrirAltaPerfil(id) {
  const p = datosAsig?.perfiles_materias?.find(perfil => perfil.id === id);
  if (!p) return;
  const alta = p.alta_propuesta;
  const dias = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const bloque = i => `${dias[alta['dia_' + i]]} ${alta['inicio_' + i].slice(0, 5)}–${alta['fin_' + i].slice(0, 5)}`;
  modalSimple('modal-alta-perfil', 'Dar de alta a ' + p.nombre, `
    <form id="tt-alta-form" class="space-y-3">
      <p class="text-sm">Usa la cuenta institucional del docente. El cupo y el cubículo se aplican al crear un alta nueva.</p>
      <label class="block text-sm">Correo institucional
        <input name="correo" type="email" required value="${escapeHtml(alta?.correo || '')}" class="block w-full rounded-lg border p-2">
      </label>
      <label class="block text-sm">Cupo autorizado
        <input name="cupo" type="number" min="1" max="60" required value="${escapeHtml(alta?.cupo ?? '')}" class="block w-full rounded-lg border p-2">
      </label>
      <label class="block text-sm">Cubículo confirmado (opcional)
        <input name="cubiculo" maxlength="40" value="${escapeHtml(alta?.cubiculo || '')}" class="block w-full rounded-lg border p-2">
      </label>
      ${alta ? `<label class="block text-sm"><input name="horario" type="checkbox">
        Aplicar bloques para el alta nueva · ${escapeHtml(bloque(1))} · ${escapeHtml(bloque(2))}
      </label>` : ''}
      <p id="tt-alta-estado" class="text-sm" role="status"></p>
      <button type="submit" class="m3-btn lleno">Confirmar alta</button>
    </form>`);
  const form = $('tt-alta-form');
  form.elements.correo.focus();
  form.onsubmit = async event => {
    event.preventDefault();
    const boton = form.querySelector('button[type="submit"]');
    const estado = $('tt-alta-estado');
    const valores = new FormData(form);
    boton.disabled = true;
    estado.textContent = 'Guardando…';
    try {
      await api('/tutores/catalogo-materias/' + encodeURIComponent(id) + '/vinculo', {
        method: 'PUT', body: {
          correo: valores.get('correo'), cupo: valores.get('cupo'), cubiculo: valores.get('cubiculo'),
          usar_horario_catalogo: valores.has('horario'),
        },
      });
      cerrarModal('modal-alta-perfil');
      toast('Docente vinculado al PIT.');
      TT.filtro = 'inscritos';
      $('tt-buscar').value = p.nombre;
      await cargarAsignaciones();
    } catch (err) {
      estado.textContent = err.message;
    } finally {
      boton.disabled = false;
    }
  };
}

function filaTutorCoord(t, materias) {
  const p = Math.round(ocupacionDe(t) * 100);
  const tono = p >= 100 ? 'tono-rojo' : p >= 80 ? 'tono-ambar' : 'tono-azul';
  const diplomado = /Diplomado/i.test(t.formacion_tutorial || '');
  const cub = t.cubiculo ? (/^cub/i.test(t.cubiculo) ? t.cubiculo : `Cubículo ${t.cubiculo}`).replace(', Edificio', ' · Edif.') : 'Sin cubículo';
  const nombre = escapeHtml(t.nombre);
  return `<li class="tt-fila${t.acepta_tutorados ? '' : ' apagada'}" data-tutor="${t.tutor_id}">
    <div class="tt-quien">
      <span class="m3-avatar ${t.acepta_tutorados ? 'tono-azul' : 'tono-gris'}">${escapeHtml(iniciales(t.nombre))}</span>
      <div class="min-w-0">
        <b>${nombre}</b>
        <span class="tt-meta">${escapeHtml(cub)}
          <i class="tt-punto"></i><span class="${diplomado ? 'ok' : 'aviso'}" title="Formación tutorial"><i class="fa-solid ${diplomado ? 'fa-award' : 'fa-hourglass-half'}"></i>${escapeHtml(t.formacion_tutorial || 'Sin formación registrada')}</span>
          <i class="tt-punto"></i><span class="${t.bloques_horario ? '' : 'mal'}"><i class="fa-regular fa-clock"></i>${t.bloques_horario ? plural(t.bloques_horario, 'bloque', 'bloques') : 'Sin horario'}</span>
        </span>
        ${materias ? detalleMateriasCoord(materias) : ''}
      </div>
    </div>
    <div class="tt-ocup ${tono}" title="${p}% del cupo">
      <div class="m3-progreso"><span style="width:${Math.min(p, 100)}%"></span></div>
      <span class="num"><b>${t.total_tutorados}</b>/${t.max_tutorados}</span>
    </div>
    <div class="tt-cupo">
      <span class="m3-paso">
        <button type="button" onclick="pasoCupo(${t.tutor_id}, -1)" aria-label="Reducir cupo de ${nombre}"><i class="fa-solid fa-minus text-[10px]"></i></button>
        <input type="number" id="cupo-${t.tutor_id}" data-original="${t.max_tutorados}" min="${Math.max(1, t.total_tutorados)}" max="60" value="${t.max_tutorados}" aria-label="Cupo de ${nombre}" oninput="pasoCupo(${t.tutor_id}, 0)">
        <button type="button" onclick="pasoCupo(${t.tutor_id}, 1)" aria-label="Aumentar cupo de ${nombre}"><i class="fa-solid fa-plus text-[10px]"></i></button>
      </span>
      <button type="button" id="cupo-guardar-${t.tutor_id}" onclick="guardarCupoTutor(${t.tutor_id})" class="m3-btn lleno chico hidden">Guardar</button>
    </div>
    <label class="m3-switch tt-recibe" for="acepta-${t.tutor_id}" title="${t.acepta_tutorados ? 'Recibe tutorados' : 'No recibe tutorados'}">
      <input type="checkbox" id="acepta-${t.tutor_id}" ${t.acepta_tutorados ? 'checked' : ''} onchange="cambiarAceptaTutor(${t.tutor_id}, this.checked)"><span class="riel"></span>
      <span class="tt-recibe-txt">${t.acepta_tutorados ? 'Recibe' : 'No recibe'}</span>
    </label>
    <div class="tt-acciones">
      <button type="button" class="m3-btn-icono" onclick="verPerfilTutor(${t.tutor_id})" title="Ver perfil" aria-label="Ver perfil de ${nombre}"><i class="fa-regular fa-id-card"></i></button>
      <button type="button" class="m3-btn tonal chico" id="tt-ver-${t.tutor_id}" onclick="alternarTutoradosTutor(${t.tutor_id})" aria-expanded="false" title="Ver sus tutorados" ${t.total_tutorados ? '' : 'disabled'}><i class="fa-solid fa-users"></i> ${t.total_tutorados}<i class="fa-solid fa-chevron-down tt-flecha"></i></button>
    </div>
  </li>`;
}

function pasoCupo(tutorId, delta) {
  const input = $(`cupo-${tutorId}`);
  const v = Math.min(Number(input.max), Math.max(Number(input.min), (Number(input.value) || 0) + delta));
  if (delta) input.value = v;
  $(`cupo-guardar-${tutorId}`).classList.toggle('hidden', String(input.value) === input.dataset.original);
}

/* =============================================================================
 * REPORTES DEL PROGRAMA (Periodo · Día · Semestral)
 * ============================================================================= */
let repSemestre = null;
let repRango = null;

async function cargarReportesCoord() {
  try {
    repSemestre = await api('/reportes/programa');
    const sem = repSemestre.semestre;
    setText('crep-semestre', sem.nombre);
    ['cinf-desde', 'cinf-hasta'].forEach((id) => { $(id).min = sem.inicio; $(id).max = sem.fin; });
    if (!$('cinf-desde').value) { $('cinf-desde').value = sem.inicio; $('cinf-hasta').value = sem.fin; }
    cargarInformeCoord();
    pintarSemestralCoord(repSemestre);
  } catch (err) {
    ['cinf-cuerpo', 'csem-cuerpo'].forEach((id) => { $(id).innerHTML = `<p class="pt-cargando text-rose-600">${escapeHtml(err.message)}</p>`; });
  }
}

function presetInformeCoord(v) {
  const sem = repSemestre?.semestre;
  if (!sem || v === 'custom') { $('cinf-desde').focus(); return; }
  const hoy = new Date(`${hoyLocal()}T12:00:00`);
  let ini = sem.inicio;
  let fin = sem.fin;
  if (v === 'mes') { ini = ymdLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); fin = ymdLocal(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)); }
  if (v === 'mes-ant') { ini = ymdLocal(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)); fin = ymdLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 0)); }
  if (v === '30') { const x = new Date(hoy); x.setDate(x.getDate() - 29); ini = ymdLocal(x); fin = hoyLocal(); }
  $('cinf-desde').value = ini < sem.inicio ? sem.inicio : ini;
  $('cinf-hasta').value = fin > sem.fin ? sem.fin : fin;
  cargarInformeCoord();
}

function cambioRangoCoord() {
  $('cinf-preset').value = 'custom';
  cargarInformeCoord();
}

const fechaLarga = (ymd) => partesCita({ fecha_hora_local: `${ymd}T00:00` }).larga;

async function cargarInformeCoord() {
  const desde = $('cinf-desde').value;
  const hasta = $('cinf-hasta').value;
  if (!desde || !hasta) return;
  if (desde > hasta) { toast('La fecha inicial debe ser anterior a la final.', 'error'); return; }
  const dias = Math.round((new Date(`${hasta}T12:00:00`) - new Date(`${desde}T12:00:00`)) / 86400000) + 1;
  setText('cinf-desc', `Del ${fechaLarga(desde)} al ${fechaLarga(hasta)} · ${plural(dias, 'día', 'días')}`);
  try {
    const sem = repSemestre.semestre;
    repRango = desde === sem.inicio && hasta === sem.fin ? repSemestre : await api('/reportes/programa', { query: { desde, hasta } });
    pintarInformeCoord(repRango);
  } catch (err) {
    $('cinf-cuerpo').innerHTML = `<p class="pt-cargando text-rose-600">${escapeHtml(err.message)}</p>`;
  }
}

/** Seis indicadores del programa en el rango. */
function celdasPrograma(rep) {
  const t = rep.totales;
  const cerr = Object.values(rep.canalizaciones_por_area).reduce((s, a) => s + a.cerradas, 0);
  return `<div class="pt-resumen seis">
    ${celdaResumen('Tutores con sesiones', `${t.tutores_activos}/${t.tutores}`, 'fa-chalkboard-user', 'tono-azul', `${pct(t.tutores_activos, t.tutores)}% de la plantilla`)}
    ${celdaResumen('Tutorados atendidos', `${t.atendidos}/${t.tutorados}`, 'fa-users', 'tono-verde', `${pct(t.atendidos, t.tutorados)}% de los asignados`)}
    ${celdaResumen('Sesiones atendidas', t.sesiones, 'fa-user-check', 'tono-violeta', t.sesiones + t.inasistencias ? `${pct(t.sesiones, t.sesiones + t.inasistencias)}% de asistencia` : '')}
    ${celdaResumen('Tiempo de tutoría', fmtMin(t.minutos), 'fa-clock', 'tono-azul', t.sesiones ? `${Math.round(t.minutos / t.sesiones)} min por sesión` : '')}
    ${celdaResumen('Minutas', t.minutas, 'fa-file-circle-check', 'tono-ambar', t.sesiones ? `${pct(t.minutas, t.sesiones)}% de las sesiones` : '')}
    ${celdaResumen('Canalizaciones', t.canalizaciones, 'fa-share-nodes', 'tono-rojo', t.canalizaciones ? `${cerr} atendidas o cerradas` : '')}
  </div>`;
}

const fechaCortaInf = (ymd) => (ymd ? escapeHtml(partesCita({ fecha_hora_local: `${ymd}T00:00` }).corta) : '—');
const barraMini = (v, total, tono) => `<span class="cr-mini ${tono}"><span style="width:${total ? Math.min(100, (v / total) * 100) : 0}%"></span></span>`;

function pintarInformeCoord(rep) {
  const t = rep.totales;
  const sinSesion = rep.por_tutor.filter((x) => x.tutorados > 0 && x.sesiones === 0);
  const pend = [];
  if (sinSesion.length) pend.push(['fa-user-slash', `${plural(sinSesion.length, 'tutor', 'tutores')} con tutorados y sin sesiones`, `resaltarSinSesion()`]);
  if (t.tutores - t.evaluaciones_pit) pend.push(['fa-clipboard-check', `${plural(t.tutores - t.evaluaciones_pit, 'evaluación', 'evaluaciones')} del PIT sin enviar`, "switchTab('evaluaciones')"]);
  if (t.tutorados - t.atendidos) pend.push(['fa-user-clock', `${plural(t.tutorados - t.atendidos, 'tutorado', 'tutorados')} sin sesión en el periodo`, "switchTab('riesgo')"]);
  const r = rep.riesgo;
  const mini = (titulo, filas) => `<div class="inf-mini"><h5>${titulo}</h5><dl>${filas.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></div>`;
  const areas = Object.keys(AREA_NOMBRE).map((a) => [escapeHtml(AREA_NOMBRE[a]), rep.canalizaciones_por_area[a] ? `${rep.canalizaciones_por_area[a].total} <small>(${rep.canalizaciones_por_area[a].cerradas} cerradas)</small>` : 0]);
  const orden = [...rep.por_tutor].sort((a, b) => b.sesiones - a.sesiones || a.nombre.localeCompare(b.nombre));
  $('cinf-cuerpo').innerHTML = `
    ${pend.length
      ? `<div class="inf-pendientes"><span><i class="fa-solid fa-list-check"></i> Para revisar</span>${pend.map(([i, txt, a]) => `<button type="button" onclick="${a}"><i class="fa-solid ${i}"></i>${escapeHtml(txt)}</button>`).join('')}</div>`
      : '<div class="inf-pendientes listo"><span><i class="fa-solid fa-circle-check"></i> Todos los tutores tienen actividad en el periodo.</span></div>'}
    ${celdasPrograma(rep)}
    <details class="inf-desglose">
      <summary>Ver desglose completo</summary>
      <div class="inf-minis">
        ${mini('Riesgo de los tutorados', [['Crítico', r['CRÍTICO'] || 0], ['Alto', r.ALTO || 0], ['Medio', r.MEDIO || 0], ['Sin riesgo', r.BAJO || 0]])}
        ${mini('Sesiones', [['Presenciales', rep.modalidad.Presencial || 0], ['En línea', rep.modalidad['Línea'] || 0], ['Inasistencias', t.inasistencias], ['Programadas (próximas)', t.programadas]])}
        ${mini('Canalizaciones por área', areas)}
      </div>
    </details>
    <h4 class="inf-sub">Acción tutorial por tutor</h4>
    <div class="overflow-x-auto"><table class="tabla-compacta cr-tabla">
      <thead><tr><th>Tutor(a)</th><th>Atendidos</th><th class="der">Sesiones</th><th class="der">Tiempo</th><th class="der">Faltas</th><th class="der">Minutas</th><th class="cen">Canal.</th><th class="cen">Eval. PIT</th><th>Última sesión</th></tr></thead>
      <tbody>${orden.map((x) => `<tr data-sin-sesion="${x.tutorados > 0 && x.sesiones === 0 ? 1 : 0}">
        <td><b>${escapeHtml(x.nombre)}</b><small>${plural(x.tutorados, 'tutorado', 'tutorados')}${x.en_riesgo ? ` · ${x.en_riesgo} en riesgo` : ''}</small></td>
        <td class="num"><span class="cr-atend">${barraMini(x.atendidos, x.tutorados, x.atendidos >= x.tutorados ? 'tono-verde' : 'tono-azul')}${x.atendidos}/${x.tutorados}</span></td>
        <td class="der num ${x.tutorados && !x.sesiones ? 'text-rose-600 font-bold' : ''}">${x.sesiones}</td>
        <td class="der num">${x.minutos ? fmtMin(x.minutos) : '—'}</td>
        <td class="der num">${x.inasistencias || '—'}</td>
        <td class="der num">${x.sesiones ? `${x.minutas}/${x.sesiones}` : '—'}</td>
        <td class="cen">${x.canalizaciones ? `<b>${x.canalizaciones}</b>` : '<span class="text-slate-300">—</span>'}</td>
        <td class="cen">${x.evaluacion_pit ? '<i class="fa-solid fa-circle-check text-emerald-600" title="Enviada"></i>' : '<span class="text-amber-700 font-semibold">Pendiente</span>'}</td>
        <td class="num capitalize">${fechaCortaInf(x.ultima_sesion)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  paginar(document.querySelector('#cinf-cuerpo .cr-tabla tbody'), 10, 'rep-periodo');
}

function resaltarSinSesion() {
  const filas = [...document.querySelectorAll('#cinf-cuerpo tr[data-sin-sesion="1"]')];
  filas.forEach((f) => { f.classList.add('cr-resalta'); setTimeout(() => f.classList.remove('cr-resalta'), 2400); });
  filas[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function estadoTutorSemestre(x) {
  if (!x.tutorados) return ['tono-gris', 'Sin tutorados'];
  const cob = x.atendidos / x.tutorados;
  if (cob >= 0.8 && x.evaluacion_pit && (!x.sesiones || x.minutas / x.sesiones >= 0.7)) return ['tono-verde', 'Al día'];
  if (cob < 0.5 || !x.sesiones) return ['tono-rojo', 'Requiere atención'];
  return ['tono-ambar', 'En proceso'];
}

function pintarSemestralCoord(rep) {
  const sem = rep.semestre;
  setText('csem-desc', `${sem.nombre} · del ${fechaLarga(sem.inicio)} al ${fechaLarga(sem.fin)}`);
  const max = Math.max(1, ...rep.por_mes.map((m) => m.sesiones));
  const meses = rep.por_mes.map((m) => {
    const [, mm] = m.mes.split('-').map(Number);
    return `<li><span class="cr-mes">${MESES[mm - 1]}</span>
      <span class="cr-barra"><span style="width:${(m.sesiones / max) * 100}%"></span></span>
      <span class="cr-val"><b>${m.sesiones}</b> ${m.sesiones === 1 ? 'sesión' : 'sesiones'} · ${fmtMin(m.minutos)}</span></li>`;
  }).join('');
  const conteo = { 'tono-verde': 0, 'tono-ambar': 0, 'tono-rojo': 0, 'tono-gris': 0 };
  const filas = [...rep.por_tutor].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((x) => {
    const [tono, etq] = estadoTutorSemestre(x);
    conteo[tono] += 1;
    const cob = pct(x.atendidos, x.tutorados);
    return `<tr>
      <td><b>${escapeHtml(x.nombre)}</b><small>${plural(x.tutorados, 'tutorado', 'tutorados')} de ${x.max_tutorados}</small></td>
      <td class="num"><span class="cr-atend">${barraMini(x.atendidos, x.tutorados, cob >= 80 ? 'tono-verde' : cob >= 50 ? 'tono-ambar' : 'tono-rojo')}${x.tutorados ? `${cob}%` : '—'}</span></td>
      <td class="der num">${x.sesiones}</td>
      <td class="der num">${x.minutos ? fmtMin(x.minutos) : '—'}</td>
      <td class="der num">${x.sesiones ? `${pct(x.minutas, x.sesiones)}%` : '—'}</td>
      <td class="cen">${x.canalizaciones || '<span class="text-slate-300">—</span>'}</td>
      <td class="cen">${x.evaluacion_pit ? '<i class="fa-solid fa-circle-check text-emerald-600" title="Enviada"></i>' : '<i class="fa-regular fa-circle text-slate-300" title="Pendiente"></i>'}</td>
      <td><span class="m3-etiqueta ${tono}">${etq}</span></td>
    </tr>`;
  }).join('');
  $('csem-cuerpo').innerHTML = `
    ${celdasPrograma(rep)}
    <div class="cr-dos">
      <div class="cr-bloque"><h4 class="inf-sub">Sesiones por mes</h4><ul class="cr-meses">${meses || '<li class="pt-cargando">Sin sesiones.</li>'}</ul></div>
      <div class="cr-bloque"><h4 class="inf-sub">Cumplimiento de los tutores</h4>
        <ul class="cr-semaforo">
          <li class="tono-verde"><b>${conteo['tono-verde']}</b><span>Al día</span></li>
          <li class="tono-ambar"><b>${conteo['tono-ambar']}</b><span>En proceso</span></li>
          <li class="tono-rojo"><b>${conteo['tono-rojo']}</b><span>Requieren atención</span></li>
        </ul>
        <p class="cr-nota">"Al día": atendió al 80% o más de sus tutorados, registró minuta en al menos 70% de las sesiones y envió la evaluación del PIT.</p>
      </div>
    </div>
    <h4 class="inf-sub">Concentrado por tutor</h4>
    <div class="overflow-x-auto"><table class="tabla-compacta cr-tabla">
      <thead><tr><th>Tutor(a)</th><th>Cobertura</th><th class="der">Sesiones</th><th class="der">Tiempo</th><th class="der">Con minuta</th><th class="cen">Canal.</th><th class="cen">Eval. PIT</th><th>Estado</th></tr></thead>
      <tbody>${filas}</tbody></table></div>`;
  paginar(document.querySelector('#csem-cuerpo .cr-tabla tbody'), 10, 'rep-semestral');
}

function htmlInformeProgramaHoja(rep, titulo, semestral) {
  const t = rep.totales;
  const r = rep.riesgo;
  const par = (a, va, b, vb) => `<tr><th>${a}</th><td>${va}</td><th>${b}</th><td>${vb}</td></tr>`;
  const area = Object.entries(rep.canalizaciones_por_area).map(([a, v]) => `${escapeHtml(AREA_NOMBRE[a] || a)} (${v.total})`).join(', ') || 'Ninguna';
  const meses = semestral && rep.por_mes.length
    ? `<p class="hd-linea-texto"><b>Sesiones por mes:</b> ${rep.por_mes.map((m) => `${MESES_LARGOS[Number(m.mes.slice(5)) - 1]} ${m.sesiones}`).join(' · ')}.</p>` : '';
  const filas = [...rep.por_tutor].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((x, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(x.nombre)}</td><td>${x.atendidos}/${x.tutorados}</td><td>${x.sesiones}</td><td>${x.minutos ? fmtMin(x.minutos) : '—'}</td><td>${x.minutas}</td><td>${x.canalizaciones}</td><td>${x.evaluacion_pit ? 'Sí' : 'No'}</td></tr>`).join('');
  return `${encabezadoHoja(titulo, `<p>Veracruz, Ver., a ${escapeHtml(fechaLargaHoy())}</p>`)}
    <div class="hd-campos">
      ${campoHoja('Programa educativo:', 'Ingeniería en Sistemas Computacionales')}
      <div class="hd-fila">${campoHoja('Periodo:', `${fechaLarga(rep.periodo.inicio)} al ${fechaLarga(rep.periodo.fin)}`, 'hd-ancho')}${campoHoja('Ciclo:', rep.periodo_escolar)}</div>
    </div>
    <div class="hd-bloque"><span>Resumen del programa:</span></div>
    <table class="hd-tabla hd-resumen"><tbody>
      ${par('Tutores en el programa', t.tutores, 'Tutores con sesiones', `${t.tutores_activos} (${pct(t.tutores_activos, t.tutores)}%)`)}
      ${par('Tutorados asignados', t.tutorados, 'Tutorados atendidos', `${t.atendidos} (${pct(t.atendidos, t.tutorados)}%)`)}
      ${par('Riesgo crítico / alto', `${r['CRÍTICO'] || 0} / ${r.ALTO || 0}`, 'Riesgo medio / sin riesgo', `${r.MEDIO || 0} / ${r.BAJO || 0}`)}
      ${par('Sesiones atendidas', t.sesiones, 'Inasistencias', t.inasistencias)}
      ${par('Tiempo total de tutoría', fmtMin(t.minutos), 'Minutas registradas', t.minutas)}
      ${par('Canalizaciones', t.canalizaciones, 'Evaluaciones del PIT enviadas', `${t.evaluaciones_pit} de ${t.tutores}`)}
    </tbody></table>
    <p class="hd-linea-texto"><b>Canalizaciones por área:</b> ${area}.</p>
    ${meses}
    <div class="hd-bloque"><span>Acción tutorial por tutor:</span></div>
    <table class="hd-tabla"><thead><tr><th>No.</th><th>Tutor(a)</th><th>Atendidos</th><th>Sesiones</th><th>Tiempo</th><th>Minutas</th><th>Canal.</th><th>Eval. PIT</th></tr></thead><tbody>${filas}</tbody></table>
    <table class="hd-firmas"><tr>
      <td><span class="hd-linea"></span><b>&nbsp;</b>Coordinación de Tutorías</td>
      <td><span class="hd-linea"></span><b>&nbsp;</b>Jefatura del Departamento</td>
    </tr></table>`;
}

async function imprimirInformeCoord() {
  const rep = repRango || repSemestre;
  if (!rep) return toast('El informe aún se está cargando.', 'error');
  await imprimirHoja(htmlInformeProgramaHoja(rep, 'Informe del periodo del Programa Institucional de Tutorías'), `Informe PIT ${rep.periodo.inicio} a ${rep.periodo.fin}`);
}

async function imprimirSemestralCoord() {
  if (!repSemestre) return toast('El reporte aún se está cargando.', 'error');
  await imprimirHoja(htmlInformeProgramaHoja(repSemestre, 'Reporte semestral del Programa Institucional de Tutorías', true), `Reporte semestral PIT ${repSemestre.semestre.nombre}`);
}

/* =============================================================================
 * EVALUACIONES (anónimas: solo concentrados)
 * ============================================================================= */
const EVC = { vista: 'tutores', tutor: '', orden: { tutores: 'cuestionario', alumnos: 'cuestionario' }, datos: {} };
const ESCALA_EV = [[1, 'Siempre'], [2, 'Casi siempre'], [3, 'A veces'], [4, 'Casi nunca'], [5, 'Nunca']];

function cambiarVistaEvaluacion(vista) {
  EVC.vista = vista;
  ['tutores', 'alumnos'].forEach((v) => {
    $(`eval-vista-${v}`).classList.toggle('hidden', v !== vista);
    const b = $(`evalbtn-${v}`);
    b.classList.toggle('activo', v === vista);
    b.setAttribute('aria-selected', String(v === vista));
  });
  if (!EVC.datos[vista]) cargarEvaluacionesCoord();
}

function llenarPeriodosEval(actual) {
  const sel = $('eval-periodo');
  if (sel.options.length) return;
  const [anio, sm] = actual.split('-').map(Number);
  const lista = [actual, sm === 2 ? `${anio}-1` : `${anio - 1}-2`, sm === 2 ? `${anio - 1}-2` : `${anio - 1}-1`];
  sel.innerHTML = lista.map((p) => `<option value="${p}">Periodo ${p}</option>`).join('');
}

async function cargarEvaluacionesCoord() {
  const periodo = $('eval-periodo').value || undefined;
  const vista = EVC.vista;
  const cont = $(`eval-vista-${vista}`);
  try {
    if (vista === 'tutores') {
      const r = await api('/evaluaciones/resumen', { query: { periodo } });
      EVC.datos.tutores = r;
      llenarPeriodosEval(r.periodo);
      if (!periodo || $('eval-periodo').selectedIndex === 0) { pendientesCoord.evaluaciones = r.total_tutores - r.respondidas; pintarPendientesCoord(); }
      pintarEvalTutores(r);
    } else {
      const r = await api('/evaluaciones/alumnos/resumen', { query: { periodo, tutor_id: EVC.tutor } });
      EVC.datos.alumnos = r;
      llenarPeriodosEval(r.periodo);
      pintarEvalAlumnos(r);
    }
    // Al cambiar de periodo, la otra vista se recarga cuando se abra
    EVC.datos[vista === 'tutores' ? 'alumnos' : 'tutores'] = null;
  } catch (err) {
    cont.innerHTML = `<p class="pt-cargando text-rose-600">${escapeHtml(err.message)}</p>`;
  }
}

const tonoFavorable = (p) => (p === null || p === undefined ? 'tono-gris' : p >= 75 ? 'tono-verde' : p >= 50 ? 'tono-ambar' : 'tono-rojo');

function anilloHtml(valor) {
  const R = 42; const C = 2 * Math.PI * R;
  const v = Math.max(0, Math.min(100, valor || 0));
  return `<div class="ev-anillo ${tonoFavorable(valor)}"><svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="${R}" class="pista"></circle>
      <circle cx="50" cy="50" r="${R}" class="valor" stroke-dasharray="${(v / 100) * C} ${C}"></circle></svg>
      <b>${valor === null ? '—' : `${Math.round(valor)}%`}</b></div>`;
}

function barraLikert(dist, total, alto = false) {
  if (!dist || !total) return '<span class="ev-sin">Sin datos</span>';
  return `<span class="ev-barra${alto ? ' alta' : ''}" role="img" aria-label="${ESCALA_EV.map(([v, e]) => `${e}: ${dist[v] || 0}`).join(', ')}">${
    ESCALA_EV.map(([v, e]) => (dist[v] ? `<span class="ev-l${v}" style="width:${(dist[v] / total) * 100}%" title="${e}: ${dist[v]} (${Math.round((dist[v] / total) * 100)}%)"></span>` : '')).join('')}</span>`;
}

const leyendaLikert = () => `<div class="ev-leyenda">${ESCALA_EV.map(([v, e]) => `<span><i class="ev-l${v}"></i>${e}</span>`).join('')}</div>`;

function resumenEvalHtml(r, { quien, participantes, faltan }) {
  const total = r.distribucion_general ? Object.values(r.distribucion_general).reduce((s, x) => s + x, 0) : 0;
  const porcentajes = r.distribucion_general ? ESCALA_EV.map(([v, e]) => `<li><i class="ev-l${v}"></i>${e}<b>${pct(r.distribucion_general[v], total)}%</b></li>`).join('') : '';
  return `<div class="ev-resumen">
    <section class="m3-card ev-tarjeta">
      ${anilloHtml(r.pct_favorable_general)}
      <div><h4>Respuestas favorables</h4>
        <p>${r.pct_favorable_general === null ? 'Se mostrará cuando haya suficientes respuestas.' : `De todas las respuestas, ${Math.round(r.pct_favorable_general)}% fueron <b>Siempre</b> o <b>Casi siempre</b>.`}</p>
        ${r.promedio_general !== null ? `<span class="m3-etiqueta ${tonoFavorable(r.pct_favorable_general)}">Promedio ${num(r.promedio_general, 2)} · ${escapeHtml(etiquetaLikert(r.promedio_general))}</span>` : ''}</div>
    </section>
    <section class="m3-card ev-tarjeta col">
      <h4>Participación</h4>
      <p class="ev-grande"><b>${r.respondidas}</b> de ${participantes} ${quien}</p>
      <div class="m3-progreso ${r.pct_participacion >= 70 ? 'tono-verde' : 'tono-ambar'}"><span style="width:${Math.min(100, r.pct_participacion)}%"></span></div>
      ${faltan || `<p class="ev-sub">${Math.round(r.pct_participacion)}% respondió la evaluación.</p>`}
    </section>
    <section class="m3-card ev-tarjeta col">
      <h4>Cómo respondieron</h4>
      ${r.distribucion_general ? `${barraLikert(r.distribucion_general, total, true)}<ul class="ev-pcts">${porcentajes}</ul>` : '<p class="ev-sub">Sin datos suficientes.</p>'}
    </section>
  </div>`;
}

function insuficienteHtml(r, de) {
  return `<section class="m3-card ev-reservado">
    <span class="m3-icono tono-violeta"><i class="fa-solid fa-user-lock"></i></span>
    <div><h4>Resultados reservados para proteger el anonimato</h4>
    <p>${de} lleva ${plural(r.respondidas, 'respuesta', 'respuestas')}. Los resultados se muestran a partir de ${r.minimo_respuestas}, para que nadie pueda deducir quién respondió qué.</p></div>
  </section>`;
}

function destacadosHtml(items) {
  const con = items.filter((i) => i.pct_favorable !== null);
  if (con.length < 2) return '';
  const orden = [...con].sort((a, b) => b.pct_favorable - a.pct_favorable || a.promedio - b.promedio);
  const lista = (arr) => arr.map((i) => `<li><span class="ev-pct ${tonoFavorable(i.pct_favorable)}">${Math.round(i.pct_favorable)}%</span><p>${escapeHtml(i.texto)}</p></li>`).join('');
  return `<div class="ev-dos">
    <section class="m3-card ev-dest bien"><h4><i class="fa-solid fa-thumbs-up"></i> Fortalezas</h4><ul>${lista(orden.slice(0, 3))}</ul></section>
    <section class="m3-card ev-dest mal"><h4><i class="fa-solid fa-seedling"></i> Áreas de oportunidad</h4><ul>${lista(orden.slice(-3).reverse())}</ul></section>
  </div>`;
}

function ordenarEval(vista, orden) {
  EVC.orden[vista] = orden;
  if (vista === 'tutores') pintarEvalTutores(EVC.datos.tutores);
  else pintarEvalAlumnos(EVC.datos.alumnos);
}

function itemsHtml(items, vista, prefijo) {
  const orden = EVC.orden[vista];
  const lista = orden === 'favorable' ? [...items].sort((a, b) => (b.pct_favorable ?? -1) - (a.pct_favorable ?? -1)) : items;
  const seg = (k, etq) => `<button type="button" class="${orden === k ? 'activo' : ''}" aria-pressed="${orden === k}" onclick="ordenarEval('${vista}', '${k}')">${etq}</button>`;
  return `<section class="m3-card">
    <div class="ev-items-cab"><div><h4>Resultados por pregunta</h4>${leyendaLikert()}</div>
      <div class="ev-orden" role="group" aria-label="Ordenar">${seg('cuestionario', 'Orden del cuestionario')}${seg('favorable', 'Más a menos favorable')}</div></div>
    <ol class="ev-items">${lista.map((i) => `<li>
      <span class="ev-num">${prefijo}${escapeHtml(i.numero || i.clave.replace(/^p/, ''))}</span>
      <p>${escapeHtml(i.texto)}</p>
      ${barraLikert(i.distribucion, i.respuestas)}
      <span class="ev-pct ${tonoFavorable(i.pct_favorable)}" title="% Siempre o Casi siempre">${i.pct_favorable === null ? '—' : `${Math.round(i.pct_favorable)}%`}</span>
    </li>`).join('')}</ol>
    <p class="ev-nota">El porcentaje indica cuántas respuestas fueron "Siempre" o "Casi siempre".</p>
  </section>`;
}

function comentariosHtml(comentarios) {
  if (!comentarios?.length) return '';
  const max = 6;
  const item = (c, oculto) => `<li class="${oculto ? 'hidden' : ''}"><i class="fa-solid fa-quote-left"></i>${escapeHtml(c)}</li>`;
  return `<section class="m3-card">
    <div class="ev-items-cab"><div><h4>Comentarios</h4><p class="ev-sub">Anónimos y en orden aleatorio.</p></div></div>
    <ul class="ev-comentarios">${comentarios.map((c, i) => item(c, i >= max)).join('')}</ul>
    ${comentarios.length > max ? `<button type="button" class="m3-btn texto chico mt-2" onclick="this.previousElementSibling.querySelectorAll('li.hidden').forEach(l=>l.classList.remove('hidden'));this.remove()">Ver los ${comentarios.length} comentarios</button>` : ''}
  </section>`;
}

function pintarEvalTutores(r) {
  const cont = $('eval-vista-tutores');
  const faltan = r.tutores.filter((t) => t.estatus === 'Pendiente');
  const faltanHtml = faltan.length
    ? `<p class="ev-sub">Faltan por responder:</p><div class="ev-faltan">${faltan.slice(0, 6).map((t) => `<span>${escapeHtml(t.nombre)}</span>`).join('')}${faltan.length > 6 ? `<span>y ${faltan.length - 6} más</span>` : ''}</div>`
    : '<p class="ev-sub"><i class="fa-solid fa-circle-check text-emerald-600"></i> Todos los tutores respondieron.</p>';
  cont.innerHTML = `${resumenEvalHtml(r, { quien: 'tutores', participantes: r.total_tutores, faltan: faltanHtml })}
    ${r.suficiente ? `${destacadosHtml(r.preguntas)}${itemsHtml(r.preguntas, 'tutores', 'P')}${comentariosHtml(r.comentarios)}` : insuficienteHtml(r, 'El periodo')}`;
}

function filtrarEvalTutor(id) {
  EVC.tutor = id ? String(id) : '';
  cargarEvaluacionesCoord();
  $('eval-vista-alumnos').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function pintarEvalAlumnos(r) {
  const cont = $('eval-vista-alumnos');
  const elegido = r.por_tutor.find((t) => String(t.tutor_id) === EVC.tutor);
  const ranking = [...r.por_tutor].sort((a, b) => (b.pct_favorable ?? -1) - (a.pct_favorable ?? -1) || a.nombre.localeCompare(b.nombre));
  const filaTutor = (t) => `<li><button type="button" class="${String(t.tutor_id) === EVC.tutor ? 'activo' : ''}" onclick="filtrarEvalTutor(${String(t.tutor_id) === EVC.tutor ? 0 : t.tutor_id})" ${t.suficiente ? '' : 'disabled'}>
      <span class="m3-avatar chico">${escapeHtml(iniciales(t.nombre))}</span>
      <span class="ev-tnom"><b>${escapeHtml(t.nombre)}</b><small>${t.respondidas} de ${t.tutorados} respondieron</small></span>
      ${t.suficiente
        ? `<span class="ev-tbar ${tonoFavorable(t.pct_favorable)}"><span style="width:${t.pct_favorable}%"></span></span><span class="ev-pct ${tonoFavorable(t.pct_favorable)}">${Math.round(t.pct_favorable)}%</span>`
        : '<span class="ev-reserva"><i class="fa-solid fa-lock"></i> Reservado</span>'}
    </button></li>`;
  const encabezado = elegido
    ? `<div class="m3-banner tono-azul ev-filtro"><span class="m3-avatar chico">${escapeHtml(iniciales(elegido.nombre))}</span>
        <span class="flex-1">Resultados de los tutorados de <b>${escapeHtml(elegido.nombre)}</b></span>
        <button type="button" class="m3-btn texto chico" style="color:inherit" onclick="filtrarEvalTutor(0)"><i class="fa-solid fa-xmark"></i> Ver todos</button></div>` : '';
  cont.innerHTML = `${encabezado}
    ${resumenEvalHtml(r, { quien: 'tutorados', participantes: r.total_tutorados })}
    <section class="m3-card">
      <div class="ev-items-cab"><div><h4>Resultados por tutor</h4><p class="ev-sub">Toca un tutor para ver el detalle de sus tutorados. "Reservado": menos de ${r.minimo_respuestas} respuestas.</p></div></div>
      <ul class="ev-ranking">${ranking.map(filaTutor).join('') || '<li class="pt-cargando">Sin tutores con tutorados.</li>'}</ul>
    </section>
    ${r.suficiente ? `${destacadosHtml(r.items)}${itemsHtml(r.items, 'alumnos', '')}${comentariosHtml(r.comentarios)}` : insuficienteHtml(r, elegido ? 'Este tutor' : 'El periodo')}`;
}

/* =============================================================================
 * AVISOS
 * ============================================================================= */
const CATEGORIAS_AVISO = [
  ['Coordinación de Tutorías', 'fa-bullhorn'], ['Reunión', 'fa-people-group'], ['Capacitación', 'fa-chalkboard-user'],
  ['Fechas de Entrega', 'fa-calendar-day'], ['Canalización Académica', 'fa-share-nodes'],
];
const AV = { filtro: '', todos: [] };

function pintarCategoriasAviso() {
  const actual = $('aviso-categoria').value || CATEGORIAS_AVISO[0][0];
  const cats = CATEGORIAS_AVISO.some(([c]) => c === actual) ? CATEGORIAS_AVISO : [...CATEGORIAS_AVISO, [actual, 'fa-tag']];
  $('aviso-cats').innerHTML = cats.map(([c, i]) => `<button type="button" role="radio" aria-checked="${c === actual}" class="${c === actual ? 'activo' : ''}" onclick="elegirCategoriaAviso(this.dataset.cat)" data-cat="${escapeHtml(c)}"><i class="fa-solid ${i}"></i>${escapeHtml(c)}</button>`).join('');
}

function elegirCategoriaAviso(cat) {
  $('aviso-categoria').value = cat;
  pintarCategoriasAviso();
  previaAviso();
}

function previaAviso() {
  const titulo = $('aviso-titulo').value.trim();
  const contenido = $('aviso-contenido').value.trim();
  setText('aviso-cuenta', `${$('aviso-contenido').value.length} / 4000`);
  const u = Sesion.usuario || {};
  $('aviso-previa').innerHTML = avisoCardHtml({
    titulo: titulo || 'Título del aviso',
    contenido: contenido || 'Aquí aparecerá el mensaje para los tutores.',
    categoria: $('aviso-categoria').value,
    importante: $('aviso-importante').checked,
    autor: `${u.nombre || ''} ${u.apellidos || ''}`.trim() || 'Coordinación de Tutorías',
    fecha_publicacion: new Date().toISOString(),
  }, false);
}

function nuevoAviso() {
  limpiarFormAviso();
  $('av-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => $('aviso-titulo').focus(), 300);
}

function limpiarFormAviso() {
  $('form-aviso').reset();
  $('aviso-id').value = '';
  $('aviso-categoria').value = CATEGORIAS_AVISO[0][0];
  setText('aviso-form-titulo', 'Nuevo aviso');
  $('aviso-cancelar').classList.add('hidden');
  $('av-editor').classList.remove('editando');
  pintarCategoriasAviso();
  previaAviso();
}

function editarAviso(id) {
  const a = AV.todos.find((x) => x.id === id);
  if (!a) return;
  $('aviso-id').value = a.id;
  $('aviso-titulo').value = a.titulo;
  $('aviso-categoria').value = a.categoria;
  $('aviso-contenido').value = a.contenido;
  $('aviso-importante').checked = a.importante;
  setText('aviso-form-titulo', 'Editar aviso');
  $('aviso-cancelar').classList.remove('hidden');
  $('av-editor').classList.add('editando');
  pintarCategoriasAviso();
  previaAviso();
  $('av-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('aviso-titulo').focus();
}

async function cargarAvisosCoord() {
  const cont = $('lista-avisos-coord');
  if (!cont) return;
  try {
    const { avisos } = await api('/avisos', { query: { estado: '' } });
    AV.todos = avisos;
    cacheAvisos = avisos;
    pintarAvisosCoord();
  } catch (err) {
    cont.innerHTML = `<p class="pt-cargando text-rose-600">${escapeHtml(err.message)}</p>`;
  }
}

function filtrarAvisosCoord(f) {
  AV.filtro = f;
  pintarAvisosCoord();
}

const ESTADO_AV = { Publicado: ['tono-verde', 'fa-circle-check', 'Publicado'], Borrador: ['tono-gris', 'fa-pen', 'Borrador'], Archivado: ['tono-ambar', 'fa-box-archive', 'Archivado'] };

function pintarAvisosCoord() {
  const cuenta = (e) => AV.todos.filter((a) => !e || a.estado === e).length;
  $('aviso-filtros').innerHTML = [['', 'Todos'], ['Publicado', 'Publicados'], ['Borrador', 'Borradores'], ['Archivado', 'Archivados']]
    .map(([k, etq]) => `<button type="button" class="m3-chip ${AV.filtro === k ? 'activo' : ''}" aria-pressed="${AV.filtro === k}" onclick="filtrarAvisosCoord('${k}')"><i class="fa-solid fa-check"></i>${etq} <span class="cuenta">${cuenta(k)}</span></button>`).join('');
  const lista = AV.todos.filter((a) => !AV.filtro || a.estado === AV.filtro);
  $('lista-avisos-coord').innerHTML = lista.length ? lista.map(avisoCoordHtml).join('')
    : `<div class="m3-vacio"><span class="m3-icono tono-azul"><i class="fa-regular fa-bell-slash"></i></span>${AV.filtro ? 'No hay avisos con este filtro.' : 'Aún no has publicado avisos.'}
        <button type="button" class="m3-btn tonal chico" onclick="nuevoAviso()"><i class="fa-solid fa-plus"></i> Escribir el primero</button></div>`;
}

function avisoCoordHtml(a) {
  const [tono, icono, etq] = ESTADO_AV[a.estado] || ESTADO_AV.Borrador;
  const fecha = a.fecha_publicacion || a.updated_at;
  const boton = (fn, ic, txt, extra = '') => `<button type="button" onclick="${fn}" class="avc-btn ${extra}" title="${txt}"><i class="fa-solid ${ic}"></i><span>${txt}</span></button>`;
  return `<article class="avc${a.importante ? ' importante' : ''}${a.estado === 'Archivado' ? ' archivado' : ''}">
    <span class="aviso-card-icono" aria-hidden="true"><i class="fa-solid ${iconoAviso(a)}"></i></span>
    <div class="avc-cuerpo">
      <div class="aviso-card-meta">
        <span class="aviso-cat">${escapeHtml(a.categoria || 'Aviso')}</span>
        <span class="m3-etiqueta ${tono}"><i class="fa-solid ${icono}"></i>${etq}</span>
        ${a.importante ? '<span class="aviso-pill imp"><i class="fa-solid fa-star"></i> Importante</span>' : ''}
        <time datetime="${escapeHtml(fecha || '')}" title="${escapeHtml(fmtFechaHora(fecha))}">${escapeHtml(a.fecha_publicacion ? haceRelativo(fecha) : `Editado ${haceRelativo(fecha).toLowerCase()}`)}</time>
      </div>
      <h4>${escapeHtml(a.titulo)}</h4>
      <p>${escapeHtml(a.contenido)}</p>
      <div class="avc-acciones">
        ${boton(`editarAviso(${a.id})`, 'fa-pen', 'Editar')}
        ${a.estado !== 'Publicado' ? boton(`cambiarEstadoAviso(${a.id}, 'Publicado')`, 'fa-paper-plane', a.estado === 'Archivado' ? 'Volver a publicar' : 'Publicar', 'prim') : ''}
        ${a.estado === 'Publicado' ? boton(`cambiarEstadoAviso(${a.id}, 'Archivado')`, 'fa-box-archive', 'Archivar') : ''}
        ${boton(`eliminarAviso(${a.id})`, 'fa-trash', 'Eliminar', 'peligro')}
      </div>
    </div>
  </article>`;
}

/* ---- Arranque de lo propio de este módulo ------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  if (PAGINA !== 'coordinacion' || !Sesion.usuario) return;
  limpiarFormAviso();
  cargarReportesCoord();
  ['tbody-riesgo', 'tbody-asig-integrantes', 'tbody-canalizaciones', 'tbody-fichas'].forEach((id) => paginar($(id), 10));
});

Object.assign(window, {
  abrirAltaPerfil,
  irAReporte, nuevoAvisoDesdeInicio, filtrarTutores, pintarTutores, pasoCupo, alternarTutoradosTutor, irPagina,
  presetInformeCoord, cambioRangoCoord, imprimirInformeCoord, imprimirSemestralCoord, resaltarSinSesion,
  cambiarVistaEvaluacion, cargarEvaluacionesCoord, ordenarEval, filtrarEvalTutor,
  elegirCategoriaAviso, previaAviso, nuevoAviso, limpiarFormAviso, editarAviso, filtrarAvisosCoord, cargarAvisosCoord,
});
