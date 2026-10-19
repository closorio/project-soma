// Observación de F2/F3 y fase C: las 25 entradas de entrenamiento/entorno_habilidades.py (OBS), en el mismo orden y escala,
// calculadas en Minecraft antes de cada decisión: 17 de lo que percibe, 4 de su perfil (perfiles/*.json, F3) y 4 del compañero
// (el otro personaje más cercano: a qué distancia está de mí y de mi árbol, si su objetivo es mi árbol, y el árbol más
// cercano que no es objetivo de ningún compañero, al que iría ir_a_otro_arbol).
// La usa la orden `obs` (el ejecutor la pide y se la pasa a la red).
// F7.1: la observación de supervivencia (observarSv, orden `obs_sv`): las 47 entradas de entrenamiento/entorno_supervivencia.py
// (OBS, fuente única; NOMBRES_SV es su copia y bot/probar_sentidos_seco.js comprueba que coinciden). No cambia las 25 de arriba.
const fs = require('fs')
const path = require('path')
const cerebro = require('./cerebro')
const memoria = require('./memoria')
const { alAlcance } = require('./habilidades/picar_tronco')
const { dist, hostilCercano, hostiles, encerrado, nodo, jugadorCercano, companeroCercano, companeros, BOTS } = require('./habilidades/comun')
const { inalcanzado } = require('./habilidades/recoger')

const HABILIDADES = ['ir_a_arbol', 'picar_tronco', 'recoger', 'ir_a_jugador', 'huir', 'ir_a_otro_arbol']
const PESOS = ['madera', 'compania', 'seguridad', 'tiempo']
const NOMBRES = ['arbol_dist', 'arbol_enfrente', 'tronco_al_alcance', 'objetos_suelo', 'troncos_inv', 'jugador_dist',
  'amenaza_dist', 'noche', 'salud', 'tiempo_restante', ...HABILIDADES.map(h => 'previa_' + h), 'previa_exito', ...PESOS.map(k => 'perfil_' + k),
  'companero_dist', 'companero_arbol_dist', 'companero_mismo_arbol', 'otro_arbol_dist']

// Supervivencia (F7.1): copia de ACCIONES, TIPOS_HOSTIL, PESOS y OBS de entrenamiento/entorno_supervivencia.py.
const ACCIONES_SV = ['ir_a_arbol', 'picar_tronco', 'recoger', 'huir', 'comer', 'atacar', 'refugiarse', 'dormir', 'fabricar',
  'recoger_comida', 'explorar']
const TIPOS_HOSTIL = ['zombi', 'esqueleto', 'aranya', 'creeper', 'otro']
const PESOS_SV = [...PESOS, 'supervivencia']
const NOMBRES_SV = ['arbol_dist', 'arbol_enfrente', 'tronco_al_alcance', 'objetos_suelo', 'troncos_inv', 'jugador_dist',
  'hostil_dist', ...TIPOS_HOSTIL.map(t => 'hostil_tipo_' + t), 'hostiles_n', 'salud', 'hambre', 'comida_inv',
  'noche', 'hora_sen', 'hora_cos', 'luz', 'arma', 'armadura', 'tierra_inv', 'cama_inv', 'refugio_dist', 'en_refugio',
  'caida', 'lava_cerca', 'agua_profunda', 'tiempo_restante', ...ACCIONES_SV.map(a => 'previa_' + a), 'previa_exito',
  ...PESOS_SV.map(k => 'perfil_' + k)]

// Perfil (F3) de cada personaje: pesos de perfiles/NOMBRE.json divididos por perfiles/_escala.json, como vector_perfil() del simulador.
// vectorSv: el de supervivencia, con el peso `supervivencia` (si el perfil o _escala.json aún no lo tienen, los de abajo, F7.3).
const DIR_PERFILES = path.join(__dirname, '..', 'perfiles')
const PERFIL_BASE = { madera: 1, compania: 0, seguridad: 1, tiempo: 0.002 }
const PERFIL_BASE_SV = { ...PERFIL_BASE, supervivencia: 0.5 }, ESCALA_SV = { supervivencia: 5 }
function cargarPerfil(nombre) {
  const leer = (f) => JSON.parse(fs.readFileSync(path.join(DIR_PERFILES, f + '.json')))
  const escala = leer('_escala'), propios = leer(nombre).pesos, pesos = { ...PERFIL_BASE, ...propios }
  const pesosSv = { ...PERFIL_BASE_SV, ...propios }, escalaSv = { ...ESCALA_SV, ...escala }
  return { nombre, pesos, vector: PESOS.map(k => Math.min(1, Math.max(0, pesos[k] / escala[k]))),
    vectorSv: PESOS_SV.map(k => Math.min(1, Math.max(0, pesosSv[k] / escalaSv[k]))) }
}
const perfiles = () => fs.readdirSync(DIR_PERFILES).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => f.slice(0, -5))
const perfilDe = (bot) => memoria(bot, 'perfil', () => cargarPerfil('recolector')) // por defecto, el Ío de F2
function ponerPerfil(bot, nombre) { return (memoria(bot).perfil = cargarPerfil(nombre)) }
const VISTA = 48, RADIO_OBJ = 8, META = 10, RADIO_AMENAZA = 16
const NOCHE = [12480, 23520] // 0,52-0,98 del día, como el simulador
// Escalas de supervivencia (las de entorno_supervivencia.py)
const RADIO_HOSTIL = 24, RADIO_HOSTILES = 16, HOSTILES_MAX = 4, COMIDA_MAX = 8, TIERRA_MAX = 4, ARMADURA_MAX = 20
const RADIO_PELIGRO = 3, CAIDA_MAX = 3

// Episodio en curso de cada personaje (la orden `obs inicio [segundos]` lo empieza): reloj, troncos de partida y habilidad anterior.
// troncos0 cuenta también los ya guardados en el cofre (habilidad depositar): ganados = en el inventario + guardados − troncos0.
// previaNombre: el nombre de la habilidad anterior, para las previa_* de supervivencia (sus acciones no son las de HABILIDADES).
const episodioDe = (bot) => memoria(bot, 'episodio', () => ({ t0: null, T: 300, troncos0: 0, previa: -1, previaNombre: null, previaExito: 0 }))
const guardados = (bot) => memoria(bot, 'guardados', () => ({ troncos: 0 })).troncos

const troncosInventario = (bot) => bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((a, i) => a + i.count, 0)
const esTronco = (e) => { try { return e.getDroppedItem().name.endsWith('_log') } catch (_) { return true } } // sin metadatos aún: contarlo

function iniciar(bot, segundos) {
  Object.assign(episodioDe(bot), { t0: Date.now(), T: parseFloat(segundos) || 300, troncos0: troncosInventario(bot) + guardados(bot), previa: -1, previaNombre: null, previaExito: 0 })
}
// La llama io.js tras cada habilidad, también las pedidas a mano: es la «habilidad anterior» del simulador.
function anotarHabilidad(bot, nombre, exito) {
  const episodio = episodioDe(bot)
  episodio.previa = HABILIDADES.indexOf(nombre)
  episodio.previaNombre = nombre
  episodio.previaExito = exito ? 1 : 0
}

const r2 = (v) => Math.round(v * 1000) / 1000

// Lo que comparten las dos observaciones: árbol, objetos, troncos ganados, jugador, hora y reloj del episodio.
function comun(bot) {
  const episodio = episodioDe(bot)
  const p = bot.entity.position
  const horiz = (v) => Math.hypot(v.x + 0.5 - p.x, v.z + 0.5 - p.z)
  // árbol al que iría ir_a_arbol (sin agua, columnas agotadas ni troncos sin camino que recuerda)
  const arbol = cerebro.arbolCercano(bot, true)
  // enfrente: un tronco al alcance de la mano, o la columna que dejó ir_a_arbol con restos altos sin marcar (picar la marcará)
  const alcance = alAlcance(bot).length > 0
  const pref = cerebro.ultimo(bot).tronco
  const restos = !!pref && horiz(pref) <= 2 && !!bot.blockAt(pref)?.name.endsWith('_log') && !cerebro.agotada(bot, pref)
  // sin contar los que están en la caja de recogida de Ío o cayendo sobre ella (entran solos: los «auto» del simulador)
  // ni los que recoger acaba de dar por inalcanzables (si no, la red y el guion repiten «recoger» en vano)
  const entraSolo = (e) => Math.abs(e.position.x - p.x) <= 1.3 && Math.abs(e.position.z - p.z) <= 1.3 && e.position.y >= p.y - 0.5
  const objetos = Object.values(bot.entities).filter(e => e.name === 'item' && dist(bot, e) <= RADIO_OBJ && esTronco(e) && !entraSolo(e) && !inalcanzado(bot, e)).length
  const ganados = Math.max(0, troncosInventario(bot) + guardados(bot) - (episodio.t0 ? episodio.troncos0 : 0))
  const jugador = jugadorCercano(bot)
  const dj = jugador ? dist(bot, jugador) : Infinity
  const hora = bot.time.timeOfDay
  const seg = episodio.t0 ? (Date.now() - episodio.t0) / 1000 : 0
  // las entradas que son iguales en las dos observaciones
  const v = {
    arbol_dist: arbol ? Math.min(horiz(arbol), VISTA) / VISTA : 1, arbol_enfrente: +(alcance || restos), tronco_al_alcance: +alcance,
    objetos_suelo: Math.min(objetos, 4) / 4, troncos_inv: Math.min(ganados, META) / META, jugador_dist: Math.min(dj, VISTA) / VISTA,
    noche: +(hora >= NOCHE[0] && hora <= NOCHE[1]), salud: bot.health / 20, tiempo_restante: Math.max(0, episodio.T - seg) / episodio.T,
  }
  return { episodio, p, horiz, arbol, objetos, ganados, dj, hora, seg, v }
}

function observar(bot) {
  const perfil = perfilDe(bot)
  const { episodio, p, horiz, arbol, objetos, ganados, dj, hora, seg, v } = comun(bot)
  // compañero (fase C): el otro personaje más cercano y su objetivo (solo se conoce el de los de este proceso)
  const companero = companeroCercano(bot)
  const suyo = companero && BOTS.has(companero.username) ? cerebro.objetivo(BOTS.get(companero.username)) : null
  const objetivos = companeros(bot).map(cerebro.objetivo).filter(Boolean)
  const otro = objetivos.length ? cerebro.arbolCercano(bot, true, objetivos) : arbol
  const aArbol = (e) => Math.hypot(arbol.x + 0.5 - e.position.x, arbol.z + 0.5 - e.position.z)
  const amenaza = hostilCercano(bot, RADIO_AMENAZA)
  const obs = [v.arbol_dist, v.arbol_enfrente, v.tronco_al_alcance, v.objetos_suelo, v.troncos_inv, v.jugador_dist,
    amenaza ? Math.min(dist(bot, amenaza), RADIO_AMENAZA) / RADIO_AMENAZA : 1, v.noche, v.salud, v.tiempo_restante,
    ...HABILIDADES.map((_, k) => +(k === episodio.previa)), episodio.previaExito, ...perfil.vector,
    companero ? Math.min(dist(bot, companero), VISTA) / VISTA : 1, companero && arbol ? Math.min(aArbol(companero), VISTA) / VISTA : 1,
    +(!!suyo && !!arbol && cerebro.delArbol(arbol, [suyo])), otro ? Math.min(horiz(otro), VISTA) / VISTA : 1]
  return {
    obs: obs.map(r2),
    datos: { // valores en bruto, para el diario y para depurar
      arbol: arbol ? [arbol.x, arbol.y, arbol.z] : null, objetos, troncos: troncosInventario(bot), guardados: guardados(bot), ganados,
      jugador: Number.isFinite(dj) ? r2(dj) : null, amenaza: amenaza ? `${amenaza.name}@${dist(bot, amenaza).toFixed(1)}` : null,
      hora, salud: bot.health, segundos: Math.round(seg), pos: [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)], perfil: perfil.nombre,
      companero: companero ? `${companero.username}@${dist(bot, companero).toFixed(1)}` : null,
      companero_objetivo: suyo ? [suyo.x, suyo.y, suyo.z] : null, otro_arbol: otro ? [otro.x, otro.y, otro.z] : null,
      objetivo: (o => o ? [o.x, o.y, o.z] : null)(cerebro.objetivo(bot)),
    },
  }
}

// ---- F7.1 · sentidos de supervivencia ----

// Tipo de hostil (TIPOS_HOSTIL) por el nombre de la entidad; lo demás (bruja, enderman, una amenaza de prueba…) es «otro».
const TIPO_HOSTIL = { zombie: 'zombi', husk: 'zombi', drowned: 'zombi', zombie_villager: 'zombi', skeleton: 'esqueleto',
  stray: 'esqueleto', bogged: 'esqueleto', parched: 'esqueleto', spider: 'aranya', cave_spider: 'aranya', creeper: 'creeper' }
const tipoHostil = (e) => TIPO_HOSTIL[e.name] || 'otro'
// Comida que hace daño o efectos malos: no cuenta en comida_inv (comer, F7.2, tampoco la elige si hay otra).
const COMIDA_MALA = new Set(['rotten_flesh', 'spider_eye', 'poisonous_potato', 'pufferfish', 'chorus_fruit', 'suspicious_stew'])
// Bloques para tapiarse (tierra_inv): los que no caen ni arden mal y se juntan picando o talando; los troncos son madera, no cuentan.
const COLOCABLES = new Set(['dirt', 'coarse_dirt', 'rooted_dirt', 'cobblestone', 'mossy_cobblestone', 'stone', 'cobbled_deepslate',
  'deepslate', 'andesite', 'diorite', 'granite', 'tuff', 'calcite', 'sandstone', 'netherrack', 'mud', 'packed_mud', 'mud_bricks',
  'stone_bricks', 'bricks'])
const esColocable = (n) => COLOCABLES.has(n) || n.endsWith('_planks')
// arma: 0 nada; 0,5 espada o hacha de madera u oro; 1 de piedra o mejor (cobre, hierro, diamante, netherita), tridente o maza.
function valorArma(n) {
  if (n === 'trident' || n === 'mace') return 1
  const m = /^([a-z]+)_(sword|axe)$/.exec(n)
  return !m ? 0 : ['wooden', 'golden'].includes(m[1]) ? 0.5 : 1
}
// Puntos de armadura por material y pieza (cabeza, pecho, piernas, pies), los del juego.
const PIEZAS = ['helmet', 'chestplate', 'leggings', 'boots']
const PUNTOS_ARMADURA = { leather: [1, 3, 2, 1], golden: [2, 5, 3, 1], chainmail: [2, 5, 4, 1], copper: [2, 4, 3, 1], iron: [2, 6, 5, 2],
  diamond: [3, 8, 6, 3], netherite: [3, 8, 6, 3], turtle: [2, 0, 0, 0] }
function puntosArmadura(bot) { // la armadura puesta: ranuras 5-8 del inventario del jugador (cabeza, pecho, piernas, pies)
  let s = 0
  for (const i of bot.inventory.slots.slice(5, 9)) {
    const m = i && /^([a-z]+)_(helmet|chestplate|leggings|boots)$/.exec(i.name)
    if (m) s += (PUNTOS_ARMADURA[m[1]] || [0, 0, 0, 0])[PIEZAS.indexOf(m[2])]
  }
  return s
}
// Bloques de agua (y lo que vive en ella) para agua_profunda: hay agua y debajo más agua.
const AGUAS = ['water', 'bubble_column', 'kelp', 'kelp_plant', 'seagrass', 'tall_seagrass']

// Oscurecimiento del cielo por la hora y la lluvia (0 de día, 11 a medianoche), como Level.updateSkyBrightness() del juego.
function oscurecimiento(bot) {
  const d = ((bot.time.timeOfDay / 24000 - 0.25) % 1 + 1) % 1
  const angulo = (2 * d + (0.5 - Math.cos(d * Math.PI) / 2)) / 3
  const f = 0.5 + 2 * Math.min(0.25, Math.max(-0.25, Math.cos(angulo * 2 * Math.PI)))
  const lluvia = 1 - (bot.rainState || 0) * 5 / 16, trueno = 1 - (bot.thunderState || 0) * 5 / 16
  return Math.floor((1 - f * lluvia * trueno) * 11)
}
// ¿Hay algo sólido encima de la cabeza, hasta lo alto del mundo? Solo se mira si el servidor no ha mandado luz (ver luz()).
function techo(bot, b) {
  const tope = (bot.game?.minY ?? -64) + (bot.game?.height ?? 384)
  for (let y = b.y + 2; y < tope; y++) { const k = bot.blockAt(b.offset(0, y - b.y, 0)); if (k && k.boundingBox === 'block') return true }
  return false
}
// Brillo en la casilla de los pies: máx(luz de bloque, luz del cielo − oscurecimiento), en 0-15. Si el servidor no manda la luz
// (la casilla viene con 0 y 0) y no hay techo, el cielo se toma como 15 («estimada»).
// Calibración de F7.1 (servidor-supervivencia/probar_sentidos.py, 2026-10-15): la luz llega con cada trozo del mapa, pero el
// servidor no manda los cambios de luz de los trozos que el bot ya tiene (solo a quien los tiene en el borde de la vista; el
// cliente de verdad la recalcula y mineflayer no): un techo o una antorcha puestos después no se ven. Por eso, encerrado
// (`dentro`: las 6 caras sólidas, el refugio de F7.2) no entra luz del cielo aunque los datos, viejos, digan que sí.
// Además, prismarine-chunk 1.41 lee la luz (2048 bytes, dos casillas por byte) como enteros de 8 bytes al revés
// (BitArrayNoSpan.readBuffer, readUInt32BE): la luz de la casilla x queda guardada en la de x XOR 14 de su trozo (y, z bien).
// Junto a una antorcha daba 1 y su 14 salía en la x local 15; a cielo abierto no se nota (todo es 15). Por eso se lee en
// casillaLuz(b). Si se actualiza prismarine-chunk, probar_sentidos.py (comprobación 4) dice si el arreglo sigue haciendo falta.
const casillaLuz = (b) => b.offset(((b.x & 15) ^ 14) - (b.x & 15), 0, 0)
function luz(bot, b, dentro = false) {
  const k = bot.blockAt(casillaLuz(b))
  const bloque = k?.light ?? 0, cielo = k?.skyLight ?? 0, osc = oscurecimiento(bot)
  const estimada = !dentro && !bloque && !cielo && !techo(bot, b)
  return { valor: dentro ? bloque : Math.max(bloque, (estimada ? 15 : cielo) - osc), bloque, cielo, osc, estimada }
}
// ¿Borde con caída de más de CAIDA_MAX bloques a ≤ RADIO_PELIGRO (en horizontal, a la altura de los pies), o debajo?
// Una columna es caída si en los pies no hay pared y en los CAIDA_MAX + 1 de debajo nada sostiene (sólido o agua: caer al agua
// no hace daño). Lo que no está cargado no cuenta.
function hayCaida(bot, b) {
  const sostiene = (k) => !k || k.boundingBox === 'block' || AGUAS.includes(k.name)
  for (let dx = -RADIO_PELIGRO; dx <= RADIO_PELIGRO; dx++) {
    for (let dz = -RADIO_PELIGRO; dz <= RADIO_PELIGRO; dz++) {
      if (Math.hypot(dx, dz) > RADIO_PELIGRO) continue
      const pie = bot.blockAt(b.offset(dx, 0, dz))
      if (!pie || pie.boundingBox === 'block') continue
      let hueco = true
      for (let k = 1; k <= CAIDA_MAX + 1 && hueco; k++) if (sostiene(bot.blockAt(b.offset(dx, -k, dz)))) hueco = false
      if (hueco) return true
    }
  }
  return false
}
// Lava y agua honda (agua con más agua debajo) a ≤ RADIO_PELIGRO: se mira el cubo (≈ 120 casillas; findBlocks recorrería
// secciones enteras de 16³ en cuanto hubiera agua en ellas).
function liquidos(bot, b) {
  let lava = false, honda = false
  const R = RADIO_PELIGRO, agua = (k) => !!k && AGUAS.includes(k.name)
  for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
    if (Math.hypot(dx, dy, dz) > R) continue
    const k = bot.blockAt(b.offset(dx, dy, dz))
    if (!k) continue
    if (k.name === 'lava') lava = true
    else if (!honda && agua(k) && agua(bot.blockAt(b.offset(dx, dy - 1, dz)))) honda = true
  }
  return { lava, honda }
}
// El refugio conocido: el último sitio donde se refugió (memoria `refugio`, la escribe refugiarse en F7.2) o el campamento.
function refugioDe(bot) {
  const yo = memoria(bot)
  const r = yo.refugio || yo.campamento
  return Array.isArray(r) ? r : r && Number.isFinite(r.x) ? [r.x, r.y, r.z] : null
}

// Las 47 entradas de supervivencia (NOMBRES_SV) y los valores en bruto. Se calculan por nombre y se ordenan con NOMBRES_SV.
function observarSv(bot) {
  const perfil = perfilDe(bot), yo = bot.username
  const { episodio, p, arbol, objetos, ganados, dj, hora, seg, v } = comun(bot)
  const b = nodo(bot)
  const lista = hostiles(bot, RADIO_HOSTIL), hostil = lista[0] || null, tipo = hostil ? tipoHostil(hostil) : null
  const n = lista.filter(e => dist(bot, e) < RADIO_HOSTILES).length
  const items = bot.inventory.items(), cuantos = (vale) => items.filter(i => vale(i.name)).reduce((a, i) => a + i.count, 0)
  const comida = cuantos(x => !!bot.registry.foodsByName[x] && !COMIDA_MALA.has(x))
  const tierra = cuantos(esColocable), cama = items.some(i => i.name.endsWith('_bed'))
  const arma = items.reduce((m, i) => valorArma(i.name) > valorArma(m) ? i.name : m, '')
  const armadura = puntosArmadura(bot)
  const dentro = encerrado(bot), l = luz(bot, b, dentro)
  const f = hora / 24000
  const refugio = refugioDe(bot)
  const dRefugio = refugio ? Math.hypot(refugio[0] + 0.5 - p.x, refugio[1] - p.y, refugio[2] + 0.5 - p.z) : Infinity
  const caida = hayCaida(bot, b)
  const { lava, honda } = liquidos(bot, b)
  const val = {
    ...v,
    hostil_dist: hostil ? Math.min(dist(bot, hostil), RADIO_HOSTIL) / RADIO_HOSTIL : 1,
    ...Object.fromEntries(TIPOS_HOSTIL.map(t => ['hostil_tipo_' + t, +(t === tipo)])),
    hostiles_n: Math.min(n, HOSTILES_MAX) / HOSTILES_MAX,
    hambre: bot.food / 20, comida_inv: Math.min(comida, COMIDA_MAX) / COMIDA_MAX,
    hora_sen: (1 + Math.sin(2 * Math.PI * f)) / 2, hora_cos: (1 + Math.cos(2 * Math.PI * f)) / 2, luz: l.valor / 15,
    arma: valorArma(arma), armadura: Math.min(armadura, ARMADURA_MAX) / ARMADURA_MAX,
    tierra_inv: Math.min(tierra, TIERRA_MAX) / TIERRA_MAX, cama_inv: +cama,
    refugio_dist: Math.min(dRefugio, VISTA) / VISTA, en_refugio: +dentro,
    caida: +caida, lava_cerca: +lava, agua_profunda: +honda,
    ...Object.fromEntries(ACCIONES_SV.map(a => ['previa_' + a, +(a === episodio.previaNombre)])), previa_exito: episodio.previaExito,
    ...Object.fromEntries(PESOS_SV.map((k, i) => ['perfil_' + k, perfil.vectorSv[i]])),
  }
  const obs = NOMBRES_SV.map(k => {
    if (!Number.isFinite(val[k])) throw new Error(`obs_sv de ${yo}: la entrada ${k} no tiene valor (${val[k]})`)
    return r2(val[k])
  })
  return {
    obs,
    datos: { // valores en bruto, para el diario, la calibración y depurar
      arbol: arbol ? [arbol.x, arbol.y, arbol.z] : null, objetos, troncos: troncosInventario(bot), guardados: guardados(bot), ganados,
      jugador: Number.isFinite(dj) ? r2(dj) : null, hostil: hostil ? `${hostil.name}@${dist(bot, hostil).toFixed(1)}` : null, tipo, hostiles: n,
      hora, noche: !!v.noche, salud: bot.health, hambre: bot.food, comida, luz: l, arma: arma || null, armadura, tierra, cama,
      refugio, refugio_dist: Number.isFinite(dRefugio) ? r2(dRefugio) : null, en_refugio: dentro, caida, lava, agua_profunda: honda,
      previa: episodio.previaNombre, segundos: Math.round(seg), pos: [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)], perfil: perfil.nombre,
    },
  }
}

// Las escalas de supervivencia con las claves de `entorno_supervivencia.py --obs` (las compara probar_sentidos_seco.js).
const ESCALAS_SV = { vista: VISTA, radio_obj: RADIO_OBJ, meta: META, noche: NOCHE.map(t => t / 24000), radio_hostil: RADIO_HOSTIL,
  radio_hostiles: RADIO_HOSTILES, hostiles_max: HOSTILES_MAX, comida_max: COMIDA_MAX, tierra_max: TIERRA_MAX, armadura_max: ARMADURA_MAX,
  radio_peligro: RADIO_PELIGRO, caida_max: CAIDA_MAX }

module.exports = { observar, observarSv, iniciar, anotarHabilidad, NOMBRES, HABILIDADES, NOMBRES_SV, ACCIONES_SV, TIPOS_HOSTIL, ESCALAS_SV,
  ponerPerfil, perfilDe, perfiles,
  // F7.2: lo mismo que ven los sentidos, para las habilidades de supervivencia y los reflejos (habilidades/sv.js, reflejos.js)
  tipoHostil, COMIDA_MALA, esColocable, valorArma, PUNTOS_ARMADURA, PIEZAS, puntosArmadura, hayCaida, liquidos, NOCHE }
