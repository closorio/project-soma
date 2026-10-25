// Prueba en seco de guion_f3.js y rutinas.js (F8.0a):
// 1. El guion de F3 en JS da lo mismo que guion_lote de Python en las observaciones de
// episodios del simulador de habilidades (todos los perfiles, solo y con compañeros, jugados al azar y por el propio guion),
// con y sin compañero.
// 2. Las rutinas (rutinas.js) en el mundo de mentira de probar_sentidos_seco.js, con un `hacer` de mentira (también uno en que todo
//    sale bien sin dar troncos: acaba «sin avance»): rutina_madera decide
//    con el guion de F3 y el estilo recolector, acaba al juntar N troncos, por atasco o por la tarea cancelada y deja el perfil de
//    antes; rutina_noche acaba enseguida de día sin monstruos y, de noche, decide con el guion de supervivencia.
// Uso: node bot/probar_guion_f3_seco.js [episodios=120]   (necesita el python3 del venv en el PATH)
process.env.IO_SERVIDOR = process.env.IO_SERVIDOR || 'supervivencia'
const { execFileSync } = require('child_process')
const path = require('path')
const guion = require('./guion_f3')
const { HABILIDADES } = require('./observacion')

const episodios = parseInt(process.argv[2]) || 120
const py = `
import json
import numpy as np
from entorno_habilidades import MundoHabilidades, guion_lote, politica_guion, cargar_perfiles, calibrar, HABILIDADES
cal, perfiles, obs = calibrar(), list(cargar_perfiles()), []
for k in range(${episodios}):
    env = MundoHabilidades(semilla=800000 + k, perfil=perfiles[k % len(perfiles)], pacifico=bool(k % 3), cal=cal, agentes=1 + k % 3)
    rng, o, hecho = np.random.default_rng(k), env.reset(), False
    while not hecho:
        obs.append(o)
        a = int(rng.integers(len(HABILIDADES))) if k % 2 else politica_guion(o)
        o, _, hecho, _ = env.step(a)
s = np.array(obs, np.float32)
print(json.dumps({"obs": [[float(x) for x in o] for o in s], "con": guion_lote(s).tolist(), "sin": guion_lote(s, companero=False).tolist()}))
`
const { obs, con, sin } = JSON.parse(execFileSync('python3', ['-c', py], { cwd: path.join(__dirname, '..', 'entrenamiento'), maxBuffer: 1 << 30 }).toString())
let igualesCon = 0, igualesSin = 0
const distintos = []
obs.forEach((o, k) => {
  const a = guion.accion(o), b = guion.accion(o, false)
  if (a === con[k]) igualesCon++; else if (distintos.length < 8) distintos.push(`${k} (con compañero): py ${HABILIDADES[con[k]]} js ${HABILIDADES[a]}`)
  if (b === sin[k]) igualesSin++; else if (distintos.length < 8) distintos.push(`${k} (solo): py ${HABILIDADES[sin[k]]} js ${HABILIDADES[b]}`)
})
const usadas = new Set(con)
console.log(`guion_f3.js frente a guion_lote: con compañero ${igualesCon}/${obs.length}, solo ${igualesSin}/${obs.length} iguales ` +
  `(acciones vistas: ${[...usadas].sort().map(i => HABILIDADES[i]).join(', ')})`)
for (const d of distintos) console.log('  distinto ·', d)
let error = null
try { guion.decidir([0, 1]) } catch (e) { error = e.message }
console.log(error ? 'con 2 entradas se niega: bien' : 'con 2 entradas NO se niega')
let bien = igualesCon === obs.length && igualesSin === obs.length && usadas.size === HABILIDADES.length && !!error

// 2 · rutinas
const { mundoFalso } = require('./probar_sentidos_seco')
const rutinas = require('./rutinas')
const observacion = require('./observacion')
const guionSv = require('./guion_sv')
const ok = (c, que) => { if (!c) { bien = false; console.log('  FALLO ' + que) } }
// Un `hacer` de mentira: apunta lo que pide; picar_tronco da un tronco (en el inventario de mentira) y lo demás «sale bien».
function hacedor(bot, { falla = false, sinTroncos = false, alPedir = () => {} } = {}) {
  const pedidas = []
  const hacer = async (h, args, tarea) => {
    pedidas.push({ h, args, perfil: observacion.perfilDe(bot).nombre })
    alPedir(pedidas.length, tarea)
    if (h === 'picar_tronco' && !falla && !sinTroncos) bot.inventory.slots[9] = { name: 'oak_log', count: (bot.inventory.slots[9]?.count || 0) + 1 }
    return { exito: !falla, causa: falla ? 'sin árbol' : h }
  }
  return { hacer, pedidas }
}
;(async () => {
  const arbol = () => mundoFalso({ bloques: { '1,64,0': 'oak_log', '1,65,0': 'oak_log' } })
  let bot = arbol(); observacion.ponerPerfil(bot, 'cooperativo')
  let h = hacedor(bot)
  const primera = guion.decidir(await observacion.conPerfil(bot, 'recolector', async () => observacion.observar(bot).obs))
  let r = await rutinas.ejecutar(bot, 'rutina_madera', ['2', '30'], { cancelada: false }, h.hacer)
  ok(r.exito && r.causa === 'hecho' && r.troncos === 2, `rutina_madera 2: ${JSON.stringify(r)}`)
  ok(h.pedidas[0].h === primera.habilidad, `la primera decisión es ${h.pedidas[0].h}, el guion de F3 dice ${primera.habilidad}`)
  ok(h.pedidas.every(p => p.perfil === 'recolector'), 'dentro de rutina_madera el estilo no es recolector')
  ok(observacion.perfilDe(bot).nombre === 'cooperativo', `al acabar el perfil es ${observacion.perfilDe(bot).nombre}, no cooperativo`)
  console.log(`  2 · rutina_madera 2: ${r.causa}, ${r.troncos} troncos (${r.decisiones.join(' ')}); el perfil vuelve a cooperativo`)

  bot = arbol(); h = hacedor(bot, { falla: true })
  r = await rutinas.ejecutar(bot, 'rutina_madera', ['5', '30'], { cancelada: false }, h.hacer)
  ok(!r.exito && r.causa === 'atasco' && h.pedidas.length === rutinas.ATASCO, `si todo falla: ${r.causa} tras ${h.pedidas.length}`)
  bot = arbol(); h = hacedor(bot, { alPedir: (n, tarea) => { if (n === 1) tarea.cancelada = true } })
  r = await rutinas.ejecutar(bot, 'rutina_madera', ['5', '30'], { cancelada: false }, h.hacer)
  ok(!r.exito && r.causa === 'interrumpida' && h.pedidas.length === 1, `con la tarea cancelada: ${r.causa} tras ${h.pedidas.length}`)
  console.log(`  2 · rutina_madera: atasco tras ${rutinas.ATASCO} fallos e interrumpida con una orden nueva`)
  // F8.1: todo «sale bien» pero no entra ningún tronco (K4, banco K 9: 2.990 ir_a_arbol con éxito): acaba «sin avance»
  bot = arbol(); h = hacedor(bot, { sinTroncos: true })
  r = await rutinas.ejecutar(bot, 'rutina_madera', ['5', '30'], { cancelada: false }, h.hacer)
  ok(!r.exito && r.causa === 'sin avance' && h.pedidas.length === rutinas.SIN_AVANCE, `éxitos sin troncos: ${r.causa} tras ${h.pedidas.length} (${r.decisiones.join(' ')})`)
  console.log(`  2 · rutina_madera sin troncos: ${r.causa} tras ${h.pedidas.length} decisiones (${r.decisiones.join(' ')})`)

  bot = mundoFalso({ hora: 6000 }); h = hacedor(bot)
  r = await rutinas.ejecutar(bot, 'rutina_noche', [], { cancelada: false }, h.hacer)
  ok(r.exito && r.causa === 'hecho' && h.pedidas.length === 0, `rutina_noche de día: ${JSON.stringify(r)}`)
  bot = mundoFalso({ hora: 18000, entidades: [{ name: 'zombie', pos: [6.5, 64, 0.5] }], inventario: [['wooden_sword', 1], ['dirt', 4]] })
  const esperada = await observacion.conPerfil(bot, 'supervivencia', async () => guionSv.decidir(observacion.observarSv(bot).obs).habilidad)
  h = hacedor(bot, { alPedir: (n, tarea) => { if (n === 3) tarea.cancelada = true } })
  r = await rutinas.ejecutar(bot, 'rutina_noche', ['60'], { cancelada: false }, h.hacer)
  ok(h.pedidas[0].h === esperada && h.pedidas[0].perfil === 'supervivencia', `rutina_noche con un zombi: ${h.pedidas[0].h} (${h.pedidas[0].perfil}), el guion dice ${esperada}`)
  console.log(`  2 · rutina_noche: de día acaba sin hacer nada; de noche con un zombi, ${h.pedidas[0].h} como el guion de supervivencia`)
  console.log(bien ? 'probar_guion_f3_seco: todo bien' : 'probar_guion_f3_seco: FALLA')
  process.exit(bien ? 0 : 1)
})().catch(e => { console.log('FALLO ' + e.stack); process.exit(1) })
