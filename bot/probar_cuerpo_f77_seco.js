// Prueba en seco de los arreglos del cuerpo tras la medición de F7.7 (sin servidor ni red), con el cuerpo de mentira de
// probar_habilidades_sv_seco.js. Va en el mundo de supervivencia y no escribe nada real (obras.json se sustituye en memoria).
// 1. minar: no pica piedra enterrada ni lo que no se ve; sí la expuesta; lo que caería más de 3 bloques, no.
// 2. recoger: en supervivencia los inalcanzados duran 1 min y «otra_vez» los vuelve a intentar.
// 3. pozo de arena: refugiarse no cava donde no tendría con qué tapar; salir_del_refugio sube con arena o grava.
// Uso: node bot/probar_cuerpo_f77_seco.js   (sale con 1 si falla algo)
process.env.IO_SERVIDOR = 'supervivencia'
const { Vec3 } = require('vec3')
const { cuerpo, caja } = require('./probar_habilidades_sv_seco')
const obras = require('./obras')

let pruebas = 0, fallos = 0
const ok = (c, m) => { pruebas++; if (!c) { fallos++; console.log('  FALLA ' + m) } else console.log('  bien  ' + m) }
const tarea = () => ({ cancelada: false })

async function principal() {
  // obras.json en memoria: nada real cambia
  const minados = []
  obras.permitido = () => ({ x1: -1e6, z1: -1e6, x2: 1e6, z2: 1e6 })
  obras.enPermitido = () => true
  obras.esDeObra = () => false
  obras.anotarMinado = (...a) => minados.push(a)
  const minar = require('./habilidades/minar')
  const recoger = require('./habilidades/recoger')
  const H = require('./habilidades').HABILIDADES

  console.log('1 · minar')
  const conPico = (opts) => {
    const bb = cuerpo({ inventario: [['wooden_pickaxe', 1]], ...opts })
    bb.pathfinder.bestHarvestTool = () => bb.inventory.items().find(i => i.name === 'wooden_pickaxe')
    return bb
  }
  // piedra enterrada: a 2 bloques, detrás de la tierra (todo lo de alrededor es sólido)
  let bb = conPico({ bloques: { '2,62,0': 'stone' } })
  let r = await minar(bb, ['stone', '1'], tarea())
  ok(!r.exito && bb.picados.length === 0 && r.descartados.oculto >= 1, `piedra enterrada: no la pica (${r.causa}, oculto ${r.descartados.oculto})`)
  // piedra expuesta en el suelo, a 2 bloques: la pica (hoyo de 1 abierto por arriba)
  bb = conPico({ bloques: { '2,63,0': 'stone' } })
  bb._puestos.set('2,64,0', 'air')
  r = await minar(bb, ['stone', '1'], tarea())
  ok(r.exito && bb.picados.some(([x, y, z, n]) => x === 2 && y === 63 && n === 'stone'), `piedra a la vista en el suelo: la pica (${r.causa})`)
  // piedra con una cara al aire pero tapada desde el ojo: un muro de tierra entre medias
  const muro = caja({}, [1, 1], [64, 66], [-2, 2], 'dirt'); muro['3,64,0'] = 'stone'
  ok(!minar.visible(conPico({ bloques: muro }), new Vec3(3, 64, 0)), 'piedra a la vista del aire pero detrás de un muro: no se ve')
  ok(minar.visible(conPico({ bloques: { '3,64,0': 'stone' } }), new Vec3(3, 64, 0)), 'sin el muro, sí se ve')
  // piedra sobre un hueco hondo (lo que suelta caería 5 bloques): no
  const hondo = caja({}, [3, 3], [57, 62], [0, 0], 'air'); hondo['3,63,0'] = 'stone'; hondo['3,64,0'] = 'air'
  bb = conPico({ bloques: hondo })
  r = await minar(bb, ['stone', '1'], tarea())
  ok(!r.exito && r.descartados.hondo >= 1 && bb.picados.length === 0, `piedra sobre un hueco de 6: no la pica (hondo ${r.descartados.hondo})`)
  ok(minados.length === 1, `solo queda anotado lo picado (${minados.length})`)

  console.log('2 · recoger')
  bb = cuerpo({ entidades: [{ name: 'item', pos: [5.5, 64, 0.5], objeto: 'cobblestone' }] })
  const e = Object.values(bb.entities).find(x => x.name === 'item')
  require('./memoria')(bb, 'inalcanzados', () => new Map()).set(e.id, Date.now() - 70000)
  ok(!recoger.inalcanzado(bb, e), 'en supervivencia, un inalcanzado de hace 70 s ya no cuenta (antes, 3 min)')
  require('./memoria')(bb, 'inalcanzados').set(e.id, Date.now())
  ok(recoger.inalcanzado(bb, e), 'uno de ahora sí')
  r = await recoger(bb, ['8'], tarea())
  ok(!r.exito && r.causa === 'no llegó' && recoger.inalcanzado(bb, e), `sin «otra_vez» no lo intenta (${r.causa})`)
  let intentado = false
  bb.pathfinder.goto = async () => { intentado = true }
  r = await recoger(bb, ['8', 'otra_vez'], tarea())
  ok(intentado, `con «otra_vez» (la orden «recoge») lo vuelve a intentar (${r.causa})`)

  console.log('3 · pozo de arena')
  const arena = caja({}, [-8, 8], [58, 63], [-8, 8], 'sand')
  bb = cuerpo({ bloques: arena })
  const pc = require('./habilidades/refugiarse').planCavar(bb, new Vec3(0, 64, 0))
  ok(pc.mal === 'sin bloques para tapar', `en arena sin bloques: no cava (${pc.mal})`)
  r = await H.refugiarse(bb, [], tarea())
  ok(!r.exito && bb.picados.length === 0, `refugiarse en arena sin bloques: no pica nada (${r.causa})`)
  bb = cuerpo({ bloques: arena, inventario: [['dirt', 1]] })
  ok(!require('./habilidades/refugiarse').planCavar(bb, new Vec3(0, 64, 0)).mal, 'en arena con 1 de tierra para la tapa: sí cava')
  ok(!require('./habilidades/refugiarse').planCavar(cuerpo(), new Vec3(0, 64, 0)).mal, 'en tierra sin bloques: sí cava (la tierra que saca tapa la boca)')
  // en el fondo de un pozo de arena de 2, sin colocables y con arena: sube con la arena
  const pozo = caja({}, [-3, 3], [58, 63], [-3, 3], 'sand'); pozo['0,62,0'] = 'air'; pozo['0,63,0'] = 'air'
  bb = cuerpo({ bloques: pozo, pos: [0.5, 62, 0.5], inventario: [['sand', 3]] })
  const salir = require('./habilidades/salir_del_refugio')
  ok(salir.enPozo(bb) && salir.paraSubir(bb).map(i => i.name).join() === 'sand', 'en el pozo, sin colocables: sube con arena')
  bb._placeBlockWithOptions = async (ref, cara) => { await bb.placeBlock(ref, cara); bb.entity.position.y = Math.floor(bb.entity.position.y) + 1 }
  r = await H.salir_del_refugio(bb, [], tarea())
  ok(r.exito && r.causa === 'fuera' && r.puestos.length === 2, `sale del pozo de arena con 2 de arena (${r.causa}, puestos ${r.puestos.length})`)

  console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
  process.exit(fallos ? 1 : 0)
}
principal().catch(e => { console.error(e); process.exit(1) })
