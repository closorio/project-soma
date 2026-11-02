// Prueba en seco de la herramienta para cada bloque (2026-11-02, pedido del usuario: pala para la tierra, pico para la roca, hacha
// para la madera…): sv.mejorHerramienta con los datos de 26.1 y un bot de mentira con un inventario.
// Uso: node bot/probar_herramientas_seco.js
process.env.IO_SERVIDOR = process.env.IO_SERVIDOR || 'supervivencia'
const registro = require('prismarine-registry')('26.1')
const Block = require('prismarine-block')('26.1')
const sv = require('./habilidades/sv')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }
const objeto = (n) => ({ name: n, type: registro.itemsByName[n].id, count: 1 })
const bot = (nombres) => ({ inventory: { items: () => nombres.map(objeto) }, entity: { effects: {} }, heldItem: null })
const bloque = (n) => Block.fromStateId(registro.blocksByName[n].defaultState, 0)
const elige = (b, nombres) => { const it = sv.mejorHerramienta(bot(nombres), bloque(b)).item; return it ? it.name : 'mano' }

const todo = ['stone_sword', 'stone_pickaxe', 'stone_shovel', 'stone_axe']
const casos = [['dirt', 'stone_shovel'], ['grass_block', 'stone_shovel'], ['sand', 'stone_shovel'], ['gravel', 'stone_shovel'],
  ['stone', 'stone_pickaxe'], ['coal_ore', 'stone_pickaxe'], ['oak_log', 'stone_axe'], ['oak_planks', 'stone_axe']]
for (const [b, quiero] of casos) {
  const r = elige(b, todo)
  ok(r === quiero, `${b}: ${r}, esperaba ${quiero}`)
  console.log(`  ${b}: ${r}`)
}
ok(elige('dirt', ['stone_sword', 'stone_pickaxe']) === 'mano', 'sin pala, la tierra no gasta el pico ni la espada')
console.log(`  tierra sin pala: ${elige('dirt', ['stone_sword', 'stone_pickaxe'])}`)
ok(elige('stone', ['wooden_pickaxe', 'stone_pickaxe']) === 'stone_pickaxe', 'entre picos, el de piedra')
console.log(`  piedra con pico de madera y de piedra: ${elige('stone', ['wooden_pickaxe', 'stone_pickaxe'])}`)
console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
