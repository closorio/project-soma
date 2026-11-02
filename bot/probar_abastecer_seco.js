// Prueba en seco del abasto de las obras del catálogo (2026-11-02): todo en los cofres; tablones de troncos del cofre; cristal → minar
// arena, horno y fundir; lana → cazar; diamante → pedir; puertas y antorchas fabricadas; y las tandas que caben en la mochila. Sin bot.
// Uso: node bot/probar_abastecer_seco.js
const registry = require('minecraft-data')('1.21.11')
const { planAbasto, tanda } = require('./abastecer')
const estructuras = require('./estructuras')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }
const de = (plan, tipo, campo, valor) => plan.pasos.find(p => p.tipo === tipo && (!campo || p[campo] === valor))
const txt = (plan) => JSON.stringify(plan.pasos.map(p => [p.tipo, p.objeto || p.bloque || p.entrada || p.animal || '', p.n]))

// 1. todo en los cofres: solo sacar
let p = planAbasto(registry, { oak_planks: 40, glass: 4 }, {}, { oak_planks: 64, glass: 10 })
ok(p.pasos.length === 2 && p.pasos.every(x => x.tipo === 'saca') && de(p, 'saca', 'objeto', 'oak_planks').n === 40 && !Object.keys(p.pedir).length, `todo en cofres: ${txt(p)}`)
// a medias: 10 del cofre y el resto, fabricado de troncos
p = planAbasto(registry, { oak_planks: 30 }, {}, { oak_planks: 10 })
ok(de(p, 'saca', 'objeto', 'oak_planks').n === 10 && de(p, 'fabrica', 'objeto', 'oak_planks').n === 20 && de(p, 'tala').n === 5, `tablones a medias: ${txt(p)}`)
console.log('  cofres: lo que hay se saca; lo que falta, se fabrica')

// 2. tablones con troncos en el cofre: se sacan los troncos y se fabrica (no se tala)
p = planAbasto(registry, { oak_planks: 16 }, {}, { oak_log: 10 })
ok(de(p, 'saca', 'objeto', 'oak_log') && de(p, 'saca', 'objeto', 'oak_log').n === 4 && de(p, 'fabrica', 'objeto', 'oak_planks') && !de(p, 'tala'), `troncos del cofre: ${txt(p)}`)
ok(p.pasos.findIndex(x => x.tipo === 'saca') < p.pasos.findIndex(x => x.tipo === 'fabrica'), 'sacar antes de fabricar')
// con los troncos en la mochila, ni sacar ni talar
p = planAbasto(registry, { oak_planks: 16 }, { oak_log: 4 }, {})
ok(p.pasos.length === 1 && p.pasos[0].tipo === 'fabrica', `troncos en la mochila: ${txt(p)}`)
console.log('  tablones de troncos del cofre o de la mochila')

// 3. cristal: minar arena, fundirla; sin horno, 8 de piedra; sin combustible, talar
p = planAbasto(registry, { glass: 6 }, {}, {}, { hayHorno: false })
ok(de(p, 'mina', 'bloque', 'sand').n === 6 && de(p, 'funde', 'entrada', 'arena').n === 6, `cristal: ${txt(p)}`)
ok(de(p, 'mina', 'bloque', 'stone') && de(p, 'mina', 'bloque', 'stone').n === 8 && de(p, 'tala'), `horno y combustible: ${txt(p)}`)
ok(p.pasos.findIndex(x => x.tipo === 'funde') > p.pasos.findIndex(x => x.tipo === 'mina'), 'fundir después de minar')
p = planAbasto(registry, { glass: 6 }, { coal: 2, cobblestone: 8 }, {}, { hayHorno: false })
ok(!de(p, 'tala') && !de(p, 'mina', 'bloque', 'stone'), `con carbón y piedra no se tala ni se mina piedra: ${txt(p)}`)
p = planAbasto(registry, { coal: 2 }, {}, {})
ok(de(p, 'fabrica', 'objeto', 'wooden_pickaxe') && p.pasos.findIndex(x => x.objeto === 'wooden_pickaxe') < p.pasos.findIndex(x => x.tipo === 'mina'), `sin pico, uno de madera antes de minar: ${txt(p)}`)
ok(de(p, 'tala') && p.pasos.findIndex(x => x.tipo === 'tala') < p.pasos.findIndex(x => x.objeto === 'wooden_pickaxe'), 'y los troncos para el pico, antes')
p = planAbasto(registry, { coal: 2 }, { stone_pickaxe: 1 }, {})
ok(!de(p, 'fabrica', 'objeto', 'wooden_pickaxe'), 'con pico, no')
console.log('  cristal: arena + horno + combustible')

// 4. lana → cazar; cama → lana + tablones; diamante → pedir; tinte → pedir
p = planAbasto(registry, { white_wool: 3 }, {}, {})
ok(de(p, 'cazar', 'animal', 'sheep').n === 3, `lana: ${txt(p)}`)
p = planAbasto(registry, { white_bed: 1 }, { oak_planks: 3 }, {})
ok(de(p, 'cazar', 'animal', 'sheep').n === 3 && de(p, 'fabrica', 'objeto', 'white_bed'), `cama: ${txt(p)}`)
p = planAbasto(registry, { diamond_block: 1, oak_planks: 4 }, {}, { oak_planks: 4 })
ok(p.pedir.diamond === 9 && de(p, 'saca', 'objeto', 'oak_planks'), `diamante → pedir: ${JSON.stringify(p.pedir)} ${txt(p)}`)
p = planAbasto(registry, { red_wool: 2 }, {}, {})
ok(p.pedir.red_wool === 2 && !p.pasos.length, `lana roja → pedir: ${JSON.stringify(p.pedir)}`)
p = planAbasto(registry, { glass: 2 }, {}, {}, { evitar: { glass: 2 } })
ok(p.pedir.glass === 2 && !de(p, 'mina', 'bloque', 'sand'), `lo que no encontró se pide: ${JSON.stringify(p.pedir)} ${txt(p)}`)
console.log('  lana → cazar, cama, diamante y tintes → pedir')

// 5. puerta, antorchas, escaleras y losas de una casa: todo de troncos (y carbón para la antorcha)
p = planAbasto(registry, { oak_door: 1, torch: 4, oak_stairs: 8, oak_slab: 6 }, {}, {})
ok(de(p, 'tala') && de(p, 'tala').n > 0 && ['oak_door', 'torch', 'oak_stairs', 'oak_slab'].every(i => de(p, 'fabrica', 'objeto', i)), `casa: ${txt(p)}`)
ok(de(p, 'mina', 'bloque', 'coal_ore') && de(p, 'mina', 'bloque', 'coal_ore').n === 1, `antorchas: carbón ${txt(p)}`)
ok(p.pasos.filter(x => x.tipo === 'tala').length === 1, 'una sola tala para todo')
console.log('  puerta, antorchas, escaleras y losas: una tala, el carbón y la fabricación')

// 6b. la madera da igual: con abedul en el cofre, la plantilla de roble se hace de abedul (sin talar)
p = planAbasto(registry, { oak_planks: 20, oak_stairs: 4 }, {}, { birch_log: 10 })
ok(de(p, 'saca', 'objeto', 'birch_log') && de(p, 'fabrica', 'objeto', 'birch_planks') && de(p, 'fabrica', 'objeto', 'birch_stairs') && !de(p, 'tala'), `abedul en el cofre: ${txt(p)}`)
p = planAbasto(registry, { oak_planks: 10 }, {}, { spruce_planks: 64 })
ok(p.pasos.length === 1 && de(p, 'saca', 'objeto', 'spruce_planks').n === 10, `tablones de abeto del cofre: ${txt(p)}`)
p = planAbasto(registry, { oak_planks: 8 }, { crimson_stem: 2 }, {})
ok(de(p, 'fabrica', 'objeto', 'crimson_planks') && !de(p, 'tala'), `madera del Nether: ${txt(p)}`)
p = planAbasto(registry, { oak_planks: 40 }, { birch_log: 7, oak_log: 3 }, {})
ok(de(p, 'fabrica', 'objeto', 'birch_planks').n === 28 && de(p, 'fabrica', 'objeto', 'oak_planks').n === 12 && !de(p, 'tala'), `tablones de dos maderas: ${txt(p)}`)
p = planAbasto(registry, { oak_slab: 17, oak_stairs: 10 }, {}, { spruce_slab: 20, birch_stairs: 6, oak_stairs: 4 })
ok(de(p, 'saca', 'objeto', 'spruce_slab').n === 17 && de(p, 'saca', 'objeto', 'oak_stairs').n === 4 && de(p, 'saca', 'objeto', 'birch_stairs').n === 6 && !de(p, 'fabrica'), `del cofre, en cualquier madera: ${txt(p)}`)
// solo de los cofres: nada de talar, minar ni cazar; se saca lo que haya y se pide el resto
p = planAbasto(registry, { oak_planks: 20, glass: 2, torch: 1 }, {}, { birch_log: 3, sand: 2 }, { soloCofres: true })
ok(!de(p, 'tala') && !de(p, 'mina') && !de(p, 'cazar'), `solo cofres: ni tala, ni mina, ni caza: ${txt(p)}`)
ok(de(p, 'saca', 'objeto', 'sand') && de(p, 'funde', 'entrada', 'arena') && de(p, 'saca', 'objeto', 'birch_log'), `solo cofres: saca arena y troncos y funde: ${txt(p)}`)
ok(p.pedir.troncos > 0 && p.pedir.coal === 1, `solo cofres: pide los troncos que faltan y el carbón: ${JSON.stringify(p.pedir)}`)
p = planAbasto(registry, { glass: 2 }, {}, {}, { soloCofres: true })
ok(p.pedir.sand === 2 && !de(p, 'funde'), `sin arena en los cofres: la pide y no funde: ${JSON.stringify(p.pedir)} ${txt(p)}`)
const { primarios } = require('./abastecer')
const pr = primarios(registry, estructuras.cargar('casita_prueba').materiales)
ok(pr.primarios.troncos > 20 && pr.primarios.sand === 2 && pr.primarios.coal === 1 && !Object.keys(pr.noSeConsigue).length, `primarios de la casita: ${JSON.stringify(pr)}`)
ok(primarios(registry, { diamond_block: 1, red_wool: 2 }).noSeConsigue.diamond === 9, 'primarios: lo que no se consigue, aparte')
console.log('  solo de los cofres y recursos primarios')
const E = require('./estructuras')
ok(E.mismoMaterial('oak_stairs', 'birch_stairs') && !E.mismoMaterial('oak_stairs', 'oak_slab') && !E.mismoMaterial('stone_stairs', 'oak_stairs'), 'mismoMaterial')
ok(E.mismoMaterial('dark_oak_door', 'cherry_door') && E.familia('stripped_spruce_log') === 'stripped_log' && E.familia('oak_wall_sign') === 'wall_sign', 'familias')
ok(JSON.stringify(E.faltaCon({ oak_planks: 10, oak_slab: 4 }, { birch_planks: 6, spruce_slab: 9 })) === '{"oak_planks":4}', `faltaCon: ${JSON.stringify(E.faltaCon({ oak_planks: 10, oak_slab: 4 }, { birch_planks: 6, spruce_slab: 9 }))}`)
console.log('  la madera da igual: se usa la que haya')

// 6. tandas: lo que cabe en la mochila, en orden de colocación
const plano = estructuras.cargar('casita_prueba')
const t1 = tanda(registry, plano, new Set(), 36)
ok(t1.bloques === estructuras.ordenar(plano).length && t1.objetos.oak_planks === plano.materiales.oak_planks, `con sitio, toda la casita: ${t1.bloques}`)
const t2 = tanda(registry, plano, new Set(), 1)
ok(Object.keys(t2.objetos).length === 1 && t2.bloques <= 64, `una ranura, un solo objeto: ${JSON.stringify(t2.objetos)}`)
const puestos = new Set(estructuras.ordenar(plano).slice(0, 30).map(b => b.slice(0, 3).join()))
const t3 = tanda(registry, plano, puestos, 36)
ok(t3.bloques === estructuras.ordenar(plano).length - 30, `sin lo ya puesto: ${t3.bloques}`)
console.log('  tandas: caben en la mochila y saltan lo ya puesto')

console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
