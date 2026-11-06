// Prueba en seco de bot/tala.js (dónde buscar árboles lejos), sin servidor. Uso: node bot/probar_tala_seco.js
const tala = require('./tala')
let pruebas = 0, fallos = 0
const ok = (c, m) => { pruebas++; if (!c) { fallos++; console.log('FALLA: ' + m) } }

// Las zonas de verdad del mundo companero, donde apareció el fallo
const BOSQUE = { nombre: 'BOSQUE', x1: 608, z1: -810, x2: 727, z2: -784 }
const TALLER = { nombre: 'TALLER', x1: 657, z1: -840, x2: 679, z2: -818 }

const ps = tala.puntosDeZona(BOSQUE)
ok(ps.length === 3, `BOSQUE (119 de largo) debería dar 3 puntos y da ${ps.length}`)
ok(ps.every(p => p.x >= 608 && p.x <= 727 && p.z >= -810 && p.z <= -784), 'un punto cae fuera de la zona')
for (let i = 1; i < ps.length; i++) ok(ps[i].x - ps[i - 1].x <= tala.PASO, 'puntos demasiado separados: queda zona sin mirar')
ok(ps[0].x - 608 <= tala.PASO && 727 - ps[ps.length - 1].x <= tala.PASO, 'los extremos de la zona quedan sin mirar')
ok(tala.puntosDeZona(TALLER).length === 1, 'una zona pequeña debería dar 1 punto')
ok(tala.puntosDeZona({ x1: 727, z1: -784, x2: 608, z2: -810 }).length === 3, 'esquinas al revés')

// Orden: del más cercano, sin ir y volver
const b = tala.crearBusqueda({ trabajo: [BOSQUE], pos: { x: 730, z: -800 } })
const xs = []
for (;;) { const s = tala.siguiente(b); if (!s.ir) { ok(/BOSQUE/.test(s.fin), `el fin no nombra la zona: ${JSON.stringify(s)}`); break } xs.push(s.ir.x) }
ok(xs.length === 3 && xs[0] > xs[1] && xs[1] > xs[2], `el recorrido no va en orden: ${xs}`)
ok(tala.siguiente(b).fin, 'tras el fin debe seguir en fin')

// Un punto dentro de una zona vedada se cambia por la casilla libre, y no se repiten
const conVedada = tala.crearBusqueda({ trabajo: [TALLER], pos: { x: 0, z: 0 }, puntoFuera: () => ({ x: 653, z: -829, zona: 'CASASOMA' }) })
ok(conVedada.puntos.length === 1 && conVedada.puntos[0].x === 653, 'no usa puntoFuera')
const dos = tala.crearBusqueda({ trabajo: [TALLER, TALLER], pos: { x: 0, z: 0 } })
ok(dos.puntos.length === 1, 'puntos repetidos')
const fin2 = tala.crearBusqueda({ trabajo: [TALLER, BOSQUE], pos: { x: 0, z: 0 } })
while (tala.siguiente(fin2).ir);
fin2.i = 0
while (tala.siguiente(fin2).ir);
ok(/TALLER, BOSQUE/.test(tala.siguiente(fin2).fin), 'el fin no nombra todas las zonas')

// Sin zonas de trabajo: explorar, con tope
const libre = tala.crearBusqueda({ trabajo: [], pos: { x: 0, z: 0 } })
for (let i = 0; i < tala.MAX_EXPLORAR; i++) ok(tala.siguiente(libre).explorar, `exploración ${i + 1}`)
ok(/exploré/.test(tala.siguiente(libre).fin), 'explorar no tiene tope')

// Tope de tiempo, con o sin zonas
ok(/minutos/.test(tala.siguiente(tala.crearBusqueda({ trabajo: [BOSQUE], pos: { x: 0, z: 0 } }), tala.TOPE_MS).fin), 'sin tope de tiempo con zonas')
ok(/minutos/.test(tala.siguiente(tala.crearBusqueda({ pos: { x: 0, z: 0 } }), tala.TOPE_MS).fin), 'sin tope de tiempo sin zonas')

console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
