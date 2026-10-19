const { Vec3 } = require('vec3')
// Utilidades compartidas por las habilidades.
const { Movements } = require('mineflayer-pathfinder')
const memoria = require('../memoria')
const zonas = require('../zonas')

// Nombres de los personajes (bots) que no son jugadores humanos: los de este proceso (io.js los añade) y los de IO_BOTS
// (otros procesos, separados por comas). «El jugador» de la observación y de ir_a_jugador/ven es siempre un humano.
const PERSONAJES = new Set((process.env.IO_BOTS || '').split(',').map(s => s.trim()).filter(Boolean))
const esBot = (nombre) => PERSONAJES.has(nombre)
// Bots de los personajes de este proceso, por nombre (io.js los registra al conectar): de ellos se lee el objetivo (fase C).
const BOTS = new Map()
// Los bots de los demás personajes de este proceso.
const companeros = (bot) => [...BOTS.entries()].filter(([n, b]) => n !== bot.username && b.entity).map(([, b]) => b)
// Ajustes de prueba de cada personaje: amenazas (tipos de entidad tratados como hostiles) y jugador (tipo tratado como «el jugador»).
const pruebas = (bot) => memoria(bot, 'pruebas', () => ({ amenazas: new Set(), jugador: null }))

const esperar = (ms) => new Promise(r => setTimeout(r, ms))
const dist = (bot, e) => e.position.distanceTo(bot.entity.position)

// Promesa con límite de tiempo; al agotarse llama a `alAgotar` (p. ej. dejar de picar) y falla.
async function conLimite(promesa, ms, alAgotar = () => {}) {
  let t
  const limite = new Promise((_, rej) => { t = setTimeout(() => { alAgotar(); rej(new Error('tiempo agotado')) }, ms) })
  try { return await Promise.race([promesa, limite]) } finally { clearTimeout(t) }
}

// Movimientos prudentes: sin romper ni poner bloques (el mundo del jugador no se toca al seguirle o huir).
function prudentes(bot) {
  const m = zonas.aplicar(new Movements(bot))
  m.canDig = false
  m.allow1by1towers = false
  m.scafoldingBlocks = []
  return m
}
// Prudentes y además secos (explorar, F6): no pisa agua ni se deja caer en ella, y no baja más de 3 bloques.
function prudentesSecos(bot) {
  const m = prudentes(bot)
  m.blocksToAvoid.add(bot.registry.blocksByName.water.id)
  m.infiniteLiquidDropdownDistance = false
  m.maxDropDown = 3
  return m
}
// La casilla (nodo del navegador) en la que está el personaje. Con la altura redondeada, no truncada: sobre un camino de tierra
// o una losa el personaje está a y+0,94 y floor() lo pondría un bloque más abajo de donde lo cree el navegador.
const nodo = (bot) => { const p = bot.entity.position; return new Vec3(Math.floor(p.x), Math.round(p.y), Math.floor(p.z)) }
async function conMovimientos(bot, fn, mov = null) {
  const previo = bot.pathfinder.movements
  bot.pathfinder.setMovements(mov || prudentes(bot))
  try { return await fn() } finally { bot.pathfinder.setGoal(null); bot.pathfinder.setMovements(previo) }
}
// Del ojo del personaje al punto más cercano del bloque v (alcance de la mano: 4,5; lo usan picar_tronco, minar, construir).
function lejania(bot, v) {
  const ojo = bot.entity.position.offset(0, 1.62, 0)
  const c = (o, a) => Math.max(a, Math.min(a + 1, o)) - o
  return Math.hypot(c(ojo.x, v.x), c(ojo.y, v.y), c(ojo.z, v.z))
}

// ¿Hay camino a pie hasta `meta`? getPathTo solo piensa un tick (40 ms) y suele devolver «partial»: aquí piensa hasta `ms`.
// ¿Hay camino a pie hasta la meta? Con los mismos movimientos con los que luego se andará (mov): si se juzga con los movimientos
// por defecto (que pueden cavar) y se anda con los prudentes (que no), el juicio dice «sí» y el cuerpo no se mueve.
function hayCamino(bot, meta, ms = 300, mov = null) {
  const gen = bot.pathfinder.getPathFromTo(mov || bot.pathfinder.movements, bot.entity.position, meta, { timeout: ms, tickTimeout: ms })
  return gen.next().value.result.status === 'success'
}

const masCercana = (bot, vale, radio) => Object.values(bot.entities).filter(e => e !== bot.entity && vale(e) && dist(bot, e) <= radio)
  .sort((a, b) => dist(bot, a) - dist(bot, b))[0] || null

// «El jugador» de la observación (jugador_dist) y de ir_a_jugador sin nombre: el jugador humano más cercano (otro personaje no
// cuenta). Para que el banco sea repetible, la orden `jugador_prueba TIPO` hace que lo sea en su lugar la entidad más cercana
// de ese tipo (p. ej. un aldeano quieto).
function jugadorCercano(bot, radio = Infinity) {
  const tipo = pruebas(bot).jugador
  return masCercana(bot, tipo ? (e) => e.name === tipo : (e) => e.type === 'player' && !esBot(e.username), radio)
}
// El otro personaje (bot) más cercano: su distancia y su objetivo van en la observación de la red (fase C).
const companeroCercano = (bot, radio = Infinity) => masCercana(bot, (e) => e.type === 'player' && esBot(e.username), radio)

// Jugador por nombre; si no hay nombre, «el jugador» (jugadorCercano); si el nombre no es de un jugador,
// la entidad más cercana de ese tipo (villager, zombie…), útil para huir de mobs y para las pruebas.
function buscarEntidad(bot, nombre, radio = 48) {
  if (nombre && bot.players[nombre]) return bot.players[nombre].entity || null
  return nombre ? masCercana(bot, (e) => e.name === nombre, radio) : jugadorCercano(bot, radio)
}

// Hostiles en el radio, del más cercano al más lejano (hostilCercano: el primero; F7.1 cuenta cuántos hay).
// Con el servidor en pacífico no hay hostiles: la orden `amenaza_prueba TIPO`
// hace que una entidad de ese tipo (p. ej. villager) cuente como amenaza, para probar huir, obs y la interrupción.
function hostiles(bot, radio) {
  const { amenazas } = pruebas(bot)
  return Object.values(bot.entities).filter(e => e !== bot.entity && (e.type === 'hostile' || amenazas.has(e.name)) && dist(bot, e) < radio)
    .sort((a, b) => dist(bot, a) - dist(bot, b))
}
const hostilCercano = (bot, radio) => hostiles(bot, radio)[0] || null

// ¿Encerrado en una celda de 1×2 (F7.1, en_refugio; el éxito de refugiarse en F7.2)? Los 4 lados de los pies y de la cabeza,
// el bloque de encima de la cabeza y el de debajo de los pies son sólidos (bloque entero).
function encerrado(bot) {
  const b = nodo(bot)
  const solido = (dx, dy, dz) => { const k = bot.blockAt(b.offset(dx, dy, dz)); return !!k && k.boundingBox === 'block' }
  return solido(0, -1, 0) && solido(0, 2, 0) && [0, 1].every(dy => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => solido(dx, dy, dz)))
}

// Navegador con objetivo dinámico hasta que `listo()`; devuelve listo | cancelado | perdido | sin camino | tiempo agotado.
async function moverHasta(bot, meta, listo, { ms, tarea, entidad, mov }) {
  let sinCamino = 0
  const alCalcular = (r) => { sinCamino = r.status === 'noPath' ? sinCamino + 1 : 0 }
  bot.on('path_update', alCalcular)
  try {
    return await conMovimientos(bot, async () => {
      bot.pathfinder.setGoal(meta, true)
      const t0 = Date.now()
      for (;;) {
        if (listo()) return 'listo'
        if (tarea && tarea.cancelada) return 'cancelado'
        if (entidad && !bot.entities[entidad.id]) return 'perdido'
        if (Date.now() - t0 > ms) return 'tiempo agotado'
        if (sinCamino >= 3 && !bot.pathfinder.isMoving()) return 'sin camino'
        await esperar(200)
      }
    }, mov)
  } finally { bot.removeListener('path_update', alCalcular) }
}

module.exports = { esperar, dist, conLimite, prudentes, prudentesSecos, conMovimientos, lejania, hayCamino, nodo, buscarEntidad, jugadorCercano,
  companeroCercano, moverHasta, hostilCercano, hostiles, encerrado, pruebas, PERSONAJES, esBot, BOTS, companeros }
