// Quién decide en el modo libre, por personaje (F8.0a; hasta F7, IO_DECISOR e IO_POLITICA valían para todo el proceso):
//   red      la red de la política (red.js): las 25 entradas del mundo del usuario o las 47 de supervivencia, según el archivo;
//   guion    con una política de 47 entradas, el guion de supervivencia (guion_sv.js, copia de guion_sv_lote) en vez de la red;
//            con una de 25, la red (como hacía IO_DECISOR=guion): la política sigue diciendo qué observación hace falta;
//   capataz  el guion de progresión de los perfiles v2 (F8.1, PLAN_F8_perfiles.md): aún no existe y se niega con un aviso.
// Se elige en la línea de órdenes (NOMBRE:PUERTO:PERFIL:MODO:DECISOR[@RUTA]) o con la orden `decisor X [RUTA]`; sin decir nada,
// IO_DECISOR (por defecto red) e IO_POLITICA, como siempre.
const red = require('./red')
const guion = require('./guion_sv')

const NOMBRES = ['red', 'guion', 'capataz']

function crear(nombre = process.env.IO_DECISOR || 'red', ruta = null) {
  if (!NOMBRES.includes(nombre)) throw new Error(`decisor desconocido: ${nombre} (${NOMBRES.join(', ')})`)
  const politica = red.politica(ruta || red.RUTA)
  return {
    nombre, politica, ruta: politica.ruta,
    // Comprueba que puede decidir (la política se carga y, el capataz, existe); lanza un error que se le puede decir al usuario.
    preparar() {
      if (nombre === 'capataz') throw new Error('el capataz de los perfiles v2 llega en F8.1')
      politica.cargar()
    },
    observacion: () => politica.observacion(),
    decidir(obs, tipo = politica.observacion()) {
      if (nombre === 'capataz') throw new Error('el capataz de los perfiles v2 llega en F8.1')
      return nombre === 'guion' && tipo === 'obs_sv' ? guion.decidir(obs) : politica.decidir(obs)
    },
  }
}

// El de la línea de órdenes: «guion», «red@../entrenamiento/politica_x.json»; vacío, el de siempre.
function deTexto(texto) {
  if (!texto) return crear()
  const [nombre, ruta] = texto.split('@')
  return crear(nombre || undefined, ruta || null)
}

module.exports = { NOMBRES, crear, deTexto }
