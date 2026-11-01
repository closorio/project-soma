// Puertas (2026-11-01, pedido del usuario: «Soma rodea las puertas en vez de pasar»). El navegador de mineflayer-pathfinder no
// sabe de puertas: en minecraft-data una puerta es un bloque entero (abierta o cerrada), así que la planea como pared, y su
// `canOpenDoors` solo vale para puertas de valla. Aquí:
//   aplicar(mov)  al planear, las puertas de madera son paso libre (las de hierro no: piden palanca o botón)
//   vigilar(bot)  al andar, abre la puerta cerrada que tiene delante (clic, como un jugador) y la cierra al dejarla atrás
const { Vec3 } = require('vec3')

const PUERTA = /^(?!iron_)\w+_door$/
const esPuerta = (b) => !!b && PUERTA.test(b.name)
const abierta = (b) => { try { return b.getProperties().open === true } catch (_) { return false } }

function aplicar(mov) {
  if (typeof mov.getBlock !== 'function') return mov // los navegadores de mentira de las pruebas en seco
  const original = mov.getBlock.bind(mov)
  mov.getBlock = (pos, dx, dy, dz) => {
    const b = original(pos, dx, dy, dz)
    if (esPuerta(b)) Object.assign(b, { safe: true, physical: false, replaceable: false, height: pos.y + dy })
    return b
  }
  return mov
}

const ALCANCE = 4.5, ESPERA_MS = 700
function vigilar(bot) {
  const abiertas = new Map() // 'x,y,z' (mitad de abajo) -> momento en que la abrió el bot
  let ocupado = false, ultimo = 0
  const abajo = (b) => (b.getProperties().half === 'upper' ? b.position.offset(0, -1, 0) : b.position)
  bot.on('physicsTick', () => {
    if (ocupado || !bot.entity || Date.now() - ultimo < 150) return
    const p = bot.entity.position
    // delante: la casilla a la que apunta su velocidad (o su mirada), a la altura de los pies y de la cabeza
    const v = bot.entity.velocity, h = Math.hypot(v.x, v.z)
    const dir = h > 0.02 ? new Vec3(v.x / h, 0, v.z / h) : new Vec3(-Math.sin(bot.entity.yaw), 0, -Math.cos(bot.entity.yaw))
    let hacer = null
    if (bot.pathfinder && bot.pathfinder.isMoving()) {
      for (const d of [0.7, 1.2]) {
        for (const dy of [0, 1]) {
          const b = bot.blockAt(p.offset(dir.x * d, dy, dir.z * d).floored())
          if (esPuerta(b) && !abierta(b)) { hacer = { b, abrir: true }; break }
        }
        if (hacer) break
      }
    }
    // cerrar las que abrió, cuando ya está a 2 bloques o más de ellas (y no dentro)
    if (!hacer) {
      for (const [clave, t] of abiertas) {
        const [x, y, z] = clave.split(',').map(Number), c = new Vec3(x + 0.5, y, z + 0.5)
        const lejos = Math.hypot(c.x - p.x, c.z - p.z)
        if (Date.now() - t > 30000 || lejos > ALCANCE) { abiertas.delete(clave); continue }
        if (lejos < 2) continue
        const b = bot.blockAt(new Vec3(x, y, z))
        if (!esPuerta(b) || !abierta(b)) { abiertas.delete(clave); continue }
        hacer = { b, abrir: false }; break
      }
    }
    if (!hacer) return
    ocupado = true; ultimo = Date.now()
    const clave = abajo(hacer.b).toArray().join(',')
    bot.activateBlock(hacer.b).then(() => {
      if (hacer.abrir) abiertas.set(clave, Date.now()); else abiertas.delete(clave)
    }).catch(() => {}).finally(() => setTimeout(() => { ocupado = false }, ESPERA_MS))
  })
}

module.exports = { aplicar, vigilar, esPuerta, PUERTA }
