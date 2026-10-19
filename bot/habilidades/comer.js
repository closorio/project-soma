// comer [minimo=14] (F7.2): comer la mejor comida (sv.comidas: nada de la que hace daño —carne podrida, ojo de araña, patata
// venenosa…— y la cruda solo si no hay otra), bocado a bocado, hasta tener el hambre ≥ mínimo (al menos un bocado si no está
// lleno), quieto. Al acabar vuelve a la mano lo que llevaba (el arma, para no pelear con un pan). Éxito si el hambre sube.
// Fallos: «sin comida», «sin hambre» (barra llena), «interrumpido» (cancelado o el juego no dejó comer).
// Devuelve { exito, causa, bocados, hambre: [antes, después], comida }.
const { conLimite, esperar } = require('./comun')
const sv = require('./sv')

const MAX_BOCADOS = 10

module.exports = async function comer(bot, [minimo], tarea) {
  const M = Math.min(20, parseFloat(minimo) || 14)
  if (!sv.comidas(bot).length) return { exito: false, causa: 'sin comida', hambre: [bot.food, bot.food] }
  if (bot.food >= 20) return { exito: false, causa: 'sin hambre', hambre: [bot.food, bot.food] }
  const antes = bot.food, mano = bot.heldItem ? bot.heldItem.name : null, comido = []
  try { bot.pathfinder.setGoal(null) } catch (_) {}
  let causa = null
  for (let k = 0; k < MAX_BOCADOS; k++) {
    if (tarea && tarea.cancelada) { causa = 'interrumpido'; break }
    if (bot.food >= 20 || (k > 0 && bot.food >= M)) break
    const c = sv.comidas(bot)[0]
    if (!c) break
    try {
      if (!bot.heldItem || bot.heldItem.name !== c.name) { await conLimite(bot.equip(c, 'hand'), 3000); await esperar(100) }
      await bot.consume() // 1,6 s; mineflayer espera a que el juego diga que ha terminado (límite 2,5 s)
      comido.push(c.name)
    } catch (e) {
      if (/full/i.test(e.message)) break
      causa = 'interrumpido: ' + e.message.slice(0, 60)
      break
    }
    await esperar(150) // la barra de hambre llega un momento después
  }
  if (mano && (!bot.heldItem || bot.heldItem.name !== mano)) {
    const it = bot.inventory.items().find(i => i.name === mano)
    if (it) try { await conLimite(bot.equip(it, 'hand'), 3000) } catch (_) {}
  }
  const datos = { bocados: comido.length, hambre: [antes, bot.food], comida: [...new Set(comido)].join(',') || null }
  if (bot.food > antes) return { exito: true, causa: 'comido', ...datos }
  return { exito: false, causa: causa || (comido.length ? 'no subió el hambre' : 'interrumpido'), ...datos }
}
