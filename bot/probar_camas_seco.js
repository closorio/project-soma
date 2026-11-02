// Prueba seca de las reservas de cama (habilidades/usar_cama.js): compartidas entre procesos por fichero y con caducidad. Usa un fichero temporal.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { Reservas } = require('./habilidades/usar_cama')

let fallos = 0, pruebas = 0
const ok = (c, t) => { pruebas++; if (!c) { fallos++; console.log('  FALLO ' + t) } }

const ruta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'camas-')), 'camas.json')
let t = 1000000
const a = new Reservas(ruta, () => t), b = new Reservas(ruta, () => t) // dos «procesos» sobre el mismo fichero

a.set('10,64,5', 'Trivino')
ok(b.get('10,64,5') === 'Trivino' && b.has('10,64,5'), 'otro proceso ve la reserva de Trivino')
ok(!b.has('11,64,5'), 'una cama sin reserva no está reservada')
b.set('12,64,5', 'Nico')
ok([...a].map(([k, n]) => `${k}=${n}`).sort().join('|') === '10,64,5=Trivino|12,64,5=Nico', 'iterar da las dos reservas')
for (const [k, n] of a) if (n === 'Trivino') a.delete(k) // como hace elegirCama: una cama por bot
ok(!b.has('10,64,5') && b.has('12,64,5'), 'borrar la de Trivino deja la de Nico, vista desde el otro proceso')
t += 31 * 60 * 1000
ok(!a.has('12,64,5') && [...b].length === 0, 'a los 31 min la reserva caduca')
fs.writeFileSync(ruta, 'no es json')
ok(!a.has('x') && [...a].length === 0, 'un fichero roto cuenta como vacío')
a.set('1,2,3', 'Lola')
ok(b.get('1,2,3') === 'Lola', 'y se recupera al volver a escribir')

fs.rmSync(path.dirname(ruta), { recursive: true, force: true })
console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
