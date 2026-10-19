// refugiarse [auto|tapiar|cavar] (F7.2): encerrarse en una celda de 1×2 con las 6 caras sólidas (comun.encerrado) para pasar la
// noche o escapar de los monstruos. Dos formas:
//   tapiar  en el sitio: pone bloques colocables (sv.colocables: tierra, tablones y la piedra la última) donde falten, a los 4 lados
//           de los pies y de la cabeza y encima (el techo necesita un apoyo al lado: un bloque más). En llano son 10 bloques; junto a
//           una pared, un tronco o en un hueco, menos.
//   cavar   un pozo de 3 hacia abajo (picando con la mejor herramienta) y tapa la boca con 1 bloque desde dentro, apoyado en las
//           paredes (con un pozo de 2 la boca no tiene donde apoyarse). Antes comprueba el terreno (planCavar): nunca sobre agua,
//           lava ni huecos (nada líquido en el cubo de 3×7×3 alrededor, la columna y el suelo nuevo sólidos, las paredes de la celda
//           sólidas: si no, es una cueva), nada protegido y que se pueda picar en ≤ 12 s (piedra a mano, no: «sin pico»).
//           F7.7: y que haya con qué tapar la boca: un colocable encima o uno que suelte la columna (la tierra sí; la arena y la
//           grava caen, y la piedra sin pico no suelta nada): si no, «sin bloques para tapar» (Alma quedó en un pozo de arena abierto).
// auto (por defecto): tapiar si faltan ≤ 4 bloques y los lleva; si no, volver al refugio anterior (tapiado, a ≤ 16) si lo puede
// cerrar; si no, cavar; si no, tapiar con los que haga falta; y si nada vale aquí, lo mismo en un sitio a ≤ 4 bloques.
// F7.6b: junto al agua (en F7.6 se negaba 91 veces de 93 con «suelo peligroso» y el bot se ahogaba repitiéndolo): si a ≤ 4 no
// vale ningún sitio y hay agua, busca uno seco a ≤ 10 bloques (de 8 por encima a 4 por debajo: desde el fondo del río, la
// orilla) y va, nadando si hace falta. Donde cava, la misma comprobación de siempre (nada líquido en el cubo de 3×7×3).
// No empieza con un hostil a ≤ 4 bloques («monstruos cerca»: en la primera prueba los zombis pegados caían al pozo con él y no
// quedaba sitio para la tapa; primero hay que huir) y no cierra si algo se ha metido en la celda («monstruo dentro»).
// Éxito: encerrado («tapiado», «cavado», «vuelvo al refugio»; «ya dentro» si ya lo estaba). Fallos: monstruos cerca · sin bloques
// ni pico · suelo peligroso · protegido · no pude poner/picar · monstruo dentro · me movieron · cancelado. Guarda el refugio en la memoria del personaje (refugio:
// los pies; refugioInfo: modo, salida, bloques puestos y picados, para salir y para reponer el terreno) y lo devuelve.
// No lo corta la amenaza: es una de las respuestas a ella. Devuelve { exito, causa, modo, pos, puestos, rotos, bloques, salida }.
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const parcela = require('../parcela')
const { conLimite, dist, esperar, hostiles, nodo, encerrado, moverHasta, prudentes } = require('./comun')
const { picar } = require('./picar_tronco')
const { liquidos } = require('../observacion')
const sv = require('./sv')

const LADOS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const APOYOS = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]] // de dónde apoyarse: abajo primero
const HONDO = 3, MAX_PICAR_MS = 12000, TAPIAR_NATURAL = 4, RADIO_VOLVER = 16, RADIO_OTRO_SITIO = 4, RADIO_LIBRE = 4
const SECO = { radio: 10, arriba: 8, abajo: 4 } // F7.6b: dónde buscar un sitio seco si hay agua (otroSitio)
// Bloques que el juego sustituye al poner otro encima (hierba alta, nieve, agua…): no estorban.
const REEMPLAZABLE = /^(air|cave_air|void_air|short_grass|grass|tall_grass|fern|large_fern|dead_bush|snow|vine|glow_lichen|water|lava|bubble_column|seagrass|tall_seagrass|fire|structure_void|light|leaf_litter|short_dry_grass|tall_dry_grass|bush)$/
const v3 = (a) => new Vec3(a[0], a[1], a[2])
const lista = (v, k) => [v.x, v.y, v.z, k ? k.name : 'air']

// ¿Qué falta para tapiarse con los pies en b? { huecos (en orden: lados de los pies, de la cabeza, apoyo del techo, techo) } o
// { mal }. Sin poner nada.
function planTapiar(bot, b) {
  const solido = (v) => sv.solido(bot.blockAt(v))
  const pie = bot.blockAt(b), cabeza = bot.blockAt(b.offset(0, 1, 0))
  if (!pie || !cabeza) return { mal: 'sin cargar' }
  if (sv.solido(pie) || sv.solido(cabeza)) return { mal: 'no cabe' }
  if (!solido(b.offset(0, -1, 0))) return { mal: 'sin suelo' }
  const huecos = []
  for (const dy of [0, 1]) for (const [dx, dz] of LADOS) { const v = b.offset(dx, dy, dz); if (!solido(v)) huecos.push(v) }
  const techo = b.offset(0, 2, 0)
  if (!solido(techo)) {
    const vecinos = [...LADOS.map(([dx, dz]) => techo.offset(dx, 0, dz)), techo.offset(0, 1, 0)]
    if (!vecinos.some(solido)) { // un apoyo encima de un lado de la cabeza (que es sólido o está en el plan)
      const [dx, dz] = LADOS.find(([x, z]) => sv.puedeTocar(b.x + x, b.y + 2, b.z + z)) || LADOS[0]
      huecos.push(techo.offset(dx, 0, dz))
    }
    huecos.push(techo)
  }
  for (const h of huecos) {
    if (!sv.puedeTocar(h.x, h.y, h.z)) return { mal: 'protegido' }
    const k = bot.blockAt(h)
    if (!k) return { mal: 'sin cargar' }
    if (!REEMPLAZABLE.test(k.name) && !sv.esLiquido(k) && k.boundingBox !== 'empty') return { mal: `estorba ${k.name}` }
  }
  // los lados de los pies necesitan apoyo: debajo, fuera o en una esquina (lo de encima se pone después)
  for (const h of huecos.filter(v => v.y === b.y)) {
    const d = h.minus(b), fuera = h.plus(d), esquinas = [h.offset(d.z, 0, d.x), h.offset(-d.z, 0, -d.x)]
    if (![h.offset(0, -1, 0), fuera, ...esquinas].some(solido)) return { mal: 'sin apoyo' }
  }
  return { huecos }
}

// Lo que suelta un bloque al picarlo con lo que se lleva (F7.7): la hierba, tierra; la piedra, guijarro, y nada sin pico.
const SUELTA = { grass_block: 'dirt', podzol: 'dirt', mycelium: 'dirt', dirt_path: 'dirt', farmland: 'dirt', stone: 'cobblestone', deepslate: 'cobbled_deepslate' }
function suelta(bot, k) {
  if (!k) return null
  if (k.harvestTools && !bot.inventory.items().some(i => k.harvestTools[i.type])) return null
  return SUELTA[k.name] || k.name
}

// ¿Se puede cavar un pozo de 3 con los pies en b? { picar: [b-1, b-2, b-3], techo: b-1, pies: b-3, ms } o { mal }.
function planCavar(bot, b) {
  const col = [1, 2, 3].map(k => b.offset(0, -k, 0)), suelo = b.offset(0, -HONDO - 1, 0)
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -HONDO - 2; dy <= 1; dy++) {
    const k = bot.blockAt(b.offset(dx, dy, dz))
    if (!k) return { mal: 'sin cargar' }
    if (sv.esLiquido(k)) return { mal: `suelo peligroso: ${k.name} cerca` }
  }
  let ms = 0
  for (const v of col) {
    const k = bot.blockAt(v)
    if (!sv.solido(k)) return { mal: `suelo peligroso: hueco debajo (${k.name})` }
    if (sv.NO_PICAR.test(k.name)) return { mal: `no se puede picar: ${k.name}` }
    if (!sv.puedeTocar(v.x, v.y, v.z)) return { mal: 'protegido' }
    ms += sv.mejorHerramienta(bot, k).ms
  }
  if (!sv.solido(bot.blockAt(suelo))) return { mal: 'suelo peligroso: hueco debajo' }
  for (const v of col.slice(1)) for (const [dx, dz] of LADOS) {
    const k = bot.blockAt(v.offset(dx, 0, dz))
    if (!sv.solido(k)) return { mal: `suelo peligroso: cueva al lado (${k.name})` }
  }
  if (!LADOS.some(([dx, dz]) => sv.solido(bot.blockAt(col[0].offset(dx, 0, dz))))) return { mal: 'sin apoyo para el techo' }
  if (ms > MAX_PICAR_MS) return { mal: 'sin pico', ms: Math.round(ms) }
  if (!sv.cuantosColocables(bot) && !col.some(v => sv.esColocable(suelta(bot, bot.blockAt(v)) || ''))) return { mal: 'sin bloques para tapar', ms: Math.round(ms) }
  return { picar: col, techo: col[0], pies: col[2], ms: Math.round(ms) }
}

// Pone un bloque colocable en dest, apoyado en la primera cara sólida que valga (abajo primero). Quita antes lo que no se sustituya
// solo si se rompe al momento (una flor, un brote). Devuelve el nombre del bloque puesto o null.
async function ponerBloque(bot, dest) {
  let k = bot.blockAt(dest)
  if (sv.solido(k)) return k.name
  if (k && !REEMPLAZABLE.test(k.name) && !sv.esLiquido(k)) {
    if (sv.mejorHerramienta(bot, k).ms > 500) return null
    try { await conLimite(bot.dig(k, true), 2000, () => bot.stopDigging()) } catch (_) { return null }
  }
  for (const [dx, dy, dz] of APOYOS) {
    const ref = bot.blockAt(dest.offset(dx, dy, dz))
    if (!sv.solido(ref)) continue
    const item = sv.colocables(bot)[0]
    if (!item) return null
    try {
      if (!bot.heldItem || bot.heldItem.name !== item.name) { await conLimite(bot.equip(item, 'hand'), 3000); await esperar(80) }
      await conLimite(bot.placeBlock(ref, new Vec3(-dx, -dy, -dz)), 3000)
    } catch (_) {}
    for (let w = 0; w < 6 && !sv.solido(bot.blockAt(dest)); w++) await esperar(50)
    k = bot.blockAt(dest)
    if (sv.solido(k)) return k.name
  }
  return null
}

const mismaCasilla = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z
// Un hostil a ≤ r bloques en horizontal y ≤ 4 en vertical (no se puede uno encerrar con él al lado).
const hostilJunto = (bot, r = RADIO_LIBRE) => hostiles(bot, r + 4).find(e => Math.hypot(e.position.x - bot.entity.position.x, e.position.z - bot.entity.position.z) <= r &&
  Math.abs(e.position.y - bot.entity.position.y) <= 4) || null
// ¿Alguna entidad (no yo ni un objeto suelto) dentro de la celda de 1×2 con los pies en b?
const ocupada = (bot, b) => Object.values(bot.entities).some(e => e !== bot.entity && e.name !== 'item' && e.name !== 'experience_orb' &&
  Math.abs(e.position.x - (b.x + 0.5)) < 0.5 + (e.width || 0.6) / 2 && Math.abs(e.position.z - (b.z + 0.5)) < 0.5 + (e.width || 0.6) / 2 &&
  e.position.y < b.y + 2 && e.position.y + (e.height || 1.8) > b.y)

async function tapiar(bot, b, plan, tarea) {
  await sv.centrar(bot)
  const puestos = []
  for (const h of plan.huecos) {
    if (tarea && tarea.cancelada) return { causa: 'cancelado', puestos }
    if (!mismaCasilla(nodo(bot), b)) return { causa: 'me movieron', puestos }
    if (sv.solido(bot.blockAt(h))) continue
    const n = await ponerBloque(bot, h)
    if (!n) return { causa: `no pude poner en ${h.x},${h.y},${h.z}` + (sv.cuantosColocables(bot) ? '' : ' (sin bloques)'), puestos }
    puestos.push([h.x, h.y, h.z, n])
  }
  // la salida: el lado de los pies con suelo firme fuera (picar ese lado y el de la cabeza y salir por él)
  const d = LADOS.find(([dx, dz]) => sv.solido(bot.blockAt(b.offset(dx, -1, dz))) && !sv.solido(bot.blockAt(b.offset(2 * dx, 0, 2 * dz)))) || LADOS[0]
  return { puestos, salida: b.offset(d[0], 0, d[1]) }
}

async function cavar(bot, b, plan, tarea) {
  await sv.centrar(bot)
  const rotos = [], puestos = []
  for (const v of plan.picar) {
    if (tarea && tarea.cancelada) return { causa: 'cancelado', rotos, puestos }
    const junto = hostilJunto(bot, 2)
    if (junto) return { causa: `monstruos cerca (${junto.name} a ${dist(bot, junto).toFixed(1)})`, rotos, puestos }
    const k = bot.blockAt(v)
    if (sv.solido(k)) {
      const { item } = sv.mejorHerramienta(bot, k)
      try { if (item && (!bot.heldItem || bot.heldItem.name !== item.name)) await conLimite(bot.equip(item, 'hand'), 3000) } catch (_) {}
      const r = await picar(bot, k, {}, tarea, 0)
      if (!r.exito) return { causa: `no pude picar ${k.name}: ${r.causa}`, rotos, puestos }
      rotos.push(lista(v, k))
    }
    for (let w = 0; w < 30 && !(bot.entity.onGround && nodo(bot).y <= v.y); w++) await esperar(50) // caer al hueco
  }
  for (let w = 0; w < 8; w++) await esperar(50) // lo picado cae con él y entra solo
  if (!mismaCasilla(nodo(bot), plan.pies)) return { causa: `no bajé (estoy en ${nodo(bot)})`, rotos, puestos }
  if (ocupada(bot, plan.pies)) return { causa: 'monstruo dentro', rotos, puestos }
  const n = await ponerBloque(bot, plan.techo)
  if (!n) return { causa: 'no pude tapar la boca' + (sv.cuantosColocables(bot) ? '' : ' (sin bloques)'), rotos, puestos }
  puestos.push(lista(plan.techo, { name: n }))
  return { rotos, puestos, salida: b }
}

// Un sitio cercano (≤ 4 bloques, con suelo y camino a pie) donde cavar o tapiarse sí valga. F7.6b: con agua, `lejos` (SECO).
function otroSitio(bot, n, lejos = null) {
  const b = nodo(bot), cands = [], R = lejos ? lejos.radio : RADIO_OTRO_SITIO
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    if ((!dx && !dz) || Math.hypot(dx, dz) > R) continue
    const s = parcela.superficie(bot, b.x + dx, b.z + dz, b.y, lejos ? lejos.arriba : 3, lejos ? lejos.abajo : 3)
    if (!s) continue
    const p = new Vec3(b.x + dx, s.y + 1, b.z + dz)
    const pc = planCavar(bot, p), pt = pc.mal ? planTapiar(bot, p) : null
    if (!pc.mal || (pt && !pt.mal && pt.huecos.length <= n)) cands.push({ p, d: Math.hypot(dx, dz) })
  }
  return cands.sort((a, c) => a.d - c.d).slice(0, 4).map(c => c.p)
}

async function irA(bot, p, tarea) {
  const meta = new goals.GoalBlock(p.x, p.y, p.z)
  const r = await moverHasta(bot, meta, () => mismaCasilla(nodo(bot), p) && bot.entity.onGround, { ms: 10000, tarea, mov: prudentes(bot) })
  return r === 'listo'
}

module.exports = async function refugiarse(bot, [modo], tarea) {
  const M = modo || 'auto', t0 = Date.now()
  if (!['auto', 'tapiar', 'cavar'].includes(M)) return { exito: false, causa: 'modo desconocido: ' + M + ' (auto, tapiar o cavar)' }
  const fin = (exito, causa, r = {}, extra = {}) => ({ exito, causa, modo: extra.modo || null, pos: nodo(bot).toArray(),
    puestos: r.puestos || [], rotos: r.rotos || [], bloques: (r.puestos || []).length, ...(r.salida ? { salida: r.salida.toArray() } : {}),
    s: +((Date.now() - t0) / 1000).toFixed(1), ...extra })
  if (encerrado(bot)) return fin(true, 'ya dentro')
  const junto = hostilJunto(bot)
  if (junto) return fin(false, 'monstruos cerca', {}, { hostil: `${junto.name}@${dist(bot, junto).toFixed(1)}` })
  try { bot.pathfinder.setGoal(null) } catch (_) {}
  for (let w = 0; w < 20 && !bot.entity.onGround; w++) await esperar(50)
  const n = sv.cuantosColocables(bot)

  // ¿Qué hacer con los pies en b? (null si nada vale)
  const decidir = (b, conVolver) => {
    const pt = planTapiar(bot, b), pc = planCavar(bot, b)
    if (M === 'tapiar') return !pt.mal && pt.huecos.length <= n ? { modo: 'tapiado', plan: pt } : { mal: pt.mal || 'sin bloques', pt, pc }
    if (M === 'cavar') return !pc.mal ? { modo: 'cavado', plan: pc } : { mal: pc.mal, pt, pc }
    if (!pt.mal && pt.huecos.length <= Math.min(n, TAPIAR_NATURAL)) return { modo: 'tapiado', plan: pt }
    if (conVolver) { // el refugio anterior, si estaba tapiado, está cerca y se puede volver a cerrar
      const info = sv.refugioInfo(bot)
      if (info && info.modo === 'tapiado' && info.pies) {
        const p = v3(info.pies), pv = planTapiar(bot, p)
        if (p.distanceTo(b) <= RADIO_VOLVER && !pv.mal && pv.huecos.length <= n) return { modo: 'tapiado', plan: pv, volver: p }
      }
    }
    if (!pc.mal) return { modo: 'cavado', plan: pc }
    if (!pt.mal && pt.huecos.length <= n) return { modo: 'tapiado', plan: pt }
    return { mal: pc.mal, pt, pc }
  }

  let b = nodo(bot), d = decidir(b, true), movido = null
  // F7.6b: ¿hay agua aquí? (en ella, o agua honda a ≤ 3, el sentido agua_profunda, o es lo que impide cavar)
  const mojado = () => sv.esLiquido(bot.blockAt(nodo(bot))) || liquidos(bot, nodo(bot)).honda || /water/.test((d.pc && d.pc.mal) || '')
  for (const lejos of [null, SECO]) { // aquí no: probar en un sitio cercano y, con agua, en uno seco más lejos
    if (!d.mal || (lejos && !mojado())) break
    if (lejos && hostilJunto(bot)) return fin(false, 'monstruos cerca')
    for (const p of otroSitio(bot, n, lejos)) {
      if (tarea && tarea.cancelada) return fin(false, 'cancelado')
      if (!(await irA(bot, p, tarea))) continue
      b = nodo(bot); const d2 = decidir(b, false)
      if (!d2.mal) { d = d2; movido = b.toArray(); break }
    }
  }
  if (d.mal) {
    const pt = d.pt || {}, pc = d.pc || {}
    const faltan = !pt.mal && pt.huecos.length > n ? `faltan bloques (${pt.huecos.length}, llevo ${n})` : pt.mal
    const causa = pc.mal === 'protegido' || pt.mal === 'protegido' ? 'protegido'
      : pc.mal && pc.mal.startsWith('suelo peligroso') ? 'suelo peligroso'
      : pc.mal === 'sin pico' ? 'sin bloques ni pico' : !pt.mal ? 'sin bloques' : 'sin sitio'
    return fin(false, causa, {}, { tapiar: faltan || null, cavar: pc.mal || null, ...(pc.ms ? { picar_ms: pc.ms } : {}) })
  }
  if (d.volver) {
    if (!(await irA(bot, d.volver, tarea))) return fin(false, 'no llego al refugio')
    b = nodo(bot); d.plan = planTapiar(bot, b)
    if (d.plan.mal) return fin(false, 'refugio roto: ' + d.plan.mal)
  }
  const r = d.modo === 'tapiado' ? await tapiar(bot, b, d.plan, tarea) : await cavar(bot, b, d.plan, tarea)
  const extra = { modo: d.modo, ...(movido ? { movido } : {}) }
  if (r.causa) return fin(false, r.causa, r, extra)
  await esperar(150)
  if (!encerrado(bot)) return fin(false, 'no quedó cerrado', r, extra)
  if (ocupada(bot, nodo(bot))) return fin(false, 'monstruo dentro', r, extra)
  sv.anotarRefugio(bot, nodo(bot), { modo: d.modo, salida: r.salida.toArray(), puestos: r.puestos, rotos: r.rotos || [] })
  return fin(true, d.volver ? 'vuelvo al refugio' : d.modo, r, extra)
}
module.exports.planTapiar = planTapiar
module.exports.planCavar = planCavar
module.exports.ponerBloque = ponerBloque
module.exports.REEMPLAZABLE = REEMPLAZABLE
module.exports.ocupada = ocupada
