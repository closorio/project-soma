// Utilidades de supervivencia (F7.2) que comparten las habilidades nuevas (comer, atacar, refugiarse, salir_del_refugio, dormir,
// esperar_al_dia, fabricar, equipar, apartarse, recoger_comida), los reflejos (../reflejos.js), el vigía de index.js y las pruebas.
// Lo que «ve» cada una (comida buena, arma, bloques para tapiarse, peligros) es lo mismo que cuentan los sentidos de F7.1
// (../observacion.js): así la red y el cuerpo no discrepan.
const { Vec3 } = require('vec3')
const memoria = require('../memoria')
const mundo = require('../mundo')
const zonas = require('../zonas')
const cofres = require('../cofres')
const obras = require('../obras')
const observacion = require('../observacion')
const { hostiles, esperar, esAmenaza } = require('./comun')
const { anotarAgresor, NUNCA_ATACAR } = require('./taxonomia')
const { tipoHostil, COMIDA_MALA, esColocable, valorArma, PUNTOS_ARMADURA, PIEZAS, NOCHE } = observacion

const RADIO_N = 16 // hostiles que cuentan como «a la vista» (hostiles_n de la observación)
const AMANECE = 480 // 6:29: esperar_al_dia acaba aquí (los zombis y esqueletos de fuera ya arden; simulador: ESPERA_HASTA = 0,02)
const CAMA = [12542, 23459] // cuándo deja dormir el juego (mineflayer, bed.js)
const ATARDECER = 11040 // F7.6: desde aquí, ya encerrado, esperar_al_dia espera (simulador: ATARDECER = 0,46); antes decía «es de día»
// hasta las 12480, el bot salía y volvía a cavar otro pozo (el vaivén de F7.5)

// ---- hora ----
const hora = (bot) => bot.time.timeOfDay
const esNoche = (bot) => hora(bot) >= NOCHE[0] && hora(bot) <= NOCHE[1]
const madrugada = (bot) => hora(bot) > NOCHE[1] || hora(bot) < AMANECE // del final de la noche a las 6:29
const esperable = (bot) => hora(bot) >= ATARDECER || hora(bot) < AMANECE // del atardecer a las 6:29 (F7.6; simulador: _esperable)

// ---- monstruos ----
// Un monstruo: una amenaza según la taxonomía (./taxonomia.js; o un tipo marcado con `amenaza_prueba` en pacífico). Los
// jugadores, los animales, la caída y los neutrales que no han golpeado no.
const esMonstruo = (bot, e) => esAmenaza(bot, e)
// Muertos hace poco (la entidad tarda ~1 s en desaparecer tras morir): no son objetivo ni amenaza. Lo apunta vigilarGolpes.
const muertos = (bot) => memoria(bot, 'muertos', () => new Map())
const vivo = (bot, e) => !!e && e.isValid !== false && !(Date.now() - (muertos(bot).get(e.id) || 0) < 3000)
const aLaVista = (bot) => hostiles(bot, RADIO_N).filter(e => vivo(bot, e))

// ---- comida ----
// Carne y pescado crudos: se comen solo si no hay otra cosa (el pollo crudo puede dar hambre).
const CRUDA = new Set(['beef', 'porkchop', 'chicken', 'mutton', 'rabbit', 'cod', 'salmon', 'potato'])
const valorComida = (bot, n) => (bot.registry.foodsByName[n] || {}).foodPoints || 0
// La comida buena del inventario (sin la que hace daño: COMIDA_MALA), la mejor primero: cocinada antes que cruda y, dentro de
// cada grupo, la que más llena.
function comidas(bot) {
  return bot.inventory.items().filter(i => bot.registry.foodsByName[i.name] && !COMIDA_MALA.has(i.name))
    .sort((a, b) => (CRUDA.has(a.name) - CRUDA.has(b.name)) || (valorComida(bot, b.name) - valorComida(bot, a.name)))
}
const comidaComible = (n) => !COMIDA_MALA.has(n)

// ---- armas y armadura ----
const MATERIAL = ['wooden', 'golden', 'stone', 'copper', 'iron', 'diamond', 'netherite']
// Puntuación de un arma: la de los sentidos (valorArma: 0, 0,5 madera u oro, 1 piedra o mejor) y, a igualdad, espada antes que
// hacha (golpea cada 0,65 s; el hacha, cada 1,1) y el mejor material.
function puntosArma(n) {
  const v = valorArma(n)
  if (!v) return 0
  const m = /^([a-z]+)_(sword|axe)$/.exec(n)
  return v * 100 + (m && m[2] === 'sword' ? 10 : 0) + (m ? MATERIAL.indexOf(m[1]) : 0)
}
const mejorArma = (bot) => bot.inventory.items().filter(i => puntosArma(i.name) > 0).sort((a, b) => puntosArma(b.name) - puntosArma(a.name))[0] || null
// Cada cuánto golpear con el arma en la mano (ms): con la barra de ataque llena (espada 1,6 golpes/s; hacha de piedra 0,8; puño 4).
function cadencia(n) {
  if (!n) return 300
  if (n.endsWith('_sword')) return 650
  if (n.endsWith('_axe')) return /^(wooden|stone)_/.test(n) ? 1250 : 1100
  return n === 'trident' ? 1100 : n === 'mace' ? 1700 : 300
}
const DESTINO_PIEZA = { helmet: 'head', chestplate: 'torso', leggings: 'legs', boots: 'feet' }
// Puntos de una pieza de armadura por su nombre (0 si no lo es).
function puntosPieza(n) {
  const m = /^([a-z]+)_(helmet|chestplate|leggings|boots)$/.exec(n || '')
  return m ? (PUNTOS_ARMADURA[m[1]] || [0, 0, 0, 0])[PIEZAS.indexOf(m[2])] : 0
}

// ---- bloques para tapiarse ----
// Los bloques colocables (tierra_inv), en el orden en que se gastan: tierra y parecidos, luego tablones y la piedra la última
// (sirve para la espada de piedra), como _gastar() del simulador.
function rangoColocable(n) { return n.endsWith('_planks') ? 1 : /cobble|^stone$|deepslate|blackstone/.test(n) ? 2 : 0 }
const colocables = (bot) => bot.inventory.items().filter(i => esColocable(i.name)).sort((a, b) => rangoColocable(a.name) - rangoColocable(b.name))
const cuantosColocables = (bot) => colocables(bot).reduce((a, i) => a + i.count, 0)

// ---- qué se puede tocar ----
// Picar o poner un bloque en (x, y, z): nunca en zonas protegidas, cofres ni obras de otro; en el mundo del usuario, además, solo
// dentro del rectángulo de obras (obras.json: permitido), como minar y construir. En el de supervivencia, en cualquier otro sitio.
function puedeTocar(x, y, z) {
  if (zonas.pasoVedado(x, y, z) || zonas.talaProtegida(x, y, z) || cofres.esCofre(x, y, z) || obras.esDeObra(x, y, z)) return false
  return mundo.reglasLibres || obras.enPermitido(x, z)
}
const NO_PICAR = /^(bedrock|obsidian|crying_obsidian|reinforced_deepslate|end_portal_frame|barrier|spawner|chest|trapped_chest|barrel|.*shulker_box)$/
const LIQUIDOS = /^(water|lava|bubble_column)$/
const esLiquido = (k) => !!k && (LIQUIDOS.test(k.name) || /^(kelp|kelp_plant|seagrass|tall_seagrass)$/.test(k.name) ||
  !!(k.getProperties && k.getProperties().waterlogged === true))
const solido = (k) => !!k && k.boundingBox === 'block'

// La herramienta del inventario que pica antes el bloque y lo que tardaría con ella (ms), sin equiparla (para planear).
function mejorHerramienta(bot, k) {
  let mejor = null, ms = Infinity
  for (const it of [null, ...bot.inventory.items()]) {
    let t
    try { t = k.digTime(it ? it.type : null, false, false, false, [], bot.entity.effects || {}) } catch (_) { continue }
    if (t < ms) { ms = t; mejor = it }
  }
  return { item: mejor, ms }
}

// ---- reflejos: estado por personaje ----
// activo: los reflejos de supervivencia (por defecto, fuera del mundo del usuario; IO_REFLEJOS=si|no lo fuerza; orden `reflejos`).
// golpe: el último golpe de un monstruo ({ t, id, nombre, tipo }); atendido: hasta cuándo se ha respondido (un golpe con t ≤
// atendido ya no pide reacción). apartado: dónde y cuándo se apartó por última vez (no repetirlo en el mismo sitio).
const REFLEJOS_POR_DEFECTO = process.env.IO_REFLEJOS ? process.env.IO_REFLEJOS === 'si' : mundo.reglasLibres
const estado = (bot) => memoria(bot, 'reflejos', () => ({ activo: REFLEJOS_POR_DEFECTO, golpe: null, atendido: 0, apartado: null, n: {} }))
const activos = (bot) => !!estado(bot).activo
// Las reglas de supervivencia de la interrupción (habilidades/index.js): fuera del mundo del usuario siempre (también midiendo sin
// reflejos); en el del usuario, solo si se encienden los reflejos a mano.
const reglasSupervivencia = (bot) => mundo.reglasLibres || activos(bot)
// ¿Le ha golpeado un monstruo hace menos de `ms` (y desde `desde`), sin respuesta aún? Solo con los reflejos activos.
function golpeReciente(bot, ms = 3000, desde = 0) {
  const e = estado(bot), g = e.golpe
  return !!(e.activo && g && g.t > e.atendido && g.t >= desde && Date.now() - g.t < ms) ? g : null
}
const atendido = (bot) => { estado(bot).atendido = Date.now() }
// Apunta los golpes de monstruos (el daño sin atacante o de un no-monstruo —caída, fuego, lava, hambre, un jugador— no cuenta).
// io.js lo llama con cada bot nuevo. `alGolpe(golpe)`: para reaccionar enseguida en reposo.
function vigilarGolpes(bot, alGolpe = () => {}) {
  bot.on('entityDead', (e) => { if (e) muertos(bot).set(e.id, Date.now()) })
  bot.on('entityHurt', (e, fuente) => {
    if (!bot.entity || e !== bot.entity) return
    anotarAgresor(bot, fuente) // un neutral que golpea pasa a ser amenaza un rato (taxonomia.AGRESOR_MS)
    if (!esMonstruo(bot, fuente)) return
    const g = estado(bot).golpe = { t: Date.now(), id: fuente.id, nombre: fuente.name, tipo: tipoHostil(fuente) }
    alGolpe(g)
  })
}

// «defiéndeme» (2026-11-01): ¿el golpe a `victima` lo da alguien con quien el guardaespaldas pelea? Solo cuentan los golpes al
// protegido o al propio bot, de una entidad que no sea un jugador ni de NUNCA_ATACAR (el creeper, el warden…). Es defensivo:
// un mob que no ha pegado no cuenta, por hostil o cerca que esté.
function esAgresor(bot, victima, fuente, protegido) {
  if (!victima || !fuente || fuente === bot.entity || fuente.type === 'player') return false
  if (victima !== bot.entity && victima !== protegido) return false
  return !NUNCA_ATACAR.has(fuente.name)
}

// ---- el refugio en la memoria del personaje ----
// refugio: la casilla de los pies dentro de la celda (la usan los sentidos: refugio_dist); refugioInfo: cómo se hizo (modo, salida,
// bloques puestos y picados, para salir y para que el banco de pruebas reponga el terreno).
function anotarRefugio(bot, pies, info) {
  const yo = memoria(bot)
  yo.refugio = [pies.x, pies.y, pies.z]
  yo.refugioInfo = { ...info, pies: [pies.x, pies.y, pies.z], t: Date.now() }
}
const refugioInfo = (bot) => memoria(bot).refugioInfo || null

// Que el personaje quede en el centro de su casilla (para poner bloques a su alrededor sin que estorbe su propio cuerpo).
async function centrar(bot, ms = 1500) {
  const p = bot.entity.position, c = new Vec3(Math.floor(p.x) + 0.5, p.y, Math.floor(p.z) + 0.5)
  const lejos = () => Math.hypot(bot.entity.position.x - c.x, bot.entity.position.z - c.z)
  if (lejos() <= 0.15) return true
  try {
    await bot.lookAt(c.offset(0, bot.entity.height || 1.62, 0), true)
    bot.setControlState('sneak', true); bot.setControlState('forward', true)
    const t0 = Date.now()
    while (lejos() > 0.15 && Date.now() - t0 < ms) {
      await bot.lookAt(new Vec3(c.x, bot.entity.position.y + 1.62, c.z), true)
      await esperar(50)
    }
  } finally { bot.clearControlStates() }
  return lejos() <= 0.25
}

module.exports = { RADIO_N, AMANECE, ATARDECER, CAMA, hora, esNoche, madrugada, esperable, esMonstruo, vivo, aLaVista, tipoHostil, comidas, comidaComible, CRUDA,
  puntosArma, mejorArma, cadencia, puntosPieza, DESTINO_PIEZA, colocables, cuantosColocables, esColocable, valorArma, puedeTocar,
  NO_PICAR, esLiquido, solido, mejorHerramienta, estado, activos, reglasSupervivencia, golpeReciente, atendido, vigilarGolpes, esAgresor, anotarRefugio, refugioInfo,
  centrar }
