// Prueba en seco de F7.2 (habilidades y reflejos de supervivencia), sin servidor ni red: el bot de mentira de
// probar_sentidos_seco.js (mundoFalso) con un cuerpo de mentira (equipar, comer, golpear, picar, poner bloques, caer).
// 1. Registro: las 11 acciones de entorno_supervivencia.py (ACCIONES) y los pasos internos son habilidades del bot.
// 2. fabricar: siguienteFabricacion() y troncosPara() dan lo mismo que siguiente_fabricacion() y _troncos_para() del simulador en
//    600 inventarios al azar; las recetas, las mismas.
// 3. Reflejos (reflejos.js) con la regla del usuario: defenderse de un golpe salvo con más de 2 hostiles, salud < 8 o sin arma;
//    creeper = apartarse siempre; el daño que no es de un monstruo no cuenta; huir con salud < 8; apartarse; comer; equipar.
// 4. Interrupción (habilidades/index.js): con los reflejos de supervivencia, la amenaza y un golpe cortan solo la habilidad (no la
//    tarea de quien la pidió) y nada dentro del refugio; en el mundo del usuario (reflejos apagados), como antes.
// 5. Habilidades en el cuerpo de mentira: comer, equipar, refugiarse (cavar y tapiar; nunca junto a agua o lava, sobre un hueco ni
//    picando piedra a mano) y esperar_al_dia.
// Uso: node bot/probar_habilidades_sv_seco.js   (sale con 1 si falla algo). Va en el mundo de supervivencia: no lee nada del usuario.
process.env.IO_SERVIDOR = 'supervivencia'
const path = require('path')
const { execFileSync } = require('child_process')
const { Vec3 } = require('vec3')
const registry = require('minecraft-data')('1.21.11')
const Block = require('prismarine-block')(registry)
const { mundoFalso, celda } = require('./probar_sentidos_seco')

const ID = (n) => registry.itemsByName[n].id
const SOLIDO = (n) => registry.blocksByName[n].boundingBox === 'block'
const SUELTA = { grass_block: 'dirt', stone: 'cobblestone', short_grass: null } // lo que suelta al picarlo (piedra: solo con pico)

// El cuerpo de mentira: inventario con ids, mano, armadura, comer, golpear, picar (con caída), poner bloques y un navegador que
// teletransporta a la meta (GoalBlock).
function cuerpo(opts = {}) {
  const bot = mundoFalso(opts)
  const blockAt0 = bot.blockAt
  bot.blockAt = (v) => {
    const k = blockAt0(v)
    if (!k) return k
    const B = Block.fromStateId(registry.blocksByName[k.name].defaultState, 0)
    k.digTime = (...a) => B.digTime(...a)
    k.getProperties = () => ({})
    return k
  }
  const slots = bot.inventory.slots
  for (const it of slots) if (it) Object.assign(it, { type: ID(it.name), stackSize: 64 })
  bot.dar = (n, c = 1) => {
    const ya = slots.slice(9, 45).find(i => i && i.name === n)
    if (ya) { ya.count += c; return }
    const s = slots.findIndex((x, i) => i >= 9 && i < 45 && !x)
    slots[s] = { name: n, count: c, slot: s, type: ID(n), stackSize: 64 }
  }
  const quitarUno = (it) => { it.count--; if (it.count <= 0) { slots[it.slot] = null; if (bot.heldItem === it) bot.heldItem = null } }
  bot.inventory.emptySlotCount = () => slots.slice(9, 45).filter(x => !x).length
  bot.inventory.firstEmptyInventorySlot = () => { const s = slots.findIndex((x, i) => i >= 9 && i < 45 && !x); return s < 0 ? null : s }
  Object.assign(bot.entity, { onGround: true, height: 1.8, effects: {} })
  bot.heldItem = null
  bot.world = { getColumn: () => ({}) }
  bot.golpes = []
  const DEST = { head: 5, torso: 6, legs: 7, feet: 8 }
  bot.equip = async (it, dest) => {
    if (dest === 'hand') { bot.heldItem = it; return }
    const viejo = slots[DEST[dest]]; slots[it.slot] = viejo ? { ...viejo, slot: it.slot } : null
    slots[DEST[dest]] = { ...it, slot: DEST[dest] }
  }
  bot.consume = async () => {
    if (bot.food >= 20) throw new Error('Food is full')
    bot.food = Math.min(20, bot.food + registry.foodsByName[bot.heldItem.name].foodPoints)
    quitarUno(bot.heldItem)
  }
  bot.attack = (e) => bot.golpes.push(e.id)
  bot.lookAt = async () => {}
  bot.look = async () => {}
  bot.setControlState = () => {}
  bot.clearControlStates = () => {}
  bot.stopDigging = () => {}
  bot.digTime = (k) => k.digTime(bot.heldItem ? bot.heldItem.type : null, false, false, false, [], {})
  const caer = () => { const p = bot.entity.position; while (p.y > -60 && !SOLIDO(bot.blockAt(p.offset(0, -1, 0)).name)) p.y -= 1 }
  bot.picados = []
  bot.dig = async (k) => {
    bot._puestos.set(`${k.position.x},${k.position.y},${k.position.z}`, 'air')
    bot.picados.push([k.position.x, k.position.y, k.position.z, k.name])
    const suelta = k.name in SUELTA ? SUELTA[k.name] : k.name
    if (suelta && !(k.name === 'stone' && !(bot.heldItem && bot.heldItem.name.endsWith('_pickaxe')))) bot.dar(suelta)
    caer()
  }
  bot.puestos = []
  bot.placeBlock = async (ref, cara) => {
    const d = ref.position.plus(cara)
    if (SOLIDO(bot.blockAt(d).name)) throw new Error('ocupado')
    if (!bot.heldItem) throw new Error('sin nada en la mano')
    bot._puestos.set(`${d.x},${d.y},${d.z}`, bot.heldItem.name)
    bot.puestos.push([d.x, d.y, d.z])
    quitarUno(bot.heldItem)
  }
  bot.pathfinder = {
    movements: null, setMovements() {}, isMoving: () => false, goto: async () => {},
    setGoal(g) { if (g && g.x !== undefined && g.y !== undefined && g.z !== undefined) { bot.entity.position = new Vec3(g.x + 0.5, g.y, g.z + 0.5); caer() } },
    getPathFromTo: () => ({ next: () => ({ value: { result: { status: 'success', path: [] } } }) }),
  }
  return bot
}

// Rellena de un bloque una caja (x0..x1, y0..y1, z0..z1) del mundo falso.
function caja(b, [x0, x1], [y0, y1], [z0, z1], n) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) b[`${x},${y},${z}`] = n; return b }

if (require.main === module) principal().catch(e => { console.error(e); process.exit(1) })

async function principal() {
  const habilidades = require('./habilidades')
  const observacion = require('./observacion')
  const reflejos = require('./reflejos')
  const sv = require('./habilidades/sv')
  const fabricar = require('./habilidades/fabricar')
  const refugiarse = require('./habilidades/refugiarse')
  const ordenes = require('./ordenes')
  let fallos = 0, pruebas = 0
  const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }
  const tarea = () => ({ cancelada: false })

  // 1 · registro
  console.log('1 · registro de habilidades')
  for (const a of observacion.ACCIONES_SV) ok(typeof habilidades.HABILIDADES[a] === 'function', `la acción ${a} no es una habilidad`)
  for (const h of ['equipar', 'apartarse', 'salir_del_refugio', 'esperar_al_dia']) ok(typeof habilidades.HABILIDADES[h] === 'function', `falta ${h}`)

  // 2 · fabricar frente al simulador
  console.log('2 · fabricar: la cadena de siguiente_fabricacion()')
  const azar = (() => { let s = 7; return (n) => { s = (s * 1103515245 + 12345) % 2147483648; return (s >>> 12) % n } })()
  const estados = Array.from({ length: 600 }, () => ({ arma: [0, 0.5, 1][azar(3)], pico: !!azar(2), mesa: !!azar(2), tablones: azar(9),
    palos: azar(4), troncos: azar(5), piedra: azar(4), colocables: azar(5) }))
  const py = JSON.parse(execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, '.')
from entorno_supervivencia import siguiente_fabricacion, _troncos_para, RECETAS
es = json.load(sys.stdin)
print(json.dumps({"siguiente": [siguiente_fabricacion(e["arma"], e["pico"], e["mesa"], e["tablones"], e["palos"], e["troncos"], e["piedra"], e["colocables"]) for e in es],
  "troncos": [[_troncos_para(r, e["tablones"], e["palos"], e["mesa"]) for r in sorted(RECETAS)] for e in es], "recetas": RECETAS}))`],
  { cwd: path.join(__dirname, '..', 'entrenamiento'), input: JSON.stringify(estados) }))
  const js = estados.map(e => fabricar.siguienteFabricacion(e))
  ok(js.every((x, i) => x === py.siguiente[i]), `siguienteFabricacion distinta en ${js.filter((x, i) => x !== py.siguiente[i]).length} de 600`)
  const rs = Object.keys(py.recetas).sort()
  ok(estados.every((e, i) => rs.every((r, k) => fabricar.troncosPara(r, e) === py.troncos[i][k])), 'troncosPara distinta')
  for (const [r, [t, p, q]] of Object.entries(py.recetas)) { const o = fabricar.OBJETOS[r]; ok(o && o.t === t && o.p === p && o.q === q, `receta ${r} distinta`) }
  console.log(`  ${new Set(js.map(String)).size} resultados distintos: ${[...new Set(js.map(String))].join(', ')}`)
  let b = cuerpo({ inventario: [['oak_log', 3], ['oak_planks', 1], ['dirt', 1]] })
  ok(fabricar.siguienteFabricacion(fabricar.estado(b)) === 'espada_madera', 'con 3 troncos y sin arma: espada de madera')
  b = cuerpo({ inventario: [['wooden_sword', 1], ['oak_log', 1]] })
  ok(fabricar.siguienteFabricacion(fabricar.estado(b)) === 'tablones', 'con espada, 1 tronco y sin bloques: tablones')
  b = cuerpo({ inventario: [['wooden_sword', 1], ['stick', 1], ['crafting_table', 1], ['cobblestone', 2], ['dirt', 2]] })
  ok(fabricar.siguienteFabricacion(fabricar.estado(b)) === 'espada_piedra', 'con espada de madera, mesa, palo y 2 de piedra: espada de piedra')

  // 3 · reflejos
  console.log('3 · reflejos (regla del usuario)')
  const z = (x, z0 = 0.5, name = 'zombie') => ({ name, pos: [x, 64, z0] })
  const decide = (opts, golpeDe = null, h = null) => {
    const bb = cuerpo(opts)
    sv.vigilarGolpes(bb)
    if (golpeDe !== null) bb.emit('entityHurt', bb.entity, golpeDe === 'nadie' ? undefined : bb.entities[golpeDe])
    return { r: reflejos.siguiente(bb, { h }), bb }
  }
  const espada = [['stone_sword', 1]]
  let { r } = decide({ entidades: [z(3.5)], inventario: espada }, 1)
  ok(r && r.habilidad === 'atacar' && r.args[0] === 'id:1', `un zombi le golpea, salud 20, con espada: defenderse (${JSON.stringify(r)})`)
  ;({ r } = decide({ entidades: [z(3.5), z(0.5, 6.5, 'skeleton')], inventario: espada }, 2))
  ok(r && r.habilidad === 'atacar' && r.args[0] === 'id:2', `2 hostiles y le golpea el esqueleto: defenderse de él (${JSON.stringify(r)})`)
  ;({ r } = decide({ entidades: [z(3.5), z(0.5, 6.5, 'skeleton'), z(-5.5)], inventario: espada }, 1))
  ok(r && r.habilidad === 'atacar' && r.args.includes('acorralado'), `3 hostiles de día: siempre se defiende, sin negarse (${JSON.stringify(r)})`)
  ;({ r } = decide({ hora: 18000, entidades: [z(3.5), z(0.5, 6.5, 'skeleton'), z(-5.5)], inventario: espada }, 1))
  ok(r && r.habilidad === 'atacar' && r.args.includes('acorralado'), `3 hostiles de noche: siempre se defiende (${JSON.stringify(r)})`)
  ;({ r } = decide({ salud: 7, entidades: [z(3.5)], inventario: espada }, 1))
  ok(r && r.habilidad === 'atacar' && r.args.includes('acorralado'), `golpe con salud 7: se defiende igual (${JSON.stringify(r)})`)
  ;({ r } = decide({ entidades: [z(3.5)], inventario: [['bread', 2]] }, 1))
  ok(r && r.habilidad === 'atacar' && r.args.includes('puno'), `golpe sin arma: a puñetazos (${JSON.stringify(r)})`)
  ;({ r } = decide({ entidades: [z(9.5, 0.5, 'creeper')], inventario: espada }, 1))
  ok(r && r.habilidad === 'huir' && r.args[0] === 'creeper', `golpe de creeper: apartarse de él (${JSON.stringify(r)})`)
  ;({ r } = decide({ entidades: [z(4.5, 0.5, 'creeper')], inventario: espada }))
  ok(r && r.habilidad === 'huir' && r.args[0] === 'creeper', `creeper a 4 sin golpe: apartarse (${JSON.stringify(r)})`)
  ;({ r } = decide({ entidades: [z(12.5, 0.5, 'creeper')], inventario: espada }))
  ok(r && r.habilidad === 'equipar', `creeper a 12: solo equipar (${JSON.stringify(r)})`)
  let x = decide({ entidades: [{ name: 'cow', pos: [2.5, 64, 0.5] }], inventario: espada }, 1)
  ok(!x.r && !sv.estado(x.bb).golpe, `golpe de una vaca: no cuenta (${JSON.stringify(x.r)})`)
  x = decide({ inventario: espada }, 'nadie')
  ok(!x.r && !sv.estado(x.bb).golpe, `daño sin atacante (caída, fuego, hambre): no cuenta (${JSON.stringify(x.r)})`)
  x = decide({ entidades: [{ name: 'player', username: 'Seppuq', type: 'player', pos: [2.5, 64, 0.5] }], inventario: espada }, 1)
  ok(x.r && x.r.habilidad === 'atacar', `golpe de un jugador que no es aliado: se defiende (${JSON.stringify(x.r)})`)
  ;({ r } = decide({ salud: 7, entidades: [z(6.5)], inventario: espada }))
  ok(r && r.habilidad === 'huir', `salud 7 con un zombi a 6 sin golpe: huir (${JSON.stringify(r)})`)
  x = decide({ entidades: [z(2.5), z(0.5, 2.5), z(-1.5)], inventario: espada })
  r = reflejos.siguiente(x.bb, { h: 'huir', hechos: [{ habilidad: 'huir', exito: false, causa: 'sin camino' }] })
  ok(r && r.habilidad === 'atacar' && r.args.includes('acorralado'), `acorralado (huir falló, 3 zombis pegados): defenderse (${JSON.stringify(r)})`)
  x = decide({ entidades: [z(2.5, 0.5, 'creeper')], inventario: espada })
  r = reflejos.siguiente(x.bb, { h: 'huir', hechos: [{ habilidad: 'huir', exito: false, causa: 'sin camino' }] })
  ok(!r || r.habilidad !== 'atacar', 'acorralado por un creeper: nunca atacar')
  x = decide({ entidades: [z(2.5)] })
  ok((await require('./habilidades/refugiarse')(x.bb, [], tarea())).causa === 'monstruos cerca' && x.bb.picados.length === 0, 'refugiarse con un zombi a 2: monstruos cerca, sin picar')
  ;({ r } = decide({ salud: 7, entidades: [z(6.5)], inventario: espada }, null, 'huir'))
  ok(!r || r.habilidad !== 'huir', 'tras huir no vuelve a huir en la misma ronda')
  ;({ r } = decide({ salud: 12, entidades: [z(6.5)], inventario: [['stone_sword', 1]] }))
  ok(r && r.habilidad === 'equipar', `zombi a 6 sin golpe y salud 12: equipar, no atacar ni huir (${JSON.stringify(r)})`)
  x = decide({ entidades: [z(3.5)], inventario: espada }, 1)
  sv.atendido(x.bb)
  ok(reflejos.siguiente(x.bb, {}).habilidad === 'equipar', 'un golpe ya atendido no pide otra defensa')
  x = decide({ entidades: [z(3.5)], inventario: espada }, 1)
  sv.estado(x.bb).activo = false
  ok(!sv.golpeReciente(x.bb), 'con los reflejos apagados no hay golpe que atender')
  ;({ r } = decide({ comida: 5, inventario: [['bread', 2]] }))
  ok(r && r.habilidad === 'comer', `hambre 5 con pan: comer (${JSON.stringify(r)})`)
  ;({ r } = decide({ comida: 5, inventario: [['rotten_flesh', 4]] }))
  ok(!r, 'hambre 5 con solo carne podrida: nada')
  ;({ r } = decide({ comida: 7, inventario: [['bread', 2]] }))
  ok(!r, 'hambre 7: aún no come por reflejo')
  ;({ r } = decide({ bloques: { '-2,64,0': 'lava' } }))
  ok(r && r.habilidad === 'apartarse' && r.motivo === 'lava', `lava a 2: apartarse (${JSON.stringify(r)})`)
  ;({ r } = decide({ bloques: { ...celda(0, 64, 0), '-2,64,0': 'lava' }, comida: 5, inventario: [['bread', 1]], entidades: [z(2.5)] }, 1))
  ok(r && r.habilidad === 'comer', `dentro del refugio, con lava, un zombi y hambre: solo comer (${JSON.stringify(r)})`)
  ;({ r } = decide({ entidades: [z(12.5)], inventario: [['wooden_sword', 1], ['stone_sword', 1]] }))
  ok(r && r.habilidad === 'equipar', 'hostil a la vista con un arma mejor sin equipar: equipar')
  x = decide({ entidades: [z(12.5)], inventario: espada })
  x.bb.heldItem = x.bb.inventory.items()[0]
  ok(!reflejos.siguiente(x.bb, {}), 'con la mejor arma ya en la mano: nada')

  // 4 · interrupción
  console.log('4 · interrupción (index.js)')
  habilidades.HABILIDADES.prueba_espera = async (bb, [ms], t) => {
    const t0 = Date.now()
    while (!t.cancelada && Date.now() - t0 < (+ms || 3000)) await new Promise(res => setTimeout(res, 50))
    return { exito: false, causa: t.cancelada ? 'cancelado' : 'fin' }
  }
  let bb = cuerpo({ entidades: [z(3.5)] }), padre = tarea()
  let res = await habilidades.ejecutar(bb, 'prueba_espera', [], padre)
  ok(res.causa === 'amenaza' && !padre.cancelada, `supervivencia: la amenaza corta la habilidad y no la tarea de fuera (${res.causa}, ${padre.cancelada})`)
  sv.estado(bb).activo = false
  padre = tarea()
  res = await habilidades.ejecutar(bb, 'prueba_espera', [], padre)
  ok(res.causa === 'amenaza' && !padre.cancelada, 'en supervivencia con los reflejos apagados: las mismas reglas de interrupción')
  res = await habilidades.ejecutar(bb, 'atacar', ['zombie', '1'], tarea())
  ok(res.causa !== 'amenaza', `en supervivencia con los reflejos apagados la amenaza no corta atacar (${res.causa})`)
  const enUsuario = execFileSync(process.execPath, ['-e', `
    const { mundoFalso } = require('./probar_sentidos_seco'); const h = require('./habilidades')
    h.HABILIDADES.prueba_espera = async (bb, a, t) => { while (!t.cancelada) await new Promise(r => setTimeout(r, 50)); return { exito: false, causa: 'cancelado' } }
    const b = mundoFalso({ entidades: [{ name: 'zombie', pos: [3.5, 64, 0.5] }] }); b.pathfinder = { setGoal() {} }; b.stopDigging = () => {}
    const padre = { cancelada: false }
    h.ejecutar(b, 'prueba_espera', [], padre).then(r => { console.log(r.causa + ' ' + padre.cancelada); process.exit(0) })`],
  { cwd: __dirname, env: { ...process.env, IO_SERVIDOR: '', IO_REGLAS: 'duras' } }).toString().trim() // P2: reglas de siempre
  ok(enUsuario === 'amenaza true', `en el mundo del usuario, como antes: la amenaza cancela la tarea de fuera (${enUsuario})`)
  bb = cuerpo({ entidades: [z(2.5)], bloques: celda(0, 64, 0) })
  res = await habilidades.ejecutar(bb, 'prueba_espera', ['800'], tarea())
  ok(res.causa === 'fin', `dentro del refugio un zombi a 2 no corta (${res.causa})`)
  bb = cuerpo({ entidades: [z(10.5)] })
  sv.vigilarGolpes(bb)
  setTimeout(() => bb.emit('entityHurt', bb.entity, bb.entities[1]), 300)
  res = await habilidades.ejecutar(bb, 'prueba_espera', ['3000'], tarea())
  ok(res.causa === 'golpe' && /zombie/.test(res.amenaza), `un golpe del zombi a 10 corta la habilidad (${res.causa} ${res.amenaza})`)
  bb = cuerpo({ entidades: [z(3.5)], inventario: [['stone_sword', 1]] })
  res = await habilidades.ejecutar(bb, 'equipar', ['arma'], tarea())
  ok(res.exito && res.causa === 'equipado', `equipar no lo corta la amenaza (${res.causa})`)
  delete habilidades.HABILIDADES.prueba_espera

  // 5 · habilidades en el cuerpo de mentira
  console.log('5 · habilidades')
  const H = habilidades.HABILIDADES
  bb = cuerpo({ comida: 5, inventario: [['wooden_sword', 1], ['bread', 3], ['rotten_flesh', 5], ['beef', 2]] })
  bb.heldItem = bb.inventory.items()[0]
  res = await H.comer(bb, [], tarea())
  ok(res.exito && res.bocados === 2 && res.hambre[1] === 15 && res.comida === 'bread' && bb.heldItem.name === 'wooden_sword',
    `comer: 2 panes hasta 15 y vuelve la espada a la mano (${JSON.stringify(res)}, mano ${bb.heldItem && bb.heldItem.name})`)
  res = await H.comer(cuerpo({ comida: 20, inventario: [['bread', 1]] }), [], tarea())
  ok(!res.exito && res.causa === 'sin hambre', 'comer lleno: sin hambre')
  res = await H.comer(cuerpo({ comida: 3, inventario: [['rotten_flesh', 3], ['spider_eye', 1]] }), [], tarea())
  ok(!res.exito && res.causa === 'sin comida', 'comer solo con comida mala: sin comida')
  bb = cuerpo({ comida: 10, inventario: [['beef', 2], ['cooked_beef', 1]] })
  ok(sv.comidas(bb)[0].name === 'cooked_beef', 'la carne cocinada antes que la cruda')

  bb = cuerpo({ inventario: [['wooden_sword', 1], ['stone_axe', 1], ['stone_sword', 1], ['iron_chestplate', 1], ['leather_helmet', 1], ['dirt', 3]] })
  res = await H.equipar(bb, [], tarea())
  ok(res.exito && res.arma === 'stone_sword' && bb.heldItem.name === 'stone_sword' && bb.inventory.slots[6]?.name === 'iron_chestplate' &&
    bb.inventory.slots[5]?.name === 'leather_helmet', `equipar: espada de piedra y armadura (${JSON.stringify(res)})`)
  res = await H.equipar(bb, [], tarea())
  ok(res.exito && res.causa === 'ya equipado', `equipar otra vez: ya equipado (${res.causa})`)
  res = await H.equipar(cuerpo({ inventario: [['dirt', 3]] }), [], tarea())
  ok(!res.exito && res.causa === 'nada que equipar', 'equipar sin nada: nada que equipar')
  ok(sv.colocables(cuerpo({ inventario: [['cobblestone', 2], ['oak_planks', 2], ['dirt', 2]] })).map(i => i.name).join() === 'dirt,oak_planks,cobblestone',
    'los bloques se gastan: tierra, tablones y la piedra la última')

  // refugiarse: cavar en llano (sin bloques: los saca del pozo)
  bb = cuerpo()
  res = await H.refugiarse(bb, [], tarea())
  ok(res.exito && res.causa === 'cavado' && res.rotos.length === 3 && res.puestos.length === 1 && require('./habilidades/comun').encerrado(bb) &&
    String(res.pos) === '0,61,0', `refugiarse en llano: cava 3 y tapa (${JSON.stringify(res)})`)
  ok(String(bb.yo.refugio) === '0,61,0' && bb.yo.refugioInfo.modo === 'cavado' && String(bb.yo.refugioInfo.salida) === '0,64,0', 'el refugio queda en la memoria')
  ok(observacion.observarSv(bb).obs[observacion.NOMBRES_SV.indexOf('en_refugio')] === 1, 'los sentidos lo ven: en_refugio = 1')
  res = await H.refugiarse(bb, [], tarea())
  ok(res.exito && res.causa === 'ya dentro', 'refugiarse dentro: ya dentro')
  // tapiar en llano: 10 bloques (8 lados, apoyo y techo)
  bb = cuerpo({ inventario: [['dirt', 12]] })
  res = await H.refugiarse(bb, ['tapiar'], tarea())
  ok(res.exito && res.causa === 'tapiado' && res.bloques === 10 && require('./habilidades/comun').encerrado(bb), `tapiarse en llano: 10 bloques (${JSON.stringify(res)})`)
  bb = cuerpo({ inventario: [['dirt', 5]] })
  res = await H.refugiarse(bb, ['tapiar'], tarea())
  ok(!res.exito && bb.puestos.length === 0, `tapiarse con 5 bloques en llano: no empieza (${res.causa})`)
  // en un pasillo de 1 de ancho con techo: tapiar con 4 (lo natural) antes que cavar
  bb = cuerpo({ inventario: [['dirt', 6]], bloques: caja(caja(caja({}, [1, 1], [64, 66], [-3, 3], 'stone'), [-1, -1], [64, 66], [-3, 3], 'stone'), [0, 0], [66, 66], [-3, 3], 'stone') })
  res = await H.refugiarse(bb, [], tarea())
  ok(res.exito && res.causa === 'tapiado' && res.bloques === 4 && bb.picados.length === 0, `en un pasillo con techo: tapiar con 4 (${JSON.stringify(res)})`)
  // seguridad: agua junto a la columna → no cava ahí (cava en otro sitio seguro o no cava)
  const sinLiquidoCerca = (bb2) => bb2.picados.every(([px, py, pz]) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -2; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) if (/water|lava/.test(bb2.blockAt(new Vec3(px + dx, py + dy, pz + dz)).name)) return false
    return true
  })
  bb = cuerpo({ bloques: { '1,62,0': 'water' } })
  ok(refugiarse.planCavar(bb, new Vec3(0, 64, 0)).mal.startsWith('suelo peligroso'), 'agua al lado de la columna: suelo peligroso')
  res = await H.refugiarse(bb, [], tarea())
  ok(sinLiquidoCerca(bb) && (!res.exito || String(res.pos) !== '0,61,0'), `con agua al lado no cava ahí (${res.causa} en ${res.pos}, movido ${res.movido})`)
  // un lago alrededor (agua en todo lo que no es su islote): no cava en el islote; F7.6b: busca un sitio seco a ≤ 10 (va nadando)
  // y cava allí, lejos del agua (antes: «suelo peligroso» sin picar, y en F7.6 el bot se ahogaba repitiéndolo)
  const lago = caja({}, [-8, 8], [62, 63], [-8, 8], 'water'); lago['0,63,0'] = 'grass_block'; lago['0,62,0'] = 'dirt'
  bb = cuerpo({ bloques: lago })
  res = await H.refugiarse(bb, [], tarea())
  ok(res.exito && res.causa === 'cavado' && res.movido && Math.hypot(res.movido[0], res.movido[2]) > 8 && sinLiquidoCerca(bb),
    `en un islote en el agua: cava en seco fuera del lago (${res.causa}, movido ${res.movido}, ${bb.picados.length} picados)`)
  // un lago más grande (la orilla seca a más de 10): suelo peligroso, sin picar
  const mar = caja({}, [-14, 14], [62, 63], [-14, 14], 'water'); mar['0,63,0'] = 'grass_block'; mar['0,62,0'] = 'dirt'
  bb = cuerpo({ bloques: mar })
  res = await H.refugiarse(bb, [], tarea())
  ok(!res.exito && res.causa === 'suelo peligroso' && bb.picados.length === 0, `en un islote en un lago grande: suelo peligroso, sin picar (${res.causa}, ${bb.picados.length})`)
  bb = cuerpo({ bloques: { '0,59,0': 'lava' } })
  ok(refugiarse.planCavar(bb, new Vec3(0, 64, 0)).mal.startsWith('suelo peligroso'), 'lava debajo del suelo nuevo: suelo peligroso')
  bb = cuerpo({ bloques: { '0,60,0': 'air' } })
  ok(refugiarse.planCavar(bb, new Vec3(0, 64, 0)).mal.startsWith('suelo peligroso'), 'hueco debajo: suelo peligroso')
  bb = cuerpo({ bloques: { '1,61,0': 'air' } })
  ok(refugiarse.planCavar(bb, new Vec3(0, 64, 0)).mal.startsWith('suelo peligroso'), 'cueva al lado de la celda: suelo peligroso')
  // piedra: a mano no («sin pico»); con pico de madera, sí
  const roca = caja({}, [-8, 8], [58, 63], [-8, 8], 'stone')
  bb = cuerpo({ bloques: roca })
  res = await H.refugiarse(bb, [], tarea())
  ok(!res.exito && res.causa === 'sin bloques ni pico' && bb.picados.length === 0, `en roca sin pico ni bloques: sin bloques ni pico (${res.causa})`)
  bb = cuerpo({ bloques: roca, inventario: [['wooden_pickaxe', 1]] })
  res = await H.refugiarse(bb, [], tarea())
  ok(res.exito && res.causa === 'cavado', `en roca con pico de madera: cavado (${JSON.stringify(res).slice(0, 200)})`)

  // esperar_al_dia y dormir
  bb = cuerpo({ hora: 23900, comida: 5, bloques: celda(0, 64, 0), inventario: [['bread', 2]] })
  setTimeout(() => { bb.time.timeOfDay = 500 }, 1200)
  res = await H.esperar_al_dia(bb, [], tarea())
  ok(res.exito && res.causa === 'amanece' && res.comido >= 1, `esperar al día de madrugada, comiendo: amanece (${JSON.stringify(res)})`)
  res = await H.esperar_al_dia(cuerpo({ hora: 18000 }), [], tarea())
  ok(!res.exito && res.causa === 'sin refugio', 'esperar al día fuera del refugio: sin refugio')
  res = await H.dormir(cuerpo({ hora: 18000 }), [], tarea())
  ok(!res.exito && res.causa === 'sin cama y sin refugio', 'dormir de noche sin cama ni refugio')
  res = await H.dormir(cuerpo({ hora: 6000, bloques: celda(0, 64, 0) }), [], tarea())
  ok(!res.exito && res.causa === 'es de día', 'dormir de día en el refugio: es de día')
  bb = cuerpo({ hora: 300, bloques: celda(0, 64, 0) })
  setTimeout(() => { bb.time.timeOfDay = 490 }, 300)
  res = await H.dormir(bb, [], tarea())
  ok(res.exito && res.modo === 'refugio', `a las 6:18 en el refugio espera hasta las 6:29 (${res.causa})`)
  // F7.6: al atardecer (antes de las 12480), ya encerrado, espera al día; fuera y sin cama, sigue siendo «es de día»
  bb = cuerpo({ hora: 11500, bloques: celda(0, 64, 0) })
  setTimeout(() => { bb.time.timeOfDay = 13000 }, 300)
  setTimeout(() => { bb.time.timeOfDay = 490 }, 1400)
  res = await H.dormir(bb, [], tarea())
  ok(res.exito && res.causa === 'amanece' && res.modo === 'refugio' && res.hora[0] === 11500, `al atardecer en el refugio espera al día (${JSON.stringify(res)})`)
  res = await H.dormir(cuerpo({ hora: 11500 }), [], tarea())
  ok(!res.exito && res.causa === 'es de día', `al atardecer fuera y sin cama: es de día (${res.causa})`)
  res = await H.esperar_al_dia(cuerpo({ hora: 10900, bloques: celda(0, 64, 0) }), [], tarea())
  ok(!res.exito && res.causa === 'es de día', `a las 10900 en el refugio: aún es de día (${res.causa})`)

  // apartarse: lo que ve
  const ap = require('./habilidades/apartarse')
  bb = cuerpo({ bloques: { '-2,64,0': 'lava', '3,63,3': 'air' } })
  ok(ap.peligros(bb, new Vec3(0, 64, 0)).lava && !ap.peligros(bb, new Vec3(0, 64, 0)).caida, 'apartarse ve la lava a 2 (y un hoyo de 1 no es caída)')
  bb = cuerpo({ bloques: { '-2,64,0': 'lava' } })
  res = await H.apartarse(bb, [], tarea())
  ok(res.exito && res.causa === 'a salvo' && bb.entity.position.distanceTo(new Vec3(-1.5, 64, 0.5)) >= 4, `apartarse de la lava: a salvo y lejos (${JSON.stringify(res)})`)

  // 6 · órdenes en lenguaje sencillo
  console.log('6 · órdenes')
  const esperado = { come: 'come', 'ataca al zombi': 'ataca', 'refúgiate': 'refugiate', 'sal del refugio': 'sal', duerme: 'duerme',
    'espera al día': 'duerme', 'usa la cama': 'duerme', 'ven a la cama': 'duerme', 'guarda el spawn': 'duerme', 'dame 10 troncos': 'dame', 'dame todo': 'dame', 'fabrica una espada': 'fabrica', 'equípate': 'equipate', 'apártate': 'apartate', caza: 'caza',
    'consigue comida': 'caza', espera: 'quedate', 'tala 3 troncos': 'tala', 'haz un refugio': 'construye', 'huye del creeper': 'huye' }
  for (const [t, tipo] of Object.entries(esperado)) { const o = ordenes.interpretar(t); ok(o && o.tipo === tipo, `«${t}» → ${o && o.tipo} (esperaba ${tipo})`) }

  // «defiéndeme» (2026-11-01): el parser y el filtro defensivo (solo pelea con quien pega al protegido o al bot)
  for (const [t, a] of [['defiéndeme', undefined], ['protégeme', undefined], ['defiende a Pepe', 'pepe'], ['escolta a ana', 'ana']]) {
    const o = ordenes.interpretar(t); ok(o && o.tipo === 'escolta' && o.a === a, `«${t}» → ${JSON.stringify(o)} (esperaba escolta${a ? ' a ' + a : ''})`)
  }
  ok(ordenes.interpretar('defiéndete').tipo === 'ataca', '«defiéndete» sigue siendo atacar')
  for (const t of ['recupera tus cosas', 'Oqva, recupera', 've a por tus cosas', 'recoge tu loot']) ok(ordenes.interpretar(t).tipo === 'recupera', `«${t}» → recupera`)
  ok(ordenes.interpretar('recoge').tipo === 'recoge' && !ordenes.interpretar('recoge').troncos, '«recoge» → todo lo caído')
  ok(ordenes.interpretar('recoge los troncos').troncos && ordenes.interpretar('recoge la madera').troncos, '«recoge los troncos/la madera» → solo troncos')
  for (const [t, modo] of [['defiéndeme', 'pasivo'], ['defiéndeme agresivo', 'agresivo'], ['defiéndeme pasivo', 'pasivo'], ['defiende a Pepe agresiva', 'agresivo']])
    ok(ordenes.interpretar(t).modo === modo, `«${t}» → modo ${ordenes.interpretar(t).modo} (esperaba ${modo})`)
  { const o = ordenes.interpretar('ataca a __Count'); ok(o.tipo === 'ataca' && o.nombre === '__count' && !o.de, `«ataca a __Count» → ${JSON.stringify(o)}`) }
  { const o = ordenes.interpretar('ataca a Trivino en 120 64 -300'); ok(o.nombre === 'trivino' && JSON.stringify(o.en) === '[120,64,-300]', `«ataca a Trivino en 120 64 -300» → ${JSON.stringify(o)}`) }
  { const j = require('./jugadores'), b = new (require('events'))(), e = { type: 'player', username: 'Pepe', position: new Vec3(5, 64, -7) }
    b.entity = { type: 'player' }; j.vigilar(b); b.emit('entityMoved', e); e.position = new Vec3(9, 64, 9)
    const v = j.ultimaVez(b, 'Pepe'); ok(v && v.pos.x === 5 && v.pos.z === -7 && !j.ultimaVez(b, 'Ana'), `jugadores: recuerda dónde le vio (${JSON.stringify(v)})`) }
  // 2026-11-01: sin límite de distancia: coordenadas en «ven»/«sígueme»/«defiéndeme» y el viaje por tramos (viajeLargo)
  for (const [t, tipo, en] of [['ven a 10 64 -5', 'ven', '[10,64,-5]'], ['Oqva, sígueme en 1 2 3', 'sigueme', '[1,2,3]'], ['defiéndeme en 5 6 -7', 'escolta', '[5,6,-7]'], ['ven', 'ven', undefined]]) {
    const o = ordenes.interpretar(t); ok(o.tipo === tipo && JSON.stringify(o.en) === en, `«${t}» → ${JSON.stringify(o)}`)
  }
  {
    const { viajeLargo } = require('./habilidades/comun'), b = { entity: { position: new Vec3(0, 64, 0) } }, tramos = []
    const mover = async (bot, meta) => { tramos.push(meta); bot.entity.position = new Vec3(meta.x, meta.y != null ? meta.y : 64, meta.z); return 'listo' }
    const r = await viajeLargo(b, new Vec3(200, 70, 0), () => false, { mover })
    ok(r === 'llegué' && tramos.length >= 4 && tramos.every(m => Math.abs(m.x - (tramos[tramos.indexOf(m) - 1] || { x: 0 }).x) <= 64), `viajeLargo: 200 bloques en ${tramos.length} tramos de ≤ 64 → ${r}`)
    const t2 = []; b.entity.position = new Vec3(0, 64, 0)
    const r2 = await viajeLargo(b, new Vec3(300, 64, 0), () => b.entity.position.x >= 100, { mover: async (bot, meta) => { t2.push(meta); return mover(bot, meta) } })
    ok(r2 === 'listo' && t2.length === 2, `viajeLargo: para en cuanto listo() (${t2.length} tramos, ${r2})`)
    b.entity.position = new Vec3(0, 64, 0)
    const r3 = await viajeLargo(b, new Vec3(300, 64, 0), () => false, { mover: async () => 'sin camino' })
    ok(r3 === 'sin camino', `viajeLargo: sin avanzar → ${r3}`)
    b.entity.position = new Vec3(298.4, 64, 0.5) // 2026-11-04: a 2,1 con cerca = 2: GoalNear (bloques enteros) ya está cumplida y no se mueve más
    const r4 = await viajeLargo(b, new Vec3(300.5, 64, 0.5), () => false, { cerca: 2, mover: async () => 'listo' })
    ok(r4 === 'llegué', `viajeLargo: meta cumplida a 2,1 de un destino con cerca 2 → ${r4}`)
  }
  { // 2026-11-01: siempre lo mejor puesto (equipar.pendiente)
    const { pendiente } = require('./habilidades/equipar'), it = (name) => ({ name, count: 1 })
    const b = { heldItem: it('stone_pickaxe'), inventory: { slots: [], items: () => [it('iron_sword'), it('iron_chestplate'), it('stone_pickaxe')] } }
    ok(pendiente(b) === 'todo', `pendiente: espada y peto sin poner → ${pendiente(b)}`)
    b.heldItem = it('iron_sword'); ok(pendiente(b) === 'armadura', `pendiente: con la espada en la mano → ${pendiente(b)}`)
    b.inventory.slots[6] = it('diamond_chestplate'); ok(pendiente(b) === null, `pendiente: ya lleva un peto mejor → ${pendiente(b)}`)
  }
  for (const t of ['Oqva, entra al portal', 'cruza el portal', 've al nether', 'vuelve al mundo normal']) { const o = ordenes.interpretar(t); ok(o.tipo === 'portal', `«${t}» → ${JSON.stringify(o)}`) }
  { const o = ordenes.interpretar('ataca al zombi'); ok(o.de === 'zombie' && !o.nombre, `«ataca al zombi» no lleva nombre: ${JSON.stringify(o)}`) }
  {
    const yo = { id: 0, type: 'player' }, bx = { entity: yo }
    const amigo = { id: 1, type: 'player', username: 'Pepe' }, otro = { id: 2, type: 'player', username: 'Ana' }
    const zombi = { id: 3, type: 'hostile', name: 'zombie' }, ender = { id: 4, type: 'hostile', name: 'enderman' }
    const creeper = { id: 5, type: 'hostile', name: 'creeper' }, vaca = { id: 6, type: 'animal', name: 'cow' }
    const casos = [[amigo, zombi, true, 'un zombi pega al protegido'], [yo, zombi, true, 'un zombi pega al bot'],
      [amigo, ender, true, 'un enderman pega al protegido'], [amigo, otro, true, 'un jugador cualquiera le pega'], [amigo, otro, false, 'otro jugador aliado le pega', (n) => n === 'Ana'], [yo, amigo, false, 'el propio protegido pega al bot'],
      [amigo, creeper, false, 'un creeper (nunca se pelea)'], [vaca, zombi, false, 'el zombi pega a una vaca'],
      [amigo, undefined, false, 'daño sin atacante (caída, fuego)']]
    for (const [v, f, quiero, txt, al] of casos) ok(require('./habilidades/sv').esAgresor(bx, v, f, amigo, al) === quiero, `escolta: ${txt} → ${quiero ? 'pelea' : 'no pelea'}`)
    // agresivo: el hostil más cercano al protegido (a ≤ 10), sin creepers ni los ignorados
    const P = (x, z) => new Vec3(x, 64, z), amigoP = { ...amigo, position: P(0, 0) }
    const ents = { 0: { ...yo, position: P(-3, 0) }, 1: amigoP, 3: { ...zombi, position: P(4, 0) }, 7: { id: 7, type: 'hostile', name: 'skeleton', position: P(0, 6) },
      5: { ...creeper, position: P(1, 0) }, 6: { ...vaca, position: P(0, 1) }, 8: { id: 8, type: 'hostile', name: 'zombie', position: P(30, 0) } }
    const bz = { entity: ents[0], entities: ents, yo: {} }
    const cerca = (ign) => { const x = require('./habilidades/sv').amenazaCerca(bz, amigoP, 10, ign); return x && x.id }
    ok(cerca() === 3, `agresivo: el zombi a 4 (no el creeper a 1, ni la vaca, ni el zombi a 30): ${cerca()}`)
    { // curarse comiendo: poca vida, hambre sin llenar y comida buena en el inventario
      const SVm = require('./habilidades/sv'), reg = require('minecraft-data')('26.1')
      const cb = (health, food, items) => ({ entity: {}, health, food, registry: reg, inventory: { items: () => items.map(name => ({ name })) } })
      ok(SVm.debeComerPorSalud(cb(8, 17, ['bread'])), 'curarse: salud 8, hambre 17, con pan → come')
      ok(!SVm.debeComerPorSalud(cb(8, 17, [])), 'curarse: sin comida → no')
      ok(!SVm.debeComerPorSalud(cb(8, 17, ['rotten_flesh'])), 'curarse: solo carne podrida → no')
      ok(!SVm.debeComerPorSalud(cb(8, 20, ['bread'])), 'curarse: hambre llena → no (se cura sola)')
      ok(!SVm.debeComerPorSalud(cb(18, 10, ['bread'])), 'curarse: con vida de sobra → no (eso es hambre, no curarse)')
    }
    ok(cerca(new Set([3])) === 7, `agresivo: ignorando el zombi, el esqueleto: ${cerca(new Set([3]))}`)
  }

  { // «modo centinela»: quién cuenta como intruso en la zona
    const { Vec3 } = require('vec3'), sv = require('./habilidades/sv')
    const mk = (id, type, name, x, extra = {}) => ({ id, type, name, position: new Vec3(x, 64, 5), isValid: true, ...extra })
    const bx = { entity: mk(0, 'player', 'player', 0, { username: 'Trivino' }), entities: {} }
    for (const e of [mk(1, 'hostile', 'zombie', 5), mk(2, 'player', 'player', 6, { username: 'Ana' }), mk(3, 'player', 'player', 7, { username: '__Count' }),
      mk(4, 'player', 'player', 8, { username: 'Oqva' }), mk(5, 'hostile', 'zombie', 50), mk(6, 'hostile', 'creeper', 9), mk(7, 'animal', 'cow', 9)]) bx.entities[e.id] = e
    const zona = { x1: 10, z1: 0, x2: 0, z2: 10 } // esquinas al revés a propósito
    const quien = sv.intrusos(bx, zona, (n) => n === '__Count' || n === 'Oqva').map(e => e.id)
    ok(JSON.stringify(quien) === '[1,2]', `centinela: zombi y jugador desconocido sí; dueño, bot, zombi fuera, creeper y vaca no (${JSON.stringify(quien)})`)
    bx.entities[8] = { ...mk(8, 'hostile', 'zombie', 5), position: new Vec3(5, 40, 5) } // en una cueva, 24 bloques más abajo
    const alto = sv.intrusos(bx, zona, () => false, new Map(), { y: 64, dy: 8 }).map(e => e.id)
    ok(!alto.includes(8) && alto.includes(1), `centinela: el zombi de la cueva (y 40) no cuenta con ±8 sobre y 64 (${JSON.stringify(alto)})`)
    { // «modo guardaespaldas»: jugadores no aliados a rango de golpe del protegido
      const prot = mk(20, 'player', 'player', 0, { username: 'Count' }); prot.position = new Vec3(100, 64, 100)
      const cerca = mk(21, 'player', 'player', 0, { username: 'Ana' }); cerca.position = new Vec3(103, 64, 100)
      const lejos = mk(22, 'player', 'player', 0, { username: 'Beto' }); lejos.position = new Vec3(110, 64, 100)
      const amigo = mk(23, 'player', 'player', 0, { username: 'Oqva' }); amigo.position = new Vec3(101, 64, 100)
      bx.entities = { 20: prot, 21: cerca, 22: lejos, 23: amigo }
      const q = sv.jugadoresCerca(bx, prot, 5, (n) => n === 'Oqva').map(e => e.username)
      ok(JSON.stringify(q) === '["Ana"]', `guardaespaldas: solo el jugador no aliado a ≤ 5 del protegido (${JSON.stringify(q)})`)
      const o2 = require('./ordenes').interpretar('modo guardaespaldas')
      ok(o2.tipo === 'guardaespaldas', `«modo guardaespaldas» → ${JSON.stringify(o2)}`)
    }
    const o = require('./ordenes').interpretar('modo centinela')
    ok(o.tipo === 'centinela' && o.zona === '', `«modo centinela» → ${JSON.stringify(o)}`)
    const I = require('./ordenes').interpretar
    for (const [t, zona] of [['patrulla', ''], ['patruya', ''], ['patrullen', ''], ['patruyen el hogar', ''], ['patrulla en el hogar', ''], ['patrulla por la ZONA2', 'ZONA2']]) {
      const q = I(t); ok(q.tipo === 'centinela' && q.patrulla === true && q.zona === zona, `«${t}» → ${JSON.stringify(q)}`)
    }
    ok(I('modo centinela').patrulla === undefined, '«modo centinela» no patrulla')
    for (const t of ['deja de patrullar', 'desactiva centinela', 'ya no patrulles']) ok(I(t).tipo === 'centinela_off', `«${t}» → ${JSON.stringify(I(t))}`)
  }

  console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
  process.exit(fallos ? 1 : 0)
}
module.exports = { cuerpo, caja }
