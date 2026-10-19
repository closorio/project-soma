// ir_a_arbol [pasos=80]: andar con la política de la red (cerebro, F1) hasta tener un tronco en la casilla de enfrente.
// No pica: eso es picar_tronco. Elige el tronco alcanzable a pie más cercano (descarta agua y bucles); `excluir` (lo usa
// ir_a_otro_arbol): troncos objetivo de los compañeros, cuyos árboles no elige.
// F7.7 (fuera del mundo del usuario): en las laderas el árbol quedaba «enfrente» con el tronco 8-12 bloques por encima (la columna
// de enfrente cuenta troncos hasta 9 más arriba) y picar_tronco fallaba «fuera de alcance». Si al llegar no hay tronco al alcance,
// va con el navegador (sin romper ni poner nada) a un sitio desde el que se alcance el tronco más bajo de esa columna; si no hay
// camino, marca la columna como agotada (no vuelve a ella en 10 min) y falla «tronco fuera de alcance».
const { goals } = require('mineflayer-pathfinder')
const cerebro = require('../cerebro')
const mundo = require('../mundo')
const { alAlcance } = require('./picar_tronco')
const { hayCamino, lejania, moverHasta, prudentes } = require('./comun')

const CAUSAS = { 'sin árbol': 'sin árbol', bloqueado: 'bloqueado', pasos: 'pasos agotados', cancelado: 'cancelado' }
const ALCANCE = 4.5

// Meta: un sitio desde cuyo ojo el bloque v queda al alcance de la mano (como lejania(), desde el centro del nodo).
class GoalAlcance extends goals.Goal {
  constructor(v) { super(); this.v = v }
  heuristic(n) { return Math.hypot(n.x - this.v.x, n.y - this.v.y, n.z - this.v.z) }
  isEnd(n) {
    const c = (o, a) => Math.max(a, Math.min(a + 1, o)) - o, v = this.v
    return Math.hypot(c(n.x + 0.5, v.x), c(n.y + 1.62, v.y), c(n.z + 0.5, v.z)) <= ALCANCE - 0.3
  }
}
async function alcanzarTronco(bot, t, tarea) {
  let v = t // el tronco más bajo de la columna
  for (let k = bot.blockAt(v.offset(0, -1, 0)); k && k.name.endsWith('_log'); k = bot.blockAt(v.offset(0, -1, 0))) v = v.offset(0, -1, 0)
  const meta = new GoalAlcance(v)
  if (hayCamino(bot, meta, 400, prudentes(bot))) {
    const r = await moverHasta(bot, meta, () => lejania(bot, v) <= ALCANCE - 0.3 && bot.entity.onGround, { ms: 15000, tarea })
    if (r === 'listo' && alAlcance(bot).length) { cerebro.ultimo(bot).tronco = v; return true }
  }
  cerebro.marcarAgotada(bot, v)
  return false
}

module.exports = async function irAArbol(bot, [pasos], tarea, excluir = []) {
  const r = await cerebro.bucle(bot, parseInt(pasos) || 80, { hasta: 'enfrente', tarea, excluir })
  const datos = { pasos: r.pasos, tronco: r.tronco ? [r.tronco.x, r.tronco.y, r.tronco.z] : null }
  if (r.fin === 'enfrente' && mundo.nombre !== 'usuario' && r.tronco && !alAlcance(bot).length) {
    if (!(await alcanzarTronco(bot, r.tronco, tarea))) return { exito: false, causa: 'tronco fuera de alcance', ...datos }
    const t = cerebro.ultimo(bot).tronco
    return { exito: true, causa: 'árbol enfrente', ...datos, tronco: [t.x, t.y, t.z], ladera: true }
  }
  if (r.fin === 'enfrente') return { exito: true, causa: 'árbol enfrente', ...datos }
  return { exito: false, causa: CAUSAS[r.fin] || r.fin, ...datos, traza: r.log.slice(-10).join(' ') }
}
