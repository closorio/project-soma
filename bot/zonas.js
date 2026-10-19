// Zonas y árboles protegidos (pedido del usuario): los personajes no los talan ni, si la zona es «vedada», entran en ella.
// Se guardan en zonas.json de los datos del mundo (bot/mundo.js: ../zonas.json en el del usuario) y se releen solos cuando el
// archivo cambia (sin reiniciar los bots).
// Además, el navegador nunca rompe troncos (solo los pica quien decide picar: picar_tronco, la orden cerebro, talar) ni cofres
// (los de cofres.json por su sitio, y cualquier cofre o barril por su tipo).
//   zona:  { nombre, x1, z1, x2, z2, y1?, y2?, modo: 'vedada' | 'no_talar' }   (rectángulo en x/z; y opcional)
//   árbol: { nombre, x, y, z }  (un tronco concreto; no se tala)
const fs = require('fs')
const cofres = require('./cofres')
const mundo = require('./mundo')
const RUTA = mundo.zonas
const VACIO = () => ({ zonas: [], arboles: [] })
let cache = { mtime: -1, datos: VACIO() }

function leer() {
  try {
    const st = fs.statSync(RUTA)
    if (st.mtimeMs !== cache.mtime) cache = { mtime: st.mtimeMs, datos: Object.assign(VACIO(), JSON.parse(fs.readFileSync(RUTA, 'utf8'))) }
  } catch (_) { cache = { mtime: -1, datos: VACIO() } }
  return cache.datos
}
function guardar(d) { fs.writeFileSync(RUTA, JSON.stringify(d, null, 1) + '\n'); cache.mtime = -2 }

const dentro = (zn, x, y, z) => x >= zn.x1 && x <= zn.x2 && z >= zn.z1 && z <= zn.z2 && (zn.y1 == null || (y >= zn.y1 && y <= zn.y2))
// ¿Qué protege este bloque de la tala? El nombre de la zona (de cualquier modo) o del árbol marcado; null si nada.
function protegidoPor(x, y, z) {
  const d = leer()
  const zn = d.zonas.find(zn => dentro(zn, x, y, z))
  if (zn) return zn.nombre
  const a = d.arboles.find(a => a.x === x && a.y === y && a.z === z)
  return a ? a.nombre : null
}
const talaProtegida = (x, y, z) => protegidoPor(x, y, z) !== null
// ¿Se puede pisar esta casilla? Solo las zonas vedadas lo impiden.
function pasoVedado(x, y, z) { return leer().zonas.some(zn => zn.modo !== 'no_talar' && dentro(zn, x, y, z)) }

// Si (x, z) cae en una zona vedada, la casilla de fuera más cercana (a 1 bloque del borde, que no caiga en otra zona vedada) y el
// nombre de la zona; si no, la misma casilla. Para ir hacia alguien que está dentro sin entrar (ir_a_jugador, «ven», «sígueme»).
function puntoFuera(x, z) {
  const vedadas = leer().zonas.filter(zn => zn.modo !== 'no_talar' && zn.y1 == null)
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
function aplicar(mov) {
  for (const b of mov.bot.registry.blocksArray) if (NO_ROMPER.test(b.name)) mov.blocksCantBreak.add(b.id)
  mov.exclusionAreasStep.push(b => (pasoVedado(b.position.x, b.position.y, b.position.z) ? 1000 : 0))
  mov.exclusionAreasBreak.push(b => (talaProtegida(b.position.x, b.position.y, b.position.z) || cofres.esCofre(b.position.x, b.position.y, b.position.z) ? 1000 : 0))
  return mov
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
function borrar(nombre) {
  const d = leer(); const n = d.zonas.length + d.arboles.length
  d.zonas = d.zonas.filter(z => z.nombre !== nombre); d.arboles = d.arboles.filter(a => a.nombre !== nombre)
  guardar(d); return n - d.zonas.length - d.arboles.length
}
function lista() {
  const d = leer()
  return [...d.zonas.map(z => `${z.nombre}: zona ${z.modo === 'no_talar' ? 'sin talar' : 'vedada'} x ${z.x1}..${z.x2}, z ${z.z1}..${z.z2}`),
    ...d.arboles.map(a => `${a.nombre}: árbol en ${a.x},${a.y},${a.z}`)]
}
module.exports = { leer, talaProtegida, protegidoPor, pasoVedado, puntoFuera, aplicar, zonaNueva, arbolNuevo, borrar, lista, RUTA, NO_ROMPER }
