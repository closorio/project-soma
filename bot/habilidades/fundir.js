// fundir ENTRADA [n=1] [combustible] (F8.0b, C4): pasa por el horno n de algo (hierro, oro, cobre, arena, piedra, carne…; el alias o el
// nombre del juego de lo que entra) y recoge lo que sale. minecraft-data no trae recetas de horno: la tabla es propia (FUNDIR).
// Horno: el que haya a ≤ 16 bloques; si no, el del inventario puesto a mi lado; si no hay, lo fabrica con 8 de piedra y lo pone
// (y se queda puesto: es del campamento, va a la memoria del personaje). Combustible: el pedido (carbon, tablones, troncos) o el
// mejor que haya (carbón, carbón vegetal, tablones, troncos), lo justo para n. Espera a que salga todo (10 s por objeto).
// Éxito: n en el inventario. Fallos: no sé fundir X · no tengo X · sin combustible · sin horno · no se abrió · tiempo agotado.
// Devuelve { exito, causa, entrada, salida, obtenido, horno: [x, y, z], puesto }.
const { goals } = require('mineflayer-pathfinder')
const { conLimite, esperar, moverHasta, lejania } = require('./comun')
const { colocarAlLado } = require('./colocar')
const persistente = require('../memoria_persistente')
const memoria = require('../memoria')

// lo que entra → lo que sale (alias en español y en inglés)
const FUNDIR = {
  raw_iron: 'iron_ingot', raw_gold: 'gold_ingot', raw_copper: 'copper_ingot', sand: 'glass', red_sand: 'glass',
  cobblestone: 'stone', cobbled_deepslate: 'deepslate', clay_ball: 'brick', netherrack: 'nether_brick', oak_log: 'charcoal',
  stone: 'smooth_stone', clay: 'terracotta', // 2026-11-02 (catálogo de estructuras)
  beef: 'cooked_beef', porkchop: 'cooked_porkchop', chicken: 'cooked_chicken', mutton: 'cooked_mutton', rabbit: 'cooked_rabbit',
  cod: 'cooked_cod', salmon: 'cooked_salmon', potato: 'baked_potato', kelp: 'dried_kelp',
}
const ALIAS = { iron: 'raw_iron', hierro: 'raw_iron', gold: 'raw_gold', oro: 'raw_gold', copper: 'raw_copper', cobre: 'raw_copper',
  arena: 'sand', piedra: 'cobblestone', vaca: 'beef', cerdo: 'porkchop', pollo: 'chicken', oveja: 'mutton', patata: 'potato' }
const CARNES = ['beef', 'porkchop', 'chicken', 'mutton', 'rabbit', 'cod', 'salmon', 'potato']
// cuántos objetos funde una unidad de cada combustible (los del juego), del mejor al peor
const COMBUSTIBLES = [[/^coal$/, 8], [/^charcoal$/, 8], [/_planks$/, 1.5], [/_log$/, 1.5], [/^stick$/, 0.5]]
const PEDIDO = { carbon: /^(coal|charcoal)$/, tablones: /_planks$/, troncos: /_log$/, palos: /^stick$/ }
const RADIO_HORNO = 16, MS_OBJETO = 10000

const cuenta = (bot, nombre) => bot.inventory.items().filter(i => i.name === nombre).reduce((a, i) => a + i.count, 0)
// La entrada: un alias, «carne» (la cruda que haya) o el nombre del juego; también un tronco cualquiera para carbón vegetal.
function entradaDe(bot, pedido) {
  if (pedido === 'carne' || pedido === 'comida') return CARNES.find(c => cuenta(bot, c) > 0) || 'beef'
  const e = ALIAS[pedido] || pedido
  if (FUNDIR[e]) return e
  if (/_log$/.test(e)) return e
  return null
}
const salidaDe = (e) => FUNDIR[e] || (/_log$/.test(e) ? 'charcoal' : null)
// El combustible que se usaría y cuántas unidades: [nombre, unidades] o null.
function combustible(bot, n, pedido, entrada) {
  const filtro = pedido && PEDIDO[pedido]
  for (const [patron, rinde] of COMBUSTIBLES) {
    const items = bot.inventory.items().filter(i => patron.test(i.name) && (!filtro || filtro.test(i.name)) && i.name !== entrada)
    const falta = Math.ceil(n / rinde), hay = {}
    // 2026-11-03, banco: se sumaban especies (1 de roble y 3 de abedul) y luego faltaba roble («Can't find oak_planks»): por nombre
    for (const i of items) hay[i.name] = (hay[i.name] || 0) + i.count
    const nombre = Object.keys(hay).find(k => hay[k] >= falta)
    if (nombre) return [nombre, falta]
  }
  return null
}

// ¿Puedo usar este horno? Vacío y apagado, o con lo que yo dejé en él: nota = { pos: 'x,y,z', entrada, salida } de mi último horno.
// 2026-11-04, banco M: se sacaba lo que hubiera de otro tipo y M4, fundiendo cobre, se llevó el hierro de M2 (dos bots, un horno).
function hornoLibre({ entrada, salida, encendido }, pos, nota) {
  if (!entrada && !salida && !encendido) return true
  if (!nota || nota.pos !== pos) return false
  return (!entrada || entrada === nota.entrada) && (!salida || salida === nota.salida)
}

async function hornoA(bot, tarea, nuevo = false) {
  const id = bot.registry.blocksByName.furnace.id, lit = (bot.registry.blocksByName.lit_furnace || {}).id
  const nota = memoria(bot).hornoMio
  if (!nuevo && nota) { // el mío, antes que otro más cerca
    const m = bot.blockAt(new (require('vec3').Vec3)(...nota.pos.split(',').map(Number)))
    if (m && (m.type === id || m.type === lit) && lejania(bot, m.position) <= RADIO_HORNO) return { b: m, puesto: false }
  }
  let b = !nuevo && bot.findBlock({ matching: [id, lit].filter(x => x != null), maxDistance: RADIO_HORNO })
  if (b) return { b, puesto: false }
  if (!cuenta(bot, 'furnace')) {
    const fabricar = require('./fabricar')
    const r = await fabricar(bot, ['furnace'], tarea)
    if (!r.exito) return { causa: 'sin horno (' + r.causa + ')' }
  }
  const r = await colocarAlLado(bot, 'furnace')
  if (!r.exito) return { causa: 'no pude poner el horno: ' + r.causa }
  persistente.anotarLugar(bot, 'horno', r.pos)
  return { b: bot.blockAt(new (require('vec3').Vec3)(...r.pos)), puesto: true }
}

module.exports = async function fundir(bot, [pedido, cantidad, comb], tarea) {
  const entrada = entradaDe(bot, pedido)
  if (!entrada) return { exito: false, causa: `no sé fundir ${pedido} (hay: ${[...Object.keys(ALIAS), ...Object.keys(FUNDIR)].join(', ')}, carne)` }
  const salida = salidaDe(entrada)
  const n = Math.min(Math.max(1, parseInt(cantidad) || 1), cuenta(bot, entrada))
  const datos = { entrada, salida }
  if (!n) return { exito: false, causa: 'no tengo ' + entrada, ...datos }
  const c = combustible(bot, n, comb, entrada)
  if (!c) return { exito: false, causa: 'sin combustible' + (comb ? ': ' + comb : ''), ...datos }
  let h = await hornoA(bot, tarea)
  if (!h.b) return { exito: false, causa: h.causa, ...datos }
  let pos = h.b.position
  if (lejania(bot, pos) > 4.3) {
    const r = await moverHasta(bot, new goals.GoalNear(pos.x, pos.y, pos.z, 2), () => lejania(bot, pos) <= 4.3, { ms: 30000, tarea })
    // 2026-11-03, banco: el horno de antes quedaba a la vista pero sin camino (tras la roca): otro al lado
    if (r !== 'listo' && !(tarea && tarea.cancelada)) {
      h = await hornoA(bot, tarea, true)
      if (!h.b) return { exito: false, causa: `no llego al horno (${r}) y no pude poner otro: ${h.causa}`, ...datos }
      pos = h.b.position
    } else if (r !== 'listo') return { exito: false, causa: 'no llego al horno: ' + r, ...datos }
  }
  let horno
  for (let intento = 0; ; intento++) {
    Object.assign(datos, { horno: [pos.x, pos.y, pos.z], puesto: h.puesto })
    const bloque = bot.blockAt(pos)
    try { horno = await conLimite(bot.openFurnace(bloque), 8000) } catch (e) { return { exito: false, causa: 'no se abrió: ' + e.message, ...datos } }
    const dentro = { entrada: (horno.inputItem() || {}).name, salida: (horno.outputItem() || {}).name, encendido: !!(bloque.getProperties && bloque.getProperties().lit) }
    if (hornoLibre(dentro, pos.toArray().join(','), memoria(bot).hornoMio)) break
    try { horno.close() } catch (_) {}
    if (intento) return { exito: false, causa: 'horno ocupado', ...datos } // el que acabo de poner, ya ocupado
    h = await hornoA(bot, tarea, true)
    if (!h.b) return { exito: false, causa: `horno ocupado y no pude poner otro: ${h.causa}`, ...datos }
    pos = h.b.position
    if (lejania(bot, pos) > 4.3) {
      const r = await moverHasta(bot, new goals.GoalNear(pos.x, pos.y, pos.z, 2), () => lejania(bot, pos) <= 4.3, { ms: 30000, tarea })
      if (r !== 'listo') return { exito: false, causa: 'no llego al horno: ' + r, ...datos }
    }
  }
  // 2026-11-03, banco: el combustible (troncos) se elegía antes de hacer el horno, y la mesa para hacerlo se los comió
  const c2 = combustible(bot, n, comb, entrada)
  if (!c2) { try { horno.close() } catch (_) {} ; return { exito: false, causa: 'sin combustible' + (comb ? ': ' + comb : ''), ...datos } }
  c.splice(0, 2, ...c2)
  const antes = cuenta(bot, salida), t0 = Date.now()
  const mio = { pos: pos.toArray().join(',') }
  memoria(bot).hornoMio = { ...mio, entrada, salida } // por si se corta a mitad: lo que quede dentro es mío
  try {
    const id = (x) => bot.registry.itemsByName[x].id
    // 2026-11-03, banco: lo que quedó de un intento mío anterior ocupa el horno («destination full»): sacarlo, si es otra cosa
    if (horno.outputItem()) await conLimite(horno.takeOutput(), 3000)
    if (horno.inputItem() && horno.inputItem().name !== entrada) await conLimite(horno.takeInput(), 3000)
    if (horno.fuelItem() && horno.fuelItem().name !== c[0]) await conLimite(horno.takeFuel(), 3000)
    await conLimite(horno.putFuel(id(c[0]), null, c[1]), 5000)
    await conLimite(horno.putInput(id(entrada), null, n), 5000)
    while (cuenta(bot, salida) - antes < n && Date.now() - t0 < n * MS_OBJETO + 8000) {
      if (tarea && tarea.cancelada) break
      await esperar(1000)
      if (horno.outputItem()) { try { await conLimite(horno.takeOutput(), 3000) } catch (_) {} }
    }
    if (horno.outputItem()) { try { await conLimite(horno.takeOutput(), 3000) } catch (_) {} }
    if (horno.inputItem()) { try { await conLimite(horno.takeInput(), 3000) } catch (_) {} } // lo que no dio tiempo vuelve
  } catch (e) {
    return { exito: false, causa: 'no se pudo: ' + e.message, obtenido: cuenta(bot, salida) - antes, ...datos }
  } finally {
    // lo que no pude sacar sigue siendo mío; lo que aparezca después, de otro
    memoria(bot).hornoMio = { ...mio, entrada: (horno.inputItem() || {}).name, salida: (horno.outputItem() || {}).name }
    try { horno.close() } catch (_) {}
  }
  await esperar(300)
  const obtenido = cuenta(bot, salida) - antes
  const causa = obtenido >= n ? 'fundido' : tarea && tarea.cancelada ? 'cancelado' : 'tiempo agotado'
  return { exito: obtenido >= n, causa, obtenido, n, combustible: c, ...datos }
}
Object.assign(module.exports, { FUNDIR, ALIAS, entradaDe, salidaDe, combustible, hornoLibre })
