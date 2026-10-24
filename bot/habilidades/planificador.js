// Planificador de recetas (F8.0b, C6: `fabricar` genérico): qué fabricar y en qué orden para tener un objeto, con las recetas de
// minecraft-data y lo que hay en el inventario, sin tocar el bot (función pura: lo prueba bot/probar_fundacion_seco.js).
//   planear(registry, [[objeto, n], …], inventario) → { pasos: [{ item, veces, mesa }], faltan: { objeto: n } }
// minecraft-data trae cada receta desplegada por variante (un cofre por tipo de tablón, una cama por madera…) y no mezcla variantes:
// se prueba cada una sobre una copia del inventario y se queda la que deja menos faltas (y, a igualdad, menos pasos). Lo que no se
// fabrica en la mesa (troncos, menas, lingotes, lana, carbón, piedra…: HOJAS) no se planea: si falta, va a `faltan` y lo consiguen
// otras habilidades (talar, minar, fundir, cazar). Sin ciclos (una cama no sale de otra cama) y con un límite de profundidad.
const HOJAS = /(_log|_wood|_stem|_hyphae)$|^raw_|_ore$|_ingot$|^(coal|charcoal|diamond|emerald|redstone|lapis_lazuli|quartz|ender_pearl|blaze_rod|leather|string|feather|sand|red_sand|gravel|clay_ball|flint|cobblestone|cobbled_deepslate|blackstone|stone|obsidian|bone|slime_ball|gunpowder|iron_nugget|gold_nugget|wheat|sugar_cane|egg|honeycomb)$|_wool$|_dye$/
const PROFUNDIDAD = 6

const nombre = (registry, id) => (registry.items[id] || {}).name
// Lo que gasta una receta (por nombre de objeto) y si pide mesa (más de 2×2).
function gasto(registry, receta) {
  const ids = receta.inShape ? receta.inShape.flat() : receta.ingredients || []
  const g = {}
  for (const id of ids) if (id != null) { const n = nombre(registry, id); g[n] = (g[n] || 0) + 1 }
  const mesa = !!receta.inShape && (receta.inShape.length > 2 || receta.inShape.some(f => f.length > 2))
  return { g, mesa, sale: receta.result.count || 1 }
}

// Pide n de `item` sobre `inv` (se gasta lo que hay y se apunta lo fabricado). Devuelve { pasos, faltan } y deja inv como quedaría.
function pedir(registry, item, n, inv, camino) {
  const out = { pasos: [], faltan: {} }
  const hay = inv[item] || 0
  if (hay >= n) { inv[item] = hay - n; return out }
  inv[item] = 0
  const falta = n - hay
  const recetas = (registry.recipes || {})[(registry.itemsByName[item] || {}).id] || []
  if (HOJAS.test(item) || !recetas.length || camino.length >= PROFUNDIDAD || camino.includes(item)) {
    out.faltan[item] = falta
    return out
  }
  let mejor = null
  for (const receta of recetas) {
    const { g, mesa, sale } = gasto(registry, receta)
    if (Object.keys(g).some(x => camino.includes(x) || x === item)) continue // sin ciclos
    const copia = { ...inv }, veces = Math.ceil(falta / sale), plan = { pasos: [], faltan: {} }
    for (const [x, k] of Object.entries(g)) {
      const p = pedir(registry, x, k * veces, copia, [...camino, item])
      plan.pasos.push(...p.pasos)
      for (const [f, m] of Object.entries(p.faltan)) plan.faltan[f] = (plan.faltan[f] || 0) + m
    }
    plan.pasos.push({ item, veces, mesa })
    copia[item] = (copia[item] || 0) + veces * sale - falta
    // a igualdad, la variante de roble (si falta todo, pedir «cherry_log» despista: el roble es el árbol más común)
    const coste = [Object.values(plan.faltan).reduce((a, b) => a + b, 0), plan.pasos.length + (Object.keys(g).some(x => x.startsWith('oak_')) ? 0 : 0.5)]
    if (!mejor || coste[0] < mejor.coste[0] || (coste[0] === mejor.coste[0] && coste[1] < mejor.coste[1])) mejor = { plan, copia, coste }
    if (coste[0] === 0 && coste[1] === 1) break // no se puede hacer mejor
  }
  if (!mejor) { out.faltan[item] = falta; return out }
  Object.assign(inv, mejor.copia)
  for (const k of Object.keys(inv)) if (!(k in mejor.copia)) delete inv[k]
  return mejor.plan
}

// objetivos: [[objeto, n], …] en orden; inventario: { nombre: n } (no se modifica).
function planear(registry, objetivos, inventario) {
  const inv = { ...inventario }, pasos = [], faltan = {}
  for (const [item, n] of objetivos) {
    if (!registry.itemsByName[item]) { faltan[item] = n; continue }
    const p = pedir(registry, item, n, inv, [])
    pasos.push(...p.pasos)
    for (const [f, m] of Object.entries(p.faltan)) faltan[f] = (faltan[f] || 0) + m
  }
  return { pasos, faltan, sobra: inv }
}

module.exports = { planear, HOJAS, gasto }
