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
for (let k = 0; k < 8; k++) { // nada sale bien
  d = capataz.decidir(b4, 'casual')
  vistos.push(d.alternativa ? `alt:${d.habilidad}` : d.habilidad + ':' + d.args[0])
  capataz.alResultado(b4, 'casual', d, { exito: false, causa: 'no piqué nada' })
}
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

fs.rmSync(tmp, { recursive: true, force: true })
console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
