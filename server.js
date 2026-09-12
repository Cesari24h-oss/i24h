const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURACIÓN GENERAL (edítalo aquí)
// ==========================================
// Lista base (sin orden particular) + orden alfabético estricto A-Z aplicado
// abajo con localeCompare('es') para que Ñ (ORDOÑEZ) quede bien ubicada
// entre O_ y P_, no al final como haría un sort ASCII normal.
const SUCURSALES = [
  'LINCOLN OXXO', 'LINCOLN 2', 'SIMON BOLIVAR', 'INSURGENTES', 'RODAS', 'ANTIGONA',
  'RUIZ CORTINEZ', 'CUAHUTEMOC', 'ORDOÑEZ', 'AV MEXICO', 'PABLO LIVAS 1', 'PABLO LIVAS 2',
  'ELOY CAVAZOS 2', 'Benito Juárez', 'METRO CUAHUTEMOC', 'METRO UNIVERSIDAD', 'RAUL SALINAS 2',
  'TECNOLOGICO', 'TEC EXPRESS', '2 DE ABRIL', 'DAMASCO', 'MOLINETE', 'ARTEAGA', 'REPUBLICA',
  'SENDERO', 'METROPLEX', 'CONCORDIA', 'PUEBLO NUEVO', 'ANDES', 'LETY', 'FRAY', 'PUENTES', 'COLOSIO'
].sort((a, b) => a.localeCompare(b, 'es'));
const TURNOS_DISPONIBLES = ['T1', 'T2', 'T3'];

// ---------- Reportes de Sucursal (tickets de mantenimiento) ----------
const DEPARTAMENTOS_REPORTE = ['MONITOREO', 'SISTEMAS', 'MANTENIMIENTO', 'CLIMAS', 'BODEGA', 'FINANZAS'];

// Catálogo en cascada EXCLUSIVO para Departamento = SISTEMAS: Categoría -> Problemas.
const CATALOGO_SISTEMAS = {
  'CAMARA DE BOLA': ['FUERA DE LINEA', 'NO DEJA VER GRABACIONES', 'PROGRAMA', 'SIN GRABACION'],
  'CAMARAS': [
    'DE SUCURSAL NOSE VEN', 'DVR SIN GRABACION', 'FALLA/N', 'GRABACIONES SOLO SEGUARDAN POCOS DIAS',
    'MONITOR NO ENCIENDE', 'NO FUNCIONAN', 'NO FUNCIONA (AREA DE PUERTA PRINCIPAL)',
    'SE PONEN OFFLINE CADARATO', 'SIN SEÑAL', 'SIN VISION'
  ],
  'CYBERPLANET': [
    'A LA CAJA LE FALTA UN TURNO', 'AGREGAR SERVICIO', 'CAMBIO DE CONTRASEÑA DE SUBGERENTE',
    'CAMBIO DE COSTOS', 'CAMBIO DE GROSORES', 'CAMBIO DE PRECIOS', 'CONFIGURACION A TIEMPO LIBRE',
    'EGRESAR MERCA', 'FALLA', 'LENTO', 'MODIFICACION DE GROSORES', 'MODIFICAR DE PRECIOS RFC',
    'TICKETERA NO FUNCIONA'
  ],
  'IMPRESORAS': [
    'MARCA ERROR EL SCANNER', 'NO RECIBE LOS SCANNER', 'NO RECIBE TAREAS', 'NO SALEN LOS TABLOIDES',
    'NO TIENE RED', 'PLOTTE MAL CONFIGURADO', 'REDIRECCION DE IMPRESOA', 'REDIRECCION DE SCANNER'
  ],
  'PC': [
    'CABLE QUEMADO / HUELE A QUEMADO / CORTO CIRCUITO', 'CAMBIAR NUMERO DE PC', 'CAMBIO DE PC',
    'CONFIGURACION DE FECHA', 'CONFIGURACION DE HORA', 'FALLAS DE WINDOWS', 'FUERA DE SISTEMA',
    'HACE RUIDO', 'IMPRESORA NO INSTALADA', 'LENTA', 'MARCA ERROR', 'MENSAJE RARO EN PC',
    'MONITOR NO ENCIENDE / NO DA IMAGEN', 'MONITOR PARPADEANDO', 'MONITOR TIENE LINEAS',
    'NO BORRA INFORMACION', 'NO ENCIENDE / NO FUNCIONA', 'NO IMPRIME', 'NO REGISTRA IMPRESIONES',
    'PANTALLA NEGRA', 'SE APAGA', 'SE CONGELA / SE TRABA', 'SE REINICIA / PARPADEANDO',
    'SIN CONEXIÓN', 'SIN INTERNET'
  ],
  'RDC': ['AL MOMENTO DE AGREGAR LAS COSAS NO SE REFLEJAN', 'REIMPRESION', 'SALE EN BLANCO', 'SALIO DUPLICADO'],
  'PC EXPRESS': [
    'CABLE QUEMADO / HUELE A QUEMADO / CORTO CIRCUITO', 'CAMBIO DE PC', 'CONFIGURACION DE FECHA',
    'CONFIGURACION DE HORA', 'FALLO DE WINDOWS / MARCA ERROR', 'FUERA DE SISTEMA', 'HACE RUIDO',
    'IMPRESORA NO INSTALADA', 'LENTA', 'MENSAJE RARO EN PC', 'MONITOR NO ENCIENDE / NO DA IMAGEN',
    'MONITOR PARPADEANDO', 'MONITOR TIENE LINEAS', 'NO BORRA INFORMACION', 'NO DETECTA EL MOUSE',
    'NO DETECTA EL TECLADO', 'NO ENCIENDE / NO FUNCIONA', 'NO IMPRIME', 'NO REGISTRA IMPRESIONES',
    'PANTALLA NEGRA', 'SE APAGA', 'SE CONGELA / SE TRABA', 'SE REINICIA / PARPADEANDO',
    'SIN CONEXIÓN', 'SIN INTERNET'
  ],
  'CAJA': [
    'CABLE QUEMADO / HUELE A QUEMADO / CORTO CIRCUITO', 'CAMBIO DE PC', 'CONFIGURACION DE FECHA',
    'CONFIGURACION DE HORA', 'FALLO DE WINDOWS / MARCA ERROR', 'FUERA DE SISTEMA', 'HACE RUIDO',
    'IMPRESORA NO INSTALADA', 'LENTA', 'MONITOR NO ENCIENDE / NO DA IMAGEN', 'MONITOR PARPADEANDO',
    'NO DETECTA EL MOUSE', 'NO DETECTA EL TECLADO', 'NO ENCIENDE / NO FUNCIONA', 'NO IMPRIME',
    'NO REGISTRA IMPRESIONES', 'PANTALLA NEGRA', 'SE APAGA', 'SE CONGELA / SE TRABA',
    'SE REINICIA / PARPADEANDO', 'SIN CONEXIÓN', 'SIN INTERNET'
  ]
};

// ---------- RBAC: Administradores maestros (hardcodeados, acceso total) ----------
const ADMINS_MAESTROS = [
  { nombre: 'Tanya Luna', password: 'Berlin2021' },
  { nombre: 'Cesar Cortes', password: 'Cesari24h001' }
];

// ---------- RBAC: Operativos y Líderes (dinámico, vive en users.json) ----------
const USERS_FILE = path.join(__dirname, 'users.json');

function usuariosPorDefecto() {
  return [
    { nombre: 'Eduardo', password: 'eduardo2026', rol: 'operativo', sucursales: ['REPUBLICA', 'SENDERO', 'METROPLEX', 'CONCORDIA', 'PUEBLO NUEVO', 'ANDES', 'LETY', 'FRAY', 'PUENTES', 'COLOSIO'] },
    { nombre: 'Hector', password: 'hector2026', rol: 'operativo', sucursales: ['TECNOLOGICO', 'TEC EXPRESS', '2 DE ABRIL', 'DAMASCO', 'MOLINETE', 'ARTEAGA'] },
    { nombre: 'Yessy', password: 'yessy2026', rol: 'lider', sucursales: ['Benito Juárez', 'METRO CUAHUTEMOC', 'METRO UNIVERSIDAD', 'RAUL SALINAS 2'] },
    { nombre: 'Karen', password: 'karen2026', rol: 'lider', sucursales: ['PABLO LIVAS 1', 'ELOY CAVAZOS 2'] },
    { nombre: 'Alejandro', password: 'alejandro2026', rol: 'lider', sucursales: ['PABLO LIVAS 2', 'AV MEXICO'] },
    { nombre: 'Alessandro', password: 'alessandro2026', rol: 'lider', sucursales: ['RODAS', 'LINCOLN OXXO', 'LINCOLN 2', 'SIMON BOLIVAR', 'INSURGENTES'] },
    { nombre: 'Samantha', password: 'samantha2026', rol: 'lider', sucursales: ['ANTIGONA', 'RUIZ CORTINEZ'] }
  ];
}

function cargarUsuarios() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) {
    const iniciales = usuariosPorDefecto();
    fs.writeFileSync(USERS_FILE, JSON.stringify(iniciales, null, 2));
    return iniciales;
  }
}
function guardarUsuarios(usuarios) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(usuarios, null, 2));
}

// Autentica contra los admins maestros primero, luego contra users.json.
// Devuelve { nombre, rol, sucursales } o null.
function autenticarPanel(nombre, password) {
  const admin = ADMINS_MAESTROS.find(a => a.password === password && a.nombre.toLowerCase() === (nombre || '').trim().toLowerCase());
  if (admin) return { nombre: admin.nombre, rol: 'admin', sucursales: 'todas' };

  const usuarios = cargarUsuarios();
  const u = usuarios.find(x => x.password === password && x.nombre.toLowerCase() === (nombre || '').trim().toLowerCase());
  if (u) return { nombre: u.nombre, rol: u.rol, sucursales: u.sucursales };

  return null;
}

// Resuelve la lista real de sucursales a las que tiene acceso una sesión de panel.
function sucursalesDeSesion(sesion) {
  const lista = sesion.sucursales === 'todas' ? SUCURSALES : sesion.sucursales;
  return lista.slice().sort((a, b) => a.localeCompare(b, 'es'));
}
function tieneAccesoSucursal(sesion, sucursal) {
  return sesion.rol === 'admin' || (Array.isArray(sesion.sucursales) && sesion.sucursales.includes(sucursal));
}

// ---------- Registro de actividad en tiempo real ("Ojo de Dios") ----------
const LOGS_FILE = path.join(__dirname, 'logs.json');
let logs = [];
try { logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8')); } catch (e) { logs = []; }
const LOGS_MAX = 500;

function guardarLogs() {
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
}
// rolLog: 'colaborador' | 'lider' | 'operativo' | 'admin' — determina en qué
// pestaña del Panel de Monitoreo aparece el evento.
function registrarEvento(rolLog, actor, sucursal, mensaje, turno) {
  logs.unshift({
    id: Date.now() + Math.random(),
    fecha: new Date().toISOString(),
    rol: rolLog,
    actor,
    sucursal: sucursal || null,
    turno: turno || null,
    mensaje
  });
  if (logs.length > LOGS_MAX) logs.length = LOGS_MAX;
  guardarLogs();
}

// ---------- Reportes de Sucursal (tickets de mantenimiento) ----------
const REPORTES_FILE = path.join(__dirname, 'reportes.json');
let reportes = [];
try { reportes = JSON.parse(fs.readFileSync(REPORTES_FILE, 'utf-8')); } catch (e) { reportes = []; }
function guardarReportes() {
  fs.writeFileSync(REPORTES_FILE, JSON.stringify(reportes, null, 2));
}

// ---------- Foto de Perfil (líderes/operativos/admins — cuentas persistentes) ----------
// Los colaboradores de piso no tienen cuenta persistente (login libre, sin
// contraseña), así que la foto de perfil solo aplica a Panel de Líderes.
// Se guarda dentro de /public/avatars para reutilizar el express.static que
// ya sirve /index.html, /estilos.css, etc. — no se crea almacenamiento nuevo.
const AVATARS_DIR = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });
const AVATARS_FILE = path.join(__dirname, 'avatars.json');
function cargarAvatares() {
  try { return JSON.parse(fs.readFileSync(AVATARS_FILE, 'utf-8')); } catch (e) { return {}; }
}
function guardarAvatares(mapa) {
  fs.writeFileSync(AVATARS_FILE, JSON.stringify(mapa, null, 2));
}
function claveAvatar(nombre) { return (nombre || '').trim().toLowerCase(); }
function avatarUrlDe(nombre) {
  const entrada = cargarAvatares()[claveAvatar(nombre)];
  return entrada ? `/avatars/${entrada.archivo}` : null;
}
const EXTENSIONES_AVATAR = ['.jpg', '.jpeg', '.png', '.webp'];
const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATARS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const extFinal = EXTENSIONES_AVATAR.includes(ext) ? ext : '.jpg';
      const slug = claveAvatar(req.session.lider.nombre).replace(/[^a-z0-9]+/g, '-');
      cb(null, `${slug}-${Date.now()}${extFinal}`);
    }
  }),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mimeOk = /^image\/(jpeg|png|webp)$/.test(file.mimetype);
    if (!mimeOk || !EXTENSIONES_AVATAR.includes(ext)) {
      return cb(new Error('Formato de imagen no válido. Usa JPG, PNG o WEBP.'));
    }
    cb(null, true);
  }
});

const DIAS_SEMANA_MAYUS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Hora de corte del "día operativo": antes de esta hora, cualquier registro
// (típicamente el cierre de T3, que sucede entre 5:30 y 6:10 AM) pertenece
// operativamente al día calendario ANTERIOR. El turno guarda su "fecha"
// operativa UNA SOLA VEZ al crearse (con la hora de inicio, que para T3
// siempre es la noche anterior), así que nunca se recalcula con la hora de
// cierre y el agrupamiento T1+T2+T3 del mismo día operativo queda garantizado.
const HORA_CORTE_DIA_OPERATIVO = 7; // 7:00 AM

// ---------- Catálogos exactos ----------
// Papelería actualizada: los artículos que terminan en "(POR PAQUETE)" se
// cuentan así por el colaborador, pero en las vistas y el Excel de LÍDERES
// se multiplican automáticamente por FACTOR_PAQUETE (ver más abajo).
const CATALOGOS = {
  papeleria: [
    'TABLOIDE ADHESIVO', 'TABLOIDE OPALINA', 'TABLOIDE COUCHE', 'HOJA DOBLE CARTA',
    'HOJA ADHESIVA', 'HOJA COUCHE', 'HOJA OPALINA', 'HOJA CARTA (POR PAQUETE)',
    'HOJA OFICIO (POR PAQUETE)', 'LEGAJO CARTA', 'LEGAJO OFICIO', 'LEGAJO COLOR',
    'LEGAJO COSTILLA', 'SOBRE CARTA', 'MICA CREDENCIAL', 'MICA CARTA', 'MICA OFICIO',
    'PASTAS NEGRAS', 'PASTAS TRANSPARENTES', 'PASTAS MULTICOLOR', 'ARILLO #1 "3/8"',
    'ARILLO #2 "1/2"', 'ARILLO #3 "5/8"', 'ARILLO #4 "7/8"', 'ARILLO #5 "1 PULGADA"',
    'CD-R SONY', 'DVD-R SONY', 'PLUMA NEGRA', 'PLUMA AZUL', 'PLUMA ROJA',
    'SOLICITUD DE EMPLEO', 'CARTULINA', 'USBS', 'ROLLO PLOTTER', 'TINTA CYAN',
    'TINTA YELLOW', 'TINTA MAGENTA', 'TINTA NEGRO', 'SOBRES DE NOMINA', 'CAJA CLIPS',
    'CAJA GRAPAS', 'ROLLOS TERMICOS', 'ROLLOS DE TERMINAL',
    'PLUMON DE BILLETES FALSOS', 'REGLA', 'TIJERAS', 'CORRECTOR', 'GRAPADORA',
    'QUITA GOMA', 'QUITA GRAPAS', 'CALCULADORA', 'PERFORADORA', 'GUILLOTINA',
    'ENMICADORA', 'ENGARGOLADORA', 'CINTA FILAMENTO', 'CINTA DOBLE CARA (MONTAJE)',
    'CINTA DOBLE CARA (HAWAIANA)', 'DESPACHADOR DE CINTA FILAMENTO'
  ],
  snack: [
    'AGUA', 'COCA COLA', 'COCA COLA 0', 'POWE RADE', 'FRUTSI VARIOS', 'CHOCOLATES VARIOS',
    'SABRITAS VARIOS', 'GALLETA VARIOS', 'MAZAPAN AZTECA', 'PALETA PAYASO', 'DUVALIN',
    'SKWINKLES VARIOS', 'CHICLES VARIOS', 'DULCES VARIOS', 'GOMITAS VARIOS'
  ],
  novedades: [
    'LLAVERO FUNKO', 'NOVEDADES AMARILLO', 'NOVEDADES AZUL', 'NOVEDADES BLANCO',
    'NOVEDADES DORADA', 'NOVEDADES MORADO', 'NOVEDADES NARANJA', 'NOVEDADES NEGRA',
    'NOVEDADES PLATEADA', 'NOVEDADES ROJO', 'NOVEDADES ROSA', 'NOVEDADES VERDE'
  ]
};

// Catálogo de LIMPIEZA (inventario manual): no venía en la lista que me diste,
// así que lo armé a partir de los artículos mencionados en tus propias notas
// de plantilla (Fabuloso, Cloro, Windex, trapeador, escoba...). Revísalo y
// edítalo aquí si falta o sobra algo — es solo este arreglo.
const CATALOGO_LIMPIEZA = [
  'FABULOSO', 'CLORO', 'WINDEX', 'JABÓN LÍQUIDO PARA MANOS', 'JABÓN PARA TRASTES',
  'PAPEL HIGIÉNICO', 'PAPEL TOALLA', 'SERVILLETAS', 'BOLSAS PARA BASURA',
  'TRAPEADOR', 'ESCOBA', 'RECOGEDOR', 'DESTAPACAÑOS', 'FRANELA', 'FIBRA PARA LAVAR',
  'GUANTES DE LÁTEX', 'CUBETA', 'AROMATIZANTE', 'LIMPIA VIDRIOS', 'PINOL'
];

// ---------- Gestión de Catálogos (editable desde el panel, exclusivo admin) ----------
// Los arrays/objetos de arriba (CATALOGOS, CATALOGO_SISTEMAS, CATALOGO_LIMPIEZA)
// se declaran con const, pero eso solo bloquea REASIGNAR la variable — su
// CONTENIDO sí se puede mutar (push/splice/Object.assign). Por eso el CRUD de
// abajo muta esos mismos arrays/objetos en vez de crear una copia paralela:
// así los ~15 lugares del archivo que ya los usan (objVacio, catObjVacio,
// endpoints de conteo, inventarios, tickets, reportes de Sistemas, etc.)
// seguimos viendo siempre la versión actual sin tener que tocarlos uno por uno.
const CATALOGOS_FILE = path.join(__dirname, 'catalogos.json');
function guardarCatalogos() {
  fs.writeFileSync(CATALOGOS_FILE, JSON.stringify({
    papeleria: CATALOGOS.papeleria, snack: CATALOGOS.snack, novedades: CATALOGOS.novedades,
    limpieza: CATALOGO_LIMPIEZA, sistemas: CATALOGO_SISTEMAS
  }, null, 2));
}
(function cargarCatalogosPersistidos() {
  try {
    const guardado = JSON.parse(fs.readFileSync(CATALOGOS_FILE, 'utf-8'));
    if (Array.isArray(guardado.papeleria) && guardado.papeleria.length) { CATALOGOS.papeleria.length = 0; CATALOGOS.papeleria.push(...guardado.papeleria); }
    if (Array.isArray(guardado.snack) && guardado.snack.length) { CATALOGOS.snack.length = 0; CATALOGOS.snack.push(...guardado.snack); }
    if (Array.isArray(guardado.novedades) && guardado.novedades.length) { CATALOGOS.novedades.length = 0; CATALOGOS.novedades.push(...guardado.novedades); }
    if (Array.isArray(guardado.limpieza) && guardado.limpieza.length) { CATALOGO_LIMPIEZA.length = 0; CATALOGO_LIMPIEZA.push(...guardado.limpieza); }
    if (guardado.sistemas && typeof guardado.sistemas === 'object' && Object.keys(guardado.sistemas).length) {
      Object.keys(CATALOGO_SISTEMAS).forEach(k => delete CATALOGO_SISTEMAS[k]);
      Object.assign(CATALOGO_SISTEMAS, guardado.sistemas);
    }
  } catch (e) {
    guardarCatalogos(); // primera vez: siembra catalogos.json con los valores de arriba
  }
})();
// Categorías con catálogo "simple" (arreglo plano de nombres) editables desde
// Gestión de Catálogos con el mismo CRUD genérico. "sistemas" es aparte por
// ser en cascada (categoría → lista de problemas).
const CATALOGOS_SIMPLES = { papeleria: CATALOGOS.papeleria, snack: CATALOGOS.snack, novedades: CATALOGOS.novedades, limpieza: CATALOGO_LIMPIEZA };

// Artículos de papelería que el colaborador cuenta "por paquete" pero que, en
// las vistas y el Excel de LÍDERES, deben multiplicarse por 500 (1 paquete = 500 hojas).
const ITEMS_PAQUETE_LIDER = ['HOJA CARTA (POR PAQUETE)', 'HOJA OFICIO (POR PAQUETE)'];
const FACTOR_PAQUETE = 500;
function aplicarFactorPaqueteLider(cantidad, item) {
  return ITEMS_PAQUETE_LIDER.includes(item) ? Number(cantidad || 0) * FACTOR_PAQUETE : Number(cantidad || 0);
}
const CATEGORIAS = ['papeleria', 'snack', 'novedades'];
const ORDEN_MODULOS = ['papeleria', 'snack', 'novedades'];
const NOMBRE_CATEGORIA = { papeleria: 'Papelería', snack: 'Snack', novedades: 'Novedades' };
const NOMBRE_MODULO_WHATSAPP = { papeleria: 'PAPELERÍA', snack: 'SNACK', novedades: 'NOVEDADES' };

const IMPRESORA_ITEMS = [
  'COPIA NEGRO', 'COPIA NEGRO G', 'COPIA COLOR', 'COPIA COLOR G',
  'IMPRESION NEGRO', 'IMPRESION NEGRO G', 'IMPRESION COLOR', 'IMPRESION COLOR G',
  'DB CARTA', 'TABLOIDE', 'SCANNER', 'SCANNER G'
];

const COBRADAS_ITEMS = [
  'COPIA BYN', 'IMPRE BYN', 'COPIA COLOR', 'IMPRE COLOR', 'SCANNER', 'COPIA INE BYN', 'COPIA INE COLOR',
  'PASSAPORTE BYN', 'PASSAPORTE COLOR', 'AMPLIACION', 'TABLOIDES', 'DOBLE CARTA', 'MERMA', 'MERMA SCANNER'
];

const TRAMITES_ITEMS = ['CURP', 'ACTA', 'RFC', 'NSS'];

// ==========================================
// HELPERS DE CATÁLOGO Y FECHAS
// ==========================================
function objVacio(lista) { const o = {}; lista.forEach(i => o[i] = 0); return o; }
function catObjVacio() { const o = {}; CATEGORIAS.forEach(cat => o[cat] = objVacio(CATALOGOS[cat])); return o; }
function limpiarObj(input, lista) {
  const out = objVacio(lista);
  if (!input) return out;
  lista.forEach(item => {
    const v = Number(input[item]);
    out[item] = Number.isFinite(v) && v >= 0 ? v : 0;
  });
  return out;
}
function limpiarCatObj(input) {
  const out = {};
  CATEGORIAS.forEach(cat => out[cat] = limpiarObj(input ? input[cat] : null, CATALOGOS[cat]));
  return out;
}
function fechaLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fechaMenosDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return fechaLocal(d);
}
// Fecha operativa de un instante dado: antes de la hora de corte, pertenece al día calendario anterior.
function fechaOperativaDe(fechaJS) {
  const cal = fechaLocal(fechaJS);
  return fechaJS.getHours() < HORA_CORTE_DIA_OPERATIVO ? fechaMenosDias(cal, 1) : cal;
}
function fechaOperativaActual() { return fechaOperativaDe(new Date()); }
function diaSemanaDe(fechaStr, mayus) {
  const d = new Date(fechaStr + 'T12:00:00');
  return mayus ? DIAS_SEMANA_MAYUS[d.getDay()] : DIAS_SEMANA[d.getDay()];
}
function fechaCorta(fechaStr) {
  const [y, m, d] = fechaStr.split('-');
  return `${d}/${m}/${y}`;
}

// ==========================================
// ESTADO / PERSISTENCIA EN database.json
// ==========================================
// Todo vive en el objeto `db` en memoria mientras el proceso corre, y cada
// mutación se refleja de inmediato en database.json mediante fs.writeFileSync
// para que la información sobreviva a un reinicio del servidor.
const DATABASE_FILE = path.join(__dirname, 'database.json');

function estadoInicial() {
  const bodegas = {}, sistemaTeorico = {};
  SUCURSALES.forEach(s => {
    bodegas[s] = catObjVacio();
    sistemaTeorico[s] = catObjVacio();
  });
  return { bodegas, sistemaTeorico, turnos: [], turnoActivoId: {}, entradasBodega: [], ticketsI24h: [], revisionesArchivadas: [], nextId: 1 };
}

let db;
try {
  db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf-8'));
} catch (e) {
  db = estadoInicial();
}
migrarNombreSucursal('BENITO JUEREZ', 'Benito Juárez');
migrarSimboloNumeral();
try {
  // Si el archivo viene de una versión anterior o le faltan sucursales/artículos
  // nuevos, se completan con ceros para no romper el resto del sistema.
  SUCURSALES.forEach(s => {
    if (!db.bodegas[s]) db.bodegas[s] = catObjVacio();
    if (!db.sistemaTeorico[s]) db.sistemaTeorico[s] = catObjVacio();
    CATEGORIAS.forEach(cat => CATALOGOS[cat].forEach(item => {
      if (!(item in db.bodegas[s][cat])) db.bodegas[s][cat][item] = 0;
      if (!(item in db.sistemaTeorico[s][cat])) db.sistemaTeorico[s][cat][item] = 0;
    }));
  });
  if (!Array.isArray(db.entradasBodega)) db.entradasBodega = [];
  if (!Array.isArray(db.ticketsI24h)) db.ticketsI24h = [];
  if (!Array.isArray(db.revisionesArchivadas)) db.revisionesArchivadas = [];
  if (!db.turnoActivoId) db.turnoActivoId = {};
  if (!db.nextId) db.nextId = (db.turnos || []).reduce((max, t) => Math.max(max, t.id + 1), 1);
} catch (e) { /* estadoInicial() ya cubre el caso de archivo inexistente/corrupto */ }

function guardar() {
  fs.writeFileSync(DATABASE_FILE, JSON.stringify(db, null, 2));
}
guardar();

// ==========================================
// MIGRACIÓN DE NOMBRE DE SUCURSAL (corrección ortográfica sin perder datos)
// ==========================================
// Renombra "BENITO JUEREZ" -> "Benito Juárez" en TODO lo que ya esté
// persistido (bodegas, sistema teórico, turnos, entradas a bodega, usuarios,
// logs y reportes), para que la corrección de acentuación no rompa ni
// duplique información histórica ya guardada con el nombre viejo.
// CRÍTICO: debe ejecutarse ANTES del relleno de "sucursales faltantes" de
// abajo, porque ese relleno ya crea una entrada vacía con el nombre NUEVO
// (al recorrer el SUCURSALES actual), y eso bloquearía el movimiento real
// de los datos si la migración corriera después.
function migrarNombreSucursal(viejo, nuevo) {
  if (viejo === nuevo || !db) return;

  if (db.bodegas && db.bodegas[viejo] && !db.bodegas[nuevo]) { db.bodegas[nuevo] = db.bodegas[viejo]; delete db.bodegas[viejo]; }
  if (db.sistemaTeorico && db.sistemaTeorico[viejo] && !db.sistemaTeorico[nuevo]) { db.sistemaTeorico[nuevo] = db.sistemaTeorico[viejo]; delete db.sistemaTeorico[viejo]; }
  if (db.turnoActivoId && db.turnoActivoId[viejo] !== undefined) { db.turnoActivoId[nuevo] = db.turnoActivoId[viejo]; delete db.turnoActivoId[viejo]; }
  (db.turnos || []).forEach(t => { if (t.sucursal === viejo) t.sucursal = nuevo; });
  (db.entradasBodega || []).forEach(e => { if (e.sucursal === viejo) e.sucursal = nuevo; });

  const usuarios = cargarUsuarios();
  let usuariosCambiaron = false;
  usuarios.forEach(u => {
    const idx = u.sucursales.indexOf(viejo);
    if (idx !== -1) { u.sucursales[idx] = nuevo; usuariosCambiaron = true; }
  });
  if (usuariosCambiaron) guardarUsuarios(usuarios);

  logs.forEach(l => { if (l.sucursal === viejo) l.sucursal = nuevo; });
  reportes.forEach(r => { if (r.sucursal === viejo) r.sucursal = nuevo; });

  guardar(); guardarLogs(); guardarReportes();
}

// ==========================================
// MIGRACIÓN: erradicar el símbolo "#" de nombres de insumos
// ==========================================
// El "#" en un nombre de insumo (ej. "ARILLO #1 \"3/8\"") rompía las
// peticiones de Gestión de Catálogos. Se reemplaza por "No. " en TODO lo que
// ya esté persistido — catálogos, bodega, sistema teórico, turnos históricos
// y entradas a bodega — para no dejar registros huérfanos con el nombre
// viejo. Corre una sola vez al arrancar; si no encuentra ningún "#" no hace
// nada (idempotente, seguro de dejar corriendo en cada arranque).
function migrarSimboloNumeral() {
  const mapa = {}; // { "ARILLO #1 ..." : "ARILLO No. 1 ..." }
  const registrar = (nombre) => {
    if (typeof nombre === 'string' && nombre.includes('#') && !mapa[nombre]) {
      mapa[nombre] = nombre.replace(/#/g, 'No. ').replace(/\s+/g, ' ').trim();
    }
  };

  CATEGORIAS.forEach(cat => CATALOGOS[cat].forEach(registrar));
  CATALOGO_LIMPIEZA.forEach(registrar);
  Object.keys(CATALOGO_SISTEMAS).forEach(cat => CATALOGO_SISTEMAS[cat].forEach(registrar));

  if (!Object.keys(mapa).length) return; // nada que migrar

  // 1) Los catálogos en sí (arrays/objeto en memoria, mutados in place para
  // que sigan viendo el cambio los ~15 lugares que ya los usan).
  CATEGORIAS.forEach(cat => { const nuevos = CATALOGOS[cat].map(i => mapa[i] || i); CATALOGOS[cat].length = 0; CATALOGOS[cat].push(...nuevos); });
  const nuevaLimpieza = CATALOGO_LIMPIEZA.map(i => mapa[i] || i);
  CATALOGO_LIMPIEZA.length = 0; CATALOGO_LIMPIEZA.push(...nuevaLimpieza);
  Object.keys(CATALOGO_SISTEMAS).forEach(cat => { CATALOGO_SISTEMAS[cat] = CATALOGO_SISTEMAS[cat].map(p => mapa[p] || p); });
  guardarCatalogos();

  // 2) db.bodegas / db.sistemaTeorico: renombra las LLAVES conservando el valor.
  const renombrarLlaves = (obj) => {
    if (!obj) return;
    Object.keys(mapa).forEach(viejo => {
      if (viejo in obj && !(mapa[viejo] in obj)) { obj[mapa[viejo]] = obj[viejo]; delete obj[viejo]; }
    });
  };
  SUCURSALES.forEach(s => {
    CATEGORIAS.forEach(cat => {
      renombrarLlaves(db.bodegas[s] && db.bodegas[s][cat]);
      renombrarLlaves(db.sistemaTeorico[s] && db.sistemaTeorico[s][cat]);
    });
  });

  // 3) Turnos históricos (recibo, me surten, vendido, entregó).
  (db.turnos || []).forEach(t => {
    CATEGORIAS.forEach(cat => {
      renombrarLlaves(t.modulos && t.modulos[cat] && t.modulos[cat].recibo);
      renombrarLlaves(t.meSurten && t.meSurten[cat]);
      renombrarLlaves(t.cierre && t.cierre.vendido && t.cierre.vendido[cat]);
      renombrarLlaves(t.cierre && t.cierre.entrego && t.cierre.entrego[cat]);
    });
  });

  // 4) Entradas a bodega históricas.
  (db.entradasBodega || []).forEach(e => {
    CATEGORIAS.forEach(cat => renombrarLlaves(e.cantidades && e.cantidades[cat]));
  });

  // 5) Reportes de Sucursal (el departamento SISTEMAS referencia el catálogo en cascada).
  reportes.forEach(r => { if (r.problemaSistemas && mapa[r.problemaSistemas]) r.problemaSistemas = mapa[r.problemaSistemas]; });
  guardarReportes();

  console.log(`[migración "#"] Se corrigieron ${Object.keys(mapa).length} nombre(s):`, mapa);
}

// Busca un turno por su ID (Date.now()-style, generado por db.nextId).
function turnoPorId(id) {
  return db.turnos.find(t => t.id === Number(id));
}

// ==========================================
// GENERADOR DE INVENTARIOS EN EXCEL (.xlsx) — inline, sin módulo externo
// Replica el diseño de las plantillas: encabezado con nombre de sucursal
// coloreado por categoría, columnas #/ARTICULOS/FECHA, y cuadros de notas
// a la derecha (NOTA:, HERRAMIENTAS DE TRABAJO solo en Papelería, y el
// aviso de "no modificar el formato").
// ==========================================
const COLOR_CATEGORIA_EXCEL = {
  papeleria: 'FFFF0000', // Rojo
  snack: 'FF00B050',     // Verde
  novedades: 'FFA6A6A6', // Gris
  limpieza: 'FFADD8E6'   // Azul celeste
};
const ENCABEZADO_ARTICULOS_EXCEL = { papeleria: 'ARTICULOS', snack: 'PRODUCTOS', novedades: 'PRODUCTOS', limpieza: 'PRODUCTOS' };
const NOTA_POR_CATEGORIA_EXCEL = {
  papeleria: 'LLENAR CON EL NÚMERO DE ARTÍCULOS QUE HAY EN LA SUCURSAL (BODEGA + PISO). LOS PAQUETES DE HOJA CARTA Y HOJA OFICIO SE CUENTAN POR PAQUETE, NO POR HOJA SUELTA. SI ALGÚN ARTÍCULO NO SE ENCUENTRA, PONER 0 Y AVISAR AL LÍDER.',
  snack: 'LLENAR CON EL NÚMERO DE PIEZAS QUE HAY EN LA SUCURSAL. NO CONTAR PRODUCTOS YA ABIERTOS O CADUCADOS; REPÓRTALOS APARTE. SI FALTA ALGÚN PRODUCTO, PONER 0.',
  novedades: 'LLENAR CON EL NÚMERO DE PIEZAS EN BUEN ESTADO QUE HAY EN LA SUCURSAL. SI UNA PIEZA ESTÁ DAÑADA O NO SE PUEDE VENDER, NO LA CUENTES Y REPÓRTALA APARTE.',
  limpieza: 'LLENAR CON EL NÚMERO DE ARTÍCULOS QUE TIENEN EN SUCURSAL (BODEGA, PISO, ETC). EN EL CASO DE FABULOSO, CLORO O WINDEX, NO CONTAR LOS PRODUCTOS YA ABIERTOS. SI TU TRAPEADOR, ESCOBA, RECOGEDOR, ETC. YA NO ESTÁ EN BUEN ESTADO, PONLO EN 0 PARA SURTIRLO EN LA SIGUIENTE ENTREGA. SI REQUIERES ALGÚN MATERIAL QUE NO ESTÁ EN LA LISTA, AGRÉGALO AL FINAL.'
};
const HERRAMIENTAS_TRABAJO_EXCEL = [
  'GUILLOTINA', 'ENMICADORA', 'ENGARGOLADORA', 'CALCULADORA', 'PERFORADORA',
  'GRAPADORA', 'DESPACHADOR DE CINTA FILAMENTO'
];

function fechaCortaDDMMAA(fecha) {
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const aa = String(fecha.getFullYear()).slice(-2);
  return `${dd}-${mm}-${aa}`;
}

function nombreInventario(categoria, sucursal, fecha) {
  const catMayus = { papeleria: 'PAPELERÍA', snack: 'SNACK', novedades: 'NOVEDADES', limpieza: 'LIMPIEZA' }[categoria];
  return `INVENTARIO DE ${catMayus} ${sucursal.toUpperCase()} ${fechaCortaDDMMAA(fecha)}`;
}

async function generarInventarioXlsx({ categoria, sucursal, items, valores, fecha }) {
  fecha = fecha || new Date();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema Operativo i24h';
  wb.created = fecha;

  const nombreHoja = { papeleria: 'PAPELERIA', snack: 'SNACK', novedades: 'NOVEDADES', limpieza: 'LIMPIEZA' }[categoria];
  const ws = wb.addWorksheet(nombreHoja, { pageSetup: { orientation: 'portrait' } });

  ws.columns = [
    { width: 6.5 }, { width: 42 }, { width: 16 }, { width: 3 }, { width: 3 }, { width: 55 }
  ];

  const colorCat = COLOR_CATEGORIA_EXCEL[categoria];
  const nombreArchivo = nombreInventario(categoria, sucursal, fecha);
  const fechaHeader = fechaCortaDDMMAA(fecha);

  ws.mergeCells('A1:C1');
  const titulo = ws.getCell('A1');
  titulo.value = nombreArchivo;
  titulo.font = { name: 'Arial', bold: true, size: 13 };
  titulo.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getRow(1).height = 30;

  const celdaSucursal = ws.getCell('B2');
  celdaSucursal.value = sucursal.toUpperCase();
  celdaSucursal.font = { name: 'Arial', bold: true, size: 12, color: { argb: categoria === 'novedades' ? 'FF000000' : 'FFFFFFFF' } };
  celdaSucursal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorCat } };
  celdaSucursal.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 22;

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA5A5A5' } };
  const hNum = ws.getCell('A3'); hNum.value = '#'; hNum.font = { bold: true, name: 'Arial' }; hNum.fill = headerFill; hNum.alignment = { horizontal: 'center' };
  const hArt = ws.getCell('B3'); hArt.value = ENCABEZADO_ARTICULOS_EXCEL[categoria]; hArt.font = { bold: true, name: 'Arial' }; hArt.fill = headerFill; hArt.alignment = { horizontal: 'center' };
  const hFecha = ws.getCell('C3'); hFecha.value = fechaHeader; hFecha.font = { bold: true, name: 'Arial' };
  hFecha.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  hFecha.alignment = { horizontal: 'center' };

  let fila = 4;
  items.forEach((item, idx) => {
    const rNum = ws.getCell(`A${fila}`); rNum.value = idx + 1; rNum.font = { name: 'Arial', size: 9 }; rNum.alignment = { horizontal: 'center' };
    const rArt = ws.getCell(`B${fila}`); rArt.value = item; rArt.font = { name: 'Arial', bold: true };
    rArt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    const rVal = ws.getCell(`C${fila}`);
    rVal.value = valores ? Number(valores[item] || 0) : 0;
    rVal.font = { name: 'Arial', bold: true };
    rVal.alignment = { horizontal: 'center' };
    if (!valores) {
      rVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } };
      rVal.value = null;
    }
    ws.getRow(fila).height = 15.75;
    fila++;
  });
  const ultimaFilaTabla = fila - 1;

  let filaNota = 2;
  const notaInicio = filaNota;
  const notaFinTexto = filaNota + 10;
  ws.mergeCells(`F${notaInicio}:J${notaFinTexto}`);
  const celdaNota = ws.getCell(`F${notaInicio}`);
  celdaNota.value = {
    richText: [
      { font: { bold: true, color: { argb: 'FFFF0000' }, name: 'Arial', size: 12 }, text: 'NOTA:\n' },
      { font: { name: 'Arial', size: 10 }, text: NOTA_POR_CATEGORIA_EXCEL[categoria] }
    ]
  };
  celdaNota.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
  celdaNota.border = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' } };

  let siguienteFilaNotas = notaFinTexto + 2;

  if (categoria === 'papeleria') {
    const herrInicio = siguienteFilaNotas;
    const herrFin = herrInicio + 4;
    ws.mergeCells(`F${herrInicio}:J${herrFin}`);
    const celdaHerr = ws.getCell(`F${herrInicio}`);
    celdaHerr.value = {
      richText: [
        { font: { bold: true, name: 'Arial', size: 12 }, text: 'HERRAMIENTAS DE TRABAJO:\n' },
        { font: { name: 'Arial', size: 10 }, text: HERRAMIENTAS_TRABAJO_EXCEL.join(', ') + '.\nVerificar que estén en buen estado y completas.' }
      ]
    };
    celdaHerr.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
    celdaHerr.border = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' } };
    siguienteFilaNotas = herrFin + 2;
  }

  const avisoInicio = siguienteFilaNotas;
  const avisoFin = avisoInicio + 3;
  ws.mergeCells(`F${avisoInicio}:J${avisoFin}`);
  const celdaAviso = ws.getCell(`F${avisoInicio}`);
  celdaAviso.value = 'ES IMPORTANTE NO REALIZARLE MODIFICACIONES A ESTE FORMATO. EN CUANTO AL ACOMODO DE LOS ARTICULOS.';
  celdaAviso.font = { bold: true, name: 'Arial', size: 10 };
  celdaAviso.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  celdaAviso.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  celdaAviso.border = { top: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' }, bottom: { style: 'medium' } };

  for (let r = 3; r <= ultimaFilaTabla; r++) {
    ['A', 'B', 'C'].forEach(col => {
      const cell = ws.getCell(`${col}${r}`);
      cell.border = { top: { style: 'thin', color: { argb: 'FFDDDDDD' } }, bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } }, left: { style: 'thin', color: { argb: 'FFDDDDDD' } }, right: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return { buffer, nombreArchivo: nombreArchivo + '.xlsx' };
}

// ==========================================
// (Integración con Google Drive para fotos: DESACTIVADA por ahora.
// El sistema todavía no se sube a producción, así que se quitó para poder
// probar en localhost sin depender de credenciales de Google Cloud. Cuando
// llegue el momento de reactivarla, se puede volver a traer este bloque.)
// ==========================================

// ==========================================
// TURNOS: FÁBRICA Y BÚSQUEDAS
// ==========================================
function nuevoTurno(sucursal, turno, nombre) {
  const ahora = new Date();
  const t = {
    id: Date.now(), // ID único legible/ordenable, tal como se pidió
    sucursal, turno,
    colaborador: nombre,       // campo plano "Colaborador" (además de las trazas de abajo)
    nombreApertura: nombre,
    colaboradores: [nombre],
    fecha: fechaOperativaDe(ahora), // día operativo, fijo desde la creación
    estado: 'abierto',
    inicioHora: ahora.toISOString(),
    cierreHora: null,
    modulos: {
      papeleria: { completo: false, primerTicket: null, caja: null, recibo: objVacio(CATALOGOS.papeleria), horaCompletado: null, colaborador: null },
      snack: { completo: false, recibo: objVacio(CATALOGOS.snack), horaCompletado: null, colaborador: null },
      novedades: { completo: false, recibo: objVacio(CATALOGOS.novedades), horaCompletado: null, colaborador: null }
    },
    meSurten: catObjVacio(),
    cierre: {
      completo: false, horaCompletado: null, colaborador: null, ultimoTicket: null,
      vendido: catObjVacio(), merma: catObjVacio(), entrego: catObjVacio(),
      impresoras: {
        impresora1: { anterior: objVacio(IMPRESORA_ITEMS), actual: objVacio(IMPRESORA_ITEMS), procesado: objVacio(IMPRESORA_ITEMS) },
        impresora2: { anterior: objVacio(IMPRESORA_ITEMS), actual: objVacio(IMPRESORA_ITEMS), procesado: objVacio(IMPRESORA_ITEMS) }
      }
    },
    corteCaja: {
      completo: false, horaCompletado: null, colaborador: null,
      cobradas: objVacio(COBRADAS_ITEMS),
      tramites: objVacio(TRAMITES_ITEMS),
      ventaTotal: 0, sdp: 0, sobresActaProcesados: 0, ti24h: 0, tGen: 0,
      // Distintos del "SCANNER"/"MERMA SCANNER" de Revisión de Contadores
      // (esos viven dentro de `cobradas`). Null por defecto para no romper
      // turnos antiguos que no los tienen.
      scannerCobrados: null, scannerMerma: null,
      explicacionVenta: ''
      // (fotoRetiro / fotoActa: quitadas por ahora — ver nota de Google Drive desactivado)
    }
  };
  db.turnos.push(t);
  db.turnoActivoId[sucursal] = t.id;
  return t;
}

function turnoAbierto(sucursal) {
  const id = db.turnoActivoId[sucursal];
  if (!id) return null;
  return db.turnos.find(t => t.id === id) || null;
}
function turnoAbiertoOCrear(sucursal, turno, nombre) {
  const existente = turnoAbierto(sucursal);
  if (existente) {
    if (!existente.colaboradores.includes(nombre)) existente.colaboradores.push(nombre);
    return existente;
  }
  return nuevoTurno(sucursal, turno, nombre);
}
function turnosCerrados(sucursal) {
  return db.turnos.filter(t => t.sucursal === sucursal && t.estado === 'cerrado')
    .sort((a, b) => new Date(b.cierreHora) - new Date(a.cierreHora));
}
function ultimoTurnoCerrado(sucursal) {
  const l = turnosCerrados(sucursal);
  return l.length ? l[0] : null;
}
function turnoPendienteCorteCaja(sucursal) {
  const candidatos = db.turnos.filter(t => t.sucursal === sucursal && t.cierre.completo && !t.corteCaja.completo)
    .sort((a, b) => new Date(b.cierreHora) - new Date(a.cierreHora));
  return candidatos.length ? candidatos[0] : null;
}
function turnoMasReciente(sucursal) {
  const l = db.turnos.filter(t => t.sucursal === sucursal).sort((a, b) => new Date(b.inicioHora) - new Date(a.inicioHora));
  return l.length ? l[0] : null;
}
function buscarTurnoPorFecha(sucursal, fecha, turno) {
  return db.turnos.find(t => t.sucursal === sucursal && t.fecha === fecha && t.turno === turno) || null;
}
// Para navegar por fechas en "Piso, Bodega y Sistema": el turno más avanzado
// (T3 > T2 > T1) que exista para esa sucursal en esa fecha operativa exacta.
function turnoParaFecha(sucursal, fecha) {
  const delDia = db.turnos.filter(t => t.sucursal === sucursal && t.fecha === fecha);
  if (!delDia.length) return null;
  const orden = { T3: 3, T2: 2, T1: 1 };
  delDia.sort((a, b) => orden[b.turno] - orden[a.turno]);
  return delDia[0];
}
// El cierre real inmediato ANTERIOR a un turno dado (estrictamente antes en
// el tiempo), sin importar qué tan reciente sea `actual` — necesario para que
// la navegación histórica compare contra el turno correcto y no contra "lo
// más reciente de todos" cuando se está viendo una fecha pasada.
function turnoAnteriorA(actual, sucursal) {
  if (!actual) return null;
  const refHora = new Date(actual.cierreHora || actual.inicioHora).getTime();
  const candidatos = turnosCerrados(sucursal).filter(t => t.id !== actual.id && new Date(t.cierreHora).getTime() < refHora);
  return candidatos.length ? candidatos[0] : null;
}
// "Turno 1 actual": el registro de T1 del día operativo de hoy para esa
// sucursal (exista o no, esté abierto o ya cerrado). Es la fuente que pide
// el módulo de Inventarios automáticos.
function turnoT1DeHoy(sucursal) {
  return buscarTurnoPorFecha(sucursal, fechaOperativaActual(), 'T1');
}
// Próximo módulo de "Inicio de Turno" pendiente, en orden fijo, saltando los ya completados
// (soporta concurrencia: varios colaboradores llenando módulos distintos del mismo turno).
function siguientePendiente(t) {
  if (!t) return ORDEN_MODULOS[0];
  return ORDEN_MODULOS.find(m => !t.modulos[m].completo) || null;
}

// ==========================================
// MIDDLEWARES
// ==========================================
app.use(express.json());

// ------------------------------------------
// ARCHIVOS ESTÁTICOS DEL FRONTEND
// ------------------------------------------
// panel.html, index.html, JAVA.js, panel.js, estilos.css e imágenes viven en
// la MISMA carpeta raíz que server.js (no en un subdirectorio "public"), así
// que se sirven directamente desde __dirname.
//
// CRÍTICO — bloqueo de archivos sensibles: exponer __dirname completo como
// estático dejaría descargables públicamente database.json, catalogos.json,
// reportes.json, logs.json, avatars.json, package.json e incluso este mismo
// server.js (código fuente y datos reales de todas las sucursales). Este
// bloqueo corre ANTES del express.static de abajo, así que ninguna de estas
// rutas llega nunca a servirse como archivo público, sin importar cómo se
// pida (con mayúsculas, con query string, etc.).
const ARCHIVOS_PROHIBIDOS = new Set([
  'server.js', 'database.json', 'catalogos.json', 'reportes.json',
  'logs.json', 'avatars.json', 'package.json', 'package-lock.json', '.env'
]);
app.use((req, res, next) => {
  const nombreArchivo = path.basename(req.path).toLowerCase();
  if (ARCHIVOS_PROHIBIDOS.has(nombreArchivo) || req.path.startsWith('/node_modules')) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(__dirname));
// Se mantiene también /public (ahí vive públicamente la carpeta de avatares
// de foto de perfil que ya usa el resto del sistema: /public/avatars).
app.use(express.static(path.join(__dirname, 'public')));

// Ruta raíz: al entrar al dominio principal, se envía panel.html.
// path.join(__dirname, ...) arma la ruta absoluta para que esto funcione
// igual en local que en el entorno de producción de Render.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'panel.html'));
});

app.use(session({ secret: 'i24h-sistema-operativo-secreto', resave: false, saveUninitialized: false }));

function requiereColaborador(req, res, next) {
  if (!req.session.colaborador) return res.status(401).json({ error: 'No hay sesión de colaborador activa.' });
  next();
}
function requiereLider(req, res, next) {
  if (!req.session.lider) return res.status(401).json({ error: 'No hay sesión de líder activa.' });
  next();
}
function requiereAdmin(req, res, next) {
  if (!req.session.lider) return res.status(401).json({ error: 'No hay sesión de líder activa.' });
  if (req.session.lider.rol !== 'admin') return res.status(403).json({ error: 'Solo un administrador puede hacer esto.' });
  next();
}
// Valida que la sesión de panel tenga acceso a :sucursal (o a body.sucursal)
function requiereAccesoSucursal(req, res, next) {
  const sucursal = req.params.sucursal || req.body.sucursal;
  if (!SUCURSALES.includes(sucursal)) return res.status(400).json({ error: 'Sucursal inválida.' });
  if (!tieneAccesoSucursal(req.session.lider, sucursal)) {
    return res.status(403).json({ error: 'No tienes acceso a esta sucursal.' });
  }
  next();
}

// Reportes de Sucursal: acceso para CUALQUIER sesión activa (colaborador,
// líder, operativo o admin). Determina autor y sucursales permitidas según
// cuál de las dos sesiones esté activa.
function identidadReporte(req) {
  if (req.session.colaborador) {
    return { autor: req.session.colaborador.nombre, rol: 'colaborador', sucursalFija: req.session.colaborador.sucursal, sucursalesPermitidas: [req.session.colaborador.sucursal] };
  }
  if (req.session.lider) {
    return { autor: req.session.lider.nombre, rol: req.session.lider.rol, sucursalFija: null, sucursalesPermitidas: sucursalesDeSesion(req.session.lider) };
  }
  return null;
}
function requiereSesionCualquiera(req, res, next) {
  const identidad = identidadReporte(req);
  if (!identidad) return res.status(401).json({ error: 'No hay sesión activa.' });
  req.identidadReporte = identidad;
  next();
}

// ==========================================
// CONFIGURACIÓN
// ==========================================
app.get('/api/config', (req, res) => {
  res.json({
    sucursales: SUCURSALES, turnos: TURNOS_DISPONIBLES, catalogos: CATALOGOS,
    categorias: CATEGORIAS, nombreCategoria: NOMBRE_CATEGORIA,
    impresoraItems: IMPRESORA_ITEMS, cobradasItems: COBRADAS_ITEMS, tramitesItems: TRAMITES_ITEMS,
    diasSemana: DIAS_SEMANA_MAYUS, fechaOperativaActual: fechaOperativaActual(),
    departamentosReporte: DEPARTAMENTOS_REPORTE, catalogoSistemas: CATALOGO_SISTEMAS
  });
});

// ==========================================
// SESIÓN DE COLABORADOR
// ==========================================
app.post('/api/colaborador/login', (req, res) => {
  const { sucursal, nombre, turno } = req.body;
  if (!SUCURSALES.includes(sucursal)) return res.status(400).json({ error: 'Sucursal inválida.' });
  if (!TURNOS_DISPONIBLES.includes(turno)) return res.status(400).json({ error: 'Turno inválido.' });
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Escribe tu nombre.' });
  req.session.colaborador = { sucursal, nombre: nombre.trim(), turno };
  registrarEvento('colaborador', nombre.trim(), sucursal, `${nombre.trim()} inició sesión (Turno ${turno} - ${sucursal})`, turno);
  res.json(req.session.colaborador);
});
app.get('/api/colaborador/sesion', (req, res) => {
  if (req.session.colaborador) return res.json(req.session.colaborador);
  res.status(401).json({ error: 'No hay sesión activa.' });
});
app.post('/api/colaborador/logout', (req, res) => {
  req.session.colaborador = null;
  res.json({ mensaje: 'Sesión cerrada.' });
});

app.get('/api/turno/actual', requiereColaborador, (req, res) => {
  res.json(turnoAbierto(req.session.colaborador.sucursal));
});

// Estado de concurrencia de los 3 módulos de Inicio de Turno
app.get('/api/turno/pendientes', requiereColaborador, (req, res) => {
  const t = turnoAbierto(req.session.colaborador.sucursal);
  res.json({
    papeleria: !!(t && t.modulos.papeleria.completo),
    snack: !!(t && t.modulos.snack.completo),
    novedades: !!(t && t.modulos.novedades.completo),
    siguientePendiente: siguientePendiente(t)
  });
});

// Referencia de lo que "debería" recibirse (Entregó del turno anterior) — solo informativo
app.get('/api/turno/referencia-anterior', requiereColaborador, (req, res) => {
  const anterior = ultimoTurnoCerrado(req.session.colaborador.sucursal);
  res.json(anterior ? anterior.cierre.entrego : catObjVacio());
});

// ------------------------------------------
// "ME SURTEN" — traspaso de Bodega a Piso (colaborador)
// ------------------------------------------
// Un solo endpoint sirve tanto para decidir si el botón "Me surten" del menú
// se ve habilitado (stock total > 0) como para precargar el formulario con
// lo realmente disponible en bodega por insumo.
app.get('/api/bodega/estado', requiereColaborador, (req, res) => {
  const bodega = db.bodegas[req.session.colaborador.sucursal];
  let total = 0;
  CATEGORIAS.forEach(cat => CATALOGOS[cat].forEach(item => { total += Number(bodega[cat][item] || 0); }));
  res.json({ total, disponible: total > 0, bodega });
});

app.post('/api/inventario/me-surten/:categoria', requiereColaborador, (req, res) => {
  const { categoria } = req.params;
  if (!CATEGORIAS.includes(categoria)) return res.status(400).json({ error: 'Categoría inválida.' });
  const { sucursal, nombre, turno } = req.session.colaborador;

  const cantidadesBody = req.body.cantidades || {};
  const bodega = db.bodegas[sucursal][categoria];

  // Se valida TODO antes de mover nada (todo o nada): ningún insumo puede
  // traspasarse por más de lo físicamente disponible en bodega.
  const pedido = {};
  CATALOGOS[categoria].forEach(item => {
    const v = Number(cantidadesBody[item]);
    if (Number.isFinite(v) && v > 0) pedido[item] = v;
  });
  if (!Object.keys(pedido).length) return res.status(400).json({ error: 'Captura al menos una cantidad mayor a 0.' });

  for (const item of Object.keys(pedido)) {
    const disponible = Number(bodega[item] || 0);
    if (pedido[item] > disponible) {
      return res.status(400).json({ error: `No hay suficiente stock de "${item}" en bodega (disponible: ${disponible}).` });
    }
  }

  // Matemática estricta: resta de Bodega, suma a Piso (meSurten) del turno
  // operativo actual — se crea el turno si aún no existía (mismo patrón que
  // "Inicio de Turno").
  const t = turnoAbiertoOCrear(sucursal, turno, nombre);
  Object.keys(pedido).forEach(item => {
    bodega[item] = Number(bodega[item] || 0) - pedido[item];
    t.meSurten[categoria][item] = Number(t.meSurten[categoria][item] || 0) + pedido[item];
  });

  guardar();
  registrarEvento('colaborador', nombre, sucursal, `${nombre} hizo "Me surten" de ${NOMBRE_CATEGORIA[categoria]} en ${sucursal}`, turno);
  res.json({ mensaje: 'Traspaso registrado correctamente.', bodega, meSurten: t.meSurten[categoria] });
});

// ------------------------------------------
// INICIO DE TURNO — 3 módulos independientes con concurrencia
// ------------------------------------------
app.post('/api/turno/inicio/papeleria', requiereColaborador, (req, res) => {
  const { sucursal, nombre, turno } = req.session.colaborador;
  const { primerTicket, caja, recibo } = req.body;
  if (primerTicket === undefined || primerTicket === null || primerTicket === '' ||
      caja === undefined || caja === null || caja === '') {
    return res.status(400).json({ error: 'Captura Primer Ticket y N° de Caja antes de guardar.' });
  }
  const t = turnoAbiertoOCrear(sucursal, turno, nombre);
  t.modulos.papeleria = {
    completo: true, primerTicket: String(primerTicket), caja: String(caja),
    recibo: limpiarObj(recibo, CATALOGOS.papeleria),
    horaCompletado: new Date().toISOString(), colaborador: nombre
  };
  guardar();
  registrarEvento('colaborador', nombre, sucursal, `${nombre} (${turno} - ${sucursal}) completó Conteo de Papelería`, turno);
  res.json({ mensaje: 'Conteo de Papelería guardado.', turno: t, siguientePendiente: siguientePendiente(t) });
});

function guardarModuloSimple(modulo) {
  return (req, res) => {
    const { sucursal, nombre, turno } = req.session.colaborador;
    const t = turnoAbiertoOCrear(sucursal, turno, nombre);
    t.modulos[modulo] = {
      completo: true, recibo: limpiarObj(req.body.recibo, CATALOGOS[modulo]),
      horaCompletado: new Date().toISOString(), colaborador: nombre
    };
    guardar();
    registrarEvento('colaborador', nombre, sucursal, `${nombre} (${turno} - ${sucursal}) completó Conteo de ${NOMBRE_CATEGORIA[modulo]}`, turno);
    res.json({ mensaje: `Conteo de ${NOMBRE_CATEGORIA[modulo]} guardado.`, turno: t, siguientePendiente: siguientePendiente(t) });
  };
}
app.post('/api/turno/inicio/snack', requiereColaborador, guardarModuloSimple('snack'));
app.post('/api/turno/inicio/novedades', requiereColaborador, guardarModuloSimple('novedades'));

// ------------------------------------------
// CIERRE DE TURNO
// ------------------------------------------
app.get('/api/turno/cierre/datos', requiereColaborador, (req, res) => {
  const { sucursal } = req.session.colaborador;
  const t = turnoAbierto(sucursal);
  if (!t) return res.status(400).json({ error: 'No hay un turno abierto en esta sucursal.' });

  const anterior = ultimoTurnoCerrado(sucursal);
  const impresorasAnterior = anterior
    ? { impresora1: anterior.cierre.impresoras.impresora1.actual, impresora2: anterior.cierre.impresoras.impresora2.actual }
    : { impresora1: objVacio(IMPRESORA_ITEMS), impresora2: objVacio(IMPRESORA_ITEMS) };

  res.json({ turno: t, impresorasAnterior });
});

app.post('/api/turno/cierre', requiereColaborador, (req, res) => {
  const { sucursal, nombre } = req.session.colaborador;
  const t = turnoAbierto(sucursal);
  if (!t) return res.status(400).json({ error: 'No hay un turno abierto para cerrar.' });
  if (!req.body.ultimoTicket || !String(req.body.ultimoTicket).trim()) {
    return res.status(400).json({ error: 'Captura el Último Ticket antes de cerrar el turno.' });
  }

  const vendido = limpiarCatObj(req.body.vendido);
  const merma = limpiarCatObj(req.body.merma);
  const anterior = ultimoTurnoCerrado(sucursal);
  const impresorasAnterior = anterior
    ? { impresora1: anterior.cierre.impresoras.impresora1.actual, impresora2: anterior.cierre.impresoras.impresora2.actual }
    : { impresora1: objVacio(IMPRESORA_ITEMS), impresora2: objVacio(IMPRESORA_ITEMS) };

  const entrego = {};
  CATEGORIAS.forEach(cat => {
    entrego[cat] = {};
    CATALOGOS[cat].forEach(item => {
      const recibo = Number(t.modulos[cat].recibo[item] || 0);
      const meSurten = Number(t.meSurten[cat][item] || 0);
      entrego[cat][item] = recibo + meSurten - Number(vendido[cat][item] || 0) - Number(merma[cat][item] || 0);
    });
  });

  // Fórmula correcta: los contadores físicos siempre avanzan, así que
  // Procesado = Contador Actual - Contador Turno Anterior (nunca al revés).
  const impresoras = { impresora1: {}, impresora2: {} };
  ['impresora1', 'impresora2'].forEach(imp => {
    const actual = limpiarObj(req.body.impresoras ? req.body.impresoras[imp] : null, IMPRESORA_ITEMS);
    const ant = impresorasAnterior[imp];
    const procesado = {};
    IMPRESORA_ITEMS.forEach(item => { procesado[item] = Number(actual[item] || 0) - Number(ant[item] || 0); });
    impresoras[imp] = { anterior: ant, actual, procesado };
  });

  t.cierre = {
    completo: true, horaCompletado: new Date().toISOString(), colaborador: nombre,
    ultimoTicket: String(req.body.ultimoTicket),
    vendido, merma, entrego, impresoras
  };
  t.estado = 'cerrado';
  t.cierreHora = new Date().toISOString();
  db.turnoActivoId[sucursal] = null;
  guardar();
  registrarEvento('colaborador', nombre, sucursal, `Turno ${t.turno} cerrado en ${sucursal} por ${nombre}`, t.turno);

  res.json({ mensaje: 'Turno cerrado correctamente.', turno: t });
});

// ------------------------------------------
// CORTE DE CAJA (independiente del Cierre de Turno)
// ------------------------------------------
app.get('/api/turno/corte-caja/pendiente', requiereColaborador, (req, res) => {
  res.json(turnoPendienteCorteCaja(req.session.colaborador.sucursal));
});

// ------------------------------------------
// Corte de Caja
// (Las fotos de Sobre de Retiro / Sobre de Actas y su subida a Google Drive
// quedaron desactivadas por ahora — solo pruebas en localhost. Cuando el
// sistema esté listo para producción, se reactiva el bloque de Drive y se
// vuelve a exigir aquí, igual que antes.)
// ------------------------------------------
app.post('/api/turno/corte-caja', requiereColaborador, (req, res) => {
  const { sucursal, nombre } = req.session.colaborador;
  const t = turnoPendienteCorteCaja(sucursal);
  if (!t) return res.status(400).json({ error: 'No hay un turno con Cierre de Turno completado, pendiente de Corte de Caja.' });

  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const sobresActaProcesados = num(req.body.sobresActaProcesados);

  t.corteCaja = {
    completo: true, horaCompletado: new Date().toISOString(), colaborador: nombre,
    cobradas: limpiarObj(req.body.cobradas, COBRADAS_ITEMS),
    tramites: limpiarObj(req.body.tramites, TRAMITES_ITEMS),
    ventaTotal: num(req.body.ventaTotal),
    sdp: num(req.body.sdp),
    sobresActaProcesados,
    ti24h: num(req.body.ti24h),
    tGen: num(req.body.tGen),
    scannerCobrados: num(req.body.scannerCobrados),
    scannerMerma: num(req.body.scannerMerma),
    explicacionVenta: (req.body.explicacionVenta || '').toString()
  };
  guardar();
  registrarEvento('colaborador', nombre, sucursal, `${nombre} registró el Corte de Caja del turno ${t.turno} en ${sucursal}`, t.turno);
  res.json({ mensaje: 'Corte de Caja guardado correctamente.', turno: t });
});

// Resumen del día operativo (T1+T2+T3), para el WhatsApp de Corte de Caja
app.get('/api/turno/resumen-diario', requiereColaborador, (req, res) => {
  const { sucursal } = req.session.colaborador;
  const fecha = req.query.fecha || fechaOperativaActual();
  const porTurno = {};
  TURNOS_DISPONIBLES.forEach(turno => {
    const t = buscarTurnoPorFecha(sucursal, fecha, turno);
    porTurno[turno] = (t && t.corteCaja.completo) ? {
      ventaTotal: t.corteCaja.ventaTotal, sdp: t.corteCaja.sdp,
      sobresActaProcesados: t.corteCaja.sobresActaProcesados,
      ti24h: t.corteCaja.ti24h, tGen: t.corteCaja.tGen,
      explicacionVenta: t.corteCaja.explicacionVenta
    } : { ventaTotal: 0, sdp: 0, sobresActaProcesados: 0, ti24h: 0, tGen: 0, explicacionVenta: '' };
  });
  const total = TURNOS_DISPONIBLES.reduce((acc, turno) => acc + Number(porTurno[turno].ventaTotal || 0), 0);
  res.json({ sucursal, fecha, fechaCorta: fechaCorta(fecha), diaSemana: diaSemanaDe(fecha, false), turnos: porTurno, total });
});

// ------------------------------------------
// INVENTARIOS AUTOMÁTICOS (colaborador) — genera y descarga el .xlsx
// ------------------------------------------
// "Turno 1 actual" = el registro de T1 del día operativo de hoy en la
// sucursal del colaborador (ver turnoT1DeHoy). Papelería usa Bodega +
// Entregó de ese T1; Snack y Novedades usan el Recibió de ese mismo T1;
// Limpieza siempre sale en blanco para captura manual.
app.get('/api/inventarios/:categoria', requiereColaborador, async (req, res) => {
  const { sucursal } = req.session.colaborador;
  const categoria = req.params.categoria;
  if (!['papeleria', 'snack', 'novedades', 'limpieza'].includes(categoria)) {
    return res.status(400).json({ error: 'Categoría de inventario inválida.' });
  }

  try {
    let items, valores = null;
    if (categoria === 'limpieza') {
      items = CATALOGO_LIMPIEZA;
      valores = null; // en blanco, para captura manual
    } else {
      items = CATALOGOS[categoria];
      const t1 = turnoT1DeHoy(sucursal);
      valores = {};
      items.forEach(item => {
        if (categoria === 'papeleria') {
          const bodega = Number(db.bodegas[sucursal].papeleria[item] || 0);
          const entrego = (t1 && t1.cierre.completo) ? Number(t1.cierre.entrego.papeleria[item] || 0) : 0;
          valores[item] = bodega + entrego;
        } else {
          valores[item] = t1 ? Number(t1.modulos[categoria].recibo[item] || 0) : 0;
        }
      });
    }

    const { buffer, nombreArchivo } = await generarInventarioXlsx({ categoria, sucursal, items, valores });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nombreArchivo)}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo generar el inventario: ' + err.message });
  }
});

app.post('/api/colaborador/salir-sin-cerrar', requiereColaborador, (req, res) => {
  req.session.colaborador = null;
  res.json({ mensaje: 'Sesión cerrada. El trabajo en curso de la sucursal permanece guardado.' });
});

// ==========================================
// PANEL DE LÍDERES
// ==========================================
app.post('/api/panel/login', (req, res) => {
  const { password, nombre } = req.body;
  const sesion = autenticarPanel(nombre, password);
  if (!sesion) return res.status(401).json({ error: 'Nombre o contraseña incorrectos.' });
  req.session.lider = sesion;
  registrarEvento(sesion.rol, sesion.nombre, null, `${sesion.nombre} (${sesion.rol}) inició sesión en el panel`);
  res.json({ nombre: sesion.nombre, rol: sesion.rol, sucursales: sucursalesDeSesion(sesion), foto: avatarUrlDe(sesion.nombre) });
});
app.get('/api/panel/sesion', (req, res) => {
  if (!req.session.lider) return res.status(401).json({ error: 'No hay sesión activa.' });
  res.json({ nombre: req.session.lider.nombre, rol: req.session.lider.rol, sucursales: sucursalesDeSesion(req.session.lider), foto: avatarUrlDe(req.session.lider.nombre) });
});
app.post('/api/panel/logout', (req, res) => {
  req.session.lider = null;
  res.json({ mensaje: 'Sesión cerrada.' });
});

// ------------------------------------------
// Foto de Perfil (Panel de Líderes)
// ------------------------------------------
app.post('/api/panel/avatar', requiereLider, (req, res) => {
  uploadAvatar.single('foto')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'No se pudo subir la imagen.' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });

    const clave = claveAvatar(req.session.lider.nombre);
    const avatares = cargarAvatares();
    const anterior = avatares[clave];
    avatares[clave] = { archivo: req.file.filename };
    guardarAvatares(avatares);

    // Borra el archivo anterior (si existía) para no acumular imágenes viejas.
    if (anterior && anterior.archivo && anterior.archivo !== req.file.filename) {
      fs.unlink(path.join(AVATARS_DIR, anterior.archivo), () => {});
    }

    registrarEvento(req.session.lider.rol, req.session.lider.nombre, null, `${req.session.lider.nombre} actualizó su foto de perfil`);
    res.json({ mensaje: 'Foto de perfil actualizada.', foto: `/avatars/${req.file.filename}` });
  });
});
app.delete('/api/panel/avatar', requiereLider, (req, res) => {
  const clave = claveAvatar(req.session.lider.nombre);
  const avatares = cargarAvatares();
  const entrada = avatares[clave];
  if (entrada && entrada.archivo) {
    fs.unlink(path.join(AVATARS_DIR, entrada.archivo), () => {});
    delete avatares[clave];
    guardarAvatares(avatares);
  }
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, null, `${req.session.lider.nombre} eliminó su foto de perfil`);
  res.json({ mensaje: 'Foto de perfil eliminada.' });
});

app.get('/api/panel/turnos', requiereLider, (req, res) => {
  const permitidas = sucursalesDeSesion(req.session.lider);
  let lista = db.turnos.slice().sort((a, b) => new Date(b.inicioHora) - new Date(a.inicioHora));
  lista = lista.filter(t => permitidas.includes(t.sucursal));
  if (req.query.sucursal) {
    if (!tieneAccesoSucursal(req.session.lider, req.query.sucursal)) return res.status(403).json({ error: 'No tienes acceso a esta sucursal.' });
    lista = lista.filter(t => t.sucursal === req.query.sucursal);
  }
  res.json(lista);
});

// ------------------------------------------
// Gestión de Turnos: Editar y Eliminar (pruebas / correcciones retroactivas)
// ------------------------------------------
app.delete('/api/panel/turnos/:id', requiereLider, (req, res) => {
  const idx = db.turnos.findIndex(t => t.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Turno no encontrado.' });
  const t = db.turnos[idx];
  if (!tieneAccesoSucursal(req.session.lider, t.sucursal)) return res.status(403).json({ error: 'No tienes acceso a esta sucursal.' });
  if (db.turnoActivoId[t.sucursal] === t.id) db.turnoActivoId[t.sucursal] = null;
  db.turnos.splice(idx, 1);
  guardar();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, t.sucursal, `${req.session.lider.nombre} eliminó un turno (${t.turno}) de ${t.sucursal}`, t.turno);
  res.json({ mensaje: 'Turno eliminado correctamente.' });
});

// EDICIÓN RÁPIDA DE FECHA (Historial de Registros — corregir desfases de T3)
// Registrada ANTES de "/api/panel/turnos/:id" para que Express no confunda
// "editar-fecha" con un :id de la ruta genérica.
// ==========================================
app.put('/api/panel/turnos/editar-fecha', requiereLider, (req, res) => {
  const { id, fecha } = req.body;
  const t = turnoPorId(id);
  if (!t) return res.status(404).json({ error: 'Turno no encontrado.' });
  if (!tieneAccesoSucursal(req.session.lider, t.sucursal)) return res.status(403).json({ error: 'No tienes acceso a esta sucursal.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return res.status(400).json({ error: 'Fecha inválida, usa formato YYYY-MM-DD.' });

  const fechaAnterior = t.fecha;
  t.fecha = fecha;
  guardar();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, t.sucursal, `${req.session.lider.nombre} corrigió la fecha del turno ${t.turno} de ${t.sucursal} (${fechaAnterior} → ${fecha})`, t.turno);
  res.json({ mensaje: 'Fecha actualizada correctamente.', turno: t });
});

app.put('/api/panel/turnos/:id', requiereLider, (req, res) => {
  const t = turnoPorId(req.params.id);
  if (!t) return res.status(404).json({ error: 'Turno no encontrado.' });
  if (!tieneAccesoSucursal(req.session.lider, t.sucursal)) return res.status(403).json({ error: 'No tienes acceso a esta sucursal.' });
  const body = req.body || {};
  const sucursalVieja = t.sucursal;
  if (body.sucursal !== undefined && body.sucursal !== sucursalVieja && !tieneAccesoSucursal(req.session.lider, body.sucursal)) {
    return res.status(403).json({ error: 'No tienes acceso a la sucursal de destino.' });
  }

  // --- Identidad del turno: fecha operativa, turno y sucursal ---
  // Esto es lo crítico para simular capturas retroactivas de T3: al cambiar
  // la fecha, las búsquedas de Comparaciones (buscarTurnoPorFecha) usan el
  // campo `fecha` directamente, así que no hace falta reordenar ningún
  // array a mano — el turno "aparece" en el día correcto de inmediato.
  if (body.fecha !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) return res.status(400).json({ error: 'Fecha inválida, usa formato YYYY-MM-DD.' });
    t.fecha = body.fecha;
  }
  if (body.turno !== undefined) {
    if (!TURNOS_DISPONIBLES.includes(body.turno)) return res.status(400).json({ error: 'Turno inválido.' });
    t.turno = body.turno;
  }
  if (body.sucursal !== undefined && body.sucursal !== sucursalVieja) {
    if (!SUCURSALES.includes(body.sucursal)) return res.status(400).json({ error: 'Sucursal inválida.' });
    t.sucursal = body.sucursal;
    if (db.turnoActivoId[sucursalVieja] === t.id) db.turnoActivoId[sucursalVieja] = null;
    if (t.estado === 'abierto') db.turnoActivoId[t.sucursal] = t.id;
  }
  if (body.colaborador !== undefined && body.colaborador.trim()) {
    t.colaborador = body.colaborador.trim();
    t.nombreApertura = t.colaborador;
  }

  // --- Corrección rápida de inventario (Papelería/Snack/Novedades) ---
  // Solo toca los artículos que vengan en el body; el resto queda igual.
  if (body.ajustes) {
    CATEGORIAS.forEach(cat => {
      const aj = body.ajustes[cat];
      if (!aj) return;
      ['recibo', 'vendido', 'merma'].forEach(campo => {
        if (!aj[campo]) return;
        Object.keys(aj[campo]).forEach(item => {
          if (!CATALOGOS[cat].includes(item)) return;
          const val = Number(aj[campo][item]);
          if (!Number.isFinite(val) || val < 0) return;
          if (campo === 'recibo') t.modulos[cat].recibo[item] = val;
          else t.cierre[campo][item] = val; // vendido/merma viven dentro de cierre
        });
      });
    });
    // Recalcula Entregó con los valores (ya corregidos) de recibo/meSurten/vendido/merma
    if (t.cierre.completo) {
      CATEGORIAS.forEach(cat => CATALOGOS[cat].forEach(item => {
        const recibo = Number(t.modulos[cat].recibo[item] || 0);
        const meSurten = Number(t.meSurten[cat][item] || 0);
        const vendido = Number(t.cierre.vendido[cat][item] || 0);
        const merma = Number(t.cierre.merma[cat][item] || 0);
        t.cierre.entrego[cat][item] = recibo + meSurten - vendido - merma;
      }));
    }
  }

  // --- Corrección de contadores de impresoras ---
  if (body.impresoras && t.cierre.completo) {
    ['impresora1', 'impresora2'].forEach(imp => {
      const datos = body.impresoras[imp];
      if (!datos || !datos.actual) return;
      Object.keys(datos.actual).forEach(item => {
        if (!IMPRESORA_ITEMS.includes(item)) return;
        const val = Number(datos.actual[item]);
        if (!Number.isFinite(val) || val < 0) return;
        t.cierre.impresoras[imp].actual[item] = val;
        t.cierre.impresoras[imp].procesado[item] = val - Number(t.cierre.impresoras[imp].anterior[item] || 0);
      });
    });
  }

  // --- Corte de Caja: campos rápidos ---
  if (body.corteCaja) {
    const cc = body.corteCaja;
    if (cc.ultimoTicket !== undefined) t.cierre.ultimoTicket = String(cc.ultimoTicket);
    ['ventaTotal', 'sdp', 'sobresActaProcesados', 'ti24h', 'tGen', 'scannerCobrados', 'scannerMerma'].forEach(campo => {
      if (cc[campo] !== undefined) {
        const v = Number(cc[campo]);
        if (Number.isFinite(v)) t.corteCaja[campo] = v;
      }
    });
    if (cc.explicacionVenta !== undefined) t.corteCaja.explicacionVenta = String(cc.explicacionVenta);
  }

  guardar();
  const lider = req.session.lider;
  if (body.impresoras) {
    registrarEvento(lider.rol, lider.nombre, t.sucursal, `${lider.nombre} corrigió contadores en ${t.sucursal} (turno ${t.turno})`, t.turno);
  } else {
    registrarEvento(lider.rol, lider.nombre, t.sucursal, `${lider.nombre} editó el turno ${t.turno} de ${t.sucursal}`, t.turno);
  }
  res.json({ mensaje: 'Turno actualizado correctamente.', turno: t });
});

// ------------------------------------------
// Entrada a Bodega (exclusiva de líderes)
// ------------------------------------------
app.post('/api/panel/bodega/entrada', requiereLider, requiereAccesoSucursal, (req, res) => {
  const { sucursal, cantidades } = req.body;

  const limpio = limpiarCatObj(cantidades);
  const bodega = db.bodegas[sucursal];
  CATEGORIAS.forEach(cat => CATALOGOS[cat].forEach(item => {
    bodega[cat][item] = Number(bodega[cat][item] || 0) + Number(limpio[cat][item] || 0);
  }));

  // IMPORTANTE: "Entrada a Bodega" es un flujo independiente de "Me Surten".
  // Antes, este bloque también sumaba la cantidad al meSurten del turno
  // abierto, lo cual duplicaba la mercancía (Entrada a Bodega → Bodega Y
  // Me Surten). Se elimina ese efecto secundario: Entrada a Bodega SOLO
  // debe afectar db.bodegas[sucursal]. "Me Surten" sigue existiendo tal
  // cual para su propio flujo de surtido (no se toca aquí).

  db.entradasBodega.push({ id: db.nextId++, sucursal, lider: req.session.lider.nombre, fecha: new Date().toISOString(), cantidades: limpio });
  guardar();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, sucursal, `${req.session.lider.nombre} registró una entrada a bodega en ${sucursal}`);
  res.json({ mensaje: 'Entrada a bodega registrada.', bodega });
});

app.get('/api/panel/bodegas', requiereLider, (req, res) => {
  const permitidas = sucursalesDeSesion(req.session.lider);
  const filtrado = {};
  permitidas.forEach(s => { filtrado[s] = db.bodegas[s]; });
  res.json(filtrado);
});
app.get('/api/panel/entradas-bodega', requiereLider, (req, res) => {
  const permitidas = sucursalesDeSesion(req.session.lider);
  let lista = db.entradasBodega.slice().reverse().filter(e => permitidas.includes(e.sucursal));
  if (req.query.sucursal) lista = lista.filter(e => e.sucursal === req.query.sucursal);
  res.json(lista);
});

// ------------------------------------------
// A. Revisión de Contadores — Cobrado - Procesado = Diferencia
// ------------------------------------------
// ------------------------------------------
// A. Revisión de Contadores — Hardware agrupado (Inicial/Final/Total) vs Cuadre de Caja
// ------------------------------------------
const IMPRESORA_LABELS = { impresora1: 'IMPRESORA 1 (COLOR)', impresora2: 'IMPRESORA 2 (BYN)' };
// Agrupación exacta pedida para las tablas de hardware.
const GRUPOS_IMPRESORA = {
  COPIA: ['COPIA NEGRO', 'COPIA NEGRO G', 'COPIA COLOR', 'COPIA COLOR G'],
  IMPRESION: ['IMPRESION NEGRO', 'IMPRESION NEGRO G', 'IMPRESION COLOR', 'IMPRESION COLOR G'],
  OTROS: ['DB CARTA', 'TABLOIDE', 'SCANNER', 'SCANNER G']
};
// Cobradas que SÍ se suman al Total (Copia/Impre ByN y Color); el resto de
// COBRADAS_ITEMS (Tabloides, Doble Carta, Copia INE, Pasaporte, Ampliación)
// es puramente informativo: las máquinas ya cuentan esos formatos dentro de
// los clics generales de copia/impresión, así que sumarlos aparte duplicaría
// el conteo. Scanner tiene su propio bloque de diferencia, independiente.
const COBRADAS_BASE = ['COPIA BYN', 'IMPRE BYN', 'COPIA COLOR', 'IMPRE COLOR'];
const COBRADAS_INFORMATIVAS = ['TABLOIDES', 'DOBLE CARTA', 'COPIA INE BYN', 'COPIA INE COLOR', 'PASSAPORTE BYN', 'PASSAPORTE COLOR', 'AMPLIACION'];

// Total procesado de UN artículo, sumando las DOS impresoras (cruzado).
function procesadoCruzado(t, item) {
  return ['impresora1', 'impresora2'].reduce((acc, imp) =>
    acc + (Number(t.cierre.impresoras[imp].actual[item] || 0) - Number(t.cierre.impresoras[imp].anterior[item] || 0)), 0);
}

function construirVistaRevisionContadores(t) {
  // ---------- Sección superior: hardware agrupado por impresora ----------
  const impresoras = {};
  ['impresora1', 'impresora2'].forEach(imp => {
    const grupos = {};
    Object.keys(GRUPOS_IMPRESORA).forEach(nombreGrupo => {
      grupos[nombreGrupo] = GRUPOS_IMPRESORA[nombreGrupo].map(item => {
        const inicial = Number(t.cierre.impresoras[imp].anterior[item] || 0);
        const final = Number(t.cierre.impresoras[imp].actual[item] || 0);
        return { funcion: item, inicial, final, total: final - inicial };
      });
    });
    impresoras[imp] = { etiqueta: IMPRESORA_LABELS[imp], grupos };
  });

  // ---------- Sección inferior: Contadores (suma cruzada) ----------
  const copiaByn = procesadoCruzado(t, 'COPIA NEGRO') + procesadoCruzado(t, 'COPIA NEGRO G');
  const impreByn = procesadoCruzado(t, 'IMPRESION NEGRO') + procesadoCruzado(t, 'IMPRESION NEGRO G');
  const copiaColor = procesadoCruzado(t, 'COPIA COLOR') + procesadoCruzado(t, 'COPIA COLOR G');
  const impreColor = procesadoCruzado(t, 'IMPRESION COLOR') + procesadoCruzado(t, 'IMPRESION COLOR G');
  const totalContadores = copiaByn + impreByn + copiaColor + impreColor;

  const cobradas = t.corteCaja.cobradas || {};
  const cCopiaByn = Number(cobradas['COPIA BYN'] || 0);
  const cImpreByn = Number(cobradas['IMPRE BYN'] || 0);
  const cCopiaColor = Number(cobradas['COPIA COLOR'] || 0);
  const cImpreColor = Number(cobradas['IMPRE COLOR'] || 0);
  const merma = Number(cobradas['MERMA'] || 0);
  const totalCobradas = cCopiaByn + cImpreByn + cCopiaColor + cImpreColor;
  const diferenciaGlobal = (totalCobradas + merma) - totalContadores;

  const informativas = COBRADAS_INFORMATIVAS.map(item => ({ item, valor: Number(cobradas[item] || 0) }));

  // ---------- Bloque independiente de Scanner ----------
  // Procesados = Scanner + Scanner G de AMBAS impresoras (ya viene de
  // procesadoCruzado, que no se toca — sigue usando los mismos contadores).
  const scannerProcesado = procesadoCruzado(t, 'SCANNER') + procesadoCruzado(t, 'SCANNER G');
  // Merma Scanner y Scanner cobrado vienen tal cual del Corte de Caja; si el
  // corte es antiguo y no tiene "MERMA SCANNER", Number(undefined||0) = 0,
  // así que nunca rompe cortes históricos.
  const scannerMerma = Number(cobradas['MERMA SCANNER'] || 0);
  const scannerCobrado = Number(cobradas['SCANNER'] || 0);
  // Fórmula exacta pedida: Procesados - Merma - Cobrados.
  const scannerDiferencia = scannerProcesado - scannerMerma - scannerCobrado;

  return {
    turno: { id: t.id, sucursal: t.sucursal, turno: t.turno, fecha: t.fecha, colaboradorCierre: t.cierre.colaborador, colaboradorCaja: t.corteCaja.colaborador, corteCajaCompleto: t.corteCaja.completo },
    impresoras,
    contadores: { copiaByn, impreByn, copiaColor, impreColor, total: totalContadores },
    cobradas: { copiaByn: cCopiaByn, impreByn: cImpreByn, copiaColor: cCopiaColor, impreColor: cImpreColor, merma, total: totalCobradas, informativas },
    diferenciaGlobal,
    scanner: { procesado: scannerProcesado, merma: scannerMerma, cobrado: scannerCobrado, diferencia: scannerDiferencia },
    tramites: t.corteCaja.tramites
  };
}

app.get('/api/panel/revision-contadores/:turnoId', requiereLider, (req, res) => {
  const t = db.turnos.find(x => x.id === Number(req.params.turnoId));
  if (!t) return res.status(404).json({ error: 'Turno no encontrado.' });
  if (!tieneAccesoSucursal(req.session.lider, t.sucursal)) return res.status(403).json({ error: 'No tienes acceso a esta sucursal.' });
  if (!t.cierre.completo) return res.status(400).json({ error: 'Este turno todavía no tiene Cierre de Turno registrado.' });

  res.json(construirVistaRevisionContadores(t));
});

// Edición de Inicial/Final por rol (lider, operativo o admin — es decir,
// cualquier sesión de panel válida) y recálculo inmediato.
app.put('/api/panel/revision-contadores/:turnoId', requiereLider, (req, res) => {
  if (!['lider', 'operativo', 'admin'].includes(req.session.lider.rol)) {
    return res.status(403).json({ error: 'No tienes permiso para editar contadores.' });
  }
  const t = db.turnos.find(x => x.id === Number(req.params.turnoId));
  if (!t) return res.status(404).json({ error: 'Turno no encontrado.' });
  if (!tieneAccesoSucursal(req.session.lider, t.sucursal)) return res.status(403).json({ error: 'No tienes acceso a esta sucursal.' });
  if (!t.cierre.completo) return res.status(400).json({ error: 'Este turno todavía no tiene Cierre de Turno registrado.' });

  const body = req.body.impresoras || {};
  ['impresora1', 'impresora2'].forEach(imp => {
    const datos = body[imp];
    if (!datos) return;
    IMPRESORA_ITEMS.forEach(item => {
      if (datos.inicial && datos.inicial[item] !== undefined) {
        const v = Number(datos.inicial[item]);
        if (Number.isFinite(v) && v >= 0) t.cierre.impresoras[imp].anterior[item] = v;
      }
      if (datos.final && datos.final[item] !== undefined) {
        const v = Number(datos.final[item]);
        if (Number.isFinite(v) && v >= 0) t.cierre.impresoras[imp].actual[item] = v;
      }
      t.cierre.impresoras[imp].procesado[item] = Number(t.cierre.impresoras[imp].actual[item] || 0) - Number(t.cierre.impresoras[imp].anterior[item] || 0);
    });
  });

  guardar();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, t.sucursal, `${req.session.lider.nombre} corrigió contadores en ${t.sucursal} (turno ${t.turno})`, t.turno);
  res.json({ mensaje: 'Contadores actualizados correctamente.', ...construirVistaRevisionContadores(t) });
});

// ------------------------------------------
// B. Piso, Bodega y Sistema (Bitácora)
// Total Físico = Recibo + Me Surten - Vendido + Entrego + Bodega
// Diferencia   = Total Físico - Sistema
// ------------------------------------------
// turnoSolicitado: 'T1' | 'T2' | 'T3' | null. Si se pasa, la vista es EXACTA
// a ese turno de esa fecha (aunque no exista, aunque haya uno más avanzado
// ese mismo día) — ya no se autodetecta "el más avanzado". Si no se pasa
// (usado por el archivado histórico), se mantiene el comportamiento viejo
// de tomar el turno más avanzado que exista ese día, para no romper snapshots
// ya guardados con esa semántica.
function construirAuditoriaInventario(sucursal, fecha, turnoSolicitado) {
  const actual = turnoSolicitado
    ? buscarTurnoPorFecha(sucursal, fecha, turnoSolicitado)
    : turnoParaFecha(sucursal, fecha);
  const turnoDeLaCadena = turnoSolicitado || (actual ? actual.turno : 'T1');

  // Herencia ESTRICTA del "Turno Anterior" — cadena fija por número de
  // turno, no "el último cerrado cronológicamente":
  //   T1 de la fecha D → T3 de la fecha (D-1)
  //   T2 de la fecha D → T1 de la fecha D
  //   T3 de la fecha D → T2 de la fecha D
  let anteriorCerrado;
  if (turnoDeLaCadena === 'T2') anteriorCerrado = buscarTurnoPorFecha(sucursal, fecha, 'T1');
  else if (turnoDeLaCadena === 'T3') anteriorCerrado = buscarTurnoPorFecha(sucursal, fecha, 'T2');
  else anteriorCerrado = buscarTurnoPorFecha(sucursal, fechaMenosDias(fecha, 1), 'T3');

  const bodega = db.bodegas[sucursal];
  const sistema = db.sistemaTeorico[sucursal];

  const filas = [];
  CATEGORIAS.forEach(cat => CATALOGOS[cat].forEach(item => {
    const f = (v) => cat === 'papeleria' ? aplicarFactorPaqueteLider(v, item) : Number(v || 0);
    const turnoAnterior = f(anteriorCerrado ? anteriorCerrado.cierre.entrego[cat][item] : 0);
    const recibo = f(actual ? actual.modulos[cat].recibo[item] : 0);
    const meSurten = f(actual ? actual.meSurten[cat][item] : 0);
    const vendido = f(actual && actual.cierre.completo ? actual.cierre.vendido[cat][item] : 0);
    const stockBodega = f(bodega[cat][item]);
    // Fórmula obligatoria, encadenada en 3 pasos (ya NO se lee "Entregó" del
    // cierre guardado — se deriva aquí mismo, para no duplicar el inventario
    // sumando a la vez el recibo inicial y el conteo final de piso):
    //   1) Entregó      = Recibo + Me Surten - Vendido
    //   2) Total Físico = Entregó + Bodega
    const entrego = recibo + meSurten - vendido;
    const totalFisico = entrego + stockBodega;
    // El "Sistema" lo teclea el líder ya en unidades reales (hojas), por lo
    // que aquí NUNCA se multiplica — solo se multiplican los datos que vienen
    // del conteo por paquete de colaboradores.
    const sist = Number(sistema[cat][item] || 0);
    const diferencia = totalFisico - sist;
    filas.push({ categoria: cat, categoriaLabel: NOMBRE_CATEGORIA[cat], item, turnoAnterior, recibo, meSurten, vendido, entrego, bodega: stockBodega, totalFisico, sistema: sist, diferencia, esPaquete: ITEMS_PAQUETE_LIDER.includes(item) });
  }));

  return { sucursal, fecha, turno: turnoDeLaCadena, turnoActualId: actual ? actual.id : null, turnoActualEstado: actual ? actual.estado : null, turnoActualTurno: actual ? actual.turno : null, filas };
}

app.get('/api/panel/auditoria-inventario/:sucursal', requiereLider, requiereAccesoSucursal, (req, res) => {
  const sucursal = req.params.sucursal;
  const fecha = req.query.fecha || fechaOperativaActual();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'Fecha inválida, usa formato YYYY-MM-DD.' });
  const turno = req.query.turno || 'T1';
  if (!TURNOS_DISPONIBLES.includes(turno)) return res.status(400).json({ error: 'Turno inválido, usa T1, T2 o T3.' });

  const vista = construirAuditoriaInventario(sucursal, fecha, turno);
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, sucursal, `${req.session.lider.nombre} auditó la sucursal ${sucursal} (${fecha}, ${turno})`);
  res.json(vista);
});

// Archiva (guarda un "snapshot" congelado) de la vista de Piso, Bodega y
// Sistema tal como está en el momento de guardar, para consulta histórica.
// No modifica bodega/sistema/turnos — solo copia lo que ya se estaba viendo.
app.post('/api/panel/auditoria-inventario/:sucursal/archivar', requiereLider, requiereAccesoSucursal, (req, res) => {
  const sucursal = req.params.sucursal;
  const fecha = req.body.fecha || fechaOperativaActual();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'Fecha inválida, usa formato YYYY-MM-DD.' });
  const turno = req.body.turno && TURNOS_DISPONIBLES.includes(req.body.turno) ? req.body.turno : null;

  const vista = construirAuditoriaInventario(sucursal, fecha, turno);
  const revision = {
    id: db.nextId++,
    sucursal, fecha,
    guardadoPor: req.session.lider.nombre,
    rolGuardo: req.session.lider.rol,
    guardadoEn: new Date().toISOString(),
    turnoActualId: vista.turnoActualId, turnoActualEstado: vista.turnoActualEstado, turnoActualTurno: vista.turnoActualTurno,
    filas: vista.filas
  };
  db.revisionesArchivadas.unshift(revision);
  guardar();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, sucursal, `${req.session.lider.nombre} archivó la revisión de Piso, Bodega y Sistema de ${sucursal} (${fecha})`);
  res.json({ mensaje: 'Revisión archivada correctamente.', revision });
});

app.get('/api/panel/auditoria-inventario/:sucursal/archivadas', requiereLider, requiereAccesoSucursal, (req, res) => {
  const sucursal = req.params.sucursal;
  let lista = db.revisionesArchivadas.filter(r => r.sucursal === sucursal);
  if (req.query.fecha) lista = lista.filter(r => r.fecha === req.query.fecha);
  res.json(lista);
});

app.post('/api/panel/sistema', requiereLider, requiereAccesoSucursal, (req, res) => {
  const { sucursal, categoria, item, cantidad } = req.body;
  if (!CATEGORIAS.includes(categoria) || !CATALOGOS[categoria].includes(item)) return res.status(400).json({ error: 'Insumo inválido.' });
  const val = Number(cantidad);
  db.sistemaTeorico[sucursal][categoria][item] = Number.isFinite(val) ? val : 0;
  guardar();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, sucursal, `${req.session.lider.nombre} ajustó el inventario teórico de "${item}" en ${sucursal}`);
  res.json({ sucursal, categoria, item, cantidad: db.sistemaTeorico[sucursal][categoria][item] });
});

// ------------------------------------------
// C. Comparaciones entre turnos (Termino Tn vs Empezó Tn+1)
// ------------------------------------------
app.get('/api/panel/comparaciones/:sucursal', requiereLider, requiereAccesoSucursal, (req, res) => {
  const sucursal = req.params.sucursal;
  const categoria = req.query.categoria || 'papeleria';
  const fecha = req.query.fecha || fechaOperativaActual();
  if (!CATEGORIAS.includes(categoria)) return res.status(400).json({ error: 'Categoría inválida.' });

  const fechaAnterior = fechaMenosDias(fecha, 1);
  const t3Prev = buscarTurnoPorFecha(sucursal, fechaAnterior, 'T3');
  const t1 = buscarTurnoPorFecha(sucursal, fecha, 'T1');
  const t2 = buscarTurnoPorFecha(sucursal, fecha, 'T2');
  const t3 = buscarTurnoPorFecha(sucursal, fecha, 'T3');

  const entrego = (t) => (t && t.cierre.completo) ? t.cierre.entrego[categoria] : null;
  const recibo = (t) => t ? t.modulos[categoria].recibo : null;

  const terminoT3prev = entrego(t3Prev), empezoT1 = recibo(t1), terminoT1 = entrego(t1);
  const empezoT2 = recibo(t2), terminoT2 = entrego(t2), empezoT3 = recibo(t3);

  const filas = CATALOGOS[categoria].map(item => {
    const g = (obj) => obj ? Number(obj[item] || 0) : null;
    const vT3prev = g(terminoT3prev), vEmpT1 = g(empezoT1), vTerT1 = g(terminoT1);
    const vEmpT2 = g(empezoT2), vTerT2 = g(terminoT2), vEmpT3 = g(empezoT3);
    const diff = (a, b) => (a === null || b === null) ? null : (a - b);
    return {
      item,
      terminoT3anterior: vT3prev, empezoT1: vEmpT1, terminoT1: vTerT1,
      empezoT2: vEmpT2, terminoT2: vTerT2, empezoT3: vEmpT3,
      diferenciaT1: diff(vEmpT1, vT3prev), diferenciaT2: diff(vEmpT2, vTerT1), diferenciaT3: diff(vEmpT3, vTerT2)
    };
  });

  res.json({ sucursal, categoria, fecha, fechaAnterior, filas });
});

// ------------------------------------------
// INVENTARIOS AUTOMÁTICOS (líderes) — misma lógica, cualquier sucursal,
// y con el factor ×500 aplicado a los paquetes de hoja en Papelería.
// ------------------------------------------
app.get('/api/panel/inventarios/:sucursal/:categoria', requiereLider, requiereAccesoSucursal, async (req, res) => {
  const { sucursal, categoria } = req.params;
  if (!['papeleria', 'snack', 'novedades', 'limpieza'].includes(categoria)) {
    return res.status(400).json({ error: 'Categoría de inventario inválida.' });
  }

  try {
    let items, valores = null;
    if (categoria === 'limpieza') {
      items = CATALOGO_LIMPIEZA;
      valores = null;
    } else {
      items = CATALOGOS[categoria];
      const t1 = turnoT1DeHoy(sucursal);
      valores = {};
      items.forEach(item => {
        let cantidad;
        if (categoria === 'papeleria') {
          const bodega = Number(db.bodegas[sucursal].papeleria[item] || 0);
          const entrego = (t1 && t1.cierre.completo) ? Number(t1.cierre.entrego.papeleria[item] || 0) : 0;
          cantidad = bodega + entrego;
        } else {
          cantidad = t1 ? Number(t1.modulos[categoria].recibo[item] || 0) : 0;
        }
        valores[item] = categoria === 'papeleria' ? aplicarFactorPaqueteLider(cantidad, item) : cantidad;
      });
    }

    const { buffer, nombreArchivo } = await generarInventarioXlsx({ categoria, sucursal, items, valores });
    registrarEvento(req.session.lider.rol, req.session.lider.nombre, sucursal, `${req.session.lider.nombre} generó el inventario de ${categoria} para ${sucursal}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nombreArchivo)}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo generar el inventario: ' + err.message });
  }
});

// Iniciar servidor
// ==========================================
// GESTIÓN DE PERSONAL (solo Admins) — CRUD sobre users.json
// ==========================================
app.get('/api/panel/usuarios', requiereAdmin, (req, res) => {
  const usuarios = cargarUsuarios().map(u => ({
    nombre: u.nombre, rol: u.rol,
    sucursales: u.sucursales.slice().sort((a, b) => a.localeCompare(b, 'es'))
  }));
  res.json(usuarios);
});

app.post('/api/panel/usuarios', requiereAdmin, (req, res) => {
  const { nombre, password, rol, sucursales } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Escribe un nombre.' });
  if (!password || !password.trim()) return res.status(400).json({ error: 'Escribe una contraseña.' });
  if (!['operativo', 'lider'].includes(rol)) return res.status(400).json({ error: 'Rol inválido (debe ser operativo o lider).' });
  const sucursalesLimpias = Array.isArray(sucursales) ? sucursales.filter(s => SUCURSALES.includes(s)) : [];

  const usuarios = cargarUsuarios();
  if (usuarios.some(u => u.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Ya existe un usuario con ese nombre.' });
  }
  usuarios.push({ nombre: nombre.trim(), password: password.trim(), rol, sucursales: sucursalesLimpias });
  guardarUsuarios(usuarios);
  registrarEvento('admin', req.session.lider.nombre, null, `${req.session.lider.nombre} creó el usuario ${nombre.trim()} (${rol})`);
  res.json({ mensaje: 'Usuario creado correctamente.' });
});

app.put('/api/panel/usuarios/:nombre/password', requiereAdmin, (req, res) => {
  const { password } = req.body;
  if (!password || !password.trim()) return res.status(400).json({ error: 'Escribe una contraseña.' });
  const usuarios = cargarUsuarios();
  const u = usuarios.find(x => x.nombre.toLowerCase() === req.params.nombre.toLowerCase());
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado.' });
  u.password = password.trim();
  guardarUsuarios(usuarios);
  registrarEvento('admin', req.session.lider.nombre, null, `${req.session.lider.nombre} cambió la contraseña de ${u.nombre}`);
  res.json({ mensaje: 'Contraseña actualizada correctamente.' });
});

app.put('/api/panel/usuarios/:nombre/sucursales', requiereAdmin, (req, res) => {
  const { sucursales } = req.body;
  if (!Array.isArray(sucursales)) return res.status(400).json({ error: 'Formato de sucursales inválido.' });
  const sucursalesLimpias = sucursales.filter(s => SUCURSALES.includes(s));
  const usuarios = cargarUsuarios();
  const u = usuarios.find(x => x.nombre.toLowerCase() === req.params.nombre.toLowerCase());
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado.' });
  u.sucursales = sucursalesLimpias;
  guardarUsuarios(usuarios);
  registrarEvento('admin', req.session.lider.nombre, null, `${req.session.lider.nombre} actualizó las sucursales asignadas a ${u.nombre}`);
  res.json({ mensaje: 'Sucursales actualizadas correctamente.', sucursales: sucursalesLimpias });
});

app.delete('/api/panel/usuarios/:nombre', requiereAdmin, (req, res) => {
  const usuarios = cargarUsuarios();
  const idx = usuarios.findIndex(x => x.nombre.toLowerCase() === req.params.nombre.toLowerCase());
  if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const [eliminado] = usuarios.splice(idx, 1);
  guardarUsuarios(usuarios);
  registrarEvento('admin', req.session.lider.nombre, null, `${req.session.lider.nombre} eliminó el usuario ${eliminado.nombre}`);
  res.json({ mensaje: 'Usuario eliminado correctamente.' });
});

app.get('/api/panel/sucursales-catalogo', requiereAdmin, (req, res) => res.json(SUCURSALES));

// ------------------------------------------
// GESTIÓN DE CATÁLOGOS (exclusivo admin)
// ------------------------------------------
// Si se agrega un insumo nuevo a papelería/snack/novedades, hay que crearle
// la llave (en 0) en la bodega y el sistema teórico de TODAS las sucursales
// — si no, "Me surten"/"Entrada a Bodega" lo verían como undefined.
function sincronizarBodegaYSistemaConCatalogo(cat) {
  if (!CATEGORIAS.includes(cat)) return;
  SUCURSALES.forEach(s => {
    CATALOGOS[cat].forEach(item => {
      if (db.bodegas[s][cat][item] === undefined) db.bodegas[s][cat][item] = 0;
      if (db.sistemaTeorico[s][cat][item] === undefined) db.sistemaTeorico[s][cat][item] = 0;
    });
  });
}

app.get('/api/catalogos', (req, res) => {
  res.json({ papeleria: CATALOGOS.papeleria, snack: CATALOGOS.snack, novedades: CATALOGOS.novedades, limpieza: CATALOGO_LIMPIEZA, sistemas: CATALOGO_SISTEMAS });
});

// --- Catálogos "simples" (papelería, snack, novedades, limpieza): arreglo plano de nombres ---
app.post('/api/catalogos/:categoria', requiereAdmin, (req, res) => {
  const lista = CATALOGOS_SIMPLES[req.params.categoria];
  if (!lista) return res.status(400).json({ error: 'Categoría de catálogo inválida.' });
  const nombre = (req.body.nombre || '').toString().trim().toUpperCase();
  if (!nombre) return res.status(400).json({ error: 'Escribe un nombre para el insumo.' });
  if (lista.includes(nombre)) return res.status(400).json({ error: 'Ese insumo ya existe en el catálogo.' });

  lista.push(nombre);
  sincronizarBodegaYSistemaConCatalogo(req.params.categoria);
  guardarCatalogos();
  guardar();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, null, `${req.session.lider.nombre} agregó "${nombre}" al catálogo de ${req.params.categoria}`);
  res.json({ mensaje: 'Insumo agregado correctamente.', catalogo: lista });
});

app.put('/api/catalogos/:categoria/:item', requiereAdmin, (req, res) => {
  const { categoria } = req.params;
  const item = decodeURIComponent(req.params.item);
  const lista = CATALOGOS_SIMPLES[categoria];
  if (!lista) return res.status(400).json({ error: 'Categoría de catálogo inválida.' });
  const idx = lista.indexOf(item);
  if (idx === -1) return res.status(404).json({ error: 'Ese insumo no existe en el catálogo.' });
  const nuevoNombre = (req.body.nombre || '').toString().trim().toUpperCase();
  if (!nuevoNombre) return res.status(400).json({ error: 'Escribe un nombre válido.' });
  if (nuevoNombre !== item && lista.includes(nuevoNombre)) return res.status(400).json({ error: 'Ya existe un insumo con ese nombre.' });

  lista[idx] = nuevoNombre;
  // Migra las cantidades VIVAS (bodega/sistema actuales) del nombre viejo al
  // nuevo en todas las sucursales para no perder stock ya contado. El
  // histórico de turnos ya cerrados conserva el nombre viejo tal cual: es
  // una fotografía congelada del momento en que se guardó, y no se toca.
  if (CATEGORIAS.includes(categoria) && nuevoNombre !== item) {
    SUCURSALES.forEach(s => {
      const b = db.bodegas[s][categoria], st = db.sistemaTeorico[s][categoria];
      if (b && item in b) { b[nuevoNombre] = b[item]; delete b[item]; }
      if (st && item in st) { st[nuevoNombre] = st[item]; delete st[item]; }
    });
  }
  guardarCatalogos();
  guardar();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, null, `${req.session.lider.nombre} renombró "${item}" a "${nuevoNombre}" en el catálogo de ${categoria}`);
  res.json({ mensaje: 'Insumo actualizado correctamente.', catalogo: lista });
});

app.delete('/api/catalogos/:categoria/:item', requiereAdmin, (req, res) => {
  const { categoria } = req.params;
  const item = decodeURIComponent(req.params.item);
  const lista = CATALOGOS_SIMPLES[categoria];
  if (!lista) return res.status(400).json({ error: 'Categoría de catálogo inválida.' });
  const idx = lista.indexOf(item);
  if (idx === -1) return res.status(404).json({ error: 'Ese insumo no existe en el catálogo.' });

  // Solo se quita del catálogo (deja de aparecer en formularios nuevos). NO
  // se borran cantidades ya guardadas en bodega/sistema/turnos históricos:
  // quedan huérfanas pero intactas, por si se necesita auditar después.
  lista.splice(idx, 1);
  guardarCatalogos();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, null, `${req.session.lider.nombre} eliminó "${item}" del catálogo de ${categoria}`);
  res.json({ mensaje: 'Insumo eliminado correctamente.', catalogo: lista });
});

// --- Catálogo de Sistemas (cascada: categoría → lista de problemas) ---
app.post('/api/catalogos/sistemas', requiereAdmin, (req, res) => {
  const categoria = (req.body.categoria || '').toString().trim().toUpperCase();
  if (!categoria) return res.status(400).json({ error: 'Escribe un nombre de categoría.' });
  if (CATALOGO_SISTEMAS[categoria]) return res.status(400).json({ error: 'Esa categoría ya existe.' });
  const problemas = Array.isArray(req.body.problemas) ? req.body.problemas.map(p => p.toString().trim().toUpperCase()).filter(Boolean) : [];

  CATALOGO_SISTEMAS[categoria] = problemas;
  guardarCatalogos();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, null, `${req.session.lider.nombre} agregó la categoría de Sistemas "${categoria}"`);
  res.json({ mensaje: 'Categoría agregada correctamente.', catalogoSistemas: CATALOGO_SISTEMAS });
});

app.put('/api/catalogos/sistemas/:categoria', requiereAdmin, (req, res) => {
  const categoria = decodeURIComponent(req.params.categoria);
  if (!CATALOGO_SISTEMAS[categoria]) return res.status(404).json({ error: 'Esa categoría no existe.' });

  if (Array.isArray(req.body.problemas)) {
    CATALOGO_SISTEMAS[categoria] = req.body.problemas.map(p => p.toString().trim().toUpperCase()).filter(Boolean);
  }
  const nuevoNombre = (req.body.nuevoNombre || '').toString().trim().toUpperCase();
  if (nuevoNombre && nuevoNombre !== categoria) {
    if (CATALOGO_SISTEMAS[nuevoNombre]) return res.status(400).json({ error: 'Ya existe una categoría con ese nombre.' });
    CATALOGO_SISTEMAS[nuevoNombre] = CATALOGO_SISTEMAS[categoria];
    delete CATALOGO_SISTEMAS[categoria];
  }
  guardarCatalogos();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, null, `${req.session.lider.nombre} editó la categoría de Sistemas "${categoria}"`);
  res.json({ mensaje: 'Categoría actualizada correctamente.', catalogoSistemas: CATALOGO_SISTEMAS });
});

app.delete('/api/catalogos/sistemas/:categoria', requiereAdmin, (req, res) => {
  const categoria = decodeURIComponent(req.params.categoria);
  if (!CATALOGO_SISTEMAS[categoria]) return res.status(404).json({ error: 'Esa categoría no existe.' });

  delete CATALOGO_SISTEMAS[categoria];
  guardarCatalogos();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, null, `${req.session.lider.nombre} eliminó la categoría de Sistemas "${categoria}"`);
  res.json({ mensaje: 'Categoría eliminada correctamente.', catalogoSistemas: CATALOGO_SISTEMAS });
});

// ==========================================
// PANEL DE MONITOREO EN TIEMPO REAL ("Ojo de Dios", solo Admins)
// ==========================================
app.get('/api/actividad', requiereAdmin, (req, res) => {
  const categoria = (req.query.categoria || '').toLowerCase(); // colaboradores | lideres | operativos
  const mapaRol = { colaboradores: 'colaborador', lideres: 'lider', operativos: 'operativo' };
  let lista = logs;
  if (mapaRol[categoria]) lista = lista.filter(l => l.rol === mapaRol[categoria]);
  const limite = Math.min(Number(req.query.limite) || 100, LOGS_MAX);
  res.json(lista.slice(0, limite));
});

// ==========================================
// REPORTES DE SUCURSAL (tickets de mantenimiento)
// ==========================================
app.post('/api/reportes', requiereSesionCualquiera, (req, res) => {
  const { autor, rol, sucursalFija, sucursalesPermitidas } = req.identidadReporte;
  const { sucursal, departamento, categoriaSistemas, problemaSistemas, descripcion } = req.body;

  const sucursalFinal = sucursalFija || sucursal;
  if (!SUCURSALES.includes(sucursalFinal)) return res.status(400).json({ error: 'Sucursal inválida.' });
  if (!sucursalesPermitidas.includes(sucursalFinal)) return res.status(403).json({ error: 'No tienes acceso a esa sucursal.' });
  if (!DEPARTAMENTOS_REPORTE.includes(departamento)) return res.status(400).json({ error: 'Departamento inválido.' });

  let catSistemas = null, probSistemas = null;
  if (departamento === 'SISTEMAS') {
    if (!CATALOGO_SISTEMAS[categoriaSistemas]) return res.status(400).json({ error: 'Categoría de Sistemas inválida.' });
    if (!CATALOGO_SISTEMAS[categoriaSistemas].includes(problemaSistemas)) return res.status(400).json({ error: 'Problema de Sistemas inválido para esa categoría.' });
    catSistemas = categoriaSistemas;
    probSistemas = problemaSistemas;
  }

  const nuevoReporte = {
    id: Date.now(),
    fecha: new Date().toISOString(),
    sucursal: sucursalFinal,
    autor, rolAutor: rol,
    departamento,
    categoriaSistemas: catSistemas,
    problemaSistemas: probSistemas,
    descripcion: (descripcion || '').toString(),
    estado: 'pendiente'
  };
  reportes.unshift(nuevoReporte);
  guardarReportes();
  registrarEvento(rol, autor, sucursalFinal, `${autor} registró un reporte de ${departamento} en ${sucursalFinal}`);
  res.json({ mensaje: 'Reporte registrado correctamente.', reporte: nuevoReporte });
});

app.get('/api/reportes', requiereSesionCualquiera, (req, res) => {
  const { sucursalesPermitidas } = req.identidadReporte;
  const soloPendientes = req.query.estado !== 'todos';
  let lista = reportes.filter(r => sucursalesPermitidas.includes(r.sucursal));
  if (soloPendientes) lista = lista.filter(r => r.estado === 'pendiente');
  res.json(lista);
});

app.put('/api/reportes/:id/resolver', requiereSesionCualquiera, (req, res) => {
  const { sucursalesPermitidas, autor } = req.identidadReporte;
  const r = reportes.find(x => x.id === Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Reporte no encontrado.' });
  if (!sucursalesPermitidas.includes(r.sucursal)) return res.status(403).json({ error: 'No tienes acceso a esta sucursal.' });
  r.estado = 'resuelto';
  r.resueltoPor = autor;
  r.fechaResuelto = new Date().toISOString();
  guardarReportes();
  res.json({ mensaje: 'Reporte marcado como resuelto.', reporte: r });
});

// ==========================================
// REGISTRO DE TICKETS i24h
// ==========================================
// Cada ticket queda relacionado con el turno/sesión que lo originó
// (turnoAbiertoOCrear), igual que el resto de acciones del colaborador.
// El líder/operativo/admin consulta y edita reutilizando el mismo esquema
// de permisos por sucursal que ya usa Gestión de Turnos/Reportes.
function validarNumeroEntero(v) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

app.post('/api/tickets-i24h', requiereColaborador, (req, res) => {
  const { sucursal, nombre, turno } = req.session.colaborador;
  const { numeroTicket, cantidad, concepto } = req.body;

  const numTicket = validarNumeroEntero(numeroTicket);
  if (numTicket === null) return res.status(400).json({ error: 'Número de ticket inválido: solo números enteros positivos.' });
  const numCantidad = validarNumeroEntero(cantidad);
  if (numCantidad === null) return res.status(400).json({ error: 'Cantidad inválida: solo números enteros positivos (mayor a 0).' });
  const conceptoLimpio = (concepto || '').toString().trim();
  if (!conceptoLimpio) return res.status(400).json({ error: 'Escribe un concepto para el ticket.' });
  if (conceptoLimpio.length > 200) return res.status(400).json({ error: 'El concepto es demasiado largo (máx. 200 caracteres).' });

  const t = turnoAbiertoOCrear(sucursal, turno, nombre);

  const yaExiste = db.ticketsI24h.some(tk => tk.turnoId === t.id && tk.numeroTicket === numTicket);
  if (yaExiste) return res.status(400).json({ error: 'Este número de ticket ya fue registrado en esta sesión.' });

  const nuevoTicket = {
    id: db.nextId++,
    turnoId: t.id,
    sucursal, turno, colaborador: nombre, fecha: t.fecha,
    numeroTicket: numTicket,
    cantidad: numCantidad,
    concepto: conceptoLimpio,
    fechaRegistro: new Date().toISOString()
  };
  db.ticketsI24h.unshift(nuevoTicket);
  guardar();
  registrarEvento('colaborador', nombre, sucursal, `${nombre} registró el ticket i24h #${numTicket} en ${sucursal}`, turno);
  res.json({ mensaje: 'Ticket i24h registrado correctamente.', ticket: nuevoTicket });
});

app.get('/api/panel/tickets-i24h', requiereLider, (req, res) => {
  const permitidas = sucursalesDeSesion(req.session.lider);
  let lista = db.ticketsI24h.filter(tk => permitidas.includes(tk.sucursal));

  const { sucursal, fecha, colaborador, turno, numeroTicket } = req.query;
  if (sucursal) lista = lista.filter(tk => tk.sucursal === sucursal);
  if (fecha) lista = lista.filter(tk => tk.fecha === fecha);
  if (turno) lista = lista.filter(tk => tk.turno === turno);
  if (colaborador) {
    const q = colaborador.trim().toLowerCase();
    lista = lista.filter(tk => tk.colaborador.toLowerCase().includes(q));
  }
  if (numeroTicket) {
    const q = String(numeroTicket).trim();
    lista = lista.filter(tk => String(tk.numeroTicket).includes(q));
  }

  const totalCantidad = lista.reduce((acc, tk) => acc + tk.cantidad, 0);
  res.json({ tickets: lista, totales: { registros: lista.length, cantidad: totalCantidad } });
});

app.put('/api/panel/tickets-i24h/:id', requiereLider, (req, res) => {
  const tk = db.ticketsI24h.find(x => x.id === Number(req.params.id));
  if (!tk) return res.status(404).json({ error: 'Ticket no encontrado.' });
  if (!tieneAccesoSucursal(req.session.lider, tk.sucursal)) return res.status(403).json({ error: 'No tienes acceso a esta sucursal.' });

  const { numeroTicket, cantidad, concepto } = req.body;
  if (numeroTicket !== undefined) {
    const numTicket = validarNumeroEntero(numeroTicket);
    if (numTicket === null) return res.status(400).json({ error: 'Número de ticket inválido: solo números enteros positivos.' });
    const duplicado = db.ticketsI24h.some(x => x.id !== tk.id && x.turnoId === tk.turnoId && x.numeroTicket === numTicket);
    if (duplicado) return res.status(400).json({ error: 'Este número de ticket ya fue registrado en esta sesión.' });
    tk.numeroTicket = numTicket;
  }
  if (cantidad !== undefined) {
    const numCantidad = validarNumeroEntero(cantidad);
    if (numCantidad === null) return res.status(400).json({ error: 'Cantidad inválida: solo números enteros positivos (mayor a 0).' });
    tk.cantidad = numCantidad;
  }
  if (concepto !== undefined) {
    const conceptoLimpio = concepto.toString().trim();
    if (!conceptoLimpio) return res.status(400).json({ error: 'Escribe un concepto para el ticket.' });
    if (conceptoLimpio.length > 200) return res.status(400).json({ error: 'El concepto es demasiado largo (máx. 200 caracteres).' });
    tk.concepto = conceptoLimpio;
  }

  guardar();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, tk.sucursal, `${req.session.lider.nombre} editó el ticket i24h #${tk.numeroTicket} de ${tk.sucursal}`, tk.turno);
  res.json({ mensaje: 'Ticket actualizado correctamente.', ticket: tk });
});

app.delete('/api/panel/tickets-i24h/:id', requiereLider, (req, res) => {
  const tk = db.ticketsI24h.find(x => x.id === Number(req.params.id));
  if (!tk) return res.status(404).json({ error: 'Ticket no encontrado.' });
  if (!tieneAccesoSucursal(req.session.lider, tk.sucursal)) return res.status(403).json({ error: 'No tienes acceso a esta sucursal.' });

  db.ticketsI24h = db.ticketsI24h.filter(x => x.id !== tk.id);
  guardar();
  registrarEvento(req.session.lider.rol, req.session.lider.nombre, tk.sucursal, `${req.session.lider.nombre} eliminó el ticket i24h #${tk.numeroTicket} de ${tk.sucursal}`, tk.turno);
  res.json({ mensaje: 'Ticket eliminado correctamente.' });
});

app.listen(PORT, () => {
  console.log(`Sistema Operativo i24h corriendo en http://localhost:${PORT}`);
});
