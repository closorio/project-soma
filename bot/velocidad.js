// Empujón de los golpes (2026-11-01). Desde 1.21.9 `entity_velocity` lleva la velocidad como `lpVec3`, que minecraft-protocol ya
// da en bloques/tick; mineflayer 4.39 la sigue dividiendo entre 8000 (el formato viejo, en 1/8000 de bloque/tick) y el empujón
// queda en ~0: al bot no lo mueve un golpe ni una flecha. Este oyente va después del de mineflayer y pone la velocidad sin
// dividir. Solo se instala si el protocolo de la versión usa lpVec3; con el formato viejo no hace nada.
const { Vec3 } = require('vec3')

function usaLpVec3(bot) {
  try {
    return JSON.stringify(bot.registry.protocol.play.toClient.types.packet_entity_velocity).includes('lpVec3')
  } catch (e) { return false }
}

function instalar(bot) {
  const c = bot && bot._client
  if (!c || c._velocidad || !usaLpVec3(bot)) return false
  c.on('entity_velocity', (p) => {
    const e = bot.entities[p.entityId]
    if (e) e.velocity = new Vec3(p.velocity.x, p.velocity.y, p.velocity.z)
  })
  c._velocidad = true
  return true
}

module.exports = { instalar, usaLpVec3 }
