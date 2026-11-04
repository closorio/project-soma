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
const E = (o = {}) => ({ crudo_hierro: 0, lingotes_hierro: 0, pico: 1, antorchas: 8, carbon: 0, comida: 4, madera: 8, usosPico: 200, y: 64, vida: 20, hambre: 20,
  huecos: 20, basura: false, ...o, tiene: { diamante: 0, hierro: 0, carbon: 0, esmeralda: 0, ...(o.tiene || {}) } })
const desc = (p) => p.fin ? `fin:${p.exito}:${p.causa}` : p.sub ? `sub:${p.sub.material}:${p.sub.n}` : p.orden ? `orden:${p.orden}` : p.tirar ? 'tirar' : `${p.habilidad} ${p.args.join(' ')}`

// 1 · siguiente
const casos = [
  ['netherite', E(), 'netherite', {}, /^fin:false:.*Nether/],
  ['sin pico', E({ pico: 0 }), 'diamante', {}, /^orden:armate$/],
  ['pico de madera', E({ pico: 0.33 }), 'hierro', {}, /^orden:armate$/],
  ['sin pico bajo tierra: arriba primero', E({ pico: 0, bajo: true, y: 0, madera: 0 }), 'lapis', {}, /^subir_a_superficie $/],
  ['sin pico bajo tierra, ya subió', E({ pico: 0, bajo: true, y: 0, madera: 0 }), 'lapis', { subidoPico: true }, /^orden:armate$/],
  ['pico de piedra gastado a por diamante: arriba', E({ pico: 0, bajo: true, y: -57, madera: 0 }), 'diamante', {}, /^subir_a_superficie $/],
  ['sin pico bajo tierra con madera de reserva: ármate ahí', E({ pico: 0, bajo: true, y: -57 }), 'diamante', {}, /^orden:armate$/],
  ['fundir falló: piedra para el horno', E({ pico: 0.66, crudo_hierro: 3 }), 'diamante', { fundirNo: 1 }, /^minar stone 8 6 y=-64$/],
  ['ya picó piedra: fundir otra vez', E({ pico: 0.66, crudo_hierro: 3 }), 'diamante', { fundirNo: 1, piedraHorno: true }, /^fundir hierro 3$/],
  ['fundir falló dos veces', E({ pico: 0.66, crudo_hierro: 3 }), 'diamante', { fundirNo: 2, fundirCausa: 'x' }, /^fin:false:no pude fundir/],
  ['sin madera antes de bajar: talar la reserva', E({ madera: 0 }), 'diamante', {}, /^orden:tala$/],
  ['la tala de reserva falló: baja igual', E({ madera: 0 }), 'diamante', { reservaNo: true }, /^ir_a_mena/],
  ['pico a punto de romperse abajo sin madera: arriba', E({ bajo: true, y: -57, usosPico: 10, madera: 0 }), 'diamante', {}, /^subir_a_superficie $/],
  ['pico a punto de romperse con madera: uno de repuesto ahí', E({ bajo: true, y: -57, usosPico: 10 }), 'diamante', {}, /^orden:armate$/],
  ['pico a punto de romperse, ya con repuesto: sigue', E({ bajo: true, y: -57, usosPico: 10, repuesto: true }), 'diamante', {}, /^ir_a_mena/],
  ['el repuesto ya se intentó: sigue', E({ bajo: true, y: -57, usosPico: 10 }), 'diamante', { repuestoHecho: true }, /^ir_a_mena/],
  ['pico de piedra, sin hierro', E({ pico: 0.66 }), 'diamante', {}, /^sub:hierro:3$/],
  ['pico de piedra sin madera: talar', E({ pico: 0.66, madera: 0 }), 'diamante', {}, /^orden:tala$/],
  ['sin madera bajo tierra: arriba', E({ pico: 0.66, madera: 0, bajo: true, y: -20 }), 'diamante', {}, /^subir_a_superficie $/],
  ['sin madera, la tala falló: de otro sitio', E({ pico: 0.66, madera: 0 }), 'diamante', { maderaNo: true }, /^explorar - 24 40$/],
  ['sin madera, explorado y volvió a fallar', E({ pico: 0.66, madera: 0 }), 'diamante', { maderaNo: true, maderaBuscada: true }, /^fin:false:.*madera/],
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
    orden: async (tipo) => {
      vistos.push('orden:' + tipo)
      if (tipo === 'tala') poner('oak_log', 2); else { poner('stone_pickaxe', 1); poner('stone_sword', 1) }
      return { exito: true, pasos: [] }
    },
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
    // sin árboles cerca (la reserva de madera falla): el pico gastado abajo no se rehace ahí
    orden: async (tipo) => { v3.push('orden:' + tipo); if (tipo === 'tala' || bot.entity.position.y < 60) return { exito: false, pasos: [] }; poner('stone_pickaxe', 1); return { exito: true, pasos: [] } } })
  ok(r3.exito && r3.conseguidos >= 6, `pico gastado abajo: ${r3.causa} (${v3.join(' ')})`)
  ok(v3.indexOf('subir_a_superficie') >= 0 && v3.indexOf('subir_a_superficie') < v3.indexOf('orden:armate'), `sube antes de armarse: ${v3.join(' ')}`)

  // 2026-11-03, banco: el pico de hierro se gastaba dentro de la escalera; ahora la escalera para («pico gastado») y conseguir se
  // hace uno de repuesto abajo, con la madera de reserva, mientras el viejo aún pica; luego sigue bajando por el mismo rumbo
  for (const x of slots) if (x) slots[x.slot] = null
  bot.entity.position.y = 64; poner('iron_pickaxe', 1); poner('torch', 8); poner('bread', 4); poner('oak_log', 6)
  slots.find(x => x && x.name === 'iron_pickaxe').maxDurability = 250
  const v6 = []
  const r6 = await ejecutar(bot, 'diamante', 2, { ...ctx, entregar: false,
    paso: async (h, a) => {
      v6.push(h + (a && a[1] ? ' ' + a[1] : ''))
      const pico = slots.find(x => x && x.name === 'iron_pickaxe')
      let r = { exito: false, causa: 'no veo' }
      if (h === 'ir_a_mena') r = bot.entity.position.y <= -50 ? (poner('diamond', 2), { exito: true, picadas: 2 }) : r
      if (h === 'cavar_escalera') {
        if (pico.durabilityUsed === undefined) { pico.durabilityUsed = 245; bot.entity.position.y = 0; r = { exito: false, causa: 'pico gastado' } }
        else { bot.entity.position.y = +a[0]; r = { exito: true, causa: 'llegué' } }
      }
      return [r, { habilidad: h, exito: !!r.exito, causa: r.causa || '' }]
    },
    orden: async (tipo) => { v6.push('orden:' + tipo); if (tipo === 'armate') { quitar('oak_log', 3); poner('stone_pickaxe', 1) } return { exito: true, pasos: [] } } })
  ok(r6.exito && v6.includes('orden:armate'), `pico gastado en la escalera: repuesto y sigue (${r6.causa}: ${v6.join(' ')})`)
  ok(v6.filter(h => h === 'cavar_escalera norte').length === 2, `el mismo rumbo tras «pico gastado»: ${v6.join(' ')}`)

  // 2026-11-03: un golpe corta el paso (io.js: tarea cancelada con motivo «interrupcion»); conseguir reanuda y termina
  for (const x of slots) if (x) slots[x.slot] = null
  bot.entity.position.y = 64; poner('stone_pickaxe', 1); poner('torch', 8); poner('bread', 4)
  const t4 = { cancelada: false }
  let golpe = false, reanudo = 0
  const r4 = await ejecutar(bot, 'lapis', 6, { ...ctx, tarea: t4, entregar: false,
    reanudar: async () => { reanudo++; if (t4.motivo !== 'interrupcion') return false; t4.cancelada = false; t4.motivo = null; return true },
    paso: async (h, a) => {
      if (h === 'cavar_escalera' && !golpe) { golpe = true; t4.cancelada = true; t4.motivo = 'interrupcion'; return [{ exito: false, causa: 'cancelado' }, { habilidad: h, exito: false, causa: 'cancelado' }] }
      if (h === 'cavar_escalera') bot.entity.position.y = +a[0]
      const r = h === 'ir_a_mena' && bot.entity.position.y <= 0 ? (poner('lapis_lazuli', 6), { exito: true, picadas: 6 }) : h === 'cavar_escalera' ? { exito: true } : h === 'subir_a_superficie' ? (bot.entity.position.y = 64, { exito: true }) : { exito: false, causa: 'no veo' }
      return [r, { habilidad: h, exito: !!r.exito, causa: r.causa || '' }]
    } })
  ok(r4.exito && reanudo === 1, `golpe a mitad: reanuda y termina (${r4.causa}, reanudó ${reanudo})`)
  const t5 = { cancelada: false }
  const r5 = await ejecutar(bot, 'diamante', 9, { ...ctx, tarea: t5, entregar: false, reanudar: async () => false,
    paso: async (h) => { t5.cancelada = true; t5.motivo = 'usuario'; return [{ exito: false, causa: 'cancelado' }, { habilidad: h, exito: false, causa: 'cancelado' }] } })
  ok(!r5.exito && r5.causa === 'cancelado', `«para» sí lo corta: ${r5.causa}`)

  // salir del agua cortado por falta de aire cuenta como intento: no se repite hasta agotar las reanudaciones
  for (const x of slots) if (x) slots[x.slot] = null
  bot.entity.position.y = 64; poner('iron_pickaxe', 1); poner('torch', 8); poner('bread', 4); poner('oak_log', 6)
  const t7 = { cancelada: false }, v7 = []
  const azul = bot.blockAt, sinAgua = () => v7.length >= 2
  bot.blockAt = (w) => (!sinAgua() && Math.abs(w.y - (bot.entity.position.y + 1.6)) < 0.01 ? { name: 'water', boundingBox: 'empty', position: w } : azul(w))
  const r7 = await ejecutar(bot, 'diamante', 1, { ...ctx, tarea: t7, entregar: false,
    reanudar: async () => { if (t7.motivo !== 'interrupcion') return false; t7.cancelada = false; t7.motivo = null; return true },
    paso: async (h) => {
      v7.push(h)
      if (h === 'explorar') { t7.cancelada = true; t7.motivo = 'interrupcion'; return [{ exito: false, causa: 'cancelado' }, { habilidad: h, exito: false, causa: 'cancelado' }] }
      if (h === 'ir_a_mena') poner('diamond', 1)
      const r = { exito: h === 'ir_a_mena', picadas: 1 }
      return [r, { habilidad: h, exito: r.exito, causa: '' }]
    } })
  bot.blockAt = azul
  ok(r7.exito && v7.filter(h => h === 'explorar').length === 2, `salir del agua, dos veces como mucho: ${v7.join(' ')}`)

  // respirar: sube en línea recta (nunca con el navegador); si hay techo, lo pica sin saltar
  const { respirar } = require('./respirar')
  const agua = (roca) => {
    const hielo = new Set(roca), metas = []
    const b = mundoFalso({ pos: [0.5, 60, 0.5] })
    let salto = false
    b.pathfinder = { setGoal: (g) => metas.push(g) }
    b.setControlState = (c, v) => { if (c === 'jump') salto = v }
    b.dig = async (k) => { ok(!salto, 'pica sin saltar'); hielo.delete(k.position.y) }
    b.equip = async () => {}
    b.stopDigging = () => {}
    b.blockAt = (v) => {
      const y = Math.floor(v.y), bloque = (name, caja) => ({ name, boundingBox: caja, position: v.floored(), digTime: () => 500 })
      return hielo.has(y) ? bloque('stone', 'block') : y < 66 ? bloque('water', 'empty') : bloque('air', 'empty')
    }
    const t = setInterval(() => { if (salto && !hielo.has(Math.floor(b.entity.position.y + 2.62))) b.entity.position.y += 1 }, 20)
    return { b, metas, parar: () => clearInterval(t) }
  }
  // aireCercano: el aire por el agua, sin atravesar roca y por donde cabe el cuerpo
  const { aireCercano } = require('./respirar')
  const { Vec3 } = require('vec3')
  const recinto = (aguas, aires) => {
    const k = (x, y, z) => `${x},${y},${z}`, ag = new Set(aguas.map(c => k(...c))), ai = new Set(aires.map(c => k(...c)))
    const b = mundoFalso({ pos: [0.5, 60, 0.5] })
    b.blockAt = (v) => { const p = v.floored(), n = ag.has(k(p.x, p.y, p.z)) ? 'water' : ai.has(k(p.x, p.y, p.z)) ? 'air' : 'stone'
      return { name: n, boundingBox: n === 'stone' ? 'block' : 'empty', position: p } }
    return b
  }
  const tubo = (x0, x1, z = 0) => { const c = []; for (let x = x0; x <= x1; x++) c.push([x, 60, z], [x, 61, z]); return c }
  const codo = recinto([...tubo(0, 2), ...tubo(2, 2, 1), ...tubo(2, 2, 2)], [[2, 62, 2]])
  const hc = aireCercano(codo)
  ok(hc && hc.meta.equals(new Vec3(2, 62, 2)) && hc.paso.equals(new Vec3(1, 61, 0)), `aire tras un codo de agua: ${JSON.stringify(hc)}`)
  ok(aireCercano(recinto(tubo(0, 2), [[5, 61, 0], [5, 60, 0]])) === null, 'no atraviesa la roca')
  ok(aireCercano(recinto(tubo(0, 3), [])) === null, 'recinto sellado: null')
  const bajo = recinto([[0, 60, 0], [0, 61, 0], [1, 61, 0], [2, 61, 0], [2, 60, 0]], [[2, 62, 0]])
  ok(aireCercano(bajo) === null, 'por un hueco de 1 de alto no cabe el cuerpo')
  ok(aireCercano(recinto(tubo(0, 20), [[20, 62, 0]])) === null, 'más lejos de 8 pasos: null')
  const a1 = agua([])
  const ra = await respirar(a1.b, 3000); a1.parar()
  ok(ra.fuera && ra.picados === 0, `agua abierta: sube y sale ${JSON.stringify(ra)}`)
  ok(a1.metas.every(g => g === null), 'sin objetivo en el navegador')
  const a2 = agua([63])
  const rb = await respirar(a2.b, 3000); a2.parar()
  ok(rb.fuera && rb.picados === 1, `con techo: lo pica y sale ${JSON.stringify(rb)}`)

  const a3 = agua([]); a3.b.oxygenLevel = 5
  setTimeout(() => { a3.b.oxygenLevel = 20 }, 400)
  const rc = await respirar(a3.b, 3000); a3.parar()
  ok(rc.fuera && rc.ms >= 400, `a flote hasta recuperar el aire: ${JSON.stringify(rc)}`)

  // combustible: por especie (1 de roble y 3 de abedul: abedul; 1 y 1: no llega con ninguna)
  const { combustible } = require('./habilidades/fundir')
  const conInv = (...l) => ({ inventory: { items: () => l.map(([name, count]) => ({ name, count })) } })
  ok(String(combustible(conInv(['oak_planks', 1], ['birch_planks', 3]), 3, null, 'raw_iron')) === 'birch_planks,2', 'combustible: la especie que llega')
  ok(combustible(conInv(['oak_planks', 1], ['birch_planks', 1]), 3, null, 'raw_iron') === null, 'combustible: sumar especies no vale')

  // túnel: la lava junto a la casilla que va a abrir se tapa con piedra; sin relleno, para
  const { tapar } = require('./habilidades/tunel')
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
