// dormir [segundos=720] (F7.2): pasar la noche. Si lleva cama y no está encerrado, la pone a su lado (dos casillas libres con suelo
// firme), duerme (bot.sleep: el juego no deja con monstruos a ≤ 8, «monstruos cerca») y, al despertar, la recoge. Si no, dentro del
// refugio espera al día (esperar_al_dia). Éxito «amanece». Fallos: es de día · monstruos cerca · sin cama y sin refugio ·
// despertado (le golpean) · refugio roto · tiempo agotado · cancelado.
// esperar_al_dia [segundos=720]: solo lo segundo: encerrado (comun.encerrado), quieto hasta las 6:29 (los zombis y esqueletos de
// fuera ya arden; el simulador espera hasta lo mismo, ESPERA_HASTA), comiendo si el hambre baja a 6 o menos. Vale también de
// madrugada (de las 5:31 a las 6:29) y, desde F7.6, al atardecer (desde las 11040, sv.ATARDECER, como el simulador): antes
// decía «es de día» hasta las 12480 y el bot salía y cavaba otro pozo. Fallos: es de día · sin refugio · refugio roto · tiempo
// agotado · cancelado. Del atardecer a las 6:29 son 11,2 min reales: el límite por defecto (720 s) lo cubre. Ni la amenaza ni un golpe la cortan dentro del
// refugio (los de fuera no llegan); fuera sí, como a las demás.
// F7.6b (decisión del usuario, 2026-10-16): dentro del refugio espera además hasta que sea seguro salir, también de día (tras
// huir de unos monstruos): vida ≥ 16 (o no puede curarse: hambre < 18 y sin comida) y ningún hostil a ≤ 8 (los que esperan junto
// a la pared). Mientras, si está herido, come hasta 18 para curarse. De día espera así como mucho 120 s («tiempo agotado»). Éxito
// «amanece» o, si esperó de día, «a salvo». Como _dormir e _inseguro del simulador (SALUD_SALIR, RADIO_SALIR, ESPERA_MAX).
// Devuelve { exito, causa, modo: 'cama'|'refugio', hora: [antes, después], comido, s } (y salud, en el refugio).
const { Vec3 } = require('vec3')
const { conLimite, encerrado, esperar, hostiles, nodo } = require('./comun')
const recoger = require('./recoger')
const comer = require('./comer')
const sv = require('./sv')

const LADOS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const HAMBRE = 6, MAX_S = 720
const SALUD_SALIR = 16, RADIO_SALIR = 8, CURA = 18, ESPERA_MAX_S = 120 // F7.6b

const nochePasada = (bot) => !sv.esNoche(bot) && !sv.madrugada(bot)
const dia = (bot) => !sv.esperable(bot) // F7.6: esperar_al_dia vale del atardecer a las 6:29
// F7.6b: ¿aún no es seguro salir? (_inseguro del simulador)
const inseguro = (bot) => (bot.health < SALUD_SALIR && (bot.food >= CURA || sv.comidas(bot).length > 0)) ||
  hostiles(bot, RADIO_SALIR + 1e-6).some(e => sv.vivo(bot, e))

async function esperarAlDia(bot, segundos, tarea) {
  const t0 = Date.now(), h0 = sv.hora(bot), ms = Math.min(MAX_S, parseFloat(segundos) || MAX_S) * 1000
  const datos = (extra = {}) => ({ modo: 'refugio', hora: [h0, sv.hora(bot)], comido: extra.comido || 0, s: +((Date.now() - t0) / 1000).toFixed(1),
    salud: bot.health })
  if (dia(bot) && !inseguro(bot)) return { exito: false, causa: 'es de día', ...datos() }
  if (!encerrado(bot)) return { exito: false, causa: 'sin refugio', ...datos() }
  try { bot.pathfinder.setGoal(null) } catch (_) {}
  let comido = 0, desdeDia = null
  for (;;) {
    if (tarea && tarea.cancelada) return { exito: false, causa: 'cancelado', ...datos({ comido }) }
    if (dia(bot)) {
      const ahora = Date.now()
      if (desdeDia === null) desdeDia = ahora
      if (!inseguro(bot)) return { exito: true, causa: ahora === desdeDia ? 'amanece' : 'a salvo', ...datos({ comido }) }
      if (ahora - desdeDia > ESPERA_MAX_S * 1000) return { exito: false, causa: 'tiempo agotado', ...datos({ comido }) }
    }
    if (!encerrado(bot)) return { exito: false, causa: 'refugio roto', ...datos({ comido }) }
    if (Date.now() - t0 > ms) return { exito: false, causa: 'tiempo agotado', ...datos({ comido }) }
    if (sv.comidas(bot).length && (bot.food <= HAMBRE || (bot.health < SALUD_SALIR && bot.food < CURA))) { // F7.6b: herido, come para curarse
      const r = await comer(bot, bot.food <= HAMBRE ? [] : [String(CURA)], tarea); if (r.exito) comido += r.bocados
    }
    await esperar(1000)
  }
}

// Dos casillas libres en línea (pies de la cama a mi lado, cabecera detrás) con suelo firme, que se puedan tocar. Con `b`, mirando
// desde esa casilla en vez de la mía (usar_cama busca así un sitio cerca cuando aquí no hay).
function sitioCama(bot, b = nodo(bot)) {
  const libre = (v) => { const k = bot.blockAt(v); return !!k && k.boundingBox === 'empty' && !sv.esLiquido(k) }
  for (const [dx, dz] of LADOS) {
    const pie = b.offset(dx, 0, dz), cab = b.offset(2 * dx, 0, 2 * dz)
    if ([pie, cab].every(v => libre(v) && libre(v.offset(0, 1, 0)) && sv.solido(bot.blockAt(v.offset(0, -1, 0))) && sv.puedePoner(v.x, v.y, v.z))) return { pie, cab }
  }
  return null
}

async function dormirEnCama(bot, segundos, tarea) {
  const t0 = Date.now(), h0 = sv.hora(bot), ms = Math.min(MAX_S, parseFloat(segundos) || MAX_S) * 1000
  const datos = () => ({ modo: 'cama', hora: [h0, sv.hora(bot)], comido: 0, s: +((Date.now() - t0) / 1000).toFixed(1) })
  if (h0 < sv.CAMA[0] || h0 > sv.CAMA[1]) return { exito: false, causa: 'es de día', ...datos() }
  if (hostiles(bot, 8).length) return { exito: false, causa: 'monstruos cerca', ...datos() }
  const sitio = sitioCama(bot), cama = bot.inventory.items().find(i => i.name.endsWith('_bed'))
  if (!sitio) return { exito: false, causa: 'sin sitio para la cama', ...datos() }
  try { bot.pathfinder.setGoal(null) } catch (_) {}
  let puesta = null
  try {
    await conLimite(bot.equip(cama, 'hand'), 3000)
    await bot.lookAt(sitio.cab.offset(0.5, 0, 0.5), true) // la cabecera queda hacia donde mira
    await conLimite(bot.placeBlock(bot.blockAt(sitio.pie.offset(0, -1, 0)), new Vec3(0, 1, 0)), 3000)
  } catch (_) {}
  await esperar(200)
  for (const v of [sitio.pie, sitio.cab]) { const k = bot.blockAt(v); if (k && k.name.endsWith('_bed')) puesta = k }
  if (!puesta) return { exito: false, causa: 'no pude poner la cama', ...datos() }
  const salud0 = bot.health
  let causa = null
  try { await conLimite(bot.sleep(puesta), 5000) } catch (e) { causa = /monsters/.test(e.message) ? 'monstruos cerca' : 'no pude dormir: ' + e.message.slice(0, 60) }
  if (!causa) {
    for (;;) { // dormido hasta que el juego le despierte (amanece si duermen todos los jugadores)
      if (tarea && tarea.cancelada) { causa = 'cancelado'; break }
      if (!bot.isSleeping) { // ¿le despertó el día o algo? la hora nueva llega un momento después de despertar
        for (let w = 0; w < 30 && sv.hora(bot) >= sv.CAMA[0]; w++) await esperar(100)
        causa = sv.hora(bot) < sv.CAMA[0] ? null : 'despertado'
        break
      }
      if (bot.health < salud0) { causa = 'despertado'; break }
      if (Date.now() - t0 > ms) { causa = 'tiempo agotado'; break }
      await esperar(500)
    }
    if (bot.isSleeping) try { await bot.wake() } catch (_) {}
  }
  // recoger la cama (cae al picarla)
  const k = bot.blockAt(puesta.position)
  if (k && k.name.endsWith('_bed')) {
    try { await conLimite(bot.dig(k, true), 3000, () => bot.stopDigging()) } catch (_) {}
    await esperar(300)
    await recoger(bot, ['4', '_bed'], tarea)
  }
  const cama2 = bot.inventory.items().some(i => i.name.endsWith('_bed'))
  return causa ? { exito: false, causa, ...datos(), cama: cama2 } : { exito: true, causa: 'amanece', ...datos(), cama: cama2 }
}

module.exports = async function dormir(bot, [segundos], tarea) {
  const cama = bot.inventory.items().some(i => i.name.endsWith('_bed'))
  if (encerrado(bot)) return esperarAlDia(bot, segundos, tarea)
  if (cama) await require('./hogar')(bot, tarea) // la cama se pone en el hogar, si lo hay y llega
  if (cama) return dormirEnCama(bot, segundos, tarea)
  if (nochePasada(bot)) return { exito: false, causa: 'es de día', modo: null, hora: [sv.hora(bot), sv.hora(bot)], comido: 0, s: 0 }
  return { exito: false, causa: 'sin cama y sin refugio', modo: null, hora: [sv.hora(bot), sv.hora(bot)], comido: 0, s: 0 }
}
module.exports.esperarAlDia = async (bot, [segundos], tarea) => esperarAlDia(bot, segundos, tarea)
module.exports.sitioCama = sitioCama // 2026-11-01: también lo usa usar_cama.js (poner una cama nueva)
