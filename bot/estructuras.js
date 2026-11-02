// Catálogo de estructuras (bot/estructuras/<id>.json, importadas de .litematic con herramientas/importar_estructura.js).
// Funciones puras, sin bot: cargar el catálogo, qué objeto hace falta para cada estado de bloque y en qué orden colocarlos.
// Formato: { id, nombre, alias, fuente, dim: [x, y, z], paleta: ["oak_stairs[facing=north,half=bottom]", …],
//            bloques: [[dx, dy, dz, iPaleta], …] (sin aire), materiales: { item: n }, sinConseguir: [item…], notas }.
// El origen (0, 0, 0) es la esquina de x, y y z mínimos, como en planos.js: la posición que da el usuario es esa esquina.
const fs = require('fs')
const path = require('path')

const E = module.exports = { DIR: path.join(__dirname, 'estructuras') } // DIR se cambia en las pruebas

// "oak_stairs[facing=north,half=bottom]" → nombre y propiedades
function parse(estado) {
  const m = /^(?:minecraft:)?([a-z0-9_]+)(?:\[(.*)\])?$/.exec(String(estado))
  if (!m) return { nombre: String(estado), props: {} }
  const props = {}
  if (m[2]) for (const kv of m[2].split(',')) { const [k, v] = kv.split('='); props[k] = v }
  return { nombre: m[1], props }
}
E.parse = parse
E.nombre = (estado) => parse(estado).nombre
E.props = (estado) => parse(estado).props

// Bloques que no se colocan ni cuentan: el aire, el fuego y las mitades que crea la otra (puerta o planta alta, cabeza de cama)
const SIN_OBJETO = new Set(['air', 'cave_air', 'void_air', 'fire', 'soul_fire', 'piston_head', 'moving_piston'])
const PLANTA_ALTA = /^(tall_grass|large_fern|sunflower|lilac|rose_bush|peony|tall_seagrass)$/
const SIN_CONSEGUIR = /(_leaves$|^spawner$|^trial_spawner$|^budding_amethyst$|^netherite_|^bedrock$|^barrier$|^light$|_command_block$|^command_block$|^structure_block$|^end_portal_frame$|^reinforced_deepslate$|^vault$|^ancient_debris$)/

// Bloques cuyo objeto se llama de otra forma (cultivos, tallos, plantas que crecen de un fruto…)
const OBJETO = {
  redstone_wire: 'redstone', grass_block: 'dirt', tripwire: 'string', cocoa: 'cocoa_beans', sweet_berry_bush: 'sweet_berries',
  wheat: 'wheat_seeds', carrots: 'carrot', potatoes: 'potato', beetroots: 'beetroot_seeds', torchflower_crop: 'torchflower_seeds',
  pitcher_crop: 'pitcher_pod', melon_stem: 'melon_seeds', attached_melon_stem: 'melon_seeds', pumpkin_stem: 'pumpkin_seeds',
  attached_pumpkin_stem: 'pumpkin_seeds', bamboo_sapling: 'bamboo', cave_vines: 'glow_berries', cave_vines_plant: 'glow_berries',
  kelp_plant: 'kelp', twisting_vines_plant: 'twisting_vines', weeping_vines_plant: 'weeping_vines', big_dripleaf_stem: 'big_dripleaf',
  tall_seagrass: 'seagrass', powder_snow: 'powder_snow_bucket',
}

// Qué objetos hacen falta para poner un estado: [{ item, n }…], vacío si no se pone (aire, mitad que crea la otra, agua que fluye)
E.objetosDe = (estado) => {
  const { nombre, props } = parse(estado)
  if (SIN_OBJETO.has(nombre)) return []
  if (props.half === 'upper' && (/_door$/.test(nombre) || PLANTA_ALTA.test(nombre))) return []
  if (props.part === 'head' && /_bed$/.test(nombre)) return []
  if (nombre === 'water' || nombre === 'lava') return props.level && props.level !== '0' ? [] : [{ item: nombre + '_bucket', n: 1 }]
  if (/_slab$/.test(nombre)) return [{ item: nombre, n: props.type === 'double' ? 2 : 1 }]
  // maceta con planta: la maceta y la planta (las macetas de azalea se llaman *_bush, la planta no)
  if (/^potted_/.test(nombre)) return [{ item: 'flower_pot', n: 1 }, { item: nombre.slice(7).replace(/_bush$/, ''), n: 1 }]
  let item = OBJETO[nombre] || nombre
  if (/_wall_(torch|sign|hanging_sign|banner|head|skull|fan)$|^wall_torch$/.test(nombre)) item = nombre.replace(/wall_/, '')
  return [{ item, n: 1 }]
}
// El objeto principal ({ item, n }) o null si no se pone
E.objetoDe = (estado) => E.objetosDe(estado)[0] || null

// ¿No se consigue en supervivencia temprana? (por el nombre del bloque)
E.sinConseguir = (estado) => SIN_CONSEGUIR.test(parse(estado).nombre)

// --- orden de colocación -------------------------------------------------------------------------------------------------------
const DEPENDIENTE = new RegExp('(^|_)(torch|door|trapdoor|button|carpet|bed|pressure_plate|banner|sign|hanging_sign|concrete_powder|' +
  'sapling|tulip|mushroom|rail|anvil|lantern|chain)$|^(potted_.*|ladder|lever|repeater|comparator|redstone_wire|sand|red_sand|gravel|' +
  'dandelion|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|torchflower|short_grass|fern|' +
  'dead_bush|sugar_cane|cactus|flower_pot|snow|lily_pad|scaffolding|pointed_dripstone|spore_blossom|hanging_roots|' +
  'tall_grass|large_fern|sunflower|lilac|rose_bush|peony)$')
const VEC = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] }

// Las casillas en las que puede apoyarse un dependiente, por preferencia ([] si se apoya en cualquier vecino o no se sabe)
function soportes(nombre, props, x, y, z) {
  const f = VEC[props.facing], arriba = [x, y + 1, z], abajo = [x, y - 1, z], detras = f ? [[x - f[0], y, z - f[2]]] : []
  if (/_trapdoor$/.test(nombre) || /_wall_hanging_sign$/.test(nombre)) return []
  if (/_hanging_sign$/.test(nombre) || nombre === 'spore_blossom' || nombre === 'hanging_roots') return [arriba]
  if (/(^|_)wall_/.test(nombre) || /_wall_/.test(nombre) || nombre === 'ladder') return detras
  if (/_button$/.test(nombre) || nombre === 'lever') {
    if (props.face === 'ceiling') return [arriba]
    if (props.face === 'wall') return detras
  }
  if (/lantern$/.test(nombre)) return [props.hanging === 'true' ? arriba : abajo]
  if (nombre === 'pointed_dripstone') return [props.vertical_direction === 'down' ? arriba : abajo]
  if (/chain$/.test(nombre)) return props.axis === 'y' ? [arriba, abajo] : []
  return [abajo]
}

// Los bloques del plano en el orden en que se colocan: por capas (dy ascendente); en cada capa primero los completos, del borde hacia
// dentro (como levantar), y después los dependientes, que necesitan su soporte ya puesto (antorchas, puertas, trampillas, escaleras de
// mano, carteles, botones, alfombras, camas, plantas, faroles, arena y grava). Un dependiente sobre otro dependiente va detrás de él, y
// el que cuelga del techo (farol, cadena, cartel colgante, botón de techo) se pasa a la capa de su soporte, detrás de sus completos.
// No salen los bloques sin objeto (mitad alta de la puerta, cabeza de la cama…): los crea la mitad que sí se coloca.
E.ordenar = (plano) => {
  const [X, , Z] = plano.dim
  const info = plano.paleta.map(parse)
  const nec = plano.paleta.map(e => E.objetoDe(e) !== null)
  const dep = info.map(i => DEPENDIENTE.test(i.nombre))
  const clave = (b) => b[0] + ',' + b[1] + ',' + b[2]
  const lista = plano.bloques.filter(b => nec[b[3]]).map((b, i) => ({ b, i, borde: Math.min(b[0], X - 1 - b[0], b[2], Z - 1 - b[2]) }))
  const en = new Map(lista.map(o => [clave(o.b), o]))
  // el soporte de cada dependiente: el primero de sus candidatos que está en el plano (o ninguno: se apoya en el mundo)
  for (const o of lista) if (dep[o.b[3]]) {
    const { nombre, props } = info[o.b[3]]
    const s = soportes(nombre, props, o.b[0], o.b[1], o.b[2]).map(c => en.get(c.join(','))).find(Boolean)
    o.soporte = s && s !== o ? s : null
  }
  // capa en la que se coloca: la suya, o la de su soporte si está más arriba (siguiendo la cadena de dependientes)
  const capaDe = (o, vistos = new Set()) => {
    if (o.capa !== undefined) return o.capa
    if (vistos.has(o)) return o.b[1] // un ciclo no debería darse; si se da, no se atasca
    vistos.add(o)
    const s = dep[o.b[3]] && o.soporte
    o.capa = s ? Math.max(o.b[1], dep[s.b[3]] ? capaDe(s, vistos) : s.b[1]) : o.b[1]
    return o.capa
  }
  const capas = new Map()
  for (const o of lista) { const c = capaDe(o); if (!capas.has(c)) capas.set(c, []); capas.get(c).push(o) }
  const salida = []
  for (const dy of [...capas.keys()].sort((a, c) => a - c)) {
    const capa = capas.get(dy)
    salida.push(...capa.filter(o => !dep[o.b[3]]).sort((a, c) => a.borde - c.borde || a.i - c.i).map(o => o.b))
    let pend = capa.filter(o => dep[o.b[3]]).sort((a, c) => a.b[1] - c.b[1] || a.i - c.i)
    while (pend.length) {
      const quedan = new Set(pend)
      const listos = pend.filter(o => !o.soporte || !quedan.has(o.soporte))
      const ahora = listos.length ? listos : pend // un ciclo no debería darse; si se da, no se atasca
      salida.push(...ahora.map(o => o.b))
      pend = pend.filter(o => !ahora.includes(o))
    }
  }
  return salida
}

// --- la madera, intercambiable (2026-11-02, pedido del usuario: «lo funcional primero») -----------------------------------------
// Tablones, losas, escaleras, puertas, trampillas, vallas, botones, placas, carteles y troncos valen de cualquier madera: la de la
// plantilla es orientativa. familia('birch_stairs') = 'stairs'; mismoMaterial('oak_stairs', 'birch_stairs') = true.
const MADERAS = ['dark_oak', 'pale_oak', 'oak', 'spruce', 'birch', 'jungle', 'acacia', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped']
const FORMAS = ['planks', 'slab', 'stairs', 'door', 'trapdoor', 'fence_gate', 'fence', 'button', 'pressure_plate', 'wall_hanging_sign',
  'hanging_sign', 'wall_sign', 'sign', 'log', 'wood', 'stem', 'hyphae']
const RE_MADERA = new RegExp(`^(stripped_)?(${MADERAS.join('|')})_(${FORMAS.join('|')})$`)
E.MADERAS = MADERAS
// La familia de un bloque u objeto de madera («stairs», «stripped_log»…) o null si no es de madera
E.familia = (nombre) => { const m = RE_MADERA.exec(String(nombre)); return m ? (m[1] || '') + m[3].replace(/^stem$/, 'log').replace(/^hyphae$/, 'wood') : null }
E.madera = (nombre) => { const m = RE_MADERA.exec(String(nombre)); return m ? m[2] : null }
E.mismoMaterial = (a, b) => a === b || (!!E.familia(a) && E.familia(a) === E.familia(b))
// El mismo objeto en otra madera (oak_stairs, birch → birch_stairs), si existe en el registro (las del Nether no tienen log, sino stem)
E.conMadera = (nombre, madera, registry) => {
  const m = RE_MADERA.exec(String(nombre))
  if (!m || !madera) return nombre
  let forma = m[3]
  if (/^(crimson|warped)$/.test(madera)) forma = forma.replace(/^log$/, 'stem').replace(/^wood$/, 'hyphae')
  else forma = forma.replace(/^stem$/, 'log').replace(/^hyphae$/, 'wood')
  const otro = `${m[1] || ''}${madera}_${forma}`
  return !registry || registry.itemsByName[otro] ? otro : nombre
}
// Lo que falta de `necesito` ({ objeto: n }) con `inv`, juntando por familia lo de madera (cualquier madera vale): { objeto: n }
E.faltaCon = (necesito, inv) => {
  const clave = (k) => (E.familia(k) ? 'madera:' + E.familia(k) : k)
  const hay = {}
  for (const [k, n] of Object.entries(inv || {})) hay[clave(k)] = (hay[clave(k)] || 0) + n
  const falta = {}
  for (const [k, n] of Object.entries(necesito)) {
    const c = clave(k), usa = Math.min(n, hay[c] || 0)
    hay[c] = (hay[c] || 0) - usa
    if (n - usa > 0) falta[k] = n - usa
  }
  return falta
}

// Los objetos que faltan para los bloques pendientes (los que no están en `colocados`, un Set de "dx,dy,dz") descontando el inventario
E.faltanPara = (plano, colocados, inv) => {
  const quedan = {}
  const cache = plano.paleta.map(e => E.objetosDe(e))
  for (const b of plano.bloques) {
    if (colocados && colocados.has(b[0] + ',' + b[1] + ',' + b[2])) continue
    for (const o of cache[b[3]]) quedan[o.item] = (quedan[o.item] || 0) + o.n
  }
  return E.faltaCon(quedan, inv)
}

// --- girar (2026-11-02: «construye casa en x y z mirando al este») --------------------------------------------------------------
// Vueltas de 90° en el sentido de las agujas del reloj, visto desde arriba (norte arriba): norte → este → sur → oeste. La caja gira entera:
// (x, z) → (Z−1−z, x) y dim x↔z; la esquina que da el usuario sigue siendo la de x, y, z mínimos de la caja ya girada. Con los bloques
// gira su estado: facing, axis, rotation (carteles y estandartes de suelo, cabezas), las conexiones north/east/south/west (vallas,
// paneles, muros, enredaderas, redstone) y la forma de los raíles; hinge, half, type y la forma de las escaleras no dependen del giro.
const HORARIO = ['north', 'east', 'south', 'west']
const girarDir = (d, v) => (HORARIO.includes(d) ? HORARIO[(HORARIO.indexOf(d) + v) % 4] : d)
function girarRail(forma, v) {
  const p = forma.split('_')
  if (p[0] === 'ascending') return 'ascending_' + girarDir(p[1], v)
  const [a, b] = p.map(d => girarDir(d, v))
  const set = new Set([a, b])
  if (set.has('north') && set.has('south')) return 'north_south'
  if (set.has('east') && set.has('west')) return 'east_west'
  return (set.has('north') ? 'north' : 'south') + '_' + (set.has('east') ? 'east' : 'west')
}
E.girarEstado = (estado, vueltas) => {
  const v = ((vueltas % 4) + 4) % 4
  if (!v) return estado
  const { nombre, props } = parse(estado)
  const n = {}
  for (const [k, val] of Object.entries(props)) {
    if (HORARIO.includes(k)) n[girarDir(k, v)] = val // conexiones: el valor de north pasa a la dirección girada
    else if (k === 'facing') n[k] = girarDir(val, v)
    else if (k === 'axis' && v % 2 && (val === 'x' || val === 'z')) n[k] = val === 'x' ? 'z' : 'x'
    else if (k === 'rotation') n[k] = String((parseInt(val) + 4 * v) % 16)
    else if (k === 'shape' && /rail$/.test(nombre)) n[k] = girarRail(val, v)
    else n[k] = val
  }
  const claves = Object.keys(n).sort()
  return claves.length ? `${nombre}[${claves.map(k => `${k}=${n[k]}`).join(',')}]` : nombre
}
// El lado de la entrada del plano: el que trae (frente, del importador) o el de fuera de su primera puerta (su facing mira hacia
// dentro); sin puerta, sur. Para plantillas importadas antes de que existiera «frente»
E.frenteDe = (plano) => {
  if (plano.frente) return plano.frente
  const OPUESTA = { north: 'south', south: 'north', east: 'west', west: 'east' }
  const p = plano.bloques.map(b => parse(plano.paleta[b[3]])).find(e => /_door$/.test(e.nombre) && e.props.half === 'lower')
  return (p && OPUESTA[p.props.facing]) || 'south'
}
// El plano girado (uno nuevo; el del catálogo no se toca). frente gira con él.
E.girar = (plano, vueltas) => {
  const v = ((vueltas % 4) + 4) % 4
  if (!v) return plano
  let [X, , Z] = plano.dim
  let bloques = plano.bloques.map(b => b.slice())
  for (let i = 0; i < v; i++) { bloques = bloques.map(([x, y, z, k]) => [Z - 1 - z, y, x, k]); [X, Z] = [Z, X] }
  return { ...plano, dim: [X, plano.dim[1], Z], paleta: plano.paleta.map(e => E.girarEstado(e, v)), bloques, frente: girarDir(E.frenteDe(plano), v), giro: v }
}
// Las vueltas que llevan la entrada (frente) del plano a `dir` (north|east|south|west)
E.vueltasPara = (plano, dir) => (HORARIO.indexOf(dir) - HORARIO.indexOf(E.frenteDe(plano)) + 4) % 4
E.HORARIO = HORARIO

// --- el catálogo en disco ------------------------------------------------------------------------------------------------------
E.ids = () => (fs.existsSync(E.DIR) ? fs.readdirSync(E.DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort() : [])
// Una casa grande pesa megas y porAlias se mira con cada mensaje del chat: se guarda lo leído y se relee solo si cambia el archivo
const leidas = new Map() // ruta → { mtime, e }
E.cargar = (id) => {
  const f = path.join(E.DIR, id + '.json')
  let st
  try { st = fs.statSync(f) } catch (_) { leidas.delete(f); return null }
  const c = leidas.get(f)
  if (c && c.mtime === st.mtimeMs && c.size === st.size) return c.e
  const e = JSON.parse(fs.readFileSync(f, 'utf8'))
  leidas.set(f, { mtime: st.mtimeMs, size: st.size, e })
  return e
}

const norm = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_\s]+/g, ' ').trim()
E.norm = norm
// El id de la estructura cuyo id o alias es el texto (sin tildes ni mayúsculas; «casa de roble» = casa_roble si es su alias), o null
E.porAlias = (texto) => {
  const t = norm(texto)
  if (!t) return null
  for (const id of E.ids()) {
    const e = E.cargar(id)
    if (norm(id) === t || (e && (e.alias || []).some(a => norm(a) === t))) return id
  }
  return null
}

// make structures: id, dimensiones, bloques, nº de materiales y lo que no se consigue
E.listar = () => E.ids().map(id => {
  const e = E.cargar(id)
  return `${id}  ${e.dim.join('×')}  ${e.bloques.length} bloques  ${Object.keys(e.materiales).length} materiales  sin conseguir: ${(e.sinConseguir || []).join(', ') || '-'}`
})

if (require.main === module) {
  const l = E.listar()
  console.log(l.length ? l.join('\n') : 'no hay estructuras importadas: make import-structure FILE=catalogo/x.litematic NAME=x')
}
