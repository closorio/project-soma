// Informe del cuerpo hacia la mente (F6): cada personaje guarda lo que hace y lo que le pasa en un buffer propio
// (memoria(bot, 'informe')), y la orden `resumen` de io.js devuelve lo nuevo desde la última lectura, compacto, para que la
// sesión de Claude que gobierna al personaje decida sin leer volcados. Anillos de MAX entradas; cada entrada lleva un número
// de secuencia (seq) y la hora. `leido` guarda hasta dónde se leyó y cuántos troncos había entonces (ganados desde entonces).
const memoria = require('./memoria')
const registro = require('./registro')
const mundo = require('./mundo')
const { dist, encerrado } = require('./habilidades/comun')

const MAX = 500
// Eventos que interesan a la mente aunque no haya pedido nada (esperar() de mente.py vuelve con ellos; mente.py tiene su copia:
// los de supervivencia de F7.1, hambre, noche, dia y reaparecido, se le añaden en F7.7).
const AVISOS = new Set(['amenaza', 'bloqueado', 'agua', 'cofres_llenos', 'muerto', 'salud_baja', 'orden_externa', 'desconectado',
  'reconectado', 'expulsado', 'falta_material', 'obra', 'hambre', 'noche', 'dia', 'reaparecido'])

const informe = (bot) => memoria(bot, 'informe', () => ({ seq: 0, habilidades: [], ordenes: [], tramos: [], eventos: [],
  leido: { seq: 0, t: null, troncos: null } }))

function anotar(bot, lista, obj) {
  const inf = informe(bot)
  const e = { seq: ++inf.seq, t: registro.hora(), ...obj }
  inf[lista].push(e)
  if (inf[lista].length > MAX) inf[lista].splice(0, inf[lista].length - MAX)
  return e
}
const habilidad = (bot, d) => anotar(bot, 'habilidades', d)
const orden = (bot, d) => anotar(bot, 'ordenes', d)
const tramo = (bot, d) => anotar(bot, 'tramos', d)
const evento = (bot, tipo, datos) => anotar(bot, 'eventos', { tipo, ...(datos !== undefined ? { datos } : {}) })

// Lo nuevo desde la última lectura (o todo).
function desde(bot, todo = false) {
  const inf = informe(bot), s = todo ? 0 : inf.leido.seq
  const f = (l) => l.filter(e => e.seq > s)
  return { habilidades: f(inf.habilidades), ordenes: f(inf.ordenes), tramos: f(inf.tramos), eventos: f(inf.eventos), leido: inf.leido, seq: inf.seq }
}
function marcarLeido(bot, troncos) {
  const inf = informe(bot)
  inf.leido = { seq: inf.seq, t: registro.hora(), troncos }
}

// Fallos agrupados por habilidad y causa (la primera parte, antes de los dos puntos), con la última posición.
function fallos(habs) {
  const g = {}
  for (const h of habs) {
    if (h.exito) continue
    const causa = String(h.causa || '').split(':')[0].trim()
    const k = h.nombre + '|' + causa
    g[k] = g[k] || { habilidad: h.nombre, causa, n: 0 }
    g[k].n++
    g[k].ultimo = h.t
    if (h.pos) g[k].pos = h.pos
  }
  return Object.values(g).sort((a, b) => b.n - a.n)
}
// Éxitos y fallos por habilidad: { picar_tronco: { ok: 9, fallo: 1 }, … }
function cuenta(habs) {
  const c = {}
  for (const h of habs) { c[h.nombre] = c[h.nombre] || { ok: 0, fallo: 0 }; c[h.nombre][h.exito ? 'ok' : 'fallo']++ }
  return c
}

// F7.1 · eventos de supervivencia. Solo fuera del mundo del usuario (allí no hay hambre ni monstruos, y la mente de F6 no debe
// recibir eventos nuevos a mitad de su medición); `activo` lo fuerza para las pruebas. io.js lo llama con cada bot nuevo
// (también al reconectar: el vigía de refugio se para con el bot).
//   hambre       la barra de comida baja a HAMBRE (6) o menos: un aviso por bajada, como salud_baja
//   golpe        le hacen daño: de quién (si el servidor lo dice y está a la vista; si no, null: caída, ahogo, hambre…) y a qué
//                distancia, cuántos golpes y la salud que le queda. Los golpes del mismo atacante con menos de GOLPES ms entre
//                ellos se suman en el mismo evento mientras la mente no lo haya leído
//   noche, dia   cambia la hora (NOCHE, como observacion.js y el simulador); no se avisa de la que había al conectar
//   refugiado    queda encerrado en una celda de 1×2 (comun.encerrado, mirado cada CADA ms), con la posición
//   reaparecido  vuelve a aparecer tras morir (muerto lo anota io.js), con la posición
const HAMBRE = 6, GOLPES = 3000, NOCHE = [12480, 23520], CADA = 2000
function vigilar(bot, activo = mundo.nombre !== 'usuario') {
  if (!activo) return false
  let hambriento = false, noche = null, refugiado = false, muerto = false, golpe = null
  const pos = () => bot.entity?.position?.floored().toArray()
  bot.on('health', () => {
    const h = bot.food <= HAMBRE
    if (h && !hambriento) evento(bot, 'hambre', bot.food)
    hambriento = h
    if (golpe && Date.now() - golpe.t < GOLPES) golpe.e.datos.salud = bot.health // la salud llega justo después del golpe
  })
  bot.on('entityHurt', (e, fuente) => {
    if (!bot.entity || e !== bot.entity) return
    const de = fuente ? fuente.username || fuente.name || null : null, ahora = Date.now()
    const lejos = fuente && fuente.position ? +dist(bot, fuente).toFixed(1) : undefined
    if (golpe && ahora - golpe.t < GOLPES && golpe.e.seq > informe(bot).leido.seq && golpe.e.datos.de === de) {
      Object.assign(golpe.e.datos, { n: golpe.e.datos.n + 1, salud: bot.health, ...(lejos !== undefined ? { dist: lejos } : {}) })
      golpe.t = ahora
      return
    }
    golpe = { t: ahora, e: evento(bot, 'golpe', { de, ...(lejos !== undefined ? { dist: lejos } : {}), n: 1, salud: bot.health }) }
  })
  bot.on('time', () => {
    const t = bot.time.timeOfDay, n = t >= NOCHE[0] && t <= NOCHE[1]
    if (noche !== null && n !== noche) evento(bot, n ? 'noche' : 'dia', { hora: t })
    noche = n
  })
  bot.on('death', () => { muerto = true })
  bot.on('spawn', () => { if (muerto) { muerto = false; evento(bot, 'reaparecido', pos()) } })
  const vigia = setInterval(() => {
    if (!bot.entity) return
    let dentro
    try { dentro = encerrado(bot) } catch (_) { return }
    if (dentro && !refugiado) evento(bot, 'refugiado', pos())
    refugiado = dentro
  }, CADA)
  bot.once('end', () => clearInterval(vigia))
  return true
}

module.exports = { informe, habilidad, orden, tramo, evento, desde, marcarLeido, fallos, cuenta, vigilar, AVISOS, MAX }
