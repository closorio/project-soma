// Prueba en seco del catálogo de estructuras (2026-11-02): arma en memoria un .litematic sintético (dos regiones, una de tamaño negativo,
// paleta de 5 → 3 bits con valores que cruzan el límite de un long, escaleras, puerta de dos mitades, losa doble y antorcha de pared),
// lo importa y comprueba la vuelta bloque a bloque, los materiales, el orden de colocación y el catálogo. No toca bot/estructuras/.
// Uso: node bot/probar_estructuras_seco.js
const fs = require('fs'), os = require('os'), path = require('path')
const registry = require('minecraft-data')('1.21.11')
const estructuras = require('./estructuras')
const imp = require('../herramientas/importar_estructura')
const sint = require('../herramientas/litematic_sintetico')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }

// --- el .litematic sintético ---------------------------------------------------------------------------------------------------
const estadoDe = ([nombre, props]) => imp.estadoDe({ Name: 'minecraft:' + nombre, Properties: props })
const PUERTA = { facing: 'north', hinge: 'left', open: 'false', powered: 'false' }
const AIRE = ['air'], TABLON = ['oak_planks'], ESCALERA = ['oak_stairs', { facing: 'east', half: 'top' }]
const BAJA = ['oak_door', { ...PUERTA, half: 'lower' }], ALTA = ['oak_door', { ...PUERTA, half: 'upper' }]
const LOSA = ['oak_slab', { type: 'double' }], ANTORCHA = ['wall_torch', { facing: 'west' }], PIEDRA = ['stone']
const FAROL = ['lantern', { hanging: 'true', waterlogged: 'false' }]

const esperado = new Map() // "x,y,z" absoluta → estado, lo que el importador tiene que devolver
const { litematic } = sint
// una región que apunta en `esperado` cada bloque que se pone (el armador está en herramientas/litematic_sintetico.js)
const region = (pos, size, paleta) => sint.region(pos, size, paleta, (x, y, z, i) => {
  if (i) esperado.set(`${x},${y},${z}`, estadoDe(paleta[i])); else esperado.delete(`${x},${y},${z}`)
})

// Región A: 5×4×4 en (10, 5, 20); paleta de 5 → 3 bits. Región B: Size negativo, Position en la esquina opuesta; paleta de 5 → 3 bits
const A = region([10, 5, 20], [5, 4, 4], [AIRE, TABLON, ESCALERA, BAJA, ALTA])
for (let x = 10; x <= 14; x++) for (let z = 20; z <= 23; z++) {
  A.poner(x, 5, z, 1) // suelo
  if (x === 10 || x === 14 || z === 20 || z === 23) A.poner(x, 6, z, 1) // muro
}
A.poner(12, 6, 20, 3); A.poner(12, 7, 20, 4) // la puerta, por el norte
A.poner(11, 6, 23, 2); A.poner(13, 6, 23, 2) // dos escaleras boca abajo en el muro sur
for (const [x, z] of [[10, 20], [14, 20], [10, 23], [14, 23]]) A.poner(x, 7, z, 1)
const B = region([19, 5, 23], [-3, 2, -2], [AIRE, LOSA, ANTORCHA, PIEDRA, FAROL]) // x 17..19, y 5..6, z 22..23
B.poner(17, 5, 22, 1); B.poner(17, 5, 23, 1) // losas dobles
B.poner(19, 5, 22, 3); B.poner(19, 6, 22, 3); B.poner(18, 6, 22, 2) // pilar de piedra con una antorcha de pared pegada a él
B.poner(19, 6, 23, 3); B.poner(19, 5, 23, 4) // un farol colgado de un bloque de la capa de arriba
ok(A.valores[21] === 1, 'el índice 21 de A (bits 63-65) es no nulo: el valor cruza el límite del primer long')

// --- 1. la vuelta ---------------------------------------------------------------------------------------------------------------
const { estructura: e, materiales: m } = imp.importar(litematic([A, B]), { id: 'casita', alias: ['la casita'], fuente: 'sintetico.litematic', registry })
ok(e.dim.join() === '10,4,4', `dim = ${e.dim}`)
const origen = [10, 5, 20]
const vuelta = new Map(e.bloques.map(([dx, dy, dz, i]) => [`${dx + origen[0]},${dy + origen[1]},${dz + origen[2]}`, e.paleta[i]]))
ok(vuelta.size === e.bloques.length, 'hay casillas repetidas')
ok(vuelta.size === esperado.size, `bloques: ${vuelta.size} ≠ ${esperado.size}`)
let distintos = 0
for (const [k, s] of esperado) if (vuelta.get(k) !== s) { distintos++; if (distintos < 4) console.log(`    ${k}: esperaba ${s}, salió ${vuelta.get(k)}`) }
ok(distintos === 0, `${distintos} bloques distintos tras la vuelta`)
ok(e.bloques.every(([dx, dy, dz]) => dx >= 0 && dy >= 0 && dz >= 0 && dx < 10 && dy < 4 && dz < 4), 'bloques fuera de la caja')
ok(e.bloques.every(b => !/^(cave_|void_)?air/.test(e.paleta[b[3]])), 'el aire no se guarda')
ok(e.paleta.includes('oak_stairs[facing=east,half=top]') && e.paleta.includes('wall_torch[facing=west]'), 'la paleta no lleva el estado normalizado')
console.log(`  vuelta: ${vuelta.size} bloques de 2 regiones (una con Size negativo, 3 bits) iguales a los puestos`)

// --- 2. materiales --------------------------------------------------------------------------------------------------------------
const cuenta = (n) => [...esperado.values()].filter(s => estructuras.nombre(s) === n).length
const mat = {
  oak_planks: cuenta('oak_planks'), oak_stairs: 2, oak_door: 1, oak_slab: 2 * 2, torch: 1, stone: 3, lantern: 1, // puerta: solo la mitad baja; losa doble = 2
}
ok(JSON.stringify(Object.entries(e.materiales).sort()) === JSON.stringify(Object.entries(mat).sort()), `materiales: ${JSON.stringify(e.materiales)}`)
ok(JSON.stringify(m.materiales) === JSON.stringify(e.materiales) && m.nombre === 'casita', 'el archivo de materiales no coincide con el de la estructura')
ok(e.sinConseguir.length === 0, 'nada sin conseguir en la casita')
ok(estructuras.objetoDe('oak_door[half=upper,facing=north]') === null && estructuras.objetoDe('red_bed[part=head,facing=north]') === null, 'las mitades altas no se cuentan')
ok(estructuras.objetoDe('redstone_wire[power=3]').item === 'redstone' && estructuras.objetoDe('spruce_wall_sign[facing=east]').item === 'spruce_sign', 'redstone / cartel de pared')
ok(estructuras.objetoDe('water[level=0]').item === 'water_bucket' && estructuras.objetoDe('water[level=3]') === null, 'solo la fuente de agua cuenta')
ok(estructuras.objetoDe('grass_block[snowy=false]').item === 'dirt' && estructuras.objetoDe('cave_air') === null, 'grass_block → dirt, aire sin objeto')
ok(JSON.stringify(estructuras.objetosDe('potted_azalea_bush')) === JSON.stringify([{ item: 'flower_pot', n: 1 }, { item: 'azalea', n: 1 }]), 'maceta con planta = maceta + planta')
ok(estructuras.objetoDe('wheat[age=7]').item === 'wheat_seeds' && estructuras.objetoDe('tripwire[attached=true]').item === 'string', 'cultivos e hilo')
ok(estructuras.sinConseguir('oak_leaves[distance=1]') && estructuras.sinConseguir('spawner') && !estructuras.sinConseguir('oak_log[axis=y]'), 'sinConseguir')
console.log('  materiales: puerta 1, losa doble 2, antorcha de pared → torch; reglas de objetoDe')

// --- 3. el orden ----------------------------------------------------------------------------------------------------------------
const orden = estructuras.ordenar(e)
const pos = (x, y, z) => orden.findIndex(b => b[0] === x && b[1] === y && b[2] === z)
const alta = e.bloques.filter(b => e.paleta[b[3]].includes('half=upper')).length
ok(orden.length === e.bloques.length - alta, `la mitad alta de la puerta no se coloca (${orden.length} de ${e.bloques.length})`)
const colgado = (b) => e.paleta[b[3]].includes('hanging=true')
const sinColgar = orden.filter(b => !colgado(b))
ok(sinColgar.every((b, i) => i === 0 || sinColgar[i - 1][1] <= b[1]), 'las capas no van de abajo arriba')
ok(pos(9, 0, 3) > pos(9, 1, 3) && pos(9, 1, 3) >= 0, 'el farol colgante va después del bloque de arriba que lo sostiene')
ok(pos(8, 1, 2) > pos(9, 1, 2) && pos(9, 1, 2) >= 0, 'la antorcha va después de su pilar de piedra')
ok(pos(2, 1, 0) > pos(2, 0, 0) && pos(2, 1, 0) >= 0, 'la puerta va después del suelo que la sostiene')
ok(pos(2, 2, 0) === -1, 'la mitad alta de la puerta no sale en el orden')
const dependiente = (b) => /torch|door|lantern/.test(e.paleta[b[3]])
let capaOk = true
for (let dy = 0; dy < 4; dy++) {
  const c = orden.filter(b => b[1] === dy && !colgado(b)), ult = c.map(dependiente).lastIndexOf(false), pri = c.map(dependiente).indexOf(true)
  if (pri !== -1 && ult > pri) capaOk = false
}
ok(capaOk, 'en una capa, los dependientes van detrás de los bloques completos')
const borde = (b) => Math.min(b[0], 9 - b[0], b[2], 3 - b[2])
const capa0 = orden.filter(b => b[1] === 0 && !dependiente(b))
ok(capa0.every((b, i) => i === 0 || borde(capa0[i - 1]) <= borde(b)), 'en la capa 0, del borde hacia dentro')
console.log('  orden: por capas, completos del borde al centro y dependientes después de su soporte')

// --- 4. lo que falta ------------------------------------------------------------------------------------------------------------
ok(JSON.stringify(Object.entries(estructuras.faltanPara(e, new Set(), {})).sort()) === JSON.stringify(Object.entries(e.materiales).sort()), 'faltanPara sin nada = materiales')
ok(Object.keys(estructuras.faltanPara(e, new Set(), { ...mat, oak_planks: 999 })).length === 0, 'con todo en la mochila no falta nada')
const todos = new Set(e.bloques.map(b => b.slice(0, 3).join()))
ok(Object.keys(estructuras.faltanPara(e, todos, {})).length === 0, 'con todo colocado no falta nada')
const f = estructuras.faltanPara(e, new Set(), { oak_planks: 10, oak_door: 1 })
ok(f.oak_planks === mat.oak_planks - 10 && f.oak_door === undefined && f.torch === 1, `faltanPara descuenta la mochila: ${JSON.stringify(f)}`)
console.log('  faltanPara: descuenta lo colocado y la mochila')

// --- 5. nombre desconocido y catálogo en disco -----------------------------------------------------------------------------------
const MAL = region([0, 0, 0], [2, 1, 1], [AIRE, ['oak_plankz'], ['otro_bloque_raro']])
MAL.valores[0] = 1; MAL.valores[1] = 2
let msg = ''
try { imp.importar(litematic([MAL]), { id: 'mal', registry }) } catch (err) { msg = err.message }
ok(/oak_plankz/.test(msg) && /otro_bloque_raro/.test(msg), `error con la lista de nombres: «${msg}»`)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estructuras-'))
estructuras.DIR = path.join(tmp, 'estructuras')
imp.escribir({ estructura: e, materiales: m }, estructuras.DIR, tmp)
ok(JSON.stringify(estructuras.cargar('casita')) === JSON.stringify(e), 'cargar no devuelve lo escrito')
ok(JSON.stringify(JSON.parse(fs.readFileSync(path.join(tmp, 'casita.json'), 'utf8'))) === JSON.stringify(m), 'el archivo de materiales no se escribió igual')
ok(estructuras.ids().join() === 'casita' && estructuras.cargar('nada') === null, 'ids / cargar de una que no existe')
ok(estructuras.porAlias('La Casita') === 'casita' && estructuras.porAlias('casita') === 'casita' && estructuras.porAlias('palacio') === null, 'porAlias')
ok(estructuras.listar()[0].startsWith('casita  10×4×4  '), `listar: ${estructuras.listar()[0]}`)
ok(estructuras.cargar('casita') === estructuras.cargar('casita'), 'cargar relee un archivo que no ha cambiado')
const otra = { ...e, alias: ['casa nueva'] }
fs.writeFileSync(path.join(estructuras.DIR, 'casita.json'), imp.serializar(otra) + ' ') // distinto tamaño: cuenta como cambiado
ok(estructuras.porAlias('casa nueva') === 'casita' && estructuras.porAlias('la casita') === null, 'cargar no ve el archivo cambiado')
// una lista de materiales escrita a mano no se pisa sin forzar; una importada, sí
fs.writeFileSync(path.join(tmp, 'casita.json'), JSON.stringify({ nombre: 'a mano', materiales: { stone: 1 } }))
let pisa = ''
try { imp.escribir({ estructura: e, materiales: m }, estructuras.DIR, tmp) } catch (err) { pisa = err.message }
ok(/a mano/.test(pisa) && JSON.parse(fs.readFileSync(path.join(tmp, 'casita.json'), 'utf8')).nombre === 'a mano', 'pisa una lista escrita a mano')
imp.escribir({ estructura: e, materiales: m }, estructuras.DIR, tmp, true)
imp.escribir({ estructura: e, materiales: m }, estructuras.DIR, tmp)
ok(JSON.parse(fs.readFileSync(path.join(tmp, 'casita.json'), 'utf8')).importado === true, 'con forzar o sobre una importada, se escribe')
fs.rmSync(tmp, { recursive: true, force: true })
console.log('  catálogo: error con la lista, escribir sin pisar lo hecho a mano, cargar con caché, ids, alias y listar')

// --- 6. .litematic reales (catalogo/pruebas/, de schematic4j) -------------------------------------------------------------------
const REAL = path.join(__dirname, '..', 'catalogo', 'pruebas')
const V = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }
const real = (f) => imp.importar(fs.readFileSync(path.join(REAL, f)), { id: f.split('.')[0], registry }).estructura
const casillas = (r) => new Map(r.bloques.map(b => [b.slice(0, 3).join(), r.paleta[b[3]]]))
const s = real('simple.litematic'), sm = casillas(s) // Size con y y z negativas
ok(s.dim.join() === '5,5,5' && s.bloques.length === 101, `simple: ${s.dim} ${s.bloques.length}`)
const puertas = s.bloques.filter(b => /_door\[.*half=lower/.test(s.paleta[b[3]]))
ok(puertas.length === 1 && puertas.every(b => /half=upper/.test(sm.get([b[0], b[1] + 1, b[2]].join()) || '')), 'simple: la mitad alta de la puerta no está encima de la baja (eje y)')
const izq = s.bloques.find(b => /chest\[facing=north,type=left/.test(s.paleta[b[3]]))
ok(izq && /type=right/.test(sm.get([izq[0] + 1, izq[1], izq[2]].join()) || ''), 'simple: el cofre doble no está unido (eje x)')
const g = real('mansion.litematic'), gm = casillas(g) // Size con z negativa, MC 1.16
ok(g.dim.join() === '39,41,40' && (g.renombrados || []).includes('grass → short_grass'), `mansion: ${g.dim}, renombrados ${g.renombrados}`)
const trampillas = g.bloques.filter(b => /_trapdoor\[.*open=true/.test(g.paleta[b[3]]))
const sinApoyo = trampillas.filter(b => { const v = V[estructuras.props(g.paleta[b[3]]).facing]; return !gm.has([b[0] - v[0], b[1], b[2] - v[1]].join()) })
ok(trampillas.length > 50 && sinApoyo.length === 0, `mansion: ${sinApoyo.length} de ${trampillas.length} trampillas abiertas sin su bloque detrás (ejes x y z)`)
const go = estructuras.ordenar(g), gi = new Map(go.map((b, i) => [b.slice(0, 3).join(), i]))
const faroles = go.filter(b => /lantern\[hanging=true/.test(g.paleta[b[3]]))
ok(faroles.length > 0 && faroles.every(b => gi.get([b[0], b[1] + 1, b[2]].join()) < gi.get(b.slice(0, 3).join())), 'mansion: un farol colgante va antes que su techo')
console.log(`  reales: simple (y, z negativas) y mansion (z negativa, 1.16): puertas, cofre doble, ${trampillas.length} trampillas y ${faroles.length} faroles en su sitio`)

console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
