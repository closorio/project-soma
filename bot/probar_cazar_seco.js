// Prueba en seco de cazar (F8.1, bot/habilidades/cazar.js) en el mundo de mentira de probar_sentidos_seco.js, con pelear y recoger
// de mentira (en require.cache antes de cargar cazar):
// 1. la oveja «muere» (pelear dice muerto) y suelta lana que se recoge: cuenta y acaba con éxito;
// 2. la oveja desaparece sin soltar nada (ladera, fuera del alcance) tres veces: no cuenta y falla con «lo perdí sin botín».
// Uso: node bot/probar_cazar_seco.js
process.env.IO_SERVIDOR = 'local'
const path = require('path')
const { mundoFalso } = require('./probar_sentidos_seco')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }

// pelear y recoger de mentira: pelear da la presa por muerta; recoger mete en el inventario lo que haya en `suelta`
let suelta = null, peleas = 0
const finge = (rel, exp) => { const f = require.resolve(path.join(__dirname, 'habilidades', rel)); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp } }
const atacarReal = require('./habilidades/atacar')
finge('atacar.js', { ...atacarReal, pelear: async () => { peleas++; return { causa: 'muerto', golpes: 3, muerto: true } } })
let botActual = null
finge('recoger.js', Object.assign(async () => {
  if (suelta) { const s = botActual.inventory.slots; s[s.findIndex((x, i) => i >= 9 && !x)] = { name: suelta, count: 1 } }
  return { exito: !!suelta }
}, { inalcanzado: () => false }))
const cazar = require('./habilidades/cazar')

;(async () => {
  // 1 · con botín: la oveja suelta lana blanca
  const b1 = mundoFalso({ entidades: [{ name: 'sheep', pos: [3.5, 64, 0.5] }, { name: 'item', type: 'object', pos: [3.5, 64, 0.5], objeto: 'white_wool' }] })
  botActual = b1; suelta = 'white_wool'; peleas = 0
  const r1 = await cazar(b1, ['sheep', '1'], {})
  ok(r1.exito && r1.muertos === 1 && r1.obtenido.white_wool >= 1, `con lana: ${JSON.stringify(r1)}`)
  console.log(`  1 · oveja con lana: ${r1.causa}, ${JSON.stringify(r1.obtenido)}`)

  // 2 · sin botín: desaparece sin soltar nada; a la tercera, falla
  const b2 = mundoFalso({ entidades: [{ name: 'sheep', pos: [3.5, 64, 0.5] }] })
  botActual = b2; suelta = null; peleas = 0
  const r2 = await cazar(b2, ['sheep', '3'], {})
  ok(!r2.exito && r2.muertos === 0 && r2.causa === 'lo perdí sin botín' && peleas === 3, `sin botín: ${JSON.stringify(r2)} (${peleas} peleas)`)
  console.log(`  2 · oveja sin botín: ${r2.causa} tras ${peleas} peleas, ${r2.muertos} muertos`)

  console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.log('  ERROR ' + e.stack); process.exit(1) })
