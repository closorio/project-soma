// Red de seguridad del refactor de comandos (conocimiento/decisiones/2026-11-05-arquitectura-de-comandos.md): fija lo que entiende HOY
// el parser (bot/ordenes.js), frase a frase, contra bot/frases_ordenes.json. Si una salida cambia, falla y dice cuál. No juzga si la
// salida es la deseable: las raras se anotan en el campo «nota» de la tabla y no se corrigen aquí.
// Sin Minecraft: node bot/probar_frases_seco.js
// Tras un cambio querido del parser, o al añadir frases (con «resultado» sin poner): node bot/probar_frases_seco.js --actualizar
process.env.IO_BASE = 'HOGAR' // la zona base entra en algunas salidas y cada PC puede tener la suya en local.mk
const fs = require('fs')
const path = require('path')
const ordenes = require('./ordenes')

const RUTA_TABLA = path.join(__dirname, 'frases_ordenes.json')
const NOMBRES = ['Oqva', 'Eco', 'Iris', 'Alma']
const REPETICIONES = new Set(['bucle', 'hasta', 'veces']) // tipos de repetición de conRepeticion(), no órdenes

const FUNCIONES = {
  interpretar: (f) => ordenes.interpretar(f),
  varias: (f) => ordenes.interpretarVarias(f),
  destinatario: (f, e) => ordenes.destinatario(f, NOMBRES, e.conectados),
}

// Sin depender del orden de las claves: el refactor puede mover código sin cambiar lo que devuelve
const canonico = (v) => {
  if (Array.isArray(v)) return v.map(canonico)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, canonico(v[k])]))
  return v === undefined ? null : v
}
const calcular = (e) => canonico(FUNCIONES[e.funcion](e.frase, e))

// Una entrada por línea, para que los cambios se lean bien en un diff
const serializar = (tabla) => '[\n' + tabla.map(e => '  ' + JSON.stringify(e)).join(',\n') + '\n]\n'

const tabla = JSON.parse(fs.readFileSync(RUTA_TABLA, 'utf8'))

if (process.argv.includes('--actualizar')) {
  const nueva = tabla.map(e => ({ ...e, resultado: calcular(e) }))
  fs.writeFileSync(RUTA_TABLA, serializar(nueva))
  console.log(`${nueva.length} frases escritas en ${path.basename(RUTA_TABLA)}`)
  process.exit(0)
}

let pruebas = 0, fallos = 0
const ok = (c, m) => { pruebas++; if (!c) { fallos++; console.log('FALLA: ' + m) } }

for (const e of tabla) {
  const salida = JSON.stringify(calcular(e)), esperada = JSON.stringify(e.resultado)
  ok(salida === esperada, `${e.funcion}(«${e.frase}»)\n  esperaba ${esperada}\n  da       ${salida}`)
}

// Cada tipo de orden que puede devolver el parser tiene al menos una frase: una orden nueva sin frase hace fallar esta prueba
const fuente = fs.readFileSync(path.join(__dirname, 'ordenes.js'), 'utf8')
const tipos = [...new Set([...fuente.matchAll(/tipo: '([a-z_]+)'/g)].map(m => m[1]))].filter(t => !REPETICIONES.has(t))
const cubiertos = new Set()
const anotar = (r) => { if (Array.isArray(r)) r.forEach(anotar); else if (r && r.tipo) cubiertos.add(r.tipo) }
for (const e of tabla) if (e.funcion !== 'destinatario') anotar(e.resultado)
for (const t of tipos) ok(cubiertos.has(t), `el tipo «${t}» no tiene ninguna frase en frases_ordenes.json`)

console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
