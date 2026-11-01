// A0 del asistente (PLAN_asistente.md): los servidores 26.3 solo dejan un paquete de movimiento por tick de cliente y cuentan
// los ticks con `client_tick_end`; si no llega, expulsan al bot a los 1,5 s («invalid_player_movement», issue mineflayer #4189).
// mineflayer 4.39 no lo manda nunca, aunque el paquete ya está en el protocolo 26.1 (`tick_end`, sin campos). Este envoltorio lo
// manda justo después de cada paquete de movimiento. La física de mineflayer manda uno por tick, así que sale un tick_end por
// tick, como hace el cliente vanilla. Solo se instala en los mundos con `servidor.tick_end: true` en su mundo.json (el del
// usuario, en 26.3 tras ViaProxy, y el server Paper 26.3 del compañero).
// 2026-10-31, server Paper 26.3 del compañero: recoloca al bot en cada tick en cuanto salta o gira (en 26.3 vanilla, no). Dos
// diferencias con el cliente vanilla, que se prueban por separado:
//   IO_TICK_END=tick     un tick_end al final de CADA tick de física, se mueva o no (vanilla), en vez de uno por paquete
//   IO_PLAYER_INPUT=si   `player_input` con las teclas (avanzar, saltar, esprintar…) cuando cambian; mineflayer 4.39 solo lo
//                        manda al agacharse
// Ninguna de las dos lo arreglaba (con «tick», Paper expulsa). La causa era otra: la holgura, más abajo.
const MOVIMIENTO = new Set(['position', 'position_look', 'look', 'flying'])
const TECLAS = { forward: 'forward', back: 'backward', left: 'left', right: 'right', jump: 'jump', sneak: 'shift', sprint: 'sprint' }

// Las teclas de mineflayer (bot.controlState) en los nombres del paquete player_input
function entradas(control) {
  const r = {}
  for (const [de, a] of Object.entries(TECLAS)) r[a] = !!control[de]
  return r
}

function instalar(bot, { modo = process.env.IO_TICK_END || 'paquete', teclas = process.env.IO_PLAYER_INPUT === 'si' } = {}) {
  const c = bot && bot._client
  if (!c || c._tickEnd) return false // ya instalado: no duplicar
  const escribir = c.write.bind(c)
  if (modo === 'tick') {
    // physicsTick sale antes de que la física mande su paquete de movimiento (doPhysics es síncrono): el tick_end va en una
    // microtarea, que corre justo después, cuando el paquete ya salió
    bot.on('physicsTick', () => queueMicrotask(() => escribir('tick_end', {})))
  } else {
    c.write = function (nombre, datos) {
      const r = escribir(nombre, datos)
      if (MOVIMIENTO.has(nombre)) escribir('tick_end', {})
      return r
    }
  }
  if (process.env.IO_HOLGURA !== 'no') holgura(c)
  if (teclas) {
    let antes = ''
    bot.on('physicsTick', () => { // antes del paquete de movimiento de este tick, como el cliente vanilla
      const e = entradas(bot.controlState || {}), clave = JSON.stringify(e)
      if (clave !== antes) { antes = clave; escribir('player_input', { inputs: e }) }
    })
  }
  c._tickEnd = { modo, teclas }
  if (process.env.IO_DEPURAR_MOV === 'si') depurar(bot, c)
  return true
}

// Holgura (2026-11-01; IO_HOLGURA=no la apaga): Paper rechaza en silencio el paquete que deja el borde del cuerpo (±0,3) justo en la cara
// de un bloque (z 402,7 con el escalón en z 403: tocándolo, sin meterse; vanilla lo acepta, Paper no). Si un borde cae a menos de
// 1e-6 de un entero, la posición que se manda se mete 1e-4 hacia dentro; el bot sigue creyendo la suya (Paper tolera 0,0625).
// Sin esto, en Paper el bot no subía escalones ni rodeaba obstáculos (recolocado en bucle); con ella, banco del rodeo 3/3.
const MEDIO = 0.3, CASI = 1e-6, HOLGURA = 1e-4
function separar(v) {
  if (typeof v !== 'number') return v
  if (Math.abs((v + MEDIO) - Math.round(v + MEDIO)) < CASI) return v - HOLGURA
  if (Math.abs((v - MEDIO) - Math.round(v - MEDIO)) < CASI) return v + HOLGURA
  return v
}
function holgura(c) {
  const escribir = c.write.bind(c)
  c.write = function (nombre, datos) {
    if ((nombre === 'position' || nombre === 'position_look') && datos) datos = { ...datos, x: separar(datos.x), z: separar(datos.z) }
    return escribir(nombre, datos)
  }
}

// IO_DEPURAR_MOV=si: las 80 primeras líneas tras cada recolocación del server: lo que manda el bot (movimiento, teclas) y a
// dónde lo devuelve el server, con el tiempo en ms. Para ver qué rechaza Paper (2026-10-31)
function depurar(bot, c) {
  let quedan = 0, t0 = 0
  const f = (v) => (typeof v === 'number' ? v.toFixed(3) : v)
  const linea = (s) => { if (quedan-- > 0) console.log(`[depurar ${Date.now() - t0}] ${s}`) }
  c.on('position', (p) => {
    if (quedan <= 0) { quedan = 80; t0 = Date.now() }
    linea(`server → position ${f(p.x)} ${f(p.y)} ${f(p.z)} dx ${f(p.dx)} dy ${f(p.dy)} dz ${f(p.dz)} flags ${JSON.stringify(p.flags)}`)
  })
  const escribir = c.write.bind(c)
  c.write = function (nombre, datos) {
    if (MOVIMIENTO.has(nombre) || nombre === 'player_input' || nombre === 'teleport_confirm') {
      const d = datos || {}
      linea(`bot → ${nombre} ${d.x != null ? `${f(d.x)} ${f(d.y)} ${f(d.z)}` : ''} ${d.onGround != null ? 'suelo ' + d.onGround : ''} ${d.inputs ? JSON.stringify(d.inputs) : ''}${d.teleportId != null ? 'id ' + d.teleportId : ''}`)
    }
    return escribir(nombre, datos)
  }
}

module.exports = { instalar, entradas, separar, MOVIMIENTO }
