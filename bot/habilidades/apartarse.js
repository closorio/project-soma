// apartarse (F7.2): alejarse de la lava, de un borde con caída de más de 3 bloques y del agua honda (los peligros de los sentidos de
// F7.1: lava_cerca, caida y agua_profunda, mirados a ≤ 3 bloques) hasta un sitio a 4-7 bloques sin ninguno de ellos, con suelo seco
// y camino a pie con los movimientos prudentes y secos (no pisa agua ni baja más de 3; si ya está en el agua, nadando). Prefiere los
// sitios del lado contrario al peligro. Éxito «a salvo» («sin peligro» si no lo había). Fallo «sin camino» (o lo que diga el
// navegador). Es un reflejo de io.js; no lo corta la amenaza (es corto y de seguridad).
// Devuelve { exito, causa, peligros: {caida, lava, agua}, pos, destino, s }.
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const parcela = require('../parcela')
const { hayCaida, liquidos } = require('../observacion')
const { hayCamino, moverHasta, nodo, prudentes, prudentesSecos } = require('./comun')
const sv = require('./sv')

const RADIOS = [4, 5, 6, 7], RUMBOS = 16, R = 3

function peligros(bot, b) {
  const { lava, honda } = liquidos(bot, b)
  return { caida: hayCaida(bot, b), lava, agua: honda }
}
const alguno = (p) => p.caida || p.lava || p.agua

// El centro de lo peligroso a ≤ 3 (lava, agua honda y columnas sin suelo), para huir del lado contrario.
function foco(bot, b) {
  let sx = 0, sz = 0, n = 0
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) for (let dy = -R; dy <= 1; dy++) {
    const k = bot.blockAt(b.offset(dx, dy, dz))
    if (!k) continue
    const debajo = bot.blockAt(b.offset(dx, dy - 1, dz))
    if (k.name === 'lava' || (sv.esLiquido(k) && sv.esLiquido(debajo)) || (dy === 0 && k.boundingBox === 'empty' && !sv.solido(debajo) && !sv.esLiquido(debajo))) {
      sx += dx; sz += dz; n++
    }
  }
  return n ? { x: b.x + sx / n, z: b.z + sz / n } : null
}

module.exports = async function apartarse(bot, args, tarea) {
  const t0 = Date.now(), b = nodo(bot), p0 = peligros(bot, b)
  const datos = (extra = {}) => ({ peligros: p0, pos: nodo(bot).toArray(), s: +((Date.now() - t0) / 1000).toFixed(1), ...extra })
  if (!alguno(p0)) return { exito: true, causa: 'sin peligro', ...datos() }
  const f = foco(bot, b) || { x: b.x, z: b.z }
  const cands = []
  for (const r of RADIOS) for (let k = 0; k < RUMBOS; k++) {
    const a = 2 * Math.PI * k / RUMBOS, x = Math.floor(b.x + 0.5 + r * Math.cos(a)), z = Math.floor(b.z + 0.5 + r * Math.sin(a))
    const s = parcela.superficie(bot, x, z, b.y, 3, 4)
    if (!s) continue
    const p = new Vec3(x, s.y + 1, z)
    if (alguno(peligros(bot, p))) continue
    cands.push({ p, lejos: Math.hypot(x + 0.5 - f.x, z + 0.5 - f.z) - 0.3 * r })
  }
  cands.sort((a, c) => c.lejos - a.lejos)
  const enAgua = sv.esLiquido(bot.blockAt(b))
  const mov = enAgua ? prudentes(bot) : prudentesSecos(bot)
  let r = 'sin camino', destino = null
  for (const c of cands.slice(0, 8)) {
    if (tarea && tarea.cancelada) return { exito: false, causa: 'cancelado', ...datos() }
    const meta = new goals.GoalBlock(c.p.x, c.p.y, c.p.z)
    if (!hayCamino(bot, meta, 250, mov)) continue
    destino = c.p.toArray()
    r = await moverHasta(bot, meta, () => nodo(bot).distanceTo(c.p) <= 1 && bot.entity.onGround, { ms: 12000, tarea, mov })
    if (r === 'listo') break
  }
  // 2026-11-04, banco M: en medio de un lago no hay sitio a 4-7 («sin camino», 29 veces, y refugiarse tampoco puede): explora hasta la orilla
  if (enAgua && !destino && args[0] !== 'sin_explorar') {
    const ex = await require('./explorar')(bot, ['-', '24', '40'], tarea)
    return { exito: !!ex.exito, causa: ex.exito ? 'a salvo' : ex.causa, ...datos({ destino }) }
  }
  if (r === 'listo' || !alguno(peligros(bot, nodo(bot)))) return { exito: true, causa: 'a salvo', ...datos({ destino }) }
  return { exito: false, causa: r, ...datos({ destino, quedan: peligros(bot, nodo(bot)) }) }
}
module.exports.peligros = peligros
