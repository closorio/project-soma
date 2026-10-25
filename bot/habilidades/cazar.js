// cazar ANIMAL [n=1] (F8.0b, C5): caza n animales de ese tipo (oveja, vaca, cerdo, pollo, conejo; o el nombre del juego) a ≤ 32
// bloques, con el arma que lleve o a puñetazos (atacar.pelear), y recoge lo que suelten (lana, carne, cuero, plumas). A diferencia
// de recoger_comida, no mira el hambre ni la hora: es para conseguir materiales (la cama del Casual, la lana del Granjero).
// Éxito: n muertos. Fallos: no hay ANIMAL cerca · se escapó · tiempo agotado · cancelado. Devuelve { exito, causa, muertos, obtenido }.
const { dist, esperar } = require('./comun')
const recoger = require('./recoger')
const { pelear } = require('./atacar')
const { ponerArma } = require('./equipar')

const ALIAS = { oveja: 'sheep', ovejas: 'sheep', vaca: 'cow', vacas: 'cow', cerdo: 'pig', cerdos: 'pig', pollo: 'chicken', pollos: 'chicken',
  gallina: 'chicken', conejo: 'rabbit', conejos: 'rabbit' }
const RADIO = 48, MS = 30000
const inventario = (bot) => { const c = {}; for (const i of bot.inventory.items()) c[i.name] = (c[i.name] || 0) + i.count; return c }

module.exports = async function cazar(bot, [animal, cantidad], tarea) {
  const tipo = ALIAS[animal] || animal
  if (!tipo || !bot.registry.entitiesByName[tipo]) return { exito: false, causa: 'animal desconocido: ' + animal }
  const n = Math.max(1, parseInt(cantidad) || 1), antes = inventario(bot)
  let muertos = 0, causa = null
  try { await ponerArma(bot) } catch (_) {}
  while (muertos < n) {
    if (tarea && tarea.cancelada) { causa = 'cancelado'; break }
    const presa = Object.values(bot.entities).filter(e => e.name === tipo && dist(bot, e) <= RADIO).sort((a, b) => dist(bot, a) - dist(bot, b))[0]
    if (!presa) { causa = `no hay ${tipo} cerca`; break }
    const donde = presa.position.clone()
    const r = await pelear(bot, presa, { ms: MS, tarea, parar: () => null })
    if (r.causa !== 'muerto') { causa = r.causa === 'huyó' ? 'se escapó' : r.causa; break }
    muertos++
    await esperar(600) // lo que suelta tarda en aparecer
    for (let k = 0; k < 4; k++) {
      const sueltos = Object.values(bot.entities).filter(e => e.name === 'item' && e.position.distanceTo(donde) <= 5)
      if (!sueltos.length) break
      let nombre = null
      try { nombre = sueltos[0].getDroppedItem().name } catch (_) {}
      if (!nombre) break
      await recoger(bot, ['8', nombre], tarea)
    }
  }
  const ahora = inventario(bot), obtenido = {}
  for (const [k, m] of Object.entries(ahora)) if (m > (antes[k] || 0)) obtenido[k] = m - (antes[k] || 0)
  return { exito: muertos >= n, causa: muertos >= n ? 'cazado' : causa, animal: tipo, muertos, obtenido }
}
module.exports.ALIAS = ALIAS
