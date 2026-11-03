// Estado de progresión de un personaje (F8.1, PLAN_F8_perfiles.md): lo que miran las condiciones `pre` y `objetivo` de las etapas
// de los perfiles v2 (perfiles/v2/_etapas.json → estado: inv, memoria, hitos), y en qué etapa del rol está.
//   estado(bot) → { inv: { troncos, piedra, hierro, pico (0/.33/.66/1), cama, … }, memoria: { base, horno, casa, … }, hitos: { … } }
//   cumple(condicion, estado) → true si se cumple entera; etapaActual(rol, estado, hechas) → la primera etapa sin hacer cuyo pre
//   se cumple (o la primera sin hacer, si ninguna lo cumple: el capataz la intentará igual) o null si ya están todas.
// Una etapa hecha queda hecha (memoria persistente: etapas[rol][id]) aunque luego se gaste lo que pedía (el hierro del pico), salvo las
// de «repetir», que se vuelven a mirar cada vez.
const memoria = require('./memoria')
const persistente = require('./memoria_persistente')
const sv = require('./habilidades/sv')
const { puntosArmadura } = require('./observacion')

const NIVEL = { wooden: 0.33, golden: 0.33, stone: 0.66, copper: 0.66, iron: 1, diamond: 1, netherite: 1 }
const nivel = (items, sufijo) => Math.max(0, ...items.filter(i => i.name.endsWith(sufijo)).map(i => NIVEL[i.name.split('_')[0]] || 0))
const cuenta = (items, prueba) => items.filter(i => prueba(i.name)).reduce((a, i) => a + i.count, 0)

function estado(bot) {
  const items = bot.inventory.items()
  const c = (re) => cuenta(items, n => re.test(n))
  const d = persistente.de(bot) || {}, yo = memoria(bot)
  const inv = {
    troncos: c(/_log$/), tablones: c(/_planks$/), palos: c(/^stick$/), piedra: c(/^(cobblestone|cobbled_deepslate|blackstone)$/),
    carbon: c(/^(coal|charcoal)$/), hierro_mena: c(/^raw_iron$/), hierro: c(/^iron_ingot$/),
    comida: sv.comidas(bot).reduce((a, i) => a + i.count, 0), colocables: sv.cuantosColocables(bot), antorchas: c(/^torch$/),
    // 2026-11-02: lo que mide el rol minero (conseguir.js)
    cobre: c(/^(raw_copper|copper_ingot)$/), oro: c(/^(raw_gold|gold_ingot)$/), lapis: c(/^lapis_lazuli$/), deepslate: c(/^cobbled_deepslate$/),
    redstone: c(/^redstone$/), diamante: c(/^diamond$/), obsidiana: c(/^obsidian$/), varas_blaze: c(/^blaze_rod$/),
    perlas: c(/^ender_pearl$/), ojos: c(/^ender_eye$/),
    pico: nivel(items, '_pickaxe'), hacha: nivel(items, '_axe'), espada: nivel(items, '_sword'),
    armadura: puntosArmadura(bot), mesa: c(/^crafting_table$/) > 0 ? 1 : 0, horno: c(/^furnace$/) > 0 ? 1 : 0,
    cama: c(/_bed$/) > 0 ? 1 : 0, cubo: c(/^(bucket|water_bucket|lava_bucket)$/) > 0 ? 1 : 0,
  }
  const m = {
    base: !!(d.base || yo.campamento), refugio: !!(d.refugio || yo.refugio), cofre: (d.cofres || []).length > 0,
    horno: (d.horno || []).length > 0, casa: !!d.casa, huerto: !!d.huerto, portal: !!d.portal, fortaleza: !!d.fortaleza,
    stronghold: !!d.stronghold, mina: (d.minas || []).some(m => m[3] <= 0), // 2026-11-02: el pozo del minero hasta y ≤ 0 (cavar_escalera lo anota: [x, y, z, y_fin])
  }
  if (m.horno) inv.horno = 1 // el horno puesto cuenta como tenerlo
  const hitos = { ...(d.hitos || {}) }
  if (bot.game && /nether/.test(bot.game.dimension || '')) hitos.nether = true
  if (bot.game && /end/.test(bot.game.dimension || '')) hitos.end = true
  return { inv, memoria: m, hitos }
}

// ¿Se cumple la condición (como en _etapas.json: { inv: { x: n }, memoria: { y: true }, hitos: { z: true } })?
function cumple(cond, e) {
  for (const [seccion, valores] of Object.entries(cond || {})) {
    for (const [k, v] of Object.entries(valores)) {
      if (seccion === 'inv' ? (e.inv[k] || 0) < v : !e[seccion] || !e[seccion][k]) return false
    }
  }
  return true
}
// Lo que falta de una condición: [«inv.hierro 1/3», …] (para el informe y el diario).
function falta(cond, e) {
  const out = []
  for (const [seccion, valores] of Object.entries(cond || {})) {
    for (const [k, v] of Object.entries(valores)) {
      if (seccion === 'inv' && (e.inv[k] || 0) < v) out.push(`${k} ${e.inv[k] || 0}/${v}`)
      else if (seccion !== 'inv' && !(e[seccion] && e[seccion][k])) out.push(k)
    }
  }
  return out
}

// etapas: las resueltas del rol (perfil_v2.resolver); hechas: { id: {…} } de la memoria. Devuelve la etapa que toca o null.
// Las de «repetir» (la comida) se dan por hechas la primera vez como las demás: mantenerlas es cosa del mantenimiento del capataz.
function etapaActual(etapas, e, hechas = {}) {
  const sinHacer = etapas.filter(et => !hechas[et.id])
  for (const et of sinHacer) {
    if (cumple(et.objetivo, e)) return { ...et, yaCumple: true } // el capataz la apunta como hecha y pasa a la siguiente
    if (cumple(et.pre, e)) return et
  }
  return sinHacer[0] || null
}

module.exports = { estado, cumple, falta, etapaActual, NIVEL }
