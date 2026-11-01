// A0 del asistente (PLAN_asistente.md): los servidores 26.3 solo dejan un paquete de movimiento por tick de cliente y cuentan
// los ticks con `client_tick_end`; si no llega, expulsan al bot a los 1,5 s («invalid_player_movement», issue mineflayer #4189).
// mineflayer 4.39 no lo manda nunca, aunque el paquete ya está en el protocolo 26.1 (`tick_end`, sin campos). Este envoltorio lo
// manda justo después de cada paquete de movimiento. La física de mineflayer manda uno por tick, así que sale un tick_end por
// tick, como hace el cliente vanilla. Solo se instala en los mundos con `servidor.tick_end: true` en su mundo.json (el del
// usuario, en 26.3 tras ViaProxy). El banco local 26.1.2 y el server del compañero no lo llevan.
const MOVIMIENTO = new Set(['position', 'position_look', 'look', 'flying'])

function instalar(bot) {
  const c = bot && bot._client
  if (!c || c._tickEnd) return false // ya instalado: no duplicar
  const escribir = c.write.bind(c)
  c.write = function (nombre, datos) {
    const r = escribir(nombre, datos)
    if (MOVIMIENTO.has(nombre)) escribir('tick_end', {})
    return r
  }
  c._tickEnd = true
  return true
}

module.exports = { instalar, MOVIMIENTO }
