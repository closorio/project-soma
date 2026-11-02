// Ir al hogar (2026-11-02, pedido del usuario: dormir, refugiarse, depositar y centinela se asocian principalmente a la zona de hogar):
// si el dueño tiene una zona de hogar (zonas.js) y el personaje está fuera, a ≤ max bloques (400 por defecto; va por tramos, comun.viajeLargo) y sin hostiles a ≤ 8, va hasta dentro. Es una
// preferencia: si no hay hogar, está lejos, hay peligro o no llega, el que llama sigue donde está. Devuelve { en: nombre|null, fue }.
const zonas = require('../zonas')
const { viajeLargo, prudentes, hostiles } = require('./comun')

module.exports = async function irAlHogar(bot, tarea, { max = 400 } = {}) {
  const p = bot.entity.position
  const dentro = zonas.hogarDe(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))
  if (dentro) return { en: dentro.nombre, fue: false }
  const h = zonas.hogarCercano(p.x, p.z)
  if (!h || h.dist > max || hostiles(bot, 8).length) return { en: null, fue: false }
  const enHogar = () => !!zonas.hogarDe(Math.floor(bot.entity.position.x), Math.floor(bot.entity.position.y), Math.floor(bot.entity.position.z))
  await viajeLargo(bot, { x: h.cx, y: p.y, z: h.cz }, enHogar, { tarea, ms: (h.dist * 1.5 + 30) * 1000, mov: prudentes(bot, { pisarVedadas: true }) })
  const q = bot.entity.position, ahora = zonas.hogarDe(Math.floor(q.x), Math.floor(q.y), Math.floor(q.z))
  return { en: ahora ? ahora.nombre : null, fue: !!ahora }
}
