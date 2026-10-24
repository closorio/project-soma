// poner BLOQUE [x y z | delante] (F8.0b, C6): pone un objeto del inventario (cofre, horno, mesa, antorcha, cama, tierra…; nombre del
// juego o alias) en esa casilla o, sin ella, en una libre a mi lado. Si la casilla queda lejos (> 4,5), va hasta ella.
// Un cofre puesto se apunta en cofres.json (depositar y sacar_del_cofre lo usan) y, como el horno y la mesa, en la memoria del
// personaje. Éxito: el bloque en su sitio. Fallos: no tengo X · casilla protegida · ocupada · sin apoyo · sin sitio · no llego.
// Devuelve { exito, causa, pos, bloque, facing }.
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { moverHasta, lejania } = require('./comun')
const { colocar, sitioAlLado } = require('./colocar')
const cofres = require('../cofres')
const persistente = require('../memoria_persistente')

const ALIAS = { cofre: 'chest', horno: 'furnace', mesa: 'crafting_table', antorcha: 'torch', tierra: 'dirt', piedra: 'cobblestone',
  tablones: 'oak_planks', cubo: 'bucket' }
const ALCANCE = 4.5
// El objeto pedido tal como está en el inventario («cama» = la cama que haya; «tablones» = los que haya).
function objeto(bot, pedido) {
  const o = ALIAS[pedido] || pedido
  const items = bot.inventory.items()
  if (o === 'cama') return (items.find(i => i.name.endsWith('_bed')) || {}).name || 'white_bed'
  if (o === 'oak_planks') return (items.find(i => i.name.endsWith('_planks')) || {}).name || o
  return o
}

module.exports = async function poner(bot, args, tarea) {
  const [pedido, ...resto] = args || []
  if (!pedido) return { exito: false, causa: 'falta el bloque' }
  const item = objeto(bot, pedido)
  if (!bot.inventory.items().some(i => i.name === item)) return { exito: false, causa: 'no tengo ' + item }
  let dest
  if (resto.length >= 3 && resto.slice(0, 3).every(v => !isNaN(+v))) dest = new Vec3(+resto[0], +resto[1], +resto[2]).floored()
  else dest = sitioAlLado(bot)
  if (!dest) return { exito: false, causa: 'sin sitio' }
  if (lejania(bot, dest) > ALCANCE) {
    const r = await moverHasta(bot, new goals.GoalNear(dest.x, dest.y, dest.z, 3), () => lejania(bot, dest) <= ALCANCE, { ms: 30000, tarea })
    if (r !== 'listo') return { exito: false, causa: 'no llego: ' + r }
  }
  const r = await colocar(bot, dest, item)
  if (r.exito && r.causa === 'puesto') {
    if (item === 'chest' || item === 'barrel') cofres.registrar(`${bot.username}-${dest.x}-${dest.y}-${dest.z}`, [[dest.x, dest.y, dest.z]])
    const lugar = { chest: 'cofres', barrel: 'cofres', furnace: 'horno', crafting_table: 'mesa' }[item]
    if (lugar) persistente.anotarLugar(bot, lugar, [dest.x, dest.y, dest.z])
  }
  return { ...r, objeto: item }
}
module.exports.objeto = objeto
