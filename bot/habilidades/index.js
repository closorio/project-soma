// Habilidades de alto nivel (F2, estilo Voyager): código determinista que devuelve { exito, causa, ...datos }.
// El modelo de F2 elegirá entre ellas, no entre pasos sueltos. Por el puerto 3001: `hab NOMBRE args` o `NOMBRE args`.
const { dist, encerrado, esperar, hostilCercano } = require('./comun')
const sv = require('./sv')

const HABILIDADES = {
  ir_a_arbol: require('./ir_a_arbol'),
  picar_tronco: require('./picar_tronco'),
  recoger: require('./recoger'),
  ir_a_jugador: require('./ir_a_jugador'),
  huir: require('./huir'),
  ir_a_otro_arbol: require('./ir_a_otro_arbol'), // fase C: a un árbol que no sea el objetivo de otro personaje
  depositar: require('./depositar'), // guardar lo recogido en el cofre (../cofres.json); no es una acción de la red: la usa el reflejo de io.js
  // F6 (la mente las pide por orden; no son acciones de la red): explorar, minar y construir/deshacer dentro del rectángulo de obras
  explorar: require('./explorar'),
  minar: require('./minar'),
  construir: require('./construir'),
  deshacer: require('./deshacer'),
  // F7.2 (supervivencia): acciones de la red nueva (comer, atacar, refugiarse, dormir, fabricar, recoger_comida) y pasos internos o
  // reflejos de io.js (equipar, apartarse, salir_del_refugio, esperar_al_dia)
  comer: require('./comer'),
  atacar: require('./atacar'),
  refugiarse: require('./refugiarse'),
  salir_del_refugio: require('./salir_del_refugio'),
  dormir: require('./dormir'),
  esperar_al_dia: require('./dormir').esperarAlDia,
  dar: require('./dar'), // 2026-11-01: ir al jugador y tirarle lo pedido
  usar_cama: require('./usar_cama'), // 2026-11-01: una cama ya puesta, para guardar el spawn (no la recoge)
  fabricar: require('./fabricar'),
  equipar: require('./equipar'),
  revisar_cofres: require('./revisar_cofres'), // 2026-11-02: cuenta lo que hay en los cofres de una zona (HOGAR)
  equipar_soportes: require('./equipar_soportes'), // 2026-11-01: armadura de los armor stands y espada o hacha del cofre más cercano a uno
  apartarse: require('./apartarse'),
  recoger_comida: require('./recoger_comida'),
  // F8.0b (fundación de los perfiles v2, PLAN_F8_perfiles.md): horno, poner bloques, sacar del cofre
  fundir: require('./fundir'),
  poner: require('./poner'),
  sacar_del_cofre: require('./sacar_del_cofre'),
  // F8.0b: antorchas, escalera, salir de un atasco, caza de materiales y el cubo
  iluminar: require('./iluminar'),
  cavar_escalera: require('./escalera').cavarEscalera,
  subir_a_superficie: require('./escalera').subirASuperficie,
  desatascarse: require('./desatascarse'),
  cazar: require('./cazar'),
  recoger_agua: require('./agua').recogerAgua,
  verter: require('./agua').verter,
  // 2026-11-02: el primer oficio (cosechar y replantar, guardar en el cofre del marco con comida)
  cosechar: require('./cosechar'),
  herrero: require('./herrero'), // 2026-11-02: piezas de armadura en los soportes y herramientas de hierro en los cofres
  // F8.1: hasta una mena enterrada, cavando (la pide el capataz cuando minar no ve ninguna)
  ir_a_mena: require('./ir_a_mena'),
}

// Interrupción por amenaza (como los «modos» de Mindcraft y como el simulador): un hostil a ≤ 6 bloques corta
// cualquier habilidad salvo huir, que devuelve la causa «amenaza» para que el modelo decida (normalmente huir).
// F7.2, con las reglas de supervivencia (sv.reglasSupervivencia: fuera del mundo del usuario, con o sin reflejos): tampoco cortan a
// las que son la respuesta a la amenaza o pasos cortos de seguridad (SIN_CORTE), ni nada dentro del refugio cerrado (los de fuera
// no llegan); con los reflejos encendidos, también corta un golpe de un monstruo recibido durante la habilidad (causa «golpe»:
// io.js decide si defenderse o huir). Y la interrupción corta solo la habilidad (una subtarea), no la tarea de quien la pidió: el
// bucle libre o la orden siguen y deciden qué hacer. En el mundo del usuario todo sigue como antes.
const RADIO_AMENAZA = 6
const SIN_CORTE = new Set(['huir', 'atacar', 'refugiarse', 'apartarse', 'equipar', 'equipar_soportes', 'revisar_cofres', 'poner', 'sacar_del_cofre', 'iluminar', 'recoger_agua', 'verter',
  'desatascarse', 'subir_a_superficie']) // F8.0b: pasos cortos o de salir de un sitio cerrado

// Una tarea hija: cancelada si lo está la de fuera o si la cancela la alerta (sin tocar la de fuera).
function subtarea(tarea) {
  let propia = false
  return { get cancelada() { return propia || tarea.cancelada }, set cancelada(v) { propia = !!v } }
}

// `tarea` = { cancelada }: la orden `para` (o una habilidad nueva) la cancela.
async function ejecutar(bot, nombre, args, tarea = { cancelada: false }) {
  const h = HABILIDADES[nombre]
  if (!h) return { exito: false, causa: 'habilidad desconocida: ' + nombre }
  const t0 = Date.now()
  const sv7 = sv.reglasSupervivencia(bot) // F7.2: reglas de supervivencia (ver arriba)
  const t = sv7 ? subtarea(tarea) : tarea
  const marcha = h(bot, args, t).catch(e => ({ exito: false, causa: 'error: ' + e.message }))
  let vigia, amenaza = null, golpe = null
  const alerta = new Promise(res => {
    if (nombre === 'huir' || (sv7 && SIN_CORTE.has(nombre))) return
    vigia = setInterval(() => {
      if (t.cancelada) return
      if (sv7 && encerrado(bot)) return
      amenaza = hostilCercano(bot, RADIO_AMENAZA)
      golpe = !amenaza && sv7 ? sv.golpeReciente(bot, 1500, t0) : null
      if (!amenaza && !golpe) return
      t.cancelada = true
      bot.pathfinder.setGoal(null)
      try { bot.stopDigging() } catch (_) {}
      res(null)
    }, 200)
  })
  let r
  try { r = await Promise.race([marcha, alerta]) } finally { clearInterval(vigia) }
  if (!r) { // dar a la habilidad un momento para soltar el navegador antes de devolver el control
    await Promise.race([marcha, esperar(2000)])
    r = amenaza ? { exito: false, causa: 'amenaza', amenaza: `${amenaza.name}@${dist(bot, amenaza).toFixed(1)}` }
      : { exito: false, causa: 'golpe', amenaza: golpe.nombre + (bot.entities[golpe.id] ? `@${dist(bot, bot.entities[golpe.id]).toFixed(1)}` : '') }
  }
  return { habilidad: nombre, ...r, ms: Date.now() - t0 }
}

module.exports = { HABILIDADES, ejecutar }
