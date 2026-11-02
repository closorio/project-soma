// Libro de obras (F6): lo que los personajes construyen (habilidad construir) y minan (habilidad minar), para poder deshacerlo
// (habilidad deshacer, o reponerlo por RCON en las pruebas) y para que la mente lo vea. Se guarda en obras.json de los datos del
// mundo (bot/mundo.js: ../obras.json en el del usuario):
//   { permitido: { x1, z1, x2, z2 } | null,   ← rectángulo de obras acordado con el usuario; sin él, construir y minar se niegan
//     obras: [{ id, nombre, plano, personaje, materia, origen: [x, y, z], inicio, fin, estado, bloques: [[x, y, z, tipo], …],
//              andamio: [[x, y, z, tipo], …], mal_orientado: [[x, y, z, estado], …] }],   ← andamio y mal_orientado: catálogo (2026-11-02)
//     minados: [{ t, personaje, x, y, z, tipo, herramienta }],
//     temporales: [{ nombre, x1, z1, x2, z2, carteles: [[x, y, z], [x, y, z]], desde }] }   ← zonas de obras de carteles (carteles.js)
// Se relee solo cuando el archivo cambia (como cofres.js y zonas.js); cada bloque puesto se escribe en el acto, no al final.
const fs = require('fs')

const RUTA = require('./mundo').obras
const VACIO = () => ({ permitido: null, temporales: [], obras: [], minados: [] })
const MAX_MINADOS = 2000
let cache = { mtime: -1, datos: VACIO() }
const fecha = () => new Date().toLocaleString('sv-SE').slice(0, 19)

function leer() {
  try {
    const st = fs.statSync(RUTA)
    if (st.mtimeMs !== cache.mtime) cache = { mtime: st.mtimeMs, datos: Object.assign(VACIO(), JSON.parse(fs.readFileSync(RUTA, 'utf8'))) }
  } catch (_) { cache = { mtime: -1, datos: VACIO() } }
  return cache.datos
}
function guardar(d) {
  fs.writeFileSync(RUTA, JSON.stringify(d, null, 1) + '\n')
  cache = { mtime: fs.statSync(RUTA).mtimeMs, datos: d }
}

const permitido = () => leer().permitido || null
// ¿Cae (x, z) dentro del rectángulo de obras? Sin rectángulo, nada está permitido.
function enPermitido(x, z) {
  const p = permitido()
  return !!p && x >= Math.min(p.x1, p.x2) && x <= Math.max(p.x1, p.x2) && z >= Math.min(p.z1, p.z2) && z <= Math.max(p.z1, p.z2)
}

// Zonas de obras temporales (2026-11-02): las de dos carteles «[obras] NOMBRE», aceptadas por el dueño (carteles.js). Solo para construir.
const temporales = () => leer().temporales || []
function ponerTemporales(lista) { const d = leer(); d.temporales = lista; guardar(d) }
const dentroDe = (r, x, z) => x >= Math.min(r.x1, r.x2) && x <= Math.max(r.x1, r.x2) && z >= Math.min(r.z1, r.z2) && z <= Math.max(r.z1, r.z2)
// ¿Se puede construir con estas esquinas [[x, z]…]? null si sí; si no, la causa. Con zonas de carteles, solo entera dentro de una de
// ellas (o del rectángulo de obras, en el mundo del usuario); sin ellas, como siempre: reglas libres o el rectángulo de obras.
function obraPermitida(esquinas, reglasLibres) {
  const t = temporales()
  const enRect = !reglasLibres && !!permitido() && esquinas.every(([x, z]) => enPermitido(x, z))
  if (t.length) {
    if (t.some(r => esquinas.every(([x, z]) => dentroDe(r, x, z))) || enRect) return null
    return `fuera de las zonas de obras de los carteles (${t.map(r => r.nombre).join(', ')})`
  }
  return reglasLibres || enRect ? null : 'fuera del rectángulo de obras'
}

function nueva(personaje, nombre, plano, origen, materia) {
  const d = leer()
  const id = `${nombre}-${Date.now().toString(36)}`
  d.obras.push({ id, nombre, plano, personaje, materia, origen, inicio: fecha(), fin: null, estado: 'en curso', bloques: [] })
  guardar(d)
  return id
}
const buscarId = (d, id) => d.obras.find(o => o.id === id)
function anotarPuesto(id, bloque) { const d = leer(), o = buscarId(d, id); if (o) { o.bloques.push(bloque); guardar(d) } }
function quitarPuesto(id, [x, y, z]) {
  const d = leer(), o = buscarId(d, id)
  if (!o) return
  o.bloques = o.bloques.filter(b => !(b[0] === x && b[1] === y && b[2] === z))
  guardar(d)
}
// Catálogo (2026-11-02): el andamio (se quita al acabar o con deshacer) y los bloques que quedaron con otra orientación
function anotarEn(id, campo, bloque) { const d = leer(), o = buscarId(d, id); if (o) { (o[campo] = o[campo] || []).push(bloque); guardar(d) } }
const anotarAndamio = (id, bloque) => anotarEn(id, 'andamio', bloque)
const anotarMal = (id, bloque) => anotarEn(id, 'mal_orientado', bloque)
function quitarAndamio(id, [x, y, z]) {
  const d = leer(), o = buscarId(d, id)
  if (!o || !o.andamio) return
  o.andamio = o.andamio.filter(b => !(b[0] === x && b[1] === y && b[2] === z))
  guardar(d)
}
function reabrir(id) { const d = leer(), o = buscarId(d, id); if (o) { o.estado = 'en curso'; o.fin = null; guardar(d) } } // «continúa»
function cerrar(id, estado) { const d = leer(), o = buscarId(d, id); if (o) { o.estado = estado; o.fin = fecha(); guardar(d) } }
function anotarMinado(personaje, [x, y, z], tipo, herramienta) {
  const d = leer()
  d.minados.push({ t: fecha(), personaje, x, y, z, tipo, herramienta: herramienta || null })
  if (d.minados.length > MAX_MINADOS) d.minados.splice(0, d.minados.length - MAX_MINADOS)
  guardar(d)
}
// Una obra por nombre o id: la más reciente que no esté deshecha.
// la última con ese nombre o id; «cabana» también vale para cabana_techada, cabana_grande… (2026-11-01)
const obra = (nombre) => [...leer().obras].reverse().find(o => (o.nombre === nombre || o.id === nombre || String(o.nombre).startsWith(nombre + '_')) && o.estado !== 'deshecha') || null
const enCurso = () => leer().obras.find(o => o.estado === 'en curso') || null
const lista = () => leer().obras.map(o => ({ id: o.id, nombre: o.nombre, plano: o.plano, estado: o.estado, bloques: o.bloques.length, origen: o.origen }))
// ¿Es este bloque de una obra en pie? (minar no lo rompe: para eso está deshacer)
const esDeObra = (x, y, z) => leer().obras.some(o => o.estado !== 'deshecha' && [...o.bloques, ...(o.andamio || [])].some(b => b[0] === x && b[1] === y && b[2] === z))

module.exports = { leer, guardar, permitido, enPermitido, temporales, ponerTemporales, obraPermitida, nueva, anotarPuesto, quitarPuesto, anotarAndamio, quitarAndamio, anotarMal, reabrir, cerrar, anotarMinado, obra, enCurso, lista, esDeObra, RUTA }
