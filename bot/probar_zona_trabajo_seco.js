// Prueba en seco de las zonas de trabajo (2026-10-31): con alguna, talar, picar y poner solo dentro; andar libre; las vedadas
// mandan también dentro; sin ninguna, todo como antes. Sobre un zonas.json temporal (no toca los datos de ningún mundo).
// Uso: node bot/probar_zona_trabajo_seco.js
process.env.IO_SERVIDOR = process.env.IO_SERVIDOR || 'supervivencia'
const fs = require('fs'), os = require('os'), path = require('path')
const mundo = require('./mundo')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zonas-'))
mundo.zonas = path.join(tmp, 'zonas.json') // antes de cargar zonas.js, que lee la ruta al cargarse
const zonas = require('./zonas')
const sv = require('./habilidades/sv')
const parcela = require('./parcela')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }
const poner = (d) => { fs.writeFileSync(zonas.RUTA, JSON.stringify(d)); const t = new Date(Date.now() + 1000 * ++poner.n); fs.utimesSync(zonas.RUTA, t, t) }
poner.n = 0 // zonas.js relee por mtime: cada escritura con uno distinto

// 1. sin zonas de trabajo: como antes
poner({ zonas: [{ nombre: 'HOGAR', x1: 0, z1: 0, x2: 10, z2: 10, modo: 'vedada' }], arboles: [] })
ok(!zonas.talaProtegida(50, 64, 50) && sv.puedeTocar(50, 64, 50), 'sin zonas de trabajo, fuera de HOGAR se puede talar y tocar')
ok(zonas.talaProtegida(5, 64, 5) && zonas.pasoVedado(5, 64, 5), 'HOGAR sigue vedada')
ok(!zonas.fueraDeTrabajo(50, 64, 50), 'sin zonas de trabajo nada está fuera de ellas')
console.log('  sin zonas de trabajo: todo como antes')

// 2-5. con una zona de trabajo y una vedada dentro de ella
poner({ zonas: [
  { nombre: 'CANTERA', x1: 100, z1: 100, x2: 140, z2: 140, modo: 'trabajo' },
  { nombre: 'POZO', x1: 110, z1: 110, x2: 112, z2: 112, modo: 'vedada' },
  { nombre: 'HUERTO', x1: 130, z1: 130, x2: 135, z2: 135, modo: 'no_talar' },
], arboles: [] })
ok(!zonas.talaProtegida(120, 64, 120) && sv.puedeTocar(120, 64, 120), 'dentro de CANTERA se puede talar y tocar')
ok(zonas.protegidoPor(50, 64, 50) === zonas.FUERA_DE_TRABAJO && !sv.puedeTocar(50, 64, 50), 'fuera de CANTERA no se tala ni se toca')
ok(zonas.protegidoPor(111, 64, 111) === 'POZO' && zonas.pasoVedado(111, 64, 111), 'la vedada POZO manda dentro de CANTERA')
ok(zonas.protegidoPor(132, 64, 132) === 'HUERTO' && !zonas.pasoVedado(132, 64, 132), 'no_talar dentro de CANTERA: no se tala, se pisa')
ok(!zonas.pasoVedado(120, 64, 120) && !zonas.pasoVedado(50, 64, 50), 'andar es libre dentro y fuera de CANTERA')
const pf = zonas.puntoFuera(120, 120)
ok(pf.zona === null && pf.x === 120 && pf.z === 120, `puntoFuera no saca de CANTERA: ${JSON.stringify(pf)}`)
console.log('  con CANTERA: dentro se trabaja, fuera no; las vedadas y no_talar mandan dentro; se anda libre')

// 6. construir: la zona de trabajo no cuenta como protegida para el margen de las parcelas
ok(parcela.lejosDeProtegido(101, 101, 10), 'lejosDeProtegido rechaza junto al borde de CANTERA')
ok(!parcela.lejosDeProtegido(115, 115, 10), 'lejosDeProtegido ya no ve POZO')
console.log('  parcelas: el margen de 10 no cuenta las zonas de trabajo')

// la lista y borrar
ok(zonas.lista().some(l => l.startsWith('CANTERA: zona de trabajo')), 'la lista no marca CANTERA como de trabajo')
zonas.borrar('CANTERA')
ok(!zonas.talaProtegida(50, 64, 50) && zonas.trabajo().length === 0, 'al borrar CANTERA se vuelve a trabajar en cualquier sitio')
console.log('  lista y borrar')

fs.rmSync(tmp, { recursive: true, force: true })
console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
