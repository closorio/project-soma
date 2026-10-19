// La red que elige habilidades (F2-F3 y fase C: entrenamiento/politica_habilidades.json) dentro del bot, para el modo libre (F4):
// la misma inferencia que ejecutor.py (capas densas con ReLU salvo la última; la habilidad es la de mayor valor Q), sin numpy.
// Solo lee el archivo (lo vuelve a leer si cambia) y comprueba que sus entradas y acciones son las de observacion.js.
// IO_POLITICA=RUTA usa otra política. F7.4: la política dice qué observación quiere (su lista `obs`): las 25 de NOMBRES
// (observar, el mundo del usuario) con las acciones de HABILIDADES, o las 47 de NOMBRES_SV (observarSv, orden `obs_sv`) con las
// de ACCIONES_SV (p. ej. entrenamiento/politica_supervivencia_dagger.json). observacion() dice cuál; decidir() se niega si le
// dan otra. El bucle del modo libre (io.js) aún observa con las 25: el ejecutor de supervivencia es F7.5-F7.6.
const fs = require('fs')
const path = require('path')
const { NOMBRES, HABILIDADES, NOMBRES_SV, ACCIONES_SV } = require('./observacion')

const RUTA = process.env.IO_POLITICA || path.join(__dirname, '..', 'entrenamiento', 'politica_habilidades.json')
const TIPOS = [ // la observación que quiere cada clase de política: sus entradas y sus acciones
  { observacion: 'obs', obs: NOMBRES, acciones: HABILIDADES },
  { observacion: 'obs_sv', obs: NOMBRES_SV, acciones: ACCIONES_SV },
]
let cache = { mtime: -1, capas: null, tipo: null }

function cargar() {
  const mtime = fs.statSync(RUTA).mtimeMs
  if (mtime === cache.mtime) return cache.capas
  const pol = JSON.parse(fs.readFileSync(RUTA, 'utf8'))
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const tipo = TIPOS.find(t => igual(pol.obs, t.obs) && igual(pol.acciones, t.acciones))
  if (!tipo) throw new Error(`la política ${path.basename(RUTA)} no es de este bot (entradas o acciones distintas)`)
  if (pol.capas[0].w[0].length !== tipo.obs.length || pol.capas[pol.capas.length - 1].w.length !== tipo.acciones.length)
    throw new Error(`la política ${path.basename(RUTA)} no cuadra: sus capas no son de ${tipo.obs.length} entradas y ${tipo.acciones.length} acciones`)
  cache = { mtime, capas: pol.capas.map(c => ({ w: c.w, b: c.b })), tipo }
  return cache.capas
}

// La observación que quiere la política: 'obs' (25 valores de observacion.observar) u 'obs_sv' (47 de observacion.observarSv).
function observacion() {
  cargar()
  return cache.tipo.observacion
}

// obs (los valores de la observación que quiere la política) → { i: índice de la acción, habilidad, q: valores Q redondeados }
function decidir(obs) {
  const capas = cargar(), { observacion: tipo, obs: nombres, acciones } = cache.tipo
  if (obs.length !== nombres.length)
    throw new Error(`la política ${path.basename(RUTA)} quiere ${tipo} (${nombres.length} entradas) y le han dado ${obs.length}`)
  let x = obs
  capas.forEach(({ w, b }, k) => {
    x = w.map((fila, j) => fila.reduce((s, v, i) => s + v * x[i], b[j]))
    if (k < capas.length - 1) x = x.map(v => Math.max(0, v))
  })
  const i = x.indexOf(Math.max(...x))
  return { i, habilidad: acciones[i], q: x.map(v => Math.round(v * 100) / 100) }
}

module.exports = { decidir, cargar, observacion, RUTA }
