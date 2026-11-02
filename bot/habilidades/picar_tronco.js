// picar_tronco: picar un tronco al alcance de la mano (≤ 4,5 bloques del ojo, como un jugador).
// Prefiere la columna que dejó enfrente ir_a_arbol. Éxito solo si el bloque desaparece de verdad.
// Si esa columna solo tiene troncos por encima del alcance, la marca como agotada (ir_a_arbol la evitará).
// Con compañeros (fase D): no elige el bloque que otro personaje del proceso está picando, si tiene otro al alcance (tres en el
// mismo árbol picaban el mismo bloque: desaparecía y los tres lo daban por picado).
const cerebro = require('../cerebro')
const memoria = require('../memoria')
const zonas = require('../zonas')
const { conLimite, esperar, companeros, lejania: lejaniaDe } = require('./comun')

const ALCANCE = 4.5

// Troncos al alcance de la mano, primero los de la columna que dejó ir_a_arbol (lo usa también la orden obs).
function alAlcance(bot) {
  const lejania = (v) => lejaniaDe(bot, v) // del ojo al punto más cercano del bloque
  const pref = cerebro.ultimo(bot).tronco
  const columna = (v) => (pref && v.x === pref.x && v.z === pref.z ? 0 : 1)
  return bot.findBlocks({ matching: b => b.name.endsWith('_log'), maxDistance: 7, count: 40 })
    .filter(v => lejania(v) <= ALCANCE && !zonas.talaProtegida(v.x, v.y, v.z))
    .sort((a, b) => columna(a) - columna(b) || lejania(a) - lejania(b))
}

module.exports = async function picarTronco(bot, args, tarea) {
  const pref = cerebro.ultimo(bot).tronco
  const ps = alAlcance(bot)
  if (!ps.length) {
    // restos altos en la columna que dejó ir_a_arbol: marcarla para que ir_a_arbol no vuelva a ella en bucle
    const p = bot.entity.position
    const contigua = pref && Math.hypot(pref.x + 0.5 - p.x, pref.z + 0.5 - p.z) <= 2
    if (contigua && bot.blockAt(pref)?.name.endsWith('_log')) { cerebro.marcarAgotada(bot, pref); return { exito: false, causa: 'tronco fuera de alcance' } }
    return { exito: false, causa: 'sin tronco al alcance' }
  }
  const ocupados = companeros(bot).map(c => memoria(c).cavando).filter(Boolean)
  const libre = ps.find(v => !ocupados.some(o => o.equals(v)))
  const b = bot.blockAt(libre || ps[0])
  const datos = { bloque: b.name, pos: [b.position.x, b.position.y, b.position.z], ...(libre ? {} : { compartido: true }) }
  const yo = memoria(bot)
  yo.cavando = b.position // lo eligen y lo marcan en el mismo turno del bucle de eventos: dos personajes no pueden coger el mismo
  cerebro.ponerObjetivo(bot, b.position) // mi objetivo es el árbol que pico: los compañeros lo ven
  try { return await picar(bot, b, datos, tarea, ps.length - 1) } finally { yo.cavando = null }
}

async function picar(bot, b, datos, tarea, quedan) {
  // en el aire Mineflayer tarda ×5 en picar (justo tras subir un escalón): esperar a pisar suelo
  for (let w = 0; w < 20 && !bot.entity.onGround; w++) await esperar(50)
  await require('./sv').equiparPara(bot, b) // la herramienta de ese bloque (hacha para la madera…); aquí, no al cargar: sv también carga esto
  for (let intento = 1; ; intento++) { // un reintento si otro movimiento aborta el picado (visto 1 de 52)
    try { await conLimite(bot.dig(b), bot.digTime(b) + 3000, () => bot.stopDigging()); break } catch (e) {
      if (intento >= 2 || e.message !== 'Digging aborted' || (tarea && tarea.cancelada)) return { exito: false, causa: 'no se rompió: ' + e.message, ...datos }
    }
  }
  await esperar(300) // si el servidor rechaza el picado, reenvía el bloque
  const ahora = bot.blockAt(b.position)
  if (ahora && ahora.name === b.name) return { exito: false, causa: 'no se rompió', ...datos }
  return { exito: true, causa: 'picado', ...datos, quedan }
}
module.exports.alAlcance = alAlcance
module.exports.picar = picar // lo reutilizan minar y deshacer (F6): mismo picado, misma comprobación de que el bloque desaparece
