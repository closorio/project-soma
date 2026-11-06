// Dónde buscar árboles cuando no se ve ninguno a tiro (hallazgo a mano del 2026-11-05: los bots se rendían si el árbol quedaba a más
// de 48 bloques). Solo decide, sin mundo ni bot, para probarla en seco (bot/probar_tala_seco.js); la ejecuta talarN (bot/io.js).
// Con zonas de trabajo solo se puede talar en ellas: se recorren por puntos, y explorar al azar no ayudaría. Sin zonas: explorar.
const PASO = 48 // lo que alcanza a ver el bot: con puntos a esta distancia no queda nada de la zona sin mirar
const TOPE_MS = 180000
const MAX_EXPLORAR = 4

const eje = (a, b) => {
  const lo = Math.min(a, b), hi = Math.max(a, b)
  const n = Math.max(1, Math.ceil((hi - lo) / PASO))
  return Array.from({ length: n }, (_, i) => Math.round(lo + (hi - lo) * (i + 0.5) / n))
}
const puntosDeZona = (zn) => eje(zn.x1, zn.x2).flatMap(x => eje(zn.z1, zn.z2).map(z => ({ x, z })))

// Del punto más cercano al siguiente más cercano, para no ir y volver
function ordenar(puntos, desde) {
  const quedan = [...puntos], out = []
  let p = desde
  while (quedan.length) {
    let k = 0
    quedan.forEach((q, i) => { if (Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(quedan[k].x - p.x, quedan[k].z - p.z)) k = i })
    p = quedan.splice(k, 1)[0]
    out.push(p)
  }
  return out
}

// trabajo: las zonas de trabajo; pos: { x, z } del bot; puntoFuera(x, z): la casilla libre si el punto cae en una zona vedada
function crearBusqueda({ trabajo = [], pos, puntoFuera = (x, z) => ({ x, z }) }) {
  const vistos = new Set(), puntos = []
  for (const zn of trabajo) {
    for (const p of puntosDeZona(zn)) {
      const f = puntoFuera(p.x, p.z), clave = f.x + ',' + f.z
      if (!vistos.has(clave)) { vistos.add(clave); puntos.push({ x: f.x, z: f.z }) }
    }
  }
  return { puntos: trabajo.length ? ordenar(puntos, pos) : null, nombres: trabajo.map(zn => zn.nombre), i: 0, exploraciones: 0 }
}

// El siguiente paso: { ir: { x, z } } | { explorar: true } | { fin: causa }. Avanza la búsqueda.
function siguiente(b, msBuscando = 0) {
  if (msBuscando >= TOPE_MS) return { fin: `llevo ${Math.round(TOPE_MS / 60000)} minutos buscando árboles sin encontrar` }
  if (b.puntos) return b.i < b.puntos.length ? { ir: b.puntos[b.i++] } : { fin: `no veo árboles en las zonas de trabajo (${b.nombres.join(', ')})` }
  if (b.exploraciones < MAX_EXPLORAR) { b.exploraciones++; return { explorar: true } }
  return { fin: `exploré ${MAX_EXPLORAR} veces y no vi árboles` }
}

module.exports = { crearBusqueda, siguiente, puntosDeZona, PASO, TOPE_MS, MAX_EXPLORAR }
