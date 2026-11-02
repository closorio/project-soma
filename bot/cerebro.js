// ---- Adaptador del «cerebro»: mismas observaciones que entrenamiento/entorno.py ----
// Lo usan la orden `cerebro` (io.js) y la habilidad ir_a_arbol (habilidades/).
// Rejilla: x este, z sur; rumbo 0 norte(-z), 1 este(+x), 2 sur(+z), 3 oeste(-x).
const fs = require('fs')
const { Movements, goals } = require('mineflayer-pathfinder')
const memoria = require('./memoria')
const zonas = require('./zonas') // zonas y árboles protegidos

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]
const N = 24 // = ESCALA de entrenamiento/entorno.py
let politica = null // la red es de solo lectura: la comparten todos los personajes del proceso
try { politica = JSON.parse(fs.readFileSync(__dirname + '/../entrenamiento/politica.json')) } catch (_) {}
// Memoria de cada personaje: rumbo y acción anterior (memoria corta de la red), troncos descartados en este bucle,
// el tronco que quedó enfrente al terminar ir_a_arbol (lo usa picar_tronco), columnas agotadas, troncos inalcanzables
// y su objetivo (fase C: el tronco al que va, y si va de camino).
const mem = (bot) => memoria(bot, 'cerebro', () => ({
  rumbo: 0, previa: -1, descartados: new Set(), ultimo: { tronco: null, rumbo: 0 }, agotados: new Map(), inalcanzables: new Map(),
  objetivo: null, yendo: false,
}))
const ultimo = (bot) => mem(bot).ultimo

function decidirRed(o) {
  let x = o
  politica.capas.forEach((c, i) => {
    x = c.w.map((fila, j) => fila.reduce((a, w, k) => a + w * x[k], c.b[j]))
    if (i < politica.capas.length - 1) x = x.map(v => Math.max(0, v))
  })
  if (!o[2]) x[3] = -Infinity // picar solo tiene sentido con el árbol enfrente: evita bucles de picar al aire
  return x.indexOf(Math.max(...x))
}
function decidirVoraz(o) { // referencia a mano; sirve mientras no haya politica.json
  const ad = o[0] * N, la = o[1] * N
  if (o[2]) return 3
  if (o[3]) return 2
  if (Math.abs(la) > 0.5 && ad <= 0) return la > 0 ? 2 : 1
  if (ad > 0.5) return 0
  return la > 0 ? 2 : 1
}
// goto con límite de tiempo: si el navegador se atasca, cancela el objetivo y devuelve el control
async function irA(bot, meta, ms = 12000) {
  let t
  const limite = new Promise((_, rej) => { t = setTimeout(() => { bot.pathfinder.setGoal(null); rej(new Error('tiempo agotado')) }, ms) })
  try { await Promise.race([bot.pathfinder.goto(meta), limite]) } finally { clearTimeout(t) }
}
const clip = (v) => Math.max(-1, Math.min(1, v)) // rango visto al entrenar (rejillas de hasta 24)

// descartados: troncos que han provocado un bucle en esta prueba (p. ej. al otro lado del agua).
// agotados: columnas con restos de tronco fuera de alcance (picar_tronco las marca): ir_a_arbol las evita 10 min. La orden cerebro no las usa.
const agotada = (bot, v) => Date.now() - (mem(bot).agotados.get(v.x + ',' + v.z) ?? -Infinity) < 600000
const marcarAgotada = (bot, v) => mem(bot).agotados.set(v.x + ',' + v.z, Date.now())
// inalcanzables: troncos sin camino a pie confirmado (300 ms de búsqueda, no los 40 ms de getPathTo): ir_a_arbol y la orden obs
// los recuerdan 10 min, como el simulador recuerda los árboles inalcanzables. La orden cerebro no los usa.
const inalcanzable = (bot, v) => Date.now() - (mem(bot).inalcanzables.get(v.x + ',' + v.y + ',' + v.z) ?? -Infinity) < 600000
const evitar = (bot, v) => agotada(bot, v) || inalcanzable(bot, v)

// Objetivo de un personaje (fase C): el tronco al que va ir_a_arbol (o la orden cerebro) mientras anda y, al acabar, el que
// tiene delante mientras siga a ≤ 4 bloques de él; si no, null. Los compañeros lo leen para no ir al mismo árbol.
function objetivo(bot) {
  const m = mem(bot), t = m.objetivo
  if (!t || !bot.entity) return null
  if (m.yendo) return t
  const p = bot.entity.position
  return Math.hypot(t.x + 0.5 - p.x, t.z + 0.5 - p.z) <= 4 ? t : null
}
// picar_tronco también publica el árbol que pica (como en el simulador, el objetivo incluye el árbol que tiene delante).
const ponerObjetivo = (bot, v) => { mem(bot).objetivo = v }
// ¿Es el tronco v del mismo árbol que alguno de `objetivos`? A ≤ 3 bloques en horizontal (robles oscuros de 2×2, ramas).
const MISMO_ARBOL = 3
const delArbol = (v, objetivos) => objetivos.some(t => Math.hypot(v.x - t.x, v.z - t.z) <= MISMO_ARBOL)

// Los 40 troncos más cercanos que se pueden talar: los protegidos (zonas.json) se quitan dentro de la búsqueda. Si se quitaran
// después, junto a una zona con muchos troncos (HOGAR, GRANARBOL) los 40 más cercanos serían todos protegidos y no vería los de
// fuera (F4, pendiente (a)). findBlocks mira primero la paleta de cada sección (bloques sin posición: pasa cualquier tronco) y
// luego cada casilla (con posición). useExtraInfo haría lo mismo, pero ~30 % más lento (busca cuadros en cada casilla).
const troncosLibres = (bot) => bot.findBlocks({ maxDistance: 48, count: 40,
  matching: b => b.name.endsWith('_log') && !(b.position && zonas.talaProtegida(b.position.x, b.position.y, b.position.z)) })

// Alcanzabilidad real: el simulador siempre deja un camino a pie hasta el árbol; en el mundo hay mar y lagos.
// Se comprueba con el navegador (evitando el agua) los troncos más cercanos y se descartan los inalcanzables.
async function descartarInalcanzables(bot, k = 6, saltar = false, excluir = []) {
  if (process.env.IO_SIN_ALCANZABLE) return // activado por defecto: 52/60 frente a 47/60 sin él (ciclo 14)
  const p = bot.entity.position
  const { descartados, inalcanzables } = mem(bot)
  const mov = zonas.aplicar(new Movements(bot))
  mov.blocksToAvoid.add(bot.registry.blocksByName.water.id)
  const ps = troncosLibres(bot)
    .filter(v => !descartados.has(v.x + ',' + v.y + ',' + v.z) && !(saltar && evitar(bot, v)) && !delArbol(v, excluir)).sort((a, b) => a.distanceTo(p) - b.distanceTo(p)).slice(0, k)
  for (const v of ps) {
    const meta = new goals.GoalNear(v.x, v.y, v.z, 1)
    const r = bot.pathfinder.getPathTo(mov, meta, 400)
    if (r.status !== 'success') {
      descartados.add(v.x + ',' + v.y + ',' + v.z)
      if (saltar && bot.pathfinder.getPathFromTo(mov, bot.entity.position, meta, { timeout: 300, tickTimeout: 300 }).next().value.result.status !== 'success') {
        inalcanzables.set(v.x + ',' + v.y + ',' + v.z, Date.now())
      }
    }
    else break // el más cercano que sí se alcanza: basta
  }
}
// excluir: objetivos de los compañeros (ir_a_otro_arbol, fase C): no elegir troncos de esos árboles.
function arbolCercano(bot, saltar = false, excluir = []) {
  const p = bot.entity.position
  const ps = troncosLibres(bot)
  // el simulador nunca pone el árbol en la casilla del agente: descartar su propia columna
  // y los troncos sumergidos o rodeados de agua (pantano/costa): talarlos ahoga al bot
  const enAgua = (v) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
    const b = bot.blockAt(v.offset(dx, 0, dz)); return b && b.name === 'water'
  })
  const { descartados } = mem(bot)
  const q = ps.filter(v => !(v.x === Math.floor(p.x) && v.z === Math.floor(p.z)) && !enAgua(v) && !descartados.has(v.x + ',' + v.y + ',' + v.z) && !(saltar && evitar(bot, v)) && !delArbol(v, excluir))
  q.sort((a, b) => a.distanceTo(p) - b.distanceTo(p))
  return q[0]
}
// Altura a la que se puede pisar la casilla de enfrente (sube 1, baja hasta 2), o null si no se puede.
function alturaDelante(bot, p, fx, fy) {
  const sol = (dy) => { const b = bot.blockAt(p.offset(fx, dy, fy)); return !!b && b.boundingBox === 'block' }
  // Vallas y muros miden 1,5 bloques de colisión: sin nada encima son obstáculo; con una alfombra encima se intenta el salto a mano.
  const alta = (dy) => { const b = bot.blockAt(p.offset(fx, dy, fy)); return !!b && /fence|_wall$/.test(b.name) && !/gate/.test(b.name) }
  for (const dy of [0, 1, -1, -2]) {
    if (dy === 1 && alta(0)) { // valla: solo se intenta saltar si lleva una alfombra encima (el jugador la salta; el navegador no la ve)
      const encima = bot.blockAt(p.offset(fx, 1, fy))
      if (encima && /carpet/.test(encima.name) && !sol(2) && !sol(3)) return p.y + 1
      continue
    }
    if (sol(dy - 1) && !sol(dy) && !sol(dy + 1)) return p.y + dy
  }
  return null
}
// Plan B cuando el navegador se atasca en un escalón de un bloque: saltar y avanzar a mano.
async function saltarAdelante(bot, rumbo) {
  await bot.look(-rumbo * (Math.PI / 2), 0, true)
  bot.setControlState('forward', true); bot.setControlState('sprint', true); bot.setControlState('jump', true) // como un jugador: correr y saltar
  await new Promise(r => setTimeout(r, 700))
  bot.setControlState('jump', false); bot.setControlState('sprint', false); bot.setControlState('forward', false)
}
const bloqueadoDelante = (bot, p, fx, fy) => (alturaDelante(bot, p, fx, fy) === null ? 1 : 0)
function observar(bot, t) {
  const { rumbo, previa } = mem(bot)
  const p = bot.entity.position.floored()
  const d = [t.x - p.x, t.z - p.z]
  const [fx, fy] = DIRS[rumbo], [rx, ry] = [-fy, fx]
  const enfrente = (p.x + fx === t.x && p.z + fy === t.z) ? 1 : 0
  return [clip((d[0] * fx + d[1] * fy) / N), clip((d[0] * rx + d[1] * ry) / N), enfrente, enfrente ? 0 : bloqueadoDelante(bot, p, fx, fy),
    bloqueadoDelante(bot, p, ...DIRS[(rumbo + 3) % 4]), bloqueadoDelante(bot, p, ...DIRS[(rumbo + 1) % 4]), // izquierda y derecha
    ...[0, 1, 2, 3].map(k => (k === previa ? 1 : 0))]
}

// Bucle de pasos de la red. hasta='picar' es la orden `cerebro` de siempre (anda y pica);
// hasta='enfrente' para en cuanto tiene un tronco en la casilla de enfrente, sin picar (habilidad ir_a_arbol).
// excluir: troncos objetivo de los compañeros al empezar (ir_a_otro_arbol): no va a esos árboles.
// Devuelve { log, fin, pasos, tronco }; fin: picó | enfrente | sin árbol | bloqueado | pasos | cancelado.
async function bucle(bot, pasos, { hasta = 'picar', tarea, excluir = [] } = {}) {
  const m = mem(bot)
  m.yendo = true
  try { return await bucleObjetivo(bot, m, pasos, hasta, tarea, excluir) } finally { m.yendo = false }
}
async function bucleObjetivo(bot, m, pasos, hasta, tarea, excluir) {
  m.rumbo = ((Math.round(-bot.entity.yaw / (Math.PI / 2)) % 4) + 4) % 4 // yaw 0 = norte
  const log = []
  m.previa = -1
  let bloqueos = 0, fin = 'pasos', t = null, i = 0
  m.descartados = new Set()
  const saltar = hasta === 'enfrente'
  m.objetivo = arbolCercano(bot, saltar, excluir) || null // que los compañeros lo vean ya, antes de comprobar caminos
  await descartarInalcanzables(bot, 6, saltar, excluir)
  const vistos = new Map()
  for (; i < pasos; i++) {
    if (tarea && tarea.cancelada) { log.push('cancelado'); fin = 'cancelado'; break }
    t = arbolCercano(bot, saltar, excluir)
    if (!t) { log.push('sin árbol'); fin = 'sin árbol'; break }
    m.objetivo = t
    const clave = `${bot.entity.position.floored()}|${m.rumbo}|${t}`
    const veces = (vistos.get(clave) || 0) + 1; vistos.set(clave, veces)
    if (veces >= 3) { m.descartados.add(t.x + ',' + t.y + ',' + t.z); log.push('descarta ' + t.x + ',' + t.z); vistos.clear(); await descartarInalcanzables(bot, 6, saltar, excluir); continue }
    const o = observar(bot, t)
    if (hasta === 'enfrente' && o[2]) { Object.assign(m.ultimo, { tronco: t, rumbo: m.rumbo }); fin = 'enfrente'; break }
    const acc = politica ? decidirRed(o) : decidirVoraz(o)
    const p = bot.entity.position.floored()
    const [fx, fy] = DIRS[m.rumbo]
    if (acc === 0) {
      const h = alturaDelante(bot, p, fx, fy)
      if (h !== null) await irA(bot, new goals.GoalBlock(p.x + fx, h, p.z + fy), 8000).catch(() => {})
      let q = bot.entity.position.floored()
      if (h === p.y + 1 && q.x === p.x && q.z === p.z) { // escalón de un bloque y no se movió: salto manual
        await saltarAdelante(bot, m.rumbo); q = bot.entity.position.floored()
      }
      if (q.x === p.x && q.z === p.z) { log.push('bloqueado'); if (++bloqueos >= 3) { fin = 'bloqueado'; break } } else bloqueos = 0
    }
    else if (acc === 1 || acc === 2) {
      m.rumbo = (m.rumbo + (acc === 1 ? 3 : 1)) % 4
      await bot.look(-m.rumbo * (Math.PI / 2), 0, true)
    } else {
      let picado = false
      for (let dy = -1; dy <= 9; dy++) { // troncos altos: el nivel exacto no lo sabe la observación
        const b = bot.blockAt(p.offset(fx, dy, fy))
        // desde el borde de una zona protegida el tronco de enfrente puede estar dentro: ese no se pica (picar al aire)
        if (b && b.name.endsWith('_log') && !zonas.talaProtegida(b.position.x, b.position.y, b.position.z)) { await require('./habilidades/sv').equiparPara(bot, b); await bot.dig(b); log.push('picó ' + b.name + '@' + b.position.x + ',' + b.position.y + ',' + b.position.z); picado = true; break }
      }
      // como en el simulador: picar al aire no termina el episodio (solo gasta un paso)
      if (picado) { log.push('fin en ' + (i + 1) + ' pasos'); fin = 'picó'; break }
    }
    m.previa = acc
    log.push(['A', 'I', 'D', 'P'][acc] + (process.env.IO_DEBUG ? `(${bot.entity.position.x.toFixed(0)},${bot.entity.position.z.toFixed(0)} r${m.rumbo} t${t.x},${t.z})` : ''))
  }
  return { log, fin, pasos: i, tronco: t }
}

module.exports = { bucle, irA, ultimo, marcarAgotada, agotada, arbolCercano, objetivo, ponerObjetivo, delArbol, DIRS, get politica() { return politica } }
