// ir_a_mena TIPO [radio=32] (F8.1): ir hasta la mena más cercana de ese tipo (coal_ore, iron_ore… o «mineral»; también su versión de
// deepslate), aunque esté enterrada, cavando el camino con los movimientos que pican y suben poniendo bloques (los de
// salir_del_refugio: nunca lo protegido; el navegador no pisa ni pica junto a la lava). Para cuando la mena queda al alcance de la
// mano (≤ 4,5) con una cara al aire: entonces minar ya la ve. La pide el capataz cuando minar falla con «nada que minar aquí».
// Éxito: al lado de la mena. Fallos: no veo ninguna · sin camino · tiempo agotado. Devuelve { exito, causa, mena, pos, rotos, puestos }.
const { goals } = require('mineflayer-pathfinder')
const { moverHasta, lejania } = require('./comun')
const { movimientos } = require('./salir_del_refugio')
const sv = require('./sv')

const MS = 90000
module.exports = async function irAMena(bot, [tipo = 'mineral', radio0], tarea) {
  const radio = Math.min(64, parseInt(radio0) || 32)
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
      if (r === 'listo') return { exito: true, causa: 'al lado', mena: bot.blockAt(v)?.name, pos: [v.x, v.y, v.z], rotos, puestos }
    }
    return { exito: false, causa: 'sin camino', rotos, puestos }
  } finally { bot.removeListener('blockUpdate', alCambiar) }
}
