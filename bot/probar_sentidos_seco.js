// Prueba en seco de F7.1 (sentidos de supervivencia), sin servidor ni red: un bot de mentira en un mundo de mentira.
// 1. Los nombres de observacion.js (NOMBRES_SV, ACCIONES_SV, TIPOS_HOSTIL, ESCALAS_SV) son los de
//    entrenamiento/entorno_supervivencia.py (OBS, la fuente única), y el vector de perfil de cada perfil es el mismo.
// 2. observarSv en escenarios preparados (día, noche con monstruos, refugio, peligros, agua somera, sin datos de luz, habilidad
//    anterior): 47 valores en [0, 1] y los esperados en cada entrada que el escenario fija.
// 3. Los eventos de informe.vigilar (hambre, golpe, noche, día, refugiado, reaparecido), y que en el mundo del usuario no se activa.
// Uso: node bot/probar_sentidos_seco.js   (sale con 1 si falla algo). Va en el mundo de supervivencia: no lee nada del usuario.
// mundoFalso() lo puede usar otra prueba (require): el suelo es hierba en y = suelo y tierra debajo; `bloques` pone o quita
// ('air') casillas; la luz del cielo es 15 sin nada sólido encima y 0 con techo (o 0 en todo con sinLuz; 15 en todo con cieloViejo,
// como cuando el techo se pone después de cargar el trozo: el servidor no manda el cambio de luz), guardada en la casilla x XOR 14
// como la lee prismarine-chunk 1.41; findBlocks solo ve
// los bloques puestos a mano (el suelo no es tronco).
if (require.main === module) process.env.IO_SERVIDOR = 'supervivencia'
const path = require('path')
const { execFileSync } = require('child_process')
const EventEmitter = require('events')
const { Vec3 } = require('vec3')
const registry = require('minecraft-data')('1.21.11')

const LIMITE = 64 // lo que está más lejos no está cargado (blockAt → null)
function mundoFalso({ hora = 6000, salud = 20, comida = 20, pos = [0.5, 64, 0.5], suelo = 63, bloques = {}, luzBloque = {},
  sinLuz = false, cieloViejo = false, entidades = [], inventario = [], armadura = {}, nombre = 'Prueba' } = {}) {
  const puestos = new Map(Object.entries(bloques))
  const nombreEn = (x, y, z) => puestos.get(`${x},${y},${z}`) || (y === suelo ? 'grass_block' : y < suelo ? 'dirt' : 'air')
  const solido = (n) => registry.blocksByName[n].boundingBox === 'block'
  const bloque = (v) => {
    const x = Math.floor(v.x), y = Math.floor(v.y), z = Math.floor(v.z)
    if (Math.abs(x) > LIMITE || Math.abs(z) > LIMITE || y < -64 || y >= 320) return null
    const name = nombreEn(x, y, z), b = registry.blocksByName[name]
    // la luz guardada en x es la de x XOR 14 de su trozo, como la lee prismarine-chunk 1.41 (ver luz() en observacion.js)
    const xl = (x & ~15) | ((x & 15) ^ 14)
    const techo = () => { for (let k = y + 1; k < 320; k++) if (solido(nombreEn(xl, k, z))) return true; return false }
    return { name, type: b.id, boundingBox: b.boundingBox, position: new Vec3(x, y, z), light: sinLuz ? 0 : luzBloque[`${xl},${y},${z}`] || 0,
      get skyLight() { return cieloViejo ? 15 : sinLuz || solido(nombreEn(xl, y, z)) || techo() ? 0 : 15 } } // perezosa: que la medida de tiempo sea la de observarSv
  }
  const bot = new EventEmitter()
  const ents = entidades.map((e, i) => ({ id: i + 1, name: e.name, username: e.username, type: e.type || registry.entitiesByName[e.name]?.type || 'player',
    position: new Vec3(...e.pos), getDroppedItem: () => ({ name: e.objeto || 'oak_log' }) }))
  const slots = new Array(46).fill(null)
  const PIEZA = { cabeza: 5, pecho: 6, piernas: 7, pies: 8 }
  for (const [k, n] of Object.entries(armadura)) slots[PIEZA[k]] = { name: n, count: 1, slot: PIEZA[k] }
  inventario.forEach(([n, c], i) => { slots[36 + i] = { name: n, count: c, slot: 36 + i } })
  Object.assign(bot, {
    username: nombre, yo: {}, registry, health: salud, food: comida, time: { timeOfDay: hora }, players: {},
    game: { minY: -64, height: 384 }, rainState: 0, thunderState: 0,
    entity: { id: 0, type: 'player', username: nombre, position: new Vec3(...pos), yaw: 0 },
    inventory: { slots, items: () => slots.slice(9, 45).filter(Boolean) },
    blockAt: bloque,
    findBlocks: ({ matching, maxDistance = 16, count = 1, point }) => {
      const c = (point || bot.entity.position).floored()
      const vale = typeof matching === 'function' ? matching : (b) => [].concat(matching).includes(b.type)
      return [...puestos.keys()].map(k => new Vec3(...k.split(',').map(Number))).filter(v => v.distanceTo(c) <= maxDistance && vale(bloque(v)))
        .sort((a, b) => a.distanceTo(c) - b.distanceTo(c)).slice(0, count)
    },
  })
  bot.findBlock = (o) => { const v = bot.findBlocks(o)[0]; return v ? bloque(v) : null }
  bot._puestos = puestos // F7.2 (probar_habilidades_sv_seco.js): picar y poner bloques en el mundo falso
  bot.entities = Object.fromEntries([bot.entity, ...ents].map(e => [e.id, e]))
  return bot
}
// Celda de 1×2 cerrada de piedra alrededor de la casilla (x, y, z) (pies en y): 4 lados × 2 alturas, techo y suelo.
function celda(x, y, z, material = 'stone') {
  const b = { [`${x},${y - 1},${z}`]: material, [`${x},${y + 2},${z}`]: material }
  for (const dy of [0, 1]) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b[`${x + dx},${y + dy},${z + dz}`] = material
  return b
}
module.exports = { mundoFalso, celda }

if (require.main === module) principal().catch(e => { console.error(e); process.exit(1) })

async function principal() {
  const observacion = require('./observacion')
  const informe = require('./informe')
  let fallos = 0, pruebas = 0
  const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

  // 1 · nombres, acciones, tipos, escalas y perfiles: los de entorno_supervivencia.py
  console.log('1 · nombres frente a entrenamiento/entorno_supervivencia.py')
  const py = JSON.parse(execFileSync('python3', ['entorno_supervivencia.py', '--obs'], { cwd: path.join(__dirname, '..', 'entrenamiento') }))
  ok(igual(py.obs, observacion.NOMBRES_SV), `OBS distinto:\n    py ${py.obs}\n    js ${observacion.NOMBRES_SV}`)
  ok(igual(py.acciones, observacion.ACCIONES_SV), 'ACCIONES distintas')
  ok(igual(py.tipos_hostil, observacion.TIPOS_HOSTIL), 'TIPOS_HOSTIL distintos')
  ok(igual(py.escalas, observacion.ESCALAS_SV), `escalas distintas: py ${JSON.stringify(py.escalas)} js ${JSON.stringify(observacion.ESCALAS_SV)}`)
  ok(igual(Object.keys(py.perfiles).sort(), observacion.perfiles().sort()), 'perfiles distintos')
  for (const [n, vec] of Object.entries(py.perfiles)) {
    const b = mundoFalso(); observacion.ponerPerfil(b, n)
    ok(b.yo.perfil.vectorSv.every((x, i) => Math.abs(x - vec[i]) < 1e-9), `vector del perfil ${n}: py ${vec} js ${b.yo.perfil.vectorSv}`)
  }
  ok(observacion.NOMBRES.length === 25, 'las 25 de hoy ya no son 25')
  console.log(`  ${observacion.NOMBRES_SV.length} entradas, ${observacion.ACCIONES_SV.length} acciones`)

  // 2 · escenarios
  const I = Object.fromEntries(observacion.NOMBRES_SV.map((k, i) => [k, i]))
  const comprobar = (titulo, bot, esperado, alPreparar = () => {}) => {
    alPreparar(bot)
    const t0 = process.hrtime.bigint()
    const { obs, datos } = observacion.observarSv(bot)
    const ms = Number(process.hrtime.bigint() - t0) / 1e6
    console.log(`2 · ${titulo} (${ms.toFixed(1)} ms)`)
    ok(obs.length === 47 && obs.every(x => Number.isFinite(x) && x >= 0 && x <= 1), `${titulo}: el vector no son 47 valores en [0, 1]`)
    for (const [k, v] of Object.entries(esperado)) {
      if (!(k in I)) { ok(false, `${titulo}: ${k} no es una entrada`); continue }
      ok(Math.abs(obs[I[k]] - v) <= 0.0015, `${titulo}: ${k} = ${obs[I[k]]}, esperaba ${v}`)
    }
    return { obs, datos }
  }
  const ceros = (pref, nombres) => Object.fromEntries(nombres.map(n => [pref + n, 0]))
  const tranquilo = { hostil_dist: 1, ...ceros('hostil_tipo_', observacion.TIPOS_HOSTIL), hostiles_n: 0, caida: 0, lava_cerca: 0, agua_profunda: 0 }

  comprobar('día al aire libre, sin nada', mundoFalso({ bloques: { '5,64,0': 'oak_log', '5,65,0': 'oak_log' } }), {
    ...tranquilo, arbol_dist: 5 / 48, jugador_dist: 1, salud: 1, hambre: 1, comida_inv: 0, noche: 0, hora_sen: 1, hora_cos: 0.5, luz: 1,
    arma: 0, armadura: 0, tierra_inv: 0, cama_inv: 0, refugio_dist: 1, en_refugio: 0, tiempo_restante: 1,
    ...ceros('previa_', observacion.ACCIONES_SV), previa_exito: 0,
    ...Object.fromEntries(py.perfiles.recolector.map((x, i) => ['perfil_' + py.pesos[i], x])) })

  const noche = mundoFalso({ hora: 18000, comida: 5, salud: 14,
    entidades: [{ name: 'zombie', pos: [10.5, 64, 0.5] }, { name: 'skeleton', pos: [0.5, 64, 14.5] }, { name: 'creeper', pos: [-19.5, 64, 0.5] },
      { name: 'cow', pos: [3.5, 64, 3.5] }],
    inventario: [['bread', 3], ['rotten_flesh', 2], ['wooden_sword', 1], ['stone_axe', 1], ['dirt', 5], ['red_bed', 1], ['oak_log', 2]],
    armadura: { pecho: 'iron_chestplate' } })
  const r = comprobar('noche con zombi, esqueleto y creeper', noche, {
    hostil_dist: 10 / 24, hostil_tipo_zombi: 1, hostil_tipo_esqueleto: 0, hostil_tipo_creeper: 0, hostiles_n: 2 / 4, salud: 0.7, hambre: 0.25,
    comida_inv: 3 / 8, noche: 1, hora_sen: 0, hora_cos: 0.5, luz: 4 / 15, arma: 1, armadura: 6 / 20, tierra_inv: 1, cama_inv: 1,
    refugio_dist: 0.5, en_refugio: 0 }, (b) => { b.yo.refugio = [24, 64, 0] })
  ok(r.datos.tipo === 'zombi' && r.datos.hostiles === 2 && r.datos.arma === 'stone_axe' && r.datos.luz.osc === 11, `datos de la noche: ${JSON.stringify(r.datos)}`)
  ok(Math.abs(observacion.observar(noche).obs[observacion.NOMBRES.indexOf('amenaza_dist')] - 10 / 16) < 0.0015, 'la obs de 25 no ve al zombi a 10')
  comprobar('esqueleto solo, con el campamento como refugio', mundoFalso({ hora: 13000, entidades: [{ name: 'stray', pos: [0.5, 64, 6.5] }],
    inventario: [['golden_sword', 1], ['oak_planks', 3]], armadura: { cabeza: 'leather_helmet', pies: 'leather_boots' } }),
  { hostil_tipo_esqueleto: 1, hostil_tipo_zombi: 0, hostiles_n: 1 / 4, arma: 0.5, armadura: 2 / 20, tierra_inv: 3 / 4, cama_inv: 0, refugio_dist: 12 / 48 },
  (b) => { b.yo.campamento = [0, 64, 12] })
  comprobar('amenaza de prueba (aldeano): tipo «otro»', mundoFalso({ entidades: [{ name: 'villager', pos: [4.5, 64, 0.5] }] }),
    { hostil_dist: 4 / 24, hostil_tipo_otro: 1, hostiles_n: 1 / 4 }, (b) => { require('./habilidades/comun').pruebas(b).amenazas.add('villager') })

  const refugio = mundoFalso({ bloques: celda(0, 64, 0) })
  comprobar('refugio cerrado de día', refugio, { ...tranquilo, en_refugio: 1, luz: 0 })
  comprobar('refugio cerrado con antorcha', mundoFalso({ bloques: celda(0, 64, 0), luzBloque: { '0,64,0': 14 } }), { en_refugio: 1, luz: 14 / 15 })
  comprobar('refugio puesto tras cargar el trozo (luz del cielo vieja), de noche', mundoFalso({ bloques: celda(0, 64, 0), cieloViejo: true, hora: 18000 }),
    { en_refugio: 1, luz: 0 })
  comprobar('celda abierta por un lado', mundoFalso({ bloques: { ...celda(0, 64, 0), '1,65,0': 'air' } }), { en_refugio: 0 })

  const peligros = { '2,63,0': 'air', '2,62,0': 'air', '2,61,0': 'air', '2,60,0': 'air', '2,59,0': 'air', '-2,64,0': 'lava', '0,63,-2': 'water', '0,62,-2': 'water' }
  comprobar('borde con caída de 5, lava a 2 y agua honda a 2', mundoFalso({ bloques: peligros }), { caida: 1, lava_cerca: 1, agua_profunda: 1 })
  comprobar('hoyo de 3 y agua de 1 de hondo', mundoFalso({ bloques: { '2,63,0': 'air', '2,62,0': 'air', '2,61,0': 'air', '0,63,-2': 'water' } }),
    { caida: 0, lava_cerca: 0, agua_profunda: 0 })
  comprobar('lava y agua a más de 3', mundoFalso({ bloques: { '4,64,0': 'lava', '0,63,-4': 'water', '0,62,-4': 'water', '4,63,3': 'air', '4,62,3': 'air', '4,61,3': 'air', '4,60,3': 'air' } }),
    { caida: 0, lava_cerca: 0, agua_profunda: 0 })

  let d = comprobar('sin datos de luz, de día y a cielo abierto', mundoFalso({ sinLuz: true }), { luz: 1 }).datos
  ok(d.luz.estimada === true, 'sin datos de luz: no la marca como estimada')
  comprobar('sin datos de luz, de noche y a cielo abierto', mundoFalso({ sinLuz: true, hora: 18000 }), { luz: 4 / 15 })
  d = comprobar('sin datos de luz, bajo techo', mundoFalso({ sinLuz: true, bloques: celda(0, 64, 0) }), { luz: 0, en_refugio: 1 }).datos
  ok(d.luz.estimada === false, 'bajo techo: la luz no es estimada')

  const prev = mundoFalso()
  observacion.iniciar(prev, 1200)
  observacion.anotarHabilidad(prev, 'huir', true)
  comprobar('habilidad anterior: huir, bien', prev, { previa_huir: 1, previa_exito: 1, previa_ir_a_arbol: 0, previa_comer: 0 })
  ok(observacion.observar(prev).obs[observacion.NOMBRES.indexOf('previa_huir')] === 1, 'la obs de 25 no ve previa_huir')
  observacion.anotarHabilidad(prev, 'ir_a_jugador', false)
  comprobar('habilidad anterior: ir_a_jugador (no es acción de supervivencia)', prev, { ...ceros('previa_', observacion.ACCIONES_SV), previa_exito: 0 })
  observacion.anotarHabilidad(prev, 'explorar', true)
  comprobar('habilidad anterior: explorar', prev, { previa_explorar: 1, previa_exito: 1 })
  observacion.ponerPerfil(prev, 'supervivencia')
  comprobar('perfil supervivencia', prev, Object.fromEntries(py.perfiles.supervivencia.map((x, i) => ['perfil_' + py.pesos[i], x])))

  // 3 · eventos
  console.log('3 · eventos de informe.vigilar')
  const tipos = (b) => informe.desde(b, true).eventos.map(e => e.tipo)
  const ev = mundoFalso({ hora: 6000, entidades: [{ name: 'zombie', pos: [2.5, 64, 0.5] }, { name: 'cow', pos: [9.5, 64, 0.5] }] })
  ok(informe.vigilar(ev) === true, 'en el mundo de supervivencia, vigilar no se activa')
  const salud = (food, health) => { ev.food = food; if (health !== undefined) ev.health = health; ev.emit('health') }
  salud(20); salud(6); salud(5); salud(10); salud(4)
  ok(tipos(ev).filter(t => t === 'hambre').length === 2, `hambre: ${tipos(ev)}`)
  const zombi = ev.entities[1], vaca = ev.entities[2]
  ev.emit('entityHurt', ev.entity, zombi); salud(4, 17); ev.emit('entityHurt', ev.entity, zombi); salud(4, 14)
  let golpes = informe.desde(ev, true).eventos.filter(e => e.tipo === 'golpe')
  ok(golpes.length === 1 && golpes[0].datos.de === 'zombie' && golpes[0].datos.n === 2 && golpes[0].datos.salud === 14 && golpes[0].datos.dist === 2,
    `dos golpes seguidos del zombi en un evento: ${JSON.stringify(golpes)}`)
  informe.marcarLeido(ev, 0)
  ev.emit('entityHurt', ev.entity, zombi) // ya leído: evento nuevo
  ev.emit('entityHurt', vaca, zombi) // a otro: nada
  ev.emit('entityHurt', ev.entity) // sin atacante (caída, ahogo…)
  golpes = informe.desde(ev, true).eventos.filter(e => e.tipo === 'golpe')
  ok(golpes.length === 3 && golpes[2].datos.de === null && !('dist' in golpes[2].datos), `golpes tras leer y sin atacante: ${JSON.stringify(golpes)}`)
  for (const t of [6000, 12000, 13000, 13020, 23000, 23600, 100]) { ev.time.timeOfDay = t; ev.emit('time') }
  ok(igual(tipos(ev).filter(t => t === 'noche' || t === 'dia'), ['noche', 'dia']), `noche y día: ${tipos(ev)}`)
  ev.emit('spawn'); ev.emit('death'); ev.emit('spawn')
  ok(tipos(ev).filter(t => t === 'reaparecido').length === 1, `reaparecido: ${tipos(ev)}`)
  ev.emit('end')

  const enc = mundoFalso({ bloques: celda(0, 64, 0) })
  informe.vigilar(enc)
  await new Promise(r => setTimeout(r, 2300))
  const e = informe.desde(enc, true).eventos
  ok(e.length === 1 && e[0].tipo === 'refugiado' && igual(e[0].datos, [0, 64, 0]), `refugiado: ${JSON.stringify(e)}`)
  enc.emit('end')

  // P2 del asistente: el mundo del usuario con "reglas": "libre" (el 26.3) sí vigila; con las reglas de siempre (IO_REGLAS=duras),
  // no. process.exit: si vigilara, sus temporizadores no dejarían terminar al hijo
  const usuario = execFileSync(process.execPath, ['-e', "const E=require('events');console.log(require('./informe').vigilar(new E()));process.exit(0)"],
    { cwd: __dirname, env: { ...process.env, IO_SERVIDOR: '', IO_REGLAS: 'duras' } }).toString().trim()
  ok(usuario === 'false', `en el mundo del usuario sin reglas libres vigilar se activa (${usuario})`)
  ok(['hambre', 'noche', 'dia', 'reaparecido'].every(t => informe.AVISOS.has(t)), 'faltan avisos nuevos en informe.AVISOS')

  console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
  process.exit(fallos ? 1 : 0)
}
