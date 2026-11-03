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
  if (!sv.puedePoner(dest.x, dest.y, dest.z)) return { exito: false, causa: 'casilla protegida' }
  let k = bot.blockAt(dest)
  if (esLoPuesto(k, item)) return { exito: true, causa: 'ya estaba', pos: [dest.x, dest.y, dest.z] }
  if (k && !REEMPLAZABLE.test(k.name)) return { exito: false, causa: `ocupada (${k.name})` }
  const it = bot.inventory.items().find(i => i.name === item)
  if (!it) return { exito: false, causa: 'no tengo ' + item }
  const intentos = []
  for (const [dx, dy, dz] of APOYOS) {
    const ref = bot.blockAt(dest.offset(dx, dy, dz))
    if (!sv.solido(ref)) continue
    const i = { apoyo: [dx, dy, dz], mano: bot.heldItem ? bot.heldItem.name : null }
    try {
      if (!bot.heldItem || bot.heldItem.name !== item) { await conLimite(bot.equip(it, 'hand'), 3000); await esperar(80) }
      i.manoTras = bot.heldItem ? bot.heldItem.name : null
      Object.assign(i, situacion(bot, ref, dest, [dx, dy, dz]))
      await conLimite(bot.placeBlock(ref, new Vec3(-dx, -dy, -dz)), 3000)
    } catch (e) { i.error = e.message }
    for (let w = 0; w < 8 && !esLoPuesto(bot.blockAt(dest), item); w++) await esperar(50)
    k = bot.blockAt(dest)
    i.queda = k ? k.name : null
    if (DEPURAR) console.log('[colocar] ' + JSON.stringify({ item, dest: [dest.x, dest.y, dest.z], ...i }))
    if (esLoPuesto(k, item)) {
      const props = typeof k.getProperties === 'function' ? k.getProperties() : {}
      return { exito: true, causa: 'puesto', pos: [dest.x, dest.y, dest.z], bloque: k.name, facing: props.facing || null }
    }
    intentos.push(i)
  }
  if (DEPURAR) setTimeout(() => { const t = bot.blockAt(dest); console.log(`[colocar] ${item} ${dest} a los 1,5 s: ${t && t.name}`) }, 1500)
  return { exito: false, causa: 'sin apoyo', intentos }
}

// IO_DEPURAR_COLOCAR=si (2026-11-01, fallo intermitente en 26.3 por Via): por intento, dónde está el bot, a qué distancia de
// los ojos queda el punto de clic y si una entidad pisa la casilla. Sin la variable, solo van en el resultado los intentos fallidos.
const DEPURAR = process.env.IO_DEPURAR_COLOCAR === 'si'
function situacion(bot, ref, dest, [dx, dy, dz]) {
  const p = bot.entity.position, ojos = p.offset(0, bot.entity.height * 0.9, 0)
  const clic = ref.position.offset(0.5 - dx * 0.5, 0.5 - dy * 0.5, 0.5 - dz * 0.5)
  const pisa = Object.values(bot.entities).filter(e => e.position && e.type !== 'object' &&
    Math.abs(e.position.x - (dest.x + 0.5)) < 0.5 + (e.width || 0.6) / 2 && Math.abs(e.position.z - (dest.z + 0.5)) < 0.5 + (e.width || 0.6) / 2 &&
    e.position.y < dest.y + 1 && e.position.y + (e.height || 1.8) > dest.y).map(e => e === bot.entity ? 'yo' : e.name)
  return { pos: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)], dOjos: +ojos.distanceTo(clic).toFixed(2), pisa }
}

// Las casillas a mi lado donde poner algo: libres (y libre encima), con suelo firme y que se puedan tocar; las de los lados primero.
function sitiosAlLado(bot) {
  const b = nodo(bot), out = []
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const v = b.offset(dx, 0, dz), k = bot.blockAt(v), suelo = bot.blockAt(v.offset(0, -1, 0))
    if (!k || k.boundingBox !== 'empty' || sv.esLiquido(k) || !sv.solido(suelo) || !sv.puedePoner(v.x, v.y, v.z)) continue
    out.push(v)
  }
  return out
}
const sitioAlLado = (bot) => sitiosAlLado(bot)[0] || null
// Lo pone en la primera casilla de al lado donde entre (F8.0b: el banco vio fallar 1 de 10 hornos en la primera casilla, «sin apoyo»).
// 2026-11-03, banco: en el túnel de una escalera todo es roca y el horno no tenía sitio («sin sitio»). Fuera del mundo del usuario,
// picar una casilla de un lado (con suelo firme y sin líquidos alrededor), como ponerMesa de fabricar.js. Devuelve la casilla o null.
async function abrirAlLado(bot) {
  if (!require('../mundo').reglasLibres) return null
  const b = nodo(bot)
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const v = b.offset(dx, 0, dz), k = bot.blockAt(v), suelo = bot.blockAt(v.offset(0, -1, 0))
    if (!sv.solido(k) || sv.NO_PICAR.test(k.name) || !sv.solido(suelo) || !sv.puedeTocar(v.x, v.y, v.z)) continue
    if (require('../parcela').vecinosLiquidos(bot, v).length) continue
    const { item, ms } = sv.mejorHerramienta(bot, k)
    if (ms > 6000) continue
    try {
      if (item) await conLimite(bot.equip(item, 'hand'), 3000)
      await conLimite(bot.dig(k, true), ms + 3000, () => bot.stopDigging())
    } catch (_) {}
    await esperar(250)
    const ahora = bot.blockAt(v)
    if (ahora && ahora.boundingBox === 'empty') return v
  }
  return null
}

async function colocarAlLado(bot, item) {
  let ultimo = { exito: false, causa: 'sin sitio' }
  let sitios = sitiosAlLado(bot)
  if (!sitios.length) { const v = await abrirAlLado(bot); if (v) sitios = [v] }
  for (const v of sitios.slice(0, 4)) {
    ultimo = await colocar(bot, v, item)
    if (ultimo.exito) return ultimo
    await esperar(250)
  }
  return ultimo
}

module.exports = { colocar, sitioAlLado, sitiosAlLado, colocarAlLado, abrirAlLado, esLoPuesto, APOYOS }
