// salir_del_refugio (F7.2): salir de la celda en la que se encerró refugiarse. Del pozo (la salida está encima): pica la tapa y sube
// saltando y poniendo un bloque debajo cada vez (lo rellena con la tierra que sacó); si eso falla, como en lo demás: va a la salida
// que apuntó refugiarse con el navegador pudiendo picar y subir poniendo bloques (de una celda tapiada, picando el lado de los pies
// y el de la cabeza; el navegador solo, en el pozo, se quedaba a veces a un bloque de la boca: 1 de 4 en la primera prueba). Sin esa nota
// (un refugio ajeno), por el lado de los pies que dé a suelo libre o, si no, hacia arriba hasta el aire. Nada protegido: las
// mismas reglas que refugiarse (sv.puedeTocar). Éxito «fuera» (o «ya fuera» si no estaba encerrado ni en un pozo).
// F7.7 (fuera del mundo del usuario): en un pozo de arena sin bloques colocables «sal del refugio» agotaba el tiempo. Para subir
// sirve también lo que cae (arena, grava: puesta bajo los pies se apoya en el suelo del pozo) y, sin nada, pasa un tronco a 4 tablones.
// Devuelve { exito, causa, pos, rotos, puestos }: lo que cambió en el terreno alrededor (para reponerlo en las pruebas).
const { Vec3 } = require('vec3')
const { goals, Movements } = require('mineflayer-pathfinder')
const mundo = require('../mundo')
const zonas = require('../zonas')
const { fabricarTablones } = require('./construir')
const { conLimite, encerrado, esperar, moverHasta, nodo } = require('./comun')
const { picar } = require('./picar_tronco')
const sv = require('./sv')

const LADOS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const R = 3 // lo que se mira alrededor para saber qué cambió
const CAE = /sand$|gravel$|concrete_powder$/ // F7.7: bloques que caen; valen para subir (bajo los pies), no para tapiar
// Con qué subir el pozo: los colocables y, fuera del mundo del usuario, si no hay, los que caen (F7.7).
function paraSubir(bot) {
  const c = sv.colocables(bot)
  return c.length || !mundo.reglasLibres ? c : bot.inventory.items().filter(i => CAE.test(i.name))
}

// ¿En un pozo? Paredes sólidas a los 4 lados de los pies y de la cabeza (el techo puede estar abierto: no está «encerrado»).
function enPozo(bot) {
  const b = nodo(bot)
  return [0, 1].every(dy => LADOS.every(([dx, dz]) => sv.solido(bot.blockAt(b.offset(dx, dy, dz)))))
}

// Movimientos para salir: puede picar y subir poniendo bloques (los colocables), nunca en lo protegido.
function movimientos(bot) {
  const m = zonas.aplicar(new Movements(bot))
  m.canDig = true
  m.allow1by1towers = true
  m.allowParkour = false
  m.allowSprinting = false
  m.dontCreateFlow = true
  m.maxDropDown = 3
  m.scafoldingBlocks = [...new Set(sv.colocables(bot).map(i => i.type))]
  const vedado = (k) => (!k || !k.position || sv.puedeTocar(k.position.x, k.position.y, k.position.z) ? 0 : Infinity) // sin posición: chunk sin cargar
  m.exclusionAreasBreak.push(vedado)
  m.exclusionAreasPlace.push(vedado)
  return m
}

// Fotografía de los bloques alrededor de b (para comparar después).
function foto(bot, b) {
  const f = new Map()
  for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R + 2; dy++) for (let dz = -R; dz <= R; dz++) {
    const k = bot.blockAt(b.offset(dx, dy, dz))
    if (k) f.set(`${b.x + dx},${b.y + dy},${b.z + dz}`, k.name)
  }
  return f
}
function cambios(bot, antes) {
  const rotos = [], puestos = []
  for (const [k, n] of antes) {
    const [x, y, z] = k.split(',').map(Number), ahora = bot.blockAt(new Vec3(x, y, z))
    if (!ahora || ahora.name === n) continue
    if (ahora.boundingBox === 'empty') rotos.push([x, y, z, n]); else puestos.push([x, y, z, ahora.name])
  }
  return { rotos, puestos }
}

// La salida sin nota: un lado de los pies con suelo firme y aire fuera; si no, la primera casilla de aire encima (hasta 6).
function salidaSinNota(bot, b) {
  for (const [dx, dz] of LADOS) {
    const v = b.offset(dx, 0, dz), fuera = b.offset(2 * dx, 0, 2 * dz)
    if (sv.solido(bot.blockAt(v.offset(0, -1, 0))) && !sv.solido(bot.blockAt(fuera)) && !sv.solido(bot.blockAt(fuera.offset(0, 1, 0)))) return v
  }
  for (let dy = 2; dy <= 6; dy++) {
    const v = b.offset(0, dy, 0)
    if (!sv.solido(bot.blockAt(v)) && !sv.solido(bot.blockAt(v.offset(0, 1, 0))) && sv.solido(bot.blockAt(v.offset(0, -1, 0)))) return v
    if (!sv.solido(bot.blockAt(v)) && !sv.solido(bot.blockAt(v.offset(0, 1, 0)))) return v
  }
  return null
}

// Subir un bloque: saltar y, en lo alto, poner un bloque colocable donde estaban los pies (apoyado en el de debajo).
async function subirUno(bot) {
  const b = nodo(bot), item = paraSubir(bot)[0]
  if (!item) return false
  try { if (!bot.heldItem || bot.heldItem.name !== item.name) await conLimite(bot.equip(item, 'hand'), 3000) } catch (_) { return false }
  await bot.look(bot.entity.yaw, -Math.PI / 2, true)
  bot.setControlState('jump', true)
  try {
    const t0 = Date.now()
    while (bot.entity.position.y < b.y + 1.05 && Date.now() - t0 < 1000) await esperar(10)
    await conLimite(bot._placeBlockWithOptions(bot.blockAt(b.offset(0, -1, 0)), new Vec3(0, 1, 0), { forceLook: 'ignore', swingArm: 'right' }), 2000)
  } catch (_) {} finally { bot.setControlState('jump', false) }
  for (let w = 0; w < 30 && !bot.entity.onGround; w++) await esperar(50)
  return sv.solido(bot.blockAt(b)) && nodo(bot).y === b.y + 1
}

// Del fondo del pozo a la boca (salida, encima): picar lo que haya sobre la cabeza y subir, hasta tener los pies a su altura.
async function subirPozo(bot, salida, tarea, parar) {
  let caidas = 0
  for (let k = 0; k < 8 && nodo(bot).y < salida.y && !(parar && parar(bot)); k++) {
    if (tarea && tarea.cancelada) return false
    const b = nodo(bot)
    // 2026-11-03, banco del recolector: subiendo en pilar bajo grava, la grava le cayó en la cabeza y murió asfixiado. Primero, la
    // cabeza libre; y lo que cae de arriba se pica hasta que deja de caer, antes de saltar
    for (const dy of [1, 2]) {
      const encima = bot.blockAt(b.offset(0, dy, 0))
      if (!sv.solido(encima)) continue
      if (!sv.puedeTocar(encima.position.x, encima.position.y, encima.position.z)) return false
      const { item } = sv.mejorHerramienta(bot, encima)
      try { if (item && (!bot.heldItem || bot.heldItem.name !== item.name)) await conLimite(bot.equip(item, 'hand'), 3000) } catch (_) {}
      let r = await picar(bot, encima, {}, tarea, 0)
      // 2026-11-04, prueba a mano: picando grava que sigue cayendo, «no se rompió» y se rendía con ella encima: asfixiado
      for (let c = 0; !r.exito && c < 6 && CAE.test((bot.blockAt(encima.position) || {}).name || '') && !(tarea && tarea.cancelada); c++) {
        await esperar(300)
        r = await picar(bot, bot.blockAt(encima.position), {}, tarea, 0)
      }
      if (!r.exito && sv.solido(bot.blockAt(encima.position))) return false
    }
    if (CAE.test((bot.blockAt(b.offset(0, 3, 0)) || {}).name || '') && caidas++ < 16) { await esperar(400); k--; continue }
    if (!(await subirUno(bot))) { if (!(await subirUno(bot))) return false } // un reintento: el salto a veces no llega
  }
  return nodo(bot).y >= salida.y
}

module.exports = async function salirDelRefugio(bot, args, tarea) {
  const b = nodo(bot)
  if (!encerrado(bot) && !enPozo(bot)) return { exito: true, causa: 'ya fuera', pos: b.toArray(), rotos: [], puestos: [] }
  const info = sv.refugioInfo(bot)
  let salida = info && info.salida && new Vec3(...info.salida).distanceTo(b) <= 6 ? new Vec3(...info.salida) : salidaSinNota(bot, b)
  if (!salida) return { exito: false, causa: 'sin salida', pos: b.toArray(), rotos: [], puestos: [] }
  const antes = foto(bot, b)
  const listo = () => !encerrado(bot) && !enPozo(bot) && bot.entity.onGround
  const pozo = salida.x === b.x && salida.z === b.z && salida.y > b.y
  if (pozo && mundo.reglasLibres && !paraSubir(bot).length && bot.inventory.items().some(i => i.name.endsWith('_log'))) {
    try { await fabricarTablones(bot, 4) } catch (_) {} // F7.7: lo que hizo la mente en el pozo de arena
  }
  let r = pozo && (await subirPozo(bot, salida, tarea)) && listo() ? 'listo' : null
  if (!r) r = await moverHasta(bot, new goals.GoalBlock(salida.x, salida.y, salida.z), listo, { ms: 25000, tarea, mov: movimientos(bot) })
  const { rotos, puestos } = cambios(bot, antes)
  if (info) info.salido = { t: Date.now(), rotos, puestos }
  const datos = { pos: nodo(bot).toArray(), salida: salida.toArray(), rotos, puestos }
  if (r === 'listo') return { exito: true, causa: 'fuera', ...datos }
  return { exito: false, causa: r, ...datos }
}
module.exports.enPozo = enPozo
Object.assign(module.exports, { movimientos, foto, cambios, subirUno, subirPozo }) // F8.0b: escalera, desatascarse y explorar
module.exports.paraSubir = paraSubir
