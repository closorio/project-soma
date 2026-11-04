// recoger_comida [radio=24] [evitar] [guardar] (F7.2): conseguir comida de día y con hambre (≤ 12, como el simulador; «guardar»: también
// sin hambre, para llevarla, como la etapa comida del capataz): primero la que hay en el suelo
// a ≤ 8 (manzanas, carne de un animal muerto…); si no, caza el animal de granja más cercano a ≤ radio (vaca, cerdo, oveja, pollo,
// conejo, champiñaca), con el arma que lleve o a puñetazos (atacar.pelear, sin romper bloques) y recoge lo que suelte.
// Éxito «cazado» o «recogido» (sube la comida del inventario). Fallos: sin hambre · de noche · nada que comer a la vista · se escapó ·
// lo perdí · tiempo agotado · cancelado. La amenaza la corta, como al simulador. Devuelve { exito, causa, animal, comida: [antes,
// después], golpes, s }.
const { dist, esperar } = require('./comun')
const recoger = require('./recoger')
const { pelear } = require('./atacar')
const { ponerArma } = require('./equipar')
const sv = require('./sv')

const HAMBRE = 12, SUELO = 8, MS = 30000
const ANIMALES = new Set(['cow', 'pig', 'sheep', 'chicken', 'rabbit', 'mooshroom'])

const comidaInv = (bot) => sv.comidas(bot).reduce((a, i) => a + i.count, 0)
const esComida = (bot, e) => { try { const n = e.getDroppedItem().name; return !!bot.registry.foodsByName[n] && sv.comidaComible(n) } catch (_) { return false } }

module.exports = async function recogerComida(bot, [radio, evitar, para], tarea) {
  const R = parseFloat(radio) || 24, t0 = Date.now(), c0 = comidaInv(bot)
  const fin = (exito, causa, extra = {}) => ({ exito, causa, comida: [c0, comidaInv(bot)], s: +((Date.now() - t0) / 1000).toFixed(1), ...extra })
  // 2026-11-03, banco M: tras morir, la etapa comida no avanzaba hasta que le entraba hambre (≈ 5 min dando vueltas)
  if (bot.food > HAMBRE && para !== 'guardar') return fin(false, 'sin hambre')
  if (sv.esNoche(bot)) return fin(false, 'de noche')
  // comida en el suelo
  const enSuelo = Object.values(bot.entities).filter(e => e.name === 'item' && dist(bot, e) <= SUELO && esComida(bot, e))
  if (enSuelo.length) {
    for (const e of enSuelo) { const n = e.getDroppedItem().name; await recoger(bot, [String(SUELO), n], tarea); if (tarea && tarea.cancelada) break }
    if (comidaInv(bot) > c0) return fin(true, 'recogido')
  }
  // F8.1: «sin:sheep» (el capataz, mientras falte la cama): las ovejas se guardan para la lana
  const sin = String(evitar || '').startsWith('sin:') ? new Set(String(evitar).slice(4).split(',')) : new Set()
  const presa = Object.values(bot.entities).filter(e => ANIMALES.has(e.name) && !sin.has(e.name) && dist(bot, e) <= R).sort((a, b) => dist(bot, a) - dist(bot, b))[0]
  if (!presa) return fin(false, 'nada que comer a la vista')
  try { await ponerArma(bot) } catch (_) {}
  const donde = presa.position.clone()
  const r = await pelear(bot, presa, { ms: MS, tarea, parar: () => (sv.esNoche(bot) ? 'de noche' : null) })
  const datos = { animal: presa.name, golpes: r.golpes }
  if (r.causa !== 'muerto') return fin(false, r.causa === 'huyó' ? 'se escapó' : r.causa, datos)
  await esperar(600) // lo que suelta tarda en aparecer
  const p = bot.entities[presa.id] ? presa.position : donde
  for (let k = 0; k < 2 && comidaInv(bot) === c0; k++) {
    const sueltos = Object.values(bot.entities).filter(e => e.name === 'item' && e.position.distanceTo(p) <= 4 && esComida(bot, e))
    if (!sueltos.length) break
    await recoger(bot, ['8', sueltos[0].getDroppedItem().name], tarea)
  }
  // F8.1: también lo demás que suelte (la lana de una oveja, el cuero): en el banco K se perdía la lana de las ovejas que se comían
  for (const e of Object.values(bot.entities).filter(x => x.name === 'item' && x.position.distanceTo(p) <= 4)) {
    let n = null
    try { n = e.getDroppedItem().name } catch (_) {}
    if (n && /_wool$|^leather$|^feather$/.test(n)) await recoger(bot, ['8', n], tarea)
  }
  return comidaInv(bot) > c0 ? fin(true, 'cazado', datos) : fin(false, 'no recogí nada', datos)
}
module.exports.ANIMALES = ANIMALES
module.exports.HAMBRE = HAMBRE // F7.5: bot/libre.js (¿sale del refugio a cazar?)
