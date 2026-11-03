// Salir a respirar (2026-11-03, banco): con la cabeza bajo el agua, subir en línea recta y, si hay techo, picarlo. Sin navegador: con
// un objetivo puesto el navegador pisa el salto (se ahogó 15 s saltando en el sitio, con el aire a 3 bloques). Mientras pica no salta:
// flotando se pica 5 veces más despacio. Devuelve { fuera, picados, ms }.
const { conLimite, esperar } = require('./habilidades/comun')
const sv = require('./habilidades/sv')

const AGUA = /^(water|seagrass|tall_seagrass|kelp|kelp_plant|bubble_column)$/, VISTA = 4, PICAR_MS = 12000, RECUPERAR_MS = 6000, AIRE_BIEN = 18
const cabeza = (bot) => bot.blockAt(bot.entity.position.offset(0, 1.62, 0))
const cabezaEnAgua = (bot) => { const b = bot.entity && cabeza(bot); return !!b && AGUA.test(b.name) }

// Lo primero sólido sobre la cabeza que tape el agua (a ≤ VISTA), o null si por encima sigue el agua o ya hay aire
function techo(bot) {
  const p = cabeza(bot).position
  for (let dy = 1; dy <= VISTA; dy++) {
    const b = bot.blockAt(p.offset(0, dy, 0))
    if (!b || AGUA.test(b.name)) continue
    return b.boundingBox === 'empty' ? null : b
  }
  return null
}

async function respirar(bot, ms = 30000) {
  const t0 = Date.now()
  let picados = 0
  try { bot.pathfinder.setGoal(null) } catch (_) {}
  try {
    while (Date.now() - t0 < ms && bot.health > 0 && cabezaEnAgua(bot)) {
      const b = techo(bot)
      if (b && !sv.NO_PICAR.test(b.name) && sv.puedeTocar(b.position.x, b.position.y, b.position.z)) {
        bot.setControlState('jump', false)
        const { item, ms: tarda } = sv.mejorHerramienta(bot, b)
        try {
          if (item) await conLimite(bot.equip(item, 'hand'), 2000)
          await conLimite(bot.dig(b, true), Math.min(PICAR_MS, tarda * 5 + 2000), () => bot.stopDigging())
          picados++
        } catch (_) {}
        continue
      }
      bot.setControlState('jump', true)
      await esperar(150)
    }
    // 2026-11-03, banco: con 1 s fuera seguía con el aire a 9 y volvía a hundirse 8 veces: a flote hasta recuperarlo
    const t1 = Date.now()
    bot.setControlState('jump', true)
    while (Date.now() - t1 < RECUPERAR_MS && bot.health > 0 && !cabezaEnAgua(bot) && bot.oxygenLevel < AIRE_BIEN) await esperar(150)
  } finally { bot.setControlState('jump', false) }
  return { fuera: !cabezaEnAgua(bot), picados, ms: Date.now() - t0 }
}

module.exports = { respirar, cabezaEnAgua, techo }
