// El guion de F3 (guion_lote de entrenamiento/entorno_habilidades.py) para una observación de 25 entradas (observacion.observar):
// talar, recoger, ir junto al jugador según el perfil, ceder el árbol a un compañero y huir. Lo usa la rutina de madera
// (bot/rutinas.js, F8.0a: los perfiles v1 pasan a ser estilos de rutinas) como decisor determinista, en vez de la red de 25.
// Es una copia: si cambia guion_lote, cambiar esto y pasar `node bot/probar_guion_f3_seco.js` (compara los dos en miles de
// observaciones del simulador). numpy compara en float32 cuando el otro lado es un número de Python suelto (las constantes de
// abajo con f32) y en float64 cuando es un array de np.where (umbral y límite, sin f32): así los umbrales dan lo mismo.
const { NOMBRES, HABILIDADES } = require('./observacion')

const I = Object.fromEntries(NOMBRES.map((n, k) => [n, k]))
const VISTA = 48
const CERCA_JUGADOR = 10 / VISTA, ARBOL_JUNTO = 6 / VISTA
const f32 = Math.fround

function accion(o, companero = true) {
  const g = (n) => f32(o[I[n]])
  const pc = g('perfil_compania'), ps = g('perfil_seguridad')
  const umbral = ps >= f32(0.6) ? 1.0 : ps < f32(0.1) ? 0.4 : 0.5
  const junto = pc >= f32(0.5) || (ps >= f32(0.6) && g('noche') > 0)
  const veJugador = g('jugador_dist') < 1
  const limite = junto && veJugador ? ARBOL_JUNTO : 1.0
  let a = g('arbol_dist') < limite ? 0 : 3
  if (companero) {
    const cedo = g('companero_mismo_arbol') > 0 && g('companero_arbol_dist') < g('arbol_dist') && g('otro_arbol_dist') < limite
    if (a === 0 && cedo) a = 5
  }
  if (g('arbol_enfrente') > 0) a = 1
  if (g('objetos_suelo') > 0 && !(g('previa_recoger') > 0 && g('previa_exito') === 0)) a = 2
  if (junto && veJugador && g('jugador_dist') > f32(CERCA_JUGADOR)) a = 3
  return g('amenaza_dist') < umbral ? 4 : a
}

// Como red.decidir: { i, habilidad, q } (sin valores Q: q null).
function decidir(obs) {
  if (obs.length !== NOMBRES.length) throw new Error(`el guion de F3 quiere ${NOMBRES.length} entradas y le dan ${obs.length}`)
  const i = accion(obs)
  return { i, habilidad: HABILIDADES[i], q: null }
}

module.exports = { decidir, accion }
