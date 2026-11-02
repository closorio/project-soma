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
const { hostiles, esperar, esAmenaza, conLimite } = require('./comun')
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
// Puntuación de un arma (2026-11-01): daño por segundo con la barra llena (daño × golpes/s, los del juego en Java 1.21), más
// Afilado (+0,5 por nivel +0,5). Así un hacha de netherite gana a una espada de piedra y el tridente a un hacha de piedra.
const DANO_ARMA = {
  sword: { wooden: [4, 1.6], golden: [4, 1.6], stone: [5, 1.6], copper: [5, 1.6], iron: [6, 1.6], diamond: [7, 1.6], netherite: [8, 1.6] },
  axe: { wooden: [7, 0.8], golden: [7, 1], stone: [9, 0.8], copper: [9, 0.8], iron: [9, 0.9], diamond: [9, 1], netherite: [10, 1] }
}
const DANO_OTRAS = { trident: [9, 1.1], mace: [6, 0.6] }
// Nivel de un encantamiento en un objeto (0 si no lo tiene o no se puede leer)
function nivelEncantamiento(item, nombre) {
  try { return ((item && item.enchants) || []).find(e => e.name === nombre)?.lvl || 0 } catch (e) { return 0 }
}
function puntosArma(n, item) {
  if (!valorArma(n)) return 0
  const m = /^([a-z]+)_(sword|axe)$/.exec(n)
  const [dano, ritmo] = (m ? DANO_ARMA[m[2]][m[1]] : DANO_OTRAS[n]) || [1, 1]
  const afilado = nivelEncantamiento(item, 'sharpness')
  return (dano + (afilado ? 0.5 * afilado + 0.5 : 0)) * ritmo
}
const mejorArma = (bot) => bot.inventory.items().filter(i => puntosArma(i.name, i) > 0).sort((a, b) => puntosArma(b.name, b) - puntosArma(a.name, a))[0] || null
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
// Para elegir entre dos piezas: los puntos, luego la dureza (diamante 2, netherite 3) y luego Protección.
const DUREZA = { diamond: 2, netherite: 3 }
function valorPieza(item) {
  if (!item) return 0
  const m = /^([a-z]+)_/.exec(item.name)
  return puntosPieza(item.name) * 100 + ((m && DUREZA[m[1]]) || 0) * 10 + nivelEncantamiento(item, 'protection')
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
// Poner un bloque en una casilla vacía: como puedeTocar, pero el hogar (zonas.js) y, dentro de él, las zonas de trabajo no lo impiden.
function puedePoner(x, y, z) {
  if (zonas.pasoVedado(x, y, z) || zonas.ponerProtegido(x, y, z) || cofres.esCofre(x, y, z) || obras.esDeObra(x, y, z)) return false
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
// Equiparse lo que antes pica este bloque (2026-11-02, pedido del usuario: pala para la tierra, pico para la roca, hacha para la
// madera…). Si ninguna herramienta acelera (mejorHerramienta empata con la mano), no saca nada: no gasta el pico ni la espada.
async function equiparPara(bot, k) {
  if (!k) return null
  const { item } = mejorHerramienta(bot, k)
  if (item && (!bot.heldItem || bot.heldItem.type !== item.type)) {
    try { await conLimite(bot.equip(item, 'hand'), 3000); await esperar(60) } catch (_) {}
  }
  return item
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
// Apunta los golpes de monstruos y de jugadores no aliados (el daño sin atacante —caída, fuego, lava, hambre— no cuenta).
// io.js lo llama con cada bot nuevo. `alGolpe(golpe)`: para reaccionar enseguida en reposo.
function vigilarGolpes(bot, alGolpe = () => {}, aliado = () => false) {
  bot.on('entityDead', (e) => { if (e) muertos(bot).set(e.id, Date.now()) })
  bot.on('entityHurt', (e, fuente) => {
    if (!bot.entity || e !== bot.entity) return
    anotarAgresor(bot, fuente) // un neutral que golpea pasa a ser amenaza un rato (taxonomia.AGRESOR_MS)
    // 2026-11-01: un jugador que le pega también cuenta, salvo los aliados (`aliado(nombre)`: sus dueños y los demás personajes)
    const jugador = !!fuente && fuente.type === 'player' && fuente !== bot.entity && !aliado(fuente.username)
    if (!jugador && !esMonstruo(bot, fuente)) return
    const g = estado(bot).golpe = { t: Date.now(), id: fuente.id, nombre: jugador ? fuente.username : fuente.name, tipo: jugador ? 'jugador' : tipoHostil(fuente) }
    alGolpe(g)
  })
}

// «protégeme» (2026-11-01): ¿el golpe a `victima` lo da alguien con quien el guardaespaldas pelea? Solo cuentan los golpes al
// protegido o al propio bot, de una entidad que no sea de NUNCA_ATACAR (el creeper, el warden…). Un jugador cuenta si no es
// aliado (`aliado(nombre)`: el propio protegido, los dueños y los demás personajes no). Es defensivo: un mob que no ha pegado
// no cuenta aquí (para eso, amenazaCerca).
function esAgresor(bot, victima, fuente, protegido, aliado = () => false) {
  if (!victima || !fuente || fuente === bot.entity) return false
  if (victima !== bot.entity && victima !== protegido) return false
  if (fuente.type === 'player') return fuente !== protegido && !aliado(fuente.username)
  return !NUNCA_ATACAR.has(fuente.name)
}

// Curarse comiendo (2026-11-01, pedido del usuario): con poca vida (≤ SALUD_COMER) y la barra de hambre sin llenar, comer hasta
// llenarla, porque la vida solo se recupera con el hambre ≥ 18 (rápido a 20). Solo si lleva comida buena. Va siempre, con o sin
// reflejos (io.js: en reposo, tras cada habilidad y escoltando).
const SALUD_COMER = 12
const debeComerPorSalud = (bot) => !!bot.entity && bot.health > 0 && bot.health <= SALUD_COMER && bot.food < 20 && comidas(bot).length > 0

// «defiéndeme agresivo»: el hostil vivo más cercano al protegido (a ≤ radio de él y a ≤ 16 del bot), sin los de NUNCA_ATACAR ni
// los de `ignorar` (ids con los que atacar acaba de negarse). null si no hay.
// `ignorar`: un Set de ids o un Map id → hasta cuándo (el de «protégeme», el centinela y el guardaespaldas)
const ignorado = (ignorar, id) => (ignorar instanceof Map ? (ignorar.get(id) || 0) > Date.now() : ignorar.has(id))
function amenazaCerca(bot, protegido, radio = 10, ignorar = new Set()) {
  if (!protegido || !bot.entity) return null
  const d = (x) => x.position.distanceTo(protegido.position)
  return Object.values(bot.entities).filter(x => x !== bot.entity && x !== protegido && esAmenaza(bot, x) && vivo(bot, x) && !NUNCA_ATACAR.has(x.name) &&
    !ignorado(ignorar, x.id) && d(x) <= radio && x.position.distanceTo(bot.entity.position) <= 16).sort((a, b) => d(a) - d(b))[0] || null
}

// «modo centinela»: los que han entrado en la zona (rectángulo x/z de zonas.json) y hay que echar: monstruos hostiles (o neutrales que ya han
// pegado) y jugadores que no sean aliados (`aliado(nombre)`: dueños y otros personajes). Sin los de NUNCA_ATACAR (creeper…) ni los de
// `ignorar` (id → hasta cuándo). Los más cercanos al bot primero.
function intrusos(bot, zona, aliado = () => false, ignorar = new Map(), altura = null) {
  const x1 = Math.min(zona.x1, zona.x2), x2 = Math.max(zona.x1, zona.x2), z1 = Math.min(zona.z1, zona.z2), z2 = Math.max(zona.z1, zona.z2)
  // altura: { y, dy } (el puesto del centinela ± dy); si la zona trae y1/y2, esos mandan. Sin nada, toda la altura.
  const dentro = (p) => {
    const x = Math.floor(p.x), z = Math.floor(p.z)
    if (!(x >= x1 && x <= x2 && z >= z1 && z <= z2)) return false
    if (zona.y1 != null && zona.y2 != null) return p.y >= Math.min(zona.y1, zona.y2) && p.y <= Math.max(zona.y1, zona.y2) + 1
    return !altura || Math.abs(p.y - altura.y) <= altura.dy
  }
  return Object.values(bot.entities).filter(e => e !== bot.entity && vivo(bot, e) && !((ignorar.get(e.id) || 0) > Date.now()) && dentro(e.position)
    && (e.type === 'player' ? !!e.username && !aliado(e.username) : esAmenaza(bot, e) && !NUNCA_ATACAR.has(e.name)))
    .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))
}

// «modo guardaespaldas»: los jugadores no aliados (`aliado(nombre)`) a ≤ `radio` del protegido, el más cercano a él primero, sin los de `ignorar`.
function jugadoresCerca(bot, protegido, radio = 5, aliado = () => false, ignorar = new Map()) {
  return Object.values(bot.entities).filter(e => e.type === 'player' && e !== bot.entity && e !== protegido && !!e.username && !aliado(e.username) && vivo(bot, e)
    && !((ignorar.get(e.id) || 0) > Date.now()) && e.position.distanceTo(protegido.position) <= radio)
    .sort((a, b) => a.position.distanceTo(protegido.position) - b.position.distanceTo(protegido.position))
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

module.exports = { equiparPara, RADIO_N, AMANECE, ATARDECER, CAMA, hora, esNoche, madrugada, esperable, esMonstruo, vivo, aLaVista, tipoHostil, comidas, comidaComible, CRUDA,
  puntosArma, mejorArma, cadencia, puntosPieza, valorPieza, nivelEncantamiento, DESTINO_PIEZA, colocables, cuantosColocables, esColocable, valorArma, puedeTocar, puedePoner,
  NO_PICAR, esLiquido, solido, mejorHerramienta, estado, activos, reglasSupervivencia, golpeReciente, atendido, vigilarGolpes, esAgresor, amenazaCerca, intrusos, jugadoresCerca, debeComerPorSalud, SALUD_COMER, anotarRefugio, refugioInfo,
  centrar }
