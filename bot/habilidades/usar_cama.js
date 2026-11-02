// usar_cama [radio=16] (2026-11-01, pedido del usuario: «duerme», «usa la cama» y «ven a la cama» son la misma orden): va a la cama
// puesta más cercana (≤ radio bloques); si no hay ninguna, pone la que lleve y, si no lleva, la fabrica (3 de lana y tablones) y la
// pone. De día, un clic en ella fija el punto de reaparición; de noche, duerme en ella (también lo fija) hasta que le despierte el
// día. La cama se queda puesta (a diferencia de `dormir`, que la recoge): el spawn también. Se acerca sin romper ni poner nada.
// Éxito «spawn guardado» o «amanece» (+ `puesta: true` si la puso él). Fallos: no puedo hacer una cama (…) · sin sitio para la cama ·
// no pude poner la cama · no llego · monstruos cerca · la cama está ocupada · despertado · cancelado.
const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const fs = require('fs')
const path = require('path')
const mundo = require('../mundo')
const { conLimite, esperar, moverHasta, prudentes } = require('./comun')
const { sitioCama } = require('./dormir')
const fabricar = require('./fabricar')
const sv = require('./sv')

const MAX_S = 720
// 2026-11-02 (pedido del usuario: con 4 camas, todos iban a la misma y dos se quedaban sin dormir): cada bot se reserva una cama (la
// cabecera, 'x,y,z' → nombre) y los demás eligen otra; la próxima vez vuelve a la suya. Las ocupadas (alguien dormido) se saltan, y si al
// acostarse está ocupada prueba la siguiente. Con cada bot en su propio proceso (bot/conectar.sh, /connect) un Map en memoria no lo ve nadie
// más: las reservas van a un fichero compartido (servidor-supervivencia/logs/camas-<mundo>.json) y caducan a los 30 min.
const CADUCA_MS = 30 * 60 * 1000
class Reservas {
  constructor(ruta = path.join(__dirname, '..', '..', 'servidor-supervivencia', 'logs', `camas-${mundo.nombre}.json`), ahora = Date.now) {
    this.ruta = ruta; this.ahora = ahora
  }
  leer() {
    let d = {}
    try { d = JSON.parse(fs.readFileSync(this.ruta, 'utf8')) } catch (_) {}
    for (const [k, v] of Object.entries(d)) if (!v || this.ahora() - v.t > CADUCA_MS) delete d[k]
    return d
  }
  guardar(d) {
    try { fs.mkdirSync(path.dirname(this.ruta), { recursive: true }); const tmp = `${this.ruta}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(d)); fs.renameSync(tmp, this.ruta) } catch (_) {}
  }
  get(k) { const v = this.leer()[k]; return v ? v.bot : undefined }
  has(k) { return this.get(k) !== undefined }
  set(k, bot) { const d = this.leer(); d[k] = { bot, t: this.ahora() }; this.guardar(d); return this }
  delete(k) { const d = this.leer(); const habia = k in d; delete d[k]; this.guardar(d); return habia }
  * [Symbol.iterator]() { for (const [k, v] of Object.entries(this.leer())) yield [k, v.bot] }
}
const RESERVAS = new Reservas()
const DIR = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }
const clave = (v) => `${v.x},${v.y},${v.z}`
// Las camas a ≤ r, una por cama (su cabecera), de la más cercana a la más lejana: [{ v, ocupada }]
function camas(bot, r) {
  const vistas = new Map()
  for (const p of bot.findBlocks({ matching: (b) => b.name.endsWith('_bed'), maxDistance: r, count: 64 })) {
    const k = bot.blockAt(p); if (!k) continue
    let pr = {}; try { pr = k.getProperties() } catch (_) {}
    const [dx, dz] = DIR[pr.facing] || [0, 0]
    const v = pr.part === 'foot' ? p.offset(dx, 0, dz) : p // los pies apuntan hacia la cabecera
    if (!vistas.has(clave(v))) vistas.set(clave(v), { v, ocupada: pr.occupied === true })
    else if (pr.occupied === true) vistas.get(clave(v)).ocupada = true
  }
  return [...vistas.values()].sort((a, b) => a.v.distanceTo(bot.entity.position) - b.v.distanceTo(bot.entity.position))
}
// La suya si sigue ahí; si no, la libre más cercana que no sea de otro bot. Se la reserva. null si no hay ninguna.
function elegirCama(bot, r, descartadas) {
  const yo = bot.username, lista = camas(bot, r).filter(c => !descartadas.has(clave(c.v)))
  const mia = lista.find(c => RESERVAS.get(clave(c.v)) === yo && !c.ocupada)
  const c = mia || lista.find(c => !c.ocupada && (!RESERVAS.has(clave(c.v)) || RESERVAS.get(clave(c.v)) === yo))
  if (!c) return null
  for (const [k, n] of RESERVAS) if (n === yo) RESERVAS.delete(k) // una cama por bot
  RESERVAS.set(clave(c.v), yo)
  return c.v
}

// Una casilla a ≤ 6 bloques donde el bot puede estar de pie y desde la que sitioCama encuentra sitio; la más cercana, o null
function buscarSitio(bot) {
  const b = bot.entity.position.floored(), libre = (v) => { const k = bot.blockAt(v); return !!k && k.boundingBox === 'empty' && !sv.esLiquido(k) }
  const cand = []
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) for (let dy = -2; dy <= 2; dy++) {
    const s = b.offset(dx, dy, dz)
    if (libre(s) && libre(s.offset(0, 1, 0)) && sv.solido(bot.blockAt(s.offset(0, -1, 0))) && sitioCama(bot, s)) cand.push(s)
  }
  return cand.sort((a, c) => a.distanceTo(b) - c.distanceTo(b))[0] || null
}

// La que lleve (o una recién fabricada), en dos casillas libres a su lado; devuelve su posición o { causa }
async function ponerCama(bot, tarea) {
  let cama = bot.inventory.items().find(i => i.name.endsWith('_bed'))
  if (!cama) {
    const f = await fabricar(bot, ['cama'], tarea)
    cama = bot.inventory.items().find(i => i.name.endsWith('_bed'))
    if (!cama) return { causa: `no veo ninguna cama y no puedo hacer una (${f.causa || 'faltan 3 de lana y tablones'})` }
  }
  let sitio = sitioCama(bot)
  if (!sitio) { // aquí no cabe (terreno irregular): la casilla más cercana a ≤ 6 desde la que sí, y allí
    const d = buscarSitio(bot)
    if (!d) return { causa: 'sin sitio para la cama' }
    await moverHasta(bot, new goals.GoalBlock(d.x, d.y, d.z), () => bot.entity.position.floored().equals(d), { ms: 15000, tarea, mov: prudentes(bot, { pisarVedadas: true }) })
    sitio = sitioCama(bot)
    if (!sitio) return { causa: 'sin sitio para la cama' }
  }
  try { bot.pathfinder.setGoal(null) } catch (_) {}
  try {
    await conLimite(bot.equip(cama, 'hand'), 3000)
    await bot.lookAt(sitio.cab.offset(0.5, 0, 0.5), true) // la cabecera queda hacia donde mira
    await conLimite(bot.placeBlock(bot.blockAt(sitio.pie.offset(0, -1, 0)), new Vec3(0, 1, 0)), 3000)
  } catch (_) {}
  await esperar(200)
  const v = [sitio.pie, sitio.cab].find(p => { const k = bot.blockAt(p); return k && k.name.endsWith('_bed') })
  return v ? { v } : { causa: 'no pude poner la cama' }
}

module.exports = async function usarCama(bot, [radio], tarea) {
  const t0 = Date.now(), r = Math.min(32, parseFloat(radio) || 16), descartadas = new Set()
  let ultima = null
  for (let i = 0; i < 4; i++) { // si al acostarse está ocupada, la siguiente
    const r1 = await unaCama(bot, r, descartadas, tarea, t0)
    if (r1.causa !== 'la cama está ocupada' || !r1.pos) return r1
    descartadas.add(r1.pos.join(',')); ultima = r1
  }
  return ultima
}

async function unaCama(bot, r, descartadas, tarea, t0) {
  const datos = () => ({ s: +((Date.now() - t0) / 1000).toFixed(1) })
  let v = elegirCama(bot, r, descartadas), puesta = false
  if (!v) { // ninguna libre: la suya, puesta o fabricada
    const p = await ponerCama(bot, tarea)
    if (!p.v) return { exito: false, causa: p.causa, ...datos() }
    v = p.v; puesta = true
    const suya = camas(bot, 4).find(c => c.v.equals(v) || c.v.distanceTo(v) <= 1) // por su cabecera, como las demás
    if (suya) v = suya.v
    for (const [k, n] of RESERVAS) if (n === bot.username) RESERVAS.delete(k)
    RESERVAS.set(clave(v), bot.username)
  }
  const cerca = () => bot.entity.position.distanceTo(v.offset(0.5, 0.5, 0.5)) <= 3
  if (!cerca()) {
    // pisando las zonas vedadas (las camas suelen estar en HOGAR, y con la penalización normal el navegador daba vueltas o se rendía); sin romper ni poner
    const fin = await moverHasta(bot, new goals.GoalNear(v.x, v.y, v.z, 2), cerca, { ms: 45000, tarea, mov: prudentes(bot, { pisarVedadas: true }) })
    if (!cerca()) return { exito: false, causa: fin === 'cancelado' ? 'cancelado' : 'no llego', ...datos() }
  }
  try { bot.pathfinder.setGoal(null) } catch (_) {}
  const cama = bot.blockAt(v)
  if (!cama || !cama.name.endsWith('_bed')) return { exito: false, causa: 'no pude usar la cama: ya no está', ...datos() }
  const base = { pos: [v.x, v.y, v.z], ...(puesta ? { puesta } : {}) }
  const h = sv.hora(bot)
  if (h < sv.CAMA[0] || h > sv.CAMA[1]) { // de día: el clic basta para fijar la reaparición
    try { await conLimite(bot.activateBlock(cama), 3000) } catch (e) { return { exito: false, causa: 'no pude usarla: ' + e.message.slice(0, 60), ...base, ...datos() } }
    return { exito: true, causa: 'spawn guardado', ...base, ...datos() }
  }
  try { await conLimite(bot.sleep(cama), 5000) } catch (e) {
    const causa = /monsters/.test(e.message) ? 'monstruos cerca' : /occupied/.test(e.message) ? 'la cama está ocupada' : 'no pude dormir: ' + e.message.slice(0, 60)
    return { exito: false, causa, ...base, ...datos() }
  }
  const salud0 = bot.health
  for (;;) { // dormido hasta que le despierte el día (amanece si duermen todos los jugadores)
    if (tarea && tarea.cancelada) { if (bot.isSleeping) try { await bot.wake() } catch (_) {} return { exito: false, causa: 'cancelado', ...base, ...datos() } }
    if (!bot.isSleeping) break
    if (bot.health < salud0 || Date.now() - t0 > MAX_S * 1000) { try { await bot.wake() } catch (_) {} return { exito: false, causa: 'despertado', ...base, ...datos() } }
    await esperar(500)
  }
  return { exito: true, causa: 'amanece', ...base, ...datos() }
}

module.exports.Reservas = Reservas
