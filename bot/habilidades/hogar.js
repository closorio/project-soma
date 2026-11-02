// Ir al hogar (2026-11-02, pedido del usuario: dormir, refugiarse, depositar y centinela se asocian principalmente a la zona de hogar):
// si el dueño tiene una zona de hogar (zonas.js) y el personaje está fuera, a ≤ max bloques y sin hostiles a ≤ 8, va hasta dentro. Es una
// preferencia: si no hay hogar, está lejos, hay peligro o no llega, el que llama sigue donde está. Devuelve { en: nombre|null, fue }.
const { goals } = require('mineflayer-pathfinder')
const zonas = require('../zonas')
const { moverHasta, prudentes, hostiles } = require('./comun')

module.exports = async function irAlHogar(bot, tarea, { max = 64 } = {}) {
  const p = bot.entity.position
  const dentro = zonas.hogarDe(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))
  if (dentro) return { en: dentro.nombre, fue: false }
  const h = zonas.hogarCercano(p.x, p.z)
  if (!h || h.dist > max || hostiles(bot, 8).length) return { en: null, fue: false }
  const radio = Math.max(1, Math.min(3, Math.floor(Math.min(h.zona.x2 - h.zona.x1, h.zona.z2 - h.zona.z1) / 2)))
  await moverHasta(bot, new goals.GoalNearXZ(h.cx, h.cz, radio), () => !!zonas.hogarDe(Math.floor(bot.entity.position.x), Math.floor(bot.entity.position.y), Math.floor(bot.entity.position.z)),
    { ms: (15 + h.dist) * 1000, tarea, mov: prudentes(bot, { pisarVedadas: true }) })
  const q = bot.entity.position, ahora = zonas.hogarDe(Math.floor(q.x), Math.floor(q.y), Math.floor(q.z))
  return { en: ahora ? ahora.nombre : null, fue: !!ahora }
}
