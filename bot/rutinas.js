// Rutinas (F8.0a, PLAN_F8_perfiles.md): los perfiles v1 pasan a ser estilos de rutinas acotadas por objetivo y tiempo, que el
// capataz de los perfiles v2 (F8.1) pide como un paso más (`hacer: ["rutina_madera 6 300"]`). Una rutina es un bucle
// observar → decidir → habilidad con un estilo y un criterio de fin:
//   rutina_madera [N=8] [max_s=300]  estilo recolector, observación de 25 y el guion de F3 (guion_f3.js): acaba con N troncos más;
//   rutina_noche [max_s=900]         estilo supervivencia, observación de 47 y el guion de supervivencia (guion_sv.js): acaba al
//                                    amanecer sin monstruos a la vista (si ya es de día y no hay nadie, acaba enseguida).
// El decisor de dentro es el guion (determinista y medible; F2-F7 midieron que las redes viejas lo igualan); `decisor: 'red'` usa
// la red de la política que se pase (la de 25 o la de 47), para los experimentos que comparan. La rutina no la corta el vigía de
// amenazas de habilidades/index.js (sus decisiones ya atienden la amenaza), pero cada habilidad de dentro sí, y la orden nueva
// (tarea.cancelada) la para entre decisiones. Devuelve lo mismo que una habilidad: { exito, causa, decisiones, …, ms }.
const observacion = require('./observacion')
const red = require('./red')
const guionF3 = require('./guion_f3')
const guionSv = require('./guion_sv')
const libre = require('./libre')
const sv = require('./habilidades/sv')
const { encerrado } = require('./habilidades/comun')

const ATASCO = 6 // fallos seguidos que acaban la rutina
const troncos = (bot) => bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((s, i) => s + i.count, 0)
const deDia = (bot) => !sv.esNoche(bot) && !sv.madrugada(bot)

const RUTINAS = {
  rutina_madera: {
    estilo: 'recolector', obs: 'obs', guion: guionF3,
    leer: (a) => ({ n: parseInt(a[0]) || 8, max_s: parseInt(a[1]) || 300 }),
    inicio: (bot) => ({ troncos0: troncos(bot) }),
    hecho: (bot, x) => troncos(bot) - x.troncos0 >= x.n,
    resumen: (bot, x) => ({ troncos: troncos(bot) - x.troncos0 }),
  },
  rutina_noche: {
    estilo: 'supervivencia', obs: 'obs_sv', guion: guionSv,
    leer: (a) => ({ max_s: parseInt(a[0]) || 900 }),
    inicio: () => ({}),
    hecho: (bot) => deDia(bot) && sv.aLaVista(bot).length === 0,
    resumen: (bot) => ({ salud: bot.health, hora: bot.time ? bot.time.timeOfDay : null }),
  },
}

// hacer(habilidad, args, tarea): la ejecuta el personaje (io.js ejecutarHabilidad: registro, reflejos, el cofre…).
async function ejecutar(bot, nombre, args, tarea, hacer, { decisor = 'guion', politica = null } = {}) {
  const R = RUTINAS[nombre]
  if (!R) return { exito: false, causa: 'rutina desconocida', ms: 0 }
  const t0 = Date.now(), x = { ...R.leer(args || []), ...R.inicio(bot) }
  const decide = decisor === 'red' ? red.politica(politica || undefined) : R.guion
  if (decisor === 'red' && decide.observacion() !== R.obs) return { exito: false, causa: `la política no es de ${R.obs}`, ms: 0 }
  const decisiones = []
  return observacion.conPerfil(bot, R.estilo, async () => {
    let seguidos = 0, causa = null
    observacion.iniciar(bot, x.max_s)
    while (!causa) {
      if (R.hecho(bot, x)) { causa = 'hecho'; break }
      if (tarea.cancelada) { causa = 'interrumpida'; break }
      if (Date.now() - t0 >= x.max_s * 1000) { causa = 'tiempo agotado'; break }
      if (seguidos >= ATASCO) { causa = 'atasco'; break }
      const { obs, datos } = R.obs === 'obs_sv' ? observacion.observarSv(bot) : observacion.observar(bot)
      const d = decide.decidir(obs)
      if (R.obs === 'obs_sv' && encerrado(bot) && libre.necesitaSalir(bot, d.habilidad, datos)) await hacer('salir_del_refugio', [], tarea)
      let r
      try { r = await hacer(d.habilidad, String(libre.ARGS[d.habilidad] || '').split(/\s+/).filter(Boolean), tarea) } catch (e) { r = { exito: false, causa: 'error: ' + e.message } }
      decisiones.push(`${d.habilidad}${r.exito ? '' : '✗'}`)
      seguidos = r.exito ? 0 : seguidos + 1
    }
    return { exito: causa === 'hecho', causa, decisiones, estilo: R.estilo, decisor, ...R.resumen(bot, x), ms: Date.now() - t0 }
  })
}

module.exports = { RUTINAS, ejecutar, ATASCO }
