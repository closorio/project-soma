// cazar ANIMAL [n=1] (F8.0b, C5): caza n animales de ese tipo (oveja, vaca, cerdo, pollo, conejo; o el nombre del juego) a ≤ 128
// bloques (acercándose antes), con el arma que lleve o a puñetazos (atacar.pelear), y recoge lo que suelten (lana, carne, cuero,
// plumas). A diferencia de recoger_comida, no mira el hambre ni la hora: es para conseguir materiales (la cama del Casual, la lana
// del Granjero).
// Éxito: n muertos con botín. Fallos: no hay ANIMAL cerca · se escapó · lo perdí sin botín · tiempo agotado · cancelado.
// Devuelve { exito, causa, muertos, obtenido }.
const { goals } = require('mineflayer-pathfinder')
const memoria = require('../memoria')
const { dist, esperar, moverHasta, prudentes } = require('./comun')
const recoger = require('./recoger')
const { pelear } = require('./atacar')
const { ponerArma } = require('./equipar')

const ALIAS = { oveja: 'sheep', ovejas: 'sheep', vaca: 'cow', vacas: 'cow', cerdo: 'pig', cerdos: 'pig', pollo: 'chicken', pollos: 'chicken',
  gallina: 'chicken', conejo: 'rabbit', conejos: 'rabbit' }
const RADIO = 128, MS = 30000, RECUERDO_MS = 15 * 60000 // todo lo que el bot ve (el servidor manda los animales a ~128)
const BOTIN = /_wool$|^(mutton|beef|porkchop|chicken|rabbit|leather|feather|rabbit_hide)$/ // lo que suelta un animal al morir
const inventario = (bot) => { const c = {}; for (const i of bot.inventory.items()) c[i.name] = (c[i.name] || 0) + i.count; return c }

module.exports = async function cazar(bot, [animal, cantidad], tarea) {
  const tipo = ALIAS[animal] || animal
  if (!tipo || !bot.registry.entitiesByName[tipo]) return { exito: false, causa: 'animal desconocido: ' + animal }
  const n = Math.max(1, parseInt(cantidad) || 1), antes = inventario(bot)
  let muertos = 0, causa = null, yaFui = false, perdidas = 0
  const descartadas = new Set() // ids de las que no alcanzó
  try { await ponerArma(bot) } catch (_) {}
  while (muertos < n) {
    if (tarea && tarea.cancelada) { causa = 'cancelado'; break }
    const candidatas = () => Object.values(bot.entities).filter(e => e.name === tipo && dist(bot, e) <= RADIO && !descartadas.has(e.id))
      .sort((a, b) => dist(bot, a) - dist(bot, b))
    let presa = candidatas()[0]
    // F8.1: si no ve ninguno, ir adonde se vio uno la última vez (lo apunta explorar) y volver a mirar
    const visto = memoria(bot, 'animales_vistos', () => ({}))[tipo]
    if (!presa && visto && Date.now() - visto.t < RECUERDO_MS && !yaFui) {
      yaFui = true
      const [x, y, z] = visto.pos
      await moverHasta(bot, new goals.GoalNear(x, y, z, 6), () => bot.entity.position.distanceTo({ x, y, z }) <= 8, { ms: 60000, tarea, mov: prudentes(bot) })
      presa = candidatas()[0]
    }
    if (!presa) { causa = `no hay ${tipo} cerca`; break }
    // F8.1: pelear se rinde con el animal a más de 16 («huyó» en 2 ms): con la presa a 128, acercarse primero siguiéndola
    if (dist(bot, presa) > 12) {
      const ida = () => !bot.entities[presa.id] || presa.isValid === false
      await moverHasta(bot, new goals.GoalFollow(presa, 4), () => ida() || dist(bot, presa) <= 6, { ms: 60000, tarea, mov: prudentes(bot) })
      // F8.1 (banco K 8: 20 de 21 cazas acabaron así): la que está tras agua o un desnivel se descarta y se prueba con otra, hasta 3
      if (ida() || dist(bot, presa) > 14) {
        descartadas.add(presa.id)
        if (descartadas.size >= 3) { causa = 'no la alcancé'; break }
        continue
      }
    }
    const donde = presa.position.clone(), previo = inventario(bot)
    const r = await pelear(bot, presa, { ms: MS, tarea, parar: () => null })
    if (r.causa !== 'muerto') { causa = r.causa === 'huyó' ? 'se escapó' : r.causa; break }
    await esperar(600) // lo que suelta tarda en aparecer
    for (let k = 0; k < 4; k++) {
      const sueltos = Object.values(bot.entities).filter(e => e.name === 'item' && e.position.distanceTo(donde) <= 5)
      if (!sueltos.length) break
      let nombre = null
      try { nombre = sueltos[0].getDroppedItem().name } catch (_) {}
      if (!nombre) { await esperar(300); continue } // los metadatos del objeto tardan en llegar
      await recoger(bot, ['8', nombre], tarea)
    }
    // F8.1: pelear da por muerta la presa que desaparece justo tras un golpe; en ladera (o fuera del alcance) se iba sin soltar nada y
    // contaba igual (K1, banco K 8: 13 «cazado» y 2 lanas). Solo cuenta si entró algo del animal.
    if (Object.entries(inventario(bot)).some(([k, m]) => BOTIN.test(k) && m > (previo[k] || 0))) { muertos++; perdidas = 0 }
    else if (++perdidas >= 3) { causa = 'lo perdí sin botín'; break }
  }
  const ahora = inventario(bot), obtenido = {}
  for (const [k, m] of Object.entries(ahora)) if (m > (antes[k] || 0)) obtenido[k] = m - (antes[k] || 0)
  return { exito: muertos >= n, causa: muertos >= n ? 'cazado' : causa, animal: tipo, muertos, obtenido }
}
module.exports.ALIAS = ALIAS
