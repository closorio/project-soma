// Colisiones entre entidades (2026-11-02, pedido del usuario: «los bots se apilan, deben respetar sus hitboxes»). mineflayer no
// empuja al bot cuando su hitbox se solapa con la de otro jugador o mob; el cliente vanilla sí (Entity.push(Entity)), así que
// varios bots acababan en el mismo bloque. Aquí se repite esa regla en cada tick de física, solo sobre uno mismo (cada cliente
// se empuja a sí; el otro bot hace lo mismo con su lado):
//   si las cajas se solapan (X, Z e Y): d = max(|dx|, |dz|) hacia el otro; si d >= 0,01 → d = √d, (dx, dz) /= d,
//   × min(1/d, 1) × 0,05, y se resta a la velocidad horizontal. Tan débil como en vanilla: separa en unos ticks, no es un muro.
const ANCHO = 0.6
const ALTO = 1.8
const NO_EMPUJAN = new Set(['object', 'orb', 'global', 'other', 'projectile']) // objetos, orbes, rayos…: no tienen colisión de empuje

const ancho = (e) => (e && e.width > 0 ? e.width : ANCHO)
const alto = (e) => (e && e.height > 0 ? e.height : ALTO)

// ¿Se solapan las cajas de a y b? (posición = pies, como en mineflayer)
function solapan(a, b) {
  const mx = (ancho(a) + ancho(b)) / 2
  return Math.abs(b.position.x - a.position.x) < mx && Math.abs(b.position.z - a.position.z) < mx &&
    a.position.y < b.position.y + alto(b) && b.position.y < a.position.y + alto(a)
}

// El empuje (dx, dz) que recibe `yo` por solapar con `otro`; null si no se tocan o están clavados en el mismo punto
function empuje(yo, otro) {
  if (!solapan(yo, otro)) return null
  let dx = otro.position.x - yo.position.x
  let dz = otro.position.z - yo.position.z
  let d = Math.max(Math.abs(dx), Math.abs(dz))
  if (d < 0.01) return null
  d = Math.sqrt(d)
  dx /= d; dz /= d
  const inv = Math.min(1 / d, 1)
  return { x: -dx * inv * 0.05, z: -dz * inv * 0.05 }
}

function vigilar(bot) {
  bot.on('physicsTick', () => {
    const yo = bot.entity
    if (!yo || !yo.position || !yo.velocity || bot.vehicle || bot.game?.gameMode === 'spectator') return
    for (const e of Object.values(bot.entities)) {
      if (e === yo || !e.position || NO_EMPUJAN.has(e.type) || e.isValid === false) continue
      if (Math.abs(e.position.x - yo.position.x) > 2 || Math.abs(e.position.z - yo.position.z) > 2) continue // filtro barato
      const p = empuje(yo, e)
      if (p) { yo.velocity.x += p.x; yo.velocity.z += p.z }
    }
  })
}

module.exports = { vigilar, empuje, solapan }
