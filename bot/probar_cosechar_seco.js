// Prueba en seco del oficio de cosechar (2026-11-02): cultivos maduros, marcos con comida junto a un cofre y las órdenes. Sin servidor.
// Uso: node bot/probar_cosechar_seco.js
process.env.IO_SERVIDOR = process.env.IO_SERVIDOR || 'supervivencia'
const { Vec3 } = require('vec3')
const cosechar = require('./habilidades/cosechar')
const ordenes = require('./ordenes')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }

// 1. madurez
const cultivo = (name, age) => ({ name, getProperties: () => ({ age }) })
ok(cosechar.madura(cultivo('wheat', 7)) && !cosechar.madura(cultivo('wheat', 6)), 'trigo: maduro con edad 7')
ok(cosechar.madura(cultivo('beetroots', 3)) && !cosechar.madura(cultivo('beetroots', 2)), 'remolacha: madura con edad 3')
ok(cosechar.madura(cultivo('carrots', 7)) && cosechar.madura(cultivo('potatoes', 7)), 'zanahoria y patata maduras con 7')
ok(!cosechar.madura(cultivo('grass', 7)) && !cosechar.madura(null), 'otro bloque o nada: no es cultivo')

// 2. marcos con comida junto a un cofre
const items = { 1: { name: 'carrot' }, 2: { name: 'cooked_porkchop' }, 3: { name: 'stick' }, 4: { name: 'wheat' } }
const bloques = new Map([['10,64,10', 'chest'], ['20,64,20', 'barrel'], ['30,64,30', 'chest'], ['40,64,40', 'chest']])
const marco = (id, x, y, z, itemId) => ({ id, name: 'item_frame', isValid: true, position: new Vec3(x, y, z), metadata: itemId ? { 8: { itemId, itemCount: 1 } } : {} })
const bot = {
  registry: { items, foodsByName: { carrot: 1, cooked_porkchop: 1 } },
  blockAt: (p) => { const n = bloques.get(`${p.x},${p.y},${p.z}`); return n ? { name: n } : { name: 'air' } },
  entities: {
    // marco en el aire de x=11, pegado a la pared del cofre de x=10 (a 0,03 de la pared oeste de su casilla)
    1: marco(1, 11.03, 64.5, 10.5, 1),
    2: marco(2, 21.03, 64.5, 20.5, 2), // chuleta en un barril
    3: marco(3, 31.03, 64.5, 30.5, 3), // palo: no es comida
    4: marco(4, 41.03, 64.5, 40.5, null), // vacío
    5: marco(5, 11.03, 64.5, 10.5, 4), // trigo al mismo cofre: no se repite
    6: marco(6, 90.03, 64.5, 90.5, 1), // sin cofre al lado
  },
}
const r = cosechar.cofresMarcados(bot, new Vec3(0, 64, 0))
ok(r.length === 2 && r[0].pos.x === 10 && r[0].objeto === 'carrot' && r[1].pos.x === 20 && r[1].objeto === 'cooked_porkchop',
  `el cofre de la zanahoria y el barril de la chuleta, no el del palo, el vacío, el repetido ni el sin cofre (${JSON.stringify(r.map(c => [c.pos.x, c.objeto]))})`)
ok(cosechar.itemDeMarco(bot, bot.entities[4]) === null, 'marco vacío: sin objeto')
ok(cosechar.itemDeMarco(bot, bot.entities[2]) === 'cooked_porkchop', 'marco con chuleta')

// 3. órdenes
const I = (t) => ordenes.interpretar(t)
for (const t of ['oficio cosechar', 'cosecha el hogar', 'ponte a cosechar', 'sé granjero']) ok(I(t).tipo === 'oficio' && I(t).zona === '', `«${t}» → ${JSON.stringify(I(t))}`)
ok(I('cosecha en CAMPO2').zona === 'CAMPO2', '«cosecha en CAMPO2» → zona CAMPO2')
for (const t of ['deja el oficio', 'ya no coseches']) ok(I(t).tipo === 'oficio_off', `«${t}» → ${JSON.stringify(I(t))}`)
ok(I('recoge').tipo === 'recoge' && I('patrulla').tipo === 'centinela', 'no pisa «recoge» ni «patrulla»')

console.log(fallos ? `${fallos} FALLOS de ${pruebas}` : `Todo bien (${pruebas} pruebas)`)
process.exit(fallos ? 1 : 0)
