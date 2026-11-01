// usar_cama [radio=16] (2026-11-01, pedido del usuario: «duerme», «usa la cama» y «ven a la cama» son la misma orden): va a la cama
// puesta más cercana (≤ radio bloques); si no hay ninguna, pone la que lleve y, si no lleva, la fabrica (3 de lana y tablones) y la
// pone. De día, un clic en ella fija el punto de reaparición; de noche, duerme en ella (también lo fija) hasta que le despierte el
// día. La cama se queda puesta (a diferencia de `dormir`, que la recoge): el spawn también. Se acerca sin romper ni poner nada.
// Éxito «spawn guardado» o «amanece» (+ `puesta: true` si la puso él). Fallos: no puedo hacer una cama (…) · sin sitio para la cama ·
// no pude poner la cama · no llego · monstruos cerca · la cama está ocupada · despertado · cancelado.
const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const { conLimite, esperar, moverHasta } = require('./comun')
const { sitioCama } = require('./dormir')
const fabricar = require('./fabricar')
const sv = require('./sv')

const MAX_S = 720
const camaMasCercana = (bot, r) => bot.findBlocks({ matching: (b) => b.name.endsWith('_bed'), maxDistance: r, count: 20 })
  .sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position))[0]

// Una casilla a ≤ 6 bloques donde el bot puede estar de pie y desde la que sitioCama encuentra sitio; la más cercana, o null
function buscarSitio(bot) {
  const b = bot.entity.position.floored(), libre = (v) => { const k = bot.blockAt(v); return !!k && k.boundingBox === 'empty' && !sv.esLiquido(k) }
  const cand = []
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) for (let dy = -2; dy <= 2; dy++) {
    const s = b.offset(dx, dy, dz)
    if (libre(s) && libre(s.offset(0, 1, 0)) && sv.solido(bot.blockAt(s.offset(0, -1, 0))) && sitioCama(bot, s)) cand.push(s)
  }
  return cand.sort((a, c) => a.distanceTo(b) - c.distanceTo(b))[0] || null
}

// La que lleve (o una recién fabricada), en dos casillas libres a su lado; devuelve su posición o { causa }
async function ponerCama(bot, tarea) {
  let cama = bot.inventory.items().find(i => i.name.endsWith('_bed'))
  if (!cama) {
    const f = await fabricar(bot, ['cama'], tarea)
    cama = bot.inventory.items().find(i => i.name.endsWith('_bed'))
    if (!cama) return { causa: `no veo ninguna cama y no puedo hacer una (${f.causa || 'faltan 3 de lana y tablones'})` }
  }
  let sitio = sitioCama(bot)
  if (!sitio) { // aquí no cabe (terreno irregular): la casilla más cercana a ≤ 6 desde la que sí, y allí
    const d = buscarSitio(bot)
    if (!d) return { causa: 'sin sitio para la cama' }
    await moverHasta(bot, new goals.GoalBlock(d.x, d.y, d.z), () => bot.entity.position.floored().equals(d), { ms: 15000, tarea })
    sitio = sitioCama(bot)
    if (!sitio) return { causa: 'sin sitio para la cama' }
  }
  try { bot.pathfinder.setGoal(null) } catch (_) {}
  try {
    await conLimite(bot.equip(cama, 'hand'), 3000)
    await bot.lookAt(sitio.cab.offset(0.5, 0, 0.5), true) // la cabecera queda hacia donde mira
    await conLimite(bot.placeBlock(bot.blockAt(sitio.pie.offset(0, -1, 0)), new Vec3(0, 1, 0)), 3000)
  } catch (_) {}
  await esperar(200)
  const v = [sitio.pie, sitio.cab].find(p => { const k = bot.blockAt(p); return k && k.name.endsWith('_bed') })
  return v ? { v } : { causa: 'no pude poner la cama' }
}

module.exports = async function usarCama(bot, [radio], tarea) {
  const t0 = Date.now(), r = Math.min(32, parseFloat(radio) || 16)
  const datos = () => ({ s: +((Date.now() - t0) / 1000).toFixed(1) })
  let v = camaMasCercana(bot, r), puesta = false
  if (!v) {
    const p = await ponerCama(bot, tarea)
    if (!p.v) return { exito: false, causa: p.causa, ...datos() }
    v = p.v; puesta = true
  }
  const cerca = () => bot.entity.position.distanceTo(v.offset(0.5, 0.5, 0.5)) <= 3
  if (!cerca()) {
    const fin = await moverHasta(bot, new goals.GoalNear(v.x, v.y, v.z, 2), cerca, { ms: 30000, tarea })
    if (!cerca()) return { exito: false, causa: fin === 'cancelado' ? 'cancelado' : 'no llego', ...datos() }
  }
  try { bot.pathfinder.setGoal(null) } catch (_) {}
  const cama = bot.blockAt(v)
  if (!cama || !cama.name.endsWith('_bed')) return { exito: false, causa: 'no pude usar la cama: ya no está', ...datos() }
  const base = { pos: [v.x, v.y, v.z], ...(puesta ? { puesta } : {}) }
  const h = sv.hora(bot)
  if (h < sv.CAMA[0] || h > sv.CAMA[1]) { // de día: el clic basta para fijar la reaparición
    try { await conLimite(bot.activateBlock(cama), 3000) } catch (e) { return { exito: false, causa: 'no pude usarla: ' + e.message.slice(0, 60), ...base, ...datos() } }
    return { exito: true, causa: 'spawn guardado', ...base, ...datos() }
  }
  try { await conLimite(bot.sleep(cama), 5000) } catch (e) {
    const causa = /monsters/.test(e.message) ? 'monstruos cerca' : /occupied/.test(e.message) ? 'la cama está ocupada' : 'no pude dormir: ' + e.message.slice(0, 60)
    return { exito: false, causa, ...base, ...datos() }
  }
  const salud0 = bot.health
  for (;;) { // dormido hasta que le despierte el día (amanece si duermen todos los jugadores)
    if (tarea && tarea.cancelada) { if (bot.isSleeping) try { await bot.wake() } catch (_) {} return { exito: false, causa: 'cancelado', ...base, ...datos() } }
    if (!bot.isSleeping) break
    if (bot.health < salud0 || Date.now() - t0 > MAX_S * 1000) { try { await bot.wake() } catch (_) {} return { exito: false, causa: 'despertado', ...base, ...datos() } }
    await esperar(500)
  }
  return { exito: true, causa: 'amanece', ...base, ...datos() }
}
