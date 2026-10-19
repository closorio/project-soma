// huir [quién|-] [distancia=16] [segundos=20]: alejarse a ≥ distancia de una amenaza: la indicada (jugador o tipo de entidad)
// o, con «-» o sin nada, el hostil más cercano. Éxito = quedar a salvo, también si no había amenaza. Sin romper ni poner bloques.
// F7.6b: si se queda atascado (menos de 1 bloque en 1 s: en F7.6, en (82, −42), el bot se quedó 9 s contra un escalón con tres
// zombis pegando y murió seis veces de seis: la física de mineflayer le deja colgado contra la pared de un escalón de 1 bloque si
// salta tarde, sin tocar el suelo y sin caer), se suelta, retrocede un paso y prueba otro rumbo, primero de lado (90°); a la
// tercera, falla «atascado» (y el cuerpo, si le tienen acorralado, se defiende: la regla del usuario).
const { goals } = require('mineflayer-pathfinder')
const { irA } = require('../cerebro')
const zonas = require('../zonas')
const { buscarEntidad, conMovimientos, dist, hayCamino, hostilCercano } = require('./comun')

const DESVIOS = [0, 45, -45, 90, -90, 135, -135].map(g => g * Math.PI / 180)
const ATASCO_MS = 1000, ATASCOS = 3, GIROS = [0, 3, 4, 5, 6, 1, 2] // F7.6b: tras atascarse, de lado (±90°) y luego hacia atrás

// Punto de huida a D+4 de la amenaza: en línea recta lejos de ella y, si no hay camino a pie o cae en una zona vedada, con rumbos
// desviados. giro (F7.6b): tras atascarse, empezar por otro de los desvíos.
function puntoDeHuida(bot, e, D, giro = 0) {
  const p = bot.entity.position, a = e.position
  const base = Math.atan2(p.z - a.z, p.x - a.x), k = GIROS[giro % GIROS.length]
  for (const g of [...DESVIOS.slice(k), ...DESVIOS.slice(0, k)]) {
    const x = a.x + Math.cos(base + g) * (D + 4), z = a.z + Math.sin(base + g) * (D + 4)
    if (zonas.pasoVedado(Math.floor(x), Math.floor(p.y), Math.floor(z))) continue // no huir hacia dentro de una zona vedada
    const meta = new goals.GoalNearXZ(x, z, 2)
    if (hayCamino(bot, meta)) return meta
  }
  return null
}

// Anda hacia meta hasta ms; false si se atasca (F7.6b: menos de 1 bloque en ATASCO_MS; entonces suelta el objetivo).
async function tramo(bot, meta, ms) {
  let ref = { t: Date.now(), p: bot.entity.position.clone() }, atascado = false
  const vigia = setInterval(() => {
    const p = bot.entity.position
    if (p.distanceTo(ref.p) >= 1) ref = { t: Date.now(), p: p.clone() }
    else if (!atascado && Date.now() - ref.t > ATASCO_MS) { atascado = true; try { bot.pathfinder.setGoal(null) } catch (_) {} }
  }, 250)
  try { await irA(bot, meta, ms).catch(() => {}) } finally { clearInterval(vigia) }
  if (atascado) { // despegarse de la pared: soltar todo y un paso atrás
    bot.clearControlStates()
    bot.setControlState('back', true)
    await new Promise(r => setTimeout(r, 300))
    bot.clearControlStates()
  }
  return !atascado
}

module.exports = async function huir(bot, [quien, distancia, segundos], tarea) {
  const D = parseFloat(distancia) || 16
  const e = quien && quien !== '-' ? buscarEntidad(bot, quien, 2 * D) : hostilCercano(bot, D)
  if (!e || dist(bot, e) >= D) return { exito: true, causa: 'sin amenaza' }
  const d0 = dist(bot, e), ms = (parseFloat(segundos) || 20) * 1000, t0 = Date.now()
  let giro = 0, atascos = 0
  const r = await conMovimientos(bot, async () => {
    while (dist(bot, e) < D) {
      if (tarea && tarea.cancelada) return 'cancelado'
      if (!bot.entities[e.id]) return 'perdido'
      if (Date.now() - t0 > ms) return 'tiempo agotado'
      const meta = puntoDeHuida(bot, e, D, giro)
      if (!meta) return 'sin camino'
      if (await tramo(bot, meta, 4000)) atascos = 0 // replanificar cada 4 s: la amenaza puede moverse
      else if (++atascos >= ATASCOS) return 'atascado'
      else giro++ // atascado: otro rumbo
    }
    return 'listo'
  })
  const datos = { distancia: +dist(bot, e).toFixed(1), desde: +d0.toFixed(1), salud: bot.health }
  if (r === 'listo') return { exito: true, causa: 'a salvo', ...datos }
  if (r === 'perdido') return { exito: true, causa: 'amenaza desaparecida', ...datos }
  return { exito: false, causa: r, ...datos }
}
