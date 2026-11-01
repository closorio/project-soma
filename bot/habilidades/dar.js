// dar JUGADOR OBJETO|todo [n] (2026-11-01, pedido del usuario: «que me dé lo que le pida, los troncos que tale»): va hasta el jugador
// (como «ven»), le mira y le tira lo pedido para que lo recoja. OBJETO es un grupo de sacar_del_cofre («troncos», «tablones»,
// «piedra», «comida», «carbon», «hierro», «lana») o un nombre del juego; «todo» es lo que no conserva depositar (todo menos
// herramientas, armas, armadura y comida). Sin n, todo lo que lleve de eso. Éxito «dado» con { dado: {objeto: n} }.
// Fallos: no veo a JUGADOR · no llego · no llevo OBJETO · cancelado.
const { buscarEntidad, conLimite, esperar } = require('./comun')
const irAJugador = require('./ir_a_jugador')
const { patronDe } = require('./sacar_del_cofre')
const { conservar } = require('./depositar')

module.exports = async function dar(bot, [nombre, objeto = 'todo', cantidad], tarea) {
  const t0 = Date.now(), datos = () => ({ s: +((Date.now() - t0) / 1000).toFixed(1) })
  const quiero = objeto === 'todo' ? (it) => !conservar(bot, it) : ((p) => (it) => p.test(it.name))(patronDe(bot, objeto))
  if (!bot.inventory.items().some(quiero)) return { exito: false, causa: `no llevo ${objeto === 'todo' ? 'nada que dar' : objeto}`, ...datos() }
  const e = buscarEntidad(bot, nombre)
  if (!e) return { exito: false, causa: nombre ? 'no veo a ' + nombre : 'no veo a ningún jugador', ...datos() }
  if (e.position.distanceTo(bot.entity.position) > 3) {
    const r = await irAJugador(bot, [nombre, '45'], tarea)
    if (tarea && tarea.cancelada) return { exito: false, causa: 'cancelado', ...datos() }
    if (!r.exito) return { exito: false, causa: 'no llego: ' + r.causa, ...datos() }
  }
  try { bot.pathfinder.setGoal(null) } catch (_) {}
  const dado = {}
  let falta = cantidad ? Math.max(1, parseInt(cantidad)) : Infinity
  for (const it of bot.inventory.items().filter(quiero)) {
    if (falta <= 0 || (tarea && tarea.cancelada)) break
    await bot.lookAt(e.position.offset(0, 1.2, 0), true) // hacia su pecho: lo tirado le cae delante
    const n = Math.min(it.count, falta)
    try { await conLimite(bot.toss(it.type, it.metadata, n), 3000) } catch (_) { continue }
    dado[it.name] = (dado[it.name] || 0) + n; falta -= n
    await esperar(250)
  }
  const total = Object.values(dado).reduce((a, b) => a + b, 0)
  if (!total) return { exito: false, causa: `no llevo ${objeto}`, ...datos() }
  return { exito: true, causa: 'dado', dado, ...datos() }
}
