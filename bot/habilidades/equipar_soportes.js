// equipar_soportes [ZONA|radio=HOGAR] (2026-11-01, ampliada 2026-11-02): se equipa con lo que haya en los armor stands y cofres de una zona.
// Con el nombre de una zona de zonas.json (HOGAR por defecto, si existe) mira TODO su perímetro; con un número (o si no hay zona), los soportes
// y cofres a ≤ ese radio del personaje. Pisa las zonas vedadas (sin romper ni poner bloques).
//  1. Armadura: solo las piezas que le faltan (ni puestas ni en el inventario); de todos los soportes, la mejor (sv.valorPieza): con la mano
//     vacía, un clic derecho en la altura de la pieza se la pasa a la mano (así lo hace el juego), y la equipa.
//  2. Arma: solo si no tiene ninguna espada ni hacha: abre los cofres y barriles de la zona (los más cercanos a un soporte primero) hasta
//     encontrar una, y saca la mejor (sv.puntosArma). Un pico no cuenta.
// Éxito si pudo mirar (había soportes o cofres): causa «equipado» si tomó algo, «nada mejor» si no. Fallos: sin soportes ni cofres.
// Devuelve { exito, causa, piezas: [...], arma, soportes, cofres, vistas: [piezas que había], fallos: [por qué no llegó a algo] }.
const { goals } = require('mineflayer-pathfinder')
const sv = require('./sv')
const zonas = require('../zonas')
const { conLimite, moverHasta, esperar, prudentes } = require('./comun')
const depositar = require('./depositar')
const equipar = require('./equipar')

const CONTENEDORES = new Set(['chest', 'trapped_chest', 'barrel'])
const SLOT = { boots: 2, leggings: 3, chestplate: 4, helmet: 5 } // entity.equipment del soporte
// Altura (sobre sus pies) del clic que elige cada pieza en un armor stand normal (los tramos del juego: pies 0,1-0,55 · piernas 0,55-0,9 ·
// pecho 0,9-1,6 · cabeza ≥ 1,6)
const ALTURA = { boots: 0.3, leggings: 0.7, chestplate: 1.2, helmet: 1.8 }
const RANURA = { helmet: 5, chestplate: 6, leggings: 7, boots: 8 }
const ES_ARMA = /_(sword|axe)$/
const MAX_COFRES = 12

// El área de búsqueda: { dentro(pos), centro, radio, nombre }
function area(bot, arg) {
  const zona = !/^\d+(\.\d+)?$/.test(String(arg || '')) && zonas.leer().zonas.find(z => z.nombre.toLowerCase() === String(arg || 'HOGAR').toLowerCase())
  if (zona) {
    const x1 = Math.min(zona.x1, zona.x2), x2 = Math.max(zona.x1, zona.x2), z1 = Math.min(zona.z1, zona.z2), z2 = Math.max(zona.z1, zona.z2)
    const p = bot.entity.position
    return { nombre: zona.nombre, centro: p.clone().set((x1 + x2) / 2, p.y, (z1 + z2) / 2), radio: Math.min(128, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 2) + 8),
      dentro: (q) => { const x = Math.floor(q.x), z = Math.floor(q.z); return x >= x1 && x <= x2 && z >= z1 && z <= z2 } }
  }
  const radio = Math.min(48, parseFloat(arg) || 24), c = bot.entity.position.clone()
  return { nombre: null, centro: c, radio, dentro: (q) => q.distanceTo(c) <= radio }
}

const soportes = (bot, a) => Object.values(bot.entities)
  .filter(e => e.name === 'armor_stand' && e.isValid !== false && a.dentro(e.position))
  .sort((x, y) => x.position.distanceTo(bot.entity.position) - y.position.distanceTo(bot.entity.position))

// ¿Le falta esa pieza? Ni la lleva puesta ni la tiene en el inventario (solo se toma lo que falta, no se mejora lo que ya tiene).
const falta = (bot, pieza) => !bot.inventory.slots[RANURA[pieza]] && !bot.inventory.items().some(i => i.name.endsWith('_' + pieza))
const movs = (bot) => prudentes(bot, { pisarVedadas: true })

async function tomarArmadura(bot, tarea, a, fallos) {
  const piezas = []
  for (const pieza of Object.keys(SLOT)) {
    if (tarea && tarea.cancelada) return piezas
    if (!falta(bot, pieza)) continue
    // de todos los soportes, el que tenga la mejor de esa pieza
    let s = null, item = null
    for (const x of soportes(bot, a)) {
      const it = (x.equipment || [])[SLOT[pieza]]
      if (it && it.name.endsWith('_' + pieza) && (!item || sv.valorPieza(it) > sv.valorPieza(item))) { s = x; item = it }
    }
    if (!s) continue
    const r = await moverHasta(bot, new goals.GoalNear(s.position.x, s.position.y, s.position.z, 2), () => s.position.distanceTo(bot.entity.position) <= 2.5,
      { ms: 25000, tarea, entidad: s, mov: movs(bot) })
    if (r !== 'listo') { fallos.push(`no llego al soporte de ${item.name} (${r})`); continue }
    try {
      if (bot.heldItem) await conLimite(bot.unequip('hand'), 3000) // con la mano ocupada el clic intercambia en vez de tomar
      await bot.activateEntityAt(s, s.position.offset(0, ALTURA[pieza], 0))
      await esperar(400)
      const nueva = bot.inventory.items().find(i => i.name === item.name) || bot.heldItem
      if (!nueva || nueva.name !== item.name) { fallos.push(`el clic no me dio ${item.name}`); continue }
      await conLimite(bot.equip(nueva, sv.DESTINO_PIEZA[pieza]), 3000)
      await esperar(100)
      piezas.push(item.name)
    } catch (e) { fallos.push(`${item.name}: ${e.message}`) }
  }
  return piezas
}

// Los cofres del área, los más cercanos a algún soporte primero (si no hay soportes, a mí).
function cofresDe(bot, a, lista) {
  const refs = lista.length ? lista.map(s => s.position) : [bot.entity.position]
  const d = (p) => Math.min(...refs.map(r => p.distanceTo(r)))
  return bot.findBlocks({ matching: (b) => CONTENEDORES.has(b.name), point: a.centro, maxDistance: a.radio, count: 200 })
    .filter(p => a.dentro(p)).sort((x, y) => d(x) - d(y)).slice(0, MAX_COFRES)
}

async function armaDelCofre(bot, tarea, a, lista, fallos) {
  if (sv.mejorArma(bot)) return null // ya tiene espada o hacha: solo busca si le falta
  const vistos = new Set()
  for (const pos of cofresDe(bot, a, lista)) {
    if (tarea && tarea.cancelada) return null
    const k = `${pos.x},${pos.y},${pos.z}`
    if (vistos.has(k)) continue
    vistos.add(k)
    const r = await moverHasta(bot, new goals.GoalNear(pos.x, pos.y, pos.z, 2), () => bot.entity.position.offset(0, 1.62, 0).distanceTo(pos.offset(0.5, 0.5, 0.5)) <= 4,
      { ms: 25000, tarea, mov: movs(bot) })
    if (r !== 'listo') { fallos.push(`no llego al cofre ${k} (${r})`); continue }
    const b = bot.blockAt(pos)
    if (!b || !CONTENEDORES.has(b.name)) continue
    const arma = await depositar.conCerrojo(`soporte@${k}`, async () => {
      const v = await conLimite(bot.openContainer(b), 8000)
      try {
        // un cofre doble: la otra mitad ya está en esta ventana
        if (v.inventoryStart >= 54) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = bot.blockAt(pos.offset(dx, 0, dz)); if (n && n.name === b.name) vistos.add(`${pos.x + dx},${pos.y},${pos.z + dz}`) }
        let mejor = null
        for (let i = 0; i < v.inventoryStart; i++) {
          const it = v.slots[i]
          if (it && ES_ARMA.test(it.name) && sv.puntosArma(it.name, it) > (mejor ? sv.puntosArma(mejor.name, mejor) : 0)) mejor = it
        }
        if (!mejor) return null
        await conLimite(v.withdraw(mejor.type, null, 1), 5000)
        return mejor.name
      } catch (e) { fallos.push(`cofre ${k}: ${e.message}`); return null } finally { bot.closeWindow(v) }
    })
    if (arma) return arma
  }
  return null
}

module.exports = async function equiparSoportes(bot, [arg], tarea) {
  const a = area(bot, arg)
  const lista = soportes(bot, a), fallos = []
  const vistas = lista.flatMap(s => Object.values(SLOT).map(i => (s.equipment || [])[i]).filter(Boolean).map(it => it.name))
  const piezas = await tomarArmadura(bot, tarea, a, fallos)
  let arma = null
  try { arma = await armaDelCofre(bot, tarea, a, lista, fallos) } catch (e) { fallos.push('arma: ' + e.message) }
  try { if (arma) await equipar.ponerArma(bot) } catch (_) {}
  await esperar(200)
  const datos = { piezas, arma, soportes: lista.length, vistas, fallos, zona: a.nombre }
  if (!lista.length && !cofresDe(bot, a, lista).length) return { exito: false, causa: 'sin soportes ni cofres', ...datos }
  return { exito: true, causa: piezas.length || arma ? 'equipado' : 'nada mejor', ...datos }
}
