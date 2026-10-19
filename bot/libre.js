// Una decisión del modo libre (F4; F7.5-F7.6, el ejecutor de supervivencia), aparte de io.js para probarla en seco
// (bot/probar_libre_seco.js). La política dice qué observación quiere (red.observacion()):
//   'obs'    las 25 entradas de observacion.observar (politica_habilidades.json, el mundo del usuario): todo como antes de F7.5,
//            la misma observación, la misma red, los mismos argumentos y tramos de 5 min;
//   'obs_sv' las 47 de observacion.observarSv (p. ej. IO_POLITICA=…/politica_supervivencia_dagger.json): las 11 acciones de
//            entorno_supervivencia.py con sus argumentos, tramos de un día de Minecraft (DURACION, 1200 s: tiempo_restante corre
//            como en el simulador) y, como step() del simulador, salir antes del refugio si la habilidad elegida haría algo fuera
//            (SALEN y _necesita_salir()); si no, la habilidad falla dentro sin salir.
// F7.6: con IO_DECISOR=guion (y una política de 47 entradas, que dice la observación), decide el guion de supervivencia
// (guion_sv.js, copia de guion_sv_lote) en vez de la red; todo lo demás igual (para medir guion frente a red en Minecraft).
// fabricar va sin objeto: habilidades/fabricar.js elige el siguiente paso de la cadena con siguienteFabricacion(), el mismo que
// siguiente_fabricacion() del simulador (lo comprueba bot/probar_habilidades_sv_seco.js).
const red = require('./red')
const observacion = require('./observacion')
const { dist, encerrado } = require('./habilidades/comun')
const sv = require('./habilidades/sv')
const recogerComida = require('./habilidades/recoger_comida')
const guion = require('./guion_sv')

// Argumentos de cada habilidad como los pide ejecutor.py (y, las de supervivencia, como las hace el simulador): ir_a_arbol y
// ir_a_otro_arbol hasta 80 bloques, recoger troncos a ≤ 8, huir del hostil más cercano (16 bloques, 20 s), atacar al más
// cercano (20 s), refugiarse en automático (tapiarse si faltan ≤ 4 bloques; si no, cavar), comer hasta 14, recoger_comida a
// ≤ 24, explorar 40 bloques al azar lejos del campamento y fabricar sin objeto.
const ARGS = { ir_a_arbol: '80', picar_tronco: '', recoger: '8 _log', ir_a_jugador: '', huir: '-', ir_a_otro_arbol: '80',
  // F7.2: las acciones nuevas de la red de supervivencia (ACCIONES de entorno_supervivencia.py), con sus valores por defecto
  comer: '', atacar: '-', refugiarse: '', dormir: '', fabricar: '', recoger_comida: '', explorar: '' }
const TRAMO = { obs: 300, obs_sv: 1200 } // s: un episodio de la red (una línea en el diario): 5 min en F4, un día en F7.3
// Las de entorno_supervivencia.py: SALEN, DETECCION y el radio de recoger_comida (CAL_SV).
const SALEN = new Set(['ir_a_arbol', 'recoger', 'huir', 'atacar', 'recoger_comida', 'explorar'])
const DETECCION = 16, RADIO_CAZA = 24

const tramo = () => TRAMO[red.observacion()]

// ¿La habilidad elegida, desde dentro del refugio, haría algo fuera? (_necesita_salir() del simulador). datos: los de observarSv.
function necesitaSalir(bot, h, datos) {
  if (!SALEN.has(h)) return false
  switch (h) {
    case 'ir_a_arbol': return !!datos.arbol
    case 'recoger': return datos.objetos > 0
    case 'huir': case 'atacar': return sv.aLaVista(bot).some(e => dist(bot, e) <= DETECCION)
    case 'recoger_comida': return bot.food <= recogerComida.HAMBRE && !sv.esNoche(bot) &&
      Object.values(bot.entities).some(e => recogerComida.ANIMALES.has(e.name) && dist(bot, e) <= RADIO_CAZA)
    default: return true // explorar
  }
}

// La decisión: { tipo, obs, datos, d: { i, habilidad, q } de red.decidir, args, salir }.
function decidir(bot) {
  const tipo = red.observacion()
  const { obs, datos } = tipo === 'obs_sv' ? observacion.observarSv(bot) : observacion.observar(bot)
  const d = tipo === 'obs_sv' && process.env.IO_DECISOR === 'guion' ? guion.decidir(obs) : red.decidir(obs)
  const salir = tipo === 'obs_sv' && encerrado(bot) && necesitaSalir(bot, d.habilidad, datos)
  return { tipo, obs, datos, d, args: ARGS[d.habilidad], salir }
}

module.exports = { decidir, tramo, necesitaSalir, ARGS, TRAMO, SALEN }
