// Prueba en seco de las zonas de obras de carteles (2026-11-02): leer «[obras] NOMBRE», emparejar dos carteles en un rectángulo,
// construir solo dentro de ellas en cualquier mundo (y del rectángulo de obras en el del usuario), y quitarlas cuando falta un cartel.
// Sobre un obras.json temporal (no toca los datos de ningún mundo). Uso: node bot/probar_carteles_seco.js
const fs = require('fs'), os = require('os'), path = require('path')
const mundo = require('./mundo')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carteles-'))
mundo.obras = path.join(tmp, 'obras.json') // antes de cargar obras.js, que lee la ruta al cargarse
const obras = require('./obras')
const carteles = require('./carteles')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }

// 1. el texto de un cartel (las dos caras, líneas con \n)
ok(carteles.marca('[obras]\nNorte\n\n\n') === 'norte', 'marca con nombre')
ok(carteles.marca('[ Obra ]\nCampo de Trigo') === 'campo_de_trigo', 'marca con espacios y mayúsculas')
ok(carteles.marca('[obras]\n\n\n\n') === 'obras' && carteles.marca('hola\n[obras]\nsur') === 'sur', 'sin nombre / no en la primera línea')
ok(carteles.marca('se vende\ncasa') === null && carteles.marca('') === null, 'un cartel cualquiera no es de obras')
ok(carteles.marca('\n\n\n\n\n[obras]\neste\n\n') === 'este', 'por la cara de atrás')
console.log('  leer la marca de un cartel')

// 2. emparejar: dos con el mismo nombre forman zona; uno o tres, sueltos
const r = carteles.emparejar([
  { nombre: 'norte', pos: [10, 64, -5] }, { nombre: 'norte', pos: [-2, 70, 8] },
  { nombre: 'sur', pos: [0, 64, 0] },
  { nombre: 'x', pos: [0, 64, 0] }, { nombre: 'x', pos: [1, 64, 1] }, { nombre: 'x', pos: [2, 64, 2] },
])
ok(r.zonas.length === 1 && JSON.stringify(r.zonas[0]).startsWith('{"nombre":"norte","x1":-2,"z1":-5,"x2":10,"z2":8'), `zona: ${JSON.stringify(r.zonas)}`)
ok(r.sueltos.map(s => `${s.nombre}${s.n}`).join() === 'sur1,x3', `sueltos: ${JSON.stringify(r.sueltos)}`)
console.log('  emparejar en rectángulos')

// 3. dónde se puede construir
const esq = (x0, z0, a, b) => [[x0, z0], [x0 + a - 1, z0], [x0, z0 + b - 1], [x0 + a - 1, z0 + b - 1]]
obras.guardar({ permitido: null, temporales: [], obras: [], minados: [] })
ok(obras.obraPermitida(esq(100, 100, 5, 5), true) === null, 'sin carteles y reglas libres: en cualquier sitio, como siempre')
ok(/rectángulo/.test(obras.obraPermitida(esq(100, 100, 5, 5), false)), 'sin carteles ni rectángulo, en el del usuario: no')
obras.ponerTemporales(r.zonas)
ok(obras.obraPermitida(esq(0, 0, 5, 5), true) === null, 'dentro de norte')
ok(/carteles \(norte\)/.test(obras.obraPermitida(esq(100, 100, 5, 5), true)), 'con carteles, fuera de ellos no, aunque las reglas sean libres')
ok(obras.obraPermitida(esq(8, 0, 5, 5), true) !== null, 'una caja que se sale por un lado tampoco')
const d = obras.leer(); d.permitido = { x1: 200, z1: 200, x2: 220, z2: 220 }; obras.guardar(d)
ok(obras.obraPermitida(esq(205, 205, 5, 5), false) === null && obras.obraPermitida(esq(0, 0, 5, 5), false) === null, 'en el del usuario: el rectángulo o los carteles')
ok(obras.obraPermitida(esq(195, 195, 5, 5), false) !== null, 'en el del usuario, ni en uno ni en otro: no')
console.log('  construir solo dentro de las zonas de carteles (y del rectángulo en el mundo del usuario)')

// 4. vigentes: si un cartel ya no está (o dice otra cosa), la zona se quita; lo no cargado se da por bueno
const cartel = (texto) => ({ name: 'oak_sign', getSignText: () => [texto, ''] })
const mundoFalso = new Map([['10,64,-5', cartel('[obras]\nnorte')], ['-2,70,8', cartel('[obras]\nnorte')]])
const bot = { blockAt: (v) => (mundoFalso.has(`${v.x},${v.y},${v.z}`) ? mundoFalso.get(`${v.x},${v.y},${v.z}`) : { name: 'air' }) }
ok(carteles.vigentes(bot).length === 0 && obras.temporales().length === 1, 'con los dos carteles sigue')
const lejos = { blockAt: () => null }
ok(carteles.vigentes(lejos).length === 0 && obras.temporales().length === 1, 'sin cargar, sigue')
mundoFalso.set('-2,70,8', cartel('[obras]\nsur'))
ok(carteles.vigentes(bot).join() === 'norte' && obras.temporales().length === 0, 'con un cartel cambiado se quita')
obras.ponerTemporales(r.zonas); mundoFalso.delete('10,64,-5')
ok(carteles.vigentes(bot).join() === 'norte' && obras.temporales().length === 0, 'sin un cartel se quita')
console.log('  valen mientras sus dos carteles sigan en pie')

// 5. las órdenes
const ordenes = require('./ordenes')
ok(ordenes.interpretar('lee los carteles').accion === 'leer' && ordenes.interpretar('acepta los carteles').accion === 'aceptar' &&
  ordenes.interpretar('olvida los carteles').accion === 'olvidar', 'lee / acepta / olvida los carteles')
console.log('  órdenes')

fs.rmSync(tmp, { recursive: true, force: true })
console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
