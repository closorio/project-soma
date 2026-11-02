// revisar_cofres [ZONA=HOGAR] (2026-11-02): abre todos los cofres y barriles que hay dentro de la zona (zonas.json) y cuenta lo que
// guardan. No saca ni guarda nada. Las zonas vedadas se pisan (sin romper ni poner). Un cofre doble se cuenta una vez.
// Éxito si pudo abrir alguno. Fallos: sin zona · sin cofres. Devuelve { exito, causa, zona, cofres, noAbiertos, items: { objeto: n } }.
const { goals } = require('mineflayer-pathfinder')
const zonas = require('../zonas')
const { conLimite, moverHasta, esperar, prudentes } = require('./comun')

const CONTENEDORES = new Set(['chest', 'trapped_chest', 'barrel'])
const VECINOS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]

// Los contenedores de dentro de una zona, los más cercanos primero: { zona, pos: [Vec3…] } o null si no hay zona. También la usa
// sacar_del_cofre con zona=NOMBRE (2026-11-02, abasto del catálogo: saca de los mismos cofres que cuenta esta habilidad)
function contenedoresDe(bot, nombre) {
  const zona = zonas.leer().zonas.find(z => z.nombre.toLowerCase() === String(nombre || 'HOGAR').toLowerCase())
  if (!zona) return null
  const x1 = Math.min(zona.x1, zona.x2), x2 = Math.max(zona.x1, zona.x2), z1 = Math.min(zona.z1, zona.z2), z2 = Math.max(zona.z1, zona.z2)
  const dentro = (p) => p.x >= x1 && p.x <= x2 && p.z >= z1 && p.z <= z2 && (zona.y1 == null || (p.y >= zona.y1 && p.y <= zona.y2))
  const centro = bot.entity.position.clone().set((x1 + x2) / 2, bot.entity.position.y, (z1 + z2) / 2)
  const radio = Math.min(128, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 2) + 8)
  // desde donde está, los más cercanos primero; solo los de dentro de la zona
  const pos = bot.findBlocks({ matching: (b) => CONTENEDORES.has(b.name), point: centro, maxDistance: radio, count: 200 }).filter(dentro)
    .sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position))
  return { zona, pos }
}

module.exports = async function revisarCofres(bot, [nombre], tarea) {
  const c = contenedoresDe(bot, nombre)
  if (!c) return { exito: false, causa: 'sin zona', zona: nombre || 'HOGAR', cofres: 0, items: {} }
  const { zona, pos } = c
  if (!pos.length) return { exito: false, causa: 'sin cofres', zona: zona.nombre, cofres: 0, items: {} }
  const visto = new Set(), items = {}
  let abiertos = 0, noAbiertos = 0
  const clave = (p) => `${p.x},${p.y},${p.z}`
  for (const p of pos) {
    if (tarea && tarea.cancelada) break
    if (visto.has(clave(p))) continue
    visto.add(clave(p))
    const meta = p.offset(0.5, 0.5, 0.5)
    const r = await moverHasta(bot, new goals.GoalNear(p.x, p.y, p.z, 2), () => bot.entity.position.offset(0, 1.62, 0).distanceTo(meta) <= 4,
      { ms: 20000 + meta.distanceTo(bot.entity.position) * 1000, tarea, mov: prudentes(bot, { pisarVedadas: true }) })
    const b = bot.blockAt(p)
    if (r !== 'listo' || !b || !CONTENEDORES.has(b.name)) { noAbiertos++; continue }
    try {
      const v = await conLimite(bot.openContainer(b), 8000)
      try {
        for (let s = 0; s < v.inventoryStart; s++) { const it = v.slots[s]; if (it) items[it.name] = (items[it.name] || 0) + it.count }
        if (v.inventoryStart >= 54) for (const [dx, dy, dz] of VECINOS) { const q = p.offset(dx, dy, dz); const n = bot.blockAt(q); if (n && n.name === b.name) visto.add(clave(q)) }
      } finally { bot.closeWindow(v) }
      abiertos++
      await esperar(150)
    } catch (_) { noAbiertos++ }
  }
  return { exito: abiertos > 0, causa: abiertos ? 'revisado' : 'no abrí ninguno', zona: zona.nombre, cofres: abiertos, noAbiertos, items }
}
module.exports.contenedoresDe = contenedoresDe
