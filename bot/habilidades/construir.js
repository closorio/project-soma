// construir PLANO [x z] [materia=tablones] [nombre=…] (F6): levantar un plano pequeño (bot/planos.js: pilar, muro, plataforma,
// cabana, cabana_techada) en una parcela llana dentro del rectángulo de obras (obras.json: permitido), a ≥ 10 bloques de las zonas
// protegidas y de los cofres. Si se dan x z, es la esquina noroeste (se comprueba igual); si no, elige la parcela (bot/parcela.js).
// Antes de poner nada hace el presupuesto: si faltan tablones y lleva troncos, los fabrica (receta sin mesa, 1 tronco → 4); si aun
// así falta, no empieza («falta material: N»). Nivela solo rellenando (nunca cava). Trabaja desde fuera de la huella (no se encierra
// ni se sube a lo que pone), capa a capa, apoyando cada bloque en un vecino sólido; comprueba que el bloque aparece de verdad.
// Cada bloque puesto queda en obras.json en el acto (habilidad deshacer). Límite: 60 s + 10 s por bloque (máx. 10 min), 2 fallos
// seguidos en el mismo bloque. Devuelve { exito, causa, obra, plano, origen, puestos, pendientes, relleno, materia, pos }.
const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const zonas = require('../zonas')
const cofres = require('../cofres')
const obras = require('../obras')
const mundo = require('../mundo')
const parcela = require('../parcela')
const planos = require('../planos')
const { moverHasta, prudentes, conLimite, esperar, nodo } = require('./comun')

const ALCANCE = 4, MAX_MS = 600000
const CARAS = [[0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0]] // de dónde apoyarse: abajo, sur, norte, este, oeste, arriba

// Los objetos del inventario que sirven de materia: «tablones» = cualquier *_planks; si no, el nombre exacto del bloque.
const deMateria = (bot, materia) => bot.inventory.items().filter(i => (materia === 'tablones' ? i.name.endsWith('_planks') : i.name === materia))
const cuantos = (bot, materia) => deMateria(bot, materia).reduce((a, i) => a + i.count, 0)

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

module.exports = async function construir(bot, args, tarea) {
  const palabras = (args || []).filter(Boolean)
  const nombrePlano = palabras[0] || 'cabana'
  const nums = palabras.slice(1).filter(a => /^-?\d+$/.test(a)).map(Number)
  const materia = palabras.slice(1).find(a => /_planks$|^tablones$|^cobblestone$|^stone$|^dirt$|_log$/.test(a)) || 'tablones'
  const nombre = (palabras.find(a => a.startsWith('nombre=')) || '').slice(7) || nombrePlano
  if (!planos.PLANOS[nombrePlano]) return { exito: false, causa: `plano desconocido: ${nombrePlano} (hay: ${planos.nombres().join(', ')})` }
  // F8.1: el rectángulo de obras solo manda en el mundo del usuario (fuera, sv.puedeTocar y las zonas, como minar desde F8.0b)
  if (mundo.nombre === 'usuario' && !obras.permitido()) return { exito: false, causa: 'sin rectángulo de obras (obras.json: permitido)' }
  if (obras.enCurso()) return { exito: false, causa: `hay una obra en curso (${obras.enCurso().id}): termínala o deshazla` }
  const plano = planos.PLANOS[nombrePlano](materia)
  // parcela
  const e = nums.length >= 2 ? parcela.evaluar(bot, nums[0], nums[1], plano.dim, { mov: prudentes(bot) }) : await parcela.elegirParcela(bot, plano.dim, { mov: prudentes(bot) })
  if (e.mal) return { exito: false, causa: (nums.length >= 2 ? 'parcela no válida: ' : 'sin parcela: ') + e.mal }
  const { x0, z0, y, relleno } = e
  // presupuesto, antes de poner nada
  const necesarios = plano.bloques.length + relleno.length
  let tengo = cuantos(bot, materia), fabricados = 0
  if (tengo < necesarios && materia === 'tablones') { fabricados = await fabricarTablones(bot, necesarios); tengo = cuantos(bot, materia) }
  if (tengo < necesarios) {
    const troncos = bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((a, i) => a + i.count, 0)
    return { exito: false, causa: `falta material: ${necesarios - tengo} ${materia} (tengo ${tengo}, troncos ${troncos}; hacen falta ${necesarios})`, plano: plano.nombre, origen: [x0, y + 1, z0], fabricados }
  }
  const id = obras.nueva(bot.username, nombre, plano.nombre, [x0, y + 1, z0], materia)
  // movimientos: prudentes y sin pisar la huella de la obra (no se encierra ni se sube a lo recién puesto)
  const mov = prudentes(bot)
  const enHuella = (x, z) => x >= x0 && x < x0 + plano.dim[0] && z >= z0 && z < z0 + plano.dim[2]
  mov.exclusionAreasStep.push(b => (enHuella(b.position.x, b.position.z) ? 200 : 0))
  const lista = [...relleno.map(([x, yy, z]) => ({ dest: new Vec3(x, yy, z), relleno: true })),
    ...plano.bloques.map(b => ({ dest: new Vec3(x0 + b.dx, y + 1 + b.dy, z0 + b.dz) }))]
  const ms = Math.min(MAX_MS, (60 + 10 * lista.length) * 1000), t0 = Date.now()
  let puestos = 0, causa = null, ultimo = null
  for (const { dest } of lista) {
    if (tarea && tarea.cancelada) { causa = 'cancelado'; break }
    if (Date.now() - t0 > ms) { causa = 'tiempo agotado'; break }
    const actual = bot.blockAt(dest)
    if (actual && deMateriaNombre(actual.name, materia)) { puestos++; continue } // ya estaba (una obra retomada)
    if (!parcela.libre(actual)) { causa = `ocupado en ${dest.x},${dest.y},${dest.z} (${actual ? actual.name : '?'})`; break }
    if (zonas.pasoVedado(dest.x, dest.y, dest.z) || cofres.esCofre(dest.x, dest.y, dest.z)) { causa = `protegido en ${dest.x},${dest.y},${dest.z}`; break }
    const item = deMateria(bot, materia)[0]
    if (!item) { causa = `falta material: ${lista.length - puestos} ${materia}`; break }
    let bien = false, error = null
    for (const [dx, dy, dz] of CARAS) { // dos apoyos distintos como mucho
      const ref = bot.blockAt(dest.offset(dx, dy, dz))
      if (!parcela.solido(ref)) continue
      const cara = new Vec3(-dx, -dy, -dz)
      const meta = new goals.GoalPlaceBlock(dest, bot.world, { range: ALCANCE, LOS: true, faces: [new Vec3(dx, dy, dz)] })
      const r = await moverHasta(bot, meta, () => meta.isEnd(nodo(bot)), { ms: 20000, tarea, mov })
      if (r !== 'listo') { error = `no llego a ${dest.x},${dest.y},${dest.z} (${r})`; if (r === 'cancelado') break; continue }
      try {
        if (!bot.heldItem || bot.heldItem.type !== item.type) { await bot.equip(item, 'hand'); await esperar(100) }
        await bot.lookAt(dest.offset(0.5, 0.5, 0.5), true)
        await conLimite(bot.placeBlock(ref, cara), 6000)
      } catch (e2) { error = e2.message }
      await esperar(300)
      const b = bot.blockAt(dest)
      if (b && deMateriaNombre(b.name, materia)) { bien = true; ultimo = b.name; obras.anotarPuesto(id, [dest.x, dest.y, dest.z, b.name]); break }
      if (error && error.length > 100) error = error.slice(0, 100)
    }
    if (!bien) { causa = `no pude colocar en ${dest.x},${dest.y},${dest.z}: ${error || 'sin apoyo'}`; break }
    puestos++
  }
  const pendientes = lista.length - puestos
  const estado = pendientes === 0 ? 'terminada' : causa && causa.startsWith('falta material') ? 'falta material' : 'a medias'
  obras.cerrar(id, estado)
  const datos = { obra: id, plano: plano.nombre, origen: [x0, y + 1, z0], puestos, pendientes, relleno: relleno.length, materia: ultimo || materia, fabricados,
    pos: bot.entity.position.floored().toArray(), parcela: { desnivel: e.desnivel, distancia: e.distancia } }
  if (pendientes === 0) return { exito: true, causa: 'construido', ...datos }
  return { exito: false, causa: causa || 'a medias', ...datos }
}
const deMateriaNombre = (nombre, materia) => (materia === 'tablones' ? nombre.endsWith('_planks') : nombre === materia)
module.exports.fabricarTablones = fabricarTablones // F7.2: la reutiliza fabricar (1 tronco → 4 tablones, sin mesa)
module.exports.vaciarRejilla = vaciarRejilla
