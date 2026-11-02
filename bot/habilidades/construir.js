// construir PLANO [x z | x y z] [materia=tablones] [nombre=…] [parcial] (F6; catálogo 2026-11-02): levantar un plano pequeño
// (bot/planos.js: pilar, muro, plataforma, cabana, cabana_techada) o una estructura del catálogo (bot/estructuras/<id>.json,
// importada de un .litematic) dentro del rectángulo de obras (obras.json: permitido), lejos de las zonas protegidas y de los cofres.
// Con x z, es la esquina noroeste y la altura la pone el suelo; con x y z (catálogo), la esquina de x, y y z mínimos tal cual: la caja
// tiene que estar vacía (la hierba y las flores se quitan; cualquier otro bloque, «ocupado», sin empezar) y sin ellos, elige la parcela.
// Antes de poner nada hace el presupuesto: si faltan tablones y lleva troncos, los fabrica (receta sin mesa, 1 tronco → 4); si aun
// así falta, no empieza («falta material: …»). Con «parcial» (el bucle de abasto de io.js) empieza igual y para en el primer bloque
// cuyo objeto no lleve. Nivela solo rellenando (nunca cava). Trabaja desde fuera de la huella, capa a capa; cada bloque, con el
// apoyo, hacia dónde mirar y el punto del clic de orientar.js (escaleras, losas, puertas, antorchas…); comprueba que aparece con su
// estado y, si sale con otra orientación, lo rompe y prueba otro apoyo; a la segunda lo deja y lo apunta (mal_orientado).
// Más de 3 por encima de los pies: andamio (columna de tierra o adoquín fuera de la huella, que quita al terminar).
// Cada bloque puesto queda en obras.json en el acto (habilidad deshacer). Límite: 60 s + 10 s por bloque (máx. 20 min; 60 min las
// del catálogo). Devuelve { exito, causa, obra, plano, origen, puestos, pendientes, relleno, materia, mal, andamio, faltan, pos }.
const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const zonas = require('../zonas')
const cofres = require('../cofres')
const obras = require('../obras')
const mundo = require('../mundo')
const parcela = require('../parcela')
const planos = require('../planos')
const estructuras = require('../estructuras')
const { orientar, coincide } = require('./orientar')
const { moverHasta, prudentes, conLimite, esperar, nodo } = require('./comun')

const ALCANCE = 4, MAX_MS = 1200000, MAX_MS_CATALOGO = 3600000 // 20 min: la cabaña grande con techo son 206 bloques (2026-11-01)
const ALCANCE_MANO = 4.3 // desde los ojos hasta el punto del clic, de pie en el andamio (el juego deja 4,5)
const CARAS = [[0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0]] // de dónde apoyarse: abajo, sur, norte, este, oeste, arriba
const RELLENO = /^(dirt|coarse_dirt|cobblestone|cobbled_deepslate|netherrack|stone)$/ // lo que vale para rellenar y para el andamio
const ORDEN_RELLENO = ['dirt', 'coarse_dirt', 'netherrack', 'cobblestone', 'cobbled_deepslate', 'stone'] // la tierra primero: se quita a mano

// Los objetos del inventario que sirven de materia: «tablones» = cualquier *_planks; si no, el nombre exacto del bloque.
const deMateria = (bot, materia) => bot.inventory.items().filter(i => (materia === 'tablones' ? i.name.endsWith('_planks') : i.name === materia))
const cuantos = (bot, materia) => deMateria(bot, materia).reduce((a, i) => a + i.count, 0)
const deMateriaNombre = (nombre, materia) => (materia === 'tablones' ? nombre.endsWith('_planks') : nombre === materia)
const deRelleno = (bot) => bot.inventory.items().filter(i => RELLENO.test(i.name)).sort((a, b) => ORDEN_RELLENO.indexOf(a.name) - ORDEN_RELLENO.indexOf(b.name))
const inventario = (bot) => { const m = {}; for (const i of bot.inventory.items()) m[i.name] = (m[i.name] || 0) + i.count; return m }
const real = (b) => ({ nombre: b.name, props: b.getProperties ? b.getProperties() : {} })
const vacio = (b) => !b || /^(cave_|void_)?air$/.test(b.name) // una antorcha o una alfombra no ocupan, pero están puestas

// Fabricar tablones desde troncos hasta tener `necesarios` (receta sin mesa: 1 tronco → 4 tablones, del mismo tipo de madera).
// Lo que quede en la rejilla de fabricación del inventario (ranuras 1-4, que `inventory.items()` no cuenta) vuelve a la mochila.
async function vaciarRejilla(bot) {
  let movidos = 0
  for (let ranura = 1; ranura <= 4; ranura++) {
    const it = bot.inventory.slots[ranura]
    if (!it) continue
    const libre = bot.inventory.firstEmptyInventorySlot()
    if (libre === null) break
    try { await bot.moveSlotItem(ranura, libre); movidos += it.count } catch (_) {}
    await esperar(100)
  }
  return movidos
}
async function fabricarTablones(bot, necesarios) {
  let hechos = 0
  await vaciarRejilla(bot)
  for (let intentos = 0; cuantos(bot, 'tablones') < necesarios && intentos < 8; intentos++) {
    const tronco = bot.inventory.items().find(i => i.name.endsWith('_log'))
    if (!tronco) break
    const tablon = bot.registry.itemsByName[tronco.name.replace(/_log$/, '_planks')]
    const receta = tablon && bot.recipesFor(tablon.id, null, 1, null)[0]
    if (!receta) break
    // De uno en uno y con pausa: fabricar varios de golpe perdía troncos (quedaban en la rejilla al cerrar la ventana y caían al suelo).
    const veces = Math.min(tronco.count, Math.ceil((necesarios - cuantos(bot, 'tablones')) / 4))
    let bien = true
    for (let k = 0; k < veces && bien; k++) {
      try { await bot.craft(receta, 1, null); hechos += 4 } catch (e) { bien = false }
      await esperar(250)
    }
    if (!bien) break
  }
  await vaciarRejilla(bot)
  return hechos
}

// Un plano viejo (planos.js, un solo material) en el formato del catálogo: todos sus bloques con la paleta [materia], en su orden
const adaptar = (p, materia) => ({ id: p.nombre, nombre: p.nombre, dim: p.dim, paleta: [materia], bloques: p.bloques.map(b => [b.dx, b.dy, b.dz, 0]), viejo: true })
// El plano de una obra: el del catálogo si existe (las obras del catálogo guardan materia = null), si no el de planos.js
const planoDe = (nombre, materia) => {
  if (!materia) { const e = estructuras.cargar(nombre); if (e) return e }
  return planos.PLANOS[nombre] ? adaptar(planos.PLANOS[nombre](materia || 'tablones'), materia || 'tablones') : null
}
// Lo que falta para los bloques del catálogo que no están ya bien puestos (y el relleno), con el inventario
function faltanCatalogo(bot, plano, x0, y1, z0, relleno) {
  const colocados = new Set()
  for (const [dx, dy, dz, i] of plano.bloques) {
    const b = bot.blockAt(new Vec3(x0 + dx, y1 + dy, z0 + dz))
    if (b && b.name === estructuras.nombre(plano.paleta[i])) colocados.add(`${dx},${dy},${dz}`)
  }
  const inv = inventario(bot)
  const falta = estructuras.faltanPara(plano, colocados, inv)
  const tierra = Object.entries(inv).filter(([k]) => RELLENO.test(k)).reduce((a, [, n]) => a + n, 0)
  if (relleno && relleno.length > tierra) falta.dirt = (falta.dirt || 0) + relleno.length - tierra
  return falta
}
const frase = (falta) => Object.entries(falta).map(([k, n]) => `${n} ${k}`).join(', ')

module.exports = async function construir(bot, args, tarea) {
  const palabras = (args || []).filter(Boolean)
  const parcial = palabras.includes('parcial')
  // 2026-11-01 («continúa»): retomar=ID sigue una obra a medias en su sitio, con lo que falte, apuntando en la misma obra
  const retomar = (palabras.find(a => a.startsWith('retomar=')) || '').slice(8)
  if (retomar) return retomarObra(bot, retomar, tarea, parcial)
  const nombrePlano = palabras[0] || 'cabana'
  const nums = palabras.slice(1).filter(a => /^-?\d+$/.test(a)).map(Number)
  const catalogo = estructuras.cargar(nombrePlano)
  const materia = catalogo ? null : palabras.slice(1).find(a => /_planks$|^tablones$|^cobblestone$|^stone$|^dirt$|_log$/.test(a)) || 'tablones'
  const nombre = (palabras.find(a => a.startsWith('nombre=')) || '').slice(7) || nombrePlano
  if (!catalogo && !planos.PLANOS[nombrePlano]) return { exito: false, causa: `plano desconocido: ${nombrePlano} (hay: ${[...planos.nombres(), ...estructuras.ids()].join(', ')})` }
  // F8.1: el rectángulo de obras solo manda en el mundo del usuario (fuera, sv.puedeTocar y las zonas, como minar desde F8.0b)
  if (!mundo.reglasLibres && !obras.permitido()) return { exito: false, causa: 'sin rectángulo de obras (obras.json: permitido)' }
  if (obras.enCurso()) return { exito: false, causa: `hay una obra en curso (${obras.enCurso().id}): termínala o deshazla` }
  const plano = catalogo || adaptar(planos.PLANOS[nombrePlano](materia), materia)
  // parcela: x y z del catálogo (caja tal cual), x z (la altura la pone el suelo) o la que elija
  let e
  if (catalogo && nums.length >= 3) {
    const columnas = [...new Set(plano.bloques.filter(b => b[1] === 0).map(b => `${b[0]},${b[2]}`))].map(k => k.split(',').map(Number))
    e = parcela.evaluarCaja(bot, nums[0], nums[1], nums[2], plano.dim, columnas, { mov: prudentes(bot) })
  } else {
    e = nums.length >= 2 ? parcela.evaluar(bot, nums[0], nums[nums.length >= 3 ? 2 : 1], plano.dim, { mov: prudentes(bot) }) : await parcela.elegirParcela(bot, plano.dim, { mov: prudentes(bot) })
  }
  if (e.mal) return { exito: false, causa: (nums.length >= 2 ? 'parcela no válida: ' : 'sin parcela: ') + e.mal }
  const { x0, z0, y, relleno } = e
  // presupuesto, antes de poner nada
  let fabricados = 0
  if (catalogo) {
    const falta = faltanCatalogo(bot, plano, x0, y + 1, z0, relleno)
    if (Object.keys(falta).length && !parcial) return { exito: false, causa: `falta material: ${frase(falta)}`, plano: plano.id, origen: [x0, y + 1, z0], faltan: falta }
  } else {
    const necesarios = plano.bloques.length + relleno.length
    let tengo = cuantos(bot, materia)
    if (tengo < necesarios && materia === 'tablones') { fabricados = await fabricarTablones(bot, necesarios); tengo = cuantos(bot, materia) }
    if (tengo < necesarios) {
      const troncos = bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((a, i) => a + i.count, 0)
      return { exito: false, causa: `falta material: ${necesarios - tengo} ${materia} (tengo ${tengo}, troncos ${troncos}; hacen falta ${necesarios})`, plano: plano.nombre, origen: [x0, y + 1, z0], fabricados }
    }
  }
  const id = obras.nueva(bot.username, nombre, plano.id, [x0, y + 1, z0], materia)
  if (e.quitar && e.quitar.length) {
    const r = await quitarVegetacion(bot, e.quitar, tarea)
    if (r) { obras.cerrar(id, 'a medias'); return { exito: false, causa: r, obra: id, plano: plano.id, origen: [x0, y + 1, z0], puestos: 0 } }
  }
  return levantar(bot, { id, plano, materia, x0, z0, y, relleno, fabricados, e, parcial }, tarea)
}

async function retomarObra(bot, idObra, tarea, parcial) {
  const ob = obras.leer().obras.find(o => o.id === idObra)
  if (!ob || ob.estado === 'deshecha' || ob.estado === 'terminada') return { exito: false, causa: `no hay obra a medias ${idObra}` }
  if (obras.enCurso() && obras.enCurso().id !== ob.id) return { exito: false, causa: `hay otra obra en curso (${obras.enCurso().id})` }
  const plano = planoDe(ob.plano, ob.materia)
  if (!plano) return { exito: false, causa: `no tengo el plano ${ob.plano}` }
  const [x0, y1, z0] = ob.origen, y = y1 - 1, materia = ob.materia
  let fabricados = 0
  if (!plano.viejo) {
    const falta = faltanCatalogo(bot, plano, x0, y1, z0, [])
    if (Object.keys(falta).length && !parcial) return { exito: false, causa: `falta material: ${frase(falta)}`, plano: plano.id, origen: ob.origen, faltan: falta }
  } else {
    const faltan = plano.bloques.filter(b => { const k = bot.blockAt(new Vec3(x0 + b[0], y1 + b[1], z0 + b[2])); return !(k && deMateriaNombre(k.name, materia)) }).length
    let tengo = cuantos(bot, materia)
    if (tengo < faltan && materia === 'tablones') { fabricados = await fabricarTablones(bot, faltan); tengo = cuantos(bot, materia) }
    if (tengo < faltan) return { exito: false, causa: `falta material: ${faltan - tengo} ${materia} (tengo ${tengo}; faltan ${faltan} bloques)`, plano: plano.nombre, origen: ob.origen, fabricados }
  }
  obras.reabrir(ob.id)
  return levantar(bot, { id: ob.id, plano, materia, x0, z0, y, relleno: [], fabricados, e: { desnivel: 0, distancia: 0 }, parcial }, tarea)
}

// Quitar la hierba, las flores y la nieve de la caja antes de empezar (a mano; lo que suelten se queda en el suelo)
async function quitarVegetacion(bot, lista, tarea) {
  for (const [x, y, z] of lista) {
    if (tarea && tarea.cancelada) return 'cancelado'
    const v = new Vec3(x, y, z), b = bot.blockAt(v)
    if (!b || b.name === 'air') continue
    const r = await moverHasta(bot, new goals.GoalNear(x, y, z, 3), () => bot.entity.position.distanceTo(v.offset(0.5, 0.5, 0.5)) <= ALCANCE, { ms: 20000, tarea, mov: prudentes(bot) })
    if (r !== 'listo' && bot.entity.position.distanceTo(v) > ALCANCE + 0.5) return `no llego a quitar ${b.name} en ${x},${y},${z}`
    try { await conLimite(bot.dig(b, true), 5000) } catch (e) { return `no pude quitar ${b.name} en ${x},${y},${z}: ${e.message.slice(0, 60)}` }
    await esperar(150)
  }
  return null
}

// Poner los bloques de una obra ya apuntada (nueva o retomada), en orden, cada uno con su apoyo y su orientación
async function levantar(bot, { id, plano, materia, x0, z0, y, relleno, fabricados, e, parcial }, tarea) {
  // movimientos: prudentes y sin pisar la huella de la obra (no se encierra ni se sube a lo recién puesto)
  const mov = prudentes(bot)
  const enHuella = (x, z) => x >= x0 && x < x0 + plano.dim[0] && z >= z0 && z < z0 + plano.dim[2]
  mov.exclusionAreasStep.push(b => (b && b.position && enHuella(b.position.x, b.position.z) ? 200 : 0))
  // por capas y, en cada capa, del borde hacia dentro (2026-11-01: el techo empezaba por el centro, sin nada en que apoyarse); las del
  // catálogo con estructuras.ordenar, que además deja los dependientes (antorchas, puertas…) detrás de su soporte
  const orden = plano.viejo
    ? plano.bloques.map((b, i) => ({ b, i, borde: Math.min(b[0], plano.dim[0] - 1 - b[0], b[2], plano.dim[2] - 1 - b[2]) }))
      .sort((a, c) => a.b[1] - c.b[1] || a.borde - c.borde || a.i - c.i).map(o => o.b)
    : estructuras.ordenar(plano)
  const lista = [...relleno.map(([x, yy, z]) => ({ dest: new Vec3(x, yy, z), relleno: true })),
    ...orden.map(b => ({ dest: new Vec3(x0 + b[0], y + 1 + b[1], z0 + b[2]), estado: plano.viejo ? null : plano.paleta[b[3]] }))]
  // qué objeto lleva cada bloque y cuándo está bien puesto
  const cx = { bot, materia, catalogo: !plano.viejo, id, mov, y, enHuella }
  const malYa = new Set(((obras.leer().obras.find(o => o.id === id) || {}).mal_orientado || []).map(b => b.slice(0, 3).join()))
  const maxMs = plano.viejo ? MAX_MS : MAX_MS_CATALOGO
  const ms = Math.min(maxMs, (60 + 10 * lista.length) * 1000), t0 = Date.now()
  let puestos = 0, causa = null, ultimo = null, mal = 0
  for (const ent of lista) {
    const { dest } = ent
    if (tarea && tarea.cancelada) { causa = 'cancelado'; break }
    if (Date.now() - t0 > ms) { causa = 'tiempo agotado'; break }
    const actual = bot.blockAt(dest)
    if (actual && bienPuesto(cx, ent, actual)) { puestos++; continue } // ya estaba (una obra retomada)
    if (actual && ent.estado && malYa.has([dest.x, dest.y, dest.z].join()) && actual.name === estructuras.nombre(ent.estado)) { puestos++; continue }
    if (!parcela.libre(actual)) { causa = `ocupado en ${dest.x},${dest.y},${dest.z} (${actual ? actual.name : '?'})`; break }
    if (zonas.pasoVedado(dest.x, dest.y, dest.z) || cofres.esCofre(dest.x, dest.y, dest.z)) { causa = `protegido en ${dest.x},${dest.y},${dest.z}`; break }
    const item = itemPara(cx, ent)
    if (!item) { causa = `falta material: ${ent.estado ? estructuras.objetoDe(ent.estado).item : ent.relleno && !materia ? 'tierra o adoquín' : materia}`; break }
    const r = await ponerUno(cx, ent, item, tarea)
    if (!r.bien) { causa = `no pude colocar en ${dest.x},${dest.y},${dest.z}: ${r.error || 'sin apoyo'}`; break }
    obras.anotarPuesto(id, [dest.x, dest.y, dest.z, r.nombre])
    if (r.mal) { mal++; obras.anotarMal(id, [dest.x, dest.y, dest.z, ent.estado]) }
    ultimo = r.nombre
    puestos++
  }
  const andamio = await quitarAndamio(cx, tarea)
  const pendientes = lista.length - puestos
  const estado = pendientes === 0 ? 'terminada' : causa && causa.startsWith('falta material') ? 'falta material' : 'a medias'
  obras.cerrar(id, estado)
  const datos = { obra: id, plano: plano.viejo ? plano.nombre : plano.id, origen: [x0, y + 1, z0], puestos, pendientes, relleno: relleno.length, materia: ultimo || materia, fabricados,
    mal, andamio, pos: bot.entity.position.floored().toArray(), parcela: { desnivel: e.desnivel, distancia: e.distancia } }
  if (!plano.viejo && pendientes) datos.faltan = faltanCatalogo(bot, plano, x0, y + 1, z0, [])
  if (pendientes === 0) return { exito: true, causa: 'construido', ...datos }
  return { exito: false, causa: causa || 'a medias', ...datos }
}

// El objeto del inventario para un bloque: el relleno (la materia del plano viejo; tierra o adoquín en el catálogo), el del estado
// (estructuras.objetoDe: la antorcha de pared es «torch»…) o la materia del plano viejo
function itemPara({ bot, materia }, ent) {
  if (ent.relleno) return materia ? deMateria(bot, materia)[0] : deRelleno(bot)[0]
  if (ent.estado) { const o = estructuras.objetoDe(ent.estado); return o && bot.inventory.items().find(i => i.name === o.item) }
  return deMateria(bot, materia)[0]
}
function bienPuesto({ materia }, ent, b) {
  if (ent.relleno) return materia ? deMateriaNombre(b.name, materia) : parcela.solido(b)
  if (ent.estado) return coincide(ent.estado, real(b))
  return deMateriaNombre(b.name, materia)
}

// Poner un bloque: los apoyos de orientar (dos como mucho), desde el suelo o desde el andamio; si sale con otra orientación, se rompe y
// se prueba el siguiente apoyo; si no hay otro, se deja con aviso. Devuelve { bien, nombre, mal } o { error }.
async function ponerUno(cx, ent, item, tarea) {
  const { bot, y, mov } = cx, { dest } = ent
  const solido = (x, yy, z) => parcela.solido(bot.blockAt(new Vec3(x, yy, z)))
  const o = orientar(ent.estado || 'stone', [dest.x, dest.y, dest.z], solido)
  if (!o.apoyos.length) return { error: 'sin apoyo' }
  // muy alto (más de 3 por encima de los pies desde el suelo): andamio, solo en las del catálogo
  if (cx.catalogo && dest.y > y + 4) return ponerDesdeAndamio(cx, ent, item, o, tarea)
  let error = null
  const alto = dest.y >= y + 3 // por encima de los ojos desde el suelo (3.ª capa, techo): saltando primero, sin buscar desde dónde verlo
  if (alto) {
    const r = await ponerSaltando(bot, dest, item, mov, tarea, cx.catalogo ? o : null)
    if (r.nombre) { const v = await comprobar(cx, ent, o, 0); if (v.bien || v.mal) return v; error = v.error }
    else error = `saltando: ${r.error}`
  }
  const apoyos = alto ? [] : o.apoyos
  let rotos = 0 // con otra orientación se rompe una vez para probar otro apoyo; a la segunda se deja con aviso
  for (let k = 0; k < apoyos.length; k++) {
    const a = apoyos[k], ref = bot.blockAt(new Vec3(...a.ref))
    const meta = new goals.GoalPlaceBlock(dest, bot.world, { range: ALCANCE, LOS: true, faces: [new Vec3(-a.cara[0], -a.cara[1], -a.cara[2])] })
    const r = await moverHasta(bot, meta, () => meta.isEnd(nodo(bot)), { ms: 20000, tarea, mov })
    if (r !== 'listo') { error = `no llego a ${dest.x},${dest.y},${dest.z} (${r})`; if (r === 'cancelado') break; continue }
    try { await clic(bot, item, ref, a, o, dest) } catch (e2) { error = e2.message }
    await esperar(300)
    const v = await comprobar(cx, ent, o, k < apoyos.length - 1 && rotos === 0 ? 1 : 0)
    if (v.bien || v.mal) return v
    if (v.roto) rotos++
    error = v.error || error
    if (error && error.length > 100) error = error.slice(0, 100)
  }
  if (!alto && !(tarea && tarea.cancelada) && CARAS.some(([dx, dy, dz]) => parcela.solido(bot.blockAt(dest.offset(dx, dy, dz))))) {
    // 2026-11-01: la capa alta (3.ª de la cabaña) solo se apoya encima de la de debajo, y desde el suelo esa cara queda por
    // encima de los ojos: ningún sitio la ve («no llego»). Como un jugador: al lado, saltar y ponerla en lo alto del salto
    const r = await ponerSaltando(bot, dest, item, mov, tarea, cx.catalogo ? o : null)
    if (r.nombre) { const v = await comprobar(cx, ent, o, 0); if (v.bien || v.mal) return v; error = v.error }
    else error = `${error || 'sin apoyo visible'}; saltando: ${r.error}`
  }
  return { error }
}

// El clic: equipar, mirar (el yaw de orientar, o al bloque) y poner en el punto de la cara que da la mitad (escaleras, losas, bisagra)
async function clic(bot, item, ref, a, o, dest) {
  if (!bot.heldItem || bot.heldItem.type !== item.type) { await bot.equip(item, 'hand'); await esperar(100) }
  if (o.yaw !== null) { await bot.look(o.yaw, o.pitch, true); await esperar(100) } // el juego toma el facing del yaw del jugador
  else await bot.lookAt(dest.offset(0.5, 0.5, 0.5), true)
  await conLimite(bot._placeBlockWithOptions(ref, new Vec3(...a.cara), { delta: new Vec3(...a.delta), forceLook: 'ignore', swingArm: 'right' }), 6000)
}

// ¿Quedó como en la plantilla? Losa doble: segundo clic en la losa puesta; trampilla abierta: se abre. Con otra orientación: si quedan
// más apoyos (`otros`), se rompe para probar el siguiente; si no, se deja con aviso. Devuelve { bien, nombre, mal } o { error }.
async function comprobar(cx, ent, o, otros) {
  const { bot } = cx, { dest } = ent
  let b = bot.blockAt(dest)
  if (vacio(b)) return { error: 'no se puso' }
  if (ent.estado) {
    const quiero = estructuras.parse(ent.estado)
    if (o.clics === 2 && b.name === quiero.nombre && real(b).props.type !== 'double') {
      const it = itemPara(cx, ent)
      if (it) {
        try {
          if (!bot.heldItem || bot.heldItem.type !== it.type) { await bot.equip(it, 'hand'); await esperar(100) }
          await conLimite(bot._placeBlockWithOptions(b, new Vec3(0, real(b).props.type === 'top' ? -1 : 1, 0), { swingArm: 'right' }), 4000)
        } catch (_) {}
        await esperar(300); b = bot.blockAt(dest)
      }
    }
    if (o.abrir && b.name === quiero.nombre && String(real(b).props.open) !== 'true') { try { await bot.activateBlock(b) } catch (_) {} await esperar(300); b = bot.blockAt(dest) }
  }
  if (bienPuesto(cx, ent, b)) return { bien: true, nombre: b.name }
  if (ent.estado && b.name === estructuras.nombre(ent.estado)) {
    if (otros <= 0) return { bien: true, nombre: b.name, mal: true }
    try { await conLimite(bot.dig(b, true), 6000) } catch (_) {}
    await esperar(200)
    return { error: `salió ${JSON.stringify(real(b).props)}`, roto: true }
  }
  return { error: `salió ${b.name}` }
}

// Poner `item` en `dest` apoyado en su primer vecino sólido (el de debajo si lo hay; con `o`, el primer apoyo de orientar y su yaw),
// saltando a su lado (hasta 3 veces): el servidor no pide ver la cara, solo alcanzarla. Devuelve { nombre } del bloque o { error }.
async function ponerSaltando(bot, dest, item, mov, tarea, o) {
  const apoyo = o ? o.apoyos.map(a => ({ ref: bot.blockAt(new Vec3(...a.ref)), cara: new Vec3(...a.cara), a }))[0]
    : CARAS.map(([dx, dy, dz]) => ({ ref: bot.blockAt(dest.offset(dx, dy, dz)), cara: new Vec3(-dx, -dy, -dz) })).find(a => parcela.solido(a.ref))
  if (!apoyo) return { error: 'sin apoyo' }
  const { ref, cara } = apoyo
  // pies 2 (3.ª capa) o 3 (techo) por debajo; la meta del navegador, solo horizontal y a ≤ 2, siempre cumple esto
  const cerca = () => { const p = bot.entity.position; return Math.hypot(p.x - dest.x - 0.5, p.z - dest.z - 0.5) <= 3.2 && p.y >= dest.y - 3.6 && p.y <= dest.y - 1.4 }
  if (!cerca()) {
    // sin la exclusión de la huella: el centro del techo de la grande (10×10) solo se alcanza desde dentro, entrando por la puerta
    const r = await moverHasta(bot, new goals.GoalNearXZ(dest.x, dest.z, 2), cerca, { ms: 30000, tarea, mov: prudentes(bot) })
    if (!cerca()) return { error: `no llego al lado (${r})` }
  }
  try { bot.pathfinder.setGoal(null) } catch (_) {}
  let error = 'no se puso'
  for (let i = 0; i < 3; i++) {
    if (tarea && tarea.cancelada) return { error: 'cancelado' }
    try {
      if (!bot.heldItem || bot.heldItem.type !== item.type) { await bot.equip(item, 'hand'); await esperar(100) }
      if (o && o.yaw !== null) await bot.look(o.yaw, o.pitch, true)
      else await bot.lookAt(dest.offset(0.5, 0, 0.5), true)
      const y0 = bot.entity.position.y
      bot.setControlState('jump', true)
      for (let t = 0; t < 10; t++) { // hasta lo alto del salto (≈ 0,3 s)
        await esperar(50)
        if (bot.entity.position.y > y0 + 0.9 && bot.entity.velocity.y < 0.15) break
      }
      bot.setControlState('jump', false)
      if (o) await conLimite(bot._placeBlockWithOptions(ref, cara, { delta: new Vec3(...apoyo.a.delta), forceLook: 'ignore', swingArm: 'right' }), 3000)
      else await conLimite(bot.placeBlock(ref, cara), 3000)
    } catch (e) { error = e.message.slice(0, 80) } finally { bot.setControlState('jump', false) }
    await esperar(400)
    const b = bot.blockAt(dest)
    if (o ? !vacio(b) : b && b.boundingBox === 'block') return { nombre: b.name }
  }
  return { error }
}

// --- andamio (catálogo, más de 3 por encima de los pies) -------------------------------------------------------------------------
// Una columna de tierra o adoquín en una casilla fuera de la huella, junto al bloque; el bot sube por ella como un jugador (mirar abajo,
// saltar, poner debajo), pone desde arriba lo que alcance y, para ir a otra columna o al acabar, baja quitándola. Va a obra.andamio.
const ojos = (bot) => bot.entity.position.offset(0, 1.62, 0)
const alcanza = (bot, o) => o.apoyos.find(a => ojos(bot).distanceTo(new Vec3(a.ref[0] + a.delta[0], a.ref[1] + a.delta[1], a.ref[2] + a.delta[2])) <= ALCANCE_MANO)

async function ponerDesdeAndamio(cx, ent, item, o, tarea) {
  const { bot } = cx, { dest } = ent
  let a = cx.columna && alcanza(bot, o)
  if (!a) {
    const err = await subirColumna(cx, dest, tarea)
    if (err) return { error: `andamio: ${err}` }
    a = alcanza(bot, o)
    if (!a) return { error: 'andamio: no alcanzo desde la columna' }
  }
  try { await clic(bot, item, bot.blockAt(new Vec3(...a.ref)), a, o, dest) } catch (e) { return { error: e.message.slice(0, 100) } }
  await esperar(300)
  return comprobar(cx, ent, o, 0)
}

// La casilla del andamio para `dest`: fuera de la huella, pegada a ella por el lado más cercano, con suelo sólido debajo
function sitioColumna(cx, dest) {
  const { bot, enHuella, y } = cx
  const cands = []
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const x = dest.x + dx, z = dest.z + dz
    if (enHuella(x, z) || zonas.pasoVedado(x, y + 1, z) || cofres.esCofre(x, y + 1, z)) continue
    if (!parcela.solido(bot.blockAt(new Vec3(x, y, z))) || !parcela.libre(bot.blockAt(new Vec3(x, y + 1, z))) || !parcela.libre(bot.blockAt(new Vec3(x, y + 2, z)))) continue
    cands.push([x, z, Math.hypot(dx, dz)])
  }
  cands.sort((p, q) => p[2] - q[2])
  return cands[0] || null
}

async function subirColumna(cx, dest, tarea) {
  const { bot, id, y } = cx
  if (cx.columna) { const err = await bajarColumna(cx, tarea); if (err) return err }
  const sitio = sitioColumna(cx, dest)
  if (!sitio) return 'sin sitio fuera de la huella'
  const [x, z] = sitio
  const r = await moverHasta(bot, new goals.GoalBlock(x, y + 1, z), () => { const p = bot.entity.position.floored(); return p.x === x && p.z === z && p.y === y + 1 }, { ms: 30000, tarea, mov: prudentes(bot) })
  if (r !== 'listo') return `no llego a ${x},${y + 1},${z} (${r})`
  try { bot.pathfinder.setGoal(null) } catch (_) {}
  cx.columna = { x, z, alto: 0 }
  const meta = dest.y - 2 // los pies dos por debajo del bloque: lo de su altura y la de encima, a mano
  while (Math.floor(bot.entity.position.y) < meta) {
    if (tarea && tarea.cancelada) return 'cancelado'
    const it = deRelleno(bot)[0]
    if (!it) return 'falta material: tierra o adoquín para el andamio'
    const pies = bot.entity.position.floored(), debajo = bot.blockAt(pies.offset(0, -1, 0))
    try {
      if (!bot.heldItem || bot.heldItem.type !== it.type) { await bot.equip(it, 'hand'); await esperar(100) }
      await bot.look(bot.entity.yaw, -Math.PI / 2, true)
      bot.setControlState('jump', true)
      for (let t = 0; t < 12 && bot.entity.position.y < pies.y + 1.05; t++) await esperar(50)
      bot.setControlState('jump', false)
      await conLimite(bot._placeBlockWithOptions(debajo, new Vec3(0, 1, 0), { forceLook: 'ignore', swingArm: 'right' }), 3000)
    } catch (_) {} finally { bot.setControlState('jump', false) }
    await esperar(500)
    const puesto = bot.blockAt(pies)
    if (!puesto || !RELLENO.test(puesto.name)) return `no pude subir en ${x},${pies.y},${z}`
    obras.anotarAndamio(id, [pies.x, pies.y, pies.z, puesto.name])
    cx.columna.alto++
  }
  return null
}

// Bajar quitando la columna: picar el bloque de debajo de los pies, caer uno, y otra vez; lo que suelte se recoge al pasar
async function bajarColumna(cx, tarea) {
  const { bot, id } = cx
  const ob = obras.leer().obras.find(o => o.id === id) || {}
  const mios = new Set((ob.andamio || []).map(b => b.slice(0, 3).join()))
  for (let i = 0; i < 64; i++) {
    if (tarea && tarea.cancelada) return 'cancelado'
    const debajo = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))
    if (!debajo || !mios.has([debajo.position.x, debajo.position.y, debajo.position.z].join())) break
    const h = bot.pathfinder.bestHarvestTool(debajo)
    if (h && (!bot.heldItem || bot.heldItem.type !== h.type)) { try { await bot.equip(h, 'hand') } catch (_) {} }
    try { await conLimite(bot.dig(debajo, true), 10000) } catch (e) { return `no pude quitar el andamio: ${e.message.slice(0, 60)}` }
    obras.quitarAndamio(id, debajo.position.toArray())
    await esperar(600) // caer
  }
  cx.columna = null
  return null
}

// Al acabar (o cortarse) la obra: bajar de la columna en la que esté. Devuelve cuántos bloques de andamio quedan en pie.
async function quitarAndamio(cx, tarea) {
  if (cx.columna) await bajarColumna(cx, tarea)
  return ((obras.leer().obras.find(o => o.id === cx.id) || {}).andamio || []).length
}

module.exports.fabricarTablones = fabricarTablones // F7.2: la reutiliza fabricar (1 tronco → 4 tablones, sin mesa)
module.exports.vaciarRejilla = vaciarRejilla
module.exports.planoDe = planoDe
module.exports.RELLENO = RELLENO
