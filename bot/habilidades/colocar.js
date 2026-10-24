// Poner un objeto concreto en una casilla (F8.0b): lo comparten poner, iluminar, fundir (el horno) y la escalera (antorchas).
// Como refugiarse.ponerBloque, pero con el objeto que se pide y comprobando que lo que queda es eso (una antorcha o una cama no
// son bloques enteros): se apoya en la primera cara sólida que valga, abajo primero (una antorcha en el suelo; si no, en la
// pared). Nunca donde sv.puedeTocar lo prohíbe (zonas, cofres, obras; en el mundo del usuario, fuera del rectángulo).
const { Vec3 } = require('vec3')
const { conLimite, esperar, nodo } = require('./comun')
const sv = require('./sv')
const { REEMPLAZABLE } = require('./refugiarse')

const APOYOS = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]
// ¿Lo que hay en la casilla es lo que se quería poner? (antorcha de pared, cama por partes, horno encendido…)
const esLoPuesto = (k, item) => !!k && (k.name === item || k.name === item.replace(/torch$/, 'wall_torch') ||
  k.name === item.replace(/^furnace$/, 'lit_furnace'))

async function colocar(bot, dest, item) {
  if (!sv.puedeTocar(dest.x, dest.y, dest.z)) return { exito: false, causa: 'casilla protegida' }
  let k = bot.blockAt(dest)
  if (esLoPuesto(k, item)) return { exito: true, causa: 'ya estaba', pos: [dest.x, dest.y, dest.z] }
  if (k && !REEMPLAZABLE.test(k.name)) return { exito: false, causa: `ocupada (${k.name})` }
  const it = bot.inventory.items().find(i => i.name === item)
  if (!it) return { exito: false, causa: 'no tengo ' + item }
  for (const [dx, dy, dz] of APOYOS) {
    const ref = bot.blockAt(dest.offset(dx, dy, dz))
    if (!sv.solido(ref)) continue
    try {
      if (!bot.heldItem || bot.heldItem.name !== item) { await conLimite(bot.equip(it, 'hand'), 3000); await esperar(80) }
      await conLimite(bot.placeBlock(ref, new Vec3(-dx, -dy, -dz)), 3000)
    } catch (_) {}
    for (let w = 0; w < 8 && !esLoPuesto(bot.blockAt(dest), item); w++) await esperar(50)
    k = bot.blockAt(dest)
    if (esLoPuesto(k, item)) {
      const props = typeof k.getProperties === 'function' ? k.getProperties() : {}
      return { exito: true, causa: 'puesto', pos: [dest.x, dest.y, dest.z], bloque: k.name, facing: props.facing || null }
    }
  }
  return { exito: false, causa: 'sin apoyo' }
}

// Una casilla a mi lado donde poner algo: libre (y libre encima), con suelo firme y que se pueda tocar.
function sitioAlLado(bot) {
  const b = nodo(bot)
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const v = b.offset(dx, 0, dz), k = bot.blockAt(v), suelo = bot.blockAt(v.offset(0, -1, 0))
    if (!k || k.boundingBox !== 'empty' || sv.esLiquido(k) || !sv.solido(suelo) || !sv.puedeTocar(v.x, v.y, v.z)) continue
    return v
  }
  return null
}

module.exports = { colocar, sitioAlLado, esLoPuesto, APOYOS }
