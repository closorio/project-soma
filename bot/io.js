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
const FOTO_RADIO = 16, FOTO_SEG = 8 // «foto»: a cuántos bloques posan y cuánto sostienen la mirada
const ESQUINAS = new Map() // usuario -> primera esquina de la zona que está marcando
// «continúa» (2026-11-01): las órdenes de trabajo que se retoman si otra las interrumpe, y con qué les faltaba. Moverse, pelear o
// comer no se retoman: «continúa» es volver al trabajo
const ORDENES_TRABAJO = new Set(['armate', 'tala', 'mina', 'construye', 'deshaz', 'cazar', 'caza', 'recoge', 'guarda', 'saca', 'dame', 'explora',
  'fabrica', 'funde', 'pon', 'ilumina', 'baja', 'sube', 'agua', 'vierte', 'duerme', 'consigue'])
function pendienteDe(o, r) {
  if (!ORDENES_TRABAJO.has(o.tipo)) return null
  if (o.tipo === 'tala' && r.troncos != null) return o.n - r.troncos > 0 ? { ...o, n: o.n - r.troncos } : null
  if (o.tipo === 'mina' && r.hechos != null) return o.n - r.hechos > 0 ? { ...o, n: o.n - r.hechos } : null
  if (o.tipo === 'consigue' && r.conseguidos != null) return o.n - r.conseguidos > 0 ? { ...o, n: o.n - r.conseguidos } : null
  if (o.tipo === 'construye' && o.obra) return { ...o, retomar: o.obra }
  return { ...o }
}
const textoDe = (p, texto) => (p.tipo === 'tala' ? `tala ${p.n} troncos` : p.tipo === 'mina' ? texto.replace(/\d+/, String(p.n)) : texto)
// Formación del modo guardaespaldas (2026-11-02, pedido del usuario: «en triángulo conmigo al centro»): los guardaespaldas del mismo
// protegido en este proceso se reparten en un polígono alrededor de él (3: triángulo; 2, uno a cada lado; 4+, en círculo), a RADIO
// bloques. Orientado al mundo (el primero al norte), no a donde mira el protegido: si girase con su cámara, correrían a cada vistazo.
// Meta dinámica: se recoloca cuando el protegido se mueve más de 1 bloque.
const FORMACION_RADIO = 3
class GoalFormacion extends goals.Goal {
  constructor(entidad, k, n) { super(); Object.assign(this, { entidad, k, n }); this.fijar() }
  fijar() {
    const p = this.entidad.position, a = (2 * Math.PI * this.k) / this.n // k = 0 al norte (−z), y en el sentido de las agujas del reloj
    Object.assign(this, { x: Math.floor(p.x + FORMACION_RADIO * Math.sin(a)), y: Math.floor(p.y), z: Math.floor(p.z - FORMACION_RADIO * Math.cos(a)), ex: p.x, ez: p.z })
  }
  heuristic(n) { return Math.hypot(this.x - n.x, this.z - n.z) + Math.abs(this.y - n.y) }
  isEnd(n) { return (this.x - n.x) ** 2 + (this.z - n.z) ** 2 <= 1 && Math.abs(this.y - n.y) <= 1 }
  hasChanged() {
    const p = this.entidad.position
    if (Math.hypot(p.x - this.ex, p.z - this.ez) <= 1) return false
    this.fijar(); return true
  }
  isValid() { return this.entidad != null }
}
// Mi sitio en la formación: los de este proceso que guardan al mismo, por orden alfabético
function puestoEnFormacion(yo, protegido) {
  const lista = [...VIVOS.values()].filter(p => p.guardaespaldas && String(p.guardaespaldas.a).toLowerCase() === String(protegido).toLowerCase())
    .map(p => p.nombre).sort((a, b) => a.localeCompare(b))
  const k = lista.indexOf(yo)
  return k < 0 ? { k: 0, n: 1 } : { k, n: lista.length }
}
// El aviso al no talar lo protegido: las zonas por su nombre y, aparte, si hay zonas de trabajo y el tronco cae fuera
function noTalo(nombres) {
  const otras = nombres.filter(n => n !== zonas.FUERA_DE_TRABAJO)
  return [otras.length ? `No talo en ${otras.join(', ')}: es zona protegida.` : '',
    otras.length < nombres.length ? 'Solo talo dentro de la zona de trabajo.' : ''].filter(Boolean).join(' ')
}
const { PERSONAJES, esBot, pruebas, BOTS } = require('./habilidades/comun')
const depositar = require('./habilidades/depositar')
const conseguir = require('./conseguir') // 2026-11-02: el recolector avanzado («consigue 5 diamantes»)
const cofres = require('./cofres')
const arbolado = require('./arbolado')
const ordenes = require('./ordenes')
const interpreteLlm = require('./interprete_llm')
const agenda = require('./agenda') // 2026-11-01: cola de órdenes, bucles, reintentos e interrupciones que se reanudan
const registro = require('./registro')
const informe = require('./informe') // F6: informe del cuerpo hacia la mente (orden `resumen`)
const memoria = require('./memoria')
const respirar = require('./respirar')
const { conLimite, esperar, moverHasta, viajeLargo, jugadorCercano, prudentes } = require('./habilidades/comun')
const { GoalSeguirFuera } = require('./habilidades/ir_a_jugador')
const reflejos = require('./reflejos') // F7.2: reflejos de supervivencia (comer, huir, defenderse, apartarse, equipar)
const sv = require('./habilidades/sv')
const equipar = require('./habilidades/equipar')
const EQUIPAR_SIEMPRE = process.env.IO_EQUIPAR !== 'no' // 2026-11-01: armadura y arma siempre puestas (IO_EQUIPAR=no lo apaga)
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
const BASE_ZONA = (process.env.IO_BASE || 'HOGAR').toUpperCase() // zona base del dueño (local.mk: IO_BASE), o HOGAR, la de count
const baseZona = () => (zonas.hogares()[0] || {}).nombre || BASE_ZONA // 2026-11-02: la zona de hogar del dueño, si la marcó
const RELLENO_OBRA = require('./habilidades/construir').RELLENO // tierra o adoquín: el andamio de las obras del catálogo
// Nombres de jugador sin distinguir mayúsculas: el server puede decir «Seppuq» aunque en local.mk ponga «seppuq» (2026-11-02)
class NombresSinMayus extends Set {
  constructor(it) { super(); this.orig = []; for (const x of it || []) this.add(x) }
  add(x) { if (!super.has(String(x).toLowerCase())) this.orig.push(x); return super.add(String(x).toLowerCase()) }
  has(x) { return super.has(String(x).toLowerCase()) }
  * [Symbol.iterator]() { yield* this.orig }
}
const AMOS = new NombresSinMayus((process.env.IO_AMOS || '').split(',').map(s => s.trim()).filter(Boolean))
// 2026-11-02: aliados a la hora de pelear (centinela, «protégeme», defensa por defecto): solo los dueños (IO_AMOS) y los que el dueño declare con
// «Oqva es aliado» / «Oqva no es aliado» (se guardan por dueño en mundos/<mundo>/aliados_<dueño>.json, bot/alcance.js). Los demás personajes, aunque sean bots tuyos, no.
const ALIADOS = require('./alcance').aliados(mundo.carpetaDatos, require('./alcance').duenoDe(AMOS), { heredado: path.join(mundo.carpetaDatos, 'aliados.json') })
// IO_PROPIOS=Nombre1,Nombre2: los bots del usuario (de otros procesos de esta misma máquina). Con los de este proceso (VIVOS), cuentan como dueños.
const PROPIOS = new Set((process.env.IO_PROPIOS || '').split(',').map(x => x.trim()).filter(Boolean))
for (const b of require('./plantel').mios()) PROPIOS.add(b) // 2026-11-02: en un mundo compartido, mis bots del plantel (jugadores/<yo>.json)
// El brand del cliente (lo que todo cliente le dice al server al conectar): «soma-bot;dueno=NOMBRE». ASCII, sin espacios.
const marcaDeBot = () => `soma-bot;dueno=${require('./alcance').duenoDe(AMOS)}`
const rutaCentinela = (n) => path.join(mundo.carpetaDatos, `centinela_${n}.json`)
const leerCentinela = (n) => { try { const j = JSON.parse(fs.readFileSync(rutaCentinela(n), 'utf8')); return j.zona ? { zona: j.zona, patrulla: !!j.patrulla } : null } catch (_) { return null } }
const guardarCentinela = (n, c) => { try { if (c) fs.writeFileSync(rutaCentinela(n), JSON.stringify({ zona: c.zona, patrulla: !!c.patrulla }) + '\n'); else fs.rmSync(rutaCentinela(n), { force: true }) } catch (_) {} }
// 2026-11-02: el oficio (tarea repetitiva, empezando por cosechar): sobrevive igual que el centinela. { oficio: 'cosechar', zona }
const rutaOficio = (n) => path.join(mundo.carpetaDatos, `oficio_${n}.json`)
const leerOficio = (n) => { try { const j = JSON.parse(fs.readFileSync(rutaOficio(n), 'utf8')); return j.oficio ? { oficio: j.oficio, zona: j.zona || '' } : null } catch (_) { return null } }
const guardarOficio = (n, c) => { try { if (c) fs.writeFileSync(rutaOficio(n), JSON.stringify({ oficio: c.oficio, zona: c.zona }) + '\n'); else fs.rmSync(rutaOficio(n), { force: true }) } catch (_) {} }
const rutaGuardaespaldas = (n) => path.join(mundo.carpetaDatos, `guardaespaldas_${n}.json`)
const leerGuardaespaldas = (n) => { try { const a = JSON.parse(fs.readFileSync(rutaGuardaespaldas(n), 'utf8')).a; return a ? { a } : null } catch (_) { return null } }
const guardarGuardaespaldas = (n, c) => { try { if (c) fs.writeFileSync(rutaGuardaespaldas(n), JSON.stringify({ a: c.a }) + '\n'); else fs.rmSync(rutaGuardaespaldas(n), { force: true }) } catch (_) {} }
// IO_BOTS_DE=jugador=Bot1,Bot2;otro=Bot3 (de bots_de en personajes.json; respaldo del canal soma:duenos): los personajes de cada jugador; los de un dueño (IO_AMOS) son los propios
const BOTS_DE = new Map((process.env.IO_BOTS_DE || '').split(';').filter(Boolean).map(x => { const [j, b = ''] = x.split('='); return [j.trim().toLowerCase(), b.split(',').map(y => y.trim()).filter(Boolean)] }))
// 2026-11-02: y los del plantel del mundo compartido (mundos/<mundo>/jugadores/), que van por git y no dependen de cómo se lanzó el bot
for (const j of require('./plantel').jugadores()) BOTS_DE.set(j.toLowerCase(), [...new Set([...(BOTS_DE.get(j.toLowerCase()) || []), ...require('./plantel').botsDe(j)])])
const botsDe = (j) => { const k = String(j).toLowerCase(); return [...new Set([...(require('./alcance').botsDelCanal(k) || BOTS_DE.get(k) || []), ...([...AMOS].some(a => a.toLowerCase() === k) ? [...VIVOS.keys(), ...PROPIOS] : [])])] }
const esDueno = (n) => AMOS.has(n) || PROPIOS.has(n) || VIVOS.has(n) // los que nunca se defienden de un golpe suyo ni echa el centinela
const esAliado = (n) => esDueno(n) || ALIADOS.tiene(n) // el que puede entrar en la zona del centinela
const esDeclarado = (n) => ALIADOS.tiene(n) // aliado «por orden»: si pega, «modo diablo»
const SKIN = (process.env.IO_SKIN || '').trim()
// F7.5: los argumentos y la decisión del modo libre están en libre.js (la observación que pide la política: obs u obs_sv).
const libre = require('./libre')
const persistente = require('./memoria_persistente') // F8.0a: lo que sobrevive a reiniciar (fuera del mundo del usuario)
const rutinas = require('./rutinas')
// Las habilidades que cambian el terreno: su línea [terreno] (rotos y puestos) deja al banco reponerlo (probar_noche.py).
const TERRENO = new Set(['refugiarse', 'salir_del_refugio', 'cavar_escalera', 'subir_a_superficie', 'desatascarse', 'explorar', 'verter', 'ir_a_mena', 'cavar_tunel']) // F8.0a: los perfiles v1 como estilos de rutinas (rutina_madera, rutina_noche)
const decisores = require('./decisores') // F8.0a: quién decide en libre, por personaje (red, guion o capataz)
const { ARGS } = libre
const REPOSO_MS = 2000 // F7.2: cada cuánto mira los reflejos de supervivencia en reposo
const AHOGOS_RECUPERANDO = 4 // 2026-11-04: cortes por falta de aire antes de dar por inalcanzable el sitio de la muerte
const LEJOS_RECUPERANDO = 1000 // bloques: más lejos, no compensa el viaje
const AIRE_MIN = 10, RESPIRAR_MS = 30000 // 2026-11-03: aire de 0 a 20 (15 s bajo el agua); con la mitad, a respirar
// El modo libre va por tramos (un episodio de la red cada uno; una línea en el diario): 5 min con la red del mundo del usuario,
// un día de Minecraft (1200 s) con la de supervivencia (libre.TRAMO).
// IO_DUENOS=seppuq[,otro] (2026-11-01): solo esos jugadores mandan por el chat (sin la variable, todos). El puerto local manda siempre.
const DUENOS = new Set((process.env.IO_DUENOS || '').split(',').map(s => s.trim()).filter(Boolean))
const obedece = (u) => DUENOS.size === 0 || [...DUENOS].some(d => d.toLowerCase() === String(u).toLowerCase())
const AVISADOS = new Map() // a quién ya le dijo que no le obedece (una vez por minuto)
const SIGUEME_MAX = 600000 // «sígueme» dura como mucho 10 min (y «defiéndeme», igual)
const HAMBRE_COMER = 14 // come siempre que la barra baje a esto (o menos) y lleve comida buena, haga lo que haga
const GUARDIA_MOBS = 10, GUARDIA_JUGADORES = 5 // «modo guardaespaldas»: un hostil a ≤ 10 bloques de él, o un jugador no aliado a ≤ 5 (rango de golpe), pide pelea
const RANGO_CAMA = { h: 8, v: 5 } // el mismo cuadro con el que el juego no deja dormir (monstruos a ≤ 8 en horizontal y ≤ 5 en vertical)
const REVISION_HERRERO = 600000, ESPERA_HERRERO = 300000 // oficio herrero: cada cuánto revisa las herramientas de los cofres, y cuánto espera tras quedarse sin material
const ESPERA_COSECHA = 90000 // oficio cosechar: sin nada maduro, espera esto antes de volver a mirar el campo
const CENTINELA_DY = 8 // «modo centinela»: solo vigila ± 8 bloques de altura sobre su puesto (la cueva de debajo no cuenta), salvo que la zona tenga y1/y2
const ESCOLTA_RADIO = 12 // «protégeme»: un hostil a ≤ 12 bloques de él o del bot pide pelea aunque aún no haya pegado
const ESCOLTA_REINTENTO_MS = 8000 // y si atacar se negó (creeper, salud baja…), no se le vuelve a pedir en 8 s
const AGRESOR_ESCOLTA_MS = 10000 // un golpe al protegido de hace más de 10 s ya no pide pelea
const NULA = /^(ya estaba|sin amenaza|sin árbol|nada que recoger|no veo|sin tronco al alcance)/ // decisiones que no cambian nada
const PALABRAS = { ordenes: 'órdenes', libre: 'libre' }
// Lo que dice al aceptar una orden con acción (por el chat, y la respuesta inmediata de `orden` por el puerto).
const AVISOS = { portal: () => 'Voy al portal.', ven: () => 'Voy.', sigueme: () => 'Te sigo.', recupera: () => 'Voy a por mis cosas.', escolta: (o) => (o.a ? `Cubro a ${o.a}` : 'Te cubro') + (o.modo === 'agresivo' ? ', a por todo lo hostil.' : '.'), quedate: () => 'Me quedo aquí.', recoge: () => 'Recojo lo que hay cerca.',
  tala: (o) => `Voy a talar ${o.n} tronco${o.n > 1 ? 's' : ''}.`, guarda: () => 'Voy al cofre.',
  huye: (o) => (o.de ? `Me alejo de ${o.de}.` : 'Me alejo de la amenaza.'),
  // F7.2
  come: () => 'Como algo.', ataca: (o) => (o.de ? `Voy a por ${o.de}.` : o.nombre ? `Voy a por ${o.nombre}.` : 'Voy a por el monstruo más cercano.'), refugiate: () => 'Me refugio.',
  sal: () => 'Salgo del refugio.', duerme: () => 'Voy a la cama.', dame: (o) => (o.objeto === 'todo' ? 'Te doy lo que llevo.' : `Te doy ${o.n || 'los'} ${o.objeto}.`), fabrica: (o) => (o.objeto ? `Fabrico: ${o.objeto.replace(/_/g, ' ')}.` : 'Fabrico lo siguiente que me falta.'),
  equipate: () => 'Me equipo.', armate: () => 'Me armo: espada, pico y hacha de piedra.', apartate: () => 'Me aparto del peligro.', caza: () => 'Voy a por comida.',
  // F6
  explora: (o) => `Voy a explorar ${o.rumbo === '-' ? 'por ahí' : 'hacia el ' + o.rumbo}, ${o.n} bloques${o.nada ? ', nadando si hace falta' : ''}.`, mina: (o) => `Voy a minar ${o.n} de ${o.bloque}.`,
  construye: (o) => `Voy a construir: ${o.plano}.`, deshaz: (o) => `Voy a deshacer ${o.obra || 'la obra'}.`, campamento_vuelve: () => 'Vuelvo al campamento.',
  // F8.0b
  cazar: (o) => `Voy a cazar ${o.n} ${o.animal}.`, agua: () => 'Voy a llenar el cubo.', vierte: (o) => `Vierto el ${o.que}.`,
  aliado: () => 'Entendido.',
  centinela_off: () => 'Vale.', guardaespaldas_off: () => 'Vale.',
  guardaespaldas: (o) => `Modo guardaespaldas: no me separo de ${o.a || 'ti'}.`,
  centinela: (o) => (o.patrulla ? `Patrullo ${o.zona || 'el hogar'}.` : `Modo centinela: vigilo ${o.zona}.`),
  oficio: (o) => `Mi oficio: ${o.oficio} en ${o.zona || 'el hogar'}.`, oficio_off: () => 'Vale, sin oficio.',
  materiales: (o) => `Reviso los cofres de ${o.zona} para la granja de piedra.`,
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
    this.agenda = new agenda.Agenda()
    // F4: modo («ordenes» | «libre»), qué hace al terminar una orden («quieto» | «libre»), la orden en curso, la última y lo que
    // está haciendo ahora (promesa: una orden nueva espera a que la anterior suelte el navegador).
    Object.assign(this, { modo: 'ordenes', despues, enCurso: null, ultima: null, ocupado: Promise.resolve(), libre: false, tramo: null })
    this.modoInicial = modo
    // F7.2: reflejos de supervivencia: cuántas habilidades hay en marcha, el reflejo en curso (promesa) y su tarea (una orden nueva
    // la cancela); en reposo se miran cada REPOSO_MS
    Object.assign(this, { enHabilidad: 0, reflejando: null, tareaReflejo: null })
    setInterval(() => this.reposo(), REPOSO_MS)
    setInterval(() => this.hambre().catch(e => this.ev('[hambre] error: ' + e.message)), 2000) // 2026-11-02: come siempre que tenga hambre y comida
    this.guardaespaldas = leerGuardaespaldas(nombre) // 2026-11-02: igual que el centinela (uno u otro, no los dos)
    this.centinela = this.guardaespaldas ? null : leerCentinela(nombre) // 2026-11-02: el modo centinela sobrevive a las órdenes, a morir, a reconectar y a reiniciar
    this.oficio = leerOficio(nombre) // 2026-11-02: el oficio se retoma solo, como la guardia (que manda si hay las dos)
    setInterval(() => this.supervisarCentinela(), 3000)
    setInterval(() => this.vigilarSueno(), 1000) // 2026-11-02: dormir contra la guardia, según lo cerca que esté el enemigo
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
      brand: marcaDeBot(), // el server (plugin SomaConnect) los reconoce como bots por este brand
    })
    if (mundo.tickEnd) require('./tick_end').instalar(bot) // A0 del asistente: 26.3 expulsa sin client_tick_end
    require('./colisiones').vigilar(bot) // 2026-11-02: no se apilan: las hitboxes que se solapan se empujan, como en vanilla
    // 2026-11-02: si un dueño se acuesta de noche, el bot hace lo de «duerme» sin que se lo pidan (el juego solo pasa la noche si duermen todos)
    require('./dormir_con_dueno').vigilar(bot, { esAmo: (u) => (AMOS.size ? AMOS.has(u) : !esBot(u)),
      dormir: () => this.ordenar('duerme', { via: 'puerto', de: 'sueño' }), decir: (t) => this.decir(t) })
    // 2026-11-02: canal del plugin SomaConnect con «dueño → sus bots» (principal; personajes.json bots_de queda de respaldo)
    bot.once('login', () => { try { bot._client.registerChannel('soma:duenos', 'restBuffer', true); bot._client.on('soma:duenos', (d) => require('./alcance').aplicarCanal(d)) } catch (_) {} })
    bot.once('login', () => require('./velocidad').instalar(bot)) // tras los plugins de mineflayer: su oyente va antes que el nuestro
    bot.yo = this.yo
    BOTS.set(this.nombre, bot) // los compañeros del proceso leen de aquí mi objetivo (fase C)
    bot.loadPlugin(pathfinder)
    bot.once('login', () => require('./retroceso').instalar(bot)) // 2026-11-01: el retroceso de los golpes (mineflayer 4.39 lo dejaba en ~0)
    require('./puertas').vigilar(bot) // 2026-11-01: abre la puerta que tiene delante y la cierra al dejarla atrás
    require('./jugadores').vigilar(bot) // 2026-11-01: dónde vio a cada jugador (para «ataca a NOMBRE» fuera de la vista)
    informe.vigilar(bot) // F7.1: hambre, golpe, noche, día, refugiado, reaparecido (solo fuera del mundo del usuario)
    sv.vigilarGolpes(bot, (g) => { this.diablo(g); setImmediate(() => this.alGolpear(g)) }, esDueno) // F7.2: los golpes de monstruos, para el reflejo de defensa
    // 2026-11-03, banco: se ahogó dos veces cavando hacia una mena (el agua entra en el túnel; los reflejos solo se miran entre
    // habilidades). Sin aire con la cabeza en el agua: cortar lo que haga y salir a respirar
    // 2026-11-03, banco: murió «suffocated in a wall» bajando una escalera entre grava. Si pierde vida con arena o grava en la
    // cabeza, la pica (a mano también se rompe en ≈ 1 s), como mucho 8 veces seguidas
    bot.on('health', () => { if (bot.health > 0 && this.cabezaEnArena() && !this.desenterrando) this.desenterrar().catch(e => this.ev('[desenterrar] error: ' + e.message)) })
    bot.on('breath', () => { if (bot.oxygenLevel !== undefined && bot.oxygenLevel <= AIRE_MIN && this.cabezaEnAgua()) setImmediate(() => this.alAhogarse()) })
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
    this.muestrasInventario = []
    clearInterval(this.relojInventario) // al reconectar, uno solo
    this.relojInventario = setInterval(() => { // cada 0,5 s, cuánto lleva (las 5 últimas), para saber qué tenía al morir
      if (!bot.entity || bot.health <= 0) return
      this.muestrasInventario = [...this.muestrasInventario, bot.inventory.items().reduce((a, i) => a + i.count, 0)].slice(-5)
    }, 500)
    bot.on('messagestr', (m) => { // la causa de la muerte: el mensaje del server que me nombra, en los 3 s siguientes
      const u = this.ultimaMuerte
      if (u && !u.causa && Date.now() - u.t < 3000 && m.includes(bot.username) && !m.startsWith('<')) u.causa = m // 2026-11-04: lo que él mismo dice no es la causa
    })
    bot.on('spawn', () => {
      if (!this.recuperarPendiente) { this.agenda.pausada = false; return }
      this.recuperarPendiente = false
      // a los 2 s, cuando ya llegó el inventario nuevo (al reaparecer, el cliente aún enseña el viejo un momento): con keepInventory
      // reaparece con todo y no vuelve
      setTimeout(() => {
        const lleva = bot.inventory.items().reduce((a, i) => a + i.count, 0)
        if (this.ultimaMuerte && lleva >= this.ultimaMuerte.objetos) { this.ev(`[recupera] reaparezco con ${lleva} objetos: no hace falta`); this.agenda.pausada = false; return }
        this.ev('[recupera] reaparezco: voy a por mis cosas')
        // una urgencia de la agenda: va antes que lo que hacía y, al acabar, lo retoma («ataca a X sin parar» sigue tras recuperar)
        // 2026-11-03, banco M: la agenda pasa a modo órdenes y el capataz no volvía a dar un paso: al acabar, otra vez a libre
        if (this.modo === 'libre') this.libreTrasAgenda = true
        this.ahogosRecuperando = 0
        this.recuperados = 0
        const e = this.agenda.entrada({ tipo: 'recupera' }, 'recuperar mis cosas', 'auto')
        e.fin = new Promise(res => { e.resolver = res })
        for (const x of this.agenda.pila.filter(x => x.o.tipo === 'recupera')) { this.agenda.quitar(x); this.soltar(x, { exito: false, texto: '' }) } // la nueva cubre los dos sitios
        this.agenda.interrumpir(e)
        this.agenda.pausada = false
        this.supervisar()
      }, 2500)
    })
    bot.once('spawn', () => {
      bot.pathfinder.setMovements(zonas.aplicar(new Movements(bot)))
      // 2026-11-02: cuando el navegador rompe un bloque al moverse, la herramienta de ese bloque (o la mano si ninguna acelera)
      bot.pathfinder.bestHarvestTool = (k) => sv.mejorHerramienta(bot, k).item
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
      if (!obedece(u) || (AMOS.size && !AMOS.has(u))) { // con dueños (IO_DUENOS o IO_AMOS), solo atiende por el chat a esos jugadores (órdenes y !zona)
        const dest = ordenes.destinatario(t, [...VIVOS.keys()]).a
        if (dest === 'todos') return // 2026-11-02: «todos …» de quien no es su dueño se ignora sin avisar (no contestan todos los bots a la vez)
        if (dest && Date.now() - (AVISADOS.get(u) || 0) > 60000) { AVISADOS.set(u, Date.now()); bot.chat(`Solo obedezco a ${[...(AMOS.size ? AMOS : DUENOS)].join(', ')}.`) }
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
      this.agenda.pausada = true // muerto: la agenda espera a reaparecer, y lo que hacía se retoma (no se pierde)
      this.cortar('interrupcion')
      this.ev(`[mc] ${this.visible} ha muerto`); informe.evento(bot, 'muerto', bot.entity?.position?.floored().toArray())
      // 2026-11-01: recuperar las cosas al reaparecer (case 'recupera'); IO_RECUPERAR=no lo apaga. Muerto recuperando: no vuelve.
      // el server vacía el inventario antes de mandar la vida a 0: lo que llevaba es lo máximo de los últimos 2,5 s
      const objetos = Math.max(0, ...(this.muestrasInventario || []))
      // 2026-11-01 (pedido del usuario): recuperar es prioridad. Muerto recuperando, vuelve también (a los dos sitios: lo que llevaba
      // encima y lo que quedó en el primero), salvo tras 3 muertes seguidas recuperando (bucle de muertes)
      this.muertesRecuperando = this.recuperando ? (this.muertesRecuperando || 0) + 1 : 0
      this.ultimaMuerte = { pos: bot.entity.position.clone(), t: Date.now(), causa: null, objetos, segunda: this.muertesRecuperando >= 3 }
      this.sitiosMuerte = [this.ultimaMuerte, ...(this.recuperando ? this.sitiosMuerte || [] : [])].slice(0, 3)
      this.recuperarPendiente = process.env.IO_RECUPERAR !== 'no' && !this.ultimaMuerte.segunda && this.sitiosMuerte.some(x => x.objetos > 0)
      this.ev(`[recupera] muerto con ${objetos} objetos en ${this.ultimaMuerte.pos.floored()}${this.recuperarPendiente ? '' : ' (no volveré)'}`)
      try { persistente.anotarMuerte(bot) } catch (e) { this.ev('[memoria] no se pudo guardar la muerte: ' + e.message) }
    })
    bot.on('health', () => {
      if (bot.health < 8) { this.ev(`[mc] salud baja: ${bot.health}`); if (!this.saludBaja) informe.evento(bot, 'salud_baja', bot.health) }
      this.saludBaja = bot.health < 8 // un aviso por cada bajada por debajo de 8, no uno por golpe
    })
    bot.on('kicked', (r) => {
      this.ev('[mc] expulsado: ' + JSON.stringify(r)); informe.evento(bot, 'expulsado', String(r).slice(0, 80))
      this.frenado = /throttled/i.test(JSON.stringify(r)) // Paper: conexiones desde la misma IP a < 4 s (2026-11-02)
    })
    bot.on('error', (e) => this.ev('[mc] error: ' + e.message))
    // tras «Connection throttled» (Paper, misma IP), una espera al azar de 6-12 s: si no, los bots del mismo proceso reintentan a la
    // vez y se rechazan unos a otros para siempre (2026-11-02)
    bot.on('end', () => {
      this.tarea.cancelada = true; informe.evento(bot, 'desconectado')
      // IO_RECONECTAR=0 (lo pone bot/conectar.sh, el /connect del juego): solo entra cuando el usuario lo manda, así que si lo echan o el server cae, no vuelve solo
      if (process.env.IO_RECONECTAR === '0') {
        this.ev('[mc] desconectado; sin reconexión automática (se vuelve con /connect)')
        try { this.cerrarTramo('desconectado') } catch (_) {}
        try { persistente.guardar(this.yo.persistente) } catch (_) {}
        return process.exit(0)
      }
      const ms = this.frenado ? 6000 + Math.floor(Math.random() * 6000) : 5000
      this.frenado = false
      this.ev(`[mc] desconectado; reconectando en ${Math.round(ms / 1000)} s`); setTimeout(() => this.conectar(), ms)
    })
  }

  // Una tarea nueva cancela la anterior. Fuera del bucle del modo libre (libre = false), cualquier tarea es una orden: pasa a
  // modo órdenes (la red deja de decidir), también con las órdenes directas del puerto (hab, cerebro, talar, ir, ven…).
  // Corta lo que esté en marcha con un motivo (agenda.clasificar): usuario (para, salta) · reemplazo (orden nueva) · interrupcion (urgencia).
  cortar(motivo) {
    if (!this.tarea.cancelada) { this.tarea.motivo = motivo; this.tarea.cancelada = true }
    if (this.tareaReflejo) this.tareaReflejo.cancelada = true
    try { this.bot.pathfinder.setGoal(null); this.bot.stopDigging() } catch (_) {}
  }

  nuevaTarea(libre = false) {
    if (!this.tarea.cancelada) this.tarea.motivo = this.tarea.motivo || 'reemplazo'
    this.tarea.cancelada = true
    if (!libre && this.tareaReflejo) this.tareaReflejo.cancelada = true // una orden manda sobre un reflejo en reposo
    if (!libre && this.modo === 'libre') this.ponerModo('ordenes', 'orden directa del puerto')
    return (this.tarea = { cancelada: false, libre })
  }

  // Tras una interrupción (un golpe: alGolpear se defiende), deja seguir a la tarea larga: espera a la defensa y la descancela.
  // Devuelve false si la cortó otra cosa (para, una orden nueva).
  async reanudar(tarea) {
    await Promise.race([this.defendiendo, esperar(30000)]).catch(() => {})
    if (!tarea.cancelada || tarea.motivo !== 'interrupcion' || tarea !== this.tarea) return false
    tarea.cancelada = false; tarea.motivo = null
    return true
  }

  async conseguirCon(material, n, ctx) {
    this.enConseguir = (this.enConseguir || 0) + 1
    try { return await conseguir.ejecutar(this.bot, material, n, { ...ctx, reanudar: () => this.reanudar(ctx.tarea) }) } finally { this.enConseguir-- }
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
    await sv.equiparPara(bot, b)
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
    if (nombre === 'conseguir') { // 2026-11-02: el recolector avanzado como paso del capataz (rol minero) o por el puerto; se lo queda
      const paso = async (h, x) => { const r = await this.ejecutarHabilidad(h, x, tarea); return [r, { habilidad: h, exito: !!r.exito, causa: String(r.causa || '') }] }
      const r = await this.conseguirCon(args[0], parseInt(args[1]) || 1, { paso, tarea, quien: '', entregar: false, decir: (t) => this.ev('[conseguir] ' + t),
        orden: (tipo, n) => this.hacer({ tipo, ...(n ? { n } : {}) }, tarea, '') })
      this.ev(`[conseguir] ${args.join(' ')} → ${r.exito ? 'éxito' : 'fallo'}: ${r.causa} (${r.conseguidos}/${r.pedidos}, ${r.s} s)`)
      return { habilidad: 'conseguir', ...r, pasos: r.pasos.length }
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
      if (nombre !== 'comer' && !tarea.cancelada && sv.debeComerPorSalud(this.bot)) { // 2026-11-01: con poca vida, come (si lleva)
        this.ev(`[curarse] salud ${Math.round(this.bot.health)}, hambre ${this.bot.food}: como`)
        r.curarse = await this.ejecutarHabilidad('comer', ['20'], tarea)
      }
      const falta = nombre !== 'equipar' && !tarea.cancelada && EQUIPAR_SIEMPRE && equipar.pendiente(this.bot) // 2026-11-01: lo mejor puesto
      if (falta) r.equipado = await this.ejecutarHabilidad('equipar', [falta], tarea)
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
      // 2026-11-04, banco de recuperar: explorar para salir del agua lo alejaba de sus cosas
      const r = await habilidades.ejecutar(this.bot, x.habilidad, x.habilidad === 'apartarse' && this.recuperando ? ['sin_explorar'] : x.args, tarea)
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

  // 2026-11-02: un aliado declarado («Oqva es aliado») que le pega deja de ser intocable: lo dice y se defiende (alGolpear, centinela y
  // «protégeme» ya cuentan sus golpes; solo los de un dueño no cuentan). Un aviso cada 30 s por aliado.
  diablo(g) {
    if (!g || g.tipo !== 'jugador' || !esDeclarado(g.nombre) || esDueno(g.nombre)) return
    const k = String(g.nombre).toLowerCase(), ahora = Date.now()
    this.diablos = this.diablos || new Map()
    if (ahora - (this.diablos.get(k) || 0) < 30000) return
    this.diablos.set(k, ahora)
    this.bot.chat('Modo diablo activado')
    this.ev(`[defensa] modo diablo: ${g.nombre} (aliado) le ha pegado`)
  }

  // 2026-11-02: SIEMPRE devuelve el golpe de un monstruo o de un jugador que no sea aliado. Con los reflejos activos y el personaje en reposo
  // decide reposo() (reflejos.js); si no, o si está en mitad de una orden o una habilidad, la deja y ataca a quien le golpeó (acorralado:
  // sin negarse por salud o número; a puñetazos si no lleva arma). «protégeme» ya se ocupa de los golpes por su cuenta; un creeper, no.
  alGolpear(g) {
    const bot = this.bot
    if (!bot || !bot.entity || this.defendiendo || this.escoltando || g.tipo === 'creeper') return
    if (sv.activos(bot) && !(this.enHabilidad || this.reflejando || this.enCurso || this.enIr)) return this.reposo()
    this.defendiendo = (async () => {
      // 2026-11-02: una obra del catálogo no se pierde por una pelea: queda en pausa (agenda: interrumpida) y se retoma al acabar
      const ev = this.enVuelta
      // 2026-11-04, banco M: ni «recuperar mis cosas» (M4 perdió 477 objetos) ni ninguna otra: sin motivo, la agenda lo tomaba por una orden nueva y la borraba
      if (ev && !this.tarea.cancelada) this.tarea.motivo = 'interrupcion'
      // 2026-11-03: tampoco un «consigue» (banco: un golpe en «ármate» lo canceló entero): se defiende y conseguir sigue (reanudar)
      if (this.enConseguir && !this.tarea.cancelada) this.tarea.motivo = 'interrupcion'
      this.tarea.cancelada = true
      if (this.tareaReflejo) this.tareaReflejo.cancelada = true
      try { bot.pathfinder.setGoal(null); bot.stopDigging() } catch (_) {}
      await Promise.race([this.ocupado, esperar(1500)]).catch(() => {})
      const tarea = this.tareaReflejo = { cancelada: false }
      const args = [`id:${g.id}`, '20', 'acorralado', ...(sv.mejorArma(bot) ? [] : ['puno'])]
      const r = await habilidades.ejecutar(bot, 'atacar', args, tarea)
      sv.atendido(bot)
      this.ev(`[defensa] atacar ${args.join(' ')} (golpe de ${g.nombre}) → ${r.exito ? 'éxito' : 'fallo'}: ${r.causa} (${r.ms} ms)`)
      informe.habilidad(bot, { nombre: 'atacar', args: args.join(' '), exito: !!r.exito, causa: String(r.causa || ''), ms: r.ms, reflejo: true, motivo: `defensa: golpe de ${g.nombre}` })
    })().catch(e => this.ev('[defensa] error: ' + e.message)).finally(() => { this.defendiendo = null; if (this.tareaReflejo && !this.tareaReflejo.cancelada) this.tareaReflejo = null })
  }

  cabezaEnAgua() { return respirar.cabezaEnAgua(this.bot) }

  cabezaEnArena() {
    const ojo = this.bot.entity && this.bot.blockAt(this.bot.entity.position.offset(0, 1.62, 0))
    return !!ojo && /^(sand|red_sand|gravel|suspicious_sand|suspicious_gravel)$/.test(ojo.name)
  }

  async apartarseDeLaGrava() {
    const bot = this.bot, b = bot.entity.position.floored()
    const libre = (v) => { const k = bot.blockAt(v); return !!k && k.boundingBox !== 'block' }
    const lado = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]) => b.offset(x, 0, z)).find(v => libre(v) && libre(v.offset(0, 1, 0)))
    if (!lado) return
    try {
      await bot.lookAt(lado.offset(0.5, 1.6, 0.5), true)
      bot.setControlState('forward', true)
      await esperar(500)
    } finally { bot.setControlState('forward', false) }
  }

  async desenterrar() {
    const bot = this.bot
    this.desenterrando = true
    try {
      for (let k = 0; k < 8 && bot.health > 0 && this.cabezaEnArena(); k++) {
        const ojo = bot.blockAt(bot.entity.position.offset(0, 1.62, 0))
        try { bot.stopDigging(); await conLimite(bot.dig(ojo, true), 3000, () => bot.stopDigging()) } catch (_) {}
        await esperar(300)
        // 2026-11-04, prueba a mano: la grava sigue cayendo y ahoga más deprisa de lo que se pica: a la segunda, a un lado
        if (k >= 1 && this.cabezaEnArena()) await this.apartarseDeLaGrava()
      }
      this.ev(`[desenterrar] grava en la cabeza → ${this.cabezaEnArena() ? 'sigue' : 'fuera'}`)
    } finally { this.desenterrando = false }
  }

  // Sin aire: como un golpe (alGolpear), corta la tarea (un «consigue» sigue luego, reanudar) y sale a respirar (respirar.js)
  alAhogarse() {
    const bot = this.bot
    if (!bot || !bot.entity || this.defendiendo || !(bot.health > 0)) return
    this.respirando = true
    this.defendiendo = (async () => {
      // 2026-11-03, banco M: sin motivo, la agenda lo tomaba por una orden nueva y dejaba «recuperar mis cosas»: se retoma al respirar
      if ((this.enConseguir || this.enVuelta) && !this.tarea.cancelada) this.tarea.motivo = 'interrupcion'
      if (this.enVuelta && this.enVuelta.o.tipo === 'recupera') this.ahogosRecuperando = (this.ahogosRecuperando || 0) + 1
      this.tarea.cancelada = true
      if (this.tareaReflejo) this.tareaReflejo.cancelada = true
      try { bot.pathfinder.setGoal(null); bot.stopDigging() } catch (_) {}
      await Promise.race([this.ocupado, esperar(800)]).catch(() => {}) // que lo cortado suelte el navegador
      const r = await respirar.respirar(bot, RESPIRAR_MS)
      this.ev(`[respirar] sin aire → ${r.fuera ? 'fuera' : 'sigo en el agua'} (aire ${bot.oxygenLevel}, ${r.picados} picados, ${r.ms} ms)`)
      await this.salirSiAtascado()
    })().catch(e => this.ev('[respirar] error: ' + e.message)).finally(() => { this.defendiendo = null; this.respirando = false })
  }

  // 2026-11-04, prueba a mano: entre raíces de manglar anegadas respiraba una y otra vez sin moverse, y ni llegaba a sus cosas ni salía:
  // a la tercera en el mismo sitio, hacia arriba cavando. Si sale, la recuperación sigue (los ahogos de antes ya no cuentan).
  async salirSiAtascado() {
    const bot = this.bot, p = bot.entity.position, a = this.ahogoAqui
    if (a && Date.now() - a.t < 60000 && a.pos.distanceTo(p) <= 2) { a.n++; a.t = Date.now() } else this.ahogoAqui = { pos: p.clone(), t: Date.now(), n: 1 }
    if (this.ahogoAqui.n < 3) return
    this.ahogoAqui = null
    const tarea = this.tareaReflejo = { cancelada: false }
    const r = await habilidades.ejecutar(bot, 'subir_a_superficie', [], tarea)
    if (this.tareaReflejo === tarea) this.tareaReflejo = null
    this.ev(`[respirar] atascado en el agua: subo → ${r.exito ? 'éxito' : 'fallo'}: ${r.causa}`)
    if (r.exito && !/^(ya fuera|al descubierto)$/.test(r.causa)) this.ahogosRecuperando = 0
  }

  // En reposo (ninguna habilidad, orden ni reflejo en marcha; en modo libre, entre dos decisiones: el bucle espera a que acabe):
  // cada REPOSO_MS y en cuanto le golpea un monstruo.
  reposo() {
    const bot = this.bot
    if (this.respirando || this.enHabilidad || this.reflejando || this.enCurso || this.enIr || !bot || !bot.entity) return
    if (sv.debeComerPorSalud(bot)) { // 2026-11-01: con poca vida, comer (si lleva), con o sin reflejos
      const tarea = this.tareaReflejo = { cancelada: false }
      this.ev(`[curarse] salud ${Math.round(bot.health)}, hambre ${bot.food}: como`)
      this.reflejando = this.ejecutarHabilidad('comer', ['20'], tarea).catch(e => this.ev('[curarse] error: ' + e.message))
        .finally(() => { this.reflejando = null; if (this.tareaReflejo === tarea) this.tareaReflejo = null })
      return
    }
    const falta = EQUIPAR_SIEMPRE && equipar.pendiente(bot) // 2026-11-01 (pedido del usuario): siempre la mejor armadura y el arma en la mano
    if (falta) {
      const tarea = this.tareaReflejo = { cancelada: false }
      this.reflejando = this.ejecutarHabilidad('equipar', [falta], tarea).catch(e => this.ev('[equipar] error: ' + e.message))
        .finally(() => { this.reflejando = null; if (this.tareaReflejo === tarea) this.tareaReflejo = null })
      return
    }
    if (!sv.activos(bot)) return
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
    // 2026-11-04, banco M: el reinicio a 1 s llegaba ya en modo órdenes y su nuevaTarea(true) cortaba «recuperar mis cosas» (M1, 259 objetos)
    if (this.modo !== 'libre') return
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
      this.decirAlDueno(`No puedo decidir solo: ${e.message}. Sigo en modo órdenes.`, 'puerto'); this.ponerModo('ordenes', 'sin red'); return
    }
    const tarea = this.nuevaTarea(true)
    await Promise.race([this.ocupado, esperar(3000)]).catch(() => {})
    let fallos = 0, nulas = 0
    try {
      while (!tarea.cancelada && this.modo === 'libre') {
        const bot = this.bot
        if (!bot.entity || !bot.entity.position) { await esperar(2000); continue } // reconectando
        if (this.reflejando) { await this.reflejando; continue } // F7.2: un reflejo en reposo: decidir cuando acabe
        if (this.respirando) { await Promise.resolve(this.defendiendo).catch(() => {}); continue } // con objetivo, el navegador pisa el salto
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
  // 2026-11-02 (pedido del usuario): lo que sale mal («No pude recoger: …», «No te veo.», «No reconozco…») va solo al dueño, por privado (/msg),
  // para no saturar el chat público. Se queda público el aviso de que acepta la orden y el de que la cumple. `quien`: «chat de NOMBRE» (le
  // contesta a él) o cualquier otro origen (puerto, mente…): al primer dueño conectado. Sin ninguno a la vista, solo al registro.
  decirAlDueno(t, quien) {
    const bot = this.bot, u = quien && String(quien).startsWith('chat de ') ? String(quien).slice(8) : null
    const nombre = u || Object.keys(bot.players).find(n => n !== bot.username && AMOS.has(n))
    if (!nombre) { this.ev(`[privado] ${t}`); return }
    for (const trozo of String(t).match(/.{1,200}(?:\s|$)/g) || []) try { bot.chat(`/msg ${nombre} ${trozo.trim()}`) } catch (_) {}
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
    let lista = ordenes.interpretarVarias(texto) // 2026-11-01: «X y luego Y», con su repetición (agenda.js)
    // 2026-11-02: si el parser no la entiende, un LLM local la reformula y el parser la valida (interprete_llm.js; SOMA_OLLAMA_MODELO)
    if (!lista && interpreteLlm.activo()) {
      const r = await interpreteLlm.reformular(texto)
      lista = r && ordenes.interpretarVarias(r)
    }
    const o = lista && lista[0]
    // quién manda: el chat (con su usuario), la mente (puerto con de=mente), u otro por el puerto (Ío, pruebas)
    const quien = origen.via === 'chat' ? `chat de ${origen.usuario}` : origen.de === 'mente' ? 'mente' : origen.de ? `puerto (${origen.de})` : 'puerto'
    if (!o) {
      // corto (pedido del usuario, 2026-10-31): la lista entera solo con «ayuda»
      const t = texto.trim() ? `No reconozco «${texto}».` : '¿Qué hago? Di «ayuda» para ver las órdenes.'
      if (origen.via === 'chat') this.decirAlDueno(t, quien)
      this.anotarOrden({ texto, quien, modo: this.modo, exito: false, resultado: 'no entendida', s: 0 })
      return t
    }
    const responder = (t, exito = true) => {
      if (origen.via === 'chat') exito ? this.decir(t) : this.decirAlDueno(t, quien)
      this.anotarOrden({ texto, quien, modo: this.modo, exito, resultado: t, s: 0 })
      return t
    }
    // 2026-11-01 (agenda.js): para (corta y deja la cola en espera), salta, para todo, cola
    if (o.tipo === 'agenda') { const l = this.agenda.lista(); return responder(l.length ? l.join(' · ') : 'No tengo nada pendiente.') }
    if (o.tipo === 'quedate' || o.tipo === 'salta' || o.tipo === 'para_todo') {
      const actual = this.agenda.siguiente()
      if (o.tipo === 'para_todo') { this.agenda.vaciar(); this.pendiente = null }
      else if (actual) this.agenda.quitar(actual)
      if (o.tipo === 'quedate') this.agenda.enEspera = this.agenda.cola.length > 0
      this.cortar('usuario')
      if (this.modo === 'libre' && o.tipo !== 'salta') this.ponerModo('ordenes', `orden «${texto}»`)
      if (actual) this.soltar(actual, { exito: false, texto: `Dejo «${actual.texto}».` })
      if (o.tipo === 'salta') { this.supervisar(); return responder(actual ? `Salto «${actual.texto}».` : 'No hago nada que saltar.') }
      const n = this.agenda.cola.length
      return responder(o.tipo === 'para_todo' ? 'Olvido todo: me quedo aquí.' : `Me quedo aquí.${n ? ` Tengo ${n} en cola: «continúa» para seguir, «para todo» para olvidarla.` : ''}`)
    }
    // 2026-11-01: «continúa» retoma la última orden de trabajo interrumpida, con lo que le faltaba (this.pendiente), o la cola en espera
    if (o.tipo === 'continua') {
      if (!this.pendiente && this.agenda.enEspera && this.agenda.cola.length) {
        this.agenda.enEspera = false
        this.supervisar()
        return responder(`Sigo con la cola: «${this.agenda.cola[0].texto}».`)
      }
      if (!this.pendiente) {
        const t = 'No tengo nada a medias.'
        if (origen.via === 'chat') this.decirAlDueno(t, quien)
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
    if (o.tipo === 'foto') { // 2026-11-02: no interrumpe nada; solo posa quien está cerca de quien lo pide (los lejanos callan)
      const r = await this.posarFoto(quien)
      if (r.exito && origen.via === 'chat') this.decir(r.texto)
      this.anotarOrden({ texto, quien, modo: this.modo, exito: r.exito, resultado: r.texto, s: 0 })
      return r.texto
    }
    const inmediata = { estado: true, ayuda: true, modo: true, despues: true, perfil: true, campamento: true, decisor: true, rol: true }
    if (inmediata[o.tipo]) {
      const modoAntes = this.modo
      const r = this.ordenInmediata(o)
      if (origen.via === 'chat') r.exito === false ? this.decirAlDueno(r.texto, quien) : this.decir(r.texto)
      const resumen = { estado: 'dije mi estado', ayuda: 'dije lo que sé hacer' }[o.tipo] || r.texto
      this.anotarOrden({ texto, quien, modo: modoAntes, exito: r.exito, resultado: resumen, s: 0 })
      return r.texto
    }
    const varias = lista.length > 1
    const fin = this.ordenAccion(o, varias || o.repeticion ? o.frase : texto, quien)
    for (const x of lista.slice(1)) this.ordenAccion(x, x.frase, quien, true).catch(e => this.ev('[orden] fallo: ' + e.message))
    if (esperarFin) return (await fin).texto
    fin.catch(e => this.ev('[orden] fallo: ' + e.message))
    return (AVISOS[o.tipo] ? AVISOS[o.tipo](o) : 'Voy.') + (varias ? ` Y luego: ${lista.slice(1).map(x => '«' + x.frase + '»').join(', ')}.` : '')
  }

  // 2026-11-02 («foto»): si quien lo pide está a menos de FOTO_RADIO bloques, se quita el casco y mira adonde mira él (su yaw y pitch),
  // sosteniendo la mirada FOTO_SEG segundos por si otro comportamiento la mueve. Sin interrumpir la orden en curso.
  async posarFoto(quien) {
    const bot = this.bot, u = this.jugadorDe(quien)
    const e = u ? bot.players[u]?.entity : jugadorCercano(bot, FOTO_RADIO)
    if (!e || bot.entity.position.distanceTo(e.position) > FOTO_RADIO) return { exito: false, texto: 'Estoy lejos para la foto.' }
    const yaw = e.yaw, pitch = e.pitch
    let casco = false
    if (bot.inventory.slots[bot.getEquipmentDestSlot('head')]) { try { await bot.unequip('head'); casco = true } catch (err) { this.ev('[foto] no pude quitarme el casco: ' + err.message) } }
    const t0 = Date.now()
    await bot.look(yaw, pitch, true).catch(() => {})
    const mantener = setInterval(() => { if (Date.now() - t0 > FOTO_SEG * 1000) clearInterval(mantener); else bot.look(yaw, pitch, true).catch(() => {}) }, 300)
    return { exito: true, texto: casco ? 'Sin casco y mirando contigo: foto.' : 'Mirando contigo: foto.' }
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
  async ordenAccion(o, texto, quien, encolar = false) {
    // 2026-11-01 (agenda.js): una orden nueva reemplaza la cabeza de la cola (la vieja queda para «continúa»); con encolar («y luego»),
    // va al final. Devuelve una promesa con el resultado final de esta orden (tras sus vueltas y reintentos).
    if (o.de) o.de = Object.keys(this.bot.players).find(n => n.toLowerCase() === o.de) || o.de // «huye de seppuq» → Seppuq
    const e = this.agenda.entrada(o, texto, quien)
    e.modoAntes = this.modo
    e.fin = new Promise(res => { e.resolver = res })
    this.libreTrasAgenda = false // una orden real manda sobre la vuelta al modo libre tras recuperar
    if (this.modo === 'libre') this.ponerModo('ordenes', `orden «${texto}»`)
    if (encolar && !this.agenda.vacia()) { this.agenda.encolar(e); this.supervisar(); return e.fin }
    const vieja = this.agenda.reemplazar(e)
    if (vieja && vieja !== this.enVuelta) this.soltar(vieja, { exito: false, texto: `Dejo «${vieja.texto}» por la orden nueva.` })
    this.cortar('reemplazo')
    // 2026-11-02: acostado, una orden de moverse («ven») respondía «voy» y seguía en la cama: se despierta antes (no con «duerme» ni al reanudar guardias)
    if (this.bot.isSleeping && o.tipo !== 'duerme' && !o.reanuda) this.bot.wake().catch(() => {})
    this.supervisar()
    return e.fin
  }

  // Resuelve la promesa de una entrada que sale de la agenda (una sola vez).
  soltar(e, r) { if (e.resolver) { const f = e.resolver; e.resolver = null; f(r) } }

  // El supervisor (2026-11-01): un solo bucle por personaje que va dando vueltas a la agenda hasta vaciarla; al acabar, quieto o libre.
  supervisar() {
    if (this.supervisando) return this.supervisando
    this.supervisando = (async () => {
      let ultima = null
      try {
        for (;;) {
          if (this.agenda.pausada) { await esperar(500); continue } // muerto: hasta reaparecer
          if (this.defendiendo) { await Promise.race([this.defendiendo, esperar(30000)]).catch(() => {}); continue } // peleando: nada se retoma a medias
          const e = this.agenda.siguiente()
          if (!e) break
          ultima = await this.vuelta(e) || ultima
        }
      } catch (err) { this.ev('[agenda] fallo: ' + err.message) } finally { this.supervisando = null }
      if (ultima && this.despues === 'libre' && this.agenda.vacia() && this.modo !== 'libre' && !this.centinela && !this.guardaespaldas && !this.oficio) this.ponerModo('libre', `al terminar «${ultima.texto}»`)
      if (this.libreTrasAgenda && this.agenda.vacia()) { // aunque la recuperación fallara (ultima nula)
        this.libreTrasAgenda = false
        if (this.modo !== 'libre' && !this.centinela && !this.guardaespaldas && !this.oficio) this.ponerModo('libre', 'tras recuperar mis cosas')
      }
    })()
    return this.supervisando
  }

  // Una vuelta de una entrada: hacer() y, según agenda.clasificar, fuera, otra vuelta, reintento (con su recuperación) o se retoma luego.
  // Devuelve la entrada si salió de la agenda terminada (para el «al terminar»).
  async vuelta(e) {
    const o = e.o, texto = e.texto
    const guardia = o.tipo === 'centinela' || o.tipo === 'guardaespaldas' || o.tipo === 'oficio' // los modos de guardia no se anuncian ni se anotan al retomarlos o dejarlos
    const previo = this.ocupado
    const tarea = this.nuevaTarea()
    this.enVuelta = e
    try { this.bot.pathfinder.setGoal(null); this.bot.stopDigging() } catch (_) {}
    await Promise.race([previo, esperar(3000)]).catch(() => {})
    const t0 = Date.now()
    this.enCurso = { texto, t0 }
    if (e.reanudar) { if (!guardia) this.decir(`Sigo con «${texto}».`); e.reanudar = false } else if (!e.vueltas && !e.fallosSeguidos && !o.reanuda && AVISOS[o.tipo]) this.decir(AVISOS[o.tipo](o))
    let r
    try { r = tarea.cancelada ? { exito: false, texto: '' } : await this.hacer(o, tarea, e.quien) } catch (err) { r = { exito: false, texto: 'No pude: ' + err.message } }
    r = r || { exito: false, texto: '' }
    if (this.enCurso && this.enCurso.t0 === t0) this.enCurso = null
    this.enVuelta = null
    const motivo = tarea.cancelada ? tarea.motivo || 'reemplazo' : null
    const clase = agenda.clasificar(e, r, motivo)
    const s = (Date.now() - t0) / 1000
    const anotar = (exito, resultado, despues) => this.anotarOrden({ texto, quien: e.quien, modo: e.modoAntes || this.modo, exito, resultado, s, pasos: r.pasos, despues })
    if (clase === 'interrumpida') { e.reanudar = true; this.ev(`[agenda] «${texto}» en pausa por una urgencia`); return null }
    if (clase === 'cortada') {
      this.agenda.quitar(e)
      if (motivo === 'reemplazo') {
        const p = pendienteDe(o, r)
        if (p) this.pendiente = { o: p, texto: textoDe(p, texto) }
        const t = `Dejo «${texto}» por la orden nueva.${o.tipo === 'tala' && r.texto ? ' ' + r.texto : ''}`
        if (!guardia) { this.decirAlDueno(t, e.quien); anotar(false, t, 'otra orden') }
        this.soltar(e, { ...r, exito: false, texto: t })
      } else { if (!guardia) anotar(false, `cortada (${motivo})`, 'quieto'); this.soltar(e, { ...r, exito: false, texto: r.texto || `Dejo «${texto}».` }) }
      return null
    }
    const ms = this.agenda.anotar(e, clase)
    if (clase === 'repetir') { if (r.texto) this.decir(r.texto); this.ev(`[agenda] «${texto}»: vuelta ${e.vueltas + 1}`); return null }
    if (clase === 'reintentar') {
      const aux = agenda.recuperar(r.texto)
      this.ev(`[agenda] «${texto}» falló (${r.texto}); reintento ${e.fallosSeguidos} en ${ms / 1000} s${aux ? `, antes ${aux.tipo}` : ''}`)
      if (e.fallosSeguidos === 1) this.decirAlDueno(`${r.texto} Lo vuelvo a intentar.`, e.quien)
      if (aux) { const x = this.agenda.entrada(aux, aux.tipo, 'agenda', { tipo: 'una' }); x.fallosSeguidos = agenda.REINTENTOS.una; this.agenda.interrumpir(x) }
      for (const t1 = Date.now(); Date.now() - t1 < ms && !this.tarea.cancelada; ) await esperar(250) // la espera la corta cualquier orden
      if (this.tarea.cancelada && this.tarea.motivo !== 'interrupcion' && !this.agenda.cola.includes(e) && !this.agenda.pila.includes(e)) this.soltar(e, { exito: false, texto: `Dejo «${texto}».` })
      return null
    }
    // hecha o definitiva: fuera
    const t = clase === 'definitiva' && e.fallosSeguidos ? `${r.texto} (lo dejo tras ${e.fallosSeguidos + 1} intentos)` : r.texto
    if (r.exito && ORDENES_TRABAJO.has(o.tipo)) this.pendiente = null
    if (t && !(guardia && o.reanuda)) { if (r.exito || String(e.quien).startsWith('chat de ')) this.decir(t); else this.decirAlDueno(t, e.quien) } // el fallo, solo al dueño; 2026-11-04: pedido por el chat, en el chat (por /msg parecía que no hacía nada)
    if (!(guardia && o.reanuda)) anotar(!!r.exito, t, this.despues)
    this.soltar(e, { ...r, texto: t })
    return e.quien === 'auto' || e.quien === 'agenda' ? null : e
  }

  // Antes de montar guardia: lo que falte de los armor stands y cofres de HOGAR y, luego, lo mejor que lleve. Idempotente.
  async equiparAntes(paso) {
    const bot = this.bot
    const [rs] = await paso('equipar_soportes', [baseZona()])
    if (rs.exito && (rs.piezas.length || rs.arma)) bot.chat(`Tomo de los soportes: ${[...rs.piezas, rs.arma].filter(Boolean).join(', ').replace(/_/g, ' ')}.`)
    const [re] = await paso('equipar', ['todo'])
    if (re.exito && re.causa === 'equipado') bot.chat(`Me equipo: ${[re.arma, ...(re.armadura || [])].filter(Boolean).join(', ').replace(/_/g, ' ')}.`)
    else if (!re.exito) bot.chat('Voy sin equipo: no tengo nada que ponerme.')
  }

  // 2026-11-02: el modo centinela no se apaga solo: tras cualquier orden (cumplida o interrumpida), tras morir, reconectar o reiniciar, vuelve a
  // montar guardia. Solo «desactiva centinela» lo quita. Cada 3 s: si hay centinela y no hay orden ni habilidad en marcha, lo retoma.
  fijarCentinela(zona, patrulla = false) { // patrulla (2026-11-02): centinela que se mueve libre por la zona en vez de quedarse en su puesto
    this.centinela = zona ? { zona, patrulla } : null
    guardarCentinela(this.nombre, this.centinela)
    if (zona && this.guardaespaldas) this.fijarGuardaespaldas(null) // un modo u otro
  }
  fijarOficio(c) { this.oficio = c; guardarOficio(this.nombre, c) }
  fijarGuardaespaldas(a) {
    this.guardaespaldas = a ? { a } : null
    guardarGuardaespaldas(this.nombre, this.guardaespaldas)
    if (a && this.centinela) this.fijarCentinela(null)
  }
  // 2026-11-02 (pedido del usuario): al ir a dormir con un modo de guardia activo, manda lo cerca que esté el enemigo. Lejos (fuera del cuadro con el
  // que el juego no deja dormir: 8 en horizontal y 5 en vertical de la cama), sigue hacia la cama. Cerca, la guardia primero: corta el sueño
  // (queda en la agenda, 'interrumpida'), pone una urgencia de guardia de una vez y, cuando acaba (3 s sin enemigos), vuelve a dormir.
  //  · centinela: el intruso de la zona a ≤ RANGO_CAMA del bot.
  //  · guardaespaldas: lo que cuenta es el protegido: un hostil a ≤ GUARDIA_MOBS de él o un jugador no aliado a ≤ GUARDIA_JUGADORES.
  vigilarSueno() {
    const bot = this.bot, actual = this.enVuelta
    if (!bot || !bot.entity || !(bot.health > 0) || !(this.centinela || this.guardaespaldas)) return
    if (!actual || actual.o.tipo !== 'duerme' || this.agenda.pila.length || Date.now() - (this.ultimaUrgenciaSueno || 0) < 5000) return
    let urgencia = null
    if (this.guardaespaldas) {
      const nombre = this.guardaespaldas.a, e = bot.players[nombre] && bot.players[nombre].entity
      if (e && (sv.amenazaCerca(bot, e, GUARDIA_MOBS) || sv.jugadoresCerca(bot, e, GUARDIA_JUGADORES, esAliado)[0])) urgencia = { tipo: 'guardaespaldas', a: nombre, una: true, reanuda: true }
    } else {
      const zona = zonas.leer().zonas.find(z => z.nombre.toLowerCase() === String(this.centinela.zona).toLowerCase())
      const yo = bot.entity.position
      const x = zona && sv.intrusos(bot, zona, esAliado, new Map(), { y: yo.y, dy: RANGO_CAMA.v })[0]
      if (x && Math.hypot(x.position.x - yo.x, x.position.z - yo.z) <= RANGO_CAMA.h) urgencia = { tipo: 'centinela', zona: zona.nombre, patrulla: this.centinela.patrulla, una: true, reanuda: true }
    }
    if (!urgencia) return
    this.ultimaUrgenciaSueno = Date.now()
    const e = this.agenda.entrada(urgencia, 'guardia antes de dormir', 'agenda', { tipo: 'una' })
    e.fallosSeguidos = agenda.REINTENTOS.una
    this.agenda.interrumpir(e)
    this.cortar('interrupcion')
    this.ev(`[sueño] enemigo cerca: primero la guardia (${urgencia.tipo}), luego a dormir`)
  }

  supervisarCentinela() {
    const bot = this.bot
    if (!(this.centinela || this.guardaespaldas || this.oficio) || this.reanudando || !this.agenda.vacia() || this.supervisando || this.enCurso || this.enHabilidad || this.enIr || this.modo === 'libre') return
    if (!bot || !bot.entity || !(bot.health > 0) || this.recuperando) return
    this.reanudando = true
    const o = this.guardaespaldas ? { tipo: 'guardaespaldas', a: this.guardaespaldas.a, reanuda: true } : this.centinela ? { tipo: 'centinela', zona: this.centinela.zona, patrulla: this.centinela.patrulla, reanuda: true }
      : { tipo: 'oficio', oficio: this.oficio.oficio, zona: this.oficio.zona, reanuda: true }
    this.ordenAccion(o, this.guardaespaldas ? 'modo guardaespaldas' : this.centinela ? 'modo centinela' : 'oficio ' + this.oficio.oficio, 'reanudar')
      .catch(e => this.ev('[centinela] no pude retomar: ' + e.message)).finally(() => { this.reanudando = false })
  }

  // 2026-11-02: come siempre que tenga hambre (≤ HAMBRE_COMER) y comida buena en el inventario, también en mitad de una orden o de la guardia
  // (salvo peleando o con un golpe de hace menos de 5 s). Conserva el destino del navegador, que comer detiene.
  async hambre() {
    const bot = this.bot
    if (this.comiendo || this.defendiendo || !bot || !bot.entity || !(bot.health > 0) || bot.food > HAMBRE_COMER || !sv.comidas(bot).length) return
    const g = sv.estado(bot).golpe
    if (g && Date.now() - g.t < 5000) return
    this.comiendo = true
    const meta = bot.pathfinder.goal
    try {
      const r = await habilidades.ejecutar(bot, 'comer', [], { cancelada: false })
      this.ev(`[hambre] comer → ${r.exito ? 'éxito' : 'fallo'}: ${r.causa}${r.comida ? ' (' + r.comida + ')' : ''}`)
    } finally {
      if (meta && !bot.pathfinder.goal) { try { bot.pathfinder.setGoal(meta, true) } catch (_) {} }
      this.comiendo = false
    }
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
    return (u && this.bot.players[u]) ? u : '' // 2026-11-01: conectado basta; si no se le ve, acercarseA va a buscarle
  }

  // 2026-11-01: llegar hasta un jugador fuera de la vista (el server manda su posición a ~48 bloques; sin RCON ni /tp no hay más): a las
  // coordenadas que diga («ven a x y z») o a donde le vi por última vez, por tramos (viajeLargo), hasta que aparece.
  // null: ya le veo; '' : cancelado; si no, el texto del fallo.
  async acercarseA(u, en, tarea, mov) {
    const bot = this.bot
    if (!u || bot.players[u]?.entity) return null
    const visto = require('./jugadores').ultimaVez(bot, u)
    const meta = en ? new (require('vec3').Vec3)(...en) : visto && visto.pos
    if (!meta) return 'No te veo y no sé dónde estás: dime tus coordenadas (F3), p. ej. «ven a 120 64 -30».'
    bot.chat(`Voy hacia ti (${Math.round(bot.entity.position.distanceTo(meta))} bloques${en ? '' : ', a donde te vi'}).`)
    const r = await viajeLargo(bot, meta, () => !!bot.players[u]?.entity, { tarea, mov: mov || prudentes(bot) })
    if (r === 'listo') return null
    if (r === 'cancelado') return ''
    return r === 'llegué' ? 'Llegué a donde estabas y no te veo: dime tus coordenadas (F3).' : `No llego hasta ti (${r}).`
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
      case 'portal': {
        // 2026-11-01: entrar al portal (del Nether o del End) más cercano a ≤ 64: se mete en un bloque del portal (el de abajo, con
        // obsidiana debajo, si es del Nether), se queda quieto dentro y espera a cambiar de dimensión (el del Nether tarda ~4 s)
        const dim0 = bot.game.dimension
        const bloques = bot.findBlocks({ matching: (b) => b.name === 'nether_portal' || b.name === 'end_portal', maxDistance: 64, count: 64 })
        if (!bloques.length) return { exito: false, texto: 'No veo ningún portal cerca (a 64 bloques).' }
        const abajo = (v) => { const k = bot.blockAt(v.offset(0, -1, 0)); return !!k && k.name !== 'nether_portal' }
        const p = bot.entity.position
        const meta = bloques.filter(abajo).sort((a, b) => a.distanceTo(p) - b.distanceTo(p))[0] || bloques[0]
        const dentro = () => { const k = bot.blockAt(bot.entity.position.floored()); return !!k && /portal$/.test(k.name) }
        const r = await moverHasta(bot, new goals.GoalBlock(meta.x, meta.y, meta.z), () => dentro() || bot.game.dimension !== dim0, { ms: 90000, tarea, mov: prudentes(bot, { pisarVedadas: true }) })
        if (r !== 'listo' && !dentro()) return { exito: false, texto: `No llego al portal (${r}).` }
        bot.pathfinder.setGoal(null); bot.clearControlStates()
        for (let t0 = Date.now(); Date.now() - t0 < 15000 && !tarea.cancelada; await esperar(250)) {
          if (bot.game.dimension !== dim0) {
            await esperar(2000) // a que cargue el otro lado
            // sale del portal de llegada (a ≥ 3 bloques y fuera de sus bloques): quieto dentro, el juego no le deja volver a cruzarlo
            const llegada = bot.entity.position.clone()
            const fuera = () => !dentro() && bot.entity.position.distanceTo(llegada) >= 3
            await moverHasta(bot, new goals.GoalInvert(new goals.GoalNear(llegada.x, llegada.y, llegada.z, 3)), fuera, { ms: 15000, tarea, mov: prudentes(bot, { pisarVedadas: true }) })
            bot.pathfinder.setGoal(null); bot.clearControlStates()
            const DIM = { the_nether: 'el Nether', overworld: 'el mundo normal', the_end: 'el End' }
            return { exito: true, texto: `Ya estoy en ${DIM[String(bot.game.dimension).replace('minecraft:', '')] || bot.game.dimension}.` }
          }
          if (!dentro()) { await moverHasta(bot, new goals.GoalBlock(meta.x, meta.y, meta.z), dentro, { ms: 5000, tarea, mov: prudentes(bot, { pisarVedadas: true }) }); bot.pathfinder.setGoal(null); bot.clearControlStates() }
        }
        return { exito: false, texto: tarea.cancelada ? 'Dejo el portal.' : 'Estoy en el portal pero no me lleva: ¿está encendido?' }
      }
      case 'ven': {
        const falta = await this.acercarseA(this.jugadorDe(quien), o.en, tarea, prudentes(bot, { pisarVedadas: true }))
        if (falta !== null) return { exito: false, texto: falta || 'Dejo de buscarte.' }
        const [r, d] = await paso('ir_a_jugador', [this.jugadorDe(quien), '60', 'vedadas', 'insistir']) // 2026-11-02: también dentro de las zonas vedadas; solo romper bloques está vedado // '' = el jugador humano más cercano
        const texto = r.causa === 'llegué' || r.causa === 'ya estaba' ? 'Aquí estoy.'
          : r.zona ? `Estás en ${r.zona}, que es zona protegida: te espero en el borde.` : `No llego: ${r.causa}.`
        return { exito: !!r.exito, texto, pasos: [d] }
      }
      case 'dame': {
        if (!o.objeto) return { exito: false, texto: `No sé qué es «${o.desconocido}»: dime qué material quieres, o «dame todo».`, pasos: [] }
        const [r, d] = await paso('dar', [this.jugadorDe(quien), o.objeto, o.n ? String(o.n) : ''])
        const lista = Object.entries(r.dado || {}).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ')
        return { exito: !!r.exito, texto: r.exito ? `Toma: ${lista}.` : `No puedo darte nada: ${r.causa}.`, pasos: [d] }
      }
      case 'sigueme': {
        // 2026-11-01: desde donde esté (acercarseA) y, si le pierde de vista, a donde le vio por última vez, hasta «para» o SIGUEME_MAX
        const u = this.jugadorDe(quien), t0 = Date.now()
        let r = 'cancelado', en = o.en
        while (!(tarea && tarea.cancelada)) {
          const queda = SIGUEME_MAX - (Date.now() - t0)
          if (queda <= 0) { r = 'tiempo agotado'; break }
          const falta = await this.acercarseA(u, en, tarea, prudentes(bot, { pisarVedadas: true }))
          if (falta !== null) return { exito: false, texto: falta || 'Dejo de seguirte.' }
          const e = u ? bot.players[u].entity : jugadorCercano(bot)
          if (!e) return { exito: false, texto: 'No te veo.' }
          // 2026-11-02: también dentro de las zonas vedadas (pisa; lo único vedado es romper bloques)
          const marcha = moverHasta(bot, new goals.GoalFollow(e, 2), () => false, { ms: queda, tarea, entidad: e, mov: prudentes(bot, { pisarVedadas: true }) })
          this.ocupado = marcha
          r = await marcha
          if (r !== 'perdido' || !u) break
          en = null
        }
        const textos = { 'tiempo agotado': 'Llevo diez minutos siguiéndote: paro aquí.', perdido: 'Te he perdido de vista.', 'sin camino': 'No encuentro camino para seguirte.' }
        return { exito: r === 'tiempo agotado', texto: textos[r] || 'Dejo de seguirte.' }
      }
      case 'aliado': {
        if (o.bots_de) { // los bots de un jugador, todos a la vez (o todos fuera)
          const bs = botsDe(o.bots_de).filter(x => x !== this.nombre && !AMOS.has(x))
          if (!bs.length) return { exito: false, texto: `No sé qué bots son de ${o.bots_de}: faltan en bots_de de personajes.json.`, pasos: [] }
          ALIADOS.poner(bs, o.valor)
          return { exito: true, texto: o.valor ? `Los bots de ${o.bots_de} son aliados: ${bs.join(', ')}.` : `Los bots de ${o.bots_de} ya no son aliados: ${bs.join(', ')}.`, pasos: [] }
        }
        if (o.lista) return { exito: true, texto: ALIADOS.lista().length ? `Aliados, además de ti: ${ALIADOS.lista().join(', ')}.` : 'No tengo más aliados que tú.', pasos: [] }
        const n = o.nombre.toLowerCase()
        if (AMOS.has(Object.keys(bot.players).find(x => x.toLowerCase() === n) || o.nombre)) return { exito: true, texto: `${o.nombre} ya es de los míos: es mi dueño.`, pasos: [] }
        ALIADOS.poner(n, o.valor)
        return { exito: true, texto: o.valor ? `${o.nombre} es aliado: puede entrar a la zona. Si me pega, me defiendo.` : `${o.nombre} ya no es aliado.`, pasos: [] }
      }
      case 'guardaespaldas_off': {
        const antes = this.guardaespaldas
        this.fijarGuardaespaldas(null)
        return { exito: true, texto: antes ? `Modo guardaespaldas desactivado (cuidaba a ${antes.a}).` : 'No estaba en modo guardaespaldas.', pasos: [] }
      }
      case 'guardaespaldas': {
        // 2026-11-02: no se separa del protegido (por defecto, quien da la orden; un dueño) y, con el esquema del centinela, ataca (acorralado, a
        // puñetazos si no lleva arma) a los hostiles que se le acerquen (≤ GUARDIA_MOBS), a los jugadores no aliados a rango de golpe
        // (≤ GUARDIA_JUGADORES) y a quien le pegue a él o al bot. Es un modo: sobrevive a las órdenes (vuelve solo), a morir y a reiniciar.
        const prot = o.protegido || o.a || this.jugadorDe(quien) || Object.keys(bot.players).find(n => AMOS.has(n)) || (this.guardaespaldas && this.guardaespaldas.a)
        const nombre = prot && (Object.keys(bot.players).find(n => n.toLowerCase() === String(prot).toLowerCase()) || prot)
        if (!nombre) return { exito: false, texto: 'No sé a quién proteger: dime «guardaespaldas de NOMBRE».', pasos: [] }
        this.fijarGuardaespaldas(nombre)
        const ignorar = new Map(), avisados = new Set(), mov = () => prudentes(bot, { pisarVedadas: true })
        let golpeador = null
        const alGolpe = (victima, fuente) => {
          const e = bot.players[nombre] && bot.players[nombre].entity
          if (sv.esAgresor(bot, victima, fuente, e, esDueno)) golpeador = { id: fuente.id, t: Date.now() }
        }
        bot.on('entityHurt', alGolpe)
        this.escoltando = true // los golpes los atiende este modo, no alGolpear (que cancelaría la orden)
        let libreDesde = null
        try {
          if (!o.una) await this.equiparAntes(paso)
          if (tarea && tarea.cancelada) return { exito: false, texto: '', pasos: [] }
          const protegido = () => bot.players[nombre] && bot.players[nombre].entity
          const objetivo = () => {
            const e = protegido()
            const g = golpeador && bot.entities[golpeador.id]
            if (g && g.isValid !== false && Date.now() - golpeador.t < AGRESOR_ESCOLTA_MS) return g
            if (!e) return null
            return sv.amenazaCerca(bot, e, GUARDIA_MOBS, ignorar) || sv.jugadoresCerca(bot, e, GUARDIA_JUGADORES, esAliado, ignorar)[0] || null
          }
          while (!(tarea && tarea.cancelada)) {
            try {
              if (!bot.entity || !(bot.health > 0) || this.recuperando) { await esperar(500); continue }
              const e = protegido()
              const x = objetivo()
              // una vez (urgencia sobre dormir): sin amenazas durante 3 s y junto al protegido, vuelve a lo que estaba (la cama)
              if (o.una && !x) { if (!e || bot.entity.position.distanceTo(e.position) <= 8) { libreDesde = libreDesde || Date.now(); if (Date.now() - libreDesde > 3000) break; await esperar(500); continue } } else libreDesde = null
              if (x) {
                if (!avisados.has(x.id)) { avisados.add(x.id); bot.chat(`¡Atrás! ${x.type === 'player' ? x.username : x.name.replace(/_/g, ' ')}.`) }
                const p = await this.ejecutarHabilidad('atacar', ['id:' + x.id, '20', 'acorralado', 'puno', 'vedadas'], tarea)
                if (!p || !p.exito) ignorar.set(x.id, Date.now() + 8000)
                golpeador = null
                continue
              }
              if (!e) { await esperar(1000); continue } // no lo veo (lejos o desconectado): espero a que vuelva
              // en formación (triángulo con 3) alrededor del protegido; si no se llega a mi vértice (dentro de un bloque), detrás de él a 2
              const { k, n } = puestoEnFormacion(this.nombre, nombre)
              const meta = n > 1 ? new GoalFormacion(e, k, n) : new goals.GoalFollow(e, 2)
              let r = await moverHasta(bot, meta, () => !!objetivo() || (o.una && bot.entity.position.distanceTo(e.position) <= 8), { ms: 60000, tarea, entidad: e, mov: mov() })
              if (r === 'sin camino' && n > 1) r = await moverHasta(bot, new goals.GoalFollow(e, 2), () => !!objetivo(), { ms: 10000, tarea, entidad: e, mov: mov() })
              if (r === 'sin camino' || r === 'perdido') await esperar(1500)
            } catch (err) { this.ev('[guardaespaldas] error (sigo): ' + err.message); await esperar(1000) }
          }
        } finally { bot.removeListener('entityHurt', alGolpe); this.escoltando = false }
        return { exito: true, texto: '', pasos: [] }
      }
      case 'oficio_off': {
        const antes = this.oficio
        this.fijarOficio(null)
        return { exito: true, texto: antes ? `Dejo el oficio (${antes.oficio}).` : 'No tenía oficio.', pasos: [] }
      }
      case 'oficio': {
        // 2026-11-02: tarea repetitiva hasta «deja el oficio». Cosechar: va a la zona (HOGAR por defecto), cosecha y replanta lo maduro, lo guarda
        // en el cofre del marco con comida y, sin nada maduro, espera ESPERA_COSECHA y vuelve a mirar. Sobrevive a órdenes, muertes y reinicios.
        if (o.oficio !== 'cosechar' && o.oficio !== 'herrero') return { exito: false, texto: `No sé el oficio ${o.oficio}.`, pasos: [] }
        const nombreZona = o.zona || baseZona()
        if (!zonas.leer().zonas.some(z => z.nombre.toLowerCase() === String(nombreZona).toLowerCase())) { if (o.reanuda) this.fijarOficio(null); return { exito: false, texto: `No hay ninguna zona ${nombreZona}: márcala con !zona.`, pasos: [] } }
        this.fijarOficio({ oficio: o.oficio, zona: o.zona || '' })
        if (o.oficio === 'herrero') {
          // 2026-11-02: herrero. Cada 5 s mira (sin moverse) si a algún soporte le falta una pieza; cada REVISION_HERRERO revisa también las herramientas
          // de los cofres de los soportes. Si faltan materiales, espera ESPERA_HERRERO antes de insistir (no recorre los cofres en balde).
          const personajes = Number(process.env.IO_HERRERO_BOTS) || new Set([...PROPIOS, ...VIVOS.keys()]).size || 1
          if (!o.reanuda) bot.chat(`Soy el herrero de ${nombreZona}: armadura en los soportes y espada, pico y hacha para ${personajes} personajes.`)
          let ultimoTodo = 0, noAntesDe = 0, ultimoAviso = 0
          while (!(tarea && tarea.cancelada)) {
            try {
              if (!bot.entity || !(bot.health > 0) || this.recuperando || Date.now() < noAntesDe) { await esperar(1000); continue }
              const modo = Date.now() - ultimoTodo > REVISION_HERRERO ? 'todo' : 'armadura'
              if (modo === 'armadura') { // lo barato: los soportes que se ven desde donde está (si está lejos del hogar, primero hasta allí)
                const lejos = !zonas.hogarDe(Math.floor(bot.entity.position.x), Math.floor(bot.entity.position.y), Math.floor(bot.entity.position.z))
                if (lejos) await require('./habilidades/hogar')(bot, tarea).catch(() => {})
              } else await require('./habilidades/hogar')(bot, tarea).catch(() => {})
              const [r] = await paso('herrero', [nombreZona, modo, String(personajes)])
              if (modo === 'todo' && r.causa !== 'sin soportes' && r.causa !== 'sin cofres') ultimoTodo = Date.now()
              if (r.causa === 'sin zona') return { exito: false, texto: `No hay ninguna zona ${nombreZona}.`, pasos: [] }
              const hecho = [...(r.puestas || []), ...Object.keys(r.guardadas || {})].length
              if (r.exito || (r.faltan && r.faltan.length)) this.ev(`[herrero] ${r.causa}: puestas ${(r.puestas || []).join(',') || '-'}, fabricadas ${JSON.stringify(r.fabricadas)}, guardadas ${JSON.stringify(r.guardadas)}${r.faltan && r.faltan.length ? '; faltan: ' + r.faltan.join(' | ') : ''}`)
              if (r.faltan && r.faltan.length) {
                noAntesDe = Date.now() + ESPERA_HERRERO
                if (Date.now() - ultimoAviso > ESPERA_HERRERO) { bot.chat(`Me falta material: ${[...new Set(r.faltan)].slice(0, 2).join('; ')}.`); ultimoAviso = Date.now() }
              } else if (hecho) bot.chat(`Listo: ${[...(r.puestas || []).map(x => 'puse ' + x.replace(/_/g, ' ')), ...Object.entries(r.guardadas || {}).map(([k, n]) => `guardé ${n} ${k.replace(/_/g, ' ')}`)].join(', ')}.`)
            } catch (e) { this.ev('[oficio] error (sigo): ' + e.message); await esperar(2000) }
            for (const t1 = Date.now(); Date.now() - t1 < 5000 && !(tarea && tarea.cancelada); ) await esperar(500)
          }
          return { exito: true, texto: 'Dejo el trabajo un momento.', pasos: [] }
        }
        if (!o.reanuda) bot.chat(`Cosecho y replanto en ${nombreZona}; lo guardo en el cofre con comida en el marco.`)
        let ultimoAviso = 0
        while (!(tarea && tarea.cancelada)) {
          try {
            if (!bot.entity || !(bot.health > 0) || this.recuperando) { await esperar(1000); continue }
            await require('./habilidades/hogar')(bot, tarea).catch(() => {}) // el campo del hogar: si está lejos, hasta allí
            const [r] = await paso('cosechar', [nombreZona])
            if (r.exito) {
              const n = Object.entries(r.guardado || {}).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(', ')
              this.ev(`[oficio] cosechados ${r.cosechados}, replantados ${r.replantados}${r.reparados ? `, reparados ${r.reparados}` : ''}${r.sinSemilla ? `, sin semilla ${r.sinSemilla}` : ''}; guardado: ${n || 'nada'} (${r.causa})`)
              if (Date.now() - ultimoAviso > 120000) { bot.chat(`Cosechados ${r.cosechados}${r.reparados ? `, reparo ${r.reparados} parcelas` : ''}${n ? `, guardo ${n}` : ''}${r.causa !== 'guardado' ? ` (${r.causa})` : ''}.`); ultimoAviso = Date.now() }
              await esperar(5000)
            } else {
              if (r.causa === 'sin zona') return { exito: false, texto: `No hay ninguna zona ${nombreZona}.`, pasos: [] }
              // nada maduro: a que crezca, mirando el campo cada 3 s (polvo de hueso o lo que sea: se pone a cosechar al momento) y, cada ESPERA_COSECHA,
              // repasando el campo por si hay parcelas que reparar; un fallo (amenaza, sin camino…): poco
              const espera = /^sin cultivos maduros/.test(r.causa) ? ESPERA_COSECHA : 8000
              const cosechar = require('./habilidades/cosechar')
              for (const t1 = Date.now(); Date.now() - t1 < espera && !(tarea && tarea.cancelada); ) {
                await esperar(3000)
                if (bot.entity && cosechar.hayMaduros(bot, nombreZona)) break
              }
            }
          } catch (e) { this.ev('[oficio] error (sigo): ' + e.message); await esperar(2000) }
        }
        return { exito: true, texto: 'Dejo el trabajo un momento.', pasos: [] }
      }
      case 'centinela_off': {
        const antes = this.centinela
        this.fijarCentinela(null)
        return { exito: true, texto: antes ? `Modo centinela desactivado (era en ${antes.zona}).` : 'No estaba en modo centinela.', pasos: [] }
      }
      case 'centinela': {
        // 2026-11-02: monta guardia en una zona (HOGAR): ataca (acorralado, a puñetazos si no lleva arma) a cualquier monstruo hostil o jugador
        // que no sea aliado (dueños de IO_AMOS y otros personajes) que entre, y a quien le pegue; vuelve a su puesto. Hasta otra orden.
        const nombreZona = o.zona || baseZona() // sin zona: el hogar del dueño
        const zona = zonas.leer().zonas.find(z => z.nombre.toLowerCase() === String(nombreZona).toLowerCase())
        if (!zona) { if (o.reanuda) this.fijarCentinela(null); return { exito: false, texto: `No hay ninguna zona ${nombreZona}: márcala con !zona.`, pasos: [] } }
        this.fijarCentinela(zona.nombre, !!o.patrulla) // desde ahora, hasta «desactiva centinela», vuelve a la guardia tras cada orden
        const aliado = esAliado // quién puede entrar sin ser echado; quien pega, aunque sea aliado, se defiende (esDueno)
        const ignorar = new Map(), avisados = new Set(), mov = () => prudentes(bot, { pisarVedadas: true })
        const cx = (zona.x1 + zona.x2) / 2, cz = (zona.z1 + zona.z2) / 2
        let golpeador = null
        const alGolpe = (victima, fuente) => { if (sv.esAgresor(bot, victima, fuente, null, esDueno)) golpeador = { id: fuente.id, t: Date.now() } }
        // 2026-11-02: los golpes los atiende esta guardia (no alGolpear, que cancelaría la orden) desde el primer momento, también mientras
        // se equipa y va a la zona; un golpe interrumpe esos preparativos y pasa a la guardia
        bot.on('entityHurt', alGolpe)
        this.escoltando = true
        let puesto = null, libreDesde = null
        try {
          if (!o.una) await this.equiparAntes(paso) // antes de montar guardia se equipa, como con «equípate» (la urgencia sobre dormir no: ya va equipado)
          if (tarea && tarea.cancelada) return { exito: false, texto: 'Dejo la guardia.', pasos: [] }
          const p0 = bot.entity.position
          const fuera = Math.floor(p0.x) < Math.min(zona.x1, zona.x2) || Math.floor(p0.x) > Math.max(zona.x1, zona.x2) || Math.floor(p0.z) < Math.min(zona.z1, zona.z2) || Math.floor(p0.z) > Math.max(zona.z1, zona.z2)
          if (fuera && !o.una) { // a la zona, a su centro
            const r = await moverHasta(bot, new goals.GoalNearXZ(cx, cz, 4), () => !!golpeador, { ms: 180000, tarea, mov: mov() })
            if (r === 'cancelado') return { exito: false, texto: 'Dejo la guardia.', pasos: [] }
          }
          puesto = bot.entity.position.clone()
          if (!o.reanuda) bot.chat(o.patrulla ? `Patrullo ${zona.nombre}: ataco a quien entre sin ser de los míos.` : `Centinela en ${zona.nombre}: ataco a quien entre sin ser de los míos.`)
          while (!(tarea && tarea.cancelada)) {
            try {
              // muerto, o yendo a por sus cosas: la guardia espera; luego vuelve a su puesto
              if (!bot.entity || !(bot.health > 0) || this.recuperando) { await esperar(500); continue }
              const g = golpeador && bot.entities[golpeador.id]
              const intruso = () => sv.intrusos(bot, zona, aliado, ignorar, { y: puesto.y, dy: CENTINELA_DY })[0]
              const x = (g && g.isValid !== false && Date.now() - golpeador.t < AGRESOR_ESCOLTA_MS ? g : null) || intruso()
              if (!x) {
                // una vez (urgencia sobre dormir): sin intrusos durante 3 s, vuelve a lo que estaba (la cama)
                if (o.una) { libreDesde = libreDesde || Date.now(); if (Date.now() - libreDesde > 3000) break; await esperar(500); continue }
                if (o.patrulla) { // patrulla: sin puesto fijo; un punto al azar de la zona, una pausa y otro (un intruso o un golpe corta el paseo)
                  const x1 = Math.min(zona.x1, zona.x2) + 1, x2 = Math.max(zona.x1, zona.x2) - 1, z1 = Math.min(zona.z1, zona.z2) + 1, z2 = Math.max(zona.z1, zona.z2) - 1
                  const px = x1 <= x2 ? x1 + Math.random() * (x2 - x1) : cx, pz = z1 <= z2 ? z1 + Math.random() * (z2 - z1) : cz
                  await moverHasta(bot, new goals.GoalNearXZ(px, pz, 1), () => !!golpeador || !!intruso(), { ms: 20000, tarea, mov: mov() })
                  puesto = bot.entity.position.clone() // la altura de la vigilancia sigue al paseo (escaleras, desniveles)
                  await esperar(2000 + Math.random() * 4000)
                  continue
                }
                if (bot.entity.position.distanceTo(puesto) > 6) { // desplazado (reaparecer, una pelea…): de vuelta al puesto
                  const r = await moverHasta(bot, new goals.GoalNear(puesto.x, puesto.y, puesto.z, 2), () => !!golpeador || !!intruso(), { ms: 60000, tarea, mov: mov() })
                  if (r !== 'listo') await esperar(1500)
                } else await esperar(500)
                continue
              }
              libreDesde = null
              if (!avisados.has(x.id)) { avisados.add(x.id); bot.chat(`¡Alto! ${x.type === 'player' ? x.username : x.name.replace(/_/g, ' ')} en ${zona.nombre}.`) }
              if (x.position.distanceTo(bot.entity.position) > 12) // lejos: acercarse antes (atacar solo ve a ≤ 16)
                await moverHasta(bot, new goals.GoalNear(x.position.x, x.position.y, x.position.z, 4), () => x.isValid === false || x.position.distanceTo(bot.entity.position) <= 10,
                  { ms: 30000, tarea, entidad: x, mov: mov() })
              const p = await this.ejecutarHabilidad('atacar', ['id:' + x.id, '20', 'acorralado', 'puno', 'vedadas'], tarea)
              if (!p || !p.exito) ignorar.set(x.id, Date.now() + 8000) // sin camino, huyó…: no insistir al momento
              golpeador = null
            } catch (e) { this.ev('[centinela] error (sigo de guardia): ' + e.message); await esperar(1000) }
          }
        } finally { bot.removeListener('entityHurt', alGolpe); this.escoltando = false }
        return { exito: true, texto: 'Dejo la guardia.', pasos: [] }
      }
      case 'escolta': {
        // 2026-11-01: le sigue (también dentro de las zonas vedadas: pisa, no rompe ni pone) y, si alguien le pega a él o al bot (sv.esAgresor), corta, pelea (atacar id:N, con
        // sus negativas: creeper, salud baja, demasiados) y vuelve a seguirle. Pasivo (por defecto): el mob que no pega no cuenta.
        // Agresivo («defiéndeme agresivo»): además, a por el hostil más cercano a ≤ 10 del protegido (sv.amenazaCerca).
        const nombre = o.a ? Object.keys(bot.players).find(n => n.toLowerCase() === o.a) : this.jugadorDe(quien)
        const vedadas = prudentes(bot, { pisarVedadas: true })
        if (nombre) { const falta = await this.acercarseA(nombre, o.en, tarea, vedadas); if (falta !== null) return { exito: false, texto: falta || 'Dejo de cubrirte.' } }
        let e = nombre ? bot.players[nombre]?.entity : o.a ? null : jugadorCercano(bot)
        if (!e) return { exito: false, texto: o.a ? `No veo a ${o.a}.` : 'No te veo.' }
        const agresivo = o.modo === 'agresivo' // también a por los hostiles a ≤ 10 del protegido, aunque no peguen
        const aliado = (n) => n === (e && e.username) || esDueno(n) // los dueños y mis bots no cuentan como agresores
        let agresor = null, negado = false
        const ignorar = new Map() // id → hasta cuándo no reintentar (atacar se negó: creeper, demasiados…), para no girar en vacío
        const alGolpe = (victima, fuente) => {
          if (!sv.esAgresor(bot, victima, fuente, e, aliado)) return
          agresor = { id: fuente.id, t: Date.now() }
          taxonomia.anotarAgresor(bot, fuente) // un neutral que pega cuenta como amenaza un rato (lo mira atacar)
        }
        const golpeador = () => {
          const x = agresor && bot.entities[agresor.id]
          return !!x && x.isValid !== false && Date.now() - agresor.t < AGRESOR_ESCOLTA_MS && x.position.distanceTo(bot.entity.position) <= 16 ? x : null
        }
        const objetivo = () => {
          for (const [id, hasta] of ignorar) if (Date.now() > hasta) ignorar.delete(id)
          if (vivo() && !ignorar.has(agresor.id)) return agresor.id
          const x = agresivo ? sv.amenazaCerca(bot, e, 10, new Set(ignorar.keys())) : null
          return x ? x.id : null
        }
        bot.on('entityHurt', alGolpe)
        this.escoltando = true
        const t0 = Date.now()
        let r = 'cancelado'
        try {
          while (!(tarea && tarea.cancelada)) {
            const queda = SIGUEME_MAX - (Date.now() - t0)
            if (queda <= 0) { r = 'tiempo agotado'; break }
            // entra tras él en las zonas vedadas (GoalFollow, no GoalSeguirFuera): pisa, pero no rompe ni pone
            if (sv.debeComerPorSalud(bot)) { await this.ejecutarHabilidad('comer', ['20'], tarea); continue } // poca vida: come y sigue
            const marcha = moverHasta(bot, new goals.GoalFollow(e, 2), () => objetivo() !== null || sv.debeComerPorSalud(bot), { ms: queda, tarea, entidad: e, mov: prudentes(bot, { pisarVedadas: true }) })
            this.ocupado = marcha
            r = await marcha
            if (r === 'perdido' && nombre) { // se fue de la vista: a donde le vi por última vez, y sigo
              const falta = await this.acercarseA(nombre, null, tarea, vedadas)
              if (falta !== null || !bot.players[nombre]?.entity) break
              e = bot.players[nombre].entity
              continue
            }
            if (r !== 'listo') break
            const id = objetivo()
            if (id === null) continue // (o le toca comer: lo hace al empezar la vuelta)
            const p = await this.ejecutarHabilidad('atacar', ['id:' + id, '20', 'vedadas'], tarea)
            if (p && !p.exito) ignorar.set(id, Date.now() + 5000)
            if (p && !p.exito && !negado && /creeper|salud|demasiados|sin arma/.test(p.causa || '')) { negado = true; this.decirAlDueno(`No peleo: ${p.causa}.`, quien) }
            if (agresor && agresor.id === id) agresor = null
          }
        } finally { bot.removeListener('entityHurt', alGolpe); this.escoltando = false }
        const textos = { 'tiempo agotado': 'Llevo diez minutos cubriéndote: paro aquí.', perdido: 'Te he perdido de vista.', 'sin camino': 'No encuentro camino para seguirte.' }
        return { exito: r === 'tiempo agotado', texto: textos[r] || 'Dejo de cubrirte.' }
      }
      case 'recupera': {
        // 2026-11-01 (A4 reducido): volver donde murió (los últimos sitios, si murió recuperando) y recoger lo suyo. No con lava, fuego o
        // vacío, ni pasados 290 s (los objetos desaparecen a los 300) salvo a ≥ 128 bloques (chunk sin cargar: no envejecen).
        // 2026-11-01 (pedido del usuario): es prioridad y no se detiene por peligro: con poca vida come (si lleva) y sigue; al acabar, si
        // hay peligro (≥ 3 hostiles a ≤ 12 o vida < 10), vuelve a casa (el campamento; sin él, se refugia)
        const sitios = (this.sitiosMuerte || []).slice()
        if (!sitios.length) return { exito: false, texto: 'No he muerto desde que entré.' }
        if (sitios[0].segunda) return { exito: false, texto: `He muerto 3 veces seguidas recuperando mis cosas: lo dejo.` }
        const peligro = () => sv.aLaVista(bot).filter(x => x.position.distanceTo(bot.entity.position) <= 12).length >= 3 || bot.health < 10
        const contar = () => bot.inventory.items().reduce((a, i) => a + i.count, 0)
        const antes = contar(), total = sitios.reduce((a, x) => a + x.objetos, 0), fallos = [], sinLlegar = [], recogidos = []
        this.recuperando = true
        try {
          for (const m of sitios) {
            if (tarea.cancelada) break
            const edad = (Date.now() - m.t) / 1000, d = bot.entity.position.distanceTo(m.pos), donde = m.pos.floored().toArray().join(' ')
            if (m.causa && /lava|burn|fire|flames|void|out of the world|fell out/i.test(m.causa)) { fallos.push(`en ${donde} (${m.causa}) no queda nada`); continue }
            // 2026-11-04, humo del banco M: sin camino, buceaba hacia el sitio y salía a respirar, 30 veces, hasta que caducaban los objetos
            if ((this.ahogosRecuperando || 0) >= AHOGOS_RECUPERANDO) { fallos.push(`lo de ${donde} queda bajo el agua: lo dejo`); continue }
            // los objetos solo envejecen con el chunk cargado: muerto lejos de donde está (≥ 128), puede que sigan ahí aunque pase el tiempo
            if (edad > 290 && d < 128) { fallos.push(`lo de ${donde} ya habrá desaparecido`); continue }
            // 2026-11-04, banco M: M3 reapareció a 6000 bloques y gastó la medida andando (murió por el camino sin llegar)
            if (d > LEJOS_RECUPERANDO) { fallos.push(`lo de ${donde} queda a ${Math.round(d)} bloques: lo dejo`); continue }
            this.decir(`Voy a por mis cosas a ${donde}${m.causa ? ` (${m.causa})` : ''}, a ${Math.round(d)} bloques.`)
            let r
            for (let k = 0; k < 6 && !tarea.cancelada; k++) { // sin tope de distancia, por tramos; con poca vida come y sigue
              // 2026-11-04, humo del banco M: murió al fondo de un pozo de 8 que había cavado, y la caída por defecto llega a 4
              const mov = prudentes(bot)
              mov.maxDropDown = Math.min(12, Math.max(mov.maxDropDown, Math.floor(bot.health) - 8))
              r = await viajeLargo(bot, m.pos, () => sv.debeComerPorSalud(bot), { tarea, mov, cerca: 2 })
              if (r !== 'listo') break
              await this.ejecutarHabilidad('comer', ['20'], tarea)
            }
            // 2026-11-04: los pozos de más de 12 y las cámaras selladas no tienen camino a pie: si lleva pico, cavando
            if (/sin camino/.test(String(r)) && !tarea.cancelada && bot.inventory.items().some(i => i.name.endsWith('_pickaxe'))) {
              const mov = prudentes(bot)
              mov.canDig = true
              r = await viajeLargo(bot, m.pos, () => false, { tarea, mov, cerca: 2 })
            }
            if (r !== 'llegué') { fallos.push(`no llego a ${donde} (${r})`); sinLlegar.push(m); continue }
            for (let k = 0; k < 5 && !tarea.cancelada; k++) {
              if (sv.debeComerPorSalud(bot)) await this.ejecutarHabilidad('comer', ['20'], tarea)
              const q = await this.ejecutarHabilidad('recoger', ['12', '-', 'max:40', 'otra_vez'], tarea)
              if (!q.exito || !q.quedan) break
            }
            if (!tarea.cancelada) recogidos.push(m)
          }
        } finally { this.recuperando = false }
        // los de una muerte nueva, para la próxima vuelta; 2026-11-03, banco M: y aquellos a los que no llegó (el reintento decía «No he muerto»)
        // 2026-11-04: y si un golpe lo cortó, los que no terminó, para cuando se retome
        this.sitiosMuerte = (this.sitiosMuerte || []).filter(x => !sitios.includes(x) || sinLlegar.includes(x) || (tarea.cancelada && !recogidos.includes(x)))
        // 2026-11-04, banco M: tras una pausa solo contaba el último viaje («Recuperé 9/248» con casi todo recogido)
        const n = (this.recuperados || 0) + contar() - antes
        this.recuperados = tarea.cancelada ? n : 0
        const texto = (n > 0 ? `Recuperé ${Math.min(n, total)}/${total}.` : 'No encontré mis cosas.') + (fallos.length ? ` (${fallos.join('; ')})` : '')
        if (!tarea.cancelada && peligro()) {
          this.decir(texto + ' Hay peligro: vuelvo a casa.')
          const v = await this.ejecutarHabilidad('explorar', ['volver', '120', '150'], tarea)
          if (!v.exito && !tarea.cancelada) await this.ejecutarHabilidad('refugiarse', ['auto'], tarea)
          return { exito: n > 0, texto: v.exito ? 'Ya estoy en casa.' : 'No llego a casa: me refugio aquí.' }
        }
        return { exito: n > 0, texto }
      }
      case 'tala': return this.talarN(o, tarea, paso)
      case 'recoge': {
        // F7.7: fuera del mundo del usuario, la orden vuelve a intentar también lo que recoger dio por inalcanzable hace poco
        // 2026-11-01: «recoge» = todo lo caído a ≤ 16, hasta 32 objetos, reintentando lo que dio por inalcanzable; «recoge los troncos», solo madera
        const [r, d] = await paso('recoger', (o.troncos ? '16 _log' : '16 -') + ' max:32 otra_vez')
        const resto = r.quedan ? ` Quedan ${r.quedan} que no alcanzo.` : ''
        const texto = r.exito ? `Recogí ${r.objetos} ${o.troncos ? 'tronco' : 'cosa'}${r.objetos === 1 ? '' : 's'}.${resto}` : r.causa === 'nada que recoger' ? 'No hay nada que recoger cerca.' : `No pude recoger: ${r.causa}.${resto}`
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
      case 'consigue': { // 2026-11-02: el recolector avanzado (conseguir.js): pico, antorchas, bajar, túneles, volver y entregar
        const quien2 = this.jugadorDe(quien)
        // 2026-11-04, prueba a mano: al retomar tras un golpe, «de dónde salí» era ya bajo tierra y no volvía a subir
        if (o.y0 == null) { const pi = bot.entity.position; o.y0 = Math.floor(pi.y); o.desde = [pi.x, pi.y, pi.z] }
        const volver = () => viajeLargo(bot, new (require('vec3').Vec3)(...o.desde), () => false, { tarea, mov: prudentes(bot), cerca: 8 })
        const r = await this.conseguirCon(o.material, o.n, { paso, tarea, quien: quien2, y0: o.y0, volver, decir: (t) => this.decir(t),
          orden: (tipo, n) => this.hacer({ tipo, ...(n ? { n } : {}) }, tarea, quien) })
        const NOMBRE = { lapis: 'lapislázuli', carbon: 'carbón' }, nombre = NOMBRE[o.material] || o.material
        const lugar = r.entrega === 'dado' ? ' Te lo he dado.' : r.entrega === 'cofre' ? ' Está en el cofre.' : r.conseguidos ? ' Lo llevo yo.' : ''
        const crudo = r.sinFundir ? ` sin fundir (${r.sinFundir})` : ''
        const texto = r.exito ? `Conseguido: ${r.conseguidos} de ${nombre}${crudo}.${lugar}`
          : r.conseguidos ? `Conseguí ${r.conseguidos}/${o.n} de ${nombre} (${r.causa}).${lugar}` : `No conseguí ${nombre}: ${r.causa}.`
        return { exito: r.exito, conseguidos: r.conseguidos, texto, pasos: r.pasos }
      }
      case 'materiales': {
        // 2026-11-02: la lista de materiales de una construcción grande (bot/materiales/*.json) contra el inventario y los cofres de HOGAR
        const mat = require('./materiales'), plan = mat.cargar(o.plano)
        if (!plan) return { exito: false, texto: `No tengo la lista de materiales de ${o.plano}.`, pasos: [] }
        const [r, d] = await paso('revisar_cofres', [o.zona])
        if (r.causa === 'sin zona') return { exito: false, texto: `No hay ninguna zona ${o.zona}: márcala con !zona.`, pasos: [d] }
        const stock = { ...(r.items || {}) }
        for (const it of bot.inventory.items()) stock[it.name] = (stock[it.name] || 0) + it.count
        const falta = mat.faltan(plan, stock)
        const donde = r.cofres ? `${r.cofres} cofre${r.cofres === 1 ? '' : 's'} de ${r.zona}${r.noAbiertos ? ` (${r.noAbiertos} sin abrir)` : ''}${r.lejosEnY ? ` (dejo ${r.lejosEnY} a más de 10 bloques de altura)` : ''} y mi inventario` : `mi inventario (${r.causa === 'sin cofres' ? `no hay cofres en ${r.zona}` : `no abrí ningún cofre de ${r.zona}`})`
        if (!falta.length) return { exito: true, texto: `Con ${donde} tengo todo para ${plan.nombre}.`, pasos: [d] }
        bot.chat(`Para ${plan.nombre} me falta, mirando ${donde}:`)
        for (const f of mat.frases(falta)) bot.chat(f)
        return { exito: true, texto: `Faltan ${falta.length} materiales de ${Object.keys(plan.materiales).length}.`, pasos: [d] }
      }
      case 'construye': {
        if (o.estructura) return this.construirCatalogo(o, tarea, paso) // 2026-11-02: del catálogo (bot/estructuras/), con abasto
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
            const r = await viajeLargo(bot, meta, () => !!bot.players[jugador]?.entity, { tarea, mov: prudentes(bot) })
            if (r !== 'listo') return { exito: false, texto: r === 'cancelado' ? 'Dejo de buscarle.' : `No encuentro a ${jugador} (${r === 'llegué' ? 'no está allí' : r}).` }
          }
          // 2026-11-01: atacar solo coge objetivos a ≤ 16 y se le ve a ~48: antes de pelear se acerca (GoalFollow, hasta 12); si se va de la
          // vista, vuelve a buscarle donde le vio; y si huye (> 16) durante la pelea, le persigue otra vez (hasta 5 rondas o «para»)
          let r = { causa: 'sin hostil' }, d = null
          for (let ronda = 0; ronda < 5 && !(tarea && tarea.cancelada); ronda++) {
            if (!bot.players[jugador]?.entity) {
              const visto = require('./jugadores').ultimaVez(bot, jugador)
              if (!visto) break
              const v = await viajeLargo(bot, visto.pos, () => !!bot.players[jugador]?.entity, { tarea, mov: prudentes(bot, { pisarVedadas: true }) })
              if (v !== 'listo') { r = { causa: v === 'llegué' ? 'no está allí' : v }; break }
            }
            const e = bot.players[jugador].entity
            const c = await moverHasta(bot, new goals.GoalFollow(e, 2), () => e.position.distanceTo(bot.entity.position) <= 12, { ms: 120000, tarea, entidad: e, mov: prudentes(bot, { pisarVedadas: true }) })
            if (c === 'perdido') continue
            if (c !== 'listo') { r = { causa: c }; break }
            ;[r, d] = await paso('atacar', ['id:' + e.id, '30'])
            if (r.causa !== 'huyó' && r.causa !== 'sin hostil') break
          }
          const textos = { muerto: `Derribé a ${jugador} (${r.golpes} golpes).`, 'huyó': `${jugador} se me escapa.`, 'sin hostil': `No alcanzo a ${jugador}.`, cancelado: 'Dejo de perseguirle.',
            'salud baja': 'Estoy muy herido: no peleo.', demasiados: 'Hay demasiados monstruos: no peleo.', 'sin arma': 'No llevo arma: no peleo.' }
          return { exito: !!r.exito, texto: textos[r.causa] || `No pude: ${r.causa}.`, pasos: d ? [d] : [] }
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
      case 'armate': { // 2026-11-02 (pedido del usuario): espada, pico y hacha de piedra, consiguiendo lo que falte, y equiparse
        const pasos = [], inv = () => bot.inventory.items(), cuenta = (re) => inv().filter(i => re.test(i.name)).reduce((a, i) => a + i.count, 0)
        const PIEDRA = /^(cobblestone|cobbled_deepslate|blackstone)$/
        const faltan = [['espada_piedra', 'stone_sword', 2], ['pico_piedra', 'stone_pickaxe', 3], ['hacha_piedra', 'stone_axe', 3]]
          .filter(([, item]) => !inv().some(i => i.name === item))
        const equiparse = async () => { const [, d] = await paso('equipar', ['todo']); pasos.push(d) }
        if (!faltan.length) { await equiparse(); return { exito: true, texto: 'Ya llevo espada, pico y hacha de piedra: equipado.', pasos } }
        const talar = async (n) => { const r = await this.talarN({ tipo: 'tala', n }, tarea, paso); pasos.push(...(r.pasos || [])) }
        // piedra: la que pidan las que faltan; para picarla, un pico (de madera si no hay ninguno)
        const q = () => faltan.reduce((a, [, , n]) => a + n, 0) - cuenta(PIEDRA)
        const sinPico = () => !inv().some(i => i.name.endsWith('_pickaxe'))
        const madera = 3 + (q() > 0 && sinPico() ? 2 : 0) // palos y mesa (+ el pico de madera y otra mesa abajo o lejos)
        // lo que cuenta es la madera que lleva de verdad: a veces no llega a recoger lo talado (2026-11-02, Oqva se quedó corto)
        const maderaQueLlevo = () => cuenta(/_log$/) + Math.floor(cuenta(/_planks$/) / 4)
        for (let i = 0; i < 3 && maderaQueLlevo() < madera && !tarea.cancelada; i++) await talar(madera - maderaQueLlevo())
        // una mesa fija al lado para todo lo de aquí: fabricar la usa sin ponerla ni quitarla. Si la pone y la recoge en cada
        // receta, a veces no llega a recogerla y la siguiente gasta 4 tablones en otra (2026-11-02: se quedaba sin madera)
        const mesaAqui = async () => {
          if (bot.findBlock({ matching: bot.registry.blocksByName.crafting_table.id, maxDistance: 4 })) return
          if (!inv().some(i => i.name === 'crafting_table')) { const [, d] = await paso('fabricar', ['mesa']); pasos.push(d) }
          const [, d2] = await paso('poner', ['mesa']); pasos.push(d2)
        }
        if (q() > 0 && sinPico() && !tarea.cancelada) {
          await mesaAqui()
          const [r, d] = await paso('fabricar', ['pico_madera']); pasos.push(d)
          if (!r.exito) return { exito: false, texto: `No pude hacerme un pico de madera: ${r.causa}.`, pasos }
        }
        if (q() > 0 && !tarea.cancelada) { const [, d] = await paso('minar', ['stone', String(q()), '8']); pasos.push(d) }
        // sin piedra a la vista: una escalera de 8 hacia abajo (la que baje de las 4 direcciones; los escalones ya dan piedra),
        // picar allí lo que falte y subir. 2026-11-03, banco: junto a un lago las 4 dieron con agua: otra vez, 24-40 más allá
        for (let vuelta = 0; vuelta < 2 && q() > 0 && !tarea.cancelada; vuelta++) {
          if (vuelta) { const [, de] = await paso('explorar', ['-', '24', '40']); pasos.push(de) }
          const y0 = bot.entity.position.floored().y
          for (const rumbo of ['norte', 'este', 'sur', 'oeste']) {
            if (q() <= 0 || tarea.cancelada) break
            const [, d1] = await paso('cavar_escalera', [String(y0 - 8), rumbo]); pasos.push(d1)
            if (bot.entity.position.y < y0 - 2) break // bajó: aquí abajo hay piedra
          }
          if (q() > 0 && !tarea.cancelada) { const [, d2] = await paso('minar', ['stone', String(q()), '8']); pasos.push(d2) }
          // la escalera no recoge lo que pica: la piedra se queda en los escalones (2026-11-02, Soma subió con 1)
          if (q() > 0 && !tarea.cancelada) { const [, dr] = await paso('recoger', ['12', 'cobble', 'max:24', 'otra_vez']); pasos.push(dr) }
          if (bot.entity.position.y < y0 - 1) { const [, d3] = await paso('subir_a_superficie', []); pasos.push(d3) }
          if (q() > 0 && !tarea.cancelada) { const [, dr2] = await paso('recoger', ['12', 'cobble', 'max:24', 'otra_vez']); pasos.push(dr2) }
        }
        const hechas = []
        if (!tarea.cancelada) await mesaAqui()
        for (const [obj, item] of faltan) {
          if (tarea.cancelada) break
          let [r, d] = await paso('fabricar', [obj]); pasos.push(d)
          if (!r.exito && !/piedra|cobble/i.test(r.causa || '') && (/log|tronco|madera|tabl|planks|palo|stick|no se pudo/i.test(r.causa || ''))) {
            await talar(2); await mesaAqui(); [r, d] = await paso('fabricar', [obj]); pasos.push(d)
          }
          if (inv().some(i => i.name === item)) hechas.push(obj.replace('_piedra', ''))
        }
        await equiparse()
        const no = faltan.map(([obj]) => obj.replace('_piedra', '')).filter(n => !hechas.includes(n))
        return { exito: !no.length, texto: no.length ? `Me falta: ${no.join(', ')} de piedra${q() > 0 ? ` (no encontré ${q()} de piedra)` : ''}.${hechas.length ? ` Hecho: ${hechas.join(', ')}.` : ''}` : `Armado: espada, pico y hacha de piedra.`, pasos }
      }
      case 'equipate': {
        // 2026-11-01: antes de equipar lo que lleva, toma lo mejor de los armor stands cercanos (y espada o hacha del cofre que tengan al lado)
        const [rs, ds] = await paso('equipar_soportes', [baseZona()])
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
      case 'carteles': { // 2026-11-02: zonas de obras temporales de carteles «[obras] NOMBRE» (carteles.js); se aceptan tras leerlas
        const carteles = require('./carteles'), obras = require('./obras')
        if (o.accion === 'olvidar') {
          const n = obras.temporales().length
          obras.ponerTemporales([])
          return { exito: true, texto: n ? `Olvido las ${n} zonas de obras de los carteles.` : 'No tenía ninguna zona de obras de carteles.', pasos: [] }
        }
        if (o.accion === 'aceptar') {
          if (!this.cartelesLeidos || !this.cartelesLeidos.length) return { exito: false, texto: 'Primero dime «lee los carteles»: acepto lo que te haya enseñado.', pasos: [] }
          const nuevas = this.cartelesLeidos.map(z => ({ ...z, desde: new Date().toLocaleString('sv-SE').slice(0, 19) }))
          obras.ponerTemporales([...obras.temporales().filter(z => !nuevas.some(n => n.nombre === z.nombre)), ...nuevas])
          this.cartelesLeidos = null
          return { exito: true, texto: `Construiré solo dentro de: ${nuevas.map(carteles.describir).join(', ')} (mientras sigan sus carteles).`, pasos: [] }
        }
        const quitadas = carteles.vigentes(bot)
        const r = carteles.leer(bot)
        this.cartelesLeidos = r.zonas
        const activas = obras.temporales()
        const partes = []
        if (quitadas.length) partes.push(`Ya no valen (falta un cartel): ${quitadas.join(', ')}.`)
        if (activas.length) partes.push(`En uso: ${activas.map(carteles.describir).join(', ')}.`)
        if (r.zonas.length) partes.push(`Veo ${r.zonas.length === 1 ? 'una zona' : r.zonas.length + ' zonas'} de obras: ${r.zonas.map(carteles.describir).join(', ')}. Di «acepta los carteles» para usarla${r.zonas.length === 1 ? '' : 's'}.`)
        if (r.sueltos.length) partes.push(`Sin pareja: ${r.sueltos.map(x => `${x.nombre} (${x.n} cartel${x.n === 1 ? '' : 'es'})`).join(', ')}.`)
        if (!r.zonas.length && !r.sueltos.length) partes.push('No veo carteles de obras a 64 bloques (primera línea «[obras]», debajo el nombre, uno en cada esquina).')
        return { exito: true, texto: partes.join(' '), pasos: [] }
      }
      case 'estructuras': { // 2026-11-02: las del catálogo (make import-structure), numeradas para «recursos de la 2»
        const l = require('./estructuras').ids().map((id, i) => { const e = require('./estructuras').cargar(id); return `${i + 1}. ${id} (${e.dim.join('×')}, ${e.bloques.length} bloques)` })
        return { exito: true, texto: l.length ? `Sé construir: ${l.join(' · ')}. Di «recursos de la N» para saber qué hace falta.` : 'No tengo ninguna estructura en el catálogo.', pasos: [] }
      }
      case 'recursos': { // 2026-11-02: los recursos primarios de una estructura (abastecer.primarios) y las piezas ya hechas que también valen
        const est = require('./estructuras'), e = o.estructura && est.cargar(o.estructura)
        if (!e) return { exito: false, texto: o.numero ? `No hay estructura número ${o.numero}: di «lista de estructuras».` : 'No sé cuál: di «lista de estructuras» y «recursos de la N».', pasos: [] }
        const ES = { troncos: 'troncos (cualquier madera)', cobblestone: 'de adoquín', sand: 'de arena', red_sand: 'de arena roja', gravel: 'de grava', dirt: 'de tierra',
          coal: 'de carbón', clay_ball: 'bolas de arcilla', raw_iron: 'de hierro en bruto', raw_gold: 'de oro en bruto', raw_copper: 'de cobre en bruto',
          white_wool: 'de lana blanca', leather: 'de cuero', feather: 'plumas' }
        const lista = (m, nombres = {}) => Object.entries(m).map(([k, n]) => `${n} ${nombres[k] || k.replace(/_/g, ' ')}`).join(', ')
        const { primarios, noSeConsigue } = require('./abastecer').primarios(bot.registry, e.materiales)
        bot.chat(`${e.nombre} (${e.dim.join('×')}, ${e.bloques.length} bloques), partiendo de cero: ${lista(primarios, ES) || 'nada'}.`)
        bot.chat(`O ya hechas (la madera da igual): ${lista(e.materiales)}.`)
        if (Object.keys(noSeConsigue).length) bot.chat(`No se consigue en supervivencia temprana: ${lista(noSeConsigue)}.`)
        const fuente = (this.abasto || process.env.IO_ABASTO || 'todo') === 'cofres' ? 'Déjalo en un cofre de ' + baseZona() + ': solo uso lo de los cofres.' : 'Lo que no esté en los cofres de ' + baseZona() + ' lo consigo yo.'
        return { exito: true, texto: fuente, pasos: [] }
      }
      case 'abasto': { // 2026-11-02: de dónde saca los materiales de las obras del catálogo
        this.abasto = o.modo
        return { exito: true, texto: o.modo === 'cofres' ? `Para construir solo usaré lo de los cofres de ${baseZona()}; lo que falte te lo pido.` : 'Lo que no haya en los cofres lo consigo yo (talar, minar, cazar).', pasos: [] }
      }
      case 'deshaz': {
        const [r, d] = await paso('deshacer', [o.obra || ''])
        const texto = r.exito ? `Deshecha: quité ${r.quitados} bloques${r.saltados ? ` (${r.saltados} ya no eran míos)` : ''}.` : `No pude deshacerlo: ${r.causa}${r.quitados ? ` (${r.quitados} quitados, quedan ${r.quedan})` : ''}.`
        return { exito: !!r.exito, texto, pasos: [d] }
      }
    }
    return { exito: false, texto: 'No sé hacer eso.' }
  }

  // 2026-11-02 (catálogo de estructuras): «construye casa_roble en x y z» (o «… aquí»: la esquina, a 2 de mis pies). Por tandas: los
  // siguientes bloques que caben en la mochila, conseguidos con abastecer.planAbasto (cofres de la base, talar, minar, fundir, cazar,
  // fabricar: las órdenes de siempre) y puestos con construir … parcial, que para en el primer bloque sin material. Hasta terminar, o
  // 3 tandas sin avance, o cuando solo falta lo que hay que pedir (lo dice por el chat). Sin LLM. La obra queda en obras.json y
  // «continúa» la retoma (o.obra). Lo que no saca de los cofres ni consigue lo pide: «déjalo en un cofre de HOGAR».
  async construirCatalogo(o, tarea, paso) {
    const bot = this.bot, estructuras = require('./estructuras'), abastecer = require('./abastecer'), { Vec3 } = require('vec3')
    const cargado = estructuras.cargar(o.estructura)
    if (!cargado) return { exito: false, texto: `No tengo la estructura ${o.estructura}.`, pasos: [] }
    const frase = (m) => Object.entries(m).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ')
    const pasos = []
    let obra = o.retomar || null, origen = null
    // 2026-11-02: hacia dónde mira: «mirando al este» (o.dir: la entrada a ese lado) o «girada 90» (o.giro); una obra retomada, su giro
    let giro = o.dir ? estructuras.vueltasPara(cargado, o.dir) : Math.round((o.giro || 0) / 90) % 4
    if (obra) { const ob = require('./obras').leer().obras.find(x => x.id === obra); origen = ob && ob.origen; if (ob && ob.giro != null) giro = ob.giro }
    if (!origen) {
      if (o.pos) origen = o.pos
      else if (o.aqui) { const p = bot.entity.position.floored(); origen = [p.x + 2, p.y, p.z + 2] }
      else return { exito: false, texto: `Dime dónde: «construye ${o.estructura} en x y z» (la esquina de abajo) o «… aquí».`, pasos }
      // la misma estructura en el mismo sitio, a medias (el reintento de la agenda o la orden repetida): se retoma, no se empieza otra
      const previa = [...require('./obras').leer().obras].reverse().find(x => x.plano === o.estructura && String(x.origen) === String(origen))
      if (previa && !['terminada', 'deshecha'].includes(previa.estado)) { obra = previa.id; giro = previa.giro || 0 } // la última en ese sitio; si se deshizo, otra nueva
    }
    const plano = estructuras.girar(cargado, giro)
    const puestosEnMundo = () => {
      const hechos = new Set()
      for (const [dx, dy, dz, i] of plano.bloques) {
        const b = bot.blockAt(new Vec3(origen[0] + dx, origen[1] + dy, origen[2] + dz))
        if (b && estructuras.mismoMaterial(b.name, estructuras.nombre(plano.paleta[i]))) hechos.add(`${dx},${dy},${dz}`)
      }
      return hechos
    }
    // antes de ir a por material, que el sitio valga (dentro de las zonas de obras, vacío, con suelo)
    if (!obra) {
      const [rv, dv] = await paso('construir', [o.estructura, ...origen.map(String), 'comprobar', `giro=${giro}`])
      pasos.push(dv)
      if (!rv.exito) return { exito: false, texto: `No puedo construir ${plano.nombre} en ${origen.join(' ')}: ${rv.causa}.`, pasos }
    }
    const total = estructuras.ordenar(plano).length
    let sinAvance = 0, antes = -1, r = null, mal = 0, pedir = {}, ronda = 0
    const sinHallar = {} // hojas que no encontró cerca: no se vuelven a buscar, se piden
    const rondas = Math.max(40, Math.ceil(total / 300) + 10) // una obra grande (el castillo: 132 mil bloques) pide más de 40 tandas
    while (++ronda <= rondas && !tarea.cancelada) {
      const hechos = puestosEnMundo()
      sinAvance = hechos.size === antes ? sinAvance + 1 : 0
      antes = hechos.size
      if (sinAvance >= 3) break
      // la tanda: lo que cabe en los huecos de la mochila, más las ranuras que ya ocupa lo de la obra
      const inv = {}
      for (const it of bot.inventory.items()) inv[it.name] = (inv[it.name] || 0) + it.count
      const deObra = bot.inventory.items().filter(it => Object.keys(plano.materiales).some(k => estructuras.mismoMaterial(k, it.name))).length
      const t = abastecer.tanda(bot.registry, plano, hechos, Math.max(4, bot.inventory.emptySlotCount() - 4 + deObra))
      const falta = estructuras.faltaCon(t.objetos, inv) // la madera, de cualquier tipo
      // el andamio (más de 4 de alto): tierra o adoquín, una columna como mucho de la altura de la obra (Oqva dejó sin tejado la casita)
      const relleno = Object.entries(inv).filter(([k]) => RELLENO_OBRA.test(k)).reduce((a, [, n]) => a + n, 0)
      if (plano.dim[1] > 4 && relleno < plano.dim[1]) falta.dirt = (falta.dirt || 0) + plano.dim[1] - relleno
      if (Object.keys(falta).length && bot.game.gameMode === 'creative') { // server creativo: se los pone del inventario creativo
        bot.chat(`Tanda ${ronda} de ${plano.nombre} (${t.bloques} bloques): me los pongo (creativo).`)
        const Item = require('prismarine-item')(bot.registry)
        for (const [k, n] of abastecer.pilas(bot.registry, falta)) {
          const ranura = bot.inventory.firstEmptyInventorySlot()
          if (ranura == null) break
          await bot.creative.setInventorySlot(ranura, new Item(bot.registry.itemsByName[k].id, n))
        }
      } else if (Object.keys(falta).length) {
        const [rc, dc] = await paso('revisar_cofres', [baseZona()]); pasos.push(dc)
        await this.salirDeVedada(tarea)
        const hayHorno = !!bot.findBlock({ matching: b => b.name === 'furnace', maxDistance: 16 })
        const soloCofres = (this.abasto || process.env.IO_ABASTO || 'todo') === 'cofres' // «solo de los cofres» (o IO_ABASTO=cofres en local.mk)
        const plan = abastecer.planAbasto(bot.registry, falta, inv, rc.items || {}, { hayHorno, evitar: sinHallar, soloCofres })
        pedir = plan.pedir
        if (Object.keys(pedir).length) bot.chat(`Para ${plano.nombre} necesito que me traigas ${frase(pedir)} (déjalo en un cofre de ${baseZona()}).`)
        if (!plan.pasos.length) break // solo queda lo que hay que pedir
        bot.chat(`Tanda ${ronda} de ${plano.nombre} (${t.bloques} bloques): voy a por ${frase(falta)}.`)
        const noHallo = {}
        for (const p of plan.pasos) {
          if (tarea.cancelada) break
          const ds = await this.pasoAbasto(p, tarea, paso, origen)
          pasos.push(...ds)
          // lo que no encuentra cerca (arena, ovejas…): se pide, en vez de repetirlo tanda tras tanda
          if ((p.tipo === 'mina' || p.tipo === 'cazar') && ds.length && ds.every(d => !d.exito)) for (const k of p.para.split(', ')) noHallo[k] = sinHallar[k] = p.n
        }
        if (Object.keys(noHallo).length) {
          bot.chat(`No encuentro cerca con qué hacer ${frase(noHallo)}: tráemelo (déjalo en un cofre de ${baseZona()}).`)
        }
      }
      if (tarea.cancelada) break
      const [rr, d] = await paso('construir', obra ? [`retomar=${obra}`, 'parcial'] : [o.estructura, ...origen.map(String), 'parcial', `giro=${giro}`])
      pasos.push(d); r = rr; mal += r.mal || 0
      if (r.obra) { obra = r.obra; o.obra = obra } // para «continúa»
      const ES = { north: 'norte', south: 'sur', east: 'este', west: 'oeste' }
      if (r.exito) return { exito: true, texto: `Construido: ${plano.nombre} en ${r.origen.join(', ')}, con la entrada al ${ES[plano.frente]} (${total} bloques en ${ronda} tanda${ronda === 1 ? '' : 's'}${mal ? `; ${mal} con otra orientación` : ''}).`, pasos }
      if (!/^falta material/.test(r.causa || '')) break
    }
    const hechos = puestosEnMundo().size
    const porque = tarea.cancelada ? 'me lo cortaste' : Object.keys(pedir).length ? `me falta ${frase(pedir)}` : sinAvance >= 3 ? 'tres tandas sin avanzar' : r ? r.causa : 'no empecé'
    return { exito: false, texto: `No terminé ${plano.nombre}: ${porque} (${hechos} de ${plano.bloques.length} bloques en su sitio${obra ? '; «continúa» la retoma' : ''}).`, pasos }
  }

  // Si está dentro de una zona vedada (la base, tras abrir sus cofres), salir al punto de fuera más cercano pisándola
  async salirDeVedada(tarea) {
    const bot = this.bot, zonas = require('./zonas'), p = bot.entity.position.floored()
    if (!zonas.pasoVedado(p.x, p.y, p.z)) return
    const f = zonas.puntoFuera(p.x, p.z)
    const fuera = () => { const q = bot.entity.position.floored(); return !zonas.pasoVedado(q.x, q.y, q.z) }
    await moverHasta(bot, new goals.GoalNearXZ(f.x, f.z, 1), fuera, { ms: 30000, tarea, mov: prudentes(bot, { pisarVedadas: true }) })
  }

  // Un paso del abasto con la orden de siempre (tala, mina, funde, cazar) o la habilidad (saca y fabrica, con su cantidad)
  async pasoAbasto(p, tarea, paso, origen) {
    if (p.tipo === 'saca') { // de los cofres que contó revisar_cofres; luego fuera de la zona (si es vedada, desde dentro no se fabrica ni se va a la obra)
      const d = (await paso('sacar_del_cofre', [p.objeto, String(p.n), `zona=${baseZona()}`]))[1]
      await this.salirDeVedada(tarea)
      return [d]
    }
    if (p.tipo === 'fabrica') {
      // la mesa: en una zona de carteles se puede poner (fabricar.mesaEnCartel); si la obra está en una, se fabrica a su lado, fuera de la
      // huella; si no, fuera de la vedada en la que esté (en ella no se pone)
      const bot = this.bot
      if (origen && require('./obras').enTemporal(origen[0] - 2, origen[2] - 2)) {
        const [x, y, z] = [origen[0] - 2, origen[1], origen[2] - 2]
        await moverHasta(bot, new goals.GoalNear(x, y, z, 1), () => bot.entity.position.distanceTo(new (require('vec3').Vec3)(x + 0.5, y, z + 0.5)) <= 2, { ms: 60000, tarea, mov: prudentes(bot, { pisarVedadas: true }) }) // como construir.prudentesObra
      } else await this.salirDeVedada(tarea)
      return [(await paso('fabricar', [p.objeto, String(p.n)]))[1]]
    }
    const o = p.tipo === 'tala' ? { tipo: 'tala', n: Math.min(p.n, 64), pedido: p.n }
      : p.tipo === 'mina' ? { tipo: 'mina', bloque: p.bloque, n: p.n }
        : p.tipo === 'funde' ? { tipo: 'funde', entrada: p.entrada, n: p.n } : { tipo: 'cazar', animal: p.animal, n: p.n }
    const res = await this.hacer(o, tarea)
    return res.pasos || []
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
  //   inicio | fin NOMBRE [no_talar|trabajo|hogar] | arbol NOMBRE | lista | borrar NOMBRE      (chat: usa tu posición)
  //   rect NOMBRE x1 z1 x2 z2 [no_talar|trabajo] | tronco NOMBRE x y z | lista | borrar NOMBRE   (puerto)
  //   trabajo: si hay alguna, solo talan, pican y ponen dentro de ellas (bot/zonas.js)
  ordenZona(usuario, texto) {
    const [verbo, ...p] = (texto || 'lista').trim().split(/\s+/)
    const pos = () => {
      const e = usuario && this.bot.players[usuario]?.entity
      if (!e) throw new Error('no te veo; acércate al personaje')
      return e.position.floored()
    }
    const modo = (x) => (/no_?talar/i.test(x || '') ? 'no_talar' : /^trabajo$/i.test(x || '') ? 'trabajo' : /^hogar$/i.test(x || '') ? 'hogar' : 'vedada')
    const TIPO = { vedada: 'vedada', no_talar: 'sin talar', trabajo: 'de trabajo: solo se trabaja dentro', hogar: 'hogar: se usa y se pisa, no se rompe nada' }
    // 2026-11-02: en un mundo compartido va a mi jugadores/<yo>.json (plantel.js), que viaja por git: hasta «make share», solo la ven mis bots
    const comparte = zonas.compartido() ? ' · para que la vean los demás: make share' : ''
    switch (verbo) {
      case 'inicio': { const q = pos(); ESQUINAS.set(usuario, q); return `esquina A en ${q.x}, ${q.z}; ve a la opuesta y di: !zona fin NOMBRE` }
      case 'fin': {
        const a = ESQUINAS.get(usuario); if (!a) return 'primero marca una esquina con: !zona inicio'
        if (!p[0]) return 'ponle nombre: !zona fin NOMBRE'
        const b = pos(); zonas.zonaNueva(p[0], a.x, a.z, b.x, b.z, modo(p[1])); ESQUINAS.delete(usuario)
        return `zona ${p[0]} guardada (${TIPO[modo(p[1])]}): x ${Math.min(a.x, b.x)}..${Math.max(a.x, b.x)}, z ${Math.min(a.z, b.z)}..${Math.max(a.z, b.z)}${comparte}`
      }
      case 'arbol': {
        if (!p[0]) return 'ponle nombre: !zona arbol NOMBRE'
        const q = pos(); const ts = this.bot.findBlocks({ matching: b => b.name.endsWith('_log'), maxDistance: 8, count: 60, point: q })
        if (!ts.length) return 'no hay troncos a 8 bloques de ti'
        ts.sort((x, y) => x.distanceTo(q) - y.distanceTo(q))
        // todo el tronco de la columna más cercana
        const c = ts[0]; const col = ts.filter(v => v.x === c.x && v.z === c.z)
        col.forEach((v, i) => zonas.arbolNuevo(p[0] + (col.length > 1 ? '#' + i : ''), v.x, v.y, v.z))
        return `árbol ${p[0]} protegido en ${c.x}, ${c.z} (${col.length} troncos)${comparte}`
      }
      case 'rect': { const [n, a, b, c, d, m] = p; if ([a, b, c, d].some(v => v === undefined || isNaN(+v))) return 'uso: zona rect NOMBRE x1 z1 x2 z2 [no_talar|trabajo|hogar]'; zonas.zonaNueva(n, +a, +b, +c, +d, modo(m)); return `zona ${n} guardada (${TIPO[modo(m)]})` }
      case 'modo': {
        const m = modo(p[1]); if (!p[0] || !/^(vedada|no_?talar|trabajo|hogar)$/i.test(p[1] || '')) return 'uso: zona modo NOMBRE vedada|no_talar|trabajo|hogar'
        return zonas.cambiarModo(p[0], m) ? `zona ${p[0]} ahora es ${TIPO[m]}` : `no hay ninguna zona ${p[0]}`
      }
      case 'tronco': { const [n, x, y, z] = p; zonas.arbolNuevo(n, +x, +y, +z); return 'tronco ' + n + ' protegido' }
      case 'borrar': return p[0] ? `borrados: ${zonas.borrar(p[0])}${comparte}` : 'di cuál: !zona borrar NOMBRE'
      case 'lista': { const l = zonas.lista(); return l.length ? l.join('\n') : 'no hay zonas protegidas' }
      default: return 'zona: inicio | fin NOMBRE [no_talar|trabajo|hogar] | modo NOMBRE vedada|no_talar|trabajo|hogar | arbol NOMBRE | lista | borrar NOMBRE'
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
          this.libreTrasAgenda = false
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
      para: async () => { this.libreTrasAgenda = false; this.ponerModo('ordenes', 'orden directa del puerto: para'); this.tarea.cancelada = true; if (this.tareaReflejo) this.tareaReflejo.cancelada = true; this.bot.pathfinder.setGoal(null); return 'parado' },
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
    for (const n of [...Object.keys(habilidades.HABILIDADES), ...Object.keys(rutinas.RUTINAS), 'conseguir']) O[n] = (a) => this.habilidad(n, a)
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
// Entran de uno en uno para no saturar el servidor al conectar: 5 s entre ellos, porque Paper rechaza («Connection throttled») las
// conexiones desde la misma IP a menos de 4 s (connection-throttle de bukkit.yml; 2026-11-02, antes 2 s)
lista.forEach((x, k) => setTimeout(() => new Personaje(x.nombre, x.puerto, x.perfil, lista.length > 1, x.modo, DESPUES, x.decisor), 5000 * k))
// Al cerrar el bot (kill PID o Ctrl+C), el tramo de modo libre en curso se apunta en el diario antes de salir.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => {
  for (const p of VIVOS.values()) try { p.cerrarTramo('bot cerrado') } catch (_) {}
  for (const p of VIVOS.values()) try { persistente.guardar(p.yo.persistente) } catch (_) {}
  process.exit(0)
})
