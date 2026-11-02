// orientar (catálogo de estructuras, 2026-11-02): cómo poner un bloque para que quede en el estado de la plantilla. Función pura,
// sin bot (la prueba bot/probar_orientar_seco.js): dado el estado ("oak_stairs[facing=north,half=top]"), la casilla y qué vecinos
// son sólidos, devuelve los apoyos por preferencia (bloque en el que hacer clic, su cara y el punto de la cara), hacia dónde mirar
// (yaw y pitch de mineflayer: north = 0, west = π/2, south = π, east = -π/2) y si hacen falta dos clics (losa doble) o abrirlo después
// (trampilla abierta). Reglas del juego (1.21): escaleras, puertas, camas y puertas de valla miran hacia donde mira el jugador; cofres,
// hornos, repetidores y casi todo lo demás con facing, hacia el jugador; lo de pared (antorchas, carteles, escaleras de mano, botones)
// sale de la cara en la que se hace clic; la mitad (half/type) la decide la altura del clic en la cara; el eje (axis), la cara.
const { parse, mismoMaterial } = require('../estructuras')

const YAW = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2 }
const VEC = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] }
const OPUESTA = { north: 'south', south: 'north', west: 'east', east: 'west', up: 'down', down: 'up' }
const ANTIHORARIA = { north: 'west', west: 'south', south: 'east', east: 'north' }
// de dónde apoyarse, como CARAS de construir.js: abajo, sur, norte, este, oeste, arriba (vector de la casilla al apoyo)
const CARAS = [[0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0]]
const LADOS = CARAS.slice(1, 5)
// Las props que se comprueban tras colocar (la rotación de carteles y estandartes de suelo no: se pone con el yaw que haya)
const CLAVE = ['facing', 'half', 'type', 'axis', 'hinge', 'part', 'face', 'hanging', 'open']

// el jugador mira hacia `facing`
const MIRAN_IGUAL = /_stairs$|_door$|_bed$|_fence_gate$|^observer$/
const DE_PARED = /(^|_)wall_(torch|sign|banner|head|skull|fan)$|_wall_(torch|sign|banner|head|skull|fan)$|^ladder$|^tripwire_hook$/
const DE_TECHO = /_hanging_sign$|^spore_blossom$|^hanging_roots$/

// Un apoyo: el vecino en la dirección `v` (desde la casilla), su cara que mira a la casilla y el punto del clic en esa cara (0-1 en
// coordenadas del bloque de apoyo); `y` cambia la altura del clic en una cara lateral (0.25 = mitad baja, 0.75 = mitad alta).
function apoyo(dest, v, y) {
  const cara = [-v[0], -v[1], -v[2]]
  const delta = [0.5 + cara[0] * 0.5, 0.5 + cara[1] * 0.5, 0.5 + cara[2] * 0.5]
  if (y !== undefined && cara[1] === 0) delta[1] = y
  return { ref: [dest[0] + v[0], dest[1] + v[1], dest[2] + v[2]], cara, delta }
}
const abajo = (dest) => apoyo(dest, [0, -1, 0]), arriba = (dest) => apoyo(dest, [0, 1, 0])
const detras = (dest, facing) => { const f = VEC[facing]; return f ? apoyo(dest, [-f[0], -f[1], -f[2]]) : null } // clic en la cara que mira hacia facing

function orientar(estado, dest, solido) {
  const { nombre, props } = parse(estado)
  const r = { apoyos: [], yaw: null, pitch: 0, clics: 1, abrir: false }
  const f = props.facing
  let cands
  if (/_stairs$/.test(nombre)) {
    const alta = props.half === 'top'
    cands = [alta ? arriba(dest) : abajo(dest), ...LADOS.map(v => apoyo(dest, v, alta ? 0.75 : 0.25))]
  } else if (/_slab$/.test(nombre)) {
    const alta = props.type === 'top'
    cands = [alta ? arriba(dest) : abajo(dest), ...LADOS.map(v => apoyo(dest, v, alta ? 0.75 : 0.25))]
    if (props.type === 'double') r.clics = 2 // la segunda: clic en la cara de arriba de la losa recién puesta (construir.js)
  } else if (/_door$/.test(nombre)) {
    // solo la mitad baja, desde el bloque de abajo; la bisagra la decide el punto del clic (DoorBlock.getHinge, si los vecinos no mandan)
    const [j, , k] = VEC[f] || [0, 0, 0], derecha = props.hinge === 'right', a = abajo(dest)
    const lado = derecha ? 0.25 : 0.75
    if (j < 0) a.delta[2] = lado; else if (j > 0) a.delta[2] = 1 - lado
    else if (k < 0) a.delta[0] = 1 - lado; else if (k > 0) a.delta[0] = lado
    cands = [a]
  } else if (/_trapdoor$/.test(nombre)) {
    // clic en una cara lateral: facing = esa cara y la mitad por la altura; arriba/abajo: facing contrario al jugador
    const alta = props.half === 'top', d = detras(dest, f)
    if (d) d.delta[1] = alta ? 0.75 : 0.25
    cands = [d, alta ? arriba(dest) : abajo(dest)].filter(Boolean)
    if (VEC[f]) r.yaw = YAW[OPUESTA[f]]
    r.abrir = props.open === 'true'
  } else if (DE_PARED.test(nombre) || ((/_button$/.test(nombre) || nombre === 'lever') && props.face === 'wall')) {
    cands = [detras(dest, f)].filter(Boolean)
  } else if (/_button$/.test(nombre) || nombre === 'lever') {
    cands = [props.face === 'ceiling' ? arriba(dest) : abajo(dest)]
    if (YAW[f] !== undefined) r.yaw = YAW[f]
  } else if (DE_TECHO.test(nombre) || (/lantern$/.test(nombre) && props.hanging === 'true')) {
    cands = [arriba(dest)]
  } else if (nombre === 'hopper') {
    cands = [apoyo(dest, VEC[f] || [0, -1, 0])] // la tolva apunta al bloque en el que se hace clic
  } else if (props.axis) {
    // tronco, pilar, cadena…: el eje es el de la cara del clic
    const ejes = { y: [[0, -1, 0], [0, 1, 0]], x: [[-1, 0, 0], [1, 0, 0]], z: [[0, 0, -1], [0, 0, 1]] }[props.axis] || CARAS
    cands = ejes.map(v => apoyo(dest, v))
  } else if (/_bed$/.test(nombre) || /^(?:.*_)?(carpet|pressure_plate|torch|sign|banner|rail|sapling|tulip)$/.test(nombre) || props.rotation !== undefined) {
    cands = [abajo(dest)]
  } else {
    cands = CARAS.map(v => apoyo(dest, v))
  }
  // hacia dónde mirar: el yaw de lo que tiene facing horizontal (y el pitch del vertical: pistones, observadores, dispensadores)
  if (r.yaw === null && f && !/_trapdoor$|_button$|^lever$|^hopper$/.test(nombre) && !DE_PARED.test(nombre)) {
    const mira = MIRAN_IGUAL.test(nombre) ? f : /anvil$/.test(nombre) ? ANTIHORARIA[f] : OPUESTA[f]
    if (YAW[mira] !== undefined) r.yaw = YAW[mira]
    else if (mira === 'down' || mira === 'up') r.pitch = mira === 'down' ? -Math.PI / 2 : Math.PI / 2
  }
  r.apoyos = cands.filter(a => solido(...a.ref))
  return r
}

// ¿El bloque puesto es el de la plantilla? Mismo nombre (o la misma pieza en otra madera) y mismas props clave (las que la plantilla trae). `real`: { nombre, props }
function coincide(esperado, real) {
  const e = parse(esperado)
  if (!real || !mismoMaterial(real.nombre, e.nombre)) return false // la madera da igual (estructuras.familia)
  return CLAVE.every(k => e.props[k] === undefined || String(real.props[k]) === e.props[k])
}

module.exports = { orientar, coincide, YAW, CLAVE }
