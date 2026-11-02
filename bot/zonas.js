// Zonas y árboles protegidos (pedido del usuario): los personajes no los talan ni, si la zona es «vedada», entran en ella.
// Se guardan en zonas.json de los datos del mundo (bot/mundo.js: ../zonas.json en el del usuario) y se releen solos cuando el
// archivo cambia (sin reiniciar los bots).
// Además, el navegador nunca rompe troncos (solo los pica quien decide picar: picar_tronco, la orden cerebro, talar) ni cofres
// (los de cofres.json por su sitio, y cualquier cofre o barril por su tipo).
//   zona:  { nombre, x1, z1, x2, z2, y1?, y2?, modo: 'vedada' | 'no_talar' | 'trabajo' | 'hogar' }   (rectángulo en x/z; y opcional)
//   árbol: { nombre, x, y, z }  (un tronco concreto; no se tala)
// Zonas de trabajo (pedido del usuario, 2026-10-31): lo contrario de las vedadas. Si hay alguna, talar, picar y poner solo se
// hacen dentro de alguna de ellas (fuera, todo cuenta como protegido); andar sigue libre. Las vedadas y no_talar mandan también
// dentro. Sin zonas de trabajo, todo como antes.
// Zonas de hogar (pedido del usuario, 2026-11-02): la casa de los personajes. Se pisan y se usan (dormir, cofres, craftear, fundir,
// cosechar, depositar), pero no se rompe nada dentro (como no_talar, también minar y picar); poner sí (cama, mesa, cofre, antorcha), también
// con zonas de trabajo que la dejen fuera.
// Alcance individual (2026-11-02): cada dueño (primero de IO_AMOS) tiene su propio zonas_<dueno>.json en la carpeta de datos del mundo; sin
// archivo de dueño aún se lee el zonas.json de antes (una vez, hasta el primer cambio, que ya escribe el del dueño). Sin dueño, el de siempre.
const fs = require('fs')
const path = require('path')
const cofres = require('./cofres')
const mundo = require('./mundo')
const alcance = require('./alcance')
const DUENO = alcance.duenoDe((process.env.IO_AMOS || '').split(',').map(s => s.trim()).filter(Boolean))
const HEREDADA = mundo.zonas
const RUTA = DUENO ? path.join(mundo.carpetaDatos, `zonas_${alcance.seguro(DUENO)}.json`) : HEREDADA
const VACIO = () => ({ zonas: [], arboles: [] })
let cache = { marca: null, datos: VACIO() }

function leer() {
  try {
    let ruta = RUTA, st
    try { st = fs.statSync(ruta) } catch (_) { ruta = HEREDADA; st = fs.statSync(ruta) }
    const marca = `${ruta}:${st.mtimeMs}`
    if (marca !== cache.marca) cache = { marca, datos: Object.assign(VACIO(), JSON.parse(fs.readFileSync(ruta, 'utf8'))) }
  } catch (_) { cache = { marca: null, datos: VACIO() } }
  return cache.datos
}
function guardar(d) {
  const tmp = `${RUTA}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(d, null, 1) + '\n'); fs.renameSync(tmp, RUTA); cache.marca = null
}

const dentro = (zn, x, y, z) => x >= zn.x1 && x <= zn.x2 && z >= zn.z1 && z <= zn.z2 && (zn.y1 == null || (y >= zn.y1 && y <= zn.y2))
const esTrabajo = (zn) => zn.modo === 'trabajo'
const esVedada = (zn) => (zn.modo || 'vedada') === 'vedada'
const esHogar = (zn) => zn.modo === 'hogar'
const FUERA_DE_TRABAJO = 'fuera de la zona de trabajo'
const trabajo = () => leer().zonas.filter(esTrabajo)
// ¿Hay zonas de trabajo y (x, y, z) no cae en ninguna?
function fueraDeTrabajo(x, y, z) { const t = trabajo(); return t.length > 0 && !t.some(zn => dentro(zn, x, y, z)) }
// ¿Qué protege este bloque de la tala? El nombre de la zona (vedada o no_talar), del árbol marcado o FUERA_DE_TRABAJO; null si nada.
// poner: true = para colocar un bloque en una casilla vacía: el hogar no lo impide (ni la zona de trabajo, dentro de él).
function protegidoPor(x, y, z, { poner = false } = {}) {
  const d = leer()
  const zn = d.zonas.find(zn => !esTrabajo(zn) && !(poner && esHogar(zn)) && dentro(zn, x, y, z))
  if (zn) return zn.nombre
  const a = d.arboles.find(a => a.x === x && a.y === y && a.z === z)
  if (a) return a.nombre
  if (poner && d.zonas.some(zn => esHogar(zn) && dentro(zn, x, y, z))) return null
  return fueraDeTrabajo(x, y, z) ? FUERA_DE_TRABAJO : null
}
const talaProtegida = (x, y, z) => protegidoPor(x, y, z) !== null
const ponerProtegido = (x, y, z) => protegidoPor(x, y, z, { poner: true }) !== null
// ¿Se puede pisar esta casilla? Solo las zonas vedadas lo impiden.
function pasoVedado(x, y, z) { return leer().zonas.some(zn => esVedada(zn) && dentro(zn, x, y, z)) }

// Si (x, z) cae en una zona vedada, la casilla de fuera más cercana (a 1 bloque del borde, que no caiga en otra zona vedada) y el
// nombre de la zona; si no, la misma casilla. Para ir hacia alguien que está dentro sin entrar (ir_a_jugador, «ven», «sígueme»).
function puntoFuera(x, z) {
  const vedadas = leer().zonas.filter(zn => esVedada(zn) && zn.y1 == null)
  const zn = vedadas.find(zn => dentro(zn, x, 0, z))
  if (!zn) return { x, z, zona: null }
  const libre = (p) => !vedadas.some(o => dentro(o, p.x, 0, p.z))
  const cand = [{ x: zn.x1 - 1, z }, { x: zn.x2 + 1, z }, { x, z: zn.z1 - 1 }, { x, z: zn.z2 + 1 },
    { x: zn.x1 - 1, z: zn.z1 - 1 }, { x: zn.x2 + 1, z: zn.z1 - 1 }, { x: zn.x1 - 1, z: zn.z2 + 1 }, { x: zn.x2 + 1, z: zn.z2 + 1 }]
    .filter(libre).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))
  return { ...(cand[0] || { x, z }), zona: zn.nombre }
}

// Enseña al navegador a no pisar zonas vedadas ni romper bloques protegidos, troncos ni cofres (coste ≥ 100: no los rompe).
const NO_ROMPER = /_(log|wood)$|^(chest|trapped_chest|barrel)$/
// pisarVedadas (2026-11-01, «defiéndeme»): el guardaespaldas entra en las vedadas a seguir y defender; romper sigue igual.
function aplicar(mov, { pisarVedadas = false } = {}) {
  for (const b of mov.bot.registry.blocksArray) if (NO_ROMPER.test(b.name)) mov.blocksCantBreak.add(b.id)
  // F8.1: el navegador a veces pasa un bloque sin posición (chunk sin cargar) y la excepción tumbaba el proceso de los cuatro bots
  // 2026-11-02: las enredaderas (bayas luminosas, lloronas, retorcidas) se trepan en el juego, pero la física de mineflayer no lo sabe (solo
  // ladder, vine y scaffolding): dentro de ellas el bot cae como si no estuviera y el server lo recoloca. Se rodean si se puede (coste, no veto).
  const vinas = new Set(['cave_vines', 'cave_vines_plant', 'weeping_vines', 'weeping_vines_plant', 'twisting_vines', 'twisting_vines_plant']
    .map(n => (mov.bot.registry.blocksByName || {})[n]).filter(Boolean).map(b => b.id))
  if (vinas.size) mov.exclusionAreasStep.push(b => (b && vinas.has(b.type) ? 25 : 0))
  if (!pisarVedadas) mov.exclusionAreasStep.push(b => (b && b.position && pasoVedado(b.position.x, b.position.y, b.position.z) ? 1000 : 0))
  mov.exclusionAreasBreak.push(b => (b && b.position && (talaProtegida(b.position.x, b.position.y, b.position.z) || cofres.esCofre(b.position.x, b.position.y, b.position.z)) ? 1000 : 0))
  return require('./puertas').aplicar(mov) // 2026-11-01: las puertas de madera son paso (las abre puertas.vigilar)
}

function zonaNueva(nombre, ax, az, bx, bz, modo = 'vedada') {
  const d = leer()
  d.zonas = d.zonas.filter(z => z.nombre !== nombre)
  d.zonas.push({ nombre, x1: Math.min(ax, bx), z1: Math.min(az, bz), x2: Math.max(ax, bx), z2: Math.max(az, bz), modo })
  guardar(d)
}
function arbolNuevo(nombre, x, y, z) {
  const d = leer()
  d.arboles = d.arboles.filter(a => a.nombre !== nombre && !(a.x === x && a.y === y && a.z === z))
  d.arboles.push({ nombre, x, y, z })
  guardar(d)
}
// Cambia el modo de una zona que ya existe (vedada → hogar…). true si estaba.
function cambiarModo(nombre, modo) {
  const d = leer(); const zn = d.zonas.find(z => z.nombre.toLowerCase() === String(nombre).toLowerCase())
  if (!zn) return false
  zn.modo = modo; guardar(d); return true
}
// Las zonas de hogar del dueño, y la que contiene (x, y, z) o la más cercana a (x, z) con su centro y su distancia (0 si está dentro).
const hogares = () => leer().zonas.filter(esHogar)
const hogarDe = (x, y, z) => hogares().find(zn => dentro(zn, x, y, z)) || null
function hogarCercano(x, z) {
  let mejor = null
  for (const zn of hogares()) {
    const d = Math.hypot(Math.max(zn.x1 - x, 0, x - zn.x2), Math.max(zn.z1 - z, 0, z - zn.z2))
    if (!mejor || d < mejor.dist) mejor = { zona: zn, dist: d, cx: (zn.x1 + zn.x2) / 2, cz: (zn.z1 + zn.z2) / 2 }
  }
  return mejor
}
function borrar(nombre) {
  const d = leer(); const n = d.zonas.length + d.arboles.length
  d.zonas = d.zonas.filter(z => z.nombre !== nombre); d.arboles = d.arboles.filter(a => a.nombre !== nombre)
  guardar(d); return n - d.zonas.length - d.arboles.length
}
function lista() {
  const d = leer()
  const tipo = (z) => (z.modo === 'no_talar' ? 'sin talar' : esTrabajo(z) ? 'de trabajo' : esHogar(z) ? 'hogar' : 'vedada')
  return [...d.zonas.map(z => `${z.nombre}: zona ${tipo(z)} x ${z.x1}..${z.x2}, z ${z.z1}..${z.z2}`),
    ...d.arboles.map(a => `${a.nombre}: árbol en ${a.x},${a.y},${a.z}`)]
}
module.exports = { leer, talaProtegida, ponerProtegido, protegidoPor, esHogar, hogares, hogarDe, hogarCercano, cambiarModo, DUENO, pasoVedado, puntoFuera, aplicar, zonaNueva, arbolNuevo, borrar, lista, RUTA, NO_ROMPER,
  trabajo, fueraDeTrabajo, esTrabajo, FUERA_DE_TRABAJO }
