// Zonas de obras temporales con carteles (2026-11-02, pedido del usuario): dos carteles con «[obras]» en una línea y un nombre en la
// siguiente, en esquinas opuestas, marcan un rectángulo donde se puede construir. Son un complemento temporal de obras.json (las zonas
// de !zona no cambian): «lee los carteles» enseña lo que hay a ≤ 64 bloques, «acepta los carteles» las guarda (obras.json: temporales)
// y valen mientras sus dos carteles sigan en pie (vigentes() las quita si falta uno); «olvida los carteles» las borra todas.
// Sin nombre debajo de «[obras]», la zona se llama «obras». Un nombre con un solo cartel, o con más de dos, no forma zona (sueltos).
const obras = require('./obras')

const MARCA = /^\[\s*obras?\s*\]$/i
const nombreDe = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '_')

// El texto de un cartel (las dos caras) → el nombre de su zona, o null si no es de obras
function marca(texto) {
  const lineas = String(texto || '').split('\n').map(l => l.trim())
  const i = lineas.findIndex(l => MARCA.test(l))
  if (i < 0) return null
  const siguiente = lineas.slice(i + 1).find(l => l && !MARCA.test(l))
  return siguiente ? nombreDe(siguiente) : 'obras'
}

// Puro: [{ nombre, pos: [x, y, z] }] → { zonas: [{ nombre, x1, z1, x2, z2, carteles }], sueltos: [{ nombre, n }] }
function emparejar(marcas) {
  const grupos = new Map()
  for (const m of marcas) { if (!grupos.has(m.nombre)) grupos.set(m.nombre, []); grupos.get(m.nombre).push(m.pos) }
  const zonas = [], sueltos = []
  for (const [nombre, ps] of grupos) {
    if (ps.length !== 2) { sueltos.push({ nombre, n: ps.length }); continue }
    const [a, b] = ps
    zonas.push({ nombre, x1: Math.min(a[0], b[0]), z1: Math.min(a[2], b[2]), x2: Math.max(a[0], b[0]), z2: Math.max(a[2], b[2]), carteles: [a, b] })
  }
  return { zonas, sueltos }
}

const textoDe = (b) => { try { const t = b.getSignText(); return (Array.isArray(t) ? t : [t]).join('\n') } catch (_) { return '' } }
const esCartel = (b) => !!b && /_sign$/.test(b.name)

// Los carteles de obras a ≤ radio bloques del bot (los de los trozos de mundo cargados)
function leer(bot, radio = 64) {
  const marcas = []
  for (const p of bot.findBlocks({ matching: (b) => /_sign$/.test(b.name), maxDistance: radio, count: 256 })) {
    const nombre = marca(textoDe(bot.blockAt(p)))
    if (nombre) marcas.push({ nombre, pos: [p.x, p.y, p.z] })
  }
  return emparejar(marcas)
}

// Quita las zonas aceptadas a las que les falta un cartel (solo se mira donde el mundo está cargado: lo lejano se da por bueno).
// Devuelve los nombres quitados.
function vigentes(bot) {
  const { Vec3 } = require('vec3')
  const quitadas = []
  const siguen = obras.temporales().filter(z => {
    const bien = z.carteles.every(c => {
      const b = bot.blockAt(new Vec3(...c))
      return b === null || (esCartel(b) && marca(textoDe(b)) === z.nombre)
    })
    if (!bien) quitadas.push(z.nombre)
    return bien
  })
  if (quitadas.length) obras.ponerTemporales(siguen)
  return quitadas
}

const describir = (z) => `${z.nombre} (de ${z.x1} ${z.z1} a ${z.x2} ${z.z2})`

module.exports = { marca, emparejar, leer, vigentes, describir }
