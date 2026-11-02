// equipar [arma|armadura|todo=todo] (F7.2): la mejor arma en la mano (sv.mejorArma: espada antes que hacha, el mejor material) y
// la mejor armadura que lleve en cada pieza. Éxito si queda equipado lo mejor que tiene («equipado» si cambió algo, «ya equipado»
// si no); fallo «nada que equipar» si no lleva arma ni armadura. Es un reflejo de io.js (al aparecer un hostil) y la usan atacar
// y recoger_comida antes de pelear.
const { conLimite, esperar } = require('./comun')
const sv = require('./sv')

async function ponerArma(bot) {
  const arma = sv.mejorArma(bot)
  if (!arma) return null
  if (bot.heldItem && bot.heldItem.name === arma.name) return { arma: arma.name, cambio: false }
  await conLimite(bot.equip(arma, 'hand'), 3000)
  await esperar(100)
  return { arma: arma.name, cambio: true }
}

async function ponerArmadura(bot) {
  const puestas = [], ranura = { helmet: 5, chestplate: 6, leggings: 7, boots: 8 }
  let alguna = false
  for (const [pieza, destino] of Object.entries(sv.DESTINO_PIEZA)) {
    const llevo = bot.inventory.slots[ranura[pieza]]
    const mejor = bot.inventory.items().filter(i => i.name.endsWith('_' + pieza)).sort((a, b) => sv.puntosPieza(b.name) - sv.puntosPieza(a.name))[0]
    if (llevo) alguna = true
    if (!mejor || sv.puntosPieza(mejor.name) <= sv.puntosPieza(llevo && llevo.name)) continue
    alguna = true
    await conLimite(bot.equip(mejor, destino), 3000)
    await esperar(100)
    puestas.push(mejor.name)
  }
  return { puestas, alguna }
}

module.exports = async function equipar(bot, [que]) {
  const q = que || 'todo'
  let arma = null, armadura = { puestas: [], alguna: false }
  try {
    if (q !== 'armadura') arma = await ponerArma(bot)
    if (q !== 'arma') armadura = await ponerArmadura(bot)
  } catch (e) { return { exito: false, causa: 'no pude equipar: ' + e.message } }
  const datos = { arma: arma ? arma.arma : null, armadura: armadura.puestas, mano: bot.heldItem ? bot.heldItem.name : null }
  if (!arma && !armadura.alguna) return { exito: false, causa: 'nada que equipar', ...datos }
  return { exito: true, causa: (arma && arma.cambio) || armadura.puestas.length ? 'equipado' : 'ya equipado', ...datos }
}
module.exports.ponerArma = ponerArma
// 2026-11-01 (pedido del usuario: siempre lo mejor puesto): qué falta por equipar, sin tocar nada → 'todo' | 'arma' | 'armadura' | null.
// io.js lo mira en reposo y tras cada habilidad.
module.exports.pendiente = function pendiente(bot) {
  const arma = sv.mejorArma(bot), ranura = { helmet: 5, chestplate: 6, leggings: 7, boots: 8 }
  const faltaArma = !!arma && !(bot.heldItem && bot.heldItem.name === arma.name)
  const faltaArmadura = Object.keys(sv.DESTINO_PIEZA).some(pieza => {
    const llevo = bot.inventory.slots[ranura[pieza]]
    return bot.inventory.items().some(i => i.name.endsWith('_' + pieza) && sv.puntosPieza(i.name) > sv.puntosPieza(llevo && llevo.name))
  })
  return faltaArma && faltaArmadura ? 'todo' : faltaArma ? 'arma' : faltaArmadura ? 'armadura' : null
}
