// Retroceso al recibir un golpe (2026-11-01, pedido del usuario: «los bots no tienen knockback»). Desde 1.21.9 entity_velocity
// trae la velocidad como lpVec3, que minecraft-protocol ya decodifica en bloques/tick, pero mineflayer 4.39 la sigue dividiendo
// entre 8000 (el formato viejo, en 1/8000 de bloque): el empujón quedaba en ~0. Este oyente va después del de mineflayer y pone
// la velocidad buena. Vale para el propio bot (la física la usa: retrocede) y para las demás entidades.
function instalar(bot) {
  if (!bot.registry.version['>=']('1.21.9')) return false
  bot._client.on('entity_velocity', (p) => {
    const e = p.entityId === bot.entity?.id ? bot.entity : bot.entities[p.entityId]
    if (e && e.velocity && p.velocity) e.velocity.set(p.velocity.x, p.velocity.y, p.velocity.z)
  })
  return true
}

module.exports = { instalar }
