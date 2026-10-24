// Prueba en seco de la fundación de F8.0b (C4-C6), sin servidor:
// 1. El planificador de recetas (habilidades/planificador.js) con las recetas de 26.1: cama, cofre, cubo, horno, pico de hierro,
//    armadura, ojos de ender y antorchas salen con los pasos esperados (y la mesa donde hace falta); lo que no se fabrica (lana,
//    lingotes, menas) va a «faltan»; no mezcla variantes de tablón y no se mete en ciclos.
// 2. fabricar: la ruta de siempre (OBJETOS, sin objeto) no cambia; el genérico resuelve alias (cama del color de la lana, cubo,
//    armadura_hierro) y, sin materiales, falla con «faltan materiales: …» sin tocar el bot.
// 3. fundir: entrada y salida por alias, combustible justo para n (o el pedido), «no sé fundir».
// 4. poner: alias del objeto; cofres.registrar apunta un cofre una vez (en un cofres.json temporal).
// Uso: node bot/probar_fundacion_seco.js
process.env.IO_SERVIDOR = process.env.IO_SERVIDOR || 'local'
const fs = require('fs')
const os = require('os')
const path = require('path')
const mundo = require('./mundo')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fundacion-'))
mundo.cofres = path.join(tmp, 'cofres.json') // cofres.js lee la ruta al cargarse: un cofres.json de usar y tirar
fs.writeFileSync(mundo.cofres, '{ "cofres": [] }\n')
const registry = require('minecraft-data')('26.1')
const { planear } = require('./habilidades/planificador')
const fabricar = require('./habilidades/fabricar')
const fundir = require('./habilidades/fundir')
const poner = require('./habilidades/poner')
const cofres = require('./cofres')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }
const pasos = (p) => p.pasos.map(x => `${x.item}×${x.veces}${x.mesa ? '(m)' : ''}`).join(' ')

// 1 · planificador
const casos = [
  ['cama con lana y un tronco', [['white_bed', 1]], { white_wool: 3, oak_log: 1 }, 'oak_planks×1 white_bed×1(m)', {}],
  ['cama sin lana', [['white_bed', 1]], { oak_log: 1 }, 'oak_planks×1 white_bed×1(m)', { white_wool: 3 }],
  ['cofre con dos maderas', [['chest', 1]], { spruce_log: 2, oak_planks: 3 }, 'spruce_planks×2 chest×1(m)', {}],
  ['cubo', [['bucket', 1]], { iron_ingot: 3 }, 'bucket×1(m)', {}],
  ['cubo sin hierro', [['bucket', 1]], { raw_iron: 3 }, 'bucket×1(m)', { iron_ingot: 3 }],
  ['horno', [['furnace', 1]], { cobblestone: 8 }, 'furnace×1(m)', {}],
  ['pico de hierro', [['iron_pickaxe', 1]], { iron_ingot: 3, birch_log: 1 }, 'birch_planks×1 stick×1 iron_pickaxe×1(m)', {}],
  ['armadura de hierro', [['iron_helmet', 1], ['iron_chestplate', 1], ['iron_leggings', 1], ['iron_boots', 1]], { iron_ingot: 24 },
    'iron_helmet×1(m) iron_chestplate×1(m) iron_leggings×1(m) iron_boots×1(m)', {}],
  ['12 ojos de ender', [['ender_eye', 12]], { blaze_rod: 7, ender_pearl: 12 }, 'blaze_powder×6 ender_eye×12', {}],
  ['4 antorchas', [['torch', 4]], { coal: 1, oak_log: 1 }, 'oak_planks×1 stick×1 torch×1', {}],
  ['algo que no existe', [['no_existe', 1]], {}, '', { no_existe: 1 }],
]
for (const [t, obj, inv, esperado, faltan] of casos) {
  const p = planear(registry, obj, inv)
  ok(pasos(p) === esperado, `${t}: «${pasos(p)}», esperaba «${esperado}»`)
  ok(JSON.stringify(p.faltan) === JSON.stringify(faltan), `${t}: faltan ${JSON.stringify(p.faltan)}, esperaba ${JSON.stringify(faltan)}`)
}
console.log(`  1 · planificador: ${casos.length} casos (cama, cofre, cubo, horno, pico y armadura de hierro, ojos, antorchas)`)

// 2 · fabricar
const botDe = (items) => ({ registry, inventory: { items: () => items.map(([name, count]) => ({ name, count })) },
  findBlock: () => null, heldItem: null })
ok(fabricar.siguienteFabricacion(fabricar.estado({ ...botDe([['oak_log', 3]]), registry })) === 'espada_madera', 'la cadena de siempre cambió (3 troncos)')
ok(JSON.stringify(fabricar.objetivosDe(botDe([['red_wool', 3]]), 'cama', 1)) === '[["red_bed",1]]', 'la cama no sale del color de la lana')
ok(JSON.stringify(fabricar.objetivosDe(botDe([]), 'cubo', 2)) === '[["bucket",2]]', 'alias cubo')
ok(fabricar.objetivosDe(botDe([]), 'armadura_hierro', 1).length === 4, 'armadura_hierro no son 4 piezas')
ok(fabricar.objetivosDe(botDe([]), 'nada_de_nada', 1) === null, 'un objeto que no existe debería ser null')
const tarea = { cancelada: false }
;(async () => {
  const r = await fabricar(botDe([['oak_log', 1]]), ['bucket'], tarea)
  ok(!r.exito && /faltan materiales: iron_ingot 3/.test(r.causa), `cubo sin hierro: ${JSON.stringify(r)}`)
  const r2 = await fabricar(botDe([]), ['dragon_de_juguete'], tarea)
  ok(!r2.exito && /receta desconocida/.test(r2.causa), `objeto desconocido: ${r2.causa}`)
  console.log(`  2 · fabricar: la cadena de siempre igual; cubo sin hierro → «${r.causa}»`)

  // 3 · fundir
  const b = botDe([['raw_iron', 5], ['coal', 1], ['oak_planks', 10], ['beef', 2]])
  ok(fundir.entradaDe(b, 'hierro') === 'raw_iron' && fundir.salidaDe('raw_iron') === 'iron_ingot', 'hierro → raw_iron → iron_ingot')
  ok(fundir.entradaDe(b, 'carne') === 'beef' && fundir.salidaDe('beef') === 'cooked_beef', 'carne → beef → cooked_beef')
  ok(JSON.stringify(fundir.combustible(b, 5)) === '["coal",1]', `5 con carbón: ${JSON.stringify(fundir.combustible(b, 5))}`)
  ok(JSON.stringify(fundir.combustible(b, 5, 'tablones')) === '["oak_planks",4]', `5 con tablones: ${JSON.stringify(fundir.combustible(b, 5, 'tablones'))}`)
  ok(fundir.combustible(botDe([['raw_iron', 9]]), 9) === null, 'sin combustible debería ser null')
  const r3 = await fundir(b, ['diamante'], tarea)
  ok(!r3.exito && /no sé fundir/.test(r3.causa), `fundir diamante: ${r3.causa}`)
  const r4 = await fundir(botDe([['raw_iron', 2]]), ['hierro', '2'], tarea)
  ok(!r4.exito && r4.causa === 'sin combustible', `sin combustible: ${r4.causa}`)
  console.log('  3 · fundir: alias, combustible justo (1 carbón u 4 tablones para 5) y negativas')

  // 4 · poner y cofres
  const bp = botDe([['red_bed', 1], ['spruce_planks', 4]])
  ok(poner.objeto(bp, 'cama') === 'red_bed' && poner.objeto(bp, 'tablones') === 'spruce_planks' && poner.objeto(bp, 'cofre') === 'chest', 'alias de poner')
  ok(cofres.registrar('Prueba-1-64-2', [[1, 64, 2]]) === true && cofres.esCofre(1, 64, 2), 'cofres.registrar no apunta el cofre')
  ok(cofres.registrar('otra vez', [[1, 64, 2]]) === false && cofres.lista().length === 1, 'cofres.registrar repite un cofre')
  console.log('  4 · poner: alias; cofres.registrar apunta una vez')

  // 5 · escalera e iluminar en el mundo de mentira (sin picar ni poner: lo que deciden antes de tocar nada)
  const { mundoFalso } = require('./probar_sentidos_seco')
  const escalera = require('./habilidades/escalera')
  const iluminar = require('./habilidades/iluminar')
  const abierto = mundoFalso({}), tapado = mundoFalso({ bloques: { '0,70,0': 'stone' } })
  ok(escalera.alCielo(abierto) && !escalera.alCielo(tapado), 'alCielo: al aire sí, con piedra 6 encima no')
  const mira = (yaw) => { const b = mundoFalso({}); b.entity.yaw = yaw; return JSON.stringify(escalera.dirDe(b)) }
  ok(mira(0) === '[0,-1]' && mira(Math.PI / 2) === '[-1,0]' && mira(Math.PI) === '[0,1]' && mira(-Math.PI / 2) === '[1,0]', 'dirDe por la mirada')
  ok(JSON.stringify(escalera.dirDe(abierto, 'este')) === '[1,0]' && JSON.stringify(escalera.dirDe(abierto, 'norte')) === '[0,-1]', 'dirDe por el rumbo')
  // bajar hacia el este con lava junto al escalón: se niega antes de picar
  const lava = mundoFalso({ bloques: { '1,64,0': 'stone', '1,63,0': 'stone', '1,65,0': 'stone', '2,63,0': 'lava' } })
  const ctx = { pasos: [], rotos: [], puestos: [], peligros: [], antorchas: 0 }
  const r5 = await escalera.paso(lava, [1, 0], false, ctx, { cancelada: false })
  ok(r5 === 'lava delante' && ctx.rotos.length === 0 && ctx.peligros[0].tipo === 'lava', `escalera junto a lava: ${r5} ${JSON.stringify(ctx)}`)
  const c = abierto.entity.position.floored(), cas = iluminar.pisables(abierto, c, 6)
  ok(cas.length > 80 && cas.every(v => v.y === 64), `pisables en el llano: ${cas.length}`)
  ok(iluminar.manhattan(c, c.offset(3, 0, -4)) === 7, 'manhattan')
  console.log(`  5 · escalera: rumbo, cielo y «lava delante» sin picar; iluminar ve ${cas.length} casillas pisables en radio 6`)
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.log('FALLO ' + e.stack); process.exit(1) })
