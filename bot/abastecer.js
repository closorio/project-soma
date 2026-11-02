// Abastecer una obra del catálogo (2026-11-02): qué hacer para tener lo que falta, sin tocar el bot (función pura: la prueba
// bot/probar_abastecer_seco.js). El bucle de io.js («construye X en x y z») lo ejecuta paso a paso con las órdenes de siempre.
//   planAbasto(registry, faltan, inv, enCofres, { hayHorno, evitar }) → { pasos: [{ tipo, …, para }], pedir: { objeto: n } }
// Por orden: 1. lo que haya en los cofres de HOGAR (saca); 2. lo que se fabrica, con planificador.planear (sus ingredientes, también de
// los cofres si están); las hojas que falten, por tabla: troncos → tala; piedra, arena, grava, tierra, arcilla → mina; menas y lingotes →
// mina (+ funde); cristal → mina arena + funde; lana blanca, cuero, plumas → caza; carbón → mina; 3. el resto (tintes, diamante, lo que
// no se consigue) → pedir al usuario. Lo fundido pide combustible (troncos) y, sin horno a mano, 8 de piedra para hacerlo.
//   tanda(registry, plano, colocados, huecos) → { bloques: n, objetos: { objeto: n } }: los siguientes bloques por poner, en el orden de
// colocación, que caben en `huecos` ranuras de la mochila (la mochila no lleva una casa entera).
const { planear, HOJAS } = require('./habilidades/planificador')
const estructuras = require('./estructuras')

// cómo se consigue cada hoja: [orden, cuántos por unidad] (minar piedra da adoquín; la arcilla suelta 4 bolas)
const MENA = { iron: 'iron_ore', gold: 'gold_ore', copper: 'copper_ore' }
const FUNDE_ES = { iron: 'hierro', gold: 'oro', copper: 'cobre' }
function hoja(item, n) {
  let m
  if (/_log$/.test(item)) return [{ tipo: 'tala', n }]
  if (/^(cobblestone|cobbled_deepslate)$/.test(item)) return [{ tipo: 'mina', bloque: 'stone', n }]
  if (item === 'stone') return [{ tipo: 'mina', bloque: 'stone', n }, { tipo: 'funde', entrada: 'piedra', n }]
  if (item === 'smooth_stone') return [{ tipo: 'mina', bloque: 'stone', n }, { tipo: 'funde', entrada: 'piedra', n }, { tipo: 'funde', entrada: 'stone', n }]
  if (/^(sand|red_sand|gravel|dirt)$/.test(item)) return [{ tipo: 'mina', bloque: item, n }]
  if (item === 'clay_ball') return [{ tipo: 'mina', bloque: 'clay', n: Math.ceil(n / 4) }]
  if (item === 'terracotta') return [{ tipo: 'mina', bloque: 'clay', n }, { tipo: 'funde', entrada: 'clay', n }]
  if (item === 'glass') return [{ tipo: 'mina', bloque: 'sand', n }, { tipo: 'funde', entrada: 'arena', n }]
  if ((m = /^raw_(iron|gold|copper)$/.exec(item))) return [{ tipo: 'mina', bloque: MENA[m[1]], n }]
  if ((m = /^(iron|gold|copper)_ingot$/.exec(item))) return [{ tipo: 'mina', bloque: MENA[m[1]], n }, { tipo: 'funde', entrada: FUNDE_ES[m[1]], n }]
  // el carbón vegetal (que el planificador elige para las antorchas) se cambia por carbón de mena: fabricar vuelve a planear con él
  if (item === 'coal' || item === 'charcoal') return [{ tipo: 'mina', bloque: 'coal_ore', n }]
  if (item === 'white_wool') return [{ tipo: 'cazar', animal: 'sheep', n }]
  if (item === 'leather') return [{ tipo: 'cazar', animal: 'cow', n }]
  if (item === 'feather') return [{ tipo: 'cazar', animal: 'chicken', n }]
  return null
}
const fundidos = (pasos) => pasos.filter(p => p.tipo === 'funde').reduce((a, p) => a + p.n, 0)

// evitar: { hoja: n } que ya no se encontró cerca (arena, ovejas…): va a pedir en vez de a minar o cazar otra vez
// La madera de la que más hay (troncos ×4 y tablones, en la mochila y los cofres), o null si no hay ninguna
function maderaPreferida(inv, cofre) {
  const cuenta = {}
  for (const fuente of [inv, cofre]) for (const [k, n] of Object.entries(fuente || {})) {
    const m = estructuras.madera(k), f = estructuras.familia(k)
    if (m && /log|wood|planks/.test(f)) cuenta[m] = (cuenta[m] || 0) + n * (f === 'planks' ? 1 : 4)
  }
  return Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]?.[0] || null
}

function planAbasto(registry, faltanPedidas, inv, enCofres, { hayHorno = true, evitar = {}, conPico = false } = {}) {
  const pasos = [], pedir = {}
  const cofre = { ...(enCofres || {}) }
  // la madera da igual (estructuras.familia): lo de madera que falte, en la que más haya, para no talar ni pedir otra
  const madera = maderaPreferida(inv, cofre), faltan = {}
  // los tablones, repartidos entre los troncos de cada madera que haya (Oqva, 2026-11-02: 7 de abedul y 3 de roble); el resto de piezas
  // y lo que no cubran los troncos, en la que más haya
  const troncos = {}
  for (const fuente of [inv, cofre]) for (const [k, n] of Object.entries(fuente || {})) if (/log|wood/.test(estructuras.familia(k) || '')) troncos[estructuras.madera(k)] = (troncos[estructuras.madera(k)] || 0) + n
  for (const [k, n] of Object.entries(faltanPedidas)) {
    let resto = n
    if (estructuras.familia(k) === 'planks') {
      for (const [m, t] of Object.entries(troncos).sort((a, b) => b[1] - a[1])) {
        const usa = Math.min(resto, t * 4), k2 = estructuras.conMadera(k, m, registry)
        // k2 === k en otra madera: esa pieza no existe en ella
        if (usa > 0 && (k2 !== k || estructuras.madera(k) === m)) { faltan[k2] = (faltan[k2] || 0) + usa; troncos[m] -= Math.ceil(usa / 4); resto -= usa }
        if (!resto) break
      }
    }
    if (resto > 0) { const k2 = estructuras.conMadera(k, madera, registry); faltan[k2] = (faltan[k2] || 0) + resto }
  }
  const sacar = (item, n) => { // de los cofres lo que haya, hasta n; devuelve cuánto se sacó
    const k = Math.min(n, cofre[item] || 0)
    if (k > 0) { cofre[item] -= k; pasos.push({ tipo: 'saca', objeto: item, n: k, para: item }) }
    return k
  }
  // 1. directamente de los cofres
  const resto = []
  for (const [item, n] of Object.entries(faltan)) {
    const r = n - sacar(item, n)
    if (r > 0) resto.push([item, r])
  }
  // 2. lo fabricable: el planificador sobre la mochila + lo que quede en los cofres (lo que gaste de ellos, se saca)
  const conseguir = [], fabricar = []
  const recetas = (item) => ((registry.recipes || {})[(registry.itemsByName[item] || {}).id] || []).length > 0
  const directos = resto.filter(([item]) => !registry.itemsByName[item] || HOJAS.test(item) || !recetas(item)) // troncos, piedra…: se consiguen
  const fabricables = resto.filter(r => !directos.includes(r))
  const hojas = Object.fromEntries(directos)
  if (fabricables.length) {
    // todos juntos sobre la mochila + lo que quede en los cofres (`faltan` ya descuenta la mochila: lo pedido en sí, a cero)
    const base = { ...inv }
    for (const [k, v] of Object.entries(cofre)) if (v > 0) base[k] = (base[k] || 0) + v
    for (const [item] of fabricables) base[item] = 0
    const plan = planear(registry, fabricables, base)
    // lo que gastó de los cofres: lo que había en la base menos lo que sobra, por encima de lo que ya llevaba
    for (const [k, v] of Object.entries(cofre)) {
      const deCofre = Math.min(v, (base[k] || 0) - (plan.sobra[k] || 0) - (inv[k] || 0))
      if (deCofre > 0) sacar(k, deCofre)
    }
    for (const [item, n] of fabricables) fabricar.push({ tipo: 'fabrica', objeto: item, n, para: item })
    for (const [h, m] of Object.entries(plan.faltan)) hojas[h] = (hojas[h] || 0) + m
  }
  for (const [h, m] of Object.entries(hojas)) {
    const como = registry.itemsByName[h] && !evitar[h] && hoja(h, m)
    if (como) conseguir.push(...como.map(p => ({ ...p, para: h })))
    else pedir[h] = (pedir[h] || 0) + m
  }
  // 3. el horno y el combustible de lo que se funde (un tronco son 4 tablones: 6 fundidos)
  const f = fundidos(conseguir)
  if (f) {
    const combustible = Object.entries(inv).filter(([k]) => /^(coal|charcoal)$/.test(k)).reduce((a, [, v]) => a + v * 8, 0) +
      Object.entries(inv).filter(([k]) => /_log$|_planks$/.test(k)).reduce((a, [k, v]) => a + v * (k.endsWith('_log') ? 6 : 1.5), 0)
    if (combustible < f) conseguir.unshift({ tipo: 'tala', n: Math.ceil((f - combustible) / 6), para: 'combustible' })
    const piedra = (inv.cobblestone || 0) + (inv.cobbled_deepslate || 0)
    if (!hayHorno && !inv.furnace && piedra < 8) conseguir.unshift({ tipo: 'mina', bloque: 'stone', n: 8 - piedra, para: 'furnace' })
  }
  // minar piedra o menas pide pico: si no lleva ninguno, uno de madera antes de minar (Oqva, 2026-11-02: cavó hasta el carbón sin pico)
  // (otra vez el plan entero con el pico: los troncos y los cofres se cuentan una vez para todo)
  const minaDura = conseguir.some(p => p.tipo === 'mina' && /stone|_ore$/.test(p.bloque))
  if (minaDura && !conPico && !Object.keys(inv).some(k => /_pickaxe$/.test(k))) {
    return planAbasto(registry, { wooden_pickaxe: 1, ...faltanPedidas }, inv, enCofres, { hayHorno, evitar, conPico: true })
  }
  // juntar lo repetido (dos «tala» o dos «mina stone») y ordenar: sacar, talar, el pico, minar y cazar, fundir, fabricar
  const junta = (lista) => {
    const out = []
    for (const p of lista) {
      const igual = out.find(q => q.tipo === p.tipo && q.bloque === p.bloque && q.entrada === p.entrada && q.animal === p.animal && q.objeto === p.objeto)
      if (igual) { igual.n += p.n; if (!igual.para.split(', ').includes(p.para)) igual.para += ', ' + p.para } else out.push({ ...p })
    }
    return out
  }
  const PESO = { saca: 0, tala: 1, mina: 2, cazar: 2, funde: 3, fabrica: 4 }
  const peso = (p) => (p.tipo === 'fabrica' && /_pickaxe$/.test(p.objeto) ? 1.5 : PESO[p.tipo])
  const todo = junta([...pasos, ...conseguir, ...fabricar]).sort((a, b) => peso(a) - peso(b))
  return { pasos: todo, pedir }
}

// Los siguientes bloques por poner que caben en la mochila: cada objeto distinto ocupa ceil(n / tamaño de pila) ranuras
function tanda(registry, plano, colocados, huecos) {
  const objetos = {}
  let bloques = 0
  const ranuras = (o) => Object.entries(o).reduce((a, [k, n]) => a + Math.ceil(n / ((registry.itemsByName[k] || {}).stackSize || 64)), 0)
  for (const b of estructuras.ordenar(plano)) {
    if (colocados.has(b[0] + ',' + b[1] + ',' + b[2])) continue
    const prueba = { ...objetos }
    for (const o of estructuras.objetosDe(plano.paleta[b[3]])) prueba[o.item] = (prueba[o.item] || 0) + o.n
    if (bloques > 0 && ranuras(prueba) > huecos) break
    Object.assign(objetos, prueba)
    bloques++
  }
  return { bloques, objetos }
}

module.exports = { planAbasto, tanda, hoja, maderaPreferida }
