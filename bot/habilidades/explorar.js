// explorar [rumbo|-|volver] [bloques=40] [segundos=60] [nadando] (F6): alejarse en una dirección sin romper ni poner bloques, sin
// pisar zonas vedadas ni agua (con «nadando» vadea o nada: solo se vuelve si se queda sin aire), y contar lo visto. Rumbo: norte, sur, este, oeste, noreste… (o n, s, e, o, ne…), grados desde el
// norte en el sentido del reloj, «-» (al azar, lejos del campamento) o «volver» (al campamento). Límites: ≤ 120 bloques,
// ≤ 180 s. Avanza por tramos de ≤ 12 bloques (más lejos el mundo no está cargado y no se puede juzgar el terreno): para cada
// tramo busca un destino con suelo seco (parcela.superficie), fuera de zonas vedadas (y de su anillo de 2) y con camino a pie,
// probando desvíos de ±30, ±60 y ±90°. Un vigía corta la marcha si pisa agua o le falta aire y vuelve a la última casilla seca
// (causa «agua»). El campamento es la posición de la primera salida (o la orden `campamento`): «vuelve al campamento».
// Devuelve { exito, causa, pos, recorrido, campamento, bioma, altura, visto: { troncos, agua, minerales, arboles, jugadores, animales } }.
// F8.0b (E0, explorar robusto; en companero acertaba 4 de 437 veces): el suelo de cada tramo es parcela.pisable (toda la columna,
// atravesando copas y techos, el más cercano a la altura del bot) y no parcela.superficie (el primer bloque desde arriba). Fuera del
// mundo del usuario, si ningún desvío tiene camino a pie, otra vuelta con movimientos que pican y suben poniendo bloques (los de
// salir_del_refugio, sin tocar lo protegido); un tramo atascado (20 s sin avanzar) o sin camino se abandona y se prueba otro desvío
// (2 seguidos acaban); y si no hay destino en ningún rumbo y no se ve el cielo (túnel, cueva cerrada), primero desatascarse. Lo
// roto y lo puesto al cavar va en la respuesta (rotos, puestos), para reponer el terreno.
const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const memoria = require('../memoria')
const zonas = require('../zonas')
const parcela = require('../parcela')
const mundo = require('../mundo')
const { moverHasta, prudentes, prudentesSecos, hayCamino, esperar, esBot } = require('./comun')
const MAX_ABANDONOS = 2, MAX_DESATASCOS = 1

const RUMBOS = { norte: 0, n: 0, noreste: 45, ne: 45, este: 90, e: 90, sureste: 135, se: 135, sur: 180, s: 180, suroeste: 225, so: 225,
  oeste: 270, o: 270, noroeste: 315, no: 315 }
const DESVIOS = [0, 30, -30, 60, -60, 90, -90]
const TRAMO = 12, MAX_BLOQUES = 120, MAX_S = 180, VISTA = 24, SIN_AVANCE = 20000 // ms sin ganar un bloque antes de rendirse
const campamentoDe = (bot) => memoria(bot).campamento || null
const enAgua = (bot) => { const b = bot.blockAt(bot.entity.position); return !!(b && b.name === 'water') }
// La casilla de suelo seco más cercana (hasta `radio`), para salir del agua.
function tierraCercana(bot, radio) {
  const p = bot.entity.position.floored()
  let mejor = null
  for (let dx = -radio; dx <= radio; dx++) for (let dz = -radio; dz <= radio; dz++) {
    const d = Math.hypot(dx, dz)
    if (d === 0 || (mejor && d >= mejor.d)) continue
    const s = parcela.pisable(bot, p.x + dx, p.z + dz, p.y, 6, 6)
    if (s) mejor = { x: p.x + dx, y: s.y, z: p.z + dz, d }
  }
  return mejor
}

// Lo que hay a la vista alrededor: troncos, agua, minerales (por tipo), hasta 5 árboles (troncos) y entidades.
function mirar(bot) {
  const p = bot.entity.position
  const bloques = bot.findBlocks({ matching: b => /_log$|^water$|_ore$/.test(b.name), maxDistance: VISTA, count: 600 })
  const v = { troncos: 0, agua: 0, minerales: {}, arboles: [] }
  for (const pos of bloques) {
    const n = bot.blockAt(pos).name
    if (n.endsWith('_log')) { v.troncos++; if (v.arboles.length < 5 && !v.arboles.some(a => Math.hypot(a[0] - pos.x, a[2] - pos.z) < 4)) v.arboles.push([pos.x, pos.y, pos.z]) }
    else if (n === 'water') v.agua++
    else v.minerales[n] = (v.minerales[n] || 0) + 1
  }
  const ents = Object.values(bot.entities).filter(e => e !== bot.entity && e.position.distanceTo(p) <= VISTA)
  v.jugadores = ents.filter(e => e.type === 'player' && !esBot(e.username)).map(e => e.username)
  v.animales = {}
  const vistos = memoria(bot, 'animales_vistos', () => ({})) // F8.1: dónde se vio cada tipo por última vez (cazar vuelve allí)
  for (const e of ents.filter(e => e.type === 'animal' || e.type === 'water_creature')) {
    v.animales[e.name] = (v.animales[e.name] || 0) + 1
    vistos[e.name] = { pos: e.position.floored().toArray(), t: Date.now() }
  }
  return v
}
const suma = (a, b) => {
  // Las vistas de dos tramos se solapan: se guarda el máximo de cada cuenta, no la suma.
  const r = { troncos: Math.max(a.troncos, b.troncos), agua: Math.max(a.agua, b.agua), minerales: { ...a.minerales }, arboles: [...a.arboles], jugadores: [...new Set([...a.jugadores, ...b.jugadores])], animales: { ...a.animales } }
  for (const [k, n] of Object.entries(b.minerales)) r.minerales[k] = Math.max(r.minerales[k] || 0, n)
  for (const [k, n] of Object.entries(b.animales)) r.animales[k] = Math.max(r.animales[k] || 0, n)
  for (const t of b.arboles) if (r.arboles.length < 5 && !r.arboles.some(a => Math.hypot(a[0] - t[0], a[2] - t[2]) < 4)) r.arboles.push(t)
  return r
}

// Un destino a `d` bloques en el rumbo `ang` (grados desde el norte, reloj) con suelo seco, fuera de zonas vedadas y con camino.
async function destino(bot, ang, d, mov, evitar = null, nadar = false) {
  const p = bot.entity.position
  const razones = new Set()
  for (const g of DESVIOS) {
    if (g === evitar) continue // el desvío del tramo que se acaba de abandonar
    await new Promise(resolve => setImmediate(resolve)) // el cálculo de camino es síncrono: ceder el paso a los demás personajes
    const a = (ang + g) * Math.PI / 180
    const x = Math.floor(p.x + Math.sin(a) * d), z = Math.floor(p.z - Math.cos(a) * d)
    const s = parcela.pisable(bot, x, z, p.y, 24, 24) || (nadar ? parcela.superficieAgua(bot, x, z, p.y) : null)
    if (!s) { razones.add('sin suelo seco'); continue }
    let vedado = false
    for (let dx = -2; dx <= 2 && !vedado; dx++) for (let dz = -2; dz <= 2 && !vedado; dz++) vedado = zonas.pasoVedado(x + dx, s.y + 1, z + dz)
    if (vedado) { razones.add('zona vedada delante'); continue }
    const meta = new goals.GoalNearXZ(x, z, 2)
    if (!hayCamino(bot, meta, 200, mov)) { razones.add('sin camino'); continue }
    return { meta, x, y: s.y + 1, z, desvio: g }
  }
  return { razon: razones.has('zona vedada delante') && razones.size === 1 ? 'zona vedada delante' : [...razones].join('/') || 'sin destino' }
}

module.exports = async function explorar(bot, [rumbo, bloques, segundos, modo], tarea) {
  let nadar = modo === 'nadando'
  const p0 = bot.entity.position.clone()
  if (!campamentoDe(bot)) memoria(bot).campamento = p0.floored().toArray()
  const camp = campamentoDe(bot)
  const D = Math.min(MAX_BLOQUES, parseFloat(bloques) || 40), ms = Math.min(MAX_S, parseFloat(segundos) || 60) * 1000, t0 = Date.now()
  const volver = rumbo === 'volver'
  let ang
  if (volver) ang = null
  else if (!rumbo || rumbo === '-') { // al azar, pero lejos del campamento (si está a > 8 bloques)
    const lejos = Math.hypot(p0.x - camp[0], p0.z - camp[2]) > 8 ? Math.atan2(p0.x - camp[0], -(p0.z - camp[2])) * 180 / Math.PI : Math.random() * 360
    ang = (lejos + (Math.random() - 0.5) * 90 + 360) % 360
  } else if (RUMBOS[rumbo.toLowerCase()] !== undefined) ang = RUMBOS[rumbo.toLowerCase()]
  else if (!isNaN(parseFloat(rumbo))) ang = ((parseFloat(rumbo) % 360) + 360) % 360
  else return { exito: false, causa: 'rumbo desconocido: ' + rumbo }

  let visto = mirar(bot), causa = null, seco = p0.floored(), agua = false
  let mov = nadar ? prudentes(bot) : prudentesSecos(bot)
  const puedeCavar = mundo.nombre !== 'usuario' // F8.0b: la segunda vuelta que pica y pone, solo fuera del mundo del usuario
  // F8.0b: fuera del mundo del usuario, el agua no acaba la exploración: se aprende a nadar (como «nadando») y se sigue
  let aprendioANadar = false
  const nadarDesdeAhora = () => { if (puedeCavar && !nadar) { nadar = true; aprendioANadar = true; mov = prudentes(bot) } return nadar }
  const rotos = [], puestos = [], cavados = { tramos: 0 }
  let abandonos = 0, evitar = null, desatascos = 0
  // lo que cambia junto al bot mientras va con los movimientos que cavan (pathfinder no lo cuenta)
  const alCambiar = (viejo, nuevo) => {
    if (!cavando || !viejo || !nuevo || viejo.position.distanceTo(bot.entity.position) > 4) return
    if (viejo.boundingBox === 'block' && nuevo.boundingBox === 'empty') rotos.push([viejo.position.x, viejo.position.y, viejo.position.z, viejo.name])
    else if (viejo.boundingBox === 'empty' && nuevo.boundingBox === 'block') puestos.push([nuevo.position.x, nuevo.position.y, nuevo.position.z, nuevo.name])
  }
  let cavando = false
  // F8.0b: recién llegado (un tp, una reconexión) el mundo de alrededor aún no está: sin esto, todos los destinos «sin suelo seco»
  if (typeof bot.waitForChunksToLoad === 'function') { try { await Promise.race([bot.waitForChunksToLoad(), esperar(5000)]) } catch (_) {} }
  bot.on('blockUpdate', alCambiar)
  if (!nadar && enAgua(bot)) { // empieza con los pies en el agua: primero a tierra firme (los movimientos secos no saben salir del agua)
    const s = tierraCercana(bot, puedeCavar ? 12 : 8)
    if (s) await moverHasta(bot, new goals.GoalNear(s.x, s.y + 1, s.z, 0), () => !enAgua(bot) && bot.entity.onGround, { ms: 20000, tarea, mov: prudentes(bot) })
    if (enAgua(bot) && !nadarDesdeAhora()) { bot.removeListener('blockUpdate', alCambiar); return { exito: false, causa: 'agua', pos: bot.entity.position.floored().toArray(), recorrido: 0, campamento: camp, visto } }
    if (!enAgua(bot)) seco = bot.entity.position.floored()
  }
  const recorrido = () => Math.hypot(bot.entity.position.x - p0.x, bot.entity.position.z - p0.z)
  const faltaAlCamp = () => Math.hypot(bot.entity.position.x - camp[0] - 0.5, bot.entity.position.z - camp[2] - 0.5)
  while (!causa) {
    if (tarea && tarea.cancelada) { causa = 'cancelado'; break }
    if (Date.now() - t0 > ms) { causa = 'tiempo agotado'; break }
    if (volver ? faltaAlCamp() <= 3 : recorrido() >= D) { causa = 'llegué'; break }
    const p = bot.entity.position
    const a = volver ? Math.atan2(camp[0] + 0.5 - p.x, -(camp[2] + 0.5 - p.z)) * 180 / Math.PI : ang
    const d = Math.min(TRAMO, volver ? faltaAlCamp() : D - recorrido())
    let movTramo = mov
    let dst = await destino(bot, a, Math.max(3, d), mov, evitar, nadar)
    if (!dst.meta && puedeCavar) { // segunda vuelta: pudiendo picar y subir poniendo bloques
      const cava = require('./salir_del_refugio').movimientos(bot)
      const d2 = await destino(bot, a, Math.max(3, d), cava, evitar)
      if (d2.meta) { dst = d2; movTramo = cava }
    }
    if (!dst.meta && !nadar && /sin suelo seco/.test(dst.razon || '') && nadarDesdeAhora()) { // pantano, manglar: sin suelo seco, a nado
      dst = await destino(bot, a, Math.max(3, d), mov, evitar, true)
      movTramo = mov
    }
    if (!dst.meta && puedeCavar && desatascos < MAX_DESATASCOS && !enAgua(bot) && !require('./escalera').fuera(bot)) { // túnel o cueva cerrada
      desatascos++
      const r = await require('./desatascarse')(bot, [], tarea)
      rotos.push(...(r.rotos || [])); puestos.push(...(r.puestos || []))
      if (r.exito) continue
    }
    if (!dst.meta) { causa = dst.razon; break }
    cavando = movTramo !== mov
    if (cavando) cavados.tramos++
    let mejorAvance = recorrido(), tAvance = Date.now(), atascado = false
    const vigia = () => { // pisar agua (aunque sea somera: el navegador «seco» no sabe salir de ella) o quedarse sin aire;
      // nadando, solo quedarse sin aire (la cabeza bajo el agua un rato). Y no insistir: 20 s sin ganar un bloque es atasco.
      const p = bot.entity.position
      const av = volver ? -faltaAlCamp() : recorrido()
      if (av > mejorAvance + 1) { mejorAvance = av; tAvance = Date.now() }
      else if (Date.now() - tAvance > SIN_AVANCE) { atascado = true; return true }
      const ojo = bot.blockAt(bot.entity.position.offset(0, 1.62, 0))
      const sinAire = !!ojo && ojo.name === 'water' && bot.oxygenLevel !== undefined && bot.oxygenLevel < (nadar ? 10 : 20) // la cabeza bajo el agua
      if ((!nadar && enAgua(bot)) || sinAire) { agua = true; return true }
      if (bot.entity.onGround && !enAgua(bot)) seco = p.floored()
      return Math.hypot(dst.x + 0.5 - bot.entity.position.x, dst.z + 0.5 - bot.entity.position.z) <= 2.2
    }
    const r = await moverHasta(bot, dst.meta, vigia, { ms: Math.min(ms - (Date.now() - t0), 45000), tarea, mov: movTramo })
    cavando = false
    if (agua) { // salir del agua: volver a la última casilla seca
      await moverHasta(bot, new goals.GoalNear(seco.x, seco.y, seco.z, 1), () => bot.entity.position.distanceTo(seco) <= 1.5 && bot.entity.onGround, { ms: 15000, tarea, mov })
      agua = false
      // F8.0b: fuera del mundo del usuario, seguir nadando (y el tramo cuenta como abandonado); sin aire, también se abandona
      if (!nadarDesdeAhora() && !aprendioANadar) { causa = 'agua'; break }
      if (++abandonos >= MAX_ABANDONOS + 1) { causa = 'agua'; break }
      evitar = dst.desvio
      continue
    }
    if (r === 'cancelado') { causa = 'cancelado'; break }
    if (r === 'sin camino' || atascado) { // F8.0b: abandonar este tramo y probar otro desvío; dos seguidos acaban
      if (++abandonos >= MAX_ABANDONOS) { causa = atascado ? 'sin avance' : 'sin camino'; break }
      evitar = dst.desvio
      continue
    }
    abandonos = 0; evitar = null
    visto = suma(visto, mirar(bot))
    await esperar(100)
  }
  bot.removeListener('blockUpdate', alCambiar)
  const p = bot.entity.position.floored()
  let bioma = null
  try { const b = bot.blockAt(p); bioma = b?.biome?.name || bot.registry.biomes[bot.world.getBiome(p)]?.name || null } catch (_) {}
  const datos = { pos: p.toArray(), recorrido: +recorrido().toFixed(1), campamento: campamentoDe(bot), bioma, altura: p.y, visto, pedido: D, rumbo: volver ? 'volver' : Math.round(ang), nadando: nadar, ...(aprendioANadar ? { aprendio_a_nadar: true } : {}),
    ...(rotos.length || puestos.length || cavados.tramos || desatascos ? { rotos, puestos, cavados: cavados.tramos, desatascos } : {}) }
  const exito = causa === 'llegué' || (!volver && recorrido() >= 0.75 * D)
  return { exito, causa, ...datos }
}
module.exports.mirar = mirar
module.exports.RUMBOS = RUMBOS
