// ==========================================
// SISTEMA OPERATIVO i24h — PANEL DE LÍDERES (v3)
// ==========================================

let CONFIG = null;
let LIDER = null;

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
// Orden alfabético estricto A-Z para CUALQUIER lista de sucursales que se
// pinte en un <select>, sin importar el orden en que llegue del backend.
const ordenarSucursales = (lista) => lista.slice().sort((a, b) => a.localeCompare(b, 'es'));

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
// TOASTS — notificaciones no intrusivas (reemplazan a alert())
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

// PROHIBIDO usar tabla.innerHTML aquí: se crean/reutilizan <thead> y <tbody>
// como nodos DOM independientes, y solo se escribe en CADA UNO por separado
// — así es estructuralmente imposible que una fila de datos quede "antes"
// que la cabecera, porque nunca se reconstruyen juntos en un solo string.
function construirTabla(tabla, columnas, items) {
  let thead = tabla.querySelector('thead');
  if (!thead) {
    thead = document.createElement('thead');
    thead.className = 'sticky-thead';
    tabla.appendChild(thead);
  }
  let tbody = tabla.querySelector('tbody');
  if (!tbody) {
    tbody = document.createElement('tbody');
    tbody.id = 'tbody-' + tabla.id.replace(/^tabla-/, '');
    tabla.appendChild(tbody);
  }
  // Blindaje de orden: <thead> SIEMPRE debe quedar antes que <tbody> en el DOM.
  if (thead.nextElementSibling !== tbody) tabla.insertBefore(thead, tbody);

  thead.innerHTML = `<tr><th>Insumo</th>${columnas.map(c => `<th>${c.label}</th>`).join('')}</tr>`;

  tbody.innerHTML = items.map(item => `
    <tr data-item="${item}"><td class="col-item">${item}</td>
      ${columnas.map(c => c.editable
        ? `<td><input type="number" min="0" step="1" class="in-${c.clave}" value="${c.valor ? c.valor(item) : 0}"></td>`
        : `<td class="celda-${c.clave}">${c.valor ? c.valor(item) : 0}</td>`
      ).join('')}
    </tr>
  `).join('');
  return tabla;
}

// Regla visual estricta: negativo = rojo con negritas; cero o positivo = verde con negritas.
// El 0 no es "positivo" ni "negativo" — es neutral. Se distingue con su
// propia clase (negrita, color de texto normal) en vez de pintarse verde.
function claseDiferencia(v) {
  if (v < 0) return 'dif-negativo';
  if (v > 0) return 'dif-positivo';
  return 'dif-neutro';
}
// Minimalista: solo color + negritas, sin íconos ni etiquetas de "(faltante)/(sobrante)".
function celdaDiferencia(v) {
  return `<td class="${claseDiferencia(v)}">${v > 0 ? '+' : ''}${v}</td>`;
}

// ==========================================
// LOGIN Y TABS
// ==========================================
async function initLogin() {
  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-error').textContent = '';
    try {
      LIDER = await api('POST', '/api/panel/login', {
        nombre: $('#in-lider-nombre').value,
        password: $('#in-lider-pass').value
      });
      await entrarAlPanel();
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  });

  $('#btn-salir-lider').addEventListener('click', async () => {
    await api('POST', '/api/panel/logout');
    LIDER = null;
    sessionStorage.removeItem(CLAVE_VISTA_ACTIVA);
    $('#pantalla-panel').classList.add('hidden');
    $('#root-login').classList.remove('hidden');
    $('#pantalla-login').classList.remove('hidden');
  });

  initSidebarMovil();
}

function initSidebarMovil() {
  const abrir = () => { $('#sidebar').classList.add('abierto'); $('#sidebar-overlay').classList.remove('hidden'); };
  const cerrar = () => { $('#sidebar').classList.remove('abierto'); $('#sidebar-overlay').classList.add('hidden'); };
  $('#btn-hamburguesa').addEventListener('click', abrir);
  $('#sidebar-overlay').addEventListener('click', cerrar);
  // Al elegir cualquier sección en móvil, se cierra el sidebar automáticamente.
  $$('.tab-btn').forEach(btn => btn.addEventListener('click', cerrar));
}

// ==========================================
// PERSISTENCIA DE PESTAÑA ACTIVA (sessionStorage)
// ==========================================
// Evita que un F5 accidental (o cualquier recarga) devuelva al usuario a la
// primera pestaña: se recuerda cuál estaba viendo y se reabre automáticamente.
const CLAVE_VISTA_ACTIVA = 'panelVistaActiva';

function activarTab(tabId) {
  const btn = $(`.tab-btn[data-tab="${tabId}"]`);
  // Si la pestaña guardada ya no existe o está oculta para este rol
  // (ej. "tab-personal" para un no-admin), cae de vuelta a la primera visible.
  const visible = btn && !btn.closest('.nav-seccion').classList.contains('hidden');
  const tabFinal = visible ? tabId : $$('.tab-btn').find(b => !b.closest('.nav-seccion').classList.contains('hidden')).dataset.tab;

  $$('.tab-btn').forEach(b => b.classList.toggle('activo', b.dataset.tab === tabFinal));
  $$('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== tabFinal));
  sessionStorage.setItem(CLAVE_VISTA_ACTIVA, tabFinal);

  // Cada pestaña puede tener un .floating-header de alto distinto (con o
  // sin texto de ayuda, con o sin botones T1/T2/T3). Se recalcula el "top"
  // del thead sticky para la pestaña que ACABA de quedar visible. Se espera
  // un frame para que el navegador ya haya aplicado el cambio de .hidden
  // antes de medir.
  requestAnimationFrame(sincronizarAltoFiltro);
}

function initTabs() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => activarTab(btn.dataset.tab));
  });
  // Al entrar (o recargar), reabre la última pestaña vista en esta sesión
  // de navegador; si no hay ninguna guardada, deja la que ya viene marcada
  // "activo" en el HTML (Entrada a Bodega).
  const guardada = sessionStorage.getItem(CLAVE_VISTA_ACTIVA);
  const actual = $('.tab-btn.activo');
  activarTab(guardada || (actual ? actual.dataset.tab : 'tab-bodega'));
}

// ==========================================
// SINCRONIZACIÓN EN VIVO: alto real del título + la barra de filtros
// ==========================================
// El título y la barra de filtros están pegados entre sí SIN ningún hueco
// (ver estilos.css: la barra tiene "top: 64px" = la altura exacta del
// título, cero margen). Lo único que varía de una pestaña a otra es la
// altura de la barra de filtros (algunas traen botones T1/T2/T3 + texto
// informativo, otras no) — por eso el "top" del thead sí se sigue midiendo
// en vivo, pero SIN sumar ningún espacio decorativo extra: es exactamente
// altura del título + altura real de la barra visible.
function sincronizarAltoFiltro() {
  const titulo = $('.panel-titulo-sticky');
  const tituloAlto = titulo ? Math.ceil(titulo.getBoundingClientRect().height) : 0;

  const visible = $$('.floating-header').find(h => h.offsetParent !== null);
  if (!visible) {
    document.documentElement.style.setProperty('--filtro-alto', `${tituloAlto}px`);
    return;
  }
  const alto = Math.ceil(visible.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--filtro-alto', `${tituloAlto + alto}px`);
}

function initSincronizacionFiltroAlto() {
  const headers = $$('.floating-header');
  if (!headers.length) return;
  const obs = new ResizeObserver(sincronizarAltoFiltro);
  headers.forEach(h => obs.observe(h));
  const titulo = $('.panel-titulo-sticky');
  if (titulo) obs.observe(titulo);
  window.addEventListener('resize', sincronizarAltoFiltro);
  sincronizarAltoFiltro();
}

function pintarContextoSidebar() {
  // Lo pedido explícitamente: los admins ven "PANEL ADMINISTRATIVO";
  // cada líder/operativo ve la lista real de sus sucursales asignadas.
  const cont = $('#sidebar-contexto');
  if (LIDER.rol === 'admin') {
    cont.innerHTML = `<span class="contexto-admin">PANEL ADMINISTRATIVO</span>`;
  } else {
    cont.innerHTML = `<span class="contexto-titulo">Mis sucursales</span>` +
      ordenarSucursales(LIDER.sucursales).map(s => `<span class="contexto-sucursal">${s}</span>`).join('');
  }

  $('#avatar-inicial').textContent = LIDER.nombre.trim().charAt(0).toUpperCase();
  $('#lider-nombre-footer').textContent = LIDER.nombre;
  $('#lider-rol-footer').textContent = LIDER.rol === 'admin' ? 'Admin · Todas' : `${LIDER.rol} · ${LIDER.sucursales.length} sucursal(es)`;
  actualizarAvatarUI(LIDER.foto || null);
}

// ==========================================
// FOTO DE PERFIL
// ==========================================
function actualizarAvatarUI(fotoUrl) {
  const img = $('#avatar-img');
  const inicial = $('#avatar-inicial');
  if (fotoUrl) {
    img.src = fotoUrl + '?t=' + Date.now(); // evita que quede en caché una imagen vieja
    img.classList.remove('hidden');
    inicial.classList.add('hidden');
    $('#avatar-btn-agregar').classList.add('hidden');
    $('#avatar-btn-cambiar').classList.remove('hidden');
    $('#avatar-btn-eliminar').classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    img.removeAttribute('src');
    inicial.classList.remove('hidden');
    $('#avatar-btn-agregar').classList.remove('hidden');
    $('#avatar-btn-cambiar').classList.add('hidden');
    $('#avatar-btn-eliminar').classList.add('hidden');
  }
}

function initAvatar() {
  const wrap = $('#avatar-wrap');
  const menu = $('#avatar-menu');
  const fileInput = $('#avatar-file-input');
  const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
  const TAMANO_MAX = 4 * 1024 * 1024; // 4MB, igual que el límite del backend

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.avatar-menu')) return; // los botones del menú ya manejan su propio clic
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => menu.classList.add('hidden'));

  const abrirSelector = () => { menu.classList.add('hidden'); fileInput.click(); };
  $('#avatar-btn-agregar').addEventListener('click', abrirSelector);
  $('#avatar-btn-cambiar').addEventListener('click', abrirSelector);

  fileInput.addEventListener('change', async () => {
    const archivo = fileInput.files[0];
    fileInput.value = '';
    if (!archivo) return;

    if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
      mostrarToast('Formato no válido. Usa una imagen JPG, PNG o WEBP.', 'error');
      return;
    }
    if (archivo.size > TAMANO_MAX) {
      mostrarToast('La imagen es demasiado pesada (máx. 4MB).', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('foto', archivo);
    try {
      const res = await fetch('/api/panel/avatar', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen.');
      LIDER.foto = data.foto;
      actualizarAvatarUI(LIDER.foto);
      mostrarToast('Foto de perfil actualizada.');
    } catch (err) {
      mostrarToast(err.message, 'error');
    }
  });

  $('#avatar-btn-eliminar').addEventListener('click', async () => {
    menu.classList.add('hidden');
    if (!confirm('¿Eliminar tu foto de perfil? Volverás al avatar predeterminado.')) return;
    try {
      await api('DELETE', '/api/panel/avatar');
      LIDER.foto = null;
      actualizarAvatarUI(null);
      mostrarToast('Foto de perfil eliminada.');
    } catch (err) {
      mostrarToast(err.message, 'error');
    }
  });
}

async function entrarAlPanel() {
  $('#root-login').classList.add('hidden');
  $('#pantalla-panel').classList.remove('hidden');
  pintarContextoSidebar();

  // Cada quien solo ve sus sucursales asignadas (los admins ven las 33), en orden A-Z.
  const opciones = ordenarSucursales(LIDER.sucursales).map(s => `<option value="${s}">${s}</option>`).join('');
  ['bodega-sucursal', 'stock-sucursal', 'contadores-sucursal', 'inv-sucursal', 'comp-sucursal', 'inv-excel-sucursal'].forEach(id => {
    $('#' + id).innerHTML = opciones;
  });
  $('#hist-sucursal').innerHTML = '<option value="">Todas</option>' + opciones;
  $('#tk-f-sucursal').innerHTML = '<option value="">Todas</option>' + opciones;
  $('#comp-fecha').value = CONFIG.fechaOperativaActual;

  // Pestañas exclusivas de administrador
  $$('.admin-only').forEach(el => el.classList.toggle('hidden', LIDER.rol !== 'admin'));

  initTabs();
  await initEntradaBodega();
  await initContadores();
  await initInventario();
  await initComparaciones();
  await initHistorial();
  initInventariosExcel();
  initModalEditar();
  await initReportesPanel();
  await initTicketsPanel();

  if (LIDER.rol === 'admin') {
    await initGestionPersonal();
    await initCatalogosAdmin();
    initMonitoreo();
  }

  initSincronizacionFiltroAlto();
}

// ==========================================
// ENTRADA A BODEGA + STOCK
// ==========================================
async function initEntradaBodega() {
  const render = () => {
    const cat = $('#bodega-categoria').value;
    construirTabla($('#tabla-bodega-entrada'), [{ clave: 'cant', label: 'Cantidad que ingresa', editable: true, valor: () => 0 }], CONFIG.catalogos[cat]);
  };
  render();
  $('#bodega-categoria').addEventListener('change', render);
  $('#bodega-sucursal').addEventListener('change', cargarStock);

  $('#btn-guardar-bodega').addEventListener('click', async () => {
    const sucursal = $('#bodega-sucursal').value;
    const cat = $('#bodega-categoria').value;
    const cantidades = { papeleria: {}, snack: {}, novedades: {} };
    $$('#tabla-bodega-entrada tbody tr').forEach(tr => {
      cantidades[cat][tr.dataset.item] = Number(tr.querySelector('.in-cant').value || 0);
    });
    try {
      await api('POST', '/api/panel/bodega/entrada', { sucursal, cantidades });
      $('#bodega-msg').textContent = 'Entrada registrada correctamente.';
      $('#bodega-msg').className = 'msg msg-ok';
      render();
      if ($('#stock-sucursal').value === sucursal) await cargarStock();
    } catch (err) {
      $('#bodega-msg').textContent = err.message;
      $('#bodega-msg').className = 'msg msg-error';
    }
  });

  await cargarStock();
}

async function cargarStock() {
  const sucursal = $('#stock-sucursal').value;
  const bodegas = await api('GET', '/api/panel/bodegas');
  const stock = bodegas[sucursal];
  const filas = [];
  CONFIG.categorias.forEach(cat => CONFIG.catalogos[cat].forEach(item => filas.push({ cat, item, cant: stock[cat][item] || 0 })));

  const tabla = $('#tabla-stock');
  tabla.innerHTML = `<thead><tr><th>Categoría</th><th>Insumo</th><th>Stock</th></tr></thead><tbody>
    ${filas.map(f => `<tr><td>${CONFIG.nombreCategoria[f.cat]}</td><td class="col-item">${f.item}</td><td>${f.cant}</td></tr>`).join('')}
  </tbody>`;
}

// ==========================================
// REVISIÓN DE CONTADORES
// ==========================================
async function initContadores() {
  $('#contadores-sucursal').addEventListener('change', cargarTurnosParaContadores);
  $('#contadores-turno').addEventListener('change', cargarRevisionContadores);
  $('#btn-guardar-contadores').addEventListener('click', guardarContadores);
  await cargarTurnosParaContadores();
}

async function cargarTurnosParaContadores() {
  const sucursal = $('#contadores-sucursal').value;
  const turnos = await api('GET', '/api/panel/turnos?sucursal=' + encodeURIComponent(sucursal));
  const cerrados = turnos.filter(t => t.cierre.completo);
  $('#contadores-turno').innerHTML = cerrados.map(t =>
    `<option value="${t.id}">${t.turno} — ${t.fecha} — ${t.nombreApertura}${t.corteCaja.completo ? '' : ' (sin corte de caja)'}</option>`
  ).join('') || '<option value="">Sin turnos cerrados</option>';
  await cargarRevisionContadores();
}

// Puede editar Inicial/Final cualquier sesión de panel válida (lider,
// operativo o admin) — es decir, todo el que logró entrar al panel.
function puedeEditarContadores() {
  return ['lider', 'operativo', 'admin'].includes(LIDER.rol);
}

// Construye UNA tabla de impresora con sus 3 grupos (COPIA / IMPRESION / OTROS).
function construirTablaImpresoraAgrupada(tablaId, datosImpresora, editable) {
  const tabla = $('#' + tablaId);
  if (!tabla) { console.error(`construirTablaImpresoraAgrupada: no existe #${tablaId} en el HTML.`); return; }
  const filaGrupo = (nombre) => `<tr class="fila-grupo"><td colspan="4">${nombre}</td></tr>`;
  const filaItem = (f) => `
    <tr data-funcion="${f.funcion}">
      <td class="col-item">${f.funcion}</td>
      <td>${editable ? `<input type="number" class="in-cont-inicial" value="${f.inicial}">` : f.inicial}</td>
      <td>${editable ? `<input type="number" class="in-cont-final" value="${f.final}">` : f.final}</td>
      <td class="celda-total-cont">${f.total}</td>
    </tr>`;

  tabla.innerHTML = `<thead><tr><th>Función</th><th>Inicial</th><th>Final</th><th>Total</th></tr></thead><tbody>
    ${filaGrupo('COPIA')}${datosImpresora.grupos.COPIA.map(filaItem).join('')}
    ${filaGrupo('IMPRESION')}${datosImpresora.grupos.IMPRESION.map(filaItem).join('')}
    ${filaGrupo('OTROS')}${datosImpresora.grupos.OTROS.map(filaItem).join('')}
  </tbody>`;

  if (editable) {
    $$('tr[data-funcion]', tabla).forEach(tr => {
      const inIni = tr.querySelector('.in-cont-inicial');
      const inFin = tr.querySelector('.in-cont-final');
      if (!inIni || !inFin) return;
      const recalc = () => {
        tr.querySelector('.celda-total-cont').textContent = Number(inFin.value || 0) - Number(inIni.value || 0);
      };
      inIni.addEventListener('input', recalc);
      inFin.addEventListener('input', recalc);
    });
  }
}

function construirTablaCuadre(data) {
  const tbody = $('#tbody-cuadre');
  if (!tbody) { console.error('construirTablaCuadre: no existe #tbody-cuadre en el HTML.'); return; }
  const filaMetrica = (label, contadorVal, cobradoVal) =>
    `<tr><td class="col-item">${label}</td><td>${contadorVal}</td><td>${cobradoVal}</td>${celdaDiferencia(cobradoVal - contadorVal)}</tr>`;

  tbody.innerHTML = `
    ${filaMetrica('Copia B/N', data.contadores.copiaByn, data.cobradas.copiaByn)}
    ${filaMetrica('Impresión B/N', data.contadores.impreByn, data.cobradas.impreByn)}
    ${filaMetrica('Copia Color', data.contadores.copiaColor, data.cobradas.copiaColor)}
    ${filaMetrica('Impresión Color', data.contadores.impreColor, data.cobradas.impreColor)}
    <tr><td class="col-item">Merma</td><td>—</td><td>${data.cobradas.merma}</td><td>—</td></tr>
    <tr class="fila-diferencia"><td class="col-item"><b>TOTAL</b></td><td><b>${data.contadores.total}</b></td><td><b>${data.cobradas.total + data.cobradas.merma}</b></td></tr>
    <tr><td colspan="4" class="separador-informativas">Informativas — NO se suman (ya están dentro de los clics generales de copia/impresión)</td></tr>
    ${data.cobradas.informativas.map(f => `<tr class="fila-informativa"><td class="col-item">${f.item}</td><td colspan="3">${f.valor}</td></tr>`).join('')}
    <tr class="fila-tramites">
      <td class="col-item">Trámites</td>
      <td colspan="3">CURP: ${data.tramites.CURP || 0} · ACTA: ${data.tramites.ACTA || 0} · RFC: ${data.tramites.RFC || 0} · NSS: ${data.tramites.NSS || 0}</td>
    </tr>
  `;
  // celdaDiferencia ya regresa el <td> completo con su color y negritas; se
  // inserta aparte para no duplicar esa lógica dentro del template de arriba.
  const filaDif = tbody.querySelector('.fila-diferencia');
  filaDif.innerHTML = `<td class="col-item"><b>TOTAL</b></td><td><b>${data.contadores.total}</b></td><td><b>${data.cobradas.total + data.cobradas.merma}</b></td>` + celdaDiferencia(data.diferenciaGlobal);
}

function construirTablaScanner(data) {
  const tbody = $('#tbody-scanner');
  if (!tbody) { console.error('construirTablaScanner: no existe #tbody-scanner en el HTML.'); return; }
  tbody.innerHTML = `
    <tr>
      <td class="col-item">Scanner + Scanner G (ambas impresoras)</td>
      <td>${data.scanner.procesado}</td>
      <td>${data.scanner.merma}</td>
      <td>${data.scanner.cobrado}</td>
      <td class="dif-pendiente"></td>
    </tr>
    <tr class="fila-diferencia"><td colspan="5" class="col-item"><b>TOTAL (Diferencia Scanner)</b></td></tr>
  `;
  // Diferencia también visible en la fila del concepto (columna propia),
  // además del resumen TOTAL de abajo — mismo valor, dos lugares.
  const celdaFila = tbody.querySelector('.dif-pendiente');
  celdaFila.outerHTML = celdaDiferencia(data.scanner.diferencia);
  const filaDif = tbody.querySelector('.fila-diferencia');
  filaDif.innerHTML = `<td class="col-item" colspan="4"><b>TOTAL (Diferencia Scanner)</b></td>` + celdaDiferencia(data.scanner.diferencia);
}

let CONTADORES_DATA_ACTUAL = null;

function pintarVistaContadores(data, editable) {
  construirTablaImpresoraAgrupada('tabla-imp1', data.impresoras.impresora1, editable);
  construirTablaImpresoraAgrupada('tabla-imp2', data.impresoras.impresora2, editable);
  construirTablaCuadre(data);
  construirTablaScanner(data);
}

async function cargarRevisionContadores() {
  const id = $('#contadores-turno').value;
  const info = $('#contadores-info');
  $('#contadores-msg').textContent = '';
  const limpiarTablas = () => {
    $('#tabla-imp1').innerHTML = ''; $('#tabla-imp2').innerHTML = '';
    // tabla-cuadre y tabla-scanner ya tienen <thead> ESTÁTICO en panel.html —
    // limpiar tabla.innerHTML también lo borraría a él, dejando #tbody-cuadre
    // y #tbody-scanner en null la próxima vez que se intente pintar (el
    // "Cannot set properties of null" reportado). Solo se limpia el tbody.
    const tbodyCuadre = $('#tbody-cuadre'); if (tbodyCuadre) tbodyCuadre.innerHTML = '';
    const tbodyScanner = $('#tbody-scanner'); if (tbodyScanner) tbodyScanner.innerHTML = '';
  };
  if (!id) { limpiarTablas(); info.textContent = ''; return; }

  try {
    const data = await api('GET', '/api/panel/revision-contadores/' + id);
    CONTADORES_DATA_ACTUAL = data;
    info.innerHTML = `Turno ${data.turno.turno} · ${data.turno.fecha} · Cierre: ${data.turno.colaboradorCierre} · Caja: ${data.turno.colaboradorCaja || '—'}` +
      (data.turno.corteCajaCompleto ? '' : ' <span class="dif-negativo">(Corte de Caja aún no registrado, valores en 0)</span>');

    const editable = puedeEditarContadores();
    pintarVistaContadores(data, editable);
    $('#btn-guardar-contadores').classList.toggle('hidden', !editable);
  } catch (err) {
    limpiarTablas();
    info.innerHTML = `<span class="dif-negativo">${err.message}</span>`;
  }
}

async function guardarContadores() {
  const id = $('#contadores-turno').value;
  if (!id) return;

  const leerTabla = (tablaId) => {
    const out = { inicial: {}, final: {} };
    $$(`#${tablaId} tbody tr[data-funcion]`).forEach(tr => {
      const funcion = tr.dataset.funcion;
      const inIni = tr.querySelector('.in-cont-inicial');
      const inFin = tr.querySelector('.in-cont-final');
      if (inIni) out.inicial[funcion] = Number(inIni.value || 0);
      if (inFin) out.final[funcion] = Number(inFin.value || 0);
    });
    return out;
  };

  const body = { impresoras: { impresora1: leerTabla('tabla-imp1'), impresora2: leerTabla('tabla-imp2') } };

  try {
    const data = await api('PUT', `/api/panel/revision-contadores/${id}`, body);
    CONTADORES_DATA_ACTUAL = data;
    pintarVistaContadores(data, true);
    $('#contadores-msg').textContent = 'Contadores actualizados y recalculados correctamente.';
    $('#contadores-msg').className = 'msg msg-ok';
    mostrarToast('Cambios guardados correctamente.');
  } catch (err) {
    $('#contadores-msg').textContent = err.message;
    $('#contadores-msg').className = 'msg msg-error';
    mostrarToast(err.message, 'error');
  }
}

// ==========================================
// PISO, BODEGA Y SISTEMA (Bitácora)
// ==========================================
let INV_TURNO_ACTIVO = 'T1';

async function initInventario() {
  $('#inv-fecha').value = CONFIG.fechaOperativaActual;
  $('#inv-sucursal').addEventListener('change', cargarInventario);
  $('#inv-fecha').addEventListener('change', cargarInventario);
  $('#btn-guardar-revision').addEventListener('click', guardarRevisionInventario);

  // Selector [Ver T1] [Ver T2] [Ver T3]: recarga la tabla vía fetch, sin
  // recargar la página, exactamente para la fecha operativa seleccionada.
  $('#inv-turno-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn-sec');
    if (!btn) return;
    $$('#inv-turno-tabs .tab-btn-sec').forEach(b => b.classList.remove('activo'));
    btn.classList.add('activo');
    INV_TURNO_ACTIVO = btn.dataset.turno;
    cargarInventario();
  });

  await cargarInventario();
}

async function guardarRevisionInventario() {
  const sucursal = $('#inv-sucursal').value;
  const fecha = $('#inv-fecha').value || CONFIG.fechaOperativaActual;
  const msg = $('#inv-revision-msg');
  msg.textContent = '';
  try {
    await api('POST', `/api/panel/auditoria-inventario/${encodeURIComponent(sucursal)}/archivar`, { fecha, turno: INV_TURNO_ACTIVO });
    msg.textContent = 'Revisión archivada correctamente.';
    msg.className = 'msg msg-ok';
    mostrarToast('Revisión archivada correctamente.');
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg msg-error';
    mostrarToast(err.message, 'error');
  }
}

async function cargarInventario() {
  $('#inv-revision-msg').textContent = '';
  const sucursal = $('#inv-sucursal').value;
  const fecha = $('#inv-fecha').value || CONFIG.fechaOperativaActual;
  const data = await api('GET', `/api/panel/auditoria-inventario/${encodeURIComponent(sucursal)}?fecha=${encodeURIComponent(fecha)}&turno=${INV_TURNO_ACTIVO}`);

  $('#inv-info').textContent = data.turnoActualId
    ? `Turno de referencia: ${data.turnoActualTurno} (${data.turnoActualEstado}) — ${data.fecha}`
    : `Sin captura de ${data.turno} en ${sucursal} para el ${data.fecha}.`;

  const tbody = $('#tbody-inventario');
  if (!tbody) { console.error('cargarInventario: no existe #tbody-inventario en el HTML.'); return; }
  tbody.innerHTML = `
    ${data.filas.map(f => `
      <tr data-categoria="${f.categoria}" data-item="${f.item}"
          data-recibo="${f.recibo}" data-me-surten="${f.meSurten}" data-vendido="${f.vendido}" data-bodega="${f.bodega}">
        <td>${f.categoriaLabel}</td>
        <td class="col-item">${f.item}</td>
        <td>${f.turnoAnterior}</td>
        <td>${f.recibo}</td>
        <td>${f.meSurten}</td>
        <td>${f.vendido}</td>
        <td class="celda-entrego"><b>${f.entrego}</b></td>
        <td>${f.bodega}</td>
        <td class="celda-total-fisico"><b>${f.totalFisico}</b></td>
        <td><input type="number" class="in-sistema" value="${f.sistema}"></td>
        ${celdaDiferencia(f.diferencia)}
      </tr>
    `).join('')}
  `;

  $$('.in-sistema', tbody).forEach(input => {
    const tr = input.closest('tr');
    const categoria = tr.dataset.categoria, item = tr.dataset.item;
    const celdaEntrego = tr.querySelector('.celda-entrego');
    const celdaTotal = tr.querySelector('.celda-total-fisico');
    const celdaDif = tr.querySelector('td:last-child');

    // Fórmula obligatoria, encadenada en 3 pasos, recalculada a partir de
    // los datos de la propia fila (no un valor cacheado) para que CUALQUIER
    // cambio en las columnas de captura se refleje de inmediato:
    //   1) Entregó      = Recibo + Me Surten - Vendido
    //   2) Total Físico = Entregó + Bodega
    //   3) Diferencia   = Total Físico - Sistema
    const recalcular = (sistema) => {
      const entrego = Number(tr.dataset.recibo) + Number(tr.dataset.meSurten) - Number(tr.dataset.vendido);
      const totalFisico = entrego + Number(tr.dataset.bodega);
      const diff = totalFisico - sistema;
      celdaEntrego.innerHTML = `<b>${entrego}</b>`;
      celdaTotal.innerHTML = `<b>${totalFisico}</b>`;
      celdaDif.className = claseDiferencia(diff);
      celdaDif.textContent = (diff > 0 ? '+' : '') + diff;
    };

    input.addEventListener('input', () => recalcular(Number(input.value || 0)));
    input.addEventListener('change', async () => {
      const cantidad = Number(input.value || 0);
      await api('POST', '/api/panel/sistema', { sucursal, categoria, item, cantidad });
      recalcular(cantidad);
    });
  });
}

// ==========================================
// COMPARACIONES
// ==========================================
async function initComparaciones() {
  $('#comp-sucursal').addEventListener('change', cargarComparaciones);
  $('#comp-categoria').addEventListener('change', cargarComparaciones);
  $('#comp-fecha').addEventListener('change', cargarComparaciones);
  await cargarComparaciones();
}

async function cargarComparaciones() {
  const sucursal = $('#comp-sucursal').value;
  const categoria = $('#comp-categoria').value;
  const fecha = $('#comp-fecha').value;
  const data = await api('GET', `/api/panel/comparaciones/${encodeURIComponent(sucursal)}?categoria=${categoria}&fecha=${fecha}`);

  const val = (v) => v === null ? '—' : v;
  const celdaDif = (v) => v === null ? '<td>—</td>' : celdaDiferencia(v);

  const tabla = $('#tabla-comparaciones');
  tabla.innerHTML = `<thead><tr>
    <th>Insumo</th>
    <th>Terminó T3 (día anterior)</th><th>Empezó T1</th><th>Dif. T1</th>
    <th>Terminó T1</th><th>Empezó T2</th><th>Dif. T2</th>
    <th>Terminó T2</th><th>Empezó T3</th><th>Dif. T3</th>
  </tr></thead><tbody>
    ${data.filas.map(f => `
      <tr>
        <td class="col-item">${f.item}</td>
        <td>${val(f.terminoT3anterior)}</td><td>${val(f.empezoT1)}</td>${celdaDif(f.diferenciaT1)}
        <td>${val(f.terminoT1)}</td><td>${val(f.empezoT2)}</td>${celdaDif(f.diferenciaT2)}
        <td>${val(f.terminoT2)}</td><td>${val(f.empezoT3)}</td>${celdaDif(f.diferenciaT3)}
      </tr>
    `).join('')}
  </tbody>`;
}

// ==========================================
// HISTORIAL
// ==========================================
let TURNOS_CACHE = []; // última lista cargada, para no volver a pedirla al abrir el modal

async function initHistorial() {
  $('#hist-sucursal').addEventListener('change', cargarHistorial);
  await cargarHistorial();
}

async function cargarHistorial() {
  const sucursal = $('#hist-sucursal').value;
  const url = '/api/panel/turnos' + (sucursal ? '?sucursal=' + encodeURIComponent(sucursal) : '');
  const turnos = await api('GET', url);
  TURNOS_CACHE = turnos;

  const tbody = $('#tbody-historial');
  if (!tbody) { console.error('cargarHistorial: no existe #tbody-historial en el HTML.'); return; }
  tbody.innerHTML = `
    ${turnos.map(t => `
      <tr data-id="${t.id}">
        <td class="col-item">${t.sucursal}</td>
        <td>${t.turno}</td>
        <td class="celda-fecha-editable">
          <input type="date" class="in-fecha-rapida" value="${t.fecha}">
          <button class="btn-accion btn-editar btn-guardar-fecha" data-guardar-fecha="${t.id}">Guardar</button>
        </td>
        <td>${t.colaboradores.join(', ')}</td>
        <td>${t.estado === 'abierto' ? '<span class="badge-abierto">Abierto</span>' : '<span class="badge-cerrado">Cerrado</span>'}</td>
        <td>${new Date(t.inicioHora).toLocaleString('es-MX')}</td>
        <td>${t.cierreHora ? new Date(t.cierreHora).toLocaleString('es-MX') : '—'}</td>
        <td>${t.corteCaja.completo ? '<span class="badge-abierto">Registrado</span>' : '<span class="badge-cerrado">Pendiente</span>'}</td>
        <td>
          <button class="btn-accion btn-editar" data-editar="${t.id}">Editar</button>
          <button class="btn-accion btn-eliminar" data-eliminar="${t.id}">Eliminar</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="9">Sin registros.</td></tr>'}
  `;

  $$('[data-editar]', tbody).forEach(btn => btn.addEventListener('click', () => abrirModalEditar(btn.dataset.editar)));
  $$('[data-eliminar]', tbody).forEach(btn => btn.addEventListener('click', () => eliminarTurno(btn.dataset.eliminar)));
  $$('[data-guardar-fecha]', tbody).forEach(btn => btn.addEventListener('click', () => guardarFechaRapida(btn.dataset.guardarFecha)));
}

async function guardarFechaRapida(id) {
  const tr = $(`tr[data-id="${id}"]`);
  const fecha = tr.querySelector('.in-fecha-rapida').value;
  const btn = tr.querySelector('.btn-guardar-fecha');
  try {
    await api('PUT', '/api/panel/turnos/editar-fecha', { id: Number(id), fecha });
    mostrarToast('Fecha actualizada correctamente.');
    // Re-fetch específico (no window.location.reload()): repinta solo la
    // tabla de Gestión de Turnos con los filtros que ya estaban activos.
    // Esto también saca de la vista la fila si su nueva fecha ya no calza
    // con el filtro de fecha seleccionado, en vez de dejarla "pegada".
    await cargarHistorial();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

async function eliminarTurno(id) {
  if (!confirm('¿Seguro que quieres eliminar este turno? Esta acción no se puede deshacer.')) return;
  try {
    await api('DELETE', `/api/panel/turnos/${id}`);
    await cargarHistorial();
    mostrarToast('Turno eliminado correctamente.');
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

// ==========================================
// MODAL: EDITAR TURNO (pruebas retroactivas / correcciones)
// ==========================================
let TURNO_EDITANDO = null;

function abrirModalEditar(id) {
  const t = TURNOS_CACHE.find(x => String(x.id) === String(id));
  if (!t) return;
  TURNO_EDITANDO = t;
  $('#modal-editar-msg').textContent = '';
  $('#modal-editar-id').textContent = `#${t.id}`;

  $('#ed-fecha').value = t.fecha;
  $('#ed-turno').value = t.turno;
  $('#ed-sucursal').innerHTML = ordenarSucursales(LIDER.sucursales).map(s => `<option value="${s}" ${s === t.sucursal ? 'selected' : ''}>${s}</option>`).join('');
  $('#ed-colaborador').value = t.colaborador || t.nombreApertura || '';

  $('#ed-ultimo-ticket').value = t.cierre.ultimoTicket || '';
  $('#ed-venta-total').value = t.corteCaja.ventaTotal || 0;
  $('#ed-sdp').value = t.corteCaja.sdp || 0;
  $('#ed-sobres').value = t.corteCaja.sobresActaProcesados || 0;
  $('#ed-ti24h').value = t.corteCaja.ti24h || 0;
  $('#ed-tgen').value = t.corteCaja.tGen || 0;
  $('#ed-scanner-cobrados').value = t.corteCaja.scannerCobrados ?? '';
  $('#ed-scanner-merma').value = t.corteCaja.scannerMerma ?? '';
  $('#ed-explicacion').value = t.corteCaja.explicacionVenta || '';

  construirTablaInventarioEdicion();
  construirTablaContadoresEdicion();
  actualizarSelectorArticuloEdicion();

  $('#modal-editar-overlay').classList.remove('hidden');
}

function cerrarModalEditar() {
  $('#modal-editar-overlay').classList.add('hidden');
  TURNO_EDITANDO = null;
}

function actualizarSelectorArticuloEdicion() {
  const cat = $('#ed-nueva-categoria').value;
  $('#ed-nuevo-articulo').innerHTML = CONFIG.catalogos[cat].map(item => `<option value="${item}">${item}</option>`).join('');
}

function construirTablaInventarioEdicion(itemsExtra) {
  const t = TURNO_EDITANDO;
  const filas = []; // { categoria, item }
  const vistos = new Set();
  CONFIG.categorias.forEach(cat => {
    CONFIG.catalogos[cat].forEach(item => {
      const recibo = Number(t.modulos[cat].recibo[item] || 0);
      const vendido = Number((t.cierre.vendido[cat] || {})[item] || 0);
      const merma = Number((t.cierre.merma[cat] || {})[item] || 0);
      if (recibo || vendido || merma) { filas.push({ categoria: cat, item }); vistos.add(cat + '|' + item); }
    });
  });
  (itemsExtra || []).forEach(({ categoria, item }) => {
    const key = categoria + '|' + item;
    if (!vistos.has(key)) { filas.push({ categoria, item }); vistos.add(key); }
  });

  const tabla = $('#ed-tabla-inventario');
  tabla.innerHTML = `<thead><tr><th>Categoría</th><th>Artículo</th><th>Recibo</th><th>Vendido</th><th>Merma</th></tr></thead><tbody>
    ${filas.map(f => {
      const recibo = Number(t.modulos[f.categoria].recibo[f.item] || 0);
      const vendido = Number((t.cierre.vendido[f.categoria] || {})[f.item] || 0);
      const merma = Number((t.cierre.merma[f.categoria] || {})[f.item] || 0);
      return `<tr data-categoria="${f.categoria}" data-item="${f.item}">
        <td>${CONFIG.nombreCategoria[f.categoria]}</td>
        <td class="col-item">${f.item}</td>
        <td><input type="number" class="ed-in-recibo" value="${recibo}"></td>
        <td><input type="number" class="ed-in-vendido" value="${vendido}"></td>
        <td><input type="number" class="ed-in-merma" value="${merma}"></td>
      </tr>`;
    }).join('') || '<tr><td colspan="5">Sin movimientos capturados todavía.</td></tr>'}
  </tbody>`;

  return filas;
}

function construirTablaContadoresEdicion() {
  const t = TURNO_EDITANDO;
  const filas = [];
  ['impresora1', 'impresora2'].forEach(imp => {
    if (!t.cierre.impresoras) return;
    CONFIG.impresoraItems.forEach(item => {
      const anterior = Number(t.cierre.impresoras[imp].anterior[item] || 0);
      const actual = Number(t.cierre.impresoras[imp].actual[item] || 0);
      const procesado = Number(t.cierre.impresoras[imp].procesado[item] || 0);
      if (anterior || actual || procesado) filas.push({ imp, item, anterior, actual });
    });
  });

  const tabla = $('#ed-tabla-contadores');
  tabla.innerHTML = `<thead><tr><th>Impresora</th><th>Artículo</th><th>Anterior</th><th>Actual</th><th>Procesado</th></tr></thead><tbody>
    ${filas.map(f => `
      <tr data-imp="${f.imp}" data-item="${f.item}">
        <td>${f.imp === 'impresora1' ? 'Impresora 1' : 'Impresora 2'}</td>
        <td class="col-item">${f.item}</td>
        <td>${f.anterior}</td>
        <td><input type="number" class="ed-in-actual" value="${f.actual}"></td>
        <td class="ed-celda-procesado">${f.actual - f.anterior}</td>
      </tr>
    `).join('') || '<tr><td colspan="5">Sin contadores capturados todavía.</td></tr>'}
  </tbody>`;

  $$('.ed-in-actual', tabla).forEach(input => {
    const tr = input.closest('tr');
    const anterior = Number(tr.children[2].textContent || 0);
    input.addEventListener('input', () => {
      tr.querySelector('.ed-celda-procesado').textContent = Number(input.value || 0) - anterior;
    });
  });
}

async function guardarEdicionTurno() {
  const t = TURNO_EDITANDO;
  if (!t) return;

  const ajustes = { papeleria: { recibo: {}, vendido: {}, merma: {} }, snack: { recibo: {}, vendido: {}, merma: {} }, novedades: { recibo: {}, vendido: {}, merma: {} } };
  $$('#ed-tabla-inventario tbody tr[data-categoria]').forEach(tr => {
    const cat = tr.dataset.categoria, item = tr.dataset.item;
    ajustes[cat].recibo[item] = Number(tr.querySelector('.ed-in-recibo').value || 0);
    ajustes[cat].vendido[item] = Number(tr.querySelector('.ed-in-vendido').value || 0);
    ajustes[cat].merma[item] = Number(tr.querySelector('.ed-in-merma').value || 0);
  });

  const impresoras = { impresora1: { actual: {} }, impresora2: { actual: {} } };
  $$('#ed-tabla-contadores tbody tr[data-imp]').forEach(tr => {
    impresoras[tr.dataset.imp].actual[tr.dataset.item] = Number(tr.querySelector('.ed-in-actual').value || 0);
  });

  const body = {
    fecha: $('#ed-fecha').value,
    turno: $('#ed-turno').value,
    sucursal: $('#ed-sucursal').value,
    colaborador: $('#ed-colaborador').value,
    ajustes,
    impresoras,
    corteCaja: {
      ultimoTicket: $('#ed-ultimo-ticket').value,
      ventaTotal: Number($('#ed-venta-total').value || 0),
      sdp: Number($('#ed-sdp').value || 0),
      sobresActaProcesados: Number($('#ed-sobres').value || 0),
      ti24h: Number($('#ed-ti24h').value || 0),
      tGen: Number($('#ed-tgen').value || 0),
      scannerCobrados: Number($('#ed-scanner-cobrados').value || 0),
      scannerMerma: Number($('#ed-scanner-merma').value || 0),
      explicacionVenta: $('#ed-explicacion').value
    }
  };

  try {
    await api('PUT', `/api/panel/turnos/${t.id}`, body);
    $('#modal-editar-msg').textContent = 'Turno actualizado correctamente.';
    $('#modal-editar-msg').className = 'msg msg-ok';
    await cargarHistorial();
    mostrarToast('Cambios guardados correctamente.');
    setTimeout(cerrarModalEditar, 600);
  } catch (err) {
    $('#modal-editar-msg').textContent = err.message;
    $('#modal-editar-msg').className = 'msg msg-error';
    mostrarToast(err.message, 'error');
  }
}

function initModalEditar() {
  $('#ed-nueva-categoria').addEventListener('change', actualizarSelectorArticuloEdicion);
  $('#ed-btn-agregar-articulo').addEventListener('click', () => {
    const categoria = $('#ed-nueva-categoria').value;
    const item = $('#ed-nuevo-articulo').value;
    const filasActuales = $$('#ed-tabla-inventario tbody tr[data-categoria]').map(tr => ({ categoria: tr.dataset.categoria, item: tr.dataset.item }));
    construirTablaInventarioEdicion([...filasActuales, { categoria, item }]);
  });
  $('#modal-editar-cancelar').addEventListener('click', cerrarModalEditar);
  $('#modal-editar-guardar').addEventListener('click', guardarEdicionTurno);
}

// ==========================================
// INVENTARIOS AUTOMÁTICOS (líderes)
// ==========================================
const NOMBRE_INV = { papeleria: 'Papelería', snack: 'Snack', novedades: 'Novedades', limpieza: 'Limpieza' };

function initInventariosExcel() {
  $$('.inv-btn').forEach(btn => {
    btn.addEventListener('click', () => descargarInventarioLider(btn.dataset.inv));
  });
}

async function descargarInventarioLider(categoria) {
  const sucursal = $('#inv-excel-sucursal').value;
  $('#inv-excel-msg').textContent = `Generando inventario de ${NOMBRE_INV[categoria]} — ${sucursal}...`;
  $('#inv-excel-msg').className = 'msg';
  try {
    const res = await fetch(`/api/panel/inventarios/${encodeURIComponent(sucursal)}/${categoria}`);
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

    $('#inv-excel-msg').textContent = `Inventario de ${NOMBRE_INV[categoria]} (${sucursal}) descargado.`;
    $('#inv-excel-msg').className = 'msg msg-ok';
  } catch (err) {
    $('#inv-excel-msg').textContent = err.message;
    $('#inv-excel-msg').className = 'msg msg-error';
  }
}

// ==========================================
// GESTIÓN DE PERSONAL (solo admins)
// ==========================================
let USUARIOS_CACHE = [];

async function initGestionPersonal() {
  $('#btn-crear-usuario').addEventListener('click', crearUsuario);
  $('#modal-sucursales-cancelar').addEventListener('click', () => $('#modal-sucursales-overlay').classList.add('hidden'));
  $('#modal-sucursales-guardar').addEventListener('click', guardarSucursalesUsuario);
  $('#modal-password-cancelar').addEventListener('click', () => $('#modal-password-overlay').classList.add('hidden'));
  $('#modal-password-guardar').addEventListener('click', guardarPasswordUsuario);
  await cargarPersonal();
}

async function cargarPersonal() {
  USUARIOS_CACHE = await api('GET', '/api/panel/usuarios');
  const tabla = $('#tabla-personal');
  tabla.innerHTML = `<thead><tr><th>Nombre</th><th>Rol</th><th>Sucursales asignadas</th><th>Acciones</th></tr></thead><tbody>
    ${USUARIOS_CACHE.map(u => `
      <tr data-nombre="${u.nombre}">
        <td class="col-item">${u.nombre}</td>
        <td><span class="badge-rol ${u.rol}">${u.rol}</span></td>
        <td>${u.sucursales.length ? u.sucursales.join(', ') : '<span class="dif-negativo">Sin sucursales asignadas</span>'}</td>
        <td>
          <button class="btn-accion btn-editar" data-sucursales="${u.nombre}">Editar Sucursales</button>
          <button class="btn-accion btn-editar" data-password="${u.nombre}">Cambiar Contraseña</button>
          <button class="btn-accion btn-eliminar" data-borrar-usuario="${u.nombre}">Eliminar</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="4">Sin operativos ni líderes registrados.</td></tr>'}
  </tbody>`;

  $$('[data-sucursales]', tabla).forEach(btn => btn.addEventListener('click', () => abrirModalSucursales(btn.dataset.sucursales)));
  $$('[data-password]', tabla).forEach(btn => btn.addEventListener('click', () => abrirModalPassword(btn.dataset.password)));
  $$('[data-borrar-usuario]', tabla).forEach(btn => btn.addEventListener('click', () => eliminarUsuario(btn.dataset.borrarUsuario)));
}

async function crearUsuario() {
  const nombre = $('#np-nombre').value.trim();
  const password = $('#np-password').value.trim();
  const rol = $('#np-rol').value;
  $('#personal-msg').textContent = '';
  try {
    await api('POST', '/api/panel/usuarios', { nombre, password, rol, sucursales: [] });
    $('#np-nombre').value = ''; $('#np-password').value = '';
    $('#personal-msg').textContent = `${nombre} creado correctamente. Ahora asígnale sus sucursales.`;
    $('#personal-msg').className = 'msg msg-ok';
    await cargarPersonal();
  } catch (err) {
    $('#personal-msg').textContent = err.message;
    $('#personal-msg').className = 'msg msg-error';
  }
}

async function eliminarUsuario(nombre) {
  if (!confirm(`¿Eliminar a ${nombre}? Ya no podrá entrar al panel.`)) return;
  try {
    await api('DELETE', `/api/panel/usuarios/${encodeURIComponent(nombre)}`);
    await cargarPersonal();
    mostrarToast('Usuario eliminado correctamente.');
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

let SUCURSALES_CATALOGO_CACHE = null;

async function abrirModalSucursales(nombre) {
  if (!SUCURSALES_CATALOGO_CACHE) SUCURSALES_CATALOGO_CACHE = await api('GET', '/api/panel/sucursales-catalogo');
  const u = USUARIOS_CACHE.find(x => x.nombre === nombre);
  if (!u) return;

  $('#modal-sucursales-nombre').textContent = u.nombre;
  $('#modal-sucursales-msg').textContent = '';
  $('#modal-sucursales-checklist').innerHTML = ordenarSucursales(SUCURSALES_CATALOGO_CACHE).map(s => `
    <label><input type="checkbox" value="${s}" ${u.sucursales.includes(s) ? 'checked' : ''}> ${s}</label>
  `).join('');
  $('#modal-sucursales-overlay').dataset.nombre = nombre;
  $('#modal-sucursales-overlay').classList.remove('hidden');
}

async function guardarSucursalesUsuario() {
  const nombre = $('#modal-sucursales-overlay').dataset.nombre;
  const sucursales = $$('#modal-sucursales-checklist input:checked').map(cb => cb.value);
  try {
    await api('PUT', `/api/panel/usuarios/${encodeURIComponent(nombre)}/sucursales`, { sucursales });
    $('#modal-sucursales-msg').textContent = 'Sucursales actualizadas.';
    $('#modal-sucursales-msg').className = 'msg msg-ok';
    await cargarPersonal();
    setTimeout(() => $('#modal-sucursales-overlay').classList.add('hidden'), 500);
  } catch (err) {
    $('#modal-sucursales-msg').textContent = err.message;
    $('#modal-sucursales-msg').className = 'msg msg-error';
  }
}

function abrirModalPassword(nombre) {
  $('#modal-password-nombre').textContent = nombre;
  $('#modal-password-input').value = '';
  $('#modal-password-msg').textContent = '';
  $('#modal-password-overlay').dataset.nombre = nombre;
  $('#modal-password-overlay').classList.remove('hidden');
}

async function guardarPasswordUsuario() {
  const nombre = $('#modal-password-overlay').dataset.nombre;
  const password = $('#modal-password-input').value.trim();
  if (!password) {
    $('#modal-password-msg').textContent = 'Escribe una contraseña.';
    $('#modal-password-msg').className = 'msg msg-error';
    return;
  }
  try {
    await api('PUT', `/api/panel/usuarios/${encodeURIComponent(nombre)}/password`, { password });
    $('#modal-password-msg').textContent = 'Contraseña actualizada.';
    $('#modal-password-msg').className = 'msg msg-ok';
    setTimeout(() => $('#modal-password-overlay').classList.add('hidden'), 500);
  } catch (err) {
    $('#modal-password-msg').textContent = err.message;
    $('#modal-password-msg').className = 'msg msg-error';
  }
}

// ==========================================
// PANEL DE MONITOREO EN TIEMPO REAL ("Ojo de Dios")
// ==========================================
let MONITOREO_CATEGORIA_ACTUAL = 'colaboradores';
let MONITOREO_INTERVALO = null;

function initMonitoreo() {
  $$('.tab-btn-sec').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn-sec').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      MONITOREO_CATEGORIA_ACTUAL = btn.dataset.mon;
      cargarActividad();
    });
  });

  // Solo se refresca automáticamente mientras la pestaña de Monitoreo está visible.
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'tab-monitoreo') {
        cargarActividad();
        if (!MONITOREO_INTERVALO) MONITOREO_INTERVALO = setInterval(cargarActividad, 5000);
      } else if (MONITOREO_INTERVALO) {
        clearInterval(MONITOREO_INTERVALO);
        MONITOREO_INTERVALO = null;
      }
    });
  });
}

function formatoHora(iso) {
  return new Date(iso).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

async function cargarActividad() {
  try {
    const eventos = await api('GET', `/api/actividad?categoria=${MONITOREO_CATEGORIA_ACTUAL}&limite=150`);
    const cont = $('#lista-actividad');
    if (!eventos.length) {
      cont.innerHTML = '<p class="actividad-vacio">Sin actividad registrada todavía en esta categoría.</p>';
      return;
    }
    cont.innerHTML = eventos.map(e => `
      <div class="actividad-item">
        <span class="actividad-hora">${formatoHora(e.fecha)}</span>
        <span class="actividad-mensaje">${e.mensaje}</span>
      </div>
    `).join('');
  } catch (err) {
    $('#lista-actividad').innerHTML = `<p class="actividad-vacio dif-negativo">${err.message}</p>`;
  }
}

// ==========================================
// REPORTES DE SUCURSAL (tickets de mantenimiento)
// ==========================================
async function initReportesPanel() {
  $('#rep-panel-sucursal').innerHTML = ordenarSucursales(LIDER.sucursales).map(s => `<option value="${s}">${s}</option>`).join('');
  $('#rep-panel-departamento').innerHTML = CONFIG.departamentosReporte.map(d => `<option value="${d}">${d}</option>`).join('');
  $('#rep-panel-sistemas-categoria').innerHTML = Object.keys(CONFIG.catalogoSistemas).map(c => `<option value="${c}">${c}</option>`).join('');

  $('#rep-panel-departamento').addEventListener('change', () => {
    $('#rep-panel-sistemas-box').classList.toggle('hidden', $('#rep-panel-departamento').value !== 'SISTEMAS');
  });
  $('#rep-panel-sistemas-categoria').addEventListener('change', actualizarProblemasSistemasPanel);
  $('#btn-guardar-reporte-panel').addEventListener('click', guardarReportePanel);

  actualizarProblemasSistemasPanel();
  await cargarReportesPanel();
}

function actualizarProblemasSistemasPanel() {
  const cat = $('#rep-panel-sistemas-categoria').value;
  const problemas = CONFIG.catalogoSistemas[cat] || [];
  $('#rep-panel-sistemas-problema').innerHTML = problemas.map(p => `<option value="${p}">${p}</option>`).join('');
}

async function cargarReportesPanel() {
  const cont = $('#lista-reportes-panel');
  try {
    const lista = await api('GET', '/api/reportes');
    if (!lista.length) {
      cont.innerHTML = '<p class="reportes-vacio">Sin reportes pendientes en tus sucursales.</p>';
      return;
    }
    cont.innerHTML = lista.map(r => `
      <div class="reporte-item">
        <div class="reporte-cabecera">
          <span class="reporte-depto">${r.departamento}</span>
          <span class="reporte-fecha">${new Date(r.fecha).toLocaleString('es-MX')}</span>
        </div>
        <div class="reporte-detalle">${r.sucursal}${r.categoriaSistemas ? ' — ' + r.categoriaSistemas + ' — ' + r.problemaSistemas : ''}</div>
        ${r.descripcion ? `<div class="reporte-descripcion">${r.descripcion}</div>` : ''}
        <div class="reporte-autor">Reportó: ${r.autor} (${r.rolAutor})</div>
        <button class="btn-accion btn-editar btn-sm" data-resolver="${r.id}">Marcar como resuelto</button>
      </div>
    `).join('');
    $$('[data-resolver]', cont).forEach(btn => btn.addEventListener('click', () => resolverReporte(btn.dataset.resolver)));
  } catch (err) {
    cont.innerHTML = `<p class="reportes-vacio">${err.message}</p>`;
  }
}

async function resolverReporte(id) {
  try {
    await api('PUT', `/api/reportes/${id}/resolver`);
    await cargarReportesPanel();
    mostrarToast('Reporte marcado como resuelto.');
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

async function guardarReportePanel() {
  const departamento = $('#rep-panel-departamento').value;
  const body = { sucursal: $('#rep-panel-sucursal').value, departamento, descripcion: $('#rep-panel-descripcion').value };
  if (departamento === 'SISTEMAS') {
    body.categoriaSistemas = $('#rep-panel-sistemas-categoria').value;
    body.problemaSistemas = $('#rep-panel-sistemas-problema').value;
  }
  try {
    await api('POST', '/api/reportes', body);
    $('#reportes-panel-msg').textContent = 'Reporte registrado correctamente.';
    $('#reportes-panel-msg').className = 'msg msg-ok';
    $('#rep-panel-descripcion').value = '';
    await cargarReportesPanel();
  } catch (err) {
    $('#reportes-panel-msg').textContent = err.message;
    $('#reportes-panel-msg').className = 'msg msg-error';
  }
}

// ==========================================
// REGISTRO DE TICKETS i24h
// ==========================================
let TICKETS_CACHE = [];
let TICKET_EDITANDO = null;

function construirQueryTickets() {
  const params = new URLSearchParams();
  const sucursal = $('#tk-f-sucursal').value;
  const turno = $('#tk-f-turno').value;
  const fecha = $('#tk-f-fecha').value;
  const colaborador = $('#tk-f-colaborador').value.trim();
  const numeroTicket = $('#tk-f-numero').value.trim();
  if (sucursal) params.set('sucursal', sucursal);
  if (turno) params.set('turno', turno);
  if (fecha) params.set('fecha', fecha);
  if (colaborador) params.set('colaborador', colaborador);
  if (numeroTicket) params.set('numeroTicket', numeroTicket);
  return params.toString();
}

async function cargarTicketsPanel() {
  const qs = construirQueryTickets();
  const data = await api('GET', '/api/panel/tickets-i24h' + (qs ? '?' + qs : ''));
  TICKETS_CACHE = data.tickets;

  $('#tk-totales').textContent = `Tickets registrados: ${data.totales.registros} — Cantidad total: $${data.totales.cantidad}`;

  const tbody = $('#tbody-tickets');
  if (!tbody) { console.error('cargarTicketsPanel: no existe #tbody-tickets en el HTML.'); return; }
  tbody.innerHTML = `
    ${TICKETS_CACHE.map(tk => `
      <tr data-id="${tk.id}">
        <td class="col-item">${tk.sucursal}</td>
        <td>${tk.turno}</td>
        <td>${tk.fecha}</td>
        <td>${tk.colaborador}</td>
        <td>${tk.numeroTicket}</td>
        <td>$${tk.cantidad}</td>
        <td>${tk.concepto}</td>
        <td>
          <button class="btn-accion btn-editar" data-editar="${tk.id}">Editar</button>
          <button class="btn-accion btn-eliminar" data-eliminar="${tk.id}">Eliminar</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="8">Sin tickets registrados.</td></tr>'}
  `;

  $$('[data-editar]', tbody).forEach(btn => btn.addEventListener('click', () => abrirModalEditarTicket(btn.dataset.editar)));
  $$('[data-eliminar]', tbody).forEach(btn => btn.addEventListener('click', () => eliminarTicket(btn.dataset.eliminar)));
}

function abrirModalEditarTicket(id) {
  const tk = TICKETS_CACHE.find(x => String(x.id) === String(id));
  if (!tk) return;
  TICKET_EDITANDO = tk;
  $('#modal-ticket-msg').textContent = '';
  $('#modal-ticket-id').textContent = `#${tk.numeroTicket}`;
  $('#tkm-numero').value = tk.numeroTicket;
  $('#tkm-cantidad').value = tk.cantidad;
  $('#tkm-concepto').value = tk.concepto;
  $('#modal-ticket-overlay').classList.remove('hidden');
}
function cerrarModalTicket() {
  $('#modal-ticket-overlay').classList.add('hidden');
  TICKET_EDITANDO = null;
}

async function guardarEdicionTicket() {
  const tk = TICKET_EDITANDO;
  if (!tk) return;
  const numeroTicket = $('#tkm-numero').value.trim();
  const cantidad = $('#tkm-cantidad').value.trim();
  const concepto = $('#tkm-concepto').value.trim();

  try {
    await api('PUT', `/api/panel/tickets-i24h/${tk.id}`, { numeroTicket, cantidad, concepto });
    $('#modal-ticket-msg').textContent = 'Ticket actualizado correctamente.';
    $('#modal-ticket-msg').className = 'msg msg-ok';
    await cargarTicketsPanel();
    mostrarToast('Cambios guardados correctamente.');
    setTimeout(cerrarModalTicket, 600);
  } catch (err) {
    $('#modal-ticket-msg').textContent = err.message;
    $('#modal-ticket-msg').className = 'msg msg-error';
    mostrarToast(err.message, 'error');
  }
}

async function eliminarTicket(id) {
  const tk = TICKETS_CACHE.find(x => String(x.id) === String(id));
  if (!tk) return;
  if (!confirm(`¿Eliminar el ticket #${tk.numeroTicket} (${tk.colaborador}, ${tk.sucursal})? Esta acción no se puede deshacer.`)) return;
  try {
    await api('DELETE', `/api/panel/tickets-i24h/${id}`);
    await cargarTicketsPanel();
    mostrarToast('Ticket eliminado correctamente.');
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

async function initTicketsPanel() {
  ['tk-f-sucursal', 'tk-f-turno', 'tk-f-fecha'].forEach(id => $('#' + id).addEventListener('change', cargarTicketsPanel));
  $('#tk-f-colaborador').addEventListener('input', cargarTicketsPanel);
  $('#tk-f-numero').addEventListener('input', cargarTicketsPanel);
  $('#tk-btn-limpiar-filtros').addEventListener('click', async () => {
    $('#tk-f-sucursal').value = '';
    $('#tk-f-turno').value = '';
    $('#tk-f-fecha').value = '';
    $('#tk-f-colaborador').value = '';
    $('#tk-f-numero').value = '';
    await cargarTicketsPanel();
  });
  $('#modal-ticket-cancelar').addEventListener('click', cerrarModalTicket);
  $('#modal-ticket-guardar').addEventListener('click', guardarEdicionTicket);

  await cargarTicketsPanel();
}

// ==========================================
// GESTIÓN DE CATÁLOGOS (exclusivo admin)
// ==========================================
// Nombres de insumo como ARILLO #1 "3/8" traen comillas dobles incrustadas
// (la notación de pulgadas). Interpolarlos sin escapar en un atributo HTML
// (value="...", data-item="...") corta el atributo a la mitad y deja el
// DOM roto — por eso Editar/Eliminar fallaban en esos insumos. Estos
// helpers evitan ese problema para CUALQUIER nombre, no solo los que
// llevan "#".
function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
let CATALOGOS_ADMIN = null;
let CATALOGO_TAB_ACTIVO = 'papeleria';

async function initCatalogosAdmin() {
  $$('#tab-catalogos .tab-btn-sec').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#tab-catalogos .tab-btn-sec').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      CATALOGO_TAB_ACTIVO = btn.dataset.cat;
      $('#catalogos-msg').textContent = '';
      $('#cat-agregar-simple').classList.toggle('hidden', CATALOGO_TAB_ACTIVO === 'sistemas');
      $('#cat-agregar-sistemas').classList.toggle('hidden', CATALOGO_TAB_ACTIVO !== 'sistemas');
      pintarListaCatalogos();
    });
  });
  $('#cat-btn-agregar').addEventListener('click', agregarInsumo);
  $('#cat-btn-agregar-categoria').addEventListener('click', agregarCategoriaSistemas);
  initLimpiezaNumeralCatalogos();
  await cargarCatalogosAdmin();
}

async function cargarCatalogosAdmin() {
  CATALOGOS_ADMIN = await api('GET', '/api/catalogos');
  pintarListaCatalogos();
}

function pintarListaCatalogos() {
  const cont = $('#catalogos-lista');

  if (CATALOGO_TAB_ACTIVO === 'sistemas') {
    const cats = Object.keys(CATALOGOS_ADMIN.sistemas).sort((a, b) => a.localeCompare(b, 'es'));
    cont.innerHTML = cats.map(cat => `
      <div class="catalogo-fila catalogo-fila-sistemas" data-categoria="${escapeAttr(cat)}">
        <input type="text" class="catalogo-input" value="${escapeAttr(cat)}">
        <textarea class="catalogo-problemas" rows="3">${escapeHtml(CATALOGOS_ADMIN.sistemas[cat].join('\n'))}</textarea>
        <div class="catalogo-acciones">
          <button class="btn-accion btn-editar btn-sm" data-guardar-sistemas="${escapeAttr(cat)}">Guardar</button>
          <button class="btn-accion btn-eliminar btn-sm" data-eliminar-sistemas="${escapeAttr(cat)}">Eliminar</button>
        </div>
      </div>
    `).join('') || '<p class="reportes-vacio">Sin categorías de Sistemas registradas.</p>';
    $$('[data-guardar-sistemas]', cont).forEach(btn => btn.addEventListener('click', () => guardarCategoriaSistemas(btn.dataset.guardarSistemas)));
    $$('[data-eliminar-sistemas]', cont).forEach(btn => btn.addEventListener('click', () => eliminarCategoriaSistemas(btn.dataset.eliminarSistemas)));
    return;
  }

  const lista = (CATALOGOS_ADMIN[CATALOGO_TAB_ACTIVO] || []).slice().sort((a, b) => a.localeCompare(b, 'es'));
  cont.innerHTML = lista.map(item => `
    <div class="catalogo-fila" data-item="${escapeAttr(item)}">
      <input type="text" class="catalogo-input" value="${escapeAttr(item)}">
      <div class="catalogo-acciones">
        <button class="btn-accion btn-editar btn-sm" data-guardar-item="${escapeAttr(item)}">Guardar</button>
        <button class="btn-accion btn-eliminar btn-sm" data-eliminar-item="${escapeAttr(item)}">Eliminar</button>
      </div>
    </div>
  `).join('') || '<p class="reportes-vacio">Sin insumos registrados en esta categoría.</p>';
  $$('[data-guardar-item]', cont).forEach(btn => btn.addEventListener('click', () => editarInsumo(btn.dataset.guardarItem)));
  $$('[data-eliminar-item]', cont).forEach(btn => btn.addEventListener('click', () => eliminarInsumo(btn.dataset.eliminarItem)));
}

// Limpieza en vivo: si se teclea "#" en cualquier input de nombre de
// catálogo, se borra al instante (oninput), además de la limpieza real
// (.replace) que se aplica justo antes de enviar el POST/PUT más abajo.
function initLimpiezaNumeralCatalogos() {
  document.addEventListener('input', (e) => {
    if (e.target.matches('#cat-nuevo-nombre, #cat-nueva-categoria, .catalogo-fila .catalogo-input')) {
      if (e.target.value.includes('#')) {
        const pos = e.target.selectionStart;
        e.target.value = e.target.value.replace(/#/g, '');
        e.target.setSelectionRange(pos - 1, pos - 1);
      }
    }
  });
}

async function agregarInsumo() {
  const nombre = $('#cat-nuevo-nombre').value.trim().replace(/#/g, 'No. ').replace(/\s+/g, ' ').trim();
  if (!nombre) return;
  try {
    await api('POST', `/api/catalogos/${CATALOGO_TAB_ACTIVO}`, { nombre });
    $('#cat-nuevo-nombre').value = '';
    mostrarToast('Insumo agregado correctamente.');
    await cargarCatalogosAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

async function editarInsumo(itemOriginal) {
  const fila = $(`.catalogo-fila[data-item="${CSS.escape(itemOriginal)}"]`);
  const nuevoNombre = fila.querySelector('.catalogo-input').value.trim().replace(/#/g, 'No. ').replace(/\s+/g, ' ').trim();
  if (!nuevoNombre) return;
  try {
    await api('PUT', `/api/catalogos/${CATALOGO_TAB_ACTIVO}/${encodeURIComponent(itemOriginal)}`, { nombre: nuevoNombre });
    mostrarToast('Insumo actualizado correctamente.');
    await cargarCatalogosAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

async function eliminarInsumo(item) {
  if (!confirm(`¿Eliminar "${item}" del catálogo? Dejará de aparecer en toda la aplicación (Inicio de Turno, Inventarios, Me Surten, etc.).`)) return;
  try {
    await api('DELETE', `/api/catalogos/${CATALOGO_TAB_ACTIVO}/${encodeURIComponent(item)}`);
    mostrarToast('Insumo eliminado correctamente.');
    await cargarCatalogosAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

async function agregarCategoriaSistemas() {
  const categoria = $('#cat-nueva-categoria').value.trim().replace(/#/g, 'No. ').replace(/\s+/g, ' ').trim();
  if (!categoria) return;
  try {
    await api('POST', '/api/catalogos/sistemas', { categoria, problemas: [] });
    $('#cat-nueva-categoria').value = '';
    mostrarToast('Categoría agregada correctamente.');
    await cargarCatalogosAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

async function guardarCategoriaSistemas(categoriaOriginal) {
  const fila = $(`.catalogo-fila-sistemas[data-categoria="${CSS.escape(categoriaOriginal)}"]`);
  const nuevoNombre = fila.querySelector('.catalogo-input').value.trim().replace(/#/g, 'No. ').replace(/\s+/g, ' ').trim();
  const problemas = fila.querySelector('.catalogo-problemas').value.split('\n').map(p => p.trim().replace(/#/g, 'No. ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  try {
    await api('PUT', `/api/catalogos/sistemas/${encodeURIComponent(categoriaOriginal)}`, { nuevoNombre, problemas });
    mostrarToast('Categoría actualizada correctamente.');
    await cargarCatalogosAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

async function eliminarCategoriaSistemas(categoria) {
  if (!confirm(`¿Eliminar la categoría "${categoria}" de Sistemas y todos sus problemas?`)) return;
  try {
    await api('DELETE', `/api/catalogos/sistemas/${encodeURIComponent(categoria)}`);
    mostrarToast('Categoría eliminada correctamente.');
    await cargarCatalogosAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

// ==========================================
// INICIO
// ==========================================
async function init() {
  initDarkMode();
  initAvatar();
  CONFIG = await api('GET', '/api/config');
  await initLogin();

  try {
    LIDER = await api('GET', '/api/panel/sesion');
    await entrarAlPanel();
  } catch (e) { /* no hay sesión */ }
}

init();
