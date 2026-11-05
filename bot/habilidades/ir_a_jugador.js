// ir_a_jugador [nombre] [segundos]: acercarse a ≤ 3 bloques de un jugador (por defecto el más cercano), siguiéndole si se mueve.
// Sin romper ni poner bloques. Acepta también el tipo de una entidad cercana (p. ej. villager) para las pruebas.
// Si el jugador está en una zona vedada (../zonas.json), no entra: va a la casilla de fuera más cercana y espera en el borde.
// Con «vedadas» (2026-11-02, la orden «ven»): entra en las zonas vedadas como en cualquier sitio; lo único vedado es romper bloques.
const { Movements, goals } = require('mineflayer-pathfinder')
const zonas = require('../zonas')
const { buscarEntidad, moverHasta, dist, prudentes } = require('./comun')

const CERCA = 3

// Como GoalFollow (meta dinámica que sigue a la entidad), pero con la entidad en una zona vedada la meta es el punto de fuera
// más cercano (zonas.puntoFuera), en horizontal. `fuera` = nombre de esa zona, o null. Lo usan ir_a_jugador y «sígueme» (io.js).
class GoalSeguirFuera extends goals.Goal {
  constructor(entidad, rango) { super(); Object.assign(this, { entidad, rango }); this.fijar() }
  fijar() {
    const p = this.entidad.position, f = zonas.puntoFuera(Math.floor(p.x), Math.floor(p.z))
    Object.assign(this, { x: f.x, y: Math.floor(p.y), z: f.z, fuera: f.zona })
  }
  heuristic(n) { return Math.hypot(this.x - n.x, this.z - n.z) + (this.fuera ? 0 : Math.abs(this.y - n.y)) }
  isEnd(n) {
    const dx = this.x - n.x, dz = this.z - n.z
    return this.fuera ? dx * dx + dz * dz <= 2 : dx * dx + (this.y - n.y) ** 2 + dz * dz <= this.rango * this.rango
  }
  hasChanged() {
    const antes = [this.x, this.y, this.z, this.fuera]
    this.fijar()
    const movido = Math.hypot(this.x - antes[0], this.y - antes[1], this.z - antes[2]) > (this.fuera ? 0 : this.rango)
    if (movido || this.fuera !== antes[3]) return true
    ;[this.x, this.y, this.z] = antes // como GoalFollow: no cambia la meta mientras la entidad no salga del rango
    return false
  }
  isValid() { return this.entidad != null }
  enElBorde(bot) { return !!this.fuera && Math.hypot(this.x + 0.5 - bot.entity.position.x, this.z + 0.5 - bot.entity.position.z) <= 1.6 }
}

async function caminar(bot, [nombre, segundos, vedadas], tarea) {
  const e = buscarEntidad(bot, nombre)
  if (!e) return { exito: false, causa: nombre ? 'no veo a ' + nombre : 'no veo a ningún jugador' }
  const d0 = dist(bot, e)
  if (d0 <= CERCA) return { exito: true, causa: 'ya estaba', distancia: +d0.toFixed(1) }
  const ms = (parseFloat(segundos) || Math.min(90, 10 + d0)) * 1000 // ~1 s por bloque de margen
  if (vedadas === 'vedadas') {
    const r = await moverHasta(bot, new goals.GoalFollow(e, CERCA - 1), () => dist(bot, e) <= CERCA, { ms, tarea, entidad: e, mov: prudentes(bot, { pisarVedadas: true }) })
    const datos = { distancia: +dist(bot, e).toFixed(1), desde: +d0.toFixed(1) }
    return r === 'listo' ? { exito: true, causa: 'llegué', ...datos } : { exito: false, causa: r === 'perdido' ? 'lo perdí de vista' : r, ...datos }
  }
  const meta = new GoalSeguirFuera(e, CERCA - 1)
  const r = await moverHasta(bot, meta, () => dist(bot, e) <= CERCA || meta.enElBorde(bot), { ms, tarea, entidad: e })
  const datos = { distancia: +dist(bot, e).toFixed(1), desde: +d0.toFixed(1), ...(meta.fuera ? { zona: meta.fuera } : {}) }
  if (r === 'listo') return { exito: true, causa: dist(bot, e) <= CERCA ? 'llegué' : `en el borde de ${meta.fuera}`, ...datos }
  return { exito: false, causa: r === 'perdido' ? 'lo perdí de vista' : r, ...datos }
}
// Con «insistir» (2026-11-04, prueba a mano: «ven» y la entrega se rendían bajo tierra o a 30 bloques): si no llega a pie, sube a la superficie
// y lo intenta otra vez; y si tampoco, una última vez cavando y poniendo bloques (el mundo solo se toca entonces, y fuera de las zonas protegidas).
module.exports = async function irAJugador(bot, [nombre, segundos, vedadas, insistir], tarea) {
  let r = await caminar(bot, [nombre, segundos, vedadas], tarea)
  const seguir = () => !r.exito && !r.zona && !(tarea && tarea.cancelada) && /sin camino|tiempo agotado/.test(String(r.causa))
  if (insistir !== 'insistir' || !seguir()) return r
  const { subirASuperficie, fuera } = require('./escalera')
  if (!fuera(bot)) {
    await subirASuperficie(bot, [], tarea)
    r = await caminar(bot, [nombre, segundos, vedadas], tarea)
    if (!seguir()) return r
  }
  const e = buscarEntidad(bot, nombre)
  if (!e) return r
  const ms = (parseFloat(segundos) || 60) * 1000
  const m = await moverHasta(bot, new goals.GoalFollow(e, CERCA - 1), () => dist(bot, e) <= CERCA, { ms, tarea, entidad: e, mov: zonas.aplicar(new Movements(bot)) })
  return m === 'listo' ? { exito: true, causa: 'llegué', cavando: true, distancia: +dist(bot, e).toFixed(1) } : r
}
module.exports.GoalSeguirFuera = GoalSeguirFuera
