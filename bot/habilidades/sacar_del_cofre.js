// sacar_del_cofre OBJETO [n=1] (F8.0b, C6): va a los cofres de cofres.json (el más cercano primero), los abre y saca hasta n de ese
// objeto (nombre del juego, o «troncos», «tablones», «piedra», «comida»…: cualquiera de ese grupo). Sigue con el siguiente cofre
// hasta juntar n. Sin romper ni poner bloques y sin pisar zonas vedadas (los movimientos de depositar), con el mismo cerrojo por
// cofre. Lo sacado de troncos se descuenta de lo guardado (la observación cuenta los ganados: sacar no es talar).
// Éxito: n en el inventario. Fallos: sin cofre · no hay X en los cofres · sin hueco · no llego. Devuelve { exito, causa, sacado, cofres }.
const { goals } = require('mineflayer-pathfinder')
const zonas = require('../zonas')
const cofres = require('../cofres')
const { conLimite, moverHasta, esperar } = require('./comun')
const depositar = require('./depositar')

const GRUPOS = { troncos: /_log$/, tablones: /_planks$/, piedra: /^(cobblestone|cobbled_deepslate|blackstone)$/, lana: /_wool$/,
  carbon: /^(coal|charcoal)$/, hierro: /^(iron_ingot|raw_iron)$/ }
const CONTENEDORES = new Set(['chest', 'trapped_chest', 'barrel'])
const patronDe = (bot, o) => o === 'comida' ? { test: (n) => !!bot.registry.foodsByName[n] } : GRUPOS[o] || { test: (n) => n === o }

async function sacarDe(bot, bloque, patron, quiero) {
  const v = await conLimite(bot.openContainer(bloque), 8000)
  const sacado = {}
  try {
    for (let s = 0; s < v.inventoryStart && quiero() > 0; s++) {
      const it = v.slots[s]
      if (!it || !patron.test(it.name)) continue
      const k = Math.min(it.count, quiero())
      try { await conLimite(v.withdraw(it.type, null, k), 5000) } catch (e) {
        if (/full/i.test(e.message)) { sacado._lleno = true; break }
        continue
      }
      sacado[it.name] = (sacado[it.name] || 0) + k
      await esperar(80)
    }
  } finally { bot.closeWindow(v) }
  return sacado
}

module.exports = async function sacarDelCofre(bot, [objeto, cantidad], tarea) {
  if (!objeto) return { exito: false, causa: 'falta el objeto' }
  const n = Math.max(1, parseInt(cantidad) || 1), patron = patronDe(bot, objeto)
  const lista = cofres.lista().filter(c => !zonas.pasoVedado(...c.bloques[0]))
  if (!lista.length) return { exito: false, causa: 'sin cofre' }
  const p0 = bot.entity.position
  const centro = (c) => p0.clone().set(c.bloques[0][0] + 0.5, c.bloques[0][1] + 0.5, c.bloques[0][2] + 0.5)
  lista.sort((a, b) => centro(a).distanceTo(p0) - centro(b).distanceTo(p0))
  const sacado = {}, usados = []
  let causa = null, lleno = false
  const total = () => Object.entries(sacado).reduce((a, [, k]) => a + k, 0)
  for (const c of lista) {
    if (total() >= n || lleno || (tarea && tarea.cancelada)) break
    const [x, y, z] = c.bloques[0], meta = centro(c)
    const ojo = () => bot.entity.position.offset(0, 1.62, 0).distanceTo(meta)
    const r = await moverHasta(bot, new goals.GoalNear(x, y, z, 2), () => ojo() <= 4, { ms: (15 + meta.distanceTo(bot.entity.position)) * 1000, tarea })
    if (r !== 'listo') { causa = 'no llego: ' + r; continue }
    const b = bot.blockAt(meta)
    if (!b || !CONTENEDORES.has(b.name)) { causa = `no hay cofre en ${x},${y},${z}`; continue }
    try {
      const s = await depositar.conCerrojo(c.nombre, () => sacarDe(bot, b, patron, () => n - total()))
      if (s._lleno) { lleno = true; delete s._lleno }
      for (const [k, m] of Object.entries(s)) sacado[k] = (sacado[k] || 0) + m
      if (Object.keys(s).length) usados.push(c.nombre)
    } catch (e) { causa = 'no se abrió: ' + e.message }
  }
  await esperar(300)
  const troncos = Object.entries(sacado).filter(([k]) => k.endsWith('_log')).reduce((a, [, m]) => a + m, 0)
  if (troncos) depositar.guardados(bot).troncos = Math.max(0, depositar.guardados(bot).troncos - troncos)
  const datos = { sacado, cofres: usados.join(',') }
  if (total() >= n) return { exito: true, causa: 'sacado', ...datos }
  if (lleno) return { exito: false, causa: 'sin hueco', ...datos }
  return { exito: false, causa: total() ? 'no hay bastante en los cofres' : causa || `no hay ${objeto} en los cofres`, ...datos }
}
