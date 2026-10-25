// ir_a_mena TIPO [radio=32] [n=6] (F8.1): ir hasta la mena más cercana de ese tipo (coal_ore, iron_ore… o «mineral»; también su versión
// de deepslate), aunque esté enterrada, cavando el camino con los movimientos que pican y suben poniendo bloques (los de
// salir_del_refugio: nunca lo protegido; el navegador no pisa ni pica junto a la lava), hasta verla; y picarla, con las de su veta
// (vecinas del mismo tipo, hasta n), y recoger lo que suelten. La pide el capataz cuando minar falla con «nada que minar aquí»: en el
// banco K, minar seguía sin querer las menas a la vista (sus reglas de F7.7: dónde cae lo picado).
// Éxito: alguna picada. Fallos: no veo ninguna · sin pico · sin camino · tiempo agotado. Devuelve { exito, causa, picadas, rotos, puestos }.
const { goals } = require('mineflayer-pathfinder')
const { moverHasta, lejania } = require('./comun')
const { movimientos } = require('./salir_del_refugio')
const sv = require('./sv')
const { picar } = require('./picar_tronco')
const recoger = require('./recoger')
const LADOS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]

const MS = 90000
module.exports = async function irAMena(bot, [tipo = 'mineral', radio0, n0], tarea) {
  const radio = Math.min(64, parseInt(radio0) || 32), n = Math.min(16, parseInt(n0) || 6)
  const base = tipo.replace(/^deepslate_/, '')
  const vale = (n) => tipo === 'mineral' ? n.endsWith('_ore') : n === base || n === 'deepslate_' + base
  const p = bot.entity.position
  const menas = bot.findBlocks({ matching: (b) => vale(b.name), maxDistance: radio, count: 64 })
    .filter(v => sv.puedeTocar(v.x, v.y, v.z)).sort((a, b) => a.distanceTo(p) - b.distanceTo(p))
  if (!menas.length) return { exito: false, causa: `no veo ${tipo} a ≤ ${radio}` }
  const rotos = [], puestos = []
  const alCambiar = (viejo, nuevo) => {
    if (!viejo || !nuevo || viejo.position.distanceTo(bot.entity.position) > 4) return
    if (viejo.boundingBox === 'block' && nuevo.boundingBox === 'empty') rotos.push([viejo.position.x, viejo.position.y, viejo.position.z, viejo.name])
    else if (viejo.boundingBox === 'empty' && nuevo.boundingBox === 'block') puestos.push([nuevo.position.x, nuevo.position.y, nuevo.position.z, nuevo.name])
  }
  bot.on('blockUpdate', alCambiar)
  try {
    for (const v of menas.slice(0, 3)) {
      if (tarea && tarea.cancelada) return { exito: false, causa: 'cancelado', rotos, puestos }
      // hasta verla (no solo tenerla cerca): minar solo pica lo que se ve desde el ojo (F7.7); en el banco K se paraba al lado de la
      // mena tapada y minar decía «nada que minar» una y otra vez
      const meta = new goals.GoalLookAtBlock(v, bot.world, { reach: 4 })
      const r = await moverHasta(bot, meta, () => meta.isEnd(bot.entity.position.floored()) && lejania(bot, v) <= 4.3, { ms: MS, tarea, mov: movimientos(bot) })
      if (r !== 'listo') continue
      // picar la mena y su veta (las vecinas del mismo tipo al alcance), con la mejor herramienta; luego recoger lo caído
      let picadas = 0
      const cola = [v], vistas = new Set()
      while (cola.length && picadas < n && !(tarea && tarea.cancelada)) {
        const w = cola.shift(), clave = `${w.x},${w.y},${w.z}`
        if (vistas.has(clave)) continue
        vistas.add(clave)
        const b = bot.blockAt(w)
        if (!b || !vale(b.name) || lejania(bot, w) > 4.5 || !sv.puedeTocar(w.x, w.y, w.z)) continue
        if (b.harvestTools && !Object.keys(b.harvestTools).some(id => bot.inventory.items().some(i => i.type === +id)))
          return { exito: picadas > 0, causa: picadas ? 'picadas' : 'sin pico para ' + b.name, picadas, rotos, puestos }
        const { item } = sv.mejorHerramienta(bot, b)
        try { if (item) await bot.equip(item, 'hand') } catch (_) {}
        const p = await picar(bot, b, {}, tarea, 0)
        if (p.exito) { picadas++; for (const [dx, dy, dz] of LADOS6) cola.push(w.offset(dx, dy, dz)) }
      }
      if (picadas) await recoger(bot, ['6'], tarea)
      if (picadas) return { exito: true, causa: 'picadas', mena: tipo, picadas, pos: [v.x, v.y, v.z], rotos, puestos }
    }
    return { exito: false, causa: 'sin camino', rotos, puestos }
  } finally { bot.removeListener('blockUpdate', alCambiar) }
}
