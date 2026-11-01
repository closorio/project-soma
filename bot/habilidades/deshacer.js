// deshacer OBRA (F6): quitar una obra del libro (obras.json) rompiendo solo los bloques que puso, en orden inverso al que se
// pusieron, y solo si siguen siendo del mismo tipo (si el usuario cambió algo, se salta y se apunta). Acepta el nombre («cabana»:
// la más reciente en pie) o el id. Al final recoge lo caído. Límite: 30 s + 5 s por bloque (máx. 20 min), 3 fallos seguidos.
// Devuelve { exito, causa, obra, quitados, saltados, quedan }.
const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const obras = require('../obras')
const { picar } = require('./picar_tronco')
const recoger = require('./recoger')
const { moverHasta, lejania, esperar } = require('./comun')

const ALCANCE = 4.5, MAX_MS = 1200000 // 20 min: la cabaña grande con techo son 206 bloques (2026-11-01)

module.exports = async function deshacer(bot, [nombre], tarea) {
  if (!nombre) return { exito: false, causa: 'di qué obra: ' + (obras.lista().filter(o => o.estado !== 'deshecha').map(o => o.nombre).join(', ') || 'no hay obras') }
  const o = obras.obra(nombre)
  if (!o) return { exito: false, causa: `no hay ninguna obra «${nombre}» en pie` }
  const ms = Math.min(MAX_MS, (30 + 5 * o.bloques.length) * 1000), t0 = Date.now()
  let quitados = 0, saltados = 0, fallos = 0, causa = null
  for (const [x, y, z, tipo] of [...o.bloques].reverse()) {
    if (tarea && tarea.cancelada) { causa = 'cancelado'; break }
    if (Date.now() - t0 > ms) { causa = 'tiempo agotado'; break }
    if (fallos >= 3) { causa = 'tres fallos seguidos'; break }
    const v = new Vec3(x, y, z), b = bot.blockAt(v)
    if (!b || b.name !== tipo) { saltados++; obras.quitarPuesto(o.id, [x, y, z]); continue } // ya no es lo que pusimos: no se toca
    if (lejania(bot, v) > ALCANCE) {
      const r = await moverHasta(bot, new goals.GoalNear(x, y, z, 2), () => lejania(bot, v) <= ALCANCE - 0.3, { ms: 15000, tarea })
      if (r !== 'listo') { fallos++; continue }
    }
    const h = bot.pathfinder.bestHarvestTool(b)
    if (h && (!bot.heldItem || bot.heldItem.type !== h.type)) { try { await bot.equip(h, 'hand'); await esperar(60) } catch (_) {} }
    const r = await picar(bot, bot.blockAt(v), { bloque: tipo, pos: [x, y, z] }, tarea, 0)
    if (r.exito) { quitados++; fallos = 0; obras.quitarPuesto(o.id, [x, y, z]) } else { fallos++; causa = r.causa }
    await esperar(100)
  }
  const quedan = (obras.obra(o.id) || { bloques: [] }).bloques.length
  obras.cerrar(o.id, quedan ? 'a medias' : 'deshecha')
  let recogido = null
  if (quitados && !(tarea && tarea.cancelada)) { const r = await recoger(bot, ['6'], tarea); recogido = r.exito ? r.objetos : 0 }
  const datos = { obra: o.id, quitados, saltados, quedan, recogido, pos: bot.entity.position.floored().toArray() }
  if (!quedan) return { exito: true, causa: 'deshecha', ...datos }
  return { exito: false, causa: causa || 'a medias', ...datos }
}
