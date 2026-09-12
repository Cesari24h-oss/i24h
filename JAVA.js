// ==========================================
// SISTEMA OPERATIVO i24h — LÓGICA DE PISO (v3)
// ==========================================

let CONFIG = null;
let COLABORADOR = null;
let TURNO_ACTUAL = null;

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
// Orden alfabético estricto A-Z para CUALQUIER lista de sucursales que se
// pinte en un <select>, sin importar el orden en que llegue del backend.
const ordenarSucursales = (lista) => lista.slice().sort((a, b) => a.localeCompare(b, 'es'));

const PANTALLAS = [
  'pantalla-inicio-accesos', 'pantalla-acceso', 'pantalla-acceso-panel',
  'pantalla-menu', 'pantalla-inicio-menu', 'pantalla-reportes', 'pantalla-tickets', 'pantalla-me-surten',
  'vista-conteo', 'vista-cierre', 'vista-corte-caja', 'pantalla-inventarios-menu'
];
// Pantallas previas al login: nunca vale la pena "recordarlas" (si no hay
// sesión de colaborador válida, siempre se vuelve a mostrar el acceso).
const PANTALLAS_SIN_SESION = ['pantalla-inicio-accesos', 'pantalla-acceso', 'pantalla-acceso-panel'];
const CLAVE_VISTA_PISO = 'pisoVistaActiva';

function mostrar(id) {
  PANTALLAS.forEach(s => $('#' + s).classList.add('hidden'));
  $('#' + id).classList.remove('hidden');
  if (!PANTALLAS_SIN_SESION.includes(id)) sessionStorage.setItem(CLAVE_VISTA_PISO, id);
}

// ==========================================
// PERSISTENCIA DE VISTA (sessionStorage) — evita que un F5 accidental
// devuelva al colaborador al menú principal, perdiendo su lugar.
// Algunas pantallas necesitan datos recién cargados (no basta con volver a
// mostrarlas vacías), así que cada una tiene su propia función de reapertura.
// ==========================================
const REOPEN_MAP_PISO = {
  'pantalla-menu': () => mostrar('pantalla-menu'),
  'pantalla-inicio-menu': () => abrirInicioMenu(),
  'pantalla-reportes': () => abrirReportes(),
  'pantalla-tickets': () => abrirTickets(),
  'pantalla-me-surten': () => abrirMeSurten(),
  'pantalla-inventarios-menu': () => { $('#inventarios-msg').textContent = ''; mostrar('pantalla-inventarios-menu'); },
  'vista-corte-caja': () => abrirCorteCaja()
  // vista-conteo y vista-cierre no se restauran exactas (dependen de qué
  // módulo/artículos se estaban capturando en ese instante): si el usuario
  // recarga estando ahí, se le regresa a "Inicio de Turno" en vez de perder
  // el conteo a medio llenar en una pantalla en blanco.
};

async function restaurarVistaGuardada() {
  const guardada = sessionStorage.getItem(CLAVE_VISTA_PISO);
  const reabrir = guardada && REOPEN_MAP_PISO[guardada];
  if (reabrir) {
    await reabrir();
  } else {
    mostrar('pantalla-menu');
  }
}

async function api(metodo, url, body) {
  const res = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de red');
  return data;
}

// ==========================================
// TOASTS — notificaciones no intrusivas
// ==========================================
function mostrarToast(mensaje, tipo = 'ok') {
  const cont = $('#toast-container');
  if (!cont) return;
  const toast = document.createElement('div');
  toast.className = `toast ${tipo === 'error' ? 'toast-error' : ''}`;
  toast.innerHTML = `<i class="ti ${tipo === 'error' ? 'ti-alert-circle' : 'ti-circle-check'}"></i><span>${mensaje}</span>`;
  cont.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ---------- Modo oscuro ----------
function initDarkMode() {
  const btn = $('#toggle-btn');
  const aplicar = () => {
    const on = document.documentElement.classList.contains('dark');
    $('#tico').className = on ? 'ti ti-sun' : 'ti ti-moon';
    $('#tlbl').textContent = on ? 'Modo claro' : 'Modo oscuro';
  };
  aplicar();
  btn.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('dark', document.documentElement.classList.contains('dark') ? '1' : '0');
    aplicar();
  });
}

// ---------- Construcción de tablas ----------
function construirTabla(tabla, columnas, items) {
  let html = '<thead><tr><th>Insumo</th>';
  columnas.forEach(c => html += `<th>${c.label}</th>`);
  html += '</tr></thead><tbody>';
  items.forEach(item => {
    html += `<tr data-item="${item}"><td class="col-item">${item}</td>`;
    columnas.forEach(c => {
      if (c.editable) {
        html += `<td><input type="number" min="0" step="1" class="in-${c.clave}" value="${c.valor ? c.valor(item) : 0}"></td>`;
      } else {
        html += `<td class="celda-${c.clave}">${c.valor ? c.valor(item) : 0}</td>`;
      }
    });
    html += '</tr>';
  });
  html += '</tbody>';
  tabla.innerHTML = html;
}

// ==========================================
// ACCESO
// ==========================================
async function initAcceso() {
  $('#sel-sucursal').innerHTML = ordenarSucursales(CONFIG.sucursales).map(s => `<option value="${s}">${s}</option>`).join('');
  $('#sel-turno').innerHTML = CONFIG.turnos.map(t => `<option value="${t}">${t}</option>`).join('');

  $('#form-acceso').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#acceso-error').textContent = '';
    const nombre = $('#in-nombre').value.trim();
    const palabras = nombre.split(/\s+/).filter(Boolean);
    if (palabras.length < 2) {
      $('#acceso-error').textContent = 'Escribe tu nombre completo (nombre y apellido), ej: Tanya Luna.';
      return;
    }
    try {
      COLABORADOR = await api('POST', '/api/colaborador/login', {
        sucursal: $('#sel-sucursal').value,
        nombre,
        turno: $('#sel-turno').value
      });
      await entrarAMenu();
    } catch (err) {
      $('#acceso-error').textContent = err.message;
    }
  });

  // ---------- Menú de 4 accesos + regreso a inicio ----------
  const TITULOS_PANEL = { lider: 'Acceso de Líderes', operativo: 'Acceso de Operativos', admin: 'Acceso de Administradores' };
  $$('.tile-acceso').forEach(btn => {
    btn.addEventListener('click', () => {
      const tipo = btn.dataset.acceso;
      if (tipo === 'colaborador') {
        mostrar('pantalla-acceso');
      } else {
        $('#acceso-panel-titulo').textContent = TITULOS_PANEL[tipo];
        $('#acceso-panel-error').textContent = '';
        mostrar('pantalla-acceso-panel');
      }
    });
  });
  $$('.btn-regresar-inicio').forEach(btn => btn.addEventListener('click', () => mostrar('pantalla-inicio-accesos')));

  // ---------- Acceso Líderes / Operativos / Administradores ----------
  // Los 3 comparten el mismo backend (/api/panel/login); el rol real lo
  // determina la cuenta, no el botón que se presionó. Al entrar, se manda
  // a panel.html, que ya tiene toda la lógica de cada rol.
  $('#form-acceso-panel').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#acceso-panel-error').textContent = '';
    try {
      await api('POST', '/api/panel/login', {
        nombre: $('#in-panel-nombre').value,
        password: $('#in-panel-pass').value
      });
      window.location.href = '/panel.html';
    } catch (err) {
      $('#acceso-panel-error').textContent = err.message;
    }
  });
}

async function entrarAMenu() {
  $('#nav-usuario-box').style.display = 'flex';
  $('#colab-info').textContent = `${COLABORADOR.nombre} · ${COLABORADOR.sucursal} · ${COLABORADOR.turno}`;
  $('#menu-sub').textContent = `${COLABORADOR.nombre} — ${COLABORADOR.sucursal} — Turno ${COLABORADOR.turno}`;
  await cargarTurnoActual();
  await actualizarBotonMeSurten();
  mostrar('pantalla-menu');
}

async function cargarTurnoActual() {
  try { TURNO_ACTUAL = await api('GET', '/api/turno/actual'); }
  catch (e) { TURNO_ACTUAL = null; }
}

// ==========================================
// SUBMENÚ INICIO DE TURNO (con estado de concurrencia)
// ==========================================
async function actualizarEstadosInicio() {
  const pendientes = await api('GET', '/api/turno/pendientes');
  ['papeleria', 'snack', 'novedades'].forEach(cat => {
    const done = pendientes[cat];
    const el = $('#estado-' + cat);
    el.textContent = done ? '✔ Completado' : 'Pendiente';
    el.className = 'tile-estado ' + (done ? 'ok' : 'pendiente');
  });
  return pendientes;
}

async function abrirInicioMenu() {
  await cargarTurnoActual();
  await actualizarEstadosInicio();
  mostrar('pantalla-inicio-menu');
}

// ==========================================
// VISTA DE CONTEO (papelería / snack / novedades)
// ==========================================
let MODULO_ACTUAL = null;
let CADENA_ACTIVA = false;
let REFERENCIA_ANTERIOR = null;

const TITULOS = { papeleria: 'Conteo de Papelería', snack: 'Conteo de Snack', novedades: 'Conteo de Novedades' };

async function abrirConteo(modulo) {
  MODULO_ACTUAL = modulo;
  $('#conteo-titulo').textContent = TITULOS[modulo];
  $('#conteo-campos-papeleria').classList.toggle('hidden', modulo !== 'papeleria');
  $('#in-primer-ticket').value = '';
  $('#in-caja').value = '';
  $('#conteo-msg').textContent = '';

  try { REFERENCIA_ANTERIOR = await api('GET', '/api/turno/referencia-anterior'); }
  catch (e) { REFERENCIA_ANTERIOR = null; }

  // Rol de la sesión activa. La sesión de colaborador (login por piso, sin
  // contraseña) hoy no trae campo "rol" -> se asume 'colaborador' por
  // defecto. Si en el futuro un líder/operativo/admin abre esta misma
  // pantalla con su rol real en COLABORADOR.rol, ya queda soportado.
  const rolActivo = COLABORADOR.rol || 'colaborador';
  const puedeVerReferencia = ['lider', 'operativo', 'admin'].includes(rolActivo);

  const columnasConteo = [];
  if (puedeVerReferencia) {
    columnasConteo.push({ clave: 'ref', label: 'Ref. turno anterior', editable: false, valor: (item) => REFERENCIA_ANTERIOR ? (REFERENCIA_ANTERIOR[modulo][item] || 0) : 0 });
  }
  columnasConteo.push({ clave: 'cant', label: 'Recibo (cuenta física)', editable: true, valor: () => 0 });

  construirTabla($('#tabla-conteo'), columnasConteo, CONFIG.catalogos[modulo]);

  // Colaboradores: conteo a ciegas -> se oculta también la nota explicativa.
  const notaRef = $('#conteo-ref-nota');
  if (notaRef) notaRef.style.display = puedeVerReferencia ? '' : 'none';

  mostrar('vista-conteo');
}

async function guardarConteo() {
  const recibo = {};
  $$('#tabla-conteo tbody tr').forEach(tr => {
    recibo[tr.dataset.item] = Number(tr.querySelector('.in-cant').value || 0);
  });

  const body = { recibo };
  if (MODULO_ACTUAL === 'papeleria') {
    const ticket = $('#in-primer-ticket').value.trim();
    const caja = $('#in-caja').value.trim();
    if (!ticket || !caja) {
      $('#conteo-msg').textContent = 'Captura Primer Ticket y N° de Caja antes de guardar.';
      $('#conteo-msg').className = 'msg msg-error';
      return;
    }
    body.primerTicket = ticket;
    body.caja = caja;
  }

  try {
    const data = await api('POST', `/api/turno/inicio/${MODULO_ACTUAL}`, body);
    TURNO_ACTUAL = data.turno;
    abrirModalCompletado(MODULO_ACTUAL, { primerTicket: body.primerTicket, caja: body.caja }, data.siguientePendiente);
  } catch (err) {
    $('#conteo-msg').textContent = err.message;
    $('#conteo-msg').className = 'msg msg-error';
  }
}

// ==========================================
// MODAL "CONTEO COMPLETADO" + WHATSAPP
// ==========================================
function nombreDiaMayus(fecha) { return CONFIG.diasSemana[fecha.getDay()]; }
function fechaCortaJS(fecha) {
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${fecha.getFullYear()}`;
}

function generarTextoConteo(modulo, extra) {
  const ahora = new Date();
  const lineas = [];
  lineas.push(COLABORADOR.sucursal);
  lineas.push(`🟢${COLABORADOR.turno} | Apertura de turno`);
  lineas.push(nombreDiaMayus(ahora));
  lineas.push(fechaCortaJS(ahora));
  lineas.push(`Colaborador: ${COLABORADOR.nombre}`);
  if (modulo === 'papeleria') {
    lineas.push(`N° Caja: ${extra.caja}`);
    lineas.push(`Primer Ticket: ${extra.primerTicket}`);
    lineas.push('CONTEO COMPLETADO');
  } else {
    lineas.push(`CONTEO ${modulo.toUpperCase()} COMPLETADO`);
  }
  return lineas.join('\n');
}

let TEXTO_WHATSAPP_ACTUAL = '';
let SIGUIENTE_PENDIENTE_MODAL = null;

function abrirModalCompletado(modulo, extra, siguientePendiente) {
  $('#modal-titulo').textContent = modulo === 'papeleria' ? 'CONTEO COMPLETADO' : `CONTEO ${modulo.toUpperCase()} COMPLETADO`;
  TEXTO_WHATSAPP_ACTUAL = generarTextoConteo(modulo, extra || {});
  SIGUIENTE_PENDIENTE_MODAL = siguientePendiente;
  $('#modal-overlay').classList.remove('hidden');
  CADENA_ACTIVA = true;
}

async function cerrarModalYEncadenar() {
  $('#modal-overlay').classList.add('hidden');
  if (!CADENA_ACTIVA) { mostrar('pantalla-inicio-menu'); return; }

  // Se consulta de nuevo al backend (no un orden fijo) para respetar lo que
  // ya haya completado OTRO colaborador en paralelo.
  const pendientes = await actualizarEstadosInicio();
  if (pendientes.siguientePendiente) {
    abrirConteo(pendientes.siguientePendiente);
  } else {
    CADENA_ACTIVA = false;
    mostrar('pantalla-inicio-menu');
  }
}

function copiarWhatsapp() {
  const clip = $('#whatsapp-clip');
  clip.value = TEXTO_WHATSAPP_ACTUAL;
  clip.style.display = 'block';
  clip.select();
  document.execCommand('copy');
  clip.style.display = 'none';
  $('#modal-btn-whatsapp').textContent = '¡Copiado!';
  setTimeout(() => { $('#modal-btn-whatsapp').innerHTML = '<i class="ti ti-brand-whatsapp"></i> Copiar para WhatsApp'; }, 1500);
}

// ==========================================
// CIERRE DE TURNO
// ==========================================
async function abrirCierre() {
  $('#cierre-msg').textContent = '';
  $('#in-ultimo-ticket').value = '';
  let datos;
  try {
    datos = await api('GET', '/api/turno/cierre/datos');
  } catch (err) {
    $('#cierre-tablas').innerHTML = '';
    $('#tabla-impresora1').innerHTML = '';
    $('#tabla-impresora2').innerHTML = '';
    $('#cierre-msg').textContent = err.message;
    $('#cierre-msg').className = 'msg msg-error';
    mostrar('vista-cierre');
    return;
  }

  TURNO_ACTUAL = datos.turno;

  const quicknavHTML = (activo) => `
    <div class="quicknav-cierre">
      <button data-ir="papeleria" class="${activo === 'papeleria' ? 'activo' : ''}">PAPELERÍA</button><span>*</span>
      <button data-ir="snack" class="${activo === 'snack' ? 'activo' : ''}">SNACK</button><span>*</span>
      <button data-ir="novedades" class="${activo === 'novedades' ? 'activo' : ''}">NOVEDADES</button><span>*</span>
      <button data-ir="contadores">CONTADORES</button>
    </div>`;

  const cont = $('#cierre-tablas');
  cont.innerHTML = '';
  CONFIG.categorias.forEach(cat => {
    const bloque = document.createElement('div');
    bloque.innerHTML = `${quicknavHTML(cat)}<h3 id="ancla-${cat}">${CONFIG.nombreCategoria[cat]}</h3><div class="tabla-wrap"><table class="tabla-conteo" id="tabla-cierre-${cat}"></table></div>`;
    cont.appendChild(bloque);

    construirTabla($('#tabla-cierre-' + cat), [
      { clave: 'recibo', label: 'Recibo', editable: false, valor: (item) => TURNO_ACTUAL.modulos[cat].recibo[item] || 0 },
      { clave: 'mesurten', label: 'Me Surten', editable: false, valor: (item) => TURNO_ACTUAL.meSurten[cat][item] || 0 },
      { clave: 'vendido', label: 'Vendido', editable: true, valor: () => 0 },
      { clave: 'merma', label: 'Merma', editable: true, valor: () => 0 },
      { clave: 'entrego', label: 'Entregó', editable: false, valor: (item) => (TURNO_ACTUAL.modulos[cat].recibo[item] || 0) + (TURNO_ACTUAL.meSurten[cat][item] || 0) }
    ], CONFIG.catalogos[cat]);

    $$(`#tabla-cierre-${cat} tbody tr`).forEach(tr => {
      const item = tr.dataset.item;
      const recibo = Number(TURNO_ACTUAL.modulos[cat].recibo[item] || 0);
      const meSurten = Number(TURNO_ACTUAL.meSurten[cat][item] || 0);
      const inVendido = tr.querySelector('.in-vendido');
      const inMerma = tr.querySelector('.in-merma');
      const celdaEntrego = tr.querySelector('.celda-entrego');
      const recalc = () => { celdaEntrego.textContent = recibo + meSurten - Number(inVendido.value || 0) - Number(inMerma.value || 0); };
      inVendido.addEventListener('input', recalc);
      inMerma.addEventListener('input', recalc);
    });
  });

  ['impresora1', 'impresora2'].forEach(imp => {
    construirTabla($('#tabla-' + imp), [
      { clave: 'anterior', label: 'Turno Anterior', editable: false, valor: (item) => datos.impresorasAnterior[imp][item] || 0 },
      { clave: 'actual', label: 'Turno Actual', editable: true, valor: () => 0 },
      { clave: 'procesado', label: 'Total Procesado', editable: false, valor: () => 0 }
    ], CONFIG.impresoraItems);

    $$(`#tabla-${imp} tbody tr`).forEach(tr => {
      const item = tr.dataset.item;
      const anterior = Number(datos.impresorasAnterior[imp][item] || 0);
      const inActual = tr.querySelector('.in-actual');
      const celdaProc = tr.querySelector('.celda-procesado');
      inActual.addEventListener('input', () => { celdaProc.textContent = Number(inActual.value || 0) - anterior; });
    });
  });

  mostrar('vista-cierre');
}

async function guardarCierre() {
  const ultimoTicket = $('#in-ultimo-ticket').value.trim();
  if (!ultimoTicket) {
    $('#cierre-msg').textContent = 'Captura el Último Ticket antes de cerrar el turno.';
    $('#cierre-msg').className = 'msg msg-error';
    return;
  }

  const vendido = {}, merma = {};
  CONFIG.categorias.forEach(cat => {
    vendido[cat] = {}; merma[cat] = {};
    $$(`#tabla-cierre-${cat} tbody tr`).forEach(tr => {
      vendido[cat][tr.dataset.item] = Number(tr.querySelector('.in-vendido').value || 0);
      merma[cat][tr.dataset.item] = Number(tr.querySelector('.in-merma').value || 0);
    });
  });

  const impresoras = { impresora1: {}, impresora2: {} };
  ['impresora1', 'impresora2'].forEach(imp => {
    impresoras[imp] = {};
    $$(`#tabla-${imp} tbody tr`).forEach(tr => { impresoras[imp][tr.dataset.item] = Number(tr.querySelector('.in-actual').value || 0); });
  });

  try {
    await api('POST', '/api/turno/cierre', { ultimoTicket, vendido, merma, impresoras });
    TURNO_ACTUAL = null;
    $('#cierre-msg').textContent = 'Turno cerrado correctamente. Ya puedes registrar el Corte de Caja.';
    $('#cierre-msg').className = 'msg msg-ok';
    mostrarToast('Cambios guardados correctamente.');
  } catch (err) {
    $('#cierre-msg').textContent = err.message;
    $('#cierre-msg').className = 'msg msg-error';
    mostrarToast(err.message, 'error');
  }
}

// ==========================================
// CORTE DE CAJA
// ==========================================
let TURNO_PENDIENTE_CAJA = null;

async function abrirCorteCaja() {
  $('#corte-caja-msg').textContent = '';
  $('#resumen-box').classList.add('hidden');
  try { TURNO_PENDIENTE_CAJA = await api('GET', '/api/turno/corte-caja/pendiente'); }
  catch (e) { TURNO_PENDIENTE_CAJA = null; }

  if (!TURNO_PENDIENTE_CAJA) {
    $('#corte-caja-sub').textContent = 'No hay ningún turno con Cierre de Turno completado pendiente de Corte de Caja.';
    $('#tabla-cobradas').innerHTML = '';
    $('#tabla-tramites').innerHTML = '';
    $('#btn-guardar-corte-caja').disabled = true;
    mostrar('vista-corte-caja');
    return;
  }

  $('#btn-guardar-corte-caja').disabled = false;
  $('#corte-caja-sub').textContent = `Turno ${TURNO_PENDIENTE_CAJA.turno} — cerrado por ${TURNO_PENDIENTE_CAJA.cierre.colaborador} — ${new Date(TURNO_PENDIENTE_CAJA.cierreHora).toLocaleString('es-MX')}`;

  construirTabla($('#tabla-cobradas'), [{ clave: 'cant', label: 'Cantidad', editable: true, valor: () => 0 }], CONFIG.cobradasItems);
  construirTabla($('#tabla-tramites'), [{ clave: 'cant', label: 'Cantidad', editable: true, valor: () => 0 }], CONFIG.tramitesItems);
  ['venta-total', 'sdp', 'sobres', 'ti24h', 'tgen', 'scanner-cobrados', 'scanner-merma'].forEach(id => $('#in-' + id).value = 0);
  $('#in-explicacion').value = '';

  mostrar('vista-corte-caja');
}

async function guardarCorteCaja() {
  const cobradas = {}, tramites = {};
  $$('#tabla-cobradas tbody tr').forEach(tr => { cobradas[tr.dataset.item] = Number(tr.querySelector('.in-cant').value || 0); });
  $$('#tabla-tramites tbody tr').forEach(tr => { tramites[tr.dataset.item] = Number(tr.querySelector('.in-cant').value || 0); });

  const body = {
    cobradas, tramites,
    ventaTotal: Number($('#in-venta-total').value || 0),
    sdp: Number($('#in-sdp').value || 0),
    sobresActaProcesados: Number($('#in-sobres').value || 0),
    ti24h: Number($('#in-ti24h').value || 0),
    tGen: Number($('#in-tgen').value || 0),
    scannerCobrados: Number($('#in-scanner-cobrados').value || 0),
    scannerMerma: Number($('#in-scanner-merma').value || 0),
    explicacionVenta: $('#in-explicacion').value
  };

  try {
    const data = await api('POST', '/api/turno/corte-caja', body);
    $('#corte-caja-msg').textContent = 'Corte de Caja guardado correctamente.';
    $('#corte-caja-msg').className = 'msg msg-ok';
    $('#btn-guardar-corte-caja').disabled = true;
    mostrarToast('Cambios guardados correctamente.');
    await mostrarResumenDiario(data.turno.fecha);
  } catch (err) {
    $('#corte-caja-msg').textContent = err.message;
    $('#corte-caja-msg').className = 'msg msg-error';
    mostrarToast(err.message, 'error');
  }
}

async function mostrarResumenDiario(fecha) {
  const r = await api('GET', '/api/turno/resumen-diario?fecha=' + encodeURIComponent(fecha));
  const num = (v) => Number(v || 0);
  const t1 = r.turnos.T1, t2 = r.turnos.T2, t3 = r.turnos.T3;
  const total = num(t1.ventaTotal) + num(t2.ventaTotal) + num(t3.ventaTotal);

  const texto =
`${r.sucursal}
${r.fechaCorta}
${r.diaSemana}
🟢T1: $${num(t1.ventaTotal)} (venta total) + Fotografía
SDP: $${num(t1.sdp)}
Sobres de acta: #${num(t1.sobresActaProcesados)} total de procesados + fotografía
TI24H: ${num(t1.ti24h)}
🔸T Gen: ${num(t1.tGen)}

🔵T2: $${num(t2.ventaTotal)} (venta total) + Fotografía
SDP: $${num(t2.sdp)}
Sobres de acta: #${num(t2.sobresActaProcesados)} total de procesados + fotografía
TI24H: ${num(t2.ti24h)}
🔸T Gen: ${num(t2.tGen)}

🔴T3: $${num(t3.ventaTotal)} (venta total) + Fotografía
SDP: $${num(t3.sdp)}
Sobres de acta: #${num(t3.sobresActaProcesados)} total de procesados + fotografía
TI24H: ${num(t3.ti24h)}
🔸T Gen: ${num(t3.tGen)}

Total: $${total}

Explicación de ventas
🟢T1: ${t1.explicacionVenta || '—'}
🔵T2: ${t2.explicacionVenta || '—'}
🔴T3: ${t3.explicacionVenta || '—'}`;

  $('#resumen-texto').value = texto;
  $('#resumen-box').classList.remove('hidden');
}

function copiarResumen() {
  $('#resumen-texto').select();
  document.execCommand('copy');
}

// ==========================================
// INVENTARIOS AUTOMÁTICOS
// ==========================================
const NOMBRE_INV = { papeleria: 'Papelería', snack: 'Snack', novedades: 'Novedades', limpieza: 'Limpieza' };

async function descargarInventario(categoria) {
  $('#inventarios-msg').textContent = `Generando inventario de ${NOMBRE_INV[categoria]}...`;
  $('#inventarios-msg').className = 'msg';
  try {
    const res = await fetch(`/api/inventarios/${categoria}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo generar el inventario.');
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    const nombreArchivo = match ? decodeURIComponent(match[1]) : `inventario_${categoria}.xlsx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    $('#inventarios-msg').textContent = `Inventario de ${NOMBRE_INV[categoria]} descargado. Ábrelo desde tus descargas.`;
    $('#inventarios-msg').className = 'msg msg-ok';
  } catch (err) {
    $('#inventarios-msg').textContent = err.message;
    $('#inventarios-msg').className = 'msg msg-error';
  }
}

// ==========================================
// QUICKNAV DENTRO DE CIERRE DE TURNO
// (PAPELERÍA * SNACK * NOVEDADES * CONTADORES — solo salta de sección
// dentro de la misma pantalla de Cierre de Turno, para no tener que hacer
// scroll manual en un formulario largo)
// ==========================================
function initQuicknavCierre() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.quicknav-cierre button');
    if (!btn) return;
    const ancla = document.getElementById('ancla-' + btn.dataset.ir);
    if (ancla) ancla.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ==========================================
// REPORTES DE SUCURSAL (tickets de mantenimiento)
// ==========================================
async function abrirReportes() {
  $('#reportes-msg').textContent = '';
  $('#rep-sucursal').value = COLABORADOR.sucursal;
  $('#rep-departamento').innerHTML = CONFIG.departamentosReporte.map(d => `<option value="${d}">${d}</option>`).join('');
  $('#rep-sistemas-box').classList.add('hidden');
  $('#rep-descripcion').value = '';
  actualizarCajaSistemas();
  await cargarReportesPendientes();
  mostrar('pantalla-reportes');
}

function actualizarCajaSistemas() {
  const esSistemas = $('#rep-departamento').value === 'SISTEMAS';
  $('#rep-sistemas-box').classList.toggle('hidden', !esSistemas);
  if (esSistemas) {
    const categorias = Object.keys(CONFIG.catalogoSistemas);
    $('#rep-sistemas-categoria').innerHTML = categorias.map(c => `<option value="${c}">${c}</option>`).join('');
    actualizarProblemasSistemas();
  }
}
function actualizarProblemasSistemas() {
  const categoria = $('#rep-sistemas-categoria').value;
  const problemas = CONFIG.catalogoSistemas[categoria] || [];
  $('#rep-sistemas-problema').innerHTML = problemas.map(p => `<option value="${p}">${p}</option>`).join('');
}

async function cargarReportesPendientes() {
  const cont = $('#lista-reportes');
  try {
    const lista = await api('GET', '/api/reportes');
    if (!lista.length) { cont.innerHTML = '<p class="actividad-vacio">Sin reportes pendientes.</p>'; return; }
    cont.innerHTML = lista.map(r => `
      <div class="reporte-item">
        <div class="reporte-top">
          <span class="reporte-depto">${r.departamento}</span>
          <span class="reporte-fecha">${new Date(r.fecha).toLocaleString('es-MX')}</span>
        </div>
        ${r.categoriaSistemas ? `<div class="reporte-sub">${r.categoriaSistemas} — ${r.problemaSistemas}</div>` : ''}
        ${r.descripcion ? `<div class="reporte-desc">${r.descripcion}</div>` : ''}
        <div class="reporte-autor">Reportó: ${r.autor} · ${r.sucursal}</div>
      </div>
    `).join('');
  } catch (err) {
    cont.innerHTML = `<p class="actividad-vacio dif-negativo">${err.message}</p>`;
  }
}

async function guardarReporte() {
  const departamento = $('#rep-departamento').value;
  const body = { departamento, descripcion: $('#rep-descripcion').value };
  if (departamento === 'SISTEMAS') {
    body.categoriaSistemas = $('#rep-sistemas-categoria').value;
    body.problemaSistemas = $('#rep-sistemas-problema').value;
  }
  try {
    await api('POST', '/api/reportes', body);
    $('#reportes-msg').textContent = 'Reporte registrado correctamente.';
    $('#reportes-msg').className = 'msg msg-ok';
    mostrarToast('Cambios guardados correctamente.');
    $('#rep-descripcion').value = '';
    await cargarReportesPendientes();
  } catch (err) {
    $('#reportes-msg').textContent = err.message;
    $('#reportes-msg').className = 'msg msg-error';
    mostrarToast(err.message, 'error');
  }
}

// ==========================================
// REGISTRO DE TICKETS i24h
// ==========================================
function abrirTickets() {
  $('#tickets-msg').textContent = '';
  $('#tk-numero').value = '';
  $('#tk-cantidad').value = '';
  $('#tk-concepto').value = '';
  mostrar('pantalla-tickets');
  $('#tk-numero').focus();
}

function limpiarCamposTicket() {
  $('#tk-numero').value = '';
  $('#tk-cantidad').value = '';
  $('#tk-concepto').value = '';
  $('#tk-numero').focus();
}

async function guardarTicket() {
  const numeroTicket = $('#tk-numero').value.trim();
  const cantidad = $('#tk-cantidad').value.trim();
  const concepto = $('#tk-concepto').value.trim();

  if (!/^\d+$/.test(numeroTicket)) {
    $('#tickets-msg').textContent = 'El número de ticket debe ser solo números.';
    $('#tickets-msg').className = 'msg msg-error';
    return;
  }
  if (!/^\d+$/.test(cantidad) || Number(cantidad) <= 0) {
    $('#tickets-msg').textContent = 'La cantidad debe ser un número entero positivo (mayor a 0).';
    $('#tickets-msg').className = 'msg msg-error';
    return;
  }
  if (!concepto) {
    $('#tickets-msg').textContent = 'Escribe un concepto para el ticket.';
    $('#tickets-msg').className = 'msg msg-error';
    return;
  }

  try {
    await api('POST', '/api/tickets-i24h', { numeroTicket, cantidad, concepto });
    $('#tickets-msg').textContent = 'Ticket registrado correctamente.';
    $('#tickets-msg').className = 'msg msg-ok';
    mostrarToast('Cambios guardados correctamente.');
    limpiarCamposTicket();
  } catch (err) {
    $('#tickets-msg').textContent = err.message;
    $('#tickets-msg').className = 'msg msg-error';
    mostrarToast(err.message, 'error');
  }
}

// ==========================================
// ME SURTEN (traspaso Bodega → Piso)
// ==========================================
let BODEGA_ESTADO = null;

async function actualizarBotonMeSurten() {
  try { BODEGA_ESTADO = await api('GET', '/api/bodega/estado'); }
  catch (e) { BODEGA_ESTADO = { total: 0, disponible: false, bodega: null }; }
  $('#tile-me-surten').classList.toggle('btn-disabled', !BODEGA_ESTADO.disponible);
}

function construirTablaMeSurten(cat) {
  const tabla = $('#ms-tabla-' + cat);
  const bodegaCat = (BODEGA_ESTADO && BODEGA_ESTADO.bodega) ? BODEGA_ESTADO.bodega[cat] : {};
  tabla.innerHTML = `<thead><tr><th>Insumo</th><th>Disponible en Bodega</th><th>Cantidad a sacar</th></tr></thead><tbody>
    ${CONFIG.catalogos[cat].map(item => `
      <tr data-item="${item}">
        <td class="col-item">${item}</td>
        <td>${Number((bodegaCat && bodegaCat[item]) || 0)}</td>
        <td><input type="number" min="0" class="in-ms-cant" value="0"></td>
      </tr>
    `).join('')}
  </tbody>`;
}

function cambiarTabMeSurten(cat) {
  ['papeleria', 'snack', 'novedades'].forEach(c => $('#ms-card-' + c).classList.toggle('hidden', c !== cat));
  $$('#ms-quicknav button').forEach(b => b.classList.toggle('activo', b.dataset.cat === cat));
}

async function abrirMeSurten() {
  await actualizarBotonMeSurten();
  if ($('#tile-me-surten').classList.contains('btn-disabled')) { mostrar('pantalla-menu'); return; }
  ['papeleria', 'snack', 'novedades'].forEach(cat => {
    construirTablaMeSurten(cat);
    $('#ms-msg-' + cat).textContent = '';
  });
  cambiarTabMeSurten('papeleria');
  mostrar('pantalla-me-surten');
}

async function guardarMeSurten(categoria) {
  const cantidades = {};
  $$(`#ms-tabla-${categoria} tbody tr`).forEach(tr => {
    cantidades[tr.dataset.item] = Number(tr.querySelector('.in-ms-cant').value || 0);
  });
  const msg = $('#ms-msg-' + categoria);
  try {
    await api('POST', `/api/inventario/me-surten/${categoria}`, { cantidades });
    msg.textContent = 'Traspaso registrado correctamente.';
    msg.className = 'msg msg-ok';
    mostrarToast('Cambios guardados correctamente.');
    await actualizarBotonMeSurten();
    construirTablaMeSurten(categoria); // refresca "Disponible" y limpia los inputs a 0
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg msg-error';
    mostrarToast(err.message, 'error');
  }
}

// ==========================================
// NAVEGACIÓN
// ==========================================
function initNavegacion() {
  $('#tile-inicio').addEventListener('click', abrirInicioMenu);
  $('#tile-cierre-turno').addEventListener('click', abrirCierre);
  $('#tile-corte-caja').addEventListener('click', abrirCorteCaja);
  $('#tile-inventarios').addEventListener('click', () => { $('#inventarios-msg').textContent = ''; mostrar('pantalla-inventarios-menu'); });
  $('#tile-reportes').addEventListener('click', abrirReportes);
  $('#tile-tickets').addEventListener('click', abrirTickets);
  $('#tile-me-surten').addEventListener('click', abrirMeSurten);
  $('#ms-quicknav').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) cambiarTabMeSurten(btn.dataset.cat);
  });
  $$('[data-guardar-ms]').forEach(btn => btn.addEventListener('click', () => guardarMeSurten(btn.dataset.guardarMs)));
  $('#btn-guardar-ticket').addEventListener('click', guardarTicket);
  $('#rep-departamento').addEventListener('change', actualizarCajaSistemas);
  $('#rep-sistemas-categoria').addEventListener('change', actualizarProblemasSistemas);
  $('#btn-guardar-reporte').addEventListener('click', guardarReporte);
  $$('#pantalla-inventarios-menu .tile').forEach(tile => {
    tile.addEventListener('click', () => descargarInventario(tile.dataset.inv));
  });

  $('#tile-reportes').addEventListener('click', abrirReportes);
  $('#btn-guardar-reporte').addEventListener('click', guardarReporte);
  $('#rep-departamento').addEventListener('change', actualizarVisibilidadSistemas);
  $('#rep-sistemas-categoria').addEventListener('change', actualizarProblemasSistemas);

  $$('.btn-volver-menu').forEach(btn => btn.addEventListener('click', () => mostrar('pantalla-menu')));
  $('#btn-volver-inicio-menu').addEventListener('click', () => { CADENA_ACTIVA = false; abrirInicioMenu(); });

  $$('#pantalla-inicio-menu .tile').forEach(tile => {
    tile.addEventListener('click', () => { CADENA_ACTIVA = false; abrirConteo(tile.dataset.modulo); });
  });

  $('#btn-guardar-conteo').addEventListener('click', guardarConteo);
  $('#btn-guardar-cierre').addEventListener('click', guardarCierre);
  $('#btn-guardar-corte-caja').addEventListener('click', guardarCorteCaja);
  $('#btn-copiar-resumen').addEventListener('click', copiarResumen);

  $('#modal-btn-cerrar').addEventListener('click', cerrarModalYEncadenar);
  $('#modal-btn-whatsapp').addEventListener('click', copiarWhatsapp);

  $('#btn-salir-turno').addEventListener('click', async () => {
    await api('POST', '/api/colaborador/salir-sin-cerrar');
    COLABORADOR = null;
    TURNO_ACTUAL = null;
    sessionStorage.removeItem(CLAVE_VISTA_PISO);
    $('#nav-usuario-box').style.display = 'none';
    mostrar('pantalla-inicio-accesos');
  });

  initQuicknavCierre();
}

// ==========================================
// REPORTES DE SUCURSAL (tickets de mantenimiento)
// ==========================================
async function abrirReportes() {
  $('#reportes-msg').textContent = '';
  $('#rep-sucursal').value = COLABORADOR.sucursal;
  $('#rep-departamento').innerHTML = CONFIG.departamentosReporte.map(d => `<option value="${d}">${d}</option>`).join('');
  $('#rep-sistemas-categoria').innerHTML = Object.keys(CONFIG.catalogoSistemas).map(c => `<option value="${c}">${c}</option>`).join('');
  $('#rep-descripcion').value = '';
  actualizarVisibilidadSistemas();
  actualizarProblemasSistemas();
  await cargarReportesPendientes();
  mostrar('pantalla-reportes');
}

function actualizarVisibilidadSistemas() {
  $('#rep-sistemas-box').classList.toggle('hidden', $('#rep-departamento').value !== 'SISTEMAS');
}

function actualizarProblemasSistemas() {
  const cat = $('#rep-sistemas-categoria').value;
  const problemas = CONFIG.catalogoSistemas[cat] || [];
  $('#rep-sistemas-problema').innerHTML = problemas.map(p => `<option value="${p}">${p}</option>`).join('');
}

async function cargarReportesPendientes() {
  const cont = $('#lista-reportes');
  try {
    const lista = await api('GET', '/api/reportes');
    if (!lista.length) {
      cont.innerHTML = '<p class="reportes-vacio">Sin reportes pendientes en esta sucursal.</p>';
      return;
    }
    cont.innerHTML = lista.map(r => `
      <div class="reporte-item">
        <div class="reporte-cabecera">
          <span class="reporte-depto">${r.departamento}</span>
          <span class="reporte-fecha">${new Date(r.fecha).toLocaleString('es-MX')}</span>
        </div>
        ${r.categoriaSistemas ? `<div class="reporte-detalle">${r.categoriaSistemas} — ${r.problemaSistemas}</div>` : ''}
        ${r.descripcion ? `<div class="reporte-descripcion">${r.descripcion}</div>` : ''}
        <div class="reporte-autor">Reportó: ${r.autor}</div>
      </div>
    `).join('');
  } catch (err) {
    cont.innerHTML = `<p class="reportes-vacio">${err.message}</p>`;
  }
}

async function guardarReporte() {
  const departamento = $('#rep-departamento').value;
  const body = { departamento, descripcion: $('#rep-descripcion').value };
  if (departamento === 'SISTEMAS') {
    body.categoriaSistemas = $('#rep-sistemas-categoria').value;
    body.problemaSistemas = $('#rep-sistemas-problema').value;
  }
  try {
    await api('POST', '/api/reportes', body);
    $('#reportes-msg').textContent = 'Reporte registrado correctamente.';
    $('#reportes-msg').className = 'msg msg-ok';
    mostrarToast('Cambios guardados correctamente.');
    $('#rep-descripcion').value = '';
    await cargarReportesPendientes();
  } catch (err) {
    $('#reportes-msg').textContent = err.message;
    $('#reportes-msg').className = 'msg msg-error';
    mostrarToast(err.message, 'error');
  }
}

// ==========================================
// INICIO
// ==========================================
async function init() {
  initDarkMode();
  CONFIG = await api('GET', '/api/config');

  await initAcceso();
  initNavegacion();

  try {
    COLABORADOR = await api('GET', '/api/colaborador/sesion');
    await entrarAMenu();
    await restaurarVistaGuardada(); // solo aplica al recargar con sesión ya activa
  } catch (e) {
    mostrar('pantalla-inicio-accesos');
  }
}

init();
