// Prueba en seco de A1 (planes/asistente/A1.md): el parser de las órdenes del asistente, sin servidor.
// Se escribió ANTES del código (fase P): las 30 frases y lo que debe salir son el criterio de la puerta (30/30) y no se cambian
// para que pase. Al empezar A1: mover este archivo a bot/probar_asistente_seco.js (entra solo en make test).
// Uso: node bot/probar_asistente_seco.js
const assert = require('assert')
const { interpretar, destinatario } = require('./ordenes')

// [frase, lo que debe dar interpretar (solo se comparan estas claves)]
const CASOS = [
  // nuevas (A1): ir a un punto, base, recuperar, granja, minar en un punto, traer minerales
  ['ve a 120 64 -30', { tipo: 've_a', x: 120, y: 64, z: -30 }],
  ['vete a -5 70 8', { tipo: 've_a', x: -5, y: 70, z: 8 }],
  ['anda a 0 63 0', { tipo: 've_a', x: 0, y: 63, z: 0 }],
  ['base aquí', { tipo: 'campamento' }],
  ['pon la base aquí', { tipo: 'campamento' }],
  ['recupera tus cosas', { tipo: 'recupera' }],
  ['ve a por tus cosas', { tipo: 'recupera' }],
  ['cuida la granja', { tipo: 'cuida_granja' }],
  ['cosecha', { tipo: 'cosecha' }],
  ['cosecha el trigo', { tipo: 'cosecha' }],
  ['cría vacas', { tipo: 'cria', animal: 'cow' }],
  ['cria 2 ovejas', { tipo: 'cria', animal: 'sheep' }],
  ['esquila las ovejas', { tipo: 'esquila' }],
  ['mina en 100 12 40 hasta llenar', { tipo: 'mina_en', x: 100, y: 12, z: 40, n: null }],
  ['mina en -20 -30 15 32 bloques', { tipo: 'mina_en', x: -20, y: -30, z: 15, n: 32 }],
  ['trae 16 de hierro', { tipo: 'trae', mineral: 'hierro', n: 16 }],
  ['trae diamantes', { tipo: 'trae', mineral: 'diamante', n: null }],
  ['trae carbón', { tipo: 'trae', mineral: 'carbon', n: null }],
  ['tráeme 8 de cobre', { tipo: 'trae', mineral: 'cobre', n: 8 }],
  ['trae redstone', { tipo: 'trae', mineral: 'redstone', n: null }],
  // las de siempre no cambian
  ['ven', { tipo: 'ven' }],
  ['quédate', { tipo: 'quedate' }],
  ['tala 5 troncos', { tipo: 'tala', n: 5 }],
  ['trae 3 troncos', { tipo: 'tala', n: 3 }],
  ['caza 3 ovejas', { tipo: 'cazar', animal: 'sheep', n: 3 }],
  ['trae comida', { tipo: 'caza' }],
  ['vuelve al campamento', { tipo: 'campamento_vuelve' }],
  ['campamento aquí', { tipo: 'campamento' }],
  ['mina 8 piedras', { tipo: 'mina', bloque: 'stone', n: 8 }],
  ['estado', { tipo: 'estado' }],
]

let bien = 0
for (const [frase, esperado] of CASOS) {
  const r = interpretar(frase) || {}
  const igual = Object.entries(esperado).every(([k, v]) => r[k] === v)
  if (igual) bien++
  else console.log(`  FALLO «${frase}»: ${JSON.stringify(r)} (esperaba ${JSON.stringify(esperado)})`)
}
assert.ok(CASOS.length === 30, 'tienen que ser 30 frases')
// el nombre delante sigue funcionando: Oqva (2026-11-01) y su alias de antes, Soma
const d = destinatario('Oqva, ve a 1 2 3', ['Oqva', 'Eco'])
const d2 = destinatario('Soma, ve a 1 2 3', ['Oqva', 'Eco'])
const okNombre = d.a === 'Oqva' && (interpretar(d.resto) || {}).tipo === 've_a' && d2.a === 'Oqva' && (interpretar(d2.resto) || {}).tipo === 've_a'
if (!okNombre) console.log('  FALLO «Oqva/Soma, ve a 1 2 3»: ' + JSON.stringify([d, d2]))
console.log(`probar_asistente_seco: ${bien}/30` + (bien === 30 && okNombre ? ', todo bien' : ', HAY FALLOS'))
process.exit(bien === 30 && okNombre ? 0 : 1)
