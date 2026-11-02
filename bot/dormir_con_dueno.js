// Dormir con el dueño (2026-11-02, pedido del usuario: «si me acuesto a dormir, ellos deben intentar dormir también, sin pedírselo»).
// El juego solo pasa la noche si duermen todos los jugadores, y los bots cuentan: si uno no se acuesta, el dueño se queda esperando.
// Cuando un dueño se acuesta de noche (mineflayer: `entitySleep`), cada bot hace lo que haría con la orden «duerme» (la cama más
// cercana, o pone o fabrica una; sin poder, el refugio): `dormir()`. Detalles:
//   · solo de noche (cuando el juego deja dormir) y solo mientras el dueño siga acostado;
//   · cada bot espera un rato distinto (0,5-3 s) para no ir todos a la vez a la misma cama;
//   · si falla (monstruos cerca, cama ocupada…) reintenta cada 20 s, hasta 3 veces, mientras el dueño siga dormido;
//   · un bot que ya duerme, o que ya lo está intentando, no hace nada.
const sv = require('./habilidades/sv')

const REINTENTOS = 3
const ESPERA_REINTENTO_MS = 20000

function vigilar(bot, { esAmo, dormir, decir = () => {}, azar = Math.random, esperar = (ms) => new Promise(r => setTimeout(r, ms)) }) {
  const acostados = new Set() // dueños que están durmiendo ahora
  let intentando = false

  bot.on('entityWake', (e) => { if (e && e.username) acostados.delete(e.username) })
  bot.on('entitySleep', (e) => {
    if (!e || e === bot.entity || !e.username || !esAmo(e.username)) return
    acostados.add(e.username)
    if (intentando || bot.isSleeping) return
    const h = sv.hora(bot)
    if (h < sv.CAMA[0] || h > sv.CAMA[1]) return // de día el juego no deja dormir
    intentando = true
    ;(async () => {
      try {
        await esperar(500 + Math.floor(azar() * 2500))
        for (let k = 0; k < REINTENTOS; k++) {
          if (!acostados.has(e.username) || bot.isSleeping) return
          if (k === 0) decir(`${e.username} se ha acostado: me voy a dormir.`)
          const r = await dormir()
          if (bot.isSleeping || !acostados.has(e.username)) return
          if (/^(?:Ya es de día|Spawn guardado)/.test(String(r))) return // la orden terminó bien (ya amaneció)
          await esperar(ESPERA_REINTENTO_MS)
        }
      } catch (_) { /* dormir() ya deja su fallo en el registro */ } finally { intentando = false }
    })()
  })
}

module.exports = { vigilar }
