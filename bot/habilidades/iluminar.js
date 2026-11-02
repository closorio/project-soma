// iluminar [radio=6] (F8.0b, C3): pone antorchas en el suelo alrededor hasta que ninguna casilla pisable del radio quede a más de
// ALCANCE_LUZ (en pasos de rejilla, como se apaga la luz) de una antorcha: así nada queda a oscuras (en 26.1 los monstruos solo
// salen con luz de bloque 0, y la antorcha da 14 y baja 1 por paso). El servidor no manda al bot los cambios de luz (F7.1): no se
// lee la luz, se cuentan las antorchas (las que ve y las que puso, en la memoria). Si no lleva antorchas y puede, fabrica 4.
// Éxito: el radio cubierto. Fallos: sin antorchas · sin sitio (nada pisable) · no llego. Devuelve { exito, causa, puestas, luz_min }.
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const memoria = require('../memoria')
const { nodo, moverHasta, lejania } = require('./comun')
const { colocar } = require('./colocar')
const sv = require('./sv')

const ALCANCE_LUZ = 6, MAX_PUESTAS = 8, MAX_RADIO = 10, ALCANCE = 4.5
const registro = (bot) => memoria(bot, 'antorchas', () => [])
const cuantas = (bot) => bot.inventory.items().filter(i => i.name === 'torch').reduce((a, i) => a + i.count, 0)
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)

// Casillas pisables del radio (aire con dos libres y suelo firme, sin líquido), de 3 abajo a 3 arriba del nodo.
function pisables(bot, c, radio) {
  const out = []
  for (let dx = -radio; dx <= radio; dx++) for (let dz = -radio; dz <= radio; dz++) {
    if (Math.hypot(dx, dz) > radio) continue
    for (let dy = -3; dy <= 3; dy++) {
      const v = c.offset(dx, dy, dz), k = bot.blockAt(v), a = bot.blockAt(v.offset(0, 1, 0)), s = bot.blockAt(v.offset(0, -1, 0))
      if (k && k.boundingBox === 'empty' && !sv.esLiquido(k) && a && a.boundingBox === 'empty' && sv.solido(s)) { out.push(v); break }
    }
  }
  return out
}
function antorchas(bot, c, radio) {
  const ids = ['torch', 'wall_torch'].map(n => bot.registry.blocksByName[n].id)
  const vistas = bot.findBlocks({ matching: ids, maxDistance: radio + ALCANCE_LUZ + 2, count: 200 })
  const propias = registro(bot).map(p => new Vec3(...p)).filter(p => ids.includes((bot.blockAt(p) || {}).type))
  return [...vistas, ...propias]
}
const peor = (cas, ant) => cas.map(v => ({ v, d: ant.length ? Math.min(...ant.map(t => manhattan(v, t))) : Infinity })).sort((a, b) => b.d - a.d)

module.exports = async function iluminar(bot, [radio0], tarea) {
  const radio = Math.min(MAX_RADIO, parseInt(radio0) || 6), c = nodo(bot), puestas = []
  if (!cuantas(bot)) {
    const r = await require('./fabricar')(bot, ['antorcha'], tarea)
    if (!r.exito && !cuantas(bot)) return { exito: false, causa: 'sin antorchas (' + r.causa + ')', puestas, luz_min: null }
  }
  const cas = pisables(bot, c, radio)
  if (!cas.length) return { exito: false, causa: 'sin sitio', puestas, luz_min: null }
  let causa = null
  for (;;) {
    const ant = antorchas(bot, c, radio), lista = peor(cas, ant)
    if (lista[0].d <= ALCANCE_LUZ) { causa = 'iluminado'; break }
    if (puestas.length >= MAX_PUESTAS) { causa = 'demasiadas'; break }
    if (!cuantas(bot)) { causa = 'sin antorchas'; break }
    if (tarea && tarea.cancelada) { causa = 'cancelado'; break }
    // la casilla más a oscuras que se pueda tocar
    const meta = lista.find(x => x.d > ALCANCE_LUZ && sv.puedePoner(x.v.x, x.v.y, x.v.z))
    if (!meta) { causa = 'protegido'; break }
    const v = meta.v
    if (lejania(bot, v) > ALCANCE) {
      const m = await moverHasta(bot, new goals.GoalNear(v.x, v.y, v.z, 2), () => lejania(bot, v) <= ALCANCE, { ms: 20000, tarea })
      if (m !== 'listo') { causa = 'no llego: ' + m; break }
    }
    const r = await colocar(bot, v, 'torch')
    if (!r.exito) { cas.splice(cas.indexOf(v), 1); if (!cas.length) { causa = 'sin sitio'; break } continue }
    puestas.push(r.pos)
    registro(bot).push(r.pos)
  }
  const fin = peor(cas, antorchas(bot, c, radio))[0]
  const luz_min = Number.isFinite(fin.d) ? Math.max(0, 14 - fin.d) : 0
  return { exito: causa === 'iluminado', causa, puestas, luz_min }
}
Object.assign(module.exports, { ALCANCE_LUZ, pisables, manhattan })
