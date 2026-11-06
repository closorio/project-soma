// «Ármate» de hierro (pedido del usuario, 2026-11-05): armadura completa y espada, pico, hacha y azada, con los lingotes de los cofres
// cercanos. Si no hay para todo, no se gasta nada y se arma de piedra (el camino de siempre, en `case 'armate'` de io.js).
// faltan y cofresUtiles son puras (bot/probar_armarse_seco.js); juntarLingotes y devolver necesitan el mundo.
const ALCANCE_COFRES = 48, MAX_COFRES = 16
const LINGOTE = /^iron_ingot$/
const CONTENEDORES = new Set(['chest', 'trapped_chest', 'barrel'])
const EQUIPO = [
  { item: 'iron_helmet', nombre: 'casco', lingotes: 5, palos: 0 },
  { item: 'iron_chestplate', nombre: 'peto', lingotes: 8, palos: 0 },
  { item: 'iron_leggings', nombre: 'pantalón', lingotes: 7, palos: 0 },
  { item: 'iron_boots', nombre: 'botas', lingotes: 4, palos: 0 },
  { item: 'iron_sword', nombre: 'espada', lingotes: 2, palos: 1 },
  { item: 'iron_pickaxe', nombre: 'pico', lingotes: 3, palos: 2 },
  { item: 'iron_axe', nombre: 'hacha', lingotes: 3, palos: 2 },
  { item: 'iron_hoe', nombre: 'azada', lingotes: 2, palos: 2 },
]
const tipoDe = (item) => item.slice(item.indexOf('_') + 1)
// ¿Lleva esa pieza de hierro o mejor? nombres: los de los objetos que tiene, puestos o no
const tiene = (nombres, tipo) => ['iron', 'diamond', 'netherite'].some(m => nombres.includes(`${m}_${tipo}`))

function faltan(nombres) {
  const piezas = EQUIPO.filter(p => !tiene(nombres, tipoDe(p.item)))
  return { piezas, lingotes: piezas.reduce((a, p) => a + p.lingotes, 0), palos: piezas.reduce((a, p) => a + p.palos, 0) }
}

// Del más cercano al más lejano, sin los que sean de otro. No hace falta juntar los cofres dobles: se cuenta lo sacado de verdad.
const cofresUtiles = (posiciones, pos, ajeno = () => false) => posiciones.filter(p => !ajeno(p))
  .sort((a, b) => Math.hypot(a.x - pos.x, a.y - pos.y, a.z - pos.z) - Math.hypot(b.x - pos.x, b.y - pos.y, b.z - pos.z))
  .slice(0, MAX_COFRES)

// Los cofres dentro de una zona de otro jugador no se tocan
function esAjeno(p) {
  const zonas = require('./zonas'), yo = String(require('./plantel').yo() || '').toLowerCase()
  return zonas.leer().zonas.some(z => z.dueno && z.dueno.toLowerCase() !== yo
    && p.x >= Math.min(z.x1, z.x2) && p.x <= Math.max(z.x1, z.x2) && p.z >= Math.min(z.z1, z.z2) && p.z <= Math.max(z.z1, z.z2))
}

async function irAlCofre(bot, p, tarea) {
  const { goals } = require('mineflayer-pathfinder')
  const { moverHasta, prudentes } = require('./habilidades/comun')
  const centro = p.offset(0.5, 0.5, 0.5)
  const r = await moverHasta(bot, new goals.GoalNear(p.x, p.y, p.z, 2), () => bot.entity.position.offset(0, 1.62, 0).distanceTo(centro) <= 4,
    { ms: (15 + centro.distanceTo(bot.entity.position)) * 1000, tarea, mov: prudentes(bot, { pisarVedadas: true }) })
  return r === 'listo'
}

// Saca hasta n lingotes. Devuelve { sacado, de: [{ p, n }], cofres (los que pudo abrir) }. Otro bot puede ir a los mismos cofres: lo que
// cuenta es lo que entró de verdad.
async function juntarLingotes(bot, n, tarea) {
  const { sacarDe } = require('./habilidades/sacar_del_cofre')
  const { conCerrojo } = require('./habilidades/depositar')
  const posiciones = bot.findBlocks({ matching: (b) => CONTENEDORES.has(b.name), maxDistance: ALCANCE_COFRES, count: 64 })
  const de = []
  let sacado = 0, cofres = 0
  for (const p of cofresUtiles(posiciones, bot.entity.position, esAjeno)) {
    if (sacado >= n || (tarea && tarea.cancelada)) break
    if (!(await irAlCofre(bot, p, tarea))) continue
    const b = bot.blockAt(p)
    if (!b || !CONTENEDORES.has(b.name)) continue
    try {
      const s = await conCerrojo(`${p.x},${p.y},${p.z}`, () => sacarDe(bot, b, LINGOTE, () => n - sacado))
      cofres++
      if (s.iron_ingot) { sacado += s.iron_ingot; de.push({ p, n: s.iron_ingot }) }
      if (s._lleno) break
    } catch (e) { /* no se abrió: al siguiente */ }
  }
  return { sacado, de, cofres }
}

// Lo sacado vuelve a sus cofres. Devuelve cuántos lingotes devolvió.
async function devolver(bot, de, tarea) {
  const { conLimite, esperar } = require('./habilidades/comun')
  const { conCerrojo } = require('./habilidades/depositar')
  const tipo = bot.registry.itemsByName.iron_ingot.id
  let devueltos = 0
  for (const { p, n } of de) {
    if (!(await irAlCofre(bot, p, tarea))) continue
    const b = bot.blockAt(p)
    if (!b || !CONTENEDORES.has(b.name)) continue
    try {
      await conCerrojo(`${p.x},${p.y},${p.z}`, async () => {
        const v = await conLimite(bot.openContainer(b), 8000)
        try { await conLimite(v.deposit(tipo, null, n), 5000); devueltos += n; await esperar(80) } finally { bot.closeWindow(v) }
      })
    } catch (e) { /* lleno o no se abrió: se queda con ellos */ }
  }
  return devueltos
}

module.exports = { EQUIPO, faltan, tiene, tipoDe, cofresUtiles, juntarLingotes, devolver, LINGOTE }
