// Importa un .litematic (Litematica), un .nbt (bloque de estructura del juego) o un .schem (WorldEdit/Sponge v2-v3), NBT con gzip, al catálogo: bot/estructuras/<id>.json y bot/materiales/<id>.json.
// Sin juego ni red. Uso: node herramientas/importar_estructura.js ARCHIVO.litematic|.nbt|.schem ID [ALIAS[,ALIAS…]] [--front=este] [--crop=x0,y0,z0,x1,y1,z1]   (o make import-structure)
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const BOT = path.join(__dirname, '..', 'bot')
const nbt = require(path.join(BOT, 'node_modules', 'prismarine-nbt'))
const estructuras = require(path.join(BOT, 'estructuras'))

const VERSION = '1.21.11'
const AIRE = new Set(['air', 'cave_air', 'void_air'])
// Bloques que Mojang renombró desde la 1.13 (los .litematic viejos aún los traen). Solo estos: cualquier otro nombre desconocido es error
const RENOMBRADOS = { grass: 'short_grass', grass_path: 'dirt_path', chain: 'iron_chain' }

// "minecraft:oak_stairs" + {half, facing} → "oak_stairs[facing=north,half=bottom]" (propiedades por orden alfabético)
function estadoDe(entrada) {
  const viejo = String(entrada.Name).replace(/^minecraft:/, ''), nombre = RENOMBRADOS[viejo] || viejo
  const p = entrada.Properties || {}
  const claves = Object.keys(p).sort()
  return claves.length ? `${nombre}[${claves.map(k => `${k}=${p[k]}`).join(',')}]` : nombre
}

// El long[] de NBT sale como pares [alto, bajo] de int32: a BigInt sin signo de 64 bits
const aBigInt = ([hi, lo]) => BigInt.asUintN(64, (BigInt(hi) << 32n) | BigInt(lo >>> 0))

// Índices de paleta de una región: empaquetados de forma continua (sin el relleno de los chunks vanilla), un valor puede cruzar dos longs
function desempaquetar(longs, n, paleta) {
  const bits = Math.max(2, Math.ceil(Math.log2(paleta)))
  const mascara = (1n << BigInt(bits)) - 1n
  const w = longs.map(aBigInt)
  const salida = new Array(n)
  for (let i = 0; i < n; i++) {
    const ini = i * bits, k = Math.floor(ini / 64), off = BigInt(ini % 64)
    let v = w[k] >> off
    if (Number(off) + bits > 64) v |= w[k + 1] << (64n - off)
    salida[i] = Number(v & mascara)
  }
  return salida
}

// Lo leído de un archivo: { dim, paleta: [estado…], puestos: Map("x,y,z" → índice de paleta), nombres: [[nombre en el archivo, normalizado]] }
// con el origen en la esquina mínima y sin aire. Los dos formatos acaban igual.
function deLitematic(raiz) {
  const regiones = Object.entries(raiz.Regions)
  if (!regiones.length) throw new Error('el .litematic no tiene regiones')
  // cada región: caja absoluta [min, max] (Size puede ser negativo: se toma el valor absoluto y se corrige con Position)
  const cajas = regiones.map(([nombre, r]) => {
    const min = ['x', 'y', 'z'].map(a => r.Position[a] + (r.Size[a] < 0 ? r.Size[a] + 1 : 0))
    const tam = ['x', 'y', 'z'].map(a => Math.abs(r.Size[a]))
    return { nombre, r, min, tam }
  })
  const min = [0, 1, 2].map(i => Math.min(...cajas.map(c => c.min[i])))
  const max = [0, 1, 2].map(i => Math.max(...cajas.map(c => c.min[i] + c.tam[i] - 1)))
  const dim = [0, 1, 2].map(i => max[i] - min[i] + 1)
  const paleta = [], idx = new Map(), puestos = new Map(), nombres = []
  for (const { r, min: m, tam: [X, Y, Z] } of cajas) {
    const estados = r.BlockStatePalette.map(e => { const estado = estadoDe(e); nombres.push([String(e.Name).replace(/^minecraft:/, ''), estructuras.nombre(estado)]); return estado })
    const ind = desempaquetar(r.BlockStates, X * Y * Z, estados.length)
    for (let y = 0; y < Y; y++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
      const estado = estados[ind[y * X * Z + z * X + x]]
      if (AIRE.has(estructuras.nombre(estado))) continue // el aire de una región no borra lo que puso otra
      if (!idx.has(estado)) { idx.set(estado, paleta.length); paleta.push(estado) }
      puestos.set(`${m[0] + x - min[0]},${m[1] + y - min[1]},${m[2] + z - min[2]}`, idx.get(estado))
    }
  }
  return { dim, paleta, puestos, nombres }
}

// "minecraft:oak_door[facing=east,half=lower]" (como lo trae el final_state de un jigsaw) → el estado normalizado
function estadoDeTexto(t) {
  const { nombre, props } = estructuras.parse(String(t).replace(/^minecraft:/, ''))
  return estadoDe({ Name: nombre, Properties: props })
}

// .nbt de estructura (bloque de estructura del juego): size [x, y, z], palette (o palettes: la primera), blocks [{ pos, state, nbt }].
// structure_void (no toca el mundo) y aire se saltan; un jigsaw se cambia por su final_state, como hace el juego al generarla.
function deNbt(raiz) {
  const pal = raiz.palette || raiz.palettes[0]
  const dim = [0, 1, 2].map(i => raiz.size[i])
  const estados = pal.map(e => estadoDe(e))
  const paleta = [], idx = new Map(), puestos = new Map(), nombres = pal.map((e, i) => [String(e.Name).replace(/^minecraft:/, ''), estructuras.nombre(estados[i])])
  for (const b of raiz.blocks) {
    let estado = estados[b.state]
    if (estructuras.nombre(estado) === 'jigsaw') {
      estado = estadoDeTexto((b.nbt && b.nbt.final_state) || 'minecraft:air')
      nombres.push([estructuras.nombre(estado), estructuras.nombre(estado)]) // también se valida lo que sale del jigsaw
    }
    const n = estructuras.nombre(estado)
    if (AIRE.has(n) || n === 'structure_void') continue
    if (!idx.has(estado)) { idx.set(estado, paleta.length); paleta.push(estado) }
    puestos.set(b.pos.join(','), idx.get(estado))
  }
  return { dim, paleta, puestos, nombres }
}

// .schem de WorldEdit (Sponge, 2026-11-02): v2 con Palette {"minecraft:x[…]": índice} y BlockData en la raíz; v3 dentro de
// Schematic.Blocks (Palette y Data). Los índices van en varint (7 bits por byte) y en orden x + z·Width + y·Width·Length.
function deSchem(raiz) {
  const s = raiz.Schematic || raiz
  const bl = s.Blocks || s
  const pal = bl.Palette, datos = bl.Data || bl.BlockData
  if (!pal || !datos) throw new Error('el .schem no trae Palette y BlockData (o Blocks.Data)')
  const [W, H, L] = [s.Width, s.Height, s.Length]
  const estados = [], nombres = []
  for (const [texto, i] of Object.entries(pal)) {
    estados[i] = estadoDeTexto(texto)
    nombres.push([String(texto).replace(/^minecraft:/, '').split('[')[0], estructuras.nombre(estados[i])])
  }
  const paleta = [], idx = new Map(), puestos = new Map()
  let p = 0
  for (let n = 0; n < W * H * L; n++) {
    let v = 0, despl = 0, b
    do { b = datos[p++] & 0xff; v |= (b & 0x7f) << despl; despl += 7 } while (b & 0x80)
    const estado = estados[v]
    if (!estado || AIRE.has(estructuras.nombre(estado)) || estructuras.nombre(estado) === 'structure_void') continue
    const x = n % W, z = Math.floor(n / W) % L, y = Math.floor(n / (W * L))
    if (!idx.has(estado)) { idx.set(estado, paleta.length); paleta.push(estado) }
    puestos.set(`${x},${y},${z}`, idx.get(estado))
  }
  return { dim: [W, H, L], paleta, puestos, nombres }
}

// buf: el archivo entero (.litematic, .nbt o .schem, con gzip). opts: { id, alias, fuente, frente, recorte, registry } → { estructura, materiales }; error con la lista si hay bloques que no existen
function importar(buf, opts) {
  const registry = opts.registry || require(path.join(BOT, 'node_modules', 'minecraft-data'))(VERSION)
  const raiz = nbt.simplify(nbt.parseUncompressed(zlib.gunzipSync(buf)))
  // 2026-11-02: también los .nbt de los bloques de estructura del juego (size, palette, blocks), además de los .litematic (Regions)
  const esSchem = (raiz.Schematic && raiz.Schematic.Blocks) || (raiz.Palette && raiz.BlockData)
  const leido = raiz.Regions ? deLitematic(raiz) : (raiz.blocks && (raiz.palette || raiz.palettes)) ? deNbt(raiz) : esSchem ? deSchem(raiz) : null
  if (!leido) throw new Error('el archivo no es un .litematic (Regions), un .nbt de estructura (size, palette, blocks) ni un .schem (Palette, BlockData)')
  let { dim, paleta, puestos, nombres } = leido
  // 2026-11-02: --crop=x0,y0,z0,x1,y1,z1 (CROP= en make): solo esa caja (en coordenadas de la plantilla, ambos extremos dentro),
  // ajustada a lo que tiene bloques: un trozo de una obra enorme (una torre del castillo) para probarla antes que entera
  if (opts.recorte) {
    const [a, b] = [opts.recorte.slice(0, 3), opts.recorte.slice(3)]
    const lo = a.map((v, k) => Math.min(v, b[k])), hi = a.map((v, k) => Math.max(v, b[k]))
    const dentro = [...puestos].map(([k, i]) => [k.split(',').map(Number), i]).filter(([c]) => c.every((v, k) => v >= lo[k] && v <= hi[k]))
    if (!dentro.length) throw new Error(`el recorte ${opts.recorte.join(',')} no tiene bloques (la plantilla es ${dim.join('×')})`)
    const min = [0, 1, 2].map(k => Math.min(...dentro.map(([c]) => c[k]))), max = [0, 1, 2].map(k => Math.max(...dentro.map(([c]) => c[k])))
    puestos = new Map(dentro.map(([c, i]) => [c.map((v, k) => v - min[k]).join(','), i]))
    dim = max.map((v, k) => v - min[k] + 1)
  }
  const desconocidos = new Set(), renombrados = new Set()
  for (const [viejo, nombre] of nombres) {
    if (!registry.blocksByName[nombre]) desconocidos.add(nombre)
    if (viejo !== nombre) renombrados.add(`${viejo} → ${nombre}`)
  }
  if (desconocidos.size) throw new Error(`bloques que no existen en ${VERSION}: ${[...desconocidos].sort().join(', ')}`)

  const bloques = [...puestos].map(([k, i]) => [...k.split(',').map(Number), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0])
  const materiales = {}, sinConseguir = new Set(), notas = {}
  // materiales y sinConseguir van siempre por nombre de objeto; un bloque sin objeto conocido va a sinConseguir con su nombre y una nota
  for (const b of bloques) {
    const estado = paleta[b[3]], nombre = estructuras.nombre(estado)
    for (const o of estructuras.objetosDe(estado)) {
      if (!registry.itemsByName[o.item]) { sinConseguir.add(nombre); notas[nombre] = `sin objeto en ${VERSION}: se pone a mano`; continue }
      materiales[o.item] = (materiales[o.item] || 0) + o.n
      if (estructuras.sinConseguir(estado)) { sinConseguir.add(o.item); notas[o.item] = 'no se consigue en supervivencia temprana' }
      if (nombre === 'grass_block') notas.dirt = 'incluye bloques de hierba: sirve tierra'
      if (o.item.endsWith('_bucket')) notas[o.item] = 'un cubo por cada fuente del diseño'
    }
  }
  const ordenado = Object.fromEntries(Object.entries(materiales).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)))
  const nombre = opts.nombre || opts.id.replace(/_/g, ' ')
  // el frente (2026-11-02): el lado de la entrada, para «construye … mirando al este». El dado (FRONT=) o el de fuera de la primera
  // puerta (la mitad baja mira hacia dentro: su facing es hacia donde mira quien entra); sin puerta, sur
  const OPUESTA = { north: 'south', south: 'north', east: 'west', west: 'east' }
  const puerta = bloques.map(b => estructuras.parse(paleta[b[3]])).find(e => /_door$/.test(e.nombre) && e.props.half === 'lower')
  const frente = opts.frente || (puerta && OPUESTA[puerta.props.facing]) || 'south'
  const estructura = {
    id: opts.id, nombre, alias: opts.alias || [], fuente: opts.fuente || '', dim, frente, paleta, bloques,
    materiales: ordenado, sinConseguir: [...sinConseguir].sort(), notas,
  }
  if (renombrados.size) estructura.renombrados = [...renombrados].sort() // nombres de una versión anterior, cambiados al importar
  // `importado` marca la lista como generada: escribir() no pisa las escritas a mano (granja_piedra) sin --force
  const lista = { nombre, origen: `${opts.fuente || opts.id} (${dim.join('×')}, ${bloques.length} bloques; importado para MC ${VERSION})`, importado: true, materiales: ordenado, notas }
  return { estructura, materiales: lista }
}

// Una línea por bloque y por entrada de paleta: el JSON se puede leer y comparar en git
function serializar(e) {
  const filas = (a) => '[\n  ' + a.map(x => JSON.stringify(x)).join(',\n  ') + '\n ]'
  return '{\n' + Object.entries(e).map(([k, v]) => ` ${JSON.stringify(k)}: ${k === 'bloques' || k === 'paleta' ? filas(v) : JSON.stringify(v)}`).join(',\n') + '\n}\n'
}

// Una lista de materiales que no hizo el importador (sin `importado`) no se pisa salvo con forzar; se comprueba antes de escribir nada
function escribir({ estructura, materiales }, dirEstructuras, dirMateriales, forzar = false) {
  const fm = path.join(dirMateriales, estructura.id + '.json')
  if (!forzar && fs.existsSync(fm)) {
    let previa = null
    try { previa = JSON.parse(fs.readFileSync(fm, 'utf8')) } catch (_) {}
    if (!previa || !previa.importado) throw new Error(`${fm} está escrita a mano: elige otro NAME= o repite con FORCE=1`)
  }
  fs.mkdirSync(dirEstructuras, { recursive: true })
  fs.writeFileSync(path.join(dirEstructuras, estructura.id + '.json'), serializar(estructura))
  fs.writeFileSync(fm, JSON.stringify(materiales, null, 1) + '\n')
}

module.exports = { importar, escribir, serializar, desempaquetar, estadoDe, RENOMBRADOS }

if (require.main === module) {
  const args = process.argv.slice(2), forzar = args.includes('--force')
  // --front=norte|sur|este|oeste (FRONT= en make): el lado de la entrada, si no se deduce bien de la puerta
  const DIR = { norte: 'north', sur: 'south', este: 'east', oeste: 'west', north: 'north', south: 'south', east: 'east', west: 'west' }
  const front = (args.find(a => a.startsWith('--front=')) || '').slice(8).toLowerCase()
  if (front && !DIR[front]) { console.error('FRONT: norte, sur, este u oeste'); process.exit(1) }
  const crop = (args.find(a => a.startsWith('--crop=')) || '').slice(7)
  const recorte = crop ? crop.split(/[\s,]+/).filter(Boolean).map(Number) : null
  if (recorte && (recorte.length !== 6 || recorte.some(v => !Number.isInteger(v)))) { console.error('CROP: seis enteros, "x0 y0 z0 x1 y1 z1"'); process.exit(1) }
  const [archivo, id, alias] = args.filter(a => a !== '--force' && !a.startsWith('--front=') && !a.startsWith('--crop='))
  if (!archivo || !id || !/^[a-z0-9_]+$/.test(id)) {
    console.error('uso: make import-structure FILE=catalogo/x.litematic NAME=casa_roble [ALIAS="casa de roble"] [FORCE=1]   (NAME: minúsculas, números y _)')
    process.exit(1)
  }
  try {
    const r = importar(fs.readFileSync(archivo), {
      id, fuente: path.basename(archivo), alias: (alias || '').split(',').map(s => s.trim()).filter(Boolean), frente: DIR[front], recorte,
    })
    escribir(r, estructuras.DIR, path.join(BOT, 'materiales'), forzar)
    const e = r.estructura
    const ES = { north: 'norte', south: 'sur', east: 'este', west: 'oeste' }
    console.log(`${id}: ${e.dim.join('×')}, ${e.bloques.length} bloques, ${Object.keys(e.materiales).length} materiales, entrada al ${ES[e.frente]}` +
      (e.sinConseguir.length ? `, sin conseguir: ${e.sinConseguir.join(', ')}` : '') + (e.renombrados ? `, renombrados: ${e.renombrados.join(', ')}` : ''))
  } catch (err) {
    console.error('ERROR: ' + err.message)
    process.exit(1)
  }
}
