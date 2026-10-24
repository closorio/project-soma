// Taxonomía de entidades por nombre (F8.0a, C0): qué cuenta como amenaza para los sentidos, los reflejos y el vigía.
// Hasta F7 valía `e.type === 'hostile'` de minecraft-data, pero en 1.21.11 y 26.1 ese campo deja fuera monstruos que atacan
// (ghast, slime, magma_cube, phantom, shulker y ender_dragon son «mob»; hoglin es «animal») y mete a neutrales que solo atacan si
// se les provoca (enderman, piglin, zombified_piglin): el bot huía de cualquier piglin del Nether y no veía un phantom.
// Ahora: «hostil» ataca siempre; «neutral» solo cuenta como amenaza si acaba de golpear al personaje (agresores, AGRESOR_MS);
// lo demás se ignora. NUNCA_ATACAR: tipos con los que no se pelea aunque sean amenaza (atacar se niega; huir sí vale).
const memoria = require('../memoria')

const HOSTILES = new Set([
  // superficie y cuevas
  'zombie', 'husk', 'drowned', 'zombie_villager', 'skeleton', 'stray', 'bogged', 'parched', 'spider', 'cave_spider', 'creeper',
  'witch', 'slime', 'phantom', 'silverfish', 'endermite', 'creaking', 'warden', 'breeze', 'giant',
  // saqueadores
  'pillager', 'vindicator', 'evoker', 'vex', 'ravager', 'illusioner',
  // agua
  'guardian', 'elder_guardian',
  // Nether
  'blaze', 'ghast', 'magma_cube', 'wither_skeleton', 'hoglin', 'zoglin', 'piglin_brute', 'wither',
  // End
  'shulker', 'ender_dragon',
])
const NEUTRALES = new Set(['enderman', 'piglin', 'zombified_piglin', 'iron_golem', 'wolf', 'bee', 'polar_bear', 'llama',
  'trader_llama', 'panda', 'goat', 'dolphin', 'spider_jockey'])
const NUNCA_ATACAR = new Set(['creeper', 'creaking', 'ghast', 'warden', 'ender_dragon', 'wither'])
const AGRESOR_MS = 30000

const clase = (nombre) => HOSTILES.has(nombre) ? 'hostil' : NEUTRALES.has(nombre) ? 'neutral' : 'ignorar'
// Los neutrales que han golpeado al personaje hace poco: id → instante del golpe (lo apunta sv.vigilarGolpes).
const agresores = (bot) => memoria(bot, 'agresores', () => new Map())
const anotarAgresor = (bot, e) => { if (e && clase(e.name) === 'neutral') agresores(bot).set(e.id, Date.now()) }
const agresorReciente = (bot, e) => Date.now() - (agresores(bot).get(e.id) || 0) < AGRESOR_MS

// ¿Es una amenaza para este personaje? `amenazas`: los tipos marcados con `amenaza_prueba` (pruebas en pacífico).
function esAmenaza(bot, e, amenazas = new Set()) {
  if (!e || e === bot.entity || e.type === 'player') return false
  if (amenazas.has(e.name)) return true
  const c = clase(e.name)
  return c === 'hostil' || (c === 'neutral' && agresorReciente(bot, e))
}

module.exports = { HOSTILES, NEUTRALES, NUNCA_ATACAR, AGRESOR_MS, clase, agresores, anotarAgresor, agresorReciente, esAmenaza }
