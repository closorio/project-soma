// fabricar [OBJETO|-] (F7.2): tablones, palos, mesa, espada/pico/hacha/pala de madera, espada/pico/hacha de piedra, antorcha.
// «espada» o «pico» a secas: de piedra si lleva 2-3 de piedra (cobblestone, cobbled_deepslate o blackstone), si no de madera.
// Sin objeto (o «-»), lo siguiente de la cadena, igual que siguiente_fabricacion() del simulador (entorno_supervivencia.py):
// espada de madera si no hay arma; tablones si faltan bloques para tapiarse (< 2); espada de piedra con 2 de piedra; pico de madera
// si no lo hay. Pasa troncos a tablones si faltan (construir.fabricarTablones: 1 → 4, sin mesa), hace palos y, si la receta pide
// mesa y no hay una a mano (≤ 4 bloques), la fabrica o la saca del inventario, la pone al lado, fabrica y la recoge después.
// En el mundo del usuario la mesa solo se pone dentro del rectángulo de obras (o usa una que ya esté al lado).
// Éxito: el objeto en el inventario (causa = el nombre de la orden: espada_madera, tablones…). Fallos: faltan materiales ·
// receta desconocida · sin sitio para la mesa · no se pudo (el juego no lo hizo). La amenaza la corta, como al simulador.
// Devuelve { exito, causa, objeto, fabricados: {item: n}, mesa: 'cerca'|'puesta'|null, s }.
// F8.0b (C6), fabricar OBJETO [n] con cualquier otro objeto: el nombre de minecraft-data (white_bed, bucket, iron_pickaxe…) o un
// alias de GENERICOS (cama, cubo, cofre, horno, armadura_hierro…). Lo planea planificador.js con las recetas del juego (cadena de
// ingredientes, la variante de madera que haya) y lo fabrica paso a paso, con la mesa como arriba. Lo que no se fabrica (lingotes,
// lana, menas…) no lo busca: falla con «faltan materiales: …». La ruta de arriba (OBJETOS y sin objeto) no cambia.
const { Vec3 } = require('vec3')
const { conLimite, esperar, nodo } = require('./comun')
const { fabricarTablones, vaciarRejilla } = require('./construir')
const recoger = require('./recoger')
const { planear } = require('./planificador')
const sv = require('./sv')
const mundo = require('../mundo')

// Lo que gasta cada objeto: tablones (t), palos (p), piedra (q) y si pide mesa (los mismos números que RECETAS del simulador).
const OBJETOS = {
  espada_madera: { item: 'wooden_sword', t: 2, p: 1, q: 0, mesa: true },
  pico_madera: { item: 'wooden_pickaxe', t: 3, p: 2, q: 0, mesa: true },
  hacha_madera: { item: 'wooden_axe', t: 3, p: 2, q: 0, mesa: true },
  pala_madera: { item: 'wooden_shovel', t: 1, p: 2, q: 0, mesa: true },
  espada_piedra: { item: 'stone_sword', t: 0, p: 1, q: 2, mesa: true },
  pico_piedra: { item: 'stone_pickaxe', t: 0, p: 2, q: 3, mesa: true },
  hacha_piedra: { item: 'stone_axe', t: 0, p: 2, q: 3, mesa: true },
  mesa: { item: 'crafting_table', t: 4, p: 0, q: 0, mesa: false },
  palos: { item: 'stick', t: 2, p: 0, q: 0, mesa: false },
  antorcha: { item: 'torch', t: 0, p: 1, q: 0, carbon: 1, mesa: false },
  tablones: { item: '_planks', t: 0, p: 0, q: 0, mesa: false },
}
const ALIAS = { palo: 'palos', tabla: 'tablones', tablas: 'tablones', tablon: 'tablones', mesa_de_trabajo: 'mesa', antorchas: 'antorcha',
  espada_de_madera: 'espada_madera', espada_de_piedra: 'espada_piedra', pico_de_madera: 'pico_madera', pico_de_piedra: 'pico_piedra',
  hacha_de_madera: 'hacha_madera', hacha_de_piedra: 'hacha_piedra' }
const PIEDRA = /^(cobblestone|cobbled_deepslate|blackstone)$/
// F8.0b: alias del fabricar genérico → [[objeto de minecraft-data, n por unidad pedida], …]. La cama sale del color de lana que haya.
const GENERICOS = {
  cubo: [['bucket', 1]], cofre: [['chest', 1]], horno: [['furnace', 1]], escudo: [['shield', 1]], mechero: [['flint_and_steel', 1]],
  cizallas: [['shears', 1]], puerta: [['oak_door', 1]], escalera_mano: [['ladder', 1]], azada: [['wooden_hoe', 1]],
  pico_hierro: [['iron_pickaxe', 1]], espada_hierro: [['iron_sword', 1]], hacha_hierro: [['iron_axe', 1]], pala_hierro: [['iron_shovel', 1]],
  armadura_hierro: [['iron_helmet', 1], ['iron_chestplate', 1], ['iron_leggings', 1], ['iron_boots', 1]],
  pico_diamante: [['diamond_pickaxe', 1]], ojo_ender: [['ender_eye', 1]], ojos: [['ender_eye', 1]],
}
const ALCANCE_MESA = 4

const cuenta = (bot, vale) => bot.inventory.items().filter(i => vale(i.name)).reduce((a, i) => a + i.count, 0)
const mesaCerca = (bot) => bot.findBlock({ matching: bot.registry.blocksByName.crafting_table.id, maxDistance: ALCANCE_MESA })

// Lo que cuenta la cadena (los mismos campos que siguiente_fabricacion() del simulador).
function estado(bot) {
  const arma = sv.mejorArma(bot)
  return {
    arma: arma ? sv.valorArma(arma.name) : 0, pico: cuenta(bot, n => n.endsWith('_pickaxe')) > 0,
    mesa: cuenta(bot, n => n === 'crafting_table') > 0 || !!mesaCerca(bot),
    tablones: cuenta(bot, n => n.endsWith('_planks')), palos: cuenta(bot, n => n === 'stick'), troncos: cuenta(bot, n => n.endsWith('_log')),
    piedra: cuenta(bot, n => PIEDRA.test(n)), colocables: sv.cuantosColocables(bot),
  }
}
// Troncos que hay que pasar a tablones para la receta (con 4 de la mesa si falta y 2 para palos si faltan): _troncos_para().
function troncosPara(r, { tablones, palos, mesa }) {
  const { t, p } = OBJETOS[r]
  return Math.max(0, Math.ceil((t + (mesa ? 0 : 4) + (palos < p ? 2 : 0) - tablones) / 4))
}
// siguiente_fabricacion() del simulador: espada de madera si no hay arma; tablones si faltan bloques para tapiarse; espada de
// piedra con 2 de piedra; pico de madera si no hay. null si no se puede nada.
function siguienteFabricacion(e) {
  const sePuede = (r) => e.piedra >= OBJETOS[r].q && troncosPara(r, e) <= e.troncos
  if (e.arma === 0 && sePuede('espada_madera')) return 'espada_madera'
  if (e.colocables < 2 && e.troncos >= 1) return 'tablones'
  if (e.arma < 1 && sePuede('espada_piedra')) return 'espada_piedra'
  if (!e.pico && sePuede('pico_madera')) return 'pico_madera'
  return null
}

// 2026-11-02: dentro de una zona de obras de carteles la mesa se puede poner (y se recoge al acabar) aunque la zona sea vedada o quede
// fuera de las de trabajo: en el mundo del compañero TALLER (trabajo) está entera dentro de HOGAR (vedada) y no cabía en ningún sitio
const mesaEnCartel = (v) => { const obras = require('../obras'); return obras.enTemporal(v.x, v.z) && !obras.esDeObra(v.x, v.y, v.z) && !require('../cofres').esCofre(v.x, v.y, v.z) }

// Un sitio a mi lado para la mesa: casilla libre (y libre encima) con suelo firme, que se pueda tocar.
async function ponerMesa(bot) {
  const b = nodo(bot), mesa = bot.inventory.items().find(i => i.name === 'crafting_table')
  if (!mesa) return null
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const v = b.offset(dx, 0, dz), k = bot.blockAt(v), suelo = bot.blockAt(v.offset(0, -1, 0))
    if (!k || k.boundingBox !== 'empty' || sv.esLiquido(k) || !sv.solido(suelo) || sv.tapaCofre(bot, v) || !(sv.puedePoner(v.x, v.y, v.z) || mesaEnCartel(v))) continue
    try {
      await conLimite(bot.equip(mesa, 'hand'), 3000)
      await conLimite(bot.placeBlock(suelo, new Vec3(0, 1, 0)), 3000)
    } catch (_) {}
    await esperar(200)
    const puesta = bot.blockAt(v)
    if (puesta && puesta.name === 'crafting_table') return puesta
  }
  // F8.1: sin hueco al lado (en el túnel de una escalera, todo roca) y fuera del mundo del usuario: picar una casilla de un lado
  // (con suelo firme debajo y sin líquidos alrededor) y poner allí la mesa
  if (!mundo.reglasLibres) return null
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const v = b.offset(dx, 0, dz), k = bot.blockAt(v), suelo = bot.blockAt(v.offset(0, -1, 0))
    if (!sv.solido(k) || sv.NO_PICAR.test(k.name) || !sv.solido(suelo) || sv.tapaCofre(bot, v) || !sv.puedeTocar(v.x, v.y, v.z)) continue
    if (require('../parcela').vecinosLiquidos(bot, v).length) continue
    const { item, ms } = sv.mejorHerramienta(bot, k)
    if (ms > 6000) continue
    try {
      if (item) await conLimite(bot.equip(item, 'hand'), 3000)
      await conLimite(bot.dig(k, true), ms + 3000, () => bot.stopDigging())
      await esperar(250)
      await conLimite(bot.equip(mesa, 'hand'), 3000)
      await conLimite(bot.placeBlock(suelo, new Vec3(0, 1, 0)), 3000)
    } catch (_) {}
    await esperar(200)
    const puesta = bot.blockAt(v)
    if (puesta && puesta.name === 'crafting_table') return puesta
  }
  // y si tampoco (encima de un pilar: a los lados, aire sin suelo), colgada de un lado del bloque de debajo, un nivel más abajo
  const debajo = bot.blockAt(b.offset(0, -1, 0))
  if (!sv.solido(debajo)) return null
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const v = b.offset(dx, -1, dz), k = bot.blockAt(v)
    if (!k || k.boundingBox !== 'empty' || sv.esLiquido(k) || !sv.puedePoner(v.x, v.y, v.z)) continue
    try {
      await conLimite(bot.equip(mesa, 'hand'), 3000)
      await conLimite(bot.placeBlock(debajo, new Vec3(dx, 0, dz)), 3000)
    } catch (_) {}
    await esperar(200)
    const puesta = bot.blockAt(v)
    if (puesta && puesta.name === 'crafting_table') return puesta
  }
  return null
}

async function craftear(bot, item, n, mesa) {
  const id = bot.registry.itemsByName[item].id
  const receta = bot.recipesFor(id, null, 1, mesa)[0]
  if (!receta) return false
  await vaciarRejilla(bot)
  try { await conLimite(bot.craft(receta, n, mesa), 8000) } catch (_) { return false } finally { await vaciarRejilla(bot) }
  await esperar(200)
  return true
}

module.exports = async function fabricar(bot, [objeto, cantidad], tarea) {
  const t0 = Date.now(), antes = {}
  for (const i of bot.inventory.items()) antes[i.name] = (antes[i.name] || 0) + i.count
  let o = ALIAS[objeto] || objeto
  const e = estado(bot)
  if (o === 'espada' || o === 'pico' || o === 'hacha') o = `${o}_${e.piedra >= OBJETOS[o + '_piedra'].q ? 'piedra' : 'madera'}`
  if (!o || o === '-') o = siguienteFabricacion(e)
  const fin = (exito, causa, extra = {}) => {
    const fabricados = {}
    for (const i of bot.inventory.items()) { const d = i.count - (antes[i.name] || 0); if (d > 0) fabricados[i.name] = (fabricados[i.name] || 0) + d }
    return { exito, causa, objeto: o, fabricados, mesa: null, s: +((Date.now() - t0) / 1000).toFixed(1), ...extra }
  }
  if (!o) return fin(false, 'faltan materiales')
  const r = OBJETOS[o]
  if (!r) return generico(bot, o, Math.max(1, parseInt(cantidad) || 1), tarea, fin, antes)
  const cancelado = () => tarea && tarea.cancelada

  if (o === 'tablones') { // un tronco → 4 tablones
    if (!e.troncos) return fin(false, 'faltan materiales: troncos')
    const hechos = await fabricarTablones(bot, e.tablones + 4)
    return hechos > 0 ? fin(true, o) : fin(false, 'no se pudo')
  }
  if (e.piedra < r.q) return fin(false, `faltan materiales: piedra (${e.piedra} de ${r.q})`)
  if (r.carbon && cuenta(bot, n => n === 'coal' || n === 'charcoal') < r.carbon) return fin(false, 'faltan materiales: carbón')
  let mesa = r.mesa ? mesaCerca(bot) : null
  const llevoMesa = cuenta(bot, n => n === 'crafting_table') > 0
  const falta = r.t + (r.mesa && !mesa && !llevoMesa ? 4 : 0) + (e.palos < r.p ? 2 : 0)
  if (e.tablones < falta) await fabricarTablones(bot, falta)
  if (cancelado()) return fin(false, 'cancelado')
  const tablones = cuenta(bot, n => n.endsWith('_planks'))
  if (tablones < falta) return fin(false, `faltan materiales: tablones (${tablones} de ${falta}; troncos ${cuenta(bot, n => n.endsWith('_log'))})`)
  if (e.palos < r.p && !(await craftear(bot, 'stick', 1, null))) return fin(false, 'no se pudo: palos')
  let puesta = false
  if (r.mesa && !mesa) {
    if (!llevoMesa && !(await craftear(bot, 'crafting_table', 1, null))) return fin(false, 'no se pudo: mesa')
    if (cancelado()) return fin(false, 'cancelado')
    mesa = await ponerMesa(bot)
    if (!mesa) return fin(false, 'sin sitio para la mesa')
    puesta = true
  }
  const ok = !cancelado() && await craftear(bot, r.item, 1, mesa)
  if (puesta) { // recoger la mesa
    const k = bot.blockAt(mesa.position)
    if (k && k.name === 'crafting_table') {
      const { item } = sv.mejorHerramienta(bot, k)
      try { if (item) await conLimite(bot.equip(item, 'hand'), 3000); await conLimite(bot.dig(k, true), 6000, () => bot.stopDigging()) } catch (_) {}
      await esperar(300)
      await recoger(bot, ['5', 'crafting_table'], tarea)
    }
  }
  const extra = { mesa: puesta ? 'puesta' : mesa ? 'cerca' : null }
  if (cancelado() && !ok) return fin(false, 'cancelado', extra)
  const tengo = cuenta(bot, n => n === r.item) > (antes[r.item] || 0)
  return ok && tengo ? fin(true, o, extra) : fin(false, 'no se pudo', extra)
}
// ---- F8.0b · fabricar genérico ----
function inventario(bot) {
  const inv = {}
  for (const i of bot.inventory.items()) inv[i.name] = (inv[i.name] || 0) + i.count
  return inv
}
// Los objetivos de un nombre pedido: un alias, un objeto del juego o la cama del color de la lana que se lleve.
function objetivosDe(bot, o, n) {
  if (o === 'cama' || o === 'bed') {
    // el color del que haya 3 (una cama pide 3 de lana del mismo color); si no, blanca (la que sale de 4 hilos de araña)
    const c = {}
    for (const i of bot.inventory.items()) if (i.name.endsWith('_wool')) c[i.name] = (c[i.name] || 0) + i.count
    const lana = Object.entries(c).sort((a, b) => b[1] - a[1]).find(([, k]) => k >= 3)
    return [[(lana ? lana[0].replace(/_wool$/, '') : 'white') + '_bed', n]]
  }
  if (GENERICOS[o]) return GENERICOS[o].map(([x, k]) => [x, k * n])
  return bot.registry.itemsByName[o] ? [[o, n]] : null
}
async function generico(bot, o, n, tarea, fin, antes) {
  const objetivos = objetivosDe(bot, o, n)
  if (!objetivos) return fin(false, `receta desconocida: ${o} (hay: ${[...Object.keys(OBJETOS), ...Object.keys(GENERICOS)].join(', ')} o un objeto del juego)`)
  let mesa = mesaCerca(bot)
  const llevoMesa = cuenta(bot, x => x === 'crafting_table') > 0
  let plan = planear(bot.registry, objetivos, inventario(bot))
  if (plan.pasos.some(p => p.mesa) && !mesa && !llevoMesa) plan = planear(bot.registry, [['crafting_table', 1], ...objetivos], inventario(bot))
  const faltan = Object.entries(plan.faltan)
  if (faltan.length) return fin(false, 'faltan materiales: ' + faltan.map(([k, m]) => `${k} ${m}`).join(', '), { plan: plan.pasos.map(p => p.item) })
  let puesta = false
  for (const paso of plan.pasos) {
    if (tarea && tarea.cancelada) break
    if (paso.mesa && !mesa) {
      mesa = await ponerMesa(bot)
      if (!mesa) return fin(false, 'sin sitio para la mesa')
      puesta = true
    }
    for (let k = 0; k < paso.veces; k++) { // de una en una: varias de golpe a veces se pierden (construir.fabricarTablones)
      if (!(await craftear(bot, paso.item, 1, paso.mesa ? mesa : null))) return fin(false, `no se pudo: ${paso.item}`, { mesa: puesta ? 'puesta' : null })
    }
  }
  if (puesta) await recogerMesa(bot, mesa, tarea)
  const extra = { mesa: puesta ? 'puesta' : mesa ? 'cerca' : null, objetivos: objetivos.map(([x, m]) => `${x}×${m}`) }
  if (tarea && tarea.cancelada) return fin(false, 'cancelado', extra)
  const tengo = objetivos.every(([x, m]) => cuenta(bot, y => y === x) >= (antes[x] || 0) + m)
  return tengo ? fin(true, o, extra) : fin(false, 'no se pudo', extra)
}
async function recogerMesa(bot, mesa, tarea) {
  const k = bot.blockAt(mesa.position)
  if (!k || k.name !== 'crafting_table') return
  const { item } = sv.mejorHerramienta(bot, k)
  try { if (item) await conLimite(bot.equip(item, 'hand'), 3000); await conLimite(bot.dig(k, true), 6000, () => bot.stopDigging()) } catch (_) {}
  await esperar(300)
  await recoger(bot, ['5', 'crafting_table'], tarea)
}

module.exports.siguienteFabricacion = siguienteFabricacion
module.exports.ponerMesa = ponerMesa
module.exports.GENERICOS = GENERICOS
module.exports.objetivosDe = objetivosDe
module.exports.troncosPara = troncosPara
module.exports.estado = estado
module.exports.OBJETOS = OBJETOS
