// Registro de F4 (modo libre / modo órdenes), para comparar los dos modos:
//  · el diario del mundo (bot/mundo.js; mente/diario.md en el del usuario): una línea por orden (modo, orden, quién la dio y por
//    dónde, resultado, tiempo, pasos y qué hace al terminar) y una por tramo de modo libre (hasta 5 min: troncos ganados y todas sus
//    decisiones en secuencia, como el ejecutor), bajo una cabecera por sesión del bot.
//  · entrenamiento/ejecuciones/modos-AAAAMMDD.jsonl (modos-supervivencia-AAAAMMDD.jsonl en el otro mundo): cada decisión de la red
//    (observación y valores Q), cada paso de una orden y cada orden, con su modo.
const fs = require('fs')
const path = require('path')

const mundo = require('./mundo')
const DIARIO = mundo.diario
const DIR = path.join(__dirname, '..', 'entrenamiento', 'ejecuciones')
const fecha = () => new Date().toLocaleString('sv-SE').slice(0, 16) // 2026-10-14 18:05
const hora = () => new Date().toLocaleTimeString('sv-SE') // 18:05:12
const sesion = { nombres: [], cabecera: false }

const CORTO = { ir_a_arbol: 'árbol', picar_tronco: 'picar', recoger: 'recoger', ir_a_jugador: 'jugador', huir: 'huir',
  ir_a_otro_arbol: 'otro árbol', depositar: 'cofre', explorar: 'explorar', minar: 'minar', construir: 'construir', deshacer: 'deshacer' }
// Decisiones seguidas iguales agrupadas: «árbol✓ picar✓×3 recoger✗(no llegó) …» (como secuencia() de ejecutor.py)
function secuencia(decisiones) {
  const toks = []
  for (const d of decisiones) {
    let t = (CORTO[d.habilidad] || d.habilidad) + (d.exito ? '✓' : `✗(${String(d.causa).split(':')[0]})`)
    if (d.cofre) t += '+cofre' + (d.cofre.exito ? '✓' : '✗')
    if (toks.length && toks[toks.length - 1][0] === t) toks[toks.length - 1][1]++
    else toks.push([t, 1])
  }
  return toks.map(([t, n]) => t + (n > 1 ? '×' + n : '')).join(' ')
}

function escribir(ruta, texto, ev = console.log) {
  try { fs.appendFileSync(ruta, texto) } catch (e) { ev('[registro] no pude escribir en ' + path.basename(ruta) + ': ' + e.message) }
}
function diario(linea, ev) {
  if (!sesion.cabecera) {
    sesion.cabecera = true
    escribir(DIARIO, `## Modos libre y órdenes (F4) · sesión del bot ${fecha()} · ${sesion.nombres.join(', ')}\n`, ev)
  }
  escribir(DIARIO, `- ${linea}\n`, ev)
}
function jsonl(obj, ev) {
  const dia = new Date().toLocaleDateString('sv-SE').replace(/-/g, '')
  escribir(path.join(DIR, `modos${mundo.sufijo}-${dia}.jsonl`), JSON.stringify({ t: new Date().toISOString(), ...obj }) + '\n', ev)
}

module.exports = { diario, jsonl, secuencia, hora, fecha, sesion, DIARIO }
