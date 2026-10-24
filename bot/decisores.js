// Quién decide en el modo libre, por personaje (F8.0a; hasta F7, IO_DECISOR e IO_POLITICA valían para todo el proceso):
//   red      la red de la política (red.js): las 25 entradas del mundo del usuario o las 47 de supervivencia, según el archivo;
//   guion    con una política de 47 entradas, el guion de supervivencia (guion_sv.js, copia de guion_sv_lote) en vez de la red;
//            con una de 25, la red (como hacía IO_DECISOR=guion): la política sigue diciendo qué observación hace falta;
//   capataz  el guion de progresión de los perfiles v2 (F8.1, bot/capataz.js), con su rol: capataz@casual (por defecto IO_ROL o casual).
// Se elige en la línea de órdenes (NOMBRE:PUERTO:PERFIL:MODO:DECISOR[@RUTA]) o con la orden `decisor X [RUTA]`; sin decir nada,
// IO_DECISOR (por defecto red) e IO_POLITICA, como siempre.
const red = require('./red')
const guion = require('./guion_sv')

const NOMBRES = ['red', 'guion', 'capataz']

// ruta: la política de la red o del guion; con el capataz, el rol v2 (perfiles/v2/<rol>.json; por defecto casual).
function crear(nombre = process.env.IO_DECISOR || 'red', ruta = null) {
  if (!NOMBRES.includes(nombre)) throw new Error(`decisor desconocido: ${nombre} (${NOMBRES.join(', ')})`)
  if (nombre === 'capataz') return capataz(ruta || process.env.IO_ROL || 'casual')
  const politica = red.politica(ruta || red.RUTA)
  return {
    nombre, politica, ruta: politica.ruta,
    // Comprueba que puede decidir (la política se carga); lanza un error que se le puede decir al usuario.
    preparar() { politica.cargar() },
    observacion: () => politica.observacion(),
    decidir(obs, tipo = politica.observacion()) {
      return nombre === 'guion' && tipo === 'obs_sv' ? guion.decidir(obs) : politica.decidir(obs)
    },
  }
}

// F8.1: el capataz de los perfiles v2 (bot/capataz.js). No mira la observación de la red: elige el siguiente paso de la etapa del
// rol (habilidad y argumentos) con el estado del personaje; libre.decidir lo reconoce por `pasoDe`.
function capataz(rol) {
  const c = require('./capataz')
  return {
    nombre: 'capataz', rol, ruta: rol, politica: null,
    preparar() { c.comprobar(rol) },
    observacion: () => 'capataz',
    pasoDe: (bot) => c.decidir(bot, rol),
    alResultado: (bot, d, r) => c.alResultado(bot, rol, d, r),
    decidir() { throw new Error('el capataz decide con el bot (pasoDe), no con una observación') },
  }
}

// El de la línea de órdenes: «guion», «red@../entrenamiento/politica_x.json», «capataz@speedrunner»; vacío, el de siempre.
function deTexto(texto) {
  if (!texto) return crear()
  const [nombre, ruta] = texto.split('@')
  return crear(nombre || undefined, ruta || null)
}

module.exports = { NOMBRES, crear, deTexto }
