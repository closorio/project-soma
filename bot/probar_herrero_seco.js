// Prueba en seco del oficio de herrero (2026-11-02): solo las decisiones previas a abrir cofres (sin servidor).
// Uso: node bot/probar_herrero_seco.js
process.env.IO_SERVIDOR = process.env.IO_SERVIDOR || 'supervivencia'
process.env.IO_AMOS = 'Seppuq'
const fs = require('fs'), os = require('os'), path = require('path')
const { Vec3 } = require('vec3')
const mundo = require('./mundo')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'herrero-'))
mundo.carpetaDatos = tmp
mundo.zonas = path.join(tmp, 'zonas.json')
const zonas = require('./zonas')
const herrero = require('./habilidades/herrero')
const ordenes = require('./ordenes')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }

zonas.zonaNueva('HOGAR', 0, 0, 20, 20, 'hogar')
const pieza = (name) => ({ name })
const soporte = (id, x, equipo) => ({ id, name: 'armor_stand', isValid: true, position: new Vec3(x, 64, 5), equipment: equipo })
const completo = [null, null, pieza('iron_boots'), pieza('iron_leggings'), pieza('iron_chestplate'), pieza('iron_helmet')]
const bot = (entities) => ({ entity: { position: new Vec3(5, 64, 5) }, entities, registry: { items: {}, foodsByName: {} }, findBlocks: () => [] })

;(async () => {
  let r = await herrero(bot({}), ['NOEXISTE', 'armadura', '4'], null)
  ok(!r.exito && r.causa === 'sin zona', 'zona inexistente: ' + r.causa)
  r = await herrero(bot({}), ['HOGAR', 'armadura', '4'], null)
  ok(!r.exito && r.causa === 'sin soportes', 'sin soportes: ' + r.causa)
  r = await herrero(bot({ 1: soporte(1, 5, completo), 2: soporte(2, 9, completo) }), ['HOGAR', 'armadura', '4'], null)
  ok(!r.exito && r.causa === 'nada que hacer', 'soportes completos en modo armadura: nada que hacer sin abrir cofres (' + r.causa + ')')
  r = await herrero(bot({ 1: soporte(1, 5, completo.map((p, i) => (i === 4 ? null : p))) }), ['HOGAR', 'armadura', '4'], null)
  ok(!r.exito && r.causa === 'sin cofres', 'falta el peto y no hay cofres: ' + r.causa)
  r = await herrero(bot({ 1: soporte(1, 5, completo) }), ['HOGAR', 'todo', '4'], null)
  ok(!r.exito && r.causa === 'sin cofres', 'modo todo con soportes completos y sin cofres: ' + r.causa)
  r = await herrero(bot({ 1: soporte(1, 500, [])}), ['HOGAR', 'armadura', '4'], null)
  ok(!r.exito && r.causa === 'sin soportes', 'un soporte fuera de la zona no cuenta: ' + r.causa)

  const I = (t) => ordenes.interpretar(t)
  for (const t of ['oficio herrero', 'sé herrero', 'ponte de herrero']) ok(I(t).tipo === 'oficio' && I(t).oficio === 'herrero', `«${t}» → ${JSON.stringify(I(t))}`)
  ok(I('ya no seas herrero').tipo === 'oficio_off' && I('deja el oficio').tipo === 'oficio_off', 'dejar el oficio')
  ok(I('oficio cosechar').oficio === 'cosechar', 'cosechar sigue igual')
  ok(herrero.GASTO.chestplate.i === 8 && herrero.GASTO.pickaxe.p === 2, 'gastos de las recetas')

  console.log(fallos ? `${fallos} FALLOS de ${pruebas}` : `Todo bien (${pruebas} pruebas)`)
  process.exit(fallos ? 1 : 0)
})()
