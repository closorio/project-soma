// Plantel de un mundo compartido (2026-11-02): mundos/<mundo>/jugadores/<jugador>.json, uno por jugador y en git. Cada uno escribe solo
// el suyo (sus bots y sus zonas con !zona), así que un pull junta los de todos sin choques. Lo leen el servidor (/connect, colores),
// conectar.sh y los bots de todos: qué bots son de quién y qué zonas hay que respetar.
//   { bots: [{ nombre, skin? }], zonas: [zona…], arboles: [árbol…], base?: "CASASOMA", lanzador?: "IP:puerto" }
// Las zonas de otro jugador cuentan para todos (vedadas, sin talar y árboles), salvo las de trabajo: esas solo limitan a los bots de su
// dueño. Un mundo sin carpeta jugadores/ (el del usuario, local, supervivencia) sigue con sus zonas.local.json (zonas.js).
// Quién soy: el primero de IO_DUENOS (local.mk) o de IO_AMOS (lo pone conectar.sh a cada bot que lanza).
const fs = require('fs')
const path = require('path')
const mundo = require('./mundo')

const P = module.exports = { DIR: path.join(mundo.carpetaDatos, 'jugadores') } // DIR se cambia en las pruebas
const NO_JUGADOR = /^EJEMPLO\.json$/i
const k = (n) => String(n || '').toLowerCase()

P.compartido = () => fs.existsSync(P.DIR)
P.yo = () => (process.env.IO_DUENOS || process.env.IO_AMOS || '').split(',').map(s => s.trim()).filter(Boolean)[0] || null

// Todos los jugadores: Map jugador → datos. Se relee solo si cambia algún archivo (mtime) o la lista de archivos, y el disco se mira
// como mucho una vez por segundo (las zonas se consultan en cada casilla que evalúa el navegador)
let cache = { firma: null, dir: null, t: 0, jugadores: new Map(), zonas: null }
P.leer = () => {
  if (cache.dir === P.DIR && cache.firma !== null && Date.now() - cache.t < 1000) return cache.jugadores
  let archivos = []
  try { archivos = fs.readdirSync(P.DIR).filter(f => f.endsWith('.json') && !NO_JUGADOR.test(f)).sort() } catch (_) { return new Map() }
  const firma = archivos.map(f => { try { return f + ':' + fs.statSync(path.join(P.DIR, f)).mtimeMs } catch (_) { return f } }).join('|')
  if (cache.firma === firma && cache.dir === P.DIR) { cache.t = Date.now(); return cache.jugadores }
  const jugadores = new Map()
  for (const f of archivos) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(P.DIR, f), 'utf8'))
      jugadores.set(f.slice(0, -5), { bots: [], zonas: [], arboles: [], ...d })
    } catch (_) {} // un JSON a medio escribir: se salta hasta la próxima lectura
  }
  cache = { firma, dir: P.DIR, t: Date.now(), jugadores, zonas: null }
  return jugadores
}
const de = (j) => { for (const [n, d] of P.leer()) if (k(n) === k(j)) return { nombre: n, ...d }; return null }

P.jugadores = () => [...P.leer().keys()]
P.datosDe = de
P.botsDe = (j) => ((de(j) || {}).bots || []).map(b => b.nombre)
P.todos = () => [...P.leer().values()].flatMap(d => (d.bots || []).map(b => b.nombre))
P.duenoDe = (bot) => { for (const [n, d] of P.leer()) if ((d.bots || []).some(b => k(b.nombre) === k(bot))) return n; return null }
P.mios = () => (P.yo() ? P.botsDe(P.yo()) : [])
P.lanzadorDe = (j) => (de(j) || {}).lanzador || null

// Las zonas que valen para mis bots: las mías todas y, de los demás, todo menos las de trabajo; cada una con su «dueno»
P.zonasDeTodos = () => {
  const jugadores = P.leer(), yo = k(P.yo())
  if (cache.zonas && cache.zonas.yo === yo && cache.zonas.de === jugadores) return cache.zonas.datos
  const zonas = [], arboles = []
  for (const [n, d] of P.leer()) {
    const mio = k(n) === yo
    for (const z of d.zonas || []) if (mio || z.modo !== 'trabajo') zonas.push({ ...z, dueno: n })
    for (const a of d.arboles || []) arboles.push({ ...a, dueno: n })
  }
  cache.zonas = { yo, de: jugadores, datos: { zonas, arboles } }
  return cache.zonas.datos
}

// Lo mío, para cambiarlo (!zona): una copia; guardarMio la escribe en jugadores/<yo>.json (y luego «make share» la sube a git)
P.mio = () => { const d = de(P.yo()) || {}; return { bots: [], zonas: [], arboles: [], ...JSON.parse(JSON.stringify({ ...d, nombre: undefined })) } }
P.guardarMio = (d) => {
  const yo = P.yo()
  if (!yo) throw new Error('no sé quién soy: pon IO_DUENOS en local.mk')
  const limpio = { ...d }
  delete limpio.nombre
  limpio.zonas = (limpio.zonas || []).map(({ dueno, ...z }) => z)
  limpio.arboles = (limpio.arboles || []).map(({ dueno, ...a }) => a)
  fs.mkdirSync(P.DIR, { recursive: true })
  const nombre = (de(yo) || {}).nombre || yo // el archivo que ya hubiera, con sus mayúsculas
  fs.writeFileSync(path.join(P.DIR, nombre + '.json'), JSON.stringify(limpio, null, 1) + '\n')
  cache.firma = null; cache.t = 0
}
