// Prueba en seco del recolector avanzado (bot/conseguir.js, 2026-11-02), sin servidor:
// 1. siguiente(): netherite no; sin pico → ármate; con pico de piedra y a por diamante → hierro antes (fundir, pico de hierro);
//    antorchas (carbón antes); a la mena; bajar a la cota; túnel; otro rumbo tras la lava; lo urgente (vida, hambre, basura).
// 2. ejecutar() en el mundo de mentira de probar_sentidos_seco.js con un `paso` que imita las habilidades: desde el inventario vacío
//    hasta 3 diamantes entregados a quien los pidió, por el camino entero (pico de piedra, hierro, pico de hierro, carbón, antorchas,
//    bajar, túnel, mena, subir, dar).
// 3. ordenes.js: «consigue 5 diamantes», «tráeme 32 de piedra roja», «mina 3 diamantes»; «mina 5 de carbón» sigue siendo minar.
// Uso: node bot/probar_conseguir_seco.js
process.env.IO_SERVIDOR = 'local'
const fs = require('fs')
const os = require('os')
const path = require('path')
const mundo = require('./mundo')
mundo.carpetaDatos = fs.mkdtempSync(path.join(os.tmpdir(), 'conseguir-'))
const { mundoFalso } = require('./probar_sentidos_seco')
const { siguiente, apuntar, ejecutar } = require('./conseguir')
const ordenes = require('./ordenes')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }
const E = (o = {}) => ({ crudo_hierro: 0, lingotes_hierro: 0, pico: 1, antorchas: 8, carbon: 0, comida: 4, y: 64, vida: 20, hambre: 20,
  huecos: 20, basura: false, ...o, tiene: { diamante: 0, hierro: 0, carbon: 0, esmeralda: 0, ...(o.tiene || {}) } })
const desc = (p) => p.fin ? `fin:${p.exito}:${p.causa}` : p.sub ? `sub:${p.sub.material}:${p.sub.n}` : p.orden ? `orden:${p.orden}` : p.tirar ? 'tirar' : `${p.habilidad} ${p.args.join(' ')}`

// 1 · siguiente
const casos = [
  ['netherite', E(), 'netherite', {}, /^fin:false:.*Nether/],
  ['sin pico', E({ pico: 0 }), 'diamante', {}, /^orden:armate$/],
  ['pico de madera', E({ pico: 0.33 }), 'hierro', {}, /^orden:armate$/],
  ['sin pico bajo tierra: arriba primero', E({ pico: 0, bajo: true, y: 0 }), 'lapis', {}, /^subir_a_superficie $/],
  ['sin pico bajo tierra, ya subió', E({ pico: 0, bajo: true, y: 0 }), 'lapis', { subidoPico: true }, /^orden:armate$/],
  ['pico de piedra gastado a por diamante: arriba', E({ pico: 0, bajo: true, y: -57 }), 'diamante', {}, /^subir_a_superficie $/],
  ['pico de piedra, sin hierro', E({ pico: 0.66 }), 'diamante', {}, /^sub:hierro:3$/],
  ['con 3 de hierro crudo', E({ pico: 0.66, crudo_hierro: 3 }), 'diamante', {}, /^fundir hierro 3$/],
  ['con 1 lingote y 2 crudos', E({ pico: 0.66, crudo_hierro: 2, lingotes_hierro: 1 }), 'diamante', {}, /^fundir hierro 2$/],
  ['con 3 lingotes', E({ pico: 0.66, lingotes_hierro: 3 }), 'diamante', {}, /^fabricar pico_hierro$/],
  ['sin antorchas ni carbón', E({ antorchas: 0 }), 'diamante', {}, /^sub:carbon:2$/],
  ['sin antorchas con carbón', E({ antorchas: 0, carbon: 2 }), 'diamante', {}, /^fabricar antorcha$/],
  ['carbón: sin antorchas no hacen falta', E({ antorchas: 0, pico: 0.33 }), 'carbon', {}, /^ir_a_mena coal_ore/],
  ['a la mena', E(), 'diamante', {}, /^ir_a_mena diamond_ore 32 3$/],
  ['no la ve: bajar', E(), 'diamante', { noVeo: true }, /^cavar_escalera -58 norte$/],
  ['abajo: túnel', E({ y: -57 }), 'diamante', { noVeo: true }, /^cavar_tunel norte 32 diamond_ore$/],
  ['otro rumbo', E(), 'diamante', { noVeo: true, rumbo: 1 }, /^cavar_escalera -58 este$/],
  ['túneles agotados', E({ y: -57 }), 'diamante', { noVeo: true, tuneles: 6 }, /^fin:false:no encontré/],
  ['esmeralda sin verla', E(), 'esmeralda', { noVeo: true }, /^fin:false:.*montañas/],
  ['hecho', E({ tiene: { diamante: 3 } }), 'diamante', {}, /^fin:true:hecho$/],
  ['poca vida', E({ vida: 4 }), 'diamante', {}, /^fin:false:poca vida$/],
  ['en agua honda', E({ enAgua: true }), 'diamante', {}, /^explorar - 24 40$/],
  ['en agua, ya probó a salir dos veces', E({ enAgua: true }), 'diamante', { salirAgua: 2 }, /^ir_a_mena/],
  ['hambre con comida', E({ hambre: 8 }), 'diamante', {}, /^comer $/],
  ['hambre sin comida', E({ hambre: 8, comida: 0 }), 'diamante', {}, /^recoger_comida $/],
  ['hambre sin comida, ya buscada', E({ hambre: 8, comida: 0 }), 'diamante', { comidaBuscada: true }, /^ir_a_mena/],
  ['inventario lleno', E({ huecos: 1, basura: true }), 'diamante', {}, /^tirar$/],
  ['lleno sin poder tirar', E({ huecos: 1, basura: true }), 'diamante', { noTirar: true }, /^ir_a_mena/],
]
for (const [que, e, mat, s, re] of casos) {
  const d = desc(siguiente(e, mat, 3, s))
  ok(re.test(d), `${que}: ${d}`)
}
// apuntar
const s1 = {}
apuntar(s1, { habilidad: 'ir_a_mena' }, { exito: false, causa: 'no veo diamond_ore a ≤ 32' }); ok(s1.noVeo === true, 'ir_a_mena sin ver → noVeo')
apuntar(s1, { habilidad: 'cavar_escalera' }, { exito: false, causa: 'lava delante' }); ok(s1.noVeo === false && s1.rumbo === 1 && s1.bajadas === 1, `escalera con lava: ${JSON.stringify(s1)}`)
apuntar(s1, { habilidad: 'cavar_tunel' }, { exito: true, causa: 'veo mena' }); ok(s1.rumbo === 1 && s1.tuneles === 1, `túnel que ve la mena no gira: ${JSON.stringify(s1)}`)
apuntar(s1, { habilidad: 'cavar_tunel' }, { exito: true, causa: 'llegué' }); ok(s1.rumbo === 2, 'túnel sin mena gira')

// 2 · ejecutar, de cero a 3 diamantes entregados
;(async () => {
  const bot = mundoFalso({ pos: [0.5, 64, 0.5], comida: 20 })
  const slots = bot.inventory.slots
  bot.inventory.emptySlotCount = () => slots.slice(9, 45).filter(x => !x).length
  bot.tossStack = async (it) => { slots[it.slot] = null }
  bot.players = { Ana: { entity: { position: bot.entity.position } } }
  const poner = (name, count) => {
    const ya = slots.find(x => x && x.name === name)
    if (ya) { ya.count += count; return }
    const i = slots.findIndex((x, k) => k >= 9 && k < 45 && !x); slots[i] = { name, count, slot: i }
  }
  const quitar = (name, count) => { const it = slots.find(x => x && x.name === name); it.count -= count; if (it.count <= 0) slots[it.slot] = null }
  const tengo = (name) => slots.filter(x => x && x.name === name).reduce((a, x) => a + x.count, 0)
  const vistos = [], dichos = []
  let vecesMena = 0
  const imita = {
    fundir: ([, n]) => { quitar('raw_iron', +n); poner('iron_ingot', +n); return { exito: true } },
    fabricar: ([o]) => {
      if (o === 'pico_hierro') { quitar('iron_ingot', 3); poner('iron_pickaxe', 1); return { exito: true } }
      if (o === 'antorcha') { quitar('coal', 1); poner('torch', 4); return { exito: true } }
      return { exito: false, causa: 'receta desconocida' }
    },
    ir_a_mena: ([mena]) => {
      // arriba hay hierro y carbón a la vista; diamante solo tras el túnel
      if (mena === 'iron_ore') { poner('raw_iron', 3); return { exito: true, picadas: 3 } }
      if (mena === 'coal_ore') { poner('coal', 2); return { exito: true, picadas: 2 } }
      if (mena === 'diamond_ore' && bot.entity.position.y < 0 && vistos.includes('cavar_tunel') && vecesMena++ < 2) { poner('diamond', 2); return { exito: true, picadas: 2 } }
      return { exito: false, causa: `no veo ${mena} a ≤ 32` }
    },
    cavar_escalera: ([y]) => { bot.entity.position.y = +y; poner('cobbled_deepslate', 40); return { exito: true, causa: 'llegué' } },
    cavar_tunel: () => ({ exito: true, causa: 'veo mena' }),
    subir_a_superficie: () => { bot.entity.position.y = 64; return { exito: true } },
    dar: ([quien, objeto]) => { const n = tengo(objeto); quitar(objeto, n); return { exito: true, dado: { [objeto]: n }, a: quien } },
  }
  const ctx = {
    tarea: { cancelada: false }, quien: 'Ana', decir: (t) => dichos.push(t),
    paso: async (h, a) => { vistos.push(h); const r = (imita[h] || (() => ({ exito: false, causa: 'sin imitar' })))(a); return [r, { habilidad: h, exito: !!r.exito, causa: r.causa || '' }] },
    orden: async (tipo) => { vistos.push('orden:' + tipo); poner('stone_pickaxe', 1); poner('stone_sword', 1); return { exito: true, pasos: [] } },
  }
  const r = await ejecutar(bot, 'diamante', 3, ctx)
  const cadena = vistos.join(' ')
  ok(r.exito && r.conseguidos >= 3 && r.entrega === 'dado', `entregado: ${JSON.stringify({ exito: r.exito, causa: r.causa, conseguidos: r.conseguidos, entrega: r.entrega })}`)
  const orden = ['orden:armate', 'ir_a_mena', 'fundir', 'fabricar', 'cavar_escalera', 'cavar_tunel', 'subir_a_superficie', 'dar']
  let k = -1
  ok(orden.every(h => (k = vistos.indexOf(h, k + 1)) >= 0), `el camino entero en orden: ${cadena}`)
  ok(vistos.filter(h => h === 'fabricar').length >= 2, 'fabrica el pico de hierro y las antorchas')
  ok(!vistos.includes('depositar'), 'Ana está: no va al cofre')
  ok(dichos.some(t => /Antes necesito 3 de hierro/.test(t)), `avisa del hierro: ${dichos.join(' | ')}`)

  // netherite: ni lo intenta
  const b2 = mundoFalso(); b2.inventory.emptySlotCount = () => 36
  const r2 = await ejecutar(b2, 'netherite', 1, { ...ctx, paso: async (h) => { throw new Error('no debía dar pasos: ' + h) } })
  ok(!r2.exito && /Nether/.test(r2.causa), `netherite: ${r2.causa}`)

  // 2026-11-03, banco: el pico se gasta abajo → sube, se arma y vuelve a bajar
  for (const x of slots) if (x) slots[x.slot] = null
  bot.entity.position.y = 64; poner('stone_pickaxe', 1); poner('torch', 8); poner('bread', 4)
  const v3 = []
  let gastado = false
  const r3 = await ejecutar(bot, 'lapis', 6, { ...ctx, entregar: false,
    paso: async (h, a) => {
      v3.push(h)
      let r = { exito: false, causa: 'sin imitar' }
      if (h === 'ir_a_mena') r = bot.entity.position.y <= 0 && gastado ? (poner('lapis_lazuli', 6), { exito: true, picadas: 2 }) : { exito: false, causa: 'no veo' }
      if (h === 'cavar_escalera') { bot.entity.position.y = +a[0]; if (!gastado) { gastado = true; quitar('stone_pickaxe', 1) } r = { exito: true, causa: 'llegué' } }
      if (h === 'subir_a_superficie') { bot.entity.position.y = 64; r = { exito: true } }
      return [r, { habilidad: h, exito: !!r.exito, causa: r.causa || '' }]
    },
    orden: async (tipo) => { v3.push('orden:' + tipo); if (bot.entity.position.y < 60) return { exito: false, pasos: [] }; poner('stone_pickaxe', 1); return { exito: true, pasos: [] } } })
  ok(r3.exito && r3.conseguidos >= 6, `pico gastado abajo: ${r3.causa} (${v3.join(' ')})`)
  ok(v3.indexOf('subir_a_superficie') >= 0 && v3.indexOf('subir_a_superficie') < v3.indexOf('orden:armate'), `sube antes de armarse: ${v3.join(' ')}`)

  // túnel: la lava junto a la casilla que va a abrir se tapa con piedra; sin relleno, para
  const { tapar } = require('./habilidades/tunel')
  const { Vec3 } = require('vec3')
  const conLava = (inventario) => {
    const b = mundoFalso({ inventario, bloques: { '1,64,0': 'stone', '1,65,0': 'stone', '2,64,0': 'lava' } })
    const encima = new Map(), original = b.blockAt
    b.blockAt = (v) => {
      const k = `${Math.floor(v.x)},${Math.floor(v.y)},${Math.floor(v.z)}`, base = original(v)
      if (!encima.has(k) || !base) return base
      const reg = b.registry.blocksByName[encima.get(k)]
      return { ...base, name: reg.name, type: reg.id, boundingBox: reg.boundingBox }
    }
    b.equip = async (it) => { b.heldItem = it }
    b.placeBlock = async (ref, cara) => { const d = ref.position.plus(cara); encima.set(`${d.x},${d.y},${d.z}`, b.heldItem.name) }
    return b
  }
  const bt = conLava([['cobblestone', 10]]), ct = { puestos: [], peligros: [], tapados: 0 }
  const rt = await tapar(bt, new Vec3(1, 64, 0), ct)
  ok(rt === true && ct.tapados === 1 && bt.blockAt(new Vec3(2, 64, 0)).name === 'cobblestone', `tapa la lava: ${rt} ${JSON.stringify(ct)}`)
  const bt2 = conLava([]), ct2 = { puestos: [], peligros: [], tapados: 0 }
  const rt2 = await tapar(bt2, new Vec3(1, 64, 0), ct2)
  ok(rt2 === 'lava' && ct2.peligros[0].tipo === 'lava', `sin relleno, para: ${rt2}`)

  // 3 · órdenes
  const o = (t) => ordenes.interpretar(t)
  ok(JSON.stringify(o('consigue 5 diamantes')) === '{"tipo":"consigue","material":"diamante","n":5}', 'consigue 5 diamantes')
  ok(o('tráeme 32 de piedra roja').material === 'redstone', 'piedra roja')
  ok(o('mina 3 diamantes').tipo === 'consigue', 'mina 3 diamantes → consigue')
  ok(o('mina 5 de carbón').tipo === 'mina', 'mina 5 de carbón sigue siendo minar')
  ok(o('consigue 3 ovejas').tipo === 'cazar', 'consigue 3 ovejas sigue siendo cazar')
  ok(o('saca 3 de hierro').tipo === 'saca', 'saca 3 de hierro sigue siendo del cofre')
  ok(o('búscame lapislázuli').material === 'lapis', 'lapislázuli')

  console.log(`${pruebas - fallos}/${pruebas} pruebas pasan`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
