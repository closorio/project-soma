// equipar_soportes [radio=24] (2026-11-01): se equipa con lo que haya en los armor stands de alrededor.
//  1. Armadura: solo las piezas que le faltan (ni puestas ni en el inventario); de todos los soportes a ≤ radio, la mejor (sv.valorPieza): con la mano vacía, un
//     clic derecho en la altura de la pieza se la pasa a la mano (así lo hace el juego), y la equipa.
//  2. Arma: solo si no tiene ninguna espada ni hacha, abre el cofre más cercano a un soporte (≤ 8 del soporte) y saca la mejor
//     espada o hacha (sv.puntosArma). Un pico no cuenta.
// Éxito si tomó algo («equipado») o ya iba bien («nada mejor»). Fallos: sin soportes · no llego. No rompe ni pone bloques.
// Devuelve { exito, causa, piezas: [...], arma, soportes }.
const { goals } = require('mineflayer-pathfinder')
const sv = require('./sv')
const { conLimite, moverHasta, esperar } = require('./comun')
const depositar = require('./depositar')
const equipar = require('./equipar')

const CONTENEDORES = new Set(['chest', 'trapped_chest', 'barrel'])
const SLOT = { boots: 2, leggings: 3, chestplate: 4, helmet: 5 } // entity.equipment del soporte
// Altura (sobre sus pies) del clic que elige cada pieza en un armor stand normal (los tramos del juego: pies 0,1-0,55 · piernas 0,55-0,9 ·
// pecho 0,9-1,6 · cabeza ≥ 1,6)
const ALTURA = { boots: 0.3, leggings: 0.7, chestplate: 1.2, helmet: 1.8 }
const RANURA = { helmet: 5, chestplate: 6, leggings: 7, boots: 8 }
const ES_ARMA = /_(sword|axe)$/

const soportes = (bot, radio) => Object.values(bot.entities)
  .filter(e => e.name === 'armor_stand' && e.isValid !== false && e.position.distanceTo(bot.entity.position) <= radio)
  .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))

// ¿Le falta esa pieza? Ni la lleva puesta ni la tiene en el inventario (solo se toma lo que falta, no se mejora lo que ya tiene).
const falta = (bot, pieza) => !bot.inventory.slots[RANURA[pieza]] && !bot.inventory.items().some(i => i.name.endsWith('_' + pieza))

async function tomarArmadura(bot, tarea, radio) {
  const piezas = []
  for (const pieza of Object.keys(SLOT)) {
    if (tarea && tarea.cancelada) return piezas
    if (!falta(bot, pieza)) continue
    // de todos los soportes, el que tenga la mejor de esa pieza
    let s = null, item = null
    for (const x of soportes(bot, radio)) {
      const it = (x.equipment || [])[SLOT[pieza]]
      if (it && it.name.endsWith('_' + pieza) && (!item || sv.valorPieza(it) > sv.valorPieza(item))) { s = x; item = it }
    }
    if (!s) continue
    const r = await moverHasta(bot, new goals.GoalNear(s.position.x, s.position.y, s.position.z, 2), () => s.position.distanceTo(bot.entity.position) <= 2.5,
      { ms: 20000, tarea, entidad: s })
    if (r !== 'listo') continue
    try {
      if (bot.heldItem) await conLimite(bot.unequip('hand'), 3000) // con la mano ocupada el clic intercambia en vez de tomar
      await bot.activateEntityAt(s, s.position.offset(0, ALTURA[pieza], 0))
      await esperar(400)
      const nueva = bot.inventory.items().find(i => i.name === item.name) || bot.heldItem
      if (!nueva || nueva.name !== item.name) continue
      await conLimite(bot.equip(nueva, sv.DESTINO_PIEZA[pieza]), 3000)
      await esperar(100)
      piezas.push(item.name)
    } catch (_) { /* siguiente pieza */ }
  }
  return piezas
}

// El cofre más cercano a algún soporte (≤ 8 bloques de él) y el soporte al que está pegado.
function cofreCercano(bot, lista) {
  let mejor = null
  for (const s of lista) {
    for (const b of bot.findBlocks({ matching: (x) => CONTENEDORES.has(x.name), point: s.position, maxDistance: 8, count: 8 })) {
      const d = b.distanceTo(s.position)
      if (!mejor || d < mejor.d) mejor = { pos: b, d }
    }
  }
  return mejor && mejor.pos
}

async function armaDelCofre(bot, tarea, lista) {
  if (sv.mejorArma(bot)) return null // ya tiene espada o hacha: solo busca si le falta
  const pos = cofreCercano(bot, lista)
  if (!pos) return null
  const r = await moverHasta(bot, new goals.GoalNear(pos.x, pos.y, pos.z, 2), () => bot.entity.position.offset(0, 1.62, 0).distanceTo(pos.offset(0.5, 0.5, 0.5)) <= 4,
    { ms: 25000, tarea })
  if (r !== 'listo') return null
  const b = bot.blockAt(pos)
  if (!b || !CONTENEDORES.has(b.name)) return null
  return depositar.conCerrojo(`soporte@${pos.x},${pos.y},${pos.z}`, async () => {
    const v = await conLimite(bot.openContainer(b), 8000)
    try {
      let mejor = null
      for (let i = 0; i < v.inventoryStart; i++) {
        const it = v.slots[i]
        if (it && ES_ARMA.test(it.name) && sv.puntosArma(it.name, it) > (mejor ? sv.puntosArma(mejor.name, mejor) : 0)) mejor = it
      }
      if (!mejor) return null
      await conLimite(v.withdraw(mejor.type, null, 1), 5000)
      return mejor.name
    } catch (_) { return null } finally { bot.closeWindow(v) }
  })
}

module.exports = async function equiparSoportes(bot, [radioArg], tarea) {
  const radio = Math.min(48, parseFloat(radioArg) || 24)
  const lista = soportes(bot, radio)
  if (!lista.length) return { exito: false, causa: 'sin soportes', piezas: [], arma: null, soportes: 0 }
  const piezas = await tomarArmadura(bot, tarea, radio)
  let arma = null
  try { arma = await armaDelCofre(bot, tarea, lista) } catch (_) {}
  try { if (arma) await equipar.ponerArma(bot) } catch (_) {}
  await esperar(200)
  return { exito: true, causa: piezas.length || arma ? 'equipado' : 'nada mejor', piezas, arma, soportes: lista.length }
}
