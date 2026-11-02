// minar [bloque=stone] [n=8] [radio=6] [y=50] [forzar] (F6): picar hasta n bloques del tipo pedido (o «mineral» = cualquier _ore)
// al alcance de la mano, acercándose sin romper ni poner nada. En el mundo del usuario solo dentro del rectángulo de obras (obras.json;
// F8.0b: fuera de él, en cualquier sitio que no esté protegido); nunca en una
// zona protegida, ni troncos, cofres o bloques de una obra en pie (aunque se pidan), ni bajo los pies, ni con agua o lava en
// un vecino, ni con arena o grava encima, ni por debajo de y = 50 (salvo y=NN). Con la herramienta que más rinda; si el
// bloque exige pico y no lo lleva, no lo pica (causa «sin pico») salvo «forzar» (lo pica sin que suelte nada).
// Cada bloque roto queda en obras.json (minados) y en la respuesta (rotos), para reponerlo en las pruebas con setblock.
// Límites: n ≤ 32, radio ≤ 12, 20 s + 10 s por bloque (máx. 5 min), 3 fallos seguidos. Al final recoge lo caído.
// F7.7 (fuera del mundo del usuario): en la medición picaba piedra enterrada a 2 bloques a través de la pared (el servidor solo
// mira la distancia) y lo que soltaba quedaba en huecos cerrados: de 50 bloques minados, Alma recogió 7. Ahora solo pica un bloque
// con una cara al aire (oculto), que se ve desde el ojo al picarlo (oculto) y cuya caída se puede recoger: lo que suelta cae hasta
// el primer suelo (más de 3 bloques: hondo) y tiene que haber camino a pie hasta un sitio desde el que se alcance el bloque y se
// recoja lo caído, o un hoyo de 1 abierto por arriba al que bajar (sin_camino). Al final recoge hasta 4 veces, en radio + 4.
const { goals } = require('mineflayer-pathfinder')
const mundo = require('../mundo')
const zonas = require('../zonas')
const cofres = require('../cofres')
const obras = require('../obras')
const parcela = require('../parcela')
const { picar } = require('./picar_tronco')
const recoger = require('./recoger')
const { moverHasta, lejania, esperar, nodo, hayCamino, prudentes } = require('./comun')
const sv = require('./sv')

const ALCANCE = 4.5, MAX_N = 32, MAX_RADIO = 12, Y_MIN = 50, MAX_MS = 300000
const NUNCA = /^(bedrock|chest|trapped_chest|barrel|ender_chest|shulker_box|spawner|crafting_table|furnace|bed|.*_bed|.*_door|.*_sign)$/
const GRUPOS = { dirt: /^(dirt|grass_block|coarse_dirt|rooted_dirt|podzol|mycelium)$/, stone: /^(stone|deepslate)$/ }
const SV = mundo.reglasLibres // F7.7: las reglas nuevas, solo fuera del mundo del usuario (allí, como antes)
const CARAS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
const MAX_CAIDA = 3

// Aire de verdad (ni sólido ni líquido): por donde pasa la vista, cae un objeto o se mete el cuerpo.
const libre = (k) => !!k && k.boundingBox === 'empty' && !parcela.esLiquido(k)
const expuesto = (bot, v) => CARAS.some(([dx, dy, dz]) => libre(bot.blockAt(v.offset(dx, dy, dz))))
// ¿Se ve v desde el ojo? Del ojo a un punto junto a cada cara al aire, a pasos de 0,1: nada sólido por el camino salvo v.
function visible(bot, v) {
  const ojo = bot.entity.position.offset(0, 1.62, 0)
  return CARAS.some(([dx, dy, dz]) => {
    if (!libre(bot.blockAt(v.offset(dx, dy, dz)))) return false
    const meta = v.offset(0.5 + 0.45 * dx, 0.5 + 0.45 * dy, 0.5 + 0.45 * dz), d = meta.minus(ojo), n = Math.ceil(d.norm() / 0.1)
    for (let i = 1; i < n; i++) {
      const q = ojo.plus(d.scaled(i / n)).floored()
      if (q.equals(v)) return true
      const k = bot.blockAt(q)
      if (!k || k.boundingBox === 'block') return false
    }
    return true
  })
}
// Dónde queda lo que suelta v: en su casilla o, si debajo no hay suelo, en la primera casilla con suelo (null: más de 3 de caída).
function aterrizaje(bot, v) {
  let L = v
  for (let k = 0; k <= MAX_CAIDA; k++) {
    if (!libre(bot.blockAt(L.offset(0, -1, 0)))) return L
    L = L.offset(0, -1, 0)
  }
  return null
}
// Meta del navegador (F7.7): un sitio desde el que se alcanza v con la mano y desde el que, picado, se recoge lo que suelte (la caja
// de recogida: ≤ 1 casilla en horizontal y de 2 por debajo a la altura de los pies), o el suelo a ≤ 2 casillas de un hoyo de 1
// abierto por arriba (se baja a él y se sale de un salto).
class GoalMinar extends goals.Goal {
  constructor(bot, v, L) {
    super(); this.v = v; this.L = L
    this.hoyo = L.equals(v) && libre(bot.blockAt(v.offset(0, 1, 0))) && libre(bot.blockAt(v.offset(0, 2, 0)))
  }
  heuristic(n) { return Math.hypot(n.x - this.v.x, n.y - this.v.y, n.z - this.v.z) }
  isEnd(n) {
    const { v, L } = this, c = (o, a) => Math.max(a, Math.min(a + 1, o)) - o
    const ox = n.x + 0.5, oy = n.y + 1.62, oz = n.z + 0.5
    if (Math.hypot(c(ox, v.x), c(oy, v.y), c(oz, v.z)) > ALCANCE - 0.3) return false
    if (Math.abs(n.x - L.x) <= 1 && Math.abs(n.z - L.z) <= 1 && n.y <= L.y && n.y >= L.y - 2) return true
    return this.hoyo && n.y === v.y + 1 && Math.hypot(n.x - v.x, n.z - v.z) <= 2.5
  }
}

module.exports = async function minar(bot, args, tarea) {
  const palabras = (args || []).filter(Boolean)
  const forzar = palabras.includes('forzar')
  const yArg = palabras.find(a => /^y=-?\d+$/.test(a))
  const yMin = yArg ? parseInt(yArg.slice(2)) : Y_MIN
  const [bloque = 'stone', n0, radio0] = palabras.filter(a => a !== 'forzar' && !/^y=/.test(a))
  const n = Math.min(MAX_N, parseInt(n0) || 8), radio = Math.min(MAX_RADIO, parseFloat(radio0) || 6)
  // 2026-11-02: «tierra» y «piedra» son familias: en la superficie la tierra es hierba (grass_block, que suelta tierra) y bajo y=0 la
  // piedra es deepslate (suelta cobbled_deepslate, que también vale para las herramientas de piedra). Antes solo el nombre exacto
  const grupo = GRUPOS[bloque]
  const quiero = bloque === 'mineral' ? (nombre) => nombre.endsWith('_ore') : grupo ? (nombre) => grupo.test(nombre) : (nombre) => nombre === bloque
  // F8.0b: el rectángulo de obras solo manda en el mundo del usuario; fuera, sv.puedeTocar (zonas, cofres y obras) como las demás
  if (!SV && !obras.permitido()) return { exito: false, causa: 'sin rectángulo de obras (obras.json: permitido)' }
  if (bloque !== 'mineral' && !bot.registry.blocksByName[bloque]) return { exito: false, causa: 'bloque desconocido: ' + bloque }
  const ms = Math.min(MAX_MS, (20 + 10 * n) * 1000), t0 = Date.now()
  const descartados = { protegido: 0, fuera_de_obras: 0, bajo_pies: 0, liquido: 0, cae_encima: 0, profundo: 0, sin_pico: 0, nunca: 0, obra: 0,
    ...(SV ? { oculto: 0, hondo: 0, sin_camino: 0 } : {}) }
  const rotos = [], herramientas = new Set(), vetados = new Set() // vetados (F7.7): ocultos o sin camino en esta llamada
  const clave = (v) => `${v.x},${v.y},${v.z}`
  let fallos = 0, causa = null

  const candidatos = () => {
    const p = bot.entity.position.floored()
    const ps = bot.findBlocks({ matching: b => quiero(b.name), maxDistance: radio, count: 300 })
    const vale = (v) => {
      const b = bot.blockAt(v)
      if (!b || !quiero(b.name)) return false
      if (NUNCA.test(b.name) || zonas.NO_ROMPER.test(b.name)) { descartados.nunca++; return false }
      if (!SV && !obras.enPermitido(v.x, v.z)) { descartados.fuera_de_obras++; return false }
      if (zonas.protegidoPor(v.x, v.y, v.z) || cofres.esCofre(v.x, v.y, v.z)) { descartados.protegido++; return false }
      if (obras.esDeObra(v.x, v.y, v.z)) { descartados.obra++; return false }
      if (v.y < yMin) { descartados.profundo++; return false }
      if (Math.abs(v.x - p.x) <= 1 && Math.abs(v.z - p.z) <= 1 && v.y < p.y) { descartados.bajo_pies++; return false }
      if (parcela.vecinosLiquidos(bot, v).length) { descartados.liquido++; return false }
      if (parcela.caeEncima(bot, v)) { descartados.cae_encima++; return false }
      if (SV && vetados.has(clave(v))) return false
      if (SV && !expuesto(bot, v)) { descartados.oculto++; return false }
      return true
    }
    return ps.filter(vale).sort((a, b) => lejania(bot, a) - lejania(bot, b))
  }

  while (rotos.length < n) {
    if (tarea && tarea.cancelada) { causa = 'cancelado'; break }
    if (Date.now() - t0 > ms) { causa = 'tiempo agotado'; break }
    if (fallos >= 3) { causa = 'tres fallos seguidos'; break }
    const ps = candidatos()
    if (!ps.length) { causa = rotos.length ? 'no quedan bloques que valgan' : 'nada que minar aquí'; break }
    let v = ps[0], b = bot.blockAt(v)
    // herramienta: la que más rinda; si el bloque exige pico y no hay, no se pica (no soltaría nada)
    const h = sv.mejorHerramienta(bot, b).item // 2026-11-02: con la mano en el empate (bestHarvestTool gastaba el pico en la tierra)
    if (b.harvestTools && !(h && b.canHarvest(h.type)) && !forzar) { descartados.sin_pico++; causa = `sin pico para ${b.name}`; break }
    if (SV) { // F7.7: a dónde caerá, camino a pie hasta un sitio desde el que se pica y se recoge y, ya allí, que se vea
      const L = aterrizaje(bot, v)
      if (!L) { descartados.hondo++; vetados.add(clave(v)); continue }
      const meta = new GoalMinar(bot, v, L), aqui = () => meta.isEnd(nodo(bot))
      if (!aqui()) {
        if (!hayCamino(bot, meta, 400, prudentes(bot))) { descartados.sin_camino++; vetados.add(clave(v)); continue }
        const r = await moverHasta(bot, meta, () => aqui() && bot.entity.onGround, { ms: 15000, tarea })
        if (r !== 'listo') { fallos++; vetados.add(clave(v)); await esperar(200); continue }
      }
      const p = bot.entity.position.floored()
      if (Math.abs(v.x - p.x) <= 1 && Math.abs(v.z - p.z) <= 1 && v.y < p.y) { descartados.bajo_pies++; vetados.add(clave(v)); continue }
      b = bot.blockAt(v)
      if (!b || !quiero(b.name)) continue
      if (!visible(bot, v)) { descartados.oculto++; vetados.add(clave(v)); continue }
    } else if (lejania(bot, v) > ALCANCE) {
      const r = await moverHasta(bot, new goals.GoalNear(v.x, v.y, v.z, 2), () => lejania(bot, v) <= ALCANCE - 0.3, { ms: 15000, tarea })
      if (r !== 'listo') { fallos++; await esperar(200); continue }
      const p = bot.entity.position.floored() // tras moverse, ¿ha quedado bajo los pies?
      if (Math.abs(v.x - p.x) <= 1 && Math.abs(v.z - p.z) <= 1 && v.y < p.y) { descartados.bajo_pies++; fallos++; continue }
      b = bot.blockAt(v)
      if (!b || !quiero(b.name)) continue
    }
    if (h && (!bot.heldItem || bot.heldItem.type !== h.type)) { try { await bot.equip(h, 'hand'); await esperar(60) } catch (_) {} }
    const r = await picar(bot, b, { bloque: b.name, pos: [v.x, v.y, v.z] }, tarea, 0)
    if (r.exito) {
      rotos.push([v.x, v.y, v.z, b.name]); fallos = 0
      if (bot.heldItem) herramientas.add(bot.heldItem.name)
      obras.anotarMinado(bot.username, [v.x, v.y, v.z], b.name, bot.heldItem ? bot.heldItem.name : null)
    } else { fallos++; causa = r.causa }
    await esperar(150)
  }
  let recogido = null
  if (rotos.length && !(tarea && tarea.cancelada) && !SV) { const r = await recoger(bot, ['5'], tarea); recogido = r.exito ? r.objetos : 0 }
  if (rotos.length && SV) { // F7.7: recoger va de 8 en 8 objetos; lo picado puede quedar a más de 5 del sitio final
    recogido = 0
    for (let k = 0; k < 4 && !(tarea && tarea.cancelada); k++) {
      const r = await recoger(bot, [String(radio + 4)], tarea)
      if (!r.exito) break
      recogido += r.objetos
    }
  }
  const datos = { rotos, pedidos: n, bloque, herramienta: [...herramientas].join(',') || 'mano', descartados, recogido, pos: bot.entity.position.floored().toArray() }
  if (!rotos.length) return { exito: false, causa: causa || 'no piqué nada', ...datos }
  return { exito: true, causa: rotos.length >= n ? 'minado' : `minado a medias: ${causa}`, ...datos }
}
module.exports.visible = visible // F7.7: para la prueba en seco (probar_cuerpo_f77_seco.js)
module.exports.aterrizaje = aterrizaje
