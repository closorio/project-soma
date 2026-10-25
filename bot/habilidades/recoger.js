// recoger [radio=8] [filtro]: ir a por los objetos caídos en el radio, del más cercano al más lejano (máx. 8), sin romper bloques.
// Con filtro (p. ej. «_log»), solo los objetos cuyo nombre lo contiene: sin él persigue también huevos, brotes… Éxito si entra algo.
// F7.7, fuera del mundo del usuario: los inalcanzados se olvidan al minuto (no a los 3), «otra_vez» (la orden «recoge») los vuelve
// a intentar todos, y un objeto a ≤ 2 bloques al que no llegó andando (en un hueco bajo la pared del pozo, en el hoyo que dejó
// minar) se intenta otra vez pudiendo picar solo alrededor de él (lo picado va a obras.json como lo de minar; datos: rotos).
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { irA } = require('../cerebro')
const memoria = require('../memoria')
const mundo = require('../mundo')
const obras = require('../obras')
const zonas = require('../zonas')
const { conMovimientos, dist, esperar, prudentes } = require('./comun')

const SV = mundo.nombre !== 'usuario'

// Meta: un sitio desde el que el objeto entra en la caja de recogida (caja del jugador +1 en horizontal, +0,5 en vertical).
// Con GoalNear(…, 1) el bot intentaba subirse al tocón donde cae el tronco, sin hueco para la cabeza.
class GoalRecoger extends goals.Goal {
  constructor(p) { super(); this.p = p }
  heuristic(n) { return Math.hypot(n.x + 0.5 - this.p.x, n.y - this.p.y, n.z + 0.5 - this.p.z) }
  isEnd(n) {
    return Math.abs(n.x + 0.5 - this.p.x) <= 1.2 && Math.abs(n.z + 0.5 - this.p.z) <= 1.2 && this.p.y >= n.y - 0.5 && this.p.y <= n.y + 2.2
  }
}

const nombreObjeto = (e) => { try { return e.getDroppedItem().name } catch (_) { return 'objeto' } }

// La meta se mide desde el centro de la casilla, pero Ío puede quedar descentrado con el objeto justo fuera de su caja de
// recogida (lo típico: el tronco caído en el hueco sobre el tocón, a la altura de la cabeza). Agachado (no cae por los bordes),
// camina hacia él como mucho 1 s.
async function arrimarse(bot, e) {
  const h = () => Math.hypot(e.position.x - bot.entity.position.x, e.position.z - bot.entity.position.z)
  if (h() > 2.5 || Math.abs(e.position.y - bot.entity.position.y) > 2) return
  await bot.lookAt(e.position, true)
  bot.setControlState('sneak', true); bot.setControlState('forward', true)
  try { for (let t = 0; t < 10 && bot.entities[e.id] && h() > 0.4; t++) await esperar(100) } finally { bot.clearControlStates() }
}

// Objetos a los que no llegó hace menos de 3 min (id → hora): otra llamada no vuelve a gastar tiempo en ellos y la orden obs
// no los cuenta (con 1 min caducaban entre dos llamadas largas: huevos tras la valla de un corral). Uno por personaje.
const RECUERDO = SV ? 60000 : 180000 // F7.7: fuera del mundo del usuario, 1 min (Alma volvía a pedir «recoge» y no lo intentaba)
const inalcanzados = (bot) => memoria(bot, 'inalcanzados', () => new Map())
const inalcanzado = (bot, e) => Date.now() - (inalcanzados(bot).get(e.id) ?? -Infinity) < RECUERDO

// F7.7: movimientos para llegar a un objeto cercano encerrado: los prudentes, pudiendo picar solo en su columna y las de al lado, de
// su altura a 2 por encima, y nada protegido, de una obra ni que tarde más de 3 s con la mejor herramienta (piedra a mano, no).
function cavando(bot, c) {
  const sv = require('./sv') // aquí y no arriba: sv → observacion → recoger
  const m = prudentes(bot)
  m.canDig = true
  m.exclusionAreasBreak.push((k) => {
    const p = k && k.position
    if (!p) return Infinity // sin posición (chunk sin cargar): no romper
    const cerca = Math.abs(p.x - c.x) <= 1 && Math.abs(p.z - c.z) <= 1 && p.y >= c.y && p.y <= c.y + 2
    return cerca && sv.puedeTocar(p.x, p.y, p.z) && !sv.NO_PICAR.test(k.name) && sv.mejorHerramienta(bot, k).ms <= 3000 ? 0 : Infinity
  })
  return m
}
const CERCA_H = 2, CERCA_V = 2

module.exports = async function recoger(bot, args, tarea) {
  const palabras = (args || []).filter(Boolean)
  const otraVez = SV && palabras.includes('otra_vez')
  const [radio, filtro] = palabras.filter(a => a !== 'otra_vez')
  const R = parseFloat(radio) || 8
  const vale = (e) => !filtro || [filtro, 'objeto'].some(f => nombreObjeto(e).includes(f)) // sin metadatos aún: probar
  const total = () => bot.inventory.items().reduce((a, i) => a + i.count, 0)
  const enRadio = () => Object.values(bot.entities).filter(e => e.name === 'item' && dist(bot, e) <= R && vale(e))
  for (const [id, t] of inalcanzados(bot)) if (Date.now() - t > RECUERDO || otraVez) inalcanzados(bot).delete(id)
  // lo caído dentro de una zona vedada (../zonas.json) no se recoge: se da por inalcanzable (tampoco lo cuenta la orden obs)
  for (const e of enRadio()) if (zonas.pasoVedado(Math.floor(e.position.x), Math.floor(e.position.y), Math.floor(e.position.z))) inalcanzados(bot).set(e.id, Date.now())
  const siguiente = () => enRadio().filter(e => !inalcanzado(bot, e)).sort((a, b) => dist(bot, a) - dist(bot, b))[0]
  if (!enRadio().length) return { exito: false, causa: 'nada que recoger' }
  // lleno solo si nada de lo que hay cerca cabe tampoco en una pila a medias
  const cabe = (e) => { try { const o = e.getDroppedItem(); return bot.inventory.items().some(i => i.name === o.name && i.count < i.stackSize) } catch (_) { return false } }
  if (bot.inventory.emptySlotCount() === 0 && !enRadio().some(cabe)) return { exito: false, causa: 'inventario lleno' }
  const antes = total()
  const fallidos = [] // para diagnosticar «no llegó»: qué objeto y dónde
  const rotos = [] // F7.7: lo que picó para llegar a un objeto encerrado
  await conMovimientos(bot, async () => {
    for (let k = 0; k < 8; k++) {
      const e = siguiente()
      if (!e || (tarea && tarea.cancelada)) break
      const bajo = bot.blockAt(e.position.offset(0, -0.3, 0))?.name || '?'
      // en la copa (sobre hojas, más de 2 bloques por encima): sin romper bloques no se llega; no gastar 5 s buscando camino
      if (!(bajo.endsWith('_leaves') && e.position.y - bot.entity.position.y > 2)) {
        await irA(bot, new GoalRecoger(e.position.clone()), 8000).catch(() => {})
        for (let w = 0; w < 5 && bot.entities[e.id]; w++) await esperar(100) // el objeto tarda en saltar al inventario
        if (bot.entities[e.id] && !(tarea && tarea.cancelada)) await arrimarse(bot, e)
        for (let w = 0; w < 5 && bot.entities[e.id]; w++) await esperar(100)
      }
      const h = () => Math.hypot(e.position.x - bot.entity.position.x, e.position.z - bot.entity.position.z)
      if (SV && bot.entities[e.id] && !(tarea && tarea.cancelada) && h() <= CERCA_H && Math.abs(e.position.y - bot.entity.position.y) <= CERCA_V) {
        const c = e.position.floored(), antes = new Map()
        for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 2; dy++) for (let dz = -1; dz <= 1; dz++) {
          const k = bot.blockAt(c.offset(dx, dy, dz)); if (k) antes.set(`${c.x + dx},${c.y + dy},${c.z + dz}`, k.name)
        }
        bot.pathfinder.setMovements(cavando(bot, c))
        try { await irA(bot, new GoalRecoger(e.position.clone()), 8000).catch(() => {}) } finally { bot.pathfinder.setMovements(prudentes(bot)) }
        for (let w = 0; w < 5 && bot.entities[e.id]; w++) await esperar(100)
        if (bot.entities[e.id] && !(tarea && tarea.cancelada)) await arrimarse(bot, e)
        for (const [k, n] of antes) { // lo picado: a obras.json (minados), para reponerlo como lo de minar
          const [x, y, z] = k.split(',').map(Number), ahora = bot.blockAt(new Vec3(x, y, z))
          if (ahora && ahora.name !== n && ahora.boundingBox === 'empty') { rotos.push([x, y, z, n]); obras.anotarMinado(bot.username, [x, y, z], n, bot.heldItem ? bot.heldItem.name : null) }
        }
        for (let w = 0; w < 5 && bot.entities[e.id]; w++) await esperar(100)
      }
      if (bot.entities[e.id]) { // diagnóstico: bloque bajo el objeto y altura respecto a Ío (copa, tocón, hoyo…)
        inalcanzados(bot).set(e.id, Date.now())
        fallidos.push(`${nombreObjeto(e)}@${e.position.floored()} sobre ${bajo} dy=${(e.position.y - bot.entity.position.y).toFixed(1)} d=${dist(bot, e).toFixed(1)}`)
      }
    }
  })
  const n = total() - antes, quedan = enRadio().length
  const datos = { quedan, ...(fallidos.length ? { fallidos: fallidos.slice(0, 4).join(' ') } : {}), ...(rotos.length ? { rotos } : {}) }
  if (n > 0) return { exito: true, causa: 'recogido', objetos: n, ...datos }
  return { exito: false, causa: tarea && tarea.cancelada ? 'cancelado' : 'no llegó', ...datos }
}
module.exports.inalcanzado = inalcanzado
