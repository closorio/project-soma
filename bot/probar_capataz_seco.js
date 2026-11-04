// Prueba en seco del capataz (F8.1, bot/capataz.js y bot/progresion.js) en el mundo de mentira de probar_sentidos_seco.js, en un mundo
// que no es el del usuario (memoria persistente en una carpeta temporal):
// 1. progresion.estado: niveles de pico y espada, cama, horno puesto, comida…
// 2. casual sin nada, de día: la etapa madera (rutina_madera); con 6 troncos, madera se da por hecha y toca herr_madera (fabricar).
// 3. mantenimiento: de noche, rutina_noche; con hambre y pan, comer; con hambre y sin comida, de día, recoger_comida.
// 4. alResultado: un paso que falla 2 veces se salta; si fallan todos, la alternativa (en una etapa de mineral, la escalera o
//    explorar); al cumplirse el objetivo, la etapa queda hecha con su día y su hora, en la memoria persistente.
// 5. speedrunner: de noche sigue trabajando si no hay peligro.
// Uso: node bot/probar_capataz_seco.js
process.env.IO_SERVIDOR = 'local'
const fs = require('fs')
const os = require('os')
const path = require('path')
const mundo = require('./mundo')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capataz-'))
mundo.carpetaDatos = tmp
const { mundoFalso: falso } = require('./probar_sentidos_seco')
const persistente = require('./memoria_persistente')
const progresion = require('./progresion')
const capataz = require('./capataz')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }
let n = 0
const mundoFalso = (o = {}) => {
  const b = falso(o)
  b.yo.nombre = `Prueba${++n}`
  b.time.day = o.dia || 0
  b.game = { dimension: 'minecraft:overworld' }
  persistente.alArrancar(b.yo)
  return b
}

// 1 · estado
const b1 = mundoFalso({ inventario: [['stone_pickaxe', 1], ['wooden_sword', 1], ['red_bed', 1], ['bread', 3], ['iron_ingot', 2], ['oak_log', 5]] })
const e1 = progresion.estado(b1)
ok(e1.inv.pico === 0.66 && e1.inv.espada === 0.33 && e1.inv.cama === 1 && e1.inv.hierro === 2 && e1.inv.troncos === 5 && e1.inv.comida === 3,
  `estado: ${JSON.stringify(e1.inv)}`)
ok(progresion.cumple({ inv: { pico: 0.66 } }, e1) && !progresion.cumple({ inv: { pico: 1 } }, e1), 'cumple con el nivel del pico')
ok(JSON.stringify(progresion.falta({ inv: { hierro: 3 } }, e1)) === '["hierro 2/3"]', `falta: ${progresion.falta({ inv: { hierro: 3 } }, e1)}`)
console.log('  1 · estado: pico de piedra 0,66, espada de madera 0,33, cama, 2 de hierro')

// 2 · la etapa que toca
const b2 = mundoFalso({})
let d = capataz.decidir(b2, 'casual')
ok(d.habilidad === 'rutina_madera' && d.etapa === 'madera', `casual sin nada: ${JSON.stringify(d)}`)
const b3 = mundoFalso({ inventario: [['oak_log', 6]], dia: 1 })
d = capataz.decidir(b3, 'casual')
ok(d.etapa === 'herr_madera' && d.habilidad === 'fabricar' && d.args[0] === 'pico_madera', `con 6 troncos: ${JSON.stringify(d)}`)
const h3 = capataz.hechas(b3, 'casual')
ok(h3.madera && h3.madera.dia === 1 && h3.madera.hora === 6000, `madera no quedó hecha con su día: ${JSON.stringify(h3)}`)
const guardado = JSON.parse(fs.readFileSync(persistente.ruta(b3.yo.nombre), 'utf8'))
ok(guardado.etapas && guardado.etapas.casual && guardado.etapas.casual.madera, 'la etapa hecha no está en la memoria persistente')
console.log(`  2 · sin nada: ${d.etapa === 'herr_madera' ? 'rutina_madera' : '?'}; con 6 troncos, madera hecha (día 1) y luego fabricar pico_madera`)

// 3 · mantenimiento
ok(capataz.decidir(mundoFalso({ hora: 18000 }), 'casual').habilidad === 'rutina_noche', 'de noche no se refugia')
ok(capataz.decidir(mundoFalso({ comida: 8, inventario: [['bread', 2]] }), 'casual').habilidad === 'comer', 'con hambre y pan no come')
ok(capataz.decidir(mundoFalso({ comida: 8 }), 'casual').habilidad === 'recoger_comida', 'con hambre y sin comida no busca')
ok(capataz.decidir(mundoFalso({ hora: 18000 }), 'speedrunner').habilidad !== 'rutina_noche', 'el speedrunner se refugia sin peligro')
console.log('  3 · noche → rutina_noche (speedrunner sigue); hambre → comer o recoger_comida')

// 4 · fallos, alternativa y etapa hecha
const b4 = mundoFalso({ inventario: [['oak_log', 6], ['wooden_pickaxe', 1], ['wooden_sword', 1], ['cobblestone', 8], ['stone_pickaxe', 1], ['stone_sword', 1]] })
d = capataz.decidir(b4, 'casual')
ok(d.etapa === 'carbon' && d.habilidad === 'minar' && d.args[0] === 'coal_ore', `con herramientas de piedra: ${JSON.stringify(d)}`)
const vistos = []
for (let k = 0; k < 12; k++) { // nada sale bien (con ir_a_mena tras cada «nada que minar»)
  d = capataz.decidir(b4, 'casual')
  vistos.push(d.alternativa ? `alt:${d.habilidad}` : d.habilidad + ':' + d.args[0])
  capataz.alResultado(b4, 'casual', d, { exito: false, causa: 'no piqué nada' })
}
ok(vistos.includes('ir_a_mena:coal_ore'), `tras «nada que minar» no va a por la mena: ${vistos.join(' ')}`)
ok(vistos.some(v => v.startsWith('alt:')), `nunca prueba una alternativa: ${vistos.join(' ')}`)
ok(vistos.includes('alt:cavar_escalera') || vistos.includes('alt:explorar'), `alternativa de mineral: ${vistos.join(' ')}`)
// consigue el carbón y las antorchas: al dar el resultado, la etapa queda hecha
b4.inventory.slots[30] = { name: 'coal', count: 8 }
b4.inventory.slots[31] = { name: 'torch', count: 8 }
const nuevas = capataz.alResultado(b4, 'casual', d, { exito: true })
ok(nuevas.includes('carbon'), `al tener 8 de carbón y 8 antorchas, carbon no quedó hecha (${nuevas})`)
ok(capataz.decidir(b4, 'casual').etapa === 'hierro', 'después de carbon no toca hierro')
const p = capataz.progreso(b4, 'casual')
ok(p.etapa === 'hierro' && p.pendientes[0] === 'hierro' && p.hechas.carbon, `progreso: ${JSON.stringify({ etapa: p.etapa, pendientes: p.pendientes })}`)
console.log(`  4 · fallos: ${vistos.join(' ')}; carbon hecha → hierro`)

// 5 · amenaza, etapa empezada y muerte
const zombi = mundoFalso({ entidades: [{ name: 'zombie', pos: [4.5, 64, 0.5] }], inventario: [['stone_sword', 1]] })
ok(capataz.decidir(zombi, 'casual').habilidad === 'atacar', 'un zombi a 4 con espada: no se defiende')
const creeper = mundoFalso({ entidades: [{ name: 'creeper', pos: [4.5, 64, 0.5] }], inventario: [['stone_sword', 1]] })
ok(capataz.decidir(creeper, 'casual').habilidad === 'huir', 'un creeper a 4: no huye')
// herr_piedra empezada: tras el pico gasta la piedra (pre piedra 8) y debe seguir en herr_piedra (la espada)
const b5 = mundoFalso({ inventario: [['wooden_pickaxe', 1], ['wooden_sword', 1], ['cobblestone', 8], ['oak_log', 6]] })
let d5 = capataz.decidir(b5, 'casual')
ok(d5.etapa === 'herr_piedra' && d5.args[0] === 'pico_piedra', `con piedra: ${JSON.stringify(d5)}`)
b5.inventory.slots.fill(null, 9, 45)
b5.inventory.slots[9] = { name: 'stone_pickaxe', count: 1 }; b5.inventory.slots[10] = { name: 'cobblestone', count: 5 }; b5.inventory.slots[11] = { name: 'wooden_sword', count: 1 }
capataz.alResultado(b5, 'casual', d5, { exito: true })
d5 = capataz.decidir(b5, 'casual')
ok(d5.etapa === 'herr_piedra' && d5.args[0] === 'espada_piedra', `tras el pico (5 de piedra) se fue a otra etapa: ${JSON.stringify(d5)}`)
// muere: las etapas de inventario se olvidan
const h5 = capataz.hechas(b5, 'casual')
ok(h5.madera && h5.herr_madera, 'madera y herr_madera deberían estar hechas')
persistente.anotarMuerte(b5, 'prueba')
capataz.decidir(b5, 'casual')
ok(!capataz.hechas(b5, 'casual').madera, 'tras morir, madera sigue hecha')
console.log('  5 · zombi → atacar, creeper → huir; la etapa empezada sigue; tras morir se rehacen las de inventario')

// 6 · la casa: sin tablones bastantes, construir falla y lo siguiente es talar lo que falta
const b6 = mundoFalso({ inventario: [['red_bed', 1], ['oak_log', 2], ['iron_pickaxe', 1], ['stone_sword', 1]] })
for (const id of ['madera', 'herr_madera', 'piedra', 'herr_piedra', 'carbon', 'hierro', 'pico_hierro', 'cama']) capataz.marcarHecha(b6, 'casual', id)
let d6 = capataz.decidir(b6, 'casual')
ok(d6.etapa === 'casa' && d6.habilidad === 'construir' && d6.args[0] === 'cabana_techada', `con la cama: ${JSON.stringify(d6)}`)
capataz.alResultado(b6, 'casual', d6, { exito: false, causa: 'falta material: 63 tablones (tengo 8, troncos 2; hacen falta 71)' })
d6 = capataz.decidir(b6, 'casual')
ok(d6.habilidad === 'rutina_madera' && d6.args[0] === '17', `tras «falta material» no tala: ${JSON.stringify(d6)}`)
// 7 · poca vida: con un zombi lejos (a 12, fuera del radio de amenaza), apartarse; sin monstruos y con pan, comer para regenerar
ok(capataz.decidir(mundoFalso({ salud: 5, entidades: [{ name: 'zombie', pos: [12.5, 64, 0.5] }] }), 'casual').habilidad === 'rutina_noche', 'con 5 de vida y un zombi a 12 sigue con la etapa')
ok(capataz.decidir(mundoFalso({ salud: 10, comida: 16, inventario: [['bread', 2]] }), 'casual').habilidad === 'comer', 'con 10 de vida y pan no come para regenerar')
console.log(`  6 · casa sin tablones: construir → ${d6.habilidad} ${d6.args.join(' ')}`)

// 8 · minero (2026-11-02): con pico de hierro, 32 de carbón y antorchas, y el pozo ya bajado, toca m_hierro y su paso es conseguir
const bm = mundoFalso({ inventario: [['iron_pickaxe', 1], ['stone_sword', 1], ['coal', 32], ['torch', 8], ['bread', 16], ['oak_log', 6]] })
persistente.de(bm).minas.push([0, 64, 0, -2])
const hm = capataz.hechas(bm, 'minero')
for (const id of ['madera', 'herr_madera', 'piedra', 'herr_piedra', 'comida', 'carbon', 'm_carbon', 'hierro', 'pico_hierro', 'm_pozo']) hm[id] = { dia: 0 }
const dm = capataz.decidir(bm, 'minero')
ok(dm.habilidad === 'conseguir' && dm.args.join(' ') === 'hierro 32', `minero: el paso de m_hierro es conseguir hierro 32 (${dm.habilidad} ${(dm.args || []).join(' ')})`)
ok(progresion.estado(bm).memoria.mina === true, 'minero: el pozo hasta y ≤ 0 cuenta como mina')

// 9 · banco M (2026-11-03): con el kit de PREPARACION (experimentos_roles.py), las etapas previas se dan por hechas y toca m_carbon
const bk = mundoFalso({ inventario: [['stone_pickaxe', 1], ['stone_sword', 1], ['oak_log', 6], ['cobblestone', 8], ['bread', 16], ['coal', 8], ['torch', 8]] })
const dk = capataz.decidir(bk, 'minero')
ok(dk.habilidad === 'conseguir' && dk.args.join(' ') === 'carbon 32', `minero con el kit del banco M: empieza en conseguir carbon 32 (${dk.habilidad} ${(dk.args || []).join(' ')})`)

// 10 · la etapa comida lleva comida también sin hambre (tras morir, «sin hambre» la dejaba dando vueltas)
const bc = mundoFalso({ comida: 20 })
const pc = capataz.rol('minero').etapas.find(x => x.id === 'comida').hacer[0]
ok(pc === 'recoger_comida 24 - guardar', `el paso de la etapa comida guarda sin hambre (${pc})`)
const recogerComida = require('./habilidades/recoger_comida')
;(async () => {
  bc.entities = bc.entities || {}
  const sinPedir = await recogerComida(bc, ['24'], null), guardando = await recogerComida(bc, ['24', '-', 'guardar'], null)
  ok(sinPedir.causa === 'sin hambre' && guardando.causa === 'nada que comer a la vista', `sin hambre: ${sinPedir.causa} / ${guardando.causa}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
  process.exit(fallos ? 1 : 0)
})()
