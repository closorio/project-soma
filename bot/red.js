// La red que elige habilidades (F2-F3 y fase C: entrenamiento/politica_habilidades.json) dentro del bot, para el modo libre (F4):
// la misma inferencia que ejecutor.py (capas densas con ReLU salvo la última; la habilidad es la de mayor valor Q), sin numpy.
// Solo lee el archivo (lo vuelve a leer si cambia) y comprueba que sus entradas y acciones son las de observacion.js.
// IO_POLITICA=RUTA usa otra política (la de todos los personajes del proceso que no digan la suya: bot/decisores.js). F7.4: la política dice qué observación quiere (su lista `obs`): las 25 de NOMBRES
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

// F8.0a: una política por archivo (antes, una sola por proceso, la de IO_POLITICA), para que cada personaje decida con la suya
// (bot/decisores.js). Las funciones de módulo de abajo siguen siendo las de siempre, con la política por defecto (RUTA).
class Politica {
  constructor(ruta) { this.ruta = ruta; this.cache = { mtime: -1, capas: null, tipo: null } }

  cargar() {
    const mtime = fs.statSync(this.ruta).mtimeMs
    if (mtime === this.cache.mtime) return this.cache.capas
    const pol = JSON.parse(fs.readFileSync(this.ruta, 'utf8'))
    const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
    const tipo = TIPOS.find(t => igual(pol.obs, t.obs) && igual(pol.acciones, t.acciones))
    if (!tipo) throw new Error(`la política ${path.basename(this.ruta)} no es de este bot (entradas o acciones distintas)`)
    if (pol.capas[0].w[0].length !== tipo.obs.length || pol.capas[pol.capas.length - 1].w.length !== tipo.acciones.length)
      throw new Error(`la política ${path.basename(this.ruta)} no cuadra: sus capas no son de ${tipo.obs.length} entradas y ${tipo.acciones.length} acciones`)
    this.cache = { mtime, capas: pol.capas.map(c => ({ w: c.w, b: c.b })), tipo }
    return this.cache.capas
  }

  // La observación que quiere la política: 'obs' (25 valores de observacion.observar) u 'obs_sv' (47 de observacion.observarSv).
  observacion() {
    this.cargar()
    return this.cache.tipo.observacion
  }

  // obs (los valores de la observación que quiere la política) → { i: índice de la acción, habilidad, q: valores Q redondeados }
  decidir(obs) {
    const capas = this.cargar(), { observacion: tipo, obs: nombres, acciones } = this.cache.tipo
    if (obs.length !== nombres.length)
      throw new Error(`la política ${path.basename(this.ruta)} quiere ${tipo} (${nombres.length} entradas) y le han dado ${obs.length}`)
    let x = obs
    capas.forEach(({ w, b }, k) => {
      x = w.map((fila, j) => fila.reduce((s, v, i) => s + v * x[i], b[j]))
      if (k < capas.length - 1) x = x.map(v => Math.max(0, v))
    })
    const i = x.indexOf(Math.max(...x))
    return { i, habilidad: acciones[i], q: x.map(v => Math.round(v * 100) / 100) }
  }
}

const POLITICAS = new Map() // ruta absoluta → Politica (los personajes con la misma política comparten la caché)
function politica(ruta = RUTA) {
  const r = path.resolve(ruta)
  if (!POLITICAS.has(r)) POLITICAS.set(r, new Politica(r))
  return POLITICAS.get(r)
}

const cargar = () => politica().cargar()
const observacion = () => politica().observacion()
const decidir = (obs) => politica().decidir(obs)

module.exports = { decidir, cargar, observacion, RUTA, Politica, politica, TIPOS }
