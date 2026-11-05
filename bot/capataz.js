// El capataz (F8.1, PLAN_F8_perfiles.md): el guion de progresión sin tokens de los perfiles v2. Lee las etapas del rol
// (perfiles/v2/<rol>.json, resueltas con perfil_v2.js) y, en cada decisión del modo libre, elige el siguiente paso:
//   1. mantenimiento: de noche (reglas.noche = refugio) o con poca vida y monstruos (aprovechar_con_luz), rutina_noche; con hambre,
//      comer o, sin comida y de día, recoger_comida;
//   2. la etapa que toca (progresion.etapaActual): el siguiente paso de su `hacer` («minar iron_ore 3 12», «fundir iron 3»…), por
//      turnos; un paso que falla 2 veces seguidas se salta, y si fallan todos, una alternativa según el tipo de etapa (explorar, o
//      bajar por una escalera a por minerales) y se vuelve a empezar;
//   3. sin etapas pendientes, explorar.
// Con el resultado (alResultado) apunta la etapa como hecha cuando se cumple su objetivo, con el día y la hora del juego, en la
// memoria persistente (etapas[rol][id]) o, en el mundo del usuario, en la RAM. Una orden de chat corta el paso en marcha (F4) y, al
// volver a libre, el capataz sigue por la misma etapa.
const memoria = require('./memoria')
const persistente = require('./memoria_persistente')
const perfilV2 = require('./perfil_v2')
const progresion = require('./progresion')
const sv = require('./habilidades/sv')
const { nodo, encerrado } = require('./habilidades/comun')

const FALLOS_PASO = 2, HAMBRE = 12, VIDA_REFUGIO = 10, ATARDECER = 12000, AMENAZA = 8, VIDA_PELEA = 8, VIDA_REGENERA = 14

const roles = new Map() // nombre → { perfil, etapas } (las etapas resueltas una vez)
function rol(nombre) {
  if (!roles.has(nombre)) {
    const perfil = perfilV2.cargar(nombre), cat = perfilV2.catalogo()
    const errores = perfilV2.validar(perfil, cat, nombre)
    if (errores.length) throw new Error(`el rol ${nombre} no vale: ${errores[0]}`)
    roles.set(nombre, { perfil, etapas: perfilV2.resolver(perfil, cat) })
  }
  return roles.get(nombre)
}
const comprobar = (nombre) => { rol(nombre); return true }

// Las etapas hechas del rol: en la memoria persistente si la hay (fuera del mundo del usuario); si no, en la RAM.
function hechas(bot, nombre) {
  const d = persistente.de(bot)
  const donde = d ? (d.etapas = d.etapas || {}) : memoria(bot, 'etapas', () => ({}))
  return (donde[nombre] = donde[nombre] || {})
}
const reloj = (bot) => ({ dia: bot.time && bot.time.day != null ? bot.time.day : null, hora: bot.time ? bot.time.timeOfDay : null })
function marcarHecha(bot, nombre, id) {
  const h = hechas(bot, nombre)
  if (h[id]) return false
  h[id] = { ...reloj(bot), t: new Date().toISOString() }
  const d = persistente.de(bot)
  if (d) persistente.guardar(d)
  return true
}
const paso = (texto) => { const [habilidad, ...args] = texto.trim().split(/\s+/); return { habilidad, args } }
const estadoCapataz = (bot) => memoria(bot, 'capataz', () => ({ etapa: null, paso: 0, fallos: {}, alternativas: 0 }))

// Cuando todos los pasos de la etapa han fallado: algo que cambie la situación.
function alternativa(bot, etapa, n) {
  const y = nodo(bot).y
  if (etapa.tipo === 'mineral' && n % 2 === 0 && y > 20) return { habilidad: 'cavar_escalera', args: [String(y - 12), '-'] }
  if (etapa.tipo === 'comida') return { habilidad: 'explorar', args: ['-', '120', '150'] } // animales: aún más lejos
  return { habilidad: 'explorar', args: ['-', '80', '120'] } // más lejos que el explorar de siempre (40): menas, árboles
}

// Al morir se pierde el inventario (keep_inventory false): las etapas hechas cuyo objetivo era solo de inventario se olvidan (hay que
// volver a hacerlas); las de memoria o hitos (la casa, el portal) se quedan.
function olvidarSiMurio(bot, nombre, etapas) {
  const d = persistente.de(bot), st = estadoCapataz(bot)
  const n = d ? d.muertes.length : 0
  if (st.muertes === undefined) { st.muertes = n; return }
  if (n <= st.muertes) return
  st.muertes = n
  const h = hechas(bot, nombre)
  for (const et of etapas) if (h[et.id] && Object.keys(et.objetivo || {}).every(s => s === 'inv')) delete h[et.id]
  Object.assign(st, { etapa: null, paso: 0, fallos: {}, luego: null })
  if (d) persistente.guardar(d)
}

function decidir(bot, nombre) {
  const { perfil, etapas } = rol(nombre)
  const reglas = perfil.reglas || {}
  const t = bot.time ? bot.time.timeOfDay : 6000
  const atardecer = t >= ATARDECER && t < 12542
  // 1 · mantenimiento. Un monstruo a ≤ 8: defenderse como el guion de supervivencia (con arma, vida ≥ 8, ≤ 2 y sin creeper) o huir
  // (F8.1: en la primera prueba, bajo tierra, el capataz seguía con la etapa y una araña lo mató)
  const cerca = sv.aLaVista(bot).filter(x => x.position.distanceTo(bot.entity.position) <= AMENAZA)
  if (cerca.length) {
    const creeper = cerca.some(x => sv.tipoHostil(x) === 'creeper'), arma = sv.mejorArma(bot)
    const lucha = arma && bot.health >= VIDA_PELEA && cerca.length <= 2 && !creeper
    return { habilidad: lucha ? 'atacar' : 'huir', args: ['-'], motivo: 'amenaza' }
  }
  if (reglas.noche === 'refugio' && (sv.esNoche(bot) || atardecer)) {
    // al atardecer aún es «de día» para rutina_noche (acababa al momento, en bucle): refugiarse antes y, dentro, esperar al día
    // (o dormir con cama); de noche y fuera, rutina_noche (el guion de supervivencia)
    if (encerrado(bot)) return { habilidad: sv.esNoche(bot) && progresion.estado(bot).inv.cama ? 'dormir' : 'esperar_al_dia', args: [], motivo: 'noche' }
    // F8.1: al atardecer refugiarse a pelo fallaba en bucle («suelo peligroso») y lo mataban de noche: la rutina (el guion de
    // supervivencia) sabe moverse si no puede refugiarse, y desde el atardecer hasta el amanecer cuenta como noche
    return { habilidad: 'rutina_noche', args: ['900'], motivo: atardecer ? 'atardecer' : 'noche' }
  }
  if (reglas.noche !== 'refugio' && sv.esNoche(bot) && (bot.health < VIDA_REFUGIO || sv.aLaVista(bot).length >= 3))
    return { habilidad: 'rutina_noche', args: ['300'], motivo: 'peligro de noche' }
  // F8.1: en el banco K morían con 1-3 de vida siguiendo con la etapa (cazar, explorar) y monstruos a la vista: con poca vida, apartarse
  // con la rutina hasta no ver ninguno; y comer antes (la vida solo se regenera con la comida ≥ 18)
  if (bot.health <= VIDA_PELEA && sv.aLaVista(bot).length) return { habilidad: 'rutina_noche', args: ['300'], motivo: 'poca vida' }
  const comida = sv.comidas(bot).length > 0
  if (bot.food <= HAMBRE && comida) return { habilidad: 'comer', args: [], motivo: 'hambre' }
  if (bot.health < VIDA_REGENERA && bot.food < 18 && comida) return { habilidad: 'comer', args: [], motivo: 'regenerar' }
  if (bot.food <= HAMBRE && !comida && !sv.esNoche(bot)) // sin cama aún, las ovejas no se comen: son la lana
    return { habilidad: 'recoger_comida', args: progresion.estado(bot).inv.cama ? [] : ['24', 'sin:sheep'], motivo: 'hambre sin comida' }
  // 2 · la etapa que toca (las que ya se cumplen, hechas, y a por la siguiente)
  olvidarSiMurio(bot, nombre, etapas)
  const e = progresion.estado(bot)
  // herramientas gastadas (un pico de piedra dura 131 bloques): reponer el del nivel ya conseguido antes de seguir (en el banco K, sin
  // pico, minar decía «sin pico» y la etapa no avanzaba)
  const h00 = hechas(bot, nombre)
  if (h00.herr_piedra && e.inv.pico < 0.66) return { habilidad: e.inv.piedra >= 3 ? 'fabricar' : 'minar', args: e.inv.piedra >= 3 ? ['pico_piedra'] : ['stone', '3', '8'], motivo: 'pico gastado' }
  if (h00.herr_madera && e.inv.pico === 0) return { habilidad: 'fabricar', args: ['pico_madera'], motivo: 'pico gastado' }
  const st0 = estadoCapataz(bot), h0 = hechas(bot, nombre)
  // la etapa empezada sigue hasta acabarla aunque su pre deje de cumplirse a medias (el pico de piedra gasta la piedra del pre)
  const empezada = st0.etapa && !h0[st0.etapa] && etapas.find(x => x.id === st0.etapa)
  let et = empezada && !progresion.cumple(empezada.objetivo, e) ? empezada : progresion.etapaActual(etapas, e, h0)
  for (let k = 0; et && et.yaCumple && k < etapas.length; k++) {
    marcarHecha(bot, nombre, et.id)
    et = progresion.etapaActual(etapas, e, hechas(bot, nombre))
  }
  if (!et) return { habilidad: 'explorar', args: [], motivo: 'rol completo' }
  const st = estadoCapataz(bot)
  if (st.etapa !== et.id) Object.assign(st, { etapa: et.id, paso: 0, fallos: {}, alternativas: 0, sinSalida: 0, luego: null })
  if (st.luego) { const l = st.luego; st.luego = null; return { ...l, ...{ etapa: et.id, falta: progresion.falta(et.objetivo, e) } } }
  const pasos = et.hacer.filter(h => !h.startsWith('pendiente:'))
  const datos = { etapa: et.id, falta: progresion.falta(et.objetivo, e) }
  for (let k = 0; k < pasos.length; k++) {
    const i = (st.paso + k) % pasos.length
    if ((st.fallos[i] || 0) < FALLOS_PASO) return { ...paso(pasos[i]), paso: i, ...datos }
  }
  st.fallos = {}
  return { ...alternativa(bot, et, st.alternativas++), alternativa: true, ...datos }
}

// Tras ejecutar lo decidido: cuenta el fallo o el acierto del paso, apunta la casa y las etapas que ya se cumplen.
function alResultado(bot, nombre, d, r) {
  const st = estadoCapataz(bot)
  if (d.paso != null && st.etapa === d.etapa) {
    if (r.exito) {
      // 2026-11-04, banco M: en m_pozo, tras dos fallos de cavar solo quedaba subir, que acierta al momento («ya fuera»): 695 veces hasta el final.
      // Acertar mientras otro paso sigue agotado no lo saca del apuro: a las dos veces, la alternativa, y todos los pasos otra vez
      const agotado = Object.entries(st.fallos).some(([i, n]) => Number(i) !== d.paso && n >= FALLOS_PASO)
      st.fallos[d.paso] = 0
      st.paso = d.paso + 1
      st.sinSalida = agotado ? (st.sinSalida || 0) + 1 : 0
      const et = st.sinSalida >= FALLOS_PASO && rol(nombre).etapas.find(x => x.id === d.etapa)
      if (et) { st.fallos = {}; st.sinSalida = 0; st.luego = { ...alternativa(bot, et, st.alternativas++), alternativa: true } }
    } else st.fallos[d.paso] = (st.fallos[d.paso] || 0) + 1
    // minar no ve la mena (está enterrada): lo siguiente, ir hasta la más cercana cavando, y luego minar otra vez
    if (d.habilidad === 'minar' && !r.exito && /nada que minar|no piqué/.test(String(r.causa))) st.luego = { habilidad: 'ir_a_mena', args: [d.args[0], '32'], motivo: 'mena enterrada' }
    // la casa pide 71 tablones (≈ 18 troncos) y las etapas de antes gastan la madera: talar lo que falte (1 tronco → 4) y volver
    const sinMadera = d.habilidad === 'construir' && !r.exito && String(r.causa).match(/falta material: (\d+) tablones/)
    if (sinMadera) st.luego = { habilidad: 'rutina_madera', args: [String(Math.ceil(parseInt(sinMadera[1]) / 4) + 1), '600'], motivo: 'falta madera' }
  }
  const dp = persistente.de(bot)
  if (d.habilidad === 'construir' && r.exito && dp) { dp.casa = r.origen || nodo(bot).toArray(); persistente.guardar(dp) }
  const { etapas } = rol(nombre), e = progresion.estado(bot), nuevas = []
  for (const et of etapas) if (!hechas(bot, nombre)[et.id] && progresion.cumple(et.objetivo, e) && marcarHecha(bot, nombre, et.id)) nuevas.push(et.id)
  return nuevas
}

// Para el puerto (orden `progreso`): rol, etapa que toca, lo que le falta y las hechas con su día.
function progreso(bot, nombre) {
  const { etapas } = rol(nombre), e = progresion.estado(bot), h = hechas(bot, nombre), st = estadoCapataz(bot)
  const empezada = st.etapa && !h[st.etapa] && etapas.find(x => x.id === st.etapa)
  const et = empezada || progresion.etapaActual(etapas, e, h) // la misma que decidir: la empezada sigue
  return { rol: nombre, etapa: et ? et.id : null, falta: et ? progresion.falta(et.objetivo, e) : [], hechas: h,
    pendientes: etapas.filter(x => !h[x.id]).map(x => x.id), estado: e }
}

module.exports = { decidir, alResultado, progreso, comprobar, hechas, marcarHecha, rol }
