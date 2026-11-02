// Dónde vio a cada jugador por última vez (2026-11-01, «ataca a NOMBRE»: buscarle donde esté). El server solo manda la posición
// de los jugadores a ~48 bloques (sin RCON ni /tp en el server del compañero), así que fuera de ese radio esto es lo único que hay.
//   vigilar(bot)          apunta { pos, t } por nombre cada vez que un jugador se mueve a la vista
//   ultimaVez(bot, n)     { pos: Vec3, t } o null
function vigilar(bot) {
  const vistos = bot._jugadoresVistos = new Map()
  const apuntar = (e) => { if (e.type === 'player' && e.username && e !== bot.entity) vistos.set(e.username, { pos: e.position.clone(), t: Date.now() }) }
  bot.on('entityMoved', apuntar)
  bot.on('entitySpawn', apuntar)
  bot.on('entityGone', apuntar) // al salir de la vista: su última posición
}
const ultimaVez = (bot, nombre) => (bot._jugadoresVistos && bot._jugadoresVistos.get(nombre)) || null

module.exports = { vigilar, ultimaVez }
