// Parcelas y terreno (F6), solo lectura del mundo: dónde está el suelo, qué hay de líquido alrededor, a qué distancia quedan las
// zonas protegidas y los cofres, y elegir una parcela llana dentro del rectángulo de obras (obras.json) para construir.
const { Vec3 } = require('vec3')
const zonas = require('./zonas')
const cofres = require('./cofres')
const obras = require('./obras')
const { hayCamino } = require('./habilidades/comun')
const { goals } = require('mineflayer-pathfinder')

const LIQUIDO = /^(water|lava|bubble_column)$/
const CAE = /sand$|gravel$|concrete_powder$|^anvil/ // bloques que caen: no picar debajo de ellos
// Suelo natural sobre el que se puede construir: nada hecho por el usuario (caminos de tierra, losas, cristal, tablones…).
const NATURAL = /^(grass_block|dirt|coarse_dirt|rooted_dirt|podzol|mycelium|mud|clay|stone|deepslate|andesite|diorite|granite|tuff|sand|red_sand|gravel|sandstone|red_sandstone|moss_block|snow_block|packed_ice|terracotta)$/
// ¿Se puede ocupar (poner un bloque, pisar) esta casilla? Aire, hierba corta, flores…: sin caja de colisión y sin líquido.
const libre = (b) => !!b && b.boundingBox === 'empty' && !LIQUIDO.test(b.name) && !(b.getProperties && b.getProperties().waterlogged === true)
const solido = (b) => !!b && b.boundingBox === 'block'
const esLiquido = (b) => !!b && (LIQUIDO.test(b.name) || (b.getProperties && b.getProperties().waterlogged === true))

// El suelo en la columna (x, z) cerca de yRef: el bloque sólido más alto con dos casillas libres encima, mirando desde yRef+8
// hacia abajo hasta yRef−8. Devuelve { y, bloque } (y = la altura del bloque sólido; se pisa en y+1) o null si el trozo de mundo
// no está cargado o el suelo es agua, lava, hojas o tronco (no vale para construir ni para pisar al explorar).
function superficie(bot, x, z, yRef, arriba = 8, abajo = 8, natural = false) {
  const y0 = Math.floor(yRef)
  if (!bot.world.getColumn(x >> 4, z >> 4)) return null
  for (let y = y0 + arriba; y >= y0 - abajo; y--) {
    const b = bot.blockAt(new Vec3(x, y, z))
    if (!b) return null
    if (libre(b)) continue
    if (esLiquido(b) || /_leaves$|_log$/.test(b.name)) return null
    if (!solido(b)) return null // escaleras, vallas, cultivos…: no es suelo llano
    if (natural && !NATURAL.test(b.name)) return null // caminos de tierra, losas, bloques puestos por alguien: no se construye encima
    const a1 = bot.blockAt(new Vec3(x, y + 1, z)), a2 = bot.blockAt(new Vec3(x, y + 2, z))
    return libre(a1) && libre(a2) ? { y, bloque: b.name } : null
  }
  return null
}

// F8.0b (E0, explorar): dónde se puede estar de pie en la columna (x, z): un bloque sólido (no hojas ni tronco) con dos casillas
// libres encima, sin líquido. A diferencia de superficie, no se queda con el primer bloque que encuentra desde arriba: mira toda la
// columna de yRef+arriba a yRef−abajo, atravesando copas, techos de roca y desniveles, y se queda con la casilla más cercana a yRef
// (en una cueva, la del nivel del bot; en un monte, la ladera). Devuelve { y, bloque } (se pisa en y+1) o null.
function pisable(bot, x, z, yRef, arriba = 24, abajo = 24) {
  const y0 = Math.floor(yRef)
  if (!bot.world.getColumn(x >> 4, z >> 4)) return null
  let mejor = null
  for (let y = y0 + arriba; y >= y0 - abajo; y--) {
    if (mejor && Math.abs(y - y0) >= Math.abs(mejor.y - y0)) { if (y < y0) break; continue }
    const b = bot.blockAt(new Vec3(x, y, z))
    if (!solido(b) || esLiquido(b) || /_leaves$|_log$/.test(b.name)) continue
    if (libre(bot.blockAt(new Vec3(x, y + 1, z))) && libre(bot.blockAt(new Vec3(x, y + 2, z)))) mejor = { y, bloque: b.name }
  }
  return mejor
}

// Vecinos (6 caras) con agua o lava, por nombre: minar no rompe un bloque que los tenga (inundación, lava).
function vecinosLiquidos(bot, pos) {
  const r = []
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const b = bot.blockAt(pos.offset(dx, dy, dz))
    if (esLiquido(b)) r.push(b.name)
  }
  return r
}
const caeEncima = (bot, pos) => { const b = bot.blockAt(pos.offset(0, 1, 0)); return !!b && CAE.test(b.name) }

// Distancia en horizontal de (x, z) a un rectángulo.
const distRect = (x, z, r) => Math.hypot(Math.max(Math.min(r.x1, r.x2) - x, 0, x - Math.max(r.x1, r.x2)), Math.max(Math.min(r.z1, r.z2) - z, 0, z - Math.max(r.z1, r.z2)))
// ¿Queda (x, z) a ≥ margen bloques de todas las zonas protegidas (de cualquier modo) y de todos los cofres?
function lejosDeProtegido(x, z, margen = 10) {
  if (zonas.leer().zonas.some(zn => distRect(x, z, zn) < margen)) return false
  if (zonas.leer().arboles.some(a => Math.hypot(a.x - x, a.z - z) < margen)) return false
  return !cofres.lista().some(c => c.bloques.some(([cx, , cz]) => Math.hypot(cx - x, cz - z) < margen))
}

// Evalúa una parcela de ancho×largo con la esquina noroeste en (x0, z0): todas las columnas de la huella y de un anillo de 1
// alrededor con suelo (superficie), sin troncos ni hojas por encima (hasta alto+1), desnivel ≤ desnivelMax, dentro del
// rectángulo de obras y lejos de lo protegido. Devuelve { x0, z0, y, desnivel, relleno: [[x, y, z], …], pie: [x, y, z] } o
// { mal: causa }. y = la altura del suelo más alto (a esa cota se nivela, solo rellenando: nunca cavando).
function evaluar(bot, x0, z0, [ancho, alto, largo], { margen = 10, desnivelMax = 1, yRef = null, mov = null, camino = true } = {}) {
  const esquinas = [[x0, z0], [x0 + ancho - 1, z0], [x0, z0 + largo - 1], [x0 + ancho - 1, z0 + largo - 1]]
  if (require('./mundo').nombre === 'usuario' && !esquinas.every(([x, z]) => obras.enPermitido(x, z))) return { mal: 'fuera del rectángulo de obras' } // F8.1: solo en el del usuario
  if (!esquinas.every(([x, z]) => lejosDeProtegido(x, z, margen))) return { mal: `a menos de ${margen} de una zona protegida o un cofre` }
  const y0 = yRef ?? bot.entity.position.y
  const suelos = new Map()
  for (let x = x0 - 1; x <= x0 + ancho; x++) {
    for (let z = z0 - 1; z <= z0 + largo; z++) {
      const s = superficie(bot, x, z, y0, 8, 8, true)
      if (!s) return { mal: `sin suelo natural y llano en ${x},${z}` }
      suelos.set(`${x},${z}`, s.y)
    }
  }
  const ys = [...suelos.values()], y = Math.max(...ys), desnivel = y - Math.min(...ys)
  if (desnivel > desnivelMax) return { mal: `desnivel ${desnivel}` }
  const relleno = []
  for (let x = x0; x < x0 + ancho; x++) {
    for (let z = z0; z < z0 + largo; z++) {
      for (let yy = y + 1; yy <= y + alto + 1; yy++) { // nada por encima de la huella: ni ramas ni hojas ni otra obra
        const b = bot.blockAt(new Vec3(x, yy, z))
        if (!libre(b)) return { mal: `ocupado en ${x},${yy},${z} (${b ? b.name : '?'})` }
      }
      for (let yy = suelos.get(`${x},${z}`) + 1; yy <= y; yy++) relleno.push([x, yy, z])
    }
  }
  const pie = [x0 - 1, y + 1, z0 - 1]
  if (camino && !conCamino(bot, pie, mov)) return { mal: 'sin camino hasta la parcela' }
  return { x0, z0, y, desnivel, relleno, pie }
}
// ¿Hay camino a pie hasta el pie de la parcela? El cálculo es síncrono (bloquea a todos los personajes del proceso): corto.
const conCamino = (bot, pie, mov) => hayCamino(bot, new goals.GoalNear(pie[0], pie[1], pie[2], 1), 150, mov)
const respirar = () => new Promise(resolve => setImmediate(resolve))

// La parcela más llana y cercana (hasta `radio` bloques, orígenes de 2 en 2) para un plano de dim [ancho, alto, largo]. Primero
// se juzgan todas sin el camino (barato) y solo a las mejores se les busca camino, cediendo el paso entre una y otra para no
// dejar colgados a los demás personajes del proceso (el navegador calcula en síncrono).
async function elegirParcela(bot, dim, { radio = 24, margen = 10, desnivelMax = 1, mov = null, candidatas = 6 } = {}) {
  const p = bot.entity.position.floored()
  const origenes = []
  for (let dx = -radio; dx <= radio; dx += 2) for (let dz = -radio; dz <= radio; dz += 2) origenes.push([p.x + dx, p.z + dz, Math.hypot(dx, dz)])
  origenes.sort((a, b) => a[2] - b[2])
  const causas = {}, buenas = []
  let n = 0
  for (const [x0, z0, d] of origenes) {
    if (++n % 40 === 0) await respirar()
    const e = evaluar(bot, x0, z0, dim, { margen, desnivelMax, yRef: p.y, mov, camino: false })
    if (e.mal) { const k = e.mal.split(' en ')[0]; causas[k] = (causas[k] || 0) + 1; continue }
    buenas.push({ ...e, distancia: Math.round(d), puntos: e.desnivel * 10 + d })
    if (e.desnivel === 0 && d > 8 && buenas.length >= candidatas) break // varias llanas y cerca: basta
  }
  buenas.sort((a, b) => a.puntos - b.puntos)
  for (const e of buenas.slice(0, candidatas)) {
    await respirar()
    if (conCamino(bot, e.pie, mov)) return { ...e, descartes: causas }
    causas['sin camino hasta la parcela'] = (causas['sin camino hasta la parcela'] || 0) + 1
  }
  return { mal: Object.entries(causas).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(', ') || 'sin candidatas' }
}

// F8.0b: nadando, la superficie del agua en (x, z) cerca de yRef (agua con aire encima) también vale de destino de un tramo.
function superficieAgua(bot, x, z, yRef, margen = 6) {
  const y0 = Math.floor(yRef)
  if (!bot.world.getColumn(x >> 4, z >> 4)) return null
  for (let y = y0 + margen; y >= y0 - margen; y--) {
    const b = bot.blockAt(new Vec3(x, y, z)), a = bot.blockAt(new Vec3(x, y + 1, z))
    if (b && b.name === 'water' && libre(a)) return { y, bloque: 'water' }
  }
  return null
}

module.exports = { superficieAgua, pisable, superficie, vecinosLiquidos, caeEncima, lejosDeProtegido, distRect, evaluar, elegirParcela, libre, solido, esLiquido, LIQUIDO, CAE }
