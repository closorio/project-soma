// recoger_agua [radio=8] y verter agua|lava [x y z] (F8.0b, C7): el cubo. recoger_agua llena un cubo vacío en la fuente de agua más
// cercana (agua quieta, level 0) a ≤ radio; verter vacía el cubo de agua o de lava en esa casilla (o en una libre a mi lado),
// mirando a la cara de arriba del bloque de debajo, como haría un jugador. Nunca donde sv.puedeTocar lo prohíbe; en el mundo del
// usuario no se vierte lava. Éxito: el cubo lleno o el líquido en su sitio. Devuelven { exito, causa, pos }.
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const mundo = require('../mundo')
const { conLimite, esperar, moverHasta, lejania } = require('./comun')
const { sitioAlLado } = require('./colocar')
const sv = require('./sv')

const ALCANCE = 4.3
const tiene = (bot, n) => bot.inventory.items().find(i => i.name === n)

async function acercarse(bot, v, tarea) {
  if (lejania(bot, v) <= ALCANCE) return 'listo'
  return moverHasta(bot, new goals.GoalNear(v.x, v.y, v.z, 2), () => lejania(bot, v) <= ALCANCE, { ms: 20000, tarea })
}
async function usar(bot, item, mirar) {
  await conLimite(bot.equip(item, 'hand'), 3000)
  await bot.lookAt(mirar, true)
  await esperar(150)
  bot.activateItem()
  await esperar(500)
  bot.deactivateItem()
}

async function recogerAgua(bot, [radio0], tarea) {
  const cubo = tiene(bot, 'bucket')
  if (!cubo) return { exito: false, causa: tiene(bot, 'water_bucket') ? 'ya lleno' : 'sin cubo' }
  const radio = Math.min(16, parseInt(radio0) || 8)
  const id = bot.registry.blocksByName.water.id
  const fuentes = bot.findBlocks({ matching: (b) => b.type === id && (b.getProperties ? b.getProperties().level : b.metadata) == 0, maxDistance: radio, count: 40 })
    .filter(v => sv.puedeTocar(v.x, v.y, v.z))
  if (!fuentes.length) return { exito: false, causa: 'sin agua cerca' }
  for (const v of fuentes.slice(0, 4)) {
    if (tarea && tarea.cancelada) return { exito: false, causa: 'cancelado' }
    if ((await acercarse(bot, v, tarea)) !== 'listo') continue
    try { await usar(bot, tiene(bot, 'bucket'), v.offset(0.5, 0.5, 0.5)) } catch (_) {}
    if (tiene(bot, 'water_bucket')) return { exito: true, causa: 'lleno', pos: [v.x, v.y, v.z] }
  }
  return { exito: false, causa: 'no se llenó' }
}

async function verter(bot, [que = 'agua', ...resto], tarea) {
  const liquido = que === 'lava' ? 'lava' : 'water'
  if (liquido === 'lava' && mundo.nombre === 'usuario') return { exito: false, causa: 'en el mundo del usuario no se vierte lava' }
  const cubo = tiene(bot, liquido + '_bucket')
  if (!cubo) return { exito: false, causa: `sin cubo de ${que}` }
  let dest = resto.length >= 3 && resto.slice(0, 3).every(x => !isNaN(+x)) ? new Vec3(+resto[0], +resto[1], +resto[2]).floored() : sitioAlLado(bot)
  if (!dest) return { exito: false, causa: 'sin sitio' }
  if (!sv.puedePoner(dest.x, dest.y, dest.z)) return { exito: false, causa: 'casilla protegida' }
  const k = bot.blockAt(dest)
  if (k && sv.solido(k)) return { exito: false, causa: `ocupada (${k.name})` }
  if (!sv.solido(bot.blockAt(dest.offset(0, -1, 0)))) return { exito: false, causa: 'sin apoyo' }
  const m = await acercarse(bot, dest, tarea)
  if (m !== 'listo') return { exito: false, causa: 'no llego: ' + m }
  try { await usar(bot, cubo, dest.offset(0.5, 0.05, 0.5)) } catch (e) { return { exito: false, causa: 'no se pudo: ' + e.message } }
  await esperar(300)
  const ahora = bot.blockAt(dest)
  const ok = !!ahora && ahora.name === liquido
  return { exito: ok, causa: ok ? 'vertido' : 'no se vertió', pos: [dest.x, dest.y, dest.z], puestos: ok ? [[dest.x, dest.y, dest.z, liquido]] : [] }
}

module.exports = { recogerAgua, verter }
