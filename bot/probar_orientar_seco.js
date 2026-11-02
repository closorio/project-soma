// Prueba en seco de orientar (2026-11-02): la tabla estado → { apoyos, yaw, delta, clics, abrir } de escaleras, losas, puertas,
// trampillas, antorchas, troncos, botones, camas y cofres en las 4 direcciones, y coincide(). Sin bot.
// Uso: node bot/probar_orientar_seco.js
const { orientar, coincide, YAW } = require('./habilidades/orientar')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }
const D = [10, 64, 10]
const todo = () => true // todos los vecinos sólidos
const solo = (...vs) => (x, y, z) => vs.some(v => v[0] === x - D[0] && v[1] === y - D[1] && v[2] === z - D[2]) // solo esos vecinos (relativos)
const rel = (a) => a.ref.map((c, i) => c - D[i]).join()
const DIRS = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] }
const OP = { north: 'south', south: 'north', west: 'east', east: 'west' }

// el yaw de mineflayer apunta hacia el vector: x = -sin(yaw), z = -cos(yaw)
for (const [f, v] of Object.entries(DIRS)) ok(Math.round(-Math.sin(YAW[f])) === v[0] && Math.round(-Math.cos(YAW[f])) === v[2], `YAW ${f}`)

for (const f of Object.keys(DIRS)) {
  // escaleras: miran hacia donde mira el jugador; la mitad, por la cara (arriba/abajo) o la altura del clic en un lado
  const ab = orientar(`oak_stairs[facing=${f},half=bottom,shape=straight]`, D, todo)
  ok(ab.yaw === YAW[f] && rel(ab.apoyos[0]) === '0,-1,0' && ab.apoyos[1].delta[1] === 0.25, `escalera ${f} abajo`)
  const ar = orientar(`oak_stairs[facing=${f},half=top,shape=straight]`, D, todo)
  ok(ar.yaw === YAW[f] && rel(ar.apoyos[0]) === '0,1,0' && ar.apoyos[0].cara.join() === '0,-1,0' && ar.apoyos[1].delta[1] === 0.75, `escalera ${f} arriba`)
  // puertas: desde abajo y con la bisagra por el punto del clic (DoorBlock.getHinge)
  for (const hinge of ['left', 'right']) {
    const p = orientar(`oak_door[facing=${f},half=lower,hinge=${hinge},open=false,powered=false]`, D, todo)
    const [j, , k] = DIRS[f], [d0, , d1] = p.apoyos[0].delta
    const derecha = (j < 0 && d1 < 0.5) || (j > 0 && d1 > 0.5) || (k < 0 && d0 > 0.5) || (k > 0 && d0 < 0.5)
    ok(p.yaw === YAW[f] && p.apoyos.length === 1 && rel(p.apoyos[0]) === '0,-1,0' && derecha === (hinge === 'right'), `puerta ${f} ${hinge}`)
  }
  // trampillas: clic en la cara del bloque de detrás (la que mira hacia facing), mitad por la altura; abierta → abrir
  const t = orientar(`oak_trapdoor[facing=${f},half=top,open=true,powered=false,waterlogged=false]`, D, todo)
  const atras = DIRS[OP[f]].join()
  ok(rel(t.apoyos[0]) === atras && t.apoyos[0].cara.join() === DIRS[f].join() && t.apoyos[0].delta[1] === 0.75 && t.abrir, `trampilla ${f} alta abierta`)
  ok(rel(t.apoyos[1]) === '0,1,0' && t.yaw === YAW[OP[f]], `trampilla ${f}: desde arriba, el jugador mira al contrario`)
  // antorcha de pared: apoyo detrás; y si no hay bloque detrás, sin apoyos (no se pone en otro sitio)
  const a = orientar(`wall_torch[facing=${f}]`, D, todo)
  ok(a.apoyos.length === 1 && rel(a.apoyos[0]) === atras && a.yaw === null, `antorcha de pared ${f}`)
  ok(orientar(`wall_torch[facing=${f}]`, D, solo([0, -1, 0])).apoyos.length === 0, `antorcha de pared ${f} sin pared`)
  // cofres y hornos: miran al jugador
  ok(orientar(`chest[facing=${f},type=single,waterlogged=false]`, D, todo).yaw === YAW[OP[f]], `cofre ${f}`)
  ok(orientar(`furnace[facing=${f},lit=false]`, D, todo).yaw === YAW[OP[f]], `horno ${f}`)
  // camas: pie desde abajo, mirando hacia facing
  const c = orientar(`red_bed[facing=${f},occupied=false,part=foot]`, D, todo)
  ok(c.yaw === YAW[f] && c.apoyos.length === 1 && rel(c.apoyos[0]) === '0,-1,0', `cama ${f}`)
  // botón de techo: desde arriba, con el yaw de facing; de pared: detrás
  const b = orientar(`stone_button[face=ceiling,facing=${f},powered=false]`, D, todo)
  ok(b.apoyos.length === 1 && rel(b.apoyos[0]) === '0,1,0' && b.yaw === YAW[f], `botón de techo ${f}`)
  ok(rel(orientar(`stone_button[face=wall,facing=${f},powered=false]`, D, todo).apoyos[0]) === atras, `botón de pared ${f}`)
}
console.log('  escaleras, puertas (2 bisagras), trampillas, antorchas, cofres, hornos, camas y botones en las 4 direcciones')

// losas: abajo / arriba / doble (dos clics)
const lb = orientar('oak_slab[type=bottom,waterlogged=false]', D, todo), lt = orientar('oak_slab[type=top,waterlogged=false]', D, todo)
ok(rel(lb.apoyos[0]) === '0,-1,0' && lb.apoyos[1].delta[1] === 0.25 && lb.clics === 1, 'losa abajo')
ok(rel(lt.apoyos[0]) === '0,1,0' && lt.apoyos[1].delta[1] === 0.75, 'losa arriba')
ok(orientar('oak_slab[type=double,waterlogged=false]', D, todo).clics === 2, 'losa doble: dos clics')
// la losa alta sin nada encima: por un lado, en la mitad alta
const lt2 = orientar('oak_slab[type=top,waterlogged=false]', D, solo([1, 0, 0]))
ok(lt2.apoyos.length === 1 && rel(lt2.apoyos[0]) === '1,0,0' && lt2.apoyos[0].delta[1] === 0.75, 'losa arriba apoyada en un lado')
// troncos: la cara del eje
ok(orientar('oak_log[axis=y]', D, todo).apoyos.map(rel).join(' ') === '0,-1,0 0,1,0', 'tronco vertical')
ok(orientar('oak_log[axis=x]', D, todo).apoyos.map(rel).join(' ') === '-1,0,0 1,0,0', 'tronco tumbado en x')
ok(orientar('oak_log[axis=z]', D, solo([0, -1, 0])).apoyos.length === 0, 'tronco en z sin vecinos en z: sin apoyo')
// antorcha de suelo, farol colgante, cristal y tolva
ok(rel(orientar('torch', D, todo).apoyos[0]) === '0,-1,0' && orientar('torch', D, todo).apoyos.length === 1, 'antorcha de suelo')
ok(rel(orientar('lantern[hanging=true,waterlogged=false]', D, todo).apoyos[0]) === '0,1,0', 'farol colgante')
ok(orientar('glass', D, todo).apoyos.length === 6 && orientar('glass', D, todo).yaw === null, 'cristal: cualquier apoyo')
ok(rel(orientar('hopper[enabled=true,facing=east]', D, todo).apoyos[0]) === '1,0,0', 'tolva hacia el este: clic en el bloque del este')
console.log('  losas (abajo, arriba, doble), troncos por eje, antorcha de suelo, farol, cristal y tolva')

// coincide: nombre y props clave; la rotación y waterlogged no cuentan
const real = (estado) => { const [, n, p] = /^([a-z_]+)(?:\[(.*)\])?$/.exec(estado); return { nombre: n, props: Object.fromEntries((p || '').split(',').filter(Boolean).map(kv => kv.split('='))) } }
ok(coincide('oak_stairs[facing=north,half=top,shape=straight]', real('oak_stairs[facing=north,half=top,shape=inner_left,waterlogged=false]')), 'coincide: la forma de la escalera no cuenta')
ok(!coincide('oak_stairs[facing=north,half=top]', real('oak_stairs[facing=north,half=bottom]')), 'coincide: half sí cuenta')
ok(coincide('oak_planks', real('spruce_planks')) && !coincide('oak_planks', real('stone')), 'coincide: la madera da igual; el material, no')
ok(coincide('oak_sign[rotation=4]', real('oak_sign[rotation=9]')), 'coincide: la rotación no cuenta')
ok(coincide('oak_trapdoor[facing=east,half=top,open=true]', { nombre: 'oak_trapdoor', props: { facing: 'east', half: 'top', open: true } }), 'coincide: props booleanas de prismarine-block')
console.log('  coincide')

console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
