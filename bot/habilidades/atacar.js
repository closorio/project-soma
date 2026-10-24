// atacar [tipo|id:N|-] [segundos=20] [puno] [acorralado] (F7.2): pelear con un hostil a la vista (≤ 16): el de ese tipo (zombie, skeleton,
// spider…), la entidad N (el reflejo de defensa ataca a quien le acaba de golpear) o, con «-» o nada, el más cercano.
// Equipa la mejor arma (sv.mejorArma), le persigue sin romper ni poner bloques y le golpea con la barra de ataque llena (espada cada
// 0,65 s) en cuanto lo tiene a ≤ 3 bloques, mirándole. Al esqueleto se le acerca (de lejos dispara).
// Se niega (regla del usuario, 2026-10-15): con un creeper (se aparta: huir a 12) · con salud < 8 · con más de 2 hostiles a la
// vista · sin arma (salvo «puno»: el simulador supone que sin arma se niega). Y deja de pelear por lo mismo a mitad. Con
// «acorralado» (el reflejo, cuando huir ha fallado y le siguen pegando) no se niega ni para por la salud ni por cuántos son.
// Éxito: el hostil muere («muerto») o se va a > 16 («huyó»). Fallos: sin hostil · creeper · salud baja · demasiados · sin arma ·
// lo perdí · sin camino · tiempo agotado · cancelado. No la corta la amenaza ni un golpe: es la respuesta a ellos.
// Devuelve { exito, causa, objetivo, golpes, salud: [antes, después], dist, s }.
const { goals } = require('mineflayer-pathfinder')
const { conMovimientos, dist, esperar, hostiles, prudentes } = require('./comun')
const huir = require('./huir')
const sv = require('./sv')
const { ponerArma } = require('./equipar')
const { NUNCA_ATACAR } = require('./taxonomia')

const RADIO = 16, ALCANCE = 3, SALUD_MIN = 8, MAX_HOSTILES = 2, CREEPER_CERCA = 5

// El objetivo: id:N (cualquier entidad viva a la vista), un tipo de entidad o el hostil más cercano.
function elegir(bot, quien) {
  const lista = hostiles(bot, RADIO).filter(e => sv.vivo(bot, e))
  if (quien && /^id:\d+$/.test(quien)) { const e = bot.entities[+quien.slice(3)]; return e && sv.vivo(bot, e) && dist(bot, e) <= RADIO ? e : null }
  if (quien && quien !== '-') return lista.find(e => e.name === quien) || null
  return lista[0] || null
}

// Distancia del ojo al punto más cercano de la caja de la entidad (alcance del golpe, como el juego: 3 bloques).
function alcanceA(bot, e) {
  const ojo = bot.entity.position.offset(0, 1.62, 0), w = (e.width || 0.6) / 2, h = e.height || 1.8, p = e.position
  const c = (o, a, b) => Math.max(a, Math.min(b, o)) - o
  return Math.hypot(c(ojo.x, p.x - w, p.x + w), c(ojo.y, p.y, p.y + h), c(ojo.z, p.z - w, p.z + w))
}

// Pelear con la entidad e hasta que muera, se aleje a > RADIO o salte `parar()` (devuelve la causa de parar). Sin romper ni poner
// bloques. La usan atacar (con hostiles) y recoger_comida (con animales). Devuelve { causa, golpes, muerto }.
async function pelear(bot, e, { ms = 20000, tarea = null, parar = () => null, mov = null } = {}) {
  let muerto = false, golpes = 0, ultimo = 0, sinCamino = 0
  const alMorir = (x) => { if (x && x.id === e.id) muerto = true }
  const alCalcular = (r) => { sinCamino = r.status === 'noPath' ? sinCamino + 1 : 0 }
  bot.on('entityDead', alMorir)
  bot.on('path_update', alCalcular)
  const t0 = Date.now()
  try {
    return await conMovimientos(bot, async () => {
      bot.pathfinder.setGoal(new goals.GoalFollow(e, 1.5), true)
      for (;;) {
        if (muerto) return { causa: 'muerto', golpes, muerto }
        if (!bot.entities[e.id] || e.isValid === false) {
          // sin el aviso de muerte: si acababa de golpearle, lo más probable es que haya muerto
          return Date.now() - ultimo < 1500 ? { causa: 'muerto', golpes, muerto: true } : { causa: 'lo perdí', golpes, muerto }
        }
        if (tarea && tarea.cancelada) return { causa: 'cancelado', golpes, muerto }
        if (dist(bot, e) > RADIO) return { causa: 'huyó', golpes, muerto }
        const p = parar()
        if (p) return { causa: p, golpes, muerto }
        if (Date.now() - t0 > ms) return { causa: 'tiempo agotado', golpes, muerto }
        if (sinCamino >= 3 && !bot.pathfinder.isMoving() && alcanceA(bot, e) > ALCANCE) return { causa: 'sin camino', golpes, muerto }
        const cada = sv.cadencia(bot.heldItem && bot.heldItem.name)
        if (alcanceA(bot, e) <= ALCANCE && Date.now() - ultimo >= cada) {
          await bot.lookAt(e.position.offset(0, (e.height || 1.8) * 0.75, 0), true)
          bot.attack(e)
          golpes++
          ultimo = Date.now()
        }
        await esperar(50)
      }
    }, mov || prudentes(bot))
  } finally {
    bot.removeListener('entityDead', alMorir)
    bot.removeListener('path_update', alCalcular)
  }
}

module.exports = async function atacar(bot, args, tarea) {
  const [quien, segundos] = args || []
  const conPuno = (args || []).includes('puno'), acorralado = (args || []).includes('acorralado')
  const ms = (parseFloat(segundos) || 20) * 1000, t0 = Date.now(), salud0 = bot.health
  const e = elegir(bot, quien)
  if (!e) return { exito: false, causa: 'sin hostil' }
  const datos = () => ({ objetivo: e.name, salud: [salud0, bot.health], dist: +dist(bot, e).toFixed(1), s: +((Date.now() - t0) / 1000).toFixed(1) })
  if (sv.tipoHostil(e) === 'creeper') { // nunca se pelea con un creeper: apartarse
    const h = await huir(bot, ['creeper', '12', '10'], tarea)
    return { exito: false, causa: 'creeper', huida: h.causa, golpes: 0, ...datos() }
  }
  // F8.0a: tampoco con creaking, ghast, warden… (taxonomia.NUNCA_ATACAR; el creeper ya tiene su caso)
  if (NUNCA_ATACAR.has(e.name)) return { exito: false, causa: 'nunca atacar', golpes: 0, ...datos() }
  if (bot.health < SALUD_MIN && !acorralado) return { exito: false, causa: 'salud baja', golpes: 0, ...datos() }
  if (hostiles(bot, RADIO).length > MAX_HOSTILES && !acorralado) return { exito: false, causa: 'demasiados', golpes: 0, ...datos() }
  let arma = null
  try { arma = await ponerArma(bot) } catch (_) {}
  if (!arma && !conPuno) return { exito: false, causa: 'sin arma', golpes: 0, ...datos() }
  const parar = () => {
    if (hostiles(bot, CREEPER_CERCA).some(x => sv.tipoHostil(x) === 'creeper')) return 'creeper'
    if (acorralado) return null
    if (bot.health < SALUD_MIN) return 'salud baja'
    if (hostiles(bot, RADIO).length > MAX_HOSTILES) return 'demasiados'
    return null
  }
  const r = await pelear(bot, e, { ms: Math.max(1000, ms - (Date.now() - t0)), tarea, parar })
  const exito = r.causa === 'muerto' || r.causa === 'huyó'
  return { exito, causa: r.causa, golpes: r.golpes, arma: arma ? arma.arma : null, ...datos() }
}
module.exports.pelear = pelear
module.exports.alcanceA = alcanceA
