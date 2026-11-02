// depositar [volver]: ir al cofre más cercano de ../cofres.json, abrirlo y guardar lo recogido (troncos, huevos, brotes, palos…).
// Conserva herramientas, armas, armadura y comida. Si el cofre se llena, sigue con el siguiente. Con «volver», regresa después al
// sitio donde estaba (así lo usa el reflejo de io.js). Sin romper ni poner bloques y sin pisar zonas vedadas (movimientos prudentes).
// Éxito si guarda algo. Responde lo guardado por objeto, los troncos, si coincide con lo que entró en el cofre (cuadra) y lo que quedó.
// Reflejo (io.js): tras cada habilidad, si los huecos de recogida ocupados llegan al umbral (80 % por defecto; orden `cofre`).
const { goals } = require('mineflayer-pathfinder')
const memoria = require('../memoria')
const zonas = require('../zonas')
const cofres = require('../cofres')
const { conLimite, moverHasta, esperar } = require('./comun')

const ARMAS_Y_HERRAMIENTAS = /_(axe|pickaxe|shovel|hoe|sword|helmet|chestplate|leggings|boots)$/
const EQUIPO = new Set(['shears', 'flint_and_steel', 'fishing_rod', 'bow', 'crossbow', 'trident', 'mace', 'shield', 'arrow',
  'spectral_arrow', 'tipped_arrow', 'elytra', 'turtle_helmet', 'carrot_on_a_stick', 'warped_fungus_on_a_stick', 'brush', 'spyglass',
  'compass', 'recovery_compass', 'clock', 'lead', 'totem_of_undying'])
const conservar = (bot, it) => ARMAS_Y_HERRAMIENTAS.test(it.name) || EQUIPO.has(it.name) || !!bot.registry.foodsByName[it.name]

// Ajustes del reflejo, uno por personaje. Tras un fallo (sin camino, no se abrió…) no lo reintenta en 1 min. Con los cofres llenos
// (io.js lo avisa por el chat y en el diario) no lo reintenta en 10 min; `llenos` se borra al guardar bien o con «cofre si».
const ESPERA_FALLO = 60000
const ESPERA_LLENOS = 600000
const ajustes = (bot) => memoria(bot, 'cofre', () => ({ activo: true, umbral: 0.8, fallo: 0, llenos: 0 }))
// Lo guardado desde que arrancó el personaje: la observación suma los troncos a los «ganados» del episodio (si no, la red y la
// medida verían que los troncos desaparecen al guardarlos).
const guardados = (bot) => memoria(bot, 'guardados', () => ({ troncos: 0 }))
// Ocupación de los huecos de recogida (0-1): lo que se conserva (comida, herramientas, armas, armadura) no cuenta ni en lo ocupado
// ni en el total, para que un personaje con mucho equipo no vaya antes al cofre. 1 = no le queda hueco libre para recoger.
function ocupacion(bot) {
  const items = bot.inventory.items(), huecos = bot.inventory.inventoryEnd - bot.inventory.inventoryStart
  const conservados = items.filter(i => conservar(bot, i)).length
  return huecos > conservados ? (items.length - conservados) / (huecos - conservados) : 1
}
const hayQueGuardar = (bot) => bot.inventory.items().some(i => !conservar(bot, i))
function necesita(bot) {
  const a = ajustes(bot), ahora = Date.now()
  return a.activo && cofres.lista().length > 0 && ocupacion(bot) >= a.umbral && ahora - a.fallo > ESPERA_FALLO &&
    ahora - a.llenos > ESPERA_LLENOS && hayQueGuardar(bot)
}

function cuenta(items, vale = () => true) {
  const c = {}
  for (const i of items) if (i && vale(i)) c[i.name] = (c[i.name] || 0) + i.count
  return c
}
const igual = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())
function resta(a, b) {
  const d = {}
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if ((a[k] || 0) - (b[k] || 0) > 0) d[k] = (a[k] || 0) - (b[k] || 0)
  return d
}

// Un cofre lo usa un personaje cada vez (los de este proceso): dos ventanas a la vez con clics previstos pueden intercambiar pilas.
const cerrojos = new Map()
async function conCerrojo(clave, fn) {
  const previo = cerrojos.get(clave) || Promise.resolve()
  let soltar
  const mio = new Promise(r => (soltar = r))
  cerrojos.set(clave, previo.then(() => mio))
  await previo
  try { return await fn() } finally { soltar() }
}

// Abre el cofre y pasa cada pila guardable: primero a una pila igual a medias, si no a un hueco vacío; si no cabe, la devuelve a su
// sitio y avisa de que está lleno. Devuelve lo que movió (pila a pila, por los clics; no «inventario antes − después», que pierde lo
// que recoge al andar hasta el cofre) y lo que entró en el cofre (contado en la propia ventana): si coinciden, no se perdió nada.
let Item = null
async function guardarEn(bot, bloque, tarea) {
  Item = Item || require('prismarine-item')(bot.registry)
  const v = await conLimite(bot.openContainer(bloque), 8000)
  const fin = v.inventoryStart
  const antes = cuenta(v.slots.slice(0, fin)), movido = {}
  let lleno = false
  try {
    for (let s = v.inventoryStart; s < v.inventoryEnd && !lleno && !(tarea && tarea.cancelada); s++) {
      const it = v.slots[s]
      if (!it || conservar(bot, it)) continue
      const { name, count } = it
      await bot.clickWindow(s, 0, 0) // coger la pila
      while (v.selectedItem) {
        const m = v.selectedItem
        let d = -1
        for (let k = 0; k < fin && d < 0; k++) if (v.slots[k] && v.slots[k].count < v.slots[k].stackSize && Item.equal(v.slots[k], m, false)) d = k
        for (let k = 0; k < fin && d < 0; k++) if (!v.slots[k]) d = k
        if (d < 0) { await bot.clickWindow(s, 0, 0); lleno = true; break } // no cabe: a su hueco
        await bot.clickWindow(d, 0, 0)
      }
      const resto = v.slots[s] && v.slots[s].name === name ? v.slots[s].count : 0
      if (count > resto) movido[name] = (movido[name] || 0) + count - resto
    }
    await esperar(200)
    return { lleno, movido, entra: resta(cuenta(v.slots.slice(0, fin)), antes) }
  } finally { bot.closeWindow(v) }
}

const CONTENEDORES = new Set(['chest', 'trapped_chest', 'barrel'])

module.exports = async function depositar(bot, [modo], tarea) {
  if (!hayQueGuardar(bot)) return { exito: false, causa: 'nada que guardar' }
  // nunca un cofre dentro de una zona vedada del usuario (no se pisa)
  const lista = cofres.lista().filter(c => !zonas.pasoVedado(...c.bloques[0]))
  if (!lista.length) return { exito: false, causa: 'sin cofre' }
  const p0 = bot.entity.position.clone()
  const centro = (c) => p0.clone().set(c.bloques[0][0] + 0.5, c.bloques[0][1] + 0.5, c.bloques[0][2] + 0.5)
  const enHogar = (c) => (zonas.hogarDe(...c.bloques[0]) ? 0 : 1) // los cofres del hogar primero
  lista.sort((a, b) => enHogar(a) - enHogar(b) || centro(a).distanceTo(p0) - centro(b).distanceTo(p0))
  const guardado = {}, entra = {}, usados = []
  let causa = null
  for (const c of lista) {
    if (!hayQueGuardar(bot) || (tarea && tarea.cancelada)) break
    const [x, y, z] = c.bloques[0], meta = centro(c)
    const ojo = () => bot.entity.position.offset(0, 1.62, 0).distanceTo(meta)
    const r = await moverHasta(bot, new goals.GoalNear(x, y, z, 2), () => ojo() <= 4, { ms: (15 + meta.distanceTo(bot.entity.position)) * 1000, tarea })
    if (r !== 'listo') { causa = r; continue }
    const b = bot.blockAt(meta)
    if (!b || !CONTENEDORES.has(b.name)) { causa = `no hay cofre en ${x},${y},${z}`; continue }
    try {
      const g = await conCerrojo(c.nombre, () => guardarEn(bot, b, tarea))
      usados.push(c.nombre)
      for (const [k, n] of Object.entries(g.entra)) entra[k] = (entra[k] || 0) + n
      for (const [k, n] of Object.entries(g.movido)) guardado[k] = (guardado[k] || 0) + n
      if (g.lleno) causa = 'cofres llenos'
    } catch (e) { causa = 'no se abrió: ' + e.message }
  }
  await esperar(300) // el servidor confirma el inventario tras cerrar
  const troncos = Object.entries(guardado).filter(([k]) => k.endsWith('_log')).reduce((a, [, n]) => a + n, 0)
  guardados(bot).troncos += troncos
  const quedan = cuenta(bot.inventory.items(), i => !conservar(bot, i))
  const datos = { guardado, troncos, cofre: usados.join(','), cuadra: igual(guardado, entra),
    ...(Object.keys(quedan).length ? { quedan } : {}) }
  // volver al sitio de antes (el reflejo): sin él, la siguiente decisión empezaría junto al cofre, lejos del árbol
  if (modo === 'volver' && !(tarea && tarea.cancelada) && bot.entity.position.distanceTo(p0) > 3 && !zonas.pasoVedado(Math.floor(p0.x), Math.floor(p0.y), Math.floor(p0.z))) {
    datos.volvio = await moverHasta(bot, new goals.GoalNear(p0.x, p0.y, p0.z, 1), () => bot.entity.position.distanceTo(p0) <= 2,
      { ms: (15 + bot.entity.position.distanceTo(p0)) * 1000, tarea })
  }
  if (!Object.keys(guardado).length) return { exito: false, causa: causa || (tarea && tarea.cancelada ? 'cancelado' : 'no guardé nada'), ...datos }
  return { exito: true, causa: Object.keys(quedan).length ? causa || 'guardado a medias' : 'guardado', ...datos }
}
Object.assign(module.exports, { necesita, ajustes, guardados, ocupacion, conservar, conCerrojo, ESPERA_FALLO, ESPERA_LLENOS })
