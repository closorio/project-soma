// herrero [ZONA=HOGAR] [todo|armadura] [N personajes] (2026-11-02, el segundo oficio): mantiene el equipo de los personajes. Solo actúa si:
//  1. a algún armor stand de la zona le falta una pieza (casco, peto, pantalón, botas): busca la pieza en los cofres (los de ≤ 5 bloques
//     de un soporte y los que tienen un marco con una pieza, herramienta o material pegado); si está, la toma y se la pone al soporte;
//     si no, la fabrica de hierro (lingotes y madera de esos cofres) y se la pone;
//  2. (modo «todo», cada pocos minutos) en los cofres a ≤ 5 de los soportes hay menos de N espadas, picos o hachas (N = personajes): fabrica
//     de hierro las que falten y las deja en un cofre de ahí (mejor el del marco con ese objeto).
// «armadura» mira solo los soportes (sin abrir cofres si no falta nada). Lo que sobre de los materiales sacados vuelve a un cofre.
// Éxito si puso o fabricó algo. Fallos: sin zona · sin soportes · sin cofres · nada que hacer · faltan materiales (en `faltan`).
// Devuelve { exito, causa, zona, puestas: [pieza…], fabricadas: { objeto: n }, guardadas: { objeto: n }, faltan: [texto…], cofres, personajes }.
const { goals } = require('mineflayer-pathfinder')
const sv = require('./sv')
const zonas = require('../zonas')
const depositar = require('./depositar')
const fabricar = require('./fabricar')
const cosechar = require('./cosechar')
const { conLimite, moverHasta, esperar, prudentes } = require('./comun')

const CONTENEDORES = new Set(['chest', 'trapped_chest', 'barrel'])
const PIEZAS = ['helmet', 'chestplate', 'leggings', 'boots']
const SLOT = { boots: 2, leggings: 3, chestplate: 4, helmet: 5 } // entity.equipment del soporte
const ALTURA = { boots: 0.3, leggings: 0.7, chestplate: 1.2, helmet: 1.8 }
const HERRAMIENTAS = ['sword', 'pickaxe', 'axe'] // las que siempre debe haber, una por personaje
const GASTO = { sword: { i: 2, p: 1 }, pickaxe: { i: 3, p: 2 }, axe: { i: 3, p: 2 }, hoe: { i: 2, p: 2 }, shovel: { i: 1, p: 2 },
  helmet: { i: 5, p: 0 }, chestplate: { i: 8, p: 0 }, leggings: { i: 7, p: 0 }, boots: { i: 4, p: 0 } } // lingotes y palos de cada pieza
const CERCA = 5 // un cofre «de los soportes» está a ≤ 5 bloques de uno
const EQUIPO = /_(helmet|chestplate|leggings|boots|sword|pickaxe|axe|hoe|shovel)$/
const MATERIAL = /^(iron_ingot|stick|crafting_table)$|_(planks|log)$/
const valeMarco = (o) => EQUIPO.test(o) || MATERIAL.test(o)
const tipoDe = (nombre) => nombre.replace(/^.*_/, '')
const movs = (bot) => prudentes(bot, { pisarVedadas: true })

// Recorre los cofres (uno por contenedor; un cofre doble, una vez) y apunta qué guarda cada uno: [{ pos, key, items: {nombre: n}, libres }].
function leerVentana(v) {
  const items = {}
  let libres = 0
  for (let s = 0; s < v.inventoryStart; s++) { const it = v.slots[s]; if (it) items[it.name] = (items[it.name] || 0) + it.count; else libres++ }
  return { items, libres }
}
const clave = (p) => `${p.x},${p.y},${p.z}`

module.exports = async function herrero(bot, [nombreZona, modo = 'todo', personajes = '4'], tarea) {
  const zona = zonas.leer().zonas.find(z => z.nombre.toLowerCase() === String(nombreZona || 'HOGAR').toLowerCase())
  const base = { zona: nombreZona || 'HOGAR', puestas: [], fabricadas: {}, guardadas: {}, faltan: [], cofres: 0, personajes: Math.max(1, parseInt(personajes) || 4) }
  if (!zona) return { exito: false, causa: 'sin zona', ...base }
  const x1 = Math.min(zona.x1, zona.x2), x2 = Math.max(zona.x1, zona.x2), z1 = Math.min(zona.z1, zona.z2), z2 = Math.max(zona.z1, zona.z2)
  const dentro = (q) => { const x = Math.floor(q.x), z = Math.floor(q.z); return x >= x1 && x <= x2 && z >= z1 && z <= z2 }
  const centro = bot.entity.position.clone().set((x1 + x2) / 2, bot.entity.position.y, (z1 + z2) / 2)
  const radio = Math.min(128, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 2) + 8)

  const soportes = Object.values(bot.entities).filter(e => e.name === 'armor_stand' && e.isValid !== false && dentro(e.position))
  if (!soportes.length) return { exito: false, causa: 'sin soportes', ...base }
  const piezasFaltan = []
  for (const s of soportes) for (const pieza of PIEZAS) if (!(s.equipment || [])[SLOT[pieza]]) piezasFaltan.push({ s, pieza })
  if (!piezasFaltan.length && modo !== 'todo') return { exito: false, causa: 'nada que hacer', ...base }

  // los cofres: los de ≤ 5 de un soporte y los marcados con un marco de pieza o material
  const dSoporte = (p) => Math.min(...soportes.map(s => p.offset(0.5, 0.5, 0.5).distanceTo(s.position)))
  const cercanos = bot.findBlocks({ matching: (b) => CONTENEDORES.has(b.name), point: centro, maxDistance: radio, count: 300 })
    .filter(p => dentro(p) && dSoporte(p) <= CERCA)
  const marcados = cosechar.cofresMarcados(bot, centro, 96, valeMarco)
  const marcoDe = new Map(marcados.map(c => [clave(c.pos), c.objeto]))
  const cercaKeys = new Set(cercanos.map(clave))
  const lista = []
  for (const p of [...cercanos, ...marcados.map(c => c.pos)]) if (!lista.some(q => clave(q) === clave(p))) lista.push(p)
  if (!lista.length) return { exito: false, causa: 'sin cofres', ...base }

  const fallos = []
  const cancelado = () => tarea && tarea.cancelada
  const ir = (p, ms = 25000) => moverHasta(bot, new goals.GoalNear(p.x, p.y, p.z, 2), () => bot.entity.position.offset(0, 1.62, 0).distanceTo(p.offset(0.5, 0.5, 0.5)) <= 4,
    { ms, tarea, mov: movs(bot) })
  async function conCofre(c, fn) { // va al cofre, lo abre (con cerrojo) y le pasa la ventana; devuelve lo que devuelva fn o null
    if (cancelado()) return null
    if (await ir(c.pos) !== 'listo') { fallos.push(`no llego al cofre ${c.key}`); return null }
    const b = bot.blockAt(c.pos)
    if (!b || !CONTENEDORES.has(b.name)) { fallos.push(`no hay cofre en ${c.key}`); return null }
    return depositar.conCerrojo(c.key, async () => {
      const v = await conLimite(bot.openContainer(b), 8000)
      try {
        const r = await fn(v)
        Object.assign(c, leerVentana(v)) // lo que quedó
        return r
      } catch (e) { fallos.push(`cofre ${c.key}: ${e.message}`); return null } finally { bot.closeWindow(v) }
    })
  }

  // 1. inventario de cofres
  const idx = [], vistos = new Set()
  for (const p of lista) {
    if (cancelado()) break
    if (vistos.has(clave(p))) continue
    const c = { pos: p, key: clave(p), items: {}, libres: 0 }
    const dobles = []
    const ok = await conCofre(c, async (v) => {
      if (v.inventoryStart >= 54) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = bot.blockAt(p.offset(dx, 0, dz)); if (n && n.name === bot.blockAt(p).name) dobles.push(clave(p.offset(dx, 0, dz))) }
      return true
    })
    vistos.add(c.key); for (const d of dobles) vistos.add(d)
    if (ok) { c.cerca = cercaKeys.has(c.key) || dobles.some(d => cercaKeys.has(d)); idx.push(c) }
  }
  base.cofres = idx.length
  if (!idx.length) return { exito: false, causa: 'no abrí ningún cofre', ...base, fallos }
  const total = (vale, soloCerca = false) => idx.filter(c => !soloCerca || c.cerca).reduce((a, c) => a + Object.entries(c.items).filter(([n]) => vale(n)).reduce((b, [, k]) => b + k, 0), 0)
  const llevo = (vale) => bot.inventory.items().filter(i => vale(i.name)).reduce((a, i) => a + i.count, 0)

  // saca hasta n de lo que valga de los cofres (los que lo tengan); devuelve cuántos sacó
  async function tomar(vale, n) {
    let sacado = 0
    for (const c of idx.filter(c => Object.keys(c.items).some(vale))) {
      if (sacado >= n || cancelado()) break
      await conCofre(c, async (v) => {
        for (let s = 0; s < v.inventoryStart && sacado < n; s++) {
          const it = v.slots[s]
          if (!it || !vale(it.name)) continue
          const k = Math.min(it.count, n - sacado)
          try { await conLimite(v.withdraw(it.type, null, k), 5000); sacado += k } catch (e) { fallos.push('sacar: ' + e.message); break }
          await esperar(80)
        }
      })
    }
    return sacado
  }

  // 2. de hierro: junta lingotes y madera, y fabrica
  // la mesa de crafteo que ya hay junto a los soportes (a ≤ 24 de alguno, aunque caiga fuera del rectángulo de la zona): la más cercana al personaje
  const mesaConocida = () => {
    const desde = soportes.slice().sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0].position
    return bot.findBlocks({ matching: bot.registry.blocksByName.crafting_table.id, point: desde, maxDistance: 24, count: 10 })
      .map(p => bot.blockAt(p)).filter(Boolean).sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0] || null
  }
  // hasta pegarse a la mesa (fabricar solo la ve a ≤ 4 de los pies del personaje)
  const irAMesa = (mesa) => { const c = mesa.position.offset(0.5, 0.5, 0.5); return moverHasta(bot, new goals.GoalNear(mesa.position.x, mesa.position.y, mesa.position.z, 2), () => bot.entity.position.distanceTo(c) <= 3, { ms: 20000, tarea, mov: movs(bot) }) }
  let sinHierro = false // sin lingotes en los cofres: no se vuelve a intentar en esta pasada
  async function fabricarDeHierro(nombre) {
    const g = GASTO[tipoDe(nombre)]
    if (sinHierro) return false
    if (llevo(n => n === 'iron_ingot') < g.i) await tomar(n => n === 'iron_ingot', g.i - llevo(n => n === 'iron_ingot'))
    if (llevo(n => n === 'iron_ingot') < g.i) { sinHierro = true; base.faltan.push(`${nombre}: faltan lingotes de hierro (${llevo(n => n === 'iron_ingot')} de ${g.i})`); return false }
    const mesa = mesaConocida()
    if (g.p > 0 && llevo(n => n === 'stick') < g.p) await tomar(n => n === 'stick', g.p - llevo(n => n === 'stick')) // los palos ya hechos, primero
    const tabl = (g.p > 0 && llevo(n => n === 'stick') < g.p ? 2 : 0) + (mesa || llevo(n => n === 'crafting_table') ? 0 : 4)
    if (tabl > llevo(n => /_planks$/.test(n)) + 4 * llevo(n => /_log$/.test(n))) {
      if (!(await tomar(n => /_log$/.test(n), Math.ceil(tabl / 4)))) await tomar(n => /_planks$/.test(n), tabl)
    }
    if (mesa && await irAMesa(mesa) !== 'listo') fallos.push(`no llego a la mesa de ${mesa.position.x},${mesa.position.y},${mesa.position.z}`)
    const r = await fabricar(bot, [nombre, '1'], tarea)
    if (!r.exito) { base.faltan.push(`${nombre}: ${r.causa}`); return false }
    base.fabricadas[nombre] = (base.fabricadas[nombre] || 0) + 1
    return true
  }

  // 3. armadura: a cada pieza que falta, del cofre si hay, y si no, fabricada
  const mejorDelCofre = (pieza) => {
    let mejor = null
    for (const c of idx) for (const n of Object.keys(c.items)) if (n.endsWith('_' + pieza) && (!mejor || sv.valorPieza({ name: n }) > sv.valorPieza({ name: mejor }))) mejor = n
    return mejor
  }
  for (const { s, pieza } of piezasFaltan) {
    if (cancelado()) break
    if ((s.equipment || [])[SLOT[pieza]]) continue
    let nombre = mejorDelCofre(pieza)
    if (nombre) { if (!(await tomar(n => n === nombre, 1))) nombre = null }
    if (!nombre) { nombre = 'iron_' + pieza; if (!(await fabricarDeHierro(nombre))) continue }
    const item = bot.inventory.items().find(i => i.name === nombre)
    if (!item) { fallos.push(`no tengo ${nombre}`); continue }
    if (await ir(s.position.floored(), 25000) !== 'listo') { fallos.push(`no llego a un soporte (${pieza})`); continue }
    try {
      await conLimite(bot.equip(item, 'hand'), 3000)
      await bot.activateEntityAt(s, s.position.offset(0, ALTURA[pieza], 0))
      await esperar(500)
    } catch (e) { fallos.push(`${nombre}: ${e.message}`) }
    if ((s.equipment || [])[SLOT[pieza]]) base.puestas.push(nombre)
    else { fallos.push(`el soporte no tomó ${nombre}`); try { await bot.unequip('hand') } catch (_) {} }
  }

  // 4. herramientas: una de cada por personaje en los cofres de los soportes (modo «todo»)
  if (modo === 'todo') {
    for (const tipo of HERRAMIENTAS) {
      const hay = total(n => n.endsWith('_' + tipo), true)
      for (let k = hay; k < base.personajes && !cancelado(); k++) {
        const nombre = 'iron_' + tipo
        if (!(await fabricarDeHierro(nombre))) break
        // al cofre de los soportes con ese objeto en el marco, o al más cercano con hueco
        const destinos = idx.filter(c => c.cerca && c.libres > 0)
          .sort((a, b) => ((marcoDe.get(b.key) === nombre) - (marcoDe.get(a.key) === nombre)) || a.pos.distanceTo(bot.entity.position) - b.pos.distanceTo(bot.entity.position))
        let puesto = false
        for (const c of destinos) {
          const item = bot.inventory.items().find(i => i.name === nombre)
          if (!item) break
          puesto = !!(await conCofre(c, async (v) => { await conLimite(v.deposit(item.type, null, 1), 5000); return true }))
          if (puesto) { c.items[nombre] = (c.items[nombre] || 0) + 1; base.guardadas[nombre] = (base.guardadas[nombre] || 0) + 1; break }
        }
        if (!puesto) { fallos.push(`sin hueco para ${nombre}`); break }
      }
    }
  }

  // 5. lo que sobre de los materiales vuelve a un cofre
  const sobra = bot.inventory.items().filter(i => MATERIAL.test(i.name) && i.name !== 'crafting_table')
  for (const c of idx.filter(c => c.libres > 0 && sobra.length)) {
    if (!bot.inventory.items().some(i => MATERIAL.test(i.name) && i.name !== 'crafting_table')) break
    await conCofre(c, async (v) => {
      for (let s = v.inventoryStart; s < v.inventoryEnd; s++) {
        const it = v.slots[s]
        if (!it || !MATERIAL.test(it.name) || it.name === 'crafting_table') continue
        try { await conLimite(v.deposit(it.type, null, it.count), 5000) } catch (_) { break }
      }
    })
  }

  const hecho = base.puestas.length > 0 || Object.keys(base.fabricadas).length > 0 || Object.keys(base.guardadas).length > 0
  if (hecho) return { exito: true, causa: base.faltan.length ? 'a medias' : 'hecho', ...base, fallos }
  return { exito: false, causa: base.faltan.length ? 'faltan materiales' : cancelado() ? 'cancelado' : piezasFaltan.length ? 'no pude' : 'nada que hacer', ...base, fallos }
}
Object.assign(module.exports, { GASTO, HERRAMIENTAS, PIEZAS })
