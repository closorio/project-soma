// El guion de supervivencia (guion_sv_lote de entrenamiento/entorno_supervivencia.py) para una observación de supervivencia
// (las 47 de observacion.observarSv), para medir en Minecraft el guion frente a la red (F7.6, entrenamiento/experimentos_sv.py).
// Con IO_DECISOR=guion y una política de 47 entradas en IO_POLITICA (la que dice qué observación usar), libre.decidir elige con
// esto en vez de con la red; todo lo demás (argumentos, salir del refugio, reflejos, registro) es igual.
// Es una copia: si cambia guion_sv_lote, cambiar esto y pasar `node bot/probar_guion_sv_seco.js` (compara los dos en miles de
// observaciones del simulador). Los productos van en float32 (Math.fround) como en numpy, para que los umbrales den lo mismo.
const { NOMBRES_SV, ACCIONES_SV } = require('./observacion')

const I = Object.fromEntries(NOMBRES_SV.map((n, k) => [n, k]))
const A = Object.fromEntries(ACCIONES_SV.map((a, k) => [a, k]))
// Las constantes de entorno_supervivencia.py / entorno_habilidades.py que usa el guion
const RADIO_HOSTIL = 24, HOSTILES_MAX = 4, TIERRA_MAX = 4, META = 10, NOCHE = [0.52, 0.98], ESPERA_HASTA = 0.02, ATARDECER = 0.46
const LUZ_NEUTRAL = 12, ALCANCE_ESQUELETO = 15
// F7.6b: la regla del usuario (SALUD_ATACAR, MAS_DE), esperar dentro hasta que sea seguro (SALUD_SALIR, RADIO_SALIR) y DETECCION
const SALUD_ATACAR = 8, MAS_DE = 2, SALUD_SALIR = 16, RADIO_SALIR = 8, DETECCION = 16
const f32 = Math.fround
const rint = (x) => { const r = Math.round(x); return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r } // np.rint

function accion(o) {
  const g = (n) => f32(o[I[n]])
  const fallo = (h) => g('previa_' + h) > 0 && g('previa_exito') === 0
  const ps = g('perfil_seguridad'), alta = ps >= 0.6, baja = ps < 0.1
  const hay = g('hostil_dist') < 1, hd = f32(g('hostil_dist') * RADIO_HOSTIL)
  const creeper = g('hostil_tipo_creeper') > 0
  const n = rint(f32(g('hostiles_n') * HOSTILES_MAX))
  const salud = f32(g('salud') * 20), hambre = f32(g('hambre') * 20), comida = g('comida_inv') > 0
  const noche = g('noche') > 0, dentro = g('en_refugio') > 0
  let f = Math.atan2(f32(2 * g('hora_sen') - 1), f32(2 * g('hora_cos') - 1)) / (2 * Math.PI)
  f = ((f % 1) + 1) % 1
  const tarde = f >= 0.40 && f < NOCHE[0], atardecer = f >= ATARDECER && f < NOCHE[0]
  const tierra = rint(f32(g('tierra_inv') * TIERRA_MAX)), troncos = rint(f32(g('troncos_inv') * META))
  // _madera: el guion de F2 sin jugador
  let a = A.explorar
  if (g('arbol_dist') < 1) a = A.ir_a_arbol
  if (g('arbol_enfrente') > 0) a = A.picar_tronco
  if (g('objetos_suelo') > 0 && !(g('previa_recoger') > 0 && g('previa_exito') === 0)) a = A.recoger
  // lo de supervivencia, en el orden de guion_sv_lote (lo último manda)
  if (!noche && g('arma') === 0 && troncos >= 2 && !fallo('fabricar')) a = A.fabricar
  if (!noche && hambre <= 12 && !comida && !fallo('recoger_comida')) a = A.recoger_comida
  if ((tarde || noche) && !dentro && !baja && tierra < 2 && troncos >= 1 && !fallo('fabricar')) a = A.fabricar
  const fuera = !dentro && ((noche && g('luz') < 0.3) || (alta && atardecer)) && (!baja || hay || salud < 12)
  const duerme = g('cama_inv') > 0 && noche && !(hay && hd <= 8) && !fallo('dormir')
  if (fuera) a = duerme ? A.dormir : A.refugiarse
  // F7.6b: junto al agua honda, si refugiarse acaba de fallar, salir de ahí (al árbol a la vista o explorando)
  const agua = g('agua_profunda') > 0
  if (!dentro && agua && fallo('refugiarse')) a = g('arbol_dist') < 1 ? A.ir_a_arbol : A.explorar
  const madrugada = f > NOCHE[1] || f < ESPERA_HASTA
  if (dentro && (noche || madrugada || atardecer)) a = A.dormir
  // F7.6b: dentro, quedarse recuperando vida hasta que sea seguro salir
  const cerca = hay && hd <= DETECCION
  const inseguro = (salud < SALUD_SALIR && (comida || hambre >= 18)) || (hay && hd <= RADIO_SALIR)
  if (dentro && inseguro && !fallo('dormir')) a = A.dormir
  if (comida && (hambre <= 7 || (hambre < 18 && salud <= 12))) a = A.comer
  const neutral = g('hostil_tipo_aranya') > 0 && g('luz') >= LUZ_NEUTRAL / 15
  // F7.6b: la regla del usuario para todos los perfiles (huir solo con más de 2 o vida < 8; un solo zombi se defiende)
  const lucha = g('arma') >= 0.5 && salud >= SALUD_ATACAR && n <= MAS_DE && !creeper && !neutral && !fallo('atacar')
  const aTiro = hd <= (alta ? 16 : 8) || (g('hostil_tipo_esqueleto') > 0 && hd <= ALCANCE_ESQUELETO)
  if (!dentro && hay && aTiro) a = lucha ? A.atacar : A.huir
  // F7.6b (decisión del usuario): tras una huida decidida, de noche o con hostiles cerca (no un creeper), refugiarse; si alguno
  // sigue a tiro, aún no (sigue la reacción: huir otra vez o defenderse)
  if (g('previa_huir') > 0 && !dentro && (noche || (cerca && !creeper)) && !(hay && aTiro)) a = A.refugiarse
  if (!dentro && creeper && hd <= 6) a = A.huir
  return a
}

// Como red.decidir: { i, habilidad, q } (sin valores Q: q null).
function decidir(obs) {
  if (obs.length !== NOMBRES_SV.length) throw new Error(`el guion de supervivencia quiere ${NOMBRES_SV.length} entradas y le dan ${obs.length}`)
  const i = accion(obs)
  return { i, habilidad: ACCIONES_SV[i], q: null }
}

module.exports = { decidir, accion }
