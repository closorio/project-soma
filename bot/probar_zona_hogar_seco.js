// Prueba en seco de las zonas de hogar y del alcance por dueño (2026-11-02). Sobre una carpeta temporal (no toca los datos de ningún mundo).
// Uso: node bot/probar_zona_hogar_seco.js
process.env.IO_SERVIDOR = process.env.IO_SERVIDOR || 'supervivencia'
process.env.IO_AMOS = 'Seppuq'
const fs = require('fs'), os = require('os'), path = require('path')
const mundo = require('./mundo')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hogar-'))
mundo.carpetaDatos = tmp
mundo.zonas = path.join(tmp, 'zonas.json') // la heredada; antes de cargar zonas.js, que lee las rutas al cargarse
const zonas = require('./zonas')
const sv = require('./habilidades/sv')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }

// 1. alcance: sin archivo de dueño se lee el heredado; el primer cambio escribe el del dueño y deja el heredado intacto
const heredado = { zonas: [{ nombre: 'HOGAR', x1: 0, z1: 0, x2: 10, z2: 10, modo: 'vedada' }], arboles: [] }
fs.writeFileSync(mundo.zonas, JSON.stringify(heredado))
ok(zonas.RUTA === path.join(tmp, 'zonas_seppuq.json'), 'la ruta es la del dueño: ' + zonas.RUTA)
ok(zonas.leer().zonas.length === 1 && zonas.pasoVedado(5, 64, 5), 'sin archivo de dueño lee el heredado')
zonas.zonaNueva('HOGAR', 0, 0, 10, 10, 'hogar') // la misma zona, ahora de hogar
ok(fs.existsSync(zonas.RUTA) && JSON.parse(fs.readFileSync(mundo.zonas)).zonas[0].modo === 'vedada', 'escribe el del dueño y no toca el heredado')
ok(zonas.leer().zonas[0].modo === 'hogar' && !zonas.pasoVedado(5, 64, 5), 'ya lee el del dueño')
console.log('  alcance por dueño')

// 2. hogar: se pisa, no se rompe, sí se pone
ok(!zonas.pasoVedado(5, 64, 5), 'el hogar se pisa')
ok(zonas.talaProtegida(5, 64, 5) && zonas.protegidoPor(5, 64, 5) === 'HOGAR' && !sv.puedeTocar(5, 64, 5), 'dentro del hogar no se tala ni se pica')
ok(!zonas.ponerProtegido(5, 64, 5) && sv.puedePoner(5, 64, 5), 'dentro del hogar sí se pone (cama, mesa, cofre)')
ok(!zonas.talaProtegida(50, 64, 50) && sv.puedePoner(50, 64, 50), 'fuera del hogar, sin zonas de trabajo, todo como antes')
console.log('  hogar: se pisa y se pone, no se rompe')

// 3. con una zona de trabajo que deja el hogar fuera: allí dentro se sigue pudiendo poner, pero no romper
zonas.zonaNueva('CANTERA', 100, 100, 140, 140, 'trabajo')
ok(zonas.protegidoPor(120, 64, 120) === null && sv.puedeTocar(120, 64, 120), 'dentro de CANTERA se trabaja')
ok(zonas.ponerProtegido(50, 64, 50) && !sv.puedePoner(50, 64, 50), 'fuera de CANTERA y del hogar no se pone')
ok(!zonas.ponerProtegido(5, 64, 5) && sv.puedePoner(5, 64, 5), 'el hogar, aunque esté fuera de CANTERA, deja poner')
ok(zonas.talaProtegida(5, 64, 5) && !sv.puedeTocar(5, 64, 5), 'y sigue sin dejar romper')
console.log('  hogar con zona de trabajo')

// 4. una vedada dentro del hogar manda; los árboles marcados también; la lista nombra el modo
zonas.zonaNueva('DESPENSA', 2, 2, 3, 3, 'vedada')
ok(zonas.pasoVedado(2, 64, 2) && !sv.puedePoner(2, 64, 2), 'una vedada dentro del hogar manda')
ok(zonas.lista().some(l => l.startsWith('HOGAR: zona hogar')), 'la lista marca HOGAR como hogar')
console.log('  vedada dentro del hogar y lista')

fs.rmSync(tmp, { recursive: true, force: true })
console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
