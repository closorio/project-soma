// Prueba en seco de lo que decide bot/armarse.js, sin servidor. Uso: node bot/probar_armarse_seco.js
const a = require('./armarse')
let pruebas = 0, fallos = 0
const ok = (c, m) => { pruebas++; if (!c) { fallos++; console.log('FALLA: ' + m) } }

const todo = a.faltan([])
ok(todo.piezas.length === 8 && todo.lingotes === 34 && todo.palos === 7, `equipo completo: ${JSON.stringify([todo.piezas.length, todo.lingotes, todo.palos])}`)
const nombres = a.faltan([]).piezas.map(p => p.nombre).join(',')
ok(nombres === 'casco,peto,pantalón,botas,espada,pico,hacha,azada', `piezas: ${nombres}`)

// Pide solo lo que falta, y lo de piedra no cuenta como tenido
const parcial = a.faltan(['iron_chestplate', 'iron_pickaxe', 'stone_sword', 'cobblestone'])
ok(parcial.lingotes === 34 - 8 - 3 && parcial.palos === 5, `parcial: ${parcial.lingotes} lingotes, ${parcial.palos} palos`)
ok(parcial.piezas.some(p => p.item === 'iron_sword'), 'la espada de piedra no sustituye a la de hierro')

// Diamante y netherita cuentan como tenidos
const mejor = a.faltan(['diamond_pickaxe', 'netherite_chestplate'])
ok(!mejor.piezas.some(p => p.item === 'iron_pickaxe' || p.item === 'iron_chestplate'), 'fabricaría hierro teniendo algo mejor')
ok(a.faltan(a.EQUIPO.map(p => p.item)).piezas.length === 0, 'con todo no debería faltar nada')

// pickaxe no se confunde con axe
ok(a.faltan(['iron_pickaxe']).piezas.some(p => p.item === 'iron_axe'), 'el pico no cuenta como hacha')
ok(a.faltan(['iron_axe']).piezas.some(p => p.item === 'iron_pickaxe'), 'el hacha no cuenta como pico')

// Cofres: por cercanía, sin los ajenos, con tope
const P = (x, y, z) => ({ x, y, z })
const orden = a.cofresUtiles([P(30, 64, 0), P(5, 64, 0), P(12, 64, 0)], P(0, 64, 0))
ok(orden.map(p => p.x).join() === '5,12,30', `orden: ${orden.map(p => p.x)}`)
const sinAjeno = a.cofresUtiles([P(5, 64, 0), P(12, 64, 0)], P(0, 64, 0), (p) => p.x === 5)
ok(sinAjeno.length === 1 && sinAjeno[0].x === 12, 'toma un cofre ajeno')
ok(a.cofresUtiles(Array.from({ length: 40 }, (_, i) => P(i, 64, 0)), P(0, 64, 0)).length === 16, 'sin tope de cofres')

// Nada encima de un cofre: impediría abrirlo
process.env.IO_SERVIDOR = process.env.IO_SERVIDOR || 'supervivencia'
const sv = require('./habilidades/sv')
const { Vec3 } = require('vec3')
const mundoDe = (nombre) => ({ blockAt: (v) => ({ name: v.y === 69 ? nombre : 'air' }) })
ok(sv.tapaCofre(mundoDe('chest'), new Vec3(0, 70, 0)), 'encima de un cofre')
ok(sv.tapaCofre(mundoDe('trapped_chest'), new Vec3(0, 70, 0)), 'encima de un cofre trampa')
ok(!sv.tapaCofre(mundoDe('barrel'), new Vec3(0, 70, 0)), 'el barril se abre igual')
ok(!sv.tapaCofre(mundoDe('dirt'), new Vec3(0, 70, 0)), 'sobre tierra se puede')

console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
