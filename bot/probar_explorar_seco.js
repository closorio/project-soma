// Prueba en seco de parcela.pisable (F8.0b, E0: el suelo de cada tramo de explorar), en columnas de mentira (probar_sentidos_seco):
// a diferencia de parcela.superficie, encuentra dónde estar de pie bajo una copa de hojas, dentro de un túnel con techo de roca,
// en una ladera más alta que 10 y en el fondo de un barranco, y se queda con la casilla más cercana a la altura del bot.
// Uso: node bot/probar_explorar_seco.js
process.env.IO_SERVIDOR = process.env.IO_SERVIDOR || 'supervivencia'
const { mundoFalso: falso } = require('./probar_sentidos_seco')
// el mundo de mentira no trae bot.world: todas las columnas «cargadas»
const mundoFalso = (o) => { const b = falso(o); b.world = { getColumn: () => true }; return b }
const parcela = require('./parcela')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }
const col = (x, z, desde, hasta, b) => { const o = {}; for (let y = desde; y <= hasta; y++) o[`${x},${y},${z}`] = b; return o }

// suelo de hierba en y = 63 (se pisa en 64); el bot en y = 64
const casos = [
  ['llano', mundoFalso({}), 63, 63],
  ['bajo una copa de hojas', mundoFalso({ bloques: { ...col(5, 0, 67, 69, 'oak_leaves') } }), null, 63],
  ['túnel con techo de roca', mundoFalso({ bloques: { ...col(5, 0, 66, 75, 'stone') } }), null, 63],
  ['ladera 14 más alta', mundoFalso({ bloques: { ...col(5, 0, 64, 77, 'stone') } }), null, 77],
  ['barranco 12 más hondo', mundoFalso({ bloques: { ...col(5, 0, 52, 63, 'air'), '5,51,0': 'stone' } }), null, 51],
  ['agua encima', mundoFalso({ bloques: { '5,64,0': 'water', '5,65,0': 'water' } }), null, null],
]
for (const [t, bot, sup, pis] of casos) {
  const s = parcela.superficie(bot, 5, 0, 64, 10, 10), p = parcela.pisable(bot, 5, 0, 64)
  if (t === 'llano') ok(s && s.y === sup, `${t}: superficie ${JSON.stringify(s)}`)
  else ok(!s || s.y !== pis, `${t}: superficie ya lo encontraba (${JSON.stringify(s)}): el caso no prueba nada`)
  ok(pis === null ? p === null : p && p.y === pis, `${t}: pisable ${JSON.stringify(p)}, esperaba y = ${pis}`)
  console.log(`  ${t}: superficie ${s ? s.y : '—'} · pisable ${p ? p.y : '—'}`)
}
// dos suelos en la columna (una cueva bajo el llano): el más cercano al bot
const cueva = mundoFalso({ bloques: { ...col(5, 0, 55, 57, 'air'), '5,54,0': 'stone' } })
ok(parcela.pisable(cueva, 5, 0, 64).y === 63 && parcela.pisable(cueva, 5, 0, 56).y === 54, 'con dos suelos no elige el más cercano')
console.log('  dos suelos: elige el más cercano a la altura pedida')
// F8.1: el navegador pasa a veces un bloque sin posición a las exclusiones de zonas (tumbó el proceso de los bots en el banco K)
const mov = { bot: { registry: { blocksArray: [] } }, blocksCantBreak: new Set(), exclusionAreasStep: [], exclusionAreasBreak: [] }
require('./zonas').aplicar(mov)
let lanza = null
try { mov.exclusionAreasStep[0]({}); mov.exclusionAreasStep[0](undefined); mov.exclusionAreasBreak[0]({ name: 'stone' }) } catch (e) { lanza = e.message }
ok(!lanza, `las exclusiones de zonas lanzan con un bloque sin posición: ${lanza}`)
console.log('  zonas: un bloque sin posición no tumba al navegador')
console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
