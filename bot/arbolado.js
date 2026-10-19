// Foto del arbolado para las medidas (orden «arbolado» de io.js; entrenamiento/medir_ejecutor.py la toma antes y después de cada
// episodio): los troncos de un rectángulo y una huella de cada zona protegida (../zonas.json). Así se ve si algo rompió troncos
// sin que lo decidiera picar (p. ej. el navegador al abrirse paso) y si algo cambió dentro de las zonas.
//   { rect, y, troncos: {"x,y,z": nombre}, sinCargar: ["cx,cz"], zonas: {NOMBRE: {troncos, sinCargar, huella, columnas: {"x,z": c}}} }
// Cada columna va como el nombre de sus bloques de abajo arriba, por tramos («sand*3,water*2,lily_pad»; sin el aire de arriba), así
// se ve qué cambió y no solo que cambió (lo natural, como la hierba que se extiende o las cañas que crecen, también cuenta). Va por
// el nombre, no por el estado: hojas o agua que solo cambian de estado no cuentan.
// Solo ve los trozos de mundo que el personaje tiene cargados (los demás van en sinCargar y no se comparan).
const crypto = require('crypto')
const zonas = require('./zonas')

const Y0 = 50, Y1 = 130 // alturas que se miran: el arbolado y el GRANARBOL caben
const RECT = [239, -32, 367, 96] // por defecto, el arbolado de pruebas: (303, 32) ± 64

module.exports = function arbolado(bot, x1 = RECT[0], z1 = RECT[1], x2 = RECT[2], z2 = RECT[3]) {
  const reg = bot.registry, w = bot.world, v = bot.entity.position.clone()
  const nombre = (s) => reg.blocksByStateId[s]?.name ?? '?'
  const tronco = new Set()
  for (const b of reg.blocksArray) if (b.name.endsWith('_log')) for (let s = b.minStateId; s <= b.maxStateId; s++) tronco.add(s)
  const cargada = (x, z) => !!w.getColumn(x >> 4, z >> 4)

  const troncos = {}, sinCargar = new Set()
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
    for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) {
      if (!cargada(x, z)) { sinCargar.add(`${x >> 4},${z >> 4}`); continue }
      for (let y = Y0; y <= Y1; y++) {
        const s = w.getBlockStateId(v.set(x, y, z))
        if (tronco.has(s)) troncos[`${x},${y},${z}`] = reg.blocksByStateId[s].name
      }
    }
  }

  const huellas = {}
  for (const zn of zonas.leer().zonas) {
    const columnas = {}, total = crypto.createHash('md5')
    let n = 0, sin = 0
    for (let x = zn.x1; x <= zn.x2; x++) {
      for (let z = zn.z1; z <= zn.z2; z++) {
        if (!cargada(x, z)) { sin++; continue }
        const tramos = []
        for (let y = Y0; y <= Y1; y++) {
          const s = w.getBlockStateId(v.set(x, y, z)), b = nombre(s), u = tramos[tramos.length - 1]
          if (tronco.has(s)) n++
          if (u && u[0] === b) u[1]++; else tramos.push([b, 1])
        }
        if (tramos.length > 1 && tramos[tramos.length - 1][0] === 'air') tramos.pop()
        const c = tramos.map(([b, k]) => (k > 1 ? `${b}*${k}` : b)).join(',')
        columnas[`${x},${z}`] = c
        total.update(c + ';')
      }
    }
    huellas[zn.nombre] = { troncos: n, sinCargar: sin, huella: total.digest('hex').slice(0, 12), columnas }
  }
  return { rect: [x1, z1, x2, z2], y: [Y0, Y1], troncos, sinCargar: [...sinCargar], zonas: huellas }
}
module.exports.RECT = RECT
