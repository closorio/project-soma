// Prueba en seco de la taxonomía de entidades (F8.0a, C0; habilidades/taxonomia.js), sin servidor:
// 1. Todas las entidades de 26.1 y 1.21.11 que minecraft-data marca «hostile» están clasificadas (hostil o neutral): ninguna se
//    pierde por estar fuera de las listas.
// 2. Los monstruos que minecraft-data marca «mob» o «animal» (ghast, slime, magma_cube, phantom, shulker, ender_dragon, hoglin)
//    son hostiles; los neutrales (enderman, piglin, zombified_piglin) no lo son… salvo que acaben de golpear.
// 3. comun.hostiles: ve al phantom, no ve al enderman quieto, sí al que golpea (y lo olvida a los AGRESOR_MS); amenaza_prueba
//    sigue valiendo; un jugador nunca es amenaza.
// Uso: node bot/probar_taxonomia_seco.js
const mcData = require('minecraft-data')
const { Vec3 } = require('vec3')
const taxonomia = require('./habilidades/taxonomia')
const { hostiles, pruebas } = require('./habilidades/comun')

let pruebasN = 0, fallos = 0
const ok = (cond, que) => { pruebasN++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }

// 1 · cobertura de minecraft-data
for (const v of ['26.1', '1.21.11']) {
  const d = mcData(v)
  const sueltos = d.entitiesArray.filter(e => e.type === 'hostile' && taxonomia.clase(e.name) === 'ignorar').map(e => e.name)
  ok(sueltos.length === 0, `${v}: hostiles de minecraft-data sin clasificar: ${sueltos.join(', ')}`)
  const desconocidos = [...taxonomia.HOSTILES, ...taxonomia.NEUTRALES].filter(n => !d.entitiesByName[n] && !['parched', 'spider_jockey', 'giant', 'illusioner'].includes(n))
  ok(desconocidos.length === 0, `${v}: nombres de la taxonomía que no existen: ${desconocidos.join(', ')}`)
  console.log(`  1 · ${v}: ${d.entitiesArray.filter(e => e.type === 'hostile').length} «hostile» de minecraft-data, todos clasificados`)
}

// 2 · los casos de 26.1
const d26 = mcData('26.1')
for (const n of ['ghast', 'slime', 'magma_cube', 'phantom', 'shulker', 'ender_dragon', 'hoglin']) {
  ok(taxonomia.clase(n) === 'hostil', `${n} (${d26.entitiesByName[n]?.type}) debería ser hostil`)
}
for (const n of ['enderman', 'piglin', 'zombified_piglin']) ok(taxonomia.clase(n) === 'neutral', `${n} debería ser neutral`)
for (const n of ['cow', 'villager', 'player', 'item', 'iron_golem']) ok(taxonomia.clase(n) !== 'hostil', `${n} no es hostil`)
for (const n of ['creeper', 'creaking', 'ghast']) ok(taxonomia.NUNCA_ATACAR.has(n), `${n} en NUNCA_ATACAR`)
console.log('  2 · ghast, slime, phantom, shulker, dragón y hoglin hostiles; enderman y piglins neutrales')

// 3 · comun.hostiles con un mundo de mentira
const yo = { position: new Vec3(0, 64, 0) }
let id = 0
const ent = (name, x, extra = {}) => ({ id: ++id, name, type: d26.entitiesByName[name]?.type || 'mob', position: new Vec3(x, 64, 0), ...extra })
const phantom = ent('phantom', 5), enderman = ent('enderman', 4), vaca = ent('cow', 3), jugador = ent('player', 2, { type: 'player', username: 'seppuq' })
const bot = { entity: yo, yo: {}, entities: { 0: yo } }
for (const e of [phantom, enderman, vaca, jugador]) bot.entities[e.id] = e
const vistos = () => hostiles(bot, 16).map(e => e.name)
ok(JSON.stringify(vistos()) === '["phantom"]', `ve ${JSON.stringify(vistos())}, debería ver solo al phantom`)
taxonomia.anotarAgresor(bot, enderman)
ok(JSON.stringify(vistos()) === '["enderman","phantom"]', `tras el golpe ve ${JSON.stringify(vistos())}, debería ver al enderman (más cerca) y al phantom`)
taxonomia.agresores(bot).set(enderman.id, Date.now() - taxonomia.AGRESOR_MS - 1)
ok(!vistos().includes('enderman'), 'el enderman se olvida a los AGRESOR_MS')
taxonomia.anotarAgresor(bot, vaca)
ok(!vistos().includes('cow'), 'una vaca que «golpea» no es amenaza (no es neutral)')
pruebas(bot).amenazas.add('cow')
ok(vistos().includes('cow'), 'amenaza_prueba cow: la vaca cuenta')
ok(!vistos().includes('player'), 'un jugador nunca es amenaza')
console.log('  3 · hostiles(): phantom sí, enderman solo tras golpear, amenaza_prueba sigue valiendo')

console.log(fallos ? `${fallos} de ${pruebasN} comprobaciones FALLAN` : `${pruebasN}/${pruebasN} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
