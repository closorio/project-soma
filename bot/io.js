// Ío en Minecraft: uno o varios personajes Mineflayer, cada uno con su puerto de control local (127.0.0.1:PUERTO).
// Uso: node io.js [NOMBRE[:PUERTO[:PERFIL[:MODO]]] ...]   Sin nada: Soma:3001:recolector (hasta el 2026-10-15 se llamó Io). Ejemplo:
//   node io.js Soma Eco:3002:cooperativo   → Soma en 3001 (recolector) y Eco en 3002 (cooperativo), en el mismo proceso.
//   Personajes: Soma (3001), Eco (3002), Iris (3003) y Alma (3004, la gobierna la mente: ../mente/alma/). Antes, Io = Soma y Claude = Alma.
// Modos (F4): «ordenes» (por defecto: quieto hasta que se le pide algo) o «libre» (la red decide según su perfil, en bucle).
//   MODO en el argumento, o IO_MODO=libre|ordenes para todos; IO_DESPUES=quieto|libre: qué hace al terminar una orden.
//   Órdenes en lenguaje sencillo por el chat del juego («Soma, tala 3 troncos», «todos, quietos»; los nombres antiguos Io y Claude valen como alias) y por el puerto
//   (`orden TEXTO`, `orden_esperar TEXTO`); el interruptor también con `modo [libre|ordenes] [despues quieto|libre]`. Ver README.md.
// Los personajes comparten la red (cerebro.js la lee una vez) y cada uno lleva su memoria (bot.yo) y su perfil (perfiles/).
// Los demás personajes no cuentan como jugadores humanos; IO_BOTS=Nombre1,Nombre2 añade los de otros procesos.
// Eventos (chat, entradas, salud) salen por stdout, una línea cada uno (con varios personajes, precedida de [Nombre]).
// Órdenes: GET /orden?c=<comando>  (ver ordenes() abajo).
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const http = require('http')
const fs = require('fs')
const path = require('path')
// Servidor de Minecraft y datos del mundo (bot/mundo.js): el del usuario (localhost:25565, 1.21.11) por defecto; IO_SERVIDOR=supervivencia,
// el mundo de pruebas aparte (../servidor-supervivencia, puerto 25566); IO_SERVIDOR=companero, el server de un compañero por wifi
// (mundos/companero/mundo.json, 26.1); IO_HOST, IO_PORT_SERVIDOR e IO_VERSION mandan sobre todos. Va antes que los demás módulos,
// que leen sus datos del mundo al cargarse (zonas, cofres, obras, registro).
let mundo
try { mundo = require('./mundo') } catch (e) { console.error(e.message); process.exit(1) }

// ---- Cerebro (red de F1), habilidades de alto nivel (F2) y perfiles (F3) ----
const cerebroRed = require('./cerebro')
const habilidades = require('./habilidades')
const observacion = require('./observacion')
const zonas = require('./zonas')
const CHAT_ZONA = new Set() // órdenes de chat ya atendidas (varios personajes oyen lo mismo)
const ESQUINAS = new Map() // usuario -> primera esquina de la zona que está marcando
// «continúa» (2026-11-01): las órdenes de trabajo que se retoman si otra las interrumpe, y con qué les faltaba. Moverse, pelear o
// comer no se retoman: «continúa» es volver al trabajo
const ORDENES_TRABAJO = new Set(['tala', 'mina', 'construye', 'deshaz', 'cazar', 'caza', 'recoge', 'guarda', 'saca', 'dame', 'explora',
  'fabrica', 'funde', 'pon', 'ilumina', 'baja', 'sube', 'agua', 'vierte', 'duerme'])
function pendienteDe(o, r) {
  if (!ORDENES_TRABAJO.has(o.tipo)) return null
  if (o.tipo === 'tala' && r.troncos != null) return o.n - r.troncos > 0 ? { ...o, n: o.n - r.troncos } : null
  if (o.tipo === 'mina' && r.hechos != null) return o.n - r.hechos > 0 ? { ...o, n: o.n - r.hechos } : null
  if (o.tipo === 'construye' && o.obra) return { ...o, retomar: o.obra }
  return { ...o }
}
const textoDe = (p, texto) => (p.tipo === 'tala' ? `tala ${p.n} troncos` : p.tipo === 'mina' ? texto.replace(/\d+/, String(p.n)) : texto)
// El aviso al no talar lo protegido: las zonas por su nombre y, aparte, si hay zonas de trabajo y el tronco cae fuera
function noTalo(nombres) {
  const otras = nombres.filter(n => n !== zonas.FUERA_DE_TRABAJO)
  return [otras.length ? `No talo en ${otras.join(', ')}: es zona protegida.` : '',
    otras.length < nombres.length ? 'Solo talo dentro de la zona de trabajo.' : ''].filter(Boolean).join(' ')
}
const { PERSONAJES, esBot, pruebas, BOTS } = require('./habilidades/comun')
const depositar = require('./habilidades/depositar')
const cofres = require('./cofres')
const arbolado = require('./arbolado')
const ordenes = require('./ordenes')
const registro = require('./registro')
const informe = require('./informe') // F6: informe del cuerpo hacia la mente (orden `resumen`)
const memoria = require('./memoria')
const { esperar, moverHasta, jugadorCercano, prudentes } = require('./habilidades/comun')
const { GoalSeguirFuera } = require('./habilidades/ir_a_jugador')
const reflejos = require('./reflejos') // F7.2: reflejos de supervivencia (comer, huir, defenderse, apartarse, equipar)
const sv = require('./habilidades/sv')
const taxonomia = require('./habilidades/taxonomia') // «defiéndeme»: el neutral que pega al protegido pasa a ser amenaza
const DIARIO = mundo.diario
const SERVIDOR = { // host, puerto y versión de Minecraft del mundo (bot/mundo.js); IO_HOST, IO_PORT_SERVIDOR e IO_VERSION los afinan
  host: process.env.IO_HOST || mundo.host,
  port: parseInt(process.env.IO_PORT_SERVIDOR) || mundo.puertoMc,
  version: process.env.IO_VERSION || mundo.version,
}
if (!SERVIDOR.host) throw new Error(`mundo ${mundo.nombre}: falta la IP del servidor (servidor.host en mundos/${mundo.nombre}/mundo.json, o IO_HOST)`)
const fecha = () => new Date().toLocaleString('sv-SE').slice(0, 16) // 2026-10-14 18:05
const AVISO_LLENOS = { desde: 0 } // los cofres llenos se apuntan una vez en el diario por proceso, hasta que vuelva a caber algo
// F4: personajes de este proceso por nombre (una orden a «todos» o a otro personaje), órdenes de chat ya atendidas, argumentos de
// cada habilidad como los pide ejecutor.py, duración de un tramo de modo libre y límites de seguridad de las órdenes.
const VIVOS = new Map()
const CHAT_ORDEN = new Set()
// IO_AMOS=Nombre1,Nombre2: solo esos jugadores mandan por el chat (órdenes y !zona); vacío, cualquier humano. El puerto no cambia.
const AMOS = new Set((process.env.IO_AMOS || '').split(',').map(s => s.trim()).filter(Boolean))
const SKIN = (process.env.IO_SKIN || '').trim()
// F7.5: los argumentos y la decisión del modo libre están en libre.js (la observación que pide la política: obs u obs_sv).
const libre = require('./libre')
const persistente = require('./memoria_persistente') // F8.0a: lo que sobrevive a reiniciar (fuera del mundo del usuario)
const rutinas = require('./rutinas')
// Las habilidades que cambian el terreno: su línea [terreno] (rotos y puestos) deja al banco reponerlo (probar_noche.py).
const TERRENO = new Set(['refugiarse', 'salir_del_refugio', 'cavar_escalera', 'subir_a_superficie', 'desatascarse', 'explorar', 'verter', 'ir_a_mena']) // F8.0a: los perfiles v1 como estilos de rutinas (rutina_madera, rutina_noche)
const decisores = require('./decisores') // F8.0a: quién decide en libre, por personaje (red, guion o capataz)
const { ARGS } = libre
const REPOSO_MS = 2000 // F7.2: cada cuánto mira los reflejos de supervivencia en reposo
// El modo libre va por tramos (un episodio de la red cada uno; una línea en el diario): 5 min con la red del mundo del usuario,
// un día de Minecraft (1200 s) con la de supervivencia (libre.TRAMO).
const SIGUEME_MAX = 600000 // «sígueme» dura como mucho 10 min (y «defiéndeme», igual)
const ESCOLTA_RADIO = 12 // «protégeme»: un hostil a ≤ 12 bloques de él o del bot pide pelea aunque aún no haya pegado
const ESCOLTA_REINTENTO_MS = 8000 // y si atacar se negó (creeper, salud baja…), no se le vuelve a pedir en 8 s
const AGRESOR_ESCOLTA_MS = 10000 // un golpe al protegido de hace más de 10 s ya no pide pelea
const NULA = /^(ya estaba|sin amenaza|sin árbol|nada que recoger|no veo|sin tronco al alcance)/ // decisiones que no cambian nada
const PALABRAS = { ordenes: 'órdenes', libre: 'libre' }
// Lo que dice al aceptar una orden con acción (por el chat, y la respuesta inmediata de `orden` por el puerto).
const AVISOS = { ven: () => 'Voy.', sigueme: () => 'Te sigo.', escolta: (o) => (o.a ? `Cubro a ${o.a}.` : 'Te cubro.'), quedate: () => 'Me quedo aquí.', recoge: () => 'Recojo lo que hay cerca.',
  tala: (o) => `Voy a talar ${o.n} tronco${o.n > 1 ? 's' : ''}.`, guarda: () => 'Voy al cofre.',
  huye: (o) => (o.de ? `Me alejo de ${o.de}.` : 'Me alejo de la amenaza.'),
  // F7.2
  come: () => 'Como algo.', ataca: (o) => (o.de ? `Voy a por ${o.de}.` : o.nombre ? `Voy a por ${o.nombre}.` : 'Voy a por el monstruo más cercano.'), refugiate: () => 'Me refugio.',
  sal: () => 'Salgo del refugio.', duerme: () => 'Voy a la cama.', dame: (o) => (o.objeto === 'todo' ? 'Te doy lo que llevo.' : `Te doy ${o.n || 'los'} ${o.objeto}.`), fabrica: (o) => (o.objeto ? `Fabrico: ${o.objeto.replace(/_/g, ' ')}.` : 'Fabrico lo siguiente que me falta.'),
  equipate: () => 'Me equipo.', apartate: () => 'Me aparto del peligro.', caza: () => 'Voy a por comida.',
  // F6
  explora: (o) => `Voy a explorar ${o.rumbo === '-' ? 'por ahí' : 'hacia el ' + o.rumbo}, ${o.n} bloques${o.nada ? ', nadando si hace falta' : ''}.`, mina: (o) => `Voy a minar ${o.n} de ${o.bloque}.`,
  construye: (o) => `Voy a construir: ${o.plano}.`, deshaz: (o) => `Voy a deshacer ${o.obra || 'la obra'}.`, campamento_vuelve: () => 'Vuelvo al campamento.',
  // F8.0b
  cazar: (o) => `Voy a cazar ${o.n} ${o.animal}.`, agua: () => 'Voy a llenar el cubo.', vierte: (o) => `Vierto el ${o.que}.`,
  funde: (o) => `Voy a fundir ${o.n} de ${o.entrada}.`, ilumina: () => 'Pongo antorchas.', pon: (o) => `Pongo ${o.objeto}.`,
  saca: (o) => `Voy al cofre a por ${o.objeto || 'eso'}.`, desatascate: () => 'Busco por dónde salir.', sube: () => 'Subo a la superficie.',
  baja: (o) => (o.y !== null ? `Bajo por una escalera hasta y = ${o.y}.` : `Bajo ${o.n} por una escalera.`) }

// Personajes femeninos: hablan de sí en femenino por el chat («me quedo quieta»).
const FEMENINAS = new Set(['Alma'])

class Personaje {
  constructor(nombre, puerto, perfil, varios = false, modo = 'ordenes', despues = 'quieto', decisor = decisores.crear()) {
    Object.assign(this, { nombre, puerto, varios, decisor })
    this.visible = nombre === 'Io' ? 'Ío' : nombre
    this.quieto = FEMENINAS.has(nombre) ? 'quieta' : 'quieto'
    this.yo = { nombre } // memoria del personaje: cada bot nuevo (reconexiones) recibe la misma
    persistente.alArrancar(this.yo) // F8.0a: base y refugio de la sesión anterior (mundos/<mundo>/memoria_<nombre>.json)
    // Tarea en marcha (cerebro o habilidad): `para` o una tarea nueva la cancelan, para que no se pisen dos bucles.
    this.tarea = { cancelada: false }
    // F4: modo («ordenes» | «libre»), qué hace al terminar una orden («quieto» | «libre»), la orden en curso, la última y lo que
    // está haciendo ahora (promesa: una orden nueva espera a que la anterior suelte el navegador).
    Object.assign(this, { modo: 'ordenes', despues, enCurso: null, ultima: null, ocupado: Promise.resolve(), libre: false, tramo: null })
    this.modoInicial = modo
    // F7.2: reflejos de supervivencia: cuántas habilidades hay en marcha, el reflejo en curso (promesa) y su tarea (una orden nueva
    // la cancela); en reposo se miran cada REPOSO_MS
    Object.assign(this, { enHabilidad: 0, reflejando: null, tareaReflejo: null })
    setInterval(() => this.reposo(), REPOSO_MS)
    VIVOS.set(nombre, this)
    this.conectar()
    observacion.ponerPerfil(this.bot, perfil)
    this.ordenes = this.crearOrdenes()
    http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://x')
      const [c, ...r] = (u.searchParams.get('c') || '').trim().split(/\s+/)
      this.de = u.searchParams.get('de') || null // F6: quién manda por el puerto («mente»: la sesión de Claude; si no, Ío u otro)
      let out
      try { out = this.ordenes[c] ? await this.ordenes[c](r.join(' ')) : 'órdenes: ' + Object.keys(this.ordenes).join(', ') }
      catch (e) { out = 'fallo: ' + e.message }
      res.end(out + '\n')
    }).listen(puerto, '127.0.0.1')
  }

  ev(t) { console.log(this.varios ? `[${this.nombre}] ${t}` : t) }

  // Conecta (o reconecta) el bot; las órdenes usan siempre el `this.bot` actual.
  conectar() {
    const bot = this.bot = mineflayer.createBot({
      host: SERVIDOR.host, port: SERVIDOR.port, username: this.nombre, auth: 'offline', version: SERVIDOR.version,
    })
    if (mundo.tickEnd) require('./tick_end').instalar(bot) // A0 del asistente: 26.3 expulsa sin client_tick_end
    bot.once('login', () => require('./velocidad').instalar(bot)) // tras los plugins de mineflayer: su oyente va antes que el nuestro
    bot.yo = this.yo
    BOTS.set(this.nombre, bot) // los compañeros del proceso leen de aquí mi objetivo (fase C)
    bot.loadPlugin(pathfinder)
    require('./puertas').vigilar(bot) // 2026-11-01: abre la puerta que tiene delante y la cierra al dejarla atrás
    require('./jugadores').vigilar(bot) // 2026-11-01: dónde vio a cada jugador (para «ataca a NOMBRE» fuera de la vista)
    informe.vigilar(bot) // F7.1: hambre, golpe, noche, día, refugiado, reaparecido (solo fuera del mundo del usuario)
    sv.vigilarGolpes(bot, () => setImmediate(() => this.reposo()), (n) => esBot(n) || AMOS.has(n)) // F7.2: los golpes de monstruos, para el reflejo de defensa
    // 2026-10-31: en el server Paper 26.3 del compañero el bot planea bien pero no avanza. Si el server rechaza un movimiento lo
    // recoloca (forcedMove); eso y por qué el navegador rehace la ruta van al registro (make move-log), como mucho 1 línea / 2 s
    const mov = { n: 0, t: 0 }
    bot.on('forcedMove', () => {
      mov.n++
      if (Date.now() - mov.t < 2000) return
      mov.t = Date.now(); this.ev(`[mov] el server me recolocó en ${bot.entity.position.floored()} (${mov.n} en total)`)
    })
    const rehechas = { t: 0 }
    bot.on('path_reset', (r) => {
      if (!(this.enCurso || this.enHabilidad || this.libre) || r === 'goal_updated' || r === 'goal_moved' || Date.now() - rehechas.t < 2000) return
      rehechas.t = Date.now(); this.ev(`[mov] ruta rehecha: ${r} en ${bot.entity.position.floored()}`)
    })
    bot.once('spawn', () => {
      bot.pathfinder.setMovements(zonas.aplicar(new Movements(bot)))
      this.ev(`[mc] ${this.visible} ha aparecido en ` + bot.entity.position.floored())
      if (SKIN) bot.chat('/skin set ' + SKIN) // IO_SKIN: una skin del server (SkinsRestorer, p. ej. «sr createcustom»), a cada conexión
      if (this.conectado) informe.evento(bot, 'reconectado', bot.entity.position.floored().toArray())
      this.conectado = true
      if (this.modoInicial) { const m = this.modoInicial; this.modoInicial = null; if (m === 'libre') this.ponerModo('libre', 'al arrancar') }
    })
    bot.on('chat', (u, m) => {
      if (u === bot.username) return
      this.ev(`[mc] <${u}> ${m}`)
      const t = m.trim()
      if (esBot(u)) return // los personajes no se dan órdenes entre ellos
      if (AMOS.size && !AMOS.has(u)) { // con dueños, el resto solo conversa; si le piden algo por su nombre, se ríe
        const clave = u + '|' + t
        if (ordenes.destinatario(t, [...VIVOS.keys()]).a && !CHAT_ORDEN.has(clave)) {
          CHAT_ORDEN.add(clave); setTimeout(() => CHAT_ORDEN.delete(clave), 3000)
          bot.chat('jaja bobo')
        }
        return
      }
      if (!/^!zona\b/i.test(t)) { // F4: una orden a un personaje de este proceso por su nombre (o a «todos»)
        const { a } = ordenes.destinatario(t, [...VIVOS.keys()])
        const clave = u + '|' + t // varios personajes oyen el mismo chat: la atiende el primero que la ve, para todos los destinatarios
        if (!a || CHAT_ORDEN.has(clave)) return
        CHAT_ORDEN.add(clave); setTimeout(() => CHAT_ORDEN.delete(clave), 3000)
        despachar(this, t, { via: 'chat', usuario: u }).catch(e => this.ev('[orden] fallo: ' + e.message))
        return
      }
      const clave = u + '|' + t // varios personajes oyen el mismo chat: responde solo el primero en verlo
      if (CHAT_ZONA.has(clave)) return
      CHAT_ZONA.add(clave); setTimeout(() => CHAT_ZONA.delete(clave), 3000)
      let r
      try { r = this.ordenZona(u, t.replace(/^!zona\s*/i, '')) } catch (e) { r = 'fallo: ' + e.message }
      for (const linea of String(r).split('\n').slice(0, 6)) bot.chat(linea)
    })
    bot.on('playerJoined', (p) => { if (p.username !== bot.username) this.ev(`[mc] ${p.username} entró`) })
    bot.on('playerLeft', (p) => this.ev(`[mc] ${p.username} salió`))
    bot.on('death', () => {
      this.ev(`[mc] ${this.visible} ha muerto`); informe.evento(bot, 'muerto', bot.entity?.position?.floored().toArray())
      try { persistente.anotarMuerte(bot) } catch (e) { this.ev('[memoria] no se pudo guardar la muerte: ' + e.message) }
    })
    bot.on('health', () => {
      if (bot.health < 8) { this.ev(`[mc] salud baja: ${bot.health}`); if (!this.saludBaja) informe.evento(bot, 'salud_baja', bot.health) }
      this.saludBaja = bot.health < 8 // un aviso por cada bajada por debajo de 8, no uno por golpe
    })
    bot.on('kicked', (r) => { this.ev('[mc] expulsado: ' + JSON.stringify(r)); informe.evento(bot, 'expulsado', String(r).slice(0, 80)) })
    bot.on('error', (e) => this.ev('[mc] error: ' + e.message))
    bot.on('end', () => { this.ev('[mc] desconectado; reconectando en 5 s'); informe.evento(bot, 'desconectado'); setTimeout(() => this.conectar(), 5000) })
  }

  // Una tarea nueva cancela la anterior. Fuera del bucle del modo libre (libre = false), cualquier tarea es una orden: pasa a
  // modo órdenes (la red deja de decidir), también con las órdenes directas del puerto (hab, cerebro, talar, ir, ven…).
  nuevaTarea(libre = false) {
    this.tarea.cancelada = true
    if (!libre && this.tareaReflejo) this.tareaReflejo.cancelada = true // una orden manda sobre un reflejo en reposo
    if (!libre && this.modo === 'libre') this.ponerModo('ordenes', 'orden directa del puerto')
    return (this.tarea = { cancelada: false, libre })
  }

  estado() {
    const bot = this.bot, p = bot.entity.position
    const otros = Object.values(bot.players).filter(x => x.entity && x.username !== bot.username)
    const lista = (v) => v.map(x => `${x.username}@${x.entity.position.floored()}`).join('; ')
    const bots = otros.filter(x => esBot(x.username)) // los demás personajes, aparte de los jugadores humanos
    const inv = bot.inventory.items().map(i => `${i.name}x${i.count}`).join(', ') || 'vacío'
    return `pos ${p.floored()} · salud ${bot.health} · hambre ${bot.food} · jugadores: ${lista(otros.filter(x => !esBot(x.username))) || 'ninguno'}` +
      (bots.length ? ` · personajes: ${lista(bots)}` : '') + ` · inventario: ${inv}`
  }

  // talar: el tronco más cercano (≤ 48 bloques) que no esté protegido (../zonas.json). Nunca tala dentro de una zona ni un árbol
  // marcado: si lo más cercano está protegido, lo dice por el chat del juego y va a por el de fuera más cercano; si no ve ninguno
  // de fuera, se niega (y también lo dice). Después recoge lo caído sin romper bloques (habilidad recoger).
  async talar() {
    const bot = this.bot
    const ts = bot.findBlocks({ matching: b => b.name.endsWith('_log'), maxDistance: 48, count: 2000 })
    if (!ts.length) return 'no veo troncos cerca'
    const libre = ts.find(v => !zonas.talaProtegida(v.x, v.y, v.z))
    const antes = new Set(ts.slice(0, libre ? ts.indexOf(libre) : ts.length).map(v => zonas.protegidoPor(v.x, v.y, v.z)))
    const cuales = [...antes].join(', ')
    if (!libre) { const t = `No talo: los troncos que veo están en zona protegida (${cuales}).`; bot.chat(t); return t }
    const { x, y, z } = libre
    if (antes.size) bot.chat(`${noTalo([...antes])} Voy a por el tronco de ${x}, ${z}.`)
    const tarea = this.nuevaTarea()
    await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 2))
    const b = bot.blockAt(libre)
    if (!b || !b.name.endsWith('_log')) return `el tronco de ${x},${y},${z} ya no está`
    if (zonas.talaProtegida(x, y, z) || cofres.esCofre(x, y, z)) { // zonas.json se relee solo: pudo cambiar mientras andaba
      const t = zonas.talaProtegida(x, y, z) ? noTalo([zonas.protegidoPor(x, y, z)]) : 'No talo en el cofre: es zona protegida.'; bot.chat(t); return t
    }
    await bot.dig(b)
    const r = await habilidades.ejecutar(bot, 'recoger', ['6', '_log'], tarea)
    return `tronco de ${b.name} picado en ${x},${y},${z}` + (antes.size ? ` (no talé en ${cuales})` : '') +
      (r.exito ? `; recogidos ${r.objetos}` : `; sin recoger: ${r.causa}`)
  }

  // Percepción compacta para el ciclo de la «mente»: estado + entorno cercano.
  percibir() {
    const bot = this.bot, p = bot.entity.position
    const bajo = bot.blockAt(p.offset(0, -1, 0))?.name
    const cuenta = {}
    for (const pos of bot.findBlocks({ matching: b => b.name !== 'air', maxDistance: 8, count: 400 })) {
      const n = bot.blockAt(pos).name
      cuenta[n] = (cuenta[n] || 0) + 1
    }
    const bloques = Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => `${n}x${c}`).join(', ')
    const ents = Object.values(bot.entities).filter(e => e !== bot.entity && e.position.distanceTo(p) < 24)
      .map(e => `${e.name || e.username}@${e.position.floored()}`).slice(0, 10).join('; ') || 'nada'
    const hora = bot.time.timeOfDay
    return `${this.estado()} · pisa ${bajo} · hora ${hora} (${hora > 12500 ? 'noche' : 'día'}) · bloques cercanos: ${bloques} · entidades: ${ents}`
  }

  // Respuesta en una línea JSON: {"habilidad","exito","causa",...,"ms"}; si después saltó el reflejo de guardar, también "deposito".
  // Si había otra en marcha (p. ej. el bucle del modo libre), espera a que suelte el navegador (≤ 3 s) para que no se pisen.
  async habilidad(nombre, a) {
    const previo = this.ocupado, tarea = this.nuevaTarea()
    try { this.bot.pathfinder.setGoal(null); this.bot.stopDigging() } catch (_) {}
    await Promise.race([previo, esperar(3000)]).catch(() => {})
    return JSON.stringify(await this.ejecutarHabilidad(nombre, a, tarea))
  }

  // Una habilidad con la tarea dada (la de una orden o la del bucle del modo libre), y después el reflejo de guardar.
  async ejecutarHabilidad(nombre, a, tarea) {
    const args = Array.isArray(a) ? a : a ? String(a).split(/\s+/).filter(Boolean) : []
    if (rutinas.RUTINAS[nombre]) { // F8.0a: una rutina son varias habilidades, cada una por aquí (registro, reflejos, cofre)
      const r = await rutinas.ejecutar(this.bot, nombre, args, tarea, (h, x, t) => this.ejecutarHabilidad(h, x, t))
      this.ev(`[rutina] ${nombre} ${args.join(' ')} → ${r.exito ? 'éxito' : 'fallo'}: ${r.causa} (${r.ms} ms; ${(r.decisiones || []).join(' ')})`)
      return r
    }
    this.enHabilidad++
    try {
      const marcha = habilidades.ejecutar(this.bot, nombre, args, tarea)
      this.ocupado = marcha
      const r = await marcha
      // depositar no es una acción de la red: no cambia la «habilidad anterior» de la observación
      if (nombre !== 'depositar') observacion.anotarHabilidad(this.bot, nombre, r.exito)
      this.ev(`[hab] ${nombre} ${args.join(' ')} → ${r.exito ? 'éxito' : 'fallo'}: ${r.causa} (${r.ms} ms)`)
      this.terreno(nombre, r)
      try { persistente.trasHabilidad(this.bot) } catch (e) { this.ev('[memoria] no se pudo guardar: ' + e.message) }
      this.anotarHabilidad(nombre, args.join(' '), r, tarea)
      if (nombre !== 'depositar' && !tarea.cancelada) await (this.ocupado = this.reflejoGuardar(r, tarea))
      if (sv.activos(this.bot)) { // F7.2: huir, atacar y refugiarse ya responden a un golpe; después, los reflejos de supervivencia
        if (['huir', 'atacar', 'refugiarse'].includes(nombre)) reflejos.anotar(this.bot, nombre, r)
        if (!tarea.cancelada) { const p = this.reflejosSv(nombre, tarea); this.ocupado = p; const hechos = await p; if (hechos.length) r.reflejos = hechos }
      }
      return r
    } finally { this.enHabilidad-- }
  }

  // F7.5: los bloques que cambian refugiarse y salir_del_refugio ([x, y, z, bloque]: rotos con lo que había, puestos con lo que
  // puso), una línea en el registro del bot, para que el banco (servidor-supervivencia/probar_noche.py) reponga el terreno.
  terreno(nombre, r) { // F8.0b: también las habilidades que cavan o ponen (TERRENO)
    if (!TERRENO.has(nombre) || !r || !((r.rotos || []).length || (r.puestos || []).length)) return
    this.ev(`[terreno] ${JSON.stringify({ habilidad: nombre, rotos: r.rotos || [], puestos: r.puestos || [] })}`)
  }

  // ---- F7.2 · reflejos de supervivencia (reflejos.js) ----

  // Los reflejos que tocan, uno tras otro (hasta 4 por ronda; tras huir de noche, refugiarse), con la tarea dada: la de quien pidió
  // la habilidad (tras ella) o la propia del reposo. Cada uno va al informe (reflejo: true) y se devuelven para la respuesta.
  async reflejosSv(h, tarea) {
    const hechos = []
    let previo = h, pendiente = null
    for (let k = 0; k < 4 && !tarea.cancelada && sv.activos(this.bot); k++) {
      const x = pendiente || reflejos.siguiente(this.bot, { h: previo, hechos })
      pendiente = null
      if (!x) break
      const r = await habilidades.ejecutar(this.bot, x.habilidad, x.args, tarea)
      reflejos.anotar(this.bot, x.habilidad, r)
      hechos.push({ habilidad: x.habilidad, motivo: x.motivo, exito: !!r.exito, causa: String(r.causa || ''), ms: r.ms })
      this.ev(`[reflejo] ${x.habilidad} ${x.args.join(' ')} (${x.motivo}) → ${r.exito ? 'éxito' : 'fallo'}: ${r.causa} (${r.ms} ms)`)
      this.terreno(x.habilidad, r)
      informe.habilidad(this.bot, { nombre: x.habilidad, args: x.args.join(' '), exito: !!r.exito, causa: String(r.causa || ''), ms: r.ms,
        reflejo: true, motivo: x.motivo })
      if (x.luego) pendiente = x.luego
      previo = x.habilidad
    }
    return hechos
  }

  // En reposo (ninguna habilidad, orden ni reflejo en marcha; en modo libre, entre dos decisiones: el bucle espera a que acabe):
  // cada REPOSO_MS y en cuanto le golpea un monstruo.
  reposo() {
    const bot = this.bot
    if (this.enHabilidad || this.reflejando || this.enCurso || this.enIr || !bot || !bot.entity || !sv.activos(bot)) return
    let x = null
    try { x = reflejos.siguiente(bot, {}) } catch (e) { this.ev('[reflejo] error: ' + e.message); return }
    if (!x) return
    const tarea = this.tareaReflejo = { cancelada: false }
    this.reflejando = this.reflejosSv(null, tarea).catch(e => this.ev('[reflejo] error: ' + e.message))
      .finally(() => { this.reflejando = null; if (this.tareaReflejo === tarea) this.tareaReflejo = null })
  }

  // F6: cada habilidad al informe; las causas que la mente debe saber enseguida (amenaza, bloqueado, agua) también como evento.
  anotarHabilidad(nombre, args, r, tarea) {
    const causa = String(r.causa || '')
    informe.habilidad(this.bot, { nombre, args, exito: !!r.exito, causa, pos: r.pos, ms: r.ms, libre: !!(tarea && tarea.libre) })
    const clave = causa.split(':')[0].trim()
    if (['amenaza', 'bloqueado', 'agua'].includes(clave)) informe.evento(this.bot, clave, { habilidad: nombre, ...(r.amenaza ? { amenaza: r.amenaza } : {}), ...(r.pos ? { pos: r.pos } : {}) })
  }

  // Reflejo (no lo decide la red): con el inventario lleno hasta el umbral (80 % de los huecos por defecto), ir al cofre, guardar lo
  // recogido y volver. Se añade a la respuesta de la habilidad que acaba de terminar; su tiempo cuenta en el episodio.
  async reflejoGuardar(r, tarea) {
    if (!depositar.necesita(this.bot)) return
    const d = await habilidades.ejecutar(this.bot, 'depositar', ['volver'], tarea)
    const aj = depositar.ajustes(this.bot)
    if (d.causa === 'cofres llenos') this.avisarLlenos(d, aj)
    else if (!d.exito || d.quedan) aj.fallo = Date.now()
    else aj.llenos = AVISO_LLENOS.desde = 0
    this.ev(`[cofre] ${d.exito ? 'guardado' : 'fallo'}: ${d.causa} · ${JSON.stringify(d.guardado || {})} (${d.ms} ms)`)
    informe.habilidad(this.bot, { nombre: 'depositar', args: 'volver', exito: !!d.exito, causa: String(d.causa || ''), ms: d.ms, guardado: d.guardado || {}, reflejo: true })
    const { habilidad, ...resto } = d
    r.deposito = resto
  }

  // Cofres llenos: en vez de reintentar en silencio, lo dice por el chat del juego (cada vez que lo encuentra lleno: el reflejo lo
  // reintenta cada 10 min) y lo apunta en el diario (mente/diario.md) la primera vez, hasta que vuelva a caber algo.
  avisarLlenos(d, aj) {
    aj.llenos = Date.now()
    const q = d.quedan || {}, n = (f) => Object.entries(q).filter(([k]) => f(k)).reduce((a, [, c]) => a + c, 0)
    const total = n(() => true), troncos = n(k => k.endsWith('_log'))
    const nombres = cofres.lista().map(c => c.nombre).join(' y ')
    const t = `Los cofres están llenos (${nombres}): no me cabe nada más. Me quedan ${total} cosas sin guardar` +
      (troncos ? `, ${troncos} de ellas troncos` : '') + '. Lo vuelvo a intentar en 10 minutos.'
    this.bot.chat(t)
    this.ev('[cofre] aviso: ' + t)
    informe.evento(this.bot, 'cofres_llenos', { quedan: q })
    if (AVISO_LLENOS.desde) return
    AVISO_LLENOS.desde = Date.now()
    const linea = `**Aviso del reflejo de guardar (${fecha()}, ${this.visible}):** los cofres ${nombres} están llenos; no cupo ` +
      `${JSON.stringify(q)}${d.guardado && Object.keys(d.guardado).length ? ` (sí entró ${JSON.stringify(d.guardado)})` : ''}. ` +
      'Lo dije por el chat del juego; el reflejo lo reintenta cada 10 min hasta que haya sitio.'
    try { fs.appendFileSync(DIARIO, linea + '\n') } catch (e) { this.ev('[diario] no pude escribir: ' + e.message) }
  }

  // ---- F4 · modo libre / modo órdenes ----

  // Cambia de modo y lo apunta. A «libre» arranca el bucle de la red; a «ordenes» lo corta (la tarea en marcha se cancela).
  ponerModo(modo, motivo) {
    if (modo === this.modo) { if (modo === 'libre') this.arrancarLibre(); return false }
    const antes = this.modo
    this.modo = modo
    this.motivoModo = motivo
    this.ev(`[modo] ${PALABRAS[antes]} → ${PALABRAS[modo]} (${motivo})`)
    informe.evento(this.bot, 'modo', { de: antes, a: modo, motivo })
    if (modo === 'libre') this.arrancarLibre()
    else if (this.tarea.libre) { this.tarea.cancelada = true; this.bot.pathfinder.setGoal(null) }
    return true
  }

  arrancarLibre() {
    if (this.libre) return // el bucle sigue (o está acabando: al acabar, vuelve a arrancar si el modo sigue siendo libre)
    this.libre = true
    this.bucleLibre().catch(e => this.ev('[libre] error: ' + e.message)).finally(() => {
      this.libre = false
      if (this.modo === 'libre') setTimeout(() => this.arrancarLibre(), 1000)
    })
  }

  troncos() {
    const inv = this.bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((a, i) => a + i.count, 0)
    return inv + depositar.guardados(this.bot).troncos
  }

  // Modo libre: observación → red (la de ejecutor.py, en red.js) → habilidad, en bucle, ≥ 1 s por decisión, por tramos de 5 min
  // (cada tramo es un episodio para la red y una línea en el diario). Tras cinco fallos seguidos espera 10 s, y tras cinco
  // decisiones seguidas que no cambian nada («ya estaba» junto al jugador, «sin amenaza», «sin árbol»…), 5 s entre decisiones.
  // F7.5: con una política de supervivencia (obs_sv), libre.decidir observa con observarSv, los tramos duran un día de Minecraft
  // y, dentro del refugio, sale antes si la habilidad elegida lo necesita (como el simulador); con la del usuario, como siempre.
  async bucleLibre() {
    try { this.decisor.preparar() } catch (e) {
      this.decir(`No puedo decidir solo: ${e.message}. Sigo en modo órdenes.`); this.ponerModo('ordenes', 'sin red'); return
    }
    const tarea = this.nuevaTarea(true)
    await Promise.race([this.ocupado, esperar(3000)]).catch(() => {})
    let fallos = 0, nulas = 0
    try {
      while (!tarea.cancelada && this.modo === 'libre') {
        const bot = this.bot
        if (!bot.entity || !bot.entity.position) { await esperar(2000); continue } // reconectando
        if (this.reflejando) { await this.reflejando; continue } // F7.2: un reflejo en reposo: decidir cuando acabe
        if (!this.tramo || Date.now() - this.tramo.t0 >= this.tramo.T * 1000) { this.cerrarTramo('fin del tramo'); this.abrirTramo() }
        const t0 = Date.now()
        const { obs, datos, d, args, salir } = libre.decidir(bot, this.decisor)
        let r, salida = null
        if (salir) salida = await this.salirAntes(d.habilidad, tarea) // F7.5: solo con obs_sv, dentro del refugio
        try { r = await this.ejecutarHabilidad(d.habilidad, args, tarea) } catch (e) { r = { exito: false, causa: 'error: ' + e.message, ms: 0 } }
        const dec = { habilidad: d.habilidad, exito: !!r.exito, causa: tarea.cancelada && !r.exito ? 'interrumpida' : String(r.causa || ''),
          s: +((Date.now() - t0) / 1000).toFixed(1) }
        if (salida) dec.salida = { exito: !!salida.exito, causa: String(salida.causa || ''), ms: salida.ms }
        if (r.reflejos) dec.reflejos = r.reflejos.map(x => `${x.habilidad}${x.exito ? '' : '✗'}`) // F7.5: lo que hizo el cuerpo después
        if (r.deposito) dec.cofre = { exito: !!r.deposito.exito, guardado: r.deposito.guardado || {} }
        if (this.decisor.alResultado) { // F8.1: el capataz cuenta el paso y apunta las etapas hechas
          try { const nuevas = this.decisor.alResultado(bot, d, r); if (nuevas && nuevas.length) { dec.etapas = nuevas; this.ev(`[capataz] etapas hechas: ${nuevas.join(', ')}`) } } catch (e) { this.ev('[capataz] ' + e.message) }
          dec.etapa = d.etapa || datos.motivo
        }
        if (r.pos) dec.pos = r.pos // el tronco picado (para comprobar que no es de una zona y para reponerlo tras una prueba)
        this.tramo.decisiones.push(dec)
        registro.jsonl({ tipo: 'decision', personaje: this.nombre, modo: 'libre', perfil: datos.perfil, ...dec, q: d.q, obs, datos }, this.ev.bind(this))
        fallos = r.exito ? 0 : fallos + 1
        nulas = NULA.test(dec.causa) ? nulas + 1 : 0
        const resto = (nulas >= 5 ? 5000 : 1000) - (Date.now() - t0)
        for (let k = 0; k < resto / 200 && !tarea.cancelada; k++) await esperar(200) // como el ejecutor: cada decisión, ≥ 1 s
        for (let k = 0; fallos >= 5 && k < 50 && !tarea.cancelada; k++) await esperar(200) // nada sale bien: 10 s sin decidir
        if (fallos >= 5) fallos = 0
      }
    } finally {
      this.cerrarTramo(this.modo === 'libre' ? 'interrumpido' : `paso a órdenes: ${this.motivoModo}`)
    }
  }

  abrirTramo() {
    const T = libre.tramo(this.decisor)
    observacion.iniciar(this.bot, T)
    this.tramo = { t0: Date.now(), T, inicio: registro.hora(), perfil: observacion.perfilDe(this.bot).nombre, troncos0: this.troncos(), decisiones: [] }
  }

  // F7.5: salir del refugio antes de la habilidad que eligió la red (el paso interno _salir() del simulador): no es una decisión
  // ni cambia la «habilidad anterior»; va al informe y a la decisión (salida). Cuenta como habilidad en marcha (sin reflejos a la vez).
  async salirAntes(h, tarea) {
    this.enHabilidad++
    try {
      const marcha = habilidades.ejecutar(this.bot, 'salir_del_refugio', [], tarea)
      this.ocupado = marcha
      const r = await marcha
      this.ev(`[libre] salir_del_refugio (para ${h}) → ${r.exito ? 'éxito' : 'fallo'}: ${r.causa} (${r.ms} ms)`)
      this.terreno('salir_del_refugio', r)
      informe.habilidad(this.bot, { nombre: 'salir_del_refugio', args: '', exito: !!r.exito, causa: String(r.causa || ''), ms: r.ms, libre: true, para: h })
      return r
    } finally { this.enHabilidad-- }
  }

  // Una línea en el diario con todo el tramo: troncos ganados, decisiones (en secuencia), viajes al cofre y por qué acabó.
  cerrarTramo(motivo) {
    const tr = this.tramo
    this.tramo = null
    if (!tr || !tr.decisiones.length) return
    const s = Math.round((Date.now() - tr.t0) / 1000)
    let g = null
    try { g = this.troncos() - tr.troncos0 } catch (_) {}
    const cofre = tr.decisiones.filter(d => d.cofre).length
    const linea = `${tr.inicio}-${registro.hora()} · ${this.visible} · modo libre (red, perfil ${tr.perfil}) · ${s} s, acabó por ${motivo}: ` +
      `${g === null ? '' : `+${g} troncos, `}${tr.decisiones.length} decisiones${cofre ? `, ${cofre} veces al cofre` : ''}: ${registro.secuencia(tr.decisiones)}`
    registro.diario(linea, this.ev.bind(this))
    registro.jsonl({ tipo: 'tramo', personaje: this.nombre, modo: 'libre', perfil: tr.perfil, segundos: s, troncos: g,
      decisiones: tr.decisiones.length, motivo }, this.ev.bind(this))
    informe.tramo(this.bot, { inicio: tr.inicio, perfil: tr.perfil, s, troncos: g, decisiones: tr.decisiones.length, cofre,
      secuencia: registro.secuencia(tr.decisiones), motivo })
  }

  // ---- F6 · informe del cuerpo hacia la mente ----

  // resumen [ultimo|todo]: lo hecho desde la última lectura (órdenes, tramos libres, troncos ganados, viajes al cofre, éxitos y
  // fallos por habilidad), los fallos agrupados, los eventos y lo que hay ahora. Cada llamada marca hasta dónde se ha leído.
  resumen(todo = false) {
    const bot = this.bot, d = informe.desde(bot, todo)
    let troncos = null
    try { troncos = this.troncos() } catch (_) {}
    const cofre = d.habilidades.filter(h => h.nombre === 'depositar' && h.exito)
    const guardado = {}
    for (const c of cofre) for (const [k, n] of Object.entries(c.guardado || {})) guardado[k] = (guardado[k] || 0) + n
    const out = {
      personaje: this.nombre, ...(mundo.nombre === 'usuario' ? {} : { mundo: mundo.nombre }), // el del usuario, sin cambios
      desde: d.leido.t, hasta: registro.hora(), seq: [d.leido.seq, d.seq],
      modo: (() => { try { return this.estadoModo() } catch (_) { return { modo: this.modo, despues: this.despues, perfil: null, orden: null, ultima: this.ultima, tramo: null } } })(),
      hecho: {
        ordenes: d.ordenes.map(({ seq, ...o }) => o),
        tramos: d.tramos.map(({ seq, ...t }) => t),
        troncos_ganados: troncos !== null && d.leido.troncos !== null && !todo ? troncos - d.leido.troncos : null,
        viajes_cofre: { n: cofre.length, guardado },
        habilidades: informe.cuenta(d.habilidades.filter(h => !h.reflejo)),
      },
      fallos: informe.fallos(d.habilidades),
      eventos: d.eventos.map(({ seq, ...e }) => e),
      ahora: this.ahora(),
    }
    informe.marcarLeido(bot, troncos)
    return out
  }

  // Lo que hay ahora: posición, salud, hambre, hora, lo que ve (árbol, jugador, amenaza, compañero), el inventario agrupado
  // (troncos, tablones, herramientas, comida, otros, huecos), el cofre y el campamento.
  ahora() {
    const bot = this.bot
    if (!bot.entity || !bot.entity.position) return { desconectado: true }
    let datos = {}
    try { datos = observacion.observar(bot).datos } catch (e) { datos = { error: e.message } }
    const items = bot.inventory.items(), inv = { troncos: 0, tablones: 0, herramientas: [], comida: 0, otros: {}, huecos: bot.inventory.emptySlotCount() }
    for (const i of items) {
      if (i.name.endsWith('_log')) inv.troncos += i.count
      else if (i.name.endsWith('_planks')) inv.tablones += i.count
      else if (bot.registry.foodsByName[i.name]) inv.comida += i.count
      else if (depositar.conservar(bot, i)) inv.herramientas.push(i.name)
      else inv.otros[i.name] = (inv.otros[i.name] || 0) + i.count
    }
    const aj = depositar.ajustes(bot), hora = bot.time.timeOfDay
    return {
      pos: datos.pos, salud: bot.health, hambre: bot.food, hora: { ticks: hora, noche: hora >= 12480 && hora <= 23520 },
      arbol: datos.arbol, jugador: datos.jugador, amenaza: datos.amenaza, companero: datos.companero, inventario: inv,
      cofre: { activo: aj.activo, guardados: depositar.guardados(bot).troncos, llenos: !!aj.llenos },
      campamento: memoria(bot, 'campamento', () => null),
    }
  }

  decir(t) {
    for (const trozo of String(t).match(/.{1,240}(?:\s|$)/g) || []) try { this.bot.chat(trozo.trim()) } catch (_) {}
  }

  textoEstado() {
    const bot = this.bot, p = bot.entity.position.floored()
    const perfil = observacion.perfilDe(bot).nombre
    const ahora = this.enCurso ? `con la orden «${this.enCurso.texto}»` : this.modo === 'libre' ? (this.decisor.nombre === 'capataz' ? `jugando de ${this.decisor.rol}` : `decidiendo con ${this.decisor.nombre === 'guion' ? 'el guion' : 'la red'}`) : `${this.quieto}, esperando órdenes`
    const n = bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((a, i) => a + i.count, 0)
    const ultima = this.ultima ? ` Última orden: «${this.ultima.texto}», ${this.ultima.exito ? 'hecha' : 'sin hacer'}.` : ''
    return `${this.visible}: modo ${PALABRAS[this.modo]}${this.modo === 'libre' ? ` (perfil ${perfil})` : ''}, ${ahora}; al terminar una orden, ` +
      `${this.despues === 'libre' ? 'vuelvo a modo libre' : 'me quedo ' + this.quieto}. Salud ${Math.round(bot.health)} de 20, ${n} troncos encima, ` +
      `en ${p.x}, ${p.y}, ${p.z}.${ultima}`
  }

  // Estado del modo para el puerto (orden `modo`), en JSON.
  estadoModo() {
    const tr = this.tramo
    return { personaje: this.nombre, modo: this.modo, despues: this.despues, perfil: observacion.perfilDe(this.bot).nombre,
      orden: this.enCurso ? this.enCurso.texto : null, ultima: this.ultima,
      tramo: tr ? { segundos: Math.round((Date.now() - tr.t0) / 1000), decisiones: tr.decisiones.length, troncos: this.troncos() - tr.troncos0 } : null }
  }

  // Orden en lenguaje sencillo (ordenes.js), del chat del juego o del puerto. Devuelve el texto de la respuesta; con esperarFin,
  // la del final de la orden (si no, la de aceptarla: la orden sigue en marcha). Las respuestas también salen por el chat.
  async ordenar(texto, origen, esperarFin = false) {
    const o = ordenes.interpretar(texto)
    // quién manda: el chat (con su usuario), la mente (puerto con de=mente), u otro por el puerto (Ío, pruebas)
    const quien = origen.via === 'chat' ? `chat de ${origen.usuario}` : origen.de === 'mente' ? 'mente' : origen.de ? `puerto (${origen.de})` : 'puerto'
    if (!o) {
      // corto (pedido del usuario, 2026-10-31): la lista entera solo con «ayuda»
      const t = texto.trim() ? `No reconozco «${texto}».` : '¿Qué hago? Di «ayuda» para ver las órdenes.'
      if (origen.via === 'chat') this.decir(t)
      this.anotarOrden({ texto, quien, modo: this.modo, exito: false, resultado: 'no entendida', s: 0 })
      return t
    }
    // 2026-11-01: «continúa» retoma la última orden de trabajo interrumpida, con lo que le faltaba (this.pendiente)
    if (o.tipo === 'continua') {
      if (!this.pendiente) {
        const t = 'No tengo nada a medias.'
        if (origen.via === 'chat') this.decir(t)
        this.anotarOrden({ texto, quien, modo: this.modo, exito: false, resultado: t, s: 0 })
        return t
      }
      const p = this.pendiente
      this.pendiente = null
      const fin = this.ordenAccion(p.o, p.texto, quien)
      if (esperarFin) return (await fin).texto
      fin.catch(e => this.ev('[orden] fallo: ' + e.message))
      return `Sigo con «${p.texto}».`
    }
    const inmediata = { estado: true, ayuda: true, modo: true, despues: true, perfil: true, campamento: true, decisor: true, rol: true }
    if (inmediata[o.tipo]) {
      const modoAntes = this.modo
      const r = this.ordenInmediata(o)
      if (origen.via === 'chat') this.decir(r.texto)
      const resumen = { estado: 'dije mi estado', ayuda: 'dije lo que sé hacer' }[o.tipo] || r.texto
      this.anotarOrden({ texto, quien, modo: modoAntes, exito: r.exito, resultado: resumen, s: 0 })
      return r.texto
    }
    const fin = this.ordenAccion(o, texto, quien)
    if (esperarFin) return (await fin).texto
    fin.catch(e => this.ev('[orden] fallo: ' + e.message))
    return AVISOS[o.tipo] ? AVISOS[o.tipo](o) : 'Voy.'
  }

  // F8.0a: cambia quién decide en libre (red, guion o capataz) y, si se da, la política; el tramo en curso sigue con el anterior.
  ponerDecisor(nombre, ruta = null) {
    let d
    const deAntes = nombre === 'capataz' ? (this.decisor.nombre === 'capataz' ? this.decisor.ruta : null) : this.decisor.nombre === 'capataz' ? null : this.decisor.ruta
    try { d = decisores.crear(nombre, ruta || deAntes) } catch (e) { return { exito: false, texto: e.message + '.' } }
    try { d.preparar() } catch (e) { return { exito: false, texto: `No puedo decidir con ${nombre}: ${e.message}.` } }
    this.decisor = d
    return { exito: true, texto: d.nombre === 'capataz' ? `Juego de ${d.rol}: en modo libre sigo sus etapas.` : `Decido con ${d.nombre} (${path.basename(d.ruta)}).` }
  }

  ordenInmediata(o) {
    switch (o.tipo) {
      case 'estado': return { exito: true, texto: this.textoEstado() }
      case 'ayuda': return { exito: true, texto: ordenes.AYUDA }
      case 'campamento': {
        const p = this.bot.entity.position.floored()
        memoria(this.bot).campamento = p.toArray()
        return { exito: true, texto: `Campamento en ${p.x}, ${p.y}, ${p.z}.` }
      }
      case 'despues':
        this.despues = o.valor
        return { exito: true, texto: o.valor === 'libre' ? 'Vale: al terminar cada orden vuelvo a modo libre.' : `Vale: al terminar cada orden me quedo ${this.quieto}.` }
      case 'perfil': {
        if (!observacion.perfiles().includes(o.perfil)) return { exito: false, texto: `No tengo el perfil ${o.perfil}; hay: ${observacion.perfiles().join(', ')}.` }
        observacion.ponerPerfil(this.bot, o.perfil)
        return { exito: true, texto: `Perfil ${o.perfil}: en modo libre decido como ${o.perfil}.` }
      }
      case 'decisor': return this.ponerDecisor(o.decisor)
      case 'rol': return this.ponerDecisor('capataz', o.rol) // F8.1: juega con el rol v2 (perfiles/v2/<rol>.json)
      case 'modo': {
        if (o.modo === 'libre') {
          try { this.decisor.preparar() } catch (e) { return { exito: false, texto: `No puedo pasar a modo libre: ${e.message}.` } }
          this.ponerModo('libre', 'orden «modo libre»')
          return { exito: true, texto: this.decisor.nombre === 'capataz' ? `Modo libre: juego de ${this.decisor.rol}.` : `Modo libre: decido yo, con ${this.decisor.nombre === 'guion' ? 'el guion' : 'la red'} y el perfil ${observacion.perfilDe(this.bot).nombre}.` }
        }
        this.ponerModo('ordenes', 'orden «modo órdenes»')
        return { exito: true, texto: 'Modo órdenes: espero lo que me digas.' }
      }
    }
  }

  // Orden con acción (ven, sígueme, quédate, tala, recoge, guarda, huye): sale del modo libre, espera a que lo anterior suelte el
  // navegador, la ejecuta con habilidades (que respetan zonas, cofres y límites) y, al terminar, se queda quieto o vuelve a libre
  // (ajuste «al terminar»), salvo «quédate» o si otra orden la ha interrumpido.
  async ordenAccion(o, texto, quien) {
    const modoAntes = this.modo
    if (o.de) o.de = Object.keys(this.bot.players).find(n => n.toLowerCase() === o.de) || o.de // «huye de seppuq» → Seppuq
    if (this.modo === 'libre') this.ponerModo('ordenes', `orden «${texto}»`)
    const previo = this.ocupado
    const tarea = this.nuevaTarea()
    try { this.bot.pathfinder.setGoal(null); this.bot.stopDigging() } catch (_) {}
    await Promise.race([previo, esperar(3000)]).catch(() => {})
    const t0 = Date.now()
    this.enCurso = { texto, t0 }
    if (o.tipo !== 'quedate') this.decir(AVISOS[o.tipo](o))
    let r
    try { r = await this.hacer(o, tarea, quien) } catch (e) { r = { exito: false, texto: 'No pude: ' + e.message } }
    const interrumpida = tarea.cancelada && o.tipo !== 'quedate'
    if (interrumpida) {
      r = { ...r, exito: false, texto: `Dejo «${texto}» por la orden nueva.${o.tipo === 'tala' ? ' ' + r.texto : ''}` }
      const p = pendienteDe(o, r)
      if (p) this.pendiente = { o: p, texto: textoDe(p, texto) }
    } else if (r.exito && ORDENES_TRABAJO.has(o.tipo)) this.pendiente = null // terminada: ya no hay nada a medias
    if (this.enCurso && this.enCurso.t0 === t0) this.enCurso = null
    const vuelve = !tarea.cancelada && o.tipo !== 'quedate' && this.despues === 'libre'
    this.decir(r.texto)
    this.anotarOrden({ texto, quien, modo: modoAntes, exito: r.exito, resultado: r.texto, s: (Date.now() - t0) / 1000, pasos: r.pasos,
      despues: o.tipo === 'quedate' ? 'quieto' : interrumpida ? 'otra orden' : this.despues })
    if (vuelve) this.ponerModo('libre', `al terminar «${texto}»`)
    return r
  }

  anotarOrden({ texto, quien, modo, exito, resultado, s, pasos, despues }) {
    this.ultima = { texto, exito, resultado, hora: registro.hora() }
    const cambio = modo === 'libre' && this.modo !== 'libre' ? 'libre → órdenes' : PALABRAS[modo]
    const linea = `${registro.hora()} · ${this.visible} · modo ${cambio} · «${texto}» (${quien}) → ${exito ? '✓' : '✗'} ${resultado}` +
      ` (${s.toFixed(1)} s${pasos && pasos.length ? `; pasos: ${registro.secuencia(pasos)}` : ''})${despues ? ` · al terminar: ${despues}` : ''}`
    registro.diario(linea, this.ev.bind(this))
    registro.jsonl({ tipo: 'orden', personaje: this.nombre, modo, texto, quien, exito, resultado, segundos: +s.toFixed(1),
      pasos: pasos || [], despues: despues || null }, this.ev.bind(this))
    informe.orden(this.bot, { texto, quien, exito, resultado, s: +s.toFixed(1), pasos: pasos && pasos.length ? registro.secuencia(pasos) : '' })
    if (quien !== 'mente') informe.evento(this.bot, 'orden_externa', { texto, quien, exito }) // la mente sabe que alguien más manda
  }

  // Quien dio la orden por el chat, si lo ve; si no (o por el puerto), el jugador humano más cercano.
  jugadorDe(quien) {
    const u = quien.startsWith('chat de ') ? quien.slice(8) : null
    return (u && this.bot.players[u]?.entity) ? u : ''
  }

  async hacer(o, tarea, quien) {
    const bot = this.bot
    const paso = async (h, a) => {
      const r = await this.ejecutarHabilidad(h, a, tarea)
      const d = { habilidad: h, exito: !!r.exito, causa: String(r.causa || '') }
      if (r.deposito) d.cofre = { exito: !!r.deposito.exito }
      if (r.pos) d.pos = r.pos
      return [r, d]
    }
    switch (o.tipo) {
      case 'quedate': return { exito: true, texto: 'Me quedo aquí.' }
      case 'ven': {
        const [r, d] = await paso('ir_a_jugador', [this.jugadorDe(quien), '60']) // '' = el jugador humano más cercano
        const texto = r.causa === 'llegué' || r.causa === 'ya estaba' ? 'Aquí estoy.'
          : r.zona ? `Estás en ${r.zona}, que es zona protegida: te espero en el borde.` : `No llego: ${r.causa}.`
        return { exito: !!r.exito, texto, pasos: [d] }
      }
      case 'dame': {
        const [r, d] = await paso('dar', [this.jugadorDe(quien), o.objeto, o.n ? String(o.n) : ''])
        const lista = Object.entries(r.dado || {}).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ')
        return { exito: !!r.exito, texto: r.exito ? `Toma: ${lista}.` : `No puedo darte nada: ${r.causa}.`, pasos: [d] }
      }
      case 'sigueme': {
        const u = this.jugadorDe(quien)
        const e = u ? bot.players[u].entity : jugadorCercano(bot)
        if (!e) return { exito: false, texto: 'No te veo.' }
        const meta = new GoalSeguirFuera(e, 2)
        const marcha = moverHasta(bot, meta, () => false, { ms: SIGUEME_MAX, tarea, entidad: e })
        this.ocupado = marcha
        const r = await marcha
        const textos = { 'tiempo agotado': 'Llevo diez minutos siguiéndote: paro aquí.', perdido: 'Te he perdido de vista.', 'sin camino': 'No encuentro camino para seguirte.' }
        return { exito: r === 'tiempo agotado', texto: textos[r] || 'Dejo de seguirte.' }
      }
      case 'escolta': {
        // 2026-11-01: le sigue (también dentro de las zonas vedadas: pisa, no rompe ni pone) y vigila: si un monstruo hostil se le acerca
        // (sv.amenazaCerca) o alguien le pega a él o al bot (sv.esAgresor: monstruos y jugadores que no sean dueños ni personajes),
        // corta, pelea (atacar id:N, con sus negativas: creeper, salud baja, demasiados) y vuelve a seguirle.
        const nombre = o.a ? Object.keys(bot.players).find(n => n.toLowerCase() === o.a) : this.jugadorDe(quien)
        const e = nombre ? bot.players[nombre]?.entity : o.a ? null : jugadorCercano(bot)
        if (!e) return { exito: false, texto: o.a ? `No veo a ${o.a}.` : 'No te veo.' }
        const aliado = (n) => n === e.username || esBot(n) || AMOS.has(n)
        const ignorar = new Map() // id → hasta cuándo no se reintenta (atacar se negó)
        let agresor = null, negado = false
        const alGolpe = (victima, fuente) => {
          if (!sv.esAgresor(bot, victima, fuente, e, aliado)) return
          agresor = { id: fuente.id, t: Date.now() }
          taxonomia.anotarAgresor(bot, fuente) // un neutral que pega cuenta como amenaza un rato (lo mira atacar)
        }
        const golpeador = () => {
          const x = agresor && bot.entities[agresor.id]
          return !!x && x.isValid !== false && Date.now() - agresor.t < AGRESOR_ESCOLTA_MS && x.position.distanceTo(bot.entity.position) <= 16 ? x : null
        }
        const objetivo = () => golpeador() || sv.amenazaCerca(bot, e, ESCOLTA_RADIO, ignorar)
        bot.on('entityHurt', alGolpe)
        const t0 = Date.now()
        let r = 'cancelado'
        try {
          while (!(tarea && tarea.cancelada)) {
            const queda = SIGUEME_MAX - (Date.now() - t0)
            if (queda <= 0) { r = 'tiempo agotado'; break }
            // entra tras él en las zonas vedadas (GoalFollow, no GoalSeguirFuera): pisa, pero no rompe ni pone
            const marcha = moverHasta(bot, new goals.GoalFollow(e, 2), () => !!objetivo(), { ms: queda, tarea, entidad: e, mov: prudentes(bot, { pisarVedadas: true }) })
            this.ocupado = marcha
            r = await marcha
            if (r !== 'listo') break
            const x = objetivo()
            if (!x) continue
            const p = await this.ejecutarHabilidad('atacar', ['id:' + x.id, '20', 'vedadas'], tarea)
            if (p && !p.exito && /creeper|salud|demasiados|sin arma|nunca|sin camino|lo perd/.test(p.causa || '')) {
              ignorar.set(x.id, Date.now() + ESCOLTA_REINTENTO_MS) // no reintentar al momento al que se negó a pelear
              if (!negado && /creeper|salud|demasiados|sin arma/.test(p.causa || '')) { negado = true; bot.chat(`No peleo: ${p.causa}.`) }
            }
            agresor = null
          }
        } finally { bot.removeListener('entityHurt', alGolpe) }
        const textos = { 'tiempo agotado': 'Llevo diez minutos cubriéndote: paro aquí.', perdido: 'Te he perdido de vista.', 'sin camino': 'No encuentro camino para seguirte.' }
        return { exito: r === 'tiempo agotado', texto: textos[r] || 'Dejo de cubrirte.' }
      }
      case 'tala': return this.talarN(o, tarea, paso)
      case 'recoge': {
        // F7.7: fuera del mundo del usuario, la orden vuelve a intentar también lo que recoger dio por inalcanzable hace poco
        const [r, d] = await paso('recoger', (o.todo ? '8' : '8 _log') + (mundo.reglasLibres ? ' otra_vez' : ''))
        const texto = r.exito ? `Recogí ${r.objetos} ${o.todo ? 'cosa' : 'tronco'}${r.objetos === 1 ? '' : 's'}.` : r.causa === 'nada que recoger' ? 'No hay nada que recoger cerca.' : `No pude recoger: ${r.causa}.`
        return { exito: !!r.exito, texto, pasos: [d] }
      }
      case 'guarda': {
        const [r, d] = await paso('depositar', '')
        const lista = Object.entries(r.guardado || {}).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ')
        const texto = r.exito ? `Guardé en ${r.cofre}: ${lista}.` + (r.quedan ? ` No cupo todo: ${r.causa}.` : '')
          : r.causa === 'nada que guardar' ? 'No llevo nada que guardar.' : `No pude guardar: ${r.causa}.`
        if (r.causa === 'cofres llenos') this.avisarLlenos(r, depositar.ajustes(bot))
        return { exito: !!r.exito, texto, pasos: [d] }
      }
      case 'huye': {
        const de = o.de ? (Object.keys(bot.players).find(n => n.toLowerCase() === o.de) || o.de) : '-'
        const [r, d] = await paso('huir', `${de} 16 20`)
        const texto = r.causa === 'sin amenaza' ? (o.de ? `No veo a ${o.de} cerca.` : 'No veo ninguna amenaza.')
          : r.exito ? `Ya estoy a salvo, a ${Math.round(r.distancia || 0)} bloques.` : `No pude huir: ${r.causa}.`
        return { exito: !!r.exito, texto, pasos: [d] }
      }
      // F6: explorar, minar, construir, deshacer (dentro del rectángulo de obras; las habilidades comprueban zonas y cofres)
      case 'explora': {
        const [r, d] = await paso('explorar', [o.rumbo, String(o.n), '90', o.nada ? 'nadando' : '-'])
        const v = r.visto || {}
        const vistos = [v.troncos ? `${v.troncos} troncos` : '', v.agua ? 'agua' : '', ...Object.entries(v.minerales || {}).map(([k, n]) => `${n} ${k}`),
          ...Object.entries(v.animales || {}).map(([k, n]) => `${n} ${k}`), ...(v.jugadores || [])].filter(Boolean).join(', ') || 'nada especial'
        const sitio = r.pos ? ` Estoy en ${r.pos.join(', ')}${r.bioma ? ` (${r.bioma})` : ''}.` : ''
        const texto = r.exito ? `Exploré ${Math.round(r.recorrido)} bloques.${sitio} He visto: ${vistos}.` : `No pude seguir: ${r.causa} (${Math.round(r.recorrido || 0)} bloques).${sitio} He visto: ${vistos}.`
        return { exito: !!r.exito, texto, pasos: [d] }
      }
      case 'campamento_vuelve': {
        const [r, d] = await paso('explorar', ['volver', '120', '150'])
        return { exito: !!r.exito, texto: r.exito ? 'Ya estoy en el campamento.' : `No llego al campamento: ${r.causa}.`, pasos: [d] }
      }
      case 'mina': { // 2026-11-01: si no ve el mineral, va a la mena más cercana (ir_a_mena, cavando) y sigue hasta completar
        let total = 0, causa = '', pasos = []
        const mena = /_ore$/.test(o.bloque) || o.bloque === 'mineral'
        for (let vuelta = 0; vuelta < 4 && total < o.n && !tarea.cancelada; vuelta++) {
          const [r, d] = await paso('minar', [o.bloque, String(o.n - total), '8']); pasos.push(d)
          total += (r.rotos || []).length; causa = r.causa
          if (total >= o.n || !mena || !mundo.reglasLibres || tarea.cancelada) break
          const [m, dm] = await paso('ir_a_mena', [o.bloque, '32', String(o.n - total)]); pasos.push(dm)
          total += m.picadas || 0; causa = m.causa
          if (!m.exito) break
        }
        const ES = { coal: 'carbón', iron: 'hierro', copper: 'cobre', gold: 'oro', diamond: 'diamante', redstone: 'redstone', lapis: 'lapislázuli', emerald: 'esmeralda', stone: 'piedra', dirt: 'tierra', sand: 'arena', gravel: 'grava' }
        const nombre = ES[o.bloque.replace(/_ore$/, '')] || o.bloque.replace(/_ore$/, '').replace(/_/g, ' ')
        return { exito: total > 0, hechos: total, texto: total ? `Miné ${total} de ${nombre}${total < o.n ? ` (quería ${o.n}: ${causa})` : ''}.` : `No miné nada: ${causa}.`, pasos }
      }
      case 'materiales': {
        // 2026-11-02: la lista de materiales de una construcción grande (bot/materiales/*.json) contra el inventario y los cofres de HOGAR
        const mat = require('./materiales'), plan = mat.cargar(o.plano)
        if (!plan) return { exito: false, texto: `No tengo la lista de materiales de ${o.plano}.`, pasos: [] }
        bot.chat(`Reviso los cofres de ${o.zona} para ${plan.nombre}…`)
        const [r, d] = await paso('revisar_cofres', [o.zona])
        if (r.causa === 'sin zona') return { exito: false, texto: `No hay ninguna zona ${o.zona}: márcala con !zona.`, pasos: [d] }
        const stock = { ...(r.items || {}) }
        for (const it of bot.inventory.items()) stock[it.name] = (stock[it.name] || 0) + it.count
        const falta = mat.faltan(plan, stock)
        const donde = r.cofres ? `${r.cofres} cofre${r.cofres === 1 ? '' : 's'} de ${r.zona}${r.noAbiertos ? ` (${r.noAbiertos} sin abrir)` : ''} y mi inventario` : `mi inventario (${r.causa === 'sin cofres' ? `no hay cofres en ${r.zona}` : `no abrí ningún cofre de ${r.zona}`})`
        if (!falta.length) return { exito: true, texto: `Con ${donde} tengo todo para ${plan.nombre}.`, pasos: [d] }
        bot.chat(`Para ${plan.nombre} me falta, mirando ${donde}:`)
        for (const f of mat.frases(falta)) bot.chat(f)
        return { exito: true, texto: `Faltan ${falta.length} materiales de ${Object.keys(plan.materiales).length}.`, pasos: [d] }
      }
      case 'construye': {
        const aqui = o.aqui ? bot.entity.position.floored() : null
        const [r, d] = await paso('construir', o.retomar ? [`retomar=${o.retomar}`] : [o.plano, ...(aqui ? [String(aqui.x + 2), String(aqui.z + 2)] : [])])
        o.obra = r.obra // para «continúa»
        const texto = r.exito ? `Construido: ${r.plano} en ${r.origen.join(', ')} (${r.puestos} bloques${r.fabricados ? `, ${r.fabricados} tablones fabricados` : ''}).`
          : `No terminé ${o.plano}: ${r.causa}${r.puestos ? ` (${r.puestos} puestos, ${r.pendientes} pendientes)` : ''}.`
        return { exito: !!r.exito, texto, pasos: [d] }
      }
      // F7.2: supervivencia (las habilidades comprueban zonas, cofres y, en el mundo del usuario, el rectángulo de obras)
      case 'come': {
        const [r, d] = await paso('comer', [])
        const texto = r.exito ? `Comido: ${r.bocados} bocado${r.bocados === 1 ? '' : 's'} (hambre ${r.hambre[1]} de 20).`
          : r.causa === 'sin comida' ? 'No llevo comida.' : r.causa === 'sin hambre' ? 'No tengo hambre.' : `No pude comer: ${r.causa}.`
        return { exito: !!r.exito, texto, pasos: [d] }
      }
      case 'ataca': {
        // 2026-11-01: «ataca a NOMBRE» con un jugador conectado (no él mismo) va a por ese jugador; si no es un jugador, como siempre
        const jugador = o.nombre && Object.keys(bot.players).find(n => n.toLowerCase() === o.nombre && n !== bot.username)
        if (jugador) {
          // fuera de la vista (~48 bloques): a las coordenadas que le den («ataca a X en x y z») o a donde le vio por última vez, y en
          // cuanto aparece, a por él
          if (!bot.players[jugador].entity) {
            const visto = require('./jugadores').ultimaVez(bot, jugador)
            const meta = o.en ? new (require('vec3').Vec3)(...o.en) : visto && visto.pos
            if (!meta) return { exito: false, texto: `No veo a ${jugador} y no sé dónde está: dime «ataca a ${jugador} en x y z» o llévame hacia él.` }
            bot.chat(o.en ? `Voy a buscar a ${jugador} a ${o.en.join(' ')}.` : `Voy a buscar a ${jugador} donde le vi hace ${Math.round((Date.now() - visto.t) / 1000)} s.`)
            const r = await moverHasta(bot, new goals.GoalNear(meta.x, meta.y, meta.z, 3), () => !!bot.players[jugador]?.entity, { ms: 180000, tarea, mov: prudentes(bot) })
            if (r !== 'listo') return { exito: false, texto: r === 'cancelado' ? 'Dejo de buscarle.' : `No encuentro a ${jugador} (${r}).` }
          }
          const e = bot.players[jugador].entity
          const [r, d] = await paso('atacar', ['id:' + e.id, '30'])
          const textos = { muerto: `Derribé a ${jugador} (${r.golpes} golpes).`, 'huyó': `${jugador} se fue.`, 'sin hostil': `No veo a ${jugador} cerca.`,
            'salud baja': 'Estoy muy herido: no peleo.', demasiados: 'Hay demasiados monstruos: no peleo.', 'sin arma': 'No llevo arma: no peleo.' }
          return { exito: !!r.exito, texto: textos[r.causa] || `No pude: ${r.causa}.`, pasos: [d] }
        }
        const [r, d] = await paso('atacar', [o.de || '-', '30'])
        const textos = { muerto: `Lo maté (${r.golpes} golpes).`, 'huyó': 'Se fue.', 'sin hostil': 'No veo ningún monstruo cerca.',
          creeper: 'Es un creeper: me aparto, no peleo con él.', 'salud baja': 'Estoy muy herido: no peleo.', demasiados: 'Son demasiados: no peleo.',
          'sin arma': 'No llevo arma: no peleo.' }
        return { exito: !!r.exito, texto: textos[r.causa] || `No pude: ${r.causa}.`, pasos: [d] }
      }
      case 'refugiate': {
        const [r, d] = await paso('refugiarse', [o.modo || 'auto'])
        const texto = r.exito ? (r.causa === 'ya dentro' ? 'Ya estoy refugiado.' : `Refugiado (${r.causa}, ${r.bloques} bloques).`)
          : `No pude refugiarme: ${r.causa}${r.tapiar || r.cavar ? ` (tapiar: ${r.tapiar || 'sí'}; cavar: ${r.cavar || 'sí'})` : ''}.`
        return { exito: !!r.exito, texto, pasos: [d] }
      }
      case 'sal': {
        const [r, d] = await paso('salir_del_refugio', [])
        return { exito: !!r.exito, texto: r.exito ? (r.causa === 'ya fuera' ? 'Ya estoy fuera.' : 'Fuera.') : `No pude salir: ${r.causa}.`, pasos: [d] }
      }
      case 'duerme': { // 2026-11-01: la cama más cercana (o pone o fabrica una); sin poder, como antes: el refugio de noche
        const [r, d] = await paso('usar_cama', [])
        if (r.exito) return { exito: true, texto: r.causa === 'spawn guardado' ? `Spawn guardado en esta cama${r.puesta ? ' (la he puesto yo)' : ''}.` : 'Ya es de día. Spawn guardado en la cama.', pasos: [d] }
        if (!/no puedo hacer una|sin sitio|no pude poner/.test(r.causa)) return { exito: false, texto: `No pude usar la cama: ${r.causa}.`, pasos: [d] }
        const [r2, d2] = await paso('dormir', [])
        const texto = r2.exito ? 'Ya es de día (sin cama: en el refugio).' : r2.causa === 'es de día' ? `No hay cama: ${r.causa}.`
          : r2.causa === 'sin cama y sin refugio' ? `No hay cama (${r.causa}) ni estoy refugiado: dime «refúgiate» o dame 3 de lana.` : `No pude pasar la noche: ${r2.causa}.`
        return { exito: !!r2.exito, texto, pasos: [d, d2] }
      }
      case 'fabrica': {
        const [r, d] = await paso('fabricar', [o.objeto || '-'])
        const hecho = Object.entries(r.fabricados || {}).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ')
        return { exito: !!r.exito, texto: r.exito ? `Fabricado: ${hecho}.` : `No pude fabricar: ${r.causa}.`, pasos: [d] }
      }
      case 'equipate': {
        // 2026-11-01: antes de equipar lo que lleva, toma lo mejor de los armor stands cercanos (y espada o hacha del cofre que tengan al lado)
        const [rs, ds] = await paso('equipar_soportes', ['24'])
        if (rs.exito && (rs.piezas.length || rs.arma)) bot.chat(`Tomo de los soportes: ${[...rs.piezas, rs.arma].filter(Boolean).join(', ').replace(/_/g, ' ')}.`)
        const [r, d] = await paso('equipar', ['todo'])
        const texto = r.exito ? `Equipado: ${[r.arma, ...(r.armadura || [])].filter(Boolean).join(', ') || 'lo que llevaba'}.` : 'No tengo nada que equipar.'
        return { exito: !!r.exito, texto, pasos: [ds, d] }
      }
      case 'apartate': {
        const [r, d] = await paso('apartarse', [])
        return { exito: !!r.exito, texto: r.exito ? (r.causa === 'sin peligro' ? 'Aquí no hay peligro.' : 'Ya estoy a salvo.') : `No pude apartarme: ${r.causa}.`, pasos: [d] }
      }
      // F8.0b: la fundación de los perfiles v2
      case 'cazar': {
        const [r, d] = await paso('cazar', [o.animal, String(o.n)])
        const lo = Object.entries(r.obtenido || {}).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ')
        return { exito: !!r.exito, texto: r.exito ? `Cazado${lo ? ': ' + lo : ''}.` : `No pude cazar: ${r.causa}.`, pasos: [d] }
      }
      case 'agua': {
        const [r, d] = await paso('recoger_agua', [])
        return { exito: !!r.exito, texto: r.exito ? 'Cubo lleno de agua.' : `No llené el cubo: ${r.causa}.`, pasos: [d] }
      }
      case 'vierte': {
        const [r, d] = await paso('verter', [o.que])
        return { exito: !!r.exito, texto: r.exito ? `Vertido en ${r.pos.join(', ')}.` : `No pude verter: ${r.causa}.`, pasos: [d] }
      }
      case 'funde': {
        const [r, d] = await paso('fundir', [o.entrada, String(o.n)])
        return { exito: !!r.exito, texto: r.exito ? `Fundido: ${r.obtenido} ${String(r.salida).replace(/_/g, ' ')}.` : `No pude fundir: ${r.causa}.`, pasos: [d] }
      }
      case 'ilumina': {
        const [r, d] = await paso('iluminar', [])
        return { exito: !!r.exito, texto: r.exito ? `Iluminado (${r.puestas.length} antorchas).` : `No pude iluminar: ${r.causa}.`, pasos: [d] }
      }
      case 'pon': {
        const [r, d] = await paso('poner', [o.objeto])
        return { exito: !!r.exito, texto: r.exito ? `Puesto ${r.objeto} en ${r.pos.join(', ')}.` : `No pude ponerlo: ${r.causa}.`, pasos: [d] }
      }
      case 'saca': {
        if (!o.objeto) return { exito: false, texto: 'No sé qué sacar: troncos, tablones, piedra, comida, carbón, hierro o lana.', pasos: [] }
        const [r, d] = await paso('sacar_del_cofre', [o.objeto, String(o.n)])
        const lo = Object.entries(r.sacado || {}).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ')
        return { exito: !!r.exito, texto: r.exito ? `Sacado: ${lo}.` : `No saqué bastante: ${r.causa}${lo ? ' (' + lo + ')' : ''}.`, pasos: [d] }
      }
      case 'desatascate': case 'sube': {
        const [r, d] = await paso(o.tipo === 'sube' ? 'subir_a_superficie' : 'desatascarse', [])
        return { exito: !!r.exito, texto: r.exito ? `Fuera (y = ${r.y}).` : `No pude salir: ${r.causa}.`, pasos: [d] }
      }
      case 'baja': {
        const y = o.y !== null ? o.y : bot.entity.position.floored().y - o.n
        const [r, d] = await paso('cavar_escalera', [String(y), o.rumbo || '-'])
        return { exito: !!r.exito, texto: r.exito ? `Abajo, en y = ${r.y} (${r.pasos} escalones).` : `Paré en y = ${r.y}: ${r.causa}.`, pasos: [d] }
      }
      case 'caza': {
        const [r, d] = await paso('recoger_comida', [])
        const texto = r.exito ? `Tengo comida (${r.comida[0]} → ${r.comida[1]}).` : r.causa === 'sin hambre' ? 'No tengo hambre.' : `No conseguí comida: ${r.causa}.`
        return { exito: !!r.exito, texto, pasos: [d] }
      }
      case 'deshaz': {
        const [r, d] = await paso('deshacer', [o.obra || ''])
        const texto = r.exito ? `Deshecha: quité ${r.quitados} bloques${r.saltados ? ` (${r.saltados} ya no eran míos)` : ''}.` : `No pude deshacerlo: ${r.causa}${r.quitados ? ` (${r.quitados} quitados, quedan ${r.quedan})` : ''}.`
        return { exito: !!r.exito, texto, pasos: [d] }
      }
    }
    return { exito: false, texto: 'No sé hacer eso.' }
  }

  // «tala N troncos»: hasta tener N troncos más (en el inventario o guardados), con las habilidades de la red: recoger si hay troncos
  // caídos (primero, para no picar de más: lo picado cae al suelo), picar si hay tronco al alcance, ir a otro árbol si un compañero
  // va al mío y si no, ir al árbol. Nada protegido: ir_a_arbol y picar_tronco ya excluyen zonas.json y los árboles marcados.
  // Límites: N ≤ 64 (ordenes.js), N + 2 picados, 60 s + 30 s por tronco (máx. 10 min) y 4 fallos seguidos.
  async talarN(o, tarea, paso) {
    const bot = this.bot, n = o.n, inicio = this.troncos(), t0 = Date.now(), limite = Math.min(600, 60 + 30 * n) * 1000
    const pasos = []
    let fallos = 0, causa = null, picados = 0, acercamientos = 0
    // como «talar»: si lo más cercano está protegido, decirlo una vez
    const cerca = bot.findBlocks({ matching: b => b.name.endsWith('_log'), maxDistance: 24, count: 200 })
    const protegidas = new Set()
    for (const v of cerca) { const z = zonas.protegidoPor(v.x, v.y, v.z); if (!z) break; protegidas.add(z) }
    if (protegidas.size) this.decir(`${noTalo([...protegidas])} Voy a por otros troncos.`)
    const I = Object.fromEntries(observacion.NOMBRES.map((k, i) => [k, i]))
    while (this.troncos() - inicio < n) {
      if (tarea.cancelada) break
      if (Date.now() - t0 > limite) { causa = 'se acabó el tiempo'; break }
      if (fallos >= 4) { causa = `cuatro fallos seguidos (${pasos[pasos.length - 1].causa})`; break }
      const { obs } = observacion.observar(bot)
      let h
      if (obs[I.objetos_suelo] > 0) h = 'recoger'
      else if (picados >= n + 2) { causa = `piqué ${picados}, pero lo demás no me entró (o lo recogió otro que estaba cerca, o cayó donde no llego)`; break }
      else if (obs[I.tronco_al_alcance] || obs[I.arbol_enfrente]) h = 'picar_tronco'
      else if (obs[I.arbol_dist] >= 1) {
        // la observación (cerebro.arbolCercano) mira los 40 troncos más cercanos: junto a una zona con muchos troncos protegidos
        // (HOGAR) no ve los de fuera. Acercarse (sin romper nada ni pisar zonas) al tronco libre más cercano y volver a mirar.
        const libre = acercamientos < 2 && bot.findBlocks({ useExtraInfo: true, maxDistance: 48, count: 1,
          matching: b => b.name.endsWith('_log') && !zonas.talaProtegida(b.position.x, b.position.y, b.position.z) })[0]
        if (!libre) { causa = zonas.trabajo().length ? 'no veo árboles en la zona de trabajo' : 'no veo árboles fuera de las zonas protegidas'; break }
        acercamientos++
        const m = await moverHasta(bot, new goals.GoalNear(libre.x, libre.y, libre.z, 3), () => bot.entity.position.distanceTo(libre) <= 4,
          { ms: 30000, tarea })
        pasos.push({ habilidad: 'acercarse', exito: m === 'listo', causa: m, pos: [libre.x, libre.y, libre.z] })
        continue
      }
      else h = obs[I.companero_mismo_arbol] ? 'ir_a_otro_arbol' : 'ir_a_arbol'
      const [r, d] = await paso(h, ARGS[h])
      pasos.push(d)
      fallos = r.exito ? 0 : fallos + 1
      if (h === 'picar_tronco' && r.exito) { picados++; await esperar(400) } // que el tronco caiga (o entre solo) antes de mirar otra vez
    }
    const g = this.troncos() - inicio
    const nota = o.pedido > o.n ? ` (pediste ${o.pedido}; como mucho talo ${o.n} de una vez)` : ''
    const tr = (k) => `${k} tronco${k === 1 ? '' : 's'}`
    const texto = g >= n ? `Hecho: ${tr(g)}${protegidas.size ? `, ninguno de ${[...protegidas].join(', ')}` : ''}.${nota}`
      : `Llevo ${g} de ${tr(n)}${causa ? `: ${causa}` : ''}.${nota}`
    return { exito: g >= n, texto, pasos, troncos: g }
  }

  // Zonas protegidas. Desde el chat del juego (!zona ...) o por el puerto de control (zona ...).
  //   inicio | fin NOMBRE [no_talar|trabajo] | arbol NOMBRE | lista | borrar NOMBRE      (chat: usa tu posición)
  //   rect NOMBRE x1 z1 x2 z2 [no_talar|trabajo] | tronco NOMBRE x y z | lista | borrar NOMBRE   (puerto)
  //   trabajo: si hay alguna, solo talan, pican y ponen dentro de ellas (bot/zonas.js)
  ordenZona(usuario, texto) {
    const [verbo, ...p] = (texto || 'lista').trim().split(/\s+/)
    const pos = () => {
      const e = usuario && this.bot.players[usuario]?.entity
      if (!e) throw new Error('no te veo; acércate al personaje')
      return e.position.floored()
    }
    const modo = (x) => (/no_?talar/i.test(x || '') ? 'no_talar' : /^trabajo$/i.test(x || '') ? 'trabajo' : 'vedada')
    const TIPO = { vedada: 'vedada', no_talar: 'sin talar', trabajo: 'de trabajo: solo se trabaja dentro' }
    switch (verbo) {
      case 'inicio': { const q = pos(); ESQUINAS.set(usuario, q); return `esquina A en ${q.x}, ${q.z}; ve a la opuesta y di: !zona fin NOMBRE` }
      case 'fin': {
        const a = ESQUINAS.get(usuario); if (!a) return 'primero marca una esquina con: !zona inicio'
        if (!p[0]) return 'ponle nombre: !zona fin NOMBRE'
        const b = pos(); zonas.zonaNueva(p[0], a.x, a.z, b.x, b.z, modo(p[1])); ESQUINAS.delete(usuario)
        return `zona ${p[0]} guardada (${TIPO[modo(p[1])]}): x ${Math.min(a.x, b.x)}..${Math.max(a.x, b.x)}, z ${Math.min(a.z, b.z)}..${Math.max(a.z, b.z)}`
      }
      case 'arbol': {
        if (!p[0]) return 'ponle nombre: !zona arbol NOMBRE'
        const q = pos(); const ts = this.bot.findBlocks({ matching: b => b.name.endsWith('_log'), maxDistance: 8, count: 60, point: q })
        if (!ts.length) return 'no hay troncos a 8 bloques de ti'
        ts.sort((x, y) => x.distanceTo(q) - y.distanceTo(q))
        // todo el tronco de la columna más cercana
        const c = ts[0]; const col = ts.filter(v => v.x === c.x && v.z === c.z)
        col.forEach((v, i) => zonas.arbolNuevo(p[0] + (col.length > 1 ? '#' + i : ''), v.x, v.y, v.z))
        return `árbol ${p[0]} protegido en ${c.x}, ${c.z} (${col.length} troncos)`
      }
      case 'rect': { const [n, a, b, c, d, m] = p; if ([a, b, c, d].some(v => v === undefined || isNaN(+v))) return 'uso: zona rect NOMBRE x1 z1 x2 z2 [no_talar|trabajo]'; zonas.zonaNueva(n, +a, +b, +c, +d, modo(m)); return `zona ${n} guardada (${TIPO[modo(m)]})` }
      case 'tronco': { const [n, x, y, z] = p; zonas.arbolNuevo(n, +x, +y, +z); return 'tronco ' + n + ' protegido' }
      case 'borrar': return p[0] ? `borrados: ${zonas.borrar(p[0])}` : 'di cuál: !zona borrar NOMBRE'
      case 'lista': { const l = zonas.lista(); return l.length ? l.join('\n') : 'no hay zonas protegidas' }
      default: return 'zona: inicio | fin NOMBRE [no_talar|trabajo] | arbol NOMBRE | lista | borrar NOMBRE'
    }
  }

  crearOrdenes() {
    const O = {
      cerebro: async (a) => {
        const r = await cerebroRed.bucle(this.bot, parseInt(a) || 30, { tarea: this.nuevaTarea() })
        return (cerebroRed.politica ? 'red' : 'voraz') + ': ' + r.log.join(' ')
      },
      zona: async (a) => this.ordenZona(null, a),
      // cofre [si|no|umbral F]: el reflejo de guardar en el cofre (activo, umbral de huecos de recogida ocupados 0-1) y los cofres
      // de cofres.json. «si» también olvida los fallos y los cofres llenos (p. ej. tras hacer sitio): lo reintenta enseguida.
      cofre: async (a) => {
        const aj = depositar.ajustes(this.bot), [v, n] = (a || '').split(/\s+/)
        if (v === 'si' || v === 'no') aj.activo = v === 'si'
        if (v === 'si') aj.fallo = aj.llenos = 0
        if (v === 'umbral' && !isNaN(parseFloat(n))) aj.umbral = Math.max(0, Math.min(1, parseFloat(n)))
        return JSON.stringify({ activo: aj.activo, umbral: aj.umbral, ocupacion: +depositar.ocupacion(this.bot).toFixed(2),
          llenos: !!aj.llenos,
          guardados: depositar.guardados(this.bot).troncos, cofres: cofres.lista().map(c => `${c.nombre}@${c.bloques[0].join(',')}`) })
      },
      // Suelta todo el inventario donde está y se aparta unos pasos, para no recogerlo otra vez (el objeto lanzado se puede recoger tras ~2 s).
      soltar: async () => {
        this.nuevaTarea()
        const b = this.bot; const sitio = b.entity.position.floored()
        const items = b.inventory.items()
        if (!items.length) return 'no llevo nada encima'
        const resumen = items.map(i => `${i.name}x${i.count}`).join(', ')
        for (const it of items) await b.tossStack(it)
        let apartado = 'sin apartarme'
        for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
          const suelo = b.blockAt(sitio.offset(dx, -1, dz)); const aire = b.blockAt(sitio.offset(dx, 0, dz))
          if (!suelo || suelo.boundingBox !== 'block' || (aire && aire.boundingBox === 'block')) continue
          try { await Promise.race([b.pathfinder.goto(new goals.GoalBlock(sitio.x + dx, sitio.y, sitio.z + dz)), new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 6000))]); apartado = `me aparté a ${sitio.x + dx}, ${sitio.z + dz}`; break } catch (_) { b.pathfinder.setGoal(null) }
        }
        return `solté en ${sitio.x}, ${sitio.y}, ${sitio.z}: ${resumen}; ${apartado}`
      },
      estado: async () => this.estado(),
      // F4. modo [libre|ordenes] [despues quieto|libre]: el interruptor; sin nada, el estado del modo en JSON.
      modo: async (a) => {
        const p = (a || '').split(/\s+/).filter(Boolean)
        if (p[0] === 'libre' || p[0] === 'ordenes') {
          if (p[0] === 'libre') this.decisor.preparar() // si la red no vale, falla aquí (y lo dice) en vez de quedarse en libre sin decidir
          this.ponerModo(p[0], 'orden directa del puerto: modo ' + p[0])
        }
        const i = p.indexOf('despues')
        if (i >= 0 && ['quieto', 'libre'].includes(p[i + 1])) this.despues = p[i + 1]
        return JSON.stringify(this.estadoModo())
      },
      // orden TEXTO: una orden en lenguaje sencillo, como por el chat («tala 3 troncos», «Eco, ven», «todos, modo libre»); responde
      // al aceptarla. orden_esperar TEXTO: igual, pero responde al terminar (para pruebas y guiones).
      orden: async (a) => despachar(this, a, { via: 'puerto', de: this.de }, false),
      orden_esperar: async (a) => despachar(this, a, { via: 'puerto', de: this.de }, true),
      // F6. resumen [ultimo|todo]: el informe del cuerpo hacia la mente (ver resumen()); «todo» no corta por la última lectura
      resumen: async (a) => JSON.stringify(this.resumen(a === 'todo')),
      // campamento [aqui|x y z|-]: el punto al que vuelve «vuelve al campamento» y explorar volver; sin nada, lo muestra
      campamento: async (a) => {
        const p = (a || '').split(/\s+/).filter(Boolean)
        if (p[0] === 'aqui') memoria(this.bot).campamento = this.bot.entity.position.floored().toArray()
        else if (p[0] === '-') memoria(this.bot).campamento = null
        else if (p.length === 3 && p.every(v => !isNaN(+v))) memoria(this.bot).campamento = p.map(Number)
        return JSON.stringify({ campamento: memoria(this.bot, 'campamento', () => null) })
      },
      percibir: async () => this.percibir(),
      decir: async (a) => { this.bot.chat(a); return 'dicho' },
      ven: async (a) => {
        this.nuevaTarea()
        const bot = this.bot
        const nombre = a || Object.keys(bot.players).find(n => n !== bot.username && !esBot(n)) // sin nombre: un humano, no otro personaje
        const j = bot.players[nombre]?.entity
        if (!j) return 'no veo al jugador'
        bot.pathfinder.setGoal(new goals.GoalFollow(j, 2), true)
        return 'siguiéndote'
      },
      para: async () => { this.ponerModo('ordenes', 'orden directa del puerto: para'); this.tarea.cancelada = true; if (this.tareaReflejo) this.tareaReflejo.cancelada = true; this.bot.pathfinder.setGoal(null); return 'parado' },
      // F7.2. reflejos [si|no]: los reflejos de supervivencia (reflejos.js; por defecto, sí fuera del mundo del usuario); sin nada, el
      // estado: activo, cuántos ha hecho de cada uno y el último golpe de un monstruo
      reflejos: async (a) => {
        const e = sv.estado(this.bot)
        if (a === 'si' || a === 'no') { // al cambiar, olvida el último golpe (no reaccionar a uno de antes)
          e.activo = a === 'si'; e.golpe = null
          if (!e.activo && this.tareaReflejo) this.tareaReflejo.cancelada = true
        }
        return JSON.stringify({ activo: e.activo, hechos: e.n, golpe: e.golpe, atendido: e.atendido || null })
      },
      // rejilla (diagnóstico, F6): lo que hay en la rejilla de fabricación del inventario (ranuras 1-4) y en la mano
      rejilla: () => JSON.stringify({ rejilla: [1, 2, 3, 4].map(i => { const it = this.bot.inventory.slots[i]; return it ? `${it.name}x${it.count}` : null }),
        resultado: this.bot.inventory.slots[0] ? `${this.bot.inventory.slots[0].name}x${this.bot.inventory.slots[0].count}` : null, mano: this.bot.heldItem ? this.bot.heldItem.name : null }),
      // camino x y z (diagnóstico, F6): ¿hay camino a pie hasta ahí con los movimientos prudentes (los de las habilidades) y con
      // los de por defecto (que pueden cavar)? Sirve para entender un atasco sin mover al personaje.
      camino: (a) => {
        const [x, y, z] = a.split(/\s+/).map(Number)
        const meta = new goals.GoalNear(x, y, z, 1)
        const juzgar = (mov) => {
          const r = this.bot.pathfinder.getPathFromTo(mov, this.bot.entity.position, meta, { timeout: 1500, tickTimeout: 1500 }).next().value.result
          return `${r.status} (${r.path.length} pasos, ${r.visitedNodes} nodos, ${Math.round(r.time)} ms)`
        }
        return `desde ${this.bot.entity.position.floored()} · prudentes: ${juzgar(prudentes(this.bot))} · por defecto: ${juzgar(zonas.aplicar(new Movements(this.bot)))}`
      },
      // alrededor: los bloques de la columna de 3×3 desde debajo de los pies hasta encima de la cabeza, como los ve el bot
      // (nombre y si es sólido para el navegador). Para cuando planea que no puede dar ni un paso (2026-10-31)
      alrededor: async () => {
        const p = this.bot.entity.position, b = p.floored()
        const filas = [`pos ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)} · en el suelo: ${this.bot.entity.onGround}`]
        for (let dy = 2; dy >= -1; dy--) {
          const fila = []
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const k = this.bot.blockAt(b.offset(dx, dy, dz))
            fila.push(k ? `${k.name}${k.boundingBox === 'block' ? '#' : ''}` : '?')
          }
          filas.push(`y${dy >= 0 ? '+' : ''}${dy}: ${fila.join(' ')}`)
        }
        return filas.join('\n')
      },
      ir: async (a) => {
        this.nuevaTarea()
        const [x, y, z] = a.split(/\s+/).map(Number)
        // mientras va, los reflejos de reposo no le cambian la meta («The goal was changed…» con make go, 2026-11-01)
        this.enIr = (this.enIr || 0) + 1
        if (this.tareaReflejo) this.tareaReflejo.cancelada = true // y el que ya iba (p. ej. apartarse junto a un borde) se para antes
        if (this.reflejando) await this.reflejando.catch(() => {})
        try { await this.bot.pathfinder.goto(new goals.GoalNear(x, y, z, 1)) } finally { this.enIr-- }
        return 'llegué'
      },
      talar: () => this.talar(),
      // arbolado [x1 z1 x2 z2]: para medir (medir_ejecutor.py): los troncos de ese rectángulo y la huella de cada zona protegida
      arbolado: async (a) => JSON.stringify(arbolado(this.bot, ...(a ? a.split(/\s+/).map(Number) : []))),
      arboles: async () => {
        const bot = this.bot, n = {}
        for (const pos of bot.findBlocks({ matching: b => /log|leaves|wood|cactus/.test(b.name), maxDistance: 64, count: 500 })) {
          const b = bot.blockAt(pos); n[b.name] = (n[b.name] || 0) + 1
        }
        const l = bot.findBlocks({ matching: b => /_log$/.test(b.name), maxDistance: 64, count: 3 })
        return JSON.stringify(n) + ' · troncos: ' + l.map(v => v.floored()).join(' ')
      },
      hab: async (a) => { const [n, ...r] = a.split(/\s+/); return this.habilidad(n, r.join(' ')) },
      habilidades: async () => Object.keys(habilidades.HABILIDADES).join(', '),
      // obs [inicio [segundos=300]]: las 25 entradas de entorno_habilidades.py en JSON {obs, datos}; «inicio» empieza un episodio
      obs: async (a) => {
        const [i, s] = (a || '').split(/\s+/)
        if (i === 'inicio') observacion.iniciar(this.bot, s)
        return JSON.stringify(observacion.observar(this.bot))
      },
      // obs_sv [inicio [segundos=1200]]: las 47 entradas de supervivencia de entorno_supervivencia.py (F7.1) en JSON {obs, datos}
      obs_sv: async (a) => {
        const [i, s] = (a || '').split(/\s+/)
        if (i === 'inicio') observacion.iniciar(this.bot, s || 1200)
        return JSON.stringify(observacion.observarSv(this.bot))
      },
      // amenaza_prueba [tipo|-]: en pacífico, tratar un tipo de entidad (p. ej. villager) como hostil; «-» lo quita
      amenaza_prueba: async (a) => {
        const { amenazas } = pruebas(this.bot)
        if (!a || a === '-') amenazas.clear(); else amenazas.add(a)
        return 'amenazas de prueba: ' + ([...amenazas].join(', ') || 'ninguna')
      },
      // jugador_prueba [tipo|-]: para el banco, «el jugador» de obs e ir_a_jugador es la entidad más cercana de ese tipo; «-» lo quita
      jugador_prueba: async (a) => {
        const p = pruebas(this.bot)
        if (a) p.jugador = a === '-' ? null : a
        return 'jugador de prueba: ' + (p.jugador || 'ninguno (el jugador humano más cercano)')
      },
      // perfil [nombre]: el perfil de F3 (perfiles/NOMBRE.json) que entra en la observación; sin nombre, el actual y los que hay
      perfil: async (a) => {
        if (a && !observacion.perfiles().includes(a)) return 'no existe el perfil ' + a + '; hay: ' + observacion.perfiles().join(', ')
        if (a) observacion.ponerPerfil(this.bot, a)
        const p = observacion.perfilDe(this.bot)
        return JSON.stringify({ perfil: p.nombre, pesos: p.pesos, vector: p.vector, perfiles: observacion.perfiles() })
      },
      // decisor [red|guion|capataz] [RUTA]: quién decide en libre y con qué política (F8.0a); sin nada, el actual
      decisor: async (a) => {
        const [nombre, ruta] = (a || '').split(/\s+/).filter(Boolean)
        if (nombre) { const r = this.ponerDecisor(nombre, ruta ? (nombre === 'capataz' ? ruta : path.resolve(ruta)) : null); if (!r.exito) return r.texto }
        return JSON.stringify({ decisor: this.decisor.nombre, politica: this.decisor.ruta, decisores: decisores.NOMBRES })
      },
      // progreso: el rol del capataz, la etapa que toca, lo que le falta y las hechas con su día (F8.1)
      progreso: async () => {
        if (this.decisor.nombre !== 'capataz') return JSON.stringify({ rol: null, decisor: this.decisor.nombre })
        return JSON.stringify(require('./capataz').progreso(this.bot, this.decisor.rol))
      },
      // personajes: quién soy y qué otros personajes (bots) conozco, para no tomarlos por jugadores humanos
      personajes: async () => JSON.stringify({ yo: this.nombre, puerto: this.puerto, perfil: observacion.perfilDe(this.bot).nombre, decisor: this.decisor.nombre,
        personajes: [...PERSONAJES] }),
    }
    for (const n of [...Object.keys(habilidades.HABILIDADES), ...Object.keys(rutinas.RUTINAS)]) O[n] = (a) => this.habilidad(n, a)
    return O
  }
}

// F4: una orden en lenguaje sencillo a quien vaya: «Eco, …» a Eco, «todos, …» a todos los de este proceso y, sin nombre, al personaje
// que la recibe (por el puerto). Devuelve las respuestas («Ío: …; Eco: …» con varios).
async function despachar(desde, texto, origen, esperarFin = false) {
  const { a, resto } = ordenes.destinatario(texto, [...VIVOS.keys()])
  const quienes = a === 'todos' ? [...VIVOS.values()] : a ? [VIVOS.get(a)] : [desde]
  const rs = await Promise.all(quienes.map(p => p.ordenar(a ? resto : texto, origen, esperarFin).catch(e => 'fallo: ' + e.message)))
  return quienes.length > 1 ? quienes.map((p, k) => `${p.visible}: ${String(rs[k]).replace(/\.$/, '')}`).join('; ') + '.' : rs[0]
}

// ---- Arranque: un Personaje por argumento (NOMBRE[:PUERTO[:PERFIL[:MODO[:DECISOR[@RUTA]]]]]); puertos por defecto 3001, 3002… ----
// DECISOR (F8.0a): red, guion o capataz, y con @RUTA su política; sin él, IO_DECISOR e IO_POLITICA (bot/decisores.js).
const MODOS = ['ordenes', 'libre']
// sin argumentos, Oqva (2026-11-01: Soma pasó a llamarse Oqva)
const lista = (process.argv.length > 2 ? process.argv.slice(2) : ['Oqva']).map((s, k) => {
  const [nombre, puerto, perfil, modo, ...decisor] = s.split(':')
  return { nombre, puerto: parseInt(puerto) || 3001 + k, perfil: perfil || 'recolector', modo: modo || process.env.IO_MODO || 'ordenes',
    decisor: decisor.join(':') }
})
const DESPUES = process.env.IO_DESPUES === 'libre' ? 'libre' : 'quieto'
for (const x of lista) {
  if (!observacion.perfiles().includes(x.perfil)) { console.error(`perfil desconocido para ${x.nombre}: ${x.perfil}`); process.exit(1) }
  if (!MODOS.includes(x.modo)) { console.error(`modo desconocido para ${x.nombre}: ${x.modo} (libre u ordenes)`); process.exit(1) }
  try { x.decisor = decisores.deTexto(x.decisor) } catch (e) { console.error(`${x.nombre}: ${e.message}`); process.exit(1) }
  PERSONAJES.add(x.nombre)
}
registro.sesion.nombres = lista.map(x => x.nombre)
// Entran de uno en uno (2 s entre ellos) para no saturar el servidor al conectar.
lista.forEach((x, k) => setTimeout(() => new Personaje(x.nombre, x.puerto, x.perfil, lista.length > 1, x.modo, DESPUES, x.decisor), 2000 * k))
// Al cerrar el bot (kill PID o Ctrl+C), el tramo de modo libre en curso se apunta en el diario antes de salir.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => {
  for (const p of VIVOS.values()) try { p.cerrarTramo('bot cerrado') } catch (_) {}
  for (const p of VIVOS.values()) try { persistente.guardar(p.yo.persistente) } catch (_) {}
  process.exit(0)
})
