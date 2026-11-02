// cosechar [ZONA=HOGAR] [sin_guardar] (2026-11-02, el primer oficio): recorre los cultivos maduros de la zona (trigo, zanahorias, patatas,
// remolachas), rompe cada uno y vuelve a plantar la misma semilla en el mismo bloque (el campo queda como estaba). Sin romper nada más.
// Al terminar guarda lo cosechado en un cofre marcado con un marco con comida (zanahoria, chuleta…: cualquier alimento, o el propio
// cultivo) pegado a él; si hay varios, el del marco con lo que lleva. Éxito si cosechó algo. Fallos: sin zona · sin cultivos maduros.
// Devuelve { exito, causa, zona, cosechados, replantados, sinSemilla, guardado: { objeto: n }, cofre }.
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const zonas = require('../zonas')
const sv = require('./sv')
const depositar = require('./depositar')
const recoger = require('./recoger')
const { conLimite, moverHasta, esperar, prudentes } = require('./comun')

// bloque del cultivo → su semilla (el objeto que se vuelve a plantar) y la edad en que está maduro
const CULTIVOS = {
  wheat: { semilla: 'wheat_seeds', edad: 7 }, carrots: { semilla: 'carrot', edad: 7 },
  potatoes: { semilla: 'potato', edad: 7 }, beetroots: { semilla: 'beetroot_seeds', edad: 3 },
}
// lo que se guarda en el cofre del marco: lo que sueltan esos cultivos
const COSECHA = new Set(['wheat', 'wheat_seeds', 'carrot', 'potato', 'poisonous_potato', 'beetroot', 'beetroot_seeds'])
const CONTENEDORES = new Set(['chest', 'trapped_chest', 'barrel'])
const MARCOS = new Set(['item_frame', 'glow_item_frame'])
const MAX_CULTIVOS = 400, MS_MAX = 600000

function madura(b) {
  const c = b && CULTIVOS[b.name]
  if (!c) return false
  const p = typeof b.getProperties === 'function' ? b.getProperties() : {}
  const edad = p.age !== undefined ? Number(p.age) : b.metadata
  return edad >= c.edad
}

// El objeto que lleva un marco (nombre del juego) o null si está vacío. La ranura de la entidad guarda { itemId, … } en la metadata.
function itemDeMarco(bot, e) {
  for (const v of Object.values(e.metadata || {})) {
    if (v && typeof v === 'object' && v.itemId != null) { const it = bot.registry.items[v.itemId]; if (it) return it.name }
  }
  return null
}

// Los cofres que tienen pegado un marco con comida (o con un cultivo). Se ven los marcos cargados (entidades) en el radio.
// Devuelve [{ pos: Vec3 del cofre, objeto, marco }], de más cerca a más lejos de `desde`.
function cofresMarcados(bot, desde, radio = 96) {
  const salida = [], vistos = new Set()
  for (const e of Object.values(bot.entities)) {
    if (!MARCOS.has(e.name) || e.isValid === false || e.position.distanceTo(desde) > radio) continue
    const objeto = itemDeMarco(bot, e)
    if (!objeto || !(bot.registry.foodsByName[objeto] || COSECHA.has(objeto))) continue
    const casilla = new Vec3(Math.floor(e.position.x), Math.floor(e.position.y), Math.floor(e.position.z))
    // el marco cuelga de su cofre: el vecino más pegado al punto de la entidad (que está a 0,03 de la pared)
    const vecino = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
      .map(([dx, dy, dz]) => casilla.offset(dx, dy, dz))
      .filter(p => { const k = bot.blockAt(p); return k && CONTENEDORES.has(k.name) })
      .sort((a, b) => a.offset(0.5, 0.5, 0.5).distanceTo(e.position) - b.offset(0.5, 0.5, 0.5).distanceTo(e.position))[0]
    if (!vecino) continue
    const clave = `${vecino.x},${vecino.y},${vecino.z}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    salida.push({ pos: vecino, objeto, marco: e })
  }
  return salida.sort((a, b) => a.pos.distanceTo(desde) - b.pos.distanceTo(desde))
}

// Planta de nuevo la semilla de `cultivo` en (x, y, z), sobre la tierra de labranza de debajo. true si quedó el cultivo.
async function plantar(bot, cultivo, pos, tarea) {
  const semilla = bot.inventory.items().find(i => i.name === CULTIVOS[cultivo].semilla)
  const suelo = bot.blockAt(pos.offset(0, -1, 0))
  if (!semilla || !suelo || suelo.name !== 'farmland' || !sv.puedePoner(pos.x, pos.y, pos.z)) return false
  const ahora = bot.blockAt(pos)
  if (ahora && ahora.name === cultivo) return true
  if (ahora && ahora.name !== 'air') return false
  try {
    if (!bot.heldItem || bot.heldItem.name !== semilla.name) { await conLimite(bot.equip(semilla, 'hand'), 3000); await esperar(80) }
    await conLimite(bot.placeBlock(suelo, new Vec3(0, 1, 0)), 3000)
  } catch (_) { /* se comprueba abajo */ }
  for (let w = 0; w < 8 && (bot.blockAt(pos) || {}).name !== cultivo; w++) await esperar(60)
  return (bot.blockAt(pos) || {}).name === cultivo
}

// Lo cosechado a su cofre: primero el marcado con lo que llevo (zanahoria con zanahorias), luego el más cercano; si uno se llena, el siguiente.
async function guardar(bot, desde, tarea) {
  const lleva = () => bot.inventory.items().filter(i => COSECHA.has(i.name))
  if (!lleva().length) return { guardado: {}, cofre: null, causa: 'nada que guardar' }
  const marcados = cofresMarcados(bot, desde)
  if (!marcados.length) return { guardado: {}, cofre: null, causa: 'sin cofre con marco de comida' }
  const nombres = new Set(lleva().map(i => i.name))
  marcados.sort((a, b) => (nombres.has(b.objeto) ? 1 : 0) - (nombres.has(a.objeto) ? 1 : 0))
  const guardado = {}, usados = []
  let causa = null
  for (const c of marcados) {
    if (!lleva().length || (tarea && tarea.cancelada)) break
    const meta = c.pos.offset(0.5, 0.5, 0.5)
    const r = await moverHasta(bot, new goals.GoalNear(c.pos.x, c.pos.y, c.pos.z, 2), () => bot.entity.position.offset(0, 1.62, 0).distanceTo(meta) <= 4,
      { ms: (15 + meta.distanceTo(bot.entity.position)) * 1000, tarea, mov: prudentes(bot, { pisarVedadas: true }) })
    const b = bot.blockAt(c.pos)
    if (r !== 'listo' || !b || !CONTENEDORES.has(b.name)) { causa = `no llego al cofre (${r})`; continue }
    try {
      const g = await depositar.conCerrojo(`${c.pos.x},${c.pos.y},${c.pos.z}`, () => depositar.guardarEn(bot, b, tarea, it => !COSECHA.has(it.name)))
      usados.push(`${c.pos.x},${c.pos.y},${c.pos.z}`)
      for (const [k, n] of Object.entries(g.movido)) guardado[k] = (guardado[k] || 0) + n
      if (g.lleno) causa = 'cofre lleno'
    } catch (e) { causa = 'no se abrió: ' + e.message }
  }
  await esperar(300)
  return { guardado, cofre: usados.join(' '), causa: causa || (Object.keys(guardado).length ? 'guardado' : 'no guardé nada') }
}

module.exports = async function cosechar(bot, args, tarea) {
  const nombre = (args || []).find(a => a && a !== 'sin_guardar') || 'HOGAR'
  const zona = zonas.leer().zonas.find(z => z.nombre.toLowerCase() === String(nombre).toLowerCase())
  if (!zona) return { exito: false, causa: 'sin zona', zona: nombre, cosechados: 0, replantados: 0 }
  const x1 = Math.min(zona.x1, zona.x2), x2 = Math.max(zona.x1, zona.x2), z1 = Math.min(zona.z1, zona.z2), z2 = Math.max(zona.z1, zona.z2)
  const dentro = (p) => p.x >= x1 && p.x <= x2 && p.z >= z1 && p.z <= z2 && (zona.y1 == null || (p.y >= zona.y1 && p.y <= zona.y2))
  const centro = new Vec3((x1 + x2) / 2, bot.entity.position.y, (z1 + z2) / 2)
  const radio = Math.min(128, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 2) + 8)
  const pendientes = bot.findBlocks({ matching: (b) => !!b && madura(b), point: centro, maxDistance: radio, count: MAX_CULTIVOS })
    .filter(p => dentro(p) && !zonas.pasoVedado(p.x, p.y, p.z) && sv.puedePoner(p.x, p.y, p.z))
  const base = { zona: zona.nombre, cosechados: 0, replantados: 0, sinSemilla: 0 }
  if (!pendientes.length) return { exito: false, causa: 'sin cultivos maduros', ...base, guardado: {} }
  const mov = () => prudentes(bot, { pisarVedadas: true })
  const hecho = {}, huecos = []
  const t0 = Date.now()
  let causa = null
  while (pendientes.length && !(tarea && tarea.cancelada) && Date.now() - t0 < MS_MAX) {
    pendientes.sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position))
    const p = pendientes.shift(), meta = p.offset(0.5, 0.5, 0.5)
    const r = await moverHasta(bot, new goals.GoalNear(p.x, p.y, p.z, 2), () => bot.entity.position.offset(0, 1.62, 0).distanceTo(meta) <= 4,
      { ms: 20000 + meta.distanceTo(bot.entity.position) * 1000, tarea, mov: mov() })
    if (r === 'cancelado') break
    const b = bot.blockAt(p)
    if (r !== 'listo') { causa = `no llego a un cultivo (${r})`; continue }
    if (!madura(b)) continue // otro lo cosechó, o aún no estaba: se deja
    const cultivo = b.name
    try { await conLimite(bot.dig(b, true), 5000, () => bot.stopDigging()) } catch (e) { causa = 'no pude romper: ' + e.message; continue }
    base.cosechados++
    hecho[cultivo] = (hecho[cultivo] || 0) + 1
    await esperar(350) // los objetos salen y caen
    await recoger(bot, ['4', '-', 'max:8'], tarea).catch(() => {})
    if (await plantar(bot, cultivo, p, tarea)) base.replantados++
    else huecos.push({ cultivo, p })
  }
  // los que se quedaron sin semilla (no entró el objeto, otra pasada de recoger…): una segunda oportunidad con lo que haya ahora
  for (const h of huecos.splice(0)) {
    if (tarea && tarea.cancelada) break
    const meta = h.p.offset(0.5, 0.5, 0.5)
    await moverHasta(bot, new goals.GoalNear(h.p.x, h.p.y, h.p.z, 2), () => bot.entity.position.offset(0, 1.62, 0).distanceTo(meta) <= 4,
      { ms: 15000, tarea, mov: mov() })
    if (await plantar(bot, h.cultivo, h.p, tarea)) base.replantados++
    else base.sinSemilla++
  }
  if (!base.cosechados) return { exito: false, causa: causa || (tarea && tarea.cancelada ? 'cancelado' : 'no coseché nada'), ...base, guardado: {} }
  const g = (tarea && tarea.cancelada) || (args || []).includes('sin_guardar') ? { guardado: {}, cofre: null, causa: 'sin guardar' } : await guardar(bot, centro, tarea)
  return { exito: true, causa: g.causa, ...base, cultivos: hecho, guardado: g.guardado, cofre: g.cofre }
}
Object.assign(module.exports, { CULTIVOS, COSECHA, madura, itemDeMarco, cofresMarcados })
